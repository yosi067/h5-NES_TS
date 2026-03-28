# H5-EMU 多平台復古遊戲模擬器

一個使用 HTML5 Canvas + TypeScript 前端搭配 Rust/WebAssembly 核心開發的多平台復古遊戲模擬器，目前支援 **NES (FC)**、**Game Boy (DMG)**、**Game Gear / Master System** 與 **SFC / SNES (超級任天堂)**。

---

## 🎮 支援平台

| 平台 | 解析度 | CPU | 幀率 | 音頻聲道 | 狀態 |
|------|--------|-----|------|----------|------|
| **NES / FC** | 256×240 | 6502 (1.789 MHz) | 60.0988 fps | 5 (2 方波 + 三角 + 雜訊 + DMC) | ✅ 完整支援 |
| **Game Boy (DMG)** | 160×144 | LR35902 (4.194 MHz) | 59.7275 fps | 4 (2 方波 + 波形 + 雜訊) | ✅ 完整支援 |
| **Game Gear** | 160×144 (內部 256×192) | Z80 (3.58 MHz) | 59.9227 fps | 4 (3 方波 + 雜訊, GG 立體聲) | ✅ 新增支援 |
| **Master System** | 256×192 | Z80 (3.58 MHz) | 59.9227 fps | 4 (3 方波 + 雜訊) | ✅ 新增支援 |
| **SFC / SNES** | 256×224 | 65816 (3.58 MHz) + SPC700 (1.024 MHz) | 60.0988 fps | 8 (S-DSP 8 聲道 BRR) | 🟣 新增支援 |

### 自動偵測 ROM 格式

載入 ROM 檔案時，模擬器會根據副檔名與檔案標頭自動判別格式：
- 檔案開頭為 `NES\x1A` (iNES 標頭) → **NES 核心**
- 副檔名 `.gg` → **Game Gear 核心** (160×144 GG 視窗裁切)
- 副檔名 `.sms` → **Master System 核心** (256×192 全畫面)
- 副檔名 `.sfc` / `.smc` → **SNES 核心** (256×224)
- 其他 (`.gb` / `.gbc`) → **Game Boy 核心**

無需手動選擇平台，選擇對應副檔名的遊戲即可直接開始。

---

## 🎮 NES 模擬器的發展歷史

**Nintendo Entertainment System (NES)**，在日本稱為 **Family Computer (FC/紅白機)**，是任天堂於 1983 年推出的 8 位元家用遊戲機。這台主機奠定了現代電子遊戲產業的基礎，也催生了《超級瑪利歐兄弟》、《薩爾達傳說》、《洛克人》等經典作品。

### 模擬器發展里程碑

| 年代 | 發展 |
|------|------|
| **1990s 初期** | 最早的 NES 模擬器開始出現，如 **iNES** (1996) 和 **NESticle** (1997)，開創了遊戲模擬的先河 |
| **2000s** | **FCEUX** 成為研究與 TAS (Tool-Assisted Speedrun) 的標準工具，模擬精確度大幅提升 |
| **2010s** | **Nestopia** 和 **Mesen** 實現了週期精確 (Cycle-Accurate) 模擬，幾乎完美重現原始硬體行為 |
| **2020s** | 瀏覽器技術成熟，WebAssembly 與 Web Audio API 讓高品質 NES 模擬在瀏覽器中成為可能 |

NES 模擬器的開發一直是程式設計師學習底層系統架構的絕佳途徑。透過實作 6502 CPU、PPU 圖形處理器、APU 音頻處理器，開發者能深入理解計算機運作的本質。

---

## 🤖 AI 輔助 TypeScript 開發的價值

本專案採用 **AI 輔助開發** 與 **TypeScript** 的組合，展現了現代軟體開發的新典範：

### 為什麼選擇 TypeScript？

1. **類型安全**：NES 模擬器涉及大量位元運算與記憶體操作，TypeScript 的靜態類型系統能在編譯時期捕捉錯誤
2. **程式碼可讀性**：明確的介面定義讓複雜的硬體模擬邏輯更易理解與維護
3. **IDE 支援**：強大的自動完成與重構功能加速開發流程
4. **現代 Web 生態**：與 Vite、Vitest 等現代工具無縫整合

### AI 輔助開發的優勢

1. **知識密集型任務**：NES 硬體規格繁複，AI 能快速提供準確的技術參考
2. **樣板程式碼生成**：CPU 指令集、Mapper 實作等重複性高的程式碼可由 AI 協助產生
3. **除錯與最佳化**：AI 能協助分析效能瓶頸、追蹤模擬錯誤
4. **跨領域整合**：從 Web Audio API 到觸控事件處理，AI 協助整合不同技術領域

這個專案證明了 **人機協作** 的力量——開發者提供架構設計與品質把關，AI 提供實作細節與技術參考，共同完成複雜的系統開發。

---

## 專案目標

在瀏覽器中完整模擬多款經典遊戲主機，目前支援：

### NES (FC)
- 完整的 6502 CPU 指令集
- PPU 圖形渲染 (256×240 解析度)
- APU 音頻輸出 (5 聲道)
- 標準控制器輸入
- 18 種 Mapper 支援

### Game Boy (DMG) — 🆕 2026-03-01 新增
- 完整的 Sharp LR35902 CPU 指令集 (256 基本 + 256 CB 前綴 = 512 opcodes)
- PPU 掃描線渲染 (160×144，DMG 4 灰階綠色調色盤)
- APU 4 聲道音頻 (2 方波 + 波形表 + LFSR 雜訊)
- MBC 記憶體映射控制器 (MBC0/MBC1/MBC3/MBC5)
- 計時器 (DIV/TIMA/TMA/TAC)
- Joypad 輸入 (與 NES 共用按鍵映射)

### Game Gear / Master System — 🆕 最新新增
- 完整的 Zilog Z80 CPU 指令集 (含 DD/FD/ED/CB 全部前綴指令，約 2,965 行 Rust)
- VDP 掃描線渲染 (256×192 內部，GG 裁切為 160×144)
- PSG SN76489 音頻 (3 方波 + 雜訊，GG 立體聲)
- Sega Mapper 記憶體映射
- GG / SMS 雙模式支援 (Port $00 bit 0 區分)

### SFC / SNES (超級任天堂) — 🟣 最新新增
- 完整的 65816 CPU (16-bit 累加器/索引、24-bit 定址、模擬模式相容)
- PPU 掃描線渲染 (256×224，Mode 0-7 全支援)
  - Mode 7 仿射變換 (旋轉/縮放/透視)
  - OAM 精靈渲染 (128 精靈，每行最多 32 個)
  - 色彩數學 (加減法混合、半透明)
  - 視窗遮罩 (Window 1/2)
- SPC700 APU (獨立 64KB RAM，4 個 16-bit 計時器)
- DMA / HDMA (8 個 DMA 通道，含間接模式)
- DSP-1 協處理器 (Mode 7 3D 變換、投影、光柵運算)
- LoROM / HiROM 卡帶映射自動偵測
- 128KB WRAM + SRAM 存檔支援

