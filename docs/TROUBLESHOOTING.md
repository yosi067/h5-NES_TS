# 問題與修復紀錄

本文件記錄 H5-EMU 多平台模擬器開發中遇到的關鍵技術問題與修復，依平台與子系統分類。
每則條目依「症狀 → 根因 → 修正 → 驗證」整理；「驗證」只列出實際執行過的檢查。
系統架構見 [TECHNICAL_OVERVIEW.md](TECHNICAL_OVERVIEW.md)，建置與測試流程見 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 目錄

- **Arcade（FBNeo）**：ARC-1 ROM set 載入 · ARC-2 切換遊戲越界 · ARC-3 雷電直向畫面 · ARC-4 街機觸控按鍵
- **SNES CPU / 匯流排**：SNES-1 RDNMI VBlank 旗標 · SNES-2 LoROM SRAM 寫入 · SNES-3 H-IRQ 觸發 · SNES-4 65816 短分支 cycle
- **SNES PPU**：SNES-5 Mode 5 hi-res · SNES-6 Mode 7 latch · SNES-7 OAM 優先級旋轉 · SNES-8 圖層優先級 · SNES-9 OBJ palette color math · SNES-10 CGWSEL / direct color · SNES-11 水平捲動 latch
- **SNES APU**：SNES-12 FIR 精度 · SNES-13 BRR / Gauss 尺度 · SNES-14 SPC700 分支 cycle · SNES-15 `$B8` opcode · SNES-16 IPL ROM · SNES-17 APU cycle 漂移 · SNES-18 Sub screen backdrop
- **SNES DMA / HDMA**：SNES-19 HDMA 間接指標 · SNES-20 HDMA 掃描線 0
- **SNES 協處理器**：SNES-21 DSP-1 Newton 截斷 · SNES-22 DSP-1 Raster Output 迴圈 · SNES-23 CX4
- **N64（Mupen64Plus Web）**：N64-1 首次啟動畫面尺寸 · N64-2 手機掉幀與爆音 · N64-3 效能基準參數 · N64-4 iPhone 瓶頸量測 · N64-5 rebuilt runtime 啟動失敗 · N64-6 Rice renderer 瓶頸定位
- **NES**：NES-1 CPU off-by-one · NES-2 Mapper 225 鏡像 · NES-3 Mapper 253 · NES-4 DMC silence · NES-5 `$4017` 延遲 · NES-6 DMC / frame counter / pulse 對齊 · NES-7 DMC 搶用 OAM DMA
- **Game Gear / Master System**：GG-1 DAA H 旗標 · GG-2 INI/IND 時序 · GG-3 Line/Frame IRQ · GG-4 CRAM 寫入 · GG-5 精靈 Y 環繞
- **Game Boy**：GB-1 方向鍵

---

## Arcade（FBNeo）— Raiden / Warriors of Fate

### ARC-1：`raiden.zip` / `wof.zip` 被當成一般 ZIP ROM

- **症狀**：上傳或選取後，原流程在 zip 內尋找 `.nes/.sfc/.gb` 等單一 ROM，FBNeo 收不到完整 ROM set。
- **根因**：街機 ROM set 由多個 chip 檔組成，FBNeo 需依遊戲名稱與檔名/CRC 檢查整包內容。
- **修正**：`src/main.ts` 以檔名辨識後直接切到 FBNeo backend；`src/arcade/fbneo-core.ts` 以 JSZip 解包，寫入 `/roms/<game>.zip` 與 `/roms/<game>/` 後啟動 `@mantou/fbneo` runtime。缺檔或 CRC 不符時 stdout/stderr 回傳前端提示。

### ARC-2：切換 FBNeo 遊戲時 `memory access out of bounds`

- **症狀**：先玩《雷電》再切到《吞食天地二》，所有 chip 已列為 `(OK)`，Emscripten runtime 仍可能越界。
- **根因**：Mantou FBNeo runtime 不適合在同一 module instance 內反覆切換大型遊戲，前一款的內部狀態可能殘留。
- **修正**：每次載入都建立新的 `FbNeoArcadeCore` instance，不共用舊的 Emscripten memory 與 native 狀態。

### ARC-3：《雷電》畫面方向不符直向玩法

- **症狀**：原始 framebuffer 為橫向排列，直接貼到 Canvas 不符直向射擊遊戲觀感。
- **修正**：僅對 `raiden` 在前端左轉 90 度：Canvas 由 `256x224` 改為 `224x256`，逐像素 remap；`wof` 的 `384x224` 橫向畫面不受影響。

### ARC-4：手機觸控只有 A/B

- **症狀**：NES/SNES 觸控配置不足以操作格鬥或清版動作遊戲。
- **修正**：新增 `#arcade-controller-area`：十字鍵，加上 COIN、START、MUTE 與 A-F 六顆圓形按鈕。前端仍用 32-bit bitmask，再轉為 Mantou FBNeo `_setEmInput(playerIndex, state, alx, aly, arx, ary)`。

## SNES — CPU / 匯流排

### SNES-1：FF6 / MMX2 開場全黑 — RDNMI（$4210）VBlank 旗標

