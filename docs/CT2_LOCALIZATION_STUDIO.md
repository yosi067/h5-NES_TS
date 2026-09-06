# 足球小將 II：中文顯示與翻譯工作室（實驗版）

## 必殺射門／動態姓名續作（2026-09-06；最新狀態）

本節是目前狀態；下方早期回歸數據僅作歷史紀錄。**仍不是全中文。** 本輪稽核未改原 ROM、球員身分／技能或既有能力 tuning；新增敬稱安全回歸與必殺技驗證指令，未 commit／push。

### 原 ROM 根因與安全修正

- 必殺射門選單使用 physical PRG bank `$30000` 的 `$8A79` 字典 writer，球員姓名欄使用 `$8D7B`；不是已接入的旁白 `$864B`。新增 observer 只接受原 ROM byte／bank，且只在 `$3C == 1` 的上格 pass 記錄來源與上下格下一次寫入世代。下格 pass 不會覆寫上格證據。既有 renderer 仍要求完整字詞、CHR 身分、fetch／世代、字寬，未知字不塗黑。
- `$8653` 人名 routine 以 `$8662`／`$8667` 兩個 immediate operand 輸出 `くん`。現在觀察真實 operand 來源，只容許**完整、相鄰、已驗證球員名 + くん**整組使用中文專名；不把孤立敬稱翻空，也不授權 RAM／未知名字。因而三字日文「つばさ」可連同兩字敬稱安全容納「大空翼」，「マリーニくんが」可繪出「馬里尼，」。
- 原 ROM `$FC -> $85D6`，下一列路徑 `$85EF/$85F2` 會略過一個 byte。本次只縮小三個已校對 runtime span：`.14.text.0010`、`.58.text.0004`、`.75.text.0004`。保留交換檔 ID、原文及譯文，build 驗證原 opcode signature／FC／指定 prefix。**未對全部 cloud grammar 作推測式批次重寫**。

### 可重現的實際必殺射門

[診斷程式](../tools/ct2-match-probe.mjs) 預設走完整路線；`npm run test:localization:special-shot:rom`（或設定 `CT2_PROBE_VERIFY=1`）啟用必殺射門、兩個接球變體、姓名組合、舊選單消失及 reset 斷言。需要本機原 ROM 與已重建 WASM；會重建 artifacts 的 probe JSON／原始畫面 PNG。使用原版 SHA-256 `bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746`，read-side 等級 64；未注入 RAM、glyph 或 patched ROM。

零起算手把路線：沿既有開場到巴賓頓指令；14110 左、14130 A；傳球游標 14310 右 40 幀、14360 上 30 幀；**14440 A**傳給大空翼。14420 的另一次嘗試被攔截，不能互換。15410 右、15430 A 打開射門清單；15610 下、15630 A 選抽球射門。其他按鍵 pulse 4 幀。原始畫面接著出現 `ドライブシュート` 招式旁白並進球。

實際 `NesTextOverlay` 的 Canvas `fillText` 證據：

| 中文 | 首次幀 | 實際來源 |
| --- | ---: | --- |
| 接住傳球！ | 13143 | `.75.text.0004`；`.58.text.0004` 於大空翼接球也通過 |
| 吉爾 | 14363 | 傳球目標球員欄 |
| 大空翼 | 14389 | 傳球目標球員欄 |
| 抽球射門 | 15436 | 真正必殺射門選單，`fixed-bank-words.157` |
| 衝啊！／抽球射門！！ | 15798／15801 | 必殺技演出旁白 |
| 大空翼的／抽球射門！ | 15906／15909 | 姓名 + 敬稱 + `の`，及招式 + `!` |
| 馬里尼，／上前接應了！ | 15399／15402 | **另一路既有普通射門 renderer 回歸**，非必殺技路線 |

診斷跑 16,901 幀；每 600 幀共 29 次比較完整持久快照及原始 framebuffer，與同 provenance-enabled、但不消費事件／不跑 overlay 的核心一致。這不是 observer-on/off 完整硬體證明。診斷 PNG 是**未翻譯的核心 framebuffer**；JSON 的 `painted`／`observedRuns` 才是實際中文 draw-call 證據。Canvas 使用固定 12px 全形測量替身，未宣稱瀏覽器字型視覺驗收。

### 明確剩餘與阻礙

