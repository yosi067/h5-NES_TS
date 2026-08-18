import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(projectRoot, 'public', 'roms.json');
const metadataPath = path.join(projectRoot, 'public', 'game-metadata.json');
const coverDirectory = path.join(projectRoot, 'public', 'assets', 'covers');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')).roms;
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const targetWidth = 240;
const targetHeight = 320;
const userAgent = 'h5-nes-research/0.1 (non-commercial game preservation research)';

const targets = [
  {
    file: '南極大冒險.zip',
    source: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRwPFefZ1ziKim5-91cRLSWvukV3XTPuvsCtMFN0LEHeg&s=10',
  },
  {
    file: '最終幻想(太空戰士).zip',
    source: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ3-286z26OcIANGLuRr4Y4XtQyCdAtUaHiNm2qLPdSUQ&s=10',
  },
  {
    file: '天使之翼(足球小將).zip',
    source: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR4Kcz8ldbTSj_J8MSPRN-uq7LqoYbYCogef8KNth5QaA&s=10',
  },
  {
    file: '幽游白書-魔界最強列傳.zip',
    source: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTlT5PKCR9-xtLECbbGap1AlN8yVSALxLz7TKMd3m12ew&s=10',
  },
  {
    file: '吞食天地.zip',
    source: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcREHrVtf-bLvKJZqmc8LK0ZX71DkWjNNfQrpaGUH4JvfA&s=10',
  },
  {
    file: '36計(中文).zip',
    source: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRW3cgKNyvehGrlP1q0bVDB8bvcY0hp1ZksJrHDzmhNug&s=10',
  },
  {
    file: '圣铃传说.nes',
    source: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR14iSo1beZNjXIbmjHRR4msAINA-Gon4_a4LBlOSop1A&s',
  },
  {
    file: 'Zombie Hunter (Japan).nes',
    source: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRANMwwpz5c1rc_-mtqJwPhe2JpahTgNE8YzbfWV6RJKw&s=10',
  },
  {
    file: '台湾16张麻将(中文).nes',
    source: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSrPvh4rP195MXmydF-Y5NqaDepiJjw5qNUM94UA-wLRw&s',
  },
  {
    file: '5d049351ad7a1b6f4d9dd1cacfaf8be0a53be23e5a85d6fd0ef3d119d442892d.gb.zip',
    source: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQrE_nN-y5vPtLEIBoxSIKA3Y9kuCFSwnw4lpAK7jg47A&s=10',
  },
  {
    file: '热斗拳皇96(简)(v1.0)(Stephen+湮没骑士の镇魂歌+落榜の美术生)(8Mb).gb',
    source: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQEp4e9aCq_vMrKxnWF1HMzs8b_AgFOBNTiTTrSmuNYo6erLJd8',
  },
  {
    file: '0020 - 勇者鬥惡龍3 (繁)(V0.99.2)(精靈製作組).zip',
    source: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRJB8CYk6gDTpwehDHApmH17apYWo6yJF-j85YmVmxb_w&s=10',
  },
  {
    file: 'Ganbare Goemon 3 - Shishi Juurokubee no Karakuri Manjigatame (Japan) (Sample).zip',
    source: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTCMkzGjxjJsO56R3_kLcbG26d57CiHmaI-5x6_HBMY7A&s=10',
  },
  {
    file: 'simpsons.zip',
    source: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQhFMyyyuXcrLqahi0G9DaILiGa4iazjBpfx6YkWAq4bA&s=10',
  },
  {
    file: 'Ninku (Japan) [T-En by Some Good Shit Translations v0.1] [i].gg',
    source: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTqLdltvNLMqYpeDBl0XjvMQXR-DPmpC4kN37sQ2Wx17Q&s=10',
  },
];

const uncertaintyMarkers = [
  '尚未逐項核對',
  '未逐項核對',
  '尚待核對',
  '尚待查看',
  '待查看',
  '待人工核對',
  '待人工查看',
  '尚未找到可核對',
  '未另行核對',
  '尚未從 ROM 逐項辨識',
];

fs.mkdirSync(coverDirectory, { recursive: true });
metadata.version = 1;
metadata.games ??= {};

function makeSlug(filename) {
  return `cover-${crypto.createHash('sha1').update(filename).digest('hex').slice(0, 12)}.jpg`;
}

function hasUncertaintyMarker(clause) {
  return uncertaintyMarkers.some(marker => clause.includes(marker));
}

function cleanDescription(description) {
  if (!description) return description;
  const clauses = description.split(/[；;]/u);
  const retained = clauses.filter(clause => !hasUncertaintyMarker(clause));
  if (retained.length === clauses.length) return description;

  const cleaned = retained
    .join('；')
    .replace(/；\s*([。！？])/gu, '$1')
    .replace(/\s{2,}/gu, ' ')
    .trim();
  return cleaned && !/[。！？.!?]$/u.test(cleaned) ? `${cleaned}。` : cleaned;
}

async function downloadAndNormalize(sourceUrl, outputPath) {
  const response = await fetch(sourceUrl, {
    headers: { 'User-Agent': userAgent, Accept: 'image/*' },
  });
  if (!response.ok) throw new Error(`Image request failed (${response.status})`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) throw new Error(`Not an image: ${contentType}`);

  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  const image = sharp(sourceBuffer, { failOn: 'none' });
  const info = await image.metadata();
  if (!info.width || !info.height || info.width < 40 || info.height < 40) {
    throw new Error(`Image is too small (${info.width ?? 0}x${info.height ?? 0})`);
  }

  const normalizedBuffer = await image
    .rotate()
    .resize(targetWidth, targetHeight, {
      fit: 'contain',
      background: { r: 243, g: 234, b: 216, alpha: 1 },
    })
    .jpeg({ quality: 86, progressive: true })
    .toBuffer();
  fs.writeFileSync(outputPath, normalizedBuffer);
}

const catalogFiles = new Set(catalog.map(rom => rom.file));
const report = [];

for (const target of targets) {
  if (!catalogFiles.has(target.file)) throw new Error(`ROM is not in catalog: ${target.file}`);

  const existing = metadata.games[target.file] ?? {};
  const outputFilename = makeSlug(target.file);
  const outputPath = path.join(coverDirectory, outputFilename);
  const relativeCover = `assets/covers/${outputFilename}`;

  if (existing.coverImageSource === target.source && fs.existsSync(outputPath)) {
    report.push({ file: target.file, status: 'existing', cover: relativeCover });
    continue;
  }

  try {
    await downloadAndNormalize(target.source, outputPath);
    metadata.games[target.file] = {
      ...existing,
      cover: relativeCover,
      coverSource: target.source,
      coverImageSource: target.source,
      coverStatus: 'user-selected-artwork',
      coverConfidence: 'review',
      verified: false,
    };
    report.push({ file: target.file, status: 'downloaded', cover: relativeCover });
  } catch (error) {
    report.push({ file: target.file, status: 'error', error: error.message, source: target.source });
  }
}

let descriptionsCleaned = 0;
for (const entry of Object.values(metadata.games)) {
  const cleaned = cleanDescription(entry.description);
  if (cleaned !== entry.description) {
    entry.description = cleaned;
    descriptionsCleaned += 1;
  }
}

fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
const errors = report.filter(item => item.status === 'error');
console.log(JSON.stringify({
  downloaded: report.filter(item => item.status === 'downloaded').length,
  existing: report.filter(item => item.status === 'existing').length,
  errors: errors.length,
  descriptionsCleaned,
  report,
}, null, 2));

if (errors.length > 0) process.exitCode = 1;