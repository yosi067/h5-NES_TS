# ROM 遊戲庫稽核

> 現況：最新紀錄（2026-09-06）遊戲目錄為 194 款、Arcade 31 款；新增 `nbbatman.zip`（US 版 `nbbatmanu` driver），Mega Man 2: The Power Fighters 因缺 CPS2 key 已移除。
> 入庫原則：必須由目前核心實際完成 ROM audit 並產生非黑 framebuffer，檔名對上 driver 不算驗證。

## 目前狀態

| 時間點 | 遊戲目錄 | Arcade | 來源 |
|---|---:|---:|---|
| 2026-07-19 掃描後 | 133（與 `public/roms.json` 一致） | 37 | 本文〈2026-07-19 掃描〉 |
| 2026-09-06 新增 nbbatman 後 | 194 | 31 | 本文〈2026-09-06 新增街機 ROM 驗證〉 |

## 相關指令

| 指令 | 用途 |
|---|---|
| `npm run audit:games` | 執行 `tools/audit-game-catalog.mjs`，檢查 `public/roms.json`、`public/game-metadata.json` 與 `roms/` 的一致性及資料覆蓋率 |
| `node tools/audit-rom-library.mjs` | 掃描 ROM 目錄、以 SHA-256 去重，並以 WASM 核心執行 600 frame 檢查（無對應 npm script） |
| `node tools/audit-new-arcade-roms.mjs` | 以已安裝套件的 driver 定義稽核 2026-09-06 保留的街機 ZIP |
| `node tools/probe-new-arcade-roms.mjs` | 以已安裝的 production WASM 離線實跑保留的街機 ZIP |

## 2026-07-19 掃描

### `D:\yosi資料夾\AI\games`

- 138 個可辨識 ROM，依內容 SHA-256 去重後 104 款。
- 原有 14 款；新增 65 款通過核心開機與 600 frame 畫面檢查。
- 依繁體 > 簡體 > 日版 > 美版精簡後保留 54 款；25 款可啟動但屬同作品低優先版本，已移除。
- 未匯入：24 款 600 frame 後仍全黑；1 個 ZIP 只有 0-byte ROM 範本。
- `.exe`、`.dll`、圖片、存檔、OfflineList 資料與光碟映像不視為遊戲。
- 逐檔結果：`artifacts/games-rom-audit-final.json`。

### `D:\yosi資料夾\AI\MAME\roms`

| 項目 | 數量 |
|---|---:|
| ZIP 總數 | 320 |
| 檔名對上 `@mantou/fbneo` driver | 295 |
| 其中 parent / clone / not working | 177 / 116 / 1 |
| BIOS 或 BIOS 合集（`MAME - Bios Pack.zip`、`neogeo.zip`、`qsound.zip`） | 3 |
| 對不上目前 FBNeo build（不可假設能執行） | 23 |

- `sbm.zip`（Sonic Blast Man）在 driver 清單標記為 `NW`。
- 320 個 ZIP 的正式名稱、parent、年份、廠商、硬體與狀態：`artifacts/mame-rom-inventory.json`。

### `D:\yosi資料夾\AI\games\NAME`

- 27 個 ZIP，19 個對上 FBNeo driver；排除既有遊戲後 13 個候選 set。
- 10 款通過 FBNeo ROM audit、frame stepping 與非黑 framebuffer 檢查：`knights`、`kof94`、`kof95`、`kof96`、`kof97`、`kof98`、`ms5pcb`、`samsho2`、`samsho4`、`samshoh`。
- KOF 94–98、Samurai Shodown II / IV 原缺 Neo Geo BIOS：專案副本合併本機 `neogeo.zip`，並把 CRC32 同為 `91b64be3` 的 `asia-s3.rom` 加為 FBNeo 所需的 `sp-s3.sp1` 別名後通過。Samurai Shodown II 原本的 `320×224` 單色畫面並非正常啟動，補齊後所有 BIOS `(OK)` 且畫面正常多色。
- 未匯入：`megaman2`、`mvsc` 分別缺 CRC32 `6828ed6d`、`7e101e09` 的 CPS2 key，本機 MAME 庫亦無；`samsho` 為混合 revision，缺三個指定 ROM，改用已通過的完整 `samshoh`。

### 掃描後遊戲庫

- 遊戲目錄與 `public/roms.json` 均 133 筆，無缺檔、未分類檔或重複路徑。
- SNES 由 75 款精簡為 49 款：移除 25 個低優先語言、較舊或重複 revision，另暫時移除畫面仍異常的 Super Mario Kart。移除 512-byte copier header 後，49 款無相同雜湊。
- Arcade：移除 Galaga；新增 Metal Slug 1–5、KOF 94–98 / 2002、侍魂 1 / 2 / 4、Knights of the Round；再依需求移除 Donkey Kong、Frogger、Double Dragon，共 37 款。
- Neo Geo 使用內含 BIOS 的 merged set；`mslug3h.zip` 只有 clone 差異檔，目前單 ZIP 載入模式無法獨立執行。

