# CT2 大空翼能力：原版證據、遊戲內滿級與動態調整

日期：2026-09-06。所有 PRG offset 均**不含 16-byte iNES header**，也不是 CPU 位址。

## 交付狀態

**已交付遊戲內預設自然滿級 64**，不是僅工作室預覽。原生 NES 核心載入已驗證 CT2 原版時自動啟用；畫面下方「大空翼：等級 64（遊戲內）」面板可關閉或即時調整 1–64，正式版也顯示。使用原遊戲能力公式，**不是全部能力填 255**。

翻譯工作室本身仍是唯讀能力預覽，不遙控另一分頁的遊戲，也不寫入翻譯 `values`。遊戲能力功能另走 game-profile 語意 tuning API，不借用名字／翻譯區塊。

實作不覆寫原 ROM、球員等級、經驗值或剩餘體力。只在原遊戲讀取等級計算能力／顯示等級的指定指令提供替代值。新遊戲開機 11,500 幀已驗證：大空翼記錄仍為 ID 1、原生等級 byte 0；遊戲自己的體力初始化 routine 已得到滿級上限 **976**。

## 精確證據

原 ROM SHA-256：`bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746`。

### 球員記錄與名字必須分開

- `$C50C → $CD7C`，PRG `$3CD7C`：A × 2，從 `$CD89` 的 little-endian 指標表取地址到 **`$34/$35`**。不是 `$30/$31`，也不是 `$F329` 字詞表。
- `$C53C → $F30F` 是另一個字詞解析入口，PRG `$3F329` 才是字詞指標表。身分 1 的文字位於 PRG `$3F509`，`12 AF 0B FC` = `つばさ` 加結束碼。
- 先發球員記錄從 CPU RAM `$0300` 起、每筆 12 bytes。**只對已觀察的球員記錄**確認：
  - `+0`：球員身分／名字 ID。不是射門值。
  - `+1,+2`：目前體力，little-endian。`$DB62` 呼叫能力 selector 0，`$DB90/$DB95` 初始化此值；資料頁 `$AF37` 讀取兩個 bytes。
  - `+3`：從 0 起算的等級。bank 0 `$ABB4` 讀取並加一顯示；`$A3C5` 會依經驗值重算並覆寫。
  - `+4..+11`：本次未定義，禁止暴露為任意能力欄位。
- 原版新遊戲跑 11,500 幀，停在賽前：身分 1 出現在 **slot 9**（零起算，球衣號碼 10），記錄地址 `$036C`，資料 `01 EC 02 00 00 00 00 00 00 00 00 00`。第一筆 `$0300` 的身分是 2（レナート），不是大空翼。
- 初始化寫入者記錄 `(CPU PC, physical PRG)`：`($A8C0,$048C0)` 寫名單身分、`($C670,$3C670)` 清 RAM、`($DB90,$3DB90)`／`($DB95,$3DB95)` 初始化體力。
- bank 0 腳本使用切換的 8 KiB window；不可把既有 16 KiB 反組譯工具的 bank 參數當作 MMC3 的實際映射。上列寫入者 physical offset 取自原核心 mapper，不由 CPU 位址臆測。

### 能力查表，不是一串可以直接改的射門／傳球 bytes

`$C527 → $CE08` 切換 PRG 8 KiB banks `$1C/$1D`，呼叫 `$8000 → $802D → $803A`。

1. 大空翼身分 1 的屬性記錄是 PRG `$395DA`；第一個 byte = 1。
2. 非守門員的係數表是 `$39FCE + class × 24`，大空翼係數起點 **`$39FE6`**。
3. 定義 `L = 顯示等級 − 1`，本次可預覽範圍 `0..63`：
   - selector 0：`staminaCurve[min(95, coefficient[0] + L)]`，curve 是 PRG `$39F0E` 的 96 個 u16。
   - selectors 1..22：`abilityCurve[min(191, coefficient[selector] + 2*L)]`，curve 是 PRG `$39E4E` 的 192 個 u8。
