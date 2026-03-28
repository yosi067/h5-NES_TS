// ============================================================
// SNES CPU - Ricoh 5A22 (65C816) 暫存器狀態
// ============================================================
// 16-bit 延伸版 6502，支援：
// - 8/16-bit 可切換累加器與索引暫存器
// - 24-bit 定址（Bank:Address）
// - Emulation 模式 (6502 相容) 與 Native 模式
// - 256 個 Opcodes
// ============================================================

/// 65816 處理器狀態旗標 (P 暫存器)
pub mod flags {
    pub const CARRY: u8     = 1 << 0; // C - 進位
    pub const ZERO: u8      = 1 << 1; // Z - 零
    pub const IRQ_DIS: u8   = 1 << 2; // I - IRQ 禁止
    pub const DECIMAL: u8   = 1 << 3; // D - 十進制模式
    pub const INDEX8: u8    = 1 << 4; // X - 索引 8-bit (Native), B flag (Emu)
    pub const MEM8: u8      = 1 << 5; // M - 記憶體/累加器 8-bit (Native)
    pub const OVERFLOW: u8  = 1 << 6; // V - 溢位
    pub const NEGATIVE: u8  = 1 << 7; // N - 負數
}

/// 65C816 CPU 暫存器
pub struct Cpu65816 {
    /// 累加器 (16-bit, 但可用 8-bit 模式)
    pub a: u16,
    /// X 索引暫存器
    pub x: u16,
    /// Y 索引暫存器
    pub y: u16,
    /// 堆疊指標 (16-bit in native, 合法範圍 $0100-$01FF in emu)
    pub sp: u16,
    /// 直接頁面暫存器
    pub dp: u16,
    /// 資料庫暫存器 (8-bit)
    pub db: u8,
    /// 程式庫暫存器 (8-bit)
    pub pb: u8,
    /// 狀態暫存器
    pub p: u8,
    /// 程式計數器 (16-bit)
    pub pc: u16,
    /// 模擬模式旗標 (true = 6502 相容模式)
    pub emulation: bool,

    /// 當前指令剩餘的 Master Clock 週期
    pub cycles: u32,
    /// NMI 等待中
    pub nmi_pending: bool,
    /// IRQ 等待中
    pub irq_pending: bool,
    /// WAI (等待中斷)
    pub waiting: bool,
    /// STP (停止)
    pub stopped: bool,
}

impl Cpu65816 {
    pub fn new() -> Self {
        Cpu65816 {
            a: 0,
            x: 0,
            y: 0,
            sp: 0x01FF, // Emulation mode 預設
            dp: 0,
            db: 0,
            pb: 0,
            p: flags::MEM8 | flags::INDEX8 | flags::IRQ_DIS,
            pc: 0,
            emulation: true,
            cycles: 0,
            nmi_pending: false,
            irq_pending: false,
            waiting: false,
            stopped: false,
        }
    }

    // === 旗標便捷方法 ===

    #[inline]
    pub fn flag_c(&self) -> bool { self.p & flags::CARRY != 0 }
    #[inline]
    pub fn flag_z(&self) -> bool { self.p & flags::ZERO != 0 }
    #[inline]
    pub fn flag_i(&self) -> bool { self.p & flags::IRQ_DIS != 0 }
    #[inline]
    pub fn flag_d(&self) -> bool { self.p & flags::DECIMAL != 0 }
    #[inline]
    pub fn flag_x(&self) -> bool { self.p & flags::INDEX8 != 0 }
    #[inline]
    pub fn flag_m(&self) -> bool { self.p & flags::MEM8 != 0 }
    #[inline]
    pub fn flag_v(&self) -> bool { self.p & flags::OVERFLOW != 0 }
    #[inline]
    pub fn flag_n(&self) -> bool { self.p & flags::NEGATIVE != 0 }

    #[inline]
    pub fn set_flag(&mut self, flag: u8, val: bool) {
        if val { self.p |= flag; } else { self.p &= !flag; }
    }

    /// 累加器有效值（8-bit 或 16-bit）
    #[inline]
    pub fn a_val(&self) -> u16 {
        if self.flag_m() { self.a & 0xFF } else { self.a }
    }

    /// 8-bit 模式下的 A 低位元
    #[inline]
    pub fn al(&self) -> u8 { self.a as u8 }

    /// 8-bit 模式下的 A 高位元
    #[inline]
    pub fn ah(&self) -> u8 { (self.a >> 8) as u8 }

    /// 設定累加器（保持未使用的高位元）
    #[inline]
    pub fn set_a(&mut self, val: u16) {
        if self.flag_m() {
            self.a = (self.a & 0xFF00) | (val & 0xFF);
        } else {
            self.a = val;
        }
    }

    /// X 有效值
    #[inline]
    pub fn x_val(&self) -> u16 {
        if self.flag_x() { self.x & 0xFF } else { self.x }
    }

    /// Y 有效值
    #[inline]
    pub fn y_val(&self) -> u16 {
        if self.flag_x() { self.y & 0xFF } else { self.y }
    }

    /// 設定 X（8-bit 模式只影響低位元）
    #[inline]
    pub fn set_x(&mut self, val: u16) {
        if self.flag_x() {
            self.x = val & 0xFF;
        } else {
            self.x = val;
        }
    }

    /// 設定 Y（8-bit 模式只影響低位元）
    #[inline]
    pub fn set_y(&mut self, val: u16) {
        if self.flag_x() {
            self.y = val & 0xFF;
        } else {
            self.y = val;
        }
    }

    /// 設定 NZ 旗標（根據 M flag 寬度）
    #[inline]
    pub fn set_nz_m(&mut self, val: u16) {
        if self.flag_m() {
            self.set_flag(flags::ZERO, (val & 0xFF) == 0);
            self.set_flag(flags::NEGATIVE, val & 0x80 != 0);
        } else {
            self.set_flag(flags::ZERO, val == 0);
            self.set_flag(flags::NEGATIVE, val & 0x8000 != 0);
        }
    }

    /// 設定 NZ 旗標（根據 X flag 寬度）
    #[inline]
    pub fn set_nz_x(&mut self, val: u16) {
        if self.flag_x() {
            self.set_flag(flags::ZERO, (val & 0xFF) == 0);
            self.set_flag(flags::NEGATIVE, val & 0x80 != 0);
        } else {
            self.set_flag(flags::ZERO, val == 0);
            self.set_flag(flags::NEGATIVE, val & 0x8000 != 0);
        }
    }

    /// 更新 Emulation / Native 模式下的暫存器限制
    pub fn update_mode(&mut self) {
        if self.emulation {
            // Emulation mode: M=1, X=1 (強制 8-bit)
            self.p |= flags::MEM8 | flags::INDEX8;
            // SP 限制在 $0100-$01FF
            self.sp = 0x0100 | (self.sp & 0xFF);
            // Index regs 限制在 8-bit
            self.x &= 0xFF;
            self.y &= 0xFF;
        } else {
            // Native mode: 切換到 X=1 時清除高位元
            if self.flag_x() {
                self.x &= 0xFF;
                self.y &= 0xFF;
            }
        }
    }
}