---

## 🔧 最新更新 (2026-03-01) — Phase 2: Game Boy (DMG) 核心與多平台統一架構

### 🎮 Game Boy (DMG) 完整核心實作

在現有 NES 核心之外，新增完整的 Game Boy DMG 模擬核心（約 2,356 行 Rust），實現從 CPU 到音頻的全部硬體模擬。

#### Sharp LR35902 CPU (`gb/cpu.rs` + `gb/emulator.rs`)
- **暫存器**：A/F/B/C/D/E/H/L (8-bit)、SP/PC (16-bit)
- **16 位元暫存器對**：AF/BC/DE/HL，含讀寫存取器
- **旗標操作**：Z (Zero)、N (Subtract)、H (Half-Carry)、C (Carry) — 儲存於 F 暫存器 bit 7~4
- **指令集**：完整 512 opcodes
  - 基本指令 256 個 (0x00~0xFF)：載入、算術、邏輯、跳轉、呼叫/返回、旋轉、DAA、HALT/STOP
  - CB 前綴指令 256 個 (0xCB 0x00~0xFF)：RLC/RRC/RL/RR/SLA/SRA/SWAP/SRL/BIT/RES/SET
- **ALU 運算**：ADD/ADC/SUB/SBC/AND/XOR/OR/CP/INC/DEC，含完整的旗標計算
- **中斷處理**：優先級判斷 (VBlank > STAT > Timer > Serial > Joypad)、IME/EI 延遲、中斷向量分派
- **HALT 機制**：含 HALT bug 模擬 (IME=0 且有 pending 中斷時 PC 不遞增)
- **Post-Boot-ROM 初始狀態**：A=0x01, F=0xB0, SP=0xFFFE, PC=0x0100（跳過 Boot ROM）

#### PPU 掃描線渲染器 (`gb/ppu.rs`, 405 行)
- **狀態機**：Mode 2 (OAM Search, 80 dots) → Mode 3 (Pixel Transfer, ~172 dots) → Mode 0 (H-Blank) → Mode 1 (V-Blank)
- **暫存器**：LCDC/STAT/SCY/SCX/LY/LYC/BGP/OBP0/OBP1/WY/WX/DMA
- **背景渲染**：Tile Map ($9800/$9C00)、Tile Data ($8000/$8800 有號/無號模式)、SCX/SCY 捲軸
- **窗口渲染**：獨立行計數器、WX-7 偏移
- **精靈渲染**：8×8 / 8×16 模式、每行最多 10 個精靈、X 座標優先排序、翻轉 X/Y、BG-over-OBJ 優先級
- **DMG 綠色調色盤**：`[#E0F8D0, #88C070, #346856, #081820]`
- **STAT IRQ 邊緣偵測**：防止重複觸發 (Mode 0/1/2 + LYC=LY 條件)
- **幀緩衝區**：160×144×4 bytes (RGBA)

#### APU 4 聲道音頻 (`gb/apu.rs`, 611 行)
- **Channel 1 (方波+掃頻)**：Duty cycle (12.5%/25%/50%/75%)、頻率掃頻 (加/減法，含溢出檢查)、音量包絡
- **Channel 2 (方波)**：同 Channel 1 但無掃頻
- **Channel 3 (波形表)**：32 個 4-bit 樣本 (wave_ram[16])、音量位移 (0/右移1/右移2/靜音)
- **Channel 4 (雜訊)**：LFSR 線性反饋移位暫存器 (7-bit/15-bit 模式)、除數碼 + 時鐘位移
- **幀序列器**：512 Hz (8192 T-cycles/step)，8 步循環 (Length → Sweep → Length → ∅ → Length+Envelope → Sweep → Length+Envelope → ∅)
- **主控制**：NR50 (音量)、NR51 (聲道混音/平衡)、NR52 (電源/狀態)
- **音頻輸出**：立體聲混合 → 單聲道、高通濾波、取樣率 44100 Hz
- **暫存器讀寫遮罩**：$FF10~$FF3F 的正確 read-back mask

#### 卡帶與 MBC 記憶體映射控制器 (`gb/cartridge.rs`, 280 行)
- **ROM 標頭解析**：標題 ($0134)、卡帶類型 ($0147)、ROM 大小 ($0148)、RAM 大小 ($0149)
- **MBC0 (No MBC)**：32KB ROM 直接映射
- **MBC1**：5-bit ROM bank + 2-bit RAM/上位 ROM bank、Banking Mode 0/1
- **MBC3**：7-bit ROM bank、RTC 即時時鐘暫存器 (秒/分/時/日低/日高+Halt+Carry)、Latch 機制
- **MBC5**：9-bit ROM bank (分割於 $2000~$3FFF)、4-bit RAM bank
- **電池/RTC 偵測**：根據卡帶類型位元組自動判定

#### 計時器 (`gb/timer.rs`, 96 行)
- **16-bit 內部計數器**：DIV 為高 8 位元
- **TIMA/TMA/TAC**：可選頻率 4096/262144/65536/16384 Hz
- **下降沿偵測**：精確的 TIMA 遞增時機
- **溢出延遲**：4 T-cycles 後重載 TMA 並觸發 IRQ

#### Joypad 輸入 (`gb/joypad.rs`, 79 行)
- **按鈕矩陣**：動作按鈕 (A/B/Select/Start) 與方向鍵 (Up/Down/Left/Right) 分 bank 選取
- **Active-low 邏輯**：bit = 0 表示按下、1 表示放開
- **IRQ 偵測**：高到低轉換 (按鈕按下) 時請求 Joypad 中斷

### 🟠 Game Gear / Master System 完整核心實作

在 NES + GB 核心之外，新增完整的 Game Gear / Master System 模擬核心（約 2,965 行 Rust），基於 Zilog Z80 CPU 與 TMS9918 衍生 VDP 實現全硬體模擬。

#### Zilog Z80 CPU (`gg/cpu.rs` + `gg/emulator.rs`, 1,771 行)
- **暫存器**：A/F/B/C/D/E/H/L (8-bit)、SP/PC/IX/IY (16-bit)、影子組 A'/F'/B'/C'/D'/E'/H'/L'
- **16 位元暫存器對**：AF/BC/DE/HL、AF'/BC'/DE'/HL'、IX/IY
- **旗標操作**：S (Sign)、Z (Zero)、H (Half-Carry)、P/V (Parity/Overflow)、N (Subtract)、C (Carry) — F 暫存器 bit 7~0
- **中斷模式**：IM 0 / IM 1 / IM 2、IFF1/IFF2 翻轉旗標、NMI 不可遮蔽中斷
- **指令集**：完整 Z80 opcodes 含 4 組前綴
  - 基本指令 (0x00~0xFF)：載入、算術、邏輯、跳轉、呼叫/返回、I/O、區塊操作
  - CB 前綴 (位元操作)：RLC/RRC/RL/RR/SLA/SRA/SLL/SRL/BIT/RES/SET
  - DD 前綴 (IX 暫存器)：所有 HL 操作替換為 IX+d
  - FD 前綴 (IY 暫存器)：所有 HL 操作替換為 IY+d
  - ED 前綴 (擴展指令)：LDIR/LDDR/CPIR/CPDR/INI/IND/INIR/INDR/OUTI/OUTD/OTIR/OTDR、16-bit 算術 (ADC/SBC HL)、I/R 暫存器存取、RETI/RETN
  - DD CB / FD CB 前綴 (IX/IY 位元操作)：含 undocumented opcodes