4. 原始 `$810A` 封頂 **索引**為 `$BF`（191），不是把顯示能力限制為 191。查表最高可達 255，但大空翼自然滿級不會抵達這個索引。
5. bank 0 `$B02E` 從 `$BA90` 的 64 組經驗門檻由高往低找等級，最大內部值 63、顯示 64。最後門檻為 65,535。`$A3B4..$A3CD` 將結果重新寫入球員記錄 `+3`，所以單次改 level byte 並不是持久方案。

資料頁 `$AC05` 讀取 PRG `$03981` 的 selector／PPU 目的位址表，呼叫 `$C527`，再輸出數字。萃取器將目的位址與原 ROM 標籤來源配對，校驗原始 glyph bytes。重複的停球／射門等欄位保留各自 selector，不擅自命名尚未驗證的高低球狀態。

| 項目 | Selector | 新遊戲等級 1 | 自然滿級 64 |
| --- | ---: | ---: | ---: |
| 最大體力（不是剩餘體力） | 0 | 748 | 976 |
| 射門 | 1 | 12 | 232 |
| 傳球 | 2 | 14 | 236 |
| 盤球 | 3 | 16 | 238 |
| 阻擋 | 4 | 11 | 229 |
| 鏟球 | 5 | 12 | 232 |
| 截球 | 6 | 12 | 232 |

在隔離副本把內部等級設成 `$FF`，原始 CPU 回傳 `[742,12,14,15,11,12,12]`（selectors 0–6）。**任意填 255 反而溢位降能力**。此反例只存在診斷副本，沒有套用到遊戲。

## 遊戲端實作與安全邊界

新增 [Rust tuning](../nes-wasm/src/ct2_tuning.rs)，由既有 [game-profile 模組](../nes-wasm/src/game_profile.rs) 管理語意設定；[核心讀取路徑](../nes-wasm/src/emulator.rs) 驗證以下全部條件：

1. 完整 ROM SHA-256 為上述原版或既有標頭別名 `ee08f9134ef0e9e3a5f77e4f08244d24739c68d781cb58e2be737916bb3ab5ae`，且 mapper 4。已比對別名 **16-byte header 以後的完整 PRG/CHR 全等**。其他 ROM、修改版、舊 BPS target 不啟用。
2. CPU PC / 實體 PRG 必須為能力讀取 `$8101 / $38101`、最大體力讀取 `$8118 / $38118`，或資料頁顯示 `$ABB6 / $02BB6`。`Y=3` 且 overlay 後指令仍為 `LDA ($34),Y`；同 CPU 位址的其他 MMC3 bank 不套用。
3. `$34/$35` 指向主隊 11 人記錄 `$0300..$0383` 內 12-byte 對齊的記錄、該記錄 `+0` 必須是 **ID 1**，且正在讀取該記錄 `+3`。不綁 slot 9、不用球隊號當身分、不影響對手 11 人或未知記錄。
4. 只讓這一次 read 回傳 `指定等級−1`。指令執行完立刻關閉讀取旗標；不在 frame/reset 補寫 RAM，不改 CPU 指令時序。

這以「原遊戲實際取用已解析球員資料的指令」作為執行階段 guard，而非猜測標題／比賽 phase RAM。原 `$A3B4..$A3CF` 經驗重算、初始化、換位仍照常寫入真正原生等級；下次能力讀取才使用 tuning。對未知經驗索引不用另做備份／逆向回寫。

### API 與操作語意

