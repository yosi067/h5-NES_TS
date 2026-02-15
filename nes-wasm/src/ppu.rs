// ============================================================
// NES PPU 模擬 - 圖形處理器 (2C02)
// ============================================================
// 完整實作 NES PPU，負責生成 256x240 的畫面輸出。
//
// PPU 的主要功能：
// - 背景渲染：使用名稱表（nametable）和圖案表（pattern table）
// - 精靈渲染：支援 64 個精靈，每條掃描線最多 8 個
// - 捲軸（Scrolling）：支援水平和垂直捲軸
// - VRAM 位址管理：使用 v/t 暫存器（loopy 捲軸）
//
// 參考資料：
// - https://www.nesdev.org/wiki/PPU_rendering
// - https://www.nesdev.org/wiki/PPU_scrolling
// - https://www.nesdev.org/wiki/PPU_registers
// ============================================================

/// NES 系統調色盤（64 色 RGB 值）
/// 這是標準的 2C02 調色盤，每個顏色以 (R, G, B) 表示
const PALETTE: [(u8, u8, u8); 64] = [
    (84, 84, 84),    (0, 30, 116),    (8, 16, 144),    (48, 0, 136),
    (68, 0, 100),    (92, 0, 48),     (84, 4, 0),      (60, 24, 0),
    (32, 42, 0),     (8, 58, 0),      (0, 64, 0),      (0, 60, 0),
    (0, 50, 60),     (0, 0, 0),       (0, 0, 0),       (0, 0, 0),

    (152, 150, 152), (8, 76, 196),    (48, 50, 236),   (92, 30, 228),
    (136, 20, 176),  (160, 20, 100),  (152, 34, 32),   (120, 60, 0),
    (84, 90, 0),     (40, 114, 0),    (8, 124, 0),     (0, 118, 40),
    (0, 102, 120),   (0, 0, 0),       (0, 0, 0),       (0, 0, 0),

    (236, 238, 236), (76, 154, 236),  (120, 124, 236), (176, 98, 236),
    (228, 84, 236),  (236, 88, 180),  (236, 106, 100), (212, 136, 32),
    (160, 170, 0),   (116, 196, 0),   (76, 208, 32),   (56, 204, 108),
    (56, 180, 204),  (60, 60, 60),    (0, 0, 0),       (0, 0, 0),

    (236, 238, 236), (168, 204, 236), (188, 188, 236), (212, 178, 236),
    (236, 174, 236), (236, 174, 212), (236, 180, 176), (228, 196, 144),
    (204, 210, 120), (180, 222, 120), (168, 226, 144), (152, 226, 180),
    (160, 214, 228), (160, 162, 160), (0, 0, 0),       (0, 0, 0),
];

/// PPU 結構體
pub struct Ppu {
    // ===== PPU 暫存器 =====
    /// PPUCTRL ($2000) - 控制暫存器
    /// 位元意義：
    /// 7: NMI 使能
    /// 6: PPU 主/從模式（未使用）
    /// 5: 精靈大小（0=8x8, 1=8x16）
    /// 4: 背景圖案表位址（0=$0000, 1=$1000）
    /// 3: 精靈圖案表位址（0=$0000, 1=$1000, 8x16 模式忽略）
    /// 2: VRAM 位址遞增量（0=+1水平, 1=+32垂直）
    /// 1-0: 基礎名稱表位址
    pub ctrl: u8,

    /// PPUMASK ($2001) - 遮罩暫存器
    /// 控制背景和精靈的顯示
    pub mask: u8,

    /// PPUSTATUS ($2002) - 狀態暫存器
    pub status: u8,

    /// OAM 位址暫存器
    pub oam_addr: u8,

    // ===== 捲軸暫存器（Loopy 實作） =====
    /// 當前 VRAM 位址（v 暫存器，15 位元）
    pub v: u16,
    /// 暫存 VRAM 位址（t 暫存器，15 位元）
    pub t: u16,
    /// 精細 X 捲軸（3 位元）
    pub fine_x: u8,
    /// 寫入鎖存器（w 暫存器，用於 $2005/$2006 雙次寫入）
    pub write_latch: bool,

    /// PPU 資料讀取緩衝區
    pub data_buffer: u8,

    // ===== 記憶體 =====
    /// 名稱表 VRAM（2KB，可能被鏡像映射到 4KB 位址空間）
    pub nametable: [u8; 2048],
    /// 調色盤 RAM（32 位元組）
    pub palette: [u8; 32],
    /// OAM（Object Attribute Memory，精靈屬性記憶體，256 位元組）
    pub oam: [u8; 256],
    /// 次要 OAM（掃描線精靈評估用，32 位元組 = 8 個精靈）
    pub secondary_oam: [u8; 32],

