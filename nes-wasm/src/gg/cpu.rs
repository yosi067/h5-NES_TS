// ============================================================
// Zilog Z80 CPU — 暫存器與旗標
// ============================================================
// 完整 Z80 暫存器組：主暫存器 + 影子暫存器 + 索引暫存器
// 時脈：3.579545 MHz (NTSC) / 3.546895 MHz (PAL)
// ============================================================

/// Z80 旗標位元
pub const FLAG_C: u8 = 0x01;  // Carry
pub const FLAG_N: u8 = 0x02;  // Subtract
pub const FLAG_PV: u8 = 0x04; // Parity/Overflow
pub const FLAG_H: u8 = 0x10;  // Half-carry
pub const FLAG_Z: u8 = 0x40;  // Zero
pub const FLAG_S: u8 = 0x80;  // Sign

/// 未記錄旗標 (bit 3 & bit 5)
pub const FLAG_3: u8 = 0x08;
pub const FLAG_5: u8 = 0x20;

pub struct Cpu {
    // 主暫存器
    pub a: u8, pub f: u8,
    pub b: u8, pub c: u8,
    pub d: u8, pub e: u8,
    pub h: u8, pub l: u8,

    // 影子暫存器 (EX AF,AF' / EXX)
    pub a_: u8, pub f_: u8,
    pub b_: u8, pub c_: u8,
    pub d_: u8, pub e_: u8,
    pub h_: u8, pub l_: u8,

    // 索引暫存器
    pub ix: u16,
    pub iy: u16,

    // 特殊暫存器
    pub sp: u16,
    pub pc: u16,
    pub i: u8,   // Interrupt vector
    pub r: u8,   // Memory refresh

    // 中斷狀態
    pub iff1: bool,
    pub iff2: bool,
    pub im: u8,     // Interrupt mode (0, 1, 2)

    // CPU 狀態
    pub halted: bool,
    pub ei_pending: bool, // EI 延遲一個指令
    pub cycles: u32,      // 本次指令消耗的 T-cycles
}

impl Cpu {
    pub fn new() -> Self {
        Cpu {
            a: 0, f: 0, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0,
            a_: 0, f_: 0, b_: 0, c_: 0, d_: 0, e_: 0, h_: 0, l_: 0,
            ix: 0, iy: 0,
            sp: 0xDFF0, pc: 0x0000,
            i: 0, r: 0,
            iff1: false, iff2: false, im: 1,
            halted: false, ei_pending: false, cycles: 0,
        }
    }

    // === 16-bit 暫存器對存取 ===
    pub fn af(&self) -> u16 { (self.a as u16) << 8 | self.f as u16 }
    pub fn bc(&self) -> u16 { (self.b as u16) << 8 | self.c as u16 }
    pub fn de(&self) -> u16 { (self.d as u16) << 8 | self.e as u16 }
    pub fn hl(&self) -> u16 { (self.h as u16) << 8 | self.l as u16 }

    pub fn set_af(&mut self, v: u16) { self.a = (v >> 8) as u8; self.f = v as u8; }
    pub fn set_bc(&mut self, v: u16) { self.b = (v >> 8) as u8; self.c = v as u8; }
    pub fn set_de(&mut self, v: u16) { self.d = (v >> 8) as u8; self.e = v as u8; }
    pub fn set_hl(&mut self, v: u16) { self.h = (v >> 8) as u8; self.l = v as u8; }

    // === 旗標操作 ===
    pub fn flag(&self, mask: u8) -> bool { self.f & mask != 0 }
    pub fn set_flag(&mut self, mask: u8, val: bool) {
        if val { self.f |= mask; } else { self.f &= !mask; }
    }

    /// 設定符號/零值/未記錄旗標 (bit 3, 5)
    pub fn set_szp_flags(&mut self, val: u8) {
        self.f = (self.f & !(FLAG_S | FLAG_Z | FLAG_PV | FLAG_3 | FLAG_5))
            | (val & (FLAG_S | FLAG_3 | FLAG_5))
            | if val == 0 { FLAG_Z } else { 0 }
            | if parity(val) { FLAG_PV } else { 0 };
    }

    /// 設定未記錄旗標 bit 3 & 5 based on value
    pub fn set_undoc(&mut self, val: u8) {
        self.f = (self.f & !(FLAG_3 | FLAG_5)) | (val & (FLAG_3 | FLAG_5));
    }

    // === 影子暫存器交換 ===
    pub fn ex_af(&mut self) {
        std::mem::swap(&mut self.a, &mut self.a_);
        std::mem::swap(&mut self.f, &mut self.f_);
    }

    pub fn exx(&mut self) {
        std::mem::swap(&mut self.b, &mut self.b_);
        std::mem::swap(&mut self.c, &mut self.c_);
        std::mem::swap(&mut self.d, &mut self.d_);
        std::mem::swap(&mut self.e, &mut self.e_);
        std::mem::swap(&mut self.h, &mut self.h_);
        std::mem::swap(&mut self.l, &mut self.l_);
    }

    /// 遞增 R 暫存器 (只有低 7 位遞增)
    pub fn inc_r(&mut self) {
        self.r = (self.r & 0x80) | ((self.r.wrapping_add(1)) & 0x7F);
    }
}

/// 計算偶同位 (even parity) — 1-bits 為偶數時回傳 true
pub fn parity(val: u8) -> bool {
    val.count_ones() % 2 == 0
}
