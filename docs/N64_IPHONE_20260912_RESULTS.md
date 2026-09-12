# iPhone 音訊診斷：2026-09-12

## 目前接受版本：lifecycle1／實機 capture5

本節為最新結論；下方各次「下一步／待實機」均是歷史進度，不代表目前仍未取得手機結果。

- 保留 `7f0ebbf78c-64m2-lifecycle1`。iPhone 17 Pro Max／使用者回報 iOS 26.6.1 的 Zelda capture5：使用者明確表示**沒有雜訊、音質非常滿意**；複雜場景仍有卡頓。接受的是此版本實際聽感，不宣稱完美模擬或所有場景無斷音。
- receiving 段 session=1、context=3、producer=4、generation=3 穩定，failures=0，最大觀察 heartbeat age=971 ms；支持本次有效音訊 route，不能證明所有裝置切換／背景恢復情境皆通過。
- 最後 60 audio 秒（07:06:42.374–07:07:42.530 UTC）：underflow 增加 553,222 / 2,880,000 frames = **19.2091%**，639 events；drop／clear／excluded 差值均為零。缺樣本不等於相同比例完全無聲，也不是爆音次数。累積 longest gap 125.333 ms 在左端已存在，不能當作本區間最大值。
- 配對來源視窗共 60.152 s、35.0446 VI/s、SDL underrun callbacks 410 / 2,586；rectangle scope 合計 30,088 ms。重場景約 19–24 ms/VI 與 29–34 VI/s 同時出現，但末段 rectangle 僅 0.01 ms/VI 仍為 30.36 VI/s、27.89% 缺樣本，不能只歸因 rectangle。
- SDL 零 underrun 視窗仍約 8–8.5% Worklet 缺樣本。44,100 對 48,000 的 8.125% 差距只是待驗證的速率／傳輸／排程假設；須先核對 native obtained spec 與 SDL 內部 conversion，**未加入 metadata、resampling 或速率修正**。舊 A/B 的輸出 latest=null，不能量化前後音訊改善幅度。
- 正式基準維持 320×240、emu1、rAF、triangle stream、SDL **3072/1024**、既有 src-linear；**cull cache 預設 OFF**，rectangle ring OFF。保留 opt-in 候選供研究，不升級預設、不做新優化。
- 桌面 emu2 約 110 秒的 `RuntimeError: null function`（1081 → dynCall_vi 3822）仍未解；本次手機接受不能取代桌面長測或全 ROM 回歸。原始手機匯出、憑證／私鑰、本機 tasks 和臨時連線工具不屬發布資料；本次不推送、不部署、不開 tunnel。

### 提交前發布檢查（2026-09-12）

- 重新執行 8 個 N64 focused 測試檔：48 / 48 通過；獨立 TypeScript noEmit、完整 Rust/Wasm + TypeScript + Vite production build 通過。既有 Rust 與 Vite warnings 保留，未修改非 N64 核心。
- bootstrap 再跑：固定 upstream `7f0ebbf78c16da0d41fe80f0e98f17523d4bf793`，15 patches 全部 already applied／reverse-check 通過。保留已接受的 native rebuild，這次收尾沒有重新編譯 N64 或加入 runtime 優化。
- manifest 版本、64 MiB initial memory、15 個磁碟 patch SHA-256 與 Git 暫存內容 checkout hashes 全相符。[Git attributes](../.gitattributes) 固定 patch checkout 為 CRLF，符合原始 manifest 的位元組雜湊；保留合法 diff 空白 context，未改 patch 內容。
- native source output／artifact／dist 的 JS、CJS 複本、Wasm、data、main、module 一致；versioned bundle／Wasm／data 與 artifact 一致，public／dist Worklet 一致。

| 發布內容 | SHA-256 |
| --- | --- |
| lifecycle1 bundle | `84B22248402A109B13C37C6378409A252E1199773B80B4C479E721F2899B36BC` |
| lifecycle1 Wasm | `D22F990F9224510AB08B39EDFF985F5AFF44A9F5748DC8EDEEFEFAEB1BCB98F9` |
| data（保持原值） | `6D1B8723402AF6731030D5400725E54ABFC509B05FE16418C61D1FD788486FCA` |
| public／dist Worklet | `4F5670948A137BAA3CB2FAF0144DE27B3BD2D05BD1EAC606DCA116693CC9227D` |

