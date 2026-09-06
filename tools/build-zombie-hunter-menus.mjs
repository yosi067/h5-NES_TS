import fs from 'node:fs';
import crypto from 'node:crypto';
import { validateCellMenus } from '../src/game-profiles/verified-cell-menus.ts';
import { submenuDefinitions, submenuRoutes, actionRoutes } from './zombie-submenu-routes.mjs';
import { decodeNameSource } from './zombie-name-source.mjs';
const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root));
const hash = '91dfb1a0c29f78c5d5b0a582c737c62103c4009ad5e2c20fdecd0c22a8648a48';
const rom = read('roms/Zombie Hunter (Japan).nes');
if (crypto.createHash('sha256').update(rom).digest('hex') !== hash) throw Error('ROM mismatch');
const prg = rom.subarray(16, 16 + rom[4] * 16384);
// Narrow menu readings authored in the initial investigation; byte identities
// rechecked against structured original-ROM fetch evidence, never image/OCR.
// Rows refer to physical nametable cells, NOT assumed screen coordinates.
const definitions = [
  ['title.start', 'PUSH START BOTTON', '按 START 開始', 200, 21, 7, [[25,30,28,17,36,28,29,10,27,29,36,11,24,29,29,24,23]], 'title'],
  ['menu.items', 'もちもの', '道具', 450, 19, 16, [[36,36,36,36],[98,80,98,88]], 'pause'],
  ['menu.weapons', 'ぶき', '武器', 450, 21, 16, [[115,36,36,36],[91,70,36,36]], 'pause'],
  ['menu.equipment', 'そうび', '裝備', 450, 23, 16, [[36,36,115,36],[78,66,90,36]], 'pause'],
  ['menu.status', 'つよさ', '能力', 450, 25, 16, [[36,36,36,36],[81,101,74,36]], 'pause'],
  ['hud.power', 'POW', '體力', 450, 17, 2, [[25,24,32]], 'hud'],
  ['hud.experience', 'EXP', '經驗', 450, 19, 2, [[14,33,25]], 'hud'],
  ['hud.gold', 'GLD', '金錢', 450, 21, 2, [[16,21,13]], 'hud'],
  ...submenuDefinitions.map(([id, source, translation, route, row, column, tiles]) =>
    [id, source, translation, `submenu-${route}`, row, column, tiles, route]),
];
const entries = definitions.map(([id, source, translation, frame, row, column, tiles, group]) => {
  const evidencePath = typeof frame === 'number' ? `artifacts/zombie-menu-${frame}.json` : `artifacts/zombie-${frame}.json`;
  const evidence = JSON.parse(read(evidencePath));
  const expectedFrame = typeof frame === 'number' ? frame : [...submenuRoutes, ...actionRoutes].find(r => `submenu-${r.id}` === frame)?.frame;
  if (evidence.sourceSha256 !== hash || evidence.frame !== expectedFrame || evidence.metadata.length !== 8192) throw Error('Unidentified frame evidence');
  const { metadata } = evidence;
  const cells = tiles.flatMap((line, y) => line.map((tile, x) => {
    const cell = (row + y) * 32 + column + x;
    if ((metadata[cell * 4] & 255) !== tile || !metadata[cell * 4 + 1]) throw Error(`Evidence mismatch: ${id}`);
    return { cell, tile, chr: metadata[cell * 4 + 1] - 1 };
  }));
  const body = Buffer.from(tiles.at(-1));
  const prgCandidates = [];
  for (let at = prg.indexOf(body); at !== -1; at = prg.indexOf(body, at + 1)) prgCandidates.push(at);
  return { id, source, translation, group, width: tiles[0].length, height: tiles.length,
    cells, evidence: { frame: evidence.frame, artifact: evidencePath, route: evidence.events,
      status: 'original-frame-chr-verified', prgCandidates,
      note: 'PRG byte matches are candidates, not proven writer provenance; matching uses physical fetched CHR.' } };
});
const nameEvidence = JSON.parse(read('artifacts/zombie-name-source-runtime.json'));
if (nameEvidence.sourceSha256 !== hash) throw Error('Wrong name evidence ROM');
const names = decodeNameSource(rom).map(name => {
  const verified = nameEvidence.names.find(n => n.selector === name.selector);
  if (!verified || JSON.stringify(verified.tiles) !== JSON.stringify(name.tiles) || !verified.runtime.positions.length
    || !verified.runtime.positions.every(p => p.cells.every(c => c.chr === 0x7000+c.tile*16))) throw Error(`Unverified name ${name.selector}`);
  return {...name, evidence: {...name.evidence, runtimeArtifact:'artifacts/zombie-name-source-runtime.json',
    runtimeKind:verified.runtime.kind, verifiedPositions:verified.runtime.positions.map(({action,frame,row,col})=>({action,frame,row,col}))}};
});
const catalog = { schemaVersion: 1, format: 'nes-verified-cell-menus', id: 'zombie-hunter-jp',
  sourceSha256: hash, locale: 'zh-Hant', status: 'partial-menu-localization', entries, names };
// Keep authored translations when regenerating evidence. Never silently reset
// user edits to the defaults embedded above or remap them onto changed cells.
const authoring = new URL('game-profiles/zombie-hunter-jp/menus.zh-Hant.json', root);
if (fs.existsSync(authoring)) {
  const previous = JSON.parse(fs.readFileSync(authoring, 'utf8'));
  validateCellMenus(previous);
  for (const old of previous.entries) {
    const entry = entries.find(e => e.id === old.id);
    if (!entry || JSON.stringify(entry.cells) !== JSON.stringify(old.cells)) throw Error(`Source changed for ${old.id}; review before rebuilding`);
    // Preserve all authored fields and prior source evidence, not only text.
    Object.assign(entry, old);
  }
  for (const old of previous.names ?? []) {
    const name = names.find(n => n.selector === old.selector);
    if (!name || JSON.stringify(name.tiles) !== JSON.stringify(old.tiles)) throw Error(`Name source changed: ${old.selector}`);
    Object.assign(name, old);
  }
}
validateCellMenus(catalog);
for (const p of ['game-profiles/zombie-hunter-jp/menus.zh-Hant.json', 'public/game-profiles/zombie-hunter-jp/menus.json']) {
  fs.mkdirSync(new URL('.', new URL(p, root)), { recursive: true });
  fs.writeFileSync(new URL(p, root), JSON.stringify(catalog, null, 2) + '\n');
}
console.log(`Verified ${entries.length} menu/HUD positions and ${names.length} source-table names`);