import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { initSync, EmuWasm, NesWasm } from '../src/wasm/nes_wasm.js';

const enabled = process.env.CT2_TEST_ROM === '1';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const originalSha = 'bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746';
const aliasSha = 'ee08f9134ef0e9e3a5f77e4f08244d24739c68d781cb58e2be737916bb3ab5ae';
const update = (core, level) => core.setGameProfileTuning(JSON.stringify({ profileId: 'captain-tsubasa-2-jp', tsubasaLevel: level }));
const state = core => JSON.parse(core.getGameProfileTuning());

test('built WASM wrappers hot-update atomically and restore across cores without storing tuning', { skip: !enabled }, () => {
  initSync({ module: fs.readFileSync(new URL('../src/wasm/nes_wasm_bg.wasm', import.meta.url)) });
  const rom = fs.readFileSync(new URL('../roms/Captain Tsubasa II - Super Striker (Japan).nes', import.meta.url));
  assert.equal(sha(rom), originalSha);
  for (const Wrapper of [EmuWasm, NesWasm]) {
    const core = new Wrapper(), other = new Wrapper();
    try {
      assert.equal(state(core).supported, false);
      assert.throws(() => update(core, 64));
      assert.ok(core.loadRom(rom));
      assert.equal(state(core).tsubasaLevel, 64);
      const before = core.exportPersistentSaveState();
      for (const level of [1, 32, 64, null]) {
        update(core, level);
        assert.equal(state(core).tsubasaLevel, level);
        assert.equal(core.exportPersistentSaveState(), before, 'no hardware, SRAM or clock writes');
      }
      for (const level of [0, 65, 255, -1, 1.5, '64']) {
        assert.throws(() => update(core, level));
        assert.equal(state(core).tsubasaLevel, null);
      }
      assert.ok(other.loadRom(rom));
      assert.ok(other.importPersistentSaveState(before));
      assert.equal(state(other).tsubasaLevel, 64, 'cross-core restore uses receiving preference');
      update(other, 32);
      const temp = other.exportSaveState();
      other.reset();
      assert.equal(state(other).tsubasaLevel, 32);
      assert.ok(other.importSaveState(temp));
      other.clearGameProfile();
      assert.equal(state(other).tsubasaLevel, 32, 'translation overlay lifecycle is independent');
      const unknown = Buffer.from(rom); unknown[16 + 0x3f509] ^= 1;
      assert.ok(other.loadRom(unknown));
      assert.equal(state(other).supported, false);
      assert.throws(() => update(other, 64));
      assert.equal(sha(rom), originalSha);
    } finally { core.free(); other.free(); }
  }
});

test('allowlisted header alias has identical full PRG/CHR payload and receives default tuning', { skip: !enabled }, async () => {
  initSync({ module: fs.readFileSync(new URL('../src/wasm/nes_wasm_bg.wasm', import.meta.url)) });
  const original = fs.readFileSync(new URL('../roms/Captain Tsubasa II - Super Striker (Japan).nes', import.meta.url));
  const archive = await JSZip.loadAsync(fs.readFileSync(new URL('../roms/天使之翼2(足球小將2).zip', import.meta.url)));
  const extensions = /\.(nes|smc|sfc|fig|gb|gbc|gg|sms|md|gen|smd|z64|n64|v64)$/i;
  // Match the first playable entry selected by both production ZIP loaders.
  const entry = Object.values(archive.files).find(file => !file.dir && extensions.test(file.name));
  assert.ok(entry);
  assert.match(entry.name, /\.nes$/i);
  const alias = await entry.async('nodebuffer');
  assert.equal(sha(alias), aliasSha);
  assert.deepEqual(alias.subarray(16), original.subarray(16));
  for (const Wrapper of [EmuWasm, NesWasm]) {
    const core = new Wrapper();
    try {
      // No DOM, localization assets, tuning UI, or localStorage is present.
      assert.ok(core.loadRom(alias));
      assert.equal(state(core).supported, true);
      assert.equal(state(core).tsubasaLevel, 64);
      for (const previous of [null, 1, 32]) {
        update(core, previous);
        assert.equal(state(core).tsubasaLevel, previous);
        assert.ok(core.loadRom(alias));
        assert.equal(state(core).tsubasaLevel, 64, 'every fresh catalog ROM load restores the default');
      }
    } finally { core.free(); }
  }
});