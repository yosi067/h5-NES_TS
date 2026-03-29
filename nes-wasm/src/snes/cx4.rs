// ============================================================
// Capcom CX4 協處理器 (Hitachi HG51B169) - HLE 實作
// ============================================================
// 基於 snes9x c4emu.cpp 參考實作
// 使用遊戲：Mega Man X2, Mega Man X3
// 記憶體映射 (SNES LoROM):
//   $00-3F/$80-BF:$6000-$7FFF → CX4 RAM + I/O
// ============================================================
// 命令觸發：寫入 $7F4F 時，以寫入值作為命令碼分發
//   $1F4D: page (cmd=0x00 時的子命令選擇)
//   $1F4F: 命令觸發
//   $1F5E: 狀態 (bit 6 = 忙碌)
//   $1F80-$1FAF: CX4 暫存器 R0-R15 (各 24-bit)
// ============================================================

use std::f64::consts::PI;

pub struct Cx4 {
    pub present: bool,
    pub ram: [u8; 0x2000],
    sin_table: [i16; 512],
    cos_table: [i16; 512],
}

const DMA_SRC_LO: usize = 0x1F40;
const DMA_LEN_LO: usize = 0x1F43;
const DMA_DST_LO: usize = 0x1F45;
const DMA_TRIGGER: usize = 0x1F47;
const CMD_TRIGGER: usize = 0x1F4F;
const STATUS: usize = 0x1F5E;
const REG_BASE: usize = 0x1F80;

/// 從 24-bit SNES 位址讀取 ROM (LoROM)
fn rom_read(rom: &[u8], snes_addr: u32) -> u8 {
    if rom.is_empty() { return 0; }
    let bank = ((snes_addr >> 16) & 0x7F) as usize;
    let addr = (snes_addr & 0xFFFF) as usize;
    let offset = (bank << 15) | (addr & 0x7FFF);
    rom[offset % rom.len()]
}

#[inline]
fn sar(val: i32, shift: u32) -> i32 { val >> shift }

impl Cx4 {
    pub fn new() -> Self {
        let mut cx4 = Cx4 {
            present: false,
            ram: [0u8; 0x2000],
            sin_table: [0i16; 512],
            cos_table: [0i16; 512],
        };
        cx4.init_tables();
        cx4
    }

    fn init_tables(&mut self) {
        for i in 0..512 {
            let angle = 2.0 * PI * (i as f64) / 512.0;
            self.sin_table[i] = (angle.sin() * 32768.0).round() as i16;
            self.cos_table[i] = (angle.cos() * 32768.0).round() as i16;
        }
    }

    pub fn reset(&mut self) {
        self.ram = [0u8; 0x2000];
    }

    // ================================================================
    // 記憶體存取
    // ================================================================

    pub fn read(&self, offset: u16) -> u8 {
        let off = offset as usize & 0x1FFF;
        if off == STATUS { return 0; } // HLE 永遠不忙碌
        self.ram[off]
    }

    pub fn write(&mut self, offset: u16, val: u8, rom: &[u8]) {
        let off = offset as usize & 0x1FFF;
        self.ram[off] = val;
        match off {
            DMA_TRIGGER => self.do_dma(rom),
            CMD_TRIGGER => self.execute_command(rom),
            _ => {}
        }
    }

    // ================================================================
    // CX4 內部 DMA: SNES ROM → CX4 RAM
    // ================================================================

    fn do_dma(&mut self, rom: &[u8]) {
        let src = self.ram[DMA_SRC_LO] as u32
            | ((self.ram[DMA_SRC_LO + 1] as u32) << 8)
            | ((self.ram[DMA_SRC_LO + 2] as u32) << 16);
        let len = self.ram[DMA_LEN_LO] as u32
            | ((self.ram[DMA_LEN_LO + 1] as u32) << 8);
        let dst = self.ram[DMA_DST_LO] as u16
            | ((self.ram[DMA_DST_LO + 1] as u16) << 8);

        if len == 0 { return; }

        for i in 0..len {
            let val = rom_read(rom, src.wrapping_add(i));
            let dst_off = dst.wrapping_add(i as u16).wrapping_sub(0x6000);
            if (dst_off as usize) < 0x2000 {
                self.ram[dst_off as usize] = val;
            }
        }
    }

    // ================================================================
    // 命令分發 (基於 snes9x S9xSetC4)
    // ================================================================

