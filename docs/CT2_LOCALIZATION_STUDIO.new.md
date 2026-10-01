# 足球小將 II 中文化工作室（實驗版）

> 現況：原版日文 ROM 可啟用來源驗證的高解析度中文顯示層，劇情、已驗證選單與比賽詞彙的保守子集會顯示中文；**仍不是全中文，也不是商用品質驗收完成**。
> 2,199 筆翻譯草稿已填入（其中 102 筆獨立假名保留原文），未完成人工校對。比賽中仍會出現日文。

## 現況摘要

已中文化（有原 ROM 實際繪製證據）：

- 劇情文字：來源證據與安全區域檢查通過時顯示中文；未走過全部分支。
- 已驗證選單：賽前四項、能力標籤、密碼提示、指令欄的盤球／傳球／射門。
- 比賽：完整相鄰的 ROM 詞彙／旁白片段、球隊與球員名、已驗證「姓名 + くん」組合，以及必殺射門「抽球射門」。

刻意保留或尚未中文化：

- 標題 KICK OFF／CONTINUE 保留英文（來源索引保留兩項定義，顯示層不套用）。
- 密碼的 64 個假名符號、已輸入密碼、數字與位置順序是遊戲資料，不翻譯；E 提交符號以 ✓ 表示。
- RAM 字典 index 0（如 `てきの 9ばん`／`てきのキーパー`）、自訂／未知名字、動態數字、跨列整句、其他 FC 控制參數／分支 grammar、獨立假名、被精靈遮擋或超框的字詞。
- 猛虎射門、其他球員、其他賽事／技能清單未實測。進球旁白目前繪出分離的「進了！進」「球！！」，不代表整句排版完成。

## 使用方式

- 執行開發伺服器後開啟 [translation-studio.html](../translation-studio.html)（`/translation-studio.html`）：搜尋、分類、編輯、匯入與匯出完整翻譯 JSON。
- 在遊戲首頁載入支援的**原版日文 ROM** 即啟用中文圖層；這兩個原版雜湊不再走舊 8×8 BPS 中文字庫路徑。關閉中文只改變顯示。
- **本機儲存**：本機 DEV 編輯器按「儲存到本機」後，同來源另一分頁中執行的 DEV 遊戲會即時更新譯文，不重啟遊戲。
- **匯入／匯出**：匯入只更新編輯稿，須再儲存；匯出檔可交付他人編修。正式版只使用部署譯文。
- **僅限開發環境的編輯**：「中文增強」「編輯中文」與開發狀態標籤只在 Vite DEV 且 hostname 為 localhost／127.0.0.1／[::1] 時顯示。正式建置與區網 DEV 不顯示，也不讀取本機草稿，但中文顯示仍啟用。這是本機開發條件，不偵測 VS Code 程序，也不是權限控制。
- 「已校對」勾選只存在於目前編輯器工作階段，不隨匯出或重新載入保留；需持久記錄請寫在 `notes`。已儲存的草稿不會隨程式更新自動合併新譯文。

### 交換格式

- [localization.json](../public/game-profiles/captain-tsubasa-2-jp/localization.json)：翻譯人員只編輯 `translation`、`notes`，身分與原文欄位不可更動。
- 格式含版本、遊戲 ID、ROM SHA-256、語系，以及平坦的 `entries` 與 `values`（`values` 保持空陣列）。
- 匯入須為完整集合；錯誤雜湊、重複／缺漏 ID、原文改動、無效欄位或超過 4 MiB 會整批拒絕，不部分套用。
- 初版限定 CT2／繁中，還不是通用多語引擎。

支援的原始 SHA-256（不提供 ROM；改版、已打補丁或其他版本不套用）：

- `bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746`（長程測試使用）
- `ee08f9134ef0e9e3a5f77e4f08244d24739c68d781cb58e2be737916bb3ab5ae`（既有標頭別名）

### 相關檔案

