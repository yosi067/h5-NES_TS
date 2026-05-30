// ============================================================
// VDP (Video Display Processor) — SMS/GG 顯示處理器
// ============================================================
// 基於 TMS9918 衍生晶片，用於 Sega Master System / Game Gear
// 內部渲染解析度：256×192 (Mode 4)
// Game Gear 顯示視窗：160×144 (從 256×192 中裁切)
// 16KB VRAM, 64 bytes CRAM (GG: 32 色 × 12-bit)
// ============================================================

/// VDP 掃描線常量
const SCREEN_WIDTH: u32 = 256;
const SCREEN_HEIGHT: u32 = 192;

/// GG 裁切視窗
const GG_WIDTH: u32 = 160;
const GG_HEIGHT: u32 = 144;
const GG_LEFT: u32 = 48;   // (256 - 160) / 2
const GG_TOP: u32 = 24;    // (192 - 144) / 2

/// 每行掃描的週期數 (Z80 T-cycles)
const CYCLES_PER_LINE: u32 = 228;

/// 總掃描行數 (NTSC)
const TOTAL_LINES: u32 = 262;

/// VDP 暫存器數量
const VDP_REGS: usize = 11;

pub struct Vdp {
    // 記憶體
    pub vram: [u8; 0x4000],       // 16KB VRAM
    pub cram: [u8; 64],           // Color RAM (GG: 64 bytes = 32 × 12-bit)

    // VDP 暫存器
    pub regs: [u8; VDP_REGS],

    // 控制/資料埠狀態
    control_word: u16,
    control_latch: bool,          // false = first byte, true = second byte
    vram_addr: u16,               // 14-bit VRAM 地址
    code: u8,                     // 操作碼 (00=VRAM讀, 01=VRAM寫, 10=Reg寫, 11=CRAM寫)
    read_buffer: u8,              // 預讀緩衝

    // 掃描線狀態
    pub line: u32,                // 目前掃描行
    pub line_counter: u8,         // 行中斷計數器
    cycle_count: u32,             // 本行已消耗的 T-cycles
    pub frame_complete: bool,

    // 中斷旗標
    pub status: u8,               // 狀態暫存器
    pub irq_pending: bool,
    line_irq_pending: bool,       // 行中斷 pending (與 frame irq 分開追蹤)

    // 幀緩衝區 (RGBA)
    frame_buffer_internal: Vec<u8>,  // 256×192×4 內部渲染
    pub frame_buffer: Vec<u8>,       // 最終輸出 (GG: 160×144×4, SMS: 256×192×4)

    // 模式
    pub is_game_gear: bool,

    // Sprite collision
    sprite_collision: bool,
    sprite_overflow: bool,

    // CRAM 寫入暫存 (GG 需要兩次寫入)
    cram_latch: u8,

    // H 計數器
    pub h_counter: u8,
    // V 計數器
    pub v_counter: u8,
}

impl Vdp {
    pub fn new(is_game_gear: bool) -> Self {
        let out_w = if is_game_gear { GG_WIDTH } else { SCREEN_WIDTH };
        let out_h = if is_game_gear { GG_HEIGHT } else { SCREEN_HEIGHT };
        Vdp {
            vram: [0; 0x4000],
            cram: [0; 64],
            // Post-BIOS 初始暫存器值 (保守預設，遊戲會自行設定)
            regs: [
                0x04, // reg0: Mode 4 only (標準 192 行模式，無 line IRQ)
                0x80, // reg1: Display enabled
                0xFF, // reg2: Name table base ($3800)
                0xFF, // reg3: Color table (Mode 4 不使用)
                0xFF, // reg4: Pattern generator (Mode 4 不使用)
                0xFF, // reg5: Sprite attribute table ($3F00)
                0xFF, // reg6: Sprite pattern generator (bit2=1 → $2000)
                0x00, // reg7: Backdrop color = palette 1 #0
                0x00, // reg8: Horizontal scroll = 0
                0x00, // reg9: Vertical scroll = 0
                0xFF, // reg10: Line counter
            ],
            control_word: 0,
            control_latch: false,
            vram_addr: 0,
            code: 0,
            read_buffer: 0,
            line: 0,
            line_counter: 0xFF,
            cycle_count: 0,
            frame_complete: false,
            status: 0,
            irq_pending: false,
            line_irq_pending: false,
            frame_buffer_internal: vec![0; (SCREEN_WIDTH * SCREEN_HEIGHT * 4) as usize],
            frame_buffer: vec![0; (out_w * out_h * 4) as usize],
            is_game_gear,
            sprite_collision: false,
            sprite_overflow: false,
            cram_latch: 0,
            h_counter: 0,
            v_counter: 0,
        }
    }

