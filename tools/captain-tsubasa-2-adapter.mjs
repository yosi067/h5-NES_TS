import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { readJsonc } from './game-profile.mjs';

const SCENE_ID = 'opening.intro.00';
const TRANSLATION_BUNDLE_SCHEMA_VERSION = 2;
const TRANSLATION_CATEGORIES = new Set(['dialogue', 'battleMessage', 'interface', 'menu', 'dictionary']);
const CLOUD_INLINE_CONTROLS = new Map([
  [0xe0, 'attackAction'],
  [0xe1, 'defenseAction'],
  [0xe2, 'attackCritical'],
  [0xe3, 'defenseCritical'],
  [0xe4, 'playerWithBall'],
  [0xe5, 'teamWithoutBall'],
  [0xe6, 'teamWithBall'],
  [0xe7, 'attackerCount'],
  [0xe8, 'attackerOne'],
  [0xe9, 'attackerTwo'],
  [0xea, 'attackerThree'],
  [0xeb, 'goalkeeper'],
  [0xec, 'goalkeeperAction'],
  [0xed, 'playerWithoutBall'],
  [0xee, 'offBallPlayer'],
  [0xf0, 'defenderOrdinal'],
  [0xf1, 'leftTeam'],
  [0xf2, 'rightTeam'],
  [0xf3, 'ageA'],
  [0xf4, 'ageB'],
  [0xf5, 'ball'],
  [0xf6, 'goal'],
  [0xf7, 'repeat'],
  [0xf8, 'tie'],
  [0xf9, 'scenario'],
]);

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function readSourceRom(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (path.extname(filePath).toLowerCase() !== '.zip') return bytes;
  const archive = await JSZip.loadAsync(bytes);
  const romFile = Object.values(archive.files).find(
    file => !file.dir && file.name.toLowerCase().endsWith('.nes'),
  );
  if (!romFile) fail(`ZIP ${filePath} contains no NES ROM`);
  return Buffer.from(await romFile.async('uint8array'));
}

function inspectInes(rom) {
  if (rom.length < 16 || rom.subarray(0, 4).toString('binary') !== 'NES\x1a') {
    fail('ROM is not an iNES image');
  }
  const trainerSize = (rom[6] & 0x04) !== 0 ? 512 : 0;
  const prgStart = 16 + trainerSize;
  const prgSize = rom[4] * 16 * 1024;
  if (prgSize === 0 || prgStart + prgSize > rom.length) fail('ROM has an invalid PRG size');
  return { prgStart, prgSize };
}

function classifyByte(value) {
  if (value <= 0xd8) return 'glyph';
  if (value <= 0xdf) return 'pause';
  if (value <= 0xe7) return 'legacyOffset';
  return 'control';
}

const CONTROL_NAMES = [
  'setup', 'screenOn', 'screenOff', 'ballPrompt', 'charlie', 'sound', 'clearAll',
  'toggleMouth', 'baseOffset', 'window', 'textSpeed', 'palette', 'special', 'effect',
  'pause', 'toggleCamera', 'animationEffect', 'background1', 'background2', 'animation',
  'newLine', 'clearText', 'jump', 'exit',
];

function controlLength(rawBytes, offset) {
  const opcode = rawBytes[offset];
  if (opcode === 0xf3) return rawBytes[offset + 1] === 0xff ? 4 : 2;
  if (opcode === 0xf4) return rawBytes[offset + 1] === 0x06 ? 3 : 2;
  if (opcode === 0xfb) return 2 + (rawBytes[offset + 1] ?? 0);
  if (opcode === 0xf0 || opcode === 0xfe) return 3;
  if ([0xe8, 0xec, 0xed, 0xf1, 0xf2, 0xf5, 0xf6, 0xf8, 0xf9, 0xfa].includes(opcode)) {
    return 2;
  }
  return 1;
}

export function parseSceneInstructions(rawBytes, table = new Map()) {
  const instructions = [];
  let offset = 0;
  while (offset < rawBytes.length) {
    const value = rawBytes[offset];
    const kind = classifyByte(value);
    if (kind === 'glyph') {
      const start = offset;
      while (offset < rawBytes.length && classifyByte(rawBytes[offset]) === 'glyph') offset += 1;
      const bytes = rawBytes.slice(start, offset);
      instructions.push({
        kind: 'text',
        offset: start,
        bytes,
        text: bytes.map(byte => table.get(byte) ?? `{${byte.toString(16).padStart(2, '0').toUpperCase()}}`).join(''),
      });
      continue;
    }
    if (kind === 'pause') {
      instructions.push({ kind, offset, bytes: [value], frames: [0x0a, 0x14, 0x28, 0x3c, 0x50, 0x78, 0xf0][value - 0xd9] });
      offset += 1;
      continue;
    }
    if (kind === 'legacyOffset') {
      instructions.push({ kind, offset, bytes: [value], amount: value - 0xdf });
      offset += 1;
      continue;
    }
    const length = controlLength(rawBytes, offset);
    if (offset + length > rawBytes.length) {
      fail(`Truncated ${value.toString(16).toUpperCase()} control at scene offset ${offset}`);
    }
    const bytes = rawBytes.slice(offset, offset + length);
    instructions.push({
      kind: 'control',
      offset,
      bytes,
      opcode: value,
      name: CONTROL_NAMES[value - 0xe8],
      args: bytes.slice(1),
      ...(value === 0xf8 ? { lookahead: rawBytes[offset + 2] } : {}),
    });
    offset += length;
  }
  return instructions;
}

export function encodeSceneInstructions(instructions) {
  return instructions.flatMap((instruction, index) => {
    if (!Array.isArray(instruction.bytes)
        || instruction.bytes.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
      fail(`Instruction ${index} has invalid encoded bytes`);
    }
    return instruction.bytes;
  });
}

export function parseCloudRenderBlock(rawBytes, table = new Map()) {
  if (!Array.isArray(rawBytes) || rawBytes.length < 3) fail('Cloud render block is too short');
  if (rawBytes.at(-1) !== 0xf0) fail('Cloud render block must end with F0');
  const instructions = [];
  let offset = 0;
  while (rawBytes[offset] === 0xf2 || rawBytes[offset] === 0xf5) {
    const value = rawBytes[offset];
    const length = value === 0xf5 ? 2 : 1;
    if (offset + length >= rawBytes.length) fail(`Truncated ${value.toString(16).toUpperCase()} cloud setup control`);
    const bytes = rawBytes.slice(offset, offset + length);
    instructions.push({
      kind: 'setupControl',
      offset,
      bytes,
      opcode: value,
      name: value === 0xf2 ? 'clear' : 'timer',
      args: bytes.slice(1),
    });
    offset += length;
  }
  if (offset + 2 >= rawBytes.length
      || rawBytes.slice(offset, offset + 2).some(value => !Number.isInteger(value) || value < 0 || value >= 0xf0)) {
    fail('Cloud render block has an invalid two-byte header');
  }
  const packedConfig = rawBytes[offset + 1];
  instructions.push({
    kind: 'header',
    offset,
    bytes: rawBytes.slice(offset, offset + 2),
    pause: rawBytes[offset],
    packedConfig,
    window: packedConfig >> 4,
    clearScreen: packedConfig >= 0x90,
    ...(packedConfig < 0x90 ? { character: packedConfig & 0x0f } : {}),
  });
  offset += 2;
  while (offset < rawBytes.length - 1) {
    const value = rawBytes[offset];
    if (value === 0xfc) {
      instructions.push({ kind: 'control', offset, bytes: [value], opcode: value, name: 'newLine', args: [] });
      offset += 1;
      continue;
    }
    if (CLOUD_INLINE_CONTROLS.has(value)) {
      const length = value === 0xf7 || value === 0xf9 ? 2 : 1;
      if (offset + length > rawBytes.length - 1) fail(`Truncated ${value.toString(16).toUpperCase()} cloud control`);
      const bytes = rawBytes.slice(offset, offset + length);
      instructions.push({
        kind: 'control',
        offset,
        bytes,
        opcode: value,
        name: CLOUD_INLINE_CONTROLS.get(value),
        args: bytes.slice(1),
      });
      offset += length;
      continue;
    }
    if (value >= 0xe0) fail(`Unsupported ${value.toString(16).toUpperCase()} cloud control at offset ${offset}`);
    const start = offset;
    while (offset < rawBytes.length - 1 && rawBytes[offset] < 0xe0) offset += 1;
    const bytes = rawBytes.slice(start, offset);
    instructions.push({
      kind: 'text',
      offset: start,
      bytes,
      text: bytes.map(byte => table.get(byte) ?? `{${byte.toString(16).padStart(2, '0').toUpperCase()}}`).join(''),
    });
  }
  instructions.push({ kind: 'control', offset, bytes: [0xf0], opcode: 0xf0, name: 'exit', args: [] });
  return instructions;
}

