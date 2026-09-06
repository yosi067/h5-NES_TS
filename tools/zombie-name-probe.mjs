import fs from 'node:fs';
import { initSync, EmuWasm } from '../src/wasm/nes_wasm.js';
import { decodeNameSource, seedFirstInventoryItem } from './zombie-name-source.mjs';
import { ZOMBIE_HUNTER_HASH } from '../src/game-profiles/verified-cell-menus.ts';
const root = new URL('../',import.meta.url);
const rom = fs.readFileSync(new URL('roms/Zombie Hunter (Japan).nes',root));
initSync({module:fs.readFileSync(new URL('src/wasm/nes_wasm_bg.wasm',root))});
const names = decodeNameSource(rom);
const core = new EmuWasm(); core.loadRom(rom); core.enableTextObserver(true);
core.setGameProfileTuning(JSON.stringify({profileId:'zombie-hunter-jp',maxLevelOnNewGame:false,maxMoneyOnNewGame:false}));
for(let frame=0;frame<=710;frame++) {
  core.setButton(0,3,[120,121,240,241,420,421].includes(frame));
  core.setButton(0,0,[600,601,670,671].includes(frame));
  core.frame(); core.consumeAudioSamples();
}
const base = core.exportPersistentSaveState();
core.reset();
for(let frame=0;frame<=710;frame++) {
  core.setButton(0,3,[120,121,240,241,420,421].includes(frame));
  core.setButton(0,5,[630,631].includes(frame));
  core.setButton(0,0,[600,601,670,671].includes(frame));
  core.frame(); core.consumeAudioSamples();
}
const discardBase = core.exportPersistentSaveState();
for (const name of names) {
  const positions = new Map(); const buffers = new Map();
  for(const [action,state] of [['use',base],['discard',discardBase]]) {
  core.importPersistentSaveState(state); seedFirstInventoryItem(core,name.selector);
  for(let frame=711;frame<=870;frame++) {
    core.setButton(0,0,[750,751].includes(frame));core.frame();core.consumeAudioSamples();
    const metadata=core.getTextFrameMetadata(), buffer=[...core.getZombieMenuSource()];
    const key=action+buffer.join(','); if(!buffers.has(key)) buffers.set(key,{action,frame,buffer});
    const width=name.tiles[0].length;
    for(let row=19;row<26;row++) for(let col=14;col+width<=30;col++) {
      const cells=name.tiles.flatMap((line,y)=>line.map((tile,x)=>({cell:(row+y)*32+col+x,tile,chr:0x7000+tile*16})));
      if(!cells.every(c=>metadata[c.cell*4]!==0xffffffff && (metadata[c.cell*4]&255)===c.tile && metadata[c.cell*4+1]===c.chr+1)) continue;
      const pos=`${action}:${row}/${col}`;
      if(!positions.has(pos)) positions.set(pos,{action,frame,row,col,cells});
    }
  }
  }
  name.runtime={kind:'TEST-ONLY seeded inventory $D8; original native use/discard handlers; not natural acquisition',positions:[...positions.values()],buffers:[...buffers.values()]};
  console.log(name.selector,name.source,name.runtime.positions.map(p=>`${p.row}/${p.col}@${p.frame}`).join(' ')||'NOT RENDERED');
}
core.free();
fs.writeFileSync(new URL('artifacts/zombie-name-source-runtime.json',root),JSON.stringify({sourceSha256:ZOMBIE_HUNTER_HASH,names},null,2)+'\n');