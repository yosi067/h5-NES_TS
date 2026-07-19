import { describe, expect, it } from 'vitest';
import {
  N64_REBUILT_ASSET_VERSION,
  getN64RebuiltAssetFileName,
  getN64RuntimeAssetUrl,
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
});