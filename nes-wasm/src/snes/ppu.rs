// ============================================================
// SNES PPU - Picture Processing Unit
// ============================================================
// 支援 Mode 0-7 背景渲染、OAM 精靈、Window Masking、
// Color Math (Main/Sub Screen)、HDMA 色彩漸變
// 輸出: 256×224 RGBA (可升至 512×448 隔行掃描)
// ============================================================

/// SNES 調色盤：15-bit BGR → 32-bit RGBA 轉換
#[inline]
fn bgr15_to_rgba(bgr: u16) -> u32 {
    let r = ((bgr & 0x1F) << 3) as u32;
    let g = (((bgr >> 5) & 0x1F) << 3) as u32;
    let b = (((bgr >> 10) & 0x1F) << 3) as u32;
    r | (g << 8) | (b << 16) | 0xFF000000
}

/// PPU 螢幕寬高
pub const SCREEN_WIDTH: usize = 256;
pub const SCREEN_HEIGHT: usize = 224;
pub const FRAMEBUFFER_SIZE: usize = SCREEN_WIDTH * SCREEN_HEIGHT * 4;

/// 每幀掃描線數 (NTSC)
pub const SCANLINES_PER_FRAME: u16 = 262;
/// 每條掃描線的 Dot 數
pub const DOTS_PER_SCANLINE: u16 = 340;

pub struct Ppu {
    // === VRAM: 64KB (32K words of 16-bit) ===
    pub vram: [u8; 0x10000],
    /// VRAM 位址
    pub vram_addr: u16,
    /// VRAM 位址增量 (1 或 32)
    pub vram_increment: u16,
    /// VRAM 位址映射模式
    pub vram_mapping: u8,
    /// VRAM 地址重映射 ($2115)
    pub vram_incmode: bool, // true = 寫入高位元後遞增, false = 寫入低位元後遞增
    /// VRAM 讀取預取緩衝
    pub vram_prefetch: u16,

    // === OAM: 544 bytes ===
    pub oam: [u8; 544],
    pub oam_addr: u16,
    pub oam_addr_reload: u16,
    pub oam_latch: u8,
    pub oam_priority: bool,

    // === CGRAM: 256 色, 各 15-bit ===
    pub cgram: [u16; 256],
    pub cgram_addr: u8,
    pub cgram_latch: u8,
    pub cgram_flipflop: bool,

    // === 背景暫存器 ===
    /// 背景模式 ($2105)
    pub bg_mode: u8,
    /// BG3 優先位元
    pub bg3_priority: bool,
    /// 背景 Tilemap 位址 ($2107-$210A) [BG1-BG4]
    pub bg_tilemap_addr: [u16; 4],
    /// 背景 Tilemap 大小 [BG1-BG4] (0=32x32, 1=64x32, 2=32x64, 3=64x64)
    pub bg_tilemap_size: [u8; 4],
    /// 背景 Character 基底位址 ($210B-$210C)
    pub bg_chr_addr: [u16; 4],
    /// 背景 Tile 大小 ($2105 bits 4-7): false=8x8, true=16x16
    pub bg_tile_size: [bool; 4],
    /// 背景水平捲軸 ($210D-$2114)
    pub bg_hscroll: [u16; 4],
    pub bg_vscroll: [u16; 4],
    /// BG scroll latch (PPU1 舊值)
    pub scroll_latch: u8,
    pub scroll_latch2: u8,

    // === Mode 7 ===
    pub m7a: i16,
    pub m7b: i16,
    pub m7c: i16,
    pub m7d: i16,
    pub m7hofs: i16,
    pub m7vofs: i16,
    pub m7x: i16,
    pub m7y: i16,
    pub m7_latch: u8,
    /// Mode 7 write flip-flop: false = next write stores low byte; true = next write combines & updates
    pub m7_flipflop: bool,
    /// Mode 7 low byte buffer (stored on first write, combined on second write)
    pub m7_low_buffer: u8,
    /// 最後寫入 $211C 的原始字節 (用於硬體乘法, 獨立於 latch)
    pub m7_mult_b: i8,
    /// Mode 7 設定 ($211A)
    pub m7sel: u8,

    // === Window ===
    /// Window 1/2 左右邊界 ($2126-$2129)
    pub wh: [u8; 4], // WH0 left, WH1 right, WH2 left, WH3 right
    /// 背景視窗遮罩設定 ($2123-$2125)
    pub w12sel: u8,   // BG1/BG2
    pub w34sel: u8,   // BG3/BG4
    pub wobjsel: u8,  // OBJ/Color
    /// 視窗邏輯 ($212A-$212B)
    pub wbglog: u8,
    pub wobjlog: u8,

    // === Main/Sub Screen 設定 ===
    /// 主畫面啟用 ($212C)
    pub tm: u8,
    /// 子畫面啟用 ($212D)
    pub ts: u8,
    /// 主畫面視窗遮罩 ($212E)
    pub tmw: u8,
    /// 子畫面視窗遮罩 ($212F)
    pub tsw: u8,

    // === Color Math ===
    /// Color math 設定 ($2130)
    pub cgwsel: u8,
    /// Color math 設定 ($2131)
    pub cgadsub: u8,
    /// 固定色 ($2132)
    pub fixed_color_r: u8,
    pub fixed_color_g: u8,
    pub fixed_color_b: u8,

    // === 螢幕設定 ===
    /// 螢幕亮度 ($2100)
    pub brightness: u8,
    /// 強制空白
    pub force_blank: bool,
    /// OBJ 大小設定 ($2101)
    pub obj_size: u8,
    pub obj_base: u16,
    pub obj_name_select: u16,

    // === 雜項暫存器 ===
    /// $2133 SETINI
    pub setini: u8,
    /// $2137 軟鎖存
    pub counter_latch: bool,
    /// H/V 計數器
    pub h_counter: u16,
    pub v_counter: u16,
    /// PPU 狀態
    pub ophct: u16,
    pub opvct: u16,
    pub ophct_latch: bool,
    pub opvct_latch: bool,
    /// $213E PPU1 狀態
    pub stat77: u8,
    /// $213F PPU2 狀態
    pub stat78: u8,

    // === 渲染狀態 ===
    pub scanline: u16,
    pub dot: u16,
    /// 每條掃描線 VBlank/NMI
    pub nmi_flag: bool,
    pub nmi_enabled: bool,
    pub vblank_flag: bool,
    /// NMI 觸發旗標（供 emulator 檢查）
    pub nmi_triggered: bool,
    /// 畫面完成旗標
    pub frame_complete: bool,

    // === 畫面緩衝區: 256×224 RGBA ===
    pub framebuffer: Vec<u8>,

    // === 內部渲染行緩衝 ===
    main_buf: [u32; 256],    // Main screen pixel (RGBA)
    sub_buf: [u32; 256],     // Sub screen pixel (RGBA)
    main_pri: [u8; 256],     // Main screen priority
    sub_pri: [u8; 256],      // Sub screen priority
    main_src: [u8; 256],     // Main screen source layer (for color math)
    sub_src: [u8; 256],      // Sub screen source layer
    window_mask: [[bool; 256]; 6], // Window mask per layer (BG1-4, OBJ, Color)
}

