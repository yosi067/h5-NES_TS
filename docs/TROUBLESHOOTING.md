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

**現象**：第一次啟動 N64 遊戲時，外框已置中但遊戲內容大小不正確；手動適配或重新 resize 一次後才正常。

**排查**：DOM 量測顯示外層 `.screen-bezel` 與 canvas CSS 尺寸正確，但 Mupen64Plus-web / SDL 在啟動後仍會自行處理 canvas resize，導致 WebGL backing store 或 viewport 在第一幀使用到錯誤尺寸。

**原因**：只在 `createMupen64PlusWeb()` / `start()` 前 dispatch `resize` 不足。Mupen 的內部 renderer 會在初始化後再讀取 canvas 尺寸，因此必須在 start 前後都強制觸發 RWD layout pulse。

**解決**：`src/main.ts` 新增 N64 專用適配流程：
- 建立全新的 `<canvas id="canvas">`，避免重用已取得 2D context 的 `#screen`
- 套用 `body.n64-mode` 後等待兩個 animation frame
- start 前後執行 `forceN64ResponsiveResize()` / `scheduleN64ResponsiveResize()`
- 先送 `resize` / `orientationchange` pulse，再把 WebGL backing store 固定回 `640x480`

**驗證**：初次載入 Super Mario 64 後，CSS 顯示尺寸約 `390x293`，內部 backing store 維持 `640x480`，比例為 `4:3`。

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
