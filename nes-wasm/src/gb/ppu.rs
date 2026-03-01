// ============================================================
// Game Boy PPU - 圖形處理單元
// ============================================================
// 解析度：160×144 像素
// 4 種灰階：白、淺灰、深灰、黑
// PPU 狀態機：OAM Search → Pixel Transfer → H-Blank → V-Blank
//
// 每條掃描線 456 dots (T-cycles)
// 每幀 154 條掃描線 (144 可見 + 10 V-Blank)
// ============================================================

/// DMG 灰階調色盤（經典綠色）
const DMG_COLORS: [[u8; 3]; 4] = [
    [0xE0, 0xF8, 0xD0], // 白（最亮）
    [0x88, 0xC0, 0x70], // 淺灰
    [0x34, 0x68, 0x56], // 深灰
    [0x08, 0x18, 0x20], // 黑（最暗）
];

/// OAM 精靈條目
#[derive(Clone, Copy, Default)]
struct SpriteEntry {
    y: u8,
    x: u8,
    tile: u8,
    flags: u8,
}

pub struct Ppu {
    // VRAM & OAM
    pub vram: [u8; 8192],
    pub oam: [u8; 160],

    // 暫存器
    pub lcdc: u8,       // $FF40 LCD Control
    pub stat: u8,       // $FF41 LCD Status
    pub scy: u8,        // $FF42 Scroll Y
    pub scx: u8,        // $FF43 Scroll X
    pub ly: u8,         // $FF44 Current scanline
    pub lyc: u8,        // $FF45 LY Compare
    pub bgp: u8,        // $FF47 BG Palette
    pub obp0: u8,       // $FF48 Object Palette 0
    pub obp1: u8,       // $FF49 Object Palette 1
    pub wy: u8,         // $FF4A Window Y
    pub wx: u8,         // $FF4B Window X
    pub dma: u8,        // $FF46 DMA source (high byte)

    // 內部狀態
    pub dot: u32,                     // 目前掃描線內的 dot 計數器
    pub mode: u8,                     // 目前模式 (0-3)
    pub frame_buffer: [u8; 160 * 144 * 4], // RGBA 幀緩衝區
    pub frame_complete: bool,
    window_line: u8,                  // 窗口內部行計數器

    // 中斷
    pub stat_irq: bool,
    pub vblank_irq: bool,

    // STAT IRQ 邊緣偵測
    stat_irq_line: bool,
}

impl Ppu {
    pub fn new() -> Self {
        Ppu {
            vram: [0; 8192],
            oam: [0; 160],
            lcdc: 0x91,
            stat: 0x00,
            scy: 0, scx: 0,
            ly: 0, lyc: 0,
            bgp: 0xFC,
            obp0: 0xFF, obp1: 0xFF,
            wy: 0, wx: 0,
            dma: 0,
            dot: 0,
            mode: 2,
            frame_buffer: [0; 160 * 144 * 4],
            frame_complete: false,
            window_line: 0,
            stat_irq: false,
            vblank_irq: false,
            stat_irq_line: false,
        }
    }

    /// LCD 是否啟用
    #[inline]
    fn lcd_enabled(&self) -> bool { self.lcdc & 0x80 != 0 }

    /// 推進 t_cycles 個 dot
    pub fn tick(&mut self, t_cycles: u32) {
        if !self.lcd_enabled() {
            return;
        }

        for _ in 0..t_cycles {
            self.dot += 1;
            self.step_dot();
        }
    }

    /// 單個 dot 的狀態機
    fn step_dot(&mut self) {
        match self.mode {
            2 => {
                // OAM Search (80 dots)
                if self.dot >= 80 {
                    self.set_mode(3);
                }
            }
            3 => {
                // Pixel Transfer (~172 dots, 使用固定值簡化)
                if self.dot >= 252 {
                    // 渲染整條掃描線
                    self.render_scanline();
                    self.set_mode(0);
                }
            }
            0 => {
                // H-Blank (到 456 dots)
                if self.dot >= 456 {
                    self.dot -= 456;
                    self.ly += 1;
                    self.check_lyc();

                    if self.ly >= 144 {
                        // 進入 V-Blank
                        self.set_mode(1);
                        self.vblank_irq = true;
                        self.frame_complete = true;
                    } else {
                        self.set_mode(2);
                    }
                }
            }
            1 => {
                // V-Blank (10 scanlines)
                if self.dot >= 456 {
                    self.dot -= 456;
                    self.ly += 1;
                    self.check_lyc();

                    if self.ly > 153 {
                        self.ly = 0;
                        self.window_line = 0;
                        self.check_lyc();
                        self.set_mode(2);
                    }
                }
            }
            _ => {}
        }
    }

