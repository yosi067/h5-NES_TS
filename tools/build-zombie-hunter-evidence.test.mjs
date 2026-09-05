import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVerifiedInventory } from './build-zombie-hunter-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const romPath = path.join(root, 'roms', 'Zombie Hunter (Japan).nes');

test('builds only the runtime-confirmed Zombie Hunter evidence entry', () => {
  const report = buildVerifiedInventory(romPath);
  const entry = report.verifiedEntries[0];

  assert.equal(report.status, 'partial-runtime-verified');
  assert.equal(report.counts.verifiedTextFamilies, 1);
  assert.equal(report.counts.verifiedVisibleGlyphs, 17);
  assert.equal(entry.id, 'title-push-start-botton');
  assert.equal(entry.verification.sourceCopyPc, '0x8B56');
  assert.equal(entry.verification.rendererPc, '0xF4A6');
  assert.equal(entry.source.parsedVisibleRuns.length, 23);
  assert.equal(entry.source.verifiedTextRuns[0].decoded, 'PUSH START BOTTON');
  assert.equal(entry.counts.parsedGlyphs, 229);
  assert.equal(entry.counts.visibleGlyphs, 17);
  assert.deepEqual(entry.source.records.flatMap(record => record.raw), entry.source.raw);
  assert.equal(report.translation.catalogCreated, false);
});