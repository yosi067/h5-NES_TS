// ============================================================
// Game Boy Emulator - 整合所有元件
// ============================================================
// 包含匯流排讀寫、CPU 指令執行、主時鐘循環
// ============================================================

use super::cpu::Cpu;
use super::ppu::Ppu;
use super::apu::Apu;
use super::timer::Timer;
use super::joypad::Joypad;
use super::cartridge::Cartridge;

/// GB 主機每幀的 T-cycle 數 (154 scanlines × 456 dots)
const DOTS_PER_FRAME: u32 = 70224;

pub struct GbEmulator {
    pub cpu: Cpu,
    pub ppu: Ppu,
    pub apu: Apu,
    pub timer: Timer,
    pub joypad: Joypad,
    pub cartridge: Cartridge,

    // 記憶體
    pub wram: [u8; 8192],
    pub hram: [u8; 127],

    // 中斷暫存器
    pub ie_reg: u8,    // $FFFF Interrupt Enable
    pub if_reg: u8,    // $FF0F Interrupt Flag

    // Serial (stub)
    serial_data: u8,
    serial_ctrl: u8,

    // DMA
    dma_pending: bool,
    dma_source: u8,
}

impl GbEmulator {
    pub fn new() -> Self {
        GbEmulator {
            cpu: Cpu::new(),
            ppu: Ppu::new(),
            apu: Apu::new(),
            timer: Timer::new(),
            joypad: Joypad::new(),
            cartridge: Cartridge::new(),
            wram: [0; 8192],
            hram: [0; 127],
            ie_reg: 0,
            if_reg: 0xE1,
            serial_data: 0,
            serial_ctrl: 0,
            dma_pending: false,
            dma_source: 0,
        }
    }

    pub fn load_rom(&mut self, data: &[u8]) -> bool {
        self.cartridge.load(data)
    }

    pub fn reset(&mut self) {
        self.cpu = Cpu::new();
        self.ppu = Ppu::new();
        self.timer = Timer::new();
        self.joypad = Joypad::new();
        self.wram = [0; 8192];
        self.hram = [0; 127];
        self.ie_reg = 0;
        self.if_reg = 0xE1;
    }

    /// 執行一幀
    pub fn frame(&mut self) {
        self.ppu.frame_complete = false;
        let mut cycles_this_frame: u32 = 0;
        while !self.ppu.frame_complete && cycles_this_frame < DOTS_PER_FRAME + 1000 {
            let t = self.cpu_step();
            self.tick_hardware(t);
            cycles_this_frame += t;
        }
    }

    /// 推進除 CPU 外的所有硬體
    fn tick_hardware(&mut self, t_cycles: u32) {
        self.ppu.tick(t_cycles);
        self.apu.tick(t_cycles);
        self.timer.tick(t_cycles);

        // 收集中斷
        if self.ppu.vblank_irq { self.if_reg |= 0x01; self.ppu.vblank_irq = false; }
        if self.ppu.stat_irq   { self.if_reg |= 0x02; self.ppu.stat_irq = false; }
        if self.timer.irq       { self.if_reg |= 0x04; self.timer.irq = false; }
        if self.joypad.irq      { self.if_reg |= 0x10; self.joypad.irq = false; }

        // DMA
        if self.dma_pending {
            self.dma_pending = false;
            let base = (self.dma_source as u16) << 8;
            for i in 0..160u16 {
                let val = self.bus_read(base + i);
                self.ppu.oam[i as usize] = val;
            }
        }
    }

    // ===== 匯流排讀寫 =====

    pub fn bus_read(&self, addr: u16) -> u8 {
        match addr {
            0x0000..=0x7FFF => self.cartridge.read(addr),
            0x8000..=0x9FFF => self.ppu.vram[(addr - 0x8000) as usize],
            0xA000..=0xBFFF => self.cartridge.read_ram(addr),
            0xC000..=0xDFFF => self.wram[(addr - 0xC000) as usize],
            0xE000..=0xFDFF => self.wram[(addr - 0xE000) as usize], // Echo RAM
            0xFE00..=0xFE9F => self.ppu.oam[(addr - 0xFE00) as usize],
            0xFEA0..=0xFEFF => 0xFF, // 未使用區域
            0xFF00 => self.joypad.read(),
            0xFF01 => self.serial_data,
            0xFF02 => self.serial_ctrl,
            0xFF04 => self.timer.read_div(),
            0xFF05 => self.timer.tima,
            0xFF06 => self.timer.tma,
            0xFF07 => self.timer.tac | 0xF8,
            0xFF0F => self.if_reg | 0xE0,
            0xFF10..=0xFF3F => self.apu.read(addr),
            0xFF40 => self.ppu.lcdc,
            0xFF41 => self.ppu.read_stat(),
            0xFF42 => self.ppu.scy,
            0xFF43 => self.ppu.scx,
            0xFF44 => self.ppu.ly,
            0xFF45 => self.ppu.lyc,
            0xFF46 => self.ppu.dma,
            0xFF47 => self.ppu.bgp,
            0xFF48 => self.ppu.obp0,
            0xFF49 => self.ppu.obp1,
            0xFF4A => self.ppu.wy,
            0xFF4B => self.ppu.wx,
            0xFF80..=0xFFFE => self.hram[(addr - 0xFF80) as usize],
            0xFFFF => self.ie_reg,
            _ => 0xFF,
        }
    }

