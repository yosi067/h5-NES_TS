# 模擬核心優化與相容性計畫

> 現況：各主機已不再靜默降級未支援的格式，並完成若干時序修正。下一步的重點是先擴充正式 Rust/Wasm 核心的 conformance 測試，再修改硬體時序。
> N64 的詳細計畫另見 [N64_CORE_OPTIMIZATION_PLAN.md](N64_CORE_OPTIMIZATION_PLAN.md)。

## 已完成

**共用 UI 與音訊**

- 所有原生確認與錯誤提示，都改用與遊戲讀取卡一致的站內對話框。
- 伺服器提供 `Content-Length` 時顯示實際下載百分比；ZIP 解壓時顯示 JSZip 的實際進度；沒有可靠資料時不顯示百分比。
- 點選遊戲畫面下方的 `H5-NES` 標題可以返回主機選單。確認後會先保存 SRAM，再停止模擬與 N64 backend，最後還原首頁。
- 音訊輸出從 deprecated 的 `ScriptProcessorNode` 遷移到 AudioWorklet；模擬的開始、停止與靜音狀態會同步到音訊執行緒。

**N64**

- 所有手機 profile 都固定為 320x240。iOS 使用 cached interpreter、rAF 與 no-SkipFrame；Android 依 profile 使用 dynamic recompiler、timer 與 SkipFrame。
- 手機使用 64 MiB fork + triangle streaming ring；桌機使用 npm runtime，可用 `?n64Runtime=npm` 回退。
- SDL 發生 underrun 時保留可播放的前段，只對不足的尾端補靜音。
- 首頁說明改為「建議在電腦上玩」。N64 profile 測試與完整 production build 均通過。

**NES**

- 未實作的 mapper 與 NES 2.0 擴充格式會明確拒絕載入，不再靜默改用 Mapper 0。既有 mapper 的 NES 2.0 submapper 0 與標準容量編碼可正常載入。
- IRQ 改為依 APU/Mapper 的當前 level 重算。MMC3 IRQ 只在 `$E000` acknowledge 後解除，修正 Captain Tsubasa II 的幽靈 IRQ 與 stack frame 損壞；已加入回歸測試。Captain Tsubasa II 與 Super Mario Bros. 3 已通過瀏覽器啟動畫面驗證。
- 加入 NTSC frame PPU clock 基線測試。

**SNES**

- 修正 65816 16-bit decimal ADC 無法設定 carry 的問題，並加入 `9999 + 1` 回歸測試。
- SPC700 的 256 個 opcode 由 exhaustive match 強制覆蓋，移除 unknown-as-NOP fallback。
- slow ROM、FastROM、WRAM/I/O bus access penalty 已接入每條指令的 master clock 計算。
- 水平捲動改用硬體的 PPU1/PPU2 雙 latch，細捲動可以逐像素更新，並有 0-15px 的 register-level 回歸測試。

**GB**

- 未實作的 MBC 或 cartridge type 會明確拒絕載入，不再降級為 NoMBC。

## N64

目前可玩的後端是 `mupen64plus-web` 1.5.7（Mupen64Plus + Rice/WebGL2）。手機使用可重建的 64 MiB fork 與 triangle streaming ring，桌機使用 npm runtime。`nes-wasm/src/n64` 只是 scaffold，還沒有音訊、RCP、PIF/SI 與完整 CPU，不能取代現有後端。主要瓶頸是 Rice 的 GL draw 入口與 WebGL 資料提交，不是 VR4300。

後續路線依序是：renderer batching 與同步等待；現有後端的低風險優化，包括逐遊戲 Rice override 與 context-loss UI；接著做替換核心 PoC。PoC 要使用維護中的成熟核心，必須包含 VR4300 dynarec、RSP、RDP、AI、PIF 與存檔，不延伸 Rust scaffold 自行開發；只有在目標手機至少快 20%，且三款驗收遊戲相容性不退步時才替換。最後才評估 WebGPU。WebGPU 只能改善 RDP 圖形工作，必須保留 WebGL2 fallback；Threads 版本需要 COOP/COEP。最終驗收要在 Android Chrome 與 iPhone Safari 各測 15 分鐘。

