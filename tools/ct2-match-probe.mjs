// Original-ROM, controller-only diagnostic. Never writes ROM/RAM or test files.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { initSync, EmuWasm } from '../src/wasm/nes_wasm.js';
import { parseTable } from './captain-tsubasa-2-adapter.mjs';
import { TextObservationState, locateBattleTranslations } from '../src/game-profiles/localization.ts';
import { locateMenuTranslations } from '../src/game-profiles/menu-localization.ts';
const read = p => fs.readFileSync(new URL(p, import.meta.url));
const rom = read('../roms/Captain Tsubasa II - Super Striker (Japan).nes');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
assert.equal(hash(rom), 'bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746');
const writerEvidence=[
  [0x30a75,'a446b1302024c5','special-action dictionary glyph loop'],
  [0x30d71,'b130c9e0b00f9848b1302024c5','player-name dictionary glyph loop'],
  [0x30661,'a908202986a92e4c2986','literal player honorific くん'],
  [0x305ef,'ace505eee505','FC next-row cursor skips one byte'],
].map(([offset,hex,meaning])=>{
  assert.equal(rom.subarray(16+offset,16+offset+hex.length/2).toString('hex'),hex);
  return {offset,hex,meaning};
});
const runtime = JSON.parse(read('../public/game-profiles/captain-tsubasa-2-jp/text-runtime.json'));
const entries = new Map(JSON.parse(read('../public/game-profiles/captain-tsubasa-2-jp/localization.json')).entries.map(e => [e.id,e]));
const menus = JSON.parse(read('../public/game-profiles/captain-tsubasa-2-jp/menus.json'));
const table = parseTable(read('../game-profiles/captain-tsubasa-2-jp/text.tbl').toString());
for (const [k,v] of parseTable(read('../game-profiles/captain-tsubasa-2-jp/localization-extra.tbl').toString())) table.set(k,v);
const glyphs = new Map();
for (const [b,t] of table) if (b < 0xe0 && !t.startsWith('{')) {
  const key = `${b < 0xa0 ? 0 : b < 0xc8 ? 0x94 : 0x95}:${b < 0xa0 ? b : runtime.lowerTiles[b]}`;
  glyphs.set(key, t);
}
initSync({ module: read('../src/wasm/nes_wasm_bg.wasm') });
const core = new EmuWasm(), reference = new EmuWasm(), state = new TextObservationState(runtime);
const end = Number(process.env.CT2_PROBE_END ?? 16900);
const pulses = JSON.parse(process.env.CT2_PROBE_INPUT ?? '[[14110,6,4],[14130,0,4],[14310,7,40],[14360,4,30],[14440,0,4],[15410,7,4],[15430,0,4],[15610,5,4],[15630,0,4]]'); // [frame, button, duration]
const out = process.env.CT2_PROBE_OUT ?? 'artifacts/ct2-match-probe';
const seen = new Set(), events = [], translations = [], samples = [];
const observedRuns=new Map();
let snapshotChecks=0;
// Execute the real renderer with deterministic Canvas metrics, not fabricated
// glyph events. This is draw-call proof, NOT browser font/visual validation.
const dom = new JSDOM('<div><canvas></canvas></div>', {url:'http://localhost/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,
  getComputedStyle:dom.window.getComputedStyle.bind(dom.window),
  ResizeObserver:class {observe(){} disconnect(){}}, ImageData:undefined});
const draws=[], painted=new Map();
const context={font:'',fillStyle:'',setTransform(){},clearRect(){},fillRect(){},
  fillText(text,x,y){draws.push({text,x,y});},measureText(text){return {width:[...text].length*12};}};
