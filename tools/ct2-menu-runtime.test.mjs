// Run with Node's native TypeScript stripping: node --test tools/ct2-menu-runtime.test.mjs
// Original ROM + current generated WASM only. This is bounded traversal evidence,
// NOT complete menu coverage, renderer validation, OCR, or a translated-ROM test.
// Match complete raw background fetches, just like the renderer. Public winning
// provenance may have front-sprite holes; restoring those pixels is renderer work.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { initSync, EmuWasm } from '../src/wasm/nes_wasm.js';
import { locateMenuTranslations } from '../src/game-profiles/menu-localization.ts';
import { buildDefaultCT2Menus, originalPrg, menuGlyphTiles } from './ct2-menu-extract.mjs';
import { parseTable } from './captain-tsubasa-2-adapter.mjs';

const read = path => fs.readFileSync(new URL(path, import.meta.url));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hex = (value, width = 4) => value.toString(16).padStart(width, '0');
const WIDTH = 256, HEIGHT = 240, INVALID = 0xffffffff;
const wasm = read('../src/wasm/nes_wasm_bg.wasm');
initSync({ module: wasm });
const rom = read('../roms/Captain Tsubasa II - Super Striker (Japan).nes');
const original = Buffer.from(rom);
const { chr } = originalPrg(rom);
const assets = buildDefaultCT2Menus();
const entries = new Map(assets.entries.map(entry => [entry.id, entry]));
const identities = new Map(assets.specialMenus.chrIdentities.map(identity => [identity.id, identity]));
const table = parseTable(read('../game-profiles/captain-tsubasa-2-jp/text.tbl').toString('utf8'));
for (const [byte, text] of parseTable(read('../game-profiles/captain-tsubasa-2-jp/localization-extra.tbl').toString('utf8'))) {
  table.set(byte, text);
}
const glyphs = new Map();
for (const [byte, text] of table) {
  if (byte >= 0xe0 || text.startsWith('{')) continue;
  const [body, mark] = menuGlyphTiles(byte);
  const key = `${body}:${mark}`;
  const choices = glyphs.get(key) ?? [];
  choices.push({ byte, text }); glyphs.set(key, choices);
}

function valid(metadata, cell) {
  if (cell < 0 || cell * 4 + 3 >= metadata.length) return false;
  const [packed, physical, bg, fg] = metadata.subarray(cell * 4, cell * 4 + 4);
  return packed !== INVALID && packed >>> 8 > 0 && physical > 0 && physical !== INVALID
    && (physical - 1) % 16 === 0 && bg > 0 && bg <= 0x1000000 && fg <= 0x1000000;
}

function wholeCell(provenance, cell, x, y) {
  if (x < 0 || y < 0 || x + 8 > WIDTH || y + 8 > HEIGHT) return false;
  for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++) {
    if (provenance[(y + dy) * WIDTH + x + dx] !== ((cell + 1) | (dy << 12))) return false;
  }
  return true;
}

function positionsFor(provenance) {
  const positions = new Map();
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH;) {
    const start = x, tag = provenance[y * WIDTH + x++];
    while (x < WIDTH && provenance[y * WIDTH + x] === tag) x++;
    if (tag > 0 && tag <= 2048 && x - start === 8 && wholeCell(provenance, tag - 1, start, y)) {
      positions.set(`${start}:${y}`, { cell: tag - 1, x: start, y });
    }
  }
  return positions;
}

// Verify physical ORIGINAL font bytes, including real ROM aliases, before
// interpreting a tile through the original glyph table. A tile number is not OCR.
function nativeFont(metadata, cell) {
  if (!valid(metadata, cell)) return false;
  const tile = metadata[cell * 4] & 255, physical = metadata[cell * 4 + 1] - 1;
  return physical + 16 <= chr.length
    && chr.subarray(physical, physical + 16).equals(chr.subarray(tile * 16, tile * 16 + 16));
}

function evidenceCell(metadata, cell) {
  return { cell: hex(cell), tile: hex(metadata[cell * 4] & 255, 2),
    chr: hex(metadata[cell * 4 + 1] - 1, 5), generation: metadata[cell * 4] >>> 8 };
}