- 僅納入可維護的通用 private-LAN 憑證準備／public-CA-only 工具，無憑證或私鑰。機器 tasks、development-only mobile-check、臨時 tunnel origin 腳本不提交。私鑰路徑確實被忽略；暫存檔通過針對私鑰、常見 token、個人路徑、公開 tunnel URL 的掃描及 diff whitespace 檢查。
- production build 的本機輸出仍可能複製未追蹤 public 測試頁；後續發布應由提交內容的乾淨 checkout 重建，不直接上傳這份本機 dist。本次只提交，不推送或部署。

## 歷史量測與實作紀錄

來源：使用者提供的 n64-iphone-audio-diagnostics.json，Super Mario 64 (USA)。
使用者回報 iPhone 17 Pro Max / iOS 26.6.1，音樂卡頓、小爆音。
UA 的 OS token 為 18_7、Safari Version 為 26.6.1；保留使用者提供的系統版本，不以 UA token 覆蓋實機資訊。

## 有效結論

- 安全環境，AudioWorklet receiving，48 kHz；fork、emuMode 1、320×240、triangle stream、SDL 3072/1024，rectangle persistent buffers 未開啟。
- 04:30:25.574 → 04:31:05.777：render timeline 前進 40 秒，steadyFrames 同樣前進 1,920,000，clearEvents 保持 4；underflow 增加 603,012 frames = 12.56275 秒（31.406875%），657 個缺音段；droppedFrames 保持 128，新增丟棄為零。
- 這是來源樣本缺失比例，並非 31.4% 完全無聲；衰減／crossfade 仍可能產生非零輸出。缺音段數也不等於可聽爆音次數。
- 上述區間各視窗約 33.08–51.58 VI/s，rectangle 計時約 11.79–21.08 ms/VI，大部分視窗接近整個 DList 耗時。優先研究 rectangle 範圍內的 CPU/WebGL 呼叫與等待，不是再調 triangle upload。
- 全程最大的 gap 為 440 ms，但在最後 40 秒起點以前已出現，不能標成最後 40 秒的新最長 gap。

## 排除與限制

- 04:29:17 與 04:30:20 的 report elapsed 分別約 37.3/28.0 秒，音訊 render timeline 僅前進 4/1 秒；另有 sequence 17 重複。屬中斷／停滯或回報延遲的混合區間，不能納入連續穩態平均，也不能僅據此確定使用者切了背景。
- audioMaxCallbackGapMs 的 37889 是保留下來的歷史最大值，不是每五秒又缺音 37.9 秒。
- 全程 93 秒 audio render 中累積約 31.934 秒缺樣本；含啟動和恢復，不作正式穩態指標。
- 最後 40 秒是未發生 clear 的觀察區間，不代表已確認固定場景或完成嚴格 60 秒 A/B。Worklet report 最多約一秒加 delivery delay，與 VI 視窗不完全對齊。
- 量測支持持續供料不足，而不是高水位丟棄主導；尚不能單獨區分所有 producer 排程與模擬速度因素。

## 下一個目標

檢查 RenderTexRect / RenderFillRect / DrawSimple2DTexture / DrawSimpleRect 計時範圍，細分 state query/setup、client-array 提交、draw 與 restore，再選單一可回退候選。不重啟已失敗的 rectangle ring 或增大 SDL buffer 實驗。

注意 OGLDebug.h 的 OPENGL_CHECK_ERRORS 只在 OPENGL_DEBUG 定義時才呼叫 glGetError；不能看到巨集就斷言 release 每次 draw 都在 glGetError 阻塞，也不能把 rectangle wall time 直接解讀為 GPU 純執行時間。当前資料不足以宣稱特定 GL 呼叫是根因或承諾提升幅度。

## 本次實作：rectdiag1（診斷，不是效能修正）