    // ===== I/O 埠讀寫 =====

    /// 讀取控制埠 ($BF / 端口 $BF) — 回傳狀態暫存器並清除旗標
    pub fn read_control(&mut self) -> u8 {
        self.control_latch = false;
        let s = self.status;
        self.status = 0;
        self.irq_pending = false;
        self.line_irq_pending = false;
        s
    }

    /// 讀取資料埠 ($BE)
    pub fn read_data(&mut self) -> u8 {
        self.control_latch = false;
        let result = self.read_buffer;
        self.read_buffer = self.vram[(self.vram_addr & 0x3FFF) as usize];
        self.vram_addr = (self.vram_addr + 1) & 0x3FFF;
        result
    }

    /// 寫入控制埠 ($BF)
    pub fn write_control(&mut self, val: u8) {
        if !self.control_latch {
            // 第一個位元組
            self.control_word = (self.control_word & 0xFF00) | val as u16;
            self.control_latch = true;
        } else {
            // 第二個位元組
            self.control_word = (self.control_word & 0x00FF) | ((val as u16) << 8);
            self.control_latch = false;

            self.code = (val >> 6) & 0x03;
            self.vram_addr = self.control_word & 0x3FFF;

            match self.code {
                0 => {
                    // VRAM 讀取：預讀一個位元組
                    self.read_buffer = self.vram[(self.vram_addr & 0x3FFF) as usize];
                    self.vram_addr = (self.vram_addr + 1) & 0x3FFF;
                }
                2 => {
                    // 暫存器寫入
                    let reg_num = (val & 0x0F) as usize;
                    let data = self.control_word as u8;
                    if reg_num < VDP_REGS {
                        self.regs[reg_num] = data;
                    }
                }
                _ => {}
            }
        }
    }

    /// 寫入資料埠 ($BE)
    pub fn write_data(&mut self, val: u8) {
        self.control_latch = false;
        self.read_buffer = val;

        match self.code {
            3 => {
                // CRAM 寫入
                if self.is_game_gear {
                    // GG: 12-bit color
                    // CRAM 地址由 vram_addr 低 6 位決定 (0-63)
                    // 偶數位址 → latch 低位元組
                    // 奇數位址 → 寫入 latch + 本次值到 CRAM pair
                    let addr = (self.vram_addr & 0x3F) as usize;
                    if addr & 1 == 0 {
                        // 偶數地址：暫存低位元組，同時也寫入 CRAM
                        self.cram_latch = val;
                        if addr < 64 {
                            self.cram[addr] = val;
                        }
                    } else {
                        // 奇數地址：寫入高位元組
                        // 同時將 latch 寫入偶數位址 (確保配對完整)
                        let base = addr & 0x3E; // 對應偶數地址
                        if base < 64 {
                            self.cram[base] = self.cram_latch;
                        }
                        if base + 1 < 64 {
                            self.cram[base + 1] = val;
                        }
                    }
                } else {
                    // SMS: 6-bit color (直接寫入)
                    let addr = (self.vram_addr & 0x1F) as usize;
                    if addr < 64 {
                        self.cram[addr] = val;
                    }
                }
            }
            _ => {
                // VRAM 寫入
                self.vram[(self.vram_addr & 0x3FFF) as usize] = val;
            }
        }
        self.vram_addr = (self.vram_addr + 1) & 0x3FFF;
    }