function decodedRows(provenance, metadata, replacements, partial = false) {
  const positions = positionsFor(provenance);
  const visiblePixels = new Uint16Array(2048);
  for (const tag of provenance) if ((tag & 0xfff) > 0 && (tag & 0xfff) <= 2048) visiblePixels[(tag & 0xfff) - 1]++;
  if (partial) {
    // Diagnostic nametable coordinates ONLY, not safe screen rectangles. A
    // partially sprite-covered cell can still have a verified fetched glyph.
    // Keep pages apart and never fill zero/ambiguous metadata from ROM guesses.
    positions.clear();
    for (let cell = 0; cell < 2048; cell++) if (visiblePixels[cell]) {
      const x = (cell & 31) * 8, y = (cell >>> 5) * 8;
      positions.set(`${x}:${y}`, { cell, x, y });
    }
  }
  const masked = new Set(replacements.flatMap(replacement => replacement.cells));
  const rows = new Map();
  for (const pos of positions.values()) {
    const { cell, x, y } = pos;
    const above = positions.get(`${x}:${y - 8}`);
    if (!above || above.cell !== cell - 32 || !nativeFont(metadata, cell) || !nativeFont(metadata, above.cell)) continue;
    const body = metadata[cell * 4] & 255, mark = metadata[above.cell * 4] & 255;
    const choices = glyphs.get(`${body}:${mark}`);
    if (!choices) continue;
    const readings = [...new Set(choices.map(choice => choice.text))];
    const text = readings.length === 1 ? readings[0] : `[${readings.join('|')}]`;
    const row = rows.get(y) ?? [];
    row.push({ x, text, masked: masked.has(cell), pixels: [visiblePixels[cell], visiblePixels[above.cell]],
      bytes: choices.map(choice => hex(choice.byte, 2)),
      body: evidenceCell(metadata, cell), mark: evidenceCell(metadata, above.cell) });
    rows.set(y, row);
  }
  const result = [];
  for (const [y, cells] of rows) {
    cells.sort((a, b) => a.x - b.x);
    // Split at missing/unverified cells. Never silently bridge a sprite hole,
    // an unrelated CHR bank, or an undecodable tile into an invented sentence.
    const segments = [];
    for (const cell of cells) {
      const last = segments.at(-1);
      if (last && last.at(-1).x + 8 === cell.x) last.push(cell);
      else segments.push([cell]);
    }
    for (const segment of segments) {
      while (segment[0]?.text === ' ') segment.shift();
      while (segment.at(-1)?.text === ' ') segment.pop();
      if (!segment.length) continue;
      const source = segment.map(cell => cell.text).join('');
      if (!/[ぁ-ヿ]/u.test(source) || !segment.some(cell => !cell.masked && /[ぁ-ヿ]/u.test(cell.text))) continue;
      const unmasked = [];
      for (const cell of segment) {
        if (cell.masked) continue;
        const last = unmasked.at(-1);
        if (last && last.at(-1).x + 8 === cell.x) last.push(cell);
        else unmasked.push([cell]);
      }
      result.push({ y, coordinates: partial ? 'physical-nametable; partial cells are NOT safe masks' : 'screen; whole cells',
        source, untranslatedSpans: unmasked.map(span => {
        const source = span.map(cell => cell.text).join('').trim();
        const exact = assets.entries.filter(entry => entry.source === source);
        return { source, catalog: exact.map(({ id, translation }) => ({ id, translation })),
          status: exact.length ? 'catalogued-but-not-masked' : 'no-exact-menu-source; may-be-dynamic-or-script' };
      }).filter(span => /[ぁ-ヿ]/u.test(span.source)), cells: segment });
    }
  }
  return result;
}