- **ALU 運算**：ADD/ADC/SUB/SBC/AND/XOR/OR/CP/INC/DEC/DAA/CPL/NEG/CCF/SCF
- **DAA 精確實作**：採用 MAME/ZEXALL 公式，H 旗標使用 `(original_a ^ corrected_a) & 0x10`
- **區塊操作**：LDI/LDD/LDIR/LDDR (記憶體搬移)、CPI/CPD/CPIR/CPDR (記憶體搜尋)、INI/IND/INIR/INDR (I/O 輸入)、OUTI/OUTD/OTIR/OTDR (I/O 輸出)
- **INI/IND 修正**：B 遞減在 mem_write 之前執行（符合 Z80 硬體時序）
- **RETN undocumented**：0xED 0x5D/0x6D/0x7D 作為 RETN 別名

#### VDP 掃描線渲染器 (`gg/vdp.rs`, 593 行)
- **Mode 4 渲染**：TMS9918 衍生，SMS/GG 主要顯示模式
- **解析度**：內部 256×192，GG 模式裁切為 160×144 (水平偏移 48px、垂直偏移 24px)
- **Name Table**：基底位址 = `(reg[2] & 0x0E) << 10`，32×28 tiles (每 tile 2 bytes)
- **背景渲染**：水平/垂直捲軸、每 tile 可翻轉 X/Y、前景優先級 bit
- **精靈渲染**：最多 64 個精靈 (OAM)、每行最多 8 個、8×8 / 8×16 模式、Y 座標環繞 (Y >= 0xD1 時 wrap 到畫面頂部)
- **調色盤**：CRAM 64 bytes (GG: 4096 色 RGB444, SMS: 64 色 RGB222)
- **CRAM 寫入**：GG 模式偶數位址暫存、奇數位址與暫存值組合寫入 (12-bit 色彩)
- **中斷系統**：
  - Frame IRQ (`line_irq_pending`) 與 Line IRQ (`irq_pending`) 獨立追蹤
  - 行中斷計數器：每行遞減，歸零時重載 reg[10] 並設定 pending
  - VBlank 期間行計數器持續重載 reg[10]
  - `irq_pending` 動態計算：`line_irq_pending | (status & 0x80 != 0)`
- **V Counter**：0~261 (NTSC 262 行)，行 218 後設定 VBlank 旗標
- **暫存器**：Mode Control (reg[0]/reg[1])、Name Table (reg[2])、Sprite Table (reg[5])、Sprite Pattern (reg[6])、Overscan Color (reg[7])、H-Scroll (reg[8])、V-Scroll (reg[9])、Line Counter (reg[10])
- **控制埠 ($BF)**：讀取狀態/清除 IRQ、寫入暫存器/設定 VRAM 位址
- **幀緩衝區**：256×192×4 bytes (RGBA)，GG 模式從中裁切 160×144

#### PSG SN76489 音頻引擎 (`gg/psg.rs`, 273 行)
- **Channel 0~2 (方波)**：10-bit 頻率分頻器、50% duty cycle
- **Channel 3 (雜訊)**：LFSR 線性反饋移位暫存器 (16-bit)、白雜訊/週期雜訊模式、頻率可綁定 Channel 2
- **GG 立體聲**：Port $06 控制 L/R 聲道混音 (每 channel 2 bits)
- **音量控制**：4-bit 衰減器 (0=最大, 15=靜音)、衰減表 `[1.0, 0.794, 0.631, ...]`
- **時脈分頻**：Z80 3.58 MHz → PSG 以 16 分頻 tick
- **分數累加器**：精確的 tick 時序對齊
- **音頻輸出**：取樣率 44100 Hz，L/R 立體聲混合

#### 卡帶與 Sega Mapper (`gg/cartridge.rs`, 220 行)
- **ROM 載入**：支援 .gg / .sms 格式，自動處理 512 bytes header 偏移
- **Sega Mapper**：
  - $FFFC: RAM mapping control
  - $FFFD: Bank 0 (slot $0000~$3FFF)
  - $FFFE: Bank 1 (slot $4000~$7FFF)
  - $FFFF: Bank 2 (slot $8000~$BFFF)
- **卡帶 RAM**：最大 32KB，可映射到 $8000~$BFFF
- **GG/SMS 雙模式**：`is_game_gear` 旗標控制 Port $00 回傳值與 VDP 視窗裁切

#### Joypad 輸入 (`gg/joypad.rs`, 93 行)
- **Port $DC (Joypad 1)**：Up/Down/Left/Right/Button 1/Button 2 (active-low)
- **Port $DD (Joypad 2 + 雜項)**：Player 2 方向與按鈕
- **Port $00 (GG 專用)**：bit 0 = 0 (GG 模式) / 1 (SMS 模式)、bit 6 = Start 按鈕
- **Active-low 邏輯**：bit = 0 表示按下、1 表示放開

#### I/O 埠映射 (`gg/emulator.rs`)
- **$7E/$7F**：V Counter / H Counter (讀取)、PSG 資料 (寫入)
- **$BE/$BF**：VDP 資料/控制埠
- **$DC/$DD**：Joypad 輸入
- **$00**：GG 模式識別
- **$06**：GG 立體聲控制
- **$3E**：Memory Control
- **$F0~$F2**：YM2413 FM (不實作，回傳 $FF)

#### 匯流排與記憶體映射 (`gb/emulator.rs`, 804 行)
- **$0000~$7FFF**：Cartridge ROM (透過 MBC 映射)
- **$8000~$9FFF**：VRAM (8KB)
- **$A000~$BFFF**：External RAM (透過 MBC 映射)
- **$C000~$DFFF**：WRAM (8KB)
- **$E000~$FDFF**：Echo RAM (映射到 WRAM)
- **$FE00~$FE9F**：OAM (160 bytes)
- **$FF00~$FF7F**：I/O 暫存器 (Joypad/Serial/Timer/APU/PPU)
- **$FF80~$FFFE**：HRAM (127 bytes)
- **$FFFF**：IE 中斷致能暫存器
- **DMA 傳輸**：$FF46 寫入觸發 160 bytes OAM 搬移

### 🔗 統一 WASM 介面 (`EmuWasm`)

採用 **單一 WASM 二進位** 包含 NES + GB + GG 三核心，使用 Rust enum dispatch：

