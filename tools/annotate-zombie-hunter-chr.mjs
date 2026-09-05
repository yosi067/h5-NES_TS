#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const romPath = process.argv.find(argument => !argument.startsWith('--') && argument.endsWith('.nes'))
  ?? path.join(root, 'roms', 'Zombie Hunter (Japan).nes');
const pageArgument = process.argv.find(argument => argument.startsWith('--page='));
const page = pageArgument ? Number.parseInt(pageArgument.slice('--page='.length), 10) : 7;
const outputPath = process.argv.find(argument => argument.startsWith('--out='))?.slice('--out='.length)
  ?? path.join(root, 'artifacts', `zombie-hunter-chr-page${page}-annotated.png`);

const rom = fs.readFileSync(romPath);
const trainerSize = (rom[6] & 0x04) !== 0 ? 512 : 0;
const chrStart = 16 + trainerSize + rom[4] * 16 * 1024;
const chr = rom.subarray(chrStart, chrStart + rom[5] * 8 * 1024);
const pageSize = 640;
const tileSize = 40;
const glyphScale = 4;
const glyphOffset = 8;
const pixels = Buffer.alloc(pageSize * pageSize * 3, 0);

function setPixel(x, y, value) {
  const offset = (y * pageSize + x) * 3;
  pixels[offset] = value;
  pixels[offset + 1] = value;
  pixels[offset + 2] = value;
}

for (let tileInPage = 0; tileInPage < 256; tileInPage += 1) {
  const tile = page * 256 + tileInPage;
  const tileOffset = tile * 16;
  const tileX = tileInPage % 16;
  const tileY = Math.floor(tileInPage / 16);
  for (let y = 0; y < 8; y += 1) {
    const plane0 = chr[tileOffset + y];
    const plane1 = chr[tileOffset + y + 8];
    for (let x = 0; x < 8; x += 1) {
      const mask = 0x80 >> x;
      const value = ((plane0 & mask) ? 1 : 0) | ((plane1 & mask) ? 2 : 0);
      const shade = [0, 96, 176, 255][value];
      for (let dy = 0; dy < glyphScale; dy += 1) {
        for (let dx = 0; dx < glyphScale; dx += 1) {
          setPixel(tileX * tileSize + glyphOffset + x * glyphScale + dx, tileY * tileSize + 8 + y * glyphScale + dy, shade);
        }
      }
    }
  }
}

const labels = Array.from({ length: 256 }, (_, tileInPage) => {
  const x = (tileInPage % 16) * tileSize + 2;
  const y = Math.floor(tileInPage / 16) * tileSize + 7;
  return `<text x="${x}" y="${y}" fill="#7fffd4" font-family="monospace" font-size="7">${tileInPage.toString(16).padStart(2, '0')}</text>`;
}).join('');
const overlay = Buffer.from(`<svg width="${pageSize}" height="${pageSize}" xmlns="http://www.w3.org/2000/svg">${labels}</svg>`);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
await sharp(pixels, { raw: { width: pageSize, height: pageSize, channels: 3 } })
  .composite([{ input: overlay }])
  .png()
  .toFile(outputPath);
console.log(`Annotated CHR page ${page} to ${outputPath}`);