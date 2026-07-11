# 模擬核心優化與相容性計畫

## 本輪已完成

- N64 所有手機 profile 固定為 320x240，並啟用 Rice `SkipFrame`；高階 iOS 保留 rAF 排程。
- N64 首頁說明改為「建議在電腦上玩」。
- 遊戲畫面下方 `H5-NES` 標題可返回主機選單；確認後先保存 SRAM、停止模擬與 N64 backend，再還原首頁。
- N64 profile 測試與完整 production build 通過。
- 所有原生確認與錯誤提示已改為和遊戲讀取卡一致的站內對話框，供全部主機共用。
- 伺服器提供 `Content-Length` 時顯示真實下載百分比，ZIP 解壓顯示 JSZip 實際進度；無可靠資料時不顯示百分比。
- NES 未實作 mapper、NES 2.0 與 GB 未實作 MBC 不再靜默降級，改為明確拒絕載入。
- 修正 SNES 65816 16-bit decimal ADC 無法設定 carry，並加入 `9999 + 1` 回歸測試。

## N64 最終評估

目前可玩後端已經是 `mupen64plus-web` 的 WebAssembly dynamic recompiler，搭配 Rice/WebGL2。`nes-wasm/src/n64` 只是尚無音訊、RCP、PIF/SI 與完整 CPU 的 scaffold，不能取代現有後端。

### 問題判斷

- Zelda 開場閃退：優先懷疑行動瀏覽器 Wasm heap/頁面記憶體上限、runtime heap growth 或 GPU driver/context loss。僅降低 canvas CSS 尺寸不會解決，降低 render target 與避免 ROM/backend 重複存活才有幫助。
- Mario Kart 計時變慢：代表 VI/s 低於 real-time，主因是單執行緒 dynarec + Rice render workload；不是單純顯示幀率問題。
- Mario 64 開場跑版：現有流程已建立獨立 WebGL canvas，並在 Mupen 啟動前後送 resize pulse、固定 4:3 backing store。本輪保留此修正；仍需真機截圖回歸。

### 建議路線

1. **P0 真機量測與穩定性**
   - 在 telemetry 增加 `performance.memory`（可用瀏覽器）、WebGL context lost、頁面 visibility、裝置/profile 與啟動階段標記。
   - Android Chrome 與 iPhone Safari 各跑 Zelda 開場 10 分鐘、Mario Kart 3 場、Mario 64 開場，記錄 VI/s、long VI、recompile 與崩潰前最後階段。
   - 設定驗收門檻：Mario Kart 平均至少 56 VI/s；Zelda 開場不閃退；Mario 64 首畫面保持 4:3 且無裁切。

2. **P1 現有後端低風險優化**
   - 比較 timer 與 rAF profile，不以裝置名稱猜測，依真機 telemetry 選擇。
   - 檢查 Mupen heap 初始值/成長策略、ROM 所有權與停止後資源釋放；避免同時保留可回收的大型 buffer。
   - 逐遊戲測試 Rice 選項；影響正確性的選項只建立 game override，不全域關閉。
   - 加入 context-loss UI，讓 GPU context 被系統回收時能回首頁並顯示原因，而非整頁無訊息退出。

3. **P2 替換核心 PoC，完成後再決定遷移**
   - 以維護中的成熟 N64 核心做獨立 PoC，必須包含 VR4300 dynarec、RSP、RDP、AI、PIF、存檔與三款驗收遊戲；不延伸目前 Rust scaffold 自研完整 N64。
   - 評估 WebAssembly threads/SIMD 版本。Threads 需要 COOP/COEP，部署、ROM 下載、第三方資源與 iOS 相容性必須一起驗證。
   - 只有 PoC 在目標手機比現有後端至少快 20%，且三款遊戲相容性不退步，才進行正式替換。

4. **WebGPU 決策**
   - WebGPU 只能改善 RDP 圖形工作，不能直接加速 VR4300/RSP 與 dynarec。
   - 自行開發 WebGPU RDP backend 工作量高，包含 combiner、depth、coverage、framebuffer effects、texture cache 與大量遊戲例外，不列為短期修復。
   - 建議等待或採用已有成熟 WebGPU renderer 的上游核心；保留 WebGL2 fallback，不能讓 WebGPU 成為唯一啟動條件。

## 各主機掃描結果與計畫

### FC / NES

- **現況**：正式路徑是 Rust/Wasm；支援 mapper 0、1、2、3、4、7、11、15、16、23、66、71、113、202、225、227、245、253。
- **已知風險**：NES 2.0 submapper/擴充容量尚未解析；正式 Rust CPU/PPU/APU 的自動測試覆蓋仍低。
- **已完成一部分**：不支援的 mapper 與 NES 2.0 不再靜默使用 Mapper 0，會顯示統一的不支援錯誤；後續再增加 mapper/submapper 精確編號。
- **P0**：建立 Rust/Wasm conformance runner，加入 nestest、blargg CPU/PPU/APU、MMC3 IRQ 與 sprite hit 測試。
- **P1**：依實際 ROM 清單統計缺少 mapper，再按遊戲覆蓋率實作，不按 mapper 編號順序盲目增加。
- **P1**：補 APU golden audio/hash 測試，涵蓋 frame counter、DMC DMA/IRQ、sweep 與 region timing。

### SFC / SNES

- **現況**：已有 65816、PPU Mode 0-7、SPC700/S-DSP、DMA/HDMA、DSP-1 與 CX4。
- **已知風險**：SPC700 未涵蓋的 opcode 目前當 NOP；記憶體速度函式未接入；特殊晶片只支援 DSP-1/CX4。
- **P0**：建立 SPC700 全 256 opcode、cycle 與旗標測試，移除 unknown-as-NOP；修正後跑 Secret of Mana、Chrono Trigger、FF6 音訊回歸。
- **已完成一部分**：修正 16-bit decimal ADC carry 並加入邊界回歸測試；後續仍需補 binary/decimal ADC/SBC 表格測試及 NMI/IRQ、WAI/STP、emulation/native mode 測試。
- **P0**：建立 PPU screenshot/hash suite，涵蓋 Mode 5/7、window/color math、OAM priority、HDMA 與 overscan/interlace。
- **P1**：接入 slow/fast ROM 與 I/O bus timing，使用 CPU/PPU/APU 同步測試驗證，避免只靠單款遊戲調參。
- **P2**：特殊晶片按 ROM 需求選擇成熟核心整合或個別實作。SA-1、SuperFX、S-DD1、SPC7110 遊戲在完成前明確標示不支援。

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