```rust
enum CoreType {
    None,
    Nes(emulator::Emulator),       // NES 核心
    Gb(gb::emulator::GbEmulator),  // GB 核心
    Gg(gg::emulator::GgEmulator),  // GG/SMS 核心
}
```

- **自動 ROM 偵測**：檢查前 4 bytes 是否為 `NES\x1A` → NES，`.gg` → GG，`.sms` → SMS，其他 → GB
- **專用載入方法**：`loadRom()` (NES/GB 自動偵測)、`loadGgRom()` (Game Gear)、`loadSmsRom()` (Master System)
- **統一 API**：`frame()` / `setButton()` / `getFrameBufferPtr()` 等所有方法透過 match 委派
- **動態解析度**：`getScreenWidth()` (256/160)、`getScreenHeight()` (240/144/192)
- **核心類型**：`getCoreType()` 回傳 `"nes"` / `"gb"` / `"gg"` / `"none"`
- **存檔/讀取**：`exportSaveState()` / `importSaveState()` 各核心獨立格式
- **向後相容**：原 `NesWasm` struct 完整保留，不影響舊程式碼

### 🖥️ 前端多平台適配 (`main.ts`)

- **動態 Canvas 尺寸**：載入 ROM 後根據 `getScreenWidth()` / `getScreenHeight()` 即時調整 Canvas 解析度與 CSS `aspect-ratio`
- **動態幀率**：NES 60.0988 fps / GB 59.7275 fps / GG 59.9227 fps 自動切換
- **ROM 列表系統標籤**：NES 遊戲顯示紅色 `NES` 標籤，GB 遊戲顯示綠色 🟢 `GB` 標籤，GG 遊戲顯示橙色 🟠 `GG` 標籤，SMS 遊戲顯示藍色 🔵 `SMS` 標籤
- **存檔隔離**：LocalStorage key 含核心類型前綴 (`emu_savestate_nes_0` / `emu_savestate_gb_0` / `emu_savestate_gg_0`)
- **檔案上傳**：支援 `.nes` / `.gb` / `.gbc` / `.gg` / `.sms` 副檔名
- **ROM 載入路由**：根據副檔名自動選擇 `loadRom()` / `loadGgRom()` / `loadSmsRom()`

### 🐛 Game Boy Joypad 方向鍵修正

**問題**：進入 GB 遊戲後方向鍵完全無法操作。

**原因**：`read()` 方法中，`result` 初始低 4 位為 `0x0`。當遊戲只選取方向鍵 bank (select=0x20) 時，按鈕區塊不執行，低 4 位維持 `0x0`。方向區塊的 `result & 0x0F & dpad` 因 `result & 0x0F = 0`，AND 結果永遠 `0x00`，等同所有方向同時按下 (GB active-low)。

**處理方案**：重寫 `read()` 為先將低 4 位初始化為 `0x0F` (全部放開)，再由被選取的 bank 透過 AND 清除對應 bit (表示按下)。兩個 bank 同時選取時 AND 效果自然正確合併。

### 🔧 基礎設施更新

- **Vite 配置** (`vite.config.ts`)：build 時複製 `.gb` / `.gbc` / `.gg` / `.sms` 檔案到輸出目錄
- **HTML** (`index.html`)：檔案上傳接受 `.gb/.gbc/.gg/.sms`、ROM 系統標籤 CSS、品牌名更新為 H5-EMU
- **WASM 建置**：`wasm-pack build --target web --out-dir ../src/wasm` 同時輸出到 `src/wasm/` 與 `pkg/`

### 🎮 遊戲列表更新 (42 款：NES 32 + GB 4 + GG 5 + SMS 1)

NES (32 款)：超級瑪利歐兄弟 / 超級瑪利歐兄弟 3 / 魂斗羅 / 洛克人 6 / FF III / 薩爾達傳說 / 雙截龍 3 / 聖鈴傳說 / 冒險島 1~3 / 迷宮組曲 / Captain Tsubasa II / 熱血系列 ×9 / 龍珠 Z 系列 ×4 / Zombie Hunter / 五子棋 / 台灣麻將 / 150 合 1 / 1200 合 1

🟢 Game Boy (4 款)：
- Super Mario Land 2: 6 Golden Coins (超級瑪利歐大陸 2)
- 口袋妖怪黃 (繁體中文加強版)
- 聖劍傳說 (簡體中文版)
- 熱鬥拳皇 96 (簡體中文版)

🟠 Game Gear (5 款新增)：
- Ninku 忍空 (英文翻譯版)
- Battletoads 忍者蛙
- Captain America 美國隊長
- Legend of Illusion 米老鼠幻影傳說
- Sonic Drift 2 音速小子賽車 2

🔵 Master System (1 款新增)：
- Sonic The Hedgehog 2 音速小子 2

---

## � Bug 修復 (2026-03-02) — NES CPU 時序 Off-by-One 修正

### 問題現象

**Zombie Hunter (Japan).nes** 進入遊戲後出現嚴重的**場景跳動**與**文字部分顯示錯誤**。

### 排查過程

1. **懷疑 APU**：新增靜音 / 停用 APU IRQ 功能進行隔離測試 → 靜音後問題仍然存在，排除 APU 干擾
2. **排查 PPU scroll**：Loopy scroll 實作 (`increment_scroll_x`/`increment_scroll_y`/`transfer_address_x`/`transfer_address_y`) 與 nesdev wiki 一致，無誤
3. **排查 Mapper 1 (MMC1)**：shift register、PRG/CHR bank switching 邏輯正確
4. **定位 CPU 時序**：發現 `cpu_clock()` 中存在 **off-by-one** 錯誤

### 根本原因

在 `emulator.rs` 的 `cpu_clock()` 函式中，CPU 指令的時鐘消耗計算有一個 off-by-one bug。每條指令的 **執行本身就佔用一個 CPU 時鐘週期**（即呼叫 `cpu_clock()` 的那次），但 `cycles` 計數器未扣除此消耗。

以 `NOP`（正確值為 2 cycles）為例，修正前的執行流程：

| cpu_clock 呼叫 | cycles 值 | 動作 |
|---------------|-----------|------|
| #1 | 0 → 執行 NOP → cycles = 2 | 取指+執行 |
| #2 | 2 → 1 | 等待（消耗 cycle） |
| #3 | 1 → 0 | 等待（消耗 cycle） |
| #4 | 0 → 執行下一條指令 | ← 實際花了 **3** cycles |

**所有指令、NMI、IRQ 都多消耗了 1 個 CPU 週期**，導致：
- 平均指令 ~3.5 cycle → 實際 ~4.5 cycle
- CPU 吞吐量下降約 **22%**
- VBlank 可用的 ~2273 CPU cycles 內能完成的工作大幅減少
- **Zombie Hunter 的 VBlank handler 無法在時限內完成 scroll 更新 → 場景跳動、文字渲染不完整**

### 修正方式

在 `cpu_clock()` 中，每次執行指令 / NMI / IRQ 後，對 `cycles` 執行 `saturating_sub(1)` 扣除當前呼叫本身消耗的週期：

