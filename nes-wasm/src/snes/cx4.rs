// ============================================================
// Capcom CX4 協處理器 (Hitachi HG51B169) - HLE 實作
// ============================================================
// 使用遊戲：Mega Man X2, Mega Man X3（僅此二款）
// 記憶體映射 (SNES LoROM):
//   $00-3F/$80-BF:$6000-$7FFF → CX4 RAM + I/O
//   $00-3F/$80-BF:$8000-$FFFF → ROM
//   $70-77:$0000-$7FFF → SRAM（未安裝，讀取返回 $00）
// ============================================================
// I/O 暫存器配置（偏移量 = SNES 位址 - $6000）：
//   $1F40-$1F42: DMA 來源位址 (24-bit LoROM)
//   $1F43-$1F44: DMA 長度 (16-bit)
//   $1F45-$1F46: DMA 目標位址 (16-bit, $6000 基底)
//   $1F47:       DMA 觸發
//   $1F48:       ROM 切換
//   $1F49-$1F4B: 程式 ROM 基底位址
//   $1F4D-$1F4E: 頁面選擇
//   $1F4F:       指令指標 / 命令觸發
//   $1F5E:       狀態 (bit 6 = 忙碌)
//   $1F6A-$1F6B: NMI 向量
//   $1F6E-$1F6F: IRQ 向量
//   $1F80-$1FAF: CX4 暫存器 R0-R15 (各 24-bit)
// ============================================================

use std::f64::consts::PI;

/// CX4 協處理器
pub struct Cx4 {
    pub present: bool,
    /// 8KB 位址空間 ($6000-$7FFF 映射到 0x0000-0x1FFF)
    /// 0x0000-0x0BFF: CX4 資料 RAM (3KB)
    /// 0x1F40-0x1FAF: I/O 暫存器
    pub ram: [u8; 0x2000],
    /// 正弦查找表 (512 條目, 完整 360°, 有符號 16-bit)
    sin_table: [i16; 512],
    /// 餘弦查找表
    cos_table: [i16; 512],
}

