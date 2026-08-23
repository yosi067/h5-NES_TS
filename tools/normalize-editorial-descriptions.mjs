import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenCC from 'opencc-js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadataPath = path.join(projectRoot, 'public', 'game-metadata.json');
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const convertToTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });
const shouldWrite = process.argv.includes('--write');

const summaries = {
  'SuperMarioBros3.nes': '《超級瑪利歐兄弟 3》是任天堂推出的 FC 動作遊戲。瑪利歐穿越多個世界、取得道具與能力，擊敗庫巴並救回碧姬公主。',
  '薩爾達傳說.zip': '《薩爾達傳說》是任天堂的動作冒險遊戲，林克探索海拉魯、收集迷宮中的神器並擊敗加農，拯救薩爾達公主。',
  '勇者鬥惡龍.zip': '《勇者鬥惡龍》系列開創日本式角色扮演遊戲風格；玩家探索城鎮與迷宮、培養隊伍，完成勇者拯救世界的旅程。',
  '勇者鬥惡龍3.zip': '《勇者鬥惡龍 III：接著邁向傳說》是 FC 角色扮演遊戲，玩家組成隊伍、轉職與探索世界，追查魔王巴拉莫斯並走向傳說的起點。',
  '勇者鬥惡龍4.zip': '《勇者鬥惡龍 IV：被引導的人們》以五個章節描寫不同角色的旅程，最後由勇者集結夥伴，對抗魔族與邪惡勢力。',
  '天使之翼(足球小將).zip': '《足球小將》是以大空翼為主角的足球題材作品，透過指令選擇、必殺技和劇情比賽，描寫少年球員逐步成長。',
  '忍者龍劍傳2.zip': '《忍者龍劍傳 II：暗黑的邪神劍》是 FC 動作遊戲，隼龍使用忍刀、忍術與高機動動作闖關，追查邪神復活的陰謀。',
  '忍者龍劍傳3.zip': '《忍者龍劍傳 III：黃泉方船》是 FC 動作遊戲，隼龍在高機動關卡中使用忍刀與忍術，追查陰謀並迎戰敵人。',
  '惡魔城日版.zip': '《惡魔城》是 Konami 推出的 FC 動作遊戲，玩家操作貝爾蒙特家族成員闖入城堡，以鞭子與道具擊敗德古拉。',
  '忍者蛙(戰鬥蛙).zip': '《忍者蛙》是 Rare 的動作闖關遊戲，Rash、Zitz 等角色穿越高難度關卡，營救同伴並擊敗黑暗女王。',
  'Battletoads (U) [a1].gg': '《忍者蛙》是 Rare 的動作闖關遊戲，Rash、Zitz 等角色穿越高難度關卡，營救同伴並擊敗黑暗女王。',
  '大力水手.zip': '《大力水手》是以 Popeye 漫畫角色為主角的動作遊戲，玩家在關卡中收集愛心、避開敵人並營救奧莉薇。',
  '南極大冒險.zip': '《南極大冒險》是 Konami 的 FC 動作遊戲，玩家操控企鵝在南極奔跑，躲避障礙、收集魚類並抵達各地標。',
  '坦克大戰(打坦克，Battle City).zip': '《坦克大戰》是 Namco 的 FC 迷宮射擊遊戲，玩家操控坦克摧毀敵軍，同時保護基地並利用磚牆與水域作戰。',
  '魔界村.zip': '《魔界村》是 Capcom 的高難度橫向動作遊戲，騎士亞瑟穿越魔界、以武器擊退怪物，救出被擄走的公主。',
  '棒球.zip': '《棒球》是以投球、打擊、守備和跑壘為核心的棒球遊戲，玩家帶領球隊完成比賽並爭取勝利。',
  '圣剑传说(简)(v1.1)(RangerMarsh)(4Mb).gb': '此 ROM 是 Game Boy《聖劍傳說》的簡體中文版本，玩家操控主角探索世界、取得瑪那之劍並以即時戰鬥對抗敵人；漢化內容未逐項核對。',
  'Super Mario Kart (Japan).zip': '《超級瑪利歐賽車》是 SNES 首作，玩家駕駛瑪利歐角色在賽道競速，使用道具干擾對手並爭取冠軍。',
  'Rockman X (Japan).sfc': '《洛克人 X》是 Capcom 的動作平台遊戲，X 使用裝甲、武器與特殊能力挑戰八名頭目，阻止非正規機器人的威脅。',
  '0045 - 超時空之鑰 (繁)(Beta)(Goldegg+Emukim).smc': '《超時空之鑰》是 SNES 角色扮演遊戲，克羅諾與夥伴穿越不同時代，尋找拯救世界、阻止末日的方法；此 ROM 為繁體中文 Beta 版。',
  'Secret of Mana (Reborn v2.5).sfc': '《聖劍傳說 2》是 SNES 動作角色扮演遊戲，三名主角為阻止帝國喚醒古代武器而踏上旅程，並以即時戰鬥與多人合作冒險。',
  'Seiken Densetsu 3 (Japan).zip': '《聖劍傳說 3》是 SNES 動作角色扮演遊戲，可從六名角色中選擇三人組隊，沿不同路線冒險並阻止魔獸摧毀世界。',
  '0023 - 勇者鬥惡龍6 (繁)(全劇情漢化)(日選單)(勇者漢化組).zip': '《勇者鬥惡龍 VI：幻之大地》是 SNES 角色扮演遊戲，主角在夢境與現實兩個世界間探索，集結夥伴對抗邪惡勢力；此 ROM 為繁體中文全劇情版本。',
  '0020 - 勇者鬥惡龍3 (繁)(V0.99.2)(精靈製作組).zip': '《勇者鬥惡龍 III：接著邁向傳說》是 FC 角色扮演遊戲，玩家組隊、轉職和探索世界，追討魔王巴拉莫斯；此 ROM 為繁體中文版本。',
  '0026 - 皇家騎士團 (簡)(V0.04a)(無花泥).zip': '《皇家騎士團》是策略角色扮演遊戲，玩家組織部隊、管理領地並在戰場上做出陣形與路線選擇；此 ROM 標示為簡體中文 V0.04a，改版內容未逐項核對。',
  '0055 - 雷霆任務 (繁)(V1.04)(Chrono+Mankee610).SMC': '《雷霆任務》是 SNES 戰略角色扮演遊戲，玩家操控機甲部隊完成任務、配置裝備並在戰場上制定戰術；此 ROM 為繁體中文 V1.04。',
  'raiden.zip': '《雷電》是縱向射擊遊戲，玩家駕駛戰機躲避彈幕、收集強化並擊破敵方艦隊與頭目。',
  'rtype.zip': '《異形戰機》是 Irem 的橫向射擊遊戲，玩家操控 R-9 戰機使用 Force 護盾與蓄力炮，突破敵軍並迎戰頭目。',
  'simpsons.zip': '《辛普森家庭》是 Konami 的街機橫向清版動作遊戲，玩家操作辛普森一家成員，沿街擊敗敵人並救回瑪姬。',
  'mslug.zip': '《越南大戰》是 SNK 的橫向射擊遊戲，玩家使用槍械、手榴彈與載具突破敵陣，營救俘虜並擊敗頭目。',
  'Legend of Zelda, The - Ocarina of Time.z64': '《薩爾達傳說 時之笛》是 N64 3D 動作冒險遊戲，林克在海拉魯探索迷宮、解謎並穿越時空，阻止加儂多夫。',
  'Super Mario 64 (USA).z64': '《超級瑪利歐 64》是任天堂的 3D 瑪利歐冒險作品，玩家在城堡畫作中探索關卡、收集星星並擊敗庫巴。',
  'Mario Kart 64 (USA).z64': '《瑪利歐賽車 64》是 N64 卡丁車競速遊戲，玩家在立體賽道上競速、漂移並使用道具對抗其他角色。',
  'Mario Tennis.zip': '《瑪利歐網球》是 N64 網球遊戲，玩家操作瑪利歐系列角色參加單打或雙打比賽，運用發球、擊球與特殊技巧取勝。',
  '打磚塊.zip': '此 ROM 標示為 NES《打磚塊》，核心玩法是操控擋板反彈球體、擊破上方磚塊；正式作品與版本尚待核對。',
  '打磚塊2.zip': '此 ROM 標示為 NES《打磚塊 2》，核心玩法是操控擋板反彈球體、擊破上方磚塊；正式作品與版本尚待核對。',
  '方塊.zip': '此 ROM 標示為 NES《方塊》，以排列或消除方塊為主的益智玩法；檔名不足以確認正式作品與版本。',
  '方塊2.zip': '此 ROM 標示為 NES《方塊 2》，以排列或消除方塊為主的益智玩法；檔名不足以確認正式作品與版本。',
  '快樂貓.zip': '此 ROM 的檔名標示為「快樂貓」，但僅憑檔名無法確認正式作品、玩法與版本；待查看標題畫面。',
  '快樂鼠.zip': '此 ROM 的檔名標示為「快樂鼠」，但僅憑檔名無法確認正式作品、玩法與版本；待查看標題畫面。',
  '貓之迷宮(貓咪小鎮).zip': '此 ROM 的檔名為「貓之迷宮／貓咪小鎮」，catalog 標題為「小精靈鼠」；名稱不一致，正式作品與玩法待查看標題畫面。',
  '三隻小豬(豬狼大戰).zip': '此 ROM 標示為「三隻小豬／豬狼大戰」，可能是以童話角色為題材的 NES 遊戲；正式作品與玩法尚待核對。',
  '火鳳凰.zip': '此 ROM 標示為 NES《火鳳凰》，僅憑檔名無法確認它對應的正式遊戲與玩法；待查看標題畫面。',
  '瘋狂賽車.zip': '此 ROM 標示為 NES《瘋狂賽車》，應屬競速類遊戲；正式作品與版本尚待核對。',
  '圣铃传说.nes': '此 ROM 標示為《聖鈴傳說》，但檔名與 catalog 使用不同字形；正式作品、玩法與版本尚待查看標題畫面。',
  '棒球之星.zip': '此 ROM 標示為 NES《棒球之星》，以投球、打擊和守備比賽為核心；正式作品與版本尚待核對。',
  '5d049351ad7a1b6f4d9dd1cacfaf8be0a53be23e5a85d6fd0ef3d119d442892d.gb.zip': '此 Game Boy ROM 的卡帶標題為「神奇寶貝 Yishiluo」，看似 Pokémon 類型改版或非正式版本；正式作品、內容與版本尚待核對。',
};