```rust
fn cpu_clock(&mut self) {
    if self.cpu.cycles > 0 {
        self.cpu.cycles -= 1;
        return;
    }
    // ... 執行指令 / NMI / IRQ ...
    self.execute_cpu_instruction(opcode);
    // 扣除本次呼叫消耗的 1 cycle
    self.cpu.cycles = self.cpu.cycles.saturating_sub(1);
}
```

修正後 NOP 正確僅耗時 2 cycles，所有指令回到正確時序，Zombie Hunter 場景跳動問題完全解決。

### 附帶功能：靜音 / 停用 APU 切換

排查過程中新增的除錯功能保留為正式功能：
- **桌機**：點擊「🔊 音頻 (M)」按鈕或按 `M` 鍵切換
- **手機**：中間功能列的 🔊 按鈕
- 靜音時同時停用 Rust 核心的 APU IRQ（`audio_enabled` 旗標），可作為未來除錯其他遊戲的工具

---

## �🔧 最新更新 — Phase 3: Game Gear / Master System 核心與 VDP/Z80 精度修正

### 🎮 Game Gear / Master System 完整核心實作

在 NES + GB 核心之外，新增完整的 Game Gear 與 Master System 模擬核心，共 2,965 行 Rust 程式碼，分為 7 個模組。

**核心特點**：
- 單一核心同時支援 GG (160×144) 與 SMS (256×192) 兩種模式
- Z80 CPU 完整指令集含所有前綴與 undocumented opcodes
- VDP Mode 4 逐行渲染，精確的中斷時序
- PSG SN76489 音頻，GG 立體聲混音
- Sega Mapper 記憶體映射 ($FFFC~$FFFF 控制暫存器)

### 🎯 VDP 顯示修正 (4 項)

#### 1. Line IRQ / Frame IRQ 獨立追蹤
**問題**：部分遊戲捲軸與 HUD 閃爍或渲染位置錯誤。
**原因**：行中斷與幀中斷共用 `irq_pending` 旗標，導致讀取狀態時互相清除。
**處理**：新增 `line_irq_pending` 獨立追蹤行中斷，`irq_pending` 改為動態計算 `line_irq_pending | (status & 0x80 != 0)`。

#### 2. CRAM 寫入邏輯重寫
**問題**：色彩渲染異常，部分遊戲畫面色盤錯誤。
**原因**：CRAM latch 狀態機過於複雜，與實際 GG 硬體行為不符。
**處理**：移除 `cram_latch_active` 狀態機，改為直接以 VRAM 寫入位址的奇偶判斷：偶數位址暫存、奇數位址組合寫入 12-bit RGB444 色彩。

#### 3. 掃描線時序重寫
**問題**：行中斷計數器重載時機錯誤，導致 raster effect 失敗。
**原因**：VBlank 期間行計數器未持續重載 reg[10]，V counter 更新順序不正確。
**處理**：VBlank 期間每行重載 reg[10]；V counter 在行遞增之後更新；可見行的行計數器歸零時立即重載並設定 pending。

#### 4. 精靈 Y 座標環繞
**問題**：GG 模式下某些精靈消失或位置錯誤。
**原因**：Y 座標 >= 0xD1 (209) 的精靈應 wrap 到畫面頂部但未處理。
**處理**：使用 `(y_raw + 1) % 256` 計算實際 Y，精靈跨畫面頂部時正確計算行內偏移。

### 🎯 Z80 CPU 修正 (3 項)

#### 5. DAA H 旗標精確修正
**問題**：部分遊戲在需要 BCD 運算的場景行為異常 (如 GG 忍開頭動畫崩潰)。
**原因**：DAA 指令的 Half-Carry 旗標計算方式不正確。
**處理**：採用 MAME / ZEXALL 標準公式：`H = ((original_a ^ corrected_a) & 0x10) != 0`，確保與真實 Z80 硬體行為一致。

#### 6. INI/IND B 遞減時序
**問題**：Defenders of Oasis 等遊戲無法顯示選單。
**原因**：INI/IND 指令中 B 暫存器的遞減發生在 mem_write 之後，不符合 Z80 硬體時序。
**處理**：調整為 read port → decrement B → write memory 的正確順序。

#### 7. RETN 未文件化 opcodes
**問題**：少數遊戲使用 0xED 前綴的未文件化 RETN 別名。
**處理**：新增 0xED 0x5D / 0x6D / 0x7D 作為 RETN (等同 0x45)，復原 IFF1 = IFF2 並從堆疊返回。

---

## 🔧 更新記錄 (2026-02-07) — Rust/WASM 核心與遊戲相容性大修

### 🦀 架構遷移：TypeScript → Rust/WebAssembly

將模擬器核心從 TypeScript 遷移至 Rust，編譯為 WebAssembly 執行。

**調整原因**：TypeScript 執行效能受限於 JavaScript 引擎的 JIT 編譯，大量位元運算與記憶體存取在 Rust 中能獲得接近原生的效能。

**方案優點**：
- WASM 提供可預測的高效能，無 GC 暫停問題
- Rust 的所有權系統在編譯期防止記憶體安全問題
- 保持前端 TypeScript UI 不變，僅替換核心運算層
- 支援 18 種 Mapper（0, 1, 2, 3, 4, 7, 11, 15, 16, 23, 66, 71, 113, 202, 225, 227, 245, 253）

### 🎯 Mapper 225 鏡像模式修正

**問題**：64 合 1 合集遊戲開啟後藍屏無反應。

**原因**：FCEUX 使用 `setmirror(mirr ^ 1)` 進行異或翻轉，其中 `MI_V=0, MI_H=1`。原先實作中 bit13=0 對應 Vertical、bit13=1 對應 Horizontal，與 FCEUX 邏輯相反。

**處理方案**：交換鏡像對應關係，bit13=0 → Horizontal，bit13=1 → Vertical，與 FCEUX 行為一致。

### 🎯 Mapper 253 (VRC4 變體) 完整重寫

**問題**：龍珠 Z 強襲賽亞人部分畫面破圖。

**原因**：發現 4 個關鍵錯誤：
1. **缺少 CHR RAM 替換**：當 `chrlo==4||5` 且 `!vlock` 時應使用 CHR RAM 而非 CHR ROM
2. **缺少 vlock 機制**：`chrlo[0]==0xC8` 解鎖、`0x88` 鎖定的開關未實作
3. **chrhi 儲存錯誤**：原為 `data & 0x10`，應為 `data >> 4`
4. **地址解碼錯誤**：應使用 FCEUX 公式 `ind=(((A&8|A>>8)>>3)+2)&7`

**處理方案**：
- 以 FCEUX `253.cpp` 為權威參考，完整重寫 Mapper 253
- PPU 新增 `chr_writable_mask` 欄位，支援混合 CHR ROM/RAM bank 映射
- Cartridge 載入時為 Mapper 253 追加 8KB CHR RAM 到 CHR 資料末尾
- `sync_mapper_to_ppu()` 同步傳遞 `chr_writable_mask`

