# N64 iPhone 音訊：接受版本、診斷與實機量測

> 現況：保留 `7f0ebbf78c-64m2-lifecycle1`。iPhone 17 Pro Max（使用者回報 iOS 26.6.1）的 Zelda capture5 經使用者確認**沒有雜訊、音質非常滿意**，但複雜場景仍會卡頓。
> 接受的是這個版本的實際聽感，並不代表模擬已完美，也不代表所有場景都不會斷音。

## 目前接受版本（lifecycle1／capture5）

### 正式基準設定

| 項目 | 設定 |
| --- | --- |
| Runtime 版本 | `7f0ebbf78c-64m2-lifecycle1`（fork；upstream `7f0ebbf78c16da0d41fe80f0e98f17523d4bf793`；Emscripten 3.1.25；64 MiB initial memory） |
| 解析度／CPU | 320×240、emuMode 1（cached interpreter）、rAF |
| Renderer | triangle stream；rectangle ring 關閉 |
| SDL buffer | 3072/1024，既有 `src-linear` resampler |
| cull cache | **預設 OFF**（`n64CullStateCache=1` 只供研究用） |
| Worklet | 1024 frames priming、6144 frames high-water；缺音時衰減，恢復時做 64-frame crossfade |

以 48 kHz 換算，1024 frames 約 21.3 ms，6144 frames 約 128 ms；在 44.1 kHz 下分別約 23.2 ms 與 139.3 ms。這只是 Worklet frame 數的換算，不是總輸出延遲。

opt-in 候選仍保留供研究，但不升為預設，也不再進行新的優化。

### capture5 的關鍵數據

- receiving 區段的 session=1、context=3、producer=4、generation=3 都保持穩定，failures=0，觀察到的 heartbeat age 最大為 971 ms。這只能證明本次音訊路由有效，不能證明所有裝置切換或背景恢復情境都會通過。
- 最後 60 audio 秒（07:06:42.374–07:07:42.530 UTC）的 underflow 增加 553,222 / 2,880,000 frames，即 **19.2091%**，共 639 個事件；drop、clear、excluded 的差值都是零。
- 缺樣本比例不代表有相同比例的時間完全無聲，也不是爆音次數。累積 longest gap 125.333 ms 在這段區間開始前就已出現，不能當成本區間的最大值。
- 對應來源視窗總長 60.152 s，平均 35.0446 VI/s；SDL underrun callbacks 為 410 / 2,586；rectangle scope 合計 30,088 ms。
- 重場景時約 19–24 ms/VI 與 29–34 VI/s 會同時出現。不過末段 rectangle 只有 0.01 ms/VI，仍然只有 30.36 VI/s，缺樣本達 27.89%，所以不能把問題只歸因於 rectangle。

### lifecycle1 修正內容

- 新增 UI-console 的 `0004-web-audio-lifecycle.patch` 與 SDL 的 `0002-web-audio-device-lifecycle.patch`，舊 patch 不變。SDL CloseAudio 前先讓舊路由失效；OpenAudio 成功後，用已保存的 URL 自動重建 Worklet，不需要使用者手勢，也不靠輪詢。
- 同時檢查 AudioContext 與 ScriptProcessor 的 identity。`generation` 用來阻擋舊的 addModule completion，也避免已 stop 的路由重新啟用。舊的 listener、timer、node、gain、port 都會移除。如果接線失敗，會把原 SDL producer 接回 destination。
- 新 Worklet 送出第一個 `process` heartbeat 之前，不接收 SDL PCM，也不把 ScriptProcessor 靜音；收到第一個 render ack 後才切換路由。之後每秒送一次 audio-render heartbeat，這個機制不受 diagnostics 開關影響。
- context 處於 running 時，如果五秒沒有 heartbeat 或載入仍未完成，就回退到 ScriptProcessor；suspended 期間不計入 watchdog。發生 `processorerror` 時會立即回退。同一個裝置**不會自動重試**，直到 SDL 出現新的裝置 identity 才恢復。事件迴圈阻塞可能延後 watchdog，因此這不是硬即時保證。
- Worklet URL query 與 bundle、Wasm、data 的實體檔名都已換版。音訊 buffer、resampler、cull cache 預設與 renderer 都沒有修改。

