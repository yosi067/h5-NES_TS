import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractTsubasaStats } from './ct2-stats-research.mjs';
import { buildDefaultLocalization } from './build-ct2-localization.mjs';
import { auditTranslationFit } from './ct2-translation-fit.mjs';
const path = new URL('../roms/Captain Tsubasa II - Super Striker (Japan).nes', import.meta.url);
const evidence = JSON.parse(fs.readFileSync(new URL('../src/game-profiles/ct2-stats-evidence.json', import.meta.url), 'utf8'));

test('unsupported or patched ROM cannot become trusted stat evidence', () => {
  assert.throws(() => extractTsubasaStats(Buffer.alloc(16)), /header/);
  const fake = Buffer.alloc(16); fake.set([0x4e,0x45,0x53,0x1a]);
  assert.throws(() => extractTsubasaStats(fake), /SHA-256/);
});
test('shipped stat tables and zh-Hant selector labels equal original ROM extraction', {
  skip: process.env.CT2_TEST_ROM !== '1' ? 'set CT2_TEST_ROM=1; original ROM required' : false,
}, () => {
  const rom = fs.readFileSync(path), original = Buffer.from(rom);
  assert.deepEqual(extractTsubasaStats(rom), evidence);
  assert.deepEqual(rom, original);
  const modified = Buffer.from(rom); modified[16 + evidence.coefficientOffset] ^= 1;
  assert.throws(() => extractTsubasaStats(modified), /SHA-256/);
});

test('revised zh-Hant lines fit complete-line budgets and shipped catalog matches source', {
  skip: process.env.CT2_TEST_ROM !== '1' ? 'set CT2_TEST_ROM=1; original ROM required' : false,
}, () => {
  const built = buildDefaultLocalization();
  const shipped = JSON.parse(fs.readFileSync(new URL('../public/game-profiles/captain-tsubasa-2-jp/localization.json', import.meta.url), 'utf8'));
  assert.deepEqual(built.catalog, shipped);
  const lines = auditTranslationFit(built);
  for (const id of ['opening.intro.00.line.15', 'cutscenes-bank-04.05.line.72',
    'cutscenes-bank-04.05.line.98', 'cutscenes-bank-04.15.line.0', 'cutscenes-bank-05.02.line.238']) {
    const line = lines.find(line => line.line === id);
    assert.ok(line, id); assert.equal(line.excessPx, 0, id);
  }
  assert.equal(lines.filter(line => line.excessPx > 0).length, 9);
});