    /// V 計數器讀取 ($7E)
    pub fn read_v_counter(&self) -> u8 {
        self.v_counter
    }

    /// H 計數器讀取 ($7F)
    pub fn read_h_counter(&self) -> u8 {
        self.h_counter
    }

    // ===== 時鐘推進 =====

    pub fn tick(&mut self, t_cycles: u32) {
        self.cycle_count += t_cycles;

        while self.cycle_count >= CYCLES_PER_LINE {
            self.cycle_count -= CYCLES_PER_LINE;

            // 渲染當前行
            self.render_line();

            // --- Frame IRQ 邏輯 ---
            if self.line == SCREEN_HEIGHT {
                // VBlank 開始
                self.status |= 0x80; // 設定 VBlank 旗標

                // 輸出幀
                self.output_frame();
                self.frame_complete = true;
            }

            // --- Line counter / Line IRQ 邏輯 ---
            // SMS/GG decrements after advancing to the next line, including line 192.
            let next_line = self.line + 1;
            if next_line <= SCREEN_HEIGHT {
                self.line_counter = self.line_counter.wrapping_sub(1);
                if self.line_counter == 0xFF {
                    self.line_counter = self.regs[10];
                    self.line_irq_pending = true;
                }
            } else {
                // VBlank 期間持續 reload line counter
                self.line_counter = self.regs[10];
            }

            // --- 更新 IRQ pending ---
            // Line IRQ 與 Frame IRQ 各自獨立，任一個 enabled + pending 就觸發
            self.irq_pending = 
                (self.line_irq_pending && (self.regs[0] & 0x10 != 0)) ||
                ((self.status & 0x80 != 0) && (self.regs[1] & 0x20 != 0));

            self.line += 1;

            // 更新 V 計數器 (NTSC 192-line mode)
            if self.line < 219 {
                self.v_counter = self.line as u8;
            } else if self.line == 219 {
                self.v_counter = 0xD5;
            } else {
                // line 220 → 0xD6, line 221 → 0xD7, ...
                self.v_counter = (0xD5u8).wrapping_add((self.line - 219) as u8);
            }

            if self.line >= TOTAL_LINES {
                self.line = 0;
                self.v_counter = 0;
                self.frame_complete = false;
            }
        }
    }

    // ===== 掃描線渲染 =====

    fn render_line(&mut self) {
        if self.line >= SCREEN_HEIGHT { return; }

        if !self.display_enabled() {
            // 顯示禁用時填充背景色
            let (r, g, b) = self.get_backdrop_color();
            let y = self.line;
            for x in 0..SCREEN_WIDTH {
                let offset = (y * SCREEN_WIDTH + x) as usize * 4;
                if offset + 3 < self.frame_buffer_internal.len() {
                    self.frame_buffer_internal[offset] = r;
                    self.frame_buffer_internal[offset + 1] = g;
                    self.frame_buffer_internal[offset + 2] = b;
                    self.frame_buffer_internal[offset + 3] = 0xFF;
                }
            }
            return;
        }

        // Mode 4 (SMS/GG 標準模式)
        self.render_background(self.line);
        self.render_sprites(self.line);
    }

    /// 取得背景/邊框顏色
    fn get_backdrop_color(&self) -> (u8, u8, u8) {
        // reg[7] 低 4 位 = backdrop 使用 palette 1 的色號
        let idx = 16 + (self.regs[7] & 0x0F) as usize;
        self.get_color(idx)
    }

