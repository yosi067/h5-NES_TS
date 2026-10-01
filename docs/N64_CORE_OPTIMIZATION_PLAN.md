# N64 瀏覽器核心分階段優化計畫

> 現況：階段 1、2 已完成。手機預設使用可重建的 64 MiB Mupen fork 與 Rice triangle streaming ring，iPhone 固定場景從 16.71 提升到 38.22 VI/s。
> rectangle ring、較大的 iOS audio buffer 與 cull cache 都未採用。音訊目前接受的版本是 lifecycle1，詳見 [N64_IPHONE_AUDIO.md](N64_IPHONE_AUDIO.md)。

## 目前決策

- **Runtime**：手機未帶參數時使用 fork（固定 commit、Emscripten 3.1.25、64 MiB initial memory）並開啟 triangle streaming；桌機維持 npm `1.5.7`。若手機需要緊急回退，使用 `?n64Runtime=npm`。
- **主要瓶頸是 Rice renderer**，不是 R4300 或 Safari Wasm 吞吐量。Super Mario 64 在 true null-video 下為 60.0 VI/s，Rice no-draw 為 59.98 VI/s，正常 Rice 只有 27.20 VI/s；約 27.84 ms/VI 花在主要 GL draw 入口與 WebGL 資料提交。parser、ucode、texture lookup 與一般 state 並非首要成本。
- **已否決的方案**：
  - rectangle ring：37.7 VI/s、449 underruns。
  - iOS SDL 4096/2048：37.9 VI/s、435 underruns，且延遲稍微增加。
  - 兩者都沒有優於 triangle-only 的 38.22 VI/s、290 underruns。
  - cull cache 維持 opt-in，預設關閉。
- **下一步**：以 triangle stream 作為唯一的比較基準。依手機固定場景中佔比最大的 triangle phase，只做一項 renderer A/B，每次只啟用一種改動：
  - upload 最大：調整 ring、orphan 或 upload 策略。
  - restore 最大：保留 VBO state，並延後 client-pointer restoration。
  - submit 最大：評估 draw batching 與 state consolidation。
  - other 最大：再細分外層 `RenderFlushTris` 的 state setup。
- **WebGPU**：只有低風險的 WebGL 方案仍無法把 Rice 降到約 10.55 ms/VI 時，才建立單一固定場景的 prototype。整體至少提升 20%，且三款遊戲沒有阻斷性圖形錯誤，才考慮擴大。15 分鐘手機穩定性測試留到最終驗收。
- **目前不做**：R4300 recompiler 重構、RSP SIMD，以及把整個 emulator/audio producer 搬進 Worker。沒有歸因數據之前，不改動 Worker、SharedArrayBuffer 或部署 headers。

## 原則

- 每個階段都保留上一階段可運作的預設路徑。實驗功能必須由 build flag、設定或 query string 明確啟用。
- 每個階段先用 Super Mario 64、Mario Kart 64 與 Ocarina of Time 驗證，再決定是否進入下一階段。
- 效能以穩態 VI/s、平均與最長 VI、long VI 與 recompiles 判斷，不以主觀的畫面順暢度取代數據。

## 目前 runtime 架構重點

### Canvas 與畫面尺寸

- N64 必須使用全新的 WebGL canvas，不能沿用已建立 2D context 的 `#screen`。
- 啟動時先套用 `body.n64-mode` 與 `body.n64-initializing`。SDL/Rice 初始化期間，CSS 與 WebGL backing 都固定在 profile 尺寸；等第一個 VI 開始後才鎖定 backing，並恢復 responsive CSS。
- 桌機使用 `640x480`，手機使用 `320x240`（完整 4:3）。這樣可以避免 SDL 在非同步啟動期間把手機 backing 改成 CSS 顯示尺寸（例如 390x292），造成上方或右側裁切。

### 效能 profile（`src/n64/performance.ts`）

系統依 user agent、觸控能力、CPU 邏輯核心數與可用記憶體選擇 profile，並在寫入 IDBFS 前重寫 `mupen64plus.cfg`。iOS profile 不依賴 Safari 可能低報的 `hardwareConcurrency`，避免 iPhone 17 Pro Max 被誤判為 low-end。

| Profile | CPU | 計時 | SkipFrame | 音訊 |
| --- | --- | --- | --- | --- |
| desktop | dynamic recompiler（`emuMode=2`） | — | — | — |
| ios-high-end | cached interpreter（`emuMode=1`） | rAF | 關閉 | 3072/1024 samples、`src-linear` resampler（降低 33600/44100 Hz 轉換的高頻失真） |
| mobile / mobile-low-end（Android） | `emuMode=2` | timer | 依 profile 啟用 | trivial resampler |