## 街機排行（2026-07-19）

排行依據：系列知名度、歷史評價、街機代表性、今日可玩性與類型多樣性。clone、BIOS、not-working set 不列入；入選 ROM 必須由瀏覽器版 FBNeo 實際完成 ROM audit 並產生非黑 framebuffer。

| 排名 | Driver | 遊戲 | 年份 | 廠商 | 硬體 |
|---:|---|---|---:|---|---|
| 1 | `sf2` | Street Fighter II: The World Warrior | 1991 | Capcom | CPS1 |
| 2 | `pacman` | Pac-Man | 1980 | Namco / Midway | Pac-Man |
| 3 | `mslug` | Metal Slug - Super Vehicle-001 | 1996 | Nazca | Neo Geo MVS |
| 4 | `tetris` | Tetris | 1988 | Sega | System 16A |
| 5 | `outrun` | Out Run | 1986 | Sega | Out Run |
| 6 | `ffight` | Final Fight | 1989 | Capcom | CPS1 |
| 7 | `tmnt` | Teenage Mutant Ninja Turtles | 1989 | Konami | GX963 |
| 8 | `bublbobl` | Bubble Bobble | 1986 | Taito | Taito Misc |
| 9 | `shinobi` | Shinobi | 1987 | Sega | System 16A |
| 10 | `rtype` | R-Type | 1987 | Irem | M72 |
| 11 | `raiden` | Raiden | 1990 | Seibu Kaihatsu | Seibu |
| 12 | `simpsons` | The Simpsons | 1991 | Konami | GX072 |
| 13 | `strider` | Strider | 1989 | Capcom | CPS1 |
| 14 | `snowbros` | Snow Bros. | 1990 | Toaplan | Kaneko Pandora |
| 15 | `ssriders` | Sunset Riders | 1991 | Konami | GX064 |
| 16 | `dino` | Cadillacs and Dinosaurs | 1993 | Capcom | CPS1 / QSound |
| 17 | `captcomm` | Captain Commando | 1991 | Capcom | CPS1 |

### 實機驗證

上表 17 款已逐款透過 `http://127.0.0.1:5173/` 載入，每款均符合：

- FBNeo ROM audit 成功，無 missing file 或 CRC32 錯誤。
- 遊戲 canvas 取得有效解析度。
- 啟動等待後 framebuffer 含非黑像素。
- 瀏覽器無 console error。

原候選 `goldnaxe.zip` 缺 `317-0123a.c2`，audit 失敗，未納入排行也未保留；第 20 名改由 Captain Commando 遞補。

## 2026-09-06 新增街機 ROM 驗證

### 決定

- 保留：**忍者棒球 (美版) / Ninja Baseball Batman (US, 1993)**，為唯一新增遊戲。加入後目錄為 **194 款 / 31 款 Arcade**。
- 移除：**Mega Man 2: The Power Fighters (USA)**，不列入目錄與 runtime allowlist。

### 保留遊戲：`nbbatman.zip`

- [nbbatman.zip](../roms/nbbatman.zip) 是完整的 **nbbatmanu** set（非 world 版 `nbbatman`）：15 個 chip 的大小與 CRC32 全部符合已安裝 driver。
- US 程式 chip 為 `a1-h0-a.34` / `a1-l0-a.31`；world driver 則要求 `6_h0.34` / `3_l0.31`。
- Loader 選用 `nbbatmanu`，以該 MEMFS 名稱掛載副本，不改動原始壓縮檔位元組與檔名。前端與核心 allowlist 都保留 world 與 US 兩個正式 driver 名稱，但本次只驗證所提供的 US set。
- 封面：[cover-55d88b6e2db2.jpg](../public/assets/covers/cover-55d88b6e2db2.jpg)（Ninja Baseball Batman 宣傳單），已人工檢視，於 game metadata 對應 `nbbatman.zip`，並列在 user-cover 匯入目標中；未另行下載新圖。

### 移除遊戲：Mega Man 2

