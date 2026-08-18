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
const metadata = fs.existsSync(metadataPath)
  ? JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
  : { version: 1, games: {} };
const args = new Set(process.argv.slice(2));
const limitArgument = process.argv.find(argument => argument.startsWith('--limit='));
const limit = limitArgument ? Number.parseInt(limitArgument.slice('--limit='.length), 10) : Number.POSITIVE_INFINITY;
const offsetArgument = process.argv.find(argument => argument.startsWith('--offset='));
const offset = offsetArgument ? Number.parseInt(offsetArgument.slice('--offset='.length), 10) : 0;
const queryLimitArgument = process.argv.find(argument => argument.startsWith('--queries='));
const queryLimit = queryLimitArgument ? Number.parseInt(queryLimitArgument.slice('--queries='.length), 10) : 5;
const systemArgument = process.argv.find(argument => argument.startsWith('--system='));
const requestedSystem = systemArgument?.slice('--system='.length);
const download = args.has('--download');
const force = args.has('--force');
const noApi = !args.has('--api') || args.has('--no-api');
const delayMs = Number.parseInt(process.env.WIKI_DELAY_MS ?? '900', 10);
const userAgent = 'h5-nes-research/0.1 (non-commercial game preservation research)';
const targetWidth = 240;
const targetHeight = 320;
const coverTerms = /cover|box|pack(?:art|shot|aging)?|cartridge|cart|jaquette|jacket|case|famicom|nes|game.?boy|super.?nintendo/i;
const excludedTerms = /logo|screenshot|screen|title.?screen|icon|sprite|map|character|composer|developer|flag|controller|wordmark|triforce|symbol|micrologo|package|crystal.?clear|wiki.?letter|category|missing|placeholder|default/i;
const restPageCache = new Map();
const titleAliases = new Map([
  ['薩爾達傳說', ['The Legend of Zelda (video game)']],
  ['薩爾達傳說 時之笛', ['The Legend of Zelda: Ocarina of Time']],
  ['洛克人', ['Mega Man (video game)']],
  ['洛克人 x', ['Mega Man X (video game)']],
  ['洛克人 x2', ['Mega Man X2']],
  ['洛克人 x3', ['Mega Man X3']],
  ['最終幻想', ['Final Fantasy (video game)']],
  ['太空戰士', ['Final Fantasy (video game)']],
  ['太空戰士 5', ['Final Fantasy V']],
  ['太空戰士 6', ['Final Fantasy VI']],
  ['太空戰士 2', ['Final Fantasy II']],
  ['太空戰士 3', ['Final Fantasy III']],
  ['超級瑪利歐大集合', ['Super Mario All-Stars']],
  ['超級瑪利歐 rpg', ['Super Mario RPG']],
  ['天外魔境 zero', ['Tengai Makyou Zero']],
  ['伊蘇國 3 伊蘇歸來的漂泊者', ['Ys III: Wanderers from Ys']],
  ['勇者鬥惡龍', ['Dragon Quest (video game)']],
  ['七寶奇謀 2', ['The Goonies II']],
  ['大盜五右衛門 2', ['Ganbare Goemon 2: Kiteretsu Shogun Maggins']],
  ['大盜伍佑衛門2', ['Ganbare Goemon 2: Kiteretsu Shogun Maggins']],
  ['勇者鬥惡龍 1 2', ['Dragon Quest I & II']],
  ['NBA Jam (美版 Rev 1)', ['NBA Jam']],
  ['勇者鬥惡龍 3', ['Dragon Quest III']],
  ['NBA Jam (USA)', ['NBA Jam (1993 video game)']],
  ['Ganbare Goemon - Yuki Hime Kyuushutsu Emaki (Japan)', ['Ganbare Goemon 2: Kiteretsu Shogun Maggins']],
  ['Ganbare Goemon 3 - Shishi Juurokubee no Karakuri Manjigatame (Japan)', ['Ganbare Goemon 3: Shishijuurokube no Karakuri Manjigatame']],
  ['Shin Kidou Senki Gundam W - Endless Duel', ['Gundam Wing: Endless Duel']],
  ['Shin SD Sengokuden - Daishougun Retsuden', ['Shin SD Sengokuden: Daishōgun Retsuden']],
  ['勇者鬥惡龍 6', ['Dragon Quest VI']],
  ['冒險島', ['Adventure Island (video game)']],
  ['冒險島 2', ['Adventure Island II']],
  ['冒險島 3', ['Adventure Island 3']],
  ['魂斗羅', ['Contra (video game)']],
  ['雙截龍', ['Double Dragon (video game)']],
  ['雙截龍 2', ['Double Dragon II: The Revenge']],
  ['雙截龍 3', ['Double Dragon III: The Sacred Stones']],
  ['雙截龍 2 復仇', ['Double Dragon II: The Revenge']],
  ['雙截龍 3 羅塞塔之石', ['Double Dragon III: The Sacred Stones']],
  ['小叮噹', ['Doraemon (1986 video game)']],
  ['小叮噹 基加殭屍的逆襲', ['Doraemon: Giga Zombie no Gyakushū']],
  ['足球小將', ['Captain Tsubasa (video game)']],
  ['足球小將 2 超級前鋒', ['Captain Tsubasa II: Super Striker']],
  ['兵蜂', ['TwinBee']],
  ['兵蜂 3 波克波克大魔王', ['TwinBee 3: Poko Poko Daimaō']],
  ['忍者蛙', ['Battletoads (1991 video game)']],
  ['忍者劍豪傳 武藏之路', ['Ninja Gaiden (NES video game)']],
  ['火之鳥 鳳凰篇 我王的冒險', ['Hi no Tori: Hououhen - Gaou no Bouken']],
  ['大力水手', ['Popeye (1982 video game)']],
  ['米老鼠', ['Mickey Mousecapade']],
  ['棒球', ['Baseball (1983 video game)', 'Baseball (Nintendo video game)']],
  ['影子傳說', ['The Legend of Kage']],
  ['魔界村', ["Ghosts 'n Goblins (video game)"]],
  ['沙羅曼蛇', ['Salamander (video game)']],
  ['1942', ['1942 (video game)']],
  ['馬戲團', ['Circus Charlie']],
  ['迷宮組曲', ["Milon's Secret Castle"]],
  ['吞食天地', ['Destiny of an Emperor']],
  ['惡魔城', ['Castlevania (1986 video game)']],
  ['半熟英雄', ['Hanjuku Hero']],
  ['伊蘇國', ['Ys I: Ancient Ys Vanished']],
  ['伊蘇國 2', ['Ys II: Ancient Ys Vanished – The Final Chapter']],
  ['伊蘇國 3', ['Ys III: Wanderers from Ys']],
  ['時空幻境', ['Tales of Phantasia']],
  ['星海遊俠', ['Star Ocean (video game)']],
  ['聖劍傳說 3', ['Trials of Mana']],
  ['聖火降魔錄 紋章之謎', ['Fire Emblem: Mystery of the Emblem']],
  ['聖火降魔錄 聖戰系譜', ['Fire Emblem: Genealogy of the Holy War']],
  ['聖火降魔錄 多拉基亞 776', ['Fire Emblem: Thracia 776']],
  ['第 3 次超級機器人大戰', ['3rd Super Robot Wars']],
  ['第 4 次超級機器人大戰', ['4th Super Robot Wars']],
  ['七龍珠 z 超武鬥傳 2', ['Dragon Ball Z: Super Butoden 2']],
  ['七龍珠 z 超武鬥傳 3', ['Dragon Ball Z: Super Butoden 3']],
  ['皇家騎士團', ['Tactics Ogre: Let Us Cling Together']],
  ['皇家騎士團 2', ['Tactics Ogre: Let Us Cling Together']],
  ['雷霆任務', ['Front Mission (video game)']],
  ['大盜五右衛門 雪 姬救出繪卷', ['Ganbare Goemon 2: Kiteretsu Shogun Maggins']],
  ['大盜五右衛門 3 機關奇巧獅子重祿兵衛之固', ['Ganbare Goemon 3: Shishijuurokube no Karakuri Manjigatame']],
  ['新機動戰記鋼彈 w 無盡的 決鬥', ['Gundam Wing: Endless Duel']],
  ['新 sd 戰國傳 大將軍列傳', ['Shin SD Sengokuden: Daishōgun Retsuden']],
  ['超級瑪利歐樂園 2 六個金幣', ['Super Mario Land 2: 6 Golden Coins']],
  ['神奇寶貝黃', ['Pokémon Yellow']],
  ['聖劍傳說', ['Final Fantasy Adventure']],
  ['忍空', ['Ninku (video game)']],
  ['米老鼠傳奇幻境', ['Legend of Illusion Starring Mickey Mouse']],
  ['音速小子賽車 2', ['Sonic Drift 2']],
  ['音速小子 2', ['Sonic the Hedgehog 2 (8-bit video game)']],
  ['超級瑪利歐 64', ['Super Mario 64']],
  ['瑪利歐賽車 64', ['Mario Kart 64']],
  ['瑪利歐網球', ['Mario Tennis']],
  ['水上摩托車 64', ['Wave Race 64']],
  ['玩具總動員 2 巴斯光年出任務', ['Toy Story 2: Buzz Lightyear to the Rescue']],
  ['小精靈', ['Pac-Man (video game)']],
  ['雷電', ['Raiden (video game)']],
  ['怒首領蜂', ['DoDonPachi']],
  ['怒首領蜂 ii 蜂暴', ['DoDonPachi II']],
  ['area 88', ['Area 88 (video game)']],
  ['異形戰機', ['R-Type']],
  ['瘋狂大射擊', ['Parodius (1990 video game)']],
  ['街頭快打', ['Final Fight']],
  ['吞食天地 2 赤壁之戰', ['Warriors of Fate']],
  ['吞食天地 2 諸葛孔明傳', ['Tenchi o Kurau II: Shokatsu Kōmei Den']],
  ['恐龍快打', ['Cadillacs and Dinosaurs (video game)']],
  ['辛普森家庭', ['The Simpsons (arcade game)']],
  ['泡泡龍', ['Bubble Bobble (video game)']],
  ['快打旋風 2', ['Street Fighter II']],
  ['快打旋風 2 冠軍版', ['Street Fighter II: Champion Edition']],
  ['格鬥拳王 94', ["The King of Fighters '94"]],
  ['格鬥拳王 95', ["The King of Fighters '95"]],
  ['格鬥拳王 96', ["The King of Fighters '96"]],
  ['格鬥拳王 97', ["The King of Fighters '97"]],
  ['格鬥拳王 98', ["The King of Fighters '98"]],
  ['格鬥拳王 2000', ['The King of Fighters 2000']],
  ['侍魂', ['Samurai Shodown (video game)']],
  ['侍魂 2', ['Samurai Shodown II']],
  ['侍魂 4', ["Samurai Shodown IV: Amakusa's Revenge"]],
  ['侍魂 5', ['Samurai Shodown V']],
  ['snk 對卡普空 svc chaos', ['SNK vs. Capcom: SVC Chaos']],
  ['越南大戰', ['Metal Slug (1996 video game)']],
  ['越南大戰 2 turbo', ['Metal Slug 2']],
  ['越南大戰 3', ['Metal Slug 3']],
  ['越南大戰 4', ['Metal Slug 4']],
  ['越南大戰 5', ['Metal Slug 5']],
]);

