import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { readJsonc } from './game-profile.mjs';
import {
  compileTranslationScene,
  compileDictionaryTranslations,
  createDictionaryCharacterCodeMap,
  decodeSceneBytes,
  encodeCloudInstructions,
  encodeFixedBankDictionaryRecord,
  encodeSceneInstructions,
  exportDictionaryTranslations,
  exportCloudTranslations,
  exportSceneBankTranslations,
  exportTranslationScript,
  extractOpeningScene,
  extractCloudMessages,
  extractFixedBankDictionary,
  extractSceneBank,
  getDictionarySourceGlyphCodes,
  parseFixedBankDictionaryRecord,
  parseSceneInstructions,
  parseCloudRenderBlock,
  parseTable,
  rebuildOpeningScene,
  migrateCloudTranslations,
  migrateDictionaryTranslations,
  migrateSceneBankTranslations,
  migrateTranslationScript,
  validateCloudTranslations,
  validateSceneBankTranslations,
  validateTranslationScript,
  validateDictionaryTranslations,
} from './captain-tsubasa-2-adapter.mjs';

test('Captain Tsubasa II cloud render blocks round-trip semantic controls', () => {
  const bytes = [
    0x01, 0x52,
    0xf1, 0x00, 0x25, 0x03, 0x0c, 0xfc,
    0xf5, 0x2d, 0x00, 0xf7, 0x03, 0x79, 0xfc,
    0xf0,
  ];
  const instructions = parseCloudRenderBlock(bytes, new Map([[0x25, 'ゆ'], [0x03, 'う'], [0x0c, 'し']]));
  assert.deepEqual(instructions.map(instruction => instruction.kind), [
    'header', 'control', 'text', 'control', 'control', 'text', 'control', 'text', 'control', 'control',
  ]);
  assert.equal(instructions[2].text, '{00}ゆうし');
  assert.equal(instructions[6].name, 'repeat');
  assert.deepEqual(encodeCloudInstructions(instructions), bytes);
});

test('Captain Tsubasa II canonical packed cloud header round-trips', () => {
  const bytes = [0x01, 0x52, 0xed, 0xfc, 0x01, 0x1c, 0x2f, 0x14, 0xaf, 0x0b, 0x2a, 0x10, 0x79, 0xfc, 0xf0];
  const instructions = parseCloudRenderBlock(bytes);
  assert.deepEqual(instructions[0], {
    kind: 'header', offset: 0, bytes: [0x01, 0x52], pause: 0x01,
    packedConfig: 0x52, window: 0x05, clearScreen: false, character: 0x02,
  });
  assert.equal(instructions[1].name, 'playerWithoutBall');
  assert.deepEqual(encodeCloudInstructions(instructions), bytes);
});

test('Captain Tsubasa II cloud setup prefixes round-trip before rendering', () => {
  const bytes = [0xf2, 0xf5, 0x02, 0x01, 0x52, 0xed, 0xfc, 0xf0];
  const instructions = parseCloudRenderBlock(bytes);
  assert.deepEqual(instructions.slice(0, 2).map(instruction => [instruction.name, instruction.bytes]), [
    ['clear', [0xf2]],
    ['timer', [0xf5, 0x02]],
  ]);
  assert.equal(instructions[2].kind, 'header');
  assert.deepEqual(encodeCloudInstructions(instructions), bytes);
});