- 手機共同設定：快速材質載入、16-bit texture、關閉 mipmap 與 OSD。
- ROM reset 共用原始 `ArrayBuffer`，避免 32–64 MB 的 ROM 造成額外記憶體尖峰。
- ROM URL 只將逗號保留為合法字元；啟動前會驗證三種 byte-order magic。

### 音訊路徑

- SDL callback 資料不足時，會先播放仍可安全 resample 的前段，只把缺少的尾端補靜音（partial underrun）。
- C 端把 S16 PCM 轉成可轉移的 Float32 chunk，送入 `n64-audio-processor`；只排入有效的前段，不包含補靜音的尾端。SDL ScriptProcessor 保留並接到 zero-gain sink，用於 callback 與 fallback。
- Worklet queue：
  - 初次啟動時累積 1024 frames。
  - 超過 6144 frames 時丟棄最舊的 chunk。
  - 短暫 drain 後以 64-frame crossfade 接回，不再重新 priming。
  - pause、resume、stop 時清除過期資料。
  - 如果 Worklet 不可用，由 ScriptProcessor 直接輸出。
- app AudioWorklet 與 N64 SDL 各自的 AudioContext，都會在 persistent gesture、第一個 VI，以及頁面回到 visible 時恢復。fork control 必須使用 `Module.SDL2.audioContext`。
- 這套設計只能改善短暫的主執行緒抖動，無法補上 SDL 根本沒有產生 PCM 的空窗。SDL underrun 與 Worklet underflow 必須分開判讀。輸出端診斷、生命週期與實機驗收見 [N64_IPHONE_AUDIO.md](N64_IPHONE_AUDIO.md)。

### Telemetry（`src/n64/telemetry.ts`）

- 透過 Mupen 的 `beginStats` / `endStats` hook，每五秒輸出 `[N64 perf]`：VI/s、平均與最長 VI、long VI、recompiles、RSP/DList/RDP、triangle/rectangle draw timing 與 calls，以及 `audioUnderruns`。約 56 VI/s 以上代表 NTSC 遊戲接近 real-time。
- C 端每個 VI 只跨入 JS 一次。npm rollback runtime 仍可呼叫單參數的 `endStats`，缺少的欄位記為 0。
- SDL 的 `underrun_count` 以累積值送出，由 TypeScript 跨 VI 計算增量，避免漏掉兩個 VI 之間執行的 callback。另有 partial/empty underrun 與最大 callback gap。
- Rice persistent triangle draw 會細分 prepare、upload、submit、restore，`other` 由 triangle total 扣除這四個 phase 得出。

### 重建與資產驗證

- 重建流程：先執行 `npm run n64:source`，再用 Docker 執行 `npm run n64:build`。
- Vite production build 在下列情況會直接失敗：
  - `artifacts/n64` 的 bundle、Wasm、data 或 manifest 缺少。
  - manifest 不是 64 MiB initial memory。
  - manifest assetVersion 與前端版本不同。
- build script 在 esbuild 成功後才寫入 manifest。
- fork 的 main bundle、data 與 Wasm 會發布為帶相同 asset version 的實體檔名，確保三者一起原子更新。
- `.gitattributes` 必須把 `*.data` 視為 binary，避免換行正規化破壞 preload archive。
- dynamic import URL 以 `document.baseURI` 解析，避免 `BASE_URL='./'` 誤載 `/assets/n64-fork/`。GitHub Actions 會依 repository name 設定 base URL。

## 關鍵量測（Super Mario 64，iPhone）

| Super Mario 64路徑 | VI/s | VI average | DList | 結論 |
| --- | ---: | ---: | ---: | --- |
| 正常instrumented Rice | 27.20 | 31.68 ms | 28.08 ms | renderer baseline |
| true null-video | 60.0 | 6.13 ms | 0 ms | core可達原生VI速率 |
| Rice no-draw | 59.98 | 12.19 ms | 0.24 ms | GL draw入口與提交是主成本 |
| 手機短測baseline | 16.71 | 57.69 ms | 48.16 ms | 706 underruns |
| interleaved triangle stream ring | 38.22 | 21.39 ms | 18.70 ms | 保留；290 underruns |
| triangle + rectangle full | 37.7 | 22.0 ms | 約18.7 ms | 不採用；449 underruns |

手機短測模式 `?n64MobileTest=baseline|stream|full`（10 秒暖機、20 秒採樣，結果存在 `localStorage` 的 `n64MobileTestResult:<mode>`）都已完成；`full` 只保留作為 rectangle ring 的歷史對照。

## 分階段計畫

