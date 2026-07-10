# H5-EMU 多平台復古遊戲模擬器

一個使用 HTML5 Canvas + TypeScript 前端搭配 Rust/WebAssembly 核心開發的多平台復古遊戲模擬器。目前支援 **NES / FC**、**Game Boy**、**Game Gear / Master System**、**SFC / SNES**、**N64** 與 **FBNeo Arcade**，並提供桌機鍵盤、手機觸控、橫向全螢幕與快速存檔等遊玩體驗。

---

## 快速導覽

H5-EMU 的目標是在瀏覽器中把多個世代的復古遊戲平台整合到同一個入口，讓使用者可以像走進一間電玩店一樣，先選擇主機或街機，再進入對應遊戲列表開始遊玩。

目前主要能力：

- 多平台核心：NES / FC、Game Boy、Game Gear、Master System、SFC / SNES、N64、FBNeo Arcade。
- 單一前端入口：依主機分類的遊戲選擇畫面，支援內建 ROM 清單與本機 ROM 上傳。
- 自動 ROM 路由：依副檔名、iNES 標頭或 FBNeo 檔名選擇正確後端。
- 響應式介面：桌機街機櫃視覺、手機直向虛擬控制器、手機橫向全螢幕透明控制覆蓋。
- 控制方式：桌機鍵盤提示會依目前主機切換，手機端會依 NES/SNES/N64/Arcade 顯示不同控制器。
- 遊玩功能：快速存檔/讀檔、SRAM 電池存檔、音頻開關、暫停/繼續、重置與全螢幕。

---

## 🎮 支援平台

| 平台 | 解析度 | CPU | 幀率 | 音頻聲道 | 狀態 |
|------|--------|-----|------|----------|------|
| **NES / FC** | 256×240 | 6502 (1.789 MHz) | 60.0988 fps | 5 (2 方波 + 三角 + 雜訊 + DMC) | ✅ 完整支援 |
| **Game Boy (DMG)** | 160×144 | LR35902 (4.194 MHz) | 59.7275 fps | 4 (2 方波 + 波形 + 雜訊) | ✅ 完整支援 |
| **Game Gear** | 160×144 (內部 256×192) | Z80 (3.58 MHz) | 59.9227 fps | 4 (3 方波 + 雜訊, GG 立體聲) | ✅ 支援 |
| **Master System** | 256×192 | Z80 (3.58 MHz) | 59.9227 fps | 4 (3 方波 + 雜訊) | ✅ 支援 |
| **SFC / SNES** | 256×224 | 65816 (3.58 MHz) + SPC700 (1.024 MHz) | 60.0988 fps | 8 (S-DSP 8 聲道 BRR) | ✅ 支援 |
| **N64** | 320×240 起，依遊戲/外掛 | VR4300 / Mupen64Plus Web | 依遊戲 | Runtime 混音 | 🧪 WebGL2 後端 |
| **FBNeo Arcade** | 動態解析度 | 多種街機硬體 | 依遊戲 | Web Audio 混音 | ✅ 17 款完整 ZIP ROM set |

---

## 近期大範圍新增功能

### 電玩店式 UI 與 RWD

- 首頁從單層 ROM 清單改成主機/街機選擇入口，先選 NES、GB、GG、SMS、SNES、N64 或 FBNeo，再進入該系統遊戲列表。
- 主視覺改為紅白機與街機店風格，桌機版呈現機台外觀，手機版保留高可玩性的觸控布局。
- 桌機操作選單預設關閉，可用 `MENU` 展開；全螢幕模式維持畫面比例並保留黑邊。
- 手機橫向全螢幕時，畫面置中，方向鍵在左、動作按鈕在右，控制器以半透明方式覆蓋在畫面周圍。
- 鍵盤控制說明會依目前核心切換，例如 SNES 會顯示四鍵與 L/R，N64 會顯示 Analog / D-Pad / C Buttons，Arcade 會顯示 Coin / Start / A-F。

### 多平台核心與後端整合