test('Captain Tsubasa II extracts cloud aliases and preserves flow messages', () => {
  const rom = Buffer.alloc(16 + 0x8000, 0xff);
  rom.write('NES\x1a', 0, 'binary');
  rom[4] = 2;
  rom[5] = 0;
  rom[6] = 0;
  rom[7] = 0;
  rom.writeUInt16LE(0x9020, 16 + 0x1000);
  rom.writeUInt16LE(0x9028, 16 + 0x1002);
  rom.writeUInt16LE(0x9020, 16 + 0x1004);
  Buffer.from([0x01, 0x52, 0x25, 0xfc, 0x79, 0xfc, 0xfc, 0xf0]).copy(rom, 16 + 0x1020);
  Buffer.from([0xf3, 0x30, 0x90, 0xf0]).copy(rom, 16 + 0x1028);
  const hash = crypto.createHash('sha256').update(rom).digest('hex');
  const adapter = {
    adapterId: 'captain-tsubasa-2-jp',
    sourceRoms: [{ sha256: hash }],
    scriptModel: {
      cloudTables: [{
        id: 'clouds', pointerTablePhysicalPrgOffset: 0x1000,
        bankPhysicalPrgOffset: 0, cpuBase: 0x8000, entryCount: 3,
      }],
    },
  };
  const extracted = extractCloudMessages(rom, adapter, 'clouds', new Map([[0x25, 'ゆ'], [0x79, '!']]));
  assert.deepEqual(extracted.messages.map(message => message.messageType), ['render', 'opaque', 'render']);
  assert.equal(extracted.messages[2].aliasOf, 'clouds.00');
  assert.deepEqual(extracted.metrics, {
    messageCount: 3,
    uniqueMessageCount: 2,
    aliasCount: 1,
    renderMessageCount: 1,
    opaqueMessageCount: 1,
    encodedBytes: 12,
    textRuns: 2,
    sourceGlyphs: 2,
    uniqueSourceGlyphCodes: 2,
  });
  const translations = exportCloudTranslations(extracted);
  assert.equal(translations.schemaVersion, 2);
  assert.equal(translations.scripts.length, 1);
  assert.equal(translations.scripts[0].sceneSha256, extracted.messages[0].messageSha256);
  assert.deepEqual(Object.keys(translations.scripts[0].entries[0]), ['id', 'category', 'translation']);
  assert.equal(translations.scripts[0].entries[0].category, 'battleMessage');
  assert.equal(translations.opaqueMessages.length, 1);
  assert.equal(validateCloudTranslations(extracted, translations, false), true);
  const renderMessage = extracted.messages[0];
  const textInstructions = renderMessage.instructions.filter(instruction => instruction.kind === 'text');
  const legacyScript = {
    ...translations.scripts[0],
    schemaVersion: 1,
    adapterId: extracted.adapterId,
    sourceSha256: extracted.sourceSha256,
    targetLanguage: 'zh-Hant',
    entries: translations.scripts[0].entries.map((entry, index) => {
      const instruction = textInstructions[index];
      return {
        ...entry,
        sceneOffset: instruction.offset,
        encodedLength: instruction.bytes.length,
        sourceBytes: instruction.bytes.map(value => value.toString(16).padStart(2, '0').toUpperCase()).join(' '),
        sourceText: instruction.text,
        notes: '',
      };
    }),
  };
  const migrated = migrateCloudTranslations(extracted, {
    ...translations,
    schemaVersion: 1,
    scripts: [legacyScript],
  });
  assert.deepEqual(migrated.scripts, translations.scripts);
  const stale = {
    ...translations,
    scripts: [{ ...translations.scripts[0], sceneSha256: '33'.repeat(32) }],
  };
  assert.throws(() => validateCloudTranslations(extracted, stale, false), /metadata/);
});

function fixture() {
  const rom = Buffer.alloc(16 + 0x8000);
  rom.write('NES\x1a', 0, 'binary');
  rom[4] = 2;
  rom.writeUInt16LE(0xa020, 16 + 0x6000);
  rom.writeUInt16LE(0xa025, 16 + 0x6002);
  Buffer.from([0xd9, 0xe0, 0xe8, 0x01, 0x20]).copy(rom, 16 + 0x6020);
  const scene = rom.subarray(16 + 0x6020, 16 + 0x6025);
  const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  return {
    rom,
    adapter: {
      adapterId: 'captain-tsubasa-2-jp',
      sourceRoms: [{ sha256: hash(rom) }],
      scriptModel: {
        pointerTables: [{
          id: 'opening-cutscenes', physicalPrgOffset: 0x6000, cpuBase: 0xa000,
        }],
        scenes: [{
          id: 'opening.intro.00', pointerTable: 'opening-cutscenes', pointerIndex: 0,
          endPointerIndex: 1, physicalPrgOffset: 0x6020, encodedLength: 5,
          sha256: hash(scene),
        }],
      },
    },
  };
}