## 已知限制與下一步

- **速率差異只是假設**：即使 SDL 零 underrun 的視窗，Worklet 仍有約 8–8.5% 缺樣本。44,100 對 48,000 的 8.125% 差距只是一個待驗證的速率、傳輸或排程假設。應先核對 native obtained spec 與 SDL 內部 conversion；目前**沒有加入 metadata、resampling 或速率修正**。
- **前後改善幅度無法量化**：舊 A/B 的輸出 latest=null，所以無法量化 lifecycle1 前後的音訊改善幅度。
- **雜訊根因未確認**：先前的嚴重電流聲與氣泡聲沒有找到已證實的根因。capture5 的接受依據是聽感回饋，不是根因證明。
- **桌面 emu2 長測錯誤未解**：桌面 Zelda emu2 約 110 秒後（06:45:45 UTC）出現 `RuntimeError: null function`，stack 為 Wasm function 1081 → 3822（export `dynCall_vi`）→ Browser main loop。目前沒有證據指向音訊 bridge，也無法證明這是既有問題。手機接受不能取代桌面長測或全 ROM 回歸。
- **既有警告仍在**：桌面仍有 ScriptProcessor deprecated、WebGL `texParameter: no texture bound` 警告，以及啟動時一次 ROM request aborted（後續可成功啟動）。這些都沒有修正。
- **尚未驗收的情境**：WebGL context loss 自動恢復尚未驗收。如果 capture 期間發生 context loss，該筆資料作廢，並完整 reload。
- **不屬於發布資料的項目**：原始手機匯出、憑證與私鑰、本機 tasks、臨時連線工具。沒有新的測試安排前，不要重做 CA 設定或開啟公開 tunnel。
- **發布方式**：本機 production build 可能會複製未追蹤的 public 測試頁。發布時應從已提交內容的乾淨 checkout 重建，不要直接上傳本機 dist。

## 診斷工具使用方式

### 啟用與相關 query

| Query | 作用 |
| --- | --- |
| `n64AudioDiagnostics=1` | 啟用輸出端診斷面板與匯出。這個參數與 `n64Benchmark` 無關，不改 renderer、buffer、timing、resampler、fade 或播放預設；單獨使用時也不會啟動 benchmark。 |
| `n64RectDiagnostics=1` | 啟用 rectangle phase 細分計時（rectdiag1 起）。需同時開啟音訊診斷才會顯示面板並保留 history；正式 A/B 不要加。 |
| `n64CullStateCache=1` | 只有在 fork 中明確開啟 cull state cache；缺省、`0`、`true` 或 npm runtime 都不會開啟。旗標在 C++ 首次讀取後固定，做 A/B 時必須完整 reload。 |
| `n64Runtime=fork` | 明確指定 fork runtime。 |

- 若要使用既有 benchmark UI 或匯出，也要在 benchmark 網址加上 `n64AudioDiagnostics=1`。
- `n64Benchmark=1` 不會自動保留手機正常使用的 triangle streaming；要比較目前預設，必須明確設定 `n64PersistentBuffers=1` 並確認使用 fork。`n64Timing` 也只有啟用 benchmark 時才會解析。
- 手機必須使用可信的 HTTPS。區網 HTTP 可能無法啟用 Worklet，會量到不同的輸出路徑。
- 實作位置：[Worklet](../public/n64-audio-worklet.js)、[rect snapshot decoder](../src/n64/rect-diagnostics.ts)，以及 fork patch [0003-web-audio-output-diagnostics.patch](../tools/n64/patches/mupen64plus-ui-console-web-netplay/0003-web-audio-output-diagnostics.patch)（read-only controls getter）。

### 接收與匯出

