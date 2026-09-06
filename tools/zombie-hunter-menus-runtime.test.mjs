import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { initSync, EmuWasm } from '../src/wasm/nes_wasm.js';
import { ZOMBIE_HUNTER_HASH, validateCellMenus, locateVerifiedCellMenus } from '../src/game-profiles/verified-cell-menus.ts';
import { submenuRoutes, actionRoutes } from './zombie-submenu-routes.mjs';
const read = p => fs.readFileSync(new URL(p, import.meta.url));
const catalog = JSON.parse(read('../public/game-profiles/zombie-hunter-jp/menus.json'));
const rom = read('../roms/Zombie Hunter (Japan).nes');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
initSync({ module: read('../src/wasm/nes_wasm_bg.wasm') });
test('frame-by-frame switching: source-complete labels survive partial families; masks never own sprites or stale cells', () => {
  const report = [];
  for (const route of submenuRoutes) {
    const core = new EmuWasm();
    // Equipment A already returns to pause; status A advances its second page.
    const events = [...route.events, ...(route.id === 'items' ? [[630,5],[650,4]] : []), [670,0], [700,7],
      [730, route.id === 'equipment' ? 4 : 1], [860,3]];
    let last = '', independentFrames = 0, checkedPixels = 0;
    const transitions = [];
    try {
      assert.ok(core.loadRom(rom)); core.enableTextObserver(true);
      for (let frame = 0; frame <= 950; frame++) {
        for (const [at,b] of events) {
          if (frame === at) core.setButton(0,b,true);
          if (frame === at+2) core.setButton(0,b,false);
        }
        core.frame(); core.consumeAudioSamples();
        if (frame < 410) continue;
        const metadata = core.getTextFrameMetadata();
        const provenance = new Uint16Array(core.getWasmMemory().buffer, core.getTextProvenancePtr(), 61440);
        const matches = locateVerifiedCellMenus(catalog, metadata, provenance);
        const ids = matches.map(m => m.entry.id).join(',');
        if (ids !== last) { transitions.push({ frame, ids }); last = ids; }
        for (const group of ['pause', route.id]) {
          const family = catalog.entries.filter(e => e.group === group);
          const count = matches.filter(m => m.entry.group === group).length;
          if (count > 0 && count < family.length) independentFrames++;
        }
        // Independent strict full-box oracle: any complete original label must
        // still be translated even while other entries are being cleared/written.
        for (const entry of catalog.entries) {
          if (!entry.cells.every(c => (metadata[c.cell*4] & 255) === c.tile && metadata[c.cell*4+1] === c.chr+1)) continue;
          const start = provenance.indexOf(entry.cells[0].cell+1);
          if (start < 0) continue;
          const x = start % 256, y = Math.floor(start/256);
          if (x+entry.width*8 > 256 || y+entry.height*8 > 240) continue;
          const full = entry.cells.every((c,i) => {
            for (let dy=0;dy<8;dy++) for (let dx=0;dx<8;dx++) {
              if (provenance[(y+Math.floor(i/entry.width)*8+dy)*256+x+i%entry.width*8+dx] !== ((c.cell+1)|(dy<<12))) return false;
            }
            return true;
          });
          if (full) assert.ok(matches.some(m => m.entry.id === entry.id), `${route.id} frame ${frame}: missing ${entry.id}`);
        }
        for (const match of matches) {
          const {entry,x,y} = match;
          for (const c of entry.cells) {
            assert.equal(metadata[c.cell*4]&255, c.tile);
            assert.equal(metadata[c.cell*4+1], c.chr+1);
          }
          for (const box of match.clips ?? [{x,y,width:entry.width*8,height:entry.height*8}]) {
            for (let py=box.y;py<box.y+box.height;py++) for (let px=box.x;px<box.x+box.width;px++) {
              const dy=py-y, dx=px-x;
              assert.ok(dx>=0 && dx<entry.width*8 && dy>=0 && dy<entry.height*8);
              const cell = entry.cells[Math.floor(dy/8)*entry.width+Math.floor(dx/8)].cell;
              assert.equal(provenance[py*256+px], (cell+1)|((dy%8)<<12), `${route.id} unsafe mask ${frame}`);
              checkedPixels++;
            }
          }
        }
        if (frame === 650) assert.equal(matches.filter(m => m.entry.group === route.id).length, catalog.entries.filter(e => e.group === route.id).length);
        if (frame === 950) assert.ok(matches.every(m => m.entry.group === 'hud'), `${route.id}: exited menu`);
      }
      assert.ok(independentFrames > 0, 'must exercise partial native redraw, not only stable snapshots');
      report.push({ route: route.id, events, framesChecked: 541, independentFrames, checkedPixels, transitions });
    } finally { core.free(); }
  }
  fs.writeFileSync(new URL('../artifacts/zombie-menu-switching-runtime.json', import.meta.url), JSON.stringify({sourceSha256:hash(rom), report},null,2)+'\n');
});
test('all four native submenus: L0 and L31, complete source families and restore', () => {
  const report = [];
  for (const maximum of [false, true]) for (const route of [...submenuRoutes, ...actionRoutes.filter(r => !r.id.endsWith('-scroll') && !r.id.endsWith('-end'))]) {
    const core = new EmuWasm();
    try {
      assert.ok(core.loadRom(rom));
      core.setGameProfileTuning(JSON.stringify({ profileId: 'zombie-hunter-jp', maxLevelOnNewGame: maximum }));
      core.enableTextObserver(true);
      const locate = () => locateVerifiedCellMenus(catalog, core.getTextFrameMetadata(),
        new Uint16Array(core.getWasmMemory().buffer, core.getTextProvenancePtr(), 256*240).slice());
      for (let frame = 0; frame <= route.frame; frame++) {
        for (const [at,b] of route.events) {
          if (frame === at) core.setButton(0,b,true);
          if (frame === at+2) core.setButton(0,b,false);
        }
        core.frame(); core.consumeAudioSamples();
      }
      const expected = catalog.entries.filter(e => e.group === route.id).map(e => e.id);
      const matches = locate().filter(f => f.entry.group === route.id);
      assert.deepEqual(matches.map(f => f.entry.id), expected, `${route.id} max=${maximum}`);
      assert.ok(!locate().some(f => f.entry.group === 'pause'));
      const metadata = core.getTextFrameMetadata();
      const provenance = new Uint16Array(core.getWasmMemory().buffer, core.getTextProvenancePtr(),256*240).slice();
      for (const match of matches) {
        const wrong = metadata.slice(); wrong[match.entry.cells[0].cell*4+1] += 4096;
        assert.ok(!locateVerifiedCellMenus(catalog,wrong,provenance).some(f => f.entry.id === match.entry.id));
        const covered = provenance.slice(); covered[match.y*256+match.x+1] = 0;
        const clipped = locateVerifiedCellMenus(catalog,metadata,covered).find(f => f.entry.id === match.entry.id);
        assert.ok(clipped?.clips);
        assert.ok(!clipped.clips.some(b => match.x+1 >= b.x && match.x+1 < b.x+b.width && match.y >= b.y && match.y < b.y+b.height));
      }
      report.push({ route, maximum, matches: matches.map(({entry,x,y}) => ({
        id: entry.id, source: entry.source, translation: entry.translation, x,y,
        cells: entry.cells,
      })) });
      const temporary = core.exportSaveState(), persistent = core.exportPersistentSaveState();
      for (const restore of [() => core.importSaveState(temporary), () => core.importPersistentSaveState(persistent)]) {
        assert.ok(restore()); assert.deepEqual(locate(), []);
        core.frame(); core.consumeAudioSamples();
        assert.deepEqual(locate().filter(f => f.entry.group === route.id).map(f => f.entry.id), expected);
      }
      core.reset(); assert.deepEqual(locate(), []);
    } finally { core.free(); }
  }
  fs.writeFileSync(new URL('../artifacts/zombie-submenu-runtime.json', import.meta.url), JSON.stringify({
    sourceSha256: hash(rom), mode: 'input-only original ROM, both tuning settings', report,
  }, null, 2)+'\n');
});
test('catalog rejects wrong identity and unsafe geometry', () => {
  validateCellMenus(catalog);
  assert.throws(() => validateCellMenus({ ...catalog, sourceSha256: 'wrong' }));
  const bad = structuredClone(catalog); bad.entries[0].cells[0].chr++;
  assert.throws(() => validateCellMenus(bad));
  assert.deepEqual(locateVerifiedCellMenus(catalog, new Uint32Array(), new Uint16Array()), []);
});
test('original ROM: menu traversal, fail-closed evidence, framebuffer/audio/state equivalence', () => {
  assert.equal(hash(rom), ZOMBIE_HUNTER_HASH);
  const baseline = new EmuWasm(), observed = new EmuWasm();
  const report = [];
  const events = [[120,3],[240,3],[420,3],[520,5],[620,0],[720,1],[820,3]];
  try {
    for (const c of [baseline, observed]) assert.ok(c.loadRom(rom));
    assert.ok(observed.enableTextObserver(true));
    for (let frame = 0; frame <= 900; frame++) {
      for (const c of [baseline, observed]) {
        for (const [at, button] of events) {
          if (frame === at) c.setButton(0, button, true);
          if (frame === at + 2) c.setButton(0, button, false);
        }
        c.frame();
      }
      const bytes = (c, ptr, size) => new Uint8Array(c.getWasmMemory().buffer, ptr, size);
      assert.deepEqual(bytes(observed, observed.getFrameBufferPtr(), 256*240*4), bytes(baseline, baseline.getFrameBufferPtr(), 256*240*4), `framebuffer ${frame}`);
      assert.equal(observed.getAudioBufferLen(), baseline.getAudioBufferLen());
      assert.deepEqual(bytes(observed, observed.getAudioBufferPtr(), observed.getAudioBufferLen()*4), bytes(baseline, baseline.getAudioBufferPtr(), baseline.getAudioBufferLen()*4), `audio ${frame}`);
      baseline.consumeAudioSamples(); observed.consumeAudioSamples();
      assert.equal(observed.takeTextEvents().length, 0, 'CT2 writer must stay off');
      if (![200,300,450,550,650,750,850,900].includes(frame)) continue;
      const metadata = observed.getTextFrameMetadata();
      const provenance = new Uint16Array(observed.getWasmMemory().buffer, observed.getTextProvenancePtr(), 256*240).slice();
      const found = locateVerifiedCellMenus(catalog, metadata, provenance);
      const ids = found.map(f => f.entry.id);
      report.push({ frame, ids, rectangles: found.map(f => ({ id: f.entry.id, x: f.x, y: f.y })) });
      if (frame === 200) assert.deepEqual(ids, ['title.start']);
      if ([450,550].includes(frame)) {
        assert.equal(found.filter(f => f.entry.group === 'pause').length, 4);
        const wrong = metadata.slice(); wrong[catalog.entries[1].cells[0].cell*4+1] += 4096;
        assert.equal(locateVerifiedCellMenus(catalog, wrong, provenance).filter(f => f.entry.group === 'pause').length, 3);
        const covered = provenance.slice(), menu = found.find(f => f.entry.id === 'menu.items');
        covered[menu.y*256+menu.x+1] = 0;
        assert.equal(locateVerifiedCellMenus(catalog, metadata, covered).filter(f => f.entry.group === 'pause').length, 4);
        assert.ok(locateVerifiedCellMenus(catalog, metadata, covered).find(f => f.entry.id === 'menu.items').clips);
        for (const [field, value] of [[0, 0xffffffff], [0, 0], [2, 0], [2, 0x1000001], [3, 0x1000001]]) {
          const ambiguous = metadata.slice(); ambiguous[catalog.entries[1].cells[0].cell*4+field] = value;
          assert.equal(locateVerifiedCellMenus(catalog, ambiguous, provenance).filter(f => f.entry.group === 'pause').length, 3, `unsafe field ${field}`);
        }
      }
      if ([300,650,850,900].includes(frame)) assert.ok(!ids.some(id => id.startsWith('menu.')), `no stale pause menu ${frame}`);
      // Portable state serializes diagnostic PPU fields too. Clear ONLY those
      // read-side observations in both cores before comparing the full payload.
      observed.enableTextObserver(false); baseline.enableTextObserver(false);
      assert.equal(hash(observed.exportPersistentSaveState()), hash(baseline.exportPersistentSaveState()), `machine state ${frame}`);
      observed.enableTextObserver(true);
    }
    observed.reset();
    assert.deepEqual(locateVerifiedCellMenus(catalog, observed.getTextFrameMetadata(), new Uint16Array(observed.getWasmMemory().buffer, observed.getTextProvenancePtr(), 256*240)), []);
    assert.equal(hash(rom), ZOMBIE_HUNTER_HASH);
    fs.writeFileSync(new URL('../artifacts/zombie-hunter-menu-runtime.json', import.meta.url), JSON.stringify({ sourceSha256: hash(rom), framesCompared: 901, originalRomUnchanged: true, report }, null, 2)+'\n');
  } finally { baseline.free(); observed.free(); }
});