test('Captain Tsubasa II opening scene extracts and rebuilds byte-identically', () => {
  const { rom, adapter } = fixture();
  const extracted = extractOpeningScene(rom, adapter);
  assert.deepEqual(extracted.tokens.map(token => token.kind), [
    'pause', 'legacyOffset', 'control', 'glyph', 'glyph',
  ]);
  assert.deepEqual(encodeSceneInstructions(extracted.instructions), extracted.rawBytes);
  assert.deepEqual(rebuildOpeningScene(rom, adapter, extracted), rom);
});

test('Captain Tsubasa II rebuild rejects changed opaque scene bytes', () => {
  const { rom, adapter } = fixture();
  const extracted = extractOpeningScene(rom, adapter);
  extracted.rawBytes[3] ^= 0xff;
  assert.throws(() => rebuildOpeningScene(rom, adapter, extracted), /checksum mismatch/);
});

test('Captain Tsubasa II table decoding preserves unknown and control bytes', () => {
  const table = parseTable('1A=は\n0C=し\nD9={PAUSE:0A}\n');
  assert.deepEqual(decodeSceneBytes([0x1a, 0x0c, 0xd9, 0xff], table), [
    { kind: 'text', text: 'はし' },
    { kind: 'control', offset: 2, value: 0xd9, token: '{PAUSE:0A}' },
    { kind: 'control', offset: 3, value: 0xff, token: '{BYTE:FF}' },
  ]);
});

test('Captain Tsubasa II semantic controls consume verified argument widths', () => {
  const bytes = [
    0xe8, 0x01,
    0xf3, 0x00,
    0xf3, 0xff, 0x24, 0x42,
    0xf4, 0x06, 0x03,
    0xfb, 0x03, 0xc0, 0xa2, 0x7d,
    0xfe, 0x20, 0xa0,
    0xff,
  ];
  const instructions = parseSceneInstructions(bytes);
  assert.deepEqual(instructions.map(instruction => [instruction.name, instruction.bytes.length]), [
    ['setup', 2],
    ['palette', 2],
    ['palette', 4],
    ['special', 3],
    ['animation', 5],
    ['jump', 3],
    ['exit', 1],
  ]);
  assert.deepEqual(encodeSceneInstructions(instructions), bytes);
});

test('Captain Tsubasa II semantic parser rejects truncated controls', () => {
  assert.throws(() => parseSceneInstructions([0xf3, 0xff, 0x24]), /Truncated F3 control/);
  assert.throws(() => parseSceneInstructions([0xfb, 0x02, 0x75]), /Truncated FB control/);
});

test('Captain Tsubasa II F8 observes but does not consume its lookahead byte', () => {
  const instructions = parseSceneInstructions([0xf8, 0x0a, 0xf3, 0x00]);
  assert.deepEqual(instructions.map(instruction => instruction.bytes), [
    [0xf8, 0x0a],
    [0xf3, 0x00],
  ]);
  assert.equal(instructions[0].lookahead, 0xf3);
});

test('Captain Tsubasa II exports stable editable entries for text runs only', () => {
  const { rom, adapter } = fixture();
  const extracted = extractOpeningScene(rom, adapter, new Map([[0x01, 'あ']]));
  const script = exportTranslationScript(extracted);
  assert.equal(script.targetLanguage, 'zh-Hant');
  assert.equal(script.schemaVersion, 2);
  assert.deepEqual(script.entries, [{
    id: 'opening.intro.00.text.0004',
    category: 'dialogue',
    translation: '',
  }]);
});

