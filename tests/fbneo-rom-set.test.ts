import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@mantou/fbneo/fbneo-arcade', () => ({ default: vi.fn() }));
import { extractFbNeoRomSet, getFbNeoGameName } from '../src/arcade/fbneo-core';

async function archive(names: string[]): Promise<ArrayBuffer> {
  const zip = new JSZip();
  for (const name of names) zip.file(name, new Uint8Array([1, 2, 3]));
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('Ninja Baseball Batman driver selection', () => {
  it('recognizes both canonical revisions without enabling incomplete Mega Man 2', () => {
    expect(getFbNeoGameName('NBbatman.ZIP')).toBe('nbbatman');
    expect(getFbNeoGameName('nbbatmanu.zip')).toBe('nbbatmanu');
    expect(getFbNeoGameName('megaman2.zip')).toBeNull();
  });

  it('selects the US driver for the legacy filename, preserving the original ZIP', async () => {
    const bytes = await archive(['chips/a1-h0-a.34', 'chips/a1-l0-a.31']);
    const set = await extractFbNeoRomSet('nbbatman.zip', bytes);
    expect(set.gameName).toBe('nbbatmanu');
    expect(set.archiveName).toBe('nbbatman.zip');
    expect(set.archiveData).toEqual(new Uint8Array(bytes));
    expect(set.files.map(file => file.name)).toEqual(['a1-h0-a.34', 'a1-l0-a.31']);
  });

  it.each([
    ['6_h0.34', '3_l0.31'],
    ['6_h0.34', '3_l0.31', 'a1-h0-a.34', 'a1-l0-a.31'],
    ['a1-h0-a.34'],
  ])('does not misroute a world, merged, or incomplete archive (%s)', async (...names) => {
    expect((await extractFbNeoRomSet('nbbatman.zip', await archive(names))).gameName).toBe('nbbatman');
  });
});