- 必須先明確訂閱 diagnostic，processor 才會送出累積 snapshot，頻率最多每一秒 rendered audio 一次。sample rate 取自 Worklet global，不是應用程式另一個 AudioContext 的 rate。
- 週期性診斷會輸出 `[N64 audio output]` log，並把目前資料存到 localStorage key `n64AudioOutputDiagnostics`。benchmark 結束時，`audioOutput` 會寫入 `n64BenchmarkResult`、mobile result storage 與既有 benchmark POST。
- 面板會顯示 secure context、實際輸出模式、receiver 是否可用、sample rate，以及累積 gap 總長和最大值。匯出最多包含最近 200 筆五秒 report。每筆 history 都有 `audioOutput`、`sourceAndRenderer`，啟用 rect 診斷時另有 `rectanglePhases`。匯出內容包含 user agent、ROM 檔名與 timing，分享前請先檢查。
- 匯出中還有 `rebuiltAssetVersion`、config `cullStateCache`，以及 `runtimeCullStateCache`（首次 query 前可能是 null）。
- `bridge` 會匯出 contextState、sampleRate、contextId、scriptProcessorId、generation、routeState、acknowledged、heartbeatAgeMs、lastError、failures。`mode` 或 `audio-worklet` 只代表接線模式，不代表聲音健康，必須同時檢查 `status`、context 與 heartbeat。
- status 分為 disabled、awaiting runtime/report、receiving、unsupported runtime（需要重建）、ScriptProcessor fallback 時無法取得 counters、`render-report-timeout`（五秒內沒有 report）、`render-report-stale`（report 過舊）、`context-not-running`（suspended 時不標為健康）。未知值記為 null，**null 不是零**。
- bridge 會在既有五秒 telemetry cadence 中刷新，沒有另外新增 interval。更換 port 時會清空舊的 latest 與 sequence，並遞增 `session`；只能在同一個 session/generation 內計算累積差值。
- App 的 pause、background、mute 意圖會透過 `diagnostics-state` 傳入。它只會排除計數並結束 gap，不會靜音 N64、清空 PCM 或改變路由。

### 讀數規則

- 統計範圍是**從診斷 attach 開始**，包含 benchmark 暖機，不是 benchmark 的穩態取樣區間。
- Snapshot 是累積值，**不能相加**；應取相鄰 snapshot 的差值。longest gap 與 queue min/max 是整個生命週期的極值，不能拿來算區間差值。
- 最後一筆 snapshot 可能落後最多一秒 audio，再加上主執行緒傳遞延遲；系統不會強制 flush。
- `sourceAndRenderer` 的 SDL counters 是由 telemetry.ts 對 native 累積值取差，並在每次 report 後重設視窗，因此各來源視窗**可以相加**。這不適用於 Worklet 累積報告。
- 計時器與 report 傳遞都可能被主執行緒阻塞延後，不是硬即時保證，也不是實測的喇叭延遲。

### Counter 語意

| Counter | 意義 |
| --- | --- |
| `renderedFrames` | 輸出端 render 進度；context suspended 時不前進。 |
| `steadyFrames` | 正常 1024-frame priming 完成後才開始計算。 |
| `underflowFrames`／events | 缺少來源樣本的 frames；即使衰減後仍輸出非零 PCM 也會計入。連續的缺音段只算一次事件，最長長度會跨 report 保留。有效前段會先結束上一段 gap，之後才開始新的缺音尾段。 |
| `pausedFrames`／`mutedFrames`／`primingFrames` | 被排除的 frames（pause 優先於 mute）。初次 priming 與 clear 後重新 priming 都會排除。 |
| `clearEvents` | 包含 paused/muted 狀態訊息造成的 clear。clear 會結束 gap，但不會重設累積值。 |
| `dropEvents`／drop frames | 達 high-water 時，每移除一個最舊 chunk 計一次；部分已消耗的 chunk 只計剩餘 frames。priming 前的 drop 與刻意 clear 不計入。**不是可聽 click 次數。** |
| queue min/max | 在樣本進入時（high-water trim 之後）與 render 消耗邊界觀察到的穩態 queue。不推估平均值或延遲。穩態 queue 空時為零；沒有穩態觀察時為 null。 |