test('Captain Tsubasa II script regeneration preserves matching translator edits', () => {
  const { rom, adapter } = fixture();
  const extracted = extractOpeningScene(rom, adapter);
  const previous = exportTranslationScript(extracted);
  previous.entries[0].category = 'interface';
  previous.entries[0].translation = '譯文';
  previous.entries[0].notes = '校對完成';
  const regenerated = exportTranslationScript(extracted, 'dialogue', previous);
  assert.equal(regenerated.entries[0].category, 'interface');
  assert.equal(regenerated.entries[0].translation, '譯文');
  assert.equal(regenerated.entries[0].notes, '校對完成');
  const staleLegacy = {
    ...previous,
    schemaVersion: 1,
    entries: previous.entries.map(entry => ({
      ...entry,
      sceneOffset: 4,
      encodedLength: 1,
      sourceBytes: 'FF',
      sourceText: '{20}',
      notes: entry.notes ?? '',
    })),
  };
  assert.equal(exportTranslationScript(extracted, 'dialogue', staleLegacy).entries[0].translation, '');
});

test('Captain Tsubasa II migrates verbose scene entries without carrying source evidence', () => {
  const { rom, adapter } = fixture();
  const extracted = extractOpeningScene(rom, adapter, new Map([[0x01, 'あ']]));
  const legacy = {
    schemaVersion: 1,
    adapterId: extracted.adapterId,
    sourceSha256: extracted.sourceSha256,
    sceneId: extracted.sceneId,
    sceneSha256: extracted.sceneSha256,
    targetLanguage: 'zh-Hant',
    entries: [{
      id: 'opening.intro.00.text.0004',
      category: 'menu',
      sceneOffset: 4,
      encodedLength: 1,
      sourceBytes: '20',
      sourceText: '{20}',
      translation: '甲',
      notes: 'title option',
    }],
  };
  const migrated = migrateTranslationScript(extracted, legacy);
  assert.deepEqual(migrated.entries, [{
    id: 'opening.intro.00.text.0004',
    category: 'menu',
    translation: '甲',
    notes: 'title option',
  }]);
  assert.equal('sourceBytes' in migrated.entries[0], false);
});

test('Captain Tsubasa II compiles translations while preserving control bytes', () => {
  const extracted = {
    schemaVersion: 1,
    adapterId: 'captain-tsubasa-2-jp',
    sourceSha256: '11'.repeat(32),
    sceneId: 'opening.intro.00',
    sceneSha256: '22'.repeat(32),
    location: { physicalPrgOffset: 0x6020, encodedLength: 7 },
    instructions: parseSceneInstructions([0x01, 0x02, 0xfc, 0x03, 0xfe, 0x20, 0xa0]),
  };
  const script = exportTranslationScript(extracted);
  script.entries[0].translation = '甲';
  script.entries[1].translation = '乙';
  validateTranslationScript(extracted, script);
  const compiled = compileTranslationScene(extracted, script);
  assert.deepEqual(compiled.glyphs, [
    { code: 0, character: ' ' },
    { code: 1, character: '甲' },
    { code: 2, character: '乙' },
  ]);
  assert.equal(compiled.usedLength, 6);
  assert.equal(compiled.paddingLength, 1);
  assert.deepEqual(compiled.rawBytes, [0x01, 0xfc, 0x02, 0xfe, 0x20, 0xa0, 0xff]);
});

test('Captain Tsubasa II rejects stale translation source evidence', () => {
  const { rom, adapter } = fixture();
  const extracted = extractOpeningScene(rom, adapter);
  const compact = exportTranslationScript(extracted);
  const script = {
    ...compact,
    schemaVersion: 1,
    entries: compact.entries.map(entry => ({
      ...entry,
      sceneOffset: 4,
      encodedLength: 1,
      sourceBytes: '20',
      sourceText: '{20}',
      notes: '',
    })),
  };
  script.entries[0].translation = '譯';
  script.entries[0].sourceBytes = 'FF';
  assert.throws(() => compileTranslationScene(extracted, script), /source evidence/);
});