    pub fn execute_command(&mut self, rom: &[u8]) {
        self.ram[STATUS] |= 0x40;

        let cmd = self.ram[CMD_TRIGGER];
        let page = self.ram[0x1F4D];

        // 測試命令特殊路徑: page=0x0E, cmd<0x40, (cmd&3)==0
        if page == 0x0E && cmd < 0x40 && (cmd & 3) == 0 {
            self.ram[0x1F80] = cmd >> 2;
            self.ram[STATUS] &= !0x40;
            return;
        }

        match cmd {
            0x00 => self.cmd_process_sprites(rom),
            0x01 => {
                // Draw wireframe (clear + draw)
                let end = (16 * 12 * 3 * 4 + 0x300).min(0x0C00);
                for i in 0x0300..end { self.ram[i] = 0; }
                self.cmd_draw_wireframe(rom);
            }
            0x05 => self.cmd_propulsion(),
            0x0D => self.cmd_set_vector_length(),
            0x10 => self.cmd_polar_to_rect1(),
            0x13 => self.cmd_polar_to_rect2(),
            0x15 => self.cmd_pythagorean(),
            0x1F => self.cmd_atan(),
            0x22 => self.cmd_trapezoid(),
            0x25 => self.cmd_multiply(),
            0x2D => self.cmd_transform_coords(),
            0x40 => self.cmd_test_sum(),
            0x54 => self.cmd_test_square(),
            0x5C => self.cmd_test_immediate_reg(),
            0x89 => self.cmd_test_immediate_rom(),
            _ => {}
        }

        self.ram[STATUS] &= !0x40;
    }

    // ================================================================
    // 輔助函式
    // ================================================================

    fn read16(&self, offset: usize) -> u16 {
        if offset + 1 < self.ram.len() {
            self.ram[offset] as u16 | ((self.ram[offset + 1] as u16) << 8)
        } else { 0 }
    }

    fn write16(&mut self, offset: usize, val: u16) {
        if offset + 1 < self.ram.len() {
            self.ram[offset] = val as u8;
            self.ram[offset + 1] = (val >> 8) as u8;
        }
    }

    fn read24(&self, offset: usize) -> u32 {
        if offset + 2 < self.ram.len() {
            self.ram[offset] as u32
                | ((self.ram[offset + 1] as u32) << 8)
                | ((self.ram[offset + 2] as u32) << 16)
        } else { 0 }
    }

    fn write24(&mut self, offset: usize, val: u32) {
        if offset + 2 < self.ram.len() {
            self.ram[offset] = val as u8;
            self.ram[offset + 1] = (val >> 8) as u8;
            self.ram[offset + 2] = (val >> 16) as u8;
        }
    }

    // ================================================================
    // cmd=0x00: 精靈處理 (依 $1F4D 子分發)
    // ================================================================

    fn cmd_process_sprites(&mut self, rom: &[u8]) {
        match self.ram[0x1F4D] {
            0x00 => self.conv_oam(rom),
            0x03 => self.do_scale_rotate(0),
            0x07 => self.do_scale_rotate(64),
            0x08 => self.cmd_draw_wireframe(rom),
            _ => {}
        }
    }

    // ================================================================
    // C4ConvOAM — 建構 OAM 表 (核心功能)
    // 基於 snes9x C4ConvOAM
    // ================================================================

