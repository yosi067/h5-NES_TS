# Zombie Hunter Japan：繁中選單第一階段

2026-09-06；分支 feature/zombie-hunter-zh-hant。**部分中文化，已接入實際執行期，不是完整遊戲翻譯，也不是中文 ROM/BPS。**

## 已實作與驗證

僅接受 SHA-256 `91dfb1a0c29f78c5d5b0a582c737c62103c4009ad5e2c20fdecd0c22a8648a48`（日本版 MMC1）。載入原 ROM 即自動開啟，畫面旁提供繁中選單開關。其他版本、載入失敗、證據不全時保留原文。

| 原文 | 顯示譯文 | 原版取樣幀 | 字格範圍（physical nametable row/column，0 起算） |
| --- | --- | --- | --- |
| PUSH START BOTTON | 按 START 開始 | 200 | 21/7，17×1 |
| もちもの | 道具 | 450、550 | 19/16，4×2 |
| ぶき | 武器 | 450、550 | 21/16，4×2 |
| そうび | 裝備 | 450、550 | 23/16，4×2 |
| つよさ | 能力 | 450、550 | 25/16，4×2 |
| POW | 體力 | 450 | 17/2，3×1 |
| EXP | 經驗 | 450 | 19/2，3×1 |
| GLD | 金錢 | 450 | 21/2，3×1 |

以上為原先八筆；第一批子頁增加下列十三筆（21 筆基線）。切換修正後 catalog 共 **45 筆位置記錄**，包含同一文字的原版捲動位置，**不是 45 種文字，也沒有全遊戲分母，不報完成百分比**。POW 體力與等級的原 ROM 驗證另見[最高等級證據](ZOMBIE_HUNTER_RUNTIME_TUNING.md)。數字、游標、圖示、logo 不覆寫。現在逐筆檢查完整 source/physical CHR，遮罩與文字均裁切至當幀勝出的背景像素；不再因另一筆未畫完或被游標遮擋而撤掉整組翻譯。

| 實際子頁 | 新增原文 → 繁中 |
| --- | --- |
| 道具 | つかう → 使用；すてる → 丟棄 |
| 武器 | てに もつ ぶきを → 手持武器；えらびなさい。 → 請選擇 |
| 裝備 | そうび → 裝備；ぼうぎょ → 防禦；きりょく → 氣力 |
| 能力 | レベル → 等級；つよさ → 力量；まほう → 魔法；ぼうぎょ → 防禦；きりょく → 氣力；MAXPOW → 最大體力 |

[子頁路線及逐格定義](../tools/zombie-submenu-routes.mjs)：Start 120/240/420；Down 470、500、530（依子頁0～3次）；A 600，650幀取樣。來源probe關閉滿級；runtime測試另覆蓋L0及L31，共8條實際原ROM路線。沒有注入背包、武器或能力值。濁音列也納入physical CHR驗證；冒號、數字與圖示不在遮罩內。

[子頁執行報告](../artifacts/zombie-submenu-runtime.json)含每筆 source/translation、實際 x/y、tile/physical CHR、路線與滿級開關。原始子頁樣本為 [items](../artifacts/zombie-submenu-items.json)、[weapons](../artifacts/zombie-submenu-weapons.json)、[equipment](../artifacts/zombie-submenu-equipment.json)、[status](../artifacts/zombie-submenu-status.json)。

## 證據邊界與架構

### 選單切換修正（2026-09-06）