test('Captain Tsubasa II compact scene bundles reject missing IDs and stale source hashes', () => {
  const { rom, adapter } = fixture();
  const extracted = extractOpeningScene(rom, adapter);
  const script = exportTranslationScript(extracted, 'menu');
  assert.equal(validateTranslationScript(extracted, script, false).get(script.entries[0].id).category, 'menu');
  assert.throws(() => validateTranslationScript(extracted, script), /no translation/);
  assert.throws(() => validateTranslationScript(extracted, { ...script, entries: [] }, false), /count/);
  assert.throws(() => validateTranslationScript(extracted, {
    ...script,
    sceneSha256: '44'.repeat(32),
  }, false), /metadata/);
  assert.throws(() => validateTranslationScript(extracted, {
    ...script,
    entries: [script.entries[0], { ...script.entries[0] }],
  }, false), /Duplicate/);
});

test('Captain Tsubasa II preserves source line starts without splitting sound-delimited text', () => {
  const extracted = {
    adapterId: 'captain-tsubasa-2-jp',
    sourceSha256: '11'.repeat(32),
    sceneId: 'opening.intro.00',
    sceneSha256: '22'.repeat(32),
    location: { physicalPrgOffset: 0x6020, encodedLength: 14 },
    instructions: parseSceneInstructions([0x00, 0x00, 0x01, 0xd9, 0x02, 0xfc, 0x00, 0x03, 0xfe, 0x20, 0xa0]),
  };
  const script = exportTranslationScript(extracted);
  script.layout = { columns: 5, alignment: 'source' };
  script.entries[0].translation = '   甲';
  script.entries[1].translation = '乙';
  script.entries[2].translation = '  丙';
  const compiled = compileTranslationScene(extracted, script);
  assert.deepEqual(compiled.rawBytes.slice(0, compiled.usedLength), [
    0x00, 0x00, 0x01, 0xd9, 0x02, 0xfc, 0x00, 0x03, 0xfe, 0x20, 0xa0,
  ]);
  assert.equal(compiled.paddingLength, 3);
});

test('Captain Tsubasa II extracts unique streams and preserves pointer aliases', () => {
  const rom = Buffer.alloc(16 + 0x8000, 0xff);
  rom.write('NES\x1a', 0, 'binary');
  rom[4] = 2;
  rom[5] = 0;
  rom[6] = 0;
  rom[7] = 0;
  rom.writeUInt16LE(0xa006, 16 + 0x6000);
  rom.writeUInt16LE(0xa009, 16 + 0x6002);
  rom.writeUInt16LE(0xa006, 16 + 0x6004);
  Buffer.from([0x01, 0xfc, 0xff, 0x02, 0xff]).copy(rom, 16 + 0x6006);
  const hash = crypto.createHash('sha256').update(rom).digest('hex');
  const adapter = {
    adapterId: 'captain-tsubasa-2-jp',
    sourceRoms: [{ sha256: hash }],
    scriptModel: {
      pointerTables: [{
        id: 'cutscenes', physicalPrgOffset: 0x6000, cpuBase: 0xa000, entryCount: 3,
      }],
      scenes: [],
    },
  };
  const extracted = extractSceneBank(rom, adapter, 'cutscenes', new Map([[0x01, 'あ'], [0x02, 'い']]));
  assert.deepEqual(extracted.scenes.map(scene => scene.location), [
    { physicalPrgOffset: 0x6006, encodedLength: 3 },
    { physicalPrgOffset: 0x6009, encodedLength: 2 },
    { physicalPrgOffset: 0x6006, encodedLength: 3 },
  ]);
  assert.equal(extracted.scenes[2].aliasOf, 'cutscenes.00');
  assert.deepEqual(extracted.metrics, {
    sceneCount: 3,
    uniqueSceneCount: 2,
    aliasCount: 1,
    encodedBytes: 5,
    textRuns: 2,
    sourceGlyphs: 2,
    uniqueSourceGlyphCodes: 2,
    controls: 3,
    pauses: 0,
  });
  const translations = exportSceneBankTranslations(extracted);
  assert.equal(translations.schemaVersion, 2);
  assert.equal(translations.scripts.length, 2);
  assert.deepEqual(translations.aliases, [{ sceneId: 'cutscenes.02', aliasOf: 'cutscenes.00' }]);
  assert.equal(translations.scripts[1].entries[0].id, 'cutscenes.01.text.0000');
  assert.deepEqual(Object.keys(translations.scripts[1].entries[0]), ['id', 'category', 'translation']);
  assert.equal(validateSceneBankTranslations(extracted, translations, false), true);
  const migrated = migrateSceneBankTranslations(extracted, translations);
  assert.deepEqual(migrated.scripts, translations.scripts);
  const standaloneSeed = exportTranslationScript(extracted.scenes[0], 'dialogue');
  standaloneSeed.entries[0].translation = '甲';
  const seeded = exportSceneBankTranslations(extracted, 'dialogue', standaloneSeed);
  assert.equal(seeded.scripts[0].entries[0].translation, '甲');
  translations.scripts[1].entries[0].category = 'interface';
  translations.scripts[1].entries[0].translation = '翻譯';
  translations.scripts[1].entries[0].notes = '保留';
  const regenerated = exportSceneBankTranslations(extracted, 'dialogue', translations);
  assert.equal(regenerated.scripts[1].entries[0].category, 'interface');
  assert.equal(regenerated.scripts[1].entries[0].translation, '翻譯');
  assert.equal(regenerated.scripts[1].entries[0].notes, '保留');
});

