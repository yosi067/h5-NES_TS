import { describe, expect, it } from 'vitest';
import {
  N64_REBUILT_ASSET_VERSION,
  getN64RuntimeAssetUrl,
} from '../src/n64/runtime-assets';

describe('N64 runtime asset URLs', () => {
  it('versions every rebuilt runtime layer with the same cache key', () => {
    expect(getN64RuntimeAssetUrl('/h5-NES_TS/', 'main.bundle.js', true))
      .toBe(`/h5-NES_TS/n64-fork/main.bundle.js?v=${N64_REBUILT_ASSET_VERSION}`);
    expect(getN64RuntimeAssetUrl('/h5-NES_TS/', 'index.7f0ebbf78c.wasm', true))
      .toBe(`/h5-NES_TS/n64-fork/index.7f0ebbf78c.wasm?v=${N64_REBUILT_ASSET_VERSION}`);
    expect(getN64RuntimeAssetUrl('/h5-NES_TS/', 'index.7f0ebbf78c.data', true))
      .toBe(`/h5-NES_TS/n64-fork/index.7f0ebbf78c.data?v=${N64_REBUILT_ASSET_VERSION}`);
  });

  it('leaves npm runtime asset URLs unchanged', () => {
    expect(getN64RuntimeAssetUrl('/h5-NES_TS/', 'index.7f0ebbf78c.wasm', false))
      .toBe('/h5-NES_TS/n64-mupen/index.7f0ebbf78c.wasm');
  });
});