    pub fn bus_write(&mut self, addr: u16, val: u8) {
        match addr {
            0x0000..=0x7FFF => self.cartridge.write(addr, val),
            0x8000..=0x9FFF => self.ppu.vram[(addr - 0x8000) as usize] = val,
            0xA000..=0xBFFF => self.cartridge.write_ram(addr, val),
            0xC000..=0xDFFF => self.wram[(addr - 0xC000) as usize] = val,
            0xE000..=0xFDFF => self.wram[(addr - 0xE000) as usize] = val,
            0xFE00..=0xFE9F => self.ppu.oam[(addr - 0xFE00) as usize] = val,
            0xFEA0..=0xFEFF => {} // 未使用
            0xFF00 => self.joypad.write(val),
            0xFF01 => self.serial_data = val,
            0xFF02 => self.serial_ctrl = val,
            0xFF04 => self.timer.write_div(),
            0xFF05 => self.timer.tima = val,
            0xFF06 => self.timer.tma = val,
            0xFF07 => self.timer.tac = val & 0x07,
            0xFF0F => self.if_reg = val & 0x1F,
            0xFF10..=0xFF3F => self.apu.write(addr, val),
            0xFF40 => {
                let was_on = self.ppu.lcdc & 0x80 != 0;
                self.ppu.lcdc = val;
                let is_on = val & 0x80 != 0;
                if was_on && !is_on {
                    // LCD 關閉：重置 PPU 狀態
                    self.ppu.ly = 0;
                    self.ppu.dot = 0;
                    self.ppu.stat &= 0xFC; // mode = 0
                }
            }
            0xFF41 => self.ppu.stat = (self.ppu.stat & 0x07) | (val & 0xF8),
            0xFF42 => self.ppu.scy = val,
            0xFF43 => self.ppu.scx = val,
            0xFF44 => {} // LY 唯讀
            0xFF45 => self.ppu.lyc = val,
            0xFF46 => {
                // DMA 傳輸
                self.ppu.dma = val;
                self.dma_pending = true;
                self.dma_source = val;
            }
            0xFF47 => self.ppu.bgp = val,
            0xFF48 => self.ppu.obp0 = val,
            0xFF49 => self.ppu.obp1 = val,
            0xFF4A => self.ppu.wy = val,
            0xFF4B => self.ppu.wx = val,
            0xFF80..=0xFFFE => self.hram[(addr - 0xFF80) as usize] = val,
            0xFFFF => self.ie_reg = val,
            _ => {}
        }
    }

    // ===== CPU 執行 =====

    /// 執行一個 CPU 步驟，回傳消耗的 T-cycles
    fn cpu_step(&mut self) -> u32 {
        // 處理 EI 延遲
        if self.cpu.ei_pending {
            self.cpu.ei_pending = false;
            self.cpu.ime = true;
        }

        // 中斷處理
        let pending = self.if_reg & self.ie_reg & 0x1F;
        if pending != 0 {
            self.cpu.halted = false;
            if self.cpu.ime {
                return self.handle_interrupt(pending);
            }
        }

        if self.cpu.halted {
            return 4;
        }

        // Fetch & Execute
        let op = self.fetch_u8();

        // HALT bug
        if self.cpu.halt_bug {
            self.cpu.halt_bug = false;
            self.cpu.pc = self.cpu.pc.wrapping_sub(1);
        }

        self.execute(op)
    }

    fn handle_interrupt(&mut self, pending: u8) -> u32 {
        self.cpu.ime = false;
        // 找到最高優先級的中斷
        let bit = pending.trailing_zeros() as u8;
        self.if_reg &= !(1 << bit);
        let vector = 0x0040 + bit as u16 * 8;
        // PUSH PC
        self.cpu.sp = self.cpu.sp.wrapping_sub(2);
        let sp = self.cpu.sp;
        let pc = self.cpu.pc;
        self.bus_write(sp, pc as u8);
        self.bus_write(sp.wrapping_add(1), (pc >> 8) as u8);
        self.cpu.pc = vector;
        20
    }