export function encodeCloudInstructions(instructions) {
  return encodeSceneInstructions(instructions);
}

export function parseFixedBankDictionaryRecord(rawBytes, table = new Map(), terminator = 0xfc) {
  if (!Array.isArray(rawBytes) || rawBytes.length < 1 || rawBytes.at(-1) !== terminator) {
    fail('Fixed-bank dictionary record must end with its terminator');
  }
  const textBytes = rawBytes.slice(0, -1);
  if (textBytes.includes(terminator)) fail('Fixed-bank dictionary record has an embedded terminator');
  const instructions = [];
  if (textBytes.length > 0) {
    instructions.push({
      kind: 'text',
      offset: 0,
      bytes: textBytes,
      text: textBytes.map(byte => table.get(byte) ?? `{${byte.toString(16).padStart(2, '0').toUpperCase()}}`).join(''),
    });
  }
  instructions.push({
    kind: 'terminator',
    offset: textBytes.length,
    bytes: [terminator],
    opcode: terminator,
    name: 'terminator',
    args: [],
  });
  return instructions;
}

export function encodeFixedBankDictionaryRecord(instructions, terminator = 0xfc) {
  const encoded = encodeSceneInstructions(instructions);
  if (encoded.length < 1 || encoded.at(-1) !== terminator) {
    fail('Fixed-bank dictionary record encoding is missing its terminator');
  }
  if (encoded.slice(0, -1).includes(terminator)) {
    fail('Fixed-bank dictionary record encoding has an embedded terminator');
  }
  return encoded;
}

function compactEditableEntry(id, category, translation, notes = '') {
  const entry = { id, category, translation };
  if (notes) entry.notes = notes;
  return entry;
}

function hasCompatibleScriptMetadata(extracted, previousScript) {
  const sourceRecordSha256 = extracted.sceneSha256 ?? extracted.messageSha256;
  const sourceHashMatches = previousScript?.sceneSha256 === sourceRecordSha256
    || (previousScript?.schemaVersion === 1
      && extracted.messageSha256 !== undefined
      && previousScript?.sceneSha256 === undefined);
  return previousScript?.adapterId === extracted.adapterId
    && previousScript?.sourceSha256 === extracted.sourceSha256
    && previousScript?.sceneId === extracted.sceneId
    && sourceHashMatches;
}

function hasCompatiblePreviousEntry(extracted, previousScript, previous, sourceBytes) {
  if (!hasCompatibleScriptMetadata(extracted, previousScript)
      || !previous || !TRANSLATION_CATEGORIES.has(previous.category)
      || typeof previous.translation !== 'string'
      || (previous.notes !== undefined && typeof previous.notes !== 'string')) {
    return false;
  }
  if (previousScript.schemaVersion === 1) return previous.sourceBytes === sourceBytes;
  return previousScript.schemaVersion === TRANSLATION_BUNDLE_SCHEMA_VERSION;
}

function compactScript(script) {
  return {
    sceneId: script.sceneId,
    sceneSha256: script.sceneSha256,
    ...(script.layout ? { layout: script.layout } : {}),
    entries: script.entries,
  };
}

