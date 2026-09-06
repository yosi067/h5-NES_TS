// Original-ROM, deterministic input traversal. No RAM writes or ROM patches.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { initSync, EmuWasm } from '../src/wasm/nes_wasm.js';

const rom = fs.readFileSync(new URL('../roms/Zombie Hunter (Japan).nes', import.meta.url));
if (crypto.createHash('sha256').update(rom).digest('hex') !== '91dfb1a0c29f78c5d5b0a582c737c62103c4009ad5e2c20fdecd0c22a8648a48') throw Error('ROM mismatch');
initSync({ module: fs.readFileSync(new URL('../src/wasm/nes_wasm_bg.wasm', import.meta.url)) });
const core = new EmuWasm();
core.loadRom(rom);
core.enableTextObserver(true);
// WASM takes button indices, not the Rust controller bit masks.
const events = (process.env.ZOMBIE_INPUT ?? '120:3,240:3,420:3,520:5,620:0').split(',').filter(Boolean).map(s => s.split(':').map(Number));
const snapshots = new Set((process.env.ZOMBIE_SNAPSHOTS ?? '200,300,450,550,650').split(',').map(Number));
for (let frame = 0; frame <= Math.max(...snapshots); frame++) {
  for (const [at, button] of events) {
    if (frame === at) core.setButton(0, button, true);
    if (frame === at + 2) core.setButton(0, button, false);
  }
  core.frame(); core.consumeAudioSamples();
  if (!snapshots.has(frame)) continue;
  const sourceSha256 = crypto.createHash('sha256').update(rom).digest('hex');
  fs.writeFileSync(new URL(`../artifacts/zombie-menu-${frame}.json`, import.meta.url), JSON.stringify({
    sourceSha256, frame, events, evidence: 'original-ROM completed-frame PPU fetch metadata; no image/OCR',
    metadata: Array.from(core.getTextFrameMetadata()), nametable: Array.from(core.getTextNametable()),
  }));
}
core.free();