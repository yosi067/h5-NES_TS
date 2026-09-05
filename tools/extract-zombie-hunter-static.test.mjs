import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractStaticProgramData, findProgramCopySites } from './extract-zombie-hunter-static.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const romPath = path.join(root, 'roms', 'Zombie Hunter (Japan).nes');

test('extracts pointer-referenced Zombie Hunter streams without runtime execution', () => {
  const report = extractStaticProgramData(romPath);
  const tableA = report.pointerTables.find(table => table.id === 'program-table-a');
  const tableB = report.pointerTables.find(table => table.id === 'program-table-b');

  assert.equal(report.status, 'static-program-extracted');
  assert.equal(report.extractionPolicy.requiresRuntimeExecution, false);
  assert.equal(report.counts.pointerTables, 2);
  assert.equal(report.counts.staticEntries, 74);
  assert.equal(report.counts.textCandidates, 61);
  assert.equal(tableA.entries.length, 34);
  assert.equal(tableA.entries[0].pointer, '0x8F76');
  assert.equal(tableA.entries[0].stream.decodedText.trim(), 'STORY');
  assert.equal(tableB.entries.length, 40);
  assert.equal(tableB.entries[0].stream.decodedText.trim(), 'PRODUCE');
  assert.equal(tableB.entries[1].stream.decodedText.trim(), 'KENICHI KAI');
  assert.equal(tableB.entries[37].stream.decodedText.trim(), 'MEDIA WORK CORP+');

  assert.equal(report.counts.programCopySites, 17);
  assert.equal(report.counts.distinctProgramCopySources, 7);
  assert.equal(report.programCopySites.filter(site => site.routine === 'copy-stream').length, 13);
  assert.equal(report.programCopySites.filter(site => site.routine === 'copy-stream-with-control-flags').length, 4);
  assert.equal(report.programCopySites[0].callerPc, '0x867E');
  assert.equal(report.programCopySites[0].sourceCpuAddress, '0x8ED2');
  assert.equal(report.programCopySites[0].source.raw[0], 0x00);
  assert.equal(report.programCopySites.at(-1).sourceCpuAddress, '0x8D6F');
  assert.equal(report.programCopySites.some(site => site.sourceCpuAddress === '0x8D51'), true);

  assert.equal(findProgramCopySites({
    prg: new Uint8Array(0x4000),
  }).length, 0);

  for (const entry of report.entries) {
    assert.deepEqual(entry.source.records.flatMap(record => record.raw), entry.source.raw);
    assert.deepEqual(entry.source.roundTrip, entry.source.raw);
    assert.equal(entry.verification.runtimeConfirmed, false);
  }
});