### Rectangle phase 欄位（rectdiag1）

- 細分範圍包含四個方法：`RenderTexRect`、`RenderFillRect`、`DrawSimple2DTexture`、`DrawSimpleRect`。每個方法累積 `totalMs/queryMs/stateMs/attribMs/drawMs/restoreMs/calls/queryCalls`。
- `queryMs` 計 `glIsEnabled`。`stateMs` 計本 translation unit 的 `glEnable/glDisable/glViewport/glScissor`。`attribMs` 計 attribute pointer 與 enable/disable。`drawMs` 計 `glDrawArrays`，包含 Emscripten client-array 搬運，不是純 GPU 時間。`restoreMs` 計 draw 返回後上述 GL 呼叫的還原。
- `otherMs` 是 total 減去各 phase 的剩餘值，包含 CPU 準備、未包覆的呼叫、其他 translation unit 和 instrumentation overhead，不是完整的 state setup 時間。`DrawSimple2DTexture` 也可能包含 `UpdateFrame`／present。
- C++ 最多約每秒一次，在 rectangle 結束時把 32 個數值複製到 JS；沒有 rectangle 時不發布，前端以 `ageMs`／`stale` 標示。這些數值從 runtime 建立起累積，必須取相鄰差值，而且時間點不會與 VI/audio snapshot 精確對齊。
- 未開啟時不讀 phase 時鐘，但 scope/branch 程式仍有開銷，不能宣稱零成本。persistent rectangle helper 不在細分範圍內。比較時不可開啟已失敗的 `n64PersistentRectBuffers`。
- 已核對 release 編譯命令：`em++ -O2`、`-DEMSCRIPTEN=1`、`-DUSE_GLES`、`-s FULL_ES3=1`，**沒有 `-DOPENGL_DEBUG`**。`OPENGL_CHECK_ERRORS` 只有在 `OPENGL_DEBUG` 下才會呼叫 `glGetError`。

## 驗收規格

- 記錄實體機型、iOS 版本、Safari 或 PWA 模式、build/artifact、ROM 與區域版本、sampleRate，以及 Worklet 是否真的在 receiving。UA 只用來選 profile，不能證明是實機；如果 UA token 與使用者回報不同，以使用者回報為準。
- Windows、桌面 UA 模擬、CPU throttling、Playwright WebKit 或 iOS Simulator 都不能用來驗收 iPhone 效能。
- 在同一台機器、同一場景做 A/B，至少三輪並交錯順序。固定低耗電模式、充電狀態、音訊輸出路由、背景工作與起始熱狀態；優先使用內建喇叭，Bluetooth 結果另列。
- Super Mario 64、Mario Kart 64、Ocarina of Time 都要有可重現的操作路徑。每輪暖機 30 秒、穩態 60 秒；候選方案再做至少 15 分鐘連續遊玩，觀察熱降頻。不同區域的 ROM 不能一律用 60 VI/s 判斷。
- 每組都要完整 reload，保持前景，不旋轉、不暫停、面板收合。正式比較不要加 `n64RectDiagnostics`，也不要使用 benchmark 或 mobile preset。只比較沒有 clear 或長時間中斷區段的 `underflowFrames` delta / `renderedFrames` delta、drop delta、來源 VI/s 與長 VI，不能直接比較累積總值。
- 主要指標：穩態 Worklet 缺音總毫秒、最長連續缺音、drop frames，以及實際可聽到的爆音或斷音。SDL underrun 與 VI/renderer 資料只用來歸因，不能取代音訊驗收。
- 使用外部錄音或可校驗的輸出擷取，並排除錄音鏈本身的 clipping。手機螢幕錄影會增加負載，錄影與非錄影量測要分開。
- 嚴格的「音樂不中斷」門檻：穩態、非刻意暫停區段的 underflow/drop 為零，沒有可聽斷裂或音高、速度異常，且長測沒有回歸。即使通過，也只適用於該機型、版本、遊戲、場景與時長。
- 另外測試切到背景再返回、鎖屏後恢復、暫停／繼續與切換遊戲。背景不保證會持續播放；重點是回到前景後能正確恢復，且不會播放舊 queue。

