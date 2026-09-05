// Original-ROM navigation evidence, not OCR or a gameplay patch.
import fs from 'node:fs';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { initSync, EmuWasm } from '../src/wasm/nes_wasm.js';
initSync({ module: fs.readFileSync(new URL('../src/wasm/nes_wasm_bg.wasm', import.meta.url)) });
const core = new EmuWasm();
core.loadRom(fs.readFileSync(new URL('../roms/Captain Tsubasa II - Super Striker (Japan).nes', import.meta.url)));
core.enableTextObserver(true);
const output = new URL('../artifacts/ct2-play-trace.png', import.meta.url);
let cloudEvents = 0;
try {
  for (let frame = 0; frame < Number(process.env.CT2_TRACE_FRAMES ?? 11000); frame++) {
    core.setButton(0, 3, (frame >= 600 && frame < 604) || (frame >= 900 && frame < 904));
    core.setButton(0, 0, frame >= 1100 && frame % 120 < 4 && (!process.env.CT2_TRACE_DOWN || frame < 9500 || frame >= 11200));
    if (process.env.CT2_TRACE_DOWN) core.setButton(0, 5, [11000, 11020, 11040].includes(frame));
    core.frame();
    const events = core.takeTextEvents();
    for (let i = 0; i < events.length; i += 4) {
      if (events[i] === 3) cloudEvents++;
      if (events[i] === 6) console.log({frame, command:events[i+1], position:events[i+2]});
    }
  }
  const pixels = Buffer.from(new Uint8Array(core.getWasmMemory().buffer, core.getFrameBufferPtr(), core.getFrameBufferLen()));
  await sharp(pixels, { raw: { width: 256, height: 240, channels: 4 } }).resize(768, 720, { kernel: 'nearest' }).png().toFile(fileURLToPath(output));
  console.log({ cloudEvents, output: output.href });
} finally { core.free(); }