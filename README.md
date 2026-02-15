# H5-NES 模擬器

一個使用 HTML5 Canvas + TypeScript 開發的 NES 模擬器。

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

在瀏覽器中完整模擬 Nintendo Entertainment System (NES/FC)，支援：
- 完整的 6502 CPU 指令集
- PPU 圖形渲染 (256x240 解析度)
- APU 音頻輸出 (5 聲道)
- 標準控制器輸入
- 常見 Mapper 支援

---

## 🔧 最新更新 (2026-02-07) — Rust/WASM 核心與遊戲相容性大修

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
│   └── roms.json          # ROM 列表配置
├── roms/                   # ROM 遊戲檔案
├── nes-wasm/              # Rust/WASM 核心
│   └── src/
│       ├── lib.rs         # WASM 入口
│       ├── emulator.rs    # 模擬器主迴圈
│       ├── cpu.rs         # 6502 CPU
│       ├── ppu.rs         # 圖形處理器
│       ├── apu.rs         # 音頻處理器
│       ├── bus.rs         # 系統匯流排
│       ├── cartridge.rs   # 卡帶載入
│       ├── controller.rs  # 控制器
│       └── mappers.rs     # 18 種 Mapper 實作
├── src/
│   ├── main.ts            # 應用程式進入點
│   ├── wasm/              # WASM 編譯輸出
│   ├── core/              # NES 核心模擬器 (TS 版)
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

---

## 技術架構

```
┌─────────────────────────────────────────────────┐
│                    Browser                       │
├─────────────────────────────────────────────────┤
│  Canvas (PPU輸出)  │  Web Audio (APU輸出)       │
├─────────────────────────────────────────────────┤
│                   Emulator                       │
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

## 授權

MIT License

---

## 致謝

- [NESDev Wiki](https://www.nesdev.org/wiki/) - 最完整的 NES 技術文件
- [6502.org](http://6502.org/) - 6502 CPU 參考資料
- [FCEUX](https://fceux.com/) - 參考實作與除錯工具
