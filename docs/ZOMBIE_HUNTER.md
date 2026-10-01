# Zombie Hunter (Japan) 中文化與執行期調整

> 現況：選單／HUD 已有執行期繁中覆蓋（45 筆位置記錄＋32 種道具名稱），屬**部分中文化**，不是完整遊戲翻譯，也不是中文 ROM/BPS。
> 預設新遊戲為原版最高等級 L31 與 MONEY 999,999，兩者為獨立開關，不修改原 ROM。對話、戰鬥與結局仍為日文。

## 目前狀態

- 僅適用 SHA-256 `91dfb1a0c29f78c5d5b0a582c737c62103c4009ad5e2c20fdecd0c22a8648a48`（日本版 MMC1）；其他版本、載入失敗、證據不全時保留原文。
- 選單繁中：載入原 ROM 即自動開啟，畫面旁有開關。滿級與金錢：預設開啟，只影響下一次新遊戲。
- 對話／戰鬥／結局未翻譯。沒有全遊戲分母，**不報完成百分比**。

## 選單繁中

### 原版首頁與 HUD（最初 8 筆）

| 原文 | 譯文 | 原版取樣幀 | 字格範圍（physical nametable row/column，0 起算） |
| --- | --- | --- | --- |
| PUSH START BOTTON | 按 START 開始 | 200 | 21/7，17×1 |
| もちもの | 道具 | 450、550 | 19/16，4×2 |
| ぶき | 武器 | 450、550 | 21/16，4×2 |
| そうび | 裝備 | 450、550 | 23/16，4×2 |
| つよさ | 能力 | 450、550 | 25/16，4×2 |
| POW | 體力 | 450 | 17/2，3×1 |
| EXP | 經驗 | 450 | 19/2，3×1 |
| GLD | 金錢 | 450 | 21/2，3×1 |

### 子頁（第一批 +13 筆，形成 21 筆基線）

| 子頁 | 原文 → 繁中 |
| --- | --- |
| 道具 | つかう → 使用；すてる → 丟棄 |
| 武器 | てに もつ ぶきを → 手持武器；えらびなさい。 → 請選擇 |
| 裝備 | そうび → 裝備；ぼうぎょ → 防禦；きりょく → 氣力 |
| 能力 | レベル → 等級；つよさ → 力量；まほう → 魔法；ぼうぎょ → 防禦；きりょく → 氣力；MAXPOW → 最大體力 |

切換修正後另加入：「請選擇道具」（道具 A670 後）、能力第二頁（力量／魔法／防禦／氣力／最大體力／下級所需）、初始背包操作結果「ヘルメット → 頭盔」「たて → 盾」「レベル → 等級」「みにつけた。 → 已裝備」。保留等級數字與日文助詞「を」，動態句子未全譯。

### 45 筆位置記錄的意義

- 45 筆是**位置記錄**，含同一文字的原版捲動位置；**不是 45 種文字**。
- 另有 **32 個 selector（0～31）、32 種不同原文名稱**，不是 32 個位置副本；頭盔／盾已在 45 筆內，動態辨識避免重複覆蓋。等級由物品 byte 高三位獨立表示，不把 8 個等級算成 8 種名稱。
- 32 種譯名：劍、盾、頭盔、護手、短劍、戒指、釘錘、水晶、刀、藥瓶、魔法書、毒藥、鑰、食物、魔杖、水晶杖、雷電、大雷電、火焰魔法、爆裂彈、魔法手環、項鍊、魔法時鐘、鎧甲、壺、生命之水、鋼劍、靴子、手裏劍、炸彈、蠟燭、袋子。「釘頭錘」「鑰匙」超過 24／16px 來源寬度，改為「釘錘」「鑰」，不縮字、不擴張遮罩。
- 數字、游標、圖示、logo、冒號不覆寫；漢字譯文為人工初稿。

### 運作方式

