# 遊戲資料與卡匣呈現

> 現況：UI 與載入流程已支援每款遊戲的封面、中文介紹、地區、版本、來源與卡匣旗標；但目錄資料尚未完整，資料蒐集須視為獨立的驗證階段，不能從 ROM 檔名推斷。

## 目前狀態

`npm run audit:games` 報告（撰寫時數值）：

| 項目 | 數量 |
|---|---:|
| 目錄項目 | 189 |
| ROM 資產（199 檔案 + 1 目錄） | 200 |
| 卡匣項目 | 159 |
| 街機項目 | 30 |
| 在 `roms/` 但未列入 `public/roms.json` | 11 |
| 已有封面 / 中文介紹 / 已驗證 | 0 / 0 / 0 |

11 個未列入資產須先分類，才能宣告資料蒐集完成；其中有 hack、範例、替代 dump，或檔名不符目前目錄命名慣例者。

### 已實作

- ROM 記錄接受選填的 cover、description、region、variant、cartridge、source 與 verification 欄位。
- 遊戲清單顯示封面、中文介紹、版本資訊，以及明確的「缺資料」狀態。
- 封面網址失效時退回文字標籤，不留空白方塊。
- `npm run audit:games` 回報覆蓋率、完整性、未列入資產與驗證狀態。
- 卡匣系統在下載與啟動前播放插卡動畫；街機壓縮檔略過動畫。
- 偏好減少動態效果時縮短流程並停用 CSS 動畫。

## 相關指令

| 指令 | 腳本 | 說明 |
|---|---|---|
| `npm run audit:games` | `tools/audit-game-catalog.mjs` | 合併 `public/roms.json` 與 `public/game-metadata.json`，比對 `roms/`，列出重複、缺檔、未列入資產與封面 / 介紹覆蓋；支援 `--strict`、`--json` |
| `npm run normalize:descriptions` | `tools/normalize-editorial-descriptions.mjs` | 以內建摘要與 OpenCC（`cn` → `tw`）整理 `game-metadata.json` 的編輯介紹；`--write` 才寫回 |
| `npm run apply:user-descriptions` | `tools/apply-user-editorial-descriptions.mjs` | 將腳本內使用者提供的介紹套用到 `game-metadata.json` |
| `npm run normalize:cover-search` | `tools/update-missing-cover-searches.mjs` | 對無封面項目寫入 `coverSearchUrl`，設 `coverStatus`（預設 `missing-candidate`）與 `verified: false` |
| `npm run import:libretro-covers` | `tools/import-libretro-covers.mjs` | 依指定對照表從 Libretro Thumbnails（NES / SNES / GG）匯入封面，以 `sharp` 輸出 240×320 至 `public/assets/covers/` |
| `npm run import:user-covers` | `tools/import-user-covers.mjs` | 依指定的檔案與來源網址匯入使用者提供的封面，同樣輸出 240×320 |
| `npm run collect:covers` | `tools/collect-game-covers.mjs` | 蒐集封面候選；參數 `--limit=`、`--offset=`、`--queries=`、`--system=`、`--download`、`--force`、`--api` / `--no-api`，環境變數 `WIKI_DELAY_MS` |

## 驗證規範

一筆記錄須以下全部具備且經人工檢查，才算完成：

- 標題能辨識實際遊戲、地區、發行版本，以及 hack 或翻譯變體。
- `cover` 指向正確的盒裝或卡匣圖；若無原版封面，須指向明確標示的替代圖。
- `description` 為針對該發行系列撰寫或取得的中文介紹。
- `coverSource` 與 `descriptionSource` 註明各欄位來源。
- 圖文一併檢查後才設 `verified: true`。
- 卡匣軟體 `cartridge` 為 `true`，街機壓縮檔為 `false`。

## 來源政策

候選資料可取自公開資料庫，但必須保留來源，且不能自動視為已驗證。

- 中文介紹：有合適條目時用中文維基百科或 Wikidata，並保留其署名要求；否則撰寫簡短原創介紹，來源標為 editorial。
- 盒裝圖：Libretro Thumbnails 適合比對正式版本，並提供各系統的 `Named_Boxarts`。其文件說明圖片來自開發商、發行商、掃描者、收藏者等貢獻者，因此打包進專案前須確認再散布權利。
- Hack、合卡、範例與中文化修改：只有在 UI 標示為「原作圖」時才可使用原作圖，並手寫該變體的說明；不得把原作圖默認呈現為修改版 ROM 的官方封面。
- 缺圖或不確定：以產生的文字標籤作為佔位，直到人工確認來源；UI 已支援此退回機制。

## 完成標準

1. 每個預定的 ROM 資產都已列入 `public/roms.json`，或已記錄為排除。
2. 每個項目都有具來源的封面，或明確的「無原版封面」標籤。
3. 每個項目都有符合其發行版本或變體的中文介紹。
4. 每筆記錄經審閱後標為 `verified: true`。
5. `npm run audit:games -- --strict` 成功結束。
6. `npm run build` 成功，且選單在桌面與行動裝置上仍可使用。
