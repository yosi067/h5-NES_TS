# 開發指南

> 現況：前端為 Vite + TypeScript；NES、GB、GG/SMS、SNES 由 `nes-wasm` Rust 核心編譯成 WASM，N64 使用 Mupen64Plus Web，街機使用 FBNeo，相容性備援與 Mega Drive 使用 EmulatorJS。本文件只講「怎麼開發」，架構說明見 [技術概覽](TECHNICAL_OVERVIEW.md)。

## 環境需求

| 工具 | 用途 |
|---|---|
| Node.js（CI 使用 24） | Vite、TypeScript、Vitest 與 `tools/*.mjs` |
| Rust + `wasm-pack` | 重建 `nes-wasm` → `src/wasm` |
| Docker | 只有重建 N64 Mupen fork 時需要 |
| PowerShell | `npm run n64:source` / `n64:build` 腳本 |

## 常用指令

| 指令 | 說明 |
|---|---|
| `npm install` | 安裝依賴 |
| `npm run dev` | 本機開發伺服器 |
| `npm run dev:mobile` | 以 `0.0.0.0` 開放區網，供手機實測 |
| `npm run wasm:build` | 只重建 Rust/WASM 核心 |
| `npm run build` | wasm-pack → `tsc --noEmit` → 清除 `dist` → Vite production build |
| `npm run preview` | 預覽 production build |
| `npm test` | Vitest（watch 模式） |
| `npx vitest run tests/<name>.test.ts` | 執行單一測試檔 |
| `npm run lint` | ESLint（`src`） |
| `npm run docs:pdf` | 把使用手冊與技術架構說明書匯出成 PDF 到 `docs/pdf/`（需要本機 Chrome，可用 `CHROME_PATH` 指定） |
| `npm run n64:source` / `npm run n64:build` | 取得並以 Docker 重建 N64 runtime fork |

中文化與遊戲資料相關指令另見：[遊戲 Profile 與翻譯框架](GAME_PROFILE_AUTHORING.md)、[足球小將 II](CT2_LOCALIZATION_STUDIO.md)、[Zombie Hunter](ZOMBIE_HUNTER.md)、[遊戲資料與封面](GAME_METADATA_PLAN.md)。

## 目錄速覽

```text
index.html                 # 頁面結構（樣式在 public/styles/ 與 public/*.css）
translation-studio.html    # CT2 翻譯工作室
src/
├── main.ts                # 入口：只負責依序啟動各模組
├── app/                   # 共用執行期狀態（runtime.ts）、偏好設定、儲存與除錯入口
├── backends/              # 模擬後端（見下方「前端架構」）
│   ├── types.ts           # EmulatorBackend 共同介面
│   ├── registry.ts        # 依目前後端取得 adapter
│   ├── lifecycle.ts       # 開始／暫停／繪製（分派給 adapter）
│   ├── native/            # 自製 Rust/WASM 核心：載入、幀迴圈、存檔、SFC 診斷
│   ├── fbneo/             # FBNeo 街機
│   ├── emulatorjs/        # EmulatorJS iframe（Snes9x / FCEUmm / Genesis Plus GX）
│   └── n64/               # Mupen64Plus
├── saves/                 # 存檔 key、即時存檔入口、自動存檔、SRAM、備份
├── session/               # 開始／結束一場遊戲、載入流程
├── input/                 # 鍵盤、手把、觸控按鍵對應與快捷鍵
├── lobby/                 # 大廳與主機／遊戲清單
├── features/              # 快轉、倒帶、玩家工具、效能面板
├── audio/                 # AudioWorklet 輸出
├── ui/                    # 控制器版面、電腦版舞台、對話框、RWD
├── catalog/               # 主機與 ROM 分類
├── arcade/ n64/ snes/     # 各外部核心的底層橋接
├── game-profiles/         # 中文化圖層、選單覆蓋、能力調整、翻譯編輯器
├── storage/               # IndexedDB 存檔儲存
├── data/rom-metadata/     # 遊戲資料
└── wasm/                  # wasm-pack 產物（勿手改）
nes-wasm/src/              # Rust 核心：NES（根目錄）、gb/、gg/、snes/
game-profiles/             # 遊戲 profile 原始檔、翻譯與 schema
public/                    # 靜態資源、樣式、roms.json、遊戲資料、AudioWorklet、編譯後 profile
roms/                      # 本機 ROM（不隨文件說明散布）
tests/                     # Vitest 測試
tools/                     # ROM 分析、中文化、稽核與 N64 建置工具
artifacts/                 # 可重現的研究輸出與 N64 runtime 資產
```

