# N64 瀏覽器核心分階段優化計畫

## 原則

- 每一階段都保留上一階段可運作的預設路徑。
- 實驗功能必須由 build flag、設定或 query string 明確啟用。
- 每階段先用 Super Mario 64、Mario Kart 64 與 Ocarina of Time 驗證，再決定是否進入下一階段。
- 效能以穩態 VI/s、平均/最長 VI、long VI 與 recompiles 判斷，不以主觀畫面順暢度取代數據。

## 目前決策摘要（2026-07-19）

**目前位置**：階段 1 與階段 2 已完成。triangle streaming ring已通過iPhone A/B並保留；rectangle ring與較大iOS audio buffers均未達門檻。下一步回到renderer batching與同步等待，先做本機可驗證的大型調整。

**已確認結論**：

- fork可由固定commit與Emscripten版本重建，三款遊戲相較npm runtime均在5%相容門檻內。
- Super Mario 64 true null-video為60.0 VI/s，正常Rice為27.20 VI/s；主要限制是Rice renderer，不是R4300或Safari Wasm吞吐量。
- Rice no-draw為59.98 VI/s，表示parser、ucode、texture lookup與一般state不是首要成本；約27.84 ms/VI位於主要GL draw入口及其WebGL資料提交。
- triangle streaming ring的iPhone固定場景由16.71提升至38.22 VI/s（+128.7%），DList由48.16降至18.70 ms（-61.2%），audio underruns由706降至290（-58.9%），因此確定保留。triangle本身由0.469降至0.078 ms，rectangle也由46.47降至18.36 ms，顯示移除triangle client arrays同時減少了後續draw承接的同步等待。
- rebuilt fork的Asyncify rewind `memory access out of bounds`已定位為新增instrumentation後仍沿用npm的588-page initial memory。提升為64 MiB（1024 pages）後，Super Mario 64與Mario Kart 64完成第一個VI，Ocarina of Time完成Wasm/SDL/Rice啟動且沒有越界。手機恢復預設使用fork與triangle streaming；desktop維持npm runtime，`?n64Runtime=npm`保留為手機緊急回退。
- rectangle full實測為37.7 VI/s、22.0 ms/VI、18.4 ms rectangle與449 underruns；相較stream的38.22 VI/s、21.39 ms、18.36 ms與290 underruns沒有客觀收益，因此不採用rectangle ring。使用者主觀感受整體較好但仍有輕微爆音，這可能是run-to-run狀態差異，不能推翻獨立draw指標與underrun結果。
- SDL audio callback在資料不足時不再捨棄整個輸出區塊，會先播放可產生的樣本，只將不足尾端補靜音。4096/2048 audio buffer實測為37.9 VI/s、21.7 ms/VI與435 underruns，沒有優於stream的290次，使用者也感覺延遲稍增且體感沒有改善，因此否決並維持iOS 3072/1024。
- N64 canvas在SDL/Rice初始化期間固定為profile尺寸，第一個VI開始後才鎖定WebGL backing並恢復responsive CSS，避免CSS顯示尺寸把手機backing改成390x292而造成上方/右側錯位。app AudioWorklet與N64 SDL各自的AudioContext都由persistent gesture、第一個VI及頁面回到visible時恢復；fork control必須使用`Module.SDL2.audioContext`。

| Super Mario 64路徑 | VI/s | VI average | DList | 結論 |
| --- | ---: | ---: | ---: | --- |
| 正常instrumented Rice | 27.20 | 31.68 ms | 28.08 ms | renderer baseline |
| true null-video | 60.0 | 6.13 ms | 0 ms | core可達原生VI速率 |
| Rice no-draw | 59.98 | 12.19 ms | 0.24 ms | GL draw入口與提交是主成本 |
| 手機短測baseline | 16.71 | 57.69 ms | 48.16 ms | 706 underruns |
| interleaved triangle stream ring | 38.22 | 21.39 ms | 18.70 ms | 保留；290 underruns |
| triangle + rectangle full | 37.7 | 22.0 ms | 約18.7 ms | 不採用；449 underruns |

**下一輪量測**：