    fn conv_oam(&mut self, rom: &[u8]) {
        let oam_start = self.ram[0x626] as usize;
        let mut oam_ptr = oam_start << 2;
        let mut oam_ptr2 = 0x200 + (oam_start >> 2);

        // 清除 OAM (Y=0xE0 隱藏)，從末尾往回清到起始位置
        {
            let mut i = 0x1FD_usize;
            while i >= oam_ptr + 4 {
                self.ram[i] = 0xE0;
                i = i.wrapping_sub(4);
            }
        }

        let global_x = self.read16(0x0621);
        let global_y = self.read16(0x0623);

        let sprite_count = self.ram[0x0620] as usize;
        if sprite_count == 0 { return; }

        let mut spr_remaining = 128usize.saturating_sub(oam_start);
        let mut offset: usize = (oam_start & 3) * 2;
        let mut srcptr = 0x220_usize;

        for _ in 0..sprite_count {
            if spr_remaining == 0 { break; }
            if srcptr + 15 >= 0x2000 { break; }

            let spr_x = (self.read16(srcptr) as i16 as i32) - (global_x as i16 as i32);
            let spr_y = (self.read16(srcptr + 2) as i16 as i32) - (global_y as i16 as i32);
            let spr_name = self.ram[srcptr + 5];
            let spr_attr = self.ram[srcptr + 4] | self.ram[srcptr + 6];

            let sub_addr = self.read24(srcptr + 7);
            let sub_count = rom_read(rom, sub_addr);

            if sub_count != 0 {
                let mut sub_ptr = sub_addr + 1;
                let mut sub_rem = sub_count as usize;

                while sub_rem > 0 && spr_remaining > 0 {
                    let s0 = rom_read(rom, sub_ptr);
                    let s1 = rom_read(rom, sub_ptr + 1) as i8 as i32;
                    let s2 = rom_read(rom, sub_ptr + 2) as i8 as i32;
                    let s3 = rom_read(rom, sub_ptr + 3);

                    let mut x = s1;
                    if spr_attr & 0x40 != 0 {
                        x = -x - if s0 & 0x20 != 0 { 16 } else { 8 };
                    }
                    x += spr_x;

                    if x >= -16 && x <= 272 {
                        let mut y = s2;
                        if spr_attr & 0x80 != 0 {
                            y = -y - if s0 & 0x20 != 0 { 16 } else { 8 };
                        }
                        y += spr_y;

                        if y >= -16 && y <= 224 {
                            if oam_ptr + 3 < 0x200 {
                                self.ram[oam_ptr] = (x & 0xFF) as u8;
                                self.ram[oam_ptr + 1] = y as u8;
                                self.ram[oam_ptr + 2] = spr_name.wrapping_add(s3);
                                self.ram[oam_ptr + 3] = spr_attr ^ (s0 & 0xC0);

                                if oam_ptr2 < 0x220 {
                                    self.ram[oam_ptr2] &= !(3u8 << offset);
                                    if x & 0x100 != 0 {
                                        self.ram[oam_ptr2] |= 1u8 << offset;
                                    }
                                    if s0 & 0x20 != 0 {
                                        self.ram[oam_ptr2] |= 2u8 << offset;
                                    }
                                }

                                oam_ptr += 4;
                                spr_remaining -= 1;
                                offset = (offset + 2) & 6;
                                if offset == 0 { oam_ptr2 += 1; }
                            }
                        }
                    }

                    sub_ptr += 4;
                    sub_rem -= 1;
                }
            } else if spr_remaining > 0 {
                // 單精靈 (sub_count == 0)
                if oam_ptr + 3 < 0x200 {
                    self.ram[oam_ptr] = (spr_x & 0xFF) as u8;
                    self.ram[oam_ptr + 1] = spr_y as u8;
                    self.ram[oam_ptr + 2] = spr_name;
                    self.ram[oam_ptr + 3] = spr_attr;

                    if oam_ptr2 < 0x220 {
                        self.ram[oam_ptr2] &= !(3u8 << offset);
                        if spr_x & 0x100 != 0 {
                            self.ram[oam_ptr2] |= 3u8 << offset;
                        } else {
                            self.ram[oam_ptr2] |= 2u8 << offset;
                        }
                    }

                    oam_ptr += 4;
                    spr_remaining -= 1;
                    offset = (offset + 2) & 6;
                    if offset == 0 { oam_ptr2 += 1; }
                }
            }

            srcptr += 16;
        }
    }

    // ================================================================
    // Scale / Rotate
    // ================================================================