- `てきの 9ばん`／`てきのキーパー` 等 RAM index-0 組合仍未建立完整來源鏈；不能把 `$05EE` 暫存 bytes 當成固定 ROM 名字。自訂名字同樣保留。
- 其他 FC、控制參數／分支、獨立假名、跨列及不連續字形仍可能不翻；例如進球旁白目前繪出分離的「進了！進」「球！！」，不代表整句排版完成。
- 僅實際使用大空翼本場原生可用的抽球射門；猛虎射門、其他球員、其他賽事／技能清單未走完。相同 writer 可提供來源，但不是全招式驗收。
- 來源不完整、敬稱孤立、寬度不足、精靈遮擋／世代失效仍回退日文；讀檔後須等新來源。未作全部場景／手機／字型驗收。

### 回歸

本輪重新建置 WASM／TypeScript／Vite，並重跑原 ROM 必殺技實際 renderer 斷言。新增三項敬稱回歸，涵蓋不連續 operand、完整相鄰姓名、孤立／非人名／缺字／間隙、CHR／世代／byte 錯誤與 RAM 替換。詳細最終結果見下方「最終稽核驗證」。

### 最終稽核驗證（2026-09-06）

- `npm run test:localization`：**166 passed，0 skipped**；本次環境已啟用兩個原 ROM opt-in，含 15,600 幀一般比賽與 2,400 幀劇情 renderer。未設 opt-in 的環境仍會略過這兩項。
- `npm run test:localization:special-shot:rom`：**passed**，16,901 幀原 ROM 手把路線、29 次完整快照／framebuffer 比較、必殺技中文／接球兩變體／姓名組合／退場／reset 斷言；上表首次幀可重現。
- `npm run test:localization:battle:rom`：**1 passed**，19,000 幀；`npm run test:localization:menus:rom`：**12 passed**；`npm run test:localization:menus`：**14 passed**。其中 `ct2-menu-special` 是標題／密碼特殊版面測試，不是必殺射門測試。
- `npm run test:profiles`：**34 passed**；`npm run test:ct2:stats`：**Node 5 + Vitest 8 passed**；Rust `text_observer`：**3 passed**。既有能力工作保留，本輪未重跑獨立 Rust stats ROM 全矩陣。
- `npm run build`：**passed**（WASM + TypeScript + Vite；既有 Rust warnings）；重新產生部署資料後 `npx tsc --noEmit` 與 `git diff --check` 通過。
- `npm run localization:build` 重建後，221 筆 menus JSON 與 HEAD **沒有實質內容 diff**（工作樹仍可能顯示換行差異）；必殺技新增行為在動態字典 observer／runtime，而非新增靜態選單項目。
- 保留先前 stats 與其他未提交工作；未碰兩個不相關未追蹤 ROM ZIP，未 commit／push。這些結果是來源、執行與 mock Canvas draw-call 驗證，**不是全場／全招式／瀏覽器字型的視覺驗收**。

## 比賽中文顯示更新（2026-09-06；仍非全中文）

**比賽中仍會出現日文。** 此節取代下方歷史紀錄中的「比賽／字典顯示完全未啟用」，不代表 513 條旁白或 239 個詞彙全數完成驗收。

### 根因與本次實作

- 翻譯 JSON 有草稿，不代表會顯示：原顯示層直接跳過 `domain: battle`，而 `$8358/$864B` 比賽 writer 事件缺少 kind-4 世代證據。
- [原核心觀察器](../nes-wasm/src/emulator.rs) 現在為比賽 glyph 同時記錄上下格的下一次寫入世代。仍檢查原 ROM 雜湊、實體 bank、實際來源 byte、PPU 目標，不改 CPU/RAM/ROM 或遊戲速度。
- [完整字詞組合器](../src/game-profiles/localization.ts) 按「來源 ID + 實際起始格」辨認每次出現，支援同一人名重複出現；只組合相鄰且完整的來源詞彙／片段，順序依實際 writer，不猜誰是射門者。未知來源／RAM 替換不能承接舊來源的世代證據。
- [顯示層](../src/game-profiles/text-overlay.ts) 已實際接入組合器：要求完整 8×16 fetch、原 CHR 身分及寫入世代，固定 12px；可使用同列已驗證空白，但不跨數字、名字或未知字元。**通過字寬檢查才遮原文**，缺字／不完整／遮擋／超框均保留原文。此子流程等待完整詞彙寫入，不預揭下一個動態詞彙，也不改原按鍵等待。
- 舊文字被重新寫入、重置／讀檔失效事件或未知替換會停止覆蓋；未安全驗證的句子不整塊塗黑。