impl Ppu {
    pub fn new() -> Self {
        Ppu {
            vram: [0; 0x10000],
            vram_addr: 0,
            vram_increment: 1,
            vram_mapping: 0,
            vram_incmode: false,
            vram_prefetch: 0,

            oam: [0; 544],
            oam_addr: 0,
            oam_addr_reload: 0,
            oam_latch: 0,
            oam_priority: false,

            cgram: [0; 256],
            cgram_addr: 0,
            cgram_latch: 0,
            cgram_flipflop: false,

            bg_mode: 0,
            bg3_priority: false,
            bg_tilemap_addr: [0; 4],
            bg_tilemap_size: [0; 4],
            bg_chr_addr: [0; 4],
            bg_tile_size: [false; 4],
            bg_hscroll: [0; 4],
            bg_vscroll: [0; 4],
            scroll_latch: 0,
            scroll_latch2: 0,

            m7a: 0, m7b: 0, m7c: 0, m7d: 0,
            m7hofs: 0, m7vofs: 0, m7x: 0, m7y: 0,
            m7_latch: 0,
            m7_flipflop: false,
            m7_low_buffer: 0,
            m7_mult_b: 0,
            m7sel: 0,

            wh: [0; 4],
            w12sel: 0, w34sel: 0, wobjsel: 0,
            wbglog: 0, wobjlog: 0,

            tm: 0, ts: 0, tmw: 0, tsw: 0,
            cgwsel: 0, cgadsub: 0,
            fixed_color_r: 0, fixed_color_g: 0, fixed_color_b: 0,

            brightness: 0xF,
            force_blank: true,
            obj_size: 0,
            obj_base: 0,
            obj_name_select: 0,

            setini: 0,
            counter_latch: false,
            h_counter: 0,
            v_counter: 0,
            ophct: 0, opvct: 0,
            ophct_latch: false, opvct_latch: false,
            stat77: 0x01, // PPU1 版本
            stat78: 0x01, // PPU2 版本

            scanline: 0,
            dot: 0,
            nmi_flag: false,
            nmi_enabled: false,
            vblank_flag: false,
            nmi_triggered: false,
            frame_complete: false,

            framebuffer: vec![0; FRAMEBUFFER_SIZE],

            main_buf: [0; 256],
            sub_buf: [0; 256],
            main_pri: [0; 256],
            sub_pri: [0; 256],
            main_src: [0; 256],
            sub_src: [0; 256],
            window_mask: [[false; 256]; 6],


        }
    }

    pub fn reset(&mut self) {
        self.scanline = 0;
        self.dot = 0;
        self.nmi_flag = false;
        self.vblank_flag = false;
        self.nmi_triggered = false;
        self.frame_complete = false;
        self.force_blank = true;
        self.brightness = 0xF;
        self.oam_addr = 0;
        self.oam_addr_reload = 0;
        self.vram_addr = 0;
        self.cgram_addr = 0;
        self.cgram_flipflop = false;
        self.bg_mode = 0;
    }

    // === PPU 暫存器寫入 ($2100-$2133) ===