- 新版本 `7f0ebbf78c-64m2-rectdiag1`，固定 upstream commit、Emscripten 3.1.25、64 MiB initial memory；bundle / Wasm / data 皆以新實體檔名發布到 production build。
- 已核對實際展開的 Rice `OGLRender.cpp` release 編譯命令：`em++ -O2`、`-DEMSCRIPTEN=1`、`-DUSE_GLES`、`-s FULL_ES3=1`，**無 `-DOPENGL_DEBUG`**。沒有刪除 debug error checks，也沒有更動 cull state tracking。
- 新的 [renderer patch](../tools/n64/patches/mupen64plus-video-rice-web-netplay/0002-rectangle-phase-diagnostics.patch) 插在舊 patch 之外；cache 同步完成，舊／新 patch 皆可 reverse-check，完整 bootstrap 重跑通過。
- 僅 `n64RectDiagnostics=1` 開啟細分時鐘。未開啟時不讀 phase 時鐘、不發布 phase snapshot；仍有 scope/branch 的程式碼負擔，不能宣稱位元組完全相同或零成本。GL 呼叫、參數、順序、狀態還原、triangle stream、rectangle ring 預設與音訊 buffer 均不變。
- 四個 row：`RenderTexRect`、`RenderFillRect`、`DrawSimple2DTexture`、`DrawSimpleRect`。每 row 累積 `totalMs/queryMs/stateMs/attribMs/drawMs/restoreMs/calls/queryCalls`。
- `queryMs`：`glIsEnabled`；`stateMs`：本 translation unit 的 `glEnable/glDisable/glViewport/glScissor`；`attribMs`：attribute pointer 與 enable/disable；`drawMs`：`glDrawArrays`（包含 Emscripten client-array 搬運，不是純 GPU 時間）；`restoreMs`：draw 返回後上述被量測的 GL 呼叫。
- `otherMs` 是 total 減去上述 phase；包含 CPU 準備、未包覆呼叫、其他 translation unit 的工作與 instrumentation overhead。**不是完整 state setup 計時**。`DrawSimple2DTexture` 的 outer scope 也含可能的 `UpdateFrame`／present，不能假設所有時間都是真正的 rectangle 提交。
- 這次只解讀正常 client-array rectangle 路徑。persistent rectangle helper 定義在 wrappers 之前，不在細分範圍；不可開啟已失敗的 `n64PersistentRectBuffers` 實驗來比較此報告。
- C++ 至多約每秒、在 rectangle 結束時複製 32 個數值到 JS。無 rectangle 時不發布，前端以 `ageMs`／`stale` 標示。數值自 runtime 建立累積，五秒 history 不可直接加總，需取相鄰 snapshot 差值；不與 VI/audio snapshot 精確對齊。
- [snapshot decoder](../src/n64/rect-diagnostics.ts) 驗證版本、長度、有限非負數，區分 disabled / waiting-or-unsupported-runtime / receiving / stale；啟動新遊戲清除舊 JS snapshot。
- 既有音訊面板显示分項累積值；匯出 JSON 的每個 history entry 多了 `rectanglePhases`，與 `audioOutput`、`sourceAndRenderer` 並存。需要同時開啟音訊診斷旗標才顯示面板及保留 history。

### 驗證結果與限制

- `npm run n64:source` 與 build 內再一次 bootstrap：所有 patch already applied，通過。
- `npm run n64:build`：通過，含新增 C++ lambda/RAII、EM_ASM 編譯與 bundle。
- 7 個 N64 測試檔、37 tests 通過；涵蓋 opt-in、row decoding、stale/invalid snapshot、history copy、既有 audio / telemetry / profile / asset URL。
- `npm run build`：Rust/Wasm、TypeScript、Vite production 全部通過。既有 Rust／Emscripten warning 仍存在，非 warning-free build。
- data SHA-256 保持 `6D1B8723402AF6731030D5400725E54ABFC509B05FE16418C61D1FD788486FCA`。
- 僅使用既有 loopback production origin 5175 做桌面邏輯 smoke：Super Mario 64 可見 3D attract mode，使用新版本 bundle/data/Wasm，面板與 localStorage JSON 有 receiving、有限 phase 值；TexRect / FillRect / Simple2DTexture 計數非零且 queryCalls 等於 calls。SimpleRect 未被這段場景觸發，不宣稱四路皆已 runtime 覆蓋。
- 移除 rectangle 旗標後完整 reload，再啟動同 ROM：VI report 正常出現，JS phase global 不存在，panel／JSON status 為 disabled、rows 為空；關閉路徑 smoke 通過。相同 texParameter warning 在關閉路徑也出現。
- 瀏覽器有 `texParameter: no texture bound`、ScriptProcessor deprecated warning，以及一次 ROM request aborted（後續遊戲成功啟動）；未把它們當作已修復問題。沒有進行 iPhone 效能、音質或嚴格畫面回歸驗收。
- 公開 tunnel 未重開；確認無 cloudflared process。既有 loopback origin / LAN 服務保留，沒有新公開 URL。

