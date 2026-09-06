// Read-only audit against the ROM definitions shipped with the actual runtime.
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

const root = new URL('../', import.meta.url);
const definitions = readFileSync(new URL('node_modules/@mantou/fbneo/em-out/games.txt', root), 'utf8');
const checks = [['nbbatman', 'nbbatman'], ['nbbatman', 'nbbatmanu']];
const results = [];
for (const [archive, driver] of checks) {
  const block = definitions.split('---START---').find(part =>
    part.split('};')[1]?.trim().split(/\s+/)[0] === driver);
  if (!block) throw new Error(`Missing installed driver: ${driver}`);
  const zip = await JSZip.loadAsync(readFileSync(new URL(`roms/${archive}.zip`, root)), { checkCRC32: true });
  const actual = Object.values(zip.files).filter(entry => !entry.dir).map(entry => ({
    name: entry.name.split('/').pop(),
    size: entry._data.uncompressedSize,
    crc32: (entry._data.crc32 >>> 0).toString(16).padStart(8, '0'),
  }));
  const chips = [...block.matchAll(/\{\s*"([^"]+)"\s*,\s*0x([0-9a-f]+)\s*,\s*0x([0-9a-f]+)/gi)].map(match => {
    const expected = { name: match[1], size: parseInt(match[2], 16), crc32: match[3].toLowerCase().padStart(8, '0') };
    const found = actual.find(chip => chip.name === expected.name);
    return { ...expected, status: !found ? 'missing' : found.size === expected.size && found.crc32 === expected.crc32 ? 'ok' : 'mismatch' };
  });
  if (!chips.length) throw new Error(`No ROM requirements parsed for ${driver}`);
  results.push({ archive: `${archive}.zip`, driver, zipCrcValidated: true, complete: chips.every(chip => chip.status === 'ok'), chips });
}
console.log(JSON.stringify(results, null, 2));