- **根因一：整組門檻。** 原 ROM 分幀清除／重畫不同標籤；原來要求同組全部存在才顯示，造成已完成的字也回退日文。四個原版路線均逐幀重現部分 family 存在的過渡幀。辨識改為獨立完整 entry，不猜測尚未完成的字。
- **根因二：游標與起點。** 原來取第一格第一個可見像素為左上角，首像素遭遮擋就可能錯位；現在由任一來源字格完整 8 像素列和 fineY 推導唯一原點。整筆 source/CHR 必須吻合，僅將當幀 provenance 屬於該 entry 的像素 run 用作 Canvas clip；游標在來源內也不會被文字或背景蓋住，沒有 stale mask／跨幀快取。
- **根因三：遺漏操作狀態。** 原本只測 A600、650 幀的四個首頁，未包含道具 A670 後的「もちものを えらびなさい。」與能力 A670 後第二頁。新增「請選擇道具」、第二頁力量／魔法／防禦／氣力／最大體力／下級所需。
- 初始背包可直接操作驗證「ヘルメット → 頭盔」、「たて → 盾」、「レベル → 等級」、「みにつけた。 → 已裝備」。使用 A750，780 幀顯示結果，800／810 幀原生捲動，之後自動返回裝備頁。三個實體 nametable 位置分別有證據；不是任意位移搜尋。保留等級數字與日文助詞「を」，未把整個動態句子誤稱全譯。
- [actionRoutes 與來源定義](../tools/zombie-submenu-routes.mjs)及 artifacts 的 items-select、items-helmet、items-shield、status-next 與 scroll/end JSON 可重播。來源 probe 關閉滿級；穩定 action 狀態另驗證 L0／L31。沒有背包注入、原 ROM 修改、遊戲時序修改或能力／金錢修改。
- [逐幀切換報告](../artifacts/zombie-menu-switching-runtime.json)：四條原版路線每條檢查 410～950 共 541 幀，含選項游標、子頁 A 操作、返回與 Start 關閉。獨立 strict full-box oracle 要求所有完整可見標籤仍有翻譯；每個遮罩像素都核對來源 cell/fineY，950 幀只准 HUD，不准殘留選單。
- 已有整數 backing scale、pixelated 與不擴張遮罩邊界的白邊修正保留。瀏覽器以正式 WASM／catalog／renderer、393 CSS px 實測四首頁、頭盔／盾結果與能力第二頁，實際字型皆能容納。這是臨時驗收面板，不是整個遊戲入口 E2E，也未宣稱觸控驗證。

**仍保留日文的範圍：**使用／丟棄結果句中未建檔的助詞、效果訊息、戰鬥及對話。下節新增的32種名稱已覆蓋已驗證 writer，但不代表所有取得路徑或別的 writer 都已覆蓋。未授權或尚未完整寫入的字格、濁音不完整、來源含糊或錯 CHR 時仍安全保留原畫面，不延遲原遊戲、不沿用舊字幕。沒有證據支持加入別的字型 bank 別名。

### 名稱與部分字格：完成稽核（2026-09-06）