- 11 個 chip 符合，但缺必要的 `megaman2.key`（20 bytes，CRC32 `6828ed6d`）。這是缺少輸入資產，改檔名無法修復；未下載或自製替代 ROM / key。
- 先前的 runtime probe 在同樣 2,166 次迴圈（含 coin / start / action 輸入）下：**0 次 draw callback**、無 video properties，log 明確顯示 `Loading megaman2.key... (not found)` / `There was an error loading your selected game.`。
- `startMain` 即使失敗也回傳 0，不能單憑回傳值判定載入成功。
- 被拒的壓縮檔與未使用封面已刪除。刻意保留的「僅依名稱排除」測試不需要該壓縮檔；可重用的 audit / probe 腳本已不再載入或斷言此遊戲。

### 重現驗證

- [audit-new-arcade-roms.mjs](../tools/audit-new-arcade-roms.mjs)：`node tools/audit-new-arcade-roms.mjs`。只檢查保留的壓縮檔，比對已安裝套件 `em-out/games.txt` 中的 world / US 定義（非最新上游 MAME manifest）；預期結果為 world 不符、US 完全符合。
- [probe-new-arcade-roms.mjs](../tools/probe-new-arcade-roms.mjs)：`node tools/probe-new-arcade-roms.mjs`。在 Node 中以獨立 module instance 離線執行已安裝的 production WASM，只跑保留的壓縮檔。輸出 WASM / 定義 SHA-256、來源 SHA-256、載入 log、frame hash、draw 次數與執行前後來源檢查，產生在 `artifacts/arcade-runtime/`（拋棄式截圖與 JSON log，不納入變更）。

### 實際執行證據

環境：**@mantou/fbneo 0.0.4 / FBNeo v1.0.0.02**。

- 畫面：320×240、60 Hz、32-bit framebuffer。
- 輸入序列：開機 900 frames；coin 2 frames + 放開 60；start 2 + 放開 180；attack/select 2 + 放開 240；等待 600；right+attack 180。
- 結果：**2,166 次 draw callback 與 2,166 次 audio callback**，6 個相異的非黑檢查點；重複執行 frame hash 相同。
- 人工檢視截圖：coin / start 後的角色選擇畫面，以及 Stage 1 Seattle（1P Jose、血量 HUD、計時 99、一名敵人）。
- 輸入位元與 production wrapper 的 Mantou mapping 一致。
- 來源 SHA-256（probe 後未改變）：`3a9a9d09b3848577a631886673af1a6945fe0afc6b4be8f951bea9bfe0985c43`。

### 其他驗證

- 目標測試（ROM-set / catalog / magazine / arcade-input）：**4 files、20 tests passed**。
- 完整 Vitest：**24 files passed / 2 failed；277 tests passed / 57 failed**。失敗為 `tests/cpu.test.ts` 55 項、`tests/ppu.test.ts` 2 項，這些檔案及其 `src/core` 實作與 HEAD 相同，未嘗試修正；arcade input 測試在完整套件中通過。
- `npx tsc --noEmit` 通過。
- `npm run build` 通過（wasm-pack、TypeScript、Vite）；既有 Rust 警告與 FBNeo 套件 Node 分支的 Vite 警告仍存在。
- 建置輸出包含 `nbbatman.zip`、不含 `megaman2.zip`，並打包 `fbneo-arcade-4Zo5ca7C.wasm`。magazine 測試舊的 189 預期值在本次 +1 前就已過時。
- CT2 commit **5c0f6b5** 仍為 HEAD；無 CT2 原始碼變更、ROM 修改、其他 ROM 下載、commit 或 push。

### 變更清單

- Runtime 路由：[fbneo-core.ts](../src/arcade/fbneo-core.ts)、[main.ts](../src/main.ts)。
- 目錄與 metadata：[roms.json](../public/roms.json)、[game-metadata.json](../public/game-metadata.json)、[arcade.ts](../src/data/rom-metadata/arcade.ts)、[import-user-covers.mjs](../tools/import-user-covers.mjs)，以及上述壓縮檔與封面。
- 測試：[fbneo-rom-set.test.ts](../tests/fbneo-rom-set.test.ts)、[rom-catalog.test.ts](../tests/rom-catalog.test.ts)、[rom-magazine-metadata.test.ts](../tests/rom-magazine-metadata.test.ts)。
- 兩支重現工具與本文件。

## 限制與待辦

- nbbatman 驗證只證明開機 / 開始與早期遊玩，未涵蓋全破、瀏覽器 UI、實體音訊輸出或多人遊玩。
- 原版街機支援四人，目前 wrapper 只連接兩個玩家槽。
- Mega Man 2 受缺少 CPS2 key 阻擋；`megaman2`、`mvsc` 在提供 key 前不會入庫。
- 既有 NES CPU / PPU 測試失敗，完整測試套件無法全綠。
- `mslug3h.zip` 在單 ZIP 載入模式下無法獨立執行；Super Mario Kart 因畫面異常暫時移除。