# H5-NES 開發指南

## 目錄
1. [專案概述](#專案概述)
2. [架構設計](#架構設計)
3. [開發階段](#開發階段)
4. [技術細節](#技術細節)
5. [測試策略](#測試策略)
6. [除錯工具](#除錯工具)

---

## 專案概述

### 專案現況

H5-NES 已從最初的 NES 模擬器擴展成瀏覽器中的多平台模擬器。前端仍由 Vite/TypeScript 負責 UI、ROM 載入、輸入、Canvas 與 Web Audio；核心模擬器主要由 Rust 編譯成 WASM，另以 Mupen64Plus-web 提供 N64 後端。

目前重點平台：

- **NES / Famicom**：Rust/WASM 原生核心，包含 CPU、PPU、APU、Mapper。
- **SNES / Super Famicom**：Rust/WASM 原生核心，包含 CPU、PPU、APU、DMA/HDMA 與部分協處理器支援。
- **Game Boy / Game Gear / Master System**：Rust/WASM 原生核心。
- **Nintendo 64**：透過 `mupen64plus-web` 啟動 WebGL 後端，使用獨立 `<canvas id="canvas">`，避免與 2D WASM canvas 共用 context。
- **FBNeo Arcade**：透過 `@mantou/fbneo` 的 FinalBurn Neo arcade WebAssembly runtime 支援 `raiden.zip` 與 `wof.zip`，沿用現有 Canvas/Web Audio/game loop 外殼。

---

### 什麼是 NES 模擬器？

NES 模擬器是一個在現代電腦/瀏覽器中重現 Nintendo Entertainment System (任天堂紅白機) 硬體行為的軟體。我們需要模擬以下硬體元件：

- **CPU (6502)**: 8 位元處理器，負責執行遊戲邏輯
- **PPU (Picture Processing Unit)**: 圖形處理單元，產生 256×240 的視訊輸出
- **APU (Audio Processing Unit)**: 音頻處理單元，產生 5 聲道的音效
- **記憶體映射**: 管理 CPU 和 PPU 的記憶體存取
- **卡帶/Mapper**: 處理不同遊戲卡帶的記憶體擴展

### 技術棧

- **語言**: TypeScript / Rust
- **建置工具**: Vite
- **測試框架**: Vitest
- **核心輸出**: wasm-pack (`nes-wasm` → `src/wasm`)
- **圖形輸出**: HTML5 Canvas 2D / WebGL canvas (N64)
- **音頻輸出**: Web Audio API
- **N64 後端**: Mupen64Plus-web + Rice video plugin
- **Arcade 後端**: `@mantou/fbneo` + FBNeo arcade WASM

### 近期修正紀錄

#### FBNeo Arcade：Raiden / Warriors of Fate 支援

新增 FBNeo arcade backend，`raiden.zip` 與 `wof.zip` 會從 ROM 選單或檔案上傳直接進入 arcade 路徑，而不再被一般 ZIP 解包流程當作主機 ROM 處理。前端以 `JSZip` 在記憶體中解壓 ROM set，將原始 zip 寫入 MEMFS `/roms/<game>.zip`，並同時把 chip 檔寫入 `/roms/<game>/` 供診斷；FBNeo 載入時會收集 stdout/stderr 與 missing/CRC 訊息回傳 UI。

Arcade 畫面尺寸由 FBNeo runtime 回報並動態設定 Canvas。《吞食天地二 / Warriors of Fate》以 `384x224` 顯示；《雷電》原始 framebuffer 為 `256x224`，前端渲染時向左旋轉 90 度，輸出為直向 `224x256`，符合手機直向遊玩的觀感。

Arcade 輸入以 32-bit bitmask 作為前端抽象：方向鍵佔 bit 0-3，A-F 六鍵佔 bit 4-7、10-11，Coin/Start 佔 bit 8-9。鍵盤映射為方向鍵、`Z/X/A/S/Q/W`、`5` 投幣、`1` 或 Enter 開始；手機控制器切換為街機版十字鍵加 COIN/START/MUTE 和 A-F 六顆圓形按鈕。

CI/CD 方面，`package-lock.json` 已包含 `@mantou/fbneo`，GitHub Pages workflow 使用 `npm ci` 與 `npm run build`，Vite production build 會把 `fbneo-arcade-*.wasm` 打進 `dist/assets/`，並透過 `copyRomsPlugin()` 複製 `.zip` arcade ROM 到 `dist/roms/`。

#### N64 runtime、畫面與效能適配

N64 模式必須使用全新的 WebGL canvas，不能沿用已建立 2D context 的 `#screen`。啟動流程先套用 `body.n64-mode` 與 `body.n64-initializing`；SDL/Rice 初始化期間將 CSS 與 WebGL backing 固定在 profile 尺寸，等 Rice 第一個 VI 後才鎖定 backing 並恢復 responsive CSS。桌機使用 `640x480`，手機使用 `320x240`，可避免 SDL 在非同步啟動期間把手機 backing 改成 CSS 顯示尺寸而造成上方或右側裁切。

`src/n64/performance.ts` 會依 user agent、觸控能力、CPU 邏輯核心數與可用記憶體選擇 desktop / ios-high-end / mobile / mobile-low-end profile，並在寫入 IDBFS 前重寫 `mupen64plus.cfg`。iOS 使用 cached interpreter (`emuMode=1`)、rAF、關閉 SkipFrame 與 3072/1024 samples 音頻緩衝；Android 手機使用 dynamic recompiler (`emuMode=2`)、timer，並依 profile 啟用 SkipFrame。手機共同套用 trivial resampler、快速材質載入、16-bit texture、關閉 mipmap 與 OSD。ROM reset 共用原始 `ArrayBuffer`，避免為 32-64 MB ROM 製造額外記憶體尖峰。

手機正常模式預設使用固定 commit 與 Emscripten 3.1.25 重建的 fork，並開啟已通過 iPhone A/B 的 Rice triangle streaming ring；桌機預設維持 npm 1.5.7，`?n64Runtime=npm` 可強制手機回退。rectangle ring 與較大的 4096/2048 iOS 音頻緩衝因沒有改善 VI/s、draw timing 或 underrun 數而維持停用。SDL callback 資料不足時會播放仍可安全 resample 的前段，只將缺少的尾端補靜音。

`src/n64/telemetry.ts` 透過 Mupen 的 `beginStats` / `endStats` hook 每五秒輸出 VI/s、平均/最長 VI、long VI、recompiles、RSP/DList/RDP、triangle/rectangle draw timing/calls 與 audio underruns。約 56 VI/s 以上代表 NTSC 遊戲接近 real-time。true null-video 為 60.0 VI/s、Rice no-draw 為 59.98 VI/s，已把主要瓶頸定位到 Rice GL draw 入口與 WebGL 資料提交，而不是 R4300 或一般 DList parsing。

重建 fork 時先執行 `npm run n64:source`，再以 Docker 執行 `npm run n64:build`。production build 會驗證 `artifacts/n64` 的 manifest、64 MiB initial memory，以及帶相同 asset version 的 bundle/Wasm/data 實體檔名；`.gitattributes` 必須將 `*.data` 視為 binary，避免 Git 換行正規化破壞 preload archive。完整 A/B 參數、實測數據與回退條件見 [N64 瀏覽器核心分階段優化計畫](N64_CORE_OPTIMIZATION_PLAN.md)。

#### SNES APU 音效回歸修正

SNES 音效以 commit `0590b1efed1900f7270cb2934a2a4b4fa0cef541` 作為回歸基準。`nes-wasm/src/snes/apu.rs` 已同步調整 `generate_sample()` 與 `decode_next_sample()` 的 BRR/Gauss sample 尺度，避免只回退輸出路徑但保留新版 BRR ring buffer `<< 1` 導致特定樂器或音效高頻刺耳。

#### SNES OBJ 透明與 color math

SNES PPU 的 OBJ color math 規則已修正：OBJ palettes 0-3 不參與 color math，只有 palettes 4-7 在 `$2131 CGADSUB` OBJ bit 啟用時才參與。這項修正影響透明精靈、半透明特效與 Secret of Mana / Seiken Densetsu 3 類型遊戲的物件混合。

---

## 架構設計

### 系統架構圖

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser Environment                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐              ┌─────────────────┐       │
│  │  HTML5 Canvas   │◄────────────│      PPU        │       │
│  │  (256 × 240)    │   渲染輸出   │  圖形處理單元   │       │
│  └─────────────────┘              └────────┬────────┘       │
│                                            │                 │
│  ┌─────────────────┐              ┌────────┴────────┐       │
│  │   Web Audio     │◄────────────│      APU        │       │
│  │   (5 聲道)      │   音頻輸出   │  音頻處理單元   │       │
│  └─────────────────┘              └────────┬────────┘       │
│                                            │                 │
│                         ┌──────────────────┴───────────┐    │
│                         │           BUS                │    │
│                         │       記憶體匯流排           │    │
│                         └───┬──────────────────────┬───┘    │
│                             │                      │         │
│  ┌─────────────────┐  ┌─────┴─────┐  ┌────────────┴────┐   │
│  │   Controller    │  │    CPU    │  │    Cartridge    │   │
│  │     控制器      │  │   6502    │  │   卡帶+Mapper   │   │
│  └─────────────────┘  └───────────┘  └─────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 檔案結構

```
h5-NES/
├── src/
│   ├── core/                    # 核心模擬元件
│   │   ├── cpu/
│   │   │   ├── cpu.ts          # 6502 CPU 實作
│   │   │   └── index.ts        # CPU 模組匯出
│   │   ├── ppu/
│   │   │   ├── ppu.ts          # PPU 實作
│   │   │   └── index.ts        # PPU 模組匯出
│   │   ├── apu/                 # (待實作)
│   │   │   └── apu.ts          # APU 實作
│   │   ├── bus.ts              # 記憶體匯流排
│   │   ├── cartridge.ts        # 卡帶載入和解析
│   │   ├── controller.ts       # 控制器輸入
│   │   ├── nes.ts              # NES 主控台整合
│   │   └── index.ts            # 核心模組匯出
│   ├── mappers/
│   │   └── index.ts            # Mapper 實作 (0, 1, 2, 3)
│   ├── ui/                      # (待實作)
│   │   └── debugger.ts         # 除錯介面
│   └── main.ts                 # 應用程式入口
├── tests/
│   ├── cpu.test.ts             # CPU 單元測試
│   ├── ppu.test.ts             # PPU 單元測試
│   └── mapper.test.ts          # Mapper 單元測試
├── docs/
│   └── DEVELOPMENT.md          # 本文件
├── index.html                  # 網頁入口
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### 元件職責

#### CPU (`src/core/cpu/cpu.ts`)
- 實作完整的 6502 指令集 (56 條指令)
- 支援所有 13 種定址模式
- 處理中斷 (IRQ, NMI, Reset)
- 提供除錯功能 (反組譯、狀態輸出)

#### PPU (`src/core/ppu/ppu.ts`)
- 渲染背景圖層 (命名表、屬性表)
- 渲染精靈 (OAM)
- 處理捲動
- 產生 VBlank NMI
- 輸出 256×240 像素的幀緩衝區

#### Bus (`src/core/bus.ts`)
- 管理 CPU 記憶體映射 ($0000-$FFFF)
- 處理 PPU 暫存器存取
- 處理控制器讀取
- 處理 OAM DMA 傳輸

#### Cartridge (`src/core/cartridge.ts`)
- 解析 iNES ROM 格式
- 載入 PRG ROM 和 CHR ROM
- 管理 Mapper

#### Mapper (`src/mappers/index.ts`)
- 實作不同的記憶體映射方案
- 支援 Mapper 0, 1, 2, 3

---

## 開發階段

### Phase 1: CPU 實作 (目前完成)

**目標**: 完整實作 6502 CPU

**已完成**:
- [x] 所有官方指令 (56 條)
- [x] 所有定址模式 (13 種)
- [x] 中斷處理 (IRQ, NMI, Reset)
- [x] 精確的週期計數
- [x] 反組譯功能

**驗證方法**:
```bash
npm run test:cpu
```

**關鍵測試**: 
- 使用 `nestest.nes` ROM 進行驗證
- 比對 CPU 日誌輸出與標準結果

### Phase 2: PPU 基礎渲染 (目前完成)

**目標**: 實作基本的圖形渲染

**已完成**:
- [x] PPU 暫存器讀寫
- [x] 背景渲染
- [x] 精靈渲染
- [x] 調色盤
- [x] 捲動
- [x] VBlank 和 NMI

**驗證方法**:
```bash
npm run test:ppu
```

### Phase 3: 輸入系統 (目前完成)

**目標**: 實作控制器輸入

**已完成**:
- [x] 標準控制器模擬
- [x] 鍵盤映射
- [x] 控制器串列讀取

**預設鍵盤配置**:
| 按鈕 | 按鍵 |
|------|------|
| A | Z |
| B | X |
| Start | Enter |
| Select | Shift (右) |
| 方向鍵 | 方向鍵 |

### Phase 4: APU 音頻 (待實作)

**目標**: 實作 5 聲道音頻

**待完成**:
- [ ] 方波聲道 1
- [ ] 方波聲道 2
- [ ] 三角波聲道
- [ ] 雜訊聲道
- [ ] DMC 聲道
- [ ] 混音器

### Phase 5: Mapper 擴展 (進行中)

**目標**: 支援更多遊戲

**已完成**:
- [x] Mapper 0 (NROM)
- [x] Mapper 1 (MMC1)
- [x] Mapper 2 (UxROM)
- [x] Mapper 3 (CNROM)

**待完成**:
- [ ] Mapper 4 (MMC3)
- [ ] Mapper 7 (AxROM)
- [ ] 更多 Mapper...

---

## 技術細節

### NES 時序

```
主時鐘: 21.477272 MHz (NTSC)
CPU 時鐘: 主時鐘 / 12 = 1.789773 MHz
PPU 時鐘: 主時鐘 / 4 = 5.369318 MHz

關係: 1 CPU 週期 = 3 PPU 週期
```

### CPU 記憶體映射

| 位址範圍 | 大小 | 說明 |
|----------|------|------|
| $0000-$07FF | 2KB | 內部 RAM |
| $0800-$1FFF | - | RAM 鏡像 |
| $2000-$2007 | 8B | PPU 暫存器 |
| $2008-$3FFF | - | PPU 暫存器鏡像 |
| $4000-$4017 | - | APU 和 I/O |
| $4018-$401F | - | 通常禁用 |
| $4020-$FFFF | - | 卡帶空間 |

### PPU 記憶體映射

| 位址範圍 | 大小 | 說明 |
|----------|------|------|
| $0000-$0FFF | 4KB | 圖案表 0 |
| $1000-$1FFF | 4KB | 圖案表 1 |
| $2000-$23FF | 1KB | 命名表 0 |
| $2400-$27FF | 1KB | 命名表 1 |
| $2800-$2BFF | 1KB | 命名表 2 |
| $2C00-$2FFF | 1KB | 命名表 3 |
| $3000-$3EFF | - | 鏡像 |
| $3F00-$3F1F | 32B | 調色盤 |
| $3F20-$3FFF | - | 調色盤鏡像 |

### 6502 狀態暫存器

```
7 6 5 4 3 2 1 0
N V - B D I Z C

N: 負數旗標 (Negative)
V: 溢位旗標 (Overflow)
-: 未使用 (永遠為 1)
B: Break 旗標
D: 十進位模式 (NES 不使用)
I: 中斷禁用 (Interrupt Disable)
Z: 零旗標 (Zero)
C: 進位旗標 (Carry)
```

---

## 測試策略

### 單元測試

每個模組都有對應的測試檔案：

```bash
# 執行所有測試
npm test

# 執行特定模組測試
npm run test:cpu
npm run test:ppu

# 互動式 UI 測試
npm run test:ui

# 解析 catalog 中的 SNES header、映射與 enhancement chip
npm run snes:audit

# 逐款執行 600 frames 的 native Rust/WASM smoke
npm run snes:smoke
```

`npm run snes:audit` 會讀取 `public/roms.json` 與 `roms/`，處理裸 ROM、512-byte SMC copier header 和 ZIP 內的 SFC/SMC/FIG member，並產生 `artifacts/snes-rom-manifest.json`。manifest 會固定保存 SHA-256、header offset、map mode、ROM type、ROM/SRAM size、checksum 與目前 Rust 核心的 native capability。尚未實作的 enhancement chip 會由 Rust loader 明確拒絕，避免被誤當成普通 LoROM；目前 native loader 支援標準核心、DSP-1、CX4、SA-1 與 S-DD1，仍拒絕 SuperFX 與 SPC7110。

`npm run snes:smoke` 會讀取 manifest，逐款載入 ROM 並執行 600 frames，記錄 framebuffer/audio hash、非零畫素、實際變動畫面數、音訊樣本數、SRAM round-trip 與 save-state 的下一幀 deterministic replay。報告也會列出 BRK、CPU stopped、persistent force blank、零畫面、零音訊與靜止 framebuffer warnings；`status=ok` 不再掩蓋這些驗收訊號。目前 `src/snes/snes-routing.ts` 將 `TEMPORARY_SNES9X_FALLBACK_ENABLED` 設為 `false`，Mario RPG、Star Ocean 與 Super Mario Kart 會先走 Rust/WASM 供 diagnostic 測試；native load failure 時仍可走 generic Snes9x fallback，將 flag 改回 `true` 即恢復受保護遊戲的 iframe fallback。

### SNES Phase 0：硬體驗證基線

Phase 0 的目的，是先證明 native core 的硬體狀態可觀測、可重播、可比較，再進入 SA-1/S-DD1 的完整實作。執行順序如下：

```powershell
cargo test --manifest-path nes-wasm/Cargo.toml snes::
npm run wasm:build

$env:SNES_SMOKE_FILE = 'Super Mario World (USA).sfc'
$env:SNES_SMOKE_FRAMES = '600'
$env:SNES_SMOKE_CHECKPOINTS = '0,1,2,60,600'
npm run snes:smoke
Remove-Item Env:SNES_SMOKE_FILE,Env:SNES_SMOKE_FRAMES,Env:SNES_SMOKE_CHECKPOINTS
```

native smoke 的 checkpoint schema 是 v2。每個 checkpoint 包含 CPU、PPU、APU、interrupt、DMA/HDMA、S-DD1、SA-1、master clock、framebuffer/audio buffer，以及下列 memory digest：WRAM、VRAM、OAM、CGRAM、APU RAM、SA-1 IRAM、SA-1 BWRAM 和 SRAM。digest 是 deterministic FNV-1a `u64`，以十六進位字串輸出；framebuffer、audio 與 save-state 仍另以 SHA-256 比較。

要建立並驗證重複執行的 golden baseline：

```powershell
Copy-Item artifacts/snes-smoke-report.json artifacts/snes-smoke-baseline.json -Force
$env:SNES_SMOKE_FILE = 'Super Mario World (USA).sfc'
$env:SNES_SMOKE_FRAMES = '600'
$env:SNES_SMOKE_CHECKPOINTS = '0,1,2,60,600'
$env:SNES_SMOKE_BASELINE = 'artifacts/snes-smoke-baseline.json'
npm run snes:smoke
Remove-Item Env:SNES_SMOKE_FILE,Env:SNES_SMOKE_FRAMES,Env:SNES_SMOKE_CHECKPOINTS,Env:SNES_SMOKE_BASELINE
```

`SNES_SMOKE_BASELINE` 會嚴格比較每款 ROM 的 status、checkpoint state、memory digest、framebuffer/audio hash、save-state replay 與 SRAM round-trip；任何差異都會設 `determinism.passed=false` 並以非零 exit code 結束。`SNES_SMOKE_CHECKPOINTS` 未指定時預設為 `0,1,2,60,600`。

### SNES Phase 1：S-DD1 native emulation

S-DD1 的 native gate 只有在硬體契約測試、WASM build 與 real-ROM smoke 全部通過後才開啟。header detection 僅接受 combined identifier `0x4332` 或 `0x4532`；manifest audit 目前確認 catalog 中唯一的 S-DD1 ROM 是 `Star Ocean (Japan).zip`。

實作與驗證的硬體契約如下：

- `$4800` 是 hard-enable 狀態；DMA 解壓縮不以 `$4800` 作為額外 gate。
- `$4801` 的每 channel soft-enable bit 在 DMA setup 時清除；只有 A-to-B、fixed A-address 且對應 bit 已設置時才啟用 S-DD1 解壓縮。
- `$43x2-$43x6` 的 DMA source/count 使用 live channel registers；diagnostic capture 欄位只供觀測、checkpoint 與 save-state，不會覆蓋 live DMA 行為。count `0` 代表 `0x10000` bytes。
- `$4804-$4807` 的 selector 只保留 `value & 0x07`，reset 值為 `[0, 1, 2, 3]`。S-DD1 source window 會在 gather 每一個 byte 時重新依目前 selector mapping 解析，涵蓋 `$60-$7D` 的 full ROM window 與 `$C0-$FF` 的四個可選 1 MiB dynamic windows；`$7E/$7F` WRAM 與 LoROM SRAM overlay 維持優先級。
- DMA 會先產生 requested output length 的 decompressed buffer，再以 pending transfer 狀態逐 byte 寫入 B-bus，因此跨 64 KiB source bank、跨 dynamic 1 MiB mapping boundary 與 mid-transfer save-state 都可重播。

save-state export version 現為 **14**，import 接受 version `1` 到 `14`；version 14 會保存 pending DMA 的 decompressed buffer、offset、進度與 S-DD1 register state。native smoke checkpoint schema 仍是獨立的 **v2**，不可將兩者混用。

Phase 1 的驗收指令：

```powershell
cargo test --manifest-path nes-wasm/Cargo.toml sdd1 --lib
cargo test --manifest-path nes-wasm/Cargo.toml --lib
npm run wasm:build
npm run snes:audit

$env:SNES_SMOKE_FILE = 'Star Ocean (Japan).zip'
$env:SNES_SMOKE_FRAMES = '600'
$env:SNES_SMOKE_CHECKPOINTS = '0,1,2,60,600'
npm run snes:smoke
Remove-Item Env:SNES_SMOKE_FILE,Env:SNES_SMOKE_FRAMES,Env:SNES_SMOKE_CHECKPOINTS
```

必要的證據包括 decoder 的 deterministic vectors、所有 bitplane/context 組合、strict truncation、最大 output length、exact mapping boundary、live DMA register、zero-count、DMA direction/enable negative cases、save-state mid-transfer replay，以及 real Star Ocean 的 framebuffer/audio activity、SRAM round-trip、exact save-state replay 和 debug S-DD1 DMA records。Star Ocean 的 600-frame smoke 必須是 `status=ok`、`acceptance.passed=true`、`determinism.passed=true` 且沒有 warning；目前報告符合此條件。SA-1 已開放 native loader 供 Phase 2 diagnostic acceptance，但受保護遊戲的 routing 以 `src/snes/snes-routing.ts` 的明確規則為準，不能因 manifest capability 改寫；SuperFX、SPC7110 與尚未完成 native acceptance 的遊戲仍維持 Snes9x fallback。

### SNES Phase 2：SA-1 native diagnostic acceptance

Phase 2 先驗證既有 SA-1 foundation 是否能執行真實 ROM，不宣稱已完成完整 SA-1 hardware acceptance。native loader 與 manifest 現在都接受 SA-1，涵蓋 shared 65816 execution、reset-vector release、每掃描線 scheduler、interrupt/timer crossing、BMAP C/D/E/F ROM windows、character-conversion DMA、normal-DMA bus reservation 與 save-state state。為方便 diagnostic，`src/snes/snes-routing.ts` 目前暫時關閉三款受保護遊戲的 Snes9x routing，`Super Mario RPG (Japan).zip` 會先嘗試 Rust/WASM；將 `TEMPORARY_SNES9X_FALLBACK_ENABLED` 改回 `true` 即恢復原本的 iframe fallback。

Phase 2 第一個驗收切片使用以下命令：

```powershell
cargo test --manifest-path nes-wasm/Cargo.toml native_loader --lib
npm run wasm:build
npm run snes:audit

$env:SNES_SMOKE_FILE = 'Super Mario RPG (Japan).zip'
$env:SNES_SMOKE_FRAMES = '3600'
$env:SNES_SMOKE_CHECKPOINTS = '0,1,60,600,1800,3600'
$env:SNES_SMOKE_DEBUG = '1'
npm run snes:smoke
Copy-Item artifacts/snes-smoke-report.json artifacts/snes-smoke-baseline.json -Force
$env:SNES_SMOKE_BASELINE = 'artifacts/snes-smoke-baseline.json'
npm run snes:smoke
Remove-Item Env:SNES_SMOKE_FILE,Env:SNES_SMOKE_FRAMES,Env:SNES_SMOKE_CHECKPOINTS,Env:SNES_SMOKE_DEBUG,Env:SNES_SMOKE_BASELINE
```

目前 SA-1 native diagnostic 已達到：3600 frames 的 `status=ok`、`acceptance.passed=true`、無 warning、frame 1 起 SA-1 已解除 reset 並執行非零 PC，framebuffer/audio 均有活動，SRAM round-trip、save-state exact replay、debug trace 與同長度 deterministic baseline comparison 通過。另新增 `npm run snes:sa1-oracle`，產生 `artifacts/snes-sa1-oracle-report.json`，以 bounded typed trace 驗證 SA-1 CPU/bus event、timestamp monotonicity、DMA reservation/release 與 timer IRQ → IRQ ordering；目前真實 Super Mario RPG run 收到 6506 個 SA-1 CPU events、23275 個 typed events，且 `sa1Progress` 顯示所有執行集中在 frame 1 的 `C0:816F`/`C0:8171` 兩指令 IRAM handshake poll。`dmaEvents`、`timerIrqEvents`、`interruptEvents` 都是 0，oracle 以 `real-rom-sa1-hardware-event-missing` 與 `real-rom-sa1-startup-poll-only` fail-closed，因此這部分仍不能視為 real-ROM interrupt/DMA acceptance 證據。

#### SA-1 real-ROM handshake checkpoint

本輪 bounded 目標是讓 Super Mario RPG 的 real-ROM oracle 離開 `C0:816F`/`C0:8171`，或把缺口縮小到可驗證的跨 CPU contract。oracle 現在同時解析 SA-1 trace 與 S-CPU bus trace，並在 `oracle.handshake` 保存有限樣本，避免只依賴最後兩個 PC 推測原因。

目前證據（`SNES_ORACLE_FRAMES=1`，報告寫入 `artifacts/snes-sa1-oracle-report.json`）：

- `C0:816B` 起始序列將 `#$01` 寫入 SA-1 IRAM `$0001`；`C0:816F` 的 `LDA $00` 對應 SA-1 IRAM `$0000`，`C0:8171` 的 `BEQ $816F` 在值為零時繼續輪詢。
- SA-1 對 `$00:0000` 的輪詢讀取 3,055 次，所有值都是 `00`。
- S-CPU 對共享地址 `$00:3000`（對應 SA-1 IRAM `$0000`）只寫入一次，值也是 `00`；loop 前沒有觀察到非零 release write。
- loop 前雖有 `$2200-$23FF` register writes，但這份 trace 沒有證明任何 register side effect 會把 IRAM `$0000` 變成非零。

因此本輪沒有對 production bus mapping 或 register semantics 做猜測性修改；目前最精確的 blocker 是「誰應該產生 `$00:3000 = non-zero`，以及該寫入是否由未完成的 S-CPU 啟動流程、SA-1 初始化程式或另一個跨 CPU register contract 觸發」仍未確定。要解除 fail-closed，下一個修正必須讓 oracle 的 `executionFrames` 超過 `[1]`、`terminalTwoPcLoop=false`，並觀察到至少一個真實 ROM 的 DMA、timer IRQ、IRQ 或 NMI event；否則應繼續維持這個 blocker，而不能把 native smoke 的畫面/音訊活動當成 SA-1 完整相容性的證據。

測試硬體控制流程使用 synthetic ROM，不以「成功啟動」作為正確性證據。目前新增的 SA-1 regression 包含獨立 reference model 的 timer crossing、S-CPU/SA-1 interrupt flag readback domain、normal DMA 的 ROM/BWRAM/IRAM source-destination matrix、normal DMA completion 僅設 `$2301.20`、character conversion 僅設 S-CPU `$2300.20`、shared 65816 engine 對 SA-1 private BWRAM window 的 arbitration routing、DMA reservation 的精確 clock consumption、timer/DMA IRQ handler write 與 source clear、timer/DMA source clear 後 re-arm、WAI 收到 masked IRQ 時醒來但不 vector、WAI 收到 NMI 時醒來並 vector、STP 不因 interrupt 醒來、STP 只在 reset cycle 後 release、同時 pending 的 NMI 優先於 IRQ，以及 `$C0:8000`、`$C0:FFFF/$C1:0000`、`$CF:FFFF/$D0:0000` 和各 1MB window endpoint 的 BMAP boundary。完整 library suite 現為 104 tests passed。`debugSetVerificationTrace(true)` / `debugTakeVerificationTrace()` 可取得 bounded bus owner、region、arbiter、DMA/HDMA 與 CPU interrupt event trace。

驗收時必須區分：`exception`、native supported ROM load failure、unexpected native support、BRK、CPU stopped、checkpoint malformed 與 deterministic mismatch 是 hard failure；極早期 frame 的 zero-audio 或 static-framebuffer 只能是 warning。至少完成 600-frame smoke，且應看到持續的 framebuffer 變化、非零 audio、save-state replay 與 baseline 一致，才可將該 ROM 的 Phase 0 smoke 視為通過。SA-1 Phase 2 另要求 synthetic DMA/timer/interrupt/arbitration regression 與 real-ROM event oracle。研究期間 `TEMPORARY_SNES9X_FALLBACK_ENABLED=false`，三款受保護遊戲先走 Rust/WASM 以取得診斷證據；要恢復原本的 user-facing Snes9x iframe fallback，將該 flag 改回 `true`。在 real-ROM event oracle、bus arbitration timing 與更完整的 BMAP/interrupt handler corpus 完成前，不得宣稱三款遊戲已達完整 native acceptance。

### 測試覆蓋範圍

#### CPU 測試 (`tests/cpu.test.ts`)
- 載入/儲存指令
- 傳送指令
- 算術運算
- 邏輯運算
- 移位運算
- 比較指令
- 分支指令
- 跳躍和副程式
- 堆疊操作
- 旗標操作
- 所有定址模式

#### PPU 測試 (`tests/ppu.test.ts`)
- 暫存器讀寫
- 調色盤操作
- 時序驗證
- VBlank/NMI

#### Mapper 測試 (`tests/mapper.test.ts`)
- 各 Mapper 的記憶體映射
- Bank 切換

### 整合測試

使用測試 ROM 進行驗證：

1. **nestest.nes**: CPU 指令集驗證
2. **ppu_vbl_nmi**: PPU 時序驗證
3. **sprite_hit_tests**: 精靈碰撞測試

---

## 除錯工具

### CPU 狀態輸出

```typescript
// 取得 CPU 狀態字串
const state = cpu.getState();
// 輸出: "PC:8000 A:00 X:00 Y:00 SP:FD [--1-DI-C]"
```

### 反組譯

```typescript
// 反組譯指定位址的指令
const { instruction, bytes } = cpu.disassemble(0x8000);
// 輸出: { instruction: "LDA #$42", bytes: 2 }
```

### 圖案表檢視

```typescript
// 取得圖案表 (128×128 像素)
const patternTable = ppu.getPatternTable(0, 0);
```

### 調色盤檢視

```typescript
// 取得調色盤顏色
const color = ppu.getPaletteColor(0, 1);
```

---

## 參考資源

### 官方文件
- [nesdev.org Wiki](https://www.nesdev.org/wiki/) - NES 開發權威資源
- [6502 指令集參考](http://www.obelisk.me.uk/6502/reference.html)

### 測試 ROM
- [nestest.nes](https://www.nesdev.org/wiki/Emulator_tests) - CPU 測試
- [PPU Tests](https://www.nesdev.org/wiki/Emulator_tests#PPU_Tests) - PPU 測試

### 其他模擬器參考
- [FCEUX](http://fceux.com/) - 功能完整的 NES 模擬器
- [Mesen](https://www.mesen.ca/) - 高精度模擬器

---

## 常見問題

### Q: 為什麼我的遊戲無法載入？

檢查以下項目：
1. ROM 格式是否為 iNES (.nes)
2. 檢查 Mapper 編號是否支援
3. 查看瀏覽器控制台的錯誤訊息

### Q: 遊戲畫面不正確？

可能原因：
1. PPU 時序問題
2. Mapper 實作不完整
3. 命名表鏡像模式錯誤

### Q: 如何新增 Mapper 支援？

1. 在 `src/mappers/index.ts` 新增 Mapper 類別
2. 實作 `Mapper` 介面的所有方法
3. 在 `createMapper` 函數中註冊
4. 新增對應的測試

---

*最後更新: 2026-01-27*
