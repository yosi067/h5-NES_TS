// Original ROM traversal, no RAM injection, patched ROM, or synthetic events.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initSync, EmuWasm } from '../src/wasm/nes_wasm.js';
import { TextObservationState, locateTextCells, cellRectangleVisible, locateBattleTranslations } from '../src/game-profiles/localization.ts';

test('original match writer source and completed-frame evidence', () => {
  const read = p => fs.readFileSync(new URL(p, import.meta.url));
  initSync({ module: read('../src/wasm/nes_wasm_bg.wasm') });
  const rom = read('../roms/Captain Tsubasa II - Super Striker (Japan).nes');
  const original = Buffer.from(rom);
  const runtime = JSON.parse(read('../public/game-profiles/captain-tsubasa-2-jp/text-runtime.json'));
  const catalog = JSON.parse(read('../public/game-profiles/captain-tsubasa-2-jp/localization.json'));
  const entries = new Map(catalog.entries.map(e => [e.id, e]));
  const core = new EmuWasm(), vanilla = new EmuWasm();
  const state = new TextObservationState(runtime), seen = new Map(), visible = new Map(), translated = new Map();
  try {
    for (const c of [core, vanilla]) { assert.ok(c.loadRom(rom)); c.setGameProfileTuning('{"profileId":"captain-tsubasa-2-jp","tsubasaLevel":null}'); }
    assert.ok(core.enableTextObserver(true));
    // Snapshots include PPU provenance. Enable identical instrumentation on the
    // reference, but never consume/reduce its events. This checks the consumer,
    // not observer-on/off equivalence (covered separately by the legacy test).
    assert.ok(vanilla.enableTextObserver(true));
    for (let frame = 0; frame < Number(process.env.CT2_BATTLE_FRAMES ?? 19000); frame++) {
      for (const c of [core, vanilla]) {
        c.setButton(0, 3, frame >= 600 && frame < 604 || frame >= 900 && frame < 904);
        c.setButton(0, 0, frame >= 1100 && frame % 120 < 4 && (frame < 9500 || frame >= 11200));
        c.setButton(0, 5, [11000,11020,11040].includes(frame));
        c.setButton(0, 7, frame >= 15000 && frame < 15004);
        c.frame();
      }
      const events = core.takeTextEvents();
      state.consume(events);
      for (const g of state.glyphs.values()) if (g.run.domain === 'battle' && !seen.has(g.run.id)) seen.set(g.run.id, { frame, ...entries.get(g.run.id) });
      if (frame >= 11200) {
        const fetched = core.getTextFetchedCells();
        const provenance = new Uint16Array(core.getWasmMemory().buffer, core.getTextProvenancePtr(), 61440);
        const positions = locateTextCells(provenance, new Set(state.glyphs.keys()));
        for (const row of locateBattleTranslations(state, entries, provenance, core.getTextFrameMetadata())) {
          // Conservative full-width 12px metrics, same as renderer tests.
          if ([...row.text].length * 12 <= row.width && !translated.has(row.text)) {
            translated.set(row.text, { frame, text:row.text, ids:row.glyphs.map(g => g.run.id).filter((id,i,a) => a.indexOf(id) === i) });
          }
        }
        for (const g of state.glyphs.values()) {
          if (g.run.domain !== 'battle') continue;
          const pos = positions.get(g.cell), expected = g.expectedGenerations;
          if (!pos || !expected || fetched[g.cell] >>> 8 !== expected[0] || fetched[g.cell+32] >>> 8 !== expected[1]) continue;
          if (!cellRectangleVisible(provenance,g.cell,pos.x,pos.y)) continue;
          if (!visible.has(g.run.id)) visible.set(g.run.id, { frame, ...entries.get(g.run.id), cell:g.cell, index:g.index,
            tiles:[fetched[g.cell]&255,fetched[g.cell+32]&255], expected });
        }
      }
      if (frame % 600 === 0) {
        assert.equal(core.exportPersistentSaveState(), vanilla.exportPersistentSaveState(), `hardware snapshot ${frame}`);
        const pixels = c => new Uint8Array(c.getWasmMemory().buffer,c.getFrameBufferPtr(),c.getFrameBufferLen());
        assert.deepEqual(pixels(core),pixels(vanilla), `framebuffer ${frame}`);
      }
    }
    console.log(JSON.stringify({ seen:[...seen.values()], visible:[...visible.values()], translated:[...translated.values()] },null,2));
    assert.ok(seen.size > 0);
    assert.ok(visible.size > 0);
    assert.ok(translated.has('聖保羅'));
    assert.ok(translated.has('巴賓頓'));
    assert.ok([...translated.keys()].some(text => text.includes('射門')));
    assert.deepEqual(rom,original);
  } finally { core.free(); vanilla.free(); }
});