## 第二份實機 JSON：實際差值分析

2026-09-12 續查：直接讀取使用者桌面 OneDrive 的第二份匯出（檔名尾端為「 2.json」），不是重新解讀第一份。ROM 仍為 **Super Mario 64 (USA)**；這是歷史量測，**下一次測試改為 Zelda Ocarina opening**。

- 39 筆 history；第一筆 audio awaiting-runtime，排除音訊差值計算。頂層 latest 與最後一筆 history 完全相同，只算一次。
- 其餘 38 筆 sequence 為 3、8、…、188，逐筆增加 5；renderedFrames 每次增加 240,000，無重複 sequence。clearEvents、droppedFrames、excludedFrames 均為零。rect snapshot age 為 1–999 ms，無 stale；來源視窗與 phase/audio 的採樣時點仍非精確同步。
- 安全環境、AudioWorklet receiving、48 kHz、fork、emuMode 1、320×240、triangle stream、SDL 3072/1024；rectangle ring 關閉。第二份沒有 cullcache1 的版本／cache 回報欄位，不能當成 cache-on 實機結果。

| 區間（UTC） | 音訊 render 差值 | underflow 差值 | 缺樣本比例 | 新缺音段 | clear / drop 差值 |
|---|---:|---:|---:|---:|---:|
| 05:16:25.582 → 05:19:31.104 | 8,880,000 frames / 185 s | 2,291,025 frames / 47.7296875 s | 25.799831% | 2,746 | 0 / 0 |
| 05:18:30.915 → 05:19:31.104 | 2,880,000 frames / 60 s | 540,683 frames / 11.2642292 s | 18.773715% | 840 | 0 / 0 |

對應 wall time 為 185.522 / 60.189 s。steadyFrames 差值等於 renderedFrames 差值。全段配對來源視窗 VI/s 範圍 33.95–60.16、以 VI 總數／elapsed 總和計 47.56；最後一分鐘為 39.78–60.00、加權 52.77。不是把累積 audio 值或 VI/s 做錯誤加總。

05:17:50.828 → 05:18:25.891 的 35 audio 秒只有 8.220714% 缺樣本，來源接近 60 VI/s（58.69–60.16）。這個明顯的工作量變化說明全段不是固定場景基準。**25.80%、18.77% 與第一份的 31.41% 不能直接作為修正改善幅度。**

### Rectangle phase 差值（不是累積快照加總）

| 區間／method | calls = queryCalls | total ms | query ms | query ms/call |
|---|---:|---:|---:|---:|
| 185 s / RenderTexRect | 24,235 | 72,252 | 72,142 | 2.977 |
| 185 s / RenderFillRect | 9,676 | 33,496 | 33,437 | 3.456 |
| 最後 60 s / RenderTexRect | 12,520 | 29,954 | 29,893 | 2.388 |
| 最後 60 s / RenderFillRect | 4,014 | 1,807 | 1,782 | 0.444 |

- 全段 query 105,579 / total 105,748 ms = **99.8402%**；最後一分鐘 31,675 / 31,761 ms = **99.7292%**。
- 最後一分鐘其他 phase 合計：state 15、attrib 6、draw 51、restore 5、other 9 ms。浮點尾差已四捨五入；毫秒級 Safari 時鐘不適合據此宣稱微秒精度。
- DrawSimple2DTexture / DrawSimpleRect 全段 calls 為零，沒有這兩路的實機覆蓋。
- 此 query wrapper 對應 `glIsEnabled(GL_CULL_FACE)`。資料支持以消除重複 query 作為單一候選；**不證明瀏覽器內部等待機制、不是 glGetError 根因證據，也不保證移除 query 後等待不會移到下一個 GL 呼叫。**
- 全程末端 longestGapFrames = 12,160（253.333 ms），最後一分鐘差值為零：是歷史最大值，不是最後一分鐘新發生的最大 gap；缺音段數不等於可聽爆音數。

