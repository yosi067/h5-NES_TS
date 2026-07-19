# H5-EMU 多平台復古遊戲模擬器

H5-EMU 是一個在瀏覽器中運行的多平台模擬器研究專案，將 **NES / FC、Game Boy、Game Gear、Master System、SFC / SNES、Nintendo 64 與 FBNeo Arcade** 整合在同一個入口。前端使用 TypeScript、Canvas、Web Audio 與 WebGL2；自製核心以 Rust 編譯成 WebAssembly，N64 與街機則整合成熟的開源 runtime。

它既是一間數位電玩店，也是一個持續往下一個硬體世代推進的系統工程實驗。

> [!IMPORTANT]
> **本專案僅供學術、技術研究與個人學習使用。** 專案不主張任何遊戲內容、商標、角色或主機品牌的權利；相關版權均屬原遊戲公司與權利人所有。使用者應自行取得並僅使用依法持有的 ROM、BIOS 與其他遊戲資料。

## 為什麼做這個專案

第一個原因是懷舊。這些平台涵蓋了作者從童年到高中以前接觸的遊戲記憶，從紅白機、掌機、超任一路走到街機與 N64。

另一個起點來自高中時期。網路剛開始普及時，看到模擬器竟能在電腦上忠實重現實體主機與卡帶，有些甚至能改善輸出畫面，成為作者後來走向資訊領域的重要動力。當時也曾嘗試閱讀模擬器原始碼，但 CPU、圖形、音頻、匯流排與時序交織出的複雜度，遠超過能獨立掌握的範圍。

直到生成式 AI 興起，這件事出現了新的可能：由作者負責問題定義、架構判斷、實機觀察、驗證與取捨，再讓 AI 協助搜尋知識、閱讀程式、提出假設與加速實作，逐步把專業經驗轉譯成一套屬於自己的模擬器整合系統。

## AI 協作實驗

本專案也是作者用來測試最新 AI 模型工程能力的長期實驗，刻意選擇模擬器這類知識密度高、狀態複雜、必須精確驗證的題目，觀察 AI 面對高難度系統問題時能走多遠，同時練習自己對 AI 開發流程的掌控度。

約一年前，最初的紅白機版本甚至無法穩定輸出畫面；如今從 8 位元、16 位元到街機與 N64，多數新平台已能更快建立可運行的整合路徑。每次向後挑戰一個世代，仍會在時序、特殊晶片、3D 圖形、音頻或瀏覽器效能上遇到新的瓶頸；而隨著 AI 模型進步，又能重新檢視舊假設，繼續突破先前卡住的地方。

這裡的重點不是讓 AI 自動產生大量程式碼，而是建立一套可控的協作方法：

- 作者決定需求、架構、驗收標準與風險邊界。
- AI 協助規格理解、程式探索、實作與除錯假設。
- 結果必須透過編譯、測試、實際遊戲畫面、音頻與效能數據驗證。
- 每次失敗都整理成下一輪可重用的工程知識。

## 技術價值

模擬器會迫使開發者同時面對電腦架構、即時系統與產品整合問題。H5-EMU 的技術價值不只在於「遊戲能啟動」，還包含：

- 重現不同 CPU、記憶體映射、圖形管線、音頻合成與卡帶控制器的硬體行為。
- 在瀏覽器限制下整合 WebAssembly、Canvas 2D、WebGL2、Web Audio 與觸控輸入。
- 以統一介面管理多個核心的 ROM 路由、存檔、控制器、畫布與生命週期。
- 從實際遊戲的破圖、雜音、當機與掉幀反推底層時序或狀態錯誤。
- 建立可重現的建置、測試、遙測與回歸流程，區分「看似可玩」和「行為正確」。

## 平台與歷史脈絡