- Rust/WASM 單一核心整合 NES、GB、GG/SMS、SNES，前端透過統一 `EmuWasm` API 操作。
- N64 透過 `mupen64plus-web` 與 WebGL2 canvas 啟動，和 WASM 2D canvas 互斥時會自動切換畫布；手機會自動降至 320×240、使用低成本音頻重採樣與 Rice 快速材質路徑，低階裝置另啟用隔幀繪製。
- FBNeo Arcade 透過 `@mantou/fbneo` 載入完整 ZIP ROM set，支援 Raiden、Warriors of Fate、Final Fight、恐龍快打、名將、忍者龜、Street Fighter II 等 17 款街機，並處理 Emscripten FS、音視頻與街機輸入橋接。

### 模擬精度與相容性努力

- NES：修正 CPU cycle off-by-one、Mapper 16/225/253、DMC 初始 sample fetch、`$4017` frame counter 延遲等問題，改善多款 FC 遊戲的畫面與音樂差異。
- Game Gear / Master System：補齊 Z80 前綴指令、VDP line/frame IRQ、CRAM 寫入、掃描線時序、PSG 與 Sega Mapper。
- SNES：實作 65816、PPU Mode 0-7、SPC700/S-DSP、DMA/HDMA、DSP-1、CX4，並修正透明度、Direct Color、Mode 5 高解析度、Mode 7 latch、OAM priority rotation、APU echo/FIR 與多項匯流排時序問題。
- 存檔：支援快速存檔/讀檔與 SRAM 電池存檔，依核心與遊戲隔離資料。

---

## 作者做了哪些努力

這個專案不只是把多個 library 接起來，而是長時間處理「瀏覽器環境 + 多硬體世代 + 觸控介面」交會後的細節問題：

- 從 TypeScript NES 原型遷移到 Rust/WebAssembly，以取得更穩定的效能與更清晰的核心邊界。
- 逐步實作多個硬體核心，包含 CPU、PPU/VDP、APU/PSG、Mapper/MBC、DMA/HDMA、協處理器與存檔系統。
- 針對實際遊戲逐項排查，將問題整理到 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)，保留可追溯的修復脈絡。
- 在前端補齊桌機、手機直向、手機橫向與全螢幕場景，而不是只提供最基本的 canvas 輸出。
- 為 FBNeo 與 N64 這類外部 runtime 建立前端路由、資源複製、畫布切換、輸入橋接與錯誤診斷流程。

### 自動偵測 ROM 格式

載入 ROM 檔案時，模擬器會根據副檔名與檔案標頭自動判別格式：
- 檔案開頭為 `NES\x1A` (iNES 標頭) → **NES 核心**
- 副檔名 `.gb` / `.gbc` → **Game Boy 核心**
- 副檔名 `.gg` → **Game Gear 核心** (160×144 GG 視窗裁切)
- 副檔名 `.sms` → **Master System 核心** (256×192 全畫面)
- 副檔名 `.sfc` / `.smc` → **SNES 核心** (256×224)
- 副檔名 `.z64` / `.n64` / `.v64` → **N64 後端**
- 檔名符合支援清單的街機 `.zip`，例如 `raiden.zip`、`wof.zip`、`ffight.zip`、`dino.zip`、`sf2.zip` → **FBNeo Arcade 核心**（完整 zip ROM set）
- 其他 `.zip` → 會嘗試解包並尋找其中第一個支援的家用主機 ROM

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

### FBNeo Arcade — 🕹️ 街機後端
- 透過 `@mantou/fbneo` WebAssembly runtime 載入 FBNeo arcade driver
- 支援完整 ZIP ROM set，不拆成單一主機 ROM
- 目前支援 17 款完整 ZIP ROM set，包含 `raiden.zip`、`wof.zip`、`ffight.zip`、`dino.zip`、`captcomm.zip`、`punisher.zip`、`tmnt.zip`、`simpsons.zip`、`ssriders.zip`、`snowbros.zip`、`bublbobl.zip`、`pang.zip`、`sf2.zip`、`1943.zip`、`area88.zip`、`rtype.zip`、`parodius.zip`
- 每次切換 arcade 遊戲都建立新的 FBNeo instance，避免 Emscripten memory / native 狀態殘留
- 雷電啟用直向畫面旋轉，清版動作遊戲維持原橫向 framebuffer
- 手機版提供街機專用 COIN、START、MUTE 與 A-F 六鍵控制器

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