    // ===== 渲染狀態 =====
    /// 目前掃描線（0-261，其中 0-239 為可見掃描線）
    pub scanline: i16,
    /// 目前掃描線上的週期（0-340）
    pub cycle: u16,
    /// 幀完成旗標
    pub frame_complete: bool,
    /// 奇偶幀旗標（用於跳過第一個空閒週期）
    pub odd_frame: bool,

    // ===== 背景渲染管線 =====
    /// 名稱表位元組
    bg_next_tile_id: u8,
    /// 屬性表位元組
    bg_next_tile_attr: u8,
    /// 圖案低位元組
    bg_next_tile_lsb: u8,
    /// 圖案高位元組
    bg_next_tile_msb: u8,
    /// 背景移位暫存器（圖案低位元）
    bg_shifter_pattern_lo: u16,
    /// 背景移位暫存器（圖案高位元）
    bg_shifter_pattern_hi: u16,
    /// 背景移位暫存器（屬性低位元）
    bg_shifter_attr_lo: u16,
    /// 背景移位暫存器（屬性高位元）
    bg_shifter_attr_hi: u16,

    // ===== 精靈渲染 =====
    /// 當前掃描線的精靈數量
    sprite_count: u8,
    /// 精靈圖案移位暫存器（低位元）
    sprite_shifter_lo: [u8; 8],
    /// 精靈圖案移位暫存器（高位元）
    sprite_shifter_hi: [u8; 8],
    /// 精靈零是否在次要 OAM 中
    sprite_zero_hit_possible: bool,
    /// 精靈零是否正在渲染
    sprite_zero_being_rendered: bool,

    // ===== 中斷 =====
    /// NMI 觸發旗標
    pub nmi_occurred: bool,
    /// Scanline IRQ 旗標（用於 MMC3 等 Mapper）
    pub scanline_irq: bool,

    // ===== 畫面輸出 =====
    /// 幀緩衝區（RGBA 格式，256x240 像素）
    pub frame_buffer: Vec<u8>,

    // ===== 外部連接 =====
    /// CHR ROM/RAM 資料（由卡帶提供）
    chr_data: Vec<u8>,
    /// 是否使用 CHR RAM
    chr_ram: bool,
    /// 鏡像模式
    mirror_mode: MirrorMode,

    // ===== Mapper CHR Bank 映射 =====
    /// CHR bank 偏移量表（8 個 1KB bank）
    /// 每個元素代表 PPU 位址空間中 1KB 區域對應到 chr_data 中的起始偏移量
    /// $0000-$03FF -> chr_bank_offsets[0]
    /// $0400-$07FF -> chr_bank_offsets[1]
    /// ...以此類推
    chr_bank_offsets: [u32; 8],
    /// 是否使用 bank 映射（false 時直接存取，用於 CHR RAM 等簡單情況）
    chr_use_bank_mapping: bool,
    /// CHR bank 可寫入遮罩：每個位元代表一個 1KB bank 是否可寫入（用於混合 CHR ROM/RAM mapper 如 253）
    chr_writable_mask: u8,
}

/// 名稱表鏡像模式
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MirrorMode {
    Horizontal,       // 水平鏡像（垂直排列）
    Vertical,         // 垂直鏡像（水平排列）
    SingleScreenLow,  // 單屏低頁
    SingleScreenHigh, // 單屏高頁
    FourScreen,       // 四屏（需要額外 VRAM）
}

impl Ppu {
    /// 建立新的 PPU 實例
    pub fn new() -> Self {
        Ppu {
            ctrl: 0,
            mask: 0,
            status: 0,
            oam_addr: 0,
            v: 0,
            t: 0,
            fine_x: 0,
            write_latch: false,
            data_buffer: 0,
            nametable: [0; 2048],
            palette: [0; 32],
            oam: [0; 256],
            secondary_oam: [0xFF; 32],
            scanline: 0,
            cycle: 0,
            frame_complete: false,
            odd_frame: false,
            bg_next_tile_id: 0,
            bg_next_tile_attr: 0,
            bg_next_tile_lsb: 0,
            bg_next_tile_msb: 0,
            bg_shifter_pattern_lo: 0,
            bg_shifter_pattern_hi: 0,
            bg_shifter_attr_lo: 0,
            bg_shifter_attr_hi: 0,
            sprite_count: 0,
            sprite_shifter_lo: [0; 8],
            sprite_shifter_hi: [0; 8],
            sprite_zero_hit_possible: false,
            sprite_zero_being_rendered: false,
            nmi_occurred: false,
            scanline_irq: false,
            frame_buffer: vec![0; 256 * 240 * 4],
            chr_data: Vec::new(),
            chr_ram: false,
            mirror_mode: MirrorMode::Horizontal,
            chr_bank_offsets: [0, 0x400, 0x800, 0xC00, 0x1000, 0x1400, 0x1800, 0x1C00],
            chr_use_bank_mapping: false,
            chr_writable_mask: 0,
        }
    }