    pub fn write_register(&mut self, addr: u16, val: u8) {
        match addr {
            // $2100 - INIDISP: 螢幕亮度與強制空白
            0x2100 => {
                self.brightness = val & 0x0F;
                self.force_blank = val & 0x80 != 0;
            }
            // $2101 - OBSEL: OBJ 大小與基底位址
            0x2101 => {
                self.obj_size = (val >> 5) & 0x07;
                // Name select gap = (nn+1) * 4K words = (nn+1) * 8K bytes
                self.obj_name_select = (((val as u16 >> 3) & 0x03) + 1) << 13;
                // Name base = bbb * 8K words = bbb * 16K bytes
                self.obj_base = (val as u16 & 0x07) << 14;
            }
            // $2102-$2103 - OAMADDL/OAMADDH
            0x2102 => {
                self.oam_addr_reload = (self.oam_addr_reload & 0x0200) | ((val as u16) << 1);
                self.oam_addr = self.oam_addr_reload;
            }
            0x2103 => {
                self.oam_addr_reload = (self.oam_addr_reload & 0x01FE) | ((val as u16 & 0x01) << 9);
                self.oam_priority = val & 0x80 != 0;
                self.oam_addr = self.oam_addr_reload;
            }
            // $2104 - OAMDATA
            0x2104 => {
                if self.oam_addr < 0x200 {
                    if self.oam_addr & 1 == 0 {
                        self.oam_latch = val;
                    } else {
                        let addr = (self.oam_addr & 0x1FE) as usize;
                        if addr < 512 {
                            self.oam[addr] = self.oam_latch;
                            self.oam[addr + 1] = val;
                        }
                    }
                } else {
                    let addr = (0x200 + ((self.oam_addr & 0x1F) as usize));
                    if addr < 544 {
                        self.oam[addr] = val;
                    }
                }
                self.oam_addr = (self.oam_addr + 1) & 0x03FF;
            }
            // $2105 - BGMODE
            0x2105 => {
                self.bg_mode = val & 0x07;
                self.bg3_priority = val & 0x08 != 0;
                // Character size per BG (bit 4-7): 0=8x8, 1=16x16
                self.bg_tile_size[0] = val & 0x10 != 0;
                self.bg_tile_size[1] = val & 0x20 != 0;
                self.bg_tile_size[2] = val & 0x40 != 0;
                self.bg_tile_size[3] = val & 0x80 != 0;
            }
            // $2106 - MOSAIC
            0x2106 => { /* 馬賽克效果 - 稍後實作 */ }
            // $2107-$210A - BGnSC: Tilemap 位址與大小
            0x2107..=0x210A => {
                let bg = (addr - 0x2107) as usize;
                self.bg_tilemap_addr[bg] = ((val as u16) & 0xFC) << 9; // byte addr in 64KB VRAM
                self.bg_tilemap_size[bg] = val & 0x03;
            }
            // $210B-$210C - BGnNBA: Character 基底位址
            0x210B => {
                self.bg_chr_addr[0] = (val as u16 & 0x0F) << 13; // byte addr in 64KB VRAM
                self.bg_chr_addr[1] = (val as u16 >> 4) << 13;
            }
            0x210C => {
                self.bg_chr_addr[2] = (val as u16 & 0x0F) << 13;
                self.bg_chr_addr[3] = (val as u16 >> 4) << 13;
            }
            // $210D-$2114 - BG 捲軸
            // H-scroll uses two latches: value = (data << 8) | (scroll_latch & ~7) | (scroll_latch2 & 7)
            // V-scroll uses one latch:    value = (data << 8) | scroll_latch
            0x210D => { // BG1 H Scroll (also M7HOFS)
                self.bg_hscroll[0] = ((val as u16) << 8) | ((self.scroll_latch as u16) & !7) | ((self.scroll_latch2 as u16) & 7);
                self.scroll_latch = val;
                self.scroll_latch2 = val;
                // Mode 7
                self.m7hofs = (((val as u16) << 8) | (self.m7_latch as u16)) as i16;
                self.m7_latch = val;
            }
            0x210E => { // BG1 V Scroll (also M7VOFS)
                self.bg_vscroll[0] = ((val as u16) << 8) | (self.scroll_latch as u16);
                self.scroll_latch = val;
                self.m7vofs = (((val as u16) << 8) | (self.m7_latch as u16)) as i16;
                self.m7_latch = val;
            }
            0x210F => { self.bg_hscroll[1] = ((val as u16) << 8) | ((self.scroll_latch as u16) & !7) | ((self.scroll_latch2 as u16) & 7); self.scroll_latch = val; self.scroll_latch2 = val; }
            0x2110 => { self.bg_vscroll[1] = ((val as u16) << 8) | (self.scroll_latch as u16); self.scroll_latch = val; }
            0x2111 => { self.bg_hscroll[2] = ((val as u16) << 8) | ((self.scroll_latch as u16) & !7) | ((self.scroll_latch2 as u16) & 7); self.scroll_latch = val; self.scroll_latch2 = val; }
            0x2112 => { self.bg_vscroll[2] = ((val as u16) << 8) | (self.scroll_latch as u16); self.scroll_latch = val; }
            0x2113 => { self.bg_hscroll[3] = ((val as u16) << 8) | ((self.scroll_latch as u16) & !7) | ((self.scroll_latch2 as u16) & 7); self.scroll_latch = val; self.scroll_latch2 = val; }
            0x2114 => { self.bg_vscroll[3] = ((val as u16) << 8) | (self.scroll_latch as u16); self.scroll_latch = val; }
            // $2115 - VMAIN: VRAM 位址設定
            0x2115 => {
                self.vram_incmode = val & 0x80 != 0;
                self.vram_mapping = (val >> 2) & 0x03;
                self.vram_increment = match val & 0x03 {
                    0 => 1, 1 => 32, 2 | 3 => 128,
                    _ => 1,
                };
            }
            // $2116-$2117 - VMADDL/VMADDH: VRAM 位址
            0x2116 => {
                self.vram_addr = (self.vram_addr & 0xFF00) | val as u16;
                self.prefetch_vram();
            }
            0x2117 => {
                self.vram_addr = (self.vram_addr & 0x00FF) | ((val as u16) << 8);
                self.prefetch_vram();
            }
            // $2118-$2119 - VMDATAL/VMDATAH: VRAM 資料寫入
            0x2118 => {
                let mapped = self.map_vram_addr(self.vram_addr);
                let byte_addr = (mapped as usize * 2) & 0xFFFF;
                self.vram[byte_addr] = val;
                if !self.vram_incmode {
                    self.vram_addr = self.vram_addr.wrapping_add(self.vram_increment);
                }
            }
            0x2119 => {
                let mapped = self.map_vram_addr(self.vram_addr);
                let byte_addr = ((mapped as usize * 2) + 1) & 0xFFFF;
                self.vram[byte_addr] = val;
                if self.vram_incmode {
                    self.vram_addr = self.vram_addr.wrapping_add(self.vram_increment);
                }
            }
            // $211A - M7SEL: Mode 7 設定
            0x211A => { self.m7sel = val; }
            // $211B-$211E - Mode 7 矩陣參數 (單次寫入 latch 模式)
            // 每次寫入: register = (val << 8) | m7_latch; m7_latch = val
            // 這些暫存器不使用 flip-flop，每次寫入都會立即更新
            // 遊戲通常連續寫入兩次（低/高字節）來設定 16-bit 值
            0x211B => {
                self.m7a = (((val as u16) << 8) | (self.m7_latch as u16)) as i16;
                self.m7_latch = val;
            }
            0x211C => {
                self.m7_mult_b = val as i8; // 硬體乘法用：每次寫入都記錄
                self.m7b = (((val as u16) << 8) | (self.m7_latch as u16)) as i16;
                self.m7_latch = val;
            }
            0x211D => {
                self.m7c = (((val as u16) << 8) | (self.m7_latch as u16)) as i16;
                self.m7_latch = val;
            }
            0x211E => {
                self.m7d = (((val as u16) << 8) | (self.m7_latch as u16)) as i16;
                self.m7_latch = val;
            }
            // $211F-$2120: M7 Center X/Y - 13-bit signed, uses shared latch (not flipflop)
            0x211F => {
                let raw = ((val as u16) << 8) | (self.m7_latch as u16);
                self.m7x = (((raw & 0x1FFF) as i16) << 3) >> 3;
                self.m7_latch = val;
            }
            0x2120 => {
                let raw = ((val as u16) << 8) | (self.m7_latch as u16);
                self.m7y = (((raw & 0x1FFF) as i16) << 3) >> 3;
                self.m7_latch = val;
            }
            // $2121 - CGADD: CGRAM 位址
            0x2121 => {
                self.cgram_addr = val;
                self.cgram_flipflop = false;
            }
            // $2122 - CGDATA: CGRAM 資料寫入
            0x2122 => {
                if !self.cgram_flipflop {
                    self.cgram_latch = val;
                } else {
                    let color = ((val as u16 & 0x7F) << 8) | self.cgram_latch as u16;
                    self.cgram[self.cgram_addr as usize] = color;
                    self.cgram_addr = self.cgram_addr.wrapping_add(1);
                }
                self.cgram_flipflop = !self.cgram_flipflop;
            }
            // $2123-$2125 - Window Mask
            0x2123 => { self.w12sel = val; }
            0x2124 => { self.w34sel = val; }
            0x2125 => { self.wobjsel = val; }
            // $2126-$2129 - Window Position
            0x2126 => { self.wh[0] = val; }
            0x2127 => { self.wh[1] = val; }
            0x2128 => { self.wh[2] = val; }
            0x2129 => { self.wh[3] = val; }
            // $212A-$212B - Window Logic
            0x212A => { self.wbglog = val; }
            0x212B => { self.wobjlog = val; }
            // $212C-$212F - Main/Sub Screen
            0x212C => { self.tm = val; }
            0x212D => { self.ts = val; }
            0x212E => { self.tmw = val; }
            0x212F => { self.tsw = val; }
            // $2130-$2131 - Color Math
            0x2130 => { self.cgwsel = val; }
            0x2131 => { self.cgadsub = val; }
            // $2132 - COLDATA: 固定色
            0x2132 => {
                let intensity = val & 0x1F;
                if val & 0x20 != 0 { self.fixed_color_r = intensity; }
                if val & 0x40 != 0 { self.fixed_color_g = intensity; }
                if val & 0x80 != 0 { self.fixed_color_b = intensity; }
            }
            // $2133 - SETINI
            0x2133 => { self.setini = val; }
            _ => {}
        }
    }

    // === PPU 暫存器讀取 ($2134-$213F) ===