function verifyReplacement(replacement, provenance, metadata) {
  const entry = entries.get(replacement.id);
  assert.ok(entry, `unknown replacement ${replacement.id}`);
  const rows = entry.tileRows ?? [{ tiles: entry.markTiles }, { tiles: entry.bodyTiles }];
  const originalWidth = rows[0].tiles.length, width = replacement.width / 8;
  assert.ok(Number.isInteger(width) && width > 0 && width <= originalWidth);
  if (width !== originalWidth) {
    assert.equal(entry.encoding, 'ct2-menu-glyph');
    assert.equal(entry.dynamicRecord, true);
    assert.equal(entry.offset, entry.recordOffset, 'dynamic prefix must have a known writer placement');
    assert.equal(rows.length, 2);
    assert.ok(rows.some(row => row.tiles[width - 1] !== 0), 'crop is exactly the text prefix');
    assert.ok(rows.every(row => row.tiles.slice(width).every(tile => tile === 0)), 'only original blank padding may be omitted');
    assert.ok(assets.layouts.some(layout => layout.placements.some(p => p.recordOffset === entry.recordOffset
      && p.column + originalWidth <= layout.width
      && (replacement.cells[0] & 0x3ff) === (layout.target & 0x3ff) + (p.row - 1) * 32 + p.column)),
    'numeric field uses an actual original layout placement');
    let digits = 0;
    for (let x = width; x < originalWidth; x++) for (let y = 0; y < 2; y++) {
      const cell = replacement.cells[0] + y * 32 + x, tile = metadata[cell * 4] & 255;
      assert.ok(wholeCell(provenance, cell, replacement.x + x * 8, replacement.y + y * 8));
      assert.ok(nativeFont(metadata, cell), 'numeric suffix must be original font bytes');
      assert.equal(metadata[cell * 4 + 2], metadata[replacement.cells[0] * 4 + 2]);
      if (y === 1 && tile >= 0x33 && tile <= 0x3c) digits++;
      else assert.equal(tile, 0, 'numeric suffix must contain only digits and blank marks/gaps');
      assert.ok(!replacement.cells.includes(cell), 'dynamic value must not be masked');
    }
    assert.ok(digits > 0, 'must actually observe numeric overwrite, not merely relax padding');
  }
  assert.equal(replacement.height, rows.length * 8);
  assert.equal(replacement.cells.length, width * rows.length);
  replacement.cells.forEach((cell, index) => {
    const y = Math.floor(index / width), x = index % width;
    const row = rows[y], tile = row.tiles[x];
    assert.equal(cell, replacement.cells[0] + y * 32 + x, `${entry.id}: mask geometry`);
    assert.ok(wholeCell(provenance, cell, replacement.x + x * 8, replacement.y + y * 8), `${entry.id}: actual 64-pixel mask`);
    assert.ok(valid(metadata, cell), `${entry.id}: fetched metadata`);
    assert.equal(metadata[cell * 4] & 255, tile, `${entry.id}: source character tile`);
    const physical = metadata[cell * 4 + 1] - 1;
    const identity = row.chrIdentities ? identities.get(row.chrIdentities[x])
      : identities.get(`ct2-original-font:${hex(tile, 2)}`);
    const offsets = identity?.physicalOffsets ?? [assets.font.chrPhysicalBase + tile * 16];
    assert.ok(offsets.includes(physical), `${entry.id}: original CHR identity ${hex(physical)}`);
    const bytes = chr.subarray(physical, physical + 16);
    assert.equal(bytes.length, 16);
    assert.equal(hash(bytes), identity?.sha256 ?? assets.font.tileSha256[tile], `${entry.id}: original CHR bytes`);
  });
}

function titleProbe(provenance, metadata) {
  const pixels = new Uint16Array(2048);
  for (const tag of provenance) if ((tag & 0xfff) > 0 && (tag & 0xfff) <= 2048) pixels[(tag & 0xfff) - 1]++;
  return assets.entries.filter(entry => entry.id.startsWith('menu.title.')).map(entry => ({
    id: entry.id, source: entry.source,
    // Both physical pages, not an assumed mirroring mode. Raw words deliberately
    // retain zero/ambiguous values to explain why a visible label fails closed.
    pages: [0, 0x400].map(page => entry.tileRows[0].tiles.map((tile, x) => {
      const cell = page + (entry.target & 0x3ff) + x;
      return { cell: hex(cell), expectedTile: hex(tile, 2), words: [...metadata.slice(cell * 4, cell * 4 + 4)], pixels: pixels[cell] };
    })),
  }));
}

