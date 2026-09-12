# N64 iPhone 音訊優先評估（2026-09-11）

> 歷史靜態評估，以下「尚未實機／尚缺 telemetry」描述的是 2026-09-11 狀態。2026-09-12 的 lifecycle1 capture5 已獲使用者聽感接受（無雜訊、音質滿意），複雜場景仍卡頓；最新數據與未解限制以 [實機結果](N64_IPHONE_20260912_RESULTS.md) 為準，不代表下列嚴格零缺樣本／長測門檻已通過。

## 結論與證據範圍

- **有可優化的路徑，但尚不能確認目前版本在 iPhone 已可持續無卡頓、無爆音，也不能承諾改善百分比。**
- 本次為現有程式、fork patches 與既有實機紀錄的靜態審查；沒有新的 iPhone 實測。未執行桌面效能測試，也未將桌面 iPhone UA、視窗尺寸、CPU throttling 或 Playwright WebKit 當作 iPhone 環境。
- Windows 上這些方法無法完整重現 Apple SoC、iOS Safari/WebKit、GPU driver、音訊硬體排程與熱降頻。即使使用 macOS 的 iOS Simulator，也不能據此驗收實機效能。正式結論需要目標 iPhone，或可確認為實體 iPhone 且可取得音訊證據的遠端裝置。
- 本次不修改核心、音訊緩衝或正式預設，以免把未經實機驗證的假設當作改善。

## 已確認的現況

| 項目 | 現有實作／紀錄 | 判讀 |
| --- | --- | --- |
| iPhone profile | 320×240、cached interpreter、rAF、關閉 SkipFrame、SDL 3072/1024、src-linear | 保留現況；不以名稱 ios-high-end 判定實際硬體效能 |
| 手機正常 renderer | fork + triangle streaming；rectangle persistent buffers 關閉 | 後續比較基準應為目前 stream，而非未優化 baseline |
| 音訊輸出 | SDL callback 將有效 PCM 轉成 transferable Float32，送到 AudioWorklet | 播放在 Worklet，但供料仍受主執行緒影響，並非完整 producer 隔離 |
| Worklet 緩衝 | 初始 1024 frames；6144 high-water；缺音時衰減、恢復時 64-frame crossfade | 可遮蔽短暫不連續，不能補出未產生的音樂 |
| 高水位處理 | 丟棄最舊整個 chunk；該分支未專門觸發 crossfade | 有樣本跳接的風險；尚無實機 drop 資料證明它是當前爆音主因 |
| 恢復播放 | 持續 gesture listeners、visible 時恢復、SDL state 檢查 | 已有雙 AudioContext 恢復路徑，不需重複新增 visibility handler |
| 量測 | SDL callback、partial/empty underrun、最大 gap、VI 與 renderer phase | 缺少 Worklet 輸出端的缺音 frames、缺音段長、queue depth、drop 統計 |

以 48 kHz 為例，1024 frames 約 21.3 ms，6144 frames 約 128 ms；44.1 kHz 則約 23.2/139.3 ms。這是 Worklet frames 換算，不是總輸出延遲，也不是一秒 priming。實際須記錄 AudioContext sampleRate。

對照來源：

- [profile](../src/n64/performance.ts)
- [runtime／benchmark 選擇](../src/n64/benchmark.ts)
- [Worklet](../public/n64-audio-worklet.js)
- [SDL PCM bridge patch](../tools/n64/patches/mupen64plus-audio-sdl/0001-web-partial-underrun-telemetry.patch)
- [Worklet attach／resume patch](../tools/n64/patches/mupen64plus-ui-console-web-netplay/0002-web-resume-audio-control.patch)
- [既有實機紀錄與優化計畫](N64_CORE_OPTIMIZATION_PLAN.md)

## 歷史 iPhone 證據，不代表本次重新量測

既有紀錄的 Super Mario 64 固定場景：

- Rice 正常渲染 27.20 VI/s，null-video 60.0、no-draw 59.98 VI/s：支持當時該裝置／場景的主要成本位於 Rice GL 提交路徑，不能推廣為所有遊戲都非 CPU 瓶頸。
- 另一次 triangle A/B：16.71 → 38.22 VI/s，SDL underruns 706 → 290；支持保留 triangle streaming，但不能用 290 次推算可聽爆音次數，也不是目前 Worklet 的新驗收。
- rectangle full 為 37.7 VI/s／449 underruns，較大 SDL 4096/2048 為 37.9 VI/s／435 underruns：兩者都未優於 stream，不再重做同一輪調參。