    pub fn read_register(&mut self, addr: u16) -> u8 {
        match addr {
            // $2134-$2136 - MPY: 硬體乘法結果 = M7A × 最後寫入$211C的字節
            0x2134 => {
                let result = (self.m7a as i32 * (self.m7_mult_b as i32)) as u32;
                result as u8
            }
            0x2135 => {
                let result = (self.m7a as i32 * (self.m7_mult_b as i32)) as u32;
                (result >> 8) as u8
            }
            0x2136 => {
                let result = (self.m7a as i32 * (self.m7_mult_b as i32)) as u32;
                (result >> 16) as u8
            }
            // $2137 - SLHV: 軟鎖存 H/V 計數器
            0x2137 => {
                self.ophct = self.dot;
                self.opvct = self.scanline;
                self.ophct_latch = false;
                self.opvct_latch = false;
                0 // open bus
            }
            // $2138 - OAMDATAREAD
            0x2138 => {
                let val = if (self.oam_addr as usize) < 544 {
                    self.oam[self.oam_addr as usize]
                } else {
                    0
                };
                self.oam_addr = (self.oam_addr + 1) & 0x03FF;
                val
            }
            // $2139-$213A - VMDATALREAD/VMDATAHREAD: VRAM 讀取
            // Read returns OLD prefetch, then increment, then prefetch from NEW address
            0x2139 => {
                let val = self.vram_prefetch as u8;
                if !self.vram_incmode {
                    self.vram_addr = self.vram_addr.wrapping_add(self.vram_increment);
                    self.prefetch_vram();
                }
                val
            }
            0x213A => {
                let val = (self.vram_prefetch >> 8) as u8;
                if self.vram_incmode {
                    self.vram_addr = self.vram_addr.wrapping_add(self.vram_increment);
                    self.prefetch_vram();
                }
                val
            }
            // $213B - CGDATAREAD
            0x213B => {
                let val = if !self.cgram_flipflop {
                    self.cgram[self.cgram_addr as usize] as u8
                } else {
                    let v = (self.cgram[self.cgram_addr as usize] >> 8) as u8;
                    self.cgram_addr = self.cgram_addr.wrapping_add(1);
                    v
                };
                self.cgram_flipflop = !self.cgram_flipflop;
                val
            }
            // $213C - OPHCT
            0x213C => {
                if !self.ophct_latch {
                    self.ophct_latch = true;
                    self.ophct as u8
                } else {
                    self.ophct_latch = false;
                    (self.ophct >> 8) as u8
                }
            }
            // $213D - OPVCT
            0x213D => {
                if !self.opvct_latch {
                    self.opvct_latch = true;
                    self.opvct as u8
                } else {
                    self.opvct_latch = false;
                    (self.opvct >> 8) as u8
                }
            }
            // $213E - STAT77
            0x213E => self.stat77,
            // $213F - STAT78
            0x213F => {
                self.ophct_latch = false;
                self.opvct_latch = false;
                self.stat78
            }
            _ => 0,
        }
    }

    // === VRAM 位址映射 ===

    fn map_vram_addr(&self, addr: u16) -> u16 {
        match self.vram_mapping {
            0 => addr,
            1 => {
                // aaaaaaaaBBBccccc → aaaaaaaacccccBBB
                (addr & 0xFF00) | ((addr & 0x001F) << 3) | ((addr >> 5) & 0x07)
            }
            2 => {
                // aaaaaaaBBBcccccc → aaaaaaaccccccBBB
                (addr & 0xFE00) | ((addr & 0x003F) << 3) | ((addr >> 6) & 0x07)
            }
            3 => {
                // aaaaaaBBBccccccc → aaaaaacccccccBBB
                (addr & 0xFC00) | ((addr & 0x007F) << 3) | ((addr >> 7) & 0x07)
            }
            _ => addr,
        }
    }

    fn prefetch_vram(&mut self) {
        let mapped = self.map_vram_addr(self.vram_addr);
        let byte_addr = (mapped as usize * 2) & 0xFFFE;
        if byte_addr + 1 < self.vram.len() {
            self.vram_prefetch = self.vram[byte_addr] as u16 | ((self.vram[byte_addr + 1] as u16) << 8);
        }
    }

    // === 掃描線推進（由 emulator 呼叫） ===

    /// 推進一個 dot（4 master clocks）
    pub fn dot_clock(&mut self) {
        self.dot += 1;
        if self.dot >= DOTS_PER_SCANLINE {
            self.dot = 0;
            self.end_scanline();
        }
    }

    /// 結束掃描線
    fn end_scanline(&mut self) {
        // 渲染可見掃描線 (1-224)
        if self.scanline >= 1 && self.scanline <= 224 {
            self.render_scanline(self.scanline);
        }

        self.scanline += 1;

        if self.scanline == 225 {
            // VBlank 開始
            self.vblank_flag = true;
            if self.nmi_enabled {
                self.nmi_flag = true;
                self.nmi_triggered = true;
            }
            // OAM 地址重載
            self.oam_addr = self.oam_addr_reload;
        }

        if self.scanline >= SCANLINES_PER_FRAME {
            self.scanline = 0;
            self.vblank_flag = false;
            self.nmi_flag = false;
            self.frame_complete = true;
        }
    }

    /// 檢查並消費 NMI 觸發
    pub fn check_nmi(&mut self) -> bool {
        let triggered = self.nmi_triggered;
        self.nmi_triggered = false;
        triggered
    }

    // === 掃描線渲染 ===

    /// 由模擬器呼叫，渲染可見掃描線 (1-224)
    pub fn render_visible_scanline(&mut self, scanline: u16) {
        if scanline >= 1 && scanline <= 224 {
            self.render_scanline(scanline);
        }
    }

    fn render_scanline(&mut self, scanline: u16) {
        if self.force_blank {
            // 強制空白：填充黑色
            let y = (scanline - 1) as usize;
            let offset = y * SCREEN_WIDTH * 4;
            for x in 0..SCREEN_WIDTH {
                let i = offset + x * 4;
                if i + 3 < self.framebuffer.len() {
                    self.framebuffer[i] = 0;
                    self.framebuffer[i + 1] = 0;
                    self.framebuffer[i + 2] = 0;
                    self.framebuffer[i + 3] = 255;
                }
            }
            return;
        }

        // 清除行緩衝
        let backdrop = self.cgram[0];
        let backdrop_rgba = bgr15_to_rgba(backdrop);
        for x in 0..256 {
            self.main_buf[x] = backdrop_rgba;
            self.sub_buf[x] = backdrop_rgba; // Sub screen backdrop = CGRAM[0] (匹配硬體行為)
            self.main_pri[x] = 0;
            self.sub_pri[x] = 0;
            self.main_src[x] = 5; // backdrop
            self.sub_src[x] = 5;
        }

        // 計算 Window Mask
        self.compute_window_masks();

        let y = scanline - 1;

        // 依 BG 模式渲染
        match self.bg_mode {
            0 => {
                // Mode 0: 4 BG, 每層 2bpp(4色)
                // Back→Front: BG4p0(1) BG3p0(2) OBJ0(3) BG4p1(4) BG3p1(5) OBJ1(6)
                //   BG2p0(7) BG1p0(8) OBJ2(9) BG2p1(10) BG1p1(11) OBJ3(12)
                self.render_bg(3, y, 2, 1, 4);
                self.render_bg(2, y, 2, 2, 5);
                self.render_bg(1, y, 2, 7, 10);
                self.render_bg(0, y, 2, 8, 11);
            }
            1 => {
                // Mode 1: BG1/BG2=4bpp(16色), BG3=2bpp(4色)
                if self.bg3_priority {
                    // BG3 priority: BG3p0(1) OBJ0(2) OBJ1(3) BG2p0(4) BG1p0(5)
                    //   OBJ2(6) BG2p1(7) BG1p1(8) OBJ3(9) BG3p1(10)
                    self.render_bg(2, y, 2, 1, 10);
                    self.render_bg(1, y, 4, 4, 7);
                    self.render_bg(0, y, 4, 5, 8);
                } else {
                    // Normal: BG3p0(2) OBJ0(3) BG3p1(4) OBJ1(5) BG2p0(6)
                    //   BG1p0(7) OBJ2(8) BG2p1(9) BG1p1(10) OBJ3(11)
                    self.render_bg(2, y, 2, 2, 4);
                    self.render_bg(1, y, 4, 6, 9);
                    self.render_bg(0, y, 4, 7, 10);
                }
            }
            2 => {
                // Mode 2: BG1/BG2=4bpp, offset-per-tile
                self.render_bg(1, y, 4, 2, 6);
                self.render_bg(0, y, 4, 4, 8);
            }
            3 => {
                // Mode 3: BG1=8bpp(256色), BG2=4bpp
                self.render_bg(1, y, 4, 2, 6);
                self.render_bg(0, y, 8, 4, 8);
            }
            4 => {
                // Mode 4: BG1=8bpp, BG2=2bpp (offset-per-tile)
                self.render_bg(1, y, 2, 2, 6);
                self.render_bg(0, y, 8, 4, 8);
            }
            5 => {
                // Mode 5: BG1=4bpp, BG2=2bpp, hi-res (512px wide)
                self.render_bg_hires(1, y, 2, 2, 6);
                self.render_bg_hires(0, y, 4, 4, 8);
            }
            6 => {
                // Mode 6: BG1=4bpp, hi-res (offset-per-tile)
                self.render_bg_hires(0, y, 4, 4, 8);
            }
            7 => {
                self.render_mode7(y);
            }
            _ => {}
        }

        // 渲染 OBJ (Sprites)
        self.render_sprites(y);

        // 合成 Main + Sub Screen (Color Math)
        self.composite_scanline(scanline);
    }