fs.mkdirSync(coverDirectory, { recursive: true });
metadata.version = 1;
metadata.games ??= {};

function sleep(duration) {
  return new Promise(resolve => setTimeout(resolve, duration));
}

function normalize(value) {
  return value
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fileBaseName(file) {
  return file
    .split(/[\\/]/u)
    .pop()
    ?.replace(/\.(zip|nes|smc|sfc|fig|gb|gbc|gg|sms|z64|n64|v64)$/iu, '') ?? file;
}

function unique(values) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function buildQueries(rom) {
  const name = rom.name.trim();
  const baseName = fileBaseName(rom.file).trim();
  const spacedBaseName = baseName
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .replace(/([A-Za-z])([0-9])/gu, '$1 $2');
  const cleanName = name.replace(/\s*\([^)]*\)\s*$/u, '').trim();
  const cleanFileName = baseName.replace(/^\d+\s*[-_]?\s*/u, '').trim();
  const compactName = name.replace(/[\s._-]+/gu, '');
  const aliases = titleAliases.get(normalize(cleanName)) ?? [];
  return unique([...aliases, cleanName, name, compactName, spacedBaseName, baseName, cleanFileName]).slice(0, queryLimit);
}

function getSearchUrl(rom) {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${rom.name}遊戲卡帶+封面`)}`;
}