- [入口](../src/main.ts)依 ROM 雜湊載入[部署 catalog](../public/game-profiles/zombie-hunter-jp/menus.json)；不裝 PRG/CHR patch、不套 CT2 observer／writer 地址，Rust 只為此雜湊啟用既有 PPU 來源診斷。
- [辨識器](../src/game-profiles/verified-cell-menus.ts)比對完成幀 metadata（generation/tile、實體 CHR、背景／前景）與每個勝出像素的 cell/fineY，每筆獨立辨識；不是 nametable 快照或計時字幕。只把當幀屬於該 entry 的像素當 clip，游標不被蓋住，無跨幀快取。
- [顯示層](../src/game-profiles/verified-menu-overlay.ts)原位繪字：暫停選項 12px、HUD／標題 8px；超寬或越界則不畫。
- 名稱部分轉場：唯讀 `$600..$67F` staging rows 須完整符合來源，且需 writer 附加的空格＋レベル＋1～8 數字（避免「いかずち」誤套「おおいかずち」）；無完整濁音列不遮 base kana。過渡時中文可能不完整，**不能宣稱所有日文閃爍消失**。

### 證據邊界

| 證據 | 涵蓋 | 不代表 |
| --- | --- | --- |
| 自然輸入路線（input-only） | 四子頁、能力第二頁、初始頭盔／盾使用；四條切換路線各 410～950 共 541 幀，合計 2164 幀 | `partialFrames=0`，未驗到自然取得的部分名稱 |
| 測試背包 | 只在原生存檔 RAM `$D8` 植入物品 byte，由原遊戲使用／丟棄 handler 自行寫字；32 selectors × 使用／丟棄 × 等級 1／8 = **128 案例、20,480 幀**；32 種名稱均在丟棄畫面出現 | 不是自然取得 32 種道具；未測遍 8 個等級；部分物品使用時本來就不顯示名稱 |
| 部分轉場 | **40 個部分轉場幀、43,569,408 個遮罩像素**：水晶杖／雷電使用 858～861 幀，食物／水晶杖／雷電丟棄 793～796 幀，兩個等級各覆蓋 | 不代表所有 writer 或取得路徑 |
| 子頁路線 | Start 120/240/420；Down 470、500、530（依子頁 0～3 次）；A 600，650 幀取樣；來源 probe 關閉滿級，runtime 另覆蓋 L0 與 L31，共 8 條原 ROM 路線 | 沒有注入背包、武器或能力值 |

仍保留日文：使用／丟棄結果句中未建檔的助詞、效果訊息、戰鬥及對話。來源不完整、含糊或錯 CHR 時安全保留原畫面，不延遲遊戲、不沿用舊字幕。

### 相關檔案

- 作者 catalog：[menus.zh-Hant.json](../game-profiles/zombie-hunter-jp/menus.zh-Hant.json)（逐格 tile、實體 CHR offset、幾何、重播幀；PRG 同 bytes 搜尋結果只稱 `prgCandidates`）
- 路線定義：[zombie-submenu-routes.mjs](../tools/zombie-submenu-routes.mjs)（含 actionRoutes）
- 名稱來源解碼：[zombie-name-source.mjs](../tools/zombie-name-source.mjs)
- 報告：[子頁](../artifacts/zombie-submenu-runtime.json)、[逐幀切換](../artifacts/zombie-menu-switching-runtime.json)、[自然路線](../artifacts/zombie-natural-partial-runtime.json)、[名稱逐幀](../artifacts/zombie-names-localization-runtime.json)、[名稱原生繪字](../artifacts/zombie-name-source-runtime.json)、[901 幀對照](../artifacts/zombie-hunter-menu-runtime.json)
- 子頁樣本：[items](../artifacts/zombie-submenu-items.json)、[weapons](../artifacts/zombie-submenu-weapons.json)、[equipment](../artifacts/zombie-submenu-equipment.json)、[status](../artifacts/zombie-submenu-status.json)；另有 items-select、items-helmet、items-shield、status-next 與 scroll/end JSON
- Canvas 驗收：[zombie-menu-overlay.test.ts](../tests/zombie-menu-overlay.test.ts)