    /// 重置 PPU
    pub fn reset(&mut self) {
        self.ctrl = 0;
        self.mask = 0;
        self.status = 0;
        self.oam_addr = 0;
        self.v = 0;
        self.t = 0;
        self.fine_x = 0;
        self.write_latch = false;
        self.data_buffer = 0;
        self.scanline = -1;
        self.cycle = 0;
        self.frame_complete = false;
        self.odd_frame = false;
        self.nmi_occurred = false;
        self.scanline_irq = false;
        self.bg_next_tile_id = 0;
        self.bg_next_tile_attr = 0;
        self.bg_next_tile_lsb = 0;
        self.bg_next_tile_msb = 0;
        self.bg_shifter_pattern_lo = 0;
        self.bg_shifter_pattern_hi = 0;
        self.bg_shifter_attr_lo = 0;
        self.bg_shifter_attr_hi = 0;
        self.sprite_count = 0;
    }

    /// 設定 CHR 資料（由卡帶載入時呼叫）
    pub fn set_chr_data(&mut self, data: Vec<u8>, is_ram: bool) {
        self.chr_data = data;
        self.chr_ram = is_ram;
        // CHR RAM 使用直接存取，CHR ROM 使用 bank 映射
        if is_ram {
            self.chr_use_bank_mapping = false;
            self.chr_bank_offsets = [0, 0x400, 0x800, 0xC00, 0x1000, 0x1400, 0x1800, 0x1C00];
        } else {
            self.chr_use_bank_mapping = true;
        }
    }

    /// 更新 CHR bank 映射表（由 Emulator 在 Mapper 狀態變化時呼叫）
    /// offsets: 8 個 1KB bank 的起始位元組偏移量（在 chr_data 中的位置）
    pub fn set_chr_bank_offsets(&mut self, offsets: [u32; 8]) {
        self.chr_bank_offsets = offsets;
    }

    /// 設定 CHR bank 可寫入遮罩
    /// 每個位元代表一個 1KB bank 是否可寫入（用於混合 CHR ROM/RAM mapper 如 253）
    pub fn set_chr_writable_mask(&mut self, mask: u8) {
        self.chr_writable_mask = mask;
    }

    /// 設定鏡像模式
    pub fn set_mirror_mode(&mut self, mode: MirrorMode) {
        self.mirror_mode = mode;
    }

    // ===== 暫存器讀寫 =====

    /// CPU 讀取 PPU 暫存器（$2000-$2007 的映射）
    pub fn cpu_read(&mut self, addr: u16) -> u8 {
        match addr & 0x0007 {
            // $2002 - PPUSTATUS
            0x0002 => {
                // 讀取狀態時清除 VBlank 旗標和寫入鎖存器
                let data = (self.status & 0xE0) | (self.data_buffer & 0x1F);
                self.status &= !0x80; // 清除 VBlank
                self.write_latch = false;
                data
            }
            // $2004 - OAMDATA
            0x0004 => {
                self.oam[self.oam_addr as usize]
            }
            // $2007 - PPUDATA
            0x0007 => {
                let mut data = self.data_buffer;
                self.data_buffer = self.ppu_read(self.v);

                // 調色盤位址直接回傳（不經過緩衝區）
                if self.v >= 0x3F00 {
                    data = self.data_buffer;
                    // 但緩衝區需要填入鏡像的名稱表資料
                    self.data_buffer = self.ppu_read(self.v - 0x1000);
                }

                // 根據 PPUCTRL 第 2 位元決定 VRAM 遞增量
                self.v = self.v.wrapping_add(if self.ctrl & 0x04 != 0 { 32 } else { 1 });
                data
            }
            _ => 0,
        }
    }

