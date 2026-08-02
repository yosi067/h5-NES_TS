# 模擬核心優化與相容性計畫

## 本輪已完成

- N64 所有手機 profile 固定為 320x240；iOS 使用 cached interpreter、rAF 與 no-SkipFrame，Android 依 profile 使用 dynamic recompiler、timer 與 SkipFrame。
- 手機正式路徑改用可重建的 64 MiB Mupen fork與 Rice triangle streaming ring；桌機維持 npm runtime，並保留 `?n64Runtime=npm` 回退。
- N64 SDL underrun 改為保留可播放前段、只將不足尾端補靜音；較大 iOS buffer 與 rectangle ring 因 A/B 未達門檻而不採用。
- N64 首頁說明改為「建議在電腦上玩」。
- 遊戲畫面下方 `H5-NES` 標題可返回主機選單；確認後先保存 SRAM、停止模擬與 N64 backend，再還原首頁。
- N64 profile 測試與完整 production build 通過。
- 所有原生確認與錯誤提示已改為和遊戲讀取卡一致的站內對話框，供全部主機共用。
- 伺服器提供 `Content-Length` 時顯示真實下載百分比，ZIP 解壓顯示 JSZip 實際進度；無可靠資料時不顯示百分比。
- NES 未實作 mapper、NES 2.0 與 GB 未實作 MBC 不再靜默降級，改為明確拒絕載入。
- 修正 SNES 65816 16-bit decimal ADC 無法設定 carry，並加入 `9999 + 1` 回歸測試。
- 音訊輸出從 deprecated `ScriptProcessorNode` 遷移到 AudioWorklet，模擬開始、停止與靜音狀態會同步到音訊執行緒。
- SPC700 的 256 個 opcode 已由 exhaustive match 強制覆蓋；移除 unknown-as-NOP fallback。
- SNES CPU 已將 slow ROM、FastROM、WRAM/I/O bus access penalty 接入每條指令的 master clock 計算。
- NES 正式 Rust 核心已加入 NTSC frame PPU clock 基線測試。
- NES IRQ 改為由 APU/Mapper 當前 level 重算；MMC3 IRQ 只在 `$E000` acknowledge 後解除，修正 Captain Tsubasa II 的幽靈 IRQ/stack frame 損壞。
- NES 2.0 已安全接受既有 mapper、submapper 0 與標準容量編碼；擴充 mapper/submapper/容量仍明確拒絕。
- SNES 水平捲動改用硬體的 PPU1/PPU2 雙 latch，細捲動可逐像素更新，不再量化成 8px 階梯。

## N64 最終評估

目前可玩後端是 `mupen64plus-web` 1.5.7、Mupen64Plus 與 Rice/WebGL2；iOS 正式 profile 使用 cached interpreter，Android/desktop 使用 dynamic recompiler。`nes-wasm/src/n64` 只是尚無音訊、RCP、PIF/SI 與完整 CPU 的 scaffold，不能取代現有後端。固定 commit、Emscripten 3.1.25、版本化資產與 64 MiB initial memory 已讓 fork 可重建並避免 Asyncify rewind 越界與 Git/preload cache 混版。

### 問題判斷

- 啟動越界：已定位為 instrumented fork 沿用 588-page initial memory，提升為 64 MiB 後三款驗收遊戲均能完成 Wasm/SDL/Rice 啟動。
- 畫面裁切：已改為 SDL/Rice 初始化期間固定 profile 尺寸，第一個 VI 後才恢復 responsive CSS，不再依賴假的 resize/orientation pulse。
- 速度瓶頸：Super Mario 64 true null-video 為 60.0 VI/s、Rice no-draw 為 59.98 VI/s；正常 Rice 只有 27.20 VI/s，約 27.84 ms/VI 位於 GL draw 入口與 WebGL 資料提交。
- 已採用優化：triangle streaming ring 在 iPhone 固定場景由 16.71 提升至 38.22 VI/s，DList 由 48.16 降至 18.70 ms，audio underruns 由 706 降至 290。
- 已否決調整：rectangle ring 為 37.7 VI/s、449 underruns；4096/2048 iOS buffer 為 37.9 VI/s、435 underruns，均未優於 triangle-only 的 38.22 VI/s、290 underruns。

