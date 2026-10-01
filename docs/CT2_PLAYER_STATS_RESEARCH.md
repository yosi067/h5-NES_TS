# CT2 球員能力：原版證據與遊戲內等級調整

> 現況：原生 NES 核心載入已驗證的 CT2 原版時，**我方全隊預設自然滿級 64**（遊戲內，非僅工作室預覽），面板可關閉或即時調整 1–64。使用原遊戲能力公式，**不是把能力填 255**；不覆寫 ROM、等級、經驗值或剩餘體力。
> 日期 2026-09-06。本文所有 PRG offset 均**不含 16-byte iNES header**，也不是 CPU 位址。

## 目前狀態

- 遊戲畫面下方「我方全隊：等級 64（遊戲內）」面板可關閉或調整 1–64，正式版也顯示；熱更新不重置核心、不清快存欄位、不鎖體力。
- 只在原遊戲讀取等級的指定指令回傳替代值；目前我方 XI 的有效記錄都套用，劇情換隊由原遊戲改寫名單後自然跟隨，對手記錄不套用。
- 新遊戲開機 11,500 幀：大空翼仍為 ID 1、原生等級 byte 0；遊戲自己的體力初始化已得到滿級上限 **976**。
- 翻譯工作室的能力面板是唯讀預覽（16 個有原版資料頁 selector／標籤對應的繁中項目），不遙控遊戲分頁，翻譯 `values` 保持空陣列。遊戲能力走獨立的 game-profile 語意 tuning API。

### 發布預設

- 遊戲清單「足球小將 2 超級前鋒」指向 ZIP；伺服器與本機 ZIP 都解壓後以內部檔名／原始 bytes 進入同一 `startGame()` 原生路徑，不以 ZIP 檔名授權。
- `Emulator::load_rom()` 在 reset／第一幀前依完整 SHA 與 mapper 啟用 64；`EmuWasm` 與 `NesWasm` 都適用。不依賴 DEV、裝置型號、localStorage 或 UI；翻譯資產下載失敗仍載入原 ROM 並保留此預設。
- 可承諾範圍：載入此版正式程式、且能執行原生 WASM 的裝置開啟驗證 ROM 時預設滿級。原生核心未初始化時顯示錯誤，不因裝置類型改走 FCEUmm；只有原生 ROM 載入失敗或拋錯才走 FCEUmm，該 fallback **沒有**能力調整。
- 舊 BPS 修改版、未驗證漢化／修改 ROM 不支援，同名不構成支援。部署須含重建後的 JS 與 WASM。

## API 與操作語意

- `NesWasm`、`EmuWasm` 提供 `getGameProfileTuning()`（JSON 狀態）與 `setGameProfileTuning(json)`。內容為 `profileId: "captain-tsubasa-2-jp"` 與 `tsubasaLevel: 1..64 | null`，`null` 為關閉。錯誤身分、非整數／超出範圍、未知欄位原子拒絕。
- [ct2-runtime-tuning.ts](../src/game-profiles/ct2-runtime-tuning.ts) 只依核心回報的支援狀態掛載，不信任檔名；滑桿直接呼叫熱更新 API，不呼叫 `loadGameProfile()`／reset。
- 生命週期：

| 事件 | tuning |
| --- | --- |
| 載入符合身分的新 ROM | 預設 64；不符合則停用 |
| 重置、同核心暫存讀取、持久存檔讀取 | 保留目前選擇 |
| 重建核心／重載遊戲 | 回到 64（偏好不寫 localStorage，也不寫入存檔） |
| `clearGameProfile()` | 只清翻譯／byte overlay；關閉能力調整須設 `tsubasaLevel: null` |

- **體力**：不回填、不鎖定、不按比例換算或夾值。已消耗體力照常；升級中途不補滿；降級後剩餘體力可能暫時高於新最大值，由原遊戲處理。新的自然初始化使用當時等級的最大體力。
- 關閉後立即回到原生讀取，不逆轉已發生的比賽結果、體力、成長。存檔保存正常 gameplay 結果，level byte 仍為原生值。
- 下一次原遊戲計算才生效；已繪製能力頁需退出重開，已算完的動作／動畫不追溯。

## 實作與 guard

[ct2_tuning.rs](../nes-wasm/src/ct2_tuning.rs) 由 [game_profile.rs](../nes-wasm/src/game_profile.rs) 管理，[emulator.rs](../nes-wasm/src/emulator.rs) 的讀取路徑需同時滿足：