export function exportTranslationScript(extracted, category = 'dialogue', previousScript = null) {
  if (!TRANSLATION_CATEGORIES.has(category)) fail(`Translation category ${category} is invalid`);
  const previousEntries = new Map(
    previousScript?.adapterId === extracted.adapterId && previousScript?.sceneId === extracted.sceneId
      ? previousScript.entries?.map(entry => [entry.id, entry]) ?? []
      : [],
  );
  const entries = extracted.instructions
    .filter(instruction => instruction.kind === 'text')
    .map(instruction => {
      const id = `${extracted.sceneId}.text.${instruction.offset.toString(16).padStart(4, '0')}`;
      const sourceBytes = instruction.bytes
        .map(value => value.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      const previous = previousEntries.get(id);
      const preserveEdits = hasCompatiblePreviousEntry(extracted, previousScript, previous, sourceBytes);
      return compactEditableEntry(
        id,
        preserveEdits ? previous.category : category,
        preserveEdits ? previous.translation : '',
        preserveEdits ? previous.notes ?? '' : '',
      );
    });
  return {
    schemaVersion: TRANSLATION_BUNDLE_SCHEMA_VERSION,
    adapterId: extracted.adapterId,
    sourceSha256: extracted.sourceSha256,
    sceneId: extracted.sceneId,
    sceneSha256: extracted.sceneSha256 ?? extracted.messageSha256,
    targetLanguage: 'zh-Hant',
    ...(previousScript?.layout ? { layout: previousScript.layout } : {}),
    entries,
  };
}

function instructionId(sceneId, instruction) {
  return `${sceneId}.text.${instruction.offset.toString(16).padStart(4, '0')}`;
}

function instructionSourceBytes(instruction) {
  return instruction.bytes.map(value => value.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

export function validateTranslationScript(extracted, script, requireComplete = true) {
  const sourceRecordSha256 = extracted.sceneSha256 ?? extracted.messageSha256;
  const legacyMessageHashMissing = script?.schemaVersion === 1
    && extracted.messageSha256 !== undefined
    && script.sceneSha256 === undefined;
  if (![1, TRANSLATION_BUNDLE_SCHEMA_VERSION].includes(script?.schemaVersion)
      || script.adapterId !== extracted.adapterId
      || script.sourceSha256 !== extracted.sourceSha256
      || script.sceneId !== extracted.sceneId
      || (legacyMessageHashMissing ? false : script.sceneSha256 !== sourceRecordSha256)
      || script.targetLanguage !== 'zh-Hant'
      || !Array.isArray(script.entries)) {
    fail('Translation script metadata does not match the extracted scene');
  }
  if (script.layout !== undefined
      && (!Number.isInteger(script.layout.columns) || script.layout.columns <= 0
        || script.layout.alignment !== 'source')) {
    fail('Translation script layout is invalid');
  }
  const entries = new Map();
  for (const entry of script.entries) {
    if (!entry?.id || entries.has(entry.id)) fail(`Duplicate or empty translation entry ${entry?.id ?? '<empty>'}`);
    if (!TRANSLATION_CATEGORIES.has(entry.category)) fail(`Translation entry ${entry.id} has invalid category`);
    if (typeof entry.translation !== 'string'
        || (script.schemaVersion === 1 && typeof entry.notes !== 'string')
        || (entry.notes !== undefined && typeof entry.notes !== 'string')) {
      fail(`Translation entry ${entry.id} has invalid editable fields`);
    }
    if (script.schemaVersion === TRANSLATION_BUNDLE_SCHEMA_VERSION
        && ['sceneOffset', 'encodedLength', 'sourceBytes', 'sourceText'].some(key => key in entry)) {
      fail(`Translation entry ${entry.id} must use compact source references`);
    }
    entries.set(entry.id, { ...entry, notes: entry.notes ?? '' });
  }
  const textInstructions = extracted.instructions.filter(instruction => instruction.kind === 'text');
  if (entries.size !== textInstructions.length) fail('Translation script text entry count does not match the scene');
  for (const instruction of textInstructions) {
    const id = instructionId(extracted.sceneId, instruction);
    const entry = entries.get(id);
    if (!entry) fail(`Translation script is missing ${id}`);
    if (script.schemaVersion === 1 && (entry.sceneOffset !== instruction.offset
        || entry.encodedLength !== instruction.bytes.length
        || entry.sourceBytes !== instructionSourceBytes(instruction)
        || entry.sourceText !== instruction.text)) {
      fail(`Translation entry ${id} source evidence does not match the scene`);
    }
    if (requireComplete && entry.translation.length === 0) fail(`Translation entry ${id} has no translation`);
  }
  return entries;
}

export function migrateTranslationScript(extracted, script) {
  validateTranslationScript(extracted, script, false);
  return exportTranslationScript(extracted, 'dialogue', script);
}

function layoutTranslations(extracted, entries, layout) {
  const translations = new Map(
    [...entries].map(([id, entry]) => [id, entry.translation]),
  );
  if (!layout) return translations;
  let lineIds = [];
  const alignLine = () => {
    if (lineIds.length === 0) return;
    const firstId = lineIds[0];
    const firstText = translations.get(firstId);
    const trimmedFirstText = firstText.trimStart();
    const sourcePadding = extracted.instructions
      .find(instruction => instructionId(extracted.sceneId, instruction) === firstId)
      .bytes.findIndex(byte => byte !== 0x00);
    const leadingColumns = sourcePadding === -1 ? entries.get(firstId).encodedLength : sourcePadding;
    const contentLength = lineIds.reduce((total, id) => total + [...translations.get(id)].length, 0)
      - ([...firstText].length - [...trimmedFirstText].length);
    if (contentLength > layout.columns) fail(`Translated line exceeds ${layout.columns} columns`);
    translations.set(firstId, `${' '.repeat(leadingColumns)}${trimmedFirstText}`);
    lineIds = [];
  };
  for (const instruction of extracted.instructions) {
    if (instruction.kind === 'text') {
      lineIds.push(instructionId(extracted.sceneId, instruction));
    } else if (instruction.kind === 'control' && instruction.opcode === 0xfc) {
      alignLine();
    }
  }
  alignLine();
  return translations;
}

export function compileTranslationScene(extracted, script) {
  const entries = validateTranslationScript(extracted, script);
  const translations = layoutTranslations(extracted, entries, script.layout);
  const codeByCharacter = new Map([[' ', 0x00]]);
  for (const instruction of extracted.instructions) {
    if (instruction.kind !== 'text') continue;
    for (const character of translations.get(instructionId(extracted.sceneId, instruction))) {
      if (codeByCharacter.has(character)) continue;
      const code = codeByCharacter.size;
      if (code > 0xd8) fail('Translation requires more than 216 visible glyph codes');
      codeByCharacter.set(character, code);
    }
  }

  const rawBytes = [];
  const instructionOffsets = [];
  for (const instruction of extracted.instructions) {
    instructionOffsets.push({ sourceOffset: instruction.offset, targetOffset: rawBytes.length });
    if (instruction.kind === 'text') {
      const translation = translations.get(instructionId(extracted.sceneId, instruction));
      rawBytes.push(...[...translation].map(character => codeByCharacter.get(character)));
    } else {
      rawBytes.push(...instruction.bytes);
    }
  }
  const usedLength = rawBytes.length;
  if (usedLength > extracted.location.encodedLength) {
    fail(`Translated scene exceeds its ${extracted.location.encodedLength}-byte allocation`);
  }
  const paddingLength = extracted.location.encodedLength - usedLength;
  const terminal = extracted.instructions.at(-1);
  if (paddingLength > 0 && !(terminal?.kind === 'control' && [0xfe, 0xff].includes(terminal.opcode))) {
    fail('Translated scene cannot be padded because it has no terminal jump or exit');
  }
  rawBytes.push(...Array(paddingLength).fill(0xff));
  return {
    schemaVersion: 1,
    adapterId: extracted.adapterId,
    sourceSha256: extracted.sourceSha256,
    sceneId: extracted.sceneId,
    sourceSceneSha256: extracted.sceneSha256,
    physicalPrgOffset: extracted.location.physicalPrgOffset,
    encodedLength: extracted.location.encodedLength,
    usedLength,
    paddingLength,
    layout: script.layout ?? null,
    glyphs: [...codeByCharacter].map(([character, code]) => ({ code, character })),
    instructionOffsets,
    rawBytes,
  };
}

export function parseTable(tableText) {
  const table = new Map();
  for (const rawLine of tableText.replaceAll('\r\n', '\n').split('\n')) {
    if (!rawLine || rawLine.startsWith('#')) continue;
    const separator = rawLine.indexOf('=');
    if (separator <= 0) fail(`Invalid table line ${rawLine}`);
    const key = rawLine.slice(0, separator);
    if (!/^[0-9A-Fa-f]{2}$/.test(key)) fail(`Invalid table byte ${key}`);
    table.set(Number.parseInt(key, 16), rawLine.slice(separator + 1));
  }
  return table;
}

export function createDictionaryCharacterCodeMap(table, customGlyphMap = {}) {
  const codeByCharacter = new Map();
  const characterByCode = new Map();
  for (const [code, character] of table) {
    if (code > 0xd8 || typeof character !== 'string' || character.startsWith('{')
        || [...character].length !== 1) continue;
    if (codeByCharacter.has(character) && codeByCharacter.get(character) !== code) {
      fail(`Dictionary table maps ${character} to more than one glyph code`);
    }
    codeByCharacter.set(character, code);
    characterByCode.set(code, character);
  }
  if (!codeByCharacter.has(' ')) codeByCharacter.set(' ', 0x00);
  const customEntries = Array.isArray(customGlyphMap)
    ? customGlyphMap.map(entry => [entry?.character, entry?.code])
    : Object.entries(customGlyphMap);
  for (const [character, code] of customEntries) {
    if (typeof character !== 'string' || [...character].length !== 1
        || !Number.isInteger(code) || code < 0 || code > 0xd8) {
      fail(`Dictionary glyph mapping is invalid for ${character ?? '<empty>'}`);
    }
    const existingCode = codeByCharacter.get(character);
    const existingCharacter = characterByCode.get(code);
    if (existingCode !== undefined && existingCode !== code) {
      fail(`Dictionary glyph ${character} is already assigned to code ${existingCode}`);
    }
    if (existingCharacter !== undefined && existingCharacter !== character) {
      fail(`Dictionary glyph code ${code} is already assigned to ${existingCharacter}`);
    }
    codeByCharacter.set(character, code);
    characterByCode.set(code, character);
  }
  if (codeByCharacter.get(' ') !== 0x00) fail('Dictionary glyph code 0 must remain a space');
  return codeByCharacter;
}

export function getDictionarySourceGlyphCodes(table) {
  const sourceGlyphCodes = new Set([0x00]);
  for (const [code, character] of table) {
    if (code > 0xd8 || typeof character !== 'string' || character.startsWith('{')
        || [...character].length !== 1) continue;
    sourceGlyphCodes.add(code);
  }
  return sourceGlyphCodes;
}

export function decodeSceneBytes(rawBytes, table) {
  const fragments = [];
  let text = '';
  const flushText = () => {
    if (text) fragments.push({ kind: 'text', text });
    text = '';
  };
  for (let offset = 0; offset < rawBytes.length; offset += 1) {
    const value = rawBytes[offset];
    const mapped = table.get(value);
    if (mapped !== undefined && !mapped.startsWith('{')) {
      text += mapped;
      continue;
    }
    flushText();
    fragments.push({
      kind: mapped?.startsWith('{') ? 'control' : classifyByte(value),
      offset,
      value,
      token: mapped ?? `{BYTE:${value.toString(16).padStart(2, '0').toUpperCase()}}`,
    });
  }
  flushText();
  return fragments;
}

function getSceneDefinition(adapter) {
  const scene = adapter.scriptModel.scenes.find(candidate => candidate.id === SCENE_ID);
  if (!scene) fail(`Adapter is missing scene ${SCENE_ID}`);
  const pointerTable = adapter.scriptModel.pointerTables.find(
    candidate => candidate.id === scene.pointerTable,
  );
  if (!pointerTable) fail(`Adapter is missing pointer table ${scene.pointerTable}`);
  return { scene, pointerTable };
}

function readSceneBounds(rom, adapter) {
  const { prgStart, prgSize } = inspectInes(rom);
  const { scene, pointerTable } = getSceneDefinition(adapter);
  const tableStart = prgStart + pointerTable.physicalPrgOffset;
  const readPointer = index => rom.readUInt16LE(tableStart + index * 2);
  const start = readPointer(scene.pointerIndex) - pointerTable.cpuBase
    + pointerTable.physicalPrgOffset;
  const end = readPointer(scene.endPointerIndex) - pointerTable.cpuBase
    + pointerTable.physicalPrgOffset;
  if (start !== scene.physicalPrgOffset || end - start !== scene.encodedLength) {
    fail(`Scene ${scene.id} pointer boundaries do not match adapter evidence`);
  }
  if (start < 0 || end <= start || end > prgSize) fail(`Scene ${scene.id} is outside PRG ROM`);
  return { scene, fileStart: prgStart + start, fileEnd: prgStart + end };
}

export function extractOpeningScene(romBytes, adapter, table = new Map()) {
  const rom = Buffer.from(romBytes);
  const acceptedHashes = new Set(adapter.sourceRoms.map(source => source.sha256));
  const sourceSha256 = sha256(rom);
  if (!acceptedHashes.has(sourceSha256)) fail(`Unsupported source ROM SHA-256 ${sourceSha256}`);
  const { scene, fileStart, fileEnd } = readSceneBounds(rom, adapter);
  const rawBytes = [...rom.subarray(fileStart, fileEnd)];
  const sceneSha256 = sha256(Buffer.from(rawBytes));
  if (sceneSha256 !== scene.sha256) fail(`Scene ${scene.id} checksum mismatch`);
  return {
    schemaVersion: 1,
    adapterId: adapter.adapterId,
    sourceSha256,
    sceneId: scene.id,
    location: {
      physicalPrgOffset: scene.physicalPrgOffset,
      encodedLength: scene.encodedLength,
    },
    sceneSha256,
    rawBytes,
    tokens: rawBytes.map((value, offset) => ({ offset, value, kind: classifyByte(value) })),
    fragments: decodeSceneBytes(rawBytes, table),
    instructions: parseSceneInstructions(rawBytes, table),
  };
}

export function extractSceneBank(romBytes, adapter, pointerTableId, table = new Map()) {
  const rom = Buffer.from(romBytes);
  const acceptedHashes = new Set(adapter.sourceRoms.map(source => source.sha256));
  const sourceSha256 = sha256(rom);
  if (!acceptedHashes.has(sourceSha256)) fail(`Unsupported source ROM SHA-256 ${sourceSha256}`);
  const { prgStart, prgSize } = inspectInes(rom);
  const pointerTable = adapter.scriptModel.pointerTables.find(candidate => candidate.id === pointerTableId);
  if (!pointerTable || !Number.isInteger(pointerTable.entryCount) || pointerTable.entryCount <= 0) {
    fail(`Adapter has no complete pointer table ${pointerTableId}`);
  }
  const tableStart = prgStart + pointerTable.physicalPrgOffset;
  const pointers = Array.from({ length: pointerTable.entryCount }, (_, index) => (
    rom.readUInt16LE(tableStart + index * 2)
  ));
  const bankEnd = Math.min(prgSize, pointerTable.physicalPrgOffset + 0x2000);
  const bankCpuEnd = pointerTable.cpuBase + bankEnd - pointerTable.physicalPrgOffset;
  const minimumPointer = pointerTable.cpuBase + pointerTable.entryCount * 2;
  if (pointers.some(value => value < minimumPointer || value >= bankCpuEnd)) {
    fail(`Pointer table ${pointerTableId} contains an out-of-bank scene pointer`);
  }
  const uniquePointers = [...new Set(pointers)].sort((left, right) => left - right);
  const nextPointer = new Map(uniquePointers.map((pointer, index) => [
    pointer,
    uniquePointers[index + 1] ?? bankCpuEnd,
  ]));
  const canonicalIndex = new Map();
  pointers.forEach((pointer, index) => {
    if (!canonicalIndex.has(pointer)) canonicalIndex.set(pointer, index);
  });
  const knownScenes = new Map(adapter.scriptModel.scenes
    .filter(scene => scene.pointerTable === pointerTableId)
    .map(scene => [scene.pointerIndex, scene]));
  const scenes = pointers.map((pointer, index) => {
    const physicalPrgOffset = pointerTable.physicalPrgOffset + pointer - pointerTable.cpuBase;
    let physicalEnd = pointerTable.physicalPrgOffset + nextPointer.get(pointer) - pointerTable.cpuBase;
    if (physicalPrgOffset < pointerTable.physicalPrgOffset
        || physicalEnd <= physicalPrgOffset || physicalEnd > bankEnd) {
      fail(`Scene pointer ${index} is outside ${pointerTableId}`);
    }
    let rawBytes = [...rom.subarray(prgStart + physicalPrgOffset, prgStart + physicalEnd)];
    let instructions = parseSceneInstructions(rawBytes, table);
    if (pointer === uniquePointers.at(-1)) {
      const exit = instructions.find(instruction => instruction.kind === 'control' && instruction.opcode === 0xff);
      if (!exit) fail(`Last scene in ${pointerTableId} has no exit control`);
      physicalEnd = physicalPrgOffset + exit.offset + exit.bytes.length;
      rawBytes = rawBytes.slice(0, physicalEnd - physicalPrgOffset);
      instructions = parseSceneInstructions(rawBytes, table);
    }
    if (!Buffer.from(encodeSceneInstructions(instructions)).equals(Buffer.from(rawBytes))) {
      fail(`Scene pointer ${index} is not byte-identical after parsing`);
    }
    const known = knownScenes.get(index);
    const canonicalPointerIndex = canonicalIndex.get(pointer);
    const sceneId = known?.id ?? `${pointerTableId}.${index.toString().padStart(2, '0')}`;
    const canonicalKnown = knownScenes.get(canonicalPointerIndex);
    const canonicalSceneId = canonicalKnown?.id
      ?? `${pointerTableId}.${canonicalPointerIndex.toString().padStart(2, '0')}`;
    return {
      schemaVersion: 1,
      adapterId: adapter.adapterId,
      sourceSha256,
      sceneId,
      pointerIndex: index,
      ...(canonicalPointerIndex === index ? {} : { aliasOf: canonicalSceneId }),
      location: { physicalPrgOffset, encodedLength: rawBytes.length },
      sceneSha256: sha256(Buffer.from(rawBytes)),
      rawBytes,
      instructions,
    };
  });
  const uniqueScenes = scenes.filter(scene => !scene.aliasOf);
  const textInstructions = uniqueScenes.flatMap(scene => scene.instructions.filter(instruction => instruction.kind === 'text'));
  const sourceGlyphCodes = textInstructions.flatMap(instruction => instruction.bytes);
  return {
    schemaVersion: 1,
    adapterId: adapter.adapterId,
    sourceSha256,
    pointerTableId,
    scenes,
    metrics: {
      sceneCount: scenes.length,
      uniqueSceneCount: uniqueScenes.length,
      aliasCount: scenes.length - uniqueScenes.length,
      encodedBytes: uniqueScenes.reduce((total, scene) => total + scene.rawBytes.length, 0),
      textRuns: textInstructions.length,
      sourceGlyphs: sourceGlyphCodes.length,
      uniqueSourceGlyphCodes: new Set(sourceGlyphCodes).size,
      controls: uniqueScenes.reduce((total, scene) => total
        + scene.instructions.filter(instruction => instruction.kind === 'control').length, 0),
      pauses: uniqueScenes.reduce((total, scene) => total
        + scene.instructions.filter(instruction => instruction.kind === 'pause').length, 0),
    },
  };
}

export function extractFixedBankDictionary(romBytes, adapter, dictionaryId, table = new Map()) {
  const rom = Buffer.from(romBytes);
  const acceptedHashes = new Set(adapter.sourceRoms.map(source => source.sha256));
  const sourceSha256 = sha256(rom);
  if (!acceptedHashes.has(sourceSha256)) fail(`Unsupported source ROM SHA-256 ${sourceSha256}`);
  const { prgStart, prgSize } = inspectInes(rom);
  const definition = adapter.scriptModel.dictionaries?.find(candidate => candidate.id === dictionaryId);
  if (!definition || !Number.isInteger(definition.entryCount) || definition.entryCount <= 0
      || !Number.isInteger(definition.bankPhysicalPrgOffset)
      || !Number.isInteger(definition.pointerTablePhysicalPrgOffset)
      || !Number.isInteger(definition.cpuBase)) {
    fail(`Adapter has no complete fixed-bank dictionary ${dictionaryId}`);
  }
  const bankSize = definition.bankSize ?? 0x2000;
  const recordTerminator = definition.recordTerminator ?? 0xfc;
  const bankEnd = Math.min(prgSize, definition.bankPhysicalPrgOffset + bankSize);
  const bankCpuEnd = definition.cpuBase + bankEnd - definition.bankPhysicalPrgOffset;
  const tableStart = prgStart + definition.pointerTablePhysicalPrgOffset;
  const tableEnd = tableStart + definition.entryCount * 2;
  if (definition.bankPhysicalPrgOffset < 0 || bankEnd > prgSize
      || definition.pointerTablePhysicalPrgOffset < definition.bankPhysicalPrgOffset
      || tableEnd > prgStart + bankEnd) {
    fail(`Dictionary ${dictionaryId} pointer table is outside its fixed bank`);
  }
  const pointers = Array.from({ length: definition.entryCount }, (_, index) => (
    rom.readUInt16LE(tableStart + index * 2)
  ));
  const externalEntries = new Map((definition.externalEntries ?? []).map(entry => [entry.index, entry]));
  const dataCpuBase = definition.dataCpuBase ?? definition.cpuBase;
  const pointerToPhysical = pointer => definition.bankPhysicalPrgOffset + pointer - definition.cpuBase;
  pointers.forEach((pointer, index) => {
    const external = externalEntries.get(index);
    const inFixedBank = pointer >= definition.cpuBase && pointer < bankCpuEnd;
    if (!inFixedBank) {
      if (!external || external.pointer !== pointer) {
        fail(`Dictionary ${dictionaryId} has an undeclared external pointer at index ${index}`);
      }
      return;
    }
    if (external) fail(`Dictionary ${dictionaryId} marks an in-bank pointer external at index ${index}`);
    if (pointer < dataCpuBase) fail(`Dictionary ${dictionaryId} has a pointer before its data base at index ${index}`);
  });
  const canonicalIndex = new Map();
  pointers.forEach((pointer, index) => {
    if (externalEntries.has(index)) return;
    if (!canonicalIndex.has(pointer)) canonicalIndex.set(pointer, index);
  });
  const recordsByPointer = new Map();
  [...canonicalIndex.keys()].forEach(pointer => {
    const physicalPrgOffset = pointerToPhysical(pointer);
    const rawBytes = [];
    let address = pointer;
    while (address < bankCpuEnd) {
      const value = rom[prgStart + pointerToPhysical(address)];
      rawBytes.push(value);
      address += 1;
      if (value === recordTerminator) break;
    }
    if (rawBytes.at(-1) !== recordTerminator) {
      fail(`Dictionary ${dictionaryId} record ${pointer.toString(16).toUpperCase()} has no terminator`);
    }
    const instructions = parseFixedBankDictionaryRecord(rawBytes, table, recordTerminator);
    if (!Buffer.from(encodeFixedBankDictionaryRecord(instructions, recordTerminator)).equals(Buffer.from(rawBytes))) {
      fail(`Dictionary ${dictionaryId} record ${pointer.toString(16).toUpperCase()} is not byte-identical after parsing`);
    }
    recordsByPointer.set(pointer, {
      recordType: 'text',
      location: {
        physicalPrgOffset,
        cpuAddress: pointer,
        encodedLength: rawBytes.length,
      },
      recordSha256: sha256(Buffer.from(rawBytes)),
      rawBytes,
      instructions,
    });
  });
  const records = pointers.map((pointer, index) => {
    const external = externalEntries.get(index);
    const id = `${dictionaryId}.${index.toString().padStart(3, '0')}`;
    if (external) {
      return {
        schemaVersion: 1,
        adapterId: adapter.adapterId,
        sourceSha256,
        dictionaryId,
        id,
        pointerIndex: index,
        pointer,
        recordType: 'external',
        externalKind: external.kind ?? 'opaque',
        location: { cpuAddress: pointer },
        rawBytes: [],
        instructions: [],
      };
    }
    const canonicalPointerIndex = canonicalIndex.get(pointer);
    const canonicalId = `${dictionaryId}.${canonicalPointerIndex.toString().padStart(3, '0')}`;
    return {
      schemaVersion: 1,
      adapterId: adapter.adapterId,
      sourceSha256,
      dictionaryId,
      id,
      pointerIndex: index,
      pointer,
      ...(canonicalPointerIndex === index ? {} : { aliasOf: canonicalId }),
      ...recordsByPointer.get(pointer),
    };
  });
  const uniqueRecords = records.filter(record => !record.aliasOf && record.recordType === 'text');
  const textInstructions = uniqueRecords.flatMap(record => (
    record.instructions.filter(instruction => instruction.kind === 'text')
  ));
  const sourceGlyphCodes = textInstructions.flatMap(instruction => instruction.bytes);
  return {
    schemaVersion: 1,
    adapterId: adapter.adapterId,
    sourceSha256,
    dictionaryId,
    pointerTable: {
      physicalPrgOffset: definition.pointerTablePhysicalPrgOffset,
      cpuAddress: definition.pointerTableCpuAddress
        ?? definition.cpuBase + definition.pointerTablePhysicalPrgOffset - definition.bankPhysicalPrgOffset,
      entryCount: definition.entryCount,
      encoding: definition.encoding ?? 'little-endian-u16',
    },
    data: {
      physicalPrgOffset: definition.dataPhysicalPrgOffset
        ?? definition.bankPhysicalPrgOffset + dataCpuBase - definition.cpuBase,
      cpuAddress: dataCpuBase,
      recordTerminator,
    },
    records,
    metrics: {
      entryCount: records.length,
      fixedRecordCount: records.filter(record => record.recordType === 'text').length,
      externalEntryCount: records.filter(record => record.recordType === 'external').length,
      uniqueRecordCount: uniqueRecords.length,
      aliasCount: records.filter(record => record.aliasOf).length,
      encodedBytes: uniqueRecords.reduce((total, record) => total + record.rawBytes.length, 0),
      textRuns: textInstructions.length,
      sourceGlyphs: sourceGlyphCodes.length,
      uniqueSourceGlyphCodes: new Set(sourceGlyphCodes).size,
    },
  };
}

export function exportDictionaryTranslations(extractedDictionary, previousBundle = null) {
  const previousEntries = new Map((previousBundle?.entries ?? [])
    .map(entry => [entry.id, entry]));
  const entries = extractedDictionary.records
    .filter(record => !record.aliasOf && record.recordType === 'text')
    .map(record => {
      const sourceBytes = instructionSourceBytes({ bytes: record.rawBytes });
      const previous = previousEntries.get(record.id);
      const preserveEdits = previousBundle?.adapterId === extractedDictionary.adapterId
        && previousBundle?.sourceSha256 === extractedDictionary.sourceSha256
        && previousBundle?.dictionaryId === extractedDictionary.dictionaryId
        && previous?.category === 'dictionary'
        && typeof previous.translation === 'string'
        && (previous.notes === undefined || typeof previous.notes === 'string')
        && (previousBundle.schemaVersion === TRANSLATION_BUNDLE_SCHEMA_VERSION
          || previous?.sourceBytes === sourceBytes);
      return compactEditableEntry(
        record.id,
        'dictionary',
        preserveEdits ? previous.translation : '',
        preserveEdits ? previous.notes ?? '' : '',
      );
    });
  return {
    schemaVersion: TRANSLATION_BUNDLE_SCHEMA_VERSION,
    adapterId: extractedDictionary.adapterId,
    sourceSha256: extractedDictionary.sourceSha256,
    dictionaryId: extractedDictionary.dictionaryId,
    targetLanguage: 'zh-Hant',
    metrics: extractedDictionary.metrics,
    aliases: extractedDictionary.records.filter(record => record.aliasOf).map(record => ({
      entryId: record.id,
      aliasOf: record.aliasOf,
    })),
    externalEntries: extractedDictionary.records
      .filter(record => record.recordType === 'external')
      .map(record => ({
        entryId: record.id,
        pointerIndex: record.pointerIndex,
        pointer: record.pointer,
        kind: record.externalKind,
      })),
    entries,
  };
}

export function validateDictionaryTranslations(extractedDictionary, bundle, requireComplete = true) {
  if (![1, TRANSLATION_BUNDLE_SCHEMA_VERSION].includes(bundle?.schemaVersion)
      || bundle.adapterId !== extractedDictionary.adapterId
      || bundle.sourceSha256 !== extractedDictionary.sourceSha256
      || bundle.dictionaryId !== extractedDictionary.dictionaryId
      || bundle.targetLanguage !== 'zh-Hant'
      || !Array.isArray(bundle.entries)) {
    fail('Dictionary translation metadata does not match the extracted dictionary');
  }
  const entries = new Map();
  for (const entry of bundle.entries) {
    if (!entry?.id || entries.has(entry.id)) fail(`Duplicate or empty dictionary entry ${entry?.id ?? '<empty>'}`);
    if (entry.category !== 'dictionary'
        || typeof entry.translation !== 'string'
        || (bundle.schemaVersion === 1 && typeof entry.notes !== 'string')
        || (entry.notes !== undefined && typeof entry.notes !== 'string')) {
      fail(`Dictionary entry ${entry.id} has invalid editable fields`);
    }
    if (bundle.schemaVersion === TRANSLATION_BUNDLE_SCHEMA_VERSION
        && ['pointerIndex', 'pointer', 'physicalPrgOffset', 'encodedLength', 'sourceBytes', 'sourceText']
          .some(key => key in entry)) {
      fail(`Dictionary entry ${entry.id} must use compact source references`);
    }
    entries.set(entry.id, { ...entry, notes: entry.notes ?? '' });
  }
  const records = extractedDictionary.records.filter(record => (
    !record.aliasOf && record.recordType === 'text'
  ));
  if (entries.size !== records.length) fail('Dictionary translation entry count does not match the dictionary');
  for (const record of records) {
    const entry = entries.get(record.id);
    const textInstruction = record.instructions.find(instruction => instruction.kind === 'text');
    if (!entry) fail(`Dictionary translation is missing ${record.id}`);
    if (bundle.schemaVersion === 1 && (entry.pointerIndex !== record.pointerIndex
      || entry.pointer !== record.pointer
      || entry.physicalPrgOffset !== record.location.physicalPrgOffset
      || entry.encodedLength !== record.rawBytes.length
      || entry.sourceBytes !== instructionSourceBytes({ bytes: record.rawBytes })
      || entry.sourceText !== (textInstruction?.text ?? ''))) {
      fail(`Dictionary entry ${record.id} source evidence does not match the dictionary`);
    }
    if (requireComplete && entry.translation.length === 0) {
      fail(`Dictionary entry ${record.id} has no translation`);
    }
  }
  return entries;
}

export function migrateDictionaryTranslations(extractedDictionary, bundle) {
  validateDictionaryTranslations(extractedDictionary, bundle, false);
  return exportDictionaryTranslations(extractedDictionary, bundle);
}

export function compileDictionaryTranslations(extractedDictionary, bundle, codeByCharacter, sourceGlyphCodes) {
  const entries = validateDictionaryTranslations(extractedDictionary, bundle);
  if (!(codeByCharacter instanceof Map)) fail('Dictionary compilation requires a character-to-code map');
  if (!(sourceGlyphCodes instanceof Set)) fail('Dictionary compilation requires source glyph codes');
  const codeOwners = new Map();
  for (const [character, code] of codeByCharacter) {
    if ([...character].length !== 1 || !Number.isInteger(code) || code < 0 || code > 0xd8) {
      fail(`Dictionary glyph mapping is invalid for ${character}`);
    }
    if (codeOwners.has(code)) fail(`Dictionary glyph code ${code} is assigned more than once`);
    if (code === 0 && character !== ' ') fail('Dictionary glyph code 0 must remain a space');
    codeOwners.set(code, character);
  }
  const recordTerminator = extractedDictionary.data.recordTerminator;
  const overlays = [];
  const usedGlyphs = new Map();
  const compiledRecords = extractedDictionary.records
    .filter(record => !record.aliasOf && record.recordType === 'text')
    .map(record => {
      const entry = entries.get(record.id);
      const translatedBytes = [];
      for (const character of [...entry.translation]) {
        const code = codeByCharacter.get(character);
        if (code === undefined) fail(`Dictionary translation ${record.id} has no glyph for ${character}`);
        translatedBytes.push(code);
        if (!usedGlyphs.has(character)) usedGlyphs.set(character, code);
      }
      translatedBytes.push(recordTerminator);
      if (translatedBytes.length > record.rawBytes.length) {
        fail(`Dictionary translation ${record.id} exceeds its ${record.rawBytes.length}-byte allocation`);
      }
      const rawBytes = [...translatedBytes, ...Array(record.rawBytes.length - translatedBytes.length).fill(0x00)];
      rawBytes.forEach((value, offset) => {
        if (value !== record.rawBytes[offset]) {
          overlays.push({
            id: `${record.id}.${offset.toString(16).padStart(2, '0').toUpperCase()}`,
            offset: record.location.physicalPrgOffset + offset,
            expectedOriginal: record.rawBytes[offset],
            value,
          });
        }
      });
      return {
        id: record.id,
        pointerIndex: record.pointerIndex,
        pointer: record.pointer,
        physicalPrgOffset: record.location.physicalPrgOffset,
        encodedLength: record.rawBytes.length,
        usedLength: translatedBytes.length,
        paddingLength: record.rawBytes.length - translatedBytes.length,
        sourceBytes: record.rawBytes,
        rawBytes,
      };
    });
  return {
    schemaVersion: 1,
    adapterId: extractedDictionary.adapterId,
    sourceSha256: extractedDictionary.sourceSha256,
    dictionaryId: extractedDictionary.dictionaryId,
    recordTerminator,
    records: compiledRecords,
    overlays,
    glyphs: [...usedGlyphs]
      .filter(([, code]) => !sourceGlyphCodes.has(code))
      .map(([character, code]) => ({ code, character })),
  };
}

export function extractCloudMessages(romBytes, adapter, cloudTableId, table = new Map()) {
  const rom = Buffer.from(romBytes);
  const acceptedHashes = new Set(adapter.sourceRoms.map(source => source.sha256));
  const sourceSha256 = sha256(rom);
  if (!acceptedHashes.has(sourceSha256)) fail(`Unsupported source ROM SHA-256 ${sourceSha256}`);
  const { prgStart, prgSize } = inspectInes(rom);
  const definition = adapter.scriptModel.cloudTables?.find(candidate => candidate.id === cloudTableId);
  if (!definition || !Number.isInteger(definition.entryCount) || definition.entryCount <= 0) {
    fail(`Adapter has no complete cloud table ${cloudTableId}`);
  }
  const tableStart = prgStart + definition.pointerTablePhysicalPrgOffset;
  const pointers = Array.from({ length: definition.entryCount }, (_, index) => (
    rom.readUInt16LE(tableStart + index * 2)
  ));
  const bankEnd = Math.min(prgSize, definition.bankPhysicalPrgOffset + 0x4000);
  const bankCpuEnd = definition.cpuBase + bankEnd - definition.bankPhysicalPrgOffset;
  if (pointers.some(pointer => pointer < definition.cpuBase || pointer >= bankCpuEnd)) {
    fail(`Cloud table ${cloudTableId} contains an out-of-bank pointer`);
  }
  const uniquePointers = [...new Set(pointers)].sort((left, right) => left - right);
  const canonicalIndex = new Map();
  pointers.forEach((pointer, index) => {
    if (!canonicalIndex.has(pointer)) canonicalIndex.set(pointer, index);
  });
  const messagesByPointer = new Map();
  uniquePointers.forEach((pointer, pointerIndex) => {
    const physicalPrgOffset = definition.bankPhysicalPrgOffset + pointer - definition.cpuBase;
    const nextPointer = uniquePointers[pointerIndex + 1];
    let physicalEnd = nextPointer === undefined
      ? bankEnd
      : definition.bankPhysicalPrgOffset + nextPointer - definition.cpuBase;
    let rawBytes = [...rom.subarray(prgStart + physicalPrgOffset, prgStart + physicalEnd)];
    if (nextPointer === undefined) {
      const exitOffset = rawBytes.indexOf(0xf0);
      if (exitOffset === -1) fail(`Last message in ${cloudTableId} has no F0 exit`);
      rawBytes = rawBytes.slice(0, exitOffset + 1);
      physicalEnd = physicalPrgOffset + rawBytes.length;
    }
    let messageType = 'opaque';
    let instructions = [{ kind: 'opaque', offset: 0, bytes: rawBytes }];
    try {
      const parsed = parseCloudRenderBlock(rawBytes, table);
      if (Buffer.from(encodeCloudInstructions(parsed)).equals(Buffer.from(rawBytes))) {
        messageType = 'render';
        instructions = parsed;
      }
    } catch {
      // Branching cloud scripts remain lossless until their control-flow graph is modeled.
    }
    messagesByPointer.set(pointer, {
      messageType,
      location: { physicalPrgOffset, encodedLength: physicalEnd - physicalPrgOffset },
      messageSha256: sha256(Buffer.from(rawBytes)),
      rawBytes,
      instructions,
    });
  });
  const messages = pointers.map((pointer, index) => {
    const canonicalPointerIndex = canonicalIndex.get(pointer);
    const messageId = `${cloudTableId}.${index.toString(16).padStart(2, '0').toUpperCase()}`;
    const canonicalMessageId = `${cloudTableId}.${canonicalPointerIndex.toString(16).padStart(2, '0').toUpperCase()}`;
    return {
      schemaVersion: 1,
      adapterId: adapter.adapterId,
      sourceSha256,
      sceneId: messageId,
      pointerIndex: index,
      ...(canonicalPointerIndex === index ? {} : { aliasOf: canonicalMessageId }),
      ...messagesByPointer.get(pointer),
    };
  });
  const uniqueMessages = messages.filter(message => !message.aliasOf);
  const renderMessages = uniqueMessages.filter(message => message.messageType === 'render');
  const textInstructions = renderMessages.flatMap(message => (
    message.instructions.filter(instruction => instruction.kind === 'text')
  ));
  const sourceGlyphCodes = textInstructions.flatMap(instruction => instruction.bytes);
  return {
    schemaVersion: 1,
    adapterId: adapter.adapterId,
    sourceSha256,
    cloudTableId,
    messages,
    metrics: {
      messageCount: messages.length,
      uniqueMessageCount: uniqueMessages.length,
      aliasCount: messages.length - uniqueMessages.length,
      renderMessageCount: renderMessages.length,
      opaqueMessageCount: uniqueMessages.length - renderMessages.length,
      encodedBytes: uniqueMessages.reduce((total, message) => total + message.rawBytes.length, 0),
      textRuns: textInstructions.length,
      sourceGlyphs: sourceGlyphCodes.length,
      uniqueSourceGlyphCodes: new Set(sourceGlyphCodes).size,
    },
  };
}

export function exportCloudTranslations(extractedClouds, previousBundle = null) {
  const previousScripts = new Map((previousBundle?.scripts ?? [])
    .map(script => [script.sceneId, script]));
  return {
    schemaVersion: TRANSLATION_BUNDLE_SCHEMA_VERSION,
    adapterId: extractedClouds.adapterId,
    sourceSha256: extractedClouds.sourceSha256,
    cloudTableId: extractedClouds.cloudTableId,
    targetLanguage: 'zh-Hant',
    metrics: extractedClouds.metrics,
    aliases: extractedClouds.messages.filter(message => message.aliasOf).map(message => ({
      messageId: message.sceneId,
      aliasOf: message.aliasOf,
    })),
    opaqueMessages: extractedClouds.messages
      .filter(message => !message.aliasOf && message.messageType === 'opaque')
      .map(message => message.sceneId),
    scripts: extractedClouds.messages
      .filter(message => !message.aliasOf && message.messageType === 'render')
      .map(message => compactScript(exportTranslationScript(
        message,
        'battleMessage',
        previousScripts.has(message.sceneId)
          ? {
            schemaVersion: TRANSLATION_BUNDLE_SCHEMA_VERSION,
            adapterId: extractedClouds.adapterId,
            sourceSha256: extractedClouds.sourceSha256,
            targetLanguage: 'zh-Hant',
            ...previousScripts.get(message.sceneId),
          }
          : null,
      ))),
  };
}

export function exportSceneBankTranslations(extractedBank, category = 'dialogue', previousBundle = null) {
  const previousScripts = new Map([
    ...(previousBundle?.scripts ?? []).map(script => [script.sceneId, script]),
    ...(previousBundle?.sceneId ? [[previousBundle.sceneId, previousBundle]] : []),
  ]);
  return {
    schemaVersion: TRANSLATION_BUNDLE_SCHEMA_VERSION,
    adapterId: extractedBank.adapterId,
    sourceSha256: extractedBank.sourceSha256,
    pointerTableId: extractedBank.pointerTableId,
    targetLanguage: 'zh-Hant',
    metrics: extractedBank.metrics,
    aliases: extractedBank.scenes.filter(scene => scene.aliasOf).map(scene => ({
      sceneId: scene.sceneId,
      aliasOf: scene.aliasOf,
    })),
    scripts: extractedBank.scenes.filter(scene => !scene.aliasOf).map(scene => compactScript(exportTranslationScript(
      scene,
      category,
      previousScripts.has(scene.sceneId)
        ? {
          schemaVersion: TRANSLATION_BUNDLE_SCHEMA_VERSION,
          adapterId: extractedBank.adapterId,
          sourceSha256: extractedBank.sourceSha256,
          targetLanguage: 'zh-Hant',
          ...previousScripts.get(scene.sceneId),
        }
        : null,
    ))),
  };
}

function hydrateBundleScript(bundle, script) {
  if (script?.schemaVersion === 1 || script?.adapterId) return script;
  return {
    schemaVersion: bundle.schemaVersion,
    adapterId: bundle.adapterId,
    sourceSha256: bundle.sourceSha256,
    sceneId: script?.sceneId,
    sceneSha256: script?.sceneSha256,
    targetLanguage: bundle.targetLanguage,
    ...(script?.layout ? { layout: script.layout } : {}),
    entries: script?.entries,
  };
}

function validateTranslationBundleMetadata(extracted, bundle, idKey, idValue) {
  if (![1, TRANSLATION_BUNDLE_SCHEMA_VERSION].includes(bundle?.schemaVersion)
      || bundle.adapterId !== extracted.adapterId
      || bundle.sourceSha256 !== extracted.sourceSha256
      || bundle[idKey] !== idValue
      || bundle.targetLanguage !== 'zh-Hant') {
    fail('Translation bundle metadata does not match the extracted source');
  }
}

function validateBundleAliases(actualAliases, expectedAliases, idKey) {
  const actual = new Map((actualAliases ?? []).map(alias => [alias[idKey], alias.aliasOf]));
  const expected = new Map(expectedAliases.map(alias => [alias[idKey], alias.aliasOf]));
  if (actual.size !== expected.size
      || [...expected].some(([id, aliasOf]) => actual.get(id) !== aliasOf)) {
    fail('Translation bundle aliases do not match the extracted source');
  }
}

export function validateCloudTranslations(extractedClouds, bundle, requireComplete = true) {
  validateTranslationBundleMetadata(extractedClouds, bundle, 'cloudTableId', extractedClouds.cloudTableId);
  if (!Array.isArray(bundle.scripts)) fail('Cloud translation scripts are invalid');
  const expectedMessages = extractedClouds.messages.filter(message => (
    !message.aliasOf && message.messageType === 'render'
  ));
  const expectedById = new Map(expectedMessages.map(message => [message.sceneId, message]));
  const scriptIds = new Set();
  for (const script of bundle.scripts) {
    if (!script?.sceneId || scriptIds.has(script.sceneId)) {
      fail(`Duplicate or empty cloud translation script ${script?.sceneId ?? '<empty>'}`);
    }
    scriptIds.add(script.sceneId);
    const message = expectedById.get(script.sceneId);
    if (!message) fail(`Cloud translation script ${script.sceneId} does not exist`);
    const entries = validateTranslationScript(
      message,
      hydrateBundleScript(bundle, script),
      requireComplete,
    );
    if ([...entries.values()].some(entry => entry.category !== 'battleMessage')) {
      fail(`Cloud translation script ${script.sceneId} contains a non-battle message entry`);
    }
  }
  if (scriptIds.size !== expectedMessages.length) fail('Cloud translation script count does not match the source');
  const expectedAliases = extractedClouds.messages.filter(message => message.aliasOf).map(message => ({
    messageId: message.sceneId,
    aliasOf: message.aliasOf,
  }));
  validateBundleAliases(bundle.aliases, expectedAliases, 'messageId');
  const expectedOpaque = extractedClouds.messages
    .filter(message => !message.aliasOf && message.messageType === 'opaque')
    .map(message => message.sceneId);
  const actualOpaque = (bundle.opaqueMessages ?? []).map(message => (
    typeof message === 'string' ? message : message?.messageId
  ));
  if (actualOpaque.length !== expectedOpaque.length
      || actualOpaque.some((id, index) => id !== expectedOpaque[index])) {
    fail('Cloud opaque message inventory does not match the source');
  }
  return true;
}

export function validateSceneBankTranslations(extractedBank, bundle, requireComplete = true) {
  validateTranslationBundleMetadata(extractedBank, bundle, 'pointerTableId', extractedBank.pointerTableId);
  if (!Array.isArray(bundle.scripts)) fail('Scene-bank translation scripts are invalid');
  const expectedScenes = extractedBank.scenes.filter(scene => !scene.aliasOf);
  const expectedById = new Map(expectedScenes.map(scene => [scene.sceneId, scene]));
  const scriptIds = new Set();
  for (const script of bundle.scripts) {
    if (!script?.sceneId || scriptIds.has(script.sceneId)) {
      fail(`Duplicate or empty scene-bank translation script ${script?.sceneId ?? '<empty>'}`);
    }
    scriptIds.add(script.sceneId);
    const scene = expectedById.get(script.sceneId);
    if (!scene) fail(`Scene-bank translation script ${script.sceneId} does not exist`);
    validateTranslationScript(scene, hydrateBundleScript(bundle, script), requireComplete);
  }
  if (scriptIds.size !== expectedScenes.length) {
    fail('Scene-bank translation script count does not match the source');
  }
  const expectedAliases = extractedBank.scenes.filter(scene => scene.aliasOf).map(scene => ({
    sceneId: scene.sceneId,
    aliasOf: scene.aliasOf,
  }));
  validateBundleAliases(bundle.aliases, expectedAliases, 'sceneId');
  return true;
}

export function migrateCloudTranslations(extractedClouds, bundle) {
  validateCloudTranslations(extractedClouds, bundle, false);
  return exportCloudTranslations(extractedClouds, bundle);
}

export function migrateSceneBankTranslations(extractedBank, bundle) {
  validateSceneBankTranslations(extractedBank, bundle, false);
  return exportSceneBankTranslations(extractedBank, 'dialogue', bundle);
}

export function rebuildOpeningScene(romBytes, adapter, extracted) {
  const rom = Buffer.from(romBytes);
  const { scene, fileStart, fileEnd } = readSceneBounds(rom, adapter);
  if (extracted.adapterId !== adapter.adapterId || extracted.sceneId !== scene.id) {
    fail('Extracted scene belongs to a different adapter or scene');
  }
  if (extracted.rawBytes.length !== scene.encodedLength
      || extracted.rawBytes.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
    fail(`Scene ${scene.id} has invalid encoded bytes`);
  }
  const encoded = Buffer.from(extracted.rawBytes);
  if (sha256(encoded) !== extracted.sceneSha256 || extracted.sceneSha256 !== scene.sha256) {
    fail(`Scene ${scene.id} extracted data checksum mismatch`);
  }
  encoded.copy(rom, fileStart, 0, fileEnd - fileStart);
  return rom;
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    if (!rest[index]?.startsWith('--') || rest[index + 1] === undefined) fail('Invalid arguments');
    options[rest[index].slice(2)] = rest[index + 1];
  }
  return { command, options };
}

export async function main(argv = process.argv.slice(2)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const adapter = readJsonc(path.join(root, 'game-profiles/captain-tsubasa-2-jp/adapter.jsonc'));
  const table = parseTable(fs.readFileSync(
    path.join(root, 'game-profiles/captain-tsubasa-2-jp/text.tbl'),
    'utf8',
  ));
  const { command, options } = parseArguments(argv);
  const romPath = options.rom ?? path.join(root, 'roms/Captain Tsubasa II - Super Striker (Japan).nes');
  const rom = await readSourceRom(romPath);
  const extracted = extractOpeningScene(rom, adapter, table);
  if (command === 'extract-dictionary' || command === 'export-dictionary-script') {
    if (!options.output) fail('Missing --output');
    const dictionary = extractFixedBankDictionary(
      rom,
      adapter,
      options.dictionary ?? 'fixed-bank-words',
      table,
    );
    const previousBundle = command === 'export-dictionary-script' && fs.existsSync(options.output)
      ? JSON.parse(fs.readFileSync(options.output, 'utf8'))
      : null;
    const output = command === 'extract-dictionary'
      ? dictionary
      : exportDictionaryTranslations(dictionary, previousBundle);
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`${command === 'extract-dictionary' ? 'Extracted' : 'Exported'} ${dictionary.metrics.entryCount} dictionary entries, ${dictionary.metrics.fixedRecordCount} fixed records`);
    return;
  }
  if (command === 'extract-clouds' || command === 'export-cloud-script') {
    if (!options.output) fail('Missing --output');
    const clouds = extractCloudMessages(rom, adapter, options.table ?? 'battle-clouds', table);
    const previousBundle = command === 'export-cloud-script' && fs.existsSync(options.output)
      ? JSON.parse(fs.readFileSync(options.output, 'utf8'))
      : null;
    const output = command === 'extract-clouds'
      ? clouds
      : exportCloudTranslations(clouds, previousBundle);
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`${command === 'extract-clouds' ? 'Extracted' : 'Exported'} ${clouds.metrics.messageCount} cloud messages, ${clouds.metrics.textRuns} text runs, ${clouds.metrics.opaqueMessageCount} opaque`);
    return;
  }
  if (command === 'extract-bank' || command === 'export-bank-script') {
    if (!options.output) fail('Missing --output');
    const bank = extractSceneBank(rom, adapter, options.table ?? 'opening-cutscenes', table);
    const previousPath = options.previous ?? options.output;
    const previousBundle = command === 'export-bank-script' && fs.existsSync(previousPath)
      ? JSON.parse(fs.readFileSync(previousPath, 'utf8'))
      : null;
    const output = command === 'extract-bank'
      ? bank
      : exportSceneBankTranslations(bank, 'dialogue', previousBundle);
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`${command === 'extract-bank' ? 'Extracted' : 'Exported'} ${bank.metrics.sceneCount} scenes, ${bank.metrics.textRuns} text runs, ${bank.metrics.encodedBytes} bytes`);
    return;
  }
  if (command === 'extract') {
    if (!options.output) fail('Missing --output');
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${JSON.stringify(extracted, null, 2)}\n`);
    console.log(`Extracted ${extracted.sceneId}: ${extracted.rawBytes.length} bytes`);
    return;
  }
  if (command === 'export-script') {
    if (!options.output) fail('Missing --output');
    const previousScript = fs.existsSync(options.output)
      ? JSON.parse(fs.readFileSync(options.output, 'utf8'))
      : null;
    const script = exportTranslationScript(extracted, 'dialogue', previousScript);
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${JSON.stringify(script, null, 2)}\n`);
    console.log(`Exported ${script.entries.length} text entries from ${extracted.sceneId}`);
    return;
  }
  if (command === 'validate-bundle' || command === 'migrate-bundle') {
    if (!options.input) fail('Missing --input');
    const bundle = JSON.parse(fs.readFileSync(options.input, 'utf8'));
    const requireComplete = options['require-complete'] === 'true';
    let output = bundle;
    let description;
    if (bundle.dictionaryId) {
      const dictionary = extractFixedBankDictionary(
        rom,
        adapter,
        bundle.dictionaryId,
        table,
      );
      if (command === 'migrate-bundle') {
        output = migrateDictionaryTranslations(dictionary, bundle);
      } else {
        validateDictionaryTranslations(dictionary, bundle, requireComplete);
      }
      description = `${bundle.dictionaryId} dictionary`;
    } else if (bundle.cloudTableId) {
      const clouds = extractCloudMessages(rom, adapter, bundle.cloudTableId, table);
      if (command === 'migrate-bundle') {
        output = migrateCloudTranslations(clouds, bundle);
      } else {
        validateCloudTranslations(clouds, bundle, requireComplete);
      }
      description = `${bundle.cloudTableId} cloud messages`;
    } else if (bundle.pointerTableId) {
      const bank = extractSceneBank(rom, adapter, bundle.pointerTableId, table);
      if (command === 'migrate-bundle') {
        output = migrateSceneBankTranslations(bank, bundle);
      } else {
        validateSceneBankTranslations(bank, bundle, requireComplete);
      }
      description = `${bundle.pointerTableId} scene bank`;
    } else if (bundle.sceneId) {
      if (command === 'migrate-bundle') {
        output = migrateTranslationScript(extracted, bundle);
      } else {
        validateTranslationScript(extracted, bundle, requireComplete);
      }
      description = `${bundle.sceneId} scene`;
    } else {
      fail('Unable to identify translation bundle domain');
    }
    if (command === 'migrate-bundle') {
      if (!options.output) fail('Missing --output');
      fs.mkdirSync(path.dirname(options.output), { recursive: true });
      fs.writeFileSync(options.output, `${JSON.stringify(output, null, 2)}\n`);
      console.log(`Migrated ${description} to compact schema ${output.schemaVersion}`);
    } else {
      console.log(`Validated ${description}`);
    }
    return;
  }
  if (command === 'compile-script') {
    if (!options.input || !options.output) fail('Missing --input or --output');
    const script = JSON.parse(fs.readFileSync(options.input, 'utf8'));
    const compiled = compileTranslationScene(extracted, script);
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${JSON.stringify(compiled, null, 2)}\n`);
    console.log(`Compiled ${compiled.sceneId}: ${compiled.usedLength}/${compiled.encodedLength} bytes, ${compiled.glyphs.length - 1} visible glyphs`);
    return;
  }
  if (command === 'compile-dictionary') {
    if (!options.input || !options.output) fail('Missing --input or --output');
    const dictionary = extractFixedBankDictionary(
      rom,
      adapter,
      options.dictionary ?? 'fixed-bank-words',
      table,
    );
    const bundle = JSON.parse(fs.readFileSync(options.input, 'utf8'));
    const customGlyphMap = options['glyph-map']
      ? JSON.parse(fs.readFileSync(options['glyph-map'], 'utf8'))
      : {};
    const codeByCharacter = createDictionaryCharacterCodeMap(table, customGlyphMap);
    const compiled = compileDictionaryTranslations(
      dictionary,
      bundle,
      codeByCharacter,
      getDictionarySourceGlyphCodes(table),
    );
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${JSON.stringify(compiled, null, 2)}\n`);
    console.log(`Compiled ${compiled.records.length} dictionary records, ${compiled.overlays.length} PRG overlays, ${compiled.glyphs.length} glyphs`);
    return;
  }
  if (command === 'verify-roundtrip') {
    const rebuilt = rebuildOpeningScene(rom, adapter, extracted);
    if (!rebuilt.equals(rom)) fail('Opening scene round-trip changed the ROM');
    console.log(`Verified byte-identical round-trip: ${extracted.sceneId} (${sha256(rebuilt)})`);
    return;
  }
  fail('Usage: captain-tsubasa-2-adapter <extract|extract-bank|extract-dictionary|extract-clouds|export-script|export-bank-script|export-dictionary-script|export-cloud-script|validate-bundle|migrate-bundle|compile-script|compile-dictionary|verify-roundtrip> [--rom file] [--table id] [--previous file] [--dictionary id] [--glyph-map file] [--input file] [--output file] [--require-complete true|false]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}