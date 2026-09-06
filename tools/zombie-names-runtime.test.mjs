import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {initSync,EmuWasm} from '../src/wasm/nes_wasm.js';
import {decodeNameSource,seedFirstInventoryItem} from './zombie-name-source.mjs';
import {locateVerifiedCellMenus,validateCellMenus,ZOMBIE_HUNTER_HASH} from '../src/game-profiles/verified-cell-menus.ts';
import {submenuRoutes} from './zombie-submenu-routes.mjs';
const root=new URL('../',import.meta.url), read=p=>fs.readFileSync(new URL(p,root));
const rom=read('roms/Zombie Hunter (Japan).nes'), catalog=JSON.parse(read('public/game-profiles/zombie-hunter-jp/menus.json'));
initSync({module:read('src/wasm/nes_wasm_bg.wasm')});
const sample=core=>({metadata:core.getTextFrameMetadata(),provenance:new Uint16Array(core.getWasmMemory().buffer,core.getTextProvenancePtr(),61440).slice(),source:core.getZombieMenuSource()});
const locate=s=>locateVerifiedCellMenus(catalog,s.metadata,s.provenance,s.source);
function checkMasks(s,matches) {
  let pixels=0;
  for(const m of matches) for(const b of m.clips??[{x:m.x,y:m.y,width:m.entry.width*8,height:m.entry.height*8}]) {
    for(let y=b.y;y<b.y+b.height;y++) for(let x=b.x;x<b.x+b.width;x++) {
      const dx=x-m.x,dy=y-m.y;
      assert.ok(dx>=0&&dy>=0&&dx<m.entry.width*8&&dy<m.entry.height*8);
      const c=m.entry.cells[Math.floor(dy/8)*m.entry.width+Math.floor(dx/8)];
      assert.equal(s.metadata[c.cell*4]&255,c.tile);assert.equal(s.metadata[c.cell*4+1],c.chr+1);
      assert.equal(s.provenance[y*256+x],(c.cell+1)|((dy%8)<<12));pixels++;
    }
  }
  return pixels;
}
function boot(action='use') {
  const core=new EmuWasm();assert.ok(core.loadRom(rom));core.enableTextObserver(true);
  core.setGameProfileTuning(JSON.stringify({profileId:'zombie-hunter-jp',maxLevelOnNewGame:false,maxMoneyOnNewGame:false}));
  for(let f=0;f<=710;f++) {
    core.setButton(0,3,[120,121,240,241,420,421].includes(f));
    core.setButton(0,5,action==='discard'&&[630,631].includes(f));
    core.setButton(0,0,[600,601,670,671].includes(f));core.frame();core.consumeAudioSamples();
  }
  return core;
}
test('all 32 source selectors: native use/discard, level 1 and 8, CHR/provenance, source-authorized transitions',()=>{
  assert.equal(crypto.createHash('sha256').update(rom).digest('hex'),ZOMBIE_HUNTER_HASH);
  const names=decodeNameSource(rom);assert.equal(names.length,32);validateCellMenus(catalog);
  assert.deepEqual(catalog.names.map(n=>[n.selector,n.tiles]),names.map(n=>[n.selector,n.tiles]));
  const report=[];let partialFrames=0,checkedPixels=0;const seen=new Set();
  for(const action of ['use','discard']) {
    const core=boot(action),base=core.exportSaveState();
    try {
      for(const level of [0,7]) for(const name of names) {
        assert.ok(core.importSaveState(base));seedFirstInventoryItem(core,name.selector|(level<<5));
        const frames=[],partial=[];let last='';
        for(let frame=711;frame<=870;frame++) {
          core.setButton(0,0,[750,751].includes(frame));core.frame();core.consumeAudioSamples();
          const s=sample(core),matches=locate(s);
          checkedPixels+=checkMasks(s,matches);
          const named=matches.filter(m=>m.entry.source===name.source);
          if(named.length) {seen.add(name.selector);const key=named.map(m=>`${m.x},${m.y},${!!m.partial}`).join(';');
            if(key!==last){frames.push({frame,matches:named.map(m=>({id:m.entry.id,x:m.x,y:m.y,partial:!!m.partial}))});last=key;}}
          if(matches.some(m=>m.partial)){partialFrames++;partial.push(frame);}
          if(frame===780&&action==='discard') assert.ok(named.some(m=>!m.partial),`${name.selector} level ${level+1}: missing discarded name`);
        }
        report.push({selector:name.selector,source:name.source,translation:catalog.names[name.selector].translation,action,level:level+1,frames,partial});
      }
    } finally {core.free();}
  }
  assert.equal(seen.size,32);assert.ok(partialFrames>0,'must exercise actual partial frames');
  fs.writeFileSync(new URL('artifacts/zombie-names-localization-runtime.json',root),JSON.stringify({sourceSha256:ZOMBIE_HUNTER_HASH,
    mode:'TEST-ONLY seeded $D8; original use/discard rendering, NOT natural acquisition; no text/ROM injection',framesChecked:128*160,partialFrames,checkedPixels,report},null,2)+'\n');
});
test('natural menu transitions: current pixel clips and clear; report partial coverage without assuming it',()=>{
  const report=[];
  for(const route of submenuRoutes) {
    const core=new EmuWasm();core.loadRom(rom);core.enableTextObserver(true);
    const events=[...route.events,[670,0],[700,7],[730,route.id==='equipment'?4:1],[860,3]];
    let partialFrames=0,checkedPixels=0;const samples=[];
    try {
      for(let frame=0;frame<=950;frame++) {
        for(const [f,b] of events){if(frame===f)core.setButton(0,b,true);if(frame===f+2)core.setButton(0,b,false);}
        core.frame();core.consumeAudioSamples();if(frame<410)continue;
        const s=sample(core),matches=locate(s);checkedPixels+=checkMasks(s,matches);
        for(const m of matches.filter(m=>m.partial)) {
          partialFrames++;samples.push({frame,id:m.entry.id,source:m.entry.source});
          assert.ok(!locate({...s,source:new Uint8Array(128).fill(36)}).some(n=>n.entry.id===m.entry.id&&n.partial));
          const wrong=s.metadata.slice();wrong[m.entry.cells[0].cell*4+1]+=4096;
          assert.ok(!locate({...s,metadata:wrong}).some(n=>n.entry.id===m.entry.id));
          const covered=s.provenance.slice();covered.fill(0);
          assert.deepEqual(locate({...s,provenance:covered}),[]);
        }
        if(frame===950)assert.ok(matches.every(m=>m.entry.group==='hud'));
      }
      report.push({route:route.id,framesChecked:541,partialFrames,checkedPixels,samples});
    } finally {core.free();}
  }
  // These four input-only routes do not reach the seeded names which expose
  // partial columns. Do not invent natural-play prefix coverage. The first
  // test independently requires actual native partial frames with seeded IDs.
  assert.equal(report.length,4);
  assert.ok(report.every(r=>r.framesChecked===541 && r.checkedPixels>0));
  fs.writeFileSync(new URL('artifacts/zombie-natural-partial-runtime.json',root),JSON.stringify({mode:'natural input-only; no inventory injection',report},null,2)+'\n');
});
test('synthetic adversarial variants of a native name frame: prefixes, dakuten, unknowns, sprite pixels, restore',()=>{
  const core=boot('discard');
  try {
    seedFirstInventoryItem(core,17);
    for(let f=711;f<=780;f++){core.setButton(0,0,[750,751].includes(f));core.frame();core.consumeAudioSamples();}
    const full=sample(core), original=locate(full).find(m=>m.entry.source==='おおいかずち');assert.ok(original);
    const partial={...full,metadata:full.metadata.slice()};
    const width=original.entry.width;
    for(let x=2;x<width;x++) for(let y=0;y<2;y++) {
      const cell=original.entry.cells[y*width+x].cell;
      partial.metadata[cell*4]=(partial.metadata[cell*4]&~255)|36;partial.metadata[cell*4+1]=0x7241;partial.metadata[cell*4+3]=0;
    }
    const m=locate(partial).find(m=>m.entry.source==='おおいかずち');assert.ok(m?.partial);checkMasks(partial,[m]);
    assert.ok(!locate(partial).some(m=>m.entry.source==='いかずち'));
    assert.ok(!locate({...partial,source:new Uint8Array(128).fill(36)}).some(m=>m.entry.source==='おおいかずち'));
    const unknown={...partial,source:partial.source.slice()};unknown.source[16+width-1]=114;
    assert.ok(!locate(unknown).some(m=>m.entry.source==='おおいかずち'));
    const wrong=partial.metadata.slice();wrong[original.entry.cells[width+3].cell*4]=(wrong[original.entry.cells[width+3].cell*4]&~255)|64;
    const safeUnknown=locate({...partial,metadata:wrong}).find(m=>m.entry.source==='おおいかずち');
    if(safeUnknown)checkMasks({...partial,metadata:wrong},[safeUnknown]);
    const cursor=partial.provenance.slice();cursor[m.y*256+m.x+1]=0;
    const clipped=locate({...partial,provenance:cursor}).find(m=>m.entry.source==='おおいかずち');assert.ok(clipped);checkMasks({...partial,provenance:cursor},[clipped]);
    const temp=core.exportSaveState(),permanent=core.exportPersistentSaveState();
    for(const restore of [()=>core.importSaveState(temp),()=>core.importPersistentSaveState(permanent)]){
      assert.ok(restore());assert.deepEqual(locate(sample(core)),[]);core.frame();core.consumeAudioSamples();assert.ok(locate(sample(core)).some(m=>m.entry.source==='おおいかずち'));}
    core.reset();assert.deepEqual(locate(sample(core)),[]);
    const invalid=structuredClone(catalog);invalid.names[0].tiles[0][0]=255;assert.throws(()=>validateCellMenus(invalid));
    const unknownRom=Buffer.from(rom);unknownRom[unknownRom.length-1]^=1;
    assert.ok(core.loadRom(unknownRom));assert.equal(core.getZombieMenuSource().length,0);
    assert.equal(core.enableTextObserver(true),false);
  }finally{core.free();}
});