function apiUrl(language, parameters) {
  const query = new URLSearchParams({ action: 'query', format: 'json', origin: '*', ...parameters });
  return `https://${language}.wikipedia.org/w/api.php?${query}`;
}

async function fetchJson(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
    const text = await response.text();
    if (response.ok) {
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error(`Invalid JSON from ${url}: ${error.message}`);
      }
    }
    if (response.status === 429 || response.status === 503) {
      const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
      await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : delayMs * (attempt + 2));
      continue;
    }
    throw new Error(`Wikipedia request failed (${response.status}) for ${url}`);
  }
  throw new Error(`Wikipedia request rate limited for ${url}`);
}

async function fetchRestPage(language, title) {
  const pagePath = encodeURIComponent(title);
  const url = `https://${language}.wikipedia.org/wiki/${pagePath}`;
  const cacheKey = `${language}:${title}`;
  if (restPageCache.has(cacheKey)) return restPageCache.get(cacheKey);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'text/html' } });
    if (response.status === 404) {
      restPageCache.set(cacheKey, null);
      return null;
    }
    if (response.ok) {
      const page = { url, html: await response.text() };
      restPageCache.set(cacheKey, page);
      return page;
    }
    if (response.status === 429 || response.status === 503) {
      const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
      await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : delayMs * (attempt + 2));
      continue;
    }
    throw new Error(`Wikipedia REST request failed (${response.status}) for ${url}`);
  }
  restPageCache.set(cacheKey, null);
  return null;
}

