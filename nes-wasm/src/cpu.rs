// ============================================================
// NES CPU 模擬 - MOS 6502 處理器
// ============================================================
// 完整實作 NMOS 6502 CPU，包含：
// - 所有 56 條合法指令
// - 13 種定址模式
// - 中斷處理（NMI、IRQ、BRK）
// - 精確的週期計數（含跨頁額外週期）
//
// 參考資料：
// - http://www.obelisk.me.uk/6502/reference.html
// - https://www.nesdev.org/wiki/CPU
// - https://www.masswerk.at/6502/6502_instruction_set.html
// ============================================================

/// CPU 狀態旗標位元定義
/// 狀態暫存器（P）的各個位元：
/// 7  bit  0
/// ---- ----
/// NVss DIZC
/// |||| ||||
/// |||| |||+- Carry（進位）
/// |||| ||+-- Zero（零）
/// |||| |+--- Interrupt Disable（中斷禁止）
/// |||| +---- Decimal（十進制模式，NES 不使用）
/// |||+------ Break command（BRK 指令標記）
/// ||+------- 未使用，永遠為 1
/// |+-------- Overflow（溢位）
/// +--------- Negative（負數）
pub mod flags {
    pub const CARRY: u8 = 1 << 0;       // 進位旗標
    pub const ZERO: u8 = 1 << 1;        // 零旗標
    pub const IRQ_DISABLE: u8 = 1 << 2; // 中斷禁止旗標
    pub const DECIMAL: u8 = 1 << 3;     // 十進制模式（NES 不使用）
    pub const BREAK: u8 = 1 << 4;       // BRK 指令標記
    pub const UNUSED: u8 = 1 << 5;      // 未使用位元，永遠為 1
    pub const OVERFLOW: u8 = 1 << 6;    // 溢位旗標
    pub const NEGATIVE: u8 = 1 << 7;    // 負數旗標
}

/// 定址模式列舉
/// 6502 CPU 支援 13 種不同的定址模式
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum AddressingMode {
    Implicit,       // 隱式：無運算元（如 CLC、RTS）
    Accumulator,    // 累加器：操作 A 暫存器（如 ASL A）
    Immediate,      // 立即值：運算元直接跟在指令後（如 LDA #$10）
    ZeroPage,       // 零頁：8 位元位址，存取 $0000-$00FF（如 LDA $10）
    ZeroPageX,      // 零頁 X 索引：零頁位址 + X（如 LDA $10,X）
    ZeroPageY,      // 零頁 Y 索引：零頁位址 + Y（如 LDX $10,Y）
    Relative,       // 相對：8 位元有號偏移，用於分支指令（如 BEQ $10）
    Absolute,       // 絕對：16 位元完整位址（如 LDA $1234）
    AbsoluteX,      // 絕對 X 索引：16 位元位址 + X（如 LDA $1234,X）
    AbsoluteY,      // 絕對 Y 索引：16 位元位址 + Y（如 LDA $1234,Y）
    Indirect,       // 間接：16 位元指標位址（僅 JMP 使用）
    IndirectX,      // (間接,X)：先加 X 再取間接位址（如 LDA ($10,X)）
    IndirectY,      // (間接),Y：先取間接位址再加 Y（如 LDA ($10),Y）
}

/// 6502 CPU 結構體
pub struct Cpu {
    // ===== 暫存器 =====
    /// 累加器（Accumulator）
    pub a: u8,
    /// X 索引暫存器
    pub x: u8,
    /// Y 索引暫存器
    pub y: u8,
    /// 堆疊指標（Stack Pointer），指向 $0100-$01FF
    pub sp: u8,
    /// 程式計數器（Program Counter）
    pub pc: u16,
    /// 狀態暫存器（Processor Status）
    pub status: u8,

    // ===== 週期管理 =====
    /// 目前指令剩餘週期數
    pub cycles: u8,
    /// 總週期計數
    pub total_cycles: u64,

    // ===== 中斷旗標 =====
    /// NMI 中斷待處理
    pub nmi_pending: bool,
    /// IRQ 中斷待處理
    pub irq_pending: bool,
}

impl Cpu {
    /// 建立新的 CPU 實例（初始化所有暫存器）
    pub fn new() -> Self {
        Cpu {
            a: 0,
            x: 0,
            y: 0,
            sp: 0xFD,                              // 開機時堆疊指標初始化為 $FD
            pc: 0,
            status: flags::UNUSED | flags::IRQ_DISABLE, // 初始狀態：未使用位元和 IRQ 禁止
            cycles: 0,
            total_cycles: 0,
            nmi_pending: false,
            irq_pending: false,
        }
    }

    /// 重置 CPU（模擬按下 RESET 按鈕）
    /// 從 $FFFC-$FFFD 讀取重置向量作為新的 PC
    pub fn reset(&mut self, read_fn: &dyn Fn(u16) -> u8) {
        let lo = read_fn(0xFFFC) as u16;
        let hi = read_fn(0xFFFD) as u16;
        self.pc = (hi << 8) | lo;

        self.a = 0;
        self.x = 0;
        self.y = 0;
        self.sp = 0xFD;
        self.status = flags::UNUSED | flags::IRQ_DISABLE;
        self.cycles = 8; // 重置需要 8 個週期
        self.total_cycles = 0; // 重置後清零
    }

    // ===== 旗標操作輔助方法 =====

    /// 取得指定旗標的值
    #[inline]
    fn get_flag(&self, flag: u8) -> bool {
        (self.status & flag) != 0
    }

    /// 設定指定旗標
    #[inline]
    fn set_flag(&mut self, flag: u8, value: bool) {
        if value {
            self.status |= flag;
        } else {
            self.status &= !flag;
        }
    }

    /// 根據結果值更新零旗標和負數旗標
    #[inline]
    fn update_zn(&mut self, value: u8) {
        self.set_flag(flags::ZERO, value == 0);
        self.set_flag(flags::NEGATIVE, value & 0x80 != 0);
    }

    // ===== 堆疊操作 =====

    /// 推入一個位元組到堆疊
    #[inline]
    fn push(&mut self, value: u8, write_fn: &mut dyn FnMut(u16, u8)) {
        write_fn(0x0100 | self.sp as u16, value);
        self.sp = self.sp.wrapping_sub(1);
    }

    /// 推入一個 16 位元值到堆疊（高位元組先推）
    #[inline]
    fn push16(&mut self, value: u16, write_fn: &mut dyn FnMut(u16, u8)) {
        self.push((value >> 8) as u8, write_fn);
        self.push(value as u8, write_fn);
    }