## 原版最高等級與 MONEY 顯示上限

### 正式行為

- [核心](../nes-wasm/src/zombie_tuning.rs)在成功載入上述原 ROM 時自動開啟，不依賴 DEV、翻譯 catalog 或中文開關。
- 滿級：只於已核對 PC、physical PRG offset、opcode、operand 的新遊戲 LDA operand 讀取回傳 31，接續原版初始化。
- 金錢：只在初始化返回後 CPU `$9469`／physical PRG `$1469`／檔案 `$1479`、原 `A9 00` 指令邊界設定 `[C8,C9,CA,CB]=[99,99,99,0]`；獨立於滿級 hook，無週期增減。
- 無 ROM／PRG/CHR 修改、無每幀 RAM 凍結或補錢、無 EXP 偽造、無新增收入封頂。
- [UI 開關](../src/game-profiles/zombie-runtime-tuning.ts)只影響下一次新遊戲，當場切換不改 RAM。
- reset 保留目前兩個偏好；重新載入 ROM 兩者回到預設開啟。
- 暫存／永久讀檔保留存檔 RAM（等級、體力、金錢含 CB），不把存檔中的舊偏好蓋回目前開關。
- 開關只接受 boolean（不接受 31、255 或字串）；清除翻譯 profile 不影響設定；錯誤 hash、mapper 或指令守衛不符不套用。

### 等級：自然上限 L31（0-based 顯示），不是 255

| 用途 | 位址 | 證據 |
| --- | --- | --- |
| 新遊戲 | CPU `$9462`／PRG `$1462`／含 iNES header 檔案 `$1472` | `A9 00 85 C0 20 2B B8`（LDA #0、STA $C0、JSR $B82B） |
| 自然升級 | CPU `$A40E`／PRG `$240E` | `E6 C0 A5 C0 C9 20 90 04 A9 1F 85 C0`：增加 `$00C0`，與 `$20` 比較，超出存回 `$1F`；實測 0→1、30→31、31→31 |
| 成長 | CPU `$B871`／PRG `$3871` | HP curve PRG `$39C9`，base-100 lookup `$7900/$7A00`，其他係數表 `$3AC9`～`$3EC9`；64 次成長試驗（兩組 × 32 等級）與原表相符 |
| 扣血 | CPU `$DD2F`（本試驗映射 PRG `$DD2F`） | 正常減一、200→199 借位、死亡下限 0，無補血鎖血 |

開局後（僅控制器輸入到第 700 幀）：

| 原 RAM／畫面 | 關閉滿級 | 開啟滿級 |
| --- | ---: | ---: |
| 等級 `$00C0` | 0 | 31 |
| 目前體力 `$00C2 + 100 × $00C3` | 37 | 223 |
| 最大體力 `$00C4 + 100 × $00C5` | 37 | 223 |
| `$00B9..$00BB` | 5, 5, 1 | 33, 33, 11 |
| `$00CD..$00D1` | 14, 1, 34, 14, 8 | 89, 11, 85, 89, 11 |
| nametable `$023C..$023D` | $15, $00（L0） | $03, $01（31） |
| nametable `$0226..$0228` | $24, $03, $07 | $02, $02, $03 |

能力子頁實際顯示 L31、力量 89、魔法 89、防禦 33、氣力 33、最大體力 223；不把所有內部係數都稱為畫面能力。

### MONEY：999,999 是顯示上限