const summaryFiles = Object.keys(summaries);
const missingSummaryEntries = summaryFiles.filter(file => !metadata.games?.[file]);
if (missingSummaryEntries.length > 0) {
  throw new Error(`Summary entries missing from metadata: ${missingSummaryEntries.join(', ')}`);
}

let converted = 0;
let summarized = 0;
let descriptions = 0;
const beforeLong = [];
const afterLong = [];

for (const [file, game] of Object.entries(metadata.games ?? {})) {
  const original = typeof game.description === 'string' ? game.description : '';
  if (original.length > 180) beforeLong.push({ file, length: original.length });

  if (summaries[file]) {
    game.description = summaries[file];
    game.descriptionSource = 'editorial';
    game.descriptionStatus = 'editorial';
    summarized += 1;
  } else if (original.trim()) {
    const normalized = convertToTraditional(original);
    if (normalized !== original) converted += 1;
    game.description = normalized;
  }

  if (typeof game.description === 'string' && game.description.trim()) {
    descriptions += 1;
    if (game.description.length > 180) afterLong.push({ file, length: game.description.length });
  }
}

if (shouldWrite) fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

console.log(JSON.stringify({
  mode: shouldWrite ? 'write' : 'check',
  descriptions,
  converted,
  summarized,
  longBefore: beforeLong.length,
  longAfter: afterLong,
}, null, 2));