### 原 ROM 實際覆蓋證據（零起算幀）

使用原版 SHA-256 `bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746`，新開局，以手把輸入開球並射門，沒有注入 RAM、來源事件或替換 ROM。此比賽路線關閉大空翼等級 tuning，以原生等級作基準；能力 tuning 的獨立原 ROM 回歸仍通過。

| 實際 Canvas 繪出的中文 | 首次幀 | 範圍 |
| --- | ---: | --- |
| 聖保羅 | 13005 | 動態球隊字典 |
| 巴賓頓 | 13140 | 動態球員字典 |
| 盤球／傳球／射門 | 13537–13539 | 既有選單匹配器，未新造選單來源 |
| 射門！ | 15059 | 動態動作字典 + 靜態驚嘆號 |
| 球，迎上去了！ | 15232 | 動態字典 + 旁白片段，利用驗證空白容納 |
| 被擊中， | 15279 | 靜態比賽片段 |
| 變成落球了 | 15331 | 靜態比賽片段 |
| 這顆落球， | 15396 | 靜態比賽片段 |

### 明確剩餘日文／未驗證部分

- 必殺技字典 writer 已接入；原 ROM 已實際選到並繪出「抽球射門」。原有 221 個靜態選單定義不等於全招式清單；猛虎射門及其他球員／賽事仍未實測。
- 三個指定 FC prefix 已以原指令來源驗證後縮小 runtime span，交換檔原文不變；其他控制參數／分支 grammar 仍需獨立驗證，不能將 lossless round-trip 當成語意分段證明。
- 已繪出「馬里尼，／上前接應了！」及「大空翼的」，但不是所有名字均已中文化。寬度、片段、空白及世代仍須同時成立，RAM 名稱仍未支援。
- RAM 字典 index 0、自訂／未知名稱、跨列句子、分支 graph／其他 writer、獨立假名、被精靈遮住或超框的字詞仍可能日中交錯。未作全場比賽、全隊伍、全招式或全劇情驗收。
- 讀檔前已存在的原文仍需新來源事件才翻譯；密碼假名資料與標題英文仍按既定策略保留。

### 本輪測試

- `npm run test:localization`：161 passed；兩個原 ROM opt-in 預設 skipped。
- 設 `CT2_TEST_ROM=1`、`CT2_TEST_BATTLE_ROM=1` 後 `npm run test:localization:battle:render`：2 passed；15,600 幀原版比賽（後 2,700 幀逐幀實際 renderer）及 2,400 幀原版劇情，驗證 Canvas 繪製／舊句消失／reset／824 幀閱讀等待。Canvas 字寬是 deterministic mock，不是瀏覽器實際中文字型視覺驗收；沒有人工合成 touch 或 glyph 事件。
- `npm run test:localization:battle:rom`：19,000 幀原 ROM 來源診斷 passed，觀察 14 個來源 ID。參考核心同樣開 provenance（完整存檔包含此資料），但不消費來源事件；每 600 幀比較完整持久快照及 framebuffer。不是 observer 開關差異的逐幀完整硬體證明。
- 設 `CT2_TEST_ROM=1` 後 `npm run test:ct2:stats`：Node 5 + Vitest 8 passed。`npm run test:ct2:stats:rom`：兩個 Rust 原 ROM 測試 passed，各 1,472 個公式案例，另含 tuning 的换位／重算／存讀檔驗證。
- `npm run test:localization:menus`：14 passed；`npm run test:profiles`：34 passed；`npm run build` 與 `git diff --check` 通過。既有 Rust warnings 未在此任務擴大修改。

## 大空翼能力研究更新（2026-09-06）

新增[原版能力證據與遊戲內 tuning](CT2_PLAYER_STATS_RESEARCH.md)：已確認大空翼身分 1、初始 slot 9，以及等級／體力和 ROM 查表公式。**原生 NES 載入支援的原版 ROM 預設大空翼自然滿級 64**，遊戲畫面下方面板可關閉／動態調成 1–64，不重置核心、不鎖剩餘體力；依 ID 和原 routine 讀取位置套用，不固定寫 slot。原版基準與 runtime 各 1,472 案例、人工構造換位／球隊情境、原生重算與存讀檔均已測試；不是全劇情通關驗收。