### 🎯 Mapper 16 (Bandai FCG) IRQ 精度改進

**問題**：龍珠 Z3 烈戰人造人部分畫面破圖。

**原因**：IRQ 計數器使用 `u16` 型別並以 `== 0` 判斷觸發，存在邊界條件錯失。

**處理方案**：計數器改為 `i32` 型別，觸發條件改為 `< 0`，與 FCEUX `bandai.cpp` 行為一致。

### 🔊 APU DMC 通道邏輯修正與音頻濾波器

**問題**：Captain Tsubasa II 部分音效聽不到，且有爆音現象。

**原因**：
- DMC 缺少 `silence` 旗標，導致在沒有資料時仍錯誤修改輸出電平
- 缺少音頻濾波器，DC 偏移與高頻雜訊直接輸出

**處理方案**：
- 新增 `silence: bool` 旗標，依據 NES 硬體規格控制輸出修改時機
- 初始 `bits_remaining` 設為 8（非 0），修正啟動時序
- 重寫 `clock_dmc()` 流程：silence → 輸出修改 → shift → bits 計數 → buffer → fetch
- 新增低通濾波器（係數 0.9）消除高頻雜訊
- 新增高通濾波器（係數 0.996）消除 DC 偏移
- 新增軟削波（>0.95 壓縮），避免音量爆破

### 🎮 遊戲列表更新 (32 款)

新增遊戲：冒險島 1/2/3、迷宮組曲、Captain Tsubasa II  
移除已下架遊戲：100 合 1、64 合 1

---

## ✨ 最新功能 (2026-02-05)

### 🖥️ 畫面比例修正

- **4:3 標準比例**：螢幕比例從原生像素比 (256:240) 調整為 4:3，模擬真實 NES 在 NTSC 電視上的顯示效果

### 🎮 虛擬控制器多點觸控優化

#### D-Pad 斜向輸入支援
- **區域偵測法**：整個 D-Pad 區域作為觸控區，根據手指相對中心點的角度計算方向
- **8 方向輸入**：支援上、下、左、右 + 4 個斜向（左上、右上、左下、右下）
- **滑動操作**：手指不離開螢幕即可改變方向
- **死區設計**：距離中心太近時不觸發，避免誤觸

#### A/B 按鈕同時按壓
- **多點觸控追蹤**：使用 `Touch.identifier` 獨立追蹤每個觸控點
- **同時按壓支援**：A 和 B 按鈕可同時按住，適合格鬥遊戲連續技

### 💾 快速存檔/讀取功能

- **電腦版**：新增 `💾 存檔 (F5)` 和 `📂 讀取 (F7)` 按鈕
- **手機版**：在 SELECT/START 上方新增 SAVE/LOAD 按鈕
- **Toast 提示**：操作後顯示成功/失敗訊息

### 🔧 Mapper 修復與新增

#### 修復的 Mapper
- **Mapper 16 (Bandai FCG)**：修正 IRQ 計時器從 scanline-based 改為 CPU cycle-based，修復龍珠系列遊戲
- **Mapper 1 (MMC1)**：修正 CHR bank 計算邊界檢查，修復 Zombie Hunter 畫面閃爍

#### 新增的 Mapper
- Mapper 7 (AxROM)、Mapper 11 (Color Dreams)
- Mapper 15、Mapper 23 (VRC2/4)
- Mapper 66 (GxROM)、Mapper 71 (Camerica)
- Mapper 113、Mapper 202
- Mapper 245、Mapper 253

### 🎮 遊戲列表更新 (28 款)

新增遊戲：64 合 1、150 合 1、1200 合 1

---

## 📱 手機版 RWD 設計 (2026-02-03)

### GameBoy 復古風格 UI

- **經典配色**：採用 GameBoy 機身配色方案
- **響應式設計**：
  - 桌面版：橫向排版，顯示鍵盤控制提示
  - 手機版：直向排版，虛擬按鍵操作
- **優先適配 iPhone 17 Pro Max (430px)**

### 虛擬控制器

- **D-Pad 十字鍵**：支援 8 方向控制
- **A/B 按鈕**：支援多點觸控同時按壓
- **Start/Select**：系統按鍵
- **SAVE/LOAD**：快速存檔/讀取

### ROM 選擇器

- **遊戲選單**：開啟模擬器後可直接選擇遊戲
- **本機上傳**：支援從裝置選擇 ROM 檔案
- **自動打包**：Build 時自動將 ROM 檔案複製到輸出目錄

### 技術改進

- **相對路徑部署**：支援部署到任意子目錄（如 GitHub Pages）
- **TypeScript 類型安全**：所有控制器按鈕使用 `ControllerButton` 列舉
- **模組化架構**：UI 元件獨立於核心模擬器邏輯

---

## 🟣 最新更新 — Phase 4: SFC / SNES 超級任天堂核心

### 🎮 SNES 完整核心實作

新增完整的 Super Nintendo (SFC/SNES) 模擬核心，基於 Ricoh 5A22 (65816 CPU) + S-PPU + S-SMP (SPC700 APU) 架構。

**核心模組**：
- `snes/cpu.rs` — 完整 65816 CPU (16-bit 模式/8-bit 模擬模式切換)
- `snes/ppu.rs` — PPU 掃描線渲染器 (Mode 0~7、OAM、色彩數學、視窗)
- `snes/apu.rs` — SPC700 APU (獨立 64KB RAM、4 計時器、BRR 音頻)
- `snes/dma.rs` — DMA/HDMA 控制器 (8 通道、間接定址模式)
- `snes/dsp1.rs` — DSP-1 協處理器 (Mode 7 3D 投影變換)
- `snes/cartridge.rs` — LoROM/HiROM 自動偵測、SRAM 支援
- `snes/emulator.rs` — 主模擬迴路、匯流排仲裁、H/V IRQ

### 🎯 SNES 開發中遇到的主要問題與解決方案

#### 1. RDNMI ($4210) VBlank 輪詢凍結
**問題**：超時空之鑰 (Chrono Trigger) 在開場動畫後畫面完全凍結。

**排查**：透過 CPU 迴圈偵測，發現 CPU 停滯在 `C0:3B71: LDA $4210; BPL loop` — 即輪詢 RDNMI 暫存器的 bit 7 等待 VBlank 旗標。

**原因**：RDNMI bit 7 實作為「讀取後清除」(edge-triggered)，NMI handler 中已讀取過一次，之後的輪詢永遠看到 0。但 SNES 硬體上 RDNMI bit 7 反映的是 **VBlank 連續狀態** — 在整個 VBlank 期間 (掃描線 225-261) 保持 HIGH。

**處理**：bus_read `$4210` 改為直接回傳 `ppu.vblank_flag` 狀態，VBlank 期間始終返回 `0x81`，非 VBlank 期間返回 `0x01`。

#### 2. SPC700 缺少 $B8 指令碼
**問題**：多款 SNES 遊戲音頻異常或 SPC700 PC 跑飛。

