import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadataPath = path.join(projectRoot, 'public', 'game-metadata.json');
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

const descriptions = {
  '機器貓小叮噹冒險RPG(日版).zip': '哆啦A夢 大雄與基加殭屍的逆襲 (Doraemon: Giga Zombie no Gyakushuu)：Epoch 推出的經典正統 RPG。玩家操控主角與大雄一行人，穿越原始時代、海底世界等五大時空，運用四次元道具拯救夥伴並擊潰基加殭屍。',
  '龙珠Z2-激斗弗利撒.nes': '七龍珠 ZII 激神弗利沙!! (Dragon Ball Z II: Gekishin Freeza!!)：卡牌指令式 RPG。劇情涵蓋賽亞人殘黨與那美克星篇，卡牌星數決定攻防數值，悟空變身超級賽亞人迎戰弗利沙為高潮。',
  '龙珠Z3-烈战人造人.nes': '七龍珠 ZIII 烈戰人造人 (Dragon Ball Z III: Ressen Jinzouningen)：延續卡牌戰鬥系統，改編人造人篇前半段及劇場版克維拉劇情，戰鬥節奏更緊湊並新增「必殺技卡」。',
  '龙珠Z外传-塞亚人灭绝计划.nes': '七龍珠 Z 外傳 賽亞人滅絕計畫 (Dragon Ball Z Gaiden: Saiyajin Zetsumetsu Keikaku)：原創劇場版連動 RPG。取消卡牌數值，改為透過「拳、光、氣、體」等符號卡牌自由組合搓出招式，戰鬥動畫魄力極高。',
  '熱血時代劇(熱血道中記).zip': '熱血時代劇 (Downtown Special: Kunio-kun no Jidaigeki da yo Zen\'in Shuugou!)：熱血系列集大成之橫向卷軸動作 RPG。以江戶時代為背景，導入同伴系統、必殺技購買與大張地圖探索。',
  '热血格斗中文.nes': '熱血格鬥傳說 (Nekketsu Kakutou Densetsu)：四人同場亂鬥格鬥遊戲。支援自訂角色（依生日血型決定技能），主打雙人合體必殺技與豐富的場地陷阱。',
  '热血足球3.NES': '熱血足球3 (Kunio-kun no Nekketsu Soccer League / 熱血足球聯盟)：經典搞笑體育遊戲（通常指《熱血足球聯盟》）。玩家帶領日本隊征戰世界，特色是完全無犯規機制、天氣地形影響與極限必殺射門。',
  '幽游白書-爆斗暗黑武術會.zip': '幽遊白書 爆鬥暗黑武術會 (Yuu Yuu Hakusho: Bakutou Ankoku Bujutsukai)：FC 磁碟機格鬥遊戲（需搭配專用讀卡器 Datach）。主打暗黑武術會劇情，角色採用即時指令格鬥模式。',
  '幽游白書-魔界最強列傳.zip': '幽遊白書 魔界最強列傳：FC 末期／未授權或非官方移植（官方《魔界最強列傳》為 SFC 平台），主打幽助等人魔界大會角色的對戰格鬥。',
  '打磚塊.zip': '打磚塊 (Arkanoid)：TAITO 經典磚塊消除遊戲。操控底部的 Vaus 飛船反彈能量球破壞磚塊，可吃到激光射擊、板身變寬等強化道具。',
  '打磚塊2.zip': '打磚塊 2 (Arkanoid II: Revenge of DOH)：前作正統續作。增加更多磚塊類型、敵人機制與分支關卡路線選擇。',
  '快樂貓.zip': '快樂貓 (Mappy / 貓捉老鼠)：南夢宮動作益智遊戲。玩家操控警官鼠 Mappy 在房屋內利用跳床彈跳穿梭，躲避貓咪大盜並回收被偷走的家電。',
  '快樂鼠.zip': '快樂鼠 (Mappy Kids / 快樂貓 2)：Mappy 續作，改為橫向卷軸動作平台過關。操控小老鼠收集金幣、過關後在商店購買建材打造自己的家。',
  '冒险岛1无敌版.nes': '冒險島 1 無敵版 (Takahashi Meijin no Bouken Jima - Hack)：經典橫向卷軸《高橋名人冒險島》的玩家修改版。鎖定無敵或鎖定體力計量條，大幅降低嚴苛的摔落與飢餓判定難度。',
  '吞食天地2-諸葛孔明傳.zip': '吞食天地 II：諸葛孔明傳 (Destiny of an Emperor II)：Capcom 經典三國 RPG。以兵力作為生命值，具有陣形、策略、總攻擊等系統，策略性與完成度極高。',
  '36計(中文).zip': '神龍之謎 36 計 (Dragon Ball / DQ 改版)：多為早年台灣/香港漢化組或盜版商整合的經典改版 RPG（多基於《勇者鬥惡龍》或《封神榜》底層魔改）。',
  '貓之迷宮(貓咪小鎮).zip': '貓之迷宮／貓咪小鎮 (Onyanko Town / 貓咪小鎮)：玩家扮演母貓，在俯視角的街區地圖中躲避惡狗，穿梭於下水道與人行道，將走失的小貓一隻隻叼回家中。',
  '三隻小豬(豬狼大戰).zip': '三隻小豬／豬狼大戰 (Pooyan)：著名射擊防守遊戲。豬媽媽搭乘升降梯移動，利用弓箭射破大野狼的氣球，或投擲肉塊一次砸落成群野狼。',
  '火鳳凰.zip': '火鳳凰 (Hi no Tori: Hououhen)：Konami 根據手塚治虫漫畫改編的動作平台遊戲。主角我王透過雕刻磚塊墊腳或攻擊，穿梭多個時代收集火鳳凰浮雕碎片。',
  '瘋狂賽車.zip': '瘋狂賽車 (Mach Rider)：任天堂早期後視角高速摩托車賽車遊戲。玩家在末日公路上駕駛武裝機車高速奔馳，用機槍掃除障礙物並可自建賽道。',
  '圣铃传说.nes': '聖鈴傳說 (Holy Diver)：由 Takeru 開發、Taito 於 1992 年末期發行的頂級橫向動作神作。玩家持有不可思議的「聖鈴」，可在冒險中隨時即時切換 4 位能力各異的角色。',
  '棒球之星.zip': '棒球之星 (Baseball Stars)：SNK 經典運動遊戲。首創自創球隊、球員數值升級養成與球隊經營機制，是 FC 上最具深度的棒球作品之一。',
  '世界盃網球賽(世界超級網球).zip': '世界盃網球賽 (World Court Tennis)：Namco 俯視角網球遊戲。除單雙打錦標賽模式外，最大特色是包含打網球戰鬥的「RPG 冒險模式」。',
  '企鵝先生.zip': '企鵝先生 (Yume Penguin Monogatari / 夢企鵝物語)：Konami 趣味橫向動作遊戲。企鵝主角需要在奔跑過程中吃減肥藥減重並打怪，在時限內瘦身成功才能挽回女友芳心。',
  '110合1.zip': '110 合 1 / 115 合 1 / 260 合 1 / 150 合 1 / 1200 合 1 (多合一卡匣)：早年常見的盜版黃卡集合。通常由 20–50 款經典早期小遊戲（如魂斗羅、坦克大戰、淘金者）透過修改關卡起點、重命名角色與數值魔改重複拼湊而成。',
  '115合1.zip': '110 合 1 / 115 合 1 / 260 合 1 / 150 合 1 / 1200 合 1 (多合一卡匣)：早年常見的盜版黃卡集合。通常由 20–50 款經典早期小遊戲（如魂斗羅、坦克大戰、淘金者）透過修改關卡起點、重命名角色與數值魔改重複拼湊而成。',
  '260合1(150合1).zip': '110 合 1 / 115 合 1 / 260 合 1 / 150 合 1 / 1200 合 1 (多合一卡匣)：早年常見的盜版黃卡集合。通常由 20–50 款經典早期小遊戲（如魂斗羅、坦克大戰、淘金者）透過修改關卡起點、重命名角色與數值魔改重複拼湊而成。',
  '1200-in-1.nes': '110 合 1 / 115 合 1 / 260 合 1 / 150 合 1 / 1200 合 1 (多合一卡匣)：早年常見的盜版黃卡集合。通常由 20–50 款經典早期小遊戲（如魂斗羅、坦克大戰、淘金者）透過修改關卡起點、重命名角色與數值魔改重複拼湊而成。',
  '0076 - 超級瑪莉歐大集合 (簡)(少量漢化)(王瀟亮).SMC': '超級瑪莉歐大集合 (Super Mario All-Stars)：16 位元重製合輯。收錄《超級瑪莉歐兄弟》1、2、3 代與日版初代續作《失落的關卡》，畫面與音效全面重繪並支援存檔。',
  '0004 - 七龍珠Z超悟空傳-突激篇 (簡)(90%)(野獸).zip': '七龍珠 Z 超悟空傳：突激篇 (Dragon Ball Z: Chou Gokuu Den - Totsugeki-Hen)：文字互動冒險與動作指令戰鬥遊戲。還原悟空童年期自遇見布瑪到擊敗比克大魔王的冒險，強調攻防時機判定。',
  '0026 - 皇家騎士團 (簡)(V0.04a)(無花泥).zip': '皇家騎士團 (Tactics Ogre: Let Us Cling Together)：松野泰己打造的戰略模擬 RPG（S-RPG）金字塔之作。首創 45 度斜向視角、高度差影響命中，並擁有深刻厚重的中世紀多線政治劇情。',
  '0066 - 灌籃高手2 (簡)(V0.3)(勇者漢化組).SMC': '灌籃高手 2 (Slam Dunk 2: IH Yosen Kanzenban!!)：動畫改編半即時戰略籃球遊戲。包含神奈川縣大賽完整劇情，以動畫特寫與即時指令選擇傳球、運球突破與灌籃。',
  '5d049351ad7a1b6f4d9dd1cacfaf8be0a53be23e5a85d6fd0ef3d119d442892d.gb.zip': '神奇寶貝 Yishiluo：未授權/盜版改版 ROM。通常為民間改版商以初代《紅/綠/金/銀》為骨架魔改文本、地圖或寶可夢精靈圖的非官方衍生作品。',
  '圣剑传说(简)(v1.1)(RangerMarsh)(4Mb).gb': '聖劍傳說 中文版本 (Final Fantasy Adventure / Seiken Densetsu)：Square 經典動作 RPG 系列首作的民間中文漢化版。玩家手持劍、斧、鞭等武器解謎，透過蓄力計量條發動必殺技。',
  '热斗拳皇96(简)(v1.0)(Stephen+湮没骑士の镇魂歌+落榜の美术生)(8Mb).gb': '熱斗拳皇 96 (Nettou The King of Fighters \'96)：Takara 官方移植的 Q 版格鬥作品。在 GB 雙鍵限制下完美還原 3v3 組隊、超必殺技與簡易出招指令，支援隱藏頭目使用。',
  'Ninku (Japan) [T-En by Some Good Shit Translations v0.1] [i].gg': '忍空 英文翻譯版 (Ninku - Fan Translation)：SEGA 橫向卷軸動作格鬥遊戲。改編自同名動漫，操作風助等人使用風術等忍術擊倒敵人，英翻版由海外愛好者將日文選單與劇情完整在地化。',
  'sf2rb2.zip': '快打旋風 II 彩虹改版 (Street Fighter II\': Rainbow Edition)：90 年代風靡全球的非官方街機改版基板。招式徹底失控：能在空中施展任何必殺技、波動拳能自動追蹤或連發複數光波、戰鬥中按下特定按鈕可直接瞬間切換角色。',
};

let updated = 0;
for (const [file, description] of Object.entries(descriptions)) {
  const game = metadata.games?.[file];
  if (!game) throw new Error(`ROM is not in metadata: ${file}`);
  if (game.description !== description) {
    game.description = description;
    game.descriptionSource = 'editorial:user-provided';
    game.descriptionStatus = 'editorial';
    game.verified = false;
    updated += 1;
  }
}

fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify({ updated, total: Object.keys(descriptions).length }, null, 2));