- **症狀**：Final Fantasy VI、Mega Man X2 開場全黑，主迴圈卡在 `LDA $4210 / BPL`。亦影響超時空之鑰等以 VBlank 輪詢的遊戲。
- **根因**：$4210 實作為讀取後清除 bit 7；NMI handler 先讀走後主迴圈永遠讀到 0。硬體上 bit 7 在整個 VBlank（掃描線 225-261）持續為 1。
- **修正**：讀取不再清除 bit 7；改為掃描線 225 設定、掃描線 0 清除。

### SNES-2：LoROM SRAM 寫入遺失

- **症狀**：LoROM 遊戲存檔後讀回為空或損毀。
- **根因**：`bus_write_system_low()` 缺少 $6000-$7FFF 處理，bank $40-$6F 的 SRAM 寫入被靜默丟棄。
- **修正**：新增 $6000-$7FFF match arm：`sram_addr = ((effective & 0x1F) * 0x2000) + (addr - 0x6000)`。

### SNES-3：H-IRQ 在掃描線內從不觸發

- **症狀**：Super Mario Kart（SMK）Mode 7 賽道的 WRAM 緩衝區全為零，HDMA 傳空資料到 M7 暫存器；追查到 DSP-1 Raster 命令未發出、IRQ handler 從未執行。
- **根因**：H-IRQ 只在 cycle-leftover 區塊檢查，指令執行後不檢查；V+H 組合 IRQ 永遠不會在掃描線中間觸發。
- **修正**：CPU 迴圈每條指令執行後都檢查 H-IRQ 條件。

### SNES-4：65816 短分支固定 2 cycles

- **症狀**：SMK 已能進賽道，但 DSP-1 Raster 與 NMI/IRQ 緊密迴圈時序不正確。
- **根因**：BPL/BMI/BVC/BVS/BRA/BCC/BCS/BNE/BEQ 固定 2 cycles。正確為未採用 2、採用 +1，emulation mode 跨 page 再 +1。
- **修正**：短分支共用 timing helper；BRA 套用必定採用規則；native mode 無跨 page penalty。
- **驗證**：回歸測試涵蓋未採用、同 page、native 跨 page、emulation 跨 page。

## SNES — PPU 渲染

### SNES-5：Mode 5 高解析度文字亂碼（聖劍傳說 2/3）

- **症狀**：Secret of Mana（SoM2）、Seiken Densetsu 3（SD3）的對話框、名字輸入、字幕亂碼或消失；開場 credits 可見但模糊。
- **根因**：Mode 5（hi-res 512px）落入通用 `_ => render_bg(0, y, 4, 4, 8)`。每個 tilemap entry 應覆蓋 16 hi-res 像素（兩個 8x8 character 並排），被當作 256px 模式解讀而錯位。
- **修正**：新增 `render_bg_hires()`：
  - 輸出像素 x 映射到 hi-res 座標 x*2；水平捲動仍以 256px 計數，取樣前須乘 2，否則字形在 tile N/N+1 邊界錯位
  - tile N = 左 8px、tile N+1 = 右 8px；支援 flip_x/flip_y 與 16px 高 tile
  - Mode 4/5/6 各自正確路由

### SNES-6：Mode 7 暫存器 flip-flop 導致 HDMA 錯亂

- **症狀**：SD3 開場 Mode 7 背景劇烈跳動後崩潰；M7A-M7D（$211B-$211E）的 HDMA 寫入值被翻轉組合。影響 SD3、SoM2 等 Mode 7 + HDMA 遊戲。
- **根因**：持久 flip-flop 交替寫低/高 byte；VBlank 一次多餘寫入永久翻轉狀態，之後所有 HDMA 更新高低 byte 互換。
- **修正**：改為標準 byte-latch：`reg = (val << 8) | m7_latch; m7_latch = val`；移除 `m7_flipflop`、`m7_low_buffer`。

### SNES-7：OAM 優先級旋轉未實作 — SMK 賽車閃爍

- **症狀**：SMK 其他車手精靈閃爍且位置錯誤。
- **根因**：$2103 bit 7（priority rotation）已解析但未套用；啟用時應從 `(oam_addr_reload >> 2) & 0x7F` 開始遍歷，而非 sprite 0。
- **修正**：精靈評估從 `first_sprite` 開始、以 0x7F 環繞；收集後依 OAM index 排序再渲染（低 index 在上層）。

### SNES-8：圖層優先級數值錯誤 — FF6 精靈被背景遮擋

- **症狀**：FF6 背景遮擋精靈或精靈順序錯亂。
- **根因**：Mode 0/1 BG priority 數值過高，與 OBJ 範圍重疊甚至超過。
- **修正**：重新校正 Mode 0~7 所有圖層 priority，使 BG（low/high）與 OBJ priority 0~3 正確交錯。

### SNES-9：OBJ 半透明規則反向（palette 0-3 / 4-7）

