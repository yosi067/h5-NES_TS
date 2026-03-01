// ============================================================
// Game Boy CPU - Sharp LR35902 暫存器定義
// ============================================================
// 混合 Z80 與 Intel 8080 特性的 8 位元處理器
// 時脈：4.194304 MHz（T-cycle），1.048576 MHz（M-cycle）
// ============================================================

/// CPU 暫存器結構
pub struct Cpu {
    pub a: u8,
    pub f: u8,
    pub b: u8,
    pub c: u8,
    pub d: u8,
    pub e: u8,
    pub h: u8,
    pub l: u8,
    pub sp: u16,
    pub pc: u16,
    /// 中斷主使能旗標 (Interrupt Master Enable)
    pub ime: bool,
    /// EI 延遲啟用（EI 指令在下一條指令後才生效）
    pub ei_pending: bool,
    /// CPU 停止 (HALT)
    pub halted: bool,
    /// HALT Bug：IME=0 且有 pending interrupt 時，PC 不遞增
    pub halt_bug: bool,
}

impl Cpu {
    /// 建立新的 CPU 實例（跳過 Boot ROM 的初始狀態）
    pub fn new() -> Self {
        Cpu {
            a: 0x01, f: 0xB0,
            b: 0x00, c: 0x13,
            d: 0x00, e: 0xD8,
            h: 0x01, l: 0x4D,
            sp: 0xFFFE,
            pc: 0x0100,
            ime: false,
            ei_pending: false,
            halted: false,
            halt_bug: false,
        }
    }

    // ===== 16 位元暫存器對 =====

    #[inline] pub fn af(&self) -> u16 { (self.a as u16) << 8 | self.f as u16 }
    #[inline] pub fn bc(&self) -> u16 { (self.b as u16) << 8 | self.c as u16 }
    #[inline] pub fn de(&self) -> u16 { (self.d as u16) << 8 | self.e as u16 }
    #[inline] pub fn hl(&self) -> u16 { (self.h as u16) << 8 | self.l as u16 }

    #[inline] pub fn set_af(&mut self, v: u16) { self.a = (v >> 8) as u8; self.f = (v & 0xF0) as u8; }
    #[inline] pub fn set_bc(&mut self, v: u16) { self.b = (v >> 8) as u8; self.c = v as u8; }
    #[inline] pub fn set_de(&mut self, v: u16) { self.d = (v >> 8) as u8; self.e = v as u8; }
    #[inline] pub fn set_hl(&mut self, v: u16) { self.h = (v >> 8) as u8; self.l = v as u8; }

    // ===== 旗標操作 (F 暫存器 bit 7-4: Z N H C) =====

    #[inline] pub fn flag_z(&self) -> bool { self.f & 0x80 != 0 }
    #[inline] pub fn flag_n(&self) -> bool { self.f & 0x40 != 0 }
    #[inline] pub fn flag_h(&self) -> bool { self.f & 0x20 != 0 }
    #[inline] pub fn flag_c(&self) -> bool { self.f & 0x10 != 0 }

    #[inline] pub fn set_flag_z(&mut self, v: bool) { if v { self.f |= 0x80 } else { self.f &= !0x80 } }
    #[inline] pub fn set_flag_n(&mut self, v: bool) { if v { self.f |= 0x40 } else { self.f &= !0x40 } }
    #[inline] pub fn set_flag_h(&mut self, v: bool) { if v { self.f |= 0x20 } else { self.f &= !0x20 } }
    #[inline] pub fn set_flag_c(&mut self, v: bool) { if v { self.f |= 0x10 } else { self.f &= !0x10 } }
}