1. baseline、stream、full與audio判定均已完成，目前不再要求手機短測；triangle stream作為後續唯一比較基準。
2. 下一個大型調整先以現有draw telemetry細分driver draw/同步等待並評估跨draw batching；完成本機重建、三款遊戲smoke test後才安排一次手機驗收。
3. iOS維持3072/1024與partial-underrun輸出。15分鐘手機穩定性留到最終驗收，不再測更大的SDL buffers。
4. 若低風險WebGL項目仍無法把Rice降到約10.55 ms/VI，建立單一固定場景的WebGPU prototype；只有整體提升至少20%且三款遊戲無阻斷性圖形錯誤，才考慮擴大。

**手機簡易測試模式**：

- `?n64MobileTest=baseline`：固定使用rebuilt fork與預設Rice triangle路徑。
- `?n64MobileTest=stream`：固定使用相同fork並啟用交錯triangle streaming ring。
- `?n64MobileTest=full`：已完成且不採用；只保留作為rectangle ring歷史對照。
- 各組都使用10秒暖機與20秒採樣；目前三組renderer測試均已完成，沒有待執行的手機網址。
- 官方renderer結果分別存於`localStorage`的`n64MobileTestResult:baseline`、`:stream`與`:full`，不會互相覆寫。

**近期不做**：R4300 recompiler重構、RSP SIMD、Worker/AudioWorklet與一般toolchain調整。現有數據顯示這些不是Super Mario 64目前的最大瓶頸，先投入會降低可歸因性。

**GitHub Pages部署**：rebuilt runtime納入版本化artifact。Vite production build會在bundle/Wasm/data/manifest缺少，或manifest不是64 MiB initial memory時直接失敗。fork的main bundle、data與Wasm使用相同asset version query，避免upstream commit檔名不變時Pages CDN混用舊的588-page JS/Wasm。現有GitHub Actions依repository name設定base URL；正常手機不帶query時載入fork與triangle streaming，維持320x240 backing與完整4:3畫面。

## 階段 1：可重現基準與安全 A/B

狀態：已完成。

- iPhone 17 Pro Max 的 Super Mario 64 真機結果：`emuMode=2 + SkipFrame` 為 27.23 VI/s；`emuMode=1 + SkipFrame` 為 27.65 VI/s；`emuMode=1 + no SkipFrame` 為 27.06 VI/s。
- iOS 正常模式改用 `emuMode=1`，避免無效的動態編譯與較大的最長 VI；桌面與 Android 維持 `emuMode=2`。
- iOS 關閉 SkipFrame；實測只損失約 2.1% VI/s，不足以抵銷可見畫面更新損失。
- iOS profile 不再依賴 Safari 可能降級回報的 `hardwareConcurrency`，避免 iPhone 17 Pro Max 被誤判為 low-end。
- `n64Benchmark=1` 才啟用 30 秒暖機與 60 秒穩態彙總。
- 支援切換 `emuMode`、SkipFrame 與 main-loop timing。
- 通過條件：未帶參數時行為不變；benchmark 結束可取得單一彙總結果。
- 回退點：移除 query string 即回到正常模式。

## 階段 2：建立可重建的 Mupen fork 與子系統計時

狀態：已完成。baseline重建、三款相容性驗收、subsystem timing、true null-video及Rice no-draw歸因均已完成。