    fn do_scale_rotate(&mut self, row_padding: usize) {
        let x_scale = (self.read16(0x1F8F) as i32) & 0x7FFF;
        let y_scale = (self.read16(0x1F92) as i32) & 0x7FFF;
        let angle = self.read16(0x1F80) as usize & 0x1FF;

        let (a, b, c, d): (i16, i16, i16, i16) = match angle {
            0   => (x_scale as i16, 0, 0, y_scale as i16),
            128 => (0, -(y_scale as i16), x_scale as i16, 0),
            256 => (-(x_scale as i16), 0, 0, -(y_scale as i16)),
            384 => (0, y_scale as i16, -(x_scale as i16), 0),
            _ => (
                sar(self.cos_table[angle] as i32 * x_scale, 15) as i16,
                -(sar(self.sin_table[angle] as i32 * y_scale, 15) as i16),
                sar(self.sin_table[angle] as i32 * x_scale, 15) as i16,
                sar(self.cos_table[angle] as i32 * y_scale, 15) as i16,
            ),
        };

        let w = (self.ram[0x1F89] & !7) as usize;
        let h = (self.ram[0x1F8C] & !7) as usize;
        if w == 0 || h == 0 { return; }

        let clear_size = ((w + row_padding / 4) * h / 2).min(0x2000);
        for i in 0..clear_size { self.ram[i] = 0; }

        let cx = self.read16(0x1F83) as i16 as i32;
        let cy = self.read16(0x1F86) as i16 as i32;

        let mut line_x = (cx << 12) - cx * a as i32 - cx * b as i32;
        let mut line_y = (cy << 12) - cy * c as i32 - cy * d as i32;

        let mut outidx: usize = 0;
        let mut bit: u8 = 0x80;

        for _row in 0..h {
            let mut px = line_x;
            let mut py = line_y;

            for _col in 0..w {
                let sx = (px >> 12) as usize;
                let sy = (py >> 12) as usize;
                let byte = if sx >= w || sy >= h { 0 } else {
                    let addr = sy * w + sx;
                    let v = self.ram[0x600 + (addr >> 1)];
                    if addr & 1 != 0 { v >> 4 } else { v & 0x0F }
                };

                if byte & 1 != 0 && outidx < 0x2000 { self.ram[outidx] |= bit; }
                if byte & 2 != 0 && outidx + 1 < 0x2000 { self.ram[outidx + 1] |= bit; }
                if byte & 4 != 0 && outidx + 16 < 0x2000 { self.ram[outidx + 16] |= bit; }
                if byte & 8 != 0 && outidx + 17 < 0x2000 { self.ram[outidx + 17] |= bit; }

                bit >>= 1;
                if bit == 0 { bit = 0x80; outidx += 32; }

                px += a as i32;
                py += c as i32;
            }

            outidx += 2 + row_padding;
            if outidx & 0x10 != 0 {
                outidx &= !0x10;
            } else {
                outidx = outidx.wrapping_sub(w * 4 + row_padding);
            }

            line_x += b as i32;
            line_y += d as i32;
        }
    }

    // ================================================================
    // Draw Wireframe
    // ================================================================

    fn cmd_draw_wireframe(&mut self, _rom: &[u8]) {
        // 線框渲染 - 用於特定場景的 3D 效果 (Zero 的入場等)
        // 完整實作需要 projection + line drawing
        // 暫時保留為 stub，不會導致崩潰
    }

    // ================================================================
    // 數學命令
    // ================================================================

    fn cmd_propulsion(&mut self) {
        let mut tmp: i32 = 0x10000;
        let divisor = self.read16(0x1F83) as i32;
        if divisor != 0 {
            tmp = sar((tmp / divisor) * self.read16(0x1F81) as i32, 8);
        }
        self.write16(0x1F80, tmp as u16);
    }

    fn cmd_set_vector_length(&mut self) {
        let x = self.read16(REG_BASE) as i16 as f64;
        let y = self.read16(REG_BASE + 3) as i16 as f64;
        let target = self.read16(REG_BASE + 6) as i16 as i32;

        let dist = (x * x + y * y).sqrt();
        if dist > 0.5 {
            let nx = ((x * target as f64) / dist).round() as i16;
            let ny = ((y * target as f64) / dist).round() as i16;
            self.write16(REG_BASE + 9, nx as u16);
            self.write16(REG_BASE + 12, ny as u16);
        }
    }

    fn cmd_polar_to_rect1(&mut self) {
        let angle = self.read16(0x1F80) as usize & 0x1FF;
        let mut r1 = self.read16(0x1F83) as i16 as i32;
        if r1 & 0x8000 != 0 { r1 |= !0x7FFF; } else { r1 &= 0x7FFF; }
        let tmp_x = sar(r1 * self.cos_table[angle] as i32 * 2, 16);
        self.write24(0x1F86, tmp_x as u32);
        let tmp_y = sar(r1 * self.sin_table[angle] as i32 * 2, 16);
        self.write24(0x1F89, (tmp_y - sar(tmp_y, 6)) as u32);
    }

    fn cmd_polar_to_rect2(&mut self) {
        let angle = self.read16(0x1F80) as usize & 0x1FF;
        let r = self.read16(0x1F83) as i16 as i32;
        let tmp_x = sar(r * self.cos_table[angle] as i32 * 2, 8);
        self.write24(0x1F86, tmp_x as u32);
        let tmp_y = sar(r * self.sin_table[angle] as i32 * 2, 8);
        self.write24(0x1F89, tmp_y as u32);
    }

