import fs from 'node:fs';
import {initSync,EmuWasm} from '../src/wasm/nes_wasm.js';
import {locateVerifiedCellMenus} from '../src/game-profiles/verified-cell-menus.ts';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root));
initSync({module:read('src/wasm/nes_wasm_bg.wasm')});
const c=new EmuWasm();c.loadRom(read('roms/Zombie Hunter (Japan).nes'));c.enableTextObserver(true);
const catalog=JSON.parse(read('public/game-profiles/zombie-hunter-jp/menus.json'));
for(let f=0;f<950;f++) {
  c.setButton(0,3,[120,121,240,241,420,421].includes(f));
  c.setButton(0,5,process.argv.includes('--discard') && [630,631].includes(f));
  c.setButton(0,0,[600,601,670,671,750,751].includes(f));c.frame();c.consumeAudioSamples();if(f<410)continue;
  const s=c.getZombieMenuSource(),m=c.getTextFrameMetadata();
  const p=new Uint16Array(c.getWasmMemory().buffer,c.getTextProvenancePtr(),61440);
  for (const match of locateVerifiedCellMenus(catalog,m,p,s).filter(m=>m.partial)) console.log(f,'partial',match.entry.id,match.entry.source);
  for(const e of catalog.entries.filter(e=>['pause','items','items-select','items-helmet'].includes(e.group))) {
    if(!e.cells.every(k=>s[(Math.floor(k.cell/32)-19)*16+k.cell%32-14]===k.tile))continue;
    const bad=e.cells.filter(k=>(m[k.cell*4]&255)!==k.tile||m[k.cell*4+1]!==k.chr+1);
    if(bad.length) console.log(f,e.id,'match',locateVerifiedCellMenus(catalog,m,p,s).some(a=>a.entry.id===e.id),bad.map(k=>[k.cell,k.tile,...m.slice(k.cell*4,k.cell*4+4)]));
  }
}
c.free();