- npm `1.5.7` 來源固定到 commit `7f0ebbf78c16da0d41fe80f0e98f17523d4bf793`，Emscripten 固定為 upstream 已知可建置的 `3.1.25`。
- `npm run n64:source` 已在 Windows 上驗證：透過 HTTPS 初始化該 commit 與 10 個鎖定 submodules，排除 upstream 中 NTFS 不支援的文件圖片路徑，並套用 `tools/n64/patches` 中的版本化 patch。
- `npm run n64:build` 使用 `emscripten/emsdk:3.1.25` Docker image 建立與 npm 發行檔一致的 Rice static-plugin baseline，產物與 manifest 放在 `artifacts/n64`。
- baseline artifact 已成功建立；新舊 Wasm initial memory 均為 588 pages（38,535,168 bytes），新 Wasm 大小增加約 0.85%。
- iPhone Super Mario 64 fork baseline 為 27.082 VI/s、31.81 ms average、107 ms max、817 long VI；相較 npm baseline 27.060 VI/s僅快 0.08%，視為效能等價並通過 5%門檻。
- iPhone Mario Kart 64 fork baseline 為 21.94 VI/s、37.51 ms average、147 ms max、644 long VI；相較 npm baseline 21.24 VI/s快3.32%，平均 VI改善3.55%，通過5%門檻。
- iPhone Ocarina of Time fork baseline 為22.70 VI/s、41.92 ms average、116 ms max、687 long VI；相較npm baseline 21.98 VI/s快3.29%，平均 VI改善3.35%，通過5%門檻。三款fork相容性驗收完成。
- instrumented fork在C端以 `emscripten_get_now()` 累加inclusive RSP、Rice DList/RDP、present與audio plugin時間，沿用每VI一次的 `endStats` JS crossing回報。`coreResidualMs`為 VI時間扣除inclusive RSP、present與audio後的R4300/core上限；DList/RDP是RSP內部明細，不重複扣除。
- npm rollback runtime仍可呼叫單參數 `endStats`，缺少的分段欄位自動記為0。兩個telemetry測試檔、N64可重建build與完整production build均已通過。
- iPhone Super Mario 64 instrumented fork為27.20 VI/s、31.68 ms average；RSP inclusive 28.22 ms（89.1%），其中Rice DList 28.08 ms，core residual 3.45 ms，present 0.012 ms，audio plugin 0.003 ms。這表示SkipFrame未處理的DList解析/渲染路徑才是首要候選，下一個判別測試為true null-video。
- iPhone Super Mario 64 true null-video達60.0 VI/s、6.13 ms average、9 ms max且無long VI；DList/RDP/present均為0。Rice移除後已達原生VI速率，確認目前首要瓶頸是Rice DList路徑，不是R4300或Safari Wasm吞吐量。60 VI/s的renderer預算約10.55 ms/VI，Rice目前28.08 ms，需降低至少62.4%。下一步先分離command parsing、texture/shader state與GL draw成本，再決定優化Rice backend或替換renderer。
- iPhone Super Mario 64 Rice no-draw達59.98 VI/s、12.19 ms average；DList只剩0.24 ms。相較正常Rice DList 28.08 ms，約27.84 ms/VI集中在主要GL draw入口及其周邊WebGL資料提交，parser/ucode/texture/state不是首要瓶頸。正常Rice benchmark現會分別回報triangle/rectangle draw時間與calls/VI；用結果判斷優先導入persistent VBO/EBO或draw batching。WebGPU延後到WebGL backend低風險項目無法達標時。
- triangle ring的iPhone A/B已通過：baseline/stream分別為16.71/38.22 VI/s、48.16/18.70 ms DList與706/290 underruns。第二個36-byte rectangle ring現由`PersistentRectBuffers`獨立控制；桌面full固定樣本為57.04 VI/s、17.22 ms average、1.01 ms DList、0.013 ms rectangle與6 underruns，3D標題畫面正常。桌面結果僅證明功能與telemetry，不取代一次iPhone full判定。
- SDL backend的既有`underrun_count`現以累積值送入telemetry，由TypeScript跨VI計算增量，避免漏掉兩個VI之間執行的主執行緒audio callback。資料不足時改為播放可安全resample的前段，只把尾端補靜音，降低整塊callback靜音造成的破碎；`[N64 perf]`與benchmark JSON新增`audioUnderruns`。
- 2026-07-19重新驗收時，588-page artifact可在`start()`的Asyncify rewind穩定重現Wasm `memory access out of bounds`。fork加入telemetry、renderer與SDL修正後需要比npm baseline更大的啟動空間；固定64 MiB initial memory後同一路徑不再越界，build manifest與Vite production gate會共同防止舊artifact再次部署。
- 版本化相容 patch 將 `INITIAL_HEAP` / `STACK_SIZE` link settings 對應為 Emscripten 3.1.25 的 `INITIAL_MEMORY` / `TOTAL_STACK`，並明確固定 npm artifact 實際使用的 588-page initial memory。
- upstream packaging 工具只需要 `yargs@17.2.0`；build 在容器臨時 prefix 安裝該固定版本，避免舊 npm 無法解析新版 package lock。
- build 後使用專案既有 esbuild 將 upstream 的 extensionless imports 與 `axios` bare import 打包成 `main.bundle.js`，供瀏覽器直接載入。
- mobile未帶參數時使用rebuilt artifact；`?n64Runtime=npm`明確切回npm rollback，desktop未帶參數時仍使用npm runtime。
- 將目前 npm 套件來源固定到專案 fork，不直接修改 `node_modules` 成品。
- 固定 Emscripten/SDK 版本並產出與目前 runtime 相同的 Rice build。
- 在 VI 內量測RSP、Rice DList/RDP、present與audio generation，並計算R4300/core residual上限；Wasm compile只在重新評估emuMode 2時另行量測。
- 新增只供 benchmark 使用的 null-video/null-audio plugin；正常 build 仍使用 Rice/SDL。
- 通過條件：三款遊戲行為與階段 1 相同，計時總和與 VI 時間誤差可解釋。
- 停止條件：無法重現目前相容性或 fork build 在 iPhone 上更慢超過 5%。