- `$00C8/$00C9/$00CA` 是三個 base-100 位元組（各 0..99），`$00CB` 是未顯示的百萬進位。總值 `C8 + 100*C9 + 10000*CA + 1000000*CB`；不是 BCD，不能填 255。
- 原初始化 CPU `$B833..$B83A`／PRG `$3833..$383A` 清除 C9/CA，設定 C8=30。
- 收入 CPU `$A3A0..$A3B9`／PRG `$23A0..$23B9`，金額由 `$9B..$9D` 傳入；各位數 `CMP #$64`、必要時 `SBC #$64`，carry 時 `INC $CB`。實測 999,998+1=999,999；999,999+1=1,000,000（RAM `[0,0,0,1]`）；999,999+999,999=1,999,998。**沒有飽和封頂，HUD 只顯示低六位。**
- 消費 CPU `$A3BA..$A3DF`／PRG `$23BA..$23DF`，以 `SBC` 與 `ADC #$64` 借位（含 CB），餘額足夠才寫回。實測 999,999−30=999,969、10,000−1=9,999、1,000,000−1=999,999、30−31 保持 30、30−30=0。
- 顯示 CPU `$9721`／PRG `$19721` 設 X=CA、長度 3，進入 `$9736` 逐個讀 CA/C9/C8 經原十進位字形表繪製。自然開局第 700 幀 nametable `$02A7..$02AC` 為 `[9,9,9,9,9,9]`；關閉時為四個空白及 `[3,0]`。

證據：[zombie-money-native.json](../artifacts/zombie-money-native.json)、[zombie-stats-native.json](../artifacts/zombie-stats-native.json)、[zombie-stats-runtime.json](../artifacts/zombie-stats-runtime.json)（正式 WASM、兩種 wrapper 及 ZIP 解包）、畫面 [L0](../artifacts/zombie-stats-original.png)／[L31](../artifacts/zombie-stats-max.png)。原生實驗區分自然開局、直接呼叫原版 CPU 算術、人工設定餘額的讀檔試驗；未實際打怪升滿 31 級、未全程賺錢或走商店購買、未全關卡通關。

## ROM 身分與靜態證據

- ROM：`Zombie Hunter (Japan).nes`；Mapper 1（MMC1）；PRG 8 × 16 KiB banks；CHR 4 × 8 KiB banks。
- 主要 selector 在 bank 0：

```text
$8902 selector
  $88FE/$8901 -> pointer table $8F0E, 34 entries
  $8907/$890A -> pointer table $9165, 40 entries
  $890D -> $8ABC command-stream copier
```

- 靜態萃取跟隨每個 little-endian 指標至 `00 81` 結尾的 stream，保留完整 parser 輸出；另掃描所有 PRG bank 的 `LDA #high / LDX #low / JSR $8B56 或 JSR $8B52` 直接複製呼叫。

| [靜態清單](../artifacts/zombie-hunter-static-candidates.json) | 數量 |
| --- | ---: |
| 指標表 | 2 |
| 靜態記錄 | 74 |
| 非空 stream 候選 | 61 |
| 空記錄 | 13 |
| immediate copier 呼叫點 | 17 |
| 不同 copier 來源（含標題合成素材） | 7 |
| 靜態報告中執行期確認 | 0 |
| decoder 支援的純拉丁／標點候選 | 32 |

- 這**不是已驗證對話清單**；其餘候選保留未知 glyph byte，在 CHR 對應與畫面角色確認前不丟棄也不翻譯。
- [writer 證據](../artifacts/zombie-hunter-verified-inventory.json)仍只有 **1 個來源家族**：標題 `PUSH START BOTTON`（コピー PC `$8B56`／renderer `$F4A6`、PPU `$22A7`、prompt CHR `$6190`；17 個字形、11 種字碼），狀態 `partial-runtime-verified`。其中 `catalogCreated:false` 是前階段 writer inventory 狀態，不是目前 UI 狀態；新選單未冒充已驗證 writer 家族。
- 名稱來源：bank 6、PRG `$19353` selector 表、`$19373` 資料基址、`$18C78` writer、`$FC` 濁音／`$FF` 終止。
- 工具：`tools/extract-zombie-hunter-static.mjs`、`tools/decode-zombie-hunter-stream.mjs`、`tools/build-zombie-hunter-evidence.mjs`、`tools/analyze-zombie-hunter.mjs`、`tools/disassemble-zombie-hunter.mjs`。