test('Captain Tsubasa II fixed-bank dictionary records round-trip with an external pointer', () => {
  const rom = Buffer.alloc(16 + 0x8000, 0xff);
  rom.write('NES\x1a', 0, 'binary');
  rom[4] = 2;
  rom[5] = 0;
  rom[6] = 0;
  rom[7] = 0;
  rom.writeUInt16LE(0x05eb, 16 + 0x6100);
  rom.writeUInt16LE(0xf200, 16 + 0x6102);
  rom.writeUInt16LE(0xf202, 16 + 0x6104);
  Buffer.from([0x01, 0xfc, 0x02, 0x03, 0xfc]).copy(rom, 16 + 0x7200);
  const hash = crypto.createHash('sha256').update(rom).digest('hex');
  const adapter = {
    adapterId: 'captain-tsubasa-2-jp',
    sourceRoms: [{ sha256: hash }],
    scriptModel: {
      dictionaries: [{
        id: 'words', bankPhysicalPrgOffset: 0x6000,
        pointerTablePhysicalPrgOffset: 0x6100, cpuBase: 0xe000,
        dataCpuBase: 0xf200, entryCount: 3,
        externalEntries: [{ index: 0, pointer: 0x05eb, kind: 'ram' }],
      }],
    },
  };
  const table = new Map([[0x01, 'あ'], [0x02, 'い'], [0x03, 'う']]);
  const extracted = extractFixedBankDictionary(rom, adapter, 'words', table);
  assert.deepEqual(extracted.records.map(record => record.recordType), ['external', 'text', 'text']);
  assert.equal(extracted.records[0].location.cpuAddress, 0x05eb);
  assert.equal(extracted.records[1].instructions[0].text, 'あ');
  assert.deepEqual(encodeFixedBankDictionaryRecord(extracted.records[2].instructions), [0x02, 0x03, 0xfc]);
  assert.deepEqual(extracted.metrics, {
    entryCount: 3,
    fixedRecordCount: 2,
    externalEntryCount: 1,
    uniqueRecordCount: 2,
    aliasCount: 0,
    encodedBytes: 5,
    textRuns: 2,
    sourceGlyphs: 3,
    uniqueSourceGlyphCodes: 3,
  });
  assert.deepEqual(parseFixedBankDictionaryRecord([0x01, 0xfc], table).map(instruction => instruction.kind), [
    'text', 'terminator',
  ]);
  assert.throws(() => parseFixedBankDictionaryRecord([0x01, 0xfc, 0x02], table), /must end/);
  const bundle = exportDictionaryTranslations(extracted);
  assert.equal(bundle.schemaVersion, 2);
  assert.equal(bundle.entries.length, 2);
  assert.equal(bundle.entries[0].category, 'dictionary');
  assert.deepEqual(Object.keys(bundle.entries[0]), ['id', 'category', 'translation']);
  assert.equal(bundle.externalEntries[0].kind, 'ram');
  bundle.entries[0].translation = '甲';
  const regenerated = exportDictionaryTranslations(extracted, bundle);
  assert.equal(regenerated.entries[0].translation, '甲');
  const legacy = {
    ...bundle,
    schemaVersion: 1,
    entries: bundle.entries.map((entry, index) => {
      const record = extracted.records[index + 1];
      const textInstruction = record.instructions.find(instruction => instruction.kind === 'text');
      return {
        ...entry,
        pointerIndex: record.pointerIndex,
        pointer: record.pointer,
        physicalPrgOffset: record.location.physicalPrgOffset,
        encodedLength: record.rawBytes.length,
        sourceBytes: record.rawBytes.map(value => value.toString(16).padStart(2, '0').toUpperCase()).join(' '),
        sourceText: textInstruction.text,
        notes: '',
      };
    }),
  };
  const migrated = migrateDictionaryTranslations(extracted, legacy);
  assert.equal(migrated.entries[0].translation, '甲');
  assert.equal('sourceBytes' in migrated.entries[0], false);
});

