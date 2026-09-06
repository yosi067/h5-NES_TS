# Zombie Hunter：原版最高等級、MONEY 顯示上限與正式執行期驗證

2026-09-06，限日本版 SHA-256 `91dfb1a0c29f78c5d5b0a582c737c62103c4009ad5e2c20fdecd0c22a8648a48`、MMC1。**自然上限 L31（0-based 顯示），不是 255。**

## MONEY：999,999 是顯示上限，不是原版收入封頂

**正式版預設新遊戲 MONEY 999,999**，與 L31 為兩個獨立開關，均不依賴中文化。原 ROM 不變；不是每幀補錢，也沒有新增收入封頂。

原版 6502 驗證發現「自然賺錢會 clamp」的前提不成立：

- `$00C8/$00C9/$00CA` 是三個 base-100 位元組，各合法數位為 0..99；`$00CB` 是未顯示的百萬進位。總值為 `C8 + 100*C9 + 10000*CA + 1000000*CB`，不是 BCD，也不能填 255。
- 原初始化 CPU `$B833..$B83A`／PRG `$3833..$383A` 清除 C9/CA，再設定 C8=30。
- 正式新遊戲 hook 只在初始化返回後 CPU `$9469`／physical PRG `$1469`／檔案 `$1479`、原 `A9 00` 指令邊界設定 `[C8,C9,CA,CB]=[99,99,99,0]`。獨立於滿級 operand hook，無 ROM 修改、無週期增減。
- 收入 CPU `$A3A0..$A3B9`／PRG `$23A0..$23B9`，金額由 `$9B..$9D` 傳入；各數位 `CMP #$64`、必要時 `SBC #$64`，最後 carry 執行 `INC $CB`。實測 999,998+1=999,999；999,999+1=1,000,000（RAM `[0,0,0,1]`）；999,999+999,999=1,999,998。**没有飽和封頂；HUD 只顯示低六位。**
- 消費 CPU `$A3BA..$A3DF`／PRG `$23BA..$23DF`，以 `SBC` 與 `ADC #$64` 借位，包含 CB。只有餘額足夠才把暫存結果寫回。實測 999,999−30=999,969、10,000−1=9,999、1,000,000−1=999,999、30−31 保持30、30−30=0。
- 原顯示 CPU `$9721`／PRG `$19721` 設定 X=CA、長度3，進入 `$9736` 逐個讀取 CA/C9/C8，經原十進位字形表繪製。控制器輸入自然開局第700幀，nametable `$02A7..$02AC` 實測 `[9,9,9,9,9,9]`；關閉為四個空白及 `[3,0]`。

開關只影響下一次新遊戲：當場切換不改 RAM；reset 保留兩個目前偏好，重新載入 ROM 兩者預設開啟。暫存及永久讀檔保留存檔金錢（含 CB）並保留目前偏好，不補錢；從遊玩中存檔恢復後持續跑幀也不重設。若存檔本身在新遊戲初始化之前，往後執行到初始化仍依目前偏好，與正常新遊戲相同。舊版只送等級欄位的客戶端保留目前金錢偏好；金錢欄位若提供必須是 boolean。清除翻譯 profile 不影響設定；錯誤 hash、mapper 或指令守衛不符不套用。

證據：[zombie-money-native.json](../artifacts/zombie-money-native.json)。原生實验明確區分自然開局、直接呼叫原版 CPU 算術、人工設定已消費餘額的讀檔試驗；未宣稱全程打怪賺錢或走商店購買。

### 本次驗證

- 原 ROM Rust：2 tests（既有等級及新增金錢；金錢包含四組獨立設定、3收入、5消費、reset、兩種讀檔後續幀、未知ROM）。
- Rust 身分／指令／偏好 guards：2 tests。
- 正式 WASM wrappers／ZIP／畫面／reset／save：1 test，無跳過；UI：4 tests。
- Zombie 中文選單：10 Node tests + 1 Canvas test，包含逐幀切換及45個位置的實際繪製。原 position catalog、逐像素 clipping 均未改。
- CT2 中文化回歸：166 tests。TypeScript 及標準 `npm run build` 通過；`git diff --check` 通過。
- 直接對既有 dist 執行 Vite 曾在96模組轉換後失敗；使用專案標準 build（只清理生成的 dist）成功，未改動建置設定或刪除使用者 artifacts。

