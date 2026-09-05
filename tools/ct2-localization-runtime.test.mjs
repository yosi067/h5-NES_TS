import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initSync, EmuWasm } from '../src/wasm/nes_wasm.js';
import { TextObservationState, locateTextCells, cellRectangleVisible, validateLocalizationAssets } from '../src/game-profiles/localization.ts';
import { buildDefaultLocalization } from './build-ct2-localization.mjs';

test('real original CT2 emits source-backed glyphs without changing the emulated game', () => {
  initSync({ module: fs.readFileSync(new URL('../src/wasm/nes_wasm_bg.wasm', import.meta.url)) });
  const assets = buildDefaultLocalization();
  validateLocalizationAssets(assets);
  const rom = fs.readFileSync(new URL('../roms/Captain Tsubasa II - Super Striker (Japan).nes', import.meta.url));
  const original = Buffer.from(rom);
  const enabled = new EmuWasm();
  const vanilla = new EmuWasm();
  assert.ok(enabled.loadRom(rom)); assert.ok(vanilla.loadRom(rom));
  assert.ok(enabled.enableTextObserver(true));
  const state = new TextObservationState(assets.runtime);
  let glyphEvents = 0;
  let cloudEvents = 0;
  let matchedRectangles = 0;
  const seenRuns = new Set();
  const frames = Number(process.env.CT2_TEST_FRAMES ?? 1800);
  for (let frame = 0; frame < frames; frame++) {
    if (process.env.CT2_TEST_PLAY === '1') {
      const start = (frame >= 600 && frame < 604) || (frame >= 900 && frame < 904);
      const confirm = frame >= 1100 && frame % 120 < 4 && (frame < 9500 || frame >= 11200);
      for (const core of [enabled, vanilla]) {
        core.setButton(0, 3, start); core.setButton(0, 0, confirm);
        core.setButton(0, 5, [11000, 11020, 11040].includes(frame));
      }
    }
    enabled.frame(); vanilla.frame();
    const events = enabled.takeTextEvents();
    for (let i = 0; i < events.length; i += 4) {
      if (events[i] === 1) glyphEvents++;
      if (events[i] === 3) cloudEvents++;
    }
    state.consume(events);
    const fetched = enabled.getTextFetchedCells();
    const provenance = new Uint16Array(enabled.getWasmMemory().buffer, enabled.getTextProvenancePtr(), 61440);
    const positions = locateTextCells(provenance, new Set(state.glyphs.keys()));
    for (const glyph of state.glyphs.values()) {
      const pos = positions.get(glyph.cell);
      if (!pos) continue;
      const lower = glyph.glyph < 0xa0 ? glyph.glyph : assets.runtime.lowerTiles[glyph.glyph];
        if (fetched[glyph.cell] === 0xffffffff || fetched[glyph.cell + 32] === 0xffffffff) continue;
        if ((fetched[glyph.cell + 32] & 255) !== lower) continue;
        if (!glyph.expectedGenerations || fetched[glyph.cell] >>> 8 !== glyph.expectedGenerations[0]
          || fetched[glyph.cell + 32] >>> 8 !== glyph.expectedGenerations[1]) continue;
      if (cellRectangleVisible(provenance, glyph.cell, pos.x, pos.y)) { matchedRectangles++; seenRuns.add(glyph.run.id); }
    }
    if (frame % 120 === 0) {
      assert.equal(enabled.exportSaveState(), vanilla.exportSaveState(), `state frame ${frame}`);
      const a = new Uint8Array(enabled.getWasmMemory().buffer, enabled.getFrameBufferPtr(), enabled.getFrameBufferLen());
      const b = new Uint8Array(vanilla.getWasmMemory().buffer, vanilla.getFrameBufferPtr(), vanilla.getFrameBufferLen());
      assert.deepEqual(a, b, `framebuffer frame ${frame}`);
    }
  }
  console.log({ frames, glyphEvents, cloudEvents, matchedRectangles, visibleRuns: seenRuns.size, runs: [...seenRuns] });
  if (process.env.CT2_TEST_PLAY === '1') assert.ok(cloudEvents > 0, 'entered a real match and observed its cloud writer');
  assert.ok(glyphEvents > 50, 'real source glyph events');
  assert.ok(matchedRectangles > 100, 'source cells project to actual rendered rectangles');
  assert.ok(seenRuns.size >= 5, 'multiple independent script lines');
  assert.deepEqual(rom, original);
  enabled.reset();
  assert.equal(enabled.takeTextEvents()[0], 0, 'reset invalidates text');
  enabled.free(); vanilla.free();
});