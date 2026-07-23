import { describe, expect, it } from 'vitest';
import {
  N64_REBUILT_ASSET_VERSION,
  getN64RebuiltAssetFileName,
  getN64RuntimeAssetUrl,
  getN64RuntimeImportUrl,
  shouldRetryN64WithNpm,
} from '../src/n64/runtime-assets';

describe('N64 runtime asset URLs', () => {
  it('publishes every rebuilt runtime layer under the same physical version', () => {
    expect(getN64RebuiltAssetFileName('main.bundle.js'))
      .toBe(`main.bundle.${N64_REBUILT_ASSET_VERSION}.js`);
    expect(getN64RuntimeAssetUrl('/h5-NES_TS/', 'main.bundle.js', true))
      .toBe(`/h5-NES_TS/n64-fork/main.bundle.${N64_REBUILT_ASSET_VERSION}.js`);
    expect(getN64RuntimeAssetUrl('/h5-NES_TS/', 'index.7f0ebbf78c.wasm', true))
      .toBe(`/h5-NES_TS/n64-fork/index.7f0ebbf78c.${N64_REBUILT_ASSET_VERSION}.wasm`);
    expect(getN64RuntimeAssetUrl('/h5-NES_TS/', 'index.7f0ebbf78c.data', true))
      .toBe(`/h5-NES_TS/n64-fork/index.7f0ebbf78c.${N64_REBUILT_ASSET_VERSION}.data`);
  });

  it('leaves npm runtime asset URLs unchanged', () => {
    expect(getN64RuntimeAssetUrl('/h5-NES_TS/', 'index.7f0ebbf78c.wasm', false))
      .toBe('/h5-NES_TS/n64-mupen/index.7f0ebbf78c.wasm');
  });

  it('resolves a relative Vite base from the document instead of the JS bundle', () => {
    expect(getN64RuntimeImportUrl('http://127.0.0.1:4173/', './'))
      .toBe('http://127.0.0.1:4173/n64-fork/main.bundle.7f0ebbf78c-64m2.js');
    expect(getN64RuntimeImportUrl('https://example.test/h5-NES_TS/', '/h5-NES_TS/'))
      .toBe('https://example.test/h5-NES_TS/n64-fork/main.bundle.7f0ebbf78c-64m2.js');
  });

  it('limits the stable runtime fallback to the first Android failure', () => {
    expect(shouldRetryN64WithNpm('Mozilla/5.0 (Linux; Android 10)', false)).toBe(true);
    expect(shouldRetryN64WithNpm('Mozilla/5.0 (Linux; Android 10)', true)).toBe(false);
    expect(shouldRetryN64WithNpm('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', false)).toBe(false);
  });
});