    /// 設定 PPU 模式並更新 STAT
    fn set_mode(&mut self, mode: u8) {
        self.mode = mode;
        self.stat = (self.stat & 0xFC) | (mode & 0x03);
        self.check_stat_irq();
    }

    /// 檢查 LYC=LY
    fn check_lyc(&mut self) {
        if self.ly == self.lyc {
            self.stat |= 0x04; // 設定 LYC=LY flag
        } else {
            self.stat &= !0x04;
        }
        self.check_stat_irq();
    }

    /// 檢查 STAT 中斷條件（邊緣偵測）
    fn check_stat_irq(&mut self) {
        let conditions = 
            (self.mode == 0 && self.stat & 0x08 != 0) ||  // Mode 0 (H-Blank)
            (self.mode == 1 && self.stat & 0x10 != 0) ||  // Mode 1 (V-Blank)
            (self.mode == 2 && self.stat & 0x20 != 0) ||  // Mode 2 (OAM)
            (self.stat & 0x40 != 0 && self.stat & 0x04 != 0);  // LYC=LY

        // 只在上升沿觸發
        if conditions && !self.stat_irq_line {
            self.stat_irq = true;
        }
        self.stat_irq_line = conditions;
    }

    // ===== 掃描線渲染 =====

    /// 渲染一條完整的掃描線
    fn render_scanline(&mut self) {
        let ly = self.ly as usize;
        if ly >= 144 { return; }

        // 背景優先級緩衝（用於 BG-over-OBJ 判斷）
        let mut bg_priority = [0u8; 160]; // 0=透明/color0, 1=非透明

        // 渲染背景
        if self.lcdc & 0x01 != 0 {
            self.render_bg_line(ly, &mut bg_priority);
        } else {
            // BG 關閉時填充白色
            let base = ly * 160 * 4;
            for x in 0..160 {
                let offset = base + x * 4;
                self.frame_buffer[offset] = DMG_COLORS[0][0];
                self.frame_buffer[offset + 1] = DMG_COLORS[0][1];
                self.frame_buffer[offset + 2] = DMG_COLORS[0][2];
                self.frame_buffer[offset + 3] = 255;
            }
        }

        // 渲染窗口
        if self.lcdc & 0x21 == 0x21 {
            self.render_window_line(ly, &mut bg_priority);
        }

        // 渲染精靈
        if self.lcdc & 0x02 != 0 {
            self.render_sprites(ly, &bg_priority);
        }
    }

    /// 渲染背景行
    fn render_bg_line(&mut self, ly: usize, bg_priority: &mut [u8; 160]) {
        let tile_map_base: usize = if self.lcdc & 0x08 != 0 { 0x1C00 } else { 0x1800 };
        let tile_data_signed = self.lcdc & 0x10 == 0;

        let y = (ly as u16 + self.scy as u16) & 0xFF;
        let tile_row = (y / 8) as usize;
        let fine_y = (y % 8) as usize;

        let base = ly * 160 * 4;

        for x in 0..160u16 {
            let px = (x + self.scx as u16) & 0xFF;
            let tile_col = (px / 8) as usize;
            let fine_x = (px % 8) as usize;

            let tile_idx = self.vram[tile_map_base + tile_row * 32 + tile_col];
            let tile_addr = self.tile_data_addr(tile_idx, tile_data_signed);

            let lo = self.vram[tile_addr + fine_y * 2];
            let hi = self.vram[tile_addr + fine_y * 2 + 1];
            let bit = 7 - fine_x;
            let color_id = ((hi >> bit) & 1) << 1 | ((lo >> bit) & 1);

            bg_priority[x as usize] = if color_id != 0 { 1 } else { 0 };

            let palette_color = (self.bgp >> (color_id * 2)) & 0x03;
            let rgb = DMG_COLORS[palette_color as usize];
            let offset = base + x as usize * 4;
            self.frame_buffer[offset] = rgb[0];
            self.frame_buffer[offset + 1] = rgb[1];
            self.frame_buffer[offset + 2] = rgb[2];
            self.frame_buffer[offset + 3] = 255;
        }
    }

