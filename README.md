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

## ✨ 最新功能 (2026-02-03)

### 📱 手機版 RWD 設計

- **GameBoy 復古風格 UI**：整體介面採用經典 GameBoy 配色與造型
- **響應式設計**：
  - 桌面版：保留橫向排版，顯示鍵盤控制提示
  - 手機版：直向排版，虛擬按鍵操作
- **優先適配 iPhone 17 Pro Max (430px)**：針對主流手機尺寸最佳化

### 🎮 虛擬控制器

- **D-Pad 十字鍵**：支援上下左右方向控制
- **A/B 按鈕**：動作按鍵，採用 GameBoy 經典紅色設計
- **Start/Select**：系統按鍵
- **觸控優化**：防止誤觸、支援多點觸控

### 📂 ROM 選擇器

- **遊戲選單**：開啟模擬器後可直接選擇 `/roms` 目錄下的遊戲
- **本機上傳**：支援從裝置選擇 ROM 檔案
- **自動打包**：Build 時自動將 ROM 檔案複製到輸出目錄

### 🔧 技術改進

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
├── src/
│   ├── main.ts            # 應用程式進入點
│   ├── core/              # NES 核心模擬器
│   │   ├── cpu/           # 6502 CPU
│   │   ├── ppu/           # 圖形處理器
│   │   ├── apu/           # 音頻處理器
│   │   ├── bus.ts         # 系統匯流排
│   │   ├── cartridge.ts   # 卡帶與 Mapper
│   │   └── controller.ts  # 控制器
│   ├── mappers/           # Mapper 實作
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
| 1 | MMC1 | 薩爾達傳說、乙洛克人 2 |
| 2 | UxROM | 洛克人、魂斗羅 |
| 3 | CNROM | 所羅門之鑰 |
| 4 | MMC3 | 超級瑪利歐兄弟 3、忍者乙龜 |

---

## 授權

MIT License

---

## 致謝

- [NESDev Wiki](https://www.nesdev.org/wiki/) - 最完整的 NES 技術文件
- [6502.org](http://6502.org/) - 6502 CPU 參考資料
- [FCEUX](https://fceux.com/) - 參考實作與除錯工具