- 保留原 **45 筆位置記錄**，另外加入 **32 個 selector（0～31）、32 種不同原文名稱**。不是增加32個位置副本；頭盔／盾已包含在舊45筆內，動態辨識避免重複覆蓋。等級由物品 byte 高三位獨立表示，不把8個等級算成8種名稱。
- [來源解碼](../tools/zombie-name-source.mjs)驗證 bank 6、PRG `$19353` selector表、`$19373`資料基址、`$18C78` writer及 `$FC`濁音／`$FF`終止。原 ROM checksum 不變。部署與作者 catalog 均含名稱、譯文、glyph及來源證據；重建保留先前作者內容。
- 譯文包括劍、盾、頭盔、護手、短劍、戒指、釘錘、水晶、刀、藥瓶、魔法書、毒藥、鑰、食物、魔杖、水晶杖、雷電、大雷電、火焰魔法、爆裂彈、魔法手環、項鍊、魔法時鐘、鎧甲、壺、生命之水、鋼劍、靴子、手裏劍、炸彈、蠟燭、袋子。Canvas測試發現原「釘頭錘」「鑰匙」超過24／16px來源寬度，改為「釘錘」「鑰」，不縮字、不擴張遮罩。
- **自然操作證據：**原有四子頁、能力第二頁、初始頭盔／盾使用仍為 input-only。四條切換路線各541幀，共2164幀，沒有背包注入；本組 `partialFrames=0`，只證明完整標籤及安全清除，不能冒稱驗到自然取得的部分名稱。[自然路線報告](../artifacts/zombie-natural-partial-runtime.json)。
- **測試背包證據：**僅在測試的原生存檔 RAM `$D8`植入物品byte，再由原遊戲使用／丟棄handler自行寫字；沒有注入文字、PPU或ROM。32 selectors × 使用／丟棄 × 等級1／8 = **128案例、20,480幀**。全部32種名稱在原生丟棄畫面出現；使用時部分物品本來就不顯示名稱，不能要求每項使用都顯示。不是自然取得32種道具，也沒有測遍全部8個等級。[名稱逐幀報告](../artifacts/zombie-names-localization-runtime.json)、[來源原生繪字證據](../artifacts/zombie-name-source-runtime.json)。
- **安全部分轉場：**唯讀 `$600..$67F` staging rows必須完整符合目標來源，再用當幀 metadata、physical CHR、完整上下兩格glyph column與winning-pixel provenance裁切。名稱另要求writer附加的空格＋レベル＋1～8數字，避免「いかずち」誤套「おおいかずち」。無完整濁音列不得遮掉base kana；sprite、不符字格及鄰接數字保留。沒有跨幀快取。
- 名稱測試驗到 **40個部分轉場幀、43,569,408個遮罩像素**：水晶杖／雷電使用858～861幀，食物／水晶杖／雷電丟棄793～796幀，兩個等級各覆蓋。每個遮罩像素均檢查當幀source tile、physical CHR、cell/fineY。只裁切來源已完成的字格，因此過渡時中文也可能不完整，不能宣稱所有日文閃爍消失。
- [Canvas驗收](../tests/zombie-menu-overlay.test.ts)實際呼叫正式renderer：原45位置＋全部32名稱、等級、原生部分轉場clip及toggle。字寬採mock，不等於新名稱已在所有平台字型人工驗收。getter複製staging資料後才建立WASM記憶體view，避免配置時memory growth使provenance view失效。
- 修正未完成測試中的不實假設（四條自然路線必有partial）；保留另一項必須驗到原生partial的硬性assert。新3項名稱測試已接入標準 `test:localization:zombie`，不是孤立未執行檔案。錯ROM／錯bank／未知來源、短名稱混淆、sprite、reset及暫存／永久restore均有拒絕或重辨識測試。

- [舊 writer 證據](../artifacts/zombie-hunter-verified-inventory.json)仍是 **1 個來源家族**：標題コピー PC $8B56／renderer $F4A6、PPU $22A7、prompt CHR $6190。該檔的「catalogCreated:false」是前階段 writer inventory 狀態，不是本階段 UI 狀態；未將新選單冒充為已驗證 writer 家族。
- [靜態清單](../artifacts/zombie-hunter-static-candidates.json)：兩張表、74 筆（61 非空候選、13 空記錄）；17 個 copier 呼叫點、7 個來源。**不是已驗證對話清單**。
- [本階段 catalog](../game-profiles/zombie-hunter-jp/menus.zh-Hant.json)逐格列出 tile、實體 CHR offset、幾何、重播幀；PRG 同 bytes 搜尋結果只稱 `prgCandidates`，不稱來源指標已確認。漢字譯文為人工編寫的初稿。
- [辨識器](../src/game-profiles/verified-cell-menus.ts)比對完成幀 metadata（generation/tile、實體 CHR、背景／前景）及每個實際勝出像素的 cell/fineY。不是當前 nametable 快照比對，也不是 frame 計時字幕。
- [顯示層](../src/game-profiles/verified-menu-overlay.ts)按實際畫面位置原位遮罩繪字，12px 暫停選項、8px HUD／標題；超出字寬或裁切界線則不畫，不壓字。每次重畫先清空，沒有殘留文字快取。
- [入口](../src/main.ts)依 ROM 雜湊載入 [部署 catalog](../public/game-profiles/zombie-hunter-jp/menus.json)。不安裝 PRG/CHR patch，不套 CT2 腳本 observer 或 writer 地址；Rust 只為此雜湊啟用既有 PPU 來源診斷。讀檔保留當前 provenance enable flag，清除舊時間線觀察。

## 重播、建置與編輯

先執行 `npm run wasm:build`，再 `npm run localization:zombie:build`、`npm run test:localization:zombie`、`npm run build`。Node 需支援直接載入本專案的 TypeScript（本次使用的環境支援）；不使用 Python、瀏覽器、OCR 或圖片工具。

