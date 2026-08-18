import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(projectRoot, 'public', 'roms.json');
const metadataPath = path.join(projectRoot, 'public', 'game-metadata.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')).roms;
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
metadata.games ??= {};

let updated = 0;
for (const rom of catalog) {
  const game = metadata.games[rom.file] ?? {};
  if (game.cover) continue;
  game.coverSearchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${rom.name}遊戲卡帶+封面`)}`;
  game.coverStatus ??= 'missing-candidate';
  game.verified = false;
  metadata.games[rom.file] = game;
  updated += 1;
}

fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify({ updated }, null, 2));