    // === 背景渲染 ===

    /// render a BG layer. pri_lo/pri_hi = effective priority values for tile priority 0/1.
    fn render_bg(&mut self, bg_idx: usize, scanline: u16, bpp: u8, pri_lo: u8, pri_hi: u8) {
        let tilemap_addr = self.bg_tilemap_addr[bg_idx] as usize;
        let chr_addr = self.bg_chr_addr[bg_idx] as usize;
        let hscroll = self.bg_hscroll[bg_idx] & 0x03FF; // 10-bit scroll
        let vscroll = self.bg_vscroll[bg_idx] & 0x03FF;
        let map_size = self.bg_tilemap_size[bg_idx];
        let tile16 = self.bg_tile_size[bg_idx];

        // tile_size_px: 8 or 16
        let tile_px = if tile16 { 16usize } else { 8usize };

        // Scroll masks depend on tilemap size and tile size
        // Each 32x32 tilemap screen covers 256px (8x8) or 512px (16x16) per axis
        let base = if tile16 { 512 } else { 256 };
        let h_total = base * (if map_size & 0x01 != 0 { 2 } else { 1 });
        let v_total = base * (if map_size & 0x02 != 0 { 2 } else { 1 });
        let h_mask = h_total - 1;
        let v_mask = v_total - 1;

        let y_scroll = (scanline as usize + vscroll as usize) & v_mask;
        let fine_y_global = y_scroll & (tile_px - 1); // 0-7 or 0-15

        // 遍歷可見像素（改為逐像素以正確處理 16x16）
        for screen_x in 0..256usize {
            let x_scroll = (screen_x + hscroll as usize) & h_mask;

            // 計算 tilemap 中的 tile 座標
            let tile_col_full = x_scroll / tile_px;
            let tile_row_full = y_scroll / tile_px;
            let fine_x = x_scroll & (tile_px - 1);
            let fine_y = fine_y_global;

            // Tilemap 座標（每個 screen 是 32x32 tiles，但大地圖可以是 64x64 of 8x8-tile entries）
            // 如果是 16x16 tile 模式，tilemap 仍使用 8x8 的 grid 來排列——但 $2105 的 16x16 mode
            // 意味著每個 tilemap entry 覆蓋 16x16 的範圍，用 tile_num 的低 bit 來選擇 sub-tile。
            // Actually: SNES 16x16 mode 中 tilemap 還是 32x32 entries，每個 entry 描述 16x16 的 tile。
            // 16x16 tile 由 4 個 8x8 character 組成: tile_num 是左上角的 char ID，
            // 右邊是 +1，下面是 +16，右下是 +17。

            let map_col = tile_col_full & 0x1F;
            let map_row = tile_row_full & 0x1F;

            // Tilemap 位址（考慮 multi-screen）
            let mut map_addr = tilemap_addr;
            if (map_size & 0x01 != 0) && (tile_col_full & 0x20) != 0 {
                map_addr += 0x800;
            }
            if (map_size & 0x02 != 0) && (tile_row_full & 0x20) != 0 {
                map_addr += if map_size & 0x01 != 0 { 0x1000 } else { 0x800 };
            }

            let entry_addr = (map_addr + (map_row * 32 + map_col) * 2) & 0xFFFF;
            let tile_lo = self.vram[entry_addr] as u16;
            let tile_hi = self.vram[(entry_addr + 1) & 0xFFFF] as u16;
            let tile_entry = tile_lo | (tile_hi << 8);

            let mut tile_num = (tile_entry & 0x03FF) as usize;
            let palette = ((tile_entry >> 10) & 0x07) as usize;
            let priority = ((tile_entry >> 13) & 0x01) as u8;
            let flip_x = tile_entry & 0x4000 != 0;
            let flip_y = tile_entry & 0x8000 != 0;

            // Sub-tile 選擇（16x16 mode）
            let (sub_x, sub_y) = if tile16 {
                let sx = if flip_x { if fine_x >= 8 { 0 } else { 1 } } else { if fine_x >= 8 { 1 } else { 0 } };
                let sy = if flip_y { if fine_y >= 8 { 0 } else { 1 } } else { if fine_y >= 8 { 1 } else { 0 } };
                (sx, sy)
            } else {
                (0usize, 0usize)
            };

            tile_num = tile_num.wrapping_add(sub_x).wrapping_add(sub_y * 16);
            let px_in_tile = (if flip_x { 7 - (fine_x & 7) } else { fine_x & 7 }) as usize;
            let py_in_tile = (if flip_y { 7 - (fine_y & 7) } else { fine_y & 7 }) as usize;

            let color_idx = self.read_tile_pixel(chr_addr, tile_num, px_in_tile, py_in_tile, bpp);
            if color_idx == 0 { continue; } // 透明

            let pal_offset = palette * (1 << bpp) + color_idx;
            let color = self.cgram[pal_offset & 0xFF];
            let rgba = bgr15_to_rgba(color);

            // Priority: use the per-layer priority mapping
            let pri = if priority != 0 { pri_hi } else { pri_lo };
            let layer = bg_idx as u8;

            // 寫入 Main Screen
            if self.tm & (1 << bg_idx) != 0 && pri > self.main_pri[screen_x] {
                if !(self.tmw & (1 << bg_idx) != 0 && self.window_mask[bg_idx][screen_x]) {
                    self.main_buf[screen_x] = rgba;
                    self.main_pri[screen_x] = pri;
                    self.main_src[screen_x] = layer;
                }
            }

            // 寫入 Sub Screen
            if self.ts & (1 << bg_idx) != 0 && pri > self.sub_pri[screen_x] {
                if !(self.tsw & (1 << bg_idx) != 0 && self.window_mask[bg_idx][screen_x]) {
                    self.sub_buf[screen_x] = rgba;
                    self.sub_pri[screen_x] = pri;
                    self.sub_src[screen_x] = layer;
                }
            }
        }
    }