## 前端架構

- **後端 adapter**：四種模擬後端都實作 `src/backends/types.ts` 的 `EmulatorBackend`（開始／暫停、繪製、重置、即時存檔、自動存檔快照、SRAM、快轉、倒帶與 2P 支援）。其他模組一律透過 `getActiveBackend()` 呼叫，不自行判斷目前是哪個後端。
- **新增一個後端**：在 `BackendId` 加上代號、實作一個 adapter、在 `registry.ts` 登錄；TypeScript 會檢查每個代號都有 adapter。
- **存檔位置不可更改**：即時存檔 key 由 `saves/save-keys.ts` 產生（`emu_savestate_<核心標籤>_<ROM>_<欄位>`），核心標籤來自各 adapter 的 `saveKeyTag()`；SRAM 在 `emu_sram_<ROM>`。改動會讓玩家既有存檔讀不到。
- **共用狀態**：被多個模組寫入的狀態集中在 `src/app/runtime.ts`；其他狀態由各自模組持有並以 `export let` 唯讀公開。
- **樣式**：`index.html` 的 `<link>` 依序載入 `public/styles/`（基礎到最後覆寫）與 `public/*.css`，順序就是疊加優先序。
- **效能面板**：網址加 `?perf=1` 或遊戲中按 `F9`。顯示畫面／模擬 fps、每幀模擬與繪製耗時、長幀與音訊斷音；`window.h5Perf.snapshot()` 可供自動化量測。自製 SFC 核心的開發診斷記錄需加 `?snesDiag=1`。

## ROM 與遊戲目錄

1. 將自己依法持有的 ROM 放進 `roms/`（支援 `.nes`、`.gb/.gbc`、`.gg`、`.sms`、`.md/.gen/.smd`、`.sfc/.smc/.fig`、`.z64` 等，及其 `.zip`；街機需完整 FBNeo ROM set ZIP）。
2. 在 `public/roms.json` 新增 `{ "name", "file", "system" }`。`system` 省略時依副檔名判斷，無法判斷者視為 NES，因此 `.zip` 建議明確填寫。
3. Vite 的 `copyRomsPlugin()` 會在 build 時把目錄中的 ROM 複製到 `dist/roms/`；Pages 部署會排除 `vite.config.ts` 中 `pagesExcludedRomFiles` 列出的檔案。

遊戲大廳的介紹與封面資料流程見 [遊戲資料與卡匣呈現](GAME_METADATA_PLAN.md)；整體遊戲庫稽核見 [ROM 遊戲庫稽核](ROM_LIBRARY_AUDIT.md)。

## 後端路由

| 系統 | 主要後端 | 備援／例外 |
|---|---|---|
| NES / FC | Rust WASM | 原生核心拒絕的 Mapper 或已知黑畫面 ROM 改走 EmulatorJS FCEUmm |
| Game Boy、Game Gear、Master System | Rust WASM | — |
| SFC / SNES | Rust WASM | SA-1、S-DD1 遊戲改走 EmulatorJS Snes9x iframe |
| Mega Drive / Genesis | EmulatorJS Genesis Plus GX（`EJS_core` 為 `segaMD`） | — |
| Nintendo 64 | Mupen64Plus Web（獨立 WebGL2 canvas） | 手機預設使用重建 fork；`?n64Runtime=npm` 可回退 npm 版 |
| Arcade | FBNeo WASM | — |

EmulatorJS 的 runtime 檔案由 `vite.config.ts` 從 `node_modules/@emulatorjs/*` 提供與複製。

## 預設鍵盤配置

| 系統 | 配置 |
|---|---|
| NES / GB / GG / SMS | 方向鍵、`Z`=A、`X`=B、`Enter`=Start、右 `Shift`=Select |
| SNES | 同上，另加 `A`=Y、`S`=X、`Q`=L、`W`=R |
| Arcade | 方向鍵、`Z/X/A/S/Q/W`=A–F、`5`=投幣、`1` 或 `Enter`=開始 |
| N64 | 方向鍵=類比、`WASD`=十字鍵、`IJKL`=C 鍵、左 `Shift`=A、左 `Ctrl`=B、`Enter`=Start、`Z`=Z、`X`=L、`C`=R |

存檔快捷鍵：`F5` 存檔、`F7` 讀檔；`Shift+F1–F4` 存到欄位 1–4，`Ctrl+1–4` 讀取欄位 1–4。

