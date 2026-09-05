#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const romPath = process.argv[2] ?? path.join(root, 'roms', 'Zombie Hunter (Japan).nes');
const outputPath = process.argv[3] ?? path.join(root, 'artifacts', 'zombie-hunter-chr.png');
const rom = fs.readFileSync(romPath);
const trainerSize = (rom[6] & 0x04) !== 0 ? 512 : 0;
const prgStart = 16 + trainerSize;
const prgSize = rom[4] * 16 * 1024;
const chrStart = prgStart + prgSize;
const chrSize = rom[5] * 8 * 1024;
const chr = rom.subarray(chrStart, chrStart + chrSize);
const tileScale = 4;
const tilesPerPage = 16;
const pageSize = tilesPerPage * 8 * tileScale;
const pagesPerRow = 4;
const pageRows = Math.ceil((chr.length / 16 / 256) / pagesPerRow);
const width = pagesPerRow * pageSize;
const height = pageRows * pageSize;
const pixels = Buffer.alloc(width * height * 3, 0);

function setPixel(x, y, value) {
  const offset = (y * width + x) * 3;
  pixels[offset] = value;
  pixels[offset + 1] = value;
  pixels[offset + 2] = value;
}

for (let tile = 0; tile < chr.length / 16; tile += 1) {
  const page = Math.floor(tile / 256);
  const pageTile = tile % 256;
  const pageX = page % pagesPerRow;
  const pageY = Math.floor(page / pagesPerRow);
  const tileX = pageTile % tilesPerPage;
  const tileY = Math.floor(pageTile / tilesPerPage);
  const tileOffset = tile * 16;
  for (let y = 0; y < 8; y += 1) {
    const plane0 = chr[tileOffset + y];
    const plane1 = chr[tileOffset + y + 8];
    for (let x = 0; x < 8; x += 1) {
      const mask = 0x80 >> x;
      const value = ((plane0 & mask) ? 1 : 0) | ((plane1 & mask) ? 2 : 0);
      const shade = [0, 96, 176, 255][value];
      const pixelX = (pageX * pageSize) + ((tileX * 8 + x) * tileScale);
      const pixelY = (pageY * pageSize) + ((tileY * 8 + y) * tileScale);
      for (let dy = 0; dy < tileScale; dy += 1) {
        for (let dx = 0; dx < tileScale; dx += 1) setPixel(pixelX + dx, pixelY + dy, shade);
      }
    }
  }
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toFile(outputPath);
console.log(`Rendered ${chr.length / 16} tiles to ${outputPath}`);