- **症狀**：不該透明的 OBJ 被混色，或該半透明的 OBJ 未套用 color math（Secret of Mana、SD3 等）。
- **根因**：`composite_scanline()` 把 palettes 4-7 排除在 color math 外、讓 0-3 參與。硬體上 0-3 永不參與，只有 4-7 在 `$2131 CGADSUB` OBJ bit 啟用時參與。
- **修正**：`nes-wasm/src/snes/ppu.rs` 的 OBJ source（`src == 4`）：`main_obj_pal < 4` 不做 color math；`>= 4` 依 `CGADSUB bit 4` 決定。

### SNES-10：Color math 來源反向與缺 direct color（聖劍傳說 2 開頭色彩）

- **症狀**：許多透明物件變成不透明或混色錯誤；Secret of Mana 開頭與部分 256 色背景色彩不自然。
- **根因**：
  1. `$2130 CGWSEL` bit 1 解讀反向：硬體上 bit=0 用 fixed color、bit=1 用 sub screen 作第二來源。
  2. Mode 3/4 BG1 8bpp 在 `$2130` bit 0 啟用 direct color 時仍查 CGRAM（direct color 應由 tile palette bits + pixel bits 直接產生 RGB）。
- **修正**：
  1. `using_fixed` 改為 `self.cgwsel & 0x02 == 0`；bit 1 設定時改用 `sub_buf`。
  2. 新增 `direct_color_to_rgba()`、`uses_direct_color()`，一般 BG 與 Mode 5/6 hires sampler 皆支援 BG1 8bpp direct color。

### SNES-11：水平捲動量化為 8px — 超時空之鑰背景卡頓

- **症狀**：開頭場景橫向移動時，背景停住後一次跳約 8px。
- **根因**：`$210D/$210F/$2111/$2113` 需 PPU1/PPU2 兩個共享 latch；舊實作只有一個，低 3 位沿用該 BG 舊值，1-7px 細捲動被丟棄。
- **修正**：寫入改為 `data << 8 | (latch1 & ~7) | (latch2 & 7)`，每次 H-scroll 寫入後同步更新兩個 latch。
- **驗證**：回歸測試逐一驗證 0-15px。

## SNES — APU 音頻

### SNES-12：FIR 回聲濾波精度損失 — 音效刺耳 / 回聲過大

- **症狀**：FF6 風聲 SFX 刺耳；SoM2 回聲淹沒主旋律；echo 輸出幅度異常大。
- **根因**：
  1. FIR 每個 tap 各自 `>>6`，小乘積被截為 0，頻率響應失真
  2. BRR 解碼使用 wrapping 而非 clamping，溢出產生噪音
- **修正**：先累加 8 個 tap 乘積再 `>>6` 並 clamp 到 16-bit（同 blargg `clamp16(sum >> 6)`）；BRR 輸出 `.max(-32768).min(32767)`。

### SNES-13：BRR decode 與 Gauss interpolation 尺度不一致 — 特定音色刺耳

- **症狀**：某種樂器或音效仍有刺耳高頻；回退到 commit `0590b1efed1900f7270cb2934a2a4b4fa0cef541` 後改善但仍殘留。
- **根因**：`nes-wasm/src/snes/apu.rs` 的 `generate_sample()` 已回到舊版 Gauss 路徑（末端 `>> 1`），但 `decode_next_sample()` 仍在推入 Gauss ring buffer 前額外 `<< 1`，兩種尺度混用。
- **修正**：BRR decode 還原為 `0590b1e` 行為：filter 2/3 公式回到參考版、filter output 只 clamp 到 16-bit、ring buffer 寫入 `clamped as i16`（不再 `<< 1`）。
- **驗證**：`npm run build` 通過；Secret of Mana 可啟動出圖；特定場景音色仍待聽感確認。

### SNES-14：SPC700 分支指令 cycle 數錯誤

- **症狀**：多款遊戲 APU 時序異常或不穩定。
- **根因**：條件分支（BPL/BMI/BCC/BCS/BNE/BEQ 等）固定 2 cycles；正確為未跳 2、跳轉 4。CBNE、DBNZ、BBS/BBC 也各有不同 taken/not-taken 值。
- **修正**：校正全部 10+ 條分支指令 cycle 數。

### SNES-15：SPC700 缺少 `$B8` opcode — PC 跑飛

- **症狀**：音頻異常或 SPC700 執行亂碼。
- **根因**：`$B8`（SBC dp, #imm）未實作，被跳過後 PC 對齊錯誤，後續解碼全亂。
- **修正**：補上 `$B8: SBC dp, #imm` 完整實作。

### SNES-16：IPL ROM 被 RAM 寫入覆蓋

- **症狀**：APU 初始化後行為異常。
- **根因**：IPL ROM 只存在 RAM 陣列，寫入 $FFC0-$FFFF 會覆蓋 boot ROM。
- **修正**：新增獨立 `ipl_rom: [u8; 64]`，$FFC0-$FFFF 讀取一律由此取值。

### SNES-17：APU 分數 cycle 累積漂移

- **症狀**：長時間遊玩後音訊與畫面逐漸不同步。
- **根因**：每條掃描線的 APU cycle 計算丟棄小數，每幀漂移約 249 SPC cycles。
- **修正**：新增 `apu_master_remainder: u32`：`total_master = 1364 + remainder`、APU cycles = `total_master / 21`、新 remainder = `total_master % 21`。

