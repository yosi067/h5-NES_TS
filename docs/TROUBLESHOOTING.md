# 🔧 問題集 — 開發過程中遇到的難題與解決方案

本文件記錄了 H5-EMU 多平台模擬器開發過程中遇到的關鍵技術問題，包含排查思路與最終解決方案。按平台與子系統分類。

---

## 目錄

- [SNES — CPU / 匯流排](#snes--cpu--匯流排)
- [SNES — PPU 渲染](#snes--ppu-渲染)
- [SNES — APU 音頻](#snes--apu-音頻)
- [SNES — DMA / HDMA](#snes--dma--hdma)
- [SNES — 協處理器](#snes--協處理器)
- [N64 — Mupen64Plus Web 後端](#n64--mupen64plus-web-後端)
- [FBNeo Arcade — Raiden / Warriors of Fate](#fbneo-arcade--raiden--warriors-of-fate)
- [NES — CPU 時序](#nes--cpu-時序)
- [NES — Mapper](#nes--mapper)
- [NES — APU 音頻](#nes--apu-音頻)
- [Game Gear / Master System — Z80 CPU](#game-gear--master-system--z80-cpu)
- [Game Gear / Master System — VDP](#game-gear--master-system--vdp)
- [Game Boy — Joypad](#game-boy--joypad)

---

## FBNeo Arcade — Raiden / Warriors of Fate

### Q1: `raiden.zip` / `wof.zip` 被當成一般 ZIP ROM，無法由 FBNeo 載入

**現象**：Arcade zip 上傳或從清單選取後，原流程會嘗試在 zip 內尋找 `.nes/.sfc/.gb` 等單一主機 ROM，導致 FBNeo 無法收到完整 ROM set。

**原因**：街機 ROM set 是多個 chip 檔組成的 zip，FBNeo 需要依遊戲名稱與檔名/CRC 檢查整包內容，不能只抽出第一個檔案。

**解決**：`src/main.ts` 先以檔名辨識 `raiden.zip` / `wof.zip`，直接切到 FBNeo backend。`src/arcade/fbneo-core.ts` 使用 JSZip 解包，寫入 `/roms/<game>.zip` 與 `/roms/<game>/`，再啟動 `@mantou/fbneo` runtime。若缺檔或 CRC 不符，stdout/stderr 會回傳給前端提示。

---

### Q2: 從一款 FBNeo 遊戲切換到另一款時發生 `memory access out of bounds`

**現象**：先玩《雷電》再切到《吞食天地二》時，FBNeo 已列出所有 chip `(OK)`，但 Emscripten runtime 仍可能丟出 `memory access out of bounds`。

**原因**：Mantou FBNeo runtime 不適合在同一個 module instance 內反覆切換大型 arcade 遊戲，前一款遊戲的內部狀態可能殘留。

**解決**：每次載入 FBNeo arcade ROM 都建立新的 `FbNeoArcadeCore` instance，避免共用舊的 Emscripten memory 與 native 狀態。

---

### Q3: 《雷電》畫面方向不符合直向街機玩法

**現象**：《雷電》原始 framebuffer 是橫向資料排列，直接貼到 Canvas 時不符合直向射擊遊戲的操作觀感。

**解決**：只對 `raiden` 啟用前端 framebuffer 左轉 90 度：Canvas 尺寸由 `256x224` 轉成 `224x256`，渲染時逐像素 remap，不影響 `wof` 的 `384x224` 橫向畫面。

---

### Q4: 手機觸控只提供 A/B，街機遊戲操作不夠

**現象**：原本 NES/SNES 觸控配置不適合 FBNeo arcade，尤其是格鬥或清版動作遊戲可能需要更多按鍵。

**解決**：新增 `#arcade-controller-area`，保留十字鍵，右側提供 COIN、START、MUTE 與 A-F 六顆街機常用圓形按鈕。前端仍使用 32-bit bitmask，再轉成 Mantou FBNeo `_setEmInput(playerIndex, state, alx, aly, arx, ary)`。

---

## SNES — CPU / 匯流排

### Q1: FF6 / MMX2 開場動畫全黑 — RDNMI ($4210) VBlank 旗標問題

**現象**：Final Fantasy VI 和 Mega Man X2 的開場動畫全黑，遊戲主迴圈卡在 `LDA $4210 / BPL` 無限迴圈。

**排查**：透過 CPU trace 發現主迴圈不斷輪詢 $4210 bit 7，但永遠讀到 0。NMI handler 已先讀取過 $4210 並清除了 bit 7。

**原因**：RDNMI 暫存器實作為「讀取後清除 bit 7」（edge-triggered）。然而 SNES 硬體上，$4210 bit 7 反映的是 VBlank **連續狀態** — 在整個 VBlank 期間 (掃描線 225-261) 持續為 HIGH。NMI handler 先讀取一次後清除了旗標，主迴圈再也看不到。

**解決**：$4210 讀取不再清除 bit 7。改為在掃描線 225 設定 bit 7，掃描線 0 清除。VBlank 期間 NMI handler 和主迴圈都能看到 bit 7 = 1。

**影響遊戲**：FF6、MMX2、超時空之鑰 等使用 VBlank 輪詢的遊戲。

---

### Q2: LoROM SRAM 寫入遺失 — 存檔資料損毀

**現象**：LoROM 遊戲存檔後讀取資料為空或損毀。

**原因**：`bus_write_system_low()` 缺少 $6000-$7FFF 地址範圍的處理。來自 bank $40-$6F 的 SRAM 寫入靜默丟棄。

**解決**：新增 $6000-$7FFF match arm，使用公式 `sram_addr = ((effective & 0x1F) * 0x2000) + (addr - 0x6000)` 正確路由至 SRAM。

---

### Q3: H-IRQ 在掃描線內從不觸發

**現象**：Super Mario Kart 的 Mode 7 賽道 WRAM 緩衝區全為零，HDMA 傳輸空資料到 M7 暫存器。

**排查**：發現 DSP-1 Raster 命令從未被發出，追溯到 IRQ handler 從未執行。

**原因**：H-IRQ 只在「cycle-leftover」區塊中檢查，CPU 指令執行後不檢查。V+H 組合 IRQ 也永遠不會在掃描線中間觸發。

**解決**：在 CPU 迴圈中每條指令執行後都檢查 H-IRQ 條件，使中斷能在掃描線任意位置觸發。

---

## SNES — PPU 渲染

### Q4: Mode 5 高解析度文字亂碼 — 聖劍傳說 2/3

**現象**：Secret of Mana (SoM2) 和 Seiken Densetsu 3 (SD3) 的對話框、名字輸入選單、字幕文字全部亂碼或消失。

**排查**：開場 credits 文字可見但模糊不清，PPU 在 Mode 5 (hi-res 512px) 運行。原先 Mode 5 落入 `_ => render_bg(0, y, 4, 4, 8)` 通用處理。

**原因**：Mode 5 是高解析度模式，每個 tilemap entry 覆蓋 16 hi-res 像素（兩個 8x8 character 並排），但被當作普通 256px 模式渲染，tile 資料解讀完全錯位。

**解決**：新增 `render_bg_hires()` 方法：
- 每個輸出像素 x 映射到 hi-res 座標 x*2
- tilemap entry 覆蓋 16 hi-res 像素，tile N = 左 8px，tile N+1 = 右 8px
- 支援 flip_x/flip_y 和 16px 高 tile
- Mode 4/5/6 各自正確路由

**影響遊戲**：所有使用 Mode 5 文字的遊戲 (SoM2、SD3 等)。

---

### Q5: Mode 7 暫存器 flip-flop 導致 HDMA 錯亂

**現象**：SD3 開場 Mode 7 背景劇烈跳動後崩潰。

**排查**：M7A-M7D 暫存器 ($211B-$211E) 值異常，追蹤到 HDMA 寫入的值被翻轉組合。

**原因**：Mode 7 暫存器使用持久性 flip-flop（奇/偶交替寫入低/高字節）。VBlank 期間一次多餘的寫入永久翻轉了 flip-flop 狀態，導致後續所有 HDMA 更新的高低字節互換。

**解決**：改為標準 byte-latch 模式：`reg = (val << 8) | m7_latch; m7_latch = val`。每次寫入立即更新，無持久狀態。移除 `m7_flipflop` 和 `m7_low_buffer` 欄位。

**影響遊戲**：SD3、SoM2、所有使用 Mode 7 + HDMA 的遊戲。

---

### Q6: OAM 優先級旋轉未實作 — SMK 賽車閃爍

**現象**：Super Mario Kart 其他車手的卡丁車精靈閃爍且位置錯誤。

**原因**：$2103 bit 7（OAM priority rotation）已解析但未在精靈評估中應用。啟用時應從 `(oam_addr_reload >> 2) & 0x7F` 開始遍歷，而非固定從 sprite 0 開始。

**解決**：啟用 priority rotation 時，精靈評估從 `first_sprite` 偏移開始、0x7F 環繞。收集到的精靈在渲染前按 OAM index 排序（低 index 繪製在上層）。

---

### Q7: PPU 圖層優先級值錯誤 — FF6 精靈被背景遮擋

**現象**：FF6 圖層顯示混亂，背景遮擋精靈或精靈順序不對。

**原因**：Mode 0/1 的 BG 優先級數值設定過高，與 OBJ 優先級範圍重疊甚至超過。

**解決**：重新校正 Mode 0~7 所有圖層的 priority 數值，確保 BG (low/high) 與 OBJ (priority 0~3) 正確交錯排列。

---

### Q8: OBJ 透明物件混合錯誤 — palette 0-3 / 4-7 規則反向

**現象**：SNES 遊戲中部分透明物件、半透明精靈或特效看起來不正確，可能出現不該透明的 OBJ 被混合，或應該半透明的 OBJ 沒有套用 color math。

**排查**：檢查 `composite_scanline()` 的 OBJ color math 條件後發現規則反向：程式把 OBJ palettes 4-7 排除 color math，卻讓 palettes 0-3 可參與混合。

**原因**：SNES 硬體規則是 OBJ palettes 0-3 不參與 color math，只有 OBJ palettes 4-7 在 `$2131 CGADSUB` 的 OBJ bit 啟用時才參與主/副畫面色彩運算。

**解決**：`nes-wasm/src/snes/ppu.rs` 中 OBJ source (`src == 4`) 的 color math 條件改為：
- `main_obj_pal < 4`：永遠不做 color math
- `main_obj_pal >= 4`：依 `CGADSUB bit 4` 決定是否做 color math

**影響遊戲**：Secret of Mana、Seiken Densetsu 3，以及使用 OBJ 半透明特效的 SNES 遊戲。

---

### Q8.1: Color Math 來源判斷錯誤 — 透明物件失去半透明 / 聖劍傳說 2 開頭色彩異常

**現象**：SFC 遊戲中不少透明物件看起來變成不透明或色彩混合錯誤；Secret of Mana / 聖劍傳說 2 開頭畫面與部分 256 色背景顯示不自然。

**排查**：追蹤 `composite_scanline()` 發現 `$2130 CGWSEL` bit 1 被解讀成「使用 fixed color」。實際硬體語意是 bit 1 控制是否使用 sub screen 作為 color math 第二來源：bit=0 使用 fixed color，bit=1 使用 sub screen。原實作剛好反向，導致多數依賴主/副畫面加減法的半透明效果套到錯誤來源。

同時檢查 Mode 3/4 的 8bpp BG1 渲染，發現 `$2130` bit 0 啟用 direct color 時仍從 CGRAM 查色。部分開場或特效畫面會用 direct color 直接由 tile palette bits + pixel bits 產生 RGB，缺少這條路徑會造成色彩不符。

**原因**：
1. `$2130` bit 1 的 sub screen / fixed color 選擇邏輯反向。
2. BG1 8bpp direct color 模式未實作，Mode 3/4 仍一律查 CGRAM。

**解決**：
1. `using_fixed` 改為 `self.cgwsel & 0x02 == 0`，bit 1 設定時改用 `sub_buf`。
2. 新增 `direct_color_to_rgba()` 與 `uses_direct_color()`，在一般 BG 與 Mode 5/6 hires sampler 中支援 BG1 8bpp direct color。

**影響遊戲**：Secret of Mana / 聖劍傳說 2、Seiken Densetsu 3，以及依賴 sub screen 半透明、fixed color 加減法或 direct color 的 SFC 遊戲。

---

## SNES — APU 音頻

### Q9: FIR 回聲濾波器精度損失 — 音效刺耳 / 回聲過大

**現象**：FF6 風聲 SFX 刺耳；SoM2 回聲/混響淹沒主旋律。

**排查**：echo 輸出幅度異常大，FIR 濾波結果不正確。

**原因**：
1. FIR 濾波每個 tap 分別做 `>>6`，小乘積被截斷為 0，頻率響應失真
2. BRR 解碼使用 wrapping 而非 clamping，溢出產生噪音

**解決**：
1. 先累加全部 8 個 tap 的乘積，再做一次 `>>6` 並 clamp 到 16-bit（匹配 blargg `clamp16(sum >> 6)`）
2. BRR 解碼輸出 `.max(-32768).min(32767)`

---

### Q10: BRR decode 與 Gauss interpolation 尺度不一致 — 特定音色刺耳

**現象**：SNES 音樂整體可接受，但某一種特定音頻、樂器或音效仍有刺耳高頻。回退到 commit `0590b1efed1900f7270cb2934a2a4b4fa0cef541` 後改善，但仍殘留部分異常。

**排查**：比對 `0590b1e` 的 `nes-wasm/src/snes/apu.rs` 發現 `generate_sample()` 已回到舊版 Gauss 路徑，但 `decode_next_sample()` 仍保留較新的 BRR 輸出尺度：把 sample 推入 Gauss ring buffer 前額外 `<< 1`。舊版 Gauss interpolation 末端已經做 `>> 1`，兩種尺度混用會放大或偏移部分 BRR 樣本的高頻內容。

**原因**：BRR decode 與 Gauss interpolation 需要使用一致的 sample 尺度。只回退 `generate_sample()` 而未同步回退 BRR decode，會讓某些 BRR 樣本在插值與 envelope 前後的幅度不符合參考版本。

**解決**：將 BRR decode 還原為 `0590b1e` 行為：
- filter 2/3 公式回到參考版本
- BRR filter output 只 clamp 到 16-bit
- Gauss ring buffer 寫入 `clamped as i16`，不再額外 `<< 1`

**驗證**：`npm run build` 通過；Secret of Mana 可啟動出圖。實際音色仍需以聽感確認特定場景。

---

### Q11: SPC700 分支指令 cycle 數全部錯誤

**現象**：多款 SNES 遊戲音頻時序異常或 APU 行為不穩定。

**原因**：所有條件分支 (BPL/BMI/BCC/BCS/BNE/BEQ 等) 固定返回 2 cycles。正確值應為：未跳轉 2 cycles、跳轉 4 cycles。CBNE、DBNZ、BBS/BBC 也各有不同的 taken/not-taken 值。

**解決**：校正全部 10+ 條分支指令的 cycle 數。

---

### Q12: SPC700 缺少 $B8 opcode — PC 跑飛

**現象**：多款遊戲音頻異常或 SPC700 執行亂碼。

**原因**：opcode `$B8` (SBC dp, #imm) 未實作。遇到時跳過，PC 對齊錯誤，後續所有指令解碼錯亂。

**解決**：補上 `$B8: SBC dp, #imm` 完整實作。

---

### Q13: IPL ROM 被 RAM 寫入覆蓋

**現象**：APU 初始化後行為異常。

**原因**：IPL ROM 只存在 RAM 陣列中，寫入 $FFC0-$FFFF 會覆蓋 boot ROM 內容。

**解決**：新增獨立 `ipl_rom: [u8; 64]` 欄位，$FFC0-$FFFF 讀取始終從 ipl_rom 取值。

---

### Q14: APU 分數 cycle 累積漂移

**現象**：長時間遊玩後音頻與視頻逐漸不同步。

**原因**：每條掃描線的 APU cycle 計算丟棄小數餘數。每幀漂移約 249 SPC cycles。

**解決**：新增 `apu_master_remainder: u32`，每條掃描線 `total_master = 1364 + remainder`，APU cycles = `total_master / 21`，新 remainder = `total_master % 21`。

---

### Q15: Sub Screen 背景色為純黑 — 色彩數學異常

**現象**：SoM2 名字輸入 UI 不可見（色彩混合結果全黑）。

**原因**：Sub screen 預設填充為 0x000000 (黑色)，而非 CGRAM[0] (backdrop 色)。色彩加法 Main + Sub = Main + 黑 = 暗色。

**解決**：`sub_buf[x]` 初始值改為 `bgr15_to_rgba(cgram[0])`。

---

## SNES — DMA / HDMA

### Q16: HDMA 間接定址指標欄位缺失

**現象**：使用 HDMA 間接模式的遊戲（如 SMK）光柵效果失敗。

**原因**：HDMA 間接模式需要從表格讀取 16-bit 指標存入獨立的 `indirect_addr`，再從該位址傳輸。原實作缺少此欄位，與 `count` 混用。

**解決**：DMA channel 新增 `indirect_addr: u16`，init/transfer 時正確讀取並使用間接指標。

---

### Q17: HDMA 掃描線 0 不應傳輸資料

**現象**：HDMA 效果第一行資料錯誤。

**原因**：掃描線 0 應只載入第一筆 entry（和間接指標），不執行傳輸。原實作在掃描線 0 也傳輸了。

**解決**：掃描線 0 只做 init（載入 entry + indirect），掃描線 1+ 才執行 transfer → decrement → reload。

---

## SNES — 協處理器

### Q18: DSP-1 Newton 疊代精度不符 — Mode 7 地面扭曲

**現象**：DSP-1 Inverse 函數結果錯誤，Mode 7 地面紋理和精靈定位失準。

**原因**：Newton 疊代使用 `i32` 累加器，而 snes9x 使用 `i16` 截斷。每步疊代的中間值不同導致結果偏差。

**解決**：每步 Newton 疊代後加入 `as i16 as i32` 強制截斷到 16-bit 有號範圍。

---

### Q19: DSP-1 Raster Output 階段無限迴圈

**現象**：DSP-1 卡在 Raster Output 階段（54 commands/1800 frames），永遠不退出 Mode 7 計算迴圈。

**原因**：`write_dr` 在 Raster Output 階段消費寫入並自動 repeat，形成無限迴圈。

**解決**：實作 skip-without-repeat：遞減 word counter，輸出完成時退出到 Idle，精確匹配 snes9x 邏輯。

---

### Q18: CX4 協處理器未實作 — Mega Man X2/X3 無法運行

**現象**：Mega Man X2 和 X3 載入後無畫面。

**原因**：Hitachi HG51B169 (CX4) 協處理器未實作。這兩款是唯一使用 CX4 的遊戲。

**解決**：實作 HLE CX4 (`cx4.rs`)：ROM 偵測（$F3 + LoROM + 擴展標頭 $7FBF=0x10）、記憶體映射（$6000-$7FFF RAM/I/O）、命令分派（build_oam、math、wireframe 等）、匯流排路由。

---

## N64 — Mupen64Plus Web 後端

### Q1: 第一次啟動 N64 ROM 時畫面內容尺寸錯誤

**現象**：第一次啟動 N64 遊戲時，畫面上方與右側被裁切或留下大片清屏色；外框本身仍是正確的 `4:3`。

**排查**：DOM 量測顯示外層 `.screen-bezel` 與 canvas CSS 尺寸正確，但手機 canvas backing變成`390x292`，Rice viewport仍只繪製`320x240`。因此內容落在部分畫布內，問題不是CSS overflow。

**原因**：Mupen的`start()`會先非同步準備IDBFS，之後SDL/Rice才讀取canvas尺寸。若此時CSS已放大至容器寬度，SDL會用顯示尺寸改寫backing；發送假的`resize`或`orientationchange`事件會讓這個競態更不穩定。

**解決**：`src/main.ts` 新增 N64 專用適配流程：
- 建立全新的 `<canvas id="canvas">`，避免重用已取得 2D context 的 `#screen`
- SDL/Rice初始化期間以`body.n64-initializing`將CSS尺寸固定為效能profile的原生尺寸
- Rice第一個`beginStats`（第一個VI）回呼後才鎖定WebGL backing，並移除初始化class恢復responsive CSS
- backend停止或啟動失敗時一律清除初始化class；不再發送假的window/orientation resize pulse

**驗證**：GitHub Pages base path的production preview以iPhone profile啟動Super Mario 64後，backing為`320x240`、CSS為`390x292.5`，完整畫面填滿`4:3` canvas。切換Mario Kart 64後仍為`320x240`；切至NES則正確還原`#screen`與`256x240`。

### Q2: N64 在手機上嚴重掉幀與音頻爆音

**原因**：舊流程在所有裝置固定繪製 `640x480`，Rice 使用精確材質映射、mipmap 與 sinc resampler；高更新率手機還會讓 `requestAnimationFrame` 主迴圈以 90/120 Hz 喚醒。重設遊戲時額外複製完整 ROM，也會造成行動裝置記憶體尖峰與 GC 壓力。

**解決**：新增自動效能 profile。手機使用 N64 原生級 `320x240` backing store、快速材質載入、16-bit texture 與 trivial resampler；Android low-end 保留畫面跳幀。iPhone/iPad 改用 cached interpreter、關閉畫面跳幀，並使用 rAF 同步與 3072/1024 audio buffers，避免 Safari 的 1ms timer 抖動餓死主執行緒音頻回呼。ROM reset 改為共用原始 buffer。

**量測**：開啟瀏覽器遠端主控台，搜尋 `[N64 perf]`。每五秒會顯示 VI/s、VI avg/max、long VI、recompiles與audio underruns。NTSC 遊戲穩定低於約 56 VI/s 表示核心本身未達 real-time；若 long VI 與 recompiles 同時偏高，啟動初期的 Wasm 動態重編譯是主要卡點。若recompiles已下降但audio underruns仍持續增加，表示renderer或其他主執行緒長工作仍在餓死SDL/Web Audio供料。

**音訊短缺處理**：rebuilt fork會保留SDL callback當下仍可安全resample的樣本，只將不足尾端補靜音，不再因少量短缺捨棄整個callback。SDL累積underrun counter透過既有每VI telemetry傳回，沒有新增高頻JS crossing。這可降低破碎幅度並提供客觀計數，但無法替代把Rice renderer降到real-time預算內；若手機持續大量underrun，仍應先降低主執行緒render stall。

**啟動或切換後無聲**：app AudioWorklet與Mupen SDL使用不同的AudioContext。N64啟動前呼叫resume時，SDL context可能尚未建立；Safari也可能在背景切換後再次暫停context。頁面現在保留click、keydown與touchstart恢復監聽，在Rice第一個VI後再恢復SDL，並於頁面回到visible時同時恢復兩個context。fork control必須讀取`Module.SDL2.audioContext`，直接引用lexical `SDL2`會因符號不在該scope而靜默失效。production preview將兩個context模擬為suspended後，visibility與後續click均確認觸發兩次resume。

**限制**：這個後端仍是單執行緒 Mupen64Plus/Rice WebAssembly。遊戲相容性與最終速度仍受手機 SoC、瀏覽器 WebGL 驅動及遊戲本身負載影響；低階裝置會以畫面更新率換取穩定遊戲速度。

**正式手機路徑**：mobile不帶benchmark參數時載入64 MiB initial memory的rebuilt fork並啟用triangle stream；desktop維持npm 1.5.7。`?n64Runtime=npm`可強制手機回退，`?n64Runtime=fork`可在desktop明確測試fork。

**GitHub Pages部署檢查**：production build包含帶共同asset version實體檔名的fork bundle、Wasm與data。Vite會在artifact不完整時使build失敗；GitHub Actions依repository name設定`VITE_BASE_PATH`。正式驗收必須另外確認不帶query的手機路徑選到rebuilt fork並能進入3D畫面，不能只檢查靜態artifact為HTTP 200。

### Q3: 如何取得可重現的 N64 A/B 效能基準

**方法**：在網址 query string 加上 `n64Benchmark=1`。模擬器會先暖機 30 秒，再收集 60 秒穩態資料，最後輸出 `[N64 benchmark result]`。未啟用 benchmark 時不會覆寫正常設定。

可選參數：
- `n64MobileTest=baseline|stream|full`：手機短版renderer比較；固定rebuilt fork，使用10秒暖機與20秒採樣。stream只啟用triangle ring，full另含已判定不採用的rectangle ring
- `n64EmuMode=1|2`：cached interpreter / Wasm recompiler
- `n64SkipFrame=0|1`：關閉 / 開啟 Rice SkipFrame
- `n64Timing=0|1`：requestAnimationFrame / timer
- `n64Runtime=fork`：使用固定 source/toolchain 重建的 baseline；省略時使用 npm 1.5.7 rollback runtime
- `n64NullVideo=1`：只在benchmark與fork同時啟用時改用核心內建NoVideo plugin；畫面全黑是預期行為，正常遊玩與npm runtime不受影響
- `n64SuppressDraw=1`：只在benchmark與fork同時啟用時保留Rice DList解析、texture與state處理，但抑制主要GL draw calls；用來估算替換render backend的收益上限
- `n64PersistentBuffers=1`：只在benchmark與fork同時啟用Rice triangle交錯streaming ring A/B；rectangle與預設Rice路徑不變
- `n64PersistentRectBuffers=1`：需同時啟用`n64PersistentBuffers=1`；將四條rectangle draw路徑移至獨立交錯ring

例如：`?n64Benchmark=1&n64EmuMode=2&n64SkipFrame=1&n64Timing=0`。比較不同組合時必須使用同一 ROM、場景、裝置與溫度條件。

baseline、stream與full手機簡測已完成，不需重跑。目前沒有待執行的手機短測；下一次只會在另一個大型renderer調整通過本機三款遊戲驗收後安排。

### Q4: iPhone N64 基準顯示主要瓶頸在哪裡

**Super Mario 64 實測**（iPhone 17 Pro Max）：Wasm recompiler (`emuMode=2`) 為 27.23 VI/s，cached interpreter (`emuMode=1`) 為 27.65 VI/s。recompiler 在穩態期間仍產生 163 次 recompiles，吞吐量反而低約 1.5%，最長 VI 也由 118 ms 增至 207 ms。

同樣使用 cached interpreter 時，關閉 SkipFrame只讓27.65 VI/s降至27.06 VI/s，差約2.1%。這項早期結果只能說明Rice的SkipFrame沒有避開主要工作，不能據此判定renderer成本低；後續C端分段、true null-video與Rice no-draw已確認主要瓶頸位於Rice的GL draw入口及WebGL資料提交。降低輸出解析度仍不是首選，WebGPU則保留為低風險WebGL優化不足時的候選。

**Mario Kart 64 實測**：cached interpreter、no SkipFrame、rAF 為 21.24 VI/s，平均 VI 38.89 ms，最長 VI 275 ms。相較 Super Mario 64 同設定再慢約 21.5%，約為 NTSC 即時速度的 35%。結果支持優先處理 R4300、RSP、Wasm 執行與主執行緒成本。

**Ocarina of Time 實測**：cached interpreter、no SkipFrame、rAF 為 21.98 VI/s，平均 VI 43.37 ms，最長 VI 212 ms，約為 NTSC 即時速度的 36.6%。90 秒測試內正常完成且未收到 diagnostic，因此這次沒有重現較長時間遊玩後的閃退，也不能據此宣稱閃退已修復。

**崩潰分類**：benchmark 模式會額外監聽 JavaScript error、unhandled Promise rejection、Mupen `setErrorStatus` 與 `webglcontextlost`，並 POST 到開發伺服器的 `/__n64-benchmark`。Vite 主控台出現 `[N64 benchmark received]` 後，可由 `event: diagnostic` 與 `type` 區分 Wasm/JS、Mupen 或 WebGL 問題。Safari 若直接終止整個頁面程序，瀏覽器來不及送出事件，此情況仍需由 Safari Web Inspector 或裝置系統記錄確認。

### Q5: rebuilt N64 runtime 顯示「模擬器啟動失敗」

**現象**：使用 `n64Runtime=fork` 時，ROM 下載完成後立即顯示啟動失敗；最初沒有 server diagnostic。修正 browser import 後，核心進一步在 `initWasmRecompiler` 發生 `ReferenceError: wasmExports is not defined`。

**原因**：upstream `main.js` 是預期由 npm bundler處理的來源入口，包含 extensionless imports與 `axios` bare import，不能直接作為靜態 browser module載入。此外 Emscripten 3.1.25 將 Wasm exports放在 `Module['asm']`，但舊 `corelib.js`仍使用已不存在的 `wasmExports`全域變數。

**解決**：`npm run n64:build` 使用 esbuild產生 browser-ready `main.bundle.js`；版本化 core submodule patch將 function table與memory存取改為 `Module['asm']`。`n64Runtime=fork`改載入 bundle，並新增 backend startup與 `start()` rejection diagnostic。桌面實測已完成 Rice/RSP/Input初始化、loading overlay消失並開始輸出 VI telemetry。

**2026-07-19 Asyncify修復**：588-page rebuilt artifact雖能完成module與Rice初始化，但在`startCore`的Asyncify rewind發生Wasm `memory access out of bounds`；desktop與iPhone路徑都可重現，因此不是Safari專屬。原因是加入instrumentation後仍把npm的38,535,168-byte初始空間當作固定目標。fork已改為64 MiB（1024 pages），manifest記錄`initialMemoryBytes=67108864`，production build會拒絕缺少此值的舊artifact。由於upstream檔名只含source commit，重建後檔名不會改變；Pages正式站曾把正確的新JS/Wasm與舊data混用，且version query仍回傳舊data。main bundle、data與Wasm因此必須發布為帶相同asset version的實體檔名。修復後Super Mario 64與Mario Kart 64完成第一個VI，Ocarina of Time完成backend啟動且沒有越界。

**iPhone驗證**：Super Mario 64 rebuilt fork為 27.082 VI/s，npm baseline為 27.060 VI/s，差約 +0.08%；平均 VI與 long VI差異也低於 0.4%，可視為量測噪音。最長 VI由 114 ms降至107 ms。此結果確認固定 source/toolchain沒有造成第一款遊戲的效能回歸。

Mario Kart 64 rebuilt fork為21.94 VI/s，npm baseline為21.24 VI/s，提升約3.32%；平均 VI由38.89 ms降至37.51 ms，最長 VI由275 ms降至147 ms。結果在5%驗收門檻內，且沒有發現相容性回歸。

Ocarina of Time rebuilt fork為22.70 VI/s，npm baseline為21.98 VI/s，提升約3.29%；平均 VI由43.37 ms降至41.92 ms，最長 VI由212 ms降至116 ms。90秒內正常完成且未收到 diagnostic。三款遊戲因此完成 rebuilt baseline驗收，可以在此固定版本上加入 subsystem timing；較長時間遊玩後的歷史閃退仍未被這次短測排除。

**Subsystem timing**：instrumented fork在C端累加RSP、Rice DList/RDP、present與audio plugin時間，並隨既有每VI一次的 `endStats` 呼叫一起送到JavaScript，沒有新增per-event JS crossing。benchmark結果中的 `averageCoreResidualMs`是扣除inclusive RSP、present與audio後的core/R4300上限；DList與RDP已包含在RSP時間內，只作明細，不能再次從residual扣除。npm rollback不提供這些C端數值，因此分段欄位為0。

正常Rice的instrumented fork另在五個主要draw入口內累加triangle與rectangle的總時間及呼叫數，仍只透過既有每VI一次的 `endStats` 傳送。結果欄位為 `averageTriangleDrawMs`、`averageRectDrawMs`、`averageTriangleDrawCalls`與`averageRectDrawCalls`。若時間由高calls/VI的triangle路徑主導，優先減少client-array uploads並評估batching；若少量draw仍耗時很高，優先建立persistent VBO/EBO staging。`rice-no-draw`與null-video模式的這四項應接近0。

Super Mario 64首組分段結果為31.68 ms/VI，其中RSP inclusive 28.22 ms、Rice DList 28.08 ms、core residual 3.45 ms、present 0.012 ms、audio plugin 0.003 ms。Rice DList約占整個VI的88.6%，而present接近零，因此先前SkipFrame僅約2%的改善不代表video plugin成本低；它只沒有避開主要的display-list解析與繪圖工作。需以true null-video量測移除整個Rice路徑後的上限，再決定renderer優化或其他核心方向。

true null-video使用 `?n64Benchmark=1&n64Runtime=fork&n64NullVideo=1`。static console已修正為辨識既有的 `--gfx dummy`，讓core連接真正的NoVideo plugin，而非只關閉present或使用Rice SkipFrame。此模式刻意限制在fork benchmark，避免一般遊玩意外黑屏。

**第一次null-video無結果**：畫面如預期全黑，但90秒後server沒有收到benchmark或diagnostic。Web cached-interpreter loop以 `viArrived`決定每個VI何時yield；Rice透過 `VidExt_GL_SwapBuffers()`增加該計數，原始dummy `UpdateScreen()`則完全為空，導致loop永遠不返回JavaScript。Emscripten dummy video現會在 `UpdateScreen()`增加 `viArrived`，只補回main-loop生命週期訊號，不執行Rice、GL swap或任何繪圖。

**修正後null-video結果**：Super Mario 64為60.0 VI/s、6.13 ms/VI、9 ms max、0 long VI；RSP 0.005 ms、DList/RDP/present 0、audio 0.001 ms、core residual 6.12 ms。相較Rice的27.20 VI/s與31.68 ms/VI，移除video plugin後已達原生60 VI/s，因此目前不應優先重構R4300或降低輸出解析度。若維持60 VI/s，renderer只能使用約10.55 ms/VI；Rice DList目前28.08 ms，至少需減少62.4%。

**Rice no-draw A/B**：使用 `?n64Benchmark=1&n64Runtime=fork&n64SuppressDraw=1`。此模式仍初始化Rice並完整執行DList parser、ucode dispatch、texture lookup與render state，但在五個主要OpenGL draw入口提前成功返回。若結果接近null-video的60 VI/s，GL draw/backend是主要投資方向；若仍接近正常Rice的27 VI/s，成本主要在parser、texture或state，單純換WebGPU後端不會達標。

Super Mario 64 Rice no-draw實測為59.98 VI/s、12.19 ms/VI、DList 0.24 ms；正常Rice則為27.20 VI/s、DList 28.08 ms。約27.84 ms/VI因此位於主要GL draw入口及其周邊WebGL提交，而非DList parser、ucode、texture lookup或一般state處理。應先處理WebGL同步點、client array上傳與draw batching，再評估WebGPU。

**Interleaved triangle stream ring A/B**：使用 `?n64Benchmark=1&n64Runtime=fork&n64PersistentBuffers=1`。此路徑把position/fog、兩組texture coordinates與color交錯成40-byte vertex，寫入單一2.56 MB `GL_STREAM_DRAW` ring，並利用Rice已展開為連續三頂點的資料改用`glDrawArrays`。每VI第一批先orphan buffer，後續draw依序追加，將每draw三次upload降為一次並避免立即覆寫GPU可能仍在讀取的區段。每批後仍恢復原client pointers；未帶參數、npm runtime、rectangle與no-draw路徑維持原行為。

2026-07-19 iPhone固定場景baseline為16.71 VI/s、57.69 ms/VI、48.16 ms DList、0.469 ms triangle、46.47 ms rectangle與706 underruns；stream為38.22 VI/s、21.39 ms/VI、18.70 ms DList、0.078 ms triangle、18.36 ms rectangle與290 underruns。VI/s提升128.7%、DList降低61.2%、underruns降低58.9%，triangle ring確定保留。rectangle程式尚未修改卻同步下降，表示client-array同步等待會跨draw入口累積。

**Rectangle stream ring**：`full`模式把四條rectangle路徑交錯為36-byte vertex並寫入第二個ring。iPhone結果為37.7 VI/s、22.0 ms/VI、18.4 ms rectangle與449 underruns；相較stream的38.22 VI/s、21.39 ms、18.36 ms與290 underruns沒有收益，因此不採用並維持rectangle flag關閉。使用者主觀感受整體較好但仍有輕微爆音，記錄為可能的run-to-run差異。

**iOS audio buffer A/B**：曾以triangle-only stream將secondary callback由1024增至2048 samples、primary target由3072增至4096。結果為37.9 VI/s、21.7 ms/VI、18.1 ms rectangle與435 underruns，未優於stream的38.22 VI/s與290 underruns；使用者亦回報體感沒有改善且延遲稍增。此preset已移除，iOS維持3072/1024，剩餘爆音應由降低renderer stall處理而非繼續增加buffer。

---

## NES — CPU 時序

### Q19: CPU 指令 Off-by-One — Zombie Hunter 場景跳動

**現象**：Zombie Hunter 進入遊戲後場景跳動、文字部分顯示錯誤。

**排查**：排除 APU、PPU scroll、Mapper 1 後，定位到 cpu_clock() 時序。

**原因**：每條指令的執行本身佔用 1 個 CPU cycle，但 `cycles` 計數未扣除此消耗。所有指令多消耗 1 cycle，CPU 吞吐量下降約 22%，VBlank handler 無法在時限內完成。

**解決**：`cpu_clock()` 中每次執行指令後 `cycles = cycles.saturating_sub(1)`。

---

## NES — Mapper

### Q20: Mapper 225 鏡像模式反轉 — 合集遊戲藍屏

**現象**：64 合 1 遊戲開啟後藍屏。

**原因**：FCEUX 使用 `setmirror(mirr ^ 1)` 異或翻轉，其中 MI_V=0, MI_H=1。原實作 bit13 對應關係相反。

**解決**：交換 bit13 的鏡像對應：bit13=0 → Horizontal，bit13=1 → Vertical。

---

### Q21: Mapper 253 多重錯誤 — 龍珠 Z 破圖

**現象**：龍珠 Z 強襲賽亞人部分畫面破圖。

**原因**：4 個關鍵錯誤：
1. 缺少 CHR RAM 替換 (`chrlo==4||5` 且 `!vlock`)
2. 缺少 vlock 機制 (`chrlo[0]==0xC8` 解鎖、`0x88` 鎖定)
3. chrhi 儲存錯誤 (`data & 0x10` → 應為 `data >> 4`)
4. 地址解碼錯誤（應使用 FCEUX 公式）

**解決**：以 FCEUX `253.cpp` 為參考完整重寫，新增 CHR RAM 混合映射支援。

---

## NES — APU 音頻

### Q22: DMC 通道邏輯缺陷 — Captain Tsubasa II 音效消失

**現象**：部分音效聽不到，且有爆音。

**原因**：DMC 缺少 `silence` 旗標，無資料時仍修改輸出電平。缺少音頻濾波器導致 DC 偏移與高頻雜訊。

**解決**：新增 silence 旗標、初始 bits_remaining=8、低通/高通濾波器、軟削波。

---

### Q22.1: APU Frame Counter / DMC 啟動時序偏差 — FC 音樂細微差異

**現象**：部分 FC 遊戲音樂與參考模擬器相比有些微節奏、包絡或音效進入時機差異。

**排查**：檢查 `$4017` frame counter 寫入流程，原實作在 CPU 寫入當下立即重置 frame counter 並在 5-step 模式立即 clock quarter/half frame。NES APU 硬體會依 CPU cycle 奇偶延遲 3 或 4 CPU cycles 才套用 `$4017` 寫入，因此 envelope、length counter、sweep、linear counter 的 clock 邊界可能提早。另檢查 `$4015` 啟用 DMC 時，restart 後沒有立即安排初始 sample fetch，會讓 DMC 第一個 sample 進入時機偏晚。

**原因**：
1. `$4017` frame counter 寫入缺少 3/4 CPU cycle 延遲。
2. DMC bytes_remaining 從 0 重新啟用時，未立即觸發第一次 sample fetch request。

**解決**：
1. 新增 `pending_frame_counter_write`，根據 `cycle & 1` 延遲 3 或 4 CPU cycles 後才套用 `$4017` 的 mode / IRQ inhibit / immediate quarter+half frame clock。
2. `$4015` 啟用 DMC 且 sample 需要 restart 時，呼叫 `fetch_dmc_sample()` 產生初始讀取請求。

**影響遊戲**：使用精細 envelope / sweep / DMC 音效時序的 FC 遊戲，包含音樂與短音效差異較容易被聽出的作品。

---

## Game Gear / Master System — Z80 CPU

### Q23: DAA H 旗標不精確 — Ninku 開頭崩潰

**現象**：GG 忍空開頭動畫崩潰。

**原因**：DAA 指令的 Half-Carry 旗標計算不正確。

**解決**：採用 MAME/ZEXALL 公式：`H = ((original_a ^ corrected_a) & 0x10) != 0`。

---

### Q24: INI/IND B 遞減時序 — Defenders of Oasis 選單不顯示

**現象**：選單無法顯示。

**原因**：INI/IND 中 B 遞減在 mem_write 之後，不符 Z80 硬體時序。

**解決**：read port → decrement B → write memory。

---

## Game Gear / Master System — VDP

### Q25: Line IRQ / Frame IRQ 共用旗標 — 捲軸閃爍

**現象**：部分遊戲捲軸與 HUD 閃爍。

**原因**：行中斷與幀中斷共用 `irq_pending`，讀取狀態時互相清除。

**解決**：新增 `line_irq_pending` 獨立追蹤，`irq_pending` 動態計算。

---

### Q26: CRAM 寫入邏輯錯誤 — 色盤異常

**現象**：色彩渲染異常。

**原因**：CRAM latch 狀態機過於複雜，與 GG 硬體不符。

**解決**：移除狀態機，改為偶數位址暫存、奇數位址組合寫入 12-bit RGB444。

---

### Q27: 精靈 Y 座標環繞 — GG 精靈消失

**現象**：GG 模式下某些精靈消失或位置錯誤。

**原因**：Y >= 0xD1 (209) 的精靈應 wrap 到畫面頂部但未處理。

**解決**：使用 `(y_raw + 1) % 256` 計算實際 Y。

---

## Game Boy — Joypad

### Q28: 方向鍵完全無法操作

**現象**：GB 遊戲方向鍵無反應。

**原因**：`read()` 中 `result` 低 4 位初始為 0x0。方向 bank AND 結果永遠 0x00，等同所有方向同時按下。

**解決**：低 4 位初始化為 0x0F（全部放開），由選取的 bank 透過 AND 清除對應 bit。
