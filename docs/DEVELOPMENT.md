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

### 什麼是 NES 模擬器？

NES 模擬器是一個在現代電腦/瀏覽器中重現 Nintendo Entertainment System (任天堂紅白機) 硬體行為的軟體。我們需要模擬以下硬體元件：

- **CPU (6502)**: 8 位元處理器，負責執行遊戲邏輯
- **PPU (Picture Processing Unit)**: 圖形處理單元，產生 256×240 的視訊輸出
- **APU (Audio Processing Unit)**: 音頻處理單元，產生 5 聲道的音效
- **記憶體映射**: 管理 CPU 和 PPU 的記憶體存取
- **卡帶/Mapper**: 處理不同遊戲卡帶的記憶體擴展

### 技術棧

- **語言**: TypeScript
- **建置工具**: Vite
- **測試框架**: Vitest
- **圖形輸出**: HTML5 Canvas
- **音頻輸出**: Web Audio API

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
```

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