    fn render_background(&mut self, line: u32) {
        // 背景 Name Table 基底地址
        // Mode 4: reg[2] bits 3-1 選擇 name table 位址 (bit 0 在 Mode 4 中被忽略)
        // 基底 = (reg[2] & 0x0E) << 10 → 常見值 0xFF → 0x3800
        let nt_base = (self.regs[2] as u32 & 0x0E) << 10;
        // 水平/垂直捲軸
        let scroll_x = self.regs[8] as u32;
        let scroll_y = self.regs[9] as u32;

        // reg[0] bit 6: 前兩行(16像素)禁用水平捲軸
        let lock_top_rows = self.regs[0] & 0x40 != 0 && line < 16;
        let effective_scroll_x = if lock_top_rows { 0 } else { scroll_x };

        // reg[0] bit 7: 螢幕右側 64 像素(col 24-31)禁用垂直捲軸
        let lock_right_cols = self.regs[0] & 0x80 != 0;

        // reg[0] bit 5: 左側 8 像素遮罩（填充背景色）
        let mask_left_col = self.regs[0] & 0x20 != 0;

        // 逐像素渲染，確保水平捲軸方向正確
        // SMS VDP: reg[8] 將背景向右移動 → nametable_x = (screen_x - scroll_x) & 0xFF
        for screen_x in 0..SCREEN_WIDTH {
            // 右側垂直捲軸鎖定 (螢幕 pixel 192-255)
            let col_scroll_y = if lock_right_cols && screen_x >= 192 { 0 } else { scroll_y };

            // 水平捲軸: 計算 nametable 中的 X 座標
            let nt_x = screen_x.wrapping_sub(effective_scroll_x) & 0xFF;
            let tile_col = nt_x / 8;
            let fine_x = nt_x % 8;

            // 垂直捲軸
            let scrolled_row = (line + col_scroll_y) % 224; // 224 = 28 tiles × 8
            let tile_row = scrolled_row / 8;
            let fine_y = scrolled_row % 8;

            // Name table entry (2 bytes per tile)
            let nt_addr = nt_base + (tile_row * 32 + tile_col) * 2;
            let lo = self.vram[nt_addr as usize] as u16;
            let hi = self.vram[(nt_addr + 1) as usize] as u16;

            let tile_num = lo | ((hi & 0x01) << 8);
            let palette = if hi & 0x08 != 0 { 1u32 } else { 0 };
            let priority = hi & 0x10 != 0;
            let flip_h = hi & 0x02 != 0;
            let flip_v = hi & 0x04 != 0;

            let actual_y = if flip_v { 7 - fine_y } else { fine_y };
            let actual_x = if flip_h { 7 - fine_x } else { fine_x };

            // 每個 Tile 8×8 pixel, 4bpp planar
            let tile_addr = tile_num as u32 * 32 + actual_y * 4;
            let bit = 7 - actual_x;

            let b0 = (self.vram[tile_addr as usize] >> bit) & 1;
            let b1 = (self.vram[(tile_addr + 1) as usize] >> bit) & 1;
            let b2 = (self.vram[(tile_addr + 2) as usize] >> bit) & 1;
            let b3 = (self.vram[(tile_addr + 3) as usize] >> bit) & 1;
            let color_idx = (b0 | (b1 << 1) | (b2 << 2) | (b3 << 3)) as u32;

            let final_color = (palette * 16 + color_idx) as usize;

            let offset = (line * SCREEN_WIDTH + screen_x) as usize * 4;
            if offset + 3 < self.frame_buffer_internal.len() {
                let (r, g, b) = self.get_color(final_color);
                self.frame_buffer_internal[offset] = r;
                self.frame_buffer_internal[offset + 1] = g;
                self.frame_buffer_internal[offset + 2] = b;
                self.frame_buffer_internal[offset + 3] = 0xFF;
                // 存儲優先級資訊在 alpha 通道
                if priority && color_idx != 0 {
                    self.frame_buffer_internal[offset + 3] = 0xFE; // 標記 BG 優先
                }
            }
        }

        // 左側 8 像素遮罩: 用背景色覆蓋
        if mask_left_col {
            let (br, bg, bb) = self.get_backdrop_color();
            for x in 0..8u32 {
                let offset = (line * SCREEN_WIDTH + x) as usize * 4;
                if offset + 3 < self.frame_buffer_internal.len() {
                    self.frame_buffer_internal[offset] = br;
                    self.frame_buffer_internal[offset + 1] = bg;
                    self.frame_buffer_internal[offset + 2] = bb;
                    self.frame_buffer_internal[offset + 3] = 0xFF;
                }
            }
        }
    }