### SNES-18：Sub screen 背景為純黑 — 色彩數學異常

- **症狀**：SoM2 名字輸入 UI 不可見（混色結果全黑）。
- **根因**：Sub screen 預設填 0x000000，而非 CGRAM[0]（backdrop）；Main + Sub = Main + 黑。
- **修正**：`sub_buf[x]` 初始值改為 `bgr15_to_rgba(cgram[0])`。

## SNES — DMA / HDMA

### SNES-19：HDMA 間接定址指標欄位缺失

- **症狀**：使用 HDMA 間接模式的遊戲（如 SMK）光柵效果失敗。
- **根因**：間接模式需從表格讀出 16-bit 指標存入獨立欄位，原實作與 `count` 混用。
- **修正**：DMA channel 新增 `indirect_addr: u16`，init/transfer 時讀取並使用。

### SNES-20：HDMA 掃描線 0 不應傳輸

- **症狀**：HDMA 效果第一行資料錯誤。
- **根因**：掃描線 0 應只載入第一筆 entry 與間接指標，原實作也做了傳輸。
- **修正**：掃描線 0 只 init；1 以後才 transfer → decrement → reload。

## SNES — 協處理器

### SNES-21：DSP-1 Newton 疊代精度不符 — Mode 7 地面扭曲

- **症狀**：DSP-1 Inverse 結果錯誤，Mode 7 地面紋理與精靈定位失準。
- **根因**：Newton 疊代用 `i32` 累加，snes9x 用 `i16` 截斷，中間值不同。
- **修正**：每步疊代後 `as i16 as i32` 截斷到 16-bit 有號範圍。

### SNES-22：DSP-1 Raster Output 階段無限迴圈

- **症狀**：DSP-1 卡在 Raster Output（54 commands/1800 frames），不退出 Mode 7 計算迴圈。
- **根因**：`write_dr` 在 Raster Output 階段消費寫入並自動 repeat。
- **修正**：skip-without-repeat：每次 dummy write 只丟棄一個待輸出 byte、不觸發 auto-repeat；清空後回 Idle，與 snes9x 一致。
- **驗證**：
  - 測試涵蓋完整 8-byte flush 與已讀半個 word 後的剩餘輸出。
  - 日版 SMK：可進入賽事、CPU 無 BRK、DSP-1 在 Output/Params/Idle 間推進；單幀 trace 為 SL25-114 上方 Mode 7、SL115 分隔列、SL116-224 下方 Mode 7，M7A-D 四條間接 HDMA 各消耗約 104 筆；300 frames 後排名與賽道持續更新，無水平撕裂。

### SNES-23：CX4 協處理器未實作 — Mega Man X2/X3 無法運行

- **症狀**：MMX2、MMX3 載入後無畫面。
- **根因**：Hitachi HG51B169（CX4）未實作；這兩款是唯一使用 CX4 的遊戲。
- **修正**：HLE 實作 `cx4.rs`：ROM 偵測（$F3 + LoROM + 擴展標頭 $7FBF=0x10）、記憶體映射（$6000-$7FFF RAM/I/O）、命令分派（build_oam、math、wireframe 等）、匯流排路由。

## N64 — Mupen64Plus Web 後端

詳細量測、benchmark 結果與優化路線見 [N64_CORE_OPTIMIZATION_PLAN.md](N64_CORE_OPTIMIZATION_PLAN.md)；iPhone 音訊見 [N64_IPHONE_AUDIO.md](N64_IPHONE_AUDIO.md)。

### N64-1：首次啟動時畫面內容尺寸錯誤

- **症狀**：畫面上方與右側被裁切或留清屏色；外框仍是正確的 `4:3`。
- **根因**：手機 backing 變成 `390x292`，Rice viewport 仍只畫 `320x240`（非 CSS overflow）。Mupen `start()` 先非同步準備 IDBFS，SDL/Rice 之後才讀 canvas 尺寸，此時 CSS 已放大，SDL 便以顯示尺寸改寫 backing；假 `resize` / `orientationchange` 事件使競態更不穩。
- **修正**（`src/main.ts`）：建立全新 `<canvas id="canvas">`（不重用已取得 2D context 的 `#screen`）；初始化期間以 `body.n64-initializing` 將 CSS 固定為 profile 原生尺寸，Rice 第一個 `beginStats`（第一個 VI）後才鎖定 WebGL backing 並移除該 class；停止或失敗時一律清除；不再發送假 resize。
- **驗證**：Pages base path 的 production preview（iPhone profile）：Super Mario 64 backing `320x240`、CSS `390x292.5` 填滿 `4:3`；切 Mario Kart 64 仍為 `320x240`；切 NES 正確還原 `#screen` 與 `256x240`。

### N64-2：手機嚴重掉幀與音訊爆音