    /// 渲染窗口行
    fn render_window_line(&mut self, ly: usize, bg_priority: &mut [u8; 160]) {
        if ly < self.wy as usize { return; }
        let wx = self.wx as i32 - 7;
        if wx >= 160 { return; }

        let tile_map_base: usize = if self.lcdc & 0x40 != 0 { 0x1C00 } else { 0x1800 };
        let tile_data_signed = self.lcdc & 0x10 == 0;

        let win_y = self.window_line as usize;
        let tile_row = win_y / 8;
        let fine_y = win_y % 8;

        let base = ly * 160 * 4;
        let mut rendered = false;

        for x in 0..160i32 {
            if x < wx { continue; }
            rendered = true;

            let win_x = (x - wx) as usize;
            let tile_col = win_x / 8;
            let fine_x = win_x % 8;

            let tile_idx = self.vram[tile_map_base + tile_row * 32 + tile_col];
            let tile_addr = self.tile_data_addr(tile_idx, tile_data_signed);

            let lo = self.vram[tile_addr + fine_y * 2];
            let hi = self.vram[tile_addr + fine_y * 2 + 1];
            let bit = 7 - fine_x;
            let color_id = ((hi >> bit) & 1) << 1 | ((lo >> bit) & 1);

            bg_priority[x as usize] = if color_id != 0 { 1 } else { 0 };

            let palette_color = (self.bgp >> (color_id * 2)) & 0x03;
            let rgb = DMG_COLORS[palette_color as usize];
            let offset = base + x as usize * 4;
            self.frame_buffer[offset] = rgb[0];
            self.frame_buffer[offset + 1] = rgb[1];
            self.frame_buffer[offset + 2] = rgb[2];
            self.frame_buffer[offset + 3] = 255;
        }

        if rendered {
            self.window_line += 1;
        }
    }

    /// 渲染精靈
    fn render_sprites(&mut self, ly: usize, bg_priority: &[u8; 160]) {
        let tall = self.lcdc & 0x04 != 0; // 8x16 模式
        let sprite_height: i32 = if tall { 16 } else { 8 };

        // 收集本行可見的精靈（最多 10 個）
        let mut sprites: Vec<(usize, SpriteEntry)> = Vec::new();
        for i in 0..40 {
            let offset = i * 4;
            let entry = SpriteEntry {
                y: self.oam[offset],
                x: self.oam[offset + 1],
                tile: self.oam[offset + 2],
                flags: self.oam[offset + 3],
            };

            let sy = entry.y as i32 - 16;
            let row = ly as i32 - sy;
            if row >= 0 && row < sprite_height {
                sprites.push((i, entry));
                if sprites.len() >= 10 { break; }
            }
        }

        // DMG: 優先級由 X 座標決定，X 相同時 OAM 索引決定
        sprites.sort_by(|a, b| {
            a.1.x.cmp(&b.1.x).then(a.0.cmp(&b.0))
        });

        // 從後往前渲染（先繪製低優先級的）
        let base = ly * 160 * 4;
        for &(_, entry) in sprites.iter().rev() {
            let sx = entry.x as i32 - 8;
            let sy = entry.y as i32 - 16;
            let mut row = (ly as i32 - sy) as usize;
            let flip_y = entry.flags & 0x40 != 0;
            let flip_x = entry.flags & 0x20 != 0;
            let bg_over = entry.flags & 0x80 != 0;
            let palette = if entry.flags & 0x10 != 0 { self.obp1 } else { self.obp0 };

            let tile_id = if tall {
                if flip_y { row = 15 - row; }
                if row >= 8 {
                    (entry.tile | 0x01) as usize
                } else {
                    (entry.tile & 0xFE) as usize
                }
            } else {
                if flip_y { row = 7 - row; }
                entry.tile as usize
            };

            let tile_row = row % 8;
            let tile_addr = tile_id * 16 + tile_row * 2;
            let lo = self.vram[tile_addr];
            let hi = self.vram[tile_addr + 1];

            for px in 0..8 {
                let screen_x = sx + px;
                if screen_x < 0 || screen_x >= 160 { continue; }

                let bit = if flip_x { px as usize } else { 7 - px as usize };
                let color_id = ((hi >> bit) & 1) << 1 | ((lo >> bit) & 1);
                if color_id == 0 { continue; } // 透明

                // BG-over-OBJ 優先級
                if bg_over && bg_priority[screen_x as usize] != 0 { continue; }

                let palette_color = (palette >> (color_id * 2)) & 0x03;
                let rgb = DMG_COLORS[palette_color as usize];
                let offset = base + screen_x as usize * 4;
                self.frame_buffer[offset] = rgb[0];
                self.frame_buffer[offset + 1] = rgb[1];
                self.frame_buffer[offset + 2] = rgb[2];
                self.frame_buffer[offset + 3] = 255;
            }
        }
    }

    // ===== 輔助方法 =====

    /// 計算 tile 資料在 VRAM 中的偏移
    fn tile_data_addr(&self, tile_idx: u8, signed_mode: bool) -> usize {
        if signed_mode {
            // $8800 模式：tile_idx 為帶符號偏移，基址 $9000
            let signed_idx = tile_idx as i8 as i16;
            ((0x1000 + signed_idx * 16) as usize) & 0x1FFF
        } else {
            // $8000 模式：tile_idx 為無符號偏移
            tile_idx as usize * 16
        }
    }

    /// 讀取 STAT 暫存器
    pub fn read_stat(&self) -> u8 {
        0x80 | (self.stat & 0x7F) // bit 7 始終為 1
    }
}