    // ===== 記憶體存取輔助 =====

    #[inline]
    fn fetch_u8(&mut self) -> u8 {
        let v = self.bus_read(self.cpu.pc);
        self.cpu.pc = self.cpu.pc.wrapping_add(1);
        v
    }

    #[inline]
    fn fetch_u16(&mut self) -> u16 {
        let lo = self.fetch_u8() as u16;
        let hi = self.fetch_u8() as u16;
        hi << 8 | lo
    }

    #[inline]
    fn push_u16(&mut self, val: u16) {
        self.cpu.sp = self.cpu.sp.wrapping_sub(1);
        self.bus_write(self.cpu.sp, (val >> 8) as u8);
        self.cpu.sp = self.cpu.sp.wrapping_sub(1);
        self.bus_write(self.cpu.sp, val as u8);
    }

    #[inline]
    fn pop_u16(&mut self) -> u16 {
        let lo = self.bus_read(self.cpu.sp) as u16;
        self.cpu.sp = self.cpu.sp.wrapping_add(1);
        let hi = self.bus_read(self.cpu.sp) as u16;
        self.cpu.sp = self.cpu.sp.wrapping_add(1);
        hi << 8 | lo
    }

    // ===== 暫存器存取（按 opcode bit 編碼）=====

    #[inline]
    fn read_r8(&self, idx: u8) -> u8 {
        match idx {
            0 => self.cpu.b, 1 => self.cpu.c,
            2 => self.cpu.d, 3 => self.cpu.e,
            4 => self.cpu.h, 5 => self.cpu.l,
            6 => self.bus_read(self.cpu.hl()),
            7 => self.cpu.a,
            _ => unreachable!(),
        }
    }

    #[inline]
    fn write_r8(&mut self, idx: u8, val: u8) {
        match idx {
            0 => self.cpu.b = val, 1 => self.cpu.c = val,
            2 => self.cpu.d = val, 3 => self.cpu.e = val,
            4 => self.cpu.h = val, 5 => self.cpu.l = val,
            6 => { let addr = self.cpu.hl(); self.bus_write(addr, val); }
            7 => self.cpu.a = val,
            _ => unreachable!(),
        }
    }

    fn read_r16(&self, idx: u8) -> u16 {
        match idx { 0 => self.cpu.bc(), 1 => self.cpu.de(), 2 => self.cpu.hl(), 3 => self.cpu.sp, _ => unreachable!() }
    }

    fn write_r16(&mut self, idx: u8, val: u16) {
        match idx { 0 => self.cpu.set_bc(val), 1 => self.cpu.set_de(val), 2 => self.cpu.set_hl(val), 3 => self.cpu.sp = val, _ => unreachable!() }
    }

    // ===== ALU 運算 =====

    fn alu_add(&mut self, val: u8) {
        let a = self.cpu.a;
        let r = a.wrapping_add(val);
        self.cpu.set_flag_z(r == 0);
        self.cpu.set_flag_n(false);
        self.cpu.set_flag_h((a & 0x0F) + (val & 0x0F) > 0x0F);
        self.cpu.set_flag_c((a as u16) + (val as u16) > 0xFF);
        self.cpu.a = r;
    }

    fn alu_adc(&mut self, val: u8) {
        let a = self.cpu.a;
        let c = if self.cpu.flag_c() { 1u8 } else { 0 };
        let r = a.wrapping_add(val).wrapping_add(c);
        self.cpu.set_flag_z(r == 0);
        self.cpu.set_flag_n(false);
        self.cpu.set_flag_h((a & 0x0F) + (val & 0x0F) + c > 0x0F);
        self.cpu.set_flag_c((a as u16) + (val as u16) + (c as u16) > 0xFF);
        self.cpu.a = r;
    }

    fn alu_sub(&mut self, val: u8) {
        let a = self.cpu.a;
        let r = a.wrapping_sub(val);
        self.cpu.set_flag_z(r == 0);
        self.cpu.set_flag_n(true);
        self.cpu.set_flag_h((a & 0x0F) < (val & 0x0F));
        self.cpu.set_flag_c((a as u16) < (val as u16));
        self.cpu.a = r;
    }

    fn alu_sbc(&mut self, val: u8) {
        let a = self.cpu.a;
        let c = if self.cpu.flag_c() { 1u8 } else { 0 };
        let r = a.wrapping_sub(val).wrapping_sub(c);
        self.cpu.set_flag_z(r == 0);
        self.cpu.set_flag_n(true);
        self.cpu.set_flag_h((a & 0x0F) < (val & 0x0F) + c);
        self.cpu.set_flag_c((a as u16) < (val as u16) + (c as u16));
        self.cpu.a = r;
    }