async function queryPages(language, query) {
  const data = await fetchJson(apiUrl(language, {
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '0',
    gsrlimit: '5',
    prop: 'info|pageimages|extracts|images|langlinks',
    inprop: 'url',
    pithumbsize: '600',
    exintro: '1',
    explaintext: '1',
    exchars: '900',
    imlimit: '50',
    llprop: 'url',
    lllang: language === 'en' ? 'zh' : 'en',
    lllimit: '5',
  }));
  return Object.values(data.query?.pages ?? {});
}

function tokenScore(query, title) {
  const queryIdentity = normalize(query);
  const titleIdentity = normalize(title);
  if (!queryIdentity || !titleIdentity) return 0;
  if (queryIdentity === titleIdentity) return 100;
  if (titleIdentity.includes(queryIdentity) || queryIdentity.includes(titleIdentity)) return 78;
  const queryTokens = new Set(queryIdentity.split(' '));
  const titleTokens = new Set(titleIdentity.split(' '));
  const overlap = [...queryTokens].filter(token => titleTokens.has(token)).length;
  const score = overlap / Math.max(queryTokens.size, titleTokens.size) * 70;
  if (/組合|组合|合集|合輯|系列|列表|電影|电影|電影版|系列作品|歌曲|角色|series|list|film/i.test(title)) return score - 55;
  return score;
}

function isLowQualityTitle(title) {
  return /組合|组合|合集|合輯|系列|列表|電影|电影|電影版|系列作品|歌曲|角色|series|list|film/i.test(title);
}

function getPageTitleFromUrl(pageUrl) {
  try {
    const url = new URL(pageUrl);
    if (!url.pathname.startsWith('/wiki/')) return null;
    const title = decodeURIComponent(url.pathname.slice('/wiki/'.length)).replace(/_/gu, ' ');
    return title && !title.startsWith('Special:') ? title : null;
  } catch {
    return null;
  }
}

