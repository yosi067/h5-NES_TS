import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonc } from './game-profile.mjs';
import { buildDefaultCT2Menus } from './ct2-menu-extract.mjs';
import {
  parseTable, extractSceneBank, extractCloudMessages, extractFixedBankDictionary,
  validateSceneBankTranslations, validateCloudTranslations, validateDictionaryTranslations,
} from './captain-tsubasa-2-adapter.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

/** Build-time-only ROM parser. The editable file contains no offsets or opcodes. */
export function buildLocalization(rom, adapter, table, bundles, opening) {
  const entries = [];
  const runs = [];
  const scenes = [];
  const ids = new Set();
  const add = (id, source, previous, category) => {
    if (ids.has(id)) throw new Error(`Duplicate localization ID ${id}`);
    ids.add(id);
    entries.push({ id, category: previous?.category ?? category, source,
      translation: previous?.translation ?? '', ...(previous?.notes ? { notes: previous.notes } : {}) });
  };
  let sourceSha256;
  for (const pointerTable of adapter.scriptModel.pointerTables) {
    const extracted = extractSceneBank(rom, adapter, pointerTable.id, table);
    sourceSha256 = extracted.sourceSha256;
    const bundle = bundles[pointerTable.id];
    validateSceneBankTranslations(extracted, bundle, false);
    const edits = new Map(bundle.scripts.flatMap(script => script.entries.map(entry => [entry.id, entry])));
    for (const entry of opening.entries) edits.set(entry.id, entry);
    for (const scene of extracted.scenes.filter(scene => !scene.aliasOf)) {
      scenes.push({ id: scene.sceneId, start: scene.location.physicalPrgOffset, length: scene.location.encodedLength });
      let line = 0;
      for (const instruction of scene.instructions) {
        if (instruction.kind === 'text') {
          const id = `${scene.sceneId}.text.${instruction.offset.toString(16).padStart(4, '0')}`;
          add(id, instruction.text, edits.get(id), 'dialogue');
          runs.push({ id, scene: scene.sceneId, line: `${scene.sceneId}.line.${line}`,
            offset: scene.location.physicalPrgOffset + instruction.offset, bytes: instruction.bytes });
        } else if (instruction.kind === 'control' && [0xea, 0xeb, 0xee, 0xf0, 0xf1, 0xfc, 0xfd, 0xff].includes(instruction.opcode)) {
          line++;
        }
      }
    }
  }
  const clouds = extractCloudMessages(rom, adapter, 'battle-clouds', table);
  // $FC dispatches to $85D6. On the next-row path, $85EF/$85F2
  // advances $05E5 over one byte without emitting a glyph. Keep legacy
  // exchange IDs/source intact; narrow only these independently reviewed
  // runtime spans. Do not apply a blanket grammar rewrite to other branches.
  const cloudPrefixBytes = new Map([
    ['battle-clouds.14.text.0010', 0x01],
    ['battle-clouds.58.text.0004', 0x08],
    ['battle-clouds.75.text.0004', 0x08],
  ]);
  const prgStart = 16 + ((rom[6] & 4) ? 512 : 0);
  if (rom.subarray(prgStart + 0x305ef, prgStart + 0x305f5).toString('hex') !== 'ace505eee505') {
    throw new Error('Battle FC cursor-advance signature mismatch');
  }
  validateCloudTranslations(clouds, bundles['battle-clouds'], false);
  const cloudEdits = new Map(bundles['battle-clouds'].scripts.flatMap(script => script.entries.map(entry => [entry.id, entry])));
  for (const scene of clouds.messages.filter(scene => !scene.aliasOf && scene.messageType === 'render')) {
    for (const instruction of scene.instructions.filter(instruction => instruction.kind === 'text')) {
      const id = `${scene.sceneId}.text.${instruction.offset.toString(16).padStart(4, '0')}`;
      add(id, instruction.text, cloudEdits.get(id), 'battleMessage');
      const offset = scene.location.physicalPrgOffset + instruction.offset;
      const skip = cloudPrefixBytes.has(id) ? 1 : 0;
      if (skip && (rom[prgStart + offset - 1] !== 0xfc || instruction.bytes[0] !== cloudPrefixBytes.get(id))) {
        throw new Error(`Battle FC prefix mismatch: ${id}`);
      }
      runs.push({ id, scene: scene.sceneId, line: id, domain: 'battle',
        offset: offset + skip, bytes: instruction.bytes.slice(skip) });
    }
  }
  const dictionary = extractFixedBankDictionary(rom, adapter, 'fixed-bank-words', table);
  validateDictionaryTranslations(dictionary, bundles['fixed-bank-words'], false);
  const wordEdits = new Map(bundles['fixed-bank-words'].entries.map(entry => [entry.id, entry]));
  for (const record of dictionary.records.filter(record => !record.aliasOf && record.recordType === 'text')) {
    add(record.id, record.instructions.filter(i => i.kind === 'text').map(i => i.text).join(''), wordEdits.get(record.id), 'dictionary');
    runs.push({ id: record.id, scene: record.id, line: record.id, domain: 'battle',
      offset: record.location.physicalPrgOffset, bytes: record.rawBytes.slice(0, -1) });
  }
  const trainer = rom[6] & 4 ? 512 : 0;
  const chr = rom.subarray(16 + trainer + rom[4] * 16384);
  const fontAliases = Array.from({ length: 256 }, (_, tile) => {
    const glyph = chr.subarray(tile * 16, tile * 16 + 16);
    const offsets = [];
    for (let offset = 0; offset + 16 <= chr.length; offset += 16) {
      if (chr.subarray(offset, offset + 16).equals(glyph)) offsets.push(offset);
    }
    return offsets;
  });
  return {
    catalog: { format: 'nes-localization', version: 1, gameId: adapter.adapterId,
      sourceSha256, locale: 'zh-Hant', entries, values: [] },
    runtime: { version: 1, sourceSha256, sourceHashes: adapter.sourceRoms.map(r => r.sha256),
      scenes, runs, fontAliases, lowerTiles: [...rom.subarray(16 + trainer + 0x8a14 - 0x8000, 16 + trainer + 0x8a14 - 0x8000 + 256)],
      coverage: { extracted: entries.length, displayEnabledDomains: ['cutscene', 'battle-complete-occurrences'],
        battleWriter: 'complete-source-occurrences; verified-name-honorifics; three-reviewed-FC-prefix-spans; other-incomplete-fragments-remain-native',
        dictionaryWriter: 'ROM-word-substitutions-and-menu-mark-pass; original-Drive-Shot-route-verified; RAM-names-remain-native',
        statsVerified: false, fullyLocalized: false, linguisticReview: 'draft' } },
  };
}