工作室的能力面板仍是唯讀預覽，與遊戲設定獨立；翻譯交換格式 `values` 保持空陣列。重置／讀檔保留遊戲 tuning 偏好，重載 ROM 回到預設 64；原生經驗／level byte 不被覆寫。詳見上列文件的體力、關閉及顯示更新限制。

本輪另校對五條繁中完整行，超保守字寬預算的行數由 14 降為 9／1,137。下面的早期「完全沒有欄位證據」及 14 行數字為歷史紀錄；不等於動態比賽文字已完成。

## 顯示品質與選單更新（2026-09-05）

以下為目前有效行為，取代早期自動縮字、畫面下方閱讀區與標題翻譯：

- **白邊**：日文遮罩改在原始 256×240 像素副本上套用，再以 nearest-neighbor 放大；不再逐格畫高解析度半透明邊界。原始核心 framebuffer 不變。
- **日文閃回**：準備清字／切換腳本不再直接撤掉畫面證據。逐格清除時，仍存在的原文格持續遮罩，直到自己的寫入世代改變。前景與背景色來自各格實際 fetch，不因其他畫面區域調色盤變化而整頁失效。
- **字級／長句**：劇情與一般選單固定 12px（NES 座標）；單格確認符號固定 8px。取消畫面下方閱讀區，改寫為原位能容納的精簡譯文，例如「我會在這裡實習球隊經理，」。短標籤只能擴展到同一行已驗證空白格，不能跨過數值。未校對的超長自訂譯文保留原文，不外移、截斷或縮字。
- **標題**：KICK OFF／CONTINUE 保留原樣。來源索引仍保留兩項定義，顯示層不套用它們。
- **逐字速度**：每個來源片段的中文以原比例的 2 倍揭露；不搶先顯示尚未開始的下一片段，不加速 CPU、遊戲動畫或音訊。原遊戲的換頁等待仍保留。
- **開發控制**：「中文增強」「編輯中文」與開發狀態標籤僅在 Vite DEV 且 hostname 為 localhost／127.0.0.1／[::1] 時顯示。正式建置與區網 DEV 不顯示，也不讀取本機翻譯草稿；中文顯示仍啟用。這是本機開發條件，不偵測 VS Code 程序，也不是編輯器路由的權限控制。
- **選單**：新增 [原 ROM 選單萃取器](../tools/ct2-menu-extract.mjs)、[選單匹配器](../src/game-profiles/menu-localization.ts) 和 [部署定義](../public/game-profiles/captain-tsubasa-2-jp/menus.json)。包含 221 個定義：66 個版面來源、33 組指令圖塊、賽前四項、球隊／能力標籤、標題、密碼提示等；不是 221 個獨立完整畫面。
- 選單以原 ROM 字碼／literal tile 及**原始 CHR 實體身分**匹配，不做圖片 OCR。背景 fetch 證據與 winning sprite 分離，畫完中文後復原真正前景精靈像素，保留足球游標、箭頭及獎盃動畫。
- 密碼的 64 個假名符號、已輸入密碼、數字與位置順序保持原樣；它們是遊戲資料，不能翻成中文。E 提交符號以 ✓ 表示，提示文字為中文。

### 此輪驗收

`npm run test:localization:menus` 檢驗原 ROM 來源與解碼；`npm run test:localization:menus:rom` 使用原始 WASM 執行路線，已驗證標題來源匹配（顯示層刻意不翻）、賽前四項、能力標籤、密碼頁與真正指令欄中的盤球／傳球／射門。實際指令比「怎麼做？」提示縮排一個 tile，且按方向键後才顯示並依原遊戲節奏閃爍；空白並非一定漏翻。

`npm run test:localization` 包含固定字級、native 像素無白縫、逐格清字遮罩、精靈像素復原、密碼區不誤遮等回歸。原 ROM 劇情 2,400 幀閱讀停頓測試通過。

**仍須區分：選單來源已接入，不等於每場比賽的所有分支都已人工驗收。** 動態球員名字與比賽解說的完整句子仍未全面中文化；本次沒有把未知日文全面塗黑，也沒有新增能力數值編輯。

## 現在可以使用的部分