電腦版可在選單（`M` 或 `F1`）的「按鍵」分頁改鍵，鍵盤與外接手把／街機基板都能綁定，設定存在 `localStorage`（`h5emu.input-bindings.v1`）。`Esc`、`M`、`Tab`、`F1–F12` 保留給舞台功能，不能指派給遊戲。N64 改鍵後由本頁攔截並轉送合成按鍵給 Mupen；維持預設時不攔截。

## 虛擬控制器與電腦版舞台

- `src/ui/controls/`：觸控輸入引擎。`direction.ts`（極座標扇形、浮動搖桿、斜角過渡）、`buttons.ts`（容器級多點命中、隱形重疊區、巨集、連發）、`profiles.ts`（`NES_GB` / `SNES` / `ARCADE_FIGHTING` / `ARCADE_SHMUP` / `ARCADE_GENERIC` / `N64_PS1`）、`layouts.ts`（把 DOM 與核心轉接器接起來）。按鈕判定直接讀 DOM 的實際位置，不在 Profile 重複存座標。
- 街機 Profile 依遊戲名稱選擇（格鬥／射擊對照表在 `profiles.ts`）；巨集鍵只在該遊戲按鈕數足夠時出現。N64 搖桿仍是數位八方向（鍵盤事件），不輸出類比向量。
- `src/ui/desktop-stage.ts` + `public/game-stage-desktop.css`：電腦版（`body.desktop-ui`）依主機換外框、頂部工具列、側邊抽屜。畫面以 `stage-fit.ts` 計算「不裁切、不變形」的最大尺寸；全螢幕時自動收起抽屜，工具列放進黑邊，沒有黑邊才浮在畫面角落。
- 觸控裝置版面在 `public/game-stage.css`；`browser-env.ts` 負責內嵌瀏覽器（LINE 等）偵測與直立版畫面高度預算。

## 測試策略

- **單元／整合測試**：`tests/` 涵蓋音訊 Worklet、街機輸入、ROM 目錄、SNES 路由、N64 runtime／音訊／遙測、中文化圖層等。
- **Node 測試**：`tools/*.test.mjs`，多數需要本機 ROM，透過 `npm run test:profiles`、`test:localization:*`、`test:zombie:*` 等指令執行。
- **Rust 原 ROM 診斷**：`cargo test --manifest-path nes-wasm/Cargo.toml --release <name> -- --ignored --nocapture`，例如 `test:ct2:stats:rom`。
- **實機驗收**：以實際遊戲畫面、音訊與效能數據為準，「能啟動」不等於「行為正確」。N64 的手機驗收規格見 [N64 iPhone 音訊](N64_IPHONE_AUDIO.md)。

## 新增或修正核心功能

1. 先以實際遊戲重現問題，記錄 ROM、場景與症狀。
2. 對照 [nesdev wiki](https://www.nesdev.org/wiki/) 或各平台硬體文件，確認規格；NES 速查見 [NES 技術規格](NES_SPECS.md)。
3. 在 `nes-wasm/src/` 修改，`npm run wasm:build` 後回到瀏覽器驗證。
4. 補上可重現的測試，並把根因與修正寫進 [問題與修復紀錄](TROUBLESHOOTING.md)。

新增 NES Mapper 時，修改 `nes-wasm/src/mappers.rs`（早期的 TypeScript 核心已移除）。

## 部署

推送到 `main` 會觸發 `.github/workflows/deploy.yml`：安裝 Rust、wasm-pack 與 Node 24 → `npm ci` → 以 `PAGES_DEPLOY=true`、`VITE_BASE_PATH=/<repo>/` 執行 `npm run build` → 檢查 `dist` 小於 1 GiB → 部署到 GitHub Pages。

注意事項：

- `.gitattributes` 必須把 `*.data` 視為 binary，否則 N64 preload archive 會被換行正規化破壞。
- production build 會驗證 `artifacts/n64` 的 manifest 與資產檔名；缺少時需還原 `artifacts/n64/mupen64plus-web-1.5.7-baseline` 或執行 `npm run n64:build`。詳見 [N64 瀏覽器核心優化計畫](N64_CORE_OPTIMIZATION_PLAN.md)。

## 參考資源

- [nesdev.org Wiki](https://www.nesdev.org/wiki/)：NES 硬體與測試 ROM
- [Mesen](https://www.mesen.ca/)、[FCEUX](http://fceux.com/)：NES 行為比對
- [Near 與 Snes9x 團隊的故事](NEAR_AND_SNES9X_TRIBUTE.md)