    /// 從堆疊彈出一個位元組
    #[inline]
    fn pull(&mut self, read_fn: &dyn Fn(u16) -> u8) -> u8 {
        self.sp = self.sp.wrapping_add(1);
        read_fn(0x0100 | self.sp as u16)
    }

    /// 從堆疊彈出一個 16 位元值
    #[inline]
    fn pull16(&mut self, read_fn: &dyn Fn(u16) -> u8) -> u16 {
        let lo = self.pull(read_fn) as u16;
        let hi = self.pull(read_fn) as u16;
        (hi << 8) | lo
    }

    // ===== 中斷處理 =====

    /// 觸發 NMI（不可遮罩中斷）
    /// 由 PPU 在 VBlank 開始時觸發
    pub fn trigger_nmi(&mut self) {
        self.nmi_pending = true;
    }

    /// 觸發 IRQ（可遮罩中斷）
    /// 可由 APU 或 Mapper 觸發
    pub fn trigger_irq(&mut self) {
        self.irq_pending = true;
    }

    /// 處理 NMI 中斷
    fn handle_nmi(&mut self, read_fn: &dyn Fn(u16) -> u8, write_fn: &mut dyn FnMut(u16, u8)) {
        // 推入 PC 和狀態暫存器
        self.push16(self.pc, write_fn);
        // 推入狀態時清除 B 旗標，設定未使用位元
        self.push((self.status & !flags::BREAK) | flags::UNUSED, write_fn);
        // 設定中斷禁止旗標
        self.set_flag(flags::IRQ_DISABLE, true);
        // 從 NMI 向量讀取新的 PC
        let lo = read_fn(0xFFFA) as u16;
        let hi = read_fn(0xFFFB) as u16;
        self.pc = (hi << 8) | lo;
        self.cycles = 7;
    }

    /// 處理 IRQ 中斷
    fn handle_irq(&mut self, read_fn: &dyn Fn(u16) -> u8, write_fn: &mut dyn FnMut(u16, u8)) {
        // 推入 PC 和狀態暫存器
        self.push16(self.pc, write_fn);
        self.push((self.status & !flags::BREAK) | flags::UNUSED, write_fn);
        self.set_flag(flags::IRQ_DISABLE, true);
        // 從 IRQ/BRK 向量讀取新的 PC
        let lo = read_fn(0xFFFE) as u16;
        let hi = read_fn(0xFFFF) as u16;
        self.pc = (hi << 8) | lo;
        self.cycles = 7;
    }

    // ===== 定址模式解析 =====
    // 每個定址模式回傳 (有效位址, 是否跨頁)

    /// 解析運算元的有效位址
    /// 回傳 (位址, 額外週期)
    fn resolve_address(
        &mut self,
        mode: AddressingMode,
        read_fn: &dyn Fn(u16) -> u8,
    ) -> (u16, bool) {
        match mode {
            AddressingMode::Implicit | AddressingMode::Accumulator => (0, false),

            AddressingMode::Immediate => {
                let addr = self.pc;
                self.pc = self.pc.wrapping_add(1);
                (addr, false)
            }

            AddressingMode::ZeroPage => {
                let addr = read_fn(self.pc) as u16;
                self.pc = self.pc.wrapping_add(1);
                (addr, false)
            }

            AddressingMode::ZeroPageX => {
                let base = read_fn(self.pc);
                self.pc = self.pc.wrapping_add(1);
                (base.wrapping_add(self.x) as u16, false)
            }

            AddressingMode::ZeroPageY => {
                let base = read_fn(self.pc);
                self.pc = self.pc.wrapping_add(1);
                (base.wrapping_add(self.y) as u16, false)
            }

            AddressingMode::Relative => {
                let offset = read_fn(self.pc) as i8;
                self.pc = self.pc.wrapping_add(1);
                let target = self.pc.wrapping_add(offset as u16);
                let page_cross = (self.pc & 0xFF00) != (target & 0xFF00);
                (target, page_cross)
            }

            AddressingMode::Absolute => {
                let lo = read_fn(self.pc) as u16;
                let hi = read_fn(self.pc.wrapping_add(1)) as u16;
                self.pc = self.pc.wrapping_add(2);
                ((hi << 8) | lo, false)
            }

            AddressingMode::AbsoluteX => {
                let lo = read_fn(self.pc) as u16;
                let hi = read_fn(self.pc.wrapping_add(1)) as u16;
                self.pc = self.pc.wrapping_add(2);
                let base = (hi << 8) | lo;
                let addr = base.wrapping_add(self.x as u16);
                let page_cross = (base & 0xFF00) != (addr & 0xFF00);
                (addr, page_cross)
            }

            AddressingMode::AbsoluteY => {
                let lo = read_fn(self.pc) as u16;
                let hi = read_fn(self.pc.wrapping_add(1)) as u16;
                self.pc = self.pc.wrapping_add(2);
                let base = (hi << 8) | lo;
                let addr = base.wrapping_add(self.y as u16);
                let page_cross = (base & 0xFF00) != (addr & 0xFF00);
                (addr, page_cross)
            }

            AddressingMode::Indirect => {
                let ptr_lo = read_fn(self.pc) as u16;
                let ptr_hi = read_fn(self.pc.wrapping_add(1)) as u16;
                self.pc = self.pc.wrapping_add(2);
                let ptr = (ptr_hi << 8) | ptr_lo;

                // 6502 的間接尋址 Bug：如果指標位於頁面邊界，
                // 高位元組會從同一頁的開頭讀取而非下一頁
                let lo = read_fn(ptr) as u16;
                let hi = if ptr_lo == 0xFF {
                    read_fn(ptr & 0xFF00) as u16  // 頁面邊界 bug
                } else {
                    read_fn(ptr.wrapping_add(1)) as u16
                };
                ((hi << 8) | lo, false)
            }

            AddressingMode::IndirectX => {
                let base = read_fn(self.pc);
                self.pc = self.pc.wrapping_add(1);
                let ptr = base.wrapping_add(self.x);
                let lo = read_fn(ptr as u16) as u16;
                let hi = read_fn(ptr.wrapping_add(1) as u16) as u16;
                ((hi << 8) | lo, false)
            }

            AddressingMode::IndirectY => {
                let ptr = read_fn(self.pc);
                self.pc = self.pc.wrapping_add(1);
                let lo = read_fn(ptr as u16) as u16;
                let hi = read_fn(ptr.wrapping_add(1) as u16) as u16;
                let base = (hi << 8) | lo;
                let addr = base.wrapping_add(self.y as u16);
                let page_cross = (base & 0xFF00) != (addr & 0xFF00);
                (addr, page_cross)
            }
        }
    }

    // ===== 主要執行方法 =====