- 執行開發伺服器後，開啟 `/translation-studio.html`，可搜尋、分類、編輯、匯入與匯出完整翻譯 JSON。
- 在遊戲首頁載入已支援的**原版日文 ROM**，會啟用高解析度中文圖層；不再使用這兩個原版雜湊對應的舊 8×8 BPS 中文字庫路徑。
- 本機 DEV 編輯器按「儲存到本機」後，同來源、另一分頁中正在執行的 DEV 遊戲會更新譯文，不重啟遊戲。匯入只更新編輯稿，須再儲存；匯出檔可交付他人編修。正式版僅使用部署譯文。
- ROM 檔、載入的 ROM 位元組、CPU/RAM 行為和原始 framebuffer 均不由此中文圖層修改。關閉中文僅改變顯示。
- 不使用 OCR、外部 AI/API、遠端字型或上傳 ROM。瀏覽器系統字型決定最終字形，尚未固定商用字型品質。

**這不是完整中文化成品，也不是商用品質驗收完成。**

## 覆蓋範圍：不要把填寫率當成完成率

| 項目 | 目前狀態 |
| --- | --- |
| 劇情萃取 | 1,447 個文字片段，來自 88 個唯一劇情來源 |
| 比賽訊息萃取 | 513 個文字片段 |
| 固定詞彙萃取 | 239 個詞彙記錄 |
| 合計 | 2,199 筆可編輯記錄；不是全遊戲覆蓋率的分母 |
| 解碼 | 本次目錄未知字碼占位符為 0；透過原始 CHR 字庫圖確認數字／標點／拉丁字母 |
| 譯文 | 2,199 筆已填入草稿，其中 102 筆獨立假名保留原文並加註原因；其餘也未完成人工語言校對 |
| 劇情中文顯示 | 已啟用來源證據與安全區域檢查；未走過全部分支，超框、遮擋或證據不完整時保留原文 |
| 比賽文字觀察 | 已驗證原 ROM 一般射門 15,600／19,000 幀路線與抽球射門 16,901 幀路線；不是全場覆蓋 |
| 比賽／動態詞彙中文 | **已啟用保守子集**：完整相鄰 ROM 詞彙／旁白、已驗證姓名敬稱與抽球射門；RAM 名稱、動態數字及整句／全分支仍未完成 |
| 選單／字幕／片尾等其他 writer | 已接入來源驗證選單；其他 writer 尚未全面接入，部分萃取片段不代表對應 writer 可顯示 |
| 能力數值 | 工作室仍為唯讀預覽；遊戲端另有預設滿級／可關閉的 1–64 級 read-side tuning，`values` 保持空陣列，不暴露未知 RAM 欄位 |
| Zombie Hunter | 維持既有靜態／少量執行期調查，本次先完成 CT2 的第一個可用流程 |

本次「已校對」勾選僅是目前編輯器工作階段的標記；不會隨 JSON 匯出或跨重新載入保留。需交付持久校對記錄時請使用 `notes`。已儲存的草稿不會隨程式更新自動合併新譯文，避免覆蓋使用者編輯。

## 交付檔案

- [簡單翻譯 JSON](../public/game-profiles/captain-tsubasa-2-jp/localization.json)：翻譯人員只需編輯 `translation`、`notes`，其餘身分與原文欄位不可更動。
- [機器來源索引](../public/game-profiles/captain-tsubasa-2-jp/text-runtime.json)：偏移、原始位元組與控制流程；不需交給翻譯人員手改。
- [來源／草稿合併器](../tools/build-ct2-localization.mjs)：`npm run localization:build` 從原 ROM 重建，確認來源與四份草稿 ID／原文一致。
- [編輯器入口](../translation-studio.html)、[顯示圖層](../src/game-profiles/text-overlay.ts)、[事件與驗證](../src/game-profiles/localization.ts)。

交換格式保留版本、遊戲 ID、ROM SHA-256、語系，以及平坦的 `entries` 和 `values`。匯入須是完整集合；錯誤雜湊、重複／缺漏 ID、原文改動、無效欄位或超過 4 MiB 的輸入會被拒絕，既有修改不會部分套用。初版限定 CT2／繁中；還不是通用多語遊戲引擎。

支援原始 SHA-256：

- `bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746`
- `ee08f9134ef0e9e3a5f77e4f08244d24739c68d781cb58e2be737916bb3ab5ae`（既有標頭別名；本次長程測試使用前者）

不提供 ROM。改版、已打補丁或其他版本不會套用這組觀察器。

## 顯示安全設計