[probe](../tools/zombie-hunter-menu-probe.mjs)從 reset 起，每幀呼叫一次 frame；Start 在 120、240、420 幀按下兩幀，Down 520、A 620。測試延伸 B 720、Start 820 至第 900 幀。編號是零起算輸入後取樣，不是 UI 顯示秒數。Probe 只寫 JSON；先前留下的 PNG 未刪除也不作本次驗收依據。

修改 authoring catalog 的 `translation` 後再重建。[builder](../tools/build-zombie-hunter-menus.mjs)保留既有譯文、其他作者欄位與原 source evidence；來源 cells 變動或移除會停止要求審核。不要直接編輯 public 副本；本階段尚無 CT2 翻譯工作室整合。完整build現在包含四子頁probe。

## 本次驗收結果

- Zombie Hunter：13 個 Node 測試 + 1 個實際 WASM／Canvas renderer 測試通過。45筆位置記錄及32種名稱均有真實 `fillText` 驗證，不只是 matcher 回傳值。錯 CHR 逐筆拒絕，sprite 像素裁切，其餘完整標籤保留；另測暫存／永久讀檔、reset。
- [901 幀對照報告](../artifacts/zombie-hunter-menu-runtime.json)：相同 controller 輸入，observer on/off 的原始 framebuffer、音訊逐幀一致；取樣點清除**僅診斷資訊**後 portable state payload hash 一致；ROM hash 不變，CT2 事件為零。
- [renderer 測試](../tests/zombie-menu-overlay.test.ts)：關閉／重開、關閉暫停選單、超寬回退、overscan 裁切、暫存與永久讀檔後下幀重新辨識、reset、dispose 均通過。
- 來源錯誤、CHR bank 不符、sprite 遮擋、無效／模糊 metadata、安全幾何都有拒絕測試。
- CT2 中文化 166、profile 34、menu extraction 14、原 ROM menu traversal 12、Rust text_observer 3 均通過。正式 WASM + TypeScript + Vite build 通過；仍有既有 Rust 警告與 Vite URL 警告。
- 本次另重跑 CT2 stats 5 Node＋8 UI＋2 Rust原ROM、Zombie tuning 1 production-wrapper＋4 UI＋2 Rust guards＋2 Rust原ROM，全部通過；最高等級31、金錢999999的新遊戲初始化與原生增減、既有白邊修正未改。
- 自動Canvas測試使用確定性字寬mock。另在整合瀏覽器建立暫時驗收面板，使用同一正式WASM、原ROM路線、正式catalog與renderer，確認四子頁實際字型均能畫出新增文字；393 CSS px下檢視道具／武器／能力頁，數字與圖示保持原版。既有整數backing scale與pixelated修正未改動。此非完整遊戲入口E2E，也非手機橫直向或全平台字型驗收；未做全關卡／死亡／結局測試。

## 後續分階段計畫（先選單，後對話）

1. **下一批選單**：32種名稱的原生使用／丟棄writer已用測試背包驗證；後續仍需自然取得、完整武器切換與結果句／效果的來源證據。不能把seeded inventory當作全遊戲自然路線覆蓋。
2. **死亡／續關／密碼**：先證實是否存在及實際路徑；輸入符號永遠按原順序保留。覆蓋閃爍、清字、同 tile 不同 bank、遮擋、讀檔。
3. **對話 inventory discovery gate**：從 selector $8902、tables $8F0E 等既有靜態記錄與 copier $8ABC/$8B52/$8B56 回溯，逐筆連結實際執行 bank/PC、原始指標、RAM buffer、PPU writer 與可見 glyph。先交付一個可重播的訊息家族；不能直接挪用 CT2 opcode 或把 61 候選批量翻譯上線。
4. **對話實作**：確認控制碼與 source→glyph→clear 生命週期後才增加遊戲專用 adapter，保留無損 IR、未知碼、動態插值、字寬預算及日文 fallback。建立「候選／已執行／已解碼／已繪製／人工校對」分欄 inventory，未到達結局不宣稱完整。
5. **人工驗收**：桌面／手機實際字型與 fractional scale、選單所有游標位置、長道具名、死亡／續關／結局；核對術語後才擴大完成範圍。沒有此證據前維持「部分中文化」。

本階段沒有 commit／push，沒有改原 ROM，沒有清理既有使用者檔案。