## 音樂優先的改善順序

1. **先補輸出端證據。** 診斷模式按低頻視窗彙整 Worklet underflow frames/events、最長連續 gap、queue min/max、drop frames/events、實際輸出模式與 sampleRate。區分首次 priming、暫停、mute、resume 與穩態缺音；統計取自 audio render timeline，不以主執行緒收訊時間代替。不要逐 render quantum 傳訊或列印。
2. **再壓低 renderer 對主執行緒的占用。** 以目前 stream 的實機 phase 資料決定 upload、restore、submit 或其他 GL state 路徑；一次只修改一項。降低畫面提交成本，才能為持續產生音訊留出時間。現成 SkipFrame 已測過收益有限，不能直接視為「音訊優先」解法。
3. **依症狀修輸出不連續。** 若 high-water drops 與爆音同步，再評估 drop 邊界 crossfade；它只減輕跳接，不提高核心速度，也不能保證消除缺音。不能用衰減輸出非零來宣稱 underflow 為零。
4. **中長期評估 producer 隔離。** 若 PCM 供料延遲仍主導問題，才建立 emulator／audio producer Worker + Worklet transport 原型；驗證 Safari 的實際能力、Rice canvas 路徑、pause/save/input、部署與 fallback。SharedArrayBuffer 方案還需驗證 secure context 與 cross-origin isolation，不能假設目前部署可直接支援。

不優先：盲目加大 buffers、切換 timer/dynarec、全面換 WebGPU、單靠降解析度。這些皆缺少本次目標 iPhone 的新增證據；任何改動都應保留回退。

## iPhone 驗收規格

- 記錄實體機型、iOS 版本、Safari／PWA 模式、build/artifact、ROM 與區域版本、sampleRate、Worklet 是否真的啟用。UA 只能做 profile 選擇，不能證明是實機。
- 使用可信 HTTPS；手機連區網 HTTP 可能無法啟用 Worklet，會測到不同輸出路徑。
- 同機同場景 A/B，至少三輪交錯順序；固定低耗電模式、充電狀態、音訊輸出路由、背景工作與起始熱狀態。優先內建喇叭，Bluetooth 另列結果。
- Super Mario 64、Mario Kart 64、Ocarina of Time 各用可重現操作路徑；每輪暖機 30 秒、穩態 60 秒，候選方案再做至少 15 分鐘連續遊玩以觀察熱降頻。不同 ROM 區域不能一律以 60 VI/s 判斷。
- 主指標：穩態 Worklet 缺音總毫秒、最長連續缺音、drop frames 與實際可聽爆音／斷音；SDL underrun 與 VI/renderer 資料用於歸因，不代替音訊驗收。
- 使用外部錄音或可校驗的實際輸出擷取配合聆聽；需排除錄音鏈自身 clipping。手機螢幕錄影會增加負載，錄影與非錄影量測應分開。
- 嚴格「音樂不中斷」的測試門檻：穩態非刻意暫停段 underflow/drop 為零，實際輸出無可聽斷裂、音高／速度異常，且長測無回歸。即使通過，也只代表該機型、版本、遊戲、場景與時長，不能保證所有 iPhone。
- 額外測試切背景再返回、鎖屏恢復、暫停／繼續與切換遊戲；背景不保證持續播放，驗收重點是回到前景後正確恢复且不播放舊 queue。

注意：現有 `n64Benchmark=1` 不會自動保留正常手機的 triangle streaming。比較目前預設時須明確設定 `n64PersistentBuffers=1` 並確認 fork；否則會誤測成較慢的 Rice baseline。`n64Timing` 也只有啟用 benchmark 時才被解析。现有三組 mobile short-test 已完成，不作為本輪重測要求。

## 本次交付狀態

已完成靜態評估與驗收設計。尚未補新 telemetry、改寫 renderer 或進行實機測試；目前沒有可操作的目標 iPhone 連線。下一個合理實作是輸出端診斷，而非未經量測就更換正式預設。