- **根因**：所有裝置固定 `640x480`，Rice 用精確材質映射、mipmap 與 sinc resampler；高更新率手機讓 rAF 主迴圈以 90/120 Hz 喚醒；reset 時複製完整 ROM 造成記憶體尖峰與 GC。
- **修正**：
  - 效能 profile：手機 `320x240` backing、快速材質載入、16-bit texture；Android low-end 保留跳幀 + trivial resampler；iPhone/iPad 用 cached interpreter、不跳幀、rAF 同步、3072/1024 audio buffers、`src-linear` resampler。ROM reset 共用原始 buffer。
  - 音訊短缺：rebuilt fork 只對 SDL callback 不足的尾端補靜音，送往 `n64-audio-processor` AudioWorklet 的 Float32 chunk 不含補零尾端。Worklet 先累積 1024 frames、queue 超過 6144 frames 丟最舊、drain 後以 64-frame crossfade 恢復；SDL ScriptProcessor 留在 zero-gain sink 作 producer 與 fallback。
  - 啟動或切換後無聲：app AudioWorklet 與 Mupen SDL 是不同 AudioContext。保留 click/keydown/touchstart 恢復監聽，Rice 第一個 VI 後恢復 SDL，頁面 visible 時恢復兩者；fork control 必須讀 `Module.SDL2.audioContext`（lexical `SDL2` 會靜默失效）。
  - 正式路徑：mobile 預設載入 64 MiB initial memory 的 rebuilt fork + triangle stream；desktop 維持 npm 1.5.7。`?n64Runtime=npm` / `?n64Runtime=fork` 可強制切換。
- **驗證**：
  - 主控台 `[N64 perf]` 每 5 秒輸出 VI/s、VI avg/max、long VI、recompiles、audio underruns（SDL source-side，非 Worklet underflow）。NTSC 穩定低於約 56 VI/s 代表核心未達 real-time；long VI 與 recompiles 同高代表 Wasm 重編譯卡點；recompiles 下降但 underruns 仍增，代表主執行緒長工作餓死音訊。
  - production preview 模擬兩個 context suspended，visibility 與 click 均觸發兩次 resume。
  - Pages：fork bundle、Wasm、data 共用 asset version 檔名，artifact 不完整則 build 失敗，Actions 依 repository name 設 `VITE_BASE_PATH`；驗收須確認不帶 query 的手機路徑選到 fork 並進入 3D 畫面，不能只看 HTTP 200。
- **限制**：單執行緒 Mupen64Plus/Rice Wasm；音訊緩衝只能遮蔽短暫 gap，持續 underrun 須先降低 renderer stall。

### N64-3：A/B 效能基準參數

- **用法**：`?n64Benchmark=1`：暖機 30 秒、採樣 60 秒，輸出 `[N64 benchmark result]`；未啟用時不覆寫正常設定。須同 ROM、場景、裝置與溫度比較。例：`?n64Benchmark=1&n64EmuMode=2&n64SkipFrame=1&n64Timing=0`。
- **參數**：`n64EmuMode=1|2`（cached interpreter / Wasm recompiler）、`n64SkipFrame=0|1`、`n64Timing=0|1`（rAF / timer）、`n64Runtime=fork`（固定 source/toolchain 重建版；省略為 npm 1.5.7 rollback）、`n64MobileTest=baseline|stream|full`（手機短測，固定 fork，10 秒暖機 + 20 秒採樣）。僅在 benchmark + fork 時生效：`n64NullVideo=1`（NoVideo plugin，黑屏為預期）、`n64SuppressDraw=1`（保留 Rice DList/texture/state，抑制主要 GL draw）、`n64PersistentBuffers=1`（triangle streaming ring）、`n64PersistentRectBuffers=1`（另加 rectangle ring，需搭配前者）。
- **狀態**：baseline/stream/full 手機簡測已完成；下一次只在另一個大型 renderer 調整通過本機三款遊戲驗收後安排。

### N64-4：iPhone 基準的瓶頸判讀

- **數據**（iPhone 17 Pro Max）：
  - SM64：recompiler 27.23 VI/s、cached interpreter 27.65 VI/s；recompiler 穩態仍 163 次 recompiles，吞吐量低約 1.5%，最長 VI 118 → 207 ms。關閉 SkipFrame 僅 27.65 → 27.06 VI/s（約 2.1%）。
  - MK64 / OoT（cached interpreter、no SkipFrame、rAF）：21.24 VI/s（平均 38.89 ms、最長 275 ms，比 SM64 慢約 21.5%，約即時 35%）/ 21.98 VI/s（43.37 ms、212 ms，約 36.6%）。OoT 90 秒內無 diagnostic，但不能據此宣稱長時間閃退已修復。
- **結論**：SkipFrame 收益小只代表它沒避開主要工作；N64-6 確認瓶頸在 Rice GL draw 入口與 WebGL 提交。降解析度不是首選，WebGPU 保留為 WebGL 優化不足時的候選。
- **崩潰分類**：benchmark 模式將 JS error、unhandled rejection、Mupen `setErrorStatus`、`webglcontextlost` POST 到開發伺服器 `/__n64-benchmark`，Vite 主控台以 `[N64 benchmark received]`、`event: diagnostic` 與 `type` 區分來源。Safari 直接終止頁面時來不及送出，需以 Web Inspector 或系統記錄確認。

### N64-5：rebuilt runtime（`n64Runtime=fork`）啟動失敗