1. ROM SHA-256 為 `bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746` 或標頭別名 `ee08f9134ef0e9e3a5f77e4f08244d24739c68d781cb58e2be737916bb3ab5ae`，且 mapper 4。別名在 16-byte header 之後的完整 PRG/CHR 全等。其他 ROM、修改版、舊 BPS target 不啟用。
2. CPU PC／實體 PRG 為能力讀取 `$8101 / $38101`、最大體力讀取 `$8118 / $38118` 或資料頁顯示 `$ABB6 / $02BB6`；`Y=3` 且指令仍為 `LDA ($34),Y`。同 CPU 位址的其他 MMC3 bank 不套用。
3. `$34/$35` 指向我方 XI 記錄區 `$0300..$0383` 內 12-byte 對齊記錄，`+0` 為非零有效球員 ID，且正在讀 `+3`。不綁 slot 9、不以球隊號當身分；對手記錄（`$0384` 起）不套用。
4. 只讓這一次 read 回傳「指定等級 − 1」，指令結束立即關閉旗標；不在 frame／reset 補寫 RAM，不改 CPU 時序。

原 `$A3B4..$A3CF` 經驗重算、初始化、換位照常寫入原生等級，下次能力讀取才用 tuning，因此不需備份或逆向回寫經驗。

## 原版證據

原 ROM SHA-256：`bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746`。

### 球員記錄與名字分開

- `$C50C → $CD7C`（PRG `$3CD7C`）：A × 2，從 `$CD89` 的 little-endian 指標表取記錄地址到 **`$34/$35`**（不是 `$30/$31`，也不是 `$F329` 字詞表）。
- `$C53C → $F30F` 是字詞解析入口，PRG `$3F329` 為字詞指標表。身分 1 的文字在 PRG `$3F509`：`12 AF 0B FC` = `つばさ` + 結束碼。
- 先發記錄從 CPU RAM `$0300` 起，每筆 12 bytes（僅對已觀察記錄確認）：

| Offset | 內容 |
| --- | --- |
| `+0` | 球員身分／名字 ID（不是射門值） |
| `+1,+2` | 目前體力，little-endian；`$DB62` 呼叫 selector 0，`$DB90/$DB95` 初始化，資料頁 `$AF37` 讀取 |
| `+3` | 零起算等級；bank 0 `$ABB4` 讀取並加一顯示，`$A3C5` 依經驗重算覆寫 |
| `+4..+11` | 未定義，禁止暴露為能力欄位 |

- 新遊戲 11,500 幀停在賽前：身分 1 在 **slot 9**（零起算，球衣 10 號），地址 `$036C`，資料 `01 EC 02 00 00 00 00 00 00 00 00 00`。`$0300` 是身分 2（レナート）。
- 初始化寫入者 `(CPU PC, physical PRG)`：`($A8C0,$048C0)` 寫名單身分、`($C670,$3C670)` 清 RAM、`($DB90,$3DB90)`／`($DB95,$3DB95)` 初始化體力。physical offset 取自原核心 mapper；bank 0 腳本使用切換的 8 KiB window，不能套用既有 16 KiB 反組譯工具的 bank 參數。

### 能力查表公式

`$C527 → $CE08` 切換 PRG 8 KiB banks `$1C/$1D`，呼叫 `$8000 → $802D → $803A`。

1. 大空翼（身分 1）屬性記錄在 PRG `$395DA`，第一個 byte = 1。
2. 非守門員係數表 `$39FCE + class × 24`，大空翼係數起點 **`$39FE6`**。
3. 令 `L = 顯示等級 − 1`（`0..63`）：
   - selector 0：`staminaCurve[min(95, coefficient[0] + L)]`，curve 為 PRG `$39F0E` 的 96 個 u16。
   - selectors 1..22：`abilityCurve[min(191, coefficient[selector] + 2*L)]`，curve 為 PRG `$39E4E` 的 192 個 u8。
4. `$810A` 封頂的是**索引** `$BF`（191），不是能力值；查表最高 255，大空翼自然滿級不會到這個索引。
5. bank 0 `$B02E` 從 `$BA90` 的 64 組經驗門檻由高往低找等級，內部最大 63（顯示 64），最後門檻 65,535。`$A3B4..$A3CD` 把結果寫回 `+3`，所以單次改 level byte 不持久。

資料頁 `$AC05` 讀 PRG `$03981` 的 selector／PPU 目的位址表，呼叫 `$C527` 後輸出數字。萃取器把目的位址與原 ROM 標籤配對並校驗 glyph bytes；重複的停球／射門欄位保留各自 selector，不擅自命名未驗證的高低球狀態。

| 項目 | Selector | 等級 1 | 自然滿級 64 |
| --- | ---: | ---: | ---: |
| 最大體力（非剩餘體力） | 0 | 748 | 976 |
| 射門 | 1 | 12 | 232 |
| 傳球 | 2 | 14 | 236 |
| 盤球 | 3 | 16 | 238 |
| 阻擋 | 4 | 11 | 229 |
| 鏟球 | 5 | 12 | 232 |
| 截球 | 6 | 12 | 232 |

反例：在隔離副本把內部等級設為 `$FF`，原 CPU 回傳 `[742,12,14,15,11,12,12]`（selectors 0–6）。**任意填 255 會溢位降能力**；此反例只在診斷副本，未套用到遊戲。