export function buildDefaultLocalization() {
  const base = 'game-profiles/captain-tsubasa-2-jp';
  const adapter = readJsonc(path.join(root, base, 'adapter.jsonc'));
  const table = parseTable(fs.readFileSync(path.join(root, base, 'text.tbl'), 'utf8'));
  // Verified directly against the original CHR atlas; keep legacy IR hashes intact.
  for (const [code, text] of parseTable(fs.readFileSync(path.join(root, base, 'localization-extra.tbl'), 'utf8'))) table.set(code, text);
  const bundles = Object.fromEntries(['opening-cutscenes', 'cutscenes-bank-04', 'cutscenes-bank-05', 'battle-clouds', 'fixed-bank-words']
    .map(id => [id, read(`${base}/translations/${id}.zh-Hant.json`)]));
  const rom = fs.readFileSync(path.join(root, 'roms/Captain Tsubasa II - Super Striker (Japan).nes'));
  const result = buildLocalization(rom, adapter, table, bundles, read(`${base}/translations/opening.intro.00.zh-Hant.json`));
  const byId = new Map(result.catalog.entries.map(entry => [entry.id, entry]));
  const updated = new Set();
  for (const name of ['enhanced-bank-03', 'enhanced-bank-04', 'enhanced-bank-05', 'enhanced-battle-dictionary']) {
    const draft = read(`${base}/translations/${name}.json`);
    if (draft.sourceSha256 !== result.catalog.sourceSha256) throw new Error(`Stale translation ${name}`);
    for (const entry of draft.entries) {
      const original = byId.get(entry.id);
      if (!original || original.source !== entry.source || updated.has(entry.id)
          || typeof entry.translation !== 'string') throw new Error(`Invalid translation ${entry.id}`);
      original.translation = entry.translation;
      updated.add(entry.id);
    }
  }
  if (updated.size !== result.catalog.entries.length) throw new Error('Enhanced draft inventory is incomplete');
  const retained = result.catalog.entries.filter(entry => entry.source === entry.translation && /^[ぁ-ゖァ-ヺー]+$/u.test(entry.source));
  for (const entry of retained) {
    entry.notes = [entry.notes, '保留原文：獨立假名／字形片段，需確認上下文與組合方式，不視為已完成中文翻譯。'].filter(Boolean).join('\n');
  }
  result.runtime.coverage.retainedKanaEntries = retained.length;
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildDefaultLocalization();
  const directory = path.join(root, 'public/game-profiles/captain-tsubasa-2-jp');
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, data] of [['localization', result.catalog], ['text-runtime', result.runtime]]) {
    fs.writeFileSync(path.join(directory, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
  }
  const menus = buildDefaultCT2Menus();
  fs.writeFileSync(path.join(directory, 'menus.json'), `${JSON.stringify(menus)}\n`);
  console.log(`Extracted ${result.catalog.entries.length} editable strings; ${result.catalog.entries.filter(e => e.translation.trim()).length} draft-filled (${result.runtime.coverage.retainedKanaEntries} retained kana entries); ${menus.entries.length} menu definitions. Cutscene, verified menus and complete observed battle occurrences enabled; full battle composition remains unfinished. No ROM modified.`);
}