    fn alu_and(&mut self, val: u8) {
        self.cpu.a &= val;
        self.cpu.set_flag_z(self.cpu.a == 0);
        self.cpu.set_flag_n(false); self.cpu.set_flag_h(true); self.cpu.set_flag_c(false);
    }

    fn alu_xor(&mut self, val: u8) {
        self.cpu.a ^= val;
        self.cpu.set_flag_z(self.cpu.a == 0);
        self.cpu.set_flag_n(false); self.cpu.set_flag_h(false); self.cpu.set_flag_c(false);
    }

    fn alu_or(&mut self, val: u8) {
        self.cpu.a |= val;
        self.cpu.set_flag_z(self.cpu.a == 0);
        self.cpu.set_flag_n(false); self.cpu.set_flag_h(false); self.cpu.set_flag_c(false);
    }

    fn alu_cp(&mut self, val: u8) {
        let a = self.cpu.a;
        self.cpu.set_flag_z(a == val);
        self.cpu.set_flag_n(true);
        self.cpu.set_flag_h((a & 0x0F) < (val & 0x0F));
        self.cpu.set_flag_c(a < val);
    }

    fn alu_inc(&mut self, val: u8) -> u8 {
        let r = val.wrapping_add(1);
        self.cpu.set_flag_z(r == 0);
        self.cpu.set_flag_n(false);
        self.cpu.set_flag_h((val & 0x0F) + 1 > 0x0F);
        r
    }

    fn alu_dec(&mut self, val: u8) -> u8 {
        let r = val.wrapping_sub(1);
        self.cpu.set_flag_z(r == 0);
        self.cpu.set_flag_n(true);
        self.cpu.set_flag_h((val & 0x0F) == 0);
        r
    }

    fn alu_rlc(&mut self, val: u8) -> u8 {
        let c = val >> 7;
        let r = (val << 1) | c;
        self.cpu.set_flag_z(r == 0); self.cpu.set_flag_n(false); self.cpu.set_flag_h(false); self.cpu.set_flag_c(c != 0);
        r
    }

    fn alu_rrc(&mut self, val: u8) -> u8 {
        let c = val & 1;
        let r = (val >> 1) | (c << 7);
        self.cpu.set_flag_z(r == 0); self.cpu.set_flag_n(false); self.cpu.set_flag_h(false); self.cpu.set_flag_c(c != 0);
        r
    }

    fn alu_rl(&mut self, val: u8) -> u8 {
        let old_c = if self.cpu.flag_c() { 1u8 } else { 0 };
        let c = val >> 7;
        let r = (val << 1) | old_c;
        self.cpu.set_flag_z(r == 0); self.cpu.set_flag_n(false); self.cpu.set_flag_h(false); self.cpu.set_flag_c(c != 0);
        r
    }

    fn alu_rr(&mut self, val: u8) -> u8 {
        let old_c = if self.cpu.flag_c() { 0x80u8 } else { 0 };
        let c = val & 1;
        let r = (val >> 1) | old_c;
        self.cpu.set_flag_z(r == 0); self.cpu.set_flag_n(false); self.cpu.set_flag_h(false); self.cpu.set_flag_c(c != 0);
        r
    }

    fn alu_sla(&mut self, val: u8) -> u8 {
        let c = val >> 7;
        let r = val << 1;
        self.cpu.set_flag_z(r == 0); self.cpu.set_flag_n(false); self.cpu.set_flag_h(false); self.cpu.set_flag_c(c != 0);
        r
    }

    fn alu_sra(&mut self, val: u8) -> u8 {
        let c = val & 1;
        let r = (val as i8 >> 1) as u8; // 保留 bit 7
        self.cpu.set_flag_z(r == 0); self.cpu.set_flag_n(false); self.cpu.set_flag_h(false); self.cpu.set_flag_c(c != 0);
        r
    }

    fn alu_srl(&mut self, val: u8) -> u8 {
        let c = val & 1;
        let r = val >> 1;
        self.cpu.set_flag_z(r == 0); self.cpu.set_flag_n(false); self.cpu.set_flag_h(false); self.cpu.set_flag_c(c != 0);
        r
    }

    fn alu_swap(&mut self, val: u8) -> u8 {
        let r = (val >> 4) | (val << 4);
        self.cpu.set_flag_z(r == 0); self.cpu.set_flag_n(false); self.cpu.set_flag_h(false); self.cpu.set_flag_c(false);
        r
    }

    // ===== 指令解碼與執行 =====