## 實機量測摘要

### rectdiag1：Super Mario 64 第二份匯出

共 39 筆 history；第一筆是 awaiting-runtime，已排除。sequence 每次加 5，clear、drop、excluded 都是零。設定為 emu1、320×240、triangle stream、SDL 3072/1024，rectangle ring 關閉，且沒有 cullcache1 欄位。

| 區間（UTC） | 音訊 render 差值 | underflow 差值 | 缺樣本比例 | 新缺音段 |
|---|---:|---:|---:|---:|
| 05:16:25.582 → 05:19:31.104 | 8,880,000 frames / 185 s | 2,291,025 frames / 47.7296875 s | 25.799831% | 2,746 |
| 05:18:30.915 → 05:19:31.104 | 2,880,000 frames / 60 s | 540,683 frames / 11.2642292 s | 18.773715% | 840 |

- 全段加權 47.56 VI/s（範圍 33.95–60.16）；最後一分鐘加權 52.77 VI/s（範圍 39.78–60.00）。05:17:50.828 → 05:18:25.891 這段接近 60 VI/s，缺樣本只有 8.220714%。可見場景負載差異很大，所以 25.80%、18.77% 與第一份的 31.41% 不能直接當作改善幅度。

| 區間／method | calls = queryCalls | total ms | query ms | query ms/call |
|---|---:|---:|---:|---:|
| 185 s / RenderTexRect | 24,235 | 72,252 | 72,142 | 2.977 |
| 185 s / RenderFillRect | 9,676 | 33,496 | 33,437 | 3.456 |
| 最後 60 s / RenderTexRect | 12,520 | 29,954 | 29,893 | 2.388 |
| 最後 60 s / RenderFillRect | 4,014 | 1,807 | 1,782 | 0.444 |

- query 時間占 total 的比例：全段為 **99.8402%**，最後一分鐘為 **99.7292%**。最後一分鐘其他 phase 為 state 15、attrib 6、draw 51、restore 5、other 9 ms。`DrawSimple2DTexture` 與 `DrawSimpleRect` 的 calls 都是零，沒有實機覆蓋。
- query 對應的是 `glIsEnabled(GL_CULL_FACE)`。這支持「消除重複 query」可作為單一候選，但不能證明瀏覽器內部的等待機制、不能當成 glGetError 是根因的證據，也不能保證移除 query 後等待不會轉移到下一個 GL 呼叫。

### cullcache1：Zelda Ocarina 開場 A/B

A 使用 `?n64Runtime=fork&n64AudioDiagnostics=1&n64CullStateCache=0`，B 只把 cache 值改為 `1`。兩組都使用 cullcache1 binary、emu1、320×240、rAF、triangle stream、3072/1024，rect 細分計時關閉；所有 marker 都符合 A=false、B=true。下表取各自第 7–18 筆，約 60 秒，代表相同相對時間，但不是逐幀對齊。

| 指標 | A 關閉 | B 開啟 |
| --- | ---: | ---: |
| 來源 elapsed 合計 | 60.288 s | 60.230 s |
| VI/s | 33.56 | 32.01 |
| SDL 缺資料 callback / 總數 | 556 / 2593 | 656 / 2589 |
| 其中 partial / empty | 196 / 360 | 197 / 459 |
| Rectangle scope wall time 合計 | 41,382 ms | 71 ms |
| Rectangle calls | 54,330 | 54,162 |
| VI scope 加權平均 | 25.86 ms | 6.15 ms |