test('Captain Tsubasa II compiles fixed-bank dictionary translations in place', () => {
  const rom = Buffer.alloc(16 + 0x8000, 0xff);
  rom.write('NES\x1a', 0, 'binary');
  rom[4] = 2;
  rom[5] = 0;
  rom[6] = 0;
  rom[7] = 0;
  rom.writeUInt16LE(0xf200, 16 + 0x6100);
  rom.writeUInt16LE(0xf202, 16 + 0x6102);
  Buffer.from([0x01, 0xfc, 0x02, 0x03, 0xfc]).copy(rom, 16 + 0x7200);
  const hash = crypto.createHash('sha256').update(rom).digest('hex');
  const adapter = {
    adapterId: 'captain-tsubasa-2-jp',
    sourceRoms: [{ sha256: hash }],
    scriptModel: {
      dictionaries: [{
        id: 'words', bankPhysicalPrgOffset: 0x6000,
        pointerTablePhysicalPrgOffset: 0x6100, cpuBase: 0xe000,
        dataCpuBase: 0xf200, entryCount: 2,
      }],
    },
  };
  const extracted = extractFixedBankDictionary(rom, adapter, 'words', new Map([[0x01, 'あ'], [0x02, 'い'], [0x03, 'う']]));
  const bundle = exportDictionaryTranslations(extracted);
  bundle.entries[0].translation = 'あ';
  bundle.entries[1].translation = '乙';
  validateDictionaryTranslations(extracted, bundle);
  const compiled = compileDictionaryTranslations(extracted, bundle, new Map([
    [' ', 0x00], ['あ', 0x01], ['乙', 0x02],
  ]), new Set([0x00, 0x01]));
  assert.deepEqual(compiled.records.map(record => [record.usedLength, record.paddingLength, record.rawBytes]), [
    [2, 0, [0x01, 0xfc]],
    [2, 1, [0x02, 0xfc, 0x00]],
  ]);
  assert.deepEqual(compiled.overlays.map(overlay => [overlay.offset, overlay.expectedOriginal, overlay.value]), [
    [0x7203, 0x03, 0xfc],
    [0x7204, 0xfc, 0x00],
  ]);
  assert.deepEqual(compiled.glyphs, [
    { code: 0x02, character: '乙' },
  ]);
  bundle.entries[1].translation = '乙乙乙';
  assert.throws(() => compileDictionaryTranslations(extracted, bundle, new Map([
    ['あ', 0x01], ['乙', 0x02],
  ]), new Set([0x00])), /allocation/);
});