    fn execute(&mut self, op: u8) -> u32 {
        match op {
            // ===== 0x00-0x3F: 雜項、載入、遞增遞減、旋轉 =====
            0x00 => 4, // NOP
            0x10 => { self.cpu.halted = true; 4 } // STOP (簡化處理)

            // LD rr, nn
            0x01 | 0x11 | 0x21 | 0x31 => { let v = self.fetch_u16(); self.write_r16((op >> 4) & 3, v); 12 }

            // LD (rr), A / LD A, (rr)
            0x02 => { let a = self.cpu.bc(); self.bus_write(a, self.cpu.a); 8 }
            0x12 => { let a = self.cpu.de(); self.bus_write(a, self.cpu.a); 8 }
            0x22 => { let a = self.cpu.hl(); self.bus_write(a, self.cpu.a); self.cpu.set_hl(a.wrapping_add(1)); 8 }
            0x32 => { let a = self.cpu.hl(); self.bus_write(a, self.cpu.a); self.cpu.set_hl(a.wrapping_sub(1)); 8 }
            0x0A => { self.cpu.a = self.bus_read(self.cpu.bc()); 8 }
            0x1A => { self.cpu.a = self.bus_read(self.cpu.de()); 8 }
            0x2A => { let a = self.cpu.hl(); self.cpu.a = self.bus_read(a); self.cpu.set_hl(a.wrapping_add(1)); 8 }
            0x3A => { let a = self.cpu.hl(); self.cpu.a = self.bus_read(a); self.cpu.set_hl(a.wrapping_sub(1)); 8 }

            // INC rr / DEC rr
            0x03 | 0x13 | 0x23 | 0x33 => { let i = (op >> 4) & 3; let v = self.read_r16(i).wrapping_add(1); self.write_r16(i, v); 8 }
            0x0B | 0x1B | 0x2B | 0x3B => { let i = (op >> 4) & 3; let v = self.read_r16(i).wrapping_sub(1); self.write_r16(i, v); 8 }

            // INC r8
            0x04 | 0x0C | 0x14 | 0x1C | 0x24 | 0x2C | 0x34 | 0x3C => {
                let i = (op >> 3) & 7;
                let v = self.read_r8(i);
                let r = self.alu_inc(v);
                self.write_r8(i, r);
                if i == 6 { 12 } else { 4 }
            }
            // DEC r8
            0x05 | 0x0D | 0x15 | 0x1D | 0x25 | 0x2D | 0x35 | 0x3D => {
                let i = (op >> 3) & 7;
                let v = self.read_r8(i);
                let r = self.alu_dec(v);
                self.write_r8(i, r);
                if i == 6 { 12 } else { 4 }
            }

            // LD r8, n
            0x06 | 0x0E | 0x16 | 0x1E | 0x26 | 0x2E | 0x36 | 0x3E => {
                let i = (op >> 3) & 7;
                let v = self.fetch_u8();
                self.write_r8(i, v);
                if i == 6 { 12 } else { 8 }
            }

            // Rotate A 指令
            0x07 => { // RLCA
                let a = self.cpu.a;
                let c = a >> 7;
                self.cpu.a = (a << 1) | c;
                self.cpu.f = 0; self.cpu.set_flag_c(c != 0);
                4
            }
            0x0F => { // RRCA
                let a = self.cpu.a;
                let c = a & 1;
                self.cpu.a = (a >> 1) | (c << 7);
                self.cpu.f = 0; self.cpu.set_flag_c(c != 0);
                4
            }
            0x17 => { // RLA
                let a = self.cpu.a;
                let old_c = if self.cpu.flag_c() { 1u8 } else { 0 };
                self.cpu.a = (a << 1) | old_c;
                self.cpu.f = 0; self.cpu.set_flag_c(a & 0x80 != 0);
                4
            }
            0x1F => { // RRA
                let a = self.cpu.a;
                let old_c = if self.cpu.flag_c() { 0x80u8 } else { 0 };
                self.cpu.a = (a >> 1) | old_c;
                self.cpu.f = 0; self.cpu.set_flag_c(a & 1 != 0);
                4
            }

            // ADD HL, rr
            0x09 | 0x19 | 0x29 | 0x39 => {
                let hl = self.cpu.hl();
                let rr = self.read_r16((op >> 4) & 3);
                let r = hl.wrapping_add(rr);
                self.cpu.set_flag_n(false);
                self.cpu.set_flag_h((hl & 0x0FFF) + (rr & 0x0FFF) > 0x0FFF);
                self.cpu.set_flag_c((hl as u32) + (rr as u32) > 0xFFFF);
                self.cpu.set_hl(r);
                8
            }

            // LD (nn), SP
            0x08 => {
                let addr = self.fetch_u16();
                let sp = self.cpu.sp;
                self.bus_write(addr, sp as u8);
                self.bus_write(addr.wrapping_add(1), (sp >> 8) as u8);
                20
            }

            // JR e / JR cc, e
            0x18 => { let e = self.fetch_u8() as i8; self.cpu.pc = self.cpu.pc.wrapping_add(e as u16); 12 }
            0x20 => { let e = self.fetch_u8() as i8; if !self.cpu.flag_z() { self.cpu.pc = self.cpu.pc.wrapping_add(e as u16); 12 } else { 8 } }
            0x28 => { let e = self.fetch_u8() as i8; if self.cpu.flag_z()  { self.cpu.pc = self.cpu.pc.wrapping_add(e as u16); 12 } else { 8 } }
            0x30 => { let e = self.fetch_u8() as i8; if !self.cpu.flag_c() { self.cpu.pc = self.cpu.pc.wrapping_add(e as u16); 12 } else { 8 } }
            0x38 => { let e = self.fetch_u8() as i8; if self.cpu.flag_c()  { self.cpu.pc = self.cpu.pc.wrapping_add(e as u16); 12 } else { 8 } }

            // DAA
            0x27 => {
                let mut a = self.cpu.a as u16;
                if !self.cpu.flag_n() {
                    if self.cpu.flag_h() || (a & 0x0F) > 9 { a += 6; }
                    if self.cpu.flag_c() || a > 0x9F { a += 0x60; }
                } else {
                    if self.cpu.flag_h() { a = (a.wrapping_sub(6)) & 0xFF; }
                    if self.cpu.flag_c() { a = a.wrapping_sub(0x60); }
                }
                self.cpu.a = a as u8;
                self.cpu.set_flag_z(self.cpu.a == 0);
                self.cpu.set_flag_h(false);
                if a >= 0x100 { self.cpu.set_flag_c(true); }
                4
            }
            0x2F => { self.cpu.a = !self.cpu.a; self.cpu.set_flag_n(true); self.cpu.set_flag_h(true); 4 } // CPL
            0x37 => { self.cpu.set_flag_n(false); self.cpu.set_flag_h(false); self.cpu.set_flag_c(true); 4 } // SCF
            0x3F => { self.cpu.set_flag_n(false); self.cpu.set_flag_h(false); let c = !self.cpu.flag_c(); self.cpu.set_flag_c(c); 4 } // CCF

            // ===== 0x40-0x7F: LD r, r' =====
            0x76 => {
                // HALT
                self.cpu.halted = true;
                if !self.cpu.ime && (self.if_reg & self.ie_reg & 0x1F) != 0 {
                    self.cpu.halted = false;
                    self.cpu.halt_bug = true;
                }
                4
            }
            0x40..=0x75 | 0x77..=0x7F => {
                let src = op & 7;
                let dst = (op >> 3) & 7;
                let v = self.read_r8(src);
                self.write_r8(dst, v);
                if src == 6 || dst == 6 { 8 } else { 4 }
            }

            // ===== 0x80-0xBF: ALU A, r =====
            0x80..=0xBF => {
                let src = op & 7;
                let v = self.read_r8(src);
                match (op >> 3) & 7 {
                    0 => self.alu_add(v),
                    1 => self.alu_adc(v),
                    2 => self.alu_sub(v),
                    3 => self.alu_sbc(v),
                    4 => self.alu_and(v),
                    5 => self.alu_xor(v),
                    6 => self.alu_or(v),
                    7 => self.alu_cp(v),
                    _ => unreachable!(),
                }
                if src == 6 { 8 } else { 4 }
            }

            // ===== 0xC0-0xFF: 跳轉、呼叫、返回、雜項 =====

            // RET cc
            0xC0 => { if !self.cpu.flag_z() { self.cpu.pc = self.pop_u16(); 20 } else { 8 } }
            0xC8 => { if self.cpu.flag_z()  { self.cpu.pc = self.pop_u16(); 20 } else { 8 } }
            0xD0 => { if !self.cpu.flag_c() { self.cpu.pc = self.pop_u16(); 20 } else { 8 } }
            0xD8 => { if self.cpu.flag_c()  { self.cpu.pc = self.pop_u16(); 20 } else { 8 } }

            // POP rr
            0xC1 => { let v = self.pop_u16(); self.cpu.set_bc(v); 12 }
            0xD1 => { let v = self.pop_u16(); self.cpu.set_de(v); 12 }
            0xE1 => { let v = self.pop_u16(); self.cpu.set_hl(v); 12 }
            0xF1 => { let v = self.pop_u16(); self.cpu.set_af(v); 12 }

            // JP cc, nn
            0xC2 => { let a = self.fetch_u16(); if !self.cpu.flag_z() { self.cpu.pc = a; 16 } else { 12 } }
            0xCA => { let a = self.fetch_u16(); if self.cpu.flag_z()  { self.cpu.pc = a; 16 } else { 12 } }
            0xD2 => { let a = self.fetch_u16(); if !self.cpu.flag_c() { self.cpu.pc = a; 16 } else { 12 } }
            0xDA => { let a = self.fetch_u16(); if self.cpu.flag_c()  { self.cpu.pc = a; 16 } else { 12 } }

            // JP nn
            0xC3 => { self.cpu.pc = self.fetch_u16(); 16 }
            // JP (HL)
            0xE9 => { self.cpu.pc = self.cpu.hl(); 4 }

            // CALL cc, nn
            0xC4 => { let a = self.fetch_u16(); if !self.cpu.flag_z() { self.push_u16(self.cpu.pc); self.cpu.pc = a; 24 } else { 12 } }
            0xCC => { let a = self.fetch_u16(); if self.cpu.flag_z()  { self.push_u16(self.cpu.pc); self.cpu.pc = a; 24 } else { 12 } }
            0xD4 => { let a = self.fetch_u16(); if !self.cpu.flag_c() { self.push_u16(self.cpu.pc); self.cpu.pc = a; 24 } else { 12 } }
            0xDC => { let a = self.fetch_u16(); if self.cpu.flag_c()  { self.push_u16(self.cpu.pc); self.cpu.pc = a; 24 } else { 12 } }

            // CALL nn
            0xCD => { let a = self.fetch_u16(); self.push_u16(self.cpu.pc); self.cpu.pc = a; 24 }

            // PUSH rr
            0xC5 => { let v = self.cpu.bc(); self.push_u16(v); 16 }
            0xD5 => { let v = self.cpu.de(); self.push_u16(v); 16 }
            0xE5 => { let v = self.cpu.hl(); self.push_u16(v); 16 }
            0xF5 => { let v = self.cpu.af(); self.push_u16(v); 16 }

            // ALU A, n
            0xC6 => { let v = self.fetch_u8(); self.alu_add(v); 8 }
            0xCE => { let v = self.fetch_u8(); self.alu_adc(v); 8 }
            0xD6 => { let v = self.fetch_u8(); self.alu_sub(v); 8 }
            0xDE => { let v = self.fetch_u8(); self.alu_sbc(v); 8 }
            0xE6 => { let v = self.fetch_u8(); self.alu_and(v); 8 }
            0xEE => { let v = self.fetch_u8(); self.alu_xor(v); 8 }
            0xF6 => { let v = self.fetch_u8(); self.alu_or(v); 8 }
            0xFE => { let v = self.fetch_u8(); self.alu_cp(v); 8 }

            // RST
            0xC7 => { self.push_u16(self.cpu.pc); self.cpu.pc = 0x00; 16 }
            0xCF => { self.push_u16(self.cpu.pc); self.cpu.pc = 0x08; 16 }
            0xD7 => { self.push_u16(self.cpu.pc); self.cpu.pc = 0x10; 16 }
            0xDF => { self.push_u16(self.cpu.pc); self.cpu.pc = 0x18; 16 }
            0xE7 => { self.push_u16(self.cpu.pc); self.cpu.pc = 0x20; 16 }
            0xEF => { self.push_u16(self.cpu.pc); self.cpu.pc = 0x28; 16 }
            0xF7 => { self.push_u16(self.cpu.pc); self.cpu.pc = 0x30; 16 }
            0xFF => { self.push_u16(self.cpu.pc); self.cpu.pc = 0x38; 16 }

            // RET / RETI
            0xC9 => { self.cpu.pc = self.pop_u16(); 16 }
            0xD9 => { self.cpu.pc = self.pop_u16(); self.cpu.ime = true; 16 } // RETI

            // CB 前綴
            0xCB => self.execute_cb(),

            // DI / EI
            0xF3 => { self.cpu.ime = false; 4 }
            0xFB => { self.cpu.ei_pending = true; 4 }

            // LDH (n), A / LDH A, (n)
            0xE0 => { let n = self.fetch_u8(); self.bus_write(0xFF00 + n as u16, self.cpu.a); 12 }
            0xF0 => { let n = self.fetch_u8(); self.cpu.a = self.bus_read(0xFF00 + n as u16); 12 }

            // LD (C), A / LD A, (C)
            0xE2 => { self.bus_write(0xFF00 + self.cpu.c as u16, self.cpu.a); 8 }
            0xF2 => { self.cpu.a = self.bus_read(0xFF00 + self.cpu.c as u16); 8 }

            // LD (nn), A / LD A, (nn)
            0xEA => { let a = self.fetch_u16(); self.bus_write(a, self.cpu.a); 16 }
            0xFA => { let a = self.fetch_u16(); self.cpu.a = self.bus_read(a); 16 }

            // ADD SP, e
            0xE8 => {
                let e = self.fetch_u8() as i8 as i16 as u16;
                let sp = self.cpu.sp;
                self.cpu.sp = sp.wrapping_add(e);
                self.cpu.f = 0;
                self.cpu.set_flag_h((sp & 0x0F) + (e & 0x0F) > 0x0F);
                self.cpu.set_flag_c((sp & 0xFF) + (e & 0xFF) > 0xFF);
                16
            }

            // LD HL, SP+e
            0xF8 => {
                let e = self.fetch_u8() as i8 as i16 as u16;
                let sp = self.cpu.sp;
                let r = sp.wrapping_add(e);
                self.cpu.f = 0;
                self.cpu.set_flag_h((sp & 0x0F) + (e & 0x0F) > 0x0F);
                self.cpu.set_flag_c((sp & 0xFF) + (e & 0xFF) > 0xFF);
                self.cpu.set_hl(r);
                12
            }

            // LD SP, HL
            0xF9 => { self.cpu.sp = self.cpu.hl(); 8 }

            // 無效 opcodes
            0xD3 | 0xDB | 0xDD | 0xE3 | 0xE4 | 0xEB | 0xEC | 0xED | 0xF4 | 0xFC | 0xFD => {
                // 非法指令，鎖死 CPU
                self.cpu.halted = true;
                4
            }
        }
    }