## 階段 3：低風險 Toolchain 與記憶體優化

狀態：延後。先完成目前Rice低風險renderer A/B，避免優化只占約6.1 ms/VI的core路徑。

- A/B 測試新版 Emscripten、`-O3`、LTO、Wasm SIMD 與較大固定 initial heap。
- 將 startup-only Asyncify 與 CPU hot path 分開評估，尚不改寫 recompiler。
- 每個選項獨立產出 artifact，避免一次改多項後無法歸因。
- 通過條件：Ocarina 穩定，另外兩款穩態至少提升 10%，沒有新圖形/音訊回歸。
- 回退點：保留階段 2 toolchain artifact。

## 階段 4：重構 Wasm Recompiler

- 先量測 module 大小、compile 時間、trace 命中率、helper call 與間接跳轉次數。
- 將多個熱 trace 批次編成較大 Wasm module，減少 `WebAssembly.instantiate()` 次數。
- 在 Worker 執行 `WebAssembly.compile()`；編譯期間繼續跑 cached interpreter，在 VI 邊界安全 patch。
- 目標是移除 `compileAndPatchModule` 對 Asyncify 的依賴，再評估完全移除 CPU 路徑 Asyncify。
- 通過條件：相同遊戲狀態一致，long VI 顯著下降，穩態提升至少 20%。
- 回退點：runtime flag 可切回舊 recompiler；compile/patch 失敗時自動退回 cached interpreter。

## 階段 5：RSP SIMD

- 以階段 2 計時確認 RSP 佔比後才開始。
- 將常用 RSP vector op 與音訊/圖形 microcode hot path 改為 Wasm SIMD 128-bit。
- scalar 實作保留為相容與驗證路徑。
- 通過條件：RSP-heavy 場景提升至少 15%，scalar/SIMD 狀態與輸出一致。
- 回退點：feature detection 或設定可強制 scalar。

## 階段 6：Worker 與 AudioWorklet 隔離

- 將整個 emulator loop 搬到 dedicated Worker。
- 使用 AudioWorklet + ring buffer，避免 ScriptProcessor 與模擬器爭用主執行緒。
- 先保留 Rice/WebGL 路徑；只有目標 Safari 確認支援時才搬 canvas/rendering。
- 通過條件：輸入、存檔、暫停、切換 ROM 正常，音訊 underrun 與 UI stall 明顯下降。
- 回退點：不支援 Worker 所需能力時使用單執行緒階段 5 build。

## 階段 7：依數據決定 WebGPU 或停止瀏覽器投資

- null-video已讓Super Mario 64由27.20提升到60.0 VI/s，已通過建立WebGPU prototype的必要條件；仍須先完成低風險WebGL A/B。
- null-video 後仍低於 50 VI/s，停止 renderer 改寫，資源轉向 R4300 或原生/串流方案。
- WebGPU prototype 必須先通過一個固定場景，不直接取代 Rice。
- 通過條件：整體而非只有 GPU 時間提升至少 20%，三款遊戲沒有阻斷性圖形錯誤。

## 統一驗收矩陣

每階段至少記錄：

| 遊戲 | 場景 | 穩態 VI/s | VI avg/max | long VI | recompiles | 15 分鐘穩定性 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Super Mario 64 | 城堡外與第一關 | 27.06 | 31.75 / 114 ms | 814 | 0 | 未測 |
| Mario Kart 64 | 單人第一場比賽 | 21.24 | 38.89 / 275 ms | 624 | 0 | 未測 |
| Ocarina of Time | 啟動後 90 秒路徑 | 21.98 | 43.37 / 212 ms | 664 | 0 | 90 秒內未閃退 |

若 recompiles 已為 0、null-video 也無法達到 50 VI/s，且階段 4 未取得至少 20% 提升，應停止繼續微調目前核心。