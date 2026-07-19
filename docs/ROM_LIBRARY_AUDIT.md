# ROM 遊戲庫掃描與街機排行

掃描日期：2026-07-19

## 掃描結果

### `D:\yosi資料夾\AI\games`

- 掃描到 138 個可辨識的 ROM 實體，依 ROM 內容 SHA-256 去重後為 104 款。
- 初次整理時原本已有 14 款，並新增 65 款通過實際核心開機與 600 frame 畫面檢查的遊戲。
- 依繁體、簡體、日版、美版的順序精簡後，保留 54 款來源內容；另有 25 款雖可啟動，但屬同作品的低優先版本，因此移除。
- 24 款雖可載入，但 600 frame 後仍是全黑 framebuffer，因此未匯入。
- 1 個 ZIP 內只有 0-byte ROM 範本，因此未匯入。
- `.exe`、`.dll`、圖片、存檔、OfflineList 資料與光碟映像均不視為可匯入遊戲。

完整逐檔結果位於 `artifacts/games-rom-audit-final.json`。

### `D:\yosi資料夾\AI\MAME\roms`

- 共 320 個 ZIP。
- 295 個檔名能對上目前安裝的 `@mantou/fbneo` driver 清單。
- 其中有 177 個 parent games、116 個 clones、1 個標記為 not working。
- 3 個是 BIOS 或 BIOS 合集，不是獨立遊戲：`MAME - Bios Pack.zip`、`neogeo.zip`、`qsound.zip`。
- 23 個檔名無法對上目前 FBNeo build，不能假設可直接執行。
- `sbm.zip`（Sonic Blast Man）在 driver 清單中標記為 `NW`。

完整 320 個 ZIP 的正式名稱、parent、年份、廠商、硬體和狀態位於
`artifacts/mame-rom-inventory.json`。

### 最終遊戲庫

- 遊戲目錄與 `public/roms.json` 均為 127 筆，沒有缺檔、未分類檔或重複路徑。
- SNES 由 75 款精簡為 50 款，共移除 25 個低優先語言、較舊或重複 revision。
- 標準化移除 512-byte copier header 後，50 款 SNES 沒有相同內容雜湊。
- Arcade 移除 Galaga，新增 Metal Slug、Metal Slug 2 Turbo、Metal Slug 3、Metal Slug 4 與 KOF 2002，現為 30 款。
- Neo Geo 遊戲使用內含 BIOS 的 merged set；`mslug3h.zip` 只有 clone 差異檔，不能在目前的單 ZIP 載入模式下獨立執行。

## 排行依據

排行綜合考量系列知名度、歷史評價、街機代表性、今日可玩性與類型多樣性。
clone、BIOS、not-working set 不列入；入選 ROM 必須由目前瀏覽器版 FBNeo 實際完成
ROM audit，並產生非黑 framebuffer。

| 排名 | Driver | 遊戲 | 年份 | 廠商 | 硬體 |
|---:|---|---|---:|---|---|
| 1 | `sf2` | Street Fighter II: The World Warrior | 1991 | Capcom | CPS1 |
| 2 | `pacman` | Pac-Man | 1980 | Namco / Midway | Pac-Man |
| 3 | `mslug` | Metal Slug - Super Vehicle-001 | 1996 | Nazca | Neo Geo MVS |
| 4 | `dkong` | Donkey Kong | 1981 | Nintendo | Donkey Kong |
| 5 | `tetris` | Tetris | 1988 | Sega | System 16A |
| 6 | `outrun` | Out Run | 1986 | Sega | Out Run |
| 7 | `ffight` | Final Fight | 1989 | Capcom | CPS1 |
| 8 | `tmnt` | Teenage Mutant Ninja Turtles | 1989 | Konami | GX963 |
| 9 | `bublbobl` | Bubble Bobble | 1986 | Taito | Taito Misc |
| 10 | `frogger` | Frogger | 1981 | Konami | Galaxian |
| 11 | `shinobi` | Shinobi | 1987 | Sega | System 16A |
| 12 | `ddragon` | Double Dragon | 1987 | Technos | Technos |
| 13 | `rtype` | R-Type | 1987 | Irem | M72 |
| 14 | `raiden` | Raiden | 1990 | Seibu Kaihatsu | Seibu |
| 15 | `simpsons` | The Simpsons | 1991 | Konami | GX072 |
| 16 | `strider` | Strider | 1989 | Capcom | CPS1 |
| 17 | `snowbros` | Snow Bros. | 1990 | Toaplan | Kaneko Pandora |
| 18 | `ssriders` | Sunset Riders | 1991 | Konami | GX064 |
| 19 | `dino` | Cadillacs and Dinosaurs | 1993 | Capcom | CPS1 / QSound |
| 20 | `captcomm` | Captain Commando | 1991 | Capcom | CPS1 |

## 實機驗證

排行前二十已逐款透過 `http://127.0.0.1:5173/` 載入。每款均符合：

- FBNeo ROM audit 成功，沒有 missing file 或 CRC32 錯誤。
- 遊戲 canvas 取得有效解析度。
- 啟動等待後 framebuffer 含非黑像素。
- 瀏覽器沒有 console error。

原先候選 `goldnaxe.zip` 缺少 `317-0123a.c2`，實際 audit 失敗，因此未納入排行，
也未保留在模擬器遊戲目錄；第 20 名改由 Captain Commando 遞補。