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
const repositories = {
  nes: 'Nintendo_-_Nintendo_Entertainment_System',
  snes: 'Nintendo_-_Super_Nintendo_Entertainment_System',
  gg: 'Sega_-_Game_Gear',
};

const targets = [
  ['機器貓小叮噹冒險RPG(日版).zip', 'nes', 'Doraemon - Giga Zombie no Gyakushuu (Japan).png'],
  ['幽游白書-爆斗暗黑武術會.zip', 'nes', 'Datach - Yuu Yuu Hakusho - Bakutou Ankoku Bujutsu Kai (1993-10-22)(Bandai)(JP).png'],
  ['Ninku (Japan) [T-En by Some Good Shit Translations v0.1] [i].gg', 'gg', 'Ninku (Japan).png'],
  ['打磚塊.zip', 'nes', 'Arkanoid (1986-12-26)(Taito)(JP).png'],
  ['打磚塊2.zip', 'nes', 'Arkanoid II (1988-03-08)(Taito)(JP).png'],
  ['方塊.zip', 'nes', 'Palamedes (Japan).png'],
  ['方塊2.zip', 'nes', 'Palamedes II - Star Twinkle, Hoshi no Mabataki (Japan).png'],
  ['快樂貓.zip', 'nes', 'Mappy (Japan).png'],
  ['快樂鼠.zip', 'nes', 'Mappy Kids (Japan).png'],
  ['貓之迷宮(貓咪小鎮).zip', 'nes', 'Onyanko Town (Japan).png'],
  ['三隻小豬(豬狼大戰).zip', 'nes', 'Pooyan (Japan).png'],
  ['火鳳凰.zip', 'nes', 'Exerion (1985-02-11)(Jaleco)(JP).png'],
  ['瘋狂賽車.zip', 'nes', 'Zippy Race (Japan).png'],
  ['企鵝先生.zip', 'nes', 'Binary Land (Japan).png'],
  ['天使之翼2(足球小將2).zip', 'nes', 'Captain Tsubasa II - Super Striker (Japan).png'],
  ['龙珠Z2-激斗弗利撒.nes', 'nes', 'Dragon Ball Z II - Gekishin Freeza!! (Japan).png'],
  ['龙珠Z3-烈战人造人.nes', 'nes', 'Dragon Ball Z III - Ressen Jinzou Ningen (Japan).png'],
  ['龙珠Z外传-塞亚人灭绝计划.nes', 'nes', 'Dragon Ball Z Gaiden - Saiya Jin Zetsumetsu Keikaku (Japan).png'],
  ['热血高校足球(J).nes', 'nes', 'Nekketsu Koukou Dodgeball-bu - Soccer Hen (Japan).png'],
  ['热血进行曲中文版.nes', 'nes', 'Downtown - Nekketsu Koushinkyoku - Soreyuke Daiundoukai (Japan).png'],
  ['熱血時代劇(熱血道中記).zip', 'nes', 'Downtown Special - Kunio-kun no Jidaigeki Da yo Zenin Shuugou! (Japan).png'],
  ['熱血曲棍球(熱血冰球).zip', 'nes', 'Ike Ike! Nekketsu Hockey-bu - Subette Koronde Dairantou (Japan).png'],
  ['热血新记录.nes', 'nes', 'Bikkuri Nekketsu Shin Kiroku! - Harukanaru Kin Medal (Japan).png'],
  ['热血格斗中文.nes', 'nes', 'Nekketsu Kakutou Densetsu (Japan).png'],
  ['热血足球3.NES', 'nes', 'Kunio-kun no Nekketsu Soccer League (Japan).png'],
  ['热血篮球.nes', 'nes', 'Nekketsu! Street Basket - Ganbare Dunk Heroes (Japan).png'],
  ['大盜伍佑衛門2.zip', 'nes', 'Ganbare Goemon 2 (Japan).png'],
  ['聖鬥士星矢2.zip', 'nes', 'Saint Seiya - Ougon Densetsu Kanketsu Hen (Japan).png'],
  ['吞食天地2-諸葛孔明傳.zip', 'nes', 'Tenchi o Kurau II - Shokatsu Koumei Den (Japan).png'],
  ['半熟英雄.zip', 'nes', 'Hanjuku Hero (Japan).png'],
  ['火之鳥鳳凰篇-我王之冒險.zip', 'nes', 'Hino Tori - Houou Hen - Gaou no Bouken (Japan).png'],
  ['棒球之星.zip', 'nes', 'Baseball Star - Mezase Sankanou!! (Japan).png'],
  ['家庭網球.zip', 'nes', 'Family Tennis (Japan).png'],
  ['世界盃網球賽(世界超級網球).zip', 'nes', 'World Super Tennis (Japan).png'],
  ['五子棋.nes', 'nes', 'Gomoku Narabe Renju (Japan).png'],
  ['110合1.zip', 'nes', '110 in 1 (Asia) (En) (Unl) (Pirate).png'],
  ['0019 - 勇者鬥惡龍1+2 (簡)(1代漢化)(波波).zip', 'snes', 'Dragon Quest I _ II (Japan).png'],
  ['0004 - 七龍珠Z超悟空傳-突激篇 (簡)(90%)(野獸).zip', 'snes', 'Dragon Ball Z - Super Gokuu Den - Totsugeki Hen (Japan).png'],
  ['0066 - 灌籃高手2 (簡)(V0.3)(勇者漢化組).SMC', 'snes', 'From TV Animation Slam Dunk 2 - IH Yosen Kanzen Ban!! (Japan).png'],
  ['NBA Jam (USA) (Rev 1).sfc', 'snes', 'NBA Jam (USA).png', 'NBA Jam (USA) (Rev 1).png'],
  ['Ganbare Goemon - Yuki Hime Kyuushutsu Emaki (Japan) (Rev 2).zip', 'snes', 'Ganbare Goemon - Yuki Hime Kyuushutsu Emaki (Japan).png', 'Ganbare Goemon - Yuki Hime Kyuushutsu Emaki (Japan) (Rev 2).png'],
  ['Shin Kidou Senki Gundam W - Endless Duel (Japan).zip', 'snes', 'Shin Kidou Senki Gundam W - Endless Duel (Japan).png'],
  ['Shin SD Sengokuden - Daishougun Retsuden (Japan).zip', 'snes', 'Shin SD Sengokuden - Daishougun Retsuden (Japan).png'],
];