- **症狀**：ROM 下載後即顯示啟動失敗。依序出現：無 diagnostic → `initWasmRecompiler` 的 `ReferenceError: wasmExports is not defined` → 588-page artifact 在 `startCore` Asyncify rewind 發生 `memory access out of bounds`（desktop 與 iPhone 皆可重現）→ 正式站另一次越界。
- **根因**：
  1. upstream `main.js` 是給 bundler 的來源入口（extensionless imports、`axios` bare import），不能直接當 browser module。
  2. Emscripten 3.1.25 的 exports 在 `Module['asm']`，舊 `corelib.js` 仍用不存在的 `wasmExports`。
  3. 加入 instrumentation 後仍沿用 npm 的 38,535,168-byte 初始記憶體。
  4. Windows `core.autocrlf=true` 把 binary `.data` 從 537,524 bytes 正規化成 515,609-byte Git blob，Actions 部署了損壞的 preload archive。
- **修正**：
  1. `npm run n64:build` 以 esbuild 產生 `main.bundle.js` 供 fork 載入，並新增 backend startup 與 `start()` rejection diagnostic。
  2. 版本化 core submodule patch，function table 與 memory 存取改用 `Module['asm']`。
  3. （2026-07-19）fork 改為 64 MiB（1024 pages），manifest 記錄 `initialMemoryBytes=67108864`，build 拒絕缺此值的 artifact。
  4. `.gitattributes` 加 `*.data binary`；bundle、data、Wasm 以相同 asset version 檔名原子發布。
- **驗證**：
  - 桌面完成 Rice/RSP/Input 初始化並輸出 VI telemetry；修復後 SM64、MK64 完成第一個 VI，OoT 完成啟動且無越界。
  - iPhone fork 對 npm baseline（5% 驗收門檻內，無相容性回歸；長時間遊玩的歷史閃退仍未排除）：

    | 遊戲 | npm VI/s | fork VI/s | 差異 | 平均 VI (ms) | 最長 VI (ms) |
    | --- | --- | --- | --- | --- | --- |
    | SM64 | 27.060 | 27.082 | +0.08% | 差異 < 0.4%（噪音） | 114 → 107 |
    | MK64 | 21.24 | 21.94 | +3.32% | 38.89 → 37.51 | 275 → 147 |
    | OoT | 21.98 | 22.70 | +3.29% | 43.37 → 41.92 | 212 → 116 |

### N64-6：Rice renderer 瓶頸定位與 triangle stream ring

- **量測方式**：instrumented fork 在 C 端累加 RSP、DList/RDP、present、audio plugin 與五個主要 draw 入口的 triangle/rectangle 時間與呼叫數，隨每 VI 一次的 `endStats` 傳回（`averageCoreResidualMs`、`averageTriangleDrawMs` 等欄位；DList/RDP 已含在 RSP 內，不可再從 residual 扣除；npm rollback 欄位為 0）。
- **SM64 結果**：

  | 模式 | VI/s | ms/VI | 重點 |
  | --- | --- | --- | --- |
  | 正常 Rice | 27.20 | 31.68 | RSP 28.22、DList 28.08（88.6%）、residual 3.45、present 0.012、audio 0.003 ms |
  | null-video（`n64NullVideo=1`） | 60.0 | 6.13 | max 9 ms、0 long VI、residual 6.12 ms |
  | no-draw（`n64SuppressDraw=1`） | 59.98 | 12.19 | DList 0.24 ms（parser/ucode/texture/state 照常執行） |

  約 27.84 ms/VI 位於 GL draw 入口與周邊 WebGL 提交，不應優先重構 R4300 或降解析度；維持 60 VI/s 時 renderer 預算約 10.55 ms/VI，DList 需減少至少 62.4%。應先處理 WebGL 同步點、client array 上傳與 draw batching，再評估 WebGPU。
- **null-video 無結果（bug）**：黑屏如預期但 90 秒後 server 收不到結果。Web cached-interpreter loop 以 `viArrived` 決定何時 yield，Rice 由 `VidExt_GL_SwapBuffers()` 遞增，但 dummy `UpdateScreen()` 為空，loop 永不返回 JS。修正：dummy video 在 `UpdateScreen()` 遞增 `viArrived`（不繪圖）；static console 辨識 `--gfx dummy` 以連接真正的 NoVideo plugin。
- **triangle stream ring**（`n64PersistentBuffers=1`）：position/fog、兩組 texture coordinates 與 color 交錯成 40-byte vertex，寫入單一 2.56 MB `GL_STREAM_DRAW` ring，改用 `glDrawArrays`；每 VI 第一批 orphan buffer、後續依序追加，每 draw 三次 upload 降為一次，批次後恢復原 client pointers。
- **iPhone 固定場景 A/B**（2026-07-19）：

  | 模式 | VI/s | ms/VI | DList ms | triangle ms | rectangle ms | underruns |
  | --- | --- | --- | --- | --- | --- | --- |
  | baseline | 16.71 | 57.69 | 48.16 | 0.469 | 46.47 | 706 |
  | stream | 38.22 | 21.39 | 18.70 | 0.078 | 18.36 | 290 |
  | full（+ rectangle ring，36-byte vertex） | 37.7 | 22.0 | — | — | 18.4 | 449 |
  | stream + audio 4096/2048 | 37.9 | 21.7 | — | — | 18.1 | 435 |