## cullcache1 候選審查

保留既有 [cache patch](../tools/n64/patches/mupen64plus-video-rice-web-netplay/0003-opt-in-cull-state-cache.patch)，未擴張成其他 rendering／audio 優化。

### 狀態正確性與範圍

- C++ semantic call hierarchy 已確認 `OGLRender::SetCullMode` → `CRender::SetCullMode`，以及本次 v2 source 的 `Initialize`、`ResizeInitialize` → `InitState`。工具同時回傳其他 cache 版本，審查只採 v2。
- `GL_CULL_FACE` semantic references 錯誤落到測試 stub，沒有完整索引到 GL SDK 的 macro，因此**不能宣稱 semantic references 已證明全部寫入點**；另以 pinned Rice 全 src 的 capability／attribute-stack 清查和實際函式閱讀補足。
- 共 **15 個 enable/disable 呼叫點**：InitState disable 1；SetCullMode enable 3 / disable 1；四個 rectangle 方法各 disable / conditional restore 2（合計 8）；DrawSpriteR_Render disable / restore 2。全數在 tracked wrappers 作用範圍內。沒有 Rice glPushAttrib/glPopAttrib 隱式還原路徑。
- OGLRender 的 macro 在 diagnostics wrappers 之後、SetCullMode 之前；上方 persistent buffer helpers 不寫 cull state。header 在 macros 之前定義，helper 內是真 GL 呼叫，不會遞迴。
- shared state 為具 external linkage inline function 的 local static；跨 translation unit 共用。unknown 首次回退到真 query；初始化與 resize 的 InitState 真 disable 重新 seed false。
- 四個 rectangle 方法讀 cache，照舊 disable，再按舊值 restore。sprite 保留真 query，但 enable/disable 也更新同一 cache，所以不會使後續 rectangle cache 過期。`glCullFace` 的 front/back 模式不被 cache、更不被省略；所有 enable/disable 真寫入（含重複寫入）仍保留。
- 假設單一 active Rice context、沒有外部直接改同一 context。未驗收 WebGL context loss 自動恢復；發生 context loss 的 capture 作廢並完整 reload，不把本候選宣稱為通用多 context state manager。

### Opt-in 與本次收尾修正

- 僅 fork 且 query **`n64CullStateCache=1`** 明確開啟；缺省、0、true、npm runtime 均不開。旗標由 C++ 首次讀取後固定，A/B 必須完整 reload。
- 不依賴 `n64Benchmark` 或 `n64RectDiagnostics`。關閉時每次仍真 query；wrapper 仍維護 shadow state，因此不宣稱零 overhead 或 binary-identical。正常 emuMode、解析度、triangle stream、rect ring、buffer 預設不变。
- JSON 已包含 `rebuiltAssetVersion`、config `cullStateCache`、`runtimeCullStateCache`（尚未首次 query 可為 null）；新遊戲清除舊 JS marker。
- [build script](../tools/n64/build-mupen.ps1) 的版本與全部 13 個 patch SHA-256 保留；本次把 manifest 寫入移至 esbuild 成功後，避免 bundle 失敗時寫出新成功標記。
- [Vite config](../vite.config.ts) 新增 manifest assetVersion 必須等於前端版本的檢查，防止舊 runtime 被改名成 cullcache1 發布。
- [native harness](../tools/n64/tests/cull-cache/main.cpp) 加強重新初始化測試：明確 seed true，再驗證另一 translation unit 初始化把 shared cache 重設 false。

### 本次實際驗證