## 測試指令

| 指令 | 內容 |
| --- | --- |
| `npm run ct2:stats:research` | 原 ROM 唯讀萃取，JSON 輸出到 stdout，不產生補丁；未知／修改 ROM 拒絕 |
| `CT2_TEST_ROM=1` + `npm run test:ct2:stats` | 5 個 Node（資料／建置後 WASM／標頭別名）+ 8 個 Vitest（預覽／控制 UI）passed；未設變數時原 ROM 測試跳過 |
| `npm run test:ct2:stats:rom` | 兩個 opt-in Rust 測試：原版開機、1,472 公式、FF 反例；runtime 開機、另 1,472 熱更新公式、33 換位情境、重算、顯示與存讀檔 |
| `node --test tools/nes-temporary-state.test.mjs` | 11 passed |
| 全部非忽略 Rust | 95 passed / 12 ignored |
| `npm run build` | passed（重建 WASM 與兩個新 API、型別檢查、Vite bundle）；`npx tsc --noEmit`、`git diff --check` 通過 |

驗證涵蓋：

- 原版公式 1,472 案例；以 runtime API 實際切換等級、不改來源 RAM，再跑原 `$C527` 1,472 案例；runtime 開機體力 976。
- Rust 單元測試覆蓋 22 個 12-byte slot：我方區接受不同非零 ID，空記錄與對手區全拒絕。
- 33 組「3 個球隊 context × 11 個主隊 slot」為**人工構造**換位情境，對照直接提供 level 63 的原生參考；守門員係數路徑不同，不要求每個 slot 都是射門 232。
- 經驗重算把測試 level 27 寫回原生 0 後，能力仍用 tuning，資料頁顯示 64。
- 同核心暫存、持久存檔、跨 WASM 核心恢復、重置／重載、ZIP 第一個可遊玩 entry、兩個 WASM 包裝器（關閉或改為 1／32 後重新載入恢復 64）。
- 長程原生測試須逐幀排空音訊，並清除 cfg(test) 的 PPU A12／APU register trace；否則測試版序列化會夾帶約 28MB 追蹤、超過 8MB 存檔上限。production WASM 無這些向量，不放寬驗證。

## 限制

- 原 routine 實驗不是全場 gameplay 呼叫 trace；尚無全場／全劇情人工驗收，所有戰鬥分支未逐一追蹤。
- 不宣稱技能解鎖、經驗或密碼會變成滿級，它們保持原版。
- FCEUmm fallback 與其他平台不支援；沒有瀏覽器／觸控實機驗收。
- 對手記錄、`+4..+11` 未定義欄位、任意 255 編輯不開放。

## 相關檔案

- 研究：[ct2-stats-research.mjs](../tools/ct2-stats-research.mjs)、[ct2_stats_diagnostic.rs](../nes-wasm/src/ct2_stats_diagnostic.rs)、[ct2-stats-research.test.mjs](../tools/ct2-stats-research.test.mjs)。
- 核心：[ct2_tuning.rs](../nes-wasm/src/ct2_tuning.rs)、[game_profile.rs](../nes-wasm/src/game_profile.rs)、[emulator.rs](../nes-wasm/src/emulator.rs)、[lib.rs](../nes-wasm/src/lib.rs)。
- 遊戲 UI：[ct2-runtime-tuning.ts](../src/game-profiles/ct2-runtime-tuning.ts)、[main.ts](../src/main.ts)、[ct2-runtime-tuning.test.ts](../tests/ct2-runtime-tuning.test.ts)、[ct2-runtime-tuning.test.mjs](../tools/ct2-runtime-tuning.test.mjs)。
- 工作室：[ct2-stats-evidence.json](../src/game-profiles/ct2-stats-evidence.json)、[ct2-stats-preview.ts](../src/game-profiles/ct2-stats-preview.ts)、[translation-editor.ts](../src/game-profiles/translation-editor.ts)、[translation-editor.css](../src/game-profiles/translation-editor.css)、[translation-studio.html](../translation-studio.html)、[ct2-stats-preview.test.ts](../tests/ct2-stats-preview.test.ts)。
- 翻譯與中文化現況：[CT2_LOCALIZATION_STUDIO.md](CT2_LOCALIZATION_STUDIO.md)。

## 歷史紀錄

- 2026-09-06：交付遊戲內預設滿級 64 與 1–64 熱更新；補強 ZIP 與 WASM 包裝器預設測試。
- 2026-09-06：校對五條超寬譯文（日向稱呼、火焰喊聲、羅伯特本鄉、對大空翼的招呼、片尾「角色」），保守超預算由 14 降到 9／1,137 行；其餘 9 行不刪專名或未解明片尾假名來灌通過率。
- 曾直接重複 `npx vite build` 出現 Windows `0xC0000409`；改用標準 `npm run build` 未重現，未修改無關打包設定。