### 建議路線

1. **P0 renderer batching 與同步等待**
   - 以已採用的 triangle streaming ring 為唯一基準，細分 driver draw、buffer upload 與同步等待，不再重跑已結案的 baseline/full/audio buffer 組合。
   - 評估跨 draw batching；每次大型調整先完成本機重建、三款遊戲 smoke test，再安排一次手機驗收。
   - 最終驗收補 Android Chrome 與 iPhone Safari 各 15 分鐘穩定性，記錄 VI/s、long VI、draw timing、audio underruns 與 context loss。

2. **P1 現有後端低風險優化**
   - 維持 iOS 3072/1024 audio buffers與 partial-underrun 輸出；剩餘爆音先從 renderer stall 處理，不再增加 buffer latency。
   - 逐遊戲測試 Rice 選項；影響正確性的選項只建立 game override，不全域關閉。
   - 加入 context-loss UI，讓 GPU context 被系統回收時能回首頁並顯示原因，而非整頁無訊息退出。

3. **P2 替換核心 PoC，完成後再決定遷移**
   - 以維護中的成熟 N64 核心做獨立 PoC，必須包含 VR4300 dynarec、RSP、RDP、AI、PIF、存檔與三款驗收遊戲；不延伸目前 Rust scaffold 自研完整 N64。
   - 評估 WebAssembly threads/SIMD 版本。Threads 需要 COOP/COEP，部署、ROM 下載、第三方資源與 iOS 相容性必須一起驗證。
   - 只有 PoC 在目標手機比現有後端至少快 20%，且三款遊戲相容性不退步，才進行正式替換。

4. **WebGPU 決策**
   - null-video/no-draw 已證明 renderer 有足夠改善空間，但仍先完成低風險 WebGL batching 與同步等待優化。
   - 若 Rice 仍無法接近約 10.55 ms/VI 預算，再建立單一固定場景的 WebGPU prototype；整體提升至少 20%且三款遊戲無阻斷性圖形錯誤才擴大。
   - WebGPU 只能改善 RDP 圖形工作，不能直接加速 VR4300/RSP；必須保留 WebGL2 fallback。

## 各主機掃描結果與計畫

### FC / NES

- **現況**：正式路徑是 Rust/Wasm；支援 mapper 0、1、2、3、4、7、11、15、16、23、66、71、113、202、225、227、245、253。
- **已知風險**：NES 2.0 擴充 mapper/submapper/容量尚未實作；正式 Rust CPU/PPU/APU 的自動測試覆蓋仍低。
- **已完成一部分**：不支援的 mapper 與 NES 2.0 擴充格式不再靜默使用 Mapper 0；既有 mapper 的 NES 2.0 submapper 0 可載入，錯誤會顯示統一的不支援訊息。
- **已完成一部分**：MMC3 IRQ 已改為 level-sensitive 並加入 acknowledge 回歸測試；Captain Tsubasa II 與 Super Mario Bros. 3 已通過瀏覽器啟動畫面驗證。
- **P0**：建立 Rust/Wasm conformance runner，加入 nestest、blargg CPU/PPU/APU、MMC3 A12 edge timing 與 sprite hit 測試。
- **P1**：依實際 ROM 清單統計缺少 mapper，再按遊戲覆蓋率實作，不按 mapper 編號順序盲目增加。
- **P1**：補 APU golden audio/hash 測試，涵蓋 frame counter、DMC DMA/IRQ、sweep 與 region timing。

### SFC / SNES