- **結論**：triangle ring 保留（VI/s +128.7%、DList −61.2%、underruns −58.9%）；rectangle 未修改卻同步下降，表示 client-array 同步等待會跨 draw 入口累積。rectangle ring 無收益，flag 維持關閉（使用者主觀較好但仍有輕微爆音，記為可能的 run-to-run 差異）。加大 audio buffer 未改善且延遲稍增，preset 已移除，iOS 維持 3072/1024；剩餘爆音應由降低 renderer stall 處理。

## NES — CPU 時序

核心規格見 [NES_SPECS.md](NES_SPECS.md)。

### NES-1：CPU 指令 off-by-one — Zombie Hunter 場景跳動

- **症狀**：Zombie Hunter 進入遊戲後場景跳動、部分文字顯示錯誤。
- **根因**：排除 APU、PPU scroll、Mapper 1 後定位到 `cpu_clock()`：指令執行本身佔 1 個 CPU cycle，但 `cycles` 未扣除，所有指令多耗 1 cycle，吞吐量降約 22%，VBlank handler 無法在時限內完成。
- **修正**：`cpu_clock()` 每次執行指令後 `cycles = cycles.saturating_sub(1)`。

## NES — Mapper

### NES-2：Mapper 225 鏡像反轉 — 合集遊戲藍屏

- **症狀**：64 合 1 遊戲開啟後藍屏。
- **根因**：FCEUX 使用 `setmirror(mirr ^ 1)`（MI_V=0、MI_H=1），原實作 bit13 對應相反。
- **修正**：bit13=0 → Horizontal，bit13=1 → Vertical。

### NES-3：Mapper 253 多重錯誤 — 龍珠 Z 破圖

- **症狀**：龍珠 Z 強襲賽亞人部分畫面破圖。
- **根因**：
  1. 缺少 CHR RAM 替換（`chrlo==4||5` 且 `!vlock`）
  2. 缺少 vlock 機制（`chrlo[0]==0xC8` 解鎖、`0x88` 鎖定）
  3. chrhi 儲存錯誤（`data & 0x10` → 應為 `data >> 4`）
  4. 地址解碼錯誤（應使用 FCEUX 公式）
- **修正**：以 FCEUX `253.cpp` 為參考完整重寫，新增 CHR RAM 混合映射。

## NES — APU 音頻

### NES-4：DMC 通道邏輯缺陷 — Captain Tsubasa II 音效消失

- **症狀**：部分音效聽不到，且有爆音。
- **根因**：DMC 缺少 `silence` 旗標，無資料時仍修改輸出電平；缺少濾波器導致 DC 偏移與高頻雜訊。
- **修正**：新增 silence 旗標、初始 bits_remaining=8、低通/高通濾波器、軟削波。

### NES-5：`$4017` 寫入延遲與 DMC 啟動時序 — FC 音樂細微差異

- **症狀**：部分 FC 遊戲音樂與參考模擬器相比，節奏、包絡或音效進入時機有些微差異。
- **根因**：
  1. `$4017` 寫入當下即重置 frame counter，5-step 模式也立即 clock quarter/half frame；硬體依 CPU cycle 奇偶延遲 3 或 4 CPU cycles，使 envelope、length counter、sweep、linear counter 的 clock 邊界提早。
  2. `$4015` 從 bytes_remaining 0 重新啟用 DMC 時未立即發出第一次 sample fetch request，首個 sample 偏晚。
- **修正**：
  1. 新增 `pending_frame_counter_write`，依 `cycle & 1` 延遲 3 或 4 CPU cycles 後才套用 mode / IRQ inhibit / immediate quarter+half frame clock。
  2. 需要 restart 時呼叫 `fetch_dmc_sample()` 產生初始讀取請求（後續由 NES-6 校正為依 parity 延後）。

### NES-6：DMC / frame counter / pulse 相位與主流模擬器不一致

- **症狀**：DMC 音高偏低或播放速度不對；包絡線、長度計數器與掃頻變化約快一倍；重寫 `$4003/$4007` 後 pulse 相位不一致。
- **根因**（對照 Mesen2 `Core/NES/APU/DeltaModulationChannel.cpp`、`ApuFrameCounter.h` 與 FCEUX `src/sound.cpp`、`documentation/tech/cpu/dmc.txt`）：
  1. DMC rate table 是 CPU cycle 間隔，DMC 必須每個 CPU cycle clock；428、380、…、54 需以 `period - 1` 載入倒數器才得到精確的 `period` cycles。
  2. NTSC frame counter 邊界為 7457、14913、22371、29829；4-step IRQ window 從 29828 開始，29829 才 clock 最後的 quarter/half frame；5-step 最後一步為 37281。原 Rust 值 3729、7457、11186、14915、18641 約為一半。
  3. pulse duty table 採反向計數相位；寫入 `$4003/$4007` 重設為 0 後，下一個 timer rollover 走到位置 7。
  4. DMC 啟用後第一次 fetch 依 CPU parity 延後 2 或 3 個 APU cycles；DMA 依序經過 halt、dummy、必要的 alignment 與 memory read。
