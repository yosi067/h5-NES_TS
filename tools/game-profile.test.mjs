import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';
import JSZip from 'jszip';
import {
  compileGmod,
  exportJsonl,
  exportXliff,
  importJsonl,
  importXliff,
  readJsonc,
  verifyProfileAgainstRom,
} from './game-profile.mjs';
import { rasterizeNesGlyph } from './compile-captain-tsubasa-2.mjs';

const require = createRequire(import.meta.url);
const RomPatcher = require('rom-patcher/rom-patcher-js/RomPatcher');
const BinFile = require('rom-patcher/rom-patcher-js/modules/BinFile');

function createBps(source, target) {
  return Buffer.from(RomPatcher.createPatch(
    new BinFile(Uint8Array.from(source)),
    new BinFile(Uint8Array.from(target)),
    'bps',
  ).export()._u8array);
}

function catalog(target = '') {
  return {
    schemaVersion: 1,
    profileId: 'test-game',
    sourceLocale: 'ja-JP',
    targetLocale: 'zh-TW',
    categories: ['dialogue', 'interface', 'menu'],
    units: [
      {
        id: 'dialogue.0001',
        category: 'dialogue',
        source: '{player} シュート',
        target,
        context: 'Opening match',
        placeholders: ['{player}'],
      },
      {
        id: 'interface.0001',
        category: 'interface',
        source: 'スタート',
        target: '',
        context: 'Title menu',
        placeholders: [],
      },
      {
        id: 'title.menu.0001',
        category: 'menu',
        source: 'KICK OFF',
        target: '',
        context: 'Title menu option',
        placeholders: [],
      },
    ],
  };
}

const profile = {
  schemaVersion: 1,
  id: 'test-game',
  game: { sha256: '00'.repeat(32), mapper: 0 },
  prgReadOverlays: [],
  chrReadOverlays: [],
  memoryWrites: [],
};

const presentation = {
  schemaVersion: 1,
  profileId: 'test-game',
  inputArmFrame: 60,
  cues: [{
    id: 'title',
    trigger: { type: 'frame', from: 60 },
    masks: [{ x: 8, y: 8, width: 80, height: 16 }],
    labels: [{ text: '開始', x: 48, y: 16, size: 12 }],
  }],
};

test('JSONL category export and import preserve stable units', () => {
  const exported = exportJsonl(catalog('{player} 射門'), 'dialogue');
  assert.match(exported, /dialogue\.0001/);
  assert.doesNotMatch(exported, /interface\.0001/);

  const menuExport = exportJsonl(catalog(), 'menu');
  assert.match(menuExport, /title\.menu\.0001/);
  assert.doesNotMatch(menuExport, /dialogue\.0001/);

  const merged = importJsonl(catalog(), exported);
  assert.equal(merged.units[0].target, '{player} 射門');
  assert.equal(merged.units[1].target, '');
});

test('XLIFF 2.1 round trip preserves targets', () => {
  const xliff = exportXliff(catalog('{player} 射門'));
  assert.match(xliff, /version="2.1"/);
  const merged = importXliff(catalog(), xliff);
  assert.equal(merged.units[0].target, '{player} 射門');
});

test('imports reject translations that remove protected placeholders', () => {
  const line = JSON.stringify({ ...catalog().units[0], target: '射門' });
  assert.throws(() => importJsonl(catalog(), line), /missing placeholder/);
});

test('Captain Tsubasa II registers title menus separately from interface labels', () => {
  const adapter = readJsonc('game-profiles/captain-tsubasa-2-jp/adapter.jsonc');
  const menuDomain = adapter.translationDomains.find(domain => domain.id === 'menus');
  assert.deepEqual(menuDomain, {
    id: 'menus',
    category: 'menu',
    sourceCatalog: 'translations.json',
    unitIdPrefixes: ['title.menu.'],
  });
  const translationCatalog = JSON.parse(
    require('node:fs').readFileSync('game-profiles/captain-tsubasa-2-jp/translations.json', 'utf8'),
  );
  assert.deepEqual(
    translationCatalog.units.filter(unit => unit.id.startsWith('title.menu.')).map(unit => unit.category),
    ['menu', 'menu'],
  );
});

test('compiled gmod contains manifest, runtime, and presentation payloads', async () => {
  const archive = await JSZip.loadAsync(await compileGmod(profile, presentation));
  const manifest = JSON.parse(await archive.file('manifest.json').async('string'));
  const runtime = JSON.parse(await archive.file('runtime.json').async('string'));
  const packagedPresentation = JSON.parse(await archive.file('presentation.json').async('string'));
  assert.equal(manifest.format, 'gmod');
  assert.equal(runtime.id, 'test-game');
  assert.equal(packagedPresentation.cues[0].labels[0].text, '開始');
});

test('compiled gmod v2 contains a validated BPS delta and ROM identities only', async () => {
  const source = Buffer.from([1, 2, 3]);
  const target = Buffer.from([1, 9, 3, 4]);
  const sourceSha256 = crypto.createHash('sha256').update(source).digest('hex');
  const archive = await JSZip.loadAsync(await compileGmod(profile, null, {
    sourceRomBytes: source,
    targetRomBytes: target,
    patchBytes: createBps(source, target),
  }));
  const manifest = JSON.parse(await archive.file('manifest.json').async('string'));

  assert.equal(manifest.formatVersion, 2);
  assert.equal(manifest.source.sha256, sourceSha256);
  assert.equal(manifest.target.sha256, crypto.createHash('sha256').update(target).digest('hex'));
  assert.ok(archive.file('patch.bps'));
  assert.equal(archive.file('runtime.json'), null);
  assert.equal(archive.file('source.rom'), null);
  assert.equal(archive.file('target.rom'), null);
});

test('ROM verification accepts only explicitly declared hash aliases', () => {
  const rom = Buffer.alloc(16 + 16 * 1024 + 8 * 1024);
  rom.set(Buffer.from('NES\x1a'), 0);
  rom[4] = 1;
  rom[5] = 1;
  const alias = crypto.createHash('sha256').update(rom).digest('hex');
  const aliasedProfile = { ...profile, game: { ...profile.game, sha256Aliases: [alias] } };
  assert.equal(verifyProfileAgainstRom(aliasedProfile, rom).sha256, alias);
  assert.throws(() => verifyProfileAgainstRom(profile, rom), /does not match/);
});

test('native Traditional Chinese glyphs compile to NES 2bpp tiles', async () => {
  const tile = await rasterizeNesGlyph('翼');
  assert.equal(tile.length, 16);
  assert.deepEqual(tile.slice(0, 8), tile.slice(8));
  assert.ok(tile.some(byte => byte !== 0));
  assert.ok(tile.every(byte => (byte & 0x01) === 0));
});