    /// Hi-res (Mode 5/6) BG rendering. Tiles are 16 hi-res pixels wide (two 8x8 characters).
    /// Output is downsampled to 256 lo-res pixels (every other hi-res pixel).
    fn render_bg_hires(&mut self, bg_idx: usize, scanline: u16, bpp: u8, pri_lo: u8, pri_hi: u8) {
        let tilemap_addr = self.bg_tilemap_addr[bg_idx] as usize;
        let chr_addr = self.bg_chr_addr[bg_idx] as usize;
        let hscroll = self.bg_hscroll[bg_idx] & 0x03FF;
        let vscroll = self.bg_vscroll[bg_idx] & 0x03FF;
        let map_size = self.bg_tilemap_size[bg_idx];
        let tall = self.bg_tile_size[bg_idx]; // vertical 16-px tall if set

        // In hi-res, tiles are always 16 hi-res pixels wide (two 8x8 chars)
        let tile_h = if tall { 16usize } else { 8usize };

        // Tilemap: each 32-entry row covers 32*16 = 512 hi-res pixels
        let h_base = 512usize;
        let v_base = if tall { 512 } else { 256 };
        let h_total = h_base * (if map_size & 0x01 != 0 { 2 } else { 1 });
        let v_total = v_base * (if map_size & 0x02 != 0 { 2 } else { 1 });
        let h_mask = h_total - 1;
        let v_mask = v_total - 1;

        let y_scroll = (scanline as usize + vscroll as usize) & v_mask;
        let tile_row_full = y_scroll / tile_h;
        let fine_y = y_scroll & (tile_h - 1);

        for screen_x in 0..256usize {
            // Each output pixel maps to 2 hi-res pixels; take the even one
            let hires_x = (screen_x * 2 + hscroll as usize) & h_mask;

            let tile_col_full = hires_x / 16; // 16 hi-res pixels per tile entry
            let fine_x_hires = hires_x & 15;  // 0-15 within the tile

            let map_col = tile_col_full & 0x1F;
            let map_row = tile_row_full & 0x1F;

            let mut map_addr = tilemap_addr;
            if (map_size & 0x01 != 0) && (tile_col_full & 0x20) != 0 {
                map_addr += 0x800;
            }
            if (map_size & 0x02 != 0) && (tile_row_full & 0x20) != 0 {
                map_addr += if map_size & 0x01 != 0 { 0x1000 } else { 0x800 };
            }

            let entry_addr = (map_addr + (map_row * 32 + map_col) * 2) & 0xFFFF;
            let tile_lo = self.vram[entry_addr] as u16;
            let tile_hi = self.vram[(entry_addr + 1) & 0xFFFF] as u16;
            let tile_entry = tile_lo | (tile_hi << 8);

            let mut tile_num = (tile_entry & 0x03FF) as usize;
            let palette = ((tile_entry >> 10) & 0x07) as usize;
            let priority = ((tile_entry >> 13) & 0x01) as u8;
            let flip_x = tile_entry & 0x4000 != 0;
            let flip_y = tile_entry & 0x8000 != 0;

            // Horizontal sub-tile: left char = tile N, right char = tile N+1
            let h_sub = if flip_x {
                if fine_x_hires >= 8 { 0 } else { 1 }
            } else {
                if fine_x_hires >= 8 { 1 } else { 0 }
            };

            // Vertical sub-tile for 16-pixel tall tiles
            let v_sub = if tall {
                if flip_y { if fine_y >= 8 { 0 } else { 1 } }
                else { if fine_y >= 8 { 1 } else { 0 } }
            } else {
                0usize
            };

            tile_num = tile_num.wrapping_add(h_sub).wrapping_add(v_sub * 16);

            let px_in_tile = if flip_x { 7 - (fine_x_hires & 7) } else { fine_x_hires & 7 };
            let py_in_tile = if flip_y { 7 - (fine_y & 7) } else { fine_y & 7 };

            let color_idx = self.read_tile_pixel(chr_addr, tile_num, px_in_tile, py_in_tile, bpp);
            if color_idx == 0 { continue; }

            let pal_offset = palette * (1 << bpp) + color_idx;
            let color = self.cgram[pal_offset & 0xFF];
            let rgba = bgr15_to_rgba(color);

            let pri = if priority != 0 { pri_hi } else { pri_lo };
            let layer = bg_idx as u8;

            if self.tm & (1 << bg_idx) != 0 && pri > self.main_pri[screen_x] {
                if !(self.tmw & (1 << bg_idx) != 0 && self.window_mask[bg_idx][screen_x]) {
                    self.main_buf[screen_x] = rgba;
                    self.main_pri[screen_x] = pri;
                    self.main_src[screen_x] = layer;
                }
            }

            if self.ts & (1 << bg_idx) != 0 && pri > self.sub_pri[screen_x] {
                if !(self.tsw & (1 << bg_idx) != 0 && self.window_mask[bg_idx][screen_x]) {
                    self.sub_buf[screen_x] = rgba;
                    self.sub_pri[screen_x] = pri;
                    self.sub_src[screen_x] = layer;
                }
            }
        }
    }

    /// 讀取 Tile 像素的色號
    fn read_tile_pixel(&self, chr_base: usize, tile: usize, x: usize, y: usize, bpp: u8) -> usize {
        let bytes_per_row = bpp as usize; // 每行 N bytes (BPP=2: 2, BPP=4: 4, BPP=8: 8)
        let tile_size = 8 * bytes_per_row;
        let base = (chr_base + tile * tile_size) & 0xFFFF;
        let bit = 7 - x;

        let mut color: usize = 0;

        // Bitplane 0-1 (所有 BPP 都有)
        if bpp >= 2 {
            let addr0 = (base + y * 2) & 0xFFFF;
            let addr1 = (base + y * 2 + 1) & 0xFFFF;
            color |= ((self.vram[addr0] >> bit) & 1) as usize;
            color |= (((self.vram[addr1] >> bit) & 1) as usize) << 1;
        }

        // Bitplane 2-3
        if bpp >= 4 {
            let addr2 = (base + y * 2 + 16) & 0xFFFF;
            let addr3 = (base + y * 2 + 17) & 0xFFFF;
            color |= (((self.vram[addr2] >> bit) & 1) as usize) << 2;
            color |= (((self.vram[addr3] >> bit) & 1) as usize) << 3;
        }

        // Bitplane 4-7
        if bpp >= 8 {
            let addr4 = (base + y * 2 + 32) & 0xFFFF;
            let addr5 = (base + y * 2 + 33) & 0xFFFF;
            let addr6 = (base + y * 2 + 48) & 0xFFFF;
            let addr7 = (base + y * 2 + 49) & 0xFFFF;
            color |= (((self.vram[addr4] >> bit) & 1) as usize) << 4;
            color |= (((self.vram[addr5] >> bit) & 1) as usize) << 5;
            color |= (((self.vram[addr6] >> bit) & 1) as usize) << 6;
            color |= (((self.vram[addr7] >> bit) & 1) as usize) << 7;
        }

        color
    }

    // === Mode 7 渲染 ===

