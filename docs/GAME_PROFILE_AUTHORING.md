# 執行期遊戲 Profile 與翻譯框架

> 現況：NES 執行期 game profile 可在不修改 ROM 檔的前提下，改變模擬器看到的 PRG／CHR 讀取與 CPU RAM／PRG RAM，並以 `.gmod` 套件部署。翻譯框架以來源證據為準；目前足球小將 II 另有只改顯示的中文圖層實驗。
> 各遊戲進度見下方狀態表。

## 範圍與規則

框架把對白、選單、介面標籤、片尾、字典與 renderer 專用資料分成不同領域。證據政策：

1. 從程式碼、指標表、mapper 解析後的 ROM offset 與指令 parser 找出來源資料。
2. 保留原始 bytes、指令記錄、來源 provenance，並確保逐位元組 round trip。
3. 靜態程式參照在 renderer 路徑或等效 runtime 證據確認玩家看得到之前，都只是候選。
4. 只從已審核、已分類的單位建立翻譯目錄。
5. 容量、指標、bank 與頁面生命週期檢查通過後，才配置譯字並建立 PRG／CHR overlay。
6. 在模擬器中驗證結果套件，不修改原始 ROM 檔。

runtime 導覽是驗證工作，不是從 ROM 表與程式路徑發現來源字串的前提。

## 只改顯示的實驗（CT2）

足球小將 II 有來源觀察的高解析度中文圖層與獨立翻譯編輯器；兩個已辨識的原版雜湊直接使用原 ROM，不走早期精簡 BPS 字庫路徑。2,199 筆草稿不等於全遊戲覆蓋，102 筆獨立假名保留原文。固定字級、原生像素遮罩、精靈像素復原、原位精簡譯文、逐片段 2 倍揭露（不加速模擬）、編輯僅限 loopback Vite DEV。詳見 [CT2_LOCALIZATION_STUDIO.md](CT2_LOCALIZATION_STUDIO.md)。

## 各遊戲狀態

| 遊戲 | 狀態 | 文件 |
| --- | --- | --- |
| 足球小將 II（Captain Tsubasa II） | profile 綁定 SHA-256 `bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746` 與 Mapper 4；劇情、比賽雲框、固定字典已盤點；只改顯示的中文圖層為實驗版，仍非全中文；遊戲內能力等級 tuning 已交付 | [CT2_LOCALIZATION_STUDIO.md](CT2_LOCALIZATION_STUDIO.md)、[CT2_TRANSLATION_INVENTORY.md](CT2_TRANSLATION_INVENTORY.md)、[CT2_PLAYER_STATS_RESEARCH.md](CT2_PLAYER_STATS_RESEARCH.md) |
| Zombie Hunter | 靜態萃取與部分 runtime 證據；細節見專文 | [ZOMBIE_HUNTER.md](ZOMBIE_HUNTER.md) |

## 檔案

| 路徑 | 用途 |
| --- | --- |
| `game-profiles/schema/nes-runtime-profile.schema.json` | runtime profile 規格 |
| `game-profiles/schema/translation-catalog.schema.json` | 可編輯文字目錄規格 |
| `game-profiles/<profile-id>/runtime.jsonc` | 可加註解的編寫來源 |
| `game-profiles/<profile-id>/translations.json` | 分類後的翻譯來源 |
| `public/game-profiles/index.json` | ROM SHA-256 對應部署套件 |
| `public/game-profiles/<profile-id>/*.gmod` | 壓縮後的 runtime 套件 |

瀏覽器對載入的 NES ROM 計算雜湊、查 index、從對應套件取出 `runtime.json`，再請 WASM 核心安裝。沒有套件不影響原遊戲執行。

## Runtime 位址

- `prgReadOverlays[].offset`：iNES header 與選用 trainer 之後的 PRG ROM 實體 byte offset；mapper 先把 CPU 讀取解析到此 offset，再套用 overlay。
- `chrReadOverlays[].offset`：CHR ROM 實體 byte offset；PPU 在 mapper CHR bank 選擇後套用。
- 每個 overlay 必須有 `expectedOriginal`。安裝是原子性的：ROM 雜湊、mapper、offset 或原始 byte 任一不符，整個 profile 被拒絕。原始 PRG／CHR buffer 永不改變。

`memoryWrites` 支援：

| Space | 有效位址 | 時機 |
| --- | --- | --- |
| `cpuRam` | `$0000-$07FF` | `reset` 或 `frame` |
| `prgRam` | `$6000-$7FFF` | `reset` 或 `frame` |

`frame` 只用於需持續鎖定的參數，會每幀刻意覆蓋遊戲寫入。

## 指令

驗證 profile 身分與所有預期 byte：

```powershell
npm run profile -- verify --profile game-profiles/captain-tsubasa-2-jp/runtime.jsonc --rom "roms/Captain Tsubasa II - Super Striker (Japan).nes"
```