## 指令

選單建置與測試（依序）：

```powershell
npm run wasm:build
npm run localization:zombie:build
npm run test:localization:zombie
npm run build
```

等級／金錢：

```powershell
npm run test:zombie:stats:rom
$env:ZOMBIE_TEST_ROM=1; npm run test:zombie:stats
# 另設 ZOMBIE_STATS_EVIDENCE=1 會重產證據
```

靜態萃取：

```powershell
node --test tools/decode-zombie-hunter-stream.test.mjs tools/build-zombie-hunter-evidence.test.mjs tools/extract-zombie-hunter-static.test.mjs
npm run extract:zombie-hunter:static
```

- Node 需能直接載入本專案 TypeScript；不使用 Python、瀏覽器、OCR 或圖片工具。
- [probe](../tools/zombie-hunter-menu-probe.mjs)從 reset 起每幀呼叫一次 frame；Start 在 120、240、420 幀按兩幀，Down 520、A 620；測試延伸 B 720、Start 820 至第 900 幀。幀號是零起算，不是秒數。probe 只寫 JSON；舊 PNG 不作驗收依據。
- 編輯：只改 authoring catalog 的 `translation` 後重建。[builder](../tools/build-zombie-hunter-menus.mjs)保留既有譯文、作者欄位與 source evidence；來源 cells 變動或移除會要求審核。不要直接編輯 public 副本；尚未整合 CT2 翻譯工作室。

### 最近驗收結果（2026-09-06）

- 選單：13 個 Node 測試＋1 個實際 WASM／Canvas renderer 測試通過；45 筆位置與 32 種名稱均有真實 `fillText` 驗證，錯 CHR／ROM／bank、sprite、reset、讀檔、超寬回退等有拒絕測試。
- 901 幀對照：observer on/off 的 framebuffer、音訊逐幀一致；ROM hash 不變，CT2 事件為零。
- 等級／金錢：原 ROM Rust 2、Rust guards 2、正式 WASM wrapper 1（無跳過）、UI 4。
- 回歸：CT2 中文化 166、profile 34、menu extraction 14、原 ROM menu traversal 12、Rust text_observer 3；正式 build 通過（仍有既有 Rust 與 Vite URL 警告）。
- 瀏覽器臨時驗收面板在 393 CSS px 確認實際字型可容納；Canvas 自動測試用字寬 mock。**不是**完整入口 E2E、觸控、手機橫直向或全平台字型驗收；未測全關卡／死亡／結局。

## 限制與待辦（先選單，後對話）

1. **下一批選單**：自然取得、完整武器切換、結果句／效果的來源證據；seeded inventory 不等於自然路線覆蓋。
2. **死亡／續關／密碼**：先證實存在與實際路徑；輸入符號保持原順序。覆蓋閃爍、清字、同 tile 不同 bank、遮擋、讀檔。
3. **對話 inventory gate**：從 selector `$8902`、table `$8F0E` 與 copier `$8ABC`/`$8B52`/`$8B56` 回溯，逐筆連結執行 bank/PC、原始指標、RAM buffer、PPU writer 與可見 glyph；先交付一個可重播的訊息家族。不能挪用 CT2 opcode 或把 61 候選批量上線。另需找出非指標表／非 immediate copier 的來源，並分類 table A 與 copier 來源（選單、片尾、對話、版面、動畫或圖形）。
4. **對話實作**：確認控制碼與 source→glyph→clear 生命週期後才加遊戲專用 adapter；保留無損 IR、未知碼、動態插值、字寬預算與日文 fallback。inventory 分欄：候選／已執行／已解碼／已繪製／人工校對。未到結局不宣稱完整。
5. **人工驗收**：桌面／手機實際字型與 fractional scale、所有游標位置、長道具名、死亡／續關／結局、術語核對。沒有證據前維持「部分中文化」。