原 ROM bank 0 的 `$84F3` 寫字呼叫提供來源字碼與 PPU 位置；來源指標來自 `$4D/$4E`。觀察器檢查 ROM 雜湊、mapper 實體 bank、來源範圍與 A 暫存器的實際字碼。

每次事件包含預期的上下兩格 nametable 寫入世代。PPU 隨實際背景 fetch 記錄圖塊、寫入世代、來源 cell、fine Y，並要求圖案来自已確認的原始 CHR 字庫。圖層使用完成畫面的證據，而非可能已被 VBlank 更新的目前 nametable。

`fontAliases` 由原 ROM 逐一比較完整 16-byte CHR tile 產生，只允許位元組完全相同的字庫副本，不能因圖塊編號相同就認為是同一個字。

替換必須符合完整來源前綴、連續位置、同一文字行、未被 sprite 遮住的完整 8×16 區域。中文字只能放在來源格或已證明空白的同一行區域，固定字級仍放不下就不替換。每個來源片段各自完成逐字揭露，不越過遊戲的片段停頓。跨畫面／palette 變化及模糊證據採取保守回退。

`EB` 先等待按鍵，再執行 `$88B1` 清除。因此不能在讀到 `EB` 時清除譯文；已用實際等待區間測試這個差異。重設／存檔匯入會清掉觀察證據；讀檔後既有文字要等新的來源事件才會重新翻譯，不嘗試由 framebuffer 猜測來源。

切換核心或返回選單會拆除圖層；一般暫停不拆除。暫停時切換中文、編輯稿更新和改變尺寸可重繪而不推進模擬。手機 `object-fit: contain` 的 letterbox 區域不列入遊戲圖像位置。

## 本次可重現驗證

- `npm run wasm:build`：重新產生 JS/WASM 綁定；產物沿用專案既有忽略規則。
- `npm run test:localization`：資料／真實 renderer mock／編輯器 UI 回歸，包含標題不翻、DEV／正式環境、固定字級與 2 倍揭露。原 ROM 整合測試預設跳過，避免要求其他開發者擁有 ROM。
- 設定環境變數 `CT2_TEST_ROM=1`，執行 `npx vitest run tests/ct2-overlay-runtime.test.ts`：真實 WASM + ROM + renderer 跑 2,400 幀，Start 按鍵進入新遊戲後不按確認。1,520 幀繪出中文，61,869 次來源格遮罩通過世代／fetch 證據，`EB` 後 824 幀保持同一段中文。Canvas 字寬為可重現測試替身，不能取代瀏覽器字型視覺驗收。
- `npm run test:localization:rom`：預設 1,800 幀雙核心對照；每 120 幀比對匯出狀態與完整 framebuffer，並檢查輸入 ROM 不變。
- 設定 `CT2_TEST_PLAY=1` 和 `CT2_TEST_FRAMES=15000` 再執行上一項：實際開球，780 個劇情 glyph 事件、38 個比賽事件、64 個可見劇情片段，所有抽查一致。不是逐幀完整狀態等價證明；匯出 token 的舊十六進位診斷前綴仍只涵蓋部分狀態，不能當成完整可攜存檔。
- 瀏覽器驗證：原 ROM 實際中文字形、844×390 橫向 contain 定位、390px 編輯器無水平溢位。尚無全遊戲／全部手機／完整存讀檔回歸覆蓋。

## NES 存檔與限制

舊 NESW v1 只保存部分 CPU／RAM／PPU，遺漏 mapper、APU、DMA 與時序。CT2 實測舊讀檔後相同 CPU 位址映到錯誤 PRG bank；截斷舊資料也可能造成 WASM panic。正式讀取路徑不再呼叫此解碼器。

目前原生 NES 有兩條明確路徑：

- 快速欄位使用完整硬體深拷貝（CPU、PPU、APU、匯流排、mapper／卡帶、手把、時鐘與 DMC DMA）的**同核心暫存 token**。使用者有 16 個獨立欄位（0–15），覆寫一欄只替換該欄快照；診斷用 `exportSaveState()` 另保留最近 16 次，不再淘汰使用者欄位。這些 token 綁定目前 WASM 實例，返回選單、重建核心或重新整理後不能使用。
- 使用者的「儲存／讀取」按鈕另使用完整硬體快照 `NES-SAVE-1`。快照以版本前綴加 Base64／bincode 封裝，包含 ROM SHA-256、mapper／卡帶、CPU、PPU、APU、匯流排、手把、時鐘與 DMA 狀態；前端優先寫入 `localStorage`，遇到容量或權限錯誤才改用 IndexedDB 備援。讀取會檢查格式、大小、硬體資料範圍與目前 ROM 雜湊，錯誤或不同 ROM 會拒絕且不部分套用。