    /// CPU 寫入 PPU 暫存器
    pub fn cpu_write(&mut self, addr: u16, data: u8) {
        match addr & 0x0007 {
            // $2000 - PPUCTRL
            0x0000 => {
                let prev_nmi = self.ctrl & 0x80 != 0;
                self.ctrl = data;
                // 更新 t 暫存器的名稱表選擇位元
                self.t = (self.t & 0xF3FF) | ((data as u16 & 0x03) << 10);
                // 如果 NMI 剛被啟用且 VBlank 中，立即觸發 NMI
                let new_nmi = data & 0x80 != 0;
                if !prev_nmi && new_nmi && (self.status & 0x80 != 0) {
                    self.nmi_occurred = true;
                }
            }
            // $2001 - PPUMASK
            0x0001 => {
                self.mask = data;
            }
            // $2003 - OAMADDR
            0x0003 => {
                self.oam_addr = data;
            }
            // $2004 - OAMDATA
            0x0004 => {
                self.oam[self.oam_addr as usize] = data;
                self.oam_addr = self.oam_addr.wrapping_add(1);
            }
            // $2005 - PPUSCROLL（雙次寫入）
            0x0005 => {
                if !self.write_latch {
                    // 第一次寫入：X 捲軸
                    self.fine_x = data & 0x07;
                    self.t = (self.t & 0xFFE0) | ((data as u16) >> 3);
                } else {
                    // 第二次寫入：Y 捲軸
                    self.t = (self.t & 0x8C1F)
                        | ((data as u16 & 0x07) << 12)
                        | ((data as u16 & 0xF8) << 2);
                }
                self.write_latch = !self.write_latch;
            }
            // $2006 - PPUADDR（雙次寫入）
            0x0006 => {
                if !self.write_latch {
                    // 第一次寫入：高位元組
                    self.t = (self.t & 0x00FF) | ((data as u16 & 0x3F) << 8);
                } else {
                    // 第二次寫入：低位元組
                    self.t = (self.t & 0xFF00) | (data as u16);
                    self.v = self.t; // 複製 t 到 v
                }
                self.write_latch = !self.write_latch;
            }
            // $2007 - PPUDATA
            0x0007 => {
                self.ppu_write(self.v, data);
                self.v = self.v.wrapping_add(if self.ctrl & 0x04 != 0 { 32 } else { 1 });
            }
            _ => {}
        }
    }

    // ===== PPU 內部記憶體讀寫 =====

    /// 讀取 PPU 位址空間
    fn ppu_read(&self, addr: u16) -> u8 {
        let addr = addr & 0x3FFF; // PPU 位址空間為 $0000-$3FFF

        if addr < 0x2000 {
            // $0000-$1FFF: 圖案表（CHR ROM/RAM）
            if self.chr_data.is_empty() {
                return 0;
            }
            if self.chr_use_bank_mapping {
                // 使用 Mapper 的 bank 映射
                let bank_index = (addr >> 10) as usize; // 0-7（每 1KB 一個 bank）
                let bank_offset = self.chr_bank_offsets[bank_index] as usize;
                let offset_in_bank = (addr & 0x03FF) as usize;
                let chr_index = (bank_offset + offset_in_bank) % self.chr_data.len();
                self.chr_data[chr_index]
            } else {
                // 直接存取（CHR RAM 或無 bank 切換）
                let index = addr as usize;
                if index < self.chr_data.len() {
                    self.chr_data[index]
                } else {
                    0
                }
            }
        } else if addr < 0x3F00 {
            // $2000-$3EFF: 名稱表（含鏡像）
            let mirrored = self.mirror_nametable_addr(addr);
            self.nametable[mirrored]
        } else {
            // $3F00-$3FFF: 調色盤
            let palette_addr = self.mirror_palette_addr(addr);
            self.palette[palette_addr]
        }
    }

    /// 寫入 PPU 位址空間
    fn ppu_write(&mut self, addr: u16, data: u8) {
        let addr = addr & 0x3FFF;

        if addr < 0x2000 {
            // 圖案表：CHR RAM 可寫入，或混合模式下特定 bank 可寫入
            let bank_index = (addr >> 10) as usize;
            let writable = self.chr_ram || (self.chr_writable_mask & (1 << bank_index)) != 0;
            if writable {
                if self.chr_use_bank_mapping {
                    let bank_index = (addr >> 10) as usize;
                    let bank_offset = self.chr_bank_offsets[bank_index] as usize;
                    let offset_in_bank = (addr & 0x03FF) as usize;
                    let chr_index = (bank_offset + offset_in_bank) % self.chr_data.len().max(1);
                    if chr_index < self.chr_data.len() {
                        self.chr_data[chr_index] = data;
                    }
                } else {
                    let index = addr as usize;
                    if index < self.chr_data.len() {
                        self.chr_data[index] = data;
                    }
                }
            }
        } else if addr < 0x3F00 {
            // 名稱表
            let mirrored = self.mirror_nametable_addr(addr);
            self.nametable[mirrored] = data;
        } else {
            // 調色盤
            let palette_addr = self.mirror_palette_addr(addr);
            self.palette[palette_addr] = data;
        }
    }