const keyFrames = new Set([600, 780, 810, 900, 930, 960, 1110, 1500, 3000, 6000, 9000,
  9480, 9600, 10500, 10980, 11010, 11030, 11050, 11070, 11190, 11220, 11400, 12000, 13500,
  13623, 13863, 13983, 15000]);
const commandTranslations = new Map([['ドリブル', '盤球'], ['パス', '傳球'], ['シュート', '射門']]);

function runRoute(name, endFrame, buttons, sampleFrames) {
  const core = new EmuWasm();
  const seen = new Map(), unknown = new Map(), snapshots = [], actionCommands = new Set();
  const actionMasks = new Map();
  const titleEvidence = [], alphabetOverlaps = new Map(), passwordInputOverlaps = new Map();
  const spriteHoleChecks = new Map(), actionWindows = new Map();
  let samples = 0, maskCells = 0, lastIds = '', alphabetFrames = 0, negativeChecks = 0;
  let winnerSpritePixels = 0, matchedWinnerSpritePixels = 0;
  let finalState;
  try {
    assert.equal(typeof core.getTextFrameMetadata, 'function', 'current generated WASM must expose getTextFrameMetadata');
    assert.equal(typeof core.getTextBackgroundProvenancePtr, 'function', 'current generated WASM must expose raw background provenance');
    assert.ok(core.loadRom(rom));
    assert.ok(core.enableTextObserver(true));
    for (let frame = 0; frame <= endFrame; frame++) {
      const { start = false, a = false, down = false, b = false, up = false, right = false, left = false } = buttons(frame);
      core.setButton(0, 3, start); core.setButton(0, 0, a); core.setButton(0, 5, down);
      core.setButton(0, 1, b); core.setButton(0, 4, up); core.setButton(0, 7, right);
      core.setButton(0, 6, left);
      core.frame();
      core.takeTextEvents(); // Drain the observer without synthesizing writer events.
      // Inspect every frame around the first action-window transition, not just
      // 30-frame snapshots that could miss a briefly displayed command.
      if (sampleFrames ? !sampleFrames.has(frame)
        : frame % 30 !== 0 && !keyFrames.has(frame) && !(frame >= 13200 && frame <= 13620)) continue;
      const metadata = core.getTextFrameMetadata();
      const fetched = core.getTextFetchedCells();
      const provenance = new Uint16Array(core.getWasmMemory().buffer, core.getTextBackgroundProvenancePtr(), WIDTH * HEIGHT).slice();
      const winning = new Uint16Array(core.getWasmMemory().buffer, core.getTextProvenancePtr(), WIDTH * HEIGHT).slice();
      for (let pixel = 0; pixel < provenance.length; pixel++) {
        assert.ok(winning[pixel] === 0 || winning[pixel] === provenance[pixel], 'winning background is a subset of actual raw background');
        if (provenance[pixel] && !winning[pixel]) winnerSpritePixels++;
      }
      assert.equal(metadata.length, 2048 * 4);
      const before = metadata.slice();
      const provenanceBefore = provenance.slice();
      const replacements = locateMenuTranslations(assets, provenance, metadata);
      assert.deepEqual(metadata, before, 'matcher must not change metadata');
      assert.deepEqual(provenance, provenanceBefore, 'matcher must not change provenance');
      samples++;
      // The same kana occur in the ability panel to the right. Commands must
      // appear in the actual action column below the observed どうする ? prompt.
      const prompt = replacements.find(r => entries.get(r.id).source === 'どうする ?');
      if (prompt) {
        for (const r of replacements) {
          const source = entries.get(r.id).source;
          if (!commandTranslations.has(source) || r.x !== prompt.x + 8 || r.y !== prompt.y + prompt.height) continue;
          // Catalog aliases are acceptable only for the correct translation AND
          // the whole action footprint, not a shorter token or right-hand stat.
          assert.equal(r.translation, commandTranslations.get(source));
          assert.equal(r.width, 40); assert.equal(r.height, 16);
          const origin = prompt.cells[0] + (prompt.height / 8) * 32 + 1;
          assert.deepEqual(r.cells, Array.from({ length: 10 }, (_, i) => origin + Math.floor(i / 5) * 32 + i % 5));
          actionCommands.add(r.id);
          if (!actionMasks.has(source)) actionMasks.set(source, { frame, source, ...r });
        }
        // Explain missing commands with fetched evidence, not assumed text or
        // invented masks. Record the two tile rows immediately below the prompt.
        const positions = positionsFor(provenance);
        const cells = [];
        for (let dy = 0; dy < 16; dy += 8) for (let dx = 0; dx < prompt.width; dx += 8) {
          const x = prompt.x + dx, y = prompt.y + prompt.height + dy;
          const pos = positions.get(`${x}:${y}`);
          cells.push({ x, y, wholeBackground: !!pos,
            nativeFont: !!pos && nativeFont(metadata, pos.cell),
            fetched: pos ? evidenceCell(metadata, pos.cell) : null });
        }
        const signature = JSON.stringify(cells.map(c => [c.x, c.y, c.wholeBackground, c.nativeFont, c.fetched?.tile, c.fetched?.chr]));
        const previous = actionWindows.get(signature);
        if (previous) { previous.last = frame; previous.samples++; }
        else actionWindows.set(signature, { first: frame, last: frame, samples: 1,
          prompt: [prompt.x, prompt.y, prompt.width, prompt.height], cells });
      }
      for (const replacement of replacements) {
        verifyReplacement(replacement, provenance, metadata);
        let spritePixel = -1;
        for (let y = replacement.y; y < replacement.y + replacement.height; y++) {
          for (let x = replacement.x; x < replacement.x + replacement.width; x++) {
            if (!winning[y * WIDTH + x]) { matchedWinnerSpritePixels++; spritePixel = y * WIDTH + x; }
          }
        }
        if (spritePixel >= 0 && !spriteHoleChecks.has(replacement.id)) {
          // A real winning-sprite hole is acceptable ONLY in public provenance.
          // The exact same hole in raw background must still reject this mask.
          const hole = provenance.slice();
          hole[spritePixel] = 0;
          assert.ok(!locateMenuTranslations(assets, hole, metadata).some(other => other.id === replacement.id
            && other.x === replacement.x && other.y === replacement.y), `${replacement.id}: raw background under winning sprite must remain complete`);
          spriteHoleChecks.set(replacement.id, { id: replacement.id, frame,
            pixel: [spritePixel % WIDTH, Math.floor(spritePixel / WIDTH)], rawTag: provenance[spritePixel], winningTag: winning[spritePixel] });
          negativeChecks++;
        }
        for (const cell of replacement.cells) assert.equal(metadata[cell * 4], fetched[cell], 'same completed fetched frame');
        maskCells += replacement.cells.length;
        const previous = seen.get(replacement.id);
        if (previous) { previous.last = frame; previous.samples++; }
        else {
          seen.set(replacement.id, { id: replacement.id, source: entries.get(replacement.id).source,
            translation: replacement.translation, first: frame, last: frame, samples: 1,
            rectangle: [replacement.x, replacement.y, replacement.width, replacement.height],
            fetched: replacement.cells.map(cell => evidenceCell(metadata, cell)) });
          // Negative controls on copies of this REAL frame: no fabricated fixture.
          const badChr = metadata.slice();
          badChr[replacement.cells[0] * 4 + 1] = INVALID;
          const same = other => other.id === replacement.id && other.x === replacement.x && other.y === replacement.y;
          assert.ok(!locateMenuTranslations(assets, provenance, badChr).some(same), `${replacement.id}: rejects ambiguous CHR`);
          const hole = provenance.slice();
          hole[replacement.y * WIDTH + replacement.x] = 0;
          assert.ok(!locateMenuTranslations(assets, hole, metadata).some(same), `${replacement.id}: rejects raw background mask hole`);
          const wrongFineY = provenance.slice();
          wrongFineY[(replacement.y + replacement.height - 1) * WIDTH + replacement.x + replacement.width - 1] ^= 0x1000;
          assert.ok(!locateMenuTranslations(assets, wrongFineY, metadata).some(same), `${replacement.id}: rejects wrong fine Y in last background pixel`);
          negativeChecks += 3;
        }
      }
      // Alphabet is intentionally NOT returned for translation. Independently
      // verify all native fetched tiles/CHR identities to prove branch entry.
      const alphabet = entries.get('menu.password.alphabet');
      const physicalPages = [0, 0x400];
      const visibleCells = new Set();
      for (const tag of provenance) if (tag & 0xfff) visibleCells.add((tag & 0xfff) - 1);
      const alphabetPage = physicalPages.find(page => alphabet.tileRows.every(row => row.tiles.every((tile, x) => {
        const cell = page + (row.target & 0x3ff) + x;
        return valid(metadata, cell) && (metadata[cell * 4] & 255) === tile
          && identities.get(row.chrIdentities[x]).physicalOffsets.includes(metadata[cell * 4 + 1] - 1)
          && visibleCells.has(cell);
      })));
      if (alphabetPage !== undefined) {
        alphabetFrames++;
        const cells = new Set(alphabet.tileRows.flatMap(row => row.tiles.map((_, x) => alphabetPage + (row.target & 0x3ff) + x)));
        for (const replacement of replacements) {
          if (replacement.id === 'menu.password.confirm' || !replacement.cells.some(cell => cells.has(cell))) continue;
          const key = `${replacement.id}:${replacement.cells[0]}`;
          if (!alphabetOverlaps.has(key)) alphabetOverlaps.set(key, { frame, ...replacement });
        }
        const slots = new Set(assets.specialMenus.passwordInput.slots.flatMap(slot =>
          [alphabetPage + (slot.target & 0x3ff), alphabetPage + (slot.markTarget & 0x3ff)]));
        for (const replacement of replacements) if (replacement.cells.some(cell => slots.has(cell))) {
          const key = `${replacement.id}:${replacement.cells[0]}`;
          if (!passwordInputOverlaps.has(key)) passwordInputOverlaps.set(key, { frame, ...replacement });
        }
      }
      assert.ok(!replacements.some(replacement => replacement.id === alphabet.id), 'password symbols must remain native');
      const ids = replacements.map(replacement => replacement.id).sort().join(',');
      if (ids !== lastIds || keyFrames.has(frame)) {
        snapshots.push({ frame, ids: replacements.map(replacement => replacement.id) });
        lastIds = ids;
      }
      if ([780, 900, 960].includes(frame)) titleEvidence.push({ frame, entries: titleProbe(provenance, metadata) });
      if (keyFrames.has(frame) || frame >= 12500) for (const row of [
        ...decodedRows(provenance, metadata, replacements),
        ...(frame >= 12500 ? decodedRows(provenance, metadata, replacements, true) : []),
      ]) {
        const key = JSON.stringify([row.coordinates, row.y, row.source, row.untranslatedSpans]);
        const previous = unknown.get(key);
        if (previous) previous.frames.push(frame);
        else unknown.set(key, { frames: [frame], ...row });
      }
    }
    finalState = hash(core.exportSaveState());
  } finally {
    core.free();
    console.log(JSON.stringify({ route: name, endFrame, samples, maskCells, negativeChecks, alphabetFrames,
      winnerSpritePixels, matchedWinnerSpritePixels,
      finalState, actionCommands: [...actionCommands], actionMasks: [...actionMasks.values()],
      alphabetOverlaps: [...alphabetOverlaps.values()], passwordInputOverlaps: [...passwordInputOverlaps.values()] }));
    // One record per line avoids terminal truncation of a giant JSON line.
    for (const observation of seen.values()) console.log(JSON.stringify({ route: name, visible: observation }));
    for (const snapshot of snapshots) console.log(JSON.stringify({ route: name, snapshot }));
    for (const evidence of titleEvidence) console.log(JSON.stringify({ route: name, titleEvidence: evidence }));
    for (const evidence of spriteHoleChecks.values()) console.log(JSON.stringify({ route: name, spriteHoleCheck: evidence }));
    for (const evidence of actionWindows.values()) console.log(JSON.stringify({ route: name, actionWindow: evidence }));
    for (const row of unknown.values()) console.log(JSON.stringify({ route: name, unknownNativeFontRow: {
      ...row, cellFormat: '[x,reading,masked,encodedBytes,bodyCell,tile,CHR,generation,markCell,tile,CHR,generation,[bodyPixels,markPixels]]',
      cells: row.cells.map(c => [c.x, c.text, c.masked, c.bytes, ...Object.values(c.body), ...Object.values(c.mark), c.pixels]),
    } }));
  }
  assert.deepEqual(rom, original, 'original ROM unchanged');
  return { seen, actionCommands, actionMasks, alphabetFrames, finalState, spriteHoleChecks, actionWindows,
    alphabetOverlaps: [...alphabetOverlaps.values()], passwordInputOverlaps: [...passwordInputOverlaps.values()] };
}

