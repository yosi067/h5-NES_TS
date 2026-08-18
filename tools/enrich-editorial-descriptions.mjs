import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadataPath = path.join(projectRoot, 'public', 'game-metadata.json');
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const editorial = {
  '最終幻想(太空戰士).zip': ['《太空戰士》是史克威爾推出的回合制角色扮演遊戲，玩家帶領四名光之戰士踏上修復水晶、拯救世界的旅程。', 'https://en.wikipedia.org/wiki/Final_Fantasy_(video_game)'],
  '最終幻想2(太空戰士2).zip': ['《太空戰士 II》以菲力翁等四名主角的反抗軍旅程為主軸，採用回合制戰鬥與可自由提升能力的成長系統。', 'https://en.wikipedia.org/wiki/Final_Fantasy_II'],
  '最終幻想3(太空戰士3).zip': ['《太空戰士 III》描寫四名少年成為光之戰士後阻止黑暗吞噬世界，職業轉換與召喚系統是本作的核心特色。', 'https://en.wikipedia.org/wiki/Final_Fantasy_III'],
  '機器貓小叮噹冒險.zip': ['《哆啦A夢》是以藤子·F·不二雄作品為題材的 FC 動作遊戲，玩家操作哆啦A夢使用道具，在關卡中探索並擊退敵人。', 'https://en.wikipedia.org/wiki/Doraemon_(1986_video_game)'],
  '天使之翼2(足球小將2).zip': ['《足球小將 II：超級前鋒》以大空翼與日本隊的成長為主線，將足球比賽呈現為可選擇指令與必殺技的劇情式對戰。', 'https://en.wikipedia.org/wiki/Captain_Tsubasa_II:_Super_Striker'],
  '雙截龍2.zip': ['《雙截龍 II：復仇》延續李氏兄弟對抗黑幫的橫向格鬥冒險，加入更多武器、關卡與合作戰鬥動作。', 'https://en.wikipedia.org/wiki/Double_Dragon_II:_The_Revenge'],
  '雙截龍3.zip': ['《雙截龍 III：羅塞塔之石》讓 Billy 與 Jimmy 踏上尋找羅塞塔石的旅程，並加入可切換的世界地區與新角色。', 'https://en.wikipedia.org/wiki/Double_Dragon_III:_The_Sacred_Stones'],
  '双截龙3.nes': ['此 ROM 是《雙截龍 III：羅塞塔之石》的另一個 NES 版本，核心內容沿用原作；封面與簡介描述的是基礎遊戲，不代表此 dump 的修改細節。', 'https://en.wikipedia.org/wiki/Double_Dragon_III:_The_Sacred_Stones'],
  '伊蘇國2.zip': ['《伊蘇國 II》延續亞特魯在 Esteria 的冒險，玩家探索 Darm Tower 與 Ys 世界，透過高速動作戰鬥和探索推進劇情。', 'https://en.wikipedia.org/wiki/Ys_II:_Ancient_Ys_Vanished_%E2%80%93_The_Final_Chapter'],
  '伊蘇國3.zip': ['《伊蘇國 III：漂泊者之旅》描寫亞特魯前往 Felghana、追查古代遺跡與魔物事件的動作角色扮演冒險。', 'https://en.wikipedia.org/wiki/Ys_III:_Wanderers_from_Ys'],
  '七寶奇謀2.zip': ['《七寶奇謀 II》是以電影角色為主角的 FC 冒險遊戲，玩家探索島嶼、解開機關並營救被綁架的孩子。', 'https://en.wikipedia.org/wiki/The_Goonies_II'],
  '大盜伍佑衛門2.zip': ['《大盜五右衛門 2：奇天烈將軍的復仇》以五右衛門等角色在江戶世界的冒險為主，結合橫向動作、探索與小遊戲。', 'https://en.wikipedia.org/wiki/Ganbare_Goemon_2:_Kiteretsu_Shogun_Maggins'],
  '兵蜂3.zip': ['《兵蜂 3：波克波克大魔王》是《兵蜂》系列的縱向射擊遊戲，玩家操控飛行器收集鈴鐺、強化武器並擊破關卡頭目。', 'https://en.wikipedia.org/wiki/TwinBee_3:_Poko_Poko_Daima%C5%8D'],
  '冒险岛1.nes': ['《冒險島》是 Hudson 的橫向動作遊戲，玩家操控高橋名人在島嶼中奔跑、跳躍、收集水果並拯救戀人。', 'https://en.wikipedia.org/wiki/Adventure_Island_(video_game)'],
  '冒险岛1无敌版.nes': ['此 ROM 是《冒險島》的無敵改版，保留原作的島嶼闖關與動作玩法，並以修改角色耐久度降低失敗風險；改版細節未另行核對。', 'https://en.wikipedia.org/wiki/Adventure_Island_(video_game)'],
  '冒险岛3无限人出来就有恐龙可以骑.nes': ['此 ROM 以《冒險島 3》為基礎，保留原作的動作闖關與恐龍夥伴，並標示為無限人及開場即可騎乘恐龍的改版。', 'https://en.wikipedia.org/wiki/Adventure_Island_3'],
  '吞食天地.zip': ['《吞食天地》是以三國演義為背景的回合制角色扮演遊戲，玩家扮演劉備陣營招募武將、管理隊伍並完成統一天下的戰事。', 'https://en.wikipedia.org/wiki/Destiny_of_an_Emperor'],
  '忍者劍豪傳(劍豪傳).zip': ['《忍者龍劍傳》以隼龍為主角，玩家穿越多個關卡追查父親死亡與邪教陰謀，使用劍術、跳躍和忍術道具戰鬥。', 'https://en.wikipedia.org/wiki/Ninja_Gaiden_(NES_video_game)'],
  '1942.zip': ['《1942》是 Capcom 的縱向射擊遊戲，玩家駕駛戰鬥機穿越太平洋戰場，躲避彈幕、使用翻滾並摧毀敵方機群。', 'https://en.wikipedia.org/wiki/1942_(video_game)'],
  '迷宫组曲.nes': ['《迷宮組曲：米隆的神秘城堡》是探索型動作遊戲，玩家在城堡房間間移動、收集樂器與道具，逐步解開迷宮並擊敗敵人。', 'https://en.wikipedia.org/wiki/Milon%27s_Secret_Castle'],
  'Zombie Hunter (Japan).nes': ['《Zombie Hunter》是 NES 動作角色扮演遊戲，玩家探索遭受殭屍侵襲的世界，收集裝備、提升能力並尋找生存之道。', 'https://en.wikipedia.org/wiki/Zombie_Hunter'],
  'Super Mario Land 2 - 6 Golden Coins (USA, Europe) (Rev 2).gb': ['《超級瑪利歐樂園 2：六個金幣》是 Game Boy 平台動作遊戲，瑪利歐必須穿越多個區域收集六枚金幣，奪回城堡。', 'https://en.wikipedia.org/wiki/Super_Mario_Land_2:_6_Golden_Coins'],
  '口袋妖怪黃 (繁) (加強版) (unknown).gb': ['此 ROM 以《Pokémon Yellow》為基礎，採用皮卡丘作為旅程起點並加入動畫版角色配置；繁體中文加強內容與 dump 差異尚未逐項核對。', 'https://en.wikipedia.org/wiki/Pok%C3%A9mon_Yellow'],
  'Legend of Illusion Starring Mickey Mouse (J).gg': ['《Legend of Illusion Starring Mickey Mouse》是 Game Gear 動作平台遊戲，米奇在奇幻王國中穿越關卡、使用變身能力並對抗敵人。', 'https://en.wikipedia.org/wiki/Legend_of_Illusion_Starring_Mickey_Mouse'],
  'Sonic Drift 2 (World).gg': ['《Sonic Drift 2》是以音速小子角色參賽的 Game Gear 賽車遊戲，玩家在賽道中漂移、使用道具並與系列角色競速。', 'https://en.wikipedia.org/wiki/Sonic_Drift_2'],
  '0076 - 超級瑪莉歐大集合 (簡)(少量漢化)(王瀟亮).SMC': ['此 ROM 是《超級瑪利歐大集合》的少量漢化版本，收錄多款經典瑪利歐 NES 遊戲；封面與簡介以合輯原作為基礎，漢化範圍未另行核對。', 'https://en.wikipedia.org/wiki/Super_Mario_All-Stars'],
  '0039 - 最終幻想5 (繁)(V2.0)(Boco等).zip': ['《太空戰士 V》描寫巴茲與夥伴守護水晶、對抗艾克斯迪司的冒險，職業與能力組合系統讓隊伍養成具高度彈性。', 'https://en.wikipedia.org/wiki/Final_Fantasy_V'],
  '0041 - 最終幻想6 (繁)(V1.1)(日選單)(勇者漢化組).smc': ['《太空戰士 VI》以帝國壓迫下的群像角色為主軸，透過魔石、召喚與多線劇情描寫反抗軍對抗世界崩壞。', 'https://en.wikipedia.org/wiki/Final_Fantasy_VI'],
  '0019 - 勇者鬥惡龍1+2 (簡)(1代漢化)(波波).zip': ['此 ROM 是《勇者鬥惡龍 I·II》的簡體中文版本，合併兩部早期角色扮演遊戲，玩家探索城鎮、培養隊伍並完成勇者的征途。', 'https://en.wikipedia.org/wiki/Dragon_Quest_I_%26_II'],
  '0050 - 聖火降魔錄3-紋章之謎 (繁)(V1.03)(狼組).zip': ['《聖火降魔錄：紋章之謎》是策略角色扮演遊戲，玩家指揮部隊在格子地圖上作戰，角色死亡通常會永久離隊。', 'https://en.wikipedia.org/wiki/Fire_Emblem:_Mystery_of_the_Emblem'],
  '0052 - 聖火降魔錄4-聖戰系譜 (簡)(完全漢化第二版)(火花天龍劍).zip': ['《聖火降魔錄：聖戰之系譜》以兩代人的戰爭與血緣故事為主軸，結合策略戰鬥、角色配對與跨世代隊伍養成。', 'https://en.wikipedia.org/wiki/Fire_Emblem:_Genealogy_of_the_Holy_War'],
  '0053 - 聖火降魔錄5-多拉基亞776 (繁)(V1.00)(狼組).zip': ['《聖火降魔錄：多拉基亞 776》描寫里夫率領反抗軍解放領地，採用資源有限、地形影響明顯的高難度策略戰鬥。', 'https://en.wikipedia.org/wiki/Fire_Emblem:_Thracia_776'],
  'Dragon Ball Z - Super Butouden 2 (Japan) (Rev 1).zip': ['《七龍珠 Z：超武鬥傳 2》是以七龍珠 Z 角色為主的格鬥遊戲，玩家可在故事模式與對戰模式中使用氣功、必殺技及空中戰鬥。', 'https://en.wikipedia.org/wiki/Dragon_Ball_Z:_Super_Butoden_2'],
  'Dragon Ball Z - Super Butouden 3 (Japan).zip': ['《七龍珠 Z：超武鬥傳 3》延續系列的格鬥系統，收錄更多 Z 戰士與變身招式，並以一對一戰鬥呈現原作的高速對決。', 'https://en.wikipedia.org/wiki/Dragon_Ball_Z:_Super_Butoden_3'],
  'Tales of Phantasia (Japan).zip': ['《時空幻境》是以克雷斯一行人為主角的動作角色扮演遊戲，玩家在世界地圖探索、即時操控隊伍戰鬥並追查歷史災厄。', 'https://en.wikipedia.org/wiki/Tales_of_Phantasia'],
  '0066 - 灌籃高手2 (簡)(V0.3)(勇者漢化組).SMC': ['此 ROM 是以《灌籃高手》系列為題材的 SNES 籃球遊戲漢化版本，核心玩法為球隊比賽與角色操作；補丁差異尚未逐項核對。', 'editorial'],
  'NBA Jam (USA) (Rev 1).sfc': ['《NBA Jam》是街機風格的籃球遊戲，以二對二比賽、誇張灌籃與火熱狀態取代完整籃球規則，強調快速對戰。', 'https://en.wikipedia.org/wiki/NBA_Jam'],
  'Wave Race 64 (U) (V1.1) [!].zip': ['《Wave Race 64》是 Nintendo 64 水上摩托車競速遊戲，玩家在波浪、浮標與狹窄航道間調整路線，完成多種比賽模式。', 'https://en.wikipedia.org/wiki/Wave_Race_64'],
  'Toy Story 2_ Buzz Lightyear to the Rescue!.zip': ['《Toy Story 2：Buzz Lightyear to the Rescue》是 3D 平台動作遊戲，玩家操作巴斯光年探索關卡、收集物品並拯救被綁架的玩具朋友。', 'https://en.wikipedia.org/wiki/Toy_Story_2:_Buzz_Lightyear_to_the_Rescue'],
  'pacman.zip': ['《Pac-Man》是 Namco 的迷宮街機遊戲，玩家操控黃色角色吃掉迷宮中的豆子，同時躲避四隻會改變追擊策略的鬼。', 'https://en.wikipedia.org/wiki/Pac-Man_(video_game)'],
  'ddp2100.zip': ['《怒首領蜂 II：蜂暴》是 Cave 系列的縱向彈幕射擊遊戲，玩家在密集彈幕中移動、累積火力並擊敗大型頭目。', 'https://en.wikipedia.org/wiki/DoDonPachi_II'],
  'area88.zip': ['《Area 88》是以新谷薰漫畫為背景的縱向射擊遊戲，玩家駕駛戰機完成任務、賺取資金並購買更強武器與機體。', 'https://en.wikipedia.org/wiki/Area_88_(video_game)'],
  'parodius.zip': ['《Parodius》以 Konami 作品為素材，將縱向射擊與誇張角色、幽默場景結合，玩家可在多種武器配置中挑戰關卡。', 'https://en.wikipedia.org/wiki/Parodius_(1990_video_game)'],
  'wof.zip': ['《吞食天地 II：赤壁之戰》是以三國武將為主角的橫向清版動作遊戲，玩家一路擊破敵軍並重現赤壁戰役。', 'https://en.wikipedia.org/wiki/Warriors_of_Fate'],
  'bublbobl.zip': ['《泡泡龍》是經典平台街機遊戲，玩家操控泡泡龍吐泡泡困住敵人，再擊破泡泡清除每一關。', 'https://en.wikipedia.org/wiki/Bubble_Bobble'],
  'sf2rb2.zip': ['此 ZIP 是《快打旋風 II：冠軍版》的彩虹改版，沿用原作角色與對戰框架並改動速度、招式或平衡；改版差異未逐項核對。', 'https://en.wikipedia.org/wiki/Street_Fighter_II:_Champion_Edition'],
  'kof94.zip': ['《格鬥拳王 94》建立 SNK 隊伍制格鬥賽，玩家選擇三人隊伍，在淘汰賽中使用連段、必殺技與隊伍策略取勝。', 'https://en.wikipedia.org/wiki/The_King_of_Fighters_%2794'],
  'kof95.zip': ['《格鬥拳王 95》延續隊伍制格鬥玩法，加入隊伍編成與更完整的角色對戰系統，並推進草薙京與八神庵的故事。', 'https://en.wikipedia.org/wiki/The_King_of_Fighters_%2795'],
  'kof96.zip': ['《格鬥拳王 96》更新角色動作與招式性能，玩家組成三人隊伍參加 KOF 大賽，體驗更強調攻防節奏的格鬥對戰。', 'https://en.wikipedia.org/wiki/The_King_of_Fighters_%2796'],
  'kof97.zip': ['《格鬥拳王 97》以大蛇篇為故事核心，提供 Advanced 與 Extra 等不同操作風格，讓隊伍配置與能量管理成為戰術的一部分。', 'https://en.wikipedia.org/wiki/The_King_of_Fighters_%2797'],
  'kof98.zip': ['《格鬥拳王 98》是以歷代角色組成夢幻陣容的對戰作品，弱化劇情、強化平衡與隊伍策略，適合純粹格鬥對戰。', 'https://en.wikipedia.org/wiki/The_King_of_Fighters_%2798'],
  'kof2000.zip': ['《格鬥拳王 2000》延續三人隊伍格鬥，加入 Striker 支援系統，玩家可在攻防間呼叫隊友製造連段與戰術變化。', 'https://en.wikipedia.org/wiki/The_King_of_Fighters_2000'],
  'samsho2.zip': ['《侍魂 II》是以冷兵器對決為核心的格鬥遊戲，強調距離、斬擊威力與讀取對手行動，而非單純連續攻擊。', 'https://en.wikipedia.org/wiki/Samurai_Shodown_II'],
  'samsho4.zip': ['《侍魂 IV：天草降臨》延續武器格鬥系統，加入怒氣、劍質與角色路線等要素，讓每次斬擊都具有高風險高報酬。', 'https://en.wikipedia.org/wiki/Samurai_Shodown_IV:_Amakusa%27s_Revenge'],
  'samsho5.zip': ['《侍魂 V》以武器對戰為核心，加入新的角色與戰鬥調整，玩家需要掌握距離、受身與怒氣資源才能取勝。', 'https://en.wikipedia.org/wiki/Samurai_Shodown_V'],
  'svc.zip': ['《SNK 對卡普空 SVC Chaos》是 SNK 與 Capcom 角色同台的格鬥遊戲，玩家從兩家公司作品中選角，使用必殺技與超必殺技對戰。', 'https://en.wikipedia.org/wiki/SNK_vs._Capcom:_SVC_Chaos'],
  'mslug2t.zip': ['《越南大戰 2》是橫向 run-and-gun 射擊遊戲，玩家使用重機槍、手榴彈與載具突破敵軍基地，並以救出俘虜取得支援。', 'https://en.wikipedia.org/wiki/Metal_Slug_2'],
  'mslug3.zip': ['《越南大戰 3》延續系列的橫向射擊與載具玩法，加入分歧路線、殭屍等敵人與更多可探索的戰場。', 'https://en.wikipedia.org/wiki/Metal_Slug_3'],
  'mslug4.zip': ['《越南大戰 4》是系列橫向射擊作品，玩家在軍事基地與荒地間作戰，透過武器、近戰攻擊與載具突破敵陣。', 'https://en.wikipedia.org/wiki/Metal_Slug_4'],
  'ms5pcb.zip': ['《越南大戰 5》延續系列的高密度橫向射擊，玩家使用槍械、刀攻與載具迎戰敵軍；此檔案標示為 JAMMA PCB 版本。', 'https://en.wikipedia.org/wiki/Metal_Slug_5'],
  '機器貓小叮噹冒險RPG(日版).zip': ['《哆啦A夢：大雄與基加殭屍的逆襲》是以哆啦A夢與大雄為主角的 RPG，玩家探索地圖、收集道具並透過回合制戰鬥推進故事；此 ROM 的版本差異尚未逐項核對。', 'editorial'],
  '龙珠Z2-激斗弗利撒.nes': ['此 ROM 標示為《七龍珠 Z 2：激戰弗利沙》的 Famicom 版本，內容以悟空一行對抗弗利沙軍團的戰鬥與成長為主；漢化或改版差異尚未逐項核對。', 'editorial'],
  '龙珠Z3-烈战人造人.nes': ['此 ROM 標示為《七龍珠 Z 3：烈戰人造人》的 Famicom 版本，主題是 Z 戰士迎戰人造人與沙魯的冒險；此 dump 的版本差異尚未逐項核對。', 'editorial'],
  '龙珠Z外传-塞亚人灭绝计划.nes': ['此 ROM 標示為《七龍珠 Z 外傳：賽亞人滅絕計畫》，以 Z 戰士調查賽亞人威脅為主題；此中文版本的實際修改內容尚未逐項核對。', 'editorial'],
  '热血高校足球(J).nes': ['《熱血高校足球部》是 Kunio-kun 系列的足球動作作品，玩家以誇張的衝撞、必殺射門與團隊配合突破對手。', 'editorial'],
  '热血进行曲中文版.nes': ['《熱血進行曲》把 Kunio-kun 角色放入競技會場，玩家在障礙賽、格鬥與接力等項目中爭取總分。', 'editorial'],
  '熱血時代劇(熱血道中記).zip': ['《熱血時代劇》將 Kunio-kun 角色置於江戶時代背景，結合橫向動作、武器戰鬥與關卡探索；此 ROM 的漢化差異尚未逐項核對。', 'editorial'],
  '熱血曲棍球(熱血冰球).zip': ['《熱血曲棍球部》以快速碰撞和誇張招式呈現冰上球賽，玩家需要在攻守轉換中把球射入對方球門。', 'editorial'],
  '热血新记录.nes': ['《熱血新紀錄》是 Kunio-kun 系列的競技作品，玩家操控角色挑戰多種田徑與力量項目，爭取刷新紀錄。', 'editorial'],
  '热血格斗中文.nes': ['《熱血格鬥傳說》是 Kunio-kun 系列的一對一格鬥作品，玩家選擇角色使用拳腳、投技與必殺招式取勝；此中文 ROM 的改動尚未逐項核對。', 'editorial'],
  '热血足球3.NES': ['此 ROM 標示為《熱血足球 3》，以 Kunio-kun 系列的誇張足球對戰為核心，包含衝撞、必殺射門與快速攻防；版本差異尚未逐項核對。', 'editorial'],
  '热血篮球.nes': ['《熱血籃球》以街頭風格呈現高速籃球對戰，玩家可利用衝撞、搶球與誇張投籃招式改變比賽局勢。', 'editorial'],
  '聖鬥士星矢2.zip': ['《聖鬥士星矢：黃金傳說完結篇》延續星矢等青銅聖鬥士挑戰黃金聖鬥士的故事，結合指令式戰鬥與角色能力成長。', 'editorial'],
  '幽游白書-爆斗暗黑武術會.zip': ['此 ROM 以《幽遊白書》暗黑武術會篇為題材，讓浦飯幽助等角色進行格鬥對戰；檔案版本與漢化差異尚未逐項核對。', 'editorial'],
  '幽游白書-魔界最強列傳.zip': ['此 ROM 以《幽遊白書》的魔界角色為主，核心玩法是角色選擇與格鬥對戰；檔案版本與漢化差異尚未逐項核對。', 'editorial'],
  '吞食天地2-諸葛孔明傳.zip': ['《吞食天地 II：諸葛孔明傳》是以三國故事為背景的角色扮演遊戲，玩家招募武將、整備隊伍並透過回合制戰鬥推進諸葛孔明的征途；此 ROM 尚未找到可核對的封面頁。', 'editorial'],
  '半熟英雄.zip': ['《半熟英雄》是以王國經營與戰略戰鬥為核心的角色扮演作品，玩家派遣部隊、管理領地並以幽默劇情推進戰役。', 'https://en.wikipedia.org/wiki/Hanjuku_Hero'],
  '36計(中文).zip': ['此 ROM 標示為《神龍之謎 36 計》的中文版本，內容涉及策略、戰鬥或角色扮演玩法；由於檔案名稱無法唯一對應正式作品，實際版本仍待人工核對。', 'editorial'],
  '火之鳥鳳凰篇-我王之冒險.zip': ['《火之鳥：鳳凰篇 我王的冒險》是以手塚治虫作品為題材的 FC 動作遊戲，玩家操控我王穿越關卡、使用武器並對抗敵人。', 'https://en.wikipedia.org/wiki/Hi_no_Tori:_Hououhen_-_Gaou_no_Bouken'],
  '魔界村.zip': ['《魔界村》是高難度橫向動作遊戲，玩家操控騎士亞瑟穿越墓地與魔界，使用長槍等武器救出公主。', 'https://en.wikipedia.org/wiki/Ghosts_%27n_Goblins'],
  '家庭網球.zip': ['此 ROM 是家用主機上的網球作品，玩家透過發球、截擊與底線回球完成比賽；檔案名稱不足以唯一確認其正式版本。', 'editorial'],
  '世界盃網球賽(世界超級網球).zip': ['此 ROM 標示為世界盃網球賽，核心玩法是選擇球員進行單打或雙打比賽，透過發球與落點控制爭取勝利；正式版本仍待人工核對。', 'editorial'],
  '五子棋.nes': ['此 ROM 是五子棋類桌上遊戲，雙方輪流落子，先在棋盤上連成五子者獲勝；檔案未提供可辨識的正式作品名稱。', 'editorial'],
  '台湾16张麻将(中文).nes': ['此 ROM 是台灣十六張麻將的中文家用版本，玩家依規則摸牌、打牌與組成牌型，完成胡牌或比賽目標。', 'editorial'],
  '企鵝先生.zip': ['此 ROM 以企鵝角色為主角，提供關卡式動作或益智挑戰；僅依檔名無法安全確認正式作品與版本，待人工查看標題畫面。', 'editorial'],
  '110合1.zip': ['此 ROM 是 110 合 1 多合一卡帶，收錄多款 NES 小遊戲；實際收錄清單與各遊戲版本依 dump 而異，尚未逐項核對。', 'editorial'],
  '115合1.zip': ['此 ROM 是 115 合 1 多合一卡帶，收錄多款 NES 小遊戲；實際收錄清單與各遊戲版本依 dump 而異，尚未逐項核對。', 'editorial'],
  '260合1(150合1).zip': ['此 ROM 是標示為 260 合 1／150 合 1 的多合一卡帶，收錄多款 NES 小遊戲；實際清單與重複項目尚未逐項核對。', 'editorial'],
  '1200-in-1.nes': ['此 ROM 是 1200 合 1 多合一卡帶，實際收錄內容可能包含重複遊戲、改版與不同命名；完整清單尚未從 ROM 逐項辨識。', 'editorial'],
  '热斗拳皇96(简)(v1.0)(Stephen+湮没骑士の镇魂歌+落榜の美术生)(8Mb).gb': ['此 ROM 是 Game Boy 平台的《格鬥拳王 96》中文改版標示，嘗試將隊伍制格鬥玩法移植到掌機；補丁與內容差異尚未逐項核對。', 'editorial'],
  'Ninku (Japan) [T-En by Some Good Shit Translations v0.1] [i].gg': ['此 ROM 是 Game Gear《忍空》日版的英文翻譯版本，內容以忍空角色的動作闖關為主；翻譯補丁標示為 v0.1，尚未找到可核對的盒裝封面頁。', 'editorial'],
  '0004 - 七龍珠Z超悟空傳-突激篇 (簡)(90%)(野獸).zip': ['此 ROM 是《七龍珠 Z 超悟空傳：突擊篇》的簡體中文未完成度標示版本，採用角色扮演與指令戰鬥呈現悟空的冒險；補丁差異尚未逐項核對。', 'editorial'],
  'Ganbare Goemon - Yuki Hime Kyuushutsu Emaki (Japan) (Rev 2).zip': ['《大盜五右衛門：雪姬救出繪卷》是以五右衛門等角色為主的 SNES 動作冒險遊戲，結合橫向闖關、探索與日本民俗風格場景。', 'editorial'],
  'Ganbare Goemon 3 - Shishi Juurokubee no Karakuri Manjigatame (Japan) (Sample).zip': ['《大盜五右衛門 3》是 SNES 動作冒險作品，玩家在關卡與地圖間探索、使用角色能力並對抗敵人；此檔案標示為 Sample 版本。', 'editorial'],
  'Shin Kidou Senki Gundam W - Endless Duel (Japan).zip': ['《新機動戰記鋼彈 W：無盡的決鬥》是以鋼彈 W 機體為主的 SNES 格鬥遊戲，玩家選擇機體使用射擊、近戰與必殺技對戰。', 'editorial'],
  'Shin SD Sengokuden - Daishougun Retsuden (Japan).zip': ['《新 SD 戰國傳：大將軍列傳》是以 SD 鋼彈武者角色為主的 SNES 角色扮演作品，玩家探索地圖、組織隊伍並進行戰鬥。', 'editorial'],
};

let applied = 0;
let skipped = 0;
for (const [file, [description, reference]] of Object.entries(editorial)) {
  const game = metadata.games?.[file];
  if (!game || game.description) {
    skipped += 1;
    continue;
  }
  game.description = description;
  game.descriptionSource = reference === 'editorial' ? 'editorial' : `editorial:${reference}`;
  game.descriptionStatus = 'editorial';
  game.verified = false;
  applied += 1;
}

fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify({ applied, skipped, total: Object.keys(editorial).length }, null, 2));