    fn render_mode7(&mut self, scanline: u16) {
        let y = scanline as i32;

        // 13-bit sign extension for center and offset values
        let cx = ((self.m7x as i32) << 19) >> 19;
        let cy = ((self.m7y as i32) << 19) >> 19;
        let a = self.m7a as i32;
        let b = self.m7b as i32;
        let c = self.m7c as i32;
        let d = self.m7d as i32;
        let hofs = ((self.m7hofs as i32) << 19) >> 19;
        let vofs = ((self.m7vofs as i32) << 19) >> 19;

        // Mode 7 H/V flip (m7sel bits 0-1)
        let clip_y = if self.m7sel & 0x02 != 0 { 255 - y } else { y };
        let sy = clip_y + vofs - cy;

        let h_flip = self.m7sel & 0x01 != 0;

        // Precompute the Y-component: B*sy and D*sy (these are constant for the whole line)
        let base_x = (b * sy) + (cx << 8);
        let base_y = (d * sy) + (cy << 8);

        for screen_x in 0..256usize {
            let eff_x = if h_flip { 255 - screen_x as i32 } else { screen_x as i32 };
            let sx = eff_x + hofs - cx;

            // 矩陣運算: 使用完整 i32 中間值，最後截斷到 18-bit 有符號
            // SNES hardware: result = (M × vector >> 8) + center, with 18-bit wrap
            let vram_x_full = (a * sx) + base_x;
            let vram_y_full = (c * sx) + base_y;

            // 取 8.8 固定點的整數部分: >> 8, 然後截斷到有效範圍
            let vram_x = vram_x_full >> 8;
            let vram_y = vram_y_full >> 8;

            let tx = vram_x >> 3;
            let ty = vram_y >> 3;
            let px = (vram_x & 7) as usize;
            let py = (vram_y & 7) as usize;

            let mut color_idx: u8 = 0;

            let repeat = self.m7sel & 0xC0;
            if repeat == 0x00 {
                // Mode 00: 全域環繞 — tile 座標取 128 的模
                let wtx = (tx & 0x7F) as usize;
                let wty = (ty & 0x7F) as usize;
                let tile_addr = (wty * 128 + wtx) * 2;
                let tile = self.vram[tile_addr & 0xFFFF];
                let pixel_addr = (tile as usize * 128) + (py * 16) + (px * 2) + 1;
                color_idx = self.vram[pixel_addr & 0xFFFF];
            } else if tx >= 0 && tx < 128 && ty >= 0 && ty < 128 {
                // 在 128×128 tile 範圍內 — 所有 repeat mode 都正常取值
                let tile_addr = ((ty as usize) * 128 + (tx as usize)) * 2;
                let tile = self.vram[tile_addr & 0xFFFF];
                let pixel_addr = (tile as usize * 128) + (py * 16) + (px * 2) + 1;
                color_idx = self.vram[pixel_addr & 0xFFFF];
            } else if repeat == 0xC0 {
                // 區域外使用 Tile 0
                let pixel_addr = (py * 16) + (px * 2) + 1;
                color_idx = self.vram[pixel_addr & 0xFFFF];
            }
            // 0x40 和 0x80 = 區域外透明

            if color_idx == 0 { continue; }

            let color = self.cgram[color_idx as usize];
            let rgba = bgr15_to_rgba(color);

            // 寫入 Main/Sub
            if self.tm & 0x01 != 0 {
                self.main_buf[screen_x] = rgba;
                self.main_pri[screen_x] = 2;
                self.main_src[screen_x] = 0;
            }
            if self.ts & 0x01 != 0 {
                self.sub_buf[screen_x] = rgba;
                self.sub_pri[screen_x] = 2;
                self.sub_src[screen_x] = 0;
            }
        }
    }

    // === 精靈渲染 ===

    fn render_sprites(&mut self, scanline: u16) {
        let y = scanline as i16;

        // Map OBJ priority 0-3 to effective priority based on BG mode
        let obj_pri_map: [u8; 4] = match self.bg_mode {
            0 => [3, 6, 9, 12],
            1 => if self.bg3_priority { [2, 3, 6, 9] } else { [3, 5, 8, 11] },
            _ => [3, 5, 7, 9],
        };

        // 精靈大小表
        let (small_w, small_h, large_w, large_h) = match self.obj_size {
            0 => (8, 8, 16, 16),
            1 => (8, 8, 32, 32),
            2 => (8, 8, 64, 64),
            3 => (16, 16, 32, 32),
            4 => (16, 16, 64, 64),
            5 => (32, 32, 64, 64),
            _ => (8, 8, 16, 16),
        };

        // 收集本行可見的精靈（最多 32 個，優先順序：OAM 位址低的優先）
        let mut sprites_on_line: Vec<(usize, i16, i16, u16, u8, bool, bool, u8, i16, i16, u16)> = Vec::new();

        // OAM priority rotation: when bit 7 of $2103 is set, evaluation starts
        // from the sprite indicated by oam_addr_reload and wraps around
        let first_sprite = if self.oam_priority {
            ((self.oam_addr_reload >> 2) & 0x7F) as usize
        } else {
            0
        };

        for idx in 0..128 {
            let i = (first_sprite + idx) & 0x7F;
            let base = i * 4;
            let extra_byte = self.oam[512 + (i >> 2)];
            let extra_bits = (extra_byte >> ((i & 3) * 2)) & 0x03;

            let x_low = self.oam[base] as i16;
            let y_pos_byte = self.oam[base + 1];
            let tile = self.oam[base + 2] as u16;
            let attr = self.oam[base + 3];

            let x_high = extra_bits & 0x01;
            let size_bit = (extra_bits >> 1) & 0x01;

            let x = if x_high != 0 { x_low - 256 } else { x_low };

            let (w, h) = if size_bit != 0 {
                (large_w, large_h)
            } else {
                (small_w, small_h)
            };

            // 檢查是否在此掃描線上 (use unsigned byte wrapping for correct Y wrap at 256)
            let sy = (y as u8).wrapping_sub(y_pos_byte) as i16;
            if sy >= h { continue; }

            let palette = ((attr >> 1) & 0x07) as u8;
            let priority = ((attr >> 4) & 0x03) as u8;
            let flip_x = attr & 0x40 != 0;
            let flip_y = attr & 0x80 != 0;
            let name_table = (attr & 0x01) as u16;

            sprites_on_line.push((i, x, sy, tile, palette, flip_x, flip_y, priority, w, h, name_table));
            if sprites_on_line.len() >= 32 { break; }
        }

        // Sort by OAM index so rendering order is always by sprite number
        // (lower index = higher priority = drawn last = appears on top)
        sprites_on_line.sort_by_key(|s| s.0);

        // 反向渲染（低 OAM 編號覆蓋高編號）
        for &(_, x, sy, tile, palette, flip_x, flip_y, priority, w, h, name_table) in sprites_on_line.iter().rev() {
            let fy = if flip_y { h - 1 - sy } else { sy };

            for px in 0..w {
                let screen_x = x + px;
                if screen_x < 0 || screen_x >= 256 { continue; }
                let sx = screen_x as usize;

                let fpx = if flip_x { w - 1 - px } else { px };

                // 計算 tile 編號（8x8 子 tile）
                // Column and row wrap independently at 4 bits (16-tile grid)
                let base_col = tile & 0x0F;
                let base_row = (tile >> 4) & 0x0F;
                let new_col = (base_col + (fpx >> 3) as u16) & 0x0F;
                let new_row = (base_row + (fy >> 3) as u16) & 0x0F;
                let sub_tile = (new_row << 4) | new_col;

                let chr_base = if name_table != 0 {
                    (self.obj_base.wrapping_add(self.obj_name_select)) as usize
                } else {
                    self.obj_base as usize
                };
                let color_idx = self.read_tile_pixel(chr_base, sub_tile as usize, (fpx & 7) as usize, (fy & 7) as usize, 4);
                if color_idx == 0 { continue; }

                let pal_offset = 128 + palette as usize * 16 + color_idx;
                let color = self.cgram[pal_offset & 0xFF];
                let rgba = bgr15_to_rgba(color);

                let pri = obj_pri_map[priority as usize & 3];

                // OBJ 到 Main Screen
                if self.tm & 0x10 != 0 && pri >= self.main_pri[sx] {
                    if !(self.tmw & 0x10 != 0 && self.window_mask[4][sx]) {
                        self.main_buf[sx] = rgba;
                        self.main_pri[sx] = pri;
                        self.main_src[sx] = 4; // OBJ
                    }
                }
                // OBJ 到 Sub Screen
                if self.ts & 0x10 != 0 && pri >= self.sub_pri[sx] {
                    if !(self.tsw & 0x10 != 0 && self.window_mask[4][sx]) {
                        self.sub_buf[sx] = rgba;
                        self.sub_pri[sx] = pri;
                        self.sub_src[sx] = 4;
                    }
                }
            }
        }
    }