    /// 執行一個 CPU 週期
    /// 如果目前指令已完成（cycles == 0），則讀取並執行下一條指令
    pub fn clock(
        &mut self,
        read_fn: &dyn Fn(u16) -> u8,
        write_fn: &mut dyn FnMut(u16, u8),
    ) {
        if self.cycles == 0 {
            // 檢查中斷
            if self.nmi_pending {
                self.nmi_pending = false;
                self.handle_nmi(read_fn, write_fn);
                return;
            }

            if self.irq_pending && !self.get_flag(flags::IRQ_DISABLE) {
                self.irq_pending = false;
                self.handle_irq(read_fn, write_fn);
                return;
            }

            // 讀取操作碼
            let opcode = read_fn(self.pc);
            self.pc = self.pc.wrapping_add(1);

            // 確保未使用位元永遠為 1
            self.set_flag(flags::UNUSED, true);

            // 解碼並執行指令
            self.execute(opcode, read_fn, write_fn);

            // 確保未使用位元永遠為 1
            self.set_flag(flags::UNUSED, true);
        }

        self.cycles = self.cycles.saturating_sub(1);
        self.total_cycles += 1;
    }

    /// 解碼並執行一條指令
    /// 使用大型 match 表達式對應所有 256 個操作碼
    fn execute(
        &mut self,
        opcode: u8,
        read_fn: &dyn Fn(u16) -> u8,
        write_fn: &mut dyn FnMut(u16, u8),
    ) {
        match opcode {
            // ===== 載入指令 =====

            // LDA - 載入到累加器
            0xA9 => { self.cycles = 2; self.lda(AddressingMode::Immediate, read_fn); }
            0xA5 => { self.cycles = 3; self.lda(AddressingMode::ZeroPage, read_fn); }
            0xB5 => { self.cycles = 4; self.lda(AddressingMode::ZeroPageX, read_fn); }
            0xAD => { self.cycles = 4; self.lda(AddressingMode::Absolute, read_fn); }
            0xBD => { self.cycles = 4; self.lda(AddressingMode::AbsoluteX, read_fn); }
            0xB9 => { self.cycles = 4; self.lda(AddressingMode::AbsoluteY, read_fn); }
            0xA1 => { self.cycles = 6; self.lda(AddressingMode::IndirectX, read_fn); }
            0xB1 => { self.cycles = 5; self.lda(AddressingMode::IndirectY, read_fn); }

            // LDX - 載入到 X 暫存器
            0xA2 => { self.cycles = 2; self.ldx(AddressingMode::Immediate, read_fn); }
            0xA6 => { self.cycles = 3; self.ldx(AddressingMode::ZeroPage, read_fn); }
            0xB6 => { self.cycles = 4; self.ldx(AddressingMode::ZeroPageY, read_fn); }
            0xAE => { self.cycles = 4; self.ldx(AddressingMode::Absolute, read_fn); }
            0xBE => { self.cycles = 4; self.ldx(AddressingMode::AbsoluteY, read_fn); }

            // LDY - 載入到 Y 暫存器
            0xA0 => { self.cycles = 2; self.ldy(AddressingMode::Immediate, read_fn); }
            0xA4 => { self.cycles = 3; self.ldy(AddressingMode::ZeroPage, read_fn); }
            0xB4 => { self.cycles = 4; self.ldy(AddressingMode::ZeroPageX, read_fn); }
            0xAC => { self.cycles = 4; self.ldy(AddressingMode::Absolute, read_fn); }
            0xBC => { self.cycles = 4; self.ldy(AddressingMode::AbsoluteX, read_fn); }

            // ===== 儲存指令 =====

            // STA - 儲存累加器
            0x85 => { self.cycles = 3; self.sta(AddressingMode::ZeroPage, read_fn, write_fn); }
            0x95 => { self.cycles = 4; self.sta(AddressingMode::ZeroPageX, read_fn, write_fn); }
            0x8D => { self.cycles = 4; self.sta(AddressingMode::Absolute, read_fn, write_fn); }
            0x9D => { self.cycles = 5; self.sta(AddressingMode::AbsoluteX, read_fn, write_fn); }
            0x99 => { self.cycles = 5; self.sta(AddressingMode::AbsoluteY, read_fn, write_fn); }
            0x81 => { self.cycles = 6; self.sta(AddressingMode::IndirectX, read_fn, write_fn); }
            0x91 => { self.cycles = 6; self.sta(AddressingMode::IndirectY, read_fn, write_fn); }

            // STX - 儲存 X 暫存器
            0x86 => { self.cycles = 3; self.stx(AddressingMode::ZeroPage, read_fn, write_fn); }
            0x96 => { self.cycles = 4; self.stx(AddressingMode::ZeroPageY, read_fn, write_fn); }
            0x8E => { self.cycles = 4; self.stx(AddressingMode::Absolute, read_fn, write_fn); }

            // STY - 儲存 Y 暫存器
            0x84 => { self.cycles = 3; self.sty(AddressingMode::ZeroPage, read_fn, write_fn); }
            0x94 => { self.cycles = 4; self.sty(AddressingMode::ZeroPageX, read_fn, write_fn); }
            0x8C => { self.cycles = 4; self.sty(AddressingMode::Absolute, read_fn, write_fn); }

            // ===== 暫存器轉移指令 =====
            0xAA => { self.cycles = 2; self.x = self.a; self.update_zn(self.x); }  // TAX
            0xA8 => { self.cycles = 2; self.y = self.a; self.update_zn(self.y); }  // TAY
            0x8A => { self.cycles = 2; self.a = self.x; self.update_zn(self.a); }  // TXA
            0x98 => { self.cycles = 2; self.a = self.y; self.update_zn(self.a); }  // TYA
            0xBA => { self.cycles = 2; self.x = self.sp; self.update_zn(self.x); } // TSX
            0x9A => { self.cycles = 2; self.sp = self.x; }                          // TXS

            // ===== 算術指令 =====

            // ADC - 帶進位加法
            0x69 => { self.cycles = 2; self.adc(AddressingMode::Immediate, read_fn); }
            0x65 => { self.cycles = 3; self.adc(AddressingMode::ZeroPage, read_fn); }
            0x75 => { self.cycles = 4; self.adc(AddressingMode::ZeroPageX, read_fn); }
            0x6D => { self.cycles = 4; self.adc(AddressingMode::Absolute, read_fn); }
            0x7D => { self.cycles = 4; self.adc(AddressingMode::AbsoluteX, read_fn); }
            0x79 => { self.cycles = 4; self.adc(AddressingMode::AbsoluteY, read_fn); }
            0x61 => { self.cycles = 6; self.adc(AddressingMode::IndirectX, read_fn); }
            0x71 => { self.cycles = 5; self.adc(AddressingMode::IndirectY, read_fn); }

            // SBC - 帶借位減法
            0xE9 => { self.cycles = 2; self.sbc(AddressingMode::Immediate, read_fn); }
            0xE5 => { self.cycles = 3; self.sbc(AddressingMode::ZeroPage, read_fn); }
            0xF5 => { self.cycles = 4; self.sbc(AddressingMode::ZeroPageX, read_fn); }
            0xED => { self.cycles = 4; self.sbc(AddressingMode::Absolute, read_fn); }
            0xFD => { self.cycles = 4; self.sbc(AddressingMode::AbsoluteX, read_fn); }
            0xF9 => { self.cycles = 4; self.sbc(AddressingMode::AbsoluteY, read_fn); }
            0xE1 => { self.cycles = 6; self.sbc(AddressingMode::IndirectX, read_fn); }
            0xF1 => { self.cycles = 5; self.sbc(AddressingMode::IndirectY, read_fn); }

            // CMP - 比較累加器
            0xC9 => { self.cycles = 2; self.cmp(AddressingMode::Immediate, read_fn); }
            0xC5 => { self.cycles = 3; self.cmp(AddressingMode::ZeroPage, read_fn); }
            0xD5 => { self.cycles = 4; self.cmp(AddressingMode::ZeroPageX, read_fn); }
            0xCD => { self.cycles = 4; self.cmp(AddressingMode::Absolute, read_fn); }
            0xDD => { self.cycles = 4; self.cmp(AddressingMode::AbsoluteX, read_fn); }
            0xD9 => { self.cycles = 4; self.cmp(AddressingMode::AbsoluteY, read_fn); }
            0xC1 => { self.cycles = 6; self.cmp(AddressingMode::IndirectX, read_fn); }
            0xD1 => { self.cycles = 5; self.cmp(AddressingMode::IndirectY, read_fn); }

            // CPX - 比較 X 暫存器
            0xE0 => { self.cycles = 2; self.cpx(AddressingMode::Immediate, read_fn); }
            0xE4 => { self.cycles = 3; self.cpx(AddressingMode::ZeroPage, read_fn); }
            0xEC => { self.cycles = 4; self.cpx(AddressingMode::Absolute, read_fn); }

            // CPY - 比較 Y 暫存器
            0xC0 => { self.cycles = 2; self.cpy(AddressingMode::Immediate, read_fn); }
            0xC4 => { self.cycles = 3; self.cpy(AddressingMode::ZeroPage, read_fn); }
            0xCC => { self.cycles = 4; self.cpy(AddressingMode::Absolute, read_fn); }

            // ===== 遞增/遞減指令 =====

            // INC - 記憶體遞增
            0xE6 => { self.cycles = 5; self.inc(AddressingMode::ZeroPage, read_fn, write_fn); }
            0xF6 => { self.cycles = 6; self.inc(AddressingMode::ZeroPageX, read_fn, write_fn); }
            0xEE => { self.cycles = 6; self.inc(AddressingMode::Absolute, read_fn, write_fn); }
            0xFE => { self.cycles = 7; self.inc(AddressingMode::AbsoluteX, read_fn, write_fn); }

            // DEC - 記憶體遞減
            0xC6 => { self.cycles = 5; self.dec(AddressingMode::ZeroPage, read_fn, write_fn); }
            0xD6 => { self.cycles = 6; self.dec(AddressingMode::ZeroPageX, read_fn, write_fn); }
            0xCE => { self.cycles = 6; self.dec(AddressingMode::Absolute, read_fn, write_fn); }
            0xDE => { self.cycles = 7; self.dec(AddressingMode::AbsoluteX, read_fn, write_fn); }

            // INX/INY/DEX/DEY - 暫存器遞增/遞減
            0xE8 => { self.cycles = 2; self.x = self.x.wrapping_add(1); self.update_zn(self.x); } // INX
            0xC8 => { self.cycles = 2; self.y = self.y.wrapping_add(1); self.update_zn(self.y); } // INY
            0xCA => { self.cycles = 2; self.x = self.x.wrapping_sub(1); self.update_zn(self.x); } // DEX
            0x88 => { self.cycles = 2; self.y = self.y.wrapping_sub(1); self.update_zn(self.y); } // DEY

            // ===== 邏輯運算指令 =====

            // AND - 邏輯與
            0x29 => { self.cycles = 2; self.and(AddressingMode::Immediate, read_fn); }
            0x25 => { self.cycles = 3; self.and(AddressingMode::ZeroPage, read_fn); }
            0x35 => { self.cycles = 4; self.and(AddressingMode::ZeroPageX, read_fn); }
            0x2D => { self.cycles = 4; self.and(AddressingMode::Absolute, read_fn); }
            0x3D => { self.cycles = 4; self.and(AddressingMode::AbsoluteX, read_fn); }
            0x39 => { self.cycles = 4; self.and(AddressingMode::AbsoluteY, read_fn); }
            0x21 => { self.cycles = 6; self.and(AddressingMode::IndirectX, read_fn); }
            0x31 => { self.cycles = 5; self.and(AddressingMode::IndirectY, read_fn); }

            // ORA - 邏輯或
            0x09 => { self.cycles = 2; self.ora(AddressingMode::Immediate, read_fn); }
            0x05 => { self.cycles = 3; self.ora(AddressingMode::ZeroPage, read_fn); }
            0x15 => { self.cycles = 4; self.ora(AddressingMode::ZeroPageX, read_fn); }
            0x0D => { self.cycles = 4; self.ora(AddressingMode::Absolute, read_fn); }
            0x1D => { self.cycles = 4; self.ora(AddressingMode::AbsoluteX, read_fn); }
            0x19 => { self.cycles = 4; self.ora(AddressingMode::AbsoluteY, read_fn); }
            0x01 => { self.cycles = 6; self.ora(AddressingMode::IndirectX, read_fn); }
            0x11 => { self.cycles = 5; self.ora(AddressingMode::IndirectY, read_fn); }

            // EOR - 邏輯互斥或
            0x49 => { self.cycles = 2; self.eor(AddressingMode::Immediate, read_fn); }
            0x45 => { self.cycles = 3; self.eor(AddressingMode::ZeroPage, read_fn); }
            0x55 => { self.cycles = 4; self.eor(AddressingMode::ZeroPageX, read_fn); }
            0x4D => { self.cycles = 4; self.eor(AddressingMode::Absolute, read_fn); }
            0x5D => { self.cycles = 4; self.eor(AddressingMode::AbsoluteX, read_fn); }
            0x59 => { self.cycles = 4; self.eor(AddressingMode::AbsoluteY, read_fn); }
            0x41 => { self.cycles = 6; self.eor(AddressingMode::IndirectX, read_fn); }
            0x51 => { self.cycles = 5; self.eor(AddressingMode::IndirectY, read_fn); }

            // BIT - 位元測試
            0x24 => { self.cycles = 3; self.bit(AddressingMode::ZeroPage, read_fn); }
            0x2C => { self.cycles = 4; self.bit(AddressingMode::Absolute, read_fn); }

            // ===== 位移指令 =====

            // ASL - 算術左移
            0x0A => { self.cycles = 2; self.asl_acc(); }
            0x06 => { self.cycles = 5; self.asl_mem(AddressingMode::ZeroPage, read_fn, write_fn); }
            0x16 => { self.cycles = 6; self.asl_mem(AddressingMode::ZeroPageX, read_fn, write_fn); }
            0x0E => { self.cycles = 6; self.asl_mem(AddressingMode::Absolute, read_fn, write_fn); }
            0x1E => { self.cycles = 7; self.asl_mem(AddressingMode::AbsoluteX, read_fn, write_fn); }

            // LSR - 邏輯右移
            0x4A => { self.cycles = 2; self.lsr_acc(); }
            0x46 => { self.cycles = 5; self.lsr_mem(AddressingMode::ZeroPage, read_fn, write_fn); }
            0x56 => { self.cycles = 6; self.lsr_mem(AddressingMode::ZeroPageX, read_fn, write_fn); }
            0x4E => { self.cycles = 6; self.lsr_mem(AddressingMode::Absolute, read_fn, write_fn); }
            0x5E => { self.cycles = 7; self.lsr_mem(AddressingMode::AbsoluteX, read_fn, write_fn); }

            // ROL - 帶進位左旋轉
            0x2A => { self.cycles = 2; self.rol_acc(); }
            0x26 => { self.cycles = 5; self.rol_mem(AddressingMode::ZeroPage, read_fn, write_fn); }
            0x36 => { self.cycles = 6; self.rol_mem(AddressingMode::ZeroPageX, read_fn, write_fn); }
            0x2E => { self.cycles = 6; self.rol_mem(AddressingMode::Absolute, read_fn, write_fn); }
            0x3E => { self.cycles = 7; self.rol_mem(AddressingMode::AbsoluteX, read_fn, write_fn); }

            // ROR - 帶進位右旋轉
            0x6A => { self.cycles = 2; self.ror_acc(); }
            0x66 => { self.cycles = 5; self.ror_mem(AddressingMode::ZeroPage, read_fn, write_fn); }
            0x76 => { self.cycles = 6; self.ror_mem(AddressingMode::ZeroPageX, read_fn, write_fn); }
            0x6E => { self.cycles = 6; self.ror_mem(AddressingMode::Absolute, read_fn, write_fn); }
            0x7E => { self.cycles = 7; self.ror_mem(AddressingMode::AbsoluteX, read_fn, write_fn); }

            // ===== 分支指令 =====
            0x90 => { self.cycles = 2; self.branch(!self.get_flag(flags::CARRY), read_fn); }    // BCC
            0xB0 => { self.cycles = 2; self.branch(self.get_flag(flags::CARRY), read_fn); }     // BCS
            0xF0 => { self.cycles = 2; self.branch(self.get_flag(flags::ZERO), read_fn); }      // BEQ
            0xD0 => { self.cycles = 2; self.branch(!self.get_flag(flags::ZERO), read_fn); }     // BNE
            0x30 => { self.cycles = 2; self.branch(self.get_flag(flags::NEGATIVE), read_fn); }  // BMI
            0x10 => { self.cycles = 2; self.branch(!self.get_flag(flags::NEGATIVE), read_fn); } // BPL
            0x70 => { self.cycles = 2; self.branch(self.get_flag(flags::OVERFLOW), read_fn); }  // BVS
            0x50 => { self.cycles = 2; self.branch(!self.get_flag(flags::OVERFLOW), read_fn); } // BVC

            // ===== 跳躍指令 =====

            // JMP - 無條件跳躍
            0x4C => {
                self.cycles = 3;
                let (addr, _) = self.resolve_address(AddressingMode::Absolute, read_fn);
                self.pc = addr;
            }
            0x6C => {
                self.cycles = 5;
                let (addr, _) = self.resolve_address(AddressingMode::Indirect, read_fn);
                self.pc = addr;
            }

            // JSR - 跳躍到子程式
            0x20 => {
                self.cycles = 6;
                let (addr, _) = self.resolve_address(AddressingMode::Absolute, read_fn);
                // 推入返回位址 - 1（RTS 會加 1）
                self.push16(self.pc.wrapping_sub(1), write_fn);
                self.pc = addr;
            }

            // RTS - 從子程式返回
            0x60 => {
                self.cycles = 6;
                self.pc = self.pull16(read_fn).wrapping_add(1);
            }

            // RTI - 從中斷返回
            0x40 => {
                self.cycles = 6;
                self.status = self.pull(read_fn);
                self.set_flag(flags::BREAK, false);
                self.set_flag(flags::UNUSED, true);
                self.pc = self.pull16(read_fn);
            }

            // ===== 堆疊指令 =====
            0x48 => { self.cycles = 3; let a = self.a; self.push(a, write_fn); }  // PHA
            0x68 => {                                                              // PLA
                self.cycles = 4;
                self.a = self.pull(read_fn);
                self.update_zn(self.a);
            }
            0x08 => {                                                              // PHP
                self.cycles = 3;
                let s = self.status | flags::BREAK | flags::UNUSED;
                self.push(s, write_fn);
            }
            0x28 => {                                                              // PLP
                self.cycles = 4;
                self.status = self.pull(read_fn);
                self.set_flag(flags::BREAK, false);
                self.set_flag(flags::UNUSED, true);
            }

            // ===== 旗標指令 =====
            0x18 => { self.cycles = 2; self.set_flag(flags::CARRY, false); }       // CLC
            0x38 => { self.cycles = 2; self.set_flag(flags::CARRY, true); }        // SEC
            0x58 => { self.cycles = 2; self.set_flag(flags::IRQ_DISABLE, false); } // CLI
            0x78 => { self.cycles = 2; self.set_flag(flags::IRQ_DISABLE, true); }  // SEI
            0xD8 => { self.cycles = 2; self.set_flag(flags::DECIMAL, false); }     // CLD
            0xF8 => { self.cycles = 2; self.set_flag(flags::DECIMAL, true); }      // SED
            0xB8 => { self.cycles = 2; self.set_flag(flags::OVERFLOW, false); }    // CLV

            // ===== 系統指令 =====

            // BRK - 觸發中斷
            0x00 => {
                self.cycles = 7;
                self.pc = self.pc.wrapping_add(1); // BRK 跳過下一個位元組
                self.push16(self.pc, write_fn);
                self.push(self.status | flags::BREAK | flags::UNUSED, write_fn);
                self.set_flag(flags::IRQ_DISABLE, true);
                let lo = read_fn(0xFFFE) as u16;
                let hi = read_fn(0xFFFF) as u16;
                self.pc = (hi << 8) | lo;
            }

            // NOP - 無操作
            0xEA => { self.cycles = 2; }

            // ===== 非官方操作碼（常見的需要處理以避免卡住） =====
            // 這些非官方操作碼在某些遊戲中會被使用

            // NOP 變體（不同的定址模式和週期數）
            0x1A | 0x3A | 0x5A | 0x7A | 0xDA | 0xFA => { self.cycles = 2; } // NOP (隱式)
            0x80 | 0x82 | 0x89 | 0xC2 | 0xE2 => { // NOP #imm (跳過一個位元組)
                self.cycles = 2;
                self.pc = self.pc.wrapping_add(1);
            }
            0x04 | 0x44 | 0x64 => { // NOP zp (跳過一個位元組)
                self.cycles = 3;
                self.pc = self.pc.wrapping_add(1);
            }
            0x14 | 0x34 | 0x54 | 0x74 | 0xD4 | 0xF4 => { // NOP zp,X (跳過一個位元組)
                self.cycles = 4;
                self.pc = self.pc.wrapping_add(1);
            }
            0x0C => { // NOP abs (跳過兩個位元組)
                self.cycles = 4;
                self.pc = self.pc.wrapping_add(2);
            }
            0x1C | 0x3C | 0x5C | 0x7C | 0xDC | 0xFC => { // NOP abs,X (跳過兩個位元組)
                self.cycles = 4;
                // 需要讀取以觸發跨頁週期
                let lo = read_fn(self.pc) as u16;
                let hi = read_fn(self.pc.wrapping_add(1)) as u16;
                self.pc = self.pc.wrapping_add(2);
                let base = (hi << 8) | lo;
                let addr = base.wrapping_add(self.x as u16);
                if (base & 0xFF00) != (addr & 0xFF00) {
                    self.cycles += 1;
                }
            }

            // LAX - LDA + LDX 合併（非官方）
            0xA7 => { self.cycles = 3; self.lax(AddressingMode::ZeroPage, read_fn); }
            0xB7 => { self.cycles = 4; self.lax(AddressingMode::ZeroPageY, read_fn); }
            0xAF => { self.cycles = 4; self.lax(AddressingMode::Absolute, read_fn); }
            0xBF => { self.cycles = 4; self.lax(AddressingMode::AbsoluteY, read_fn); }
            0xA3 => { self.cycles = 6; self.lax(AddressingMode::IndirectX, read_fn); }
            0xB3 => { self.cycles = 5; self.lax(AddressingMode::IndirectY, read_fn); }

            // SAX - A & X -> M（非官方）
            0x87 => { self.cycles = 3; self.sax(AddressingMode::ZeroPage, read_fn, write_fn); }
            0x97 => { self.cycles = 4; self.sax(AddressingMode::ZeroPageY, read_fn, write_fn); }
            0x8F => { self.cycles = 4; self.sax(AddressingMode::Absolute, read_fn, write_fn); }
            0x83 => { self.cycles = 6; self.sax(AddressingMode::IndirectX, read_fn, write_fn); }

            // DCP - DEC + CMP（非官方）
            0xC7 => { self.cycles = 5; self.dcp(AddressingMode::ZeroPage, read_fn, write_fn); }
            0xD7 => { self.cycles = 6; self.dcp(AddressingMode::ZeroPageX, read_fn, write_fn); }
            0xCF => { self.cycles = 6; self.dcp(AddressingMode::Absolute, read_fn, write_fn); }
            0xDF => { self.cycles = 7; self.dcp(AddressingMode::AbsoluteX, read_fn, write_fn); }
            0xDB => { self.cycles = 7; self.dcp(AddressingMode::AbsoluteY, read_fn, write_fn); }
            0xC3 => { self.cycles = 8; self.dcp(AddressingMode::IndirectX, read_fn, write_fn); }
            0xD3 => { self.cycles = 8; self.dcp(AddressingMode::IndirectY, read_fn, write_fn); }

            // ISB/ISC - INC + SBC（非官方）
            0xE7 => { self.cycles = 5; self.isb(AddressingMode::ZeroPage, read_fn, write_fn); }
            0xF7 => { self.cycles = 6; self.isb(AddressingMode::ZeroPageX, read_fn, write_fn); }
            0xEF => { self.cycles = 6; self.isb(AddressingMode::Absolute, read_fn, write_fn); }
            0xFF => { self.cycles = 7; self.isb(AddressingMode::AbsoluteX, read_fn, write_fn); }
            0xFB => { self.cycles = 7; self.isb(AddressingMode::AbsoluteY, read_fn, write_fn); }
            0xE3 => { self.cycles = 8; self.isb(AddressingMode::IndirectX, read_fn, write_fn); }
            0xF3 => { self.cycles = 8; self.isb(AddressingMode::IndirectY, read_fn, write_fn); }

            // SLO - ASL + ORA（非官方）
            0x07 => { self.cycles = 5; self.slo(AddressingMode::ZeroPage, read_fn, write_fn); }
            0x17 => { self.cycles = 6; self.slo(AddressingMode::ZeroPageX, read_fn, write_fn); }
            0x0F => { self.cycles = 6; self.slo(AddressingMode::Absolute, read_fn, write_fn); }
            0x1F => { self.cycles = 7; self.slo(AddressingMode::AbsoluteX, read_fn, write_fn); }
            0x1B => { self.cycles = 7; self.slo(AddressingMode::AbsoluteY, read_fn, write_fn); }
            0x03 => { self.cycles = 8; self.slo(AddressingMode::IndirectX, read_fn, write_fn); }
            0x13 => { self.cycles = 8; self.slo(AddressingMode::IndirectY, read_fn, write_fn); }

            // RLA - ROL + AND（非官方）
            0x27 => { self.cycles = 5; self.rla(AddressingMode::ZeroPage, read_fn, write_fn); }
            0x37 => { self.cycles = 6; self.rla(AddressingMode::ZeroPageX, read_fn, write_fn); }
            0x2F => { self.cycles = 6; self.rla(AddressingMode::Absolute, read_fn, write_fn); }
            0x3F => { self.cycles = 7; self.rla(AddressingMode::AbsoluteX, read_fn, write_fn); }
            0x3B => { self.cycles = 7; self.rla(AddressingMode::AbsoluteY, read_fn, write_fn); }
            0x23 => { self.cycles = 8; self.rla(AddressingMode::IndirectX, read_fn, write_fn); }
            0x33 => { self.cycles = 8; self.rla(AddressingMode::IndirectY, read_fn, write_fn); }

            // SRE - LSR + EOR（非官方）
            0x47 => { self.cycles = 5; self.sre(AddressingMode::ZeroPage, read_fn, write_fn); }
            0x57 => { self.cycles = 6; self.sre(AddressingMode::ZeroPageX, read_fn, write_fn); }
            0x4F => { self.cycles = 6; self.sre(AddressingMode::Absolute, read_fn, write_fn); }
            0x5F => { self.cycles = 7; self.sre(AddressingMode::AbsoluteX, read_fn, write_fn); }
            0x5B => { self.cycles = 7; self.sre(AddressingMode::AbsoluteY, read_fn, write_fn); }
            0x43 => { self.cycles = 8; self.sre(AddressingMode::IndirectX, read_fn, write_fn); }
            0x53 => { self.cycles = 8; self.sre(AddressingMode::IndirectY, read_fn, write_fn); }

            // RRA - ROR + ADC（非官方）
            0x67 => { self.cycles = 5; self.rra(AddressingMode::ZeroPage, read_fn, write_fn); }
            0x77 => { self.cycles = 6; self.rra(AddressingMode::ZeroPageX, read_fn, write_fn); }
            0x6F => { self.cycles = 6; self.rra(AddressingMode::Absolute, read_fn, write_fn); }
            0x7F => { self.cycles = 7; self.rra(AddressingMode::AbsoluteX, read_fn, write_fn); }
            0x7B => { self.cycles = 7; self.rra(AddressingMode::AbsoluteY, read_fn, write_fn); }
            0x63 => { self.cycles = 8; self.rra(AddressingMode::IndirectX, read_fn, write_fn); }
            0x73 => { self.cycles = 8; self.rra(AddressingMode::IndirectY, read_fn, write_fn); }

            // SBC 非官方別名
            0xEB => { self.cycles = 2; self.sbc(AddressingMode::Immediate, read_fn); }

            // 其他未知操作碼 - 當作 NOP 處理
            _ => {
                self.cycles = 2;
            }
        }
    }