- 容器設定先確認 CLI 為 docker；未更換 toolchain。
- native g++ C++11、`EMSCRIPTEN=1` stub，使用真正 patched RiceCullCache header，兩個 translation units；cache off/on 都通過。涵蓋 unknown fallback、跨檔案初始化、enabled/disabled save-restore、sprite 真 query、重新初始化、非 cull capability 真 query、重複 GL 寫入不省略。
- 加強後的最終 native 結果：off **12 queries / 13 writes**；on **4 queries / 13 writes**。這是 deterministic mock GL 的呼叫數，不是 iPhone 效能數據。
- `npm run n64:build` 通過（既有 native objects 增量重用、重新 link/bundle，不冒稱 clean rebuild）。build 內 bootstrap 的 reverse checks 通過。版本 **7f0ebbf78c-64m2-cullcache1**；manifest builtAt 2026-09-12T05:48:18Z（秒級顯示），13 個 patch hash 與磁碟一致。
- 七個 N64 Vitest 檔 **38 tests 全通過**，包括 performance、benchmark、telemetry、rect diagnostics、audio diagnostics、worklet、runtime assets。
- `npm run build` 通過 Rust/Wasm、TypeScript、Vite production。仍有既有 Rust/Emscripten warning 與 Vite runtime URL warning，不是 warning-free。
- production `/n64-fork/` 的 versioned bundle、Wasm、data 與 artifacts 逐一 SHA-256 相符。data SHA-256 仍為 `6D1B8723402AF6731030D5400725E54ABFC509B05FE16418C61D1FD788486FCA`。
- **以上是可測試候選，不是 iPhone 效能／音質改善驗收。** 先前 rectdiag1 的桌面 Mario smoke 不算本候選 Zelda 視覺回歸。未重開 tunnel、未安裝憑證、無 cloudflared process；保留其他 dirty edits 與現有服務。

## 下一次手機 A/B：只用 Zelda Ocarina opening

1. 同一台 iPhone、同一個 **The Legend of Zelda: Ocarina of Time 開場** ROM／region／起始狀態；不是 Mario，不從各自任意的 attract loop 時點開始。固定開場流程與操作，記錄畫面起點。
2. 兩組都用 cullcache1 binary：A 為 `?n64Runtime=fork&n64AudioDiagnostics=1&n64CullStateCache=0`；B 只把 cache 值改成 1。兩組皆**不加 n64RectDiagnostics**，避免細分 instrumentation 干擾正式比較；不用 benchmark/mobile preset。
3. 每組完整 reload、相同暖機 30 秒與開場起點，保持前景連續 60 秒；320×240、emuMode 1、triangle-only、SDL 3072/1024 不變，不旋轉、不暫停、不開 rectangle ring。面板保持收合。
4. 確认 receiving／版本與 runtime cache marker 分別 false、true；各匯出一次，附音樂／爆音聽感及畫面是否缺面。比較無 clear／長中斷的 underflowFrames delta / renderedFrames delta、drop delta、來源 VI/s 與長 VI，不能拿累積總值直接相比。最好交錯 A/B 次序再重複，以減少場景與熱狀態偏差。
5. 此次工作**不重開 tunnel、不重裝憑證**。未來手機聯調只使用已可用可信 HTTPS，連線安排另行確認；沒有可用連線就保持「待實機驗證」，不以桌面結果替代。

## Zelda cullcache1 實機 A/B 結果（2026-09-12，已完成）

- 使用者回傳桌面上的 `n64-iphone-audio-diagnostics A.json` / `n64-iphone-audio-diagnostics B.json`；完整 JSON 已解析，history 各 22 / 23 筆，latest 是末筆的重複，不重複計算。
- 同一 iPhone 17 Pro Max、使用者回報 iOS 26.6.1；Safari Version/26.6.1，UA 的 CPU OS 18_7 不覆蓋使用者資訊。
- 兩組同一 Zelda ROM 名稱、cullcache1 binary、emu1、320×240、rAF、triangle stream、3072/1024；rectangle 細分計時 disabled。所有 history 的 config/runtime cache marker 都符合 A=false、B=true。
- 使用者聽感：兩組都有一點延遲，B 稍微不順；兩組都有嚴重雜訊、明顯電流聲與氣泡聲；均未見畫面問題。**本輪未通過音質／流暢度驗收，cache 不升為預設。**
- 收件後已終止本輪 cloudflared tunnel；開發期間不繼續公開服務。

### 可比較的來源／renderer 數據

採兩組第 7–18 筆（捨棄最初約 30 秒來源視窗），均約 60 秒。這是相同相對時間位置，並非遊戲畫面逐幀對齊，也不是精確以音樂開始計時；不可宣稱控制了熱狀態、背景與所有場景差異。