**原因**：SPC700 APU 的指令解碼器缺少 opcode `$B8` (SBC dp, #imm)，遇到時跳過導致 PC 對齊錯誤，後續所有指令解碼錯亂。

**處理**：補上 `$B8: SBC dp, #imm` — 從零頁位址讀取值，減去立即數，結果寫回零頁。

#### 3. PPU 圖層優先級交錯錯誤
**問題**：最終幻想 VI (FF6) 圖層顯示混亂，背景遮擋精靈或精靈順序不對。

**原因**：Mode 0/1 的 BG 優先級數值設定過高，與 OBJ (精靈) 的優先級範圍重疊甚至超過，導致背景無條件蓋住精靈。

**處理**：重新校正 Mode 0~7 所有圖層的 priority 數值，確保 BG 優先級 (low/high) 與 OBJ 優先級 (0~3) 正確交錯排列，符合 SNES 硬體規格。

#### 4. HDMA 間接定址指標錯誤
**問題**：使用 HDMA 間接模式的遊戲 (如 Super Mario Kart) 畫面光柵效果失敗。

**原因**：HDMA 間接模式 (control bit 6 = 1) 需要從表格讀取 16-bit 指標到獨立的 `indirect_addr` 欄位，再從該位址傳輸資料。原實作缺少 `indirect_addr` 欄位，與 `count` 欄位混用。

**處理**：DMA 通道新增獨立 `indirect_addr: u16` 欄位，HDMA init/transfer 時正確讀取間接指標並從對應位址存取資料。

#### 5. SPC700 SUBW H 旗標缺失
**問題**：部分遊戲 APU 行為異常。

**原因**：SPC700 的 `SUBW YA, dp` ($9A) 指令缺少 Half-Carry (H) 旗標計算。

**處理**：參照 ADDW 的做法，為 SUBW 補上低位元組的半進位計算：`H = ((ya ^ dp_val ^ result) >> 8) & 0x10 != 0`。

### 🟣 SNES 遊戲列表 (5 款)
- 🟣 超級瑪利歐世界 (Super Mario World)
- 🟣 洛克人 X (Rockman X)
- 🟣 超級瑪利歐賽車 (Super Mario Kart) — DSP-1 協處理器
- 🟣 超級瑪利歐 RPG (Super Mario RPG)
- 🟣 超時空之鑰 (Chrono Trigger)
- 🟣 最終幻想 VI (Final Fantasy VI)
- 🟣 聖劍傳說 3 (Seiken Densetsu 3)
- 🟣 快打旋風 II (Super Street Fighter II)

---

## 快速開始

```bash
# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev

# 建置生產版本
npm run build

# 執行測試
npm test
```

### 部署到 GitHub Pages

本專案已設定 **GitHub Actions 自動部署**，每次推送到 `main` 分支時會自動建置並部署。

#### 首次設定

1. 在 GitHub 專案頁面進入 **Settings** → **Pages**
2. 在 **Build and deployment** 區塊：
   - **Source**: 選擇 `GitHub Actions`
3. 推送程式碼到 `main` 分支即會自動部署

#### 手動部署

```bash
# 建置後，dist 目錄可直接部署
npm run build

# dist 目錄結構：
# dist/
#   index.html
#   assets/
#   roms/          # ROM 檔案
#   roms.json      # ROM 列表
```

#### 工作流程檔案

部署設定位於 `.github/workflows/deploy.yml`，包含：
- Node.js 20 環境
- 自動安裝依賴與建置
- 部署到 GitHub Pages

---

## 專案結構

```
h5-NES_TS/
├── public/
│   └── roms.json          # ROM 列表配置 (NES + GB + GG + SMS)
├── roms/                   # ROM 遊戲檔案 (.nes / .gb / .gg / .sms)
├── nes-wasm/              # Rust/WASM 核心 (單一二進位，三平台)
│   └── src/
│       ├── lib.rs         # WASM 入口 (EmuWasm 統一介面 + CoreType 分派)
│       ├── emulator.rs    # NES 模擬器主迴圈
│       ├── cpu.rs         # NES 6502 CPU
│       ├── ppu.rs         # NES 圖形處理器
│       ├── apu.rs         # NES 音頻處理器
│       ├── bus.rs         # NES 系統匯流排
│       ├── cartridge.rs   # NES 卡帶載入
│       ├── controller.rs  # NES 控制器
│       ├── mappers.rs     # NES 18 種 Mapper 實作
│       ├── gb/            # 🟢 Game Boy DMG 核心 (2,356 行)
│       │   ├── mod.rs         # 模組宣告 (11 行)
│       │   ├── cpu.rs         # Sharp LR35902 暫存器與旗標 (70 行)
│       │   ├── emulator.rs    # CPU 指令集 + 匯流排 + 整合 (804 行)
│       │   ├── ppu.rs         # 掃描線渲染器 160×144 (405 行)
│       │   ├── apu.rs         # 4 聲道音頻引擎 (611 行)
│       │   ├── cartridge.rs   # MBC0/1/3/5 記憶體映射 (280 行)
│       │   ├── timer.rs       # DIV/TIMA 計時器 (96 行)
│       │   └── joypad.rs      # 按鈕矩陣輸入 (79 行)
│       └── gg/            # 🟠 Game Gear / SMS 核心 (2,965 行)
│           ├── mod.rs         # 模組宣告 (15 行)
│           ├── cpu.rs         # Z80 暫存器與旗標 (121 行)
│           ├── emulator.rs    # Z80 指令集 + I/O + 匯流排 + 整合 (1,650 行)
│           ├── vdp.rs         # TMS9918 VDP 掃描線渲染 (593 行)
│           ├── psg.rs         # SN76489 PSG 音頻引擎 (273 行)
│           ├── cartridge.rs   # Sega Mapper 記憶體映射 (220 行)
│           └── joypad.rs      # Port $DC/$DD/$00 輸入 (93 行)
├── src/
│   ├── main.ts            # 應用程式進入點 (多平台適配)
│   ├── wasm/              # WASM 編譯輸出
│   ├── core/              # NES 核心模擬器 (TS 版，備用)
│   │   ├── cpu/           # 6502 CPU
│   │   ├── ppu/           # 圖形處理器
│   │   ├── apu/           # 音頻處理器
│   │   ├── bus.ts         # 系統匯流排
│   │   ├── cartridge.ts   # 卡帶與 Mapper
│   │   └── controller.ts  # 控制器
│   ├── mappers/           # Mapper 實作 (TS 版)
│   └── ui/                # UI 元件
│       ├── virtual-controller.ts  # 虛擬控制器
│       └── rom-selector.ts        # ROM 選擇器
├── tests/                 # 測試檔案
└── docs/                  # 開發文件
```

---

## 開發階段

本專案採用分階段開發策略，每個階段都有明確的測試目標：

| 階段 | 目標 | 驗證方式 | 狀態 |
|------|------|----------|------|
| Phase 1 | CPU 實作 | nestest.nes 測試 ROM | ✅ 完成 |
| Phase 2 | PPU 基礎 | 圖案表顯示測試 | ✅ 完成 |
| Phase 3 | 輸入系統 | 控制器響應測試 | ✅ 完成 |
| Phase 4 | APU 音頻 | 音頻波形測試 | ✅ 完成 |
| Phase 5 | Mapper | 遊戲相容性測試 | ✅ 完成 |
| Phase 6 | 手機版 UI | RWD 與虛擬控制器 | ✅ 完成 |
| Phase 7 | 🟢 Game Boy DMG | GB ROM 可正常遊玩 | ✅ 完成 |
| Phase 8 | 🟠 Game Gear / SMS | GG + SMS ROM 可正常遊玩 | ✅ 完成 |

---

## 技術架構

### 多平台統一架構

```
┌───────────────────────────────────────────────────────────────┐
│                        Browser (前端)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ Canvas 2D    │  │ Web Audio    │  │ UI (ROM 選擇器   │    │
│  │ (動態解析度) │  │ (動態幀率)   │  │  + 虛擬控制器)   │    │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘    │
├─────────┴─────────────────┴───────────────────┴──────────────┤
│                  EmuWasm (Rust/WASM 統一介面)                 │
│                                                               │
│  loadRom() ─── 自動偵測 ROM 格式 (副檔名 + iNES header)       │
│                    │                                          │
│         ┌──────────┼──────────┐                               │
│         ▼          ▼          ▼                               │
│  ┌─────────────┐ ┌────────────┐ ┌──────────────┐             │
│  │  NES 核心   │ │  GB 核心   │ │  GG/SMS 核心 │             │
│  │  256×240    │ │  160×144   │ │ 160×144/     │             │
│  │  60.10 fps  │ │  59.73 fps │ │  256×192     │             │
│  ├─────────────┤ ├────────────┤ │  59.92 fps   │             │
│  │ 6502 CPU    │ │ LR35902    │ ├──────────────┤             │
│  │ PPU (BG+SPR)│ │ PPU(BG+W+S)│ │ Z80 CPU      │             │
│  │ APU (5ch)   │ │ APU (4ch)  │ │ VDP Mode 4   │             │
│  │ 18 Mappers  │ │ MBC 0/1/3/5│ │ PSG (4ch)    │             │
│  │ Controller  │ │ Joypad     │ │ Sega Mapper  │             │
│  └─────────────┘ └────────────┘ └──────────────┘             │
└───────────────────────────────────────────────────────────────┘
```

### NES 核心內部架構

```
┌─────────────────────────────────────────────────┐
│                 NES Emulator                     │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌────────────┐     │
│  │ CPU │──│ Bus │──│ PPU │  │ Controller │     │
│  └─────┘  └──┬──┘  └─────┘  └────────────┘     │
│              │                                   │
│  ┌─────┐  ┌──┴──┐  ┌─────────────────────┐     │
│  │ APU │  │ RAM │  │ Cartridge + Mapper  │     │
│  └─────┘  └─────┘  └─────────────────────┘     │
└─────────────────────────────────────────────────┘
```

---

## 支援的 Mapper

| Mapper | 名稱 | 代表遊戲 |
|--------|------|----------|
| 0 | NROM | 超級瑪利歐兄弟、大金剛 |
| 1 | MMC1 | 薩爾達傳說、洛克人 2、Zombie Hunter |
| 2 | UxROM | 洛克人、魂斗羅 |
| 3 | CNROM | 所羅門之鑰 |
| 4 | MMC3 | 超級瑪利歐兄弟 3、忍者乙龜 |
| 7 | AxROM | Battletoads |
| 11 | Color Dreams | Crystal Mines |
| 15 | 100-in-1 | 100 合 1 合集 |
| 16 | Bandai FCG | 龍珠 Z 系列 |
| 23 | VRC2/4 | 魂斗羅日版 |
| 66 | GxROM | Super Mario Bros + Duck Hunt |
| 71 | Camerica | Fire Hawk |
| 113 | Multicart | 合集卡帶 |
| 202 | 150-in-1 | 150 合 1 合集 |
| 225 | 52-in-1 | 合集卡帶 |
| 227 | 1200-in-1 | 1200 合 1 合集 |
| 245 | MMC3 變體 | 中文遊戲 |
| 253 | VRC4 變體 | 龍珠 Z 強襲賽亞人 |

---

## 🟢 Game Boy MBC 支援

| MBC | 名稱 | ROM 大小 | RAM 大小 | 特殊功能 | 代表遊戲 |
|-----|------|----------|----------|----------|----------|
| MBC0 | No MBC | 32KB | — | — | Tetris、Dr. Mario |
| MBC1 | — | 最大 2MB | 最大 32KB | Banking Mode 0/1 | Super Mario Land、Zelda: Link's Awakening |
| MBC3 | — | 最大 2MB | 最大 32KB | RTC 即時時鐘、Latch | Pokémon Gold/Silver/Crystal |
| MBC5 | — | 最大 8MB | 最大 128KB | 9-bit ROM bank | Pokémon Yellow (GBC)、聖劍傳說 |

---

## 授權

MIT License

---

## 致謝

### NES 參考資料
- [NESDev Wiki](https://www.nesdev.org/wiki/) - 最完整的 NES 技術文件
- [6502.org](http://6502.org/) - 6502 CPU 參考資料
- [FCEUX](https://fceux.com/) - 參考實作與除錯工具

### Game Boy 參考資料
- [Pan Docs](https://gbdev.io/pandocs/) - Game Boy 硬體規格聖經
- [Game Boy CPU Manual](http://marc.rawer.de/Gameboy/Docs/GBCPUman.pdf) - CPU 指令集完整手冊
- [RGBDS](https://rgbds.gbdev.io/) - Game Boy 開發工具鏈與組語參考
- [The Cycle-Accurate Game Boy Docs](https://github.com/AntonioND/giibiiadvance/blob/master/docs/TCAGBD.pdf) - 週期精確技術文件
- [Imran Nazar's GB in JS](http://imrannazar.com/GameBoy-Emulation-in-JavaScript) - JavaScript Game Boy 模擬器教學

### Game Gear / Master System 參考資料
- [SMS Power! Technical Docs](https://www.smspower.org/Development/Documents) - SMS/GG 硬體規格總站
- [Z80 CPU User Manual](http://www.zilog.com/docs/z80/um0080.pdf) - Zilog Z80 官方手冊
- [Sean Young's Z80 Undocumented](http://www.myquest.nl/z80undocumented/) - Z80 未文件化行為完整記錄
- [MAME Source](https://github.com/mamedev/mame) - MAME Z80 核心參考實作 (DAA、旗標計算)
- [SN76489 Application Manual](https://www.smspower.org/Development/SN76489) - PSG 音頻晶片技術手冊
- [Charles MacDonald's VDP Documentation](https://www.smspower.org/Development/VDPRegisters) - VDP 暫存器與渲染細節