| 檔案 | 用途 |
| --- | --- |
| [text-runtime.json](../public/game-profiles/captain-tsubasa-2-jp/text-runtime.json) | 機器來源索引（偏移、原始位元組、控制流程），不交給翻譯人員 |
| [build-ct2-localization.mjs](../tools/build-ct2-localization.mjs) | `npm run localization:build`：由原 ROM 重建，確認來源與四份草稿 ID／原文一致 |
| [ct2-menu-extract.mjs](../tools/ct2-menu-extract.mjs)、[menu-localization.ts](../src/game-profiles/menu-localization.ts)、[menus.json](../public/game-profiles/captain-tsubasa-2-jp/menus.json) | 原 ROM 選單萃取、匹配與部署定義 |
| [text-overlay.ts](../src/game-profiles/text-overlay.ts) | 顯示圖層 |
| [localization.ts](../src/game-profiles/localization.ts) | 事件、驗證與完整字詞組合器 |
| [emulator.rs](../nes-wasm/src/emulator.rs) | 原核心文字觀察器 |
| [ct2-match-probe.mjs](../tools/ct2-match-probe.mjs) | 比賽／必殺射門實際路線診斷 |

不使用 OCR、外部 AI/API、遠端字型或上傳 ROM。ROM 檔、ROM 位元組、CPU/RAM 行為與原始 framebuffer 均不被中文圖層修改。

## 覆蓋範圍

填寫率不等於完成率。

| 項目 | 狀態 |
| --- | --- |
| 開場與劇情萃取 | 1,447 個片段，來自 88 個唯一劇情來源 |
| 比賽訊息萃取 | 513 個片段 |
| 固定詞彙萃取 | 239 筆 |
| 合計 | 2,199 筆可編輯記錄（不是全遊戲覆蓋率分母）；未知字碼占位符 0，數字／標點／拉丁字母由原始 CHR 字庫圖確認 |
| 譯文 | 2,199 筆草稿，102 筆獨立假名保留原文並註明原因；未完成人工校對 |
| 劇情顯示 | 已啟用；超框、遮擋或證據不完整時保留原文 |
| 比賽選單 | 221 個選單定義：66 個版面來源、33 組指令圖塊、賽前四項、球隊／能力標籤、標題、密碼提示等（不是 221 個完整畫面） |
| 比賽指令 | 盤球／傳球／射門已在實際指令欄驗證；比「怎麼做？」提示縮排一個 tile，按方向鍵後才顯示並依原節奏閃爍，空白不一定是漏翻 |
| 比賽旁白／動態詞彙 | 保守子集：完整相鄰詞彙／旁白片段；已驗證一般射門 15,600／19,000 幀路線，不是全場覆蓋 |
| 必殺射門與動態姓名 | 抽球射門與「大空翼的」等姓名敬稱組合已驗證（16,901 幀路線）；其他招式、RAM 名稱未完成 |
| 其他 writer（字幕、片尾等） | 未全面接入；萃取到的片段不代表對應 writer 可顯示 |
| 能力 | 工作室為唯讀預覽；遊戲端另有預設滿級 64、可關閉的 1–64 級 read-side tuning，見 [CT2_PLAYER_STATS_RESEARCH.md](CT2_PLAYER_STATS_RESEARCH.md) |

能力欄位不能猜：`$CD7C` 球員記錄 resolver（結果 `$34/$35`）不可與 `$F30F`／`$F329` 字詞 resolver 混用；已驗證記錄 `+0` 為 ID、`+1..2` 為目前體力、`+3` 為零起算等級，其餘未定義；大空翼初始記錄在 `$036C`（不是 `$0300`）。對手記錄、未定義欄位與任意 255 編輯不開放。

縮句稽核 `node tools/ct2-translation-fit.mjs` 以完整行計算固定字級保守預算：1,137 行中有 9 行超出（多為專名／片尾碎片）。實際安全空白可能容納，不能宣稱全分支排版已驗收。

## 顯示設計

### 字級、遮罩與速度

- **固定字級**：劇情與一般選單 12px（NES 座標），單格確認符號 8px。不自動縮字、不外移到閱讀區、不截斷；改寫為原位能容納的精簡譯文（例：「我會在這裡實習球隊經理，」）。未校對的超長自訂譯文保留原文。
- 短標籤只能延伸到同一行已驗證空白格，不跨過數字、名字或未知字元。
- **遮罩**：在原始 256×240 像素副本上套用日文遮罩，再以 nearest-neighbor 放大，避免白邊；核心 framebuffer 不變。
- **防閃回**：逐格清除時，仍存在的原文格持續遮罩，直到該格寫入世代改變。前景／背景色取自各格實際 fetch。
- **精靈**：背景 fetch 證據與 winning sprite 分離，畫完中文後復原前景精靈像素（足球游標、箭頭、獎盃動畫）。
- **逐字速度**：每個來源片段的中文以原比例 2 倍揭露，不搶先顯示下一片段，不加速 CPU、動畫或音訊；換頁等待保留。

