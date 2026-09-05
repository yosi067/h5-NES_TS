// Fresh-boot input experiments only; never imports states or changes emulator/ROM.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const cases = [
  ['idle', [], 'A'],
  ['legacy-A-arrows', ['13620:5:1','13740:5:1','13860:4:1','13980:7:1','14100:1:1'], 'A'],
  ['up-one-even', ['15000:4:1'], 'A'],
  ['up-one-odd', ['15001:4:1'], 'A'],
  ['up-four', ['15000:4:4'], 'A'],
  ['down-four', ['15000:5:4'], 'A'],
  ['left-four', ['15000:6:4'], 'A'],
  ['right-four', ['15000:7:4'], 'A'],
  ['select-four', ['15000:2:4'], 'A'],
  ['A-four', ['15000:0:4'], 'A'],
  ['legacy-B-arrows', ['13620:5:4','13800:0:4','13980:4:4','14160:6:4','14340:7:4','14520:1:4'], 'B'],
];
const report=[];
for(const [label,pulses,route] of cases) {
  const run=spawnSync(process.execPath,['tools/ct2-action-input-diagnostic.mjs',...pulses],{
    cwd:new URL('..',import.meta.url), encoding:'utf8',maxBuffer:8*1024*1024,
    env:{...process.env,CT2_DIAG_LABEL:`matrix-${label}`,CT2_DIAG_COMPACT:'1',CT2_DIAG_END:'15010',CT2_DIAG_ROUTE:route}
  });
  assert.equal(run.status,0,`${label}: ${run.stderr}\n${run.stdout}`);
  const records=run.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
  const summary=records.at(-1);
  report.push({label,route,pulses,summary,records});
  console.log(JSON.stringify({label,...summary,firstWriter:records.find(r=>r.writer)}));
}
const output=new URL('../artifacts/ct2-action-input-diagnostic-report.json',import.meta.url);
assert.ok(!fs.existsSync(output),'Never overwrite existing artifacts');
fs.writeFileSync(output,JSON.stringify(report,null,2));
const find=label=>report.find(r=>r.label===label);
for(const label of ['idle','select-four','A-four']) assert.equal(find(label).summary.count,0,label);
for(const [label,text] of [['up-four','ドリブル'],['left-four','パス'],['right-four','シュート']]) {
  assert.ok(find(label).summary.visible.some(r=>r.source===text),`${label}: original action column must show ${text}`);
  assert.ok(find(label).summary.count>0);
}
console.log('PASS: idle/A/Select controls and real original dribble/pass/shoot commands.');