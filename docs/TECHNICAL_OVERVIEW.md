# H5-EMU 技術概覽

本文件承接 README 中不適合放在首頁的架構與技術資訊。逐項相容性修正、實測數據與階段性計畫不在此重複，請沿文件索引閱讀。

## 技術目標

H5-EMU 不是單一主機核心的展示，而是把不同年代、不同硬體模型的模擬器放進同一個瀏覽器執行環境。專案主要處理四類問題：

1. **硬體行為重現**：CPU 指令、記憶體映射、圖形掃描時序、音頻合成、卡帶控制器與特殊晶片。
2. **瀏覽器執行限制**：WebAssembly 效能、Canvas 2D / WebGL2、Web Audio 排程、行動裝置記憶體與觸控輸入。
3. **跨核心整合**：ROM 路由、畫布切換、控制器映射、存檔隔離、生命週期與錯誤診斷。
4. **可驗證的相容性**：以實際遊戲、回歸測試、效能遙測與可重現建置驗證修正，而不只以「能啟動」作為完成標準。

## 執行架構

```text
Browser / TypeScript UI
├── ROM catalog、格式路由、鍵盤與觸控、存檔、RWD
├── Canvas 2D + Web Audio
│   └── Rust / WebAssembly (`EmuWasm`)
│       ├── NES / FC
│       ├── Game Boy
│       ├── Game Gear / Master System
│       └── SFC / SNES
├── EmulatorJS iframe
│   ├── Genesis Plus GX → Mega Drive / Genesis
│   ├── Snes9x → SA-1 / S-DD1 等 SNES 特殊晶片遊戲
│   └── FCEUmm → 原生核心不支援的 NES Mapper 備援
├── WebGL2 Canvas + runtime audio
│   └── Mupen64Plus Web + Rice renderer
│       └── Nintendo 64
└── Canvas + Web Audio bridge
    └── FinalBurn Neo WebAssembly
        └── Arcade ROM sets
```

### Rust / WASM 核心

`nes-wasm` 以單一 WebAssembly 模組提供 NES、Game Boy、Game Gear / Master System 與 SNES 核心。前端透過統一介面取得 framebuffer、音頻、按鍵狀態、畫面尺寸與存檔資料；核心內部仍保留各平台不同的 CPU、PPU/VDP、APU/PSG、Mapper/MBC 與匯流排模型。

### Nintendo 64

N64 正式遊玩路徑不是 `nes-wasm/src/n64` 的實驗 scaffold，而是獨立的 `mupen64plus-web` / Mupen64Plus runtime。它使用專用 WebGL2 canvas、Rice video plugin、SDL/Emscripten 音頻，以及依桌機、iOS、Android 能力選擇的效能 profile。

N64 跨越到 3D 圖形、R4300 動態重編譯、RSP/RDP 微碼與更高記憶體需求，是目前瀏覽器端最具挑戰性的後端。專案另外維護可重建的行動版 runtime、版本化資產檢查與 VI/Rice/audio 遙測。

### FBNeo Arcade

街機不是單一固定硬體，因此交由 FinalBurn Neo WebAssembly runtime 處理。前端負責完整 ZIP ROM set 驗證、Emscripten 檔案系統、遊戲 driver 路由、動態 framebuffer、畫面方向與街機輸入橋接。

### EmulatorJS 備援與 Mega Drive

`src/snes/snes9x-backend.ts` 以隔離的 iframe 載入 EmulatorJS 核心，沿用既有的鍵盤、觸控與 F5/F7 存讀檔：

- **Genesis Plus GX**：Mega Drive / Genesis 的主要後端；內部系統鍵為 `genesis`，僅在 iframe 邊界轉成 `EJS_core=segaMD`。
- **Snes9x**：原生 SNES 核心未模擬 SA-1，SA-1 與 S-DD1 遊戲自動改走此路徑。
- **FCEUmm**：原生 NES 核心拒絕的 Mapper，以及少數已知黑畫面 ROM 的相容性備援。

### 遊戲中文化圖層

NES 核心提供執行期觀察與 profile 掛鉤；`src/game-profiles/` 依來源驗證的文字位置覆蓋高解析度中文，不修改原 ROM。詳見 [遊戲 Profile 與翻譯框架](GAME_PROFILE_AUTHORING.md)。

## 整合多世代核心的價值

- **同一介面比較硬體世代**：可直接觀察 6502、LR35902、Z80、65816 到 MIPS/R4300，以及 2D tile/sprite 到 3D RDP pipeline 的演進。
- **共用產品層**：ROM 選擇、存檔、音頻、觸控與響應式介面只需維護一套，再把差異留在核心邊界。
- **暴露真正的系統問題**：單一 demo 不容易遇到的資源生命週期、Canvas context、音頻排程、手機記憶體與多後端切換問題，在整合後都必須被正面處理。
- **建立可累積的驗證方法**：前一代主機建立的匯流排、時序、渲染與除錯經驗，可以成為挑戰下一代硬體的基礎。

## 主要目錄

```text
src/
├── main.ts                 # 應用入口、ROM 路由、後端生命週期
├── arcade/                 # FBNeo 適配與輸入/音視頻橋接
├── n64/                    # N64 runtime、效能 profile、遙測與資產檢查
├── snes/                   # EmulatorJS iframe 後端（Snes9x / FCEUmm / Genesis Plus GX）
├── game-profiles/          # 中文化圖層、選單覆蓋與翻譯編輯器
├── core/ + mappers/        # 早期 TypeScript NES 實作與參考
└── wasm/                   # wasm-pack 產物
nes-wasm/src/
├── lib.rs                  # 統一 WASM API
├── gb/                     # Game Boy
├── gg/                     # Game Gear / Master System
└── snes/                   # SFC / SNES
tests/                      # CPU、PPU、Mapper、N64 runtime/效能測試
tools/n64/                  # Mupen fork 取得與重建工具
artifacts/n64/              # 可重現的 N64 runtime 資產
```

## 文件索引

完整分類見 [文件導覽](README.md)。

## 建置與測試

```bash
npm install
npm run dev
npm test
npm run build
```

`npm run build` 會先以 `wasm-pack` 重建 Rust 核心，再執行 TypeScript 檢查與 Vite production build。完整指令與 N64 runtime 重建見 [開發指南](DEVELOPMENT.md)。
