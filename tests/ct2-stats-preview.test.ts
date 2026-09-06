// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { mountTsubasaPreview, previewTsubasaLevel } from '../src/game-profiles/ct2-stats-preview';
import evidence from '../src/game-profiles/ct2-stats-evidence.json';

describe('original CT2 Tsubasa stat preview (not a cheat)', () => {
  it('agrees with native original-ROM baseline and level64 calculations', () => {
    const initial = previewTsubasaLevel(1), max = previewTsubasaLevel(64);
    expect(initial.maxStamina).toBe(748);
    expect(max.maxStamina).toBe(976);
    expect(initial.fields.slice(0, 6).map(f => f.value)).toEqual([16,14,12,12,11,12]);
    expect(max.fields.slice(0, 6).map(f => f.value)).toEqual([238,236,232,232,229,232]);
    expect(max.fields).toHaveLength(16);
    expect(max.fields.every(f => f.value < 255)).toBe(true);
  });
  it('rejects invalid levels rather than wrapping or clamping unknown input', () => {
    for (const level of [-1,0,1.5,65,99,255,256,NaN,Infinity]) {
      expect(() => previewTsubasaLevel(level)).toThrow(RangeError);
    }
  });
  it('keeps the verified natural domain monotone and does not mutate evidence', () => {
    const original = JSON.stringify(evidence);
    for (let level = 2; level <= 64; level++) {
      const previous = previewTsubasaLevel(level - 1), next = previewTsubasaLevel(level);
      expect(next.maxStamina).toBeGreaterThanOrEqual(previous.maxStamina);
      next.fields.forEach((field, i) => expect(field.value).toBeGreaterThanOrEqual(previous.fields[i].value));
    }
    expect(JSON.stringify(evidence)).toBe(original);
    expect(evidence.levelThresholds.at(-1)).toBe(65535);
  });
  it('runs shipped UI: default max preview, opt out, edits, invalid input; no storage/network', () => {
    const parsed = new DOMParser().parseFromString(readFileSync(resolve(__dirname, '../translation-studio.html'), 'utf8'), 'text/html');
    const root = parsed.getElementById('tsubasa-preview')!;
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      mountTsubasaPreview(root);
      const level = root.querySelector<HTMLInputElement>('[data-stat-level]')!;
      const output = root.querySelector<HTMLElement>('[data-stat-output]')!;
      expect(output.textContent).toContain('等級 64');
      root.querySelector<HTMLButtonElement>('[data-stat-reset]')!.click();
      expect(output.textContent).toContain('最大體力 748');
      level.value = '32'; level.dispatchEvent(new Event('input'));
      expect(output.textContent).toContain('等級 32');
      level.value = '255'; level.dispatchEvent(new Event('input'));
      expect(level.validity.valid).toBe(false);
      expect(output.querySelector('dl')).toBeNull();
      root.querySelector<HTMLButtonElement>('[data-stat-max]')!.click();
      expect(level.validity.valid).toBe(true);
      expect(output.textContent).toContain('最大體力 976');
      expect(storage).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { storage.mockRestore(); fetchSpy.mockRestore(); }
  });
});