    fn cmd_pythagorean(&mut self) {
        let x = self.read16(REG_BASE) as i16 as f64;
        let y = self.read16(REG_BASE + 3) as i16 as f64;
        let dist = (x * x + y * y).sqrt() as i16;
        self.write16(REG_BASE, dist as u16);
    }

    fn cmd_atan(&mut self) {
        let x = self.read16(REG_BASE) as i16 as f64;
        let y = self.read16(REG_BASE + 3) as i16 as f64;
        if x == 0.0 && y == 0.0 { self.write16(REG_BASE + 6, 0); return; }
        let angle = y.atan2(x);
        let cx4_angle = (angle / (2.0 * PI) * 512.0).round() as i32;
        let cx4_angle = ((cx4_angle % 512) + 512) % 512;
        self.write16(REG_BASE + 6, cx4_angle as u16);
    }

    fn cmd_trapezoid(&mut self) {
        let angle1 = self.read16(0x1F8C) as usize & 0x1FF;
        let angle2 = self.read16(0x1F8F) as usize & 0x1FF;

        let tan1 = if self.cos_table[angle1] != 0 {
            ((self.sin_table[angle1] as i32) << 16) / self.cos_table[angle1] as i32
        } else { i32::MIN };
        let tan2 = if self.cos_table[angle2] != 0 {
            ((self.sin_table[angle2] as i32) << 16) / self.cos_table[angle2] as i32
        } else { i32::MIN };

        let mut y = (self.read16(0x1F83) as i16 as i32) - (self.read16(0x1F89) as i16 as i32);

        for j in 0..225usize {
            let (left, right) = if y >= 0 {
                let mut l = sar(tan1.wrapping_mul(y), 16)
                    - (self.read16(0x1F80) as i16 as i32)
                    + (self.read16(0x1F86) as i16 as i32);
                let mut r = sar(tan2.wrapping_mul(y), 16)
                    - (self.read16(0x1F80) as i16 as i32)
                    + (self.read16(0x1F86) as i16 as i32)
                    + (self.read16(0x1F93) as i16 as i32);

                if l < 0 && r < 0 { l = 1; r = 0; }
                else { if l < 0 { l = 0; } if r < 0 { r = 0; } }
                if l > 255 && r > 255 { l = 255; r = 254; }
                else { if l > 255 { l = 255; } if r > 255 { r = 255; } }
                (l as u8, r as u8)
            } else {
                (1u8, 0u8)
            };

            self.ram[j + 0x800] = left;
            self.ram[j + 0x900] = right;
            y += 1;
        }
    }

    fn cmd_multiply(&mut self) {
        let a = self.read24(0x1F80) as i32;
        let b = self.read24(0x1F83) as i32;
        self.write24(0x1F80, a.wrapping_mul(b) as u32);
    }

    fn cmd_transform_coords(&mut self) {
        // TransformCoords — 用於 wireframe 3D 投影
        // 簡化 stub: 不影響一般遊戲畫面
    }

    // ================================================================
    // 測試命令
    // ================================================================

    fn cmd_test_sum(&mut self) {
        let mut sum: u16 = 0;
        for i in 0..0x800 { sum = sum.wrapping_add(self.ram[i] as u16); }
        self.write16(REG_BASE, sum);
    }

    fn cmd_test_square(&mut self) {
        let mut a = self.read24(REG_BASE) as i64;
        if a & 0x800000 != 0 { a |= !0xFFFFFF_i64; }
        let result = a * a;
        self.write24(REG_BASE + 3, result as u32);
        self.write24(REG_BASE + 6, (result >> 24) as u32);
    }

    fn cmd_test_immediate_reg(&mut self) {
        const P: [u8; 48] = [
            0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0x00, 0xFF,
            0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0x00, 0x00,
            0xFF, 0xFF, 0x00, 0x00, 0x80, 0xFF, 0xFF, 0x7F,
            0x00, 0x80, 0x00, 0xFF, 0x7F, 0x00, 0xFF, 0x7F,
            0xFF, 0x7F, 0xFF, 0xFF, 0x00, 0x00, 0x01, 0xFF,
            0xFF, 0xFE, 0x00, 0x01, 0x00, 0xFF, 0xFE, 0x00,
        ];
        for i in 0..48 { self.ram[i] = P[i]; }
    }

    fn cmd_test_immediate_rom(&mut self) {
        self.ram[0x1F80] = 0x36;
        self.ram[0x1F81] = 0x43;
        self.ram[0x1F82] = 0x05;
    }
}
