// Read-only ORIGINAL-ROM investigation. Fresh boot; no state imports or patches.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { initSync, EmuWasm } from '../src/wasm/nes_wasm.js';
import { locateMenuTranslations } from '../src/game-profiles/menu-localization.ts';
import { buildDefaultCT2Menus } from './ct2-menu-extract.mjs';
const assets = buildDefaultCT2Menus();
const entries = new Map(assets.entries.map(e => [e.id,e]));
const rom = fs.readFileSync(new URL('../roms/Captain Tsubasa II - Super Striker (Japan).nes', import.meta.url));
const wasm = fs.readFileSync(new URL('../src/wasm/nes_wasm_bg.wasm', import.meta.url));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const originalHash = hash(rom);
const hex = n => n.toString(16).padStart(2, '0');
initSync({ module: wasm });
// Each argument: startFrame:buttonIndex:duration[:controller].
const pulses = process.argv.slice(2).filter(a => a.includes(':')).map(a => a.split(':').map(Number));
const end = Number(process.env.CT2_DIAG_END ?? 16200);
const label = process.env.CT2_DIAG_LABEL ?? 'probe';
const core = new EmuWasm();
assert.ok(core.loadRom(rom));
assert.ok(core.enableTextObserver(true));
console.log(JSON.stringify({ label, romSha256: originalHash, wasmSha256: hash(wasm), pulses, end }));
let count = 0;
const visible = new Map();
const samples = new Set([11050,11290,12000,13000,13500,14000,14999,end]);
for (const [f,,duration] of pulses) for (const offset of [-1,0,1,2,3,4,10,duration-1,duration,duration+30]) samples.add(f+offset);
try {
  for (let frame = 0; frame <= end; frame++) {
    const buttons = Array.from({length:2}, () => Array(8).fill(false));
    buttons[0][3] = (frame >= 600 && frame < 604) || (frame >= 900 && frame < 904);
    buttons[0][0] = frame >= 1100 && frame < 13560 && frame % 120 < 4 && (frame < 9500 || frame >= 11200);
    buttons[0][5] = [11000,11020,11040].includes(frame);
    if(process.env.CT2_DIAG_ROUTE==='B') {
      buttons[0][0] = frame >= 1100 && frame < 11600 && frame % 120 < 4 && (frame < 9500 || frame >= 11200);
      buttons[0][1] = frame >= 11600 && frame < 13500 && frame % 60 < 4;
    }
    for (const [start,button,duration,controller=0] of pulses) if (frame >= start && frame < start+duration) buttons[controller][button] = true;
    for (let p=0;p<2;p++) for(let b=0;b<8;b++) core.setButton(p,b,buttons[p][b]);
    core.frame();
    const events = core.takeTextEvents();
    for (let i=0;i<events.length;i+=4) if(events[i]===6) {
      count++;
      if(count <= 50) console.log(JSON.stringify({frame,writer:[...events.slice(i,i+4)]}));
    }
    if(frame >= 13000) {
      const metadata=core.getTextFrameMetadata();
      const provenance=new Uint16Array(core.getWasmMemory().buffer,core.getTextBackgroundProvenancePtr(),256*240);
      const matches=locateMenuTranslations(assets,provenance,metadata);
      const prompt=matches.find(r => entries.get(r.id).source==='どうする ?');
      for(const r of matches) if(prompt && r.id.startsWith('menu.command.') && r.x>=prompt.x && r.x+r.width<=prompt.x+prompt.width
        && r.y>=prompt.y+prompt.height && r.y<prompt.y+prompt.height+24) {
        const key=r.id;
        if(!visible.has(key)) {
          const evidence={frame,id:r.id,source:entries.get(r.id).source,rectangle:[r.x,r.y,r.width,r.height],
            promptRectangle:[prompt.x,prompt.y,prompt.width,prompt.height],
            cells:r.cells.map(cell=>({cell,tile:metadata[cell*4]&255,physicalChr:metadata[cell*4+1]-1}))};
          visible.set(key,evidence); console.log(JSON.stringify({visible:evidence}));
        }
      }
    }
    if(samples.has(frame)) {
      const s=Buffer.from(core.exportSaveState(),'hex');
      assert.equal(s.subarray(0,4).toString(),'NESW');
      const ram=s.subarray(12,12+2048);
      if(process.env.CT2_DIAG_COMPACT) {
        const taskSp=ram[6];
        console.log(JSON.stringify({frame,pc:hex(s.readUInt16LE(10)),inputHeld:hex(ram[0x1c]),inputEdges:hex(ram[0x1e]),
          selector:hex(ram[0x61e]),action:hex(ram[0x43b]),context:hex(ram[0x621]),
          taskSp:hex(taskSp),taskStack:ram.subarray(0x100+taskSp+1,0x160).toString('hex'),count}));
        continue;
      }
      console.log(JSON.stringify({frame,buttons,pc:hex(s.readUInt16LE(10)),sp:hex(s[8]),
        zp:ram.subarray(0,0x40).toString('hex'), taskStacks:ram.subarray(0x100,0x200).toString('hex'),
        state0430:ram.subarray(0x430,0x450).toString('hex'),state0600:ram.subarray(0x600,0x630).toString('hex'),count}));
    }
  }
  const output=new URL(`../artifacts/ct2-action-diagnostic-${label}.png`,import.meta.url);
  assert.ok(!fs.existsSync(output),'Never overwrite an existing artifact');
  await sharp(Buffer.from(new Uint8Array(core.getWasmMemory().buffer,core.getFrameBufferPtr(),core.getFrameBufferLen())),
    {raw:{width:256,height:240,channels:4}}).resize(768,720,{kernel:'nearest'}).png().toFile(fileURLToPath(output));
  assert.equal(hash(rom),originalHash);
  console.log(JSON.stringify({label,count,visible:[...visible.values()],output:output.href,originalRomUnchanged:true}));
} finally { core.free(); }