    /// 名稱表位址鏡像映射
    fn mirror_nametable_addr(&self, addr: u16) -> usize {
        let addr = (addr - 0x2000) & 0x0FFF; // 對齊到 $0000-$0FFF
        match self.mirror_mode {
            MirrorMode::Horizontal => {
                // A 和 B 各佔一半
                // $2000/$2400 -> 第一頁, $2800/$2C00 -> 第二頁
                match addr {
                    0x0000..=0x03FF => addr as usize,
                    0x0400..=0x07FF => (addr - 0x0400) as usize,
                    0x0800..=0x0BFF => (addr - 0x0800 + 0x0400) as usize,
                    _ => (addr - 0x0C00 + 0x0400) as usize,
                }
            }
            MirrorMode::Vertical => {
                // $2000/$2800 -> 第一頁, $2400/$2C00 -> 第二頁
                (addr & 0x07FF) as usize
            }
            MirrorMode::SingleScreenLow => {
                (addr & 0x03FF) as usize
            }
            MirrorMode::SingleScreenHigh => {
                (addr & 0x03FF) as usize + 0x0400
            }
            MirrorMode::FourScreen => {
                addr as usize // 需要 4KB VRAM
            }
        }
    }

    /// 調色盤位址鏡像映射
    fn mirror_palette_addr(&self, addr: u16) -> usize {
        let mut addr = (addr & 0x1F) as usize;
        // $3F10/$3F14/$3F18/$3F1C 鏡像到 $3F00/$3F04/$3F08/$3F0C
        if addr == 0x10 || addr == 0x14 || addr == 0x18 || addr == 0x1C {
            addr -= 0x10;
        }
        addr
    }

    // ===== 渲染狀態檢查 =====

    /// 檢查渲染是否啟用（背景或精靈任一啟用）
    #[inline]
    fn rendering_enabled(&self) -> bool {
        (self.mask & 0x18) != 0 // 位元 3（背景）或位元 4（精靈）
    }

    /// 背景渲染是否啟用
    #[inline]
    fn bg_enabled(&self) -> bool {
        self.mask & 0x08 != 0
    }

    /// 精靈渲染是否啟用
    #[inline]
    fn spr_enabled(&self) -> bool {
        self.mask & 0x10 != 0
    }

    /// 背景左 8 像素是否顯示
    #[inline]
    fn bg_left_enabled(&self) -> bool {
        self.mask & 0x02 != 0
    }

    /// 精靈左 8 像素是否顯示
    #[inline]
    fn spr_left_enabled(&self) -> bool {
        self.mask & 0x04 != 0
    }

    // ===== 主要時鐘方法 =====