| 階段 | 狀態 | 通過條件 | 回退點 |
| --- | --- | --- | --- |
| 1 可重現基準與安全 A/B | 已完成 | 未帶參數時行為不變；benchmark 結束可取得單一彙總結果 | 移除 query string |
| 2 可重建 Mupen fork 與子系統計時 | 已完成 | 三款遊戲行為與階段 1 相同，計時總和與 VI 時間的誤差可以解釋 | npm runtime |
| 3 低風險 toolchain 與記憶體優化 | 延後 | Ocarina 穩定，另外兩款穩態至少提升 10%，沒有新的圖形或音訊回歸 | 階段 2 toolchain artifact |
| 4 重構 Wasm recompiler | 目前不做 | 相同遊戲狀態一致，long VI 明顯下降，穩態至少提升 20% | runtime flag 切回舊 recompiler；compile/patch 失敗時自動退回 cached interpreter |
| 5 RSP SIMD | 目前不做 | RSP-heavy 場景至少提升 15%，scalar 與 SIMD 的狀態和輸出一致 | feature detection 或設定可強制 scalar |
| 6 Worker 與 AudioWorklet 隔離 | 目前不做 | 輸入、存檔、暫停、切換 ROM 正常，音訊 underrun 與 UI stall 明顯下降 | 不支援所需能力時使用單執行緒階段 5 build |
| 7 依數據決定 WebGPU 或停止瀏覽器投資 | 待定 | 整體（不只 GPU 時間）至少提升 20%，三款遊戲沒有阻斷性圖形錯誤 | 保留 Rice/WebGL2 |

### 階段 1：可重現基準與安全 A/B（已完成）

- iPhone 17 Pro Max 上的 Super Mario 64：`emuMode=2 + SkipFrame` 為 27.23 VI/s；`emuMode=1 + SkipFrame` 為 27.65 VI/s；`emuMode=1 + no SkipFrame` 為 27.06 VI/s。
- 依此決定 iOS 改用 `emuMode=1`，避免無效的動態編譯，也避免較大的最長 VI；桌面與 Android 維持 `emuMode=2`。
- iOS 關閉 SkipFrame：實測只損失約 2.1% VI/s，不足以抵銷可見畫面更新的損失。
- `n64Benchmark=1` 會啟用 30 秒暖機與 60 秒穩態彙總，並可切換 `emuMode`、SkipFrame 與 main-loop timing。

### 階段 2：可重建 fork 與子系統計時（已完成）

- 將 npm `1.5.7` 的來源固定到 commit `7f0ebbf78c16da0d41fe80f0e98f17523d4bf793`，Emscripten 固定為 `3.1.25`。不直接修改 `node_modules` 中的成品。
- `npm run n64:source` 已在 Windows 上驗證。它會透過 HTTPS 初始化該 commit 與 10 個鎖定的 submodules，排除 upstream 中 NTFS 不支援的文件圖片路徑，並套用 `tools/n64/patches`。
- `npm run n64:build` 使用 `emscripten/emsdk:3.1.25` Docker image，產物與 manifest 放在 `artifacts/n64`。
- build 相關修正：
  - 相容 patch 把 `INITIAL_HEAP` / `STACK_SIZE` 對應為 `INITIAL_MEMORY` / `TOTAL_STACK`。
  - 只在容器臨時 prefix 安裝 `yargs@17.2.0`。
  - 用 esbuild 把 extensionless imports 與 `axios` 打包成 `main.bundle.js`。
- 最初的 baseline artifact 為 588 pages（38,535,168 bytes），Wasm 大小增加約 0.85%。fork 與 npm 的相容性都在 5% 門檻內：

| 遊戲（iPhone） | fork VI/s | npm VI/s | 差異 | fork avg / max VI | long VI |
| --- | ---: | ---: | ---: | --- | ---: |
| Super Mario 64 | 27.082 | 27.060 | +0.08% | 31.81 / 107 ms | 817 |
| Mario Kart 64 | 21.94 | 21.24 | +3.32%（平均 VI 改善 3.55%） | 37.51 / 147 ms | 644 |
| Ocarina of Time | 22.70 | 21.98 | +3.29%（平均 VI 改善 3.35%） | 41.92 / 116 ms | 687 |

- 子系統計時：以 `emscripten_get_now()` 累加 inclusive RSP、Rice DList/RDP、present 與 audio plugin 時間。`coreResidualMs` 是 VI 時間扣除 RSP、present 與 audio 後得到的 R4300/core 上限；DList/RDP 是 RSP 內部的明細，不重複扣除。
- 歸因結果（Super Mario 64）：instrumented 為 27.20 VI/s，RSP inclusive 28.22 ms（89.1%），其中 DList 28.08 ms、core residual 3.45 ms、present 0.012 ms、audio 0.003 ms。null-video 為 60.0 VI/s（max 9 ms，沒有 long VI）。在 60 VI/s 下，renderer 預算約 10.55 ms/VI，Rice 至少要降低 62.4%。
- benchmark 專用的 null-video/null-audio plugin 不影響正常 build。另有 rectangle ring（`PersistentRectBuffers`），桌面 full 樣本為 57.04 VI/s、0.013 ms rectangle、6 underruns，但這只用來驗證功能。
- 停止條件：無法重現目前的相容性，或 fork 在 iPhone 上慢超過 5%。

