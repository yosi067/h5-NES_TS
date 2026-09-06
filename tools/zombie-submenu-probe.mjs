import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { initSync, EmuWasm } from '../src/wasm/nes_wasm.js';
import { submenuRoutes, actionRoutes } from './zombie-submenu-routes.mjs';
import { ZOMBIE_HUNTER_HASH } from '../src/game-profiles/verified-cell-menus.ts';
const root = new URL('../', import.meta.url);
const rom = fs.readFileSync(new URL('roms/Zombie Hunter (Japan).nes', root));
assert.equal(crypto.createHash('sha256').update(rom).digest('hex'), ZOMBIE_HUNTER_HASH);
initSync({ module: fs.readFileSync(new URL('src/wasm/nes_wasm_bg.wasm', root)) });
for (const route of [...submenuRoutes, ...actionRoutes]) {
  const core = new EmuWasm();
  try {
    assert.ok(core.loadRom(rom));
    core.setGameProfileTuning(JSON.stringify({ profileId: 'zombie-hunter-jp', maxLevelOnNewGame: false }));
    core.enableTextObserver(true);
    for (let frame = 0; frame <= route.frame; frame++) {
      for (const [at,b] of route.events) {
        if (frame === at) core.setButton(0,b,true);
        if (frame === at+2) core.setButton(0,b,false);
      }
      core.frame(); core.consumeAudioSamples();
    }
    fs.writeFileSync(new URL(`artifacts/zombie-submenu-${route.id}.json`, root), JSON.stringify({
      sourceSha256: ZOMBIE_HUNTER_HASH, frame: route.frame, events: route.events,
      maxLevelOnNewGame: false, evidence: 'original-ROM input-only completed-frame CHR fetches',
      metadata: Array.from(core.getTextFrameMetadata()), nametable: Array.from(core.getTextNametable()),
    })+'\n');
  } finally { core.free(); }
}