- 敏感度檢查（各自取最後 12 筆）：A 為 60.329 s、35.07 VI/s、440 次缺資料 callback；B 為 60.181 s、34.66 VI/s、463 次。沒有看到端到端改善。
- 使用者聽感：兩組都有一點延遲，B 稍微不順；兩組都有嚴重雜訊、明顯電流聲與氣泡聲，但沒有畫面問題。**這一輪沒有通過驗收，cache 不升為預設。**
- A 的 22 筆與 B 的 23 筆輸出報告全部都是 awaiting-render-report / latest=null，因此無法計算輸出缺音。追查後發現：SDL 可以先 CloseAudio 再 OpenAudio，但原本的 configureAudioWorklet 只檢查 `Module.n64AudioWorkletNode` 是否存在，沒有核對 context 與 ScriptProcessor identity。這可能留下舊 port 或已關閉 context 的 Worklet，因此促成 lifecycle1。這個風險目前沒有被證實是雜訊的根因。
- cull cache 實作重點：涵蓋 Rice 的 15 個 cull enable/disable 呼叫點。unknown 狀態第一次會回退成真正的 query；`InitState` 會重新設為 false。sprite 仍做真正的 query 並更新 cache；`glCullFace` 模式與所有真實寫入都保留。前提是只有單一 active Rice context。native mock 測試：off 為 **12 queries / 13 writes**，on 為 **4 queries / 13 writes**（不是效能數據）。

### 更早的 Super Mario 64 第一份匯出

04:30:25.574 → 04:31:05.777 共 40 audio 秒：underflow 603,012 frames，等於 12.56275 秒（31.406875%），657 個缺音段，新增 drop 為零。各視窗 33.08–51.58 VI/s，rectangle 約 11.79–21.08 ms/VI，促成了 rectdiag1。這段量測顯示主要問題是持續供料不足，不是高水位丟棄。

## 歷史紀錄

- 2026-09-11：靜態評估。結論是有可優化的路徑，但缺少輸出端證據；建議依序補輸出端診斷、降低 renderer 對主執行緒的占用、依症狀處理 drop 邊界，最後才考慮 producer Worker 隔離。不優先盲目加大 buffer、切換 timer/dynarec、全面改用 WebGPU 或只降低解析度。
- 2026-09-12 `audiodiag1`：新增 Worklet 輸出端 counters 與 read-only getter；舊 artifact 與 npm runtime 會回報 unsupported。
- 2026-09-12 `rectdiag1`：新增 rectangle phase 細分計時。Mario 實機資料顯示 `glIsEnabled(GL_CULL_FACE)` 約占 rectangle 時間的 99.7–99.8%。
- 2026-09-12 `cullcache1`：opt-in cull state cache。Zelda A/B 中 rectangle 時間大幅下降，但 VI/s 沒有提升，聽感也沒有通過；輸出報告全為 null，因此暴露出音訊生命週期問題。
- 2026-09-12 `lifecycle1`：修正 SDL AudioWorklet 生命週期。capture5 獲使用者接受，成為目前版本。
- 2026-09-12 發布前檢查：8 個 N64 focused 測試檔 48 / 48 通過；TypeScript noEmit 與完整 Rust/Wasm + TypeScript + Vite production build 通過，但既有 warning 仍在。15 個 patch 都能 reverse-check；`.gitattributes` 讓 patch checkout 固定使用 CRLF。
- 曾使用的私人區網 HTTPS 流程（`N64_MOBILE_HTTPS=1`、[mobile-ca-server.mjs](../tools/n64/mobile-ca-server.mjs)、[prepare-mobile-https.ps1](../tools/n64/prepare-mobile-https.ps1)）已不是目前測試路線。該流程只提供公開 DER 憑證，私鑰從不傳出；測試結束後應移除手機上的 CA profile。

| 發布內容（lifecycle1） | SHA-256 |
| --- | --- |
| bundle | `84B22248402A109B13C37C6378409A252E1199773B80B4C479E721F2899B36BC` |
| Wasm | `D22F990F9224510AB08B39EDFF985F5AFF44A9F5748DC8EDEEFEFAEB1BCB98F9` |
| data（各版保持不變） | `6D1B8723402AF6731030D5400725E54ABFC509B05FE16418C61D1FD788486FCA` |
| public／dist Worklet | `4F5670948A137BAA3CB2FAF0144DE27B3BD2D05BD1EAC606DCA116693CC9227D` |