    /// PPU 時鐘週期
    /// 每個 PPU 週期處理一個像素的渲染
    pub fn clock(&mut self) {
        // -1（預渲染掃描線）到 239（最後一條可見掃描線）
        if self.scanline >= -1 && self.scanline < 240 {
            // 可見掃描線和預渲染掃描線的處理

            // 預渲染掃描線 (-1) 的特殊處理
            if self.scanline == -1 && self.cycle == 1 {
                // 清除 VBlank、Sprite 0 Hit、Sprite Overflow 旗標
                self.status &= !0xE0;
                // 清除精靈移位暫存器
                self.sprite_shifter_lo = [0; 8];
                self.sprite_shifter_hi = [0; 8];
            }

            // 奇數幀跳過 (0,0) 週期
            if self.scanline == 0 && self.cycle == 0 && self.odd_frame && self.rendering_enabled() {
                self.cycle = 1;
            }

            // 背景渲染管線
            if (self.cycle >= 2 && self.cycle < 258) || (self.cycle >= 321 && self.cycle < 338) {
                self.update_shifters();

                // 每 8 個週期載入一個圖磚的資料
                match (self.cycle - 1) % 8 {
                    0 => {
                        // 將新的圖磚資料載入移位暫存器
                        self.load_bg_shifters();
                        // 從名稱表讀取圖磚 ID
                        self.bg_next_tile_id = self.ppu_read(0x2000 | (self.v & 0x0FFF));
                    }
                    2 => {
                        // 讀取屬性表
                        let attr_addr = 0x23C0
                            | (self.v & 0x0C00)
                            | ((self.v >> 4) & 0x38)
                            | ((self.v >> 2) & 0x07);
                        self.bg_next_tile_attr = self.ppu_read(attr_addr);

                        // 根據圖磚在 2x2 方塊中的位置選擇正確的 2 位元調色盤
                        if self.v & 0x40 != 0 {
                            self.bg_next_tile_attr >>= 4;
                        }
                        if self.v & 0x02 != 0 {
                            self.bg_next_tile_attr >>= 2;
                        }
                        self.bg_next_tile_attr &= 0x03;
                    }
                    4 => {
                        // 讀取圖案表低位元組
                        let bg_pattern_addr = ((self.ctrl as u16 & 0x10) << 8)
                            + (self.bg_next_tile_id as u16 * 16)
                            + ((self.v >> 12) & 0x07);
                        self.bg_next_tile_lsb = self.ppu_read(bg_pattern_addr);
                    }
                    6 => {
                        // 讀取圖案表高位元組（偏移 8 位元組）
                        let bg_pattern_addr = ((self.ctrl as u16 & 0x10) << 8)
                            + (self.bg_next_tile_id as u16 * 16)
                            + ((self.v >> 12) & 0x07)
                            + 8;
                        self.bg_next_tile_msb = self.ppu_read(bg_pattern_addr);
                    }
                    7 => {
                        // 水平位置遞增
                        self.increment_scroll_x();
                    }
                    _ => {}
                }
            }

            // 在第 256 週期，垂直位置遞增
            if self.cycle == 256 {
                self.increment_scroll_y();
            }

            // 在第 257 週期，複製水平位置
            if self.cycle == 257 {
                self.load_bg_shifters();
                self.transfer_address_x();
            }

            // 在預渲染掃描線的第 280-304 週期，複製垂直位置
            if self.scanline == -1 && self.cycle >= 280 && self.cycle < 305 {
                self.transfer_address_y();
            }

            // 超出畫面的名稱表讀取（模擬真實硬體行為）
            if self.cycle == 338 || self.cycle == 340 {
                self.bg_next_tile_id = self.ppu_read(0x2000 | (self.v & 0x0FFF));
            }

            // ===== 精靈評估 =====
            if self.cycle == 257 && self.scanline >= 0 {
                self.evaluate_sprites();
            }

            // 在第 340 週期載入精靈圖案
            if self.cycle == 340 && self.scanline >= 0 {
                self.load_sprite_patterns();
            }
        }

        // ===== VBlank 期間 =====
        if self.scanline == 241 && self.cycle == 1 {
            // 設定 VBlank 旗標
            self.status |= 0x80;
            // 如果 NMI 使能，觸發 NMI
            if self.ctrl & 0x80 != 0 {
                self.nmi_occurred = true;
            }
        }

        // ===== 輸出像素 =====
        if self.scanline >= 0 && self.scanline < 240 && self.cycle >= 1 && self.cycle <= 256 {
            self.render_pixel();
        }

        // ===== Scanline IRQ 計數器（用於 MMC3） =====
        if self.rendering_enabled() && self.cycle == 260 && self.scanline < 240 {
            self.scanline_irq = true;
        }

        // ===== 推進時序 =====
        self.cycle += 1;
        if self.cycle > 340 {
            self.cycle = 0;
            self.scanline += 1;
            if self.scanline > 260 {
                self.scanline = -1;
                self.frame_complete = true;
                self.odd_frame = !self.odd_frame;
            }
        }
    }

    // ===== 捲軸操作（Loopy 實作） =====

    /// 水平位置遞增
    fn increment_scroll_x(&mut self) {
        if !self.rendering_enabled() { return; }
        // 當 coarse X == 31 時，換到下一個名稱表
        if (self.v & 0x001F) == 31 {
            self.v &= !0x001F; // coarse X = 0
            self.v ^= 0x0400;  // 切換水平名稱表
        } else {
            self.v += 1; // coarse X + 1
        }
    }

    /// 垂直位置遞增
    fn increment_scroll_y(&mut self) {
        if !self.rendering_enabled() { return; }
        // fine Y < 7，直接遞增
        if (self.v & 0x7000) != 0x7000 {
            self.v += 0x1000;
        } else {
            self.v &= !0x7000; // fine Y = 0
            let mut y = (self.v & 0x03E0) >> 5; // coarse Y
            if y == 29 {
                y = 0;
                self.v ^= 0x0800; // 切換垂直名稱表
            } else if y == 31 {
                y = 0; // 不切換名稱表
            } else {
                y += 1;
            }
            self.v = (self.v & !0x03E0) | (y << 5);
        }
    }

    /// 複製水平位置（t -> v）
    fn transfer_address_x(&mut self) {
        if !self.rendering_enabled() { return; }
        self.v = (self.v & !0x041F) | (self.t & 0x041F);
    }

    /// 複製垂直位置（t -> v）
    fn transfer_address_y(&mut self) {
        if !self.rendering_enabled() { return; }
        self.v = (self.v & !0x7BE0) | (self.t & 0x7BE0);
    }

    // ===== 移位暫存器操作 =====