// I/O 偏移量常數
const DMA_SRC_LO: usize = 0x1F40;
const DMA_LEN_LO: usize = 0x1F43;
const DMA_DST_LO: usize = 0x1F45;
const DMA_TRIGGER: usize = 0x1F47;
const PAGE_LO: usize = 0x1F4D;
const CMD_TRIGGER: usize = 0x1F4F;
const STATUS: usize = 0x1F5E;
const REG_BASE: usize = 0x1F80;

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

    /// 初始化三角函數查找表
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

    /// 讀取 CX4 位址空間 (offset = SNES addr - $6000, 0..0x1FFF)
    pub fn read(&self, offset: u16) -> u8 {
        self.ram[offset as usize & 0x1FFF]
    }

    /// 寫入 CX4 位址空間
    pub fn write(&mut self, offset: u16, val: u8, rom: &[u8]) {
        let off = offset as usize & 0x1FFF;
        self.ram[off] = val;

        match off {
            DMA_TRIGGER => self.do_dma(rom),
            CMD_TRIGGER => self.execute_command(),
            _ => {}
        }
    }

    // ================================================================
    // DMA: SNES ROM → CX4 RAM
    // ================================================================

    fn do_dma(&mut self, rom: &[u8]) {
        let src = self.ram[DMA_SRC_LO] as u32
            | ((self.ram[DMA_SRC_LO + 1] as u32) << 8)
            | ((self.ram[DMA_SRC_LO + 2] as u32) << 16);
        let len = self.ram[DMA_LEN_LO] as u32
            | ((self.ram[DMA_LEN_LO + 1] as u32) << 8);
        let dst = self.ram[DMA_DST_LO] as u16
            | ((self.ram[DMA_DST_LO + 1] as u16) << 8);

        if len == 0 || rom.is_empty() {
            return;
        }

        for i in 0..len {
            let snes_addr = src.wrapping_add(i);
            let bank = (snes_addr >> 16) as u8;
            let addr = snes_addr as u16;

            // LoROM: bank * 0x8000 + (addr & 0x7FFF)
            let rom_offset = ((bank as usize & 0x7F) << 15) | (addr as usize & 0x7FFF);
            let val = if rom_offset < rom.len() {
                rom[rom_offset]
            } else if !rom.is_empty() {
                rom[rom_offset % rom.len()]
            } else {
                0
            };

            // 目標為 CX4 RAM ($6000 基底)
            let dst_offset = dst.wrapping_add(i as u16).wrapping_sub(0x6000);
            if (dst_offset as usize) < 0x2000 {
                self.ram[dst_offset as usize] = val;
            }
        }
    }

    // ================================================================
    // 命令執行 (HLE 分發)
    // ================================================================

    pub fn execute_command(&mut self) {
        // 設定忙碌旗標
        self.ram[STATUS] |= 0x40;

        let page = self.ram[PAGE_LO] as u16 | ((self.ram[PAGE_LO + 1] as u16) << 8);
        let pc = self.ram[CMD_TRIGGER];

        match page {
            0x0000 => self.cmd_sprites(pc),
            0x0001 => { /* scale_tiles - 遊戲未使用 */ }
            0x0002 => self.cmd_math(pc),
            0x0003 => self.cmd_transform_lines(pc),
            0x0005 => self.cmd_draw_wireframe(pc),
            0x0006 => self.cmd_draw_wireframe_sub(pc),
            0x0008 => self.cmd_sprite_func(pc),
            0x000A => self.cmd_wireframe_decode(pc),
            0x000E => self.cmd_test(pc),
            _ => {}
        }

        // 清除忙碌旗標
        self.ram[STATUS] &= !0x40;
    }

    // ================================================================
    // 輔助函式
    // ================================================================

    fn read16(&self, offset: usize) -> u16 {
        if offset + 1 < self.ram.len() {
            self.ram[offset] as u16 | ((self.ram[offset + 1] as u16) << 8)
        } else {
            0
        }
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
        } else {
            0
        }
    }

    fn write24(&mut self, offset: usize, val: u32) {
        if offset + 2 < self.ram.len() {
            self.ram[offset] = val as u8;
            self.ram[offset + 1] = (val >> 8) as u8;
            self.ram[offset + 2] = (val >> 16) as u8;
        }
    }

    /// 讀取 CX4 暫存器 R0..R15 (各 24-bit, 位於 0x1F80 + n*3)
    fn read_reg(&self, n: usize) -> u32 {
        self.read24(REG_BASE + n * 3)
    }

    /// 寫入 CX4 暫存器
    fn write_reg(&mut self, n: usize, val: u32) {
        self.write24(REG_BASE + n * 3, val & 0xFFFFFF);
    }

    /// 讀取暫存器低 16-bit (有符號擴展用)
    fn read_reg16(&self, n: usize) -> i16 {
        self.read16(REG_BASE + n * 3) as i16
    }

    /// 三角函數查找 (角度為 CX4 格式: 0-511 = 0°-360°)
    fn sin_lookup(&self, angle: u16) -> i16 {
        self.sin_table[(angle & 0x1FF) as usize]
    }

    fn cos_lookup(&self, angle: u16) -> i16 {
        self.cos_table[(angle & 0x1FF) as usize]
    }

    // ================================================================
    // Page 0: 精靈處理 (build_oam)
    // ================================================================

    fn cmd_sprites(&mut self, pc: u8) {
        match pc {
            0x00 => self.build_oam(),
            _ => {}
        }
    }

    /// 建構 OAM 表 - CX4 最關鍵的功能
    /// 從 CX4 RAM 讀取精靈資料，輸出 SNES OAM 格式
    fn build_oam(&mut self) {
        // 讀取參數
        let r0 = self.read_reg(0);
        let oam_count = (r0 & 0xFF) as usize; // R0 低位元組 = 精靈數量

        // 攝影機/捲動偏移量 (從 R1, R2)
        let camera_x = self.read_reg16(1) as i32;
        let camera_y = self.read_reg16(2) as i32;

        // 精靈來源資料從 RAM 偏移 0x0220 開始
        // 每個條目 8 位元組:
        //   +0: 旗標 (bit7=可見, bit6=大型, bit5-0=其他)
        //   +1: 圖塊頁面/屬性
        //   +2,3: X 座標 (有符號 16-bit)
        //   +4,5: Y 座標 (有符號 16-bit)
        //   +6: 圖塊編號
        //   +7: 屬性 (調色盤/優先級/翻轉)
        let src_base: usize = 0x0220;
        let mut oam_written: usize = 0;

        // 清除 OAM 輸出區域 (0x0000-0x021F = 544 bytes)
        for i in 0..0x0220 {
            self.ram[i] = 0xF0; // Y=0xF0 隱藏精靈
        }
        // 重設 OAM 高位表
        for i in 0x0200..0x0220 {
            self.ram[i] = 0;
        }

        let count = oam_count.min(128);
        for i in 0..count {
            let src = src_base + i * 8;
            if src + 7 >= 0x0C00 {
                break; // 超出 CX4 RAM 範圍
            }

            let flags = self.ram[src];
            if flags & 0x80 == 0 {
                continue; // 不可見
            }

            let sprite_x = self.read16(src + 2) as i16 as i32;
            let sprite_y = self.read16(src + 4) as i16 as i32;
            let tile = self.ram[src + 6];
            let attr = self.ram[src + 7];

            // 套用攝影機偏移
            let screen_x = sprite_x - camera_x;
            let screen_y = sprite_y - camera_y;

            // 畫面邊界檢查
            if screen_x < -16 || screen_x > 271 || screen_y < -16 || screen_y > 239 {
                continue;
            }

            // 寫入 OAM 條目 (4 位元組)
            let oam_off = oam_written * 4;
            if oam_off + 3 >= 0x200 {
                break;
            }

            self.ram[oam_off] = screen_x as u8; // X 低 8 位
            self.ram[oam_off + 1] = screen_y as u8; // Y
            self.ram[oam_off + 2] = tile;
            self.ram[oam_off + 3] = attr;

            // OAM 高位表：每個精靈 2 位元 (X bit8 + 大小)
            let high_byte_idx = oam_written >> 2;
            let high_bit_shift = (oam_written & 3) * 2;
            let x_bit9 = if screen_x < 0 || screen_x > 255 { 1u8 } else { 0u8 };
            let size_bit = if flags & 0x40 != 0 { 1u8 } else { 0u8 };

            let high_off = 0x0200 + high_byte_idx;
            if high_off < 0x0220 {
                self.ram[high_off] |= (x_bit9 | (size_bit << 1)) << high_bit_shift;
            }

            oam_written += 1;
        }

        // 寫回已處理的精靈數量
        self.write_reg(0, oam_written as u32);
    }

    // ================================================================
    // Page 2: 數學運算
    // ================================================================

    fn cmd_math(&mut self, pc: u8) {
        match pc {
            0x00 => self.math_hires_sqrt(),
            0x03 => self.math_sqrt(),
            0x05 => self.math_propulsion(),
            0x07 => self.math_get_sin(),
            0x0A => self.math_get_cos(),
            0x0D => self.math_set_vector_length(),
            0x10 => self.math_triangle1(),
            0x13 => self.math_triangle2(),
            0x15 => self.math_pythagorean(),
            0x1F => self.math_arc_tan(),
            0x22 => self.math_trapezoid(),
            _ => {}
        }
    }

    /// 高精度平方根
    fn math_hires_sqrt(&mut self) {
        let val = self.read_reg(0);
        let result = (val as f64).sqrt() as u32;
        self.write_reg(0, result & 0xFFFFFF);
    }

    /// 標準平方根
    fn math_sqrt(&mut self) {
        let val = self.read_reg(0);
        let result = (val as f64).sqrt() as u32;
        self.write_reg(0, result & 0xFFFFFF);
    }

    /// 推進：根據角度和速度計算 X/Y 分量
    fn math_propulsion(&mut self) {
        let angle = self.read_reg(1) as u16;
        let speed = self.read_reg16(2) as i32;

        let sin_val = self.sin_lookup(angle) as i32;
        let cos_val = self.cos_lookup(angle) as i32;

        let dx = (speed * cos_val) >> 15;
        let dy = -(speed * sin_val) >> 15; // Y 軸向下為正

        self.write_reg(0, dx as u32 & 0xFFFFFF);
        self.write_reg(3, dy as u32 & 0xFFFFFF);
    }

    /// 取得正弦值
    fn math_get_sin(&mut self) {
        let angle = self.read_reg(0) as u16;
        let result = self.sin_lookup(angle) as i32;
        self.write_reg(0, result as u32 & 0xFFFFFF);
    }

    /// 取得餘弦值
    fn math_get_cos(&mut self) {
        let angle = self.read_reg(0) as u16;
        let result = self.cos_lookup(angle) as i32;
        self.write_reg(0, result as u32 & 0xFFFFFF);
    }

    /// 設定向量長度：將 (X,Y) 向量縮放至指定長度
    fn math_set_vector_length(&mut self) {
        let x = self.read_reg16(0) as i32;
        let y = self.read_reg16(1) as i32;
        let target_len = self.read_reg16(2) as i32;

        let dist_sq = (x as i64 * x as i64 + y as i64 * y as i64) as f64;
        let dist = dist_sq.sqrt();

        if dist > 0.5 {
            let scale = target_len as f64 / dist;
            let new_x = (x as f64 * scale).round() as i32;
            let new_y = (y as f64 * scale).round() as i32;
            self.write_reg(0, new_x as u32 & 0xFFFFFF);
            self.write_reg(1, new_y as u32 & 0xFFFFFF);
        }
    }

    /// 三角形運算 1：angle + length → (cos, sin) 分量
    fn math_triangle1(&mut self) {
        let angle = self.read_reg(0) as u16;
        let length = self.read_reg16(1) as i32;

        let sin_val = self.sin_lookup(angle) as i32;
        let cos_val = self.cos_lookup(angle) as i32;

        let result_x = (length * cos_val) >> 15;
        let result_y = (length * sin_val) >> 15;

        self.write_reg(0, result_x as u32 & 0xFFFFFF);
        self.write_reg(1, result_y as u32 & 0xFFFFFF);
    }

    /// 三角形運算 2：類似 triangle1 但輸入/輸出暫存器不同
    fn math_triangle2(&mut self) {
        let angle = self.read_reg(0) as u16;
        let length = self.read_reg16(1) as i32;

        let sin_val = self.sin_lookup(angle) as i32;
        let cos_val = self.cos_lookup(angle) as i32;

        let result_x = (length * cos_val) >> 15;
        let result_y = (length * sin_val) >> 15;

        self.write_reg(2, result_x as u32 & 0xFFFFFF);
        self.write_reg(3, result_y as u32 & 0xFFFFFF);
    }

    /// 畢氏定理：sqrt(X² + Y²)
    fn math_pythagorean(&mut self) {
        let x = self.read_reg16(0) as i64;
        let y = self.read_reg16(1) as i64;
        let dist = ((x * x + y * y) as f64).sqrt().round() as i32;
        self.write_reg(0, dist as u32 & 0xFFFFFF);
    }

    /// 反正切：atan2(Y, X) → 角度
    fn math_arc_tan(&mut self) {
        let x = self.read_reg16(0) as f64;
        let y = self.read_reg16(1) as f64;

        if x == 0.0 && y == 0.0 {
            self.write_reg(0, 0);
            return;
        }

        let angle = y.atan2(x);
        // 轉換為 CX4 角度格式 (0-511 = 0°-360°)
        let cx4_angle = (angle / (2.0 * PI) * 512.0).round() as i32;
        let cx4_angle = ((cx4_angle % 512) + 512) % 512; // 確保正數
        self.write_reg(0, cx4_angle as u32 & 0xFFFFFF);
    }

    /// 梯形計算（用於線框渲染的插值）
    fn math_trapezoid(&mut self) {
        // 梯形插值用於線框繪製
        // R0 = X1, R1 = Y1, R2 = X2, R3 = Y2
        // 輸出: 插值結果到暫存器
        let x1 = self.read_reg16(0) as i32;
        let y1 = self.read_reg16(1) as i32;
        let x2 = self.read_reg16(2) as i32;
        let y2 = self.read_reg16(3) as i32;

        let dx = x2 - x1;
        let dy = y2 - y1;

        self.write_reg(4, dx as u32 & 0xFFFFFF);
        self.write_reg(5, dy as u32 & 0xFFFFFF);
    }

    // ================================================================
    // Page 3: 線段變換
    // ================================================================

    fn cmd_transform_lines(&mut self, _pc: u8) {
        // 讀取線段資料並套用旋轉/縮放矩陣
        // 用於線框 3D 渲染的座標變換
        let angle = self.read_reg(0) as u16;
        let scale = self.read_reg16(1) as i32;

        let sin_val = self.sin_lookup(angle) as i32;
        let cos_val = self.cos_lookup(angle) as i32;

        // 處理 CX4 RAM 中的線段點資料
        // 從偏移 0x0000 讀取點，套用旋轉矩陣
        let num_points = self.ram[0x0295] as usize;
        let src_base = 0x0000usize;

        for i in 0..num_points.min(32) {
            let off = src_base + i * 4;
            if off + 3 >= 0x0C00 {
                break;
            }

            let x = self.read16(off) as i16 as i32;
            let y = self.read16(off + 2) as i16 as i32;

            // 旋轉: x' = x*cos - y*sin, y' = x*sin + y*cos
            let rx = ((x * cos_val - y * sin_val) >> 15) * scale >> 8;
            let ry = ((x * sin_val + y * cos_val) >> 15) * scale >> 8;

            self.write16(off, rx as u16);
            self.write16(off + 2, ry as u16);
        }
    }

    // ================================================================
    // Page 5: 線框渲染
    // ================================================================

    fn cmd_draw_wireframe(&mut self, _pc: u8) {
        // 線框 3D 渲染（用於 Zero 等場景的立體效果）
        // 讀取頂點/邊資料，渲染線段到 CX4 RAM 的像素緩衝區
        //
        // 這是較複雜的功能，用於特定場景的 3D 線框效果
        // 基本流程:
        // 1. 讀取頂點列表
        // 2. 套用投影/旋轉
        // 3. 繪製線段到像素緩衝區
        //
        // 簡化實作：處理基本的線段繪製
        self.draw_wireframe_internal();
    }

    fn cmd_draw_wireframe_sub(&mut self, _pc: u8) {
        self.draw_wireframe_internal();
    }

    fn draw_wireframe_internal(&mut self) {
        // 讀取線段數量
        let num_lines = self.ram[0x0295] as usize;
        let line_data_base = 0x0000usize;

        // 清除繪圖緩衝區 (在 CX4 RAM 中)
        for i in 0x0300..0x0B00 {
            self.ram[i] = 0;
        }

        // 繪製每條線段
        for i in 0..num_lines.min(64) {
            let off = line_data_base + i * 8;
            if off + 7 >= 0x0C00 {
                break;
            }

            let x1 = self.read16(off) as i16 as i32;
            let y1 = self.read16(off + 2) as i16 as i32;
            let x2 = self.read16(off + 4) as i16 as i32;
            let y2 = self.read16(off + 6) as i16 as i32;

            self.draw_line(x1, y1, x2, y2);
        }
    }

    /// Bresenham 直線繪製演算法
    fn draw_line(&mut self, x0: i32, y0: i32, x1: i32, y1: i32) {
        // 繪製到 CX4 RAM 的像素緩衝區 (0x0300-0x0AFF)
        // 解析度假設為 256x224 -> 1bpp = 7168 bytes
        let buf_base = 0x0300usize;
        let width = 256i32;

        let mut x = x0;
        let mut y = y0;
        let dx = (x1 - x0).abs();
        let dy = -(y1 - y0).abs();
        let sx = if x0 < x1 { 1 } else { -1 };
        let sy = if y0 < y1 { 1 } else { -1 };
        let mut err = dx + dy;

        let max_steps = (dx.abs() + (-dy).abs() + 1).min(1024) as usize;
        for _ in 0..max_steps {
            // 繪製像素
            if x >= 0 && x < width && y >= 0 && y < 224 {
                let byte_idx = (y * width + x) / 8;
                let bit_idx = 7 - (x & 7);
                let off = buf_base + byte_idx as usize;
                if off < 0x0B00 {
                    self.ram[off] |= 1 << bit_idx;
                }
            }

            if x == x1 && y == y1 {
                break;
            }

            let e2 = 2 * err;
            if e2 >= dy {
                err += dy;
                x += sx;
            }
            if e2 <= dx {
                err += dx;
                y += sy;
            }
        }
    }

    // ================================================================
    // Page 8: 精靈輔助函式
    // ================================================================

    fn cmd_sprite_func(&mut self, _pc: u8) {
        // 精靈相關的輔助處理（縮放/旋轉精靈圖塊）
        // 在 MMX2/X3 中用於特殊精靈效果
        // 基本實作：讀取來源圖塊，套用縮放，寫入目標
    }

    // ================================================================
    // Page A: 線框解碼
    // ================================================================

    fn cmd_wireframe_decode(&mut self, _pc: u8) {
        // 從 ROM 載入並解碼線框頂點資料
        // 在 MMX2 使用 bank $28, MMX3 使用 bank $08
        // 解碼的資料存放在 CX4 RAM 中供 draw_wireframe 使用
    }

    // ================================================================
    // Page E: 測試功能
    // ================================================================

    fn cmd_test(&mut self, pc: u8) {
        match pc {
            0x40 => {
                // test_2K_ram_chksum: 計算 CX4 RAM 0x0000-0x07FF 的校驗和
                let mut sum: u16 = 0;
                for i in 0..0x0800 {
                    sum = sum.wrapping_add(self.ram[i] as u16);
                }
                self.write_reg(0, sum as u32);
            }
            0x54 => {
                // test_square: R1:R2 = R0 * R0
                let val = self.read_reg16(0) as i32;
                let result = val * val;
                self.write_reg(1, ((result >> 16) as u32) & 0xFFFFFF);
                self.write_reg(2, (result as u32) & 0xFFFFFF);
            }
            0x5C => {
                // test_immediate_register: 複製 CPU 常數到 RAM
                // 測試用，不影響遊戲
            }
            0x89 => {
                // test_3K_rom_chksum: CX4 內部 ROM 校驗和
                // 返回固定值（因為我們沒有實際 CX4 ROM）
                self.write_reg(0, 0);
            }
            _ => {}
        }
    }
}