### 來源與 CHR 防護

- 劇情 writer：bank 0 `$84F3` 寫字呼叫提供字碼與 PPU 位置，來源指標在 `$4D/$4E`。觀察器檢查 ROM 雜湊、mapper 實體 bank、來源範圍與 A 暫存器字碼。
- 每次事件含上下兩格 nametable 的預期寫入世代。PPU 隨實際背景 fetch 記錄圖塊、世代、來源 cell、fine Y，並要求圖案來自已確認的原始 CHR 字庫；使用完成畫面的證據，而非可能已被 VBlank 更新的 nametable。
- `fontAliases` 由原 ROM 逐一比較完整 16-byte CHR tile 產生，只接受位元組完全相同的副本。
- 選單以原 ROM 字碼／literal tile 與原始 CHR 實體身分匹配，不做圖片 OCR。
- 替換條件：完整來源前綴、連續位置、同一文字行、未被精靈遮住的完整 8×16 區域；中文只能放在來源格或已證明空白的同行區域。通過字寬檢查才遮原文；未安全驗證的句子不塗黑。
- `EB` 先等待按鍵，再執行 `$88B1` 清除，所以讀到 `EB` 時不能清除譯文。
- 重設／存檔匯入清除觀察證據；讀檔後既有文字要等新來源事件才重新翻譯，不由 framebuffer 猜測。
- 切換核心或返回選單會拆除圖層；一般暫停不拆除，暫停中可重繪而不推進模擬。手機 `object-fit: contain` 的 letterbox 不列入遊戲圖像位置。

### 比賽與必殺射門

- 比賽 writer `$8358/$864B`：觀察器為比賽 glyph 同時記錄上下格下一次寫入世代（原本缺 kind-4 世代證據，且顯示層跳過 `domain: battle`）。
- 組合器以「來源 ID + 實際起始格」辨認每次出現，支援同名重複；只組合相鄰且完整的詞彙／片段，順序依實際 writer，不猜射門者。未知來源／RAM 替換不承接舊世代證據。舊文字重寫、重置／讀檔或未知替換會停止覆蓋。
- 必殺射門選單：physical PRG bank `$30000` 的 `$8A79` 字典 writer；球員姓名欄 `$8D7B`（不是旁白 `$864B`）。observer 只接受原 ROM byte／bank，只在 `$3C == 1` 的上格 pass 記錄來源與上下格世代，下格 pass 不覆寫上格證據。
- 敬稱：`$8653` 人名 routine 以 `$8662`／`$8667` 兩個 immediate operand 輸出 `くん`。只容許完整、相鄰、已驗證球員名 + くん整組使用中文專名，不把孤立敬稱翻空，不授權 RAM／未知名字。因此「つばさ」+ 敬稱可容納「大空翼」，「マリーニくんが」可繪出「馬里尼，」。
- FC 跨列：原 ROM `$FC -> $85D6`，下一列路徑 `$85EF/$85F2` 會略過一個 byte。只縮小三個已校對 runtime span：`.14.text.0010`、`.58.text.0004`、`.75.text.0004`；交換檔 ID、原文、譯文不變，build 驗證原 opcode signature／FC／指定 prefix。其他 cloud grammar 未作推測式批次重寫。

## 證據

所有路線使用 SHA-256 `bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746`、零起算幀、手把輸入，未注入 RAM、glyph、來源事件或 patched ROM。一般比賽路線關閉等級 tuning；必殺射門路線使用 read-side 等級 64。

| 中文（Canvas 實際繪出） | 首次幀 | 來源／範圍 |
| --- | ---: | --- |
| 聖保羅 | 13005 | 動態球隊字典 |
| 巴賓頓 | 13140 | 動態球員字典 |
| 接住傳球！ | 13143 | `.75.text.0004`；`.58.text.0004` 於大空翼接球也通過 |
| 盤球／傳球／射門 | 13537–13539 | 既有選單匹配器 |
| 吉爾／大空翼 | 14363／14389 | 傳球目標球員欄 |
| 射門！ | 15059 | 動態動作字典 + 靜態驚嘆號 |
| 球，迎上去了！ | 15232 | 動態字典 + 旁白片段（利用驗證空白） |
| 被擊中，／變成落球了／這顆落球， | 15279／15331／15396 | 靜態比賽片段 |
| 馬里尼，／上前接應了！ | 15399／15402 | 一般射門 renderer（非必殺技路線） |
| 抽球射門 | 15436 | 必殺射門選單，`fixed-bank-words.157` |
| 衝啊！／抽球射門！！ | 15798／15801 | 必殺技演出旁白 |
| 大空翼的／抽球射門！ | 15906／15909 | 姓名 + 敬稱 + `の`；招式 + `!` |