dom.window.HTMLCanvasElement.prototype.getContext=()=>context;
const screen=document.querySelector('canvas'); screen.width=256; screen.height=224;
screen.getBoundingClientRect=screen.parentElement.getBoundingClientRect=()=>({left:0,top:0,width:256,height:224});
const bundled=await build({entryPoints:['src/game-profiles/text-overlay.ts'],bundle:true,write:false,format:'esm',platform:'node',define:{'import.meta.env.DEV':'false'}});
const {NesTextOverlay}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const overlay=new NesTextOverlay(screen,{runtime,catalog:{entries:[...entries.values()]},menus});
let batch=new Uint32Array();
const take=core.takeTextEvents.bind(core);
core.takeTextEvents=()=>{batch=take();return batch;};
let previous = '';
try {
  assert.ok(core.loadRom(rom)); assert.ok(core.enableTextObserver(true));
  // Default supported read-side tuning; player/skill identities are unchanged.
  core.setGameProfileTuning(JSON.stringify({profileId:'captain-tsubasa-2-jp',tsubasaLevel:64}));
  assert.ok(reference.loadRom(rom)); assert.ok(reference.enableTextObserver(true));
  reference.setGameProfileTuning(JSON.stringify({profileId:'captain-tsubasa-2-jp',tsubasaLevel:64}));
  for (let frame = 0; frame <= end; frame++) {
    for (const c of [core,reference]) for (let b = 0; b < 8; b++) c.setButton(0,b,
      (b === 3 && (frame >= 600 && frame < 604 || frame >= 900 && frame < 904))
      || (b === 0 && frame >= 1100 && frame < 13300 && frame % 120 < 4 && (frame < 9500 || frame >= 11200))
      || (b === 5 && [11000,11020,11040].includes(frame))
      || pulses.some(([f,button,n=4]) => b === button && frame >= f && frame < f+n));
    core.frame();
    reference.frame();
    // Both have identical provenance enabled; the reference never consumes
    // source events or runs the overlay. Not an observer-on/off comparison.
    if(frame%600===0) {
      assert.equal(core.exportPersistentSaveState(),reference.exportPersistentSaveState(),`snapshot ${frame}`);
      const pixels=c=>new Uint8Array(c.getWasmMemory().buffer,c.getFrameBufferPtr(),c.getFrameBufferLen());
      assert.deepEqual(pixels(core),pixels(reference),`native framebuffer ${frame}`); snapshotChecks++;
    }
    if(frame>=12800) {
      draws.length=0; overlay.render(core,8);
      for(const {text,x,y} of draws) {
        assert.ok(x>=0 && y<240);
        if(!painted.has(text)) painted.set(text,frame);
      }
    } else core.takeTextEvents();
    state.consume(batch);
    if (frame >= 12800) for (let i=0;i<batch.length;i+=4) if ([3,6].includes(batch[i])) events.push({frame,words:[...batch.slice(i,i+4)]});
    if (frame < 12800) continue;
    const metadata = core.getTextFrameMetadata();
    const provenance = new Uint16Array(core.getWasmMemory().buffer,core.getTextProvenancePtr(),61440);
    for (const row of locateBattleTranslations(state,entries,provenance,metadata)) if ([...row.text].length*12 <= row.width) {
      const ids=[...new Set(row.glyphs.map(g=>g.run.id))];
      if(draws.some(d=>d.text===row.text)) for(const id of ids) if(!observedRuns.has(id)) observedRuns.set(id,{frame,text:row.text});
      if(!seen.has(row.text)) { seen.add(row.text); translations.push({frame,text:row.text,ids}); }
    }
    if (frame % 30 && frame !== end) continue;
    const background = new Uint16Array(core.getWasmMemory().buffer,core.getTextBackgroundProvenancePtr(),61440);
    const visible = new Set([...background].map(t=>(t&0xfff)-1));
    const native = c => {
      const [p,chr] = metadata.subarray(c*4,c*4+2);
      return p && p !== 0xffffffff && runtime.fontAliases[p&255]?.includes(chr-1);
    };
    const rows=[];
    for(let row=0;row<59;row++) {
      let text='';
      for(let x=0;x<32;x++) {
        const c=row*32+x;
        text += visible.has(c) && visible.has(c+32) && native(c) && native(c+32)
          ? glyphs.get(`${metadata[c*4]&255}:${metadata[(c+32)*4]&255}`) ?? '·' : '·';
      }
      if (/[ぁ-ヿ]/u.test(text)) rows.push({row,text});
    }
    const key=JSON.stringify(rows);
    if(key!==previous) { samples.push({frame,rows,menus:locateMenuTranslations(menus,background,metadata).map(r=>r.translation)}); previous=key; }
  }
  const rgba=Buffer.from(new Uint8Array(core.getWasmMemory().buffer,core.getFrameBufferPtr(),core.getFrameBufferLen()));
  await sharp(rgba,{raw:{width:256,height:240,channels:4}}).resize(768,720,{kernel:'nearest'}).png().toFile(`${out}.png`);
  if(process.env.CT2_PROBE_VERIFY==='1' || process.argv.includes('--verify')) {
    for(const text of ['抽球射門','抽球射門！！','抽球射門！','大空翼','吉爾','接住傳球！']) assert.ok(painted.has(text),`actual renderer: ${text}`);
    assert.ok(painted.has('大空翼的'),'complete dynamic player name + honorific + commentary');
    for(const id of ['battle-clouds.58.text.0004','battle-clouds.75.text.0004']) assert.ok(observedRuns.has(id),`reception variant ${id}`);
    assert.ok(!draws.some(d=>d.text==='抽球射門'),'retired menu must not remain drawn');
    core.reset();draws.length=0;overlay.render(core,8);assert.equal(draws.length,0,'reset clears translation');
  }
  fs.writeFileSync(`${out}.json`,JSON.stringify({hash:hash(rom),end,pulses,writerEvidence,snapshotChecks,tuning:core.getGameProfileTuning(),painted:Object.fromEntries(painted),observedRuns:Object.fromEntries(observedRuns),translations,samples,events},null,2));
  console.log(JSON.stringify({end,painted:Object.fromEntries(painted),translations,samples:samples.slice(-4)},null,2));
  assert.equal(hash(rom),'bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746');
} finally { overlay.dispose();core.free();reference.free();dom.window.close(); }