    /// 更新背景移位暫存器（每個週期左移一位）
    fn update_shifters(&mut self) {
        if self.bg_enabled() {
            self.bg_shifter_pattern_lo <<= 1;
            self.bg_shifter_pattern_hi <<= 1;
            self.bg_shifter_attr_lo <<= 1;
            self.bg_shifter_attr_hi <<= 1;
        }

        // 精靈移位暫存器也需要更新
        if self.spr_enabled() && self.cycle >= 1 && self.cycle < 258 {
            for i in 0..self.sprite_count as usize {
                let x = self.secondary_oam[i * 4 + 3];
                if x > 0 {
                    // 精靈尚未到達，遞減 X 計數器
                    self.secondary_oam[i * 4 + 3] = x - 1;
                } else {
                    // 精靈正在渲染，左移圖案
                    self.sprite_shifter_lo[i] <<= 1;
                    self.sprite_shifter_hi[i] <<= 1;
                }
            }
        }
    }

    /// 將新的圖磚資料載入背景移位暫存器的低 8 位元
    fn load_bg_shifters(&mut self) {
        self.bg_shifter_pattern_lo = (self.bg_shifter_pattern_lo & 0xFF00)
            | self.bg_next_tile_lsb as u16;
        self.bg_shifter_pattern_hi = (self.bg_shifter_pattern_hi & 0xFF00)
            | self.bg_next_tile_msb as u16;

        // 屬性位元擴展到 8 位元
        self.bg_shifter_attr_lo = (self.bg_shifter_attr_lo & 0xFF00)
            | (if self.bg_next_tile_attr & 0x01 != 0 { 0xFF } else { 0x00 });
        self.bg_shifter_attr_hi = (self.bg_shifter_attr_hi & 0xFF00)
            | (if self.bg_next_tile_attr & 0x02 != 0 { 0xFF } else { 0x00 });
    }

    // ===== 精靈處理 =====

    /// 評估精靈：找出當前掃描線上的精靈
    fn evaluate_sprites(&mut self) {
        self.secondary_oam = [0xFF; 32];
        self.sprite_count = 0;
        self.sprite_zero_hit_possible = false;

        let sprite_height: i16 = if self.ctrl & 0x20 != 0 { 16 } else { 8 };

        for i in 0..64 {
            let y = self.oam[i * 4] as i16;
            let diff = self.scanline - y;

            if diff >= 0 && diff < sprite_height {
                if self.sprite_count < 8 {
                    if i == 0 {
                        self.sprite_zero_hit_possible = true;
                    }

                    // 複製精靈資料到次要 OAM
                    let offset = self.sprite_count as usize * 4;
                    self.secondary_oam[offset] = self.oam[i * 4];
                    self.secondary_oam[offset + 1] = self.oam[i * 4 + 1];
                    self.secondary_oam[offset + 2] = self.oam[i * 4 + 2];
                    self.secondary_oam[offset + 3] = self.oam[i * 4 + 3];

                    self.sprite_count += 1;
                } else {
                    // 第 9 個命中精靈 → 設定精靈溢出旗標
                    self.status |= 0x20; // Sprite Overflow
                    break;
                }
            }
        }
    }

    /// 載入精靈圖案到移位暫存器
    fn load_sprite_patterns(&mut self) {
        for i in 0..self.sprite_count as usize {
            let sprite_y = self.secondary_oam[i * 4] as i16;
            let tile_id = self.secondary_oam[i * 4 + 1];
            let attributes = self.secondary_oam[i * 4 + 2];
            let flip_v = attributes & 0x80 != 0;

            let mut row = self.scanline - sprite_y;

            let pattern_addr = if self.ctrl & 0x20 != 0 {
                // 8x16 精靈模式
                if flip_v {
                    row = 15 - row;
                }
                let table = (tile_id as u16 & 0x01) * 0x1000;
                let tile = tile_id as u16 & 0xFE;
                if row >= 8 {
                    table + (tile + 1) * 16 + (row as u16 - 8)
                } else {
                    table + tile * 16 + row as u16
                }
            } else {
                // 8x8 精靈模式
                if flip_v {
                    row = 7 - row;
                }
                let table = ((self.ctrl as u16 >> 3) & 0x01) * 0x1000;
                table + tile_id as u16 * 16 + row as u16
            };

            let mut lo = self.ppu_read(pattern_addr);
            let mut hi = self.ppu_read(pattern_addr + 8);

            // 水平翻轉
            if attributes & 0x40 != 0 {
                lo = Self::reverse_bits(lo);
                hi = Self::reverse_bits(hi);
            }

            self.sprite_shifter_lo[i] = lo;
            self.sprite_shifter_hi[i] = hi;
        }
    }