- **現況**：已有 65816、PPU Mode 0-7、SPC700/S-DSP、DMA/HDMA、DSP-1 與 CX4。
- **ROM audit 基線**：`npm run snes:audit` 目前掃描 `public/roms.json` 的 37 款 SNES catalog entry，37/37 header 有效；其中 32 款無 enhancement chip、2 款 CX4、1 款 DSP-1、1 款 SA-1、1 款 S-DD1。現有工作區的 49 款目標數尚未全部出現在這份 catalog，不能把 37 款結果宣稱為完整 49 款驗收。
- **Native smoke 基線**：`npm run snes:smoke` 已加入 framebuffer 實際變更計數、BRK/CPU stopped/force blank/零輸出 warnings、SRAM round-trip 與 save-state v14 下一幀 replay。Super Mario RPG（SA-1）、Star Ocean（S-DD1）與 Super Mario Kart（DSP-1）目前都以暫時 native-diagnostic routing 通過 600-frame acceptance；Super Mario RPG 另通過延長至 3600 frames 的同長度 deterministic baseline comparison。報告保存於 `artifacts/snes-smoke-report.json`。短啟動窗口的零振幅音訊不單獨視為失敗，但零樣本與零 framebuffer 會明確列為驗收警告。`src/snes/snes-routing.ts` 的 `TEMPORARY_SNES9X_FALLBACK_ENABLED` 目前為 `false`，三款遊戲會先嘗試 Rust/WASM；若 native load failure，既有 generic Snes9x fallback 仍會接手，將 flag 改回 `true` 可恢復受保護遊戲的預設 fallback。
- **已知風險**：SPC700 雖已明確覆蓋全部 opcode，但 cycle 與旗標的自動測試仍不足；S-DD1 的 600-frame Star Ocean acceptance 已通過，後續風險集中在更長時間與獨立 oracle 的差異對照；SA-1 已能以 shared 65816 engine 執行，並已接入保守的每掃描線 scheduler、interrupt source/向量、independent timer reference crossing、S-CPU/SA-1 flag domains、BMAP C/D/E/F ROM windows、character-conversion DMA、normal-DMA source/destination matrix 與 deterministic bus reservation。現在已有 `snes:sa1-oracle` harness、typed bus owner/region/arbiter trace、BMAP bank/megabyte boundary coverage 與 DMA/timer/NMI/IRQ handler corpus；但 Super Mario RPG 的 real-ROM oracle 收到 6506 個 CPU events、23275 個 typed events、0 個 DMA/timer/IRQ/NMI events，且 `sa1Progress.startupPollOnly=true`。新增的 handshake report 證明 SA-1 反覆讀取 IRAM `$0000` 的 `00`，S-CPU 在 loop 前只對對應的 `$00:3000` 寫入一次 `00`，尚未證明任何 register side effect 會釋放它，因此 hardware-event acceptance 仍未通過。
- **P0**：建立 SPC700 全 256 opcode 的 cycle 與旗標測試；跑 Secret of Mana、Chrono Trigger、FF6 音訊回歸。
- **已完成一部分**：native smoke runner 已建立可支援 ROM 的 framebuffer/audio/SRAM/save-state 基線；save-state schema 已升至 v14，包含 CPU/APU phase、PPU framebuffer/latch、controller latch、emulator timing flags、S-DD1 enable/bank/DMA capture state、pending S-DD1 decompressed DMA buffer、SA-1 register/IRAM/BW-RAM state、SA-1 reset/NMI/IRQ vectors、SA-1 interrupt/timer/normal-DMA state、normal-DMA bus reservation、character-conversion buffer 與 SA-1 65816 CPU context。import 仍相容 v1-v14。native S-DD1 的 Star Ocean 與 native diagnostic 的 Super Mario RPG 都已完成 600-frame acceptance，且 Mario RPG 已完成 3600-frame deterministic run；Mario RPG 的 user-facing routing 仍維持 Snes9x fallback。
- **已完成一部分**：修正 16-bit decimal ADC carry 並加入邊界回歸測試；SA-1 已補上 masked-IRQ/NMI WAI wake、STP non-wake、STP reset release、timer/DMA source clear 後 re-arm 與 character-DMA S-CPU source clear regression；後續仍需補 binary/decimal ADC/SBC 表格測試及 emulation/native mode 測試。
- **P0**：建立 PPU screenshot/hash suite，涵蓋 Mode 5/7、window/color math、OAM priority、HDMA 與 overscan/interlace。
- **已完成一部分**：BG 水平捲動改用 PPU1/PPU2 雙 latch，並有 0-15px register-level 回歸測試；仍需建立實機場景 screenshot/hash 驗證。
- **P1（進行中）**：slow/fast ROM 與 I/O bus penalty 已接入一般 CPU 指令；後續補 NMI/IRQ、WAI 與 DMA/HDMA 邊界同步測試。
- **P2**：特殊晶片按 ROM 需求選擇成熟核心整合或個別實作。S-DD1 的 Star Ocean 已完成 native execution path 與 600-frame acceptance，包含 decoder、DMA source window、bank mapping、MMIO enable lifecycle 與 save-state v14；後續仍可補更長時間的獨立 oracle 對照。SA-1 已開放 native loader 進行 Phase 2 diagnostic，且 Super Mario RPG 已完成 600-frame 與 3600-frame diagnostic、structured `sa1Evidence`、typed oracle trace、save-state replay 與同長度 deterministic baseline；synthetic timer/flag/DMA/arbitration/BMAP/handler regressions 已補上，Rust library suite 為 104 tests passed，但 real-ROM hardware event oracle 仍因 DMA/timer/IRQ/NMI 全為 0 而 fail-closed，handshake blocker 已記錄於 `docs/DEVELOPMENT.md`。研究期間 `TEMPORARY_SNES9X_FALLBACK_ENABLED=false`，三款受保護遊戲先走 Rust/WASM diagnostics；完整 native acceptance 前，將 flag 改回 `true` 即恢復既定 Snes9x fallback。SuperFX、SPC7110 遊戲在完成前明確標示不支援，Snes9x fallback 僅作未完成裝置的相容路徑。