不包含：能力／道具數值編輯器（L31／金錢以外尚無已驗證欄位）、可攜式 NES 存檔（共用模擬器工作）、其他地區版、原 ROM 重打包、第三方模擬器相容、全平台裝置矩陣。

## 工時估算（2026-09-05 先前基線）

> 以下為選單實作**之前**的估算，當時「catalog 尚未建立」；保留作規劃基線，不是實測完成時間或固定報價。主路線是顯示翻譯，不做原 ROM 字庫替換；若要可在其他模擬器執行的中文 ROM／BPS 需另估。

前提：一個日文版本、繁中、現有引擎可正常跑、單人循序；「小時」為開發者／AI 協作加人工驗收的有效投入，不含已完成的 CT2。

| 里程碑 | 工時 | 交付與關卡 |
| --- | ---: | --- |
| A. 限時可行性驗證 | 1–2 小時 | 遊戲內主要 writer／字庫與一個實際選單或訊息，不能只翻標題 |
| B. 最小可玩中文樣本 | 2–4 小時 | adapter、catalog／editor 參數化、主要靜態標籤原位顯示；累計 3–6 小時 |
| C. 批次翻譯與動態補全 | 2–4 小時 | 道具／HUD／選單／遊戲訊息，依 A 的盤點更新 |
| D. 遊玩校對與回歸 | 3–6 小時 | 死亡、續關、結局等路線，手機字型／排版、原版對照、正式建置 |
| **基準合計** | **8–16 小時** | 未知部分仍需 A 放行 |

情境：樂觀 5–8 小時；基準 8–16 小時；保守 16–30+ 小時（額外字庫、結局難到達或未知來源，不是上限）。建議先授權 A，不先承諾「比 CT2 快一半」；2 小時仍找不到主要來源就停止批量翻譯並重估。「完整」指約定範圍內全部文字均驗收。

Token：CT2 的 **10 小時／約 12,000 token** 為使用者回報值。若用完全相同口徑，可暫訂管理額度（不是 API 上下文 token 預測）：

| 範圍 | 暫訂 token 預算 |
| --- | ---: |
| A 限時勘查 | 2,000–4,000 |
| 最小可玩樣本（含 A） | 4,000–8,000 |
| 基準完成範圍（含 A–D） | 10,000–24,000 |
| 高不確定情境 | 24,000–40,000+，需重估 |

API 金額：`輸入 token / 1,000,000 × 輸入單價 + 輸出 token / 1,000,000 × 輸出單價`；人工時薪 R 時基準人力 `8R–16R`。現有流程不需 OCR／外部翻譯 API，不上傳 ROM。

方法參考：[FC 中文化最短可靠路徑](FC_LOCALIZATION_PLAYBOOK.md)。

## 歷史紀錄

- 2026-09-05：靜態萃取完成（74 筆、61 候選、17 copier 呼叫點）；執行期只確認標題 `PUSH START BOTTON`；分支 `feature/nes-runtime-translation`，當時 Zombie 部分 6/6 測試通過；提出 8–16 小時基線估算。
- 2026-09-06：分支 `feature/zombie-hunter-zh-hant` 完成首頁／HUD 8 筆、子頁 13 筆（21 筆基線）。
- 2026-09-06：選單切換修正。根因為整組門檻（部分字已完成卻整組回退日文）、以首個可見像素定原點（被游標遮擋時錯位）、遺漏道具 A670 與能力第二頁；改為逐筆完整 entry 辨識，擴充至 45 筆位置。
- 2026-09-06：加入 32 種名稱與部分轉場 clip；修正測試中「四條自然路線必有 partial」的不實假設，保留另一項必須驗到原生 partial 的 assert。
- 2026-09-06：驗證原版 L31 上限並加入預設滿級；原以為自然賺錢會 clamp，經 6502 驗證不成立，改為新遊戲 MONEY 999,999 開關。舊 Node 測試以 Buffer.slice 製作未知版本而共用原 ROM 記憶體，已改 Buffer.from；磁碟 ROM 從未改動。