匯出全部或指定分類文字給翻譯人員與 AI 工具：

```powershell
npm run profile -- export --catalog game-profiles/captain-tsubasa-2-jp/translations.json --format xliff --output artifacts/captain-tsubasa-2.xlf
npm run profile -- export --catalog game-profiles/captain-tsubasa-2-jp/translations.json --format jsonl --category dialogue,battleMessage --output artifacts/captain-tsubasa-2.jsonl
```

匯入到新目錄（拒絕未知穩定 ID、重複 ID、被移除的受保護 placeholder）：

```powershell
npm run profile -- import --catalog game-profiles/captain-tsubasa-2-jp/translations.json --format xliff --input artifacts/captain-tsubasa-2.xlf --output artifacts/captain-tsubasa-2.translated.json
```

編譯並測試部署套件：

```powershell
npm run profile -- compile --profile game-profiles/captain-tsubasa-2-jp/runtime.jsonc --output public/game-profiles/captain-tsubasa-2-jp/captain-tsubasa-2-jp.gmod
npm run test:profiles
```

### CT2 的 PRG／CHR 編譯路徑

- 翻譯目錄分別宣告 `dialogue`、`battleMessage`、`interface`、`dictionary`；目前目錄涵蓋開場旁白與標題選單單位。
- `tools/compile-captain-tsubasa-2.mjs` 編譯開場旁白：以譯字 tile ID 取代已驗證的 PRG script slot，並安裝受 nametable 防護的 CHR 頁，由 NES PPU 繪製（不是畫在 canvas 上）。防護也要求開場的 active logical nametable；離開該頁即恢復原 CHR。
- 編譯器在建置期讀取固定版本的 Fusion Pixel 8px 繁中 BDF，驗證封存檔 SHA-256，把解出的 BDF 快取在 repo 外，輸出 NES 2bpp bytes 到 `.gmod`。離線或可重現建置可設 `H5_NES_PIXEL_FONT` 指向本機 BDF。不寫入來源 ROM。
- 固定 bank 字典：編輯 `translations/fixed-bank-words.zh-Hant.json` 後執行 `npm run profile:captain-tsubasa-2:compile-dictionary`。選用 `--glyph-map` 是「單一字元 → 明確可見 tile code」的 JSON；與既有表配置或 code 衝突會被拒絕。產物仍是原地替換，需經受防護的字典 ROM builder 才能打包。
- 修改目錄或編譯器後重建：`npm run profile:captain-tsubasa-2`。
- 新增對白前，必須先驗證此 ROM 的 PRG slot、控制碼、CHR 對應與頁面生命週期。

## 驗證指令

在 repo 根目錄執行：

```powershell
npm run test:profiles
npm test
```

- CT2 profile／adapter／compiler：`34/34` 通過。
- 完整 `npm test` 曾回報 `97/155` 通過；失敗位於既有 CPU/PPU 單元測試設定與 ROM 雜誌 metadata 數量，不在翻譯工具範圍，不視為翻譯產物無效的證據。
- Zombie Hunter 專用測試見 [ZOMBIE_HUNTER.md](ZOMBIE_HUNTER.md)。

## 共用框架待辦

- 每款遊戲的文字 writer 與編碼有證據後，再加入分類專用 adapter。
- 每個可部署 overlay 都保留來源雜湊、預期 bytes 與 runtime 條件。
- 加入覆蓋率與安全檢查：缺漏 ID、過期來源證據、配置溢位、不安全的 CHR／頁面重用時失敗。

## 完成標準

翻譯階段只有在每個已翻譯單位都具備以下項目時才算就緒：來源位置、原始 bytes、解析後指令結構、glyph 對應、領域分類、配置策略，以及 runtime 驗證路徑。靜態萃取足以「發現」，但不足以核准翻譯目錄或 ROM 替換。

## 歷史紀錄

- 開發分支 `feature/nes-runtime-translation`，此開發集之前的 base 為 `d5a68337`；原始 ROM 檔保持不變，報告與套件為建置產物或審核輸入。
- CT2 早期完成：通用 NES profile 載入、schema 驗證、來源雜湊防護與 `.gmod`；五個翻譯分類；lossless script IR 與 adapter 指令（匯出、匯入、遷移、驗證、round trip）；劇情、雲框、固定字典盤點；已審開場條目與離線 8x8 繁中編譯器；PRG／CHR overlay 與 nametable 感知的開場路徑。
- 盤點數字（96 個表條目／88 個唯一場景／15,760 字元；240 個雲框 ID／236 唯一／2,697 字元；240 個字典指標，index 0 為外部 RAM 指標）詳見 [CT2_TRANSLATION_INVENTORY.md](CT2_TRANSLATION_INVENTORY.md)。