    fn render_sprites(&mut self, line: u32) {
        // Sprite Attribute Table 基底
        let sat_base = ((self.regs[5] as u16 & 0x7E) << 7) | 0x0000;
        let sprite_height: u32 = if self.regs[1] & 0x02 != 0 { 16 } else { 8 };
        let use_8x16 = self.regs[1] & 0x02 != 0;
        let shift = self.regs[0] & 0x08 != 0; // Sprite X shift left 8

        // Sprite pattern generator base (reg[6])
        let pg_base: u16 = if self.regs[6] & 0x04 != 0 { 0x2000 } else { 0x0000 };

        let mut sprites_on_line = 0u32;
        let mut drawn = [false; 256]; // 像素碰撞偵測

        // 掃描 64 個精靈
        for i in 0..64u32 {
            let y_addr = sat_base + i as u16;
            let y_raw = self.vram[y_addr as usize];

            // $D0 (208) 終止精靈處理 (僅 SMS 模式，GG 不終止)
            if !self.is_game_gear && y_raw == 0xD0 { break; }

            // Y 座標 = y_raw + 1 (VDP 慣例)
            // 支援螢幕底部環繞：Y 值 0xD1-0xFF 會環繞到螢幕頂部
            let y = (y_raw as u32).wrapping_add(1) % 256;
            // 計算精靈是否在當前掃描行
            // 需要處理 Y 環繞 (例如 y=254, sprite_height=8 → 覆蓋 line 254-261 mod 256 = 254,255,0-5)
            let sprite_line = if line >= y {
                line - y
            } else if y > 256 - sprite_height {
                // 環繞情況: sprite 從底部延伸到頂部
                line + 256 - y
            } else {
                continue; // 不在這行
            };
            if sprite_line >= sprite_height { continue; }

            {
                sprites_on_line += 1;
                if sprites_on_line > 8 {
                    self.sprite_overflow = true;
                    break;
                }

                // X 和 Tile 在 SAT 的後半段
                let x_addr = sat_base + 0x80 + i as u16 * 2;
                let mut x = self.vram[x_addr as usize] as u32;
                let tile_num = self.vram[(x_addr + 1) as usize] as u16;

                if shift { x = x.wrapping_sub(8); }

                let actual_tile = if use_8x16 {
                    (tile_num & 0xFE) + if sprite_line >= 8 { 1 } else { 0 }
                } else {
                    tile_num
                };
                let actual_row = sprite_line % 8;

                let tile_addr = pg_base as u32 + actual_tile as u32 * 32 + actual_row * 4;

                for px in 0..8u32 {
                    let sx = x + px;
                    if sx >= SCREEN_WIDTH { continue; }

                    let bit = 7 - px;
                    let b0 = (self.vram[tile_addr as usize] >> bit) & 1;
                    let b1 = (self.vram[(tile_addr + 1) as usize] >> bit) & 1;
                    let b2 = (self.vram[(tile_addr + 2) as usize] >> bit) & 1;
                    let b3 = (self.vram[(tile_addr + 3) as usize] >> bit) & 1;
                    let color_idx = b0 | (b1 << 1) | (b2 << 2) | (b3 << 3);

                    if color_idx == 0 { continue; } // 透明

                    let su = sx as usize;
                    let offset = (line * SCREEN_WIDTH + sx) as usize * 4;

                    // 碰撞偵測
                    if drawn[su] {
                        self.sprite_collision = true;
                    }
                    drawn[su] = true;

                    // 精靈使用調色盤 1 (16~31)
                    let final_color = (16 + color_idx) as usize;

                    if offset + 3 < self.frame_buffer_internal.len() {
                        // 檢查 BG 優先級
                        let bg_priority = self.frame_buffer_internal[offset + 3] == 0xFE;
                        if !bg_priority {
                            let (r, g, b) = self.get_color(final_color);
                            self.frame_buffer_internal[offset] = r;
                            self.frame_buffer_internal[offset + 1] = g;
                            self.frame_buffer_internal[offset + 2] = b;
                            self.frame_buffer_internal[offset + 3] = 0xFF;
                        }
                    }
                }
            }
        }

        // 設定精靈溢出/碰撞狀態
        if self.sprite_overflow { self.status |= 0x40; self.sprite_overflow = false; }
        if self.sprite_collision { self.status |= 0x20; self.sprite_collision = false; }
    }

