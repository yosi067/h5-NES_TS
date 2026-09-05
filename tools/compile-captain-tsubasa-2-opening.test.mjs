import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { buildTranslatedOpeningRom } from './compile-captain-tsubasa-2-opening.mjs';
import { buildTranslatedDictionaryRom, rasterizeNesGlyph } from './compile-captain-tsubasa-2.mjs';

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

test('semantic opening build patches PRG and native CHR without changing its source buffer', async () => {
  const source = Buffer.alloc(16 + 0x4000 + 0x2000);
  source.write('NES\x1a', 0, 'binary');
  source[4] = 1;
  source[5] = 1;
  const sceneOffset = 0x20;
  const sceneBytes = Buffer.from([1, 2, 0xfe, 0x20, 0x80, 0xff, 0xff]);
  sceneBytes.copy(source, 16 + sceneOffset);
  const original = Buffer.from(source);
  const sourceHash = sha256(source);
  const adapter = { adapterId: 'captain-tsubasa-2-jp', sourceRoms: [{ sha256: sourceHash }] };
  const compiled = {
    adapterId: adapter.adapterId,
    sourceSha256: '11'.repeat(32),
    sceneId: 'opening.intro.00',
    sourceSceneSha256: sha256(sceneBytes),
    physicalPrgOffset: sceneOffset,
    encodedLength: sceneBytes.length,
    rawBytes: [1, 0xfe, 0x20, 0x80, 0xff, 0xff, 0xff],
    glyphs: [{ code: 0, character: ' ' }, { code: 1, character: '翼' }],
  };
  const glyph = Buffer.alloc(16, 0xa5);
  const built = await buildTranslatedOpeningRom(source, adapter, compiled, async () => glyph);
  assert.deepEqual(source, original);
  assert.deepEqual([...built.targetRom.subarray(16 + sceneOffset, 16 + sceneOffset + 7)], compiled.rawBytes);
  assert.deepEqual(built.targetRom.subarray(16 + 0x4000 + 16, 16 + 0x4000 + 32), Buffer.alloc(16, 0xa5));
  assert.equal(built.glyphCount, 1);
  assert.equal(built.fontBytes, 16);
  assert.notEqual(built.targetSha256, built.sourceSha256);
});

test('guarded dictionary build applies PRG overlays without changing its source buffer', async () => {
  const source = Buffer.alloc(16 + 0x4000 + 0x2000);
  source.write('NES\x1a', 0, 'binary');
  source[4] = 1;
  source[5] = 1;
  source[16 + 0x20] = 0x01;
  source[16 + 0x21] = 0xfc;
  const original = Buffer.from(source);
  const sourceSha256 = sha256(source);
  const adapter = { adapterId: 'captain-tsubasa-2-jp', sourceRoms: [{ sha256: sourceSha256 }] };
  const compiled = {
    adapterId: adapter.adapterId,
    dictionaryId: 'words',
    sourceSha256,
    recordTerminator: 0xfc,
    records: [{
      id: 'words.001',
      physicalPrgOffset: 0x20,
      sourceBytes: [0x01, 0xfc],
      rawBytes: [0x02, 0xfc],
    }],
    overlays: [{ id: 'words.001.00', offset: 0x20, expectedOriginal: 0x01, value: 0x02 }],
    glyphs: [{ code: 0x02, character: '翼' }],
  };
  const glyphTile = Buffer.from(await rasterizeNesGlyph('翼'));
  const built = await buildTranslatedDictionaryRom(source, adapter, compiled);
  assert.deepEqual(source, original);
  assert.equal(built.targetRom[16 + 0x20], 0x02);
  assert.equal(built.overlayCount, 1);
  assert.deepEqual(
    built.targetRom.subarray(16 + 0x4000 + 0x20, 16 + 0x4000 + 0x30),
    glyphTile,
  );
  assert.equal(built.chrOverlayCount, glyphTile.filter(byte => byte !== 0).length);
  assert.notEqual(built.targetSha256, built.sourceSha256);
  const alias = Buffer.from(source);
  alias[8] = 0x42;
  const aliasAdapter = {
    ...adapter,
    sourceRoms: [
      { sha256: sourceSha256 },
      { sha256: sha256(alias) },
    ],
  };
  const aliasBuilt = await buildTranslatedDictionaryRom(
    alias,
    aliasAdapter,
    compiled,
    async () => Buffer.alloc(16, 0xa5),
  );
  assert.equal(aliasBuilt.targetRom[16 + 0x20], 0x02);
  compiled.overlays[0].expectedOriginal = 0xff;
  await assert.rejects(() => buildTranslatedDictionaryRom(source, adapter, compiled), /expected 0xff/);
});