### Game Boy / Game Boy Color

- **現況**：DMG 核心與 MBC1/MBC3/MBC5；副檔名接受 `.gbc`，但文件與核心能力未證明完整 CGB 模式。
- **P0**：若未實作 CGB VRAM/WRAM bank、彩色 palette、double speed 與 HDMA，UI 應標示為 DMG 相容模式，不宣稱完整 GBC。
- **已完成一部分**：不支援 cartridge type 不再降級 NoMBC；後續補 MBC2、HuC1/HuC3 與 RTC 持久化測試。

### Game Gear / Master System

- **現況**：共用 Z80/VDP/PSG 與 Sega mapper。
- **P1**：加入 ZEXALL/ZEXDOC、VDP scanline/IRQ、sprite overflow/collision 與 PSG waveform 測試。
- **P2**：依 ROM 需求補 Codemasters/Korean mapper、YM2413 FM、PAL timing 與 3D glasses；未支援硬體要在載入時提示。

### FBNeo Arcade

- **現況**：成熟外部 Wasm 核心，但 UI 只接受固定 17 個 driver/ZIP set；bundle 約 25 MB。
- **P1**：把 driver 支援清單、ROM CRC 與缺檔訊息結構化；切換遊戲後驗證 Wasm instance 可回收。
- **P2**：分離 arcade chunk/runtime 預載策略，避免不玩街機的使用者承擔下載與記憶體成本。

## 測試基線說明

- `tests/cpu.test.ts`、`tests/ppu.test.ts`、`tests/mapper.test.ts` 測的是舊 TypeScript 核心，不是正式 Rust/Wasm 遊戲路徑；本輪執行時仍有大量既有失敗，不能作為正式核心的準確率證明。
- Rust 原始碼已有 N64 cartridge、NES mapper、GB MBC 與 SNES decimal ADC 的少量單元測試，但距離 CPU/PPU/APU conformance coverage 仍很遠。後續優化應先擴充正式核心測試，再修硬體時序，否則容易修好一款、弄壞另一款。