test('Captain Tsubasa II dictionary table includes canonical punctuation and small kana', () => {
  const table = parseTable(fs.readFileSync('game-profiles/captain-tsubasa-2-jp/text.tbl', 'utf8'));
  assert.deepEqual([
    table.get(0x3f), table.get(0x74), table.get(0x75), table.get(0x76),
  ], ['・', 'ィ', 'ェ', 'ォ']);
});

test('Captain Tsubasa II dictionary glyph maps only allocate explicit free codes', () => {
  const table = new Map([[0x00, ' '], [0x01, 'あ'], [0x02, 'い']]);
  const map = createDictionaryCharacterCodeMap(table, { '甲': 0x03 });
  assert.deepEqual([...getDictionarySourceGlyphCodes(table)], [0x00, 0x01, 0x02]);
  assert.equal(map.get(' '), 0x00);
  assert.equal(map.get('甲'), 0x03);
  assert.throws(() => createDictionaryCharacterCodeMap(table, { '甲': 0x01 }), /already assigned to あ/);
  assert.throws(() => createDictionaryCharacterCodeMap(table, { 'あ': 0x03 }), /already assigned to code 1/);
});

test('Captain Tsubasa II canonical fixed-bank dictionary evidence remains stable', () => {
  const rom = fs.readFileSync('roms/Captain Tsubasa II - Super Striker (Japan).nes');
  const adapter = readJsonc('game-profiles/captain-tsubasa-2-jp/adapter.jsonc');
  const table = parseTable(fs.readFileSync('game-profiles/captain-tsubasa-2-jp/text.tbl', 'utf8'));
  const extracted = extractFixedBankDictionary(rom, adapter, 'fixed-bank-words', table);
  const byIndex = new Map(extracted.records.map(record => [record.pointerIndex, record]));
  assert.deepEqual(extracted.metrics, {
    entryCount: 240,
    fixedRecordCount: 239,
    externalEntryCount: 1,
    uniqueRecordCount: 239,
    aliasCount: 0,
    encodedBytes: 1475,
    textRuns: 239,
    sourceGlyphs: 1236,
    uniqueSourceGlyphCodes: 131,
  });
  assert.equal(byIndex.get(37).instructions[0].text, 'ダ・シルバ');
  assert.equal(byIndex.get(96).instructions[0].text, 'ディアス');
  assert.equal(byIndex.get(223).instructions[0].text, 'フォロー');
  assert.equal(byIndex.get(0).recordType, 'external');
});

test('Captain Tsubasa II checked-in compact bundles match canonical source catalogs', () => {
  const rom = fs.readFileSync('roms/Captain Tsubasa II - Super Striker (Japan).nes');
  const adapter = readJsonc('game-profiles/captain-tsubasa-2-jp/adapter.jsonc');
  const table = parseTable(fs.readFileSync('game-profiles/captain-tsubasa-2-jp/text.tbl', 'utf8'));
  const readBundle = name => JSON.parse(fs.readFileSync(
    `game-profiles/captain-tsubasa-2-jp/translations/${name}`,
    'utf8',
  ));
  const opening = extractOpeningScene(rom, adapter, table);
  validateTranslationScript(
    opening,
    readBundle('opening.intro.00.zh-Hant.json'),
  );
  for (const [tableId, file] of [
    ['opening-cutscenes', 'opening-cutscenes.zh-Hant.json'],
    ['cutscenes-bank-04', 'cutscenes-bank-04.zh-Hant.json'],
    ['cutscenes-bank-05', 'cutscenes-bank-05.zh-Hant.json'],
  ]) {
    const extracted = extractSceneBank(rom, adapter, tableId, table);
    validateSceneBankTranslations(extracted, readBundle(file), false);
  }
  const clouds = extractCloudMessages(rom, adapter, 'battle-clouds', table);
  validateCloudTranslations(clouds, readBundle('battle-clouds.zh-Hant.json'), false);
  const dictionary = extractFixedBankDictionary(rom, adapter, 'fixed-bank-words', table);
  validateDictionaryTranslations(dictionary, readBundle('fixed-bank-words.zh-Hant.json'), false);
});