test('original CT2 real-frame menu traversal (bounded, not complete coverage)', async t => {
  console.log(JSON.stringify({ node: process.version, wasmSha256: hash(wasm), romSha256: hash(rom),
    sampling: 'legacy: every 30 frames plus diagnostic keys and 13200..13620; direction matrix: 14999..15010; frames are zero-based after frame()',
    scope: 'complete raw background menu masks and original fetched CHR; winning sprite holes are not missing background; no renderer or complete-coverage claim' }));
  const play = runRoute('kick-off', 15000, frame => ({
    start: (frame >= 600 && frame <= 603) || (frame >= 900 && frame <= 903),
    a: frame >= 1100 && frame < 13560 && frame % 120 < 4 && (frame < 9500 || frame >= 11200),
    // Three Down edges select pregame KICK OFF; A11280 confirms it.
    // Later edges probe the observed action window without counting stat labels.
    down: [11000, 11020, 11040, 13620, 13740].includes(frame),
    up: frame === 13860, right: frame === 13980,
    b: frame === 14100,
  }));
  // Fresh boot, no imported state or RAM edits. B advances the referee dialogue
  // and reaches どうする ? earlier than the A route. Try released four-frame
  // button presses after the prompt; an empty command area must remain a failure.
  const actionProbe = runRoute('kick-off-B-action-probe', 15000, frame => ({
    start: (frame >= 600 && frame <= 603) || (frame >= 900 && frame <= 903),
    a: (frame >= 1100 && frame < 11600 && frame % 120 < 4 && (frame < 9500 || frame >= 11200))
      || (frame >= 13800 && frame < 13804),
    down: [11000, 11020, 11040].includes(frame) || (frame >= 13620 && frame < 13624),
    b: (frame >= 11600 && frame < 13500 && frame % 60 < 4) || (frame >= 14520 && frame < 14524),
    up: frame >= 13980 && frame < 13984,
    left: frame >= 14160 && frame < 14164,
    right: frame >= 14340 && frame < 14344,
  }));
  // Requested route, unchanged: A does not confirm this original title menu.
  const attempt = runRoute('title-down-A-only', 1500, frame => ({ start: frame === 600, down: frame === 800, a: frame === 900 }));
  // Separate verified continuation, NOT a silent change to the requested input:
  // Start930 confirms the Down800 selection. The no-Down control gets the same
  // Start930, proving that Down selected CONTINUE rather than KICK OFF.
  const password = runRoute('title-down-Start-confirmed-password', 1500, frame => ({
    start: [600, 930].includes(frame), down: frame === 800, a: frame === 900,
  }));
  const control = runRoute('title-no-down-Start-confirmed-control', 1500, frame => ({ start: [600, 930].includes(frame), a: frame === 900 }));
  // Independent boots reproduce the diagnostic exactly. Earlier A/B confirms
  // change the action state; do not append directions to those legacy routes.
  // Sample every frame through the three-frame input-to-CHR-write latency:
  // 30-frame sampling misses real complete masks (e.g. 13863 vs 13890).
  const directionRoutes = new Map();
  for (const [direction, source] of [['up', 'ドリブル'], ['left', 'パス'], ['right', 'シュート']]) {
    const route = runRoute(`fresh-action-${direction}`, 15010, frame => ({
      start: (frame >= 600 && frame < 604) || (frame >= 900 && frame < 904),
      a: frame >= 1100 && frame < 13560 && frame % 120 < 4 && (frame < 9500 || frame >= 11200),
      down: [11000, 11020, 11040].includes(frame),
      [direction]: frame >= 15000 && frame < 15004,
    }), new Set(Array.from({ length: 12 }, (_, i) => 14999 + i)));
    directionRoutes.set(source, route);
  }
  const expectIds = (route, ids) => assert.deepEqual(ids.filter(id => !route.seen.has(id)), [],
    `missing visible IDs; observed: ${[...route.seen.keys()].join(', ')}`);
  await t.test('both original title entries are visible together', () => {
    expectIds(play, ['menu.title.kick-off', 'menu.title.continue']);
    assert.equal(play.seen.get('menu.title.kick-off').first, play.seen.get('menu.title.continue').first);
  });
  await t.test('real title sprite holes never relax raw background completeness', () => {
    for (const id of ['menu.title.kick-off', 'menu.title.continue']) {
      assert.ok(attempt.spriteHoleChecks.has(id), `${id}: must exercise a genuine winner-sprite overlap and reject a raw-background hole there`);
    }
  });
  await t.test('all four pregame labels have real masks', () => {
    const ids = assets.entries.filter(entry => entry.id.startsWith('menu.pregame.')).map(entry => entry.id);
    assert.equal(ids.length, 4); expectIds(play, ids);
  });
  for (const source of ['シュート', 'パス', 'ドリブル']) await t.test(`match command ${source} has a real mask`, () => {
    const candidates = assets.entries.filter(entry => entry.id.startsWith('menu.command.') && entry.source === source);
    assert.ok(candidates.length, `extractor must contain ${source}`);
    const route = directionRoutes.get(source), mask = route.actionMasks.get(source);
    assert.ok(mask, `fresh direction did not translate ${source} in the actual selected-action footprint`);
    assert.equal(mask.frame, 15003, 'first complete command is three frames after the direction edge, not the idle stat label');
    assert.equal(mask.translation, commandTranslations.get(source));
    assert.deepEqual([mask.x, mask.y, mask.width, mask.height], [96, 162, 40, 16]);
    assert.deepEqual([...route.actionMasks.keys()], [source], 'an independent direction must not count other commands from the ability panel');
    assert.deepEqual(route.alphabetOverlaps, []);
    assert.deepEqual(route.passwordInputOverlaps, []);
  });
  await t.test('deterministic A and B routes reach the actual action prompt', () => {
    for (const route of [play, actionProbe]) {
      expectIds(route, ['menu.rich.33be6']);
      assert.ok(route.actionWindows.size > 0, 'record actual background immediately below the prompt even if commands are absent');
    }
  });
  await t.test('dynamic ability labels have masks separate from their numeric values', () => {
    expectIds(play, ['menu.rich.33c23', 'menu.rich.33c39']);
    assert.equal(play.seen.get('menu.rich.33c23').rectangle[2], 24, 'ガッツ text only, not its dynamic number');
    assert.equal(play.seen.get('menu.rich.33c39').rectangle[2], 16, 'パス text only, not its dynamic number');
  });
  await t.test('Down800 selects password, but original title needs Start930 rather than A900', () => {
    assert.equal(attempt.alphabetFrames, 0, 'A-only route behavior changed; reverify title controls');
    assert.ok(password.alphabetFrames > 0, 'Down800/Start930 did not fetch the complete original password alphabet');
    assert.equal(control.alphabetFrames, 0, 'no-Down route unexpectedly entered password');
    assert.notEqual(password.finalState, control.finalState, 'Down must change the actual emulated route');
  });
  await t.test('password prompt and submit action have real masks; alphabet is preserved', () => {
    expectIds(password, ['menu.password.prompt', 'menu.password.confirm']);
    assert.deepEqual(password.alphabetOverlaps, [], 'non-submit translations must not mask native password alphabet cells');
  });
  await t.test('password input slots are not mistaken for match commands', () => {
    assert.deepEqual(password.passwordInputOverlaps, [], 'password input placeholders must remain native');
  });
});