未知、舊格式、過期或重新載入前的 token 會先拒絕，不修改執行中狀態。讀取成功後清空未播放的未來音訊並更新畫面。原生 NES 匯出檔是文字形式的 `.nes-save` 容器，不是舊 NESW v1，也不是 JSON；可用來手動備份，但仍只能匯入相同 ROM 身分及相容格式。

### 存讀檔回歸修正（2026-09-05）

瀏覽器使用原版 CT2 可重現：儲存欄位 1，再覆寫欄位 0 共 16 次，欄位 1 讀取失敗。原因是 Rust 以「每次匯出」FIFO 淘汰，而前端 WeakMap 以「不同欄位」計數；兩者並不同步。既有 mock 每次 import 都回傳成功，未覆蓋此錯誤。現在前端走 `exportSaveStateForSlot()`，重複快存及診斷匯出不會影響其他欄位。暫停／重置後仍能讀取；ROM 載入中拒絕操作，空核心匯出也不再回報儲存成功。

- `NES-SAVE-1` 會以 `emu_savestate_nes_<ROM名稱>_<slot>` 為 key，主寫入 `localStorage`；若瀏覽器不允許或無法寫入 `localStorage`，才回退到同一 key 的 IndexedDB。因此重新整理、返回選單後重建核心，再載入相同 ROM，仍可讀取使用者存檔。換 ROM、改 ROM 位元組、格式損壞或超過大小限制時會拒絕。
- 舊暫存不會嘗試不安全遷移，也不刪除使用者原有 localStorage 檔案。其他主機的既有保存路徑不變；Snes9x 也沿用其既有的 IndexedDB／localStorage 路徑。
- 文字觀察證據在讀檔時清除；已經顯示的日文需等新來源事件才能重新翻譯，仍是已知限制。
- `node --test tools/nes-temporary-state.test.mjs`：十項回歸，含實際生成 WASM + 前端函式、40 次覆寫／診斷匯出、持久快照跨核心讀取、ROM 不相容拒絕、重置／重載、空核心與載入中 gate，以及其他平台既有格式。
- Rust `temporary_state` 測試：MMC3／DMA 中途恢復、重複讀取、過期／無效／舊格式原子拒絕；原 ROM opt-in `ct2_temporary_state_restores_original_game_exactly` 再對照 600 幀畫面、音訊、mapper 與時序。

縮句稽核 `node tools/ct2-translation-fit.mjs` 以完整行計算固定字級保守預算：1,137 行中仍有 14 行超出「來源字數」預算，多為專名／片尾碎片；實際安全空白可能容納，不能宣稱全分支排版已驗收。自訂草稿不會被新版精簡稿自動覆蓋。

## 數值後續工作：不能猜欄位

`$CD7C` 是球員記錄 resolver，結果為 `$34/$35`；不能與 `$F30F`／`$F329` 的字詞 resolver 混用。已驗證記錄 `+0` 是球員 ID、`+1..2` 是目前體力、`+3` 是零起算等級。其餘 bytes 仍未定義。大空翼初始在 `$036C`，不是 `$0300`。

詳細公式、原始 PRG offsets、上限、正式 read-side tuning 與測試見[能力研究](CT2_PLAYER_STATS_RESEARCH.md)。目前藉由原能力讀取 routine 提供受限等級，不寫入球員／經驗 RAM；未知能力欄位、其他球員和任意 255 編輯仍不開放。

## 下一個驗收里程碑

1. 在已啟用的完整詞彙子集上，補足 RAM 名稱、動態數字及跨列整句組合，驗證其他 FC／分支與寬度分配。
2. 擴充已接入選單的實際路線驗收，尤其其他必殺技、球員與賽事；不能將共用 writer 視為全清單驗收。
3. 找出首批能力欄位及 ROM 初始化表，加入可驗證的數值交換格式。
4. 按完整流程人工校對：術語、人名、獨立假名／片尾字形、每條路徑的排版與讀取節奏。
5. CT2 流程穩定後，再以同一交換／編輯框架接 Zombie Hunter 的專用解碼與 writer。