    /// 位元翻轉（用於精靈水平翻轉）
    #[inline]
    fn reverse_bits(mut b: u8) -> u8 {
        b = (b & 0xF0) >> 4 | (b & 0x0F) << 4;
        b = (b & 0xCC) >> 2 | (b & 0x33) << 2;
        b = (b & 0xAA) >> 1 | (b & 0x55) << 1;
        b
    }

    // ===== 像素渲染 =====

    /// 渲染當前週期的像素
    fn render_pixel(&mut self) {
        let x = (self.cycle - 1) as usize;
        let y = self.scanline as usize;

        // 計算背景像素
        let mut bg_pixel: u8 = 0;
        let mut bg_palette: u8 = 0;

        if self.bg_enabled() {
            if self.bg_left_enabled() || x >= 8 {
                let mux = 0x8000 >> self.fine_x;

                let p0 = if self.bg_shifter_pattern_lo & mux != 0 { 1 } else { 0 };
                let p1 = if self.bg_shifter_pattern_hi & mux != 0 { 1 } else { 0 };
                bg_pixel = (p1 << 1) | p0;

                let a0 = if self.bg_shifter_attr_lo & mux != 0 { 1 } else { 0 };
                let a1 = if self.bg_shifter_attr_hi & mux != 0 { 1 } else { 0 };
                bg_palette = (a1 << 1) | a0;
            }
        }

        // 計算精靈像素
        let mut spr_pixel: u8 = 0;
        let mut spr_palette: u8 = 0;
        let mut spr_priority: bool = false; // false = 前景
        self.sprite_zero_being_rendered = false;

        if self.spr_enabled() {
            if self.spr_left_enabled() || x >= 8 {
                for i in 0..self.sprite_count as usize {
                    if self.secondary_oam[i * 4 + 3] == 0 {
                        // 精靈正在當前像素位置
                        let p0 = if self.sprite_shifter_lo[i] & 0x80 != 0 { 1 } else { 0 };
                        let p1 = if self.sprite_shifter_hi[i] & 0x80 != 0 { 1 } else { 0 };
                        spr_pixel = (p1 << 1) | p0;
                        spr_palette = (self.secondary_oam[i * 4 + 2] & 0x03) + 4;
                        spr_priority = self.secondary_oam[i * 4 + 2] & 0x20 != 0;

                        if spr_pixel != 0 {
                            if i == 0 {
                                self.sprite_zero_being_rendered = true;
                            }
                            break;
                        }
                    }
                }
            }
        }

        // 像素優先級決定
        let (final_pixel, final_palette) = match (bg_pixel, spr_pixel) {
            (0, 0) => (0, 0),           // 都透明 -> 背景色
            (0, _) => (spr_pixel, spr_palette), // 背景透明 -> 精靈
            (_, 0) => (bg_pixel, bg_palette),   // 精靈透明 -> 背景
            (_, _) => {
                // 都不透明 -> 檢查精靈零碰撞和優先級
                // Sprite 0 Hit 判斷
                if self.sprite_zero_hit_possible && self.sprite_zero_being_rendered {
                    if self.bg_enabled() && self.spr_enabled() {
                        // 左 8 像素裁切
                        let left_clip = !(self.bg_left_enabled() && self.spr_left_enabled());
                        if !left_clip || x >= 8 {
                            if x < 255 {
                                self.status |= 0x40; // Sprite 0 Hit
                            }
                        }
                    }
                }

                if !spr_priority {
                    (spr_pixel, spr_palette)  // 精靈在前
                } else {
                    (bg_pixel, bg_palette)    // 背景在前
                }
            }
        };

        // 從調色盤讀取顏色並寫入幀緩衝區
        let color_index = self.ppu_read(0x3F00 + (final_palette as u16 * 4) + final_pixel as u16);
        let (r, g, b) = PALETTE[(color_index & 0x3F) as usize];

        let pixel_offset = (y * 256 + x) * 4;
        if pixel_offset + 3 < self.frame_buffer.len() {
            self.frame_buffer[pixel_offset] = r;
            self.frame_buffer[pixel_offset + 1] = g;
            self.frame_buffer[pixel_offset + 2] = b;
            self.frame_buffer[pixel_offset + 3] = 255; // Alpha
        }
    }

    /// 檢查並清除 NMI 旗標
    pub fn check_nmi(&mut self) -> bool {
        if self.nmi_occurred {
            self.nmi_occurred = false;
            true
        } else {
            false
        }
    }

    /// 檢查並清除 Scanline IRQ 旗標
    pub fn check_scanline_irq(&mut self) -> bool {
        if self.scanline_irq {
            self.scanline_irq = false;
            true
        } else {
            false
        }
    }
}