    // ===== 指令實作 =====

    /// LDA - 載入到累加器
    fn lda(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8) {
        let (addr, page_cross) = self.resolve_address(mode, read_fn);
        self.a = read_fn(addr);
        self.update_zn(self.a);
        if page_cross { self.cycles += 1; }
    }

    /// LDX - 載入到 X 暫存器
    fn ldx(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8) {
        let (addr, page_cross) = self.resolve_address(mode, read_fn);
        self.x = read_fn(addr);
        self.update_zn(self.x);
        if page_cross { self.cycles += 1; }
    }

    /// LDY - 載入到 Y 暫存器
    fn ldy(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8) {
        let (addr, page_cross) = self.resolve_address(mode, read_fn);
        self.y = read_fn(addr);
        self.update_zn(self.y);
        if page_cross { self.cycles += 1; }
    }

    /// STA - 儲存累加器到記憶體
    fn sta(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8, write_fn: &mut dyn FnMut(u16, u8)) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        write_fn(addr, self.a);
    }

    /// STX - 儲存 X 暫存器到記憶體
    fn stx(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8, write_fn: &mut dyn FnMut(u16, u8)) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        write_fn(addr, self.x);
    }

    /// STY - 儲存 Y 暫存器到記憶體
    fn sty(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8, write_fn: &mut dyn FnMut(u16, u8)) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        write_fn(addr, self.y);
    }

    /// ADC - 帶進位加法
    /// A = A + M + C，更新 C、Z、V、N 旗標
    fn adc(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8) {
        let (addr, page_cross) = self.resolve_address(mode, read_fn);
        let value = read_fn(addr);
        self.adc_value(value);
        if page_cross { self.cycles += 1; }
    }

    /// ADC 的核心運算（也供 RRA 使用）
    fn adc_value(&mut self, value: u8) {
        let carry = if self.get_flag(flags::CARRY) { 1u16 } else { 0u16 };
        let sum = self.a as u16 + value as u16 + carry;

        // 設定進位旗標（結果超過 255）
        self.set_flag(flags::CARRY, sum > 255);

        // 設定溢位旗標（兩個同號數相加得到異號結果）
        let result = sum as u8;
        self.set_flag(
            flags::OVERFLOW,
            (!(self.a ^ value) & (self.a ^ result)) & 0x80 != 0,
        );

        self.a = result;
        self.update_zn(self.a);
    }

    /// SBC - 帶借位減法
    /// A = A - M - (1 - C)，等價於 A + (~M) + C
    fn sbc(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8) {
        let (addr, page_cross) = self.resolve_address(mode, read_fn);
        let value = read_fn(addr);
        // SBC 等價於 ADC 取反值
        self.adc_value(value ^ 0xFF);
        if page_cross { self.cycles += 1; }
    }

    /// CMP - 比較累加器
    fn cmp(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8) {
        let (addr, page_cross) = self.resolve_address(mode, read_fn);
        let value = read_fn(addr);
        self.compare(self.a, value);
        if page_cross { self.cycles += 1; }
    }

    /// CPX - 比較 X 暫存器
    fn cpx(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        let value = read_fn(addr);
        self.compare(self.x, value);
    }

    /// CPY - 比較 Y 暫存器
    fn cpy(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        let value = read_fn(addr);
        self.compare(self.y, value);
    }

    /// 比較操作的共用邏輯
    #[inline]
    fn compare(&mut self, reg: u8, value: u8) {
        let result = reg.wrapping_sub(value);
        self.set_flag(flags::CARRY, reg >= value);
        self.update_zn(result);
    }

    /// INC - 記憶體遞增
    fn inc(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8, write_fn: &mut dyn FnMut(u16, u8)) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        let value = read_fn(addr).wrapping_add(1);
        write_fn(addr, value);
        self.update_zn(value);
    }

    /// DEC - 記憶體遞減
    fn dec(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8, write_fn: &mut dyn FnMut(u16, u8)) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        let value = read_fn(addr).wrapping_sub(1);
        write_fn(addr, value);
        self.update_zn(value);
    }

    /// AND - 邏輯與
    fn and(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8) {
        let (addr, page_cross) = self.resolve_address(mode, read_fn);
        self.a &= read_fn(addr);
        self.update_zn(self.a);
        if page_cross { self.cycles += 1; }
    }

    /// ORA - 邏輯或
    fn ora(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8) {
        let (addr, page_cross) = self.resolve_address(mode, read_fn);
        self.a |= read_fn(addr);
        self.update_zn(self.a);
        if page_cross { self.cycles += 1; }
    }

    /// EOR - 邏輯互斥或
    fn eor(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8) {
        let (addr, page_cross) = self.resolve_address(mode, read_fn);
        self.a ^= read_fn(addr);
        self.update_zn(self.a);
        if page_cross { self.cycles += 1; }
    }

    /// BIT - 位元測試
    /// Z = A & M，N = M[7]，V = M[6]
    fn bit(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        let value = read_fn(addr);
        self.set_flag(flags::ZERO, (self.a & value) == 0);
        self.set_flag(flags::NEGATIVE, value & 0x80 != 0);
        self.set_flag(flags::OVERFLOW, value & 0x40 != 0);
    }

    /// ASL - 累加器算術左移
    fn asl_acc(&mut self) {
        self.set_flag(flags::CARRY, self.a & 0x80 != 0);
        self.a <<= 1;
        self.update_zn(self.a);
    }

    /// ASL - 記憶體算術左移
    fn asl_mem(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8, write_fn: &mut dyn FnMut(u16, u8)) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        let mut value = read_fn(addr);
        self.set_flag(flags::CARRY, value & 0x80 != 0);
        value <<= 1;
        write_fn(addr, value);
        self.update_zn(value);
    }

    /// LSR - 累加器邏輯右移
    fn lsr_acc(&mut self) {
        self.set_flag(flags::CARRY, self.a & 0x01 != 0);
        self.a >>= 1;
        self.update_zn(self.a);
    }

    /// LSR - 記憶體邏輯右移
    fn lsr_mem(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8, write_fn: &mut dyn FnMut(u16, u8)) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        let mut value = read_fn(addr);
        self.set_flag(flags::CARRY, value & 0x01 != 0);
        value >>= 1;
        write_fn(addr, value);
        self.update_zn(value);
    }

    /// ROL - 累加器帶進位左旋轉
    fn rol_acc(&mut self) {
        let carry = if self.get_flag(flags::CARRY) { 1 } else { 0 };
        self.set_flag(flags::CARRY, self.a & 0x80 != 0);
        self.a = (self.a << 1) | carry;
        self.update_zn(self.a);
    }

    /// ROL - 記憶體帶進位左旋轉
    fn rol_mem(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8, write_fn: &mut dyn FnMut(u16, u8)) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        let mut value = read_fn(addr);
        let carry = if self.get_flag(flags::CARRY) { 1 } else { 0 };
        self.set_flag(flags::CARRY, value & 0x80 != 0);
        value = (value << 1) | carry;
        write_fn(addr, value);
        self.update_zn(value);
    }

    /// ROR - 累加器帶進位右旋轉
    fn ror_acc(&mut self) {
        let carry = if self.get_flag(flags::CARRY) { 0x80 } else { 0 };
        self.set_flag(flags::CARRY, self.a & 0x01 != 0);
        self.a = (self.a >> 1) | carry;
        self.update_zn(self.a);
    }

    /// ROR - 記憶體帶進位右旋轉
    fn ror_mem(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8, write_fn: &mut dyn FnMut(u16, u8)) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        let mut value = read_fn(addr);
        let carry = if self.get_flag(flags::CARRY) { 0x80 } else { 0 };
        self.set_flag(flags::CARRY, value & 0x01 != 0);
        value = (value >> 1) | carry;
        write_fn(addr, value);
        self.update_zn(value);
    }

    /// 分支指令的共用邏輯
    fn branch(&mut self, condition: bool, read_fn: &dyn Fn(u16) -> u8) {
        let (target, page_cross) = self.resolve_address(AddressingMode::Relative, read_fn);
        if condition {
            self.cycles += 1; // 分支成功額外 +1 週期
            if page_cross {
                self.cycles += 1; // 跨頁額外 +1 週期
            }
            self.pc = target;
        }
    }

    // ===== 非官方指令實作 =====

    /// LAX - LDA + LDX（非官方）
    fn lax(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8) {
        let (addr, page_cross) = self.resolve_address(mode, read_fn);
        let value = read_fn(addr);
        self.a = value;
        self.x = value;
        self.update_zn(value);
        if page_cross { self.cycles += 1; }
    }

    /// SAX - A & X -> M（非官方）
    fn sax(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8, write_fn: &mut dyn FnMut(u16, u8)) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        write_fn(addr, self.a & self.x);
    }

    /// DCP - DEC + CMP（非官方）
    fn dcp(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8, write_fn: &mut dyn FnMut(u16, u8)) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        let value = read_fn(addr).wrapping_sub(1);
        write_fn(addr, value);
        self.compare(self.a, value);
    }

    /// ISB/ISC - INC + SBC（非官方）
    fn isb(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8, write_fn: &mut dyn FnMut(u16, u8)) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        let value = read_fn(addr).wrapping_add(1);
        write_fn(addr, value);
        self.adc_value(value ^ 0xFF);
    }

    /// SLO - ASL + ORA（非官方）
    fn slo(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8, write_fn: &mut dyn FnMut(u16, u8)) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        let mut value = read_fn(addr);
        self.set_flag(flags::CARRY, value & 0x80 != 0);
        value <<= 1;
        write_fn(addr, value);
        self.a |= value;
        self.update_zn(self.a);
    }

    /// RLA - ROL + AND（非官方）
    fn rla(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8, write_fn: &mut dyn FnMut(u16, u8)) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        let mut value = read_fn(addr);
        let carry = if self.get_flag(flags::CARRY) { 1 } else { 0 };
        self.set_flag(flags::CARRY, value & 0x80 != 0);
        value = (value << 1) | carry;
        write_fn(addr, value);
        self.a &= value;
        self.update_zn(self.a);
    }

    /// SRE - LSR + EOR（非官方）
    fn sre(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8, write_fn: &mut dyn FnMut(u16, u8)) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        let mut value = read_fn(addr);
        self.set_flag(flags::CARRY, value & 0x01 != 0);
        value >>= 1;
        write_fn(addr, value);
        self.a ^= value;
        self.update_zn(self.a);
    }

    /// RRA - ROR + ADC（非官方）
    fn rra(&mut self, mode: AddressingMode, read_fn: &dyn Fn(u16) -> u8, write_fn: &mut dyn FnMut(u16, u8)) {
        let (addr, _) = self.resolve_address(mode, read_fn);
        let mut value = read_fn(addr);
        let carry = if self.get_flag(flags::CARRY) { 0x80 } else { 0 };
        self.set_flag(flags::CARRY, value & 0x01 != 0);
        value = (value >> 1) | carry;
        write_fn(addr, value);
        self.adc_value(value);
    }
}