- **修正**：
  1. DMC clock 移到每個 CPU cycle，以 `period - 1` 套用 NTSC rate table。
  2. 校正 4-step/5-step frame counter 的 NTSC CPU-cycle 邊界。
  3. pulse sequencer 改為 3-bit 反向計數，保留 length write 的位置重設。
  4. `$4015` 讀取立即解除 frame IRQ line，但 status bit 保留到下一個 APU cycle 才清除；`$4017` 的 IRQ inhibit 仍立即生效。
  5. DMC request 保留到資料真正交付，以 halt/dummy/alignment/read phase 執行：下一個 CPU slot 為偶數耗 3 slots、奇數耗 4 slots；stale request 可在 read 前取消；DMC ready 時可 steal OAM DMA 的 read slot，OAM 傳輸暫停該 slot。
- **驗證**：
  - Rust APU/emulator 測試涵蓋 DMC 精確週期、啟用/停用延遲、DMA parity、取消、OAM overlap、loop/IRQ/address wrap/silence、frame counter 邊界、IRQ acknowledge 與 pulse duty phase。
  - `cargo test --manifest-path nes-wasm/Cargo.toml --lib` 通過：79 個測試通過，3 個需 ROM 的手動 trace 測試預設忽略。
  - 限制：尚未以同一測試 ROM 對 FCEUmm、Nestopia 做 PCM golden comparison；CPU 尚非逐 bus cycle，未完整模擬 `$4000-$401F` internal bus conflict、controller bit deletion 與 DMC/OAM 同時進行時的所有讀取順序。

### NES-7：DMC 搶用 OAM DMA 讀取槽 — 足球小將 2 閃爍彩色方塊

- **症狀**：足球小將 2 開頭人物畫面間歇出現位置與顏色不定的 8x8 方塊（單張截圖不一定捕捉得到）；其他同時使用 DMC 與 OAM DMA 的遊戲也可能有短暫 sprite tile 雜訊。
- **根因**：DMC DMA 在偶數 CPU slot 搶走 OAM DMA 的 source read 後，下一個奇數 write slot 仍把殘留的 `dma_data` 寫入新 OAM 位址並前進 index，使 sprite 的 Y、tile、attribute 或 X byte 偶發重複/錯位。先前的 sprite Y row 修正只校正 CHR 取樣列，無法避免 OAM 被污染。
- **修正**：OAM DMA 新增 `dma_data_ready`：完成 source read 才允許下一個 write，寫入後立即清除；read 被 DMC 搶走時，write slot 停住直到下一次 read 取得資料。
- **驗證**：回歸測試預放 stale `dma_data`、讓 DMC 搶走 OAM read 後推進到 write slot，確認 OAM byte 與 DMA address 皆未變動。Rust suite 79 passed、3 ignored，`npm run build` 通過。

## Game Gear / Master System — Z80 CPU

### GG-1：DAA H 旗標不精確 — Ninku 開頭崩潰

- **症狀**：GG 忍空開頭動畫崩潰。
- **根因**：DAA 的 Half-Carry 旗標計算不正確。
- **修正**：採用 MAME/ZEXALL 公式 `H = ((original_a ^ corrected_a) & 0x10) != 0`。

### GG-2：INI/IND B 遞減時序 — Defenders of Oasis 選單不顯示

- **症狀**：選單無法顯示。
- **根因**：INI/IND 的 B 遞減在 mem_write 之後，不符 Z80 硬體時序。
- **修正**：順序改為 read port → decrement B → write memory。

## Game Gear / Master System — VDP

### GG-3：Line IRQ / Frame IRQ 共用旗標 — 捲軸閃爍

- **症狀**：部分遊戲捲軸與 HUD 閃爍。
- **根因**：行中斷與幀中斷共用 `irq_pending`，讀取狀態時互相清除。
- **修正**：新增 `line_irq_pending` 獨立追蹤，`irq_pending` 動態計算。

### GG-4：CRAM 寫入邏輯錯誤 — 色盤異常

- **症狀**：色彩渲染異常。
- **根因**：CRAM latch 狀態機過於複雜，與 GG 硬體不符。
- **修正**：移除狀態機，偶數位址暫存、奇數位址組合寫入 12-bit RGB444。

### GG-5：精靈 Y 座標環繞 — GG 精靈消失

- **症狀**：GG 模式下某些精靈消失或位置錯誤。
- **根因**：Y >= 0xD1（209）的精靈應 wrap 到畫面頂部但未處理。
- **修正**：以 `(y_raw + 1) % 256` 計算實際 Y。

## Game Boy — Joypad

### GB-1：方向鍵完全無法操作

- **症狀**：GB 遊戲方向鍵無反應。
- **根因**：`read()` 中 `result` 低 4 位初始為 0x0，方向 bank AND 結果永遠為 0x00，等同所有方向同時按下。
- **修正**：低 4 位初始化為 0x0F（全部放開），由選取的 bank 以 AND 清除對應 bit。