| 指標 | A 關閉 | B 開啟 |
| --- | ---: | ---: |
| 視窗涵蓋 UTC（不含左端） | 05:56:59.099–05:57:59.392 | 06:00:03.464–06:01:03.698 |
| 來源 elapsed 合計 | 60.288 s | 60.230 s |
| VI/s（總 VI / 總 elapsed） | 33.56 | 32.01 |
| SDL 缺資料 callback / callback 總數 | 556 / 2593 | 656 / 2589 |
| 其中 partial / empty | 196 / 360 | 197 / 459 |
| Rectangle scope wall time 合計 | 41,382 ms | 71 ms |
| Rectangle calls | 54,330 | 54,162 |
| VI scope 加權平均 | 25.86 ms | 6.15 ms |

`sourceAndRenderer` 的 SDL counters 由 telemetry.ts 對 native 累積值取差並在 report 後重設視窗，因此這些來源視窗可相加；不能套用到 Worklet 累積報告。缺資料 callback 次數不是爆音次數，更不是缺音時間比例。scope wall time 不是純 GPU 時間，VI scope 不包含整個事件迴圈的時間。

敏感度檢查，各自最後 12 筆：A 60.329 s / 35.07 VI/s / 440 缺資料 callbacks；B 60.181 s / 34.66 VI/s / 463。結論仍是沒有看到端到端改善，但兩段不代表完全相同的場景。

### 音訊輸出量測失效與下一步

- **A 全部 22 筆、B 全部 23 筆都為 awaiting-render-report / latest=null**。無法算輸出缺音百分比、queue/drop、最長輸出 gap 或實際聲音延遲；null 絕不是零。
- 匯出的 audio-worklet mode 只根據 Module port 是否存在，不能證明該 Worklet 仍連在當前播放的 AudioContext 上。此次沒有 receiving 的端到端確認，後續先修正健康檢查，不要求使用者重跑相同盲測。
- 原始與 dist 的 n64-audio-worklet.js SHA-256 相同，排除本地這兩份檔案不一致；不據此宣稱已排除所有瀏覽器快取或生命週期問題。
- 已確認程式風險：SDL `sdl_init_audio_device` 可以 CloseAudio 再 OpenAudio；本次 generated JS 的 SDL close 在無 capture 時會 close 並清除 AudioContext。configureAudioWorklet 卻僅以既有 Module.n64AudioWorkletNode 判定完成，不核對 node.context 與當前 SDL context，也不核對 scriptProcessorNode identity。這條重新開裝置路徑可能留下舊 port/closed-context Worklet，且新的 ScriptProcessor 不會重新接到 silent gain。
- **尚無本次 iPhone context identity／processorerror 記錄，不能把上述風險當成已證實的雜訊根因。** 下一步應以音訊裝置重建的 deterministic regression 驗證、context/node identity、worklet ack/heartbeat 與 processorerror 量測定位，並查來源排程為何 VI scope 大降而 VI/s 未提升；不是再調大 buffer 或直接打開 cache。
- 不採用「port.start 拋例外導致仍設定 awaiting」的推論：目前程式在 start/postMessage 之後才設定 status，未捕捉例外會中斷該路徑。沒有實機證據支持 Safari port.start 是根因。

## lifecycle1：SDL AudioWorklet 生命週期修正（桌面驗證）