採用 **單一 WASM 二進位** 包含 NES + GB + GG + SNES 四核心，使用 Rust enum dispatch：

```rust
enum CoreType {
    None,
    Nes(emulator::Emulator),       // NES 核心
    Gb(gb::emulator::GbEmulator),  // GB 核心
    Gg(gg::emulator::GgEmulator),  // GG/SMS 核心
    Snes(snes::emulator::SnesEmulator),  // SNES 核心
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

GB 方向鍵無法操作 — `result` 低 4 位初始為 0x0 等同所有方向按下。修正為初始化 0x0F。詳見 [問題集 Q28](docs/TROUBLESHOOTING.md#game-boy--joypad)。

### 🔧 基礎設施更新

- **Vite 配置** (`vite.config.ts`)：build 時複製 `.gb` / `.gbc` / `.gg` / `.sms` 檔案到輸出目錄
- **HTML** (`index.html`)：檔案上傳接受 `.gb/.gbc/.gg/.sms`、ROM 系統標籤 CSS、品牌名更新為 H5-EMU
- **WASM 建置**：`wasm-pack build --target web --out-dir ../src/wasm` 同時輸出到 `src/wasm/` 與 `pkg/`

### 🎮 遊戲列表更新（含 FBNeo Arcade 17 款街機）

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

🕹️ FBNeo Arcade (17 款)：
- Raiden / 雷電 (`raiden.zip`) — 直向射擊，前端左轉 90 度顯示
- Warriors of Fate / 吞食天地二 (`wof.zip`) — 橫向清版動作，384×224 framebuffer
- Final Fight / 快打旋風快打 (`ffight.zip`)
- Cadillacs and Dinosaurs / 恐龍快打 (`dino.zip`)
- Captain Commando / 名將 (`captcomm.zip`)
- The Punisher / 制裁者 (`punisher.zip`)
- Teenage Mutant Ninja Turtles / 忍者龜 (`tmnt.zip`)
- The Simpsons / 辛普森家庭 (`simpsons.zip`)
- Sunset Riders / 西部牛仔 (`ssriders.zip`)
- Snow Bros. / 雪人兄弟 (`snowbros.zip`)
- Bubble Bobble / 泡泡龍 (`bublbobl.zip`)
- Pang / Buster Bros. (`pang.zip`)
- Street Fighter II / 快打旋風 II (`sf2.zip`)
- 1943: The Battle of Midway (`1943.zip`) — 直向射擊，前端左轉 90 度顯示
- U.N. Squadron / Area 88 (`area88.zip`)
- R-Type (`rtype.zip`)
- Parodius Da! (`parodius.zip`)

---

## 🔧 最新修正 — SFC 透明度 / 聖劍傳說 2 / FC APU 音樂差異

### SFC PPU Color Math 與 Direct Color

修正 `$2130 CGWSEL` bit 1 的來源判斷：bit=0 使用 fixed color，bit=1 使用 sub screen。原先反向會讓半透明物件、加減法混色與部分透明特效套到錯誤來源。另補上 BG1 8bpp direct color，讓 Mode 3/4 這類 256 色畫面能依 tile palette bits + pixel bits 直接產生 RGB。

**影響**：改善 SFC 透明物件失去透明度、Secret of Mana / 聖劍傳說 2 開頭畫面色彩異常，以及依賴 sub screen / direct color 的場景。

### FC APU Frame Counter / DMC 啟動時序

修正 `$4017` frame counter 寫入缺少 3/4 CPU cycle 延遲的問題，讓 envelope、length counter、sweep 與 triangle linear counter 的時機更接近硬體。同時在 DMC 由 `$4015` 重新啟用時立即安排初始 sample fetch，降低短音效與音樂進入點的細微差異。

👉 **完整排查過程請參閱 [問題集 Q8.1 / Q22.1](docs/TROUBLESHOOTING.md)**

---

## 🐛 Bug 修復 — NES CPU 時序 Off-by-One 修正

**Zombie Hunter** 場景跳動 — `cpu_clock()` 每條指令多消耗 1 cycle，CPU 吞吐量下降 22%，VBlank handler 超時。修正：執行後 `cycles.saturating_sub(1)` 扣除本次呼叫消耗。

👉 **完整排查過程請參閱 [問題集 Q19](docs/TROUBLESHOOTING.md#q19-cpu-指令-off-by-one--zombie-hunter-場景跳動)**

附帶新增靜音 / 停用 APU 切換功能（桌機 `M` 鍵、手機 🔊 按鈕）。

---

## 🔧 Phase 3: Game Gear / Master System 核心與精度修正

### 🎮 Game Gear / Master System 完整核心實作

新增完整的 Game Gear 與 Master System 模擬核心，共 2,965 行 Rust，分為 7 個模組。

**核心特點**：
- 單一核心同時支援 GG (160×144) 與 SMS (256×192) 兩種模式
- Z80 CPU 完整指令集含所有前綴與 undocumented opcodes
- VDP Mode 4 逐行渲染，精確的中斷時序
- PSG SN76489 音頻，GG 立體聲混音
- Sega Mapper 記憶體映射 ($FFFC~$FFFF 控制暫存器)

### 🎯 VDP 顯示修正 (4 項) + Z80 CPU 修正 (3 項)

VDP：Line/Frame IRQ 獨立追蹤、CRAM 寫入邏輯重寫、掃描線時序修正、精靈 Y 座標環繞
Z80：DAA H 旗標精確公式 (MAME/ZEXALL)、INI/IND B 遞減時序、RETN undocumented opcodes

👉 **完整排查過程請參閱 [問題集 Q23-Q27](docs/TROUBLESHOOTING.md#game-gear--master-system--z80-cpu)**

---

## 🕹️ 最新更新 — FBNeo Arcade 後端

### FBNeo 街機 ROM set 支援

新增 FBNeo Arcade 後端，用於載入需要完整 ZIP ROM set 的街機遊戲。與家用主機 ROM 不同，FBNeo driver 會依遊戲名稱檢查 zip 內多個 chip 檔案與 CRC，因此支援清單內的街機 ZIP 會在前端路由時直接交給 `FbNeoArcadeCore`，不再走一般 ZIP 解包尋找 `.nes/.sfc/.gb` 的流程。

**核心流程**：
- `src/main.ts` 以檔名辨識支援清單內的街機 ZIP，切換到 FBNeo backend
- `src/arcade/fbneo-core.ts` 透過 JSZip 解包，寫入 Emscripten FS 的 `/roms/<game>.zip` 與 `/roms/<game>/`
- 每次載入 arcade ROM 都建立新的 `FbNeoArcadeCore` instance，避免切換大型遊戲時共用舊 memory 導致 `memory access out of bounds`
- stdout/stderr 會回傳前端，缺檔或 CRC mismatch 時可直接從畫面診斷

**顯示與控制**：
- `raiden` / `1943` 啟用 framebuffer 左轉 90 度，符合直向街機射擊玩法
- `wof` 維持 384×224 橫向畫面
- 手機版新增 arcade controller area，含 COIN、START、MUTE 與 A-F 六鍵
- 前端使用 32-bit bitmask，再轉為 Mantou FBNeo `_setEmInput(playerIndex, state, alx, aly, arx, ary)`

👉 **完整排查過程請參閱 [問題集 FBNeo Arcade](docs/TROUBLESHOOTING.md#fbneo-arcade--raiden--warriors-of-fate)**

---

## 🔧 更新記錄 — Rust/WASM 核心與 NES 遊戲相容性修正

### 🦀 架構遷移：TypeScript → Rust/WebAssembly

將模擬器核心從 TypeScript 遷移至 Rust/WebAssembly。WASM 提供可預測的高效能（無 GC 暫停），Rust 所有權系統在編譯期防止記憶體安全問題。前端 TypeScript UI 不變，僅替換核心運算層。支援 18 種 Mapper。

### 🎯 NES Mapper / APU 修正

| 問題 | 影響遊戲 |
|------|----------|
| Mapper 225 鏡像模式反轉 | 64 合 1 藍屏 |
| Mapper 253 (VRC4 變體) 4 個關鍵錯誤 | 龍珠 Z 破圖 |
| Mapper 16 (Bandai FCG) IRQ 精度 | 龍珠 Z3 破圖 |
| DMC silence 旗標 + 音頻濾波器 | Captain Tsubasa II 爆音 |
| `$4017` frame counter 延遲 + DMC 初始 fetch | FC 音樂/音效細微時序差異 |

👉 **完整排查過程請參閱 [問題集 Q20-Q22](docs/TROUBLESHOOTING.md#nes--mapper)**

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

### 🎯 SNES 開發中遇到的問題與解決方案

開發 SNES 核心過程中遇到了大量硬體精度問題，涵蓋 CPU/匯流排、PPU 渲染、APU 音頻、DMA/HDMA、協處理器等各子系統。

👉 **完整問題排查記錄請參閱 [問題集 (TROUBLESHOOTING)](docs/TROUBLESHOOTING.md)**

**主要修復摘要**：

| 子系統 | 問題 | 影響遊戲 |
|--------|------|----------|
| CPU/匯流排 | RDNMI ($4210) VBlank 旗標 — 讀取後清除改為連續狀態 | FF6、MMX2、超時空之鑰 |
| CPU/匯流排 | LoROM SRAM $6000-$7FFF 寫入遺失 | LoROM 存檔遊戲 |
| CPU/匯流排 | H-IRQ 在掃描線內不觸發 | SMK (DSP-1 Raster) |
| PPU | Mode 5 高解析度渲染缺失 | SoM2、SD3 文字 |
| PPU | Mode 7 byte-latch flip-flop 錯亂 | SD3 模式 7 背景 |
| PPU | OAM Priority Rotation 未實作 | SMK 賽車精靈閃爍 |
| PPU | 圖層優先級數值校正 | FF6 精靈被遮擋 |
| PPU | CGWSEL sub screen/fixed color 判斷 + BG1 direct color | SFC 半透明特效、SoM2 開頭畫面 |
| APU | FIR 回聲濾波 per-tap >>6 精度損失 | SoM2 回聲、FF6 音效 |
| APU | SPC700 分支 cycle 數全部錯誤 | 多款遊戲音頻時序 |
| APU | SPC700 缺少 $B8 opcode | SPC700 PC 跑飛 |
| APU | IPL ROM 被 RAM 覆蓋 | APU 初始化異常 |
| APU | 分數 cycle 累積漂移 | 長時間音畫不同步 |
| APU | Sub Screen 背景色為黑色 | SoM2 色彩數學 |
| DMA/HDMA | HDMA 間接定址指標缺失 | SMK 光柵效果 |
| DMA/HDMA | HDMA 掃描線 0 不應傳輸 | HDMA 首行資料錯誤 |
| 協處理器 | DSP-1 Newton 疊代精度不符 | SMK Mode 7 地面 |
| 協處理器 | DSP-1 Raster Output 無限迴圈 | SMK DSP-1 卡死 |
| 協處理器 | CX4 協處理器未實作 | MMX2、MMX3 |

### 🟣 SNES 遊戲列表 (9 款)
- 🟣 超級瑪利歐世界 (Super Mario World)
- 🟣 洛克人 X (Rockman X)
- 🟣 洛克人 X2 (Mega Man X2) — CX4 協處理器
- 🟣 洛克人 X3 (Mega Man X3) — CX4 協處理器
- 🟣 超時空之鑰 (Chrono Trigger)
- 🟣 最終幻想 VI (Final Fantasy VI)
- 🟣 聖劍傳說 2 (Secret of Mana)
- 🟣 聖劍傳說 3 (Seiken Densetsu 3)
- 🟣 大金剛國度 (Donkey Kong Country)

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
│   ├── fbneo/             # FBNeo runtime assets
│   └── roms.json          # ROM 列表配置 (NES + GB + GG + SMS + SNES + FBNeo)
├── roms/                   # ROM 遊戲檔案 (.nes / .gb / .gg / .sms / .sfc / .smc / .zip)
├── nes-wasm/              # Rust/WASM 核心 (單一二進位，多平台)
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
│       └── snes/          # 🟣 SFC / SNES 核心
│           ├── mod.rs         # 模組宣告
│           ├── cpu.rs         # 65816 CPU (16-bit/8-bit 模式切換)
│           ├── emulator.rs    # 主模擬迴路、匯流排仲裁、H/V IRQ
│           ├── ppu.rs         # PPU 掃描線渲染 (Mode 0-7、OAM、色彩數學)
│           ├── apu.rs         # SPC700 APU + S-DSP (BRR、FIR 回聲)
│           ├── dma.rs         # DMA/HDMA 控制器 (8 通道、間接定址)
│           ├── dsp1.rs        # DSP-1 協處理器 (Mode 7 3D 投影)
│           ├── cx4.rs         # CX4 協處理器 (HLE, MMX2/X3)
│           └── cartridge.rs   # LoROM/HiROM 自動偵測、SRAM
├── src/
│   ├── main.ts            # 應用程式進入點 (多平台適配)
│   ├── arcade/            # FBNeo Arcade 後端整合
│   │   └── fbneo-core.ts  # ROM set 解包、Emscripten FS、輸入/音視頻橋接
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
| Phase 9 | 🟣 SFC / SNES | SNES ROM 可正常遊玩 (65816 + PPU Mode 0-7 + SPC700 + DMA/HDMA + DSP-1 + CX4) | ✅ 完成 |
| Phase 10 | 🕹️ FBNeo Arcade | 17 款完整 ZIP ROM set 可進入 FBNeo 後端 | ✅ 完成 |

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
│         ┌──────────┼──────────┬──────────┐                    │
│         ▼          ▼          ▼          ▼                    │
│  ┌─────────────┐ ┌────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │  NES 核心   │ │  GB 核心   │ │  GG/SMS 核心 │ │  SNES 核心   │ │
│  │  256×240    │ │  160×144   │ │ 160×144/     │ │  256×224     │ │
│  │  60.10 fps  │ │  59.73 fps │ │  256×192     │ │  60.10 fps   │ │
│  ├─────────────┤ ├────────────┤ │  59.92 fps   │ ├──────────────┤ │
│  │ 6502 CPU    │ │ LR35902    │ ├──────────────┤ │ 65816 CPU    │ │
│  │ PPU (BG+SPR)│ │ PPU(BG+W+S)│ │ Z80 CPU      │ │ PPU Mode 0-7 │ │
│  │ APU (5ch)   │ │ APU (4ch)  │ │ VDP Mode 4   │ │ SPC700 (8ch) │ │
│  │ 18 Mappers  │ │ MBC 0/1/3/5│ │ PSG (4ch)    │ │ DMA/HDMA     │ │
│  │ Controller  │ │ Joypad     │ │ Sega Mapper  │ │ DSP-1 / CX4  │ │
│  └─────────────┘ └────────────┘ └──────────────┘ └──────────────┘ │
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

### SFC / SNES 參考資料
- [fullsnes by nocash](https://problemkaputt.de/fullsnes.htm) - SNES 硬體規格最完整參考
- [snes9x Source](https://github.com/snes9xgit/snes9x) - SNES 模擬器參考實作 (DSP-1、CX4)
- [bsnes/higan Source](https://github.com/bsnes-emu/bsnes) - 週期精確 SNES 模擬器
- [Super Famicom Development Wiki](https://wiki.superfamicom.org/) - SFC 開發技術 wiki
- [Anomie's SNES Docs](https://www.romhacking.net/documents/197/) - PPU/DMA/HDMA 精確時序文件