必殺射門手把路線（零起算）：沿既有開場到巴賓頓指令；14110 左、14130 A；傳球游標 14310 右 40 幀、14360 上 30 幀；**14440 A** 傳給大空翼（14420 的嘗試會被攔截，不能互換）；15410 右、15430 A 開射門清單；15610 下、15630 A 選抽球射門。其他按鍵 pulse 4 幀。

注意事項：

- 診斷每 600 幀比較完整持久快照與 framebuffer，對照同樣開 provenance、但不消費事件／不跑 overlay 的核心；不是 observer 開關的逐幀完整硬體證明。
- 診斷 PNG 是未翻譯的核心 framebuffer；JSON 的 `painted`／`observedRuns` 才是中文 draw-call 證據。
- Canvas 字寬使用固定 12px 全形 deterministic mock，不是瀏覽器字型視覺驗收。
- 瀏覽器已驗證：原 ROM 中文字形、844×390 橫向 contain 定位、390px 編輯器無水平溢位。尚無全遊戲／全手機／完整存讀檔回歸。

## 存檔與限制

舊 NESW v1 只保存部分 CPU／RAM／PPU，遺漏 mapper、APU、DMA 與時序；CT2 實測讀檔後映到錯誤 PRG bank，截斷資料可能造成 WASM panic。正式讀取路徑不再使用。

| 路徑 | 行為 |
| --- | --- |
| 快速欄位 | 16 個獨立欄位（0–15），完整硬體深拷貝（CPU、PPU、APU、匯流排、mapper／卡帶、手把、時鐘、DMC DMA）的同核心暫存 token；走 `exportSaveStateForSlot()`，覆寫一欄只替換該欄。診斷用 `exportSaveState()` 另保留最近 16 次。返回選單、重建核心或重新整理後失效 |
| 儲存／讀取按鈕 | 完整硬體快照 `NES-SAVE-1`（版本前綴 + Base64／bincode，含 ROM SHA-256）。key 為 `emu_savestate_nes_<ROM名稱>_<slot>`，主寫 `localStorage`，失敗才改 IndexedDB；重新整理後同 ROM 仍可讀 |
| 匯出檔 | 文字形式 `.nes-save` 容器（非 NESW v1、非 JSON），只能匯入相同 ROM 身分與相容格式 |

- 讀取檢查格式、大小、硬體資料範圍與 ROM 雜湊；未知、舊格式、過期或不同 ROM 會整體拒絕，不修改執行狀態。成功後清空未播放音訊並更新畫面。
- 舊暫存不作不安全遷移，也不刪除既有 localStorage 檔案；其他主機與 Snes9x 沿用既有保存路徑。
- ROM 載入中拒絕操作；空核心匯出不回報成功。
- 讀檔會清除文字觀察證據，已顯示的日文需等新來源事件才重新翻譯。

## 測試指令

需要原 ROM 的測試預設跳過，避免要求其他開發者擁有 ROM。最近一次結果（2026-09-06）：