- `NesWasm`、`EmuWasm` 均提供 `getGameProfileTuning()` JSON 狀態與 `setGameProfileTuning(json)`。更新內容為 `profileId: "captain-tsubasa-2-jp"` 及 `tsubasaLevel: 1..64 | null`；`null` 關閉。錯誤身分、非整數／超出範圍、未知欄位原子拒絕。
- [遊戲控制面板](../src/game-profiles/ct2-runtime-tuning.ts) 只依核心回報支援狀態掛載，不信任檔名。滑桿直接呼叫熱更新 API，**不呼叫 `loadGameProfile()`／reset、不清快存欄位**。
- 新 ROM 載入：符合身分預設 64，不符合則停用。重置、同核心暫存讀取、持久存檔讀取：保留目前 tuning 選擇。重建核心／重載遊戲回到 64；偏好不寫入 localStorage，也不寫入存檔。
- `clearGameProfile()` 只清既有翻譯／byte overlay；此獨立 gameplay 偏好須以 `tsubasaLevel: null` 關閉。安裝／清除翻譯 profile 不等於關閉能力調整。
- **體力規則：完全不回填、不鎖定、不按比例換算或夾值。** 已消耗體力照常；升級中途不補滿；降級後剩餘體力可能暫時高於新的最大值，由原遊戲後續邏輯處理。新的自然初始化使用當時指定等級的最大體力。
- 關閉立即回到原生能力讀取，不逆轉已發生的比賽結果、體力初始化／消耗、成長收益。存檔保存這些正常 gameplay 結果，但 level byte 仍是原生值。
- 下一次原遊戲計算才生效；已繪製能力頁需退出重開，已經算完的動作／動畫結果不追溯重算。

### 驗證範圍與限制

- 原版自然公式 1,472 案例，另以 **runtime API 實際切换等級**、不改來源 RAM，再跑原 `$C527` 1,472 案例通過。
- 33 組「3 個球隊 context × 11 個主隊 slot」為**人工構造換位／球隊狀態**，在隔離核心執行原 routine，對照同情境直接提供 level 63 的原生參考；不是實際逐章轉隊通關。守門員 slot 的原生係數／角色路徑不同，不能要求每個 slot 都回傳前鋒射門 232。
- 原經驗重算 routine 從測試 level 27 寫回原生 0 後，能力仍用 tuning；原資料頁指令顯示 64。未被鎖定的球員、目前體力、熱更新前後完整硬體狀態均有比對。
- 同核心暫存與持久存檔恢復、跨 WASM 核心恢復、重置／重載及兩個 WASM 包裝器已測試。沒有宣稱技能解鎖、經驗／密碼會變成滿級；它們保持原版。
- **尚非全場／全劇情人工驗收**；原開機證明體力初始化已使用 tuning，但所有戰鬥分支仍未逐一追蹤。FCEUmm fallback 與其他平台不支援此原生核心功能。沒有瀏覽器／觸控驗收。

## 本輪繁中進度

- 工作室增加 16 個有原版資料頁 selector／標籤對應的繁中能力預覽項目。
- 校對五條超寬譯文（含日向稱呼、火焰喊聲、羅伯特本鄉、對大空翼的招呼與片尾「角色」）。保守完整行超預算從 **14 降到 9／1,137 行**；同步 enhanced 來源稿與部署目錄，不覆蓋使用者已儲存的草稿。
- 未開啟比賽整句／動態名字翻譯；仍需 writer 來源、重複名稱及版面證據，不會用未知 RAM 或全畫面文字匹配代替。
- 9 行仍超預算，不刪除专名或未解明的片尾假名來灌高通過率。排版估算也不是全分支視覺驗收。

## 重現與測試

