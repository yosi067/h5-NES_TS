// One source CHR atlas for encoding verification, not screen OCR.
import fs from 'node:fs';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
const rom = fs.readFileSync(new URL('../roms/Captain Tsubasa II - Super Striker (Japan).nes', import.meta.url));
const chrStart = 16 + (rom[6] & 4 ? 512 : 0) + rom[4] * 16384;
const codes = process.argv.includes('--latin') ? Array.from({ length: 32 }, (_, i) => 0x80 + i)
  : [0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f, 0x40, 0x77, 0x78, 0x79, 0x7a, 0x7b, 0x7c, 0x7d, 0x7e, 0x7f];
const size = 64;
const width = 8 * size;
const height = Math.ceil(codes.length / 8) * 88;
const pixels = Buffer.alloc(width * height * 4, 255);
const labels = [];
codes.forEach((code, i) => {
  const ox = i % 8 * size, oy = Math.floor(i / 8) * 88;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const value = ((rom[chrStart + code * 16 + y] >> (7 - x)) & 1) | (((rom[chrStart + code * 16 + y + 8] >> (7 - x)) & 1) << 1);
    for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
      const p = ((oy + y * 7 + dy) * width + ox + x * 7 + dx) * 4;
      pixels[p] = pixels[p + 1] = pixels[p + 2] = value ? 15 : 235;
    }
  }
  labels.push(`<text x="${ox + 14}" y="${oy + 76}" font-family="monospace" font-size="16">${code.toString(16)}</text>`);
});
await sharp(pixels, { raw: { width, height, channels: 4 } })
  .composite([{ input: Buffer.from(`<svg width="${width}" height="${height}">${labels.join('')}</svg>`) }])
  .png().toFile(fileURLToPath(new URL(process.argv.includes('--latin') ? '../artifacts/ct2-source-latin-atlas.png' : '../artifacts/ct2-source-font-atlas.png', import.meta.url)));