async function fetchRestSearchPage(language, query) {
  const cacheKey = `${language}:search:${query}`;
  if (restPageCache.has(cacheKey)) return restPageCache.get(cacheKey);
  const searchUrl = `https://${language}.wikipedia.org/w/index.php?search=${encodeURIComponent(query)}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(searchUrl, { headers: { 'User-Agent': userAgent, Accept: 'text/html' } });
    if (response.ok) {
      const html = await response.text();
      const title = getPageTitleFromUrl(response.url);
      const page = title ? { url: response.url, html, title } : null;
      restPageCache.set(cacheKey, page);
      return page;
    }
    if (response.status === 429 || response.status === 503) {
      const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
      await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : delayMs * (attempt + 2));
      continue;
    }
    restPageCache.set(cacheKey, null);
    return null;
  }
  restPageCache.set(cacheKey, null);
  return null;
}

async function queryExactPage(language, title) {
  const data = await fetchJson(apiUrl(language, {
    titles: title,
    prop: 'info|pageimages|extracts|images|langlinks',
    inprop: 'url',
    pithumbsize: '600',
    exintro: '1',
    explaintext: '1',
    exchars: '900',
    imlimit: '50',
    llprop: 'url',
    lllang: language === 'en' ? 'zh' : 'en',
    lllimit: '5',
  }));
  const page = Object.values(data.query?.pages ?? {})[0];
  return page && !page.missing && !isLowQualityTitle(page.title) ? page : null;
}

function selectPage(rom, pages, query) {
  return pages
    .map(page => ({ page, score: tokenScore(query, page.title) }))
    .sort((left, right) => right.score - left.score)[0] ?? null;
}

function selectCoverFile(page) {
  const images = page.images ?? [];
  const candidates = images
    .map(image => image.title)
    .filter(title => /^File:/i.test(title))
    .filter(title => !excludedTerms.test(title))
    .filter(title => coverTerms.test(title))
    .sort((left, right) => {
      const leftScore = /cover|box|pack|jaquette|jacket/i.test(left) ? 2 : 0;
      const rightScore = /cover|box|pack|jaquette|jacket/i.test(right) ? 2 : 0;
      return rightScore - leftScore;
    });
  return candidates[0] ?? null;
}

function getLanguageLink(page, language) {
  return page.langlinks?.find(link => link.lang === language)?.['*'] ?? null;
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&#(\d+);/gu, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/giu, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function htmlToText(value) {
  return decodeHtml(
    value
      .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/giu, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '')
      .replace(/<[^>]+>/gu, ' '),
  )
    .replace(/\[[0-9]+\]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function selectRestDescription(html) {
  const leadHtml = html.replace(/<table\b[\s\S]*?<\/table>/giu, ' ');
  for (const match of leadHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/giu)) {
    const description = htmlToText(match[1]);
    if (description.length < 45) continue;
    return description.slice(0, 320).trim();
  }
  return null;
}

function selectRestCover(html) {
  const imagePattern = /<a href="(?:\.\/|\/wiki\/|https?:\/\/[^"/]+\/wiki\/)File:([^"]+)"[^>]*class="mw-file-description"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>/gu;
  const infobox = /<table\b[^>]*class="[^"]*\binfobox\b[^"]*"[^>]*>[\s\S]*?<\/table>/iu.exec(html)?.[0] ?? null;

  function collectCandidates(source, allowInfoboxImages) {
    const candidates = [];
    for (const match of source.matchAll(imagePattern)) {
      const fileName = decodeHtml(match[1]);
      const imageUrl = decodeHtml(match[2].startsWith('//') ? `https:${match[2]}` : match[2]);
      const namedCover = coverTerms.test(fileName);
      if (excludedTerms.test(fileName) || (!namedCover && !allowInfoboxImages)) continue;
      const coverScore = namedCover ? 10 : 4;
      const portraitScore = /width="(\d+)"[^>]+height="(\d+)"/u.exec(match[0]);
      const sourceWidth = /data-file-width="(\d+)"/u.exec(match[0]);
      const sourceHeight = /data-file-height="(\d+)"/u.exec(match[0]);
      const width = sourceWidth
        ? Number.parseInt(sourceWidth[1], 10)
        : portraitScore ? Number.parseInt(portraitScore[1], 10) : 0;
      const height = sourceHeight
        ? Number.parseInt(sourceHeight[1], 10)
        : portraitScore ? Number.parseInt(portraitScore[2], 10) : 0;
      const aspectScore = width > 0 && height > width ? 3 : 0;
      const resolutionScore = width >= 100 && height >= 120 ? 2 : 0;
      const infoboxScore = allowInfoboxImages ? 6 : 0;
      candidates.push({ fileName, imageUrl, score: coverScore + aspectScore + resolutionScore + infoboxScore });
    }
    return candidates;
  }

  const candidates = infobox
    ? collectCandidates(infobox, true)
    : collectCandidates(html, false);
  return candidates.sort((left, right) => right.score - left.score)[0] ?? null;
}

function getRestLanguageTitle(html, language) {
  for (const match of html.matchAll(/<link\b[^>]*>/giu)) {
    const tag = match[0];
    if (!new RegExp(`hreflang=["']${language}["']`, 'iu').test(tag)) continue;
    const href = /href=["']([^"']+)["']/iu.exec(tag)?.[1];
    if (!href) continue;
    try {
      const url = new URL(decodeHtml(href), 'https://wikipedia.org');
      if (!url.pathname.startsWith('/wiki/')) continue;
      return decodeURIComponent(url.pathname.slice('/wiki/'.length)).replace(/_/gu, ' ');
    } catch {
      return null;
    }
  }
  return null;
}