| 平台 | 簡短背景 | 專案中的角色 |
|---|---|---|
| **NES / FC** | 任天堂於 1983 年推出的 8 位元主機，奠定現代家用遊戲市場 | 起點；用來理解 6502、PPU、APU 與 Mapper |
| **Master System / Game Gear** | Sega 的 8 位元家用主機與 1990 年彩色掌機，皆以 Z80 系統為基礎 | 比較共用 CPU、不同顯示與輸入形態的設計 |
| **Game Boy** | 1989 年推出，以低功耗硬體和卡帶 MBC 延伸出長生命週期 | 練習 LR35902、掌機時序、MBC 與電池存檔 |
| **SFC / SNES** | 1990 年的 16 位元主機，具備多圖層、Mode 7、獨立音頻系統與卡帶協處理器 | 自製核心中複雜度最高的一代 |
| **Arcade / FBNeo** | 街機橫跨大量不同板卡，沒有單一固定硬體規格 | 透過 FinalBurn Neo 整合 ROM set、driver 與多種輸入配置 |
| **Nintendo 64** | 1996 年進入 3D 世代，包含 MIPS CPU、RSP/RDP 與複雜圖形微碼 | 透過 Mupen64Plus Web 研究 WebGL2、動態重編譯與行動效能 |

把這些平台放在一起，可以沿著硬體世代觀察從 2D tile/sprite、掃描線與固定音源，到特殊晶片、3D 圖形與動態重編譯的演進。共用前端也讓控制器、存檔、音頻和手機介面不必為每個核心重新發明，差異則被限制在清楚的後端邊界中。

## 架構概覽

```text
Browser / TypeScript UI
├── ROM 選擇、格式路由、存檔、鍵盤與觸控
├── Canvas 2D + Web Audio
│   └── Rust / WebAssembly
│       ├── NES / FC
│       ├── Game Boy
│       ├── Game Gear / Master System
│       └── SFC / SNES
├── WebGL2 Canvas
│   └── Mupen64Plus Web + Rice renderer
│       └── Nintendo 64
└── FBNeo WebAssembly bridge
    └── Arcade ROM sets
```

N64 使用獨立 WebGL2 canvas 與 Mupen64Plus runtime，不走自製 Rust 核心；FBNeo Arcade 也有獨立的 Emscripten 檔案系統、音視頻與輸入橋接。完整邊界、目錄與建置流程請見 [技術概覽](docs/TECHNICAL_OVERVIEW.md)。

## 主要功能

- 主機分類式遊戲大廳與自動 ROM 後端路由。
- 桌機鍵盤、手機觸控與橫向全螢幕控制器。
- 快速存檔／讀檔、SRAM 電池存檔、暫停、重置與靜音。
- 依主機切換 Canvas 尺寸、幀率、按鍵配置與音頻路徑。
- N64 裝置效能 profile、版本化 runtime 與效能遙測。
- FBNeo 完整街機 ZIP ROM set、畫面方向與六鍵控制支援。

## 快速開始

環境需要 Node.js、Rust、`wasm-pack`；只有在重建 N64 fork 時需要 Docker。

```bash
npm install
npm run dev
```

瀏覽器開啟 Vite 顯示的本機網址。也可以從畫面選擇依法持有的 ROM 檔案。

```bash
npm test       # 執行測試
npm run build  # 重建 Rust/WASM 並產生 production bundle
```

## 專案結構

```text
src/                 # TypeScript 前端、Arcade 與 N64 適配層
nes-wasm/src/        # NES、GB、GG/SMS、SNES 的 Rust 核心
tests/               # 核心、runtime、效能與資產測試
tools/n64/           # N64 runtime 取得、patch 與重建工具
artifacts/n64/       # 可重現的 N64 runtime 資產
docs/                # 技術、除錯、規格與優化文件
```

## 延伸文件

最新進展、實測結果與細節不再堆疊於 README：

- [技術概覽與完整架構](docs/TECHNICAL_OVERVIEW.md)
- [開發指南](docs/DEVELOPMENT.md)
- [問題與修復紀錄](docs/TROUBLESHOOTING.md)
- [模擬核心優化計畫](docs/CORE_OPTIMIZATION_PLAN.md)
- [N64 瀏覽器核心優化計畫](docs/N64_CORE_OPTIMIZATION_PLAN.md)
- [NES 技術規格](docs/NES_SPECS.md)
- [ROM 遊戲庫稽核](docs/ROM_LIBRARY_AUDIT.md)

## 研究、權利與責任

本儲存庫中的原創程式碼用於模擬器工程、WebAssembly、瀏覽器圖形／音頻與 AI 協作方法研究。任何第三方 runtime 依其各自授權條款使用。

遊戲 ROM、BIOS、商標、角色、美術、音樂及其他受保護內容不因出現在開發或測試流程中而改變權利歸屬，相關權利仍屬原遊戲公司與權利人所有。本專案不鼓勵散布或下載未經授權的遊戲資料。