- 新增 UI-console `0004-web-audio-lifecycle.patch` 與 SDL `0002-web-audio-device-lifecycle.patch`；舊 patch 不改。獨立 EM_ASM header 在原 bridge 安裝完成後覆寫 controls。SDL CloseAudio 前 invalidation、OpenAudio 成功後以保存 URL 自動重建，不靠手勢或輪詢等裝置。
- 同時驗證 AudioContext 與 ScriptProcessor identity；generation 阻擋舊 addModule completion／stop 後復活。移除舊 listener、timer、node、gain、port；失敗恢復捕獲到的 SDL producer 到 destination，不接錯新裝置。
- 新 Worklet 在首次 `process` heartbeat 前不接收 SDL PCM、也不靜音 ScriptProcessor。首次 render ack 才切換；每秒 audio-render heartbeat，不依賴 diagnostics 開關。running context 五秒無 heartbeat／載入未完成則 fallback；suspended 時不計 watchdog。processorerror 立即 fallback；**同一裝置不自動重試，下一次 SDL 裝置 identity 才恢復**，避免永久錯誤重試迴圈。事件迴圈阻塞可能延後 watchdog 執行，並非硬即時保證。
- getter 的 port/mode 只反映目前 identity 上已接線的 route；另匯出 contextState、sampleRate、contextId、scriptProcessorId、generation、routeState、acknowledged、heartbeatAgeMs、lastError、failures。`audio-worklet` 是接線模式，不單獨代表聲音健康；需同看 context、heartbeat、report 狀態。
- main 原本只在 configure Promise 完成後 attach；新增既有五秒 telemetry cadence 再讀 bridge／自動換 port，沒有新 interval。更換 port 清空舊 latest／sequence，增加 `session`；不同 session 不可做累積 counter 差值。五秒沒新 report 顯示 timeout/stale，不再永遠 awaiting。歷史 latest 保留時必須同看 status／age。context 暫停不標成正在 receiving。
- 版本 `7f0ebbf78c-64m2-lifecycle1`；bundle/Wasm/data 實體版本與 Worklet URL query 同步換版。音訊 buffers、resampler、cull cache 預設 OFF、renderer 均未更改。

### 已驗證／限制

- 8 個 focused N64 Vitest 檔，48 tests 通過；bridge tests 直接從 native patch 擷取執行，不是重寫另一套 bridge。涵蓋首份 report 前 context 重建、同 context 新 producer、延遲 addModule replacement/stop、processorerror、接線失敗 rollback、載入失敗、saved URL、自動開裝置、ack/heartbeat timeout、suspend、sample rate／counter session reset；真正 Worklet 程式的 render heartbeat 與累積 reports 也有測試。
- TypeScript noEmit 通過。bootstrap 首次套用後重跑與 build 內 reverse-check 全部通過（15 patches）。新增 patch 首次套用有 CRLF whitespace warning，沒有阻擋 apply／rebuild。
- pinned Emscripten 3.1.25 增量 N64 rebuild（不是 clean rebuild）及完整 Rust/Wasm + TypeScript + Vite production build 通過。既有編譯與 runtime warnings 仍存在，非 warning-free。
- 本機既有 loopback production origin 5175：真正 rebuilt Zelda 可見 3D 開場，`lifecycle1` bundle/data/Wasm 載入，cull=false、rectangle diagnostics disabled。匯出 receiving、running/live、render ack=true、context/producer=3/4、generation=3、failures=0，48000 Hz report sequence 持續前進。這是 Windows Chromium/Electron 桌面功能 smoke，**不是 iPhone 音質或效能驗收**。
- 桌面仍見 ScriptProcessor deprecated、WebGL texParameter warning，以及啟動時一次 ROM request aborted（後續成功）。沒有把這些當作已修復。
- **桌面長時間 smoke 另有未解問題**：首次 Zelda emu2 啟動約 110 秒後（06:45:45 UTC）出現 `RuntimeError: null function`，stack 為 Wasm function 1081 → 3822（export `dynCall_vi`）→ Browser main loop。沒有足夠證據歸因音訊 bridge，也沒有證明是既有問題；未修改 core／renderer 來掩蓋。前述 receiving／3D 僅是啟動與有限時間功能證據，不能宣稱長時間穩定通過。此例外須另行定位。
- 最終 production bundle/Wasm/data 與 rebuild artifact SHA-256 逐一相同，processor public/dist 相同，15 個 manifest patch hashes 全相符。data 保持 `6D1B8723402AF6731030D5400725E54ABFC509B05FE16418C61D1FD788486FCA`。
- 公開 tunnel 保持關閉，未安裝憑證；保留既有 dirty work 與服務。尚缺真正 iPhone Zelda 前景／背景／裝置重建與聽感證據；嚴重電流／氣泡聲根因仍未證實，不能宣稱已解決。下一份手機資料先確認本版 identity、heartbeat 與 receiving，再分析同 session 累積差值；不再要求重跑無輸出報告的盲 A/B。