    // === Window Masking ===

    fn compute_window_masks(&mut self) {
        for layer in 0..6 {
            for x in 0..256 {
                self.window_mask[layer][x] = false;
            }
        }

        // Window register bits per layer:
        // $2123 (w12sel): bits 0-3 = BG1, bits 4-7 = BG2
        // $2124 (w34sel): bits 0-3 = BG3, bits 4-7 = BG4
        // $2125 (wobjsel): bits 0-3 = OBJ, bits 4-7 = Color

        for layer in 0..6 {
            let settings = match layer {
                0 => self.w12sel & 0x0F,        // BG1: w12sel low nibble
                1 => (self.w12sel >> 4) & 0x0F,  // BG2: w12sel high nibble
                2 => self.w34sel & 0x0F,         // BG3: w34sel low nibble
                3 => (self.w34sel >> 4) & 0x0F,  // BG4: w34sel high nibble
                4 => self.wobjsel & 0x0F,        // OBJ: wobjsel low nibble
                5 => (self.wobjsel >> 4) & 0x0F, // Color: wobjsel high nibble
                _ => 0,
            };

            let w1_enable = settings & 0x02 != 0;
            let w1_invert = settings & 0x01 != 0;
            let w2_enable = settings & 0x08 != 0;
            let w2_invert = settings & 0x04 != 0;

            if !w1_enable && !w2_enable { continue; }

            let w1_left = self.wh[0] as usize;
            let w1_right = self.wh[1] as usize;
            let w2_left = self.wh[2] as usize;
            let w2_right = self.wh[3] as usize;

            let logic = match layer {
                0..=3 => (self.wbglog >> (layer * 2)) & 0x03,
                4 => self.wobjlog & 0x03,
                5 => (self.wobjlog >> 2) & 0x03,
                _ => 0,
            };

            for x in 0..256usize {
                let in_w1 = if w1_enable {
                    let inside = x >= w1_left && x <= w1_right;
                    if w1_invert { !inside } else { inside }
                } else {
                    false
                };

                let in_w2 = if w2_enable {
                    let inside = x >= w2_left && x <= w2_right;
                    if w2_invert { !inside } else { inside }
                } else {
                    false
                };

                self.window_mask[layer][x] = if w1_enable && w2_enable {
                    match logic {
                        0 => in_w1 | in_w2,  // OR
                        1 => in_w1 & in_w2,  // AND
                        2 => in_w1 ^ in_w2,  // XOR
                        3 => !(in_w1 ^ in_w2), // XNOR
                        _ => false,
                    }
                } else if w1_enable {
                    in_w1
                } else {
                    in_w2
                };
            }
        }
    }

    // === Color Math 合成 ===

    fn composite_scanline(&mut self, scanline: u16) {
        let y = (scanline - 1) as usize;
        let offset = y * SCREEN_WIDTH * 4;

        let half = self.cgadsub & 0x40 != 0;
        let subtract = self.cgadsub & 0x80 != 0;
        let brightness = self.brightness as u32;

        for x in 0..SCREEN_WIDTH {
            let main_rgba = self.main_buf[x];
            let sub_rgba = self.sub_buf[x];
            let src = self.main_src[x];

            // 檢查此層是否啟用 color math
            let color_math_enabled = self.cgadsub & (1 << src) != 0;

            // Color math 區域檢查 ($2130)
            let clip_mode = (self.cgwsel >> 6) & 0x03;
            let prevent_mode = (self.cgwsel >> 4) & 0x03;

            let in_window = self.window_mask[5][x];

            // Clip blacks the main screen color before color math
            // $2130 bits 7-6: 0=Never, 1=Outside Color Window, 2=Inside Color Window, 3=Always
            let clip = match clip_mode {
                0 => false,
                1 => !in_window,   // Outside color window → clip when NOT inside
                2 => in_window,    // Inside color window → clip when inside
                3 => true,
                _ => false,
            };

            // Prevent disables color math entirely
            // $2130 bits 5-4: 0=Never, 1=Outside Color Window, 2=Inside Color Window, 3=Always
            let prevent = match prevent_mode {
                0 => false,
                1 => !in_window,   // Outside color window → prevent when NOT inside
                2 => in_window,    // Inside color window → prevent when inside
                3 => true,
                _ => false,
            };

            // Apply clip: force main color to black
            let (mr, mg, mb) = if clip {
                (0u32, 0u32, 0u32)
            } else {
                (main_rgba & 0xFF, (main_rgba >> 8) & 0xFF, (main_rgba >> 16) & 0xFF)
            };

            let final_rgba = if color_math_enabled && !prevent {
                // Sub screen 或固定色
                let (sr, sg, sb) = if self.cgwsel & 0x02 != 0 {
                    // 使用固定色
                    ((self.fixed_color_r as u32) << 3,
                     (self.fixed_color_g as u32) << 3,
                     (self.fixed_color_b as u32) << 3)
                } else {
                    (sub_rgba & 0xFF, (sub_rgba >> 8) & 0xFF, (sub_rgba >> 16) & 0xFF)
                };

                let (r, g, b) = if subtract {
                    let r = (mr as i32 - sr as i32).max(0) as u32;
                    let g = (mg as i32 - sg as i32).max(0) as u32;
                    let b = (mb as i32 - sb as i32).max(0) as u32;
                    if half { (r >> 1, g >> 1, b >> 1) } else { (r, g, b) }
                } else {
                    let r = (mr + sr).min(255);
                    let g = (mg + sg).min(255);
                    let b = (mb + sb).min(255);
                    if half { (r >> 1, g >> 1, b >> 1) } else { (r, g, b) }
                };

                r | (g << 8) | (b << 16) | 0xFF000000
            } else {
                mr | (mg << 8) | (mb << 16) | 0xFF000000
            };

            // 套用亮度
            let r = ((final_rgba & 0xFF) * brightness / 15) as u8;
            let g = (((final_rgba >> 8) & 0xFF) * brightness / 15) as u8;
            let b = (((final_rgba >> 16) & 0xFF) * brightness / 15) as u8;

            let i = offset + x * 4;
            if i + 3 < self.framebuffer.len() {
                self.framebuffer[i] = r;
                self.framebuffer[i + 1] = g;
                self.framebuffer[i + 2] = b;
                self.framebuffer[i + 3] = 255;
            }
        }
    }
}