### 階段 3–7 要點

- **階段 3**：延後。core 只占約 6.1 ms/VI，因此先做 Rice renderer 的 A/B。計畫逐項比較新版 Emscripten、`-O3`、LTO、Wasm SIMD、較大固定 initial heap，並把 startup-only Asyncify 與 CPU hot path 分開評估。每個選項都獨立產出 artifact。
- **階段 4**：先量測 module 大小、compile 時間、trace 命中率、helper call 與間接跳轉次數。之後把熱 trace 批次編成較大的 module，並在 Worker 執行 `WebAssembly.compile()`；編譯期間繼續使用 cached interpreter，在 VI 邊界 patch。目標是移除 `compileAndPatchModule` 對 Asyncify 的依賴。
- **階段 5**：先用階段 2 的計時確認 RSP 的占比。常用 RSP vector op 與 microcode hot path 改用 Wasm SIMD 128-bit，scalar 版本保留作為驗證路徑。
- **階段 6**：把整個 emulator loop 移到 dedicated Worker，並使用 AudioWorklet + ring buffer。先保留 Rice/WebGL；只有確認目標 Safari 支援時才移動 canvas。SharedArrayBuffer 方案還需要驗證 secure context 與 cross-origin isolation。
- **階段 7**：null-video 已從 27.20 提升到 60.0 VI/s，符合建立 WebGPU prototype 的必要條件，但仍要先完成低風險 WebGL A/B。若 null-video 後仍低於 50 VI/s，就停止 renderer 改寫，資源轉向 R4300 或原生／串流方案。WebGPU prototype 必須先通過一個固定場景，不直接取代 Rice。

## 統一驗收矩陣

每個階段至少記錄下列項目（表中為既有的基準值）：

| 遊戲 | 場景 | 穩態 VI/s | VI avg/max | long VI | recompiles | 15 分鐘穩定性 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Super Mario 64 | 城堡外與第一關 | 27.06 | 31.75 / 114 ms | 814 | 0 | 未測 |
| Mario Kart 64 | 單人第一場比賽 | 21.24 | 38.89 / 275 ms | 624 | 0 | 未測 |
| Ocarina of Time | 啟動後 90 秒路徑 | 21.98 | 43.37 / 212 ms | 664 | 0 | 90 秒內未閃退 |

若 recompiles 已為 0、null-video 也無法達到 50 VI/s，且階段 4 沒有取得至少 20% 的提升，就應停止繼續微調目前核心。

## 歷史紀錄

- 2026-07-19：588-page artifact 會在 `start()` 的 Asyncify rewind 中穩定重現 `memory access out of bounds`。原因是 instrumented fork 需要更大的啟動空間；改成 64 MiB 後不再越界，manifest 與 Vite gate 可防止舊 artifact 再次部署。
- 2026-07-22 前：Ocarina 無法進入第一個 VI，原因是 `encodeURIComponent()` 把逗號編成 `%2C`，Vite preview 因此回傳 157,967 bytes 的 `index.html`（`open_rom(): not a valid ROM image`）。現在 ROM URL 保留逗號，`emuMode=1/2` 都可以進入標題畫面。
- 2026-07-22 前：triangle streaming ring 通過 iPhone A/B 並保留。triangle 從 0.469 降到 0.078 ms，rectangle 從 46.47 降到 18.36 ms，顯示移除 triangle client arrays 也減少了後續 draw 的同步等待。
- 2026-07-22 前：rectangle full 與 SDL 4096/2048 都沒有客觀收益而被否決。使用者主觀上覺得 full 較好，但仍有輕微爆音；4096/2048 則讓延遲稍增。
- 2026-07-22：triangle phase telemetry 上線。桌面 smoke 中，Super Mario 64 為 49.0 VI/s（phase 0.02/0.08/0.06/0.04/0.10 ms），Mario Kart 64 為 60.2 VI/s（0.02/0.05/0.04/0.03/0.08 ms）；這些數據只用來驗證欄位。
- 2026-08-16：加入 SDL → AudioWorklet transport。桌面 smoke 確認 attach、重新 attach 與 callback telemetry 正常，但這不是 iPhone 音效 A/B。triangle-stream 的 underrun 從 706 降到 290，是 renderer 負載下降與 partial-underrun 輸出共同造成，不能歸因於 AudioWorklet。
- 2026-09-12：完成 iPhone 輸出端診斷、rectdiag1、cullcache1 與 lifecycle1，詳見 [N64_IPHONE_AUDIO.md](N64_IPHONE_AUDIO.md)。