- `npm run ct2:stats:research`：原 ROM 唯讀萃取，JSON 寫 stdout，不產生補丁。未知／已修改 ROM 拒絕。
- `CT2_TEST_ROM=1` 搭配 `npm run test:ct2:stats`：5 個 Node 測試（資料／建置後 WASM／標頭別名）+ 8 個 Vitest 預覽／控制 UI 測試通過。未設定變數時原 ROM 測試跳過。
- `npm run test:ct2:stats:rom`：兩個 opt-in Rust 測試，原版基準開機／1,472 公式與 FF 反例，以及正式 runtime 開機／另外 1,472 熱更新公式、33 換位情境、重算、顯示和存讀檔。**原 routine 實驗，不是全場 gameplay 呼叫 trace**。
- 全部非忽略 Rust：95 passed / 12 ignored。`npm run test:localization`：153 passed / 1 原 ROM test skipped；另外以 `CT2_TEST_ROM=1` 跑 overlay test 2,400 幀通過。
- `node --test tools/nes-temporary-state.test.mjs`：11 passed。`npx tsc --noEmit`、`git diff --check` 通過。
- **正式建置已通過 `npm run build`**：重建 WASM 及兩個新 API、型別檢查、標準流程清除 dist 後 Vite 產生 bundle。前代理直接重複 `npx vite build` 曾出現 Windows `0xC0000409`；使用標準完整流程未重現，沒有將 FBNeo 警告誤判為根因、也沒有修改無關打包設定。
- 原生長程測試須逐幀排空音訊，並清除 **cfg(test)** 的 PPU A12／APU register trace；否則僅測試版序列化會夾帶約 28MB 追蹤、超過 8MB 保存上限。production WASM 沒有這些追蹤向量，不放寬存檔驗證。

核心檔案：[萃取器](../tools/ct2-stats-research.mjs)、[原核心診斷](../nes-wasm/src/ct2_stats_diagnostic.rs)、[證據集](../src/game-profiles/ct2-stats-evidence.json)、[預覽計算與 UI](../src/game-profiles/ct2-stats-preview.ts)、[工作室](../translation-studio.html)。

## 本輪變更路徑

- 研究：[tools/ct2-stats-research.mjs](../tools/ct2-stats-research.mjs)、[原生整合測試](../nes-wasm/src/ct2_stats_diagnostic.rs)。
- 正式核心：[tuning](../nes-wasm/src/ct2_tuning.rs)、[game profile](../nes-wasm/src/game_profile.rs)、[emulator](../nes-wasm/src/emulator.rs)、[WASM API](../nes-wasm/src/lib.rs)。
- 遊戲 UI：[熱更新面板](../src/game-profiles/ct2-runtime-tuning.ts)、[主程式](../src/main.ts)；[UI 測試](../tests/ct2-runtime-tuning.test.ts)、[生成 WASM 測試](../tools/ct2-runtime-tuning.test.mjs)。
- 工作室：[src/game-profiles/ct2-stats-evidence.json](../src/game-profiles/ct2-stats-evidence.json)、[src/game-profiles/ct2-stats-preview.ts](../src/game-profiles/ct2-stats-preview.ts)、[src/game-profiles/translation-editor.ts](../src/game-profiles/translation-editor.ts)、[src/game-profiles/translation-editor.css](../src/game-profiles/translation-editor.css)、[translation-studio.html](../translation-studio.html)。
- 翻譯：[enhanced-bank-03.json](../game-profiles/captain-tsubasa-2-jp/translations/enhanced-bank-03.json)、[enhanced-bank-04.json](../game-profiles/captain-tsubasa-2-jp/translations/enhanced-bank-04.json)、[enhanced-bank-05.json](../game-profiles/captain-tsubasa-2-jp/translations/enhanced-bank-05.json)、[public/game-profiles/captain-tsubasa-2-jp/localization.json](../public/game-profiles/captain-tsubasa-2-jp/localization.json)。
- 回歸／指令：[tools/ct2-stats-research.test.mjs](../tools/ct2-stats-research.test.mjs)、[tests/ct2-stats-preview.test.ts](../tests/ct2-stats-preview.test.ts)、[package.json](../package.json)。
- 文件：[CT2_LOCALIZATION_STUDIO.md](CT2_LOCALIZATION_STUDIO.md)、[CT2_PLAYER_STATS_RESEARCH.md](CT2_PLAYER_STATS_RESEARCH.md)。

原 ROM 雜湊未變；無 commit／push，未執行桌面瀏覽器或觸控測試。