async function queryRestCandidate(language, title) {
  const page = await fetchRestPage(language, title);
  if (!page) return null;
  const cover = selectRestCover(page.html);
  return {
    language,
    query: title,
    score: cover ? 100 : 0,
    page: {
      title,
      fullurl: page.url,
    },
    coverFile: cover ? `File:${cover.fileName}` : null,
    imageUrl: cover?.imageUrl,
    alternateTitle: getRestLanguageTitle(page.html, language === 'en' ? 'zh' : 'en'),
    description: selectRestDescription(page.html),
    descriptionLanguage: language,
    descriptionSource: page.url,
  };
}

function makeImageUrl(language, fileTitle) {
  const filename = fileTitle.replace(/^File:/i, '');
  return `https://${language}.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=600`;
}

function makeSlug(filename) {
  return `cover-${crypto.createHash('sha1').update(filename).digest('hex').slice(0, 12)}.jpg`;
}

async function downloadAndNormalize(sourceUrl, outputPath) {
  let response = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(sourceUrl, { headers: { 'User-Agent': userAgent, Accept: 'image/*' } });
    if (response.ok) break;
    if (response.status !== 429 && response.status !== 503) {
      throw new Error(`Image request failed (${response.status})`);
    }
    const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
    await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : delayMs * (attempt + 2));
  }
  if (!response?.ok) throw new Error(`Image request rate limited (${response?.status ?? 'unknown'})`);
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
  return { width: info.width, height: info.height, contentType };
}

async function enrichChineseDescription(candidate, rom) {
  if (candidate.language === 'zh' && candidate.description) return candidate;
  if (candidate.language !== 'en') return candidate;
  if (candidate.alternateTitle) {
    const chinesePage = await fetchRestPage('zh', candidate.alternateTitle);
    if (chinesePage) {
      const description = selectRestDescription(chinesePage.html);
      if (description) return { ...candidate, description, descriptionLanguage: 'zh', descriptionSource: chinesePage.url };
    }
  }
  const searchQuery = rom.name.replace(/\s*\([^)]*\)\s*$/u, '').trim();
  if (!searchQuery) return candidate;
  const searchQueries = unique([searchQuery, searchQuery.replace(/\s+/gu, '')]);
  for (const [index, query] of searchQueries.entries()) {
    if (index > 0) await sleep(delayMs);
    else await sleep(delayMs);
    const searchPage = await fetchRestSearchPage('zh', query);
    if (!searchPage || isLowQualityTitle(searchPage.title)) continue;
    const description = selectRestDescription(searchPage.html);
    if (description) return { ...candidate, description, descriptionLanguage: 'zh', descriptionSource: searchPage.url };
  }
  return candidate;
}

async function findCandidate(rom) {
  const queries = buildQueries(rom);
  const languages = rom.system === 'nes' || rom.system === 'snes' || rom.system === 'gb' ? ['zh', 'en'] : ['en', 'zh'];
  let best = null;

  for (const query of queries) {
    const queryLanguages = /[A-Za-z]/u.test(query) ? ['en'] : [languages[0]];
    for (const language of queryLanguages) {
      const restCandidate = await queryRestCandidate(language, query);
      if (restCandidate?.coverFile) return enrichChineseDescription(restCandidate, rom);
      if (restCandidate?.alternateTitle) {
        await sleep(delayMs);
        const alternateLanguage = language === 'en' ? 'zh' : 'en';
        const alternateCandidate = await queryRestCandidate(alternateLanguage, restCandidate.alternateTitle);
        if (alternateCandidate?.coverFile) return enrichChineseDescription(alternateCandidate);
      }

      if (noApi) continue;

      const exactPage = await queryExactPage(language, query);
      if (exactPage) {
        const exactCandidate = {
          language,
          query,
          score: 100,
          page: exactPage,
          coverFile: selectCoverFile(exactPage),
        };
        if (!best || exactCandidate.score > best.score || exactCandidate.coverFile) best = exactCandidate;
        if (exactCandidate.coverFile) return exactCandidate;

        const alternateTitle = getLanguageLink(exactPage, language === 'en' ? 'zh' : 'en');
        if (alternateTitle) {
          const alternateLanguage = language === 'en' ? 'zh' : 'en';
          const alternatePage = await queryExactPage(alternateLanguage, alternateTitle);
          const alternateCoverFile = alternatePage ? selectCoverFile(alternatePage) : null;
          if (alternatePage && alternateCoverFile) {
            return {
              language: alternateLanguage,
              query: alternateTitle,
              score: 100,
              page: alternatePage,
              coverFile: alternateCoverFile,
            };
          }
          await sleep(delayMs);
        }
      }
      await sleep(delayMs);
      const pages = await queryPages(language, query);
      const selected = selectPage(rom, pages, query);
      if (selected && selected.score > 0 && (!best || selected.score > best.score)) {
        const coverFile = selectCoverFile(selected.page);
        best = {
          language,
          query,
          score: selected.score,
          page: selected.page,
          coverFile,
        };
      }
      await sleep(delayMs);
      if (best?.score >= 99 && best.coverFile) return enrichChineseDescription(best, rom);
    }
  }
  return best;
}