## 指令與地址證據

- 新遊戲 CPU `$9462`／PRG `$1462`／含 iNES header 的檔案 `$1472`：`A9 00 85 C0 20 2B B8`，即 LDA #0、STA $C0、JSR $B82B。
- 自然升級 CPU `$A40E`／PRG `$240E`：`E6 C0 A5 C0 C9 20 90 04 A9 1F 85 C0`。先增加 `$00C0`，與 `$20` 比較，超出則存回 `$1F`。實際呼叫原版指令驗證 0→1、30→31、31→31；不是以位元組容量猜上限。
- 成長 CPU `$B871`／PRG `$3871`；HP curve PRG `$39C9`，base-100 lookup `$7900/$7A00`；其他係數表 `$3AC9`～`$3EC9`。共 64 次原版成長試驗（兩組 × 32 個合法等級），與原 ROM 表逐項相符。
- 扣血 CPU `$DD2F`（本試驗映射 PRG `$DD2F`），確認正常減一、200→199 借位及死亡下限 0，不會補血鎖血。

## 開局前後（僅控制器輸入到第 700 幀）

| 原 RAM／畫面 | 關閉預設滿級 | 開啟預設滿級 |
| --- | ---: | ---: |
| 等級 `$00C0` | 0 | 31 |
| 目前體力 `$00C2 + 100 × $00C3` | 37 | 223 |
| 最大體力 `$00C4 + 100 × $00C5` | 37 | 223 |
| `$00B9..$00BB` | 5, 5, 1 | 33, 33, 11 |
| `$00CD..$00D1` | 14, 1, 34, 14, 8 | 89, 11, 85, 89, 11 |
| 原 nametable `$023C..$023D` | $15, $00（L0） | $03, $01（31） |
| 原 nametable `$0226..$0228` | $24, $03, $07 | $02, $02, $03 |

原生證據：[zombie-stats-native.json](../artifacts/zombie-stats-native.json)。正式 WASM、兩種 wrapper 及 ZIP 解包：[zombie-stats-runtime.json](../artifacts/zombie-stats-runtime.json)。原始畫面：[L0](../artifacts/zombie-stats-original.png)、[L31](../artifacts/zombie-stats-max.png)。實際能力子頁顯示 L31、力量89、魔法89、防禦33、氣力33、最大體力223；不把所有內部係數都誤稱為畫面能力。

## 正式行為

[核心](../nes-wasm/src/zombie_tuning.rs)在成功載入上述原 ROM 時自動開啟，不依賴 DEV、翻譯 catalog 載入或中文開關。只於已核對 PC、physical PRG offset、opcode、operand 的新遊戲 LDA operand 讀取回傳 31，接續原版初始化。沒有修改原 ROM、PRG/CHR、每幀 RAM 凍結或 EXP 偽造。

- [UI 開關](../src/game-profiles/zombie-runtime-tuning.ts)只影響下一次新遊戲，當前 RAM 不改。
- 重置保留開關；重新載入 ROM 回到預設開啟。
- 暫存／永久讀檔保留存檔 RAM（等級、體力等），且不把存檔中的舊偏好蓋回當前開關；清除中文 profile 不影響此設定。
- 不支援的 hash／mapper、失敗載入均不套用。開關只接受 boolean，不接受 31、255 或字串。
- 舊 Node 測試曾用 Buffer.slice 製作未知版本，卻共用原 ROM 記憶體，導致最後重載錯誤。已改 Buffer.from；磁碟 ROM 從未改動。修正後兩種正式 wrapper 全程通過。

重播：`npm run test:zombie:stats:rom`、設定 `ZOMBIE_TEST_ROM=1` 後 `npm run test:zombie:stats`。另設 `ZOMBIE_STATS_EVIDENCE=1` 會重產上述證據。原生測試中直接呼叫成長／扣血的實驗與自然開局樣本分開，不宣稱已實際打怪升完31級或全關卡通關。