| 指令 | 結果／內容 |
| --- | --- |
| `npm run wasm:build` | 重新產生 JS/WASM 綁定 |
| `npm run test:localization` | 166 passed，0 skipped（已啟用兩個原 ROM opt-in；未設時這兩項略過）；含標題不翻、DEV／正式環境、固定字級、2 倍揭露、無白縫、逐格遮罩、精靈復原、密碼區不誤遮 |
| `CT2_TEST_ROM=1`、`CT2_TEST_BATTLE_ROM=1` + `npm run test:localization:battle:render` | 15,600 幀原版比賽（後 2,700 幀逐幀 renderer）與 2,400 幀劇情；Canvas 繪製、舊句消失、reset、824 幀閱讀等待 |
| `npm run test:localization:special-shot:rom`（或 `CT2_PROBE_VERIFY=1`） | passed；16,901 幀、29 次快照／framebuffer 比較；必殺技、兩個接球變體、姓名組合、退場、reset 斷言；會重建 artifacts 的 probe JSON／PNG，需原 ROM 與已重建 WASM |
| `npm run test:localization:battle:rom` | 1 passed；19,000 幀來源診斷，觀察 14 個來源 ID |
| `npm run test:localization:menus` | 14 passed（原 ROM 來源與解碼） |
| `npm run test:localization:menus:rom` | 12 passed；標題來源匹配、賽前四項、能力標籤、密碼頁、指令欄。`ct2-menu-special` 是標題／密碼版面測試，不是必殺射門 |
| `CT2_TEST_ROM=1` + `npx vitest run tests/ct2-overlay-runtime.test.ts` | 2,400 幀；1,520 幀繪出中文，61,869 次遮罩通過世代／fetch 證據，`EB` 後 824 幀保持同段中文 |
| `npm run test:localization:rom` | 預設 1,800 幀雙核心對照，每 120 幀比對狀態與 framebuffer，確認 ROM 不變；加 `CT2_TEST_PLAY=1`、`CT2_TEST_FRAMES=15000` 可實際開球（780 劇情 glyph 事件、38 比賽事件、64 可見片段） |
| `npm run test:profiles` | 34 passed |
| `npm run test:ct2:stats` | Node 5 + Vitest 8 passed |
| Rust `text_observer` | 3 passed |
| `node --test tools/nes-temporary-state.test.mjs` | 存讀檔十項回歸（40 次覆寫／診斷匯出、跨核心讀取、ROM 不相容拒絕、重置／重載、空核心與載入中 gate、其他平台格式） |
| Rust `temporary_state`、`ct2_temporary_state_restores_original_game_exactly` | MMC3／DMA 中途恢復、無效格式原子拒絕；原 ROM 對照 600 幀畫面、音訊、mapper 與時序 |
| `npm run build` | passed（WASM + TypeScript + Vite，有既有 Rust warnings）；之後 `npx tsc --noEmit`、`git diff --check` 通過 |

`npm run localization:build` 重建後 221 筆 menus JSON 與 HEAD 無實質內容差異；必殺技行為在動態字典 observer／runtime，不是新增靜態選單項目。以上均為來源、執行與 mock Canvas 驗證，不是全場／全招式／瀏覽器字型的視覺驗收。

## 下一個驗收里程碑

1. 在已啟用的完整詞彙子集上補足 RAM 名稱、動態數字與跨列整句，驗證其他 FC／分支與寬度分配。
2. 擴充選單實際路線驗收，尤其其他必殺技、球員與賽事；共用 writer 不等於全清單驗收。
3. 找出首批能力欄位與 ROM 初始化表，加入可驗證的數值交換格式。
4. 依完整流程人工校對：術語、人名、獨立假名／片尾字形、各路徑排版與讀取節奏。
5. CT2 流程穩定後，以同一交換／編輯框架接 Zombie Hunter 的專用解碼與 writer（見 [ZOMBIE_HUNTER.md](ZOMBIE_HUNTER.md)）。

## 歷史紀錄

- 2026-09-05：顯示品質更新取代早期的自動縮字、畫面下方閱讀區與標題翻譯；接入 221 個原 ROM 選單定義。
- 2026-09-05：修正快速欄位互相淘汰——Rust 以每次匯出 FIFO 淘汰、前端以欄位計數，兩者不同步（存欄位 1 後覆寫欄位 0 共 16 次即失敗；既有 mock 未覆蓋）。新增 `NES-SAVE-1` 持久存檔。
- 2026-09-06：比賽中文顯示啟用保守子集，取代早期「比賽／字典顯示完全未啟用」的描述。
- 2026-09-06：接入必殺射門字典 writer 與姓名敬稱，縮小三個 FC span；新增敬稱安全回歸（不連續 operand、孤立／非人名／缺字／間隙、CHR／世代／byte 錯誤、RAM 替換）。
- 2026-09-06：校對五條超寬譯文，保守預算超出行數由 14 降為 9／1,137；新增大空翼能力研究與遊戲內 tuning（見 [CT2_PLAYER_STATS_RESEARCH.md](CT2_PLAYER_STATS_RESEARCH.md)）。
