# 文件導覽

依閱讀目的分類。每份文件開頭都有一段「現況」摘要，先讀摘要再決定是否往下看。

## 入門

| 文件 | 內容 |
|---|---|
| [../README.md](../README.md) | 專案介紹、平台、快速開始 |
| [TECHNICAL_OVERVIEW.md](TECHNICAL_OVERVIEW.md) | 執行架構、各後端邊界、主要目錄 |
| [DEVELOPMENT.md](DEVELOPMENT.md) | 環境、指令、ROM 目錄、後端路由、鍵盤、測試、部署 |
| [NEAR_AND_SNES9X_TRIBUTE.md](NEAR_AND_SNES9X_TRIBUTE.md) | 致敬 Near 與 Snes9x 團隊的模擬器故事 |

## 模擬核心

| 文件 | 內容 |
|---|---|
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | 各平台實際遇到的相容性問題：症狀 → 根因 → 修正 |
| [CORE_OPTIMIZATION_PLAN.md](CORE_OPTIMIZATION_PLAN.md) | 各主機相容性掃描與優化計畫 |
| [NES_SPECS.md](NES_SPECS.md) | NES 時序、記憶體映射、6502、PPU、iNES、Mapper 速查 |

## Nintendo 64

| 文件 | 內容 |
|---|---|
| [N64_CORE_OPTIMIZATION_PLAN.md](N64_CORE_OPTIMIZATION_PLAN.md) | runtime 架構、效能 profile、分階段優化與驗收矩陣 |
| [N64_IPHONE_AUDIO.md](N64_IPHONE_AUDIO.md) | iPhone 目前接受版本、音訊診斷工具與實機量測 |

## 遊戲中文化

| 文件 | 內容 |
|---|---|
| [FC_LOCALIZATION_PLAYBOOK.md](FC_LOCALIZATION_PLAYBOOK.md) | FC 中文化最短可靠流程（新遊戲先讀這份） |
| [GAME_PROFILE_AUTHORING.md](GAME_PROFILE_AUTHORING.md) | 執行期遊戲 profile 與翻譯框架、共用指令 |
| [CT2_LOCALIZATION_STUDIO.md](CT2_LOCALIZATION_STUDIO.md) | 足球小將 II：翻譯工作室、覆蓋範圍與限制 |
| [CT2_TRANSLATION_INVENTORY.md](CT2_TRANSLATION_INVENTORY.md) | 足球小將 II：文字萃取清冊 |
| [CT2_PLAYER_STATS_RESEARCH.md](CT2_PLAYER_STATS_RESEARCH.md) | 足球小將 II：球員能力原版證據與遊戲內調整 |
| [ZOMBIE_HUNTER.md](ZOMBIE_HUNTER.md) | Zombie Hunter：選單繁中、最高等級與工時估算 |
| [LOCALIZATION_RETROSPECTIVE_OPTIMIZATION.md](LOCALIZATION_RETROSPECTIVE_OPTIMIZATION.md) | 中文化後回頭要做的模擬器優化 |

## 遊戲庫

| 文件 | 內容 |
|---|---|
| [ROM_LIBRARY_AUDIT.md](ROM_LIBRARY_AUDIT.md) | 遊戲庫掃描、街機排行與新增 ROM 驗證 |
| [GAME_METADATA_PLAN.md](GAME_METADATA_PLAN.md) | 遊戲介紹、封面與卡匣呈現的資料流程 |

## 撰寫新文件的慣例

- 標題下方先寫一段 `> 現況：`，讓讀者三行內知道結論。
- 依「現況 → 使用方式 → 證據 → 限制與待辦 → 歷史紀錄」排列；過時內容濃縮成歷史紀錄中的一行，不要整段保留。
- 新增或更名文件後，同步更新本頁。