fs.mkdirSync(coverDirectory, { recursive: true });
metadata.version = 1;
metadata.games ??= {};

function encodePath(value) {
  return value.split('/').map(part => encodeURIComponent(part)).join('/');
}

function makeSlug(filename) {
  return `cover-${crypto.createHash('sha1').update(filename).digest('hex').slice(0, 12)}.jpg`;
}

function getUrls(system, imagePath, sourcePath = imagePath) {
  const repository = repositories[system];
  const encodedImagePath = encodePath(imagePath);
  const encodedSourcePath = encodePath(sourcePath);
  return {
    image: `https://raw.githubusercontent.com/libretro-thumbnails/${repository}/master/Named_Boxarts/${encodedImagePath}`,
    source: `https://github.com/libretro-thumbnails/${repository}/blob/master/Named_Boxarts/${encodedSourcePath}`,
  };
}

function getSearchUrl(rom) {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${rom.name}遊戲卡帶+封面`)}`;
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
  await image
    .rotate()
    .resize(targetWidth, targetHeight, {
      fit: 'contain',
      background: { r: 243, g: 234, b: 216, alpha: 1 },
    })
    .jpeg({ quality: 86, progressive: true })
    .toFile(outputPath);
}

const catalogByFile = new Map(catalog.map(rom => [rom.file, rom]));
const report = [];

for (const target of targets) {
  const file = target[0];
  const system = target[1];
  const imagePath = target[2];
  const sourcePath = target[3] ?? imagePath;
  const rom = catalogByFile.get(file);
  if (!rom) throw new Error(`ROM is not in catalog: ${file}`);

  const existing = metadata.games[file] ?? {};
  if (existing.cover) {
    report.push({ file, status: 'existing', cover: existing.cover });
    continue;
  }

  const urls = getUrls(system, imagePath, sourcePath);
  const outputFilename = makeSlug(file);
  const outputPath = path.join(coverDirectory, outputFilename);
  try {
    await downloadAndNormalize(urls.image, outputPath);
    metadata.games[file] = {
      ...existing,
      cover: `assets/covers/${outputFilename}`,
      coverSource: urls.source,
      coverImageSource: urls.image,
      coverSearchUrl: getSearchUrl(rom),
      coverStatus: 'candidate-box-art',
      coverConfidence: 'high',
      verified: false,
    };
    report.push({ file, status: 'downloaded', source: urls.source });
  } catch (error) {
    if (fs.existsSync(outputPath)) fs.rmSync(outputPath);
    report.push({ file, status: 'error', error: error.message, source: urls.source });
  }
}

fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify({ downloaded: report.filter(item => item.status === 'downloaded').length, report }, null, 2));