完整的數據、決策與分階段計畫見 [N64_CORE_OPTIMIZATION_PLAN.md](N64_CORE_OPTIMIZATION_PLAN.md)，iPhone 音訊見 [N64_IPHONE_AUDIO.md](N64_IPHONE_AUDIO.md)。

## 各主機待辦

### FC / NES

正式路徑是 Rust/Wasm，支援 mapper 0、1、2、3、4、7、11、15、16、23、66、71、113、202、225、227、245、253。目前的風險是 NES 2.0 擴充 mapper、submapper 與容量尚未實作，且正式 CPU/PPU/APU 的自動測試覆蓋偏低。

- **P0**：建立 Rust/Wasm conformance runner，加入 nestest、blargg CPU/PPU/APU、MMC3 A12 edge timing 與 sprite hit 測試。
- **P1**：依實際 ROM 清單統計缺少哪些 mapper，再按遊戲覆蓋率實作，不依 mapper 編號順序增加。
- **P1**：補 APU golden audio/hash 測試，涵蓋 frame counter、DMC DMA/IRQ、sweep 與 region timing。

### SFC / SNES

已有 65816、PPU Mode 0-7、SPC700/S-DSP、DMA/HDMA、DSP-1 與 CX4。SPC700 的 cycle 與旗標仍缺少自動測試；特殊晶片目前只支援 DSP-1 與 CX4。

- **P0**：建立 SPC700 全部 256 個 opcode 的 cycle 與旗標測試，並以 Secret of Mana、Chrono Trigger、FF6 做音訊回歸。
- **P0**：補 binary/decimal ADC/SBC 表格測試，以及 NMI/IRQ、WAI/STP、emulation/native mode 測試。
- **P0**：建立 PPU screenshot/hash suite，涵蓋 Mode 5/7、window/color math、OAM priority、HDMA、overscan/interlace，以及水平捲動的實機場景。
- **P1（進行中）**：補 NMI/IRQ、WAI 與 DMA/HDMA 的邊界同步測試。
- **P2**：特殊晶片依 ROM 需求選擇整合成熟核心或個別實作。SA-1、SuperFX、S-DD1、SPC7110 遊戲在完成前要明確標示不支援。

### Game Boy / Game Boy Color

目前是 DMG 核心，支援 MBC1/MBC3/MBC5。副檔名接受 `.gbc`，但尚未證明支援完整的 CGB 模式。

- **P0**：若未實作 CGB VRAM/WRAM bank、彩色 palette、double speed 與 HDMA，UI 應標示為 DMG 相容模式，不宣稱完整支援 GBC。
- 補 MBC2、HuC1/HuC3 與 RTC 持久化測試。

### Game Gear / Master System

兩者共用 Z80/VDP/PSG 與 Sega mapper。

- **P1**：加入 ZEXALL/ZEXDOC、VDP scanline/IRQ、sprite overflow/collision 與 PSG waveform 測試。
- **P2**：依 ROM 需求補 Codemasters/Korean mapper、YM2413 FM、PAL timing 與 3D glasses；未支援的硬體要在載入時提示。

### FBNeo Arcade

使用成熟的外部 Wasm 核心，但 UI 只接受固定的 17 個 driver/ZIP set，bundle 約 25 MB。

- **P1**：把 driver 支援清單、ROM CRC 與缺檔訊息結構化，並驗證切換遊戲後 Wasm instance 可以回收。
- **P2**：拆分 arcade chunk/runtime 的預載策略，避免不玩街機的使用者承擔下載與記憶體成本。

## 測試基線說明

- `tests/cpu.test.ts`、`tests/ppu.test.ts`、`tests/mapper.test.ts` 測的是舊 TypeScript 核心，不是正式的 Rust/Wasm 遊戲路徑。本輪執行時仍有大量既有失敗，不能用來證明正式核心的準確率。
- Rust 原始碼只有 N64 cartridge、NES mapper、GB MBC 與 SNES decimal ADC 的少量單元測試，距離 CPU/PPU/APU conformance coverage 還很遠。應先擴充正式核心測試，再修改硬體時序，以免修好一款遊戲卻弄壞另一款。