    // ===== CB 前綴指令 =====

    fn execute_cb(&mut self) -> u32 {
        let op = self.fetch_u8();
        let idx = op & 7;
        let val = self.read_r8(idx);
        let is_hl = idx == 6;

        match op {
            // 旋轉/移位 (0x00-0x3F)
            0x00..=0x07 => { let r = self.alu_rlc(val); self.write_r8(idx, r); if is_hl { 16 } else { 8 } }
            0x08..=0x0F => { let r = self.alu_rrc(val); self.write_r8(idx, r); if is_hl { 16 } else { 8 } }
            0x10..=0x17 => { let r = self.alu_rl(val); self.write_r8(idx, r); if is_hl { 16 } else { 8 } }
            0x18..=0x1F => { let r = self.alu_rr(val); self.write_r8(idx, r); if is_hl { 16 } else { 8 } }
            0x20..=0x27 => { let r = self.alu_sla(val); self.write_r8(idx, r); if is_hl { 16 } else { 8 } }
            0x28..=0x2F => { let r = self.alu_sra(val); self.write_r8(idx, r); if is_hl { 16 } else { 8 } }
            0x30..=0x37 => { let r = self.alu_swap(val); self.write_r8(idx, r); if is_hl { 16 } else { 8 } }
            0x38..=0x3F => { let r = self.alu_srl(val); self.write_r8(idx, r); if is_hl { 16 } else { 8 } }

            // BIT (0x40-0x7F): 只測試，不寫回
            0x40..=0x7F => {
                let bit = (op >> 3) & 7;
                self.cpu.set_flag_z(val & (1 << bit) == 0);
                self.cpu.set_flag_n(false);
                self.cpu.set_flag_h(true);
                if is_hl { 12 } else { 8 }
            }

            // RES (0x80-0xBF)
            0x80..=0xBF => {
                let bit = (op >> 3) & 7;
                let r = val & !(1 << bit);
                self.write_r8(idx, r);
                if is_hl { 16 } else { 8 }
            }

            // SET (0xC0-0xFF)
            0xC0..=0xFF => {
                let bit = (op >> 3) & 7;
                let r = val | (1 << bit);
                self.write_r8(idx, r);
                if is_hl { 16 } else { 8 }
            }
        }
    }

    // ===== 公開 API =====

    pub fn get_frame_buffer_ptr(&self) -> *const u8 { self.ppu.frame_buffer.as_ptr() }
    pub fn get_frame_buffer_len(&self) -> usize { self.ppu.frame_buffer.len() }
    pub fn screen_width(&self) -> u32 { 160 }
    pub fn screen_height(&self) -> u32 { 144 }
    pub fn set_audio_sample_rate(&mut self, rate: f64) { self.apu.set_sample_rate(rate); }
    pub fn get_audio_buffer_ptr(&self) -> *const f32 { self.apu.get_buffer_ptr() }
    pub fn get_audio_buffer_len(&self) -> usize { self.apu.get_available_samples() }
    pub fn consume_audio_samples(&mut self) -> usize { self.apu.consume_samples() }
    pub fn set_button(&mut self, _controller: u8, button: u8, pressed: bool) {
        let mut buttons = self.joypad.buttons;
        if pressed { buttons |= 1 << button; } else { buttons &= !(1 << button); }
        self.joypad.set_input(buttons);
    }
}