function isEligible(rom) {
  if (requestedSystem && rom.system !== requestedSystem) return false;
  return true;
}

const selectedRoms = catalog.filter(isEligible).slice(offset, offset + limit);
const report = [];

for (const rom of selectedRoms) {
  const existing = metadata.games[rom.file];
  const needsCover = force || !existing?.cover;
  const needsDescription = force || !existing?.description;
  if (!needsCover && !needsDescription) {
    report.push({ file: rom.file, status: 'existing', source: existing.coverSource });
    continue;
  }

  try {
    const candidate = await findCandidate(rom);
    if (!candidate || candidate.score < 55) {
      metadata.games[rom.file] = {
        ...(existing ?? {}),
        coverSearchUrl: getSearchUrl(rom),
        coverStatus: 'missing-candidate',
        verified: false,
      };
      report.push({ file: rom.file, status: 'no-confident-page', score: candidate?.score ?? 0 });
      continue;
    }

    const page = candidate.page;
    const sourceUrl = page.fullurl ?? `https://${candidate.language}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`;
    const imageUrl = candidate.imageUrl
      ?? (candidate.coverFile ? makeImageUrl(candidate.language, candidate.coverFile) : page.thumbnail?.source);
    if (!imageUrl) {
      metadata.games[rom.file] = {
        ...(existing ?? {}),
        coverSource: sourceUrl,
        coverSearchUrl: getSearchUrl(rom),
        coverStatus: 'page-without-image',
        verified: false,
      };
      report.push({ file: rom.file, status: 'page-without-image', page: page.title, score: candidate.score });
      continue;
    }

    const filename = makeSlug(rom.file);
    const outputPath = path.join(coverDirectory, filename);
    if (download && needsCover) await downloadAndNormalize(imageUrl, outputPath);
    metadata.games[rom.file] = {
      ...(existing ?? {}),
      ...(needsCover ? {
        cover: `assets/covers/${filename}`,
        coverSource: candidate.coverFile ? `${sourceUrl}#${encodeURIComponent(candidate.coverFile)}` : sourceUrl,
        coverImageSource: imageUrl,
        coverStatus: candidate.coverFile ? 'candidate-box-art' : 'candidate-page-image',
        coverConfidence: candidate.score >= 90 && candidate.coverFile ? 'high' : 'review',
      } : {}),
      coverSearchUrl: getSearchUrl(rom),
      ...(needsDescription && candidate.description && candidate.descriptionLanguage === 'zh' ? {
        description: candidate.description,
        descriptionSource: candidate.descriptionSource,
        descriptionStatus: 'candidate-wikipedia',
      } : {}),
      verified: false,
    };
    report.push({ file: rom.file, status: download && needsCover ? 'downloaded' : 'metadata-updated', page: page.title, score: candidate.score, image: Boolean(candidate.coverFile), description: Boolean(candidate.description && candidate.descriptionLanguage === 'zh') });
  } catch (error) {
    report.push({ file: rom.file, status: 'error', error: error.message });
  }
}

if (download) fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify({ download, offset, selected: selectedRoms.length, report }, null, 2));
