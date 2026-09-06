// Real production WASM, no Vite/DEV dependency; source ROM is never modified.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import sharp from 'sharp';
import { initSync, EmuWasm, NesWasm } from '../src/wasm/nes_wasm.js';
const root = new URL('../', import.meta.url);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const originalSha = '91dfb1a0c29f78c5d5b0a582c737c62103c4009ad5e2c20fdecd0c22a8648a48';
const enabled = process.env.ZOMBIE_TEST_ROM === '1';
const state = core => JSON.parse(core.getGameProfileTuning());
const set = (core, value) => core.setGameProfileTuning(JSON.stringify({ profileId: 'zombie-hunter-jp', maxLevelOnNewGame: value, maxMoneyOnNewGame: value }));
function boot(core) {
  for (let f = 0; f <= 700; f++) {
    core.setButton(0, 3, [120, 121, 240, 241].includes(f));
    core.frame(); core.consumeAudioSamples();
  }
}

test('production wrappers: identity, ZIP containers, default, off, reset and save restoration', { skip: !enabled }, async () => {
  const rom = fs.readFileSync(new URL('roms/Zombie Hunter (Japan).nes', root));
  assert.equal(sha(rom), originalSha);
  initSync({ module: fs.readFileSync(new URL('src/wasm/nes_wasm_bg.wasm', root)) });
  const zip = new JSZip(); zip.file('nested/殭屍獵人.nes', rom);
  const extracted = await (await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))).file('nested/殭屍獵人.nes').async('uint8array');
  assert.equal(sha(extracted), originalSha);
  const evidence = { sourceSha256: originalSha, mode: 'production WASM, original-ROM input-only boot', samples: [] };
  for (const Wrapper of [EmuWasm, NesWasm]) {
    const core = new Wrapper();
    try {
      assert.equal(core.loadRom(extracted), true);
      assert.equal(state(core).profileId, 'zombie-hunter-jp');
      assert.equal(state(core).maxLevelOnNewGame, true);
      assert.equal(state(core).maxMoneyOnNewGame, true);
      assert.equal(state(core).maxMoney, 999999);
      assert.throws(() => core.setGameProfileTuning('{"profileId":"zombie-hunter-jp","maxLevelOnNewGame":255}'));
      for (const maximum of [false, true]) {
        set(core, maximum); core.reset();
        if (core.enableTextObserver) core.enableTextObserver(true);
        boot(core);
        if (core.getTextNametable) {
          const nt = core.getTextNametable();
          assert.deepEqual(Array.from(nt.slice(0x23c, 0x23e)), maximum ? [3, 1] : [0x15, 0]);
          assert.deepEqual(Array.from(nt.slice(0x226, 0x229)), maximum ? [2, 2, 3] : [0x24, 3, 7]);
          assert.deepEqual(Array.from(nt.slice(0x2a7, 0x2ad)), maximum ? [9,9,9,9,9,9] : [0x24,0x24,0x24,0x24,3,0]);
          evidence.samples.push({ maximum, displayedLevel: maximum ? 31 : 0, displayedPower: maximum ? 223 : 37,
            levelTiles: Array.from(nt.slice(0x23c, 0x23e)), powerTiles: Array.from(nt.slice(0x226, 0x229)),
            displayedMoney: maximum ? 999999 : 30, moneyTiles: Array.from(nt.slice(0x2a7, 0x2ad)) });
          if (process.env.ZOMBIE_STATS_EVIDENCE === '1') {
            const pixels = Buffer.from(new Uint8Array(core.getWasmMemory().buffer, core.getFrameBufferPtr(), core.getFrameBufferLen()));
            await sharp(pixels, { raw: { width: 256, height: 240, channels: 4 } }).png()
              .toFile(fileURLToPath(new URL(`artifacts/zombie-stats-${maximum ? 'max' : 'original'}.png`, root)));
          }
        }
        const persistent = core.exportPersistentSaveState();
        const temporary = core.exportSaveState();
        set(core, !maximum);
        assert.equal(core.importPersistentSaveState(persistent), true);
        assert.equal(state(core).maxLevelOnNewGame, !maximum);
        assert.equal(state(core).maxMoneyOnNewGame, !maximum);
        assert.equal(core.importSaveState(temporary), true);
        assert.equal(state(core).maxLevelOnNewGame, !maximum);
        assert.equal(state(core).maxMoneyOnNewGame, !maximum);
      }
      // Buffer.slice aliases the source; an unknown-ROM fixture must own bytes.
      const unknown = Buffer.from(rom); unknown[16 + 0x1463] = 1;
      assert.equal(core.loadRom(unknown), true); assert.equal(state(core).supported, false);
      assert.equal(core.loadRom(new Uint8Array()), false); assert.equal(state(core).supported, false);
      assert.equal(core.loadRom(rom), true); assert.equal(state(core).maxLevelOnNewGame, true);
      assert.equal(state(core).maxMoneyOnNewGame, true);
    } finally { core.free(); }
  }
  assert.equal(sha(fs.readFileSync(new URL('roms/Zombie Hunter (Japan).nes', root))), originalSha);
  if (process.env.ZOMBIE_STATS_EVIDENCE === '1') fs.writeFileSync(new URL('artifacts/zombie-stats-runtime.json', root), JSON.stringify(evidence, null, 2) + '\n');
});