    // ===== 輸出幀 =====

    fn output_frame(&mut self) {
        if self.is_game_gear {
            // 從 256×192 裁切到 160×144
            for y in 0..GG_HEIGHT {
                for x in 0..GG_WIDTH {
                    let src_x = x + GG_LEFT;
                    let src_y = y + GG_TOP;
                    let src_offset = (src_y * SCREEN_WIDTH + src_x) as usize * 4;
                    let dst_offset = (y * GG_WIDTH + x) as usize * 4;
                    self.frame_buffer[dst_offset] = self.frame_buffer_internal[src_offset];
                    self.frame_buffer[dst_offset + 1] = self.frame_buffer_internal[src_offset + 1];
                    self.frame_buffer[dst_offset + 2] = self.frame_buffer_internal[src_offset + 2];
                    self.frame_buffer[dst_offset + 3] = 0xFF;
                }
            }
        } else {
            // SMS: 直接複製
            self.frame_buffer.copy_from_slice(&self.frame_buffer_internal);
            // 修正 alpha
            for i in (3..self.frame_buffer.len()).step_by(4) {
                self.frame_buffer[i] = 0xFF;
            }
        }
    }

    // ===== 色彩轉換 =====

    fn get_color(&self, idx: usize) -> (u8, u8, u8) {
        if self.is_game_gear {
            self.get_gg_color(idx)
        } else {
            self.get_sms_color(idx)
        }
    }

    /// GG 12-bit color: ----BBBBGGGGRRRR
    fn get_gg_color(&self, idx: usize) -> (u8, u8, u8) {
        let addr = idx * 2;
        if addr + 1 >= self.cram.len() { return (0, 0, 0); }
        let lo = self.cram[addr] as u16;
        let hi = self.cram[addr + 1] as u16;
        let word = lo | (hi << 8);
        let r = ((word & 0x000F) * 255 / 15) as u8;
        let g = (((word >> 4) & 0x000F) * 255 / 15) as u8;
        let b = (((word >> 8) & 0x000F) * 255 / 15) as u8;
        (r, g, b)
    }

    /// SMS 6-bit color: --BBGGRR
    fn get_sms_color(&self, idx: usize) -> (u8, u8, u8) {
        if idx >= self.cram.len() { return (0, 0, 0); }
        let c = self.cram[idx];
        let r = (c & 0x03) * 85;
        let g = ((c >> 2) & 0x03) * 85;
        let b = ((c >> 4) & 0x03) * 85;
        (r, g, b)
    }

    // ===== 輔助查詢 =====

    pub fn display_enabled(&self) -> bool {
        self.regs[1] & 0x40 != 0
    }

    pub fn screen_width(&self) -> u32 {
        if self.is_game_gear { GG_WIDTH } else { SCREEN_WIDTH }
    }

    pub fn screen_height(&self) -> u32 {
        if self.is_game_gear { GG_HEIGHT } else { SCREEN_HEIGHT }
    }
}
