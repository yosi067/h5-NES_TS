// ============================================================
// Game Gear / Master System 模擬器 — 整合所有元件
// ============================================================
// Z80 CPU 完整指令集 + 匯流排 + I/O 埠 + 主時鐘迴圈
// ============================================================

use super::cpu::*;
use super::vdp::Vdp;
use super::psg::Psg;
use super::cartridge::Cartridge;
use super::joypad::Joypad;

/// 每幀的掃描行數 × 每行週期
const CYCLES_PER_FRAME: u32 = 228 * 262; // ≈ 59736

pub struct GgEmulator {
    pub cpu: Cpu,
    pub vdp: Vdp,
    pub psg: Psg,
    pub cartridge: Cartridge,
    pub joypad: Joypad,

    // 系統 RAM
    pub ram: [u8; 0x2000], // 8KB 系統 RAM

    // GG 特殊 I/O
    pub is_game_gear: bool,
}

impl GgEmulator {
    pub fn new() -> Self {
        GgEmulator {
            cpu: Cpu::new(),
            vdp: Vdp::new(true),
            psg: Psg::new(),
            cartridge: Cartridge::new(),
            joypad: Joypad::new(),
            ram: [0; 0x2000],
            is_game_gear: true,
        }
    }

    pub fn load_rom(&mut self, data: &[u8]) -> bool {
        // 偵測是否為 SMS (預設 GG)
        self.is_game_gear = true;
        self.vdp = Vdp::new(true);

        if !self.cartridge.load(data, self.is_game_gear) {
            return false;
        }

        self.reset();
        true
    }

    pub fn load_rom_sms(&mut self, data: &[u8]) -> bool {
        self.is_game_gear = false;
        self.vdp = Vdp::new(false);

        if !self.cartridge.load(data, false) {
            return false;
        }

        self.reset();
        true
    }

    pub fn reset(&mut self) {
        self.cpu = Cpu::new();
        self.ram = [0; 0x2000];
        self.vdp.frame_complete = false;

        // 模擬 BIOS 後的初始化狀態
        // 設定 SP 為 BIOS 後典型值
        self.cpu.sp = 0xDFF0;

        // PSG: 靜音所有聲道 (volume = 0xF = 靜音)
        self.psg.write(0x9F); // CH0 vol = 0xF
        self.psg.write(0xBF); // CH1 vol = 0xF
        self.psg.write(0xDF); // CH2 vol = 0xF
        self.psg.write(0xFF); // Noise vol = 0xF
    }

    // ===== 執行一幀 =====

    pub fn frame(&mut self) {
        self.vdp.frame_complete = false;
        let mut cycles: u32 = 0;
        while !self.vdp.frame_complete && cycles < CYCLES_PER_FRAME + 1000 {
            let t = self.cpu_step();
            self.vdp.tick(t);
            self.psg.tick(t);
            // 檢查中斷
            if self.vdp.irq_pending && self.cpu.iff1 {
                self.handle_irq();
            }
            cycles += t;
        }
    }

    // ===== 中斷處理 =====

    fn handle_irq(&mut self) {
        if !self.cpu.iff1 { return; }
        self.cpu.halted = false;
        self.cpu.iff1 = false;
        self.cpu.iff2 = false;

        // 壓入 PC
        self.cpu.sp = self.cpu.sp.wrapping_sub(2);
        let sp = self.cpu.sp;
        let pc = self.cpu.pc;
        self.mem_write(sp, (pc & 0xFF) as u8);
        self.mem_write(sp + 1, (pc >> 8) as u8);

        match self.cpu.im {
            0 | 1 => {
                // IM 0/1: 跳至 $0038
                self.cpu.pc = 0x0038;
            }
            2 => {
                // IM 2: 向量中斷
                let vec_addr = (self.cpu.i as u16) << 8 | 0xFF;
                let lo = self.mem_read(vec_addr) as u16;
                let hi = self.mem_read(vec_addr.wrapping_add(1)) as u16;
                self.cpu.pc = lo | (hi << 8);
            }
            _ => { self.cpu.pc = 0x0038; }
        }
    }

    // ===== 記憶體匯流排 =====

    pub fn mem_read(&self, addr: u16) -> u8 {
        match addr {
            0x0000..=0xBFFF => self.cartridge.read(addr),
            0xC000..=0xDFFF => self.ram[(addr - 0xC000) as usize],
            0xE000..=0xFFFF => {
                // 鏡像 RAM + Mapper 暫存器
                if addr >= 0xFFFC {
                    // Mapper 暫存器讀回 (從 RAM 鏡像)
                    self.ram[(addr - 0xE000) as usize]
                } else {
                    self.ram[(addr - 0xE000) as usize]
                }
            }
        }
    }

    pub fn mem_write(&mut self, addr: u16, val: u8) {
        match addr {
            0x0000..=0xBFFF => {
                self.cartridge.write(addr, val);
            }
            0xC000..=0xDFFF => {
                self.ram[(addr - 0xC000) as usize] = val;
            }
            0xE000..=0xFFFF => {
                self.ram[(addr - 0xE000) as usize] = val;
                // Sega Mapper 暫存器 ($FFFC-$FFFF)
                if addr >= 0xFFFC {
                    self.cartridge.write_mapper_reg(addr, val);
                }
            }
        }
    }

    // ===== I/O 埠 =====

    fn io_read(&mut self, port: u8) -> u8 {
        if self.is_game_gear && port < 0x07 {
            // GG 特殊端口
            match port {
                0x00 => self.joypad.read_gg_port_00(),
                0x01..=0x06 => 0xFF, // GG link/stereo
                _ => 0xFF,
            }
        } else {
            match port & 0xC1 {
                0x40 => self.vdp.read_v_counter(),  // $7E mirror
                0x41 => self.vdp.read_h_counter(),  // $7F mirror
                0x80 => self.vdp.read_data(),        // VDP data
                0x81 => self.vdp.read_control(),     // VDP control/status
                0xC0 => self.joypad.read_port_dc(),  // Joypad port A
                0xC1 => self.joypad.read_port_dd(),  // Joypad port B
                _ => 0xFF,
            }
        }
    }

    fn io_write(&mut self, port: u8, val: u8) {
        if self.is_game_gear && port < 0x07 {
            match port {
                0x06 => self.psg.write_stereo(val), // GG 立體聲
                _ => {} // GG link ports 忽略
            }
        } else {
            match port & 0xC1 {
                0x40 | 0x41 => self.psg.write(val),  // PSG
                0x80 => self.vdp.write_data(val),     // VDP data
                0x81 => self.vdp.write_control(val),  // VDP control
                _ => {}
            }
        }
    }

    // ===== CPU 輔助 =====

    fn fetch_u8(&mut self) -> u8 {
        let val = self.mem_read(self.cpu.pc);
        self.cpu.pc = self.cpu.pc.wrapping_add(1);
        val
    }

    fn fetch_u16(&mut self) -> u16 {
        let lo = self.fetch_u8() as u16;
        let hi = self.fetch_u8() as u16;
        lo | (hi << 8)
    }

    fn push_u16(&mut self, val: u16) {
        self.cpu.sp = self.cpu.sp.wrapping_sub(2);
        self.mem_write(self.cpu.sp, (val & 0xFF) as u8);
        self.mem_write(self.cpu.sp + 1, (val >> 8) as u8);
    }

    fn pop_u16(&mut self) -> u16 {
        let lo = self.mem_read(self.cpu.sp) as u16;
        let hi = self.mem_read(self.cpu.sp + 1) as u16;
        self.cpu.sp = self.cpu.sp.wrapping_add(2);
        lo | (hi << 8)
    }

    // ===== CPU 執行一步 =====

    pub fn cpu_step(&mut self) -> u32 {
        // 處理 EI 延遲
        if self.cpu.ei_pending {
            self.cpu.ei_pending = false;
            self.cpu.iff1 = true;
            self.cpu.iff2 = true;
        }

        if self.cpu.halted {
            self.cpu.inc_r();
            return 4;
        }

        self.cpu.inc_r();
        let op = self.fetch_u8();
        self.execute(op)
    }

    fn execute(&mut self, op: u8) -> u32 {
        match op {
            // ===== 8-bit Load =====
            // LD r, r'
            0x40 => { 4 } // LD B, B (nop)
            0x41 => { self.cpu.b = self.cpu.c; 4 }
            0x42 => { self.cpu.b = self.cpu.d; 4 }
            0x43 => { self.cpu.b = self.cpu.e; 4 }
            0x44 => { self.cpu.b = self.cpu.h; 4 }
            0x45 => { self.cpu.b = self.cpu.l; 4 }
            0x46 => { let addr = self.cpu.hl(); self.cpu.b = self.mem_read(addr); 7 }
            0x47 => { self.cpu.b = self.cpu.a; 4 }
            0x48 => { self.cpu.c = self.cpu.b; 4 }
            0x49 => { 4 } // LD C, C
            0x4A => { self.cpu.c = self.cpu.d; 4 }
            0x4B => { self.cpu.c = self.cpu.e; 4 }
            0x4C => { self.cpu.c = self.cpu.h; 4 }
            0x4D => { self.cpu.c = self.cpu.l; 4 }
            0x4E => { let addr = self.cpu.hl(); self.cpu.c = self.mem_read(addr); 7 }
            0x4F => { self.cpu.c = self.cpu.a; 4 }
            0x50 => { self.cpu.d = self.cpu.b; 4 }
            0x51 => { self.cpu.d = self.cpu.c; 4 }
            0x52 => { 4 } // LD D, D
            0x53 => { self.cpu.d = self.cpu.e; 4 }
            0x54 => { self.cpu.d = self.cpu.h; 4 }
            0x55 => { self.cpu.d = self.cpu.l; 4 }
            0x56 => { let addr = self.cpu.hl(); self.cpu.d = self.mem_read(addr); 7 }
            0x57 => { self.cpu.d = self.cpu.a; 4 }
            0x58 => { self.cpu.e = self.cpu.b; 4 }
            0x59 => { self.cpu.e = self.cpu.c; 4 }
            0x5A => { self.cpu.e = self.cpu.d; 4 }
            0x5B => { 4 } // LD E, E
            0x5C => { self.cpu.e = self.cpu.h; 4 }
            0x5D => { self.cpu.e = self.cpu.l; 4 }
            0x5E => { let addr = self.cpu.hl(); self.cpu.e = self.mem_read(addr); 7 }
            0x5F => { self.cpu.e = self.cpu.a; 4 }
            0x60 => { self.cpu.h = self.cpu.b; 4 }
            0x61 => { self.cpu.h = self.cpu.c; 4 }
            0x62 => { self.cpu.h = self.cpu.d; 4 }
            0x63 => { self.cpu.h = self.cpu.e; 4 }
            0x64 => { 4 } // LD H, H
            0x65 => { self.cpu.h = self.cpu.l; 4 }
            0x66 => { let addr = self.cpu.hl(); self.cpu.h = self.mem_read(addr); 7 }
            0x67 => { self.cpu.h = self.cpu.a; 4 }
            0x68 => { self.cpu.l = self.cpu.b; 4 }
            0x69 => { self.cpu.l = self.cpu.c; 4 }
            0x6A => { self.cpu.l = self.cpu.d; 4 }
            0x6B => { self.cpu.l = self.cpu.e; 4 }
            0x6C => { self.cpu.l = self.cpu.h; 4 }
            0x6D => { 4 } // LD L, L
            0x6E => { let addr = self.cpu.hl(); self.cpu.l = self.mem_read(addr); 7 }
            0x6F => { self.cpu.l = self.cpu.a; 4 }
            0x70 => { let addr = self.cpu.hl(); self.mem_write(addr, self.cpu.b); 7 }
            0x71 => { let addr = self.cpu.hl(); self.mem_write(addr, self.cpu.c); 7 }
            0x72 => { let addr = self.cpu.hl(); self.mem_write(addr, self.cpu.d); 7 }
            0x73 => { let addr = self.cpu.hl(); self.mem_write(addr, self.cpu.e); 7 }
            0x74 => { let addr = self.cpu.hl(); self.mem_write(addr, self.cpu.h); 7 }
            0x75 => { let addr = self.cpu.hl(); self.mem_write(addr, self.cpu.l); 7 }
            // 0x76 = HALT (below)
            0x77 => { let addr = self.cpu.hl(); self.mem_write(addr, self.cpu.a); 7 }
            0x78 => { self.cpu.a = self.cpu.b; 4 }
            0x79 => { self.cpu.a = self.cpu.c; 4 }
            0x7A => { self.cpu.a = self.cpu.d; 4 }
            0x7B => { self.cpu.a = self.cpu.e; 4 }
            0x7C => { self.cpu.a = self.cpu.h; 4 }
            0x7D => { self.cpu.a = self.cpu.l; 4 }
            0x7E => { let addr = self.cpu.hl(); self.cpu.a = self.mem_read(addr); 7 }
            0x7F => { 4 } // LD A, A

            // LD r, n
            0x06 => { self.cpu.b = self.fetch_u8(); 7 }
            0x0E => { self.cpu.c = self.fetch_u8(); 7 }
            0x16 => { self.cpu.d = self.fetch_u8(); 7 }
            0x1E => { self.cpu.e = self.fetch_u8(); 7 }
            0x26 => { self.cpu.h = self.fetch_u8(); 7 }
            0x2E => { self.cpu.l = self.fetch_u8(); 7 }
            0x36 => { let n = self.fetch_u8(); let addr = self.cpu.hl(); self.mem_write(addr, n); 10 }
            0x3E => { self.cpu.a = self.fetch_u8(); 7 }

            // LD A, (rr)
            0x0A => { let addr = self.cpu.bc(); self.cpu.a = self.mem_read(addr); 7 }
            0x1A => { let addr = self.cpu.de(); self.cpu.a = self.mem_read(addr); 7 }
            0x3A => { let addr = self.fetch_u16(); self.cpu.a = self.mem_read(addr); 13 }

            // LD (rr), A
            0x02 => { let addr = self.cpu.bc(); self.mem_write(addr, self.cpu.a); 7 }
            0x12 => { let addr = self.cpu.de(); self.mem_write(addr, self.cpu.a); 7 }
            0x32 => { let addr = self.fetch_u16(); self.mem_write(addr, self.cpu.a); 13 }

            // LD (nn), HL / LD HL, (nn)
            0x22 => { let addr = self.fetch_u16(); let hl = self.cpu.hl(); self.mem_write(addr, (hl & 0xFF) as u8); self.mem_write(addr + 1, (hl >> 8) as u8); 16 }
            0x2A => { let addr = self.fetch_u16(); let lo = self.mem_read(addr) as u16; let hi = self.mem_read(addr + 1) as u16; self.cpu.set_hl(lo | (hi << 8)); 16 }

            // ===== 16-bit Load =====
            0x01 => { let v = self.fetch_u16(); self.cpu.set_bc(v); 10 }
            0x11 => { let v = self.fetch_u16(); self.cpu.set_de(v); 10 }
            0x21 => { let v = self.fetch_u16(); self.cpu.set_hl(v); 10 }
            0x31 => { self.cpu.sp = self.fetch_u16(); 10 }

            // LD SP, HL
            0xF9 => { self.cpu.sp = self.cpu.hl(); 6 }

            // PUSH/POP
            0xC5 => { let v = self.cpu.bc(); self.push_u16(v); 11 }
            0xD5 => { let v = self.cpu.de(); self.push_u16(v); 11 }
            0xE5 => { let v = self.cpu.hl(); self.push_u16(v); 11 }
            0xF5 => { let v = self.cpu.af(); self.push_u16(v); 11 }
            0xC1 => { let v = self.pop_u16(); self.cpu.set_bc(v); 10 }
            0xD1 => { let v = self.pop_u16(); self.cpu.set_de(v); 10 }
            0xE1 => { let v = self.pop_u16(); self.cpu.set_hl(v); 10 }
            0xF1 => { let v = self.pop_u16(); self.cpu.set_af(v); 10 }

            // ===== 8-bit ALU =====
            // ADD A, r
            0x80 => { let v = self.cpu.b; self.alu_add(v, false); 4 }
            0x81 => { let v = self.cpu.c; self.alu_add(v, false); 4 }
            0x82 => { let v = self.cpu.d; self.alu_add(v, false); 4 }
            0x83 => { let v = self.cpu.e; self.alu_add(v, false); 4 }
            0x84 => { let v = self.cpu.h; self.alu_add(v, false); 4 }
            0x85 => { let v = self.cpu.l; self.alu_add(v, false); 4 }
            0x86 => { let addr = self.cpu.hl(); let v = self.mem_read(addr); self.alu_add(v, false); 7 }
            0x87 => { let v = self.cpu.a; self.alu_add(v, false); 4 }
            // ADC A, r
            0x88 => { let v = self.cpu.b; self.alu_add(v, true); 4 }
            0x89 => { let v = self.cpu.c; self.alu_add(v, true); 4 }
            0x8A => { let v = self.cpu.d; self.alu_add(v, true); 4 }
            0x8B => { let v = self.cpu.e; self.alu_add(v, true); 4 }
            0x8C => { let v = self.cpu.h; self.alu_add(v, true); 4 }
            0x8D => { let v = self.cpu.l; self.alu_add(v, true); 4 }
            0x8E => { let addr = self.cpu.hl(); let v = self.mem_read(addr); self.alu_add(v, true); 7 }
            0x8F => { let v = self.cpu.a; self.alu_add(v, true); 4 }
            // SUB r
            0x90 => { let v = self.cpu.b; self.alu_sub(v, false); 4 }
            0x91 => { let v = self.cpu.c; self.alu_sub(v, false); 4 }
            0x92 => { let v = self.cpu.d; self.alu_sub(v, false); 4 }
            0x93 => { let v = self.cpu.e; self.alu_sub(v, false); 4 }
            0x94 => { let v = self.cpu.h; self.alu_sub(v, false); 4 }
            0x95 => { let v = self.cpu.l; self.alu_sub(v, false); 4 }
            0x96 => { let addr = self.cpu.hl(); let v = self.mem_read(addr); self.alu_sub(v, false); 7 }
            0x97 => { let v = self.cpu.a; self.alu_sub(v, false); 4 }
            // SBC A, r
            0x98 => { let v = self.cpu.b; self.alu_sub(v, true); 4 }
            0x99 => { let v = self.cpu.c; self.alu_sub(v, true); 4 }
            0x9A => { let v = self.cpu.d; self.alu_sub(v, true); 4 }
            0x9B => { let v = self.cpu.e; self.alu_sub(v, true); 4 }
            0x9C => { let v = self.cpu.h; self.alu_sub(v, true); 4 }
            0x9D => { let v = self.cpu.l; self.alu_sub(v, true); 4 }
            0x9E => { let addr = self.cpu.hl(); let v = self.mem_read(addr); self.alu_sub(v, true); 7 }
            0x9F => { let v = self.cpu.a; self.alu_sub(v, true); 4 }
            // AND r
            0xA0 => { let v = self.cpu.b; self.alu_and(v); 4 }
            0xA1 => { let v = self.cpu.c; self.alu_and(v); 4 }
            0xA2 => { let v = self.cpu.d; self.alu_and(v); 4 }
            0xA3 => { let v = self.cpu.e; self.alu_and(v); 4 }
            0xA4 => { let v = self.cpu.h; self.alu_and(v); 4 }
            0xA5 => { let v = self.cpu.l; self.alu_and(v); 4 }
            0xA6 => { let addr = self.cpu.hl(); let v = self.mem_read(addr); self.alu_and(v); 7 }
            0xA7 => { let v = self.cpu.a; self.alu_and(v); 4 }
            // XOR r
            0xA8 => { let v = self.cpu.b; self.alu_xor(v); 4 }
            0xA9 => { let v = self.cpu.c; self.alu_xor(v); 4 }
            0xAA => { let v = self.cpu.d; self.alu_xor(v); 4 }
            0xAB => { let v = self.cpu.e; self.alu_xor(v); 4 }
            0xAC => { let v = self.cpu.h; self.alu_xor(v); 4 }
            0xAD => { let v = self.cpu.l; self.alu_xor(v); 4 }
            0xAE => { let addr = self.cpu.hl(); let v = self.mem_read(addr); self.alu_xor(v); 7 }
            0xAF => { let v = self.cpu.a; self.alu_xor(v); 4 }
            // OR r
            0xB0 => { let v = self.cpu.b; self.alu_or(v); 4 }
            0xB1 => { let v = self.cpu.c; self.alu_or(v); 4 }
            0xB2 => { let v = self.cpu.d; self.alu_or(v); 4 }
            0xB3 => { let v = self.cpu.e; self.alu_or(v); 4 }
            0xB4 => { let v = self.cpu.h; self.alu_or(v); 4 }
            0xB5 => { let v = self.cpu.l; self.alu_or(v); 4 }
            0xB6 => { let addr = self.cpu.hl(); let v = self.mem_read(addr); self.alu_or(v); 7 }
            0xB7 => { let v = self.cpu.a; self.alu_or(v); 4 }
            // CP r
            0xB8 => { let v = self.cpu.b; self.alu_cp(v); 4 }
            0xB9 => { let v = self.cpu.c; self.alu_cp(v); 4 }
            0xBA => { let v = self.cpu.d; self.alu_cp(v); 4 }
            0xBB => { let v = self.cpu.e; self.alu_cp(v); 4 }
            0xBC => { let v = self.cpu.h; self.alu_cp(v); 4 }
            0xBD => { let v = self.cpu.l; self.alu_cp(v); 4 }
            0xBE => { let addr = self.cpu.hl(); let v = self.mem_read(addr); self.alu_cp(v); 7 }
            0xBF => { let v = self.cpu.a; self.alu_cp(v); 4 }

            // ALU A, n
            0xC6 => { let n = self.fetch_u8(); self.alu_add(n, false); 7 }
            0xCE => { let n = self.fetch_u8(); self.alu_add(n, true); 7 }
            0xD6 => { let n = self.fetch_u8(); self.alu_sub(n, false); 7 }
            0xDE => { let n = self.fetch_u8(); self.alu_sub(n, true); 7 }
            0xE6 => { let n = self.fetch_u8(); self.alu_and(n); 7 }
            0xEE => { let n = self.fetch_u8(); self.alu_xor(n); 7 }
            0xF6 => { let n = self.fetch_u8(); self.alu_or(n); 7 }
            0xFE => { let n = self.fetch_u8(); self.alu_cp(n); 7 }

            // INC/DEC r
            0x04 => { self.cpu.b = self.alu_inc(self.cpu.b); 4 }
            0x0C => { self.cpu.c = self.alu_inc(self.cpu.c); 4 }
            0x14 => { self.cpu.d = self.alu_inc(self.cpu.d); 4 }
            0x1C => { self.cpu.e = self.alu_inc(self.cpu.e); 4 }
            0x24 => { self.cpu.h = self.alu_inc(self.cpu.h); 4 }
            0x2C => { self.cpu.l = self.alu_inc(self.cpu.l); 4 }
            0x34 => { let addr = self.cpu.hl(); let v = self.mem_read(addr); let r = self.alu_inc(v); self.mem_write(addr, r); 11 }
            0x3C => { self.cpu.a = self.alu_inc(self.cpu.a); 4 }
            0x05 => { self.cpu.b = self.alu_dec(self.cpu.b); 4 }
            0x0D => { self.cpu.c = self.alu_dec(self.cpu.c); 4 }
            0x15 => { self.cpu.d = self.alu_dec(self.cpu.d); 4 }
            0x1D => { self.cpu.e = self.alu_dec(self.cpu.e); 4 }
            0x25 => { self.cpu.h = self.alu_dec(self.cpu.h); 4 }
            0x2D => { self.cpu.l = self.alu_dec(self.cpu.l); 4 }
            0x35 => { let addr = self.cpu.hl(); let v = self.mem_read(addr); let r = self.alu_dec(v); self.mem_write(addr, r); 11 }
            0x3D => { self.cpu.a = self.alu_dec(self.cpu.a); 4 }

            // ===== 16-bit ALU =====
            // ADD HL, rr
            0x09 => { let v = self.cpu.bc(); self.alu_add_hl(v); 11 }
            0x19 => { let v = self.cpu.de(); self.alu_add_hl(v); 11 }
            0x29 => { let v = self.cpu.hl(); self.alu_add_hl(v); 11 }
            0x39 => { let v = self.cpu.sp; self.alu_add_hl(v); 11 }

            // INC/DEC rr
            0x03 => { let v = self.cpu.bc().wrapping_add(1); self.cpu.set_bc(v); 6 }
            0x13 => { let v = self.cpu.de().wrapping_add(1); self.cpu.set_de(v); 6 }
            0x23 => { let v = self.cpu.hl().wrapping_add(1); self.cpu.set_hl(v); 6 }
            0x33 => { self.cpu.sp = self.cpu.sp.wrapping_add(1); 6 }
            0x0B => { let v = self.cpu.bc().wrapping_sub(1); self.cpu.set_bc(v); 6 }
            0x1B => { let v = self.cpu.de().wrapping_sub(1); self.cpu.set_de(v); 6 }
            0x2B => { let v = self.cpu.hl().wrapping_sub(1); self.cpu.set_hl(v); 6 }
            0x3B => { self.cpu.sp = self.cpu.sp.wrapping_sub(1); 6 }

            // ===== 旋轉 / 位移 (Accumulator) =====
            0x07 => { // RLCA
                let a = self.cpu.a;
                let c = (a >> 7) & 1;
                self.cpu.a = (a << 1) | c;
                self.cpu.f = (self.cpu.f & (FLAG_S | FLAG_Z | FLAG_PV)) | (self.cpu.a & (FLAG_3 | FLAG_5));
                self.cpu.set_flag(FLAG_C, c != 0);
                self.cpu.set_flag(FLAG_H, false);
                self.cpu.set_flag(FLAG_N, false);
                4
            }
            0x0F => { // RRCA
                let a = self.cpu.a;
                let c = a & 1;
                self.cpu.a = (a >> 1) | (c << 7);
                self.cpu.f = (self.cpu.f & (FLAG_S | FLAG_Z | FLAG_PV)) | (self.cpu.a & (FLAG_3 | FLAG_5));
                self.cpu.set_flag(FLAG_C, c != 0);
                self.cpu.set_flag(FLAG_H, false);
                self.cpu.set_flag(FLAG_N, false);
                4
            }
            0x17 => { // RLA
                let a = self.cpu.a;
                let old_c = if self.cpu.flag(FLAG_C) { 1u8 } else { 0 };
                let new_c = (a >> 7) & 1;
                self.cpu.a = (a << 1) | old_c;
                self.cpu.f = (self.cpu.f & (FLAG_S | FLAG_Z | FLAG_PV)) | (self.cpu.a & (FLAG_3 | FLAG_5));
                self.cpu.set_flag(FLAG_C, new_c != 0);
                self.cpu.set_flag(FLAG_H, false);
                self.cpu.set_flag(FLAG_N, false);
                4
            }
            0x1F => { // RRA
                let a = self.cpu.a;
                let old_c = if self.cpu.flag(FLAG_C) { 0x80u8 } else { 0 };
                let new_c = a & 1;
                self.cpu.a = (a >> 1) | old_c;
                self.cpu.f = (self.cpu.f & (FLAG_S | FLAG_Z | FLAG_PV)) | (self.cpu.a & (FLAG_3 | FLAG_5));
                self.cpu.set_flag(FLAG_C, new_c != 0);
                self.cpu.set_flag(FLAG_H, false);
                self.cpu.set_flag(FLAG_N, false);
                4
            }

            // ===== 雜項 =====
            0x00 => { 4 } // NOP
            0x76 => { self.cpu.halted = true; 4 } // HALT
            0x27 => { self.alu_daa(); 4 } // DAA
            0x2F => { // CPL
                self.cpu.a = !self.cpu.a;
                self.cpu.set_flag(FLAG_H, true);
                self.cpu.set_flag(FLAG_N, true);
                self.cpu.set_undoc(self.cpu.a);
                4
            }
            0x37 => { // SCF
                self.cpu.set_flag(FLAG_C, true);
                self.cpu.set_flag(FLAG_H, false);
                self.cpu.set_flag(FLAG_N, false);
                self.cpu.set_undoc(self.cpu.a);
                4
            }
            0x3F => { // CCF
                let old_c = self.cpu.flag(FLAG_C);
                self.cpu.set_flag(FLAG_H, old_c);
                self.cpu.set_flag(FLAG_C, !old_c);
                self.cpu.set_flag(FLAG_N, false);
                self.cpu.set_undoc(self.cpu.a);
                4
            }

            // ===== 跳轉 =====
            0xC3 => { self.cpu.pc = self.fetch_u16(); 10 } // JP nn
            0xE9 => { self.cpu.pc = self.cpu.hl(); 4 } // JP (HL)

            // JP cc, nn
            0xC2 => { let addr = self.fetch_u16(); if !self.cpu.flag(FLAG_Z) { self.cpu.pc = addr; } 10 }
            0xCA => { let addr = self.fetch_u16(); if self.cpu.flag(FLAG_Z) { self.cpu.pc = addr; } 10 }
            0xD2 => { let addr = self.fetch_u16(); if !self.cpu.flag(FLAG_C) { self.cpu.pc = addr; } 10 }
            0xDA => { let addr = self.fetch_u16(); if self.cpu.flag(FLAG_C) { self.cpu.pc = addr; } 10 }
            0xE2 => { let addr = self.fetch_u16(); if !self.cpu.flag(FLAG_PV) { self.cpu.pc = addr; } 10 }
            0xEA => { let addr = self.fetch_u16(); if self.cpu.flag(FLAG_PV) { self.cpu.pc = addr; } 10 }
            0xF2 => { let addr = self.fetch_u16(); if !self.cpu.flag(FLAG_S) { self.cpu.pc = addr; } 10 }
            0xFA => { let addr = self.fetch_u16(); if self.cpu.flag(FLAG_S) { self.cpu.pc = addr; } 10 }

            // JR e
            0x18 => { let e = self.fetch_u8() as i8; self.cpu.pc = self.cpu.pc.wrapping_add(e as u16); 12 }
            0x20 => { let e = self.fetch_u8() as i8; if !self.cpu.flag(FLAG_Z) { self.cpu.pc = self.cpu.pc.wrapping_add(e as u16); 12 } else { 7 } }
            0x28 => { let e = self.fetch_u8() as i8; if self.cpu.flag(FLAG_Z) { self.cpu.pc = self.cpu.pc.wrapping_add(e as u16); 12 } else { 7 } }
            0x30 => { let e = self.fetch_u8() as i8; if !self.cpu.flag(FLAG_C) { self.cpu.pc = self.cpu.pc.wrapping_add(e as u16); 12 } else { 7 } }
            0x38 => { let e = self.fetch_u8() as i8; if self.cpu.flag(FLAG_C) { self.cpu.pc = self.cpu.pc.wrapping_add(e as u16); 12 } else { 7 } }

            // DJNZ
            0x10 => {
                let e = self.fetch_u8() as i8;
                self.cpu.b = self.cpu.b.wrapping_sub(1);
                if self.cpu.b != 0 {
                    self.cpu.pc = self.cpu.pc.wrapping_add(e as u16);
                    13
                } else { 8 }
            }

            // ===== CALL / RET =====
            0xCD => { let addr = self.fetch_u16(); let pc = self.cpu.pc; self.push_u16(pc); self.cpu.pc = addr; 17 }
            // CALL cc, nn
            0xC4 => { let addr = self.fetch_u16(); if !self.cpu.flag(FLAG_Z) { let pc = self.cpu.pc; self.push_u16(pc); self.cpu.pc = addr; 17 } else { 10 } }
            0xCC => { let addr = self.fetch_u16(); if self.cpu.flag(FLAG_Z) { let pc = self.cpu.pc; self.push_u16(pc); self.cpu.pc = addr; 17 } else { 10 } }
            0xD4 => { let addr = self.fetch_u16(); if !self.cpu.flag(FLAG_C) { let pc = self.cpu.pc; self.push_u16(pc); self.cpu.pc = addr; 17 } else { 10 } }
            0xDC => { let addr = self.fetch_u16(); if self.cpu.flag(FLAG_C) { let pc = self.cpu.pc; self.push_u16(pc); self.cpu.pc = addr; 17 } else { 10 } }
            0xE4 => { let addr = self.fetch_u16(); if !self.cpu.flag(FLAG_PV) { let pc = self.cpu.pc; self.push_u16(pc); self.cpu.pc = addr; 17 } else { 10 } }
            0xEC => { let addr = self.fetch_u16(); if self.cpu.flag(FLAG_PV) { let pc = self.cpu.pc; self.push_u16(pc); self.cpu.pc = addr; 17 } else { 10 } }
            0xF4 => { let addr = self.fetch_u16(); if !self.cpu.flag(FLAG_S) { let pc = self.cpu.pc; self.push_u16(pc); self.cpu.pc = addr; 17 } else { 10 } }
            0xFC => { let addr = self.fetch_u16(); if self.cpu.flag(FLAG_S) { let pc = self.cpu.pc; self.push_u16(pc); self.cpu.pc = addr; 17 } else { 10 } }

            0xC9 => { self.cpu.pc = self.pop_u16(); 10 } // RET
            // RET cc
            0xC0 => { if !self.cpu.flag(FLAG_Z) { self.cpu.pc = self.pop_u16(); 11 } else { 5 } }
            0xC8 => { if self.cpu.flag(FLAG_Z) { self.cpu.pc = self.pop_u16(); 11 } else { 5 } }
            0xD0 => { if !self.cpu.flag(FLAG_C) { self.cpu.pc = self.pop_u16(); 11 } else { 5 } }
            0xD8 => { if self.cpu.flag(FLAG_C) { self.cpu.pc = self.pop_u16(); 11 } else { 5 } }
            0xE0 => { if !self.cpu.flag(FLAG_PV) { self.cpu.pc = self.pop_u16(); 11 } else { 5 } }
            0xE8 => { if self.cpu.flag(FLAG_PV) { self.cpu.pc = self.pop_u16(); 11 } else { 5 } }
            0xF0 => { if !self.cpu.flag(FLAG_S) { self.cpu.pc = self.pop_u16(); 11 } else { 5 } }
            0xF8 => { if self.cpu.flag(FLAG_S) { self.cpu.pc = self.pop_u16(); 11 } else { 5 } }

            // RST
            0xC7 => { let pc = self.cpu.pc; self.push_u16(pc); self.cpu.pc = 0x00; 11 }
            0xCF => { let pc = self.cpu.pc; self.push_u16(pc); self.cpu.pc = 0x08; 11 }
            0xD7 => { let pc = self.cpu.pc; self.push_u16(pc); self.cpu.pc = 0x10; 11 }
            0xDF => { let pc = self.cpu.pc; self.push_u16(pc); self.cpu.pc = 0x18; 11 }
            0xE7 => { let pc = self.cpu.pc; self.push_u16(pc); self.cpu.pc = 0x20; 11 }
            0xEF => { let pc = self.cpu.pc; self.push_u16(pc); self.cpu.pc = 0x28; 11 }
            0xF7 => { let pc = self.cpu.pc; self.push_u16(pc); self.cpu.pc = 0x30; 11 }
            0xFF => { let pc = self.cpu.pc; self.push_u16(pc); self.cpu.pc = 0x38; 11 }

            // ===== I/O =====
            0xD3 => { // OUT (n), A
                let port = self.fetch_u8();
                self.io_write(port, self.cpu.a);
                11
            }
            0xDB => { // IN A, (n)
                let port = self.fetch_u8();
                self.cpu.a = self.io_read(port);
                11
            }

            // ===== Exchange =====
            0x08 => { self.cpu.ex_af(); 4 } // EX AF, AF'
            0xD9 => { self.cpu.exx(); 4 } // EXX
            0xEB => { // EX DE, HL
                let de = self.cpu.de();
                let hl = self.cpu.hl();
                self.cpu.set_de(hl);
                self.cpu.set_hl(de);
                4
            }
            0xE3 => { // EX (SP), HL
                let sp = self.cpu.sp;
                let lo = self.mem_read(sp);
                let hi = self.mem_read(sp + 1);
                self.mem_write(sp, self.cpu.l);
                self.mem_write(sp + 1, self.cpu.h);
                self.cpu.l = lo;
                self.cpu.h = hi;
                19
            }

            // ===== Interrupt =====
            0xF3 => { self.cpu.iff1 = false; self.cpu.iff2 = false; 4 } // DI
            0xFB => { self.cpu.ei_pending = true; 4 } // EI

            // ===== Prefix =====
            0xCB => { self.cpu.inc_r(); self.execute_cb() }
            0xDD => { self.cpu.inc_r(); self.execute_dd() } // IX prefix
            0xFD => { self.cpu.inc_r(); self.execute_fd() } // IY prefix
            0xED => { self.cpu.inc_r(); self.execute_ed() }

            // ===== 未使用 opcodes → NOP =====
            _ => 4,
        }
    }

    // ===== CB 前綴：位元旋轉/移位/測試/設定/重置 =====

    fn execute_cb(&mut self) -> u32 {
        let op = self.fetch_u8();
        let idx = op & 7;
        let val = self.read_r8(idx);
        let is_hl = idx == 6;

        let result = match op >> 3 {
            0 => self.cb_rlc(val),
            1 => self.cb_rrc(val),
            2 => self.cb_rl(val),
            3 => self.cb_rr(val),
            4 => self.cb_sla(val),
            5 => self.cb_sra(val),
            6 => self.cb_sll(val),  // SLL (undocumented)
            7 => self.cb_srl(val),
            // BIT
            8..=15 => {
                let bit = (op >> 3) & 7;
                self.cpu.set_flag(FLAG_Z, val & (1 << bit) == 0);
                self.cpu.set_flag(FLAG_H, true);
                self.cpu.set_flag(FLAG_N, false);
                if is_hl {
                    self.cpu.set_flag(FLAG_PV, val & (1 << bit) == 0);
                } else {
                    self.cpu.set_flag(FLAG_PV, val & (1 << bit) == 0);
                    self.cpu.set_undoc(val);
                }
                self.cpu.set_flag(FLAG_S, bit == 7 && val & 0x80 != 0);
                return if is_hl { 12 } else { 8 };
            }
            // RES
            16..=23 => {
                let bit = (op >> 3) & 7;
                val & !(1 << bit)
            }
            // SET
            24..=31 => {
                let bit = (op >> 3) & 7;
                val | (1 << bit)
            }
            _ => val,
        };

        self.write_r8(idx, result);
        if is_hl { 15 } else { 8 }
    }

    // ===== DD 前綴 (IX) =====

    fn execute_dd(&mut self) -> u32 {
        let op = self.fetch_u8();
        match op {
            0xCB => self.execute_ddcb(),

            // LD IX, nn
            0x21 => { self.cpu.ix = self.fetch_u16(); 14 }
            // LD (nn), IX
            0x22 => { let addr = self.fetch_u16(); let ix = self.cpu.ix; self.mem_write(addr, (ix & 0xFF) as u8); self.mem_write(addr + 1, (ix >> 8) as u8); 20 }
            // LD IX, (nn)
            0x2A => { let addr = self.fetch_u16(); let lo = self.mem_read(addr) as u16; let hi = self.mem_read(addr + 1) as u16; self.cpu.ix = lo | (hi << 8); 20 }
            // LD SP, IX
            0xF9 => { self.cpu.sp = self.cpu.ix; 10 }
            // INC IX / DEC IX
            0x23 => { self.cpu.ix = self.cpu.ix.wrapping_add(1); 10 }
            0x2B => { self.cpu.ix = self.cpu.ix.wrapping_sub(1); 10 }

            // ADD IX, rr
            0x09 => { let v = self.cpu.bc(); self.alu_add_ix(v); 15 }
            0x19 => { let v = self.cpu.de(); self.alu_add_ix(v); 15 }
            0x29 => { let v = self.cpu.ix; self.alu_add_ix(v); 15 }
            0x39 => { let v = self.cpu.sp; self.alu_add_ix(v); 15 }

            // PUSH/POP IX
            0xE5 => { let v = self.cpu.ix; self.push_u16(v); 15 }
            0xE1 => { self.cpu.ix = self.pop_u16(); 14 }

            // EX (SP), IX
            0xE3 => {
                let sp = self.cpu.sp;
                let lo = self.mem_read(sp);
                let hi = self.mem_read(sp + 1);
                self.mem_write(sp, (self.cpu.ix & 0xFF) as u8);
                self.mem_write(sp + 1, (self.cpu.ix >> 8) as u8);
                self.cpu.ix = lo as u16 | (hi as u16) << 8;
                23
            }
            // JP (IX)
            0xE9 => { self.cpu.pc = self.cpu.ix; 8 }

            // LD r, (IX+d) / LD (IX+d), r
            0x46 => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); self.cpu.b = self.mem_read(addr); 19 }
            0x4E => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); self.cpu.c = self.mem_read(addr); 19 }
            0x56 => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); self.cpu.d = self.mem_read(addr); 19 }
            0x5E => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); self.cpu.e = self.mem_read(addr); 19 }
            0x66 => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); self.cpu.h = self.mem_read(addr); 19 }
            0x6E => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); self.cpu.l = self.mem_read(addr); 19 }
            0x7E => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); self.cpu.a = self.mem_read(addr); 19 }
            0x70 => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); self.mem_write(addr, self.cpu.b); 19 }
            0x71 => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); self.mem_write(addr, self.cpu.c); 19 }
            0x72 => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); self.mem_write(addr, self.cpu.d); 19 }
            0x73 => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); self.mem_write(addr, self.cpu.e); 19 }
            0x74 => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); self.mem_write(addr, self.cpu.h); 19 }
            0x75 => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); self.mem_write(addr, self.cpu.l); 19 }
            0x77 => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); self.mem_write(addr, self.cpu.a); 19 }
            0x36 => { let d = self.fetch_u8() as i8; let n = self.fetch_u8(); let addr = self.cpu.ix.wrapping_add(d as u16); self.mem_write(addr, n); 19 }

            // INC/DEC (IX+d)
            0x34 => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); let v = self.mem_read(addr); let r = self.alu_inc(v); self.mem_write(addr, r); 23 }
            0x35 => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); let v = self.mem_read(addr); let r = self.alu_dec(v); self.mem_write(addr, r); 23 }

            // ALU (IX+d)
            0x86 => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); let v = self.mem_read(addr); self.alu_add(v, false); 19 }
            0x8E => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); let v = self.mem_read(addr); self.alu_add(v, true); 19 }
            0x96 => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); let v = self.mem_read(addr); self.alu_sub(v, false); 19 }
            0x9E => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); let v = self.mem_read(addr); self.alu_sub(v, true); 19 }
            0xA6 => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); let v = self.mem_read(addr); self.alu_and(v); 19 }
            0xAE => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); let v = self.mem_read(addr); self.alu_xor(v); 19 }
            0xB6 => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); let v = self.mem_read(addr); self.alu_or(v); 19 }
            0xBE => { let d = self.fetch_u8() as i8; let addr = self.cpu.ix.wrapping_add(d as u16); let v = self.mem_read(addr); self.alu_cp(v); 19 }

            // INC/DEC IXH/IXL (undocumented)
            0x24 => { let v = (self.cpu.ix >> 8) as u8; let r = self.alu_inc(v); self.cpu.ix = (self.cpu.ix & 0xFF) | ((r as u16) << 8); 8 }
            0x25 => { let v = (self.cpu.ix >> 8) as u8; let r = self.alu_dec(v); self.cpu.ix = (self.cpu.ix & 0xFF) | ((r as u16) << 8); 8 }
            0x2C => { let v = self.cpu.ix as u8; let r = self.alu_inc(v); self.cpu.ix = (self.cpu.ix & 0xFF00) | r as u16; 8 }
            0x2D => { let v = self.cpu.ix as u8; let r = self.alu_dec(v); self.cpu.ix = (self.cpu.ix & 0xFF00) | r as u16; 8 }

            // LD IXH/IXL, n (undocumented)
            0x26 => { let n = self.fetch_u8(); self.cpu.ix = (self.cpu.ix & 0xFF) | ((n as u16) << 8); 11 }
            0x2E => { let n = self.fetch_u8(); self.cpu.ix = (self.cpu.ix & 0xFF00) | n as u16; 11 }

            // 其他 DD 前綴指令 → 作為不帶前綴的指令執行
            _ => self.execute(op),
        }
    }

    // ===== FD 前綴 (IY) — 與 DD 結構相同但操作 IY =====

    fn execute_fd(&mut self) -> u32 {
        let op = self.fetch_u8();
        match op {
            0xCB => self.execute_fdcb(),

            0x21 => { self.cpu.iy = self.fetch_u16(); 14 }
            0x22 => { let addr = self.fetch_u16(); let iy = self.cpu.iy; self.mem_write(addr, (iy & 0xFF) as u8); self.mem_write(addr + 1, (iy >> 8) as u8); 20 }
            0x2A => { let addr = self.fetch_u16(); let lo = self.mem_read(addr) as u16; let hi = self.mem_read(addr + 1) as u16; self.cpu.iy = lo | (hi << 8); 20 }
            0xF9 => { self.cpu.sp = self.cpu.iy; 10 }
            0x23 => { self.cpu.iy = self.cpu.iy.wrapping_add(1); 10 }
            0x2B => { self.cpu.iy = self.cpu.iy.wrapping_sub(1); 10 }

            0x09 => { let v = self.cpu.bc(); self.alu_add_iy(v); 15 }
            0x19 => { let v = self.cpu.de(); self.alu_add_iy(v); 15 }
            0x29 => { let v = self.cpu.iy; self.alu_add_iy(v); 15 }
            0x39 => { let v = self.cpu.sp; self.alu_add_iy(v); 15 }

            0xE5 => { let v = self.cpu.iy; self.push_u16(v); 15 }
            0xE1 => { self.cpu.iy = self.pop_u16(); 14 }

            0xE3 => {
                let sp = self.cpu.sp;
                let lo = self.mem_read(sp);
                let hi = self.mem_read(sp + 1);
                self.mem_write(sp, (self.cpu.iy & 0xFF) as u8);
                self.mem_write(sp + 1, (self.cpu.iy >> 8) as u8);
                self.cpu.iy = lo as u16 | (hi as u16) << 8;
                23
            }
            0xE9 => { self.cpu.pc = self.cpu.iy; 8 }

            0x46 => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); self.cpu.b = self.mem_read(addr); 19 }
            0x4E => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); self.cpu.c = self.mem_read(addr); 19 }
            0x56 => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); self.cpu.d = self.mem_read(addr); 19 }
            0x5E => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); self.cpu.e = self.mem_read(addr); 19 }
            0x66 => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); self.cpu.h = self.mem_read(addr); 19 }
            0x6E => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); self.cpu.l = self.mem_read(addr); 19 }
            0x7E => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); self.cpu.a = self.mem_read(addr); 19 }
            0x70 => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); self.mem_write(addr, self.cpu.b); 19 }
            0x71 => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); self.mem_write(addr, self.cpu.c); 19 }
            0x72 => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); self.mem_write(addr, self.cpu.d); 19 }
            0x73 => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); self.mem_write(addr, self.cpu.e); 19 }
            0x74 => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); self.mem_write(addr, self.cpu.h); 19 }
            0x75 => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); self.mem_write(addr, self.cpu.l); 19 }
            0x77 => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); self.mem_write(addr, self.cpu.a); 19 }
            0x36 => { let d = self.fetch_u8() as i8; let n = self.fetch_u8(); let addr = self.cpu.iy.wrapping_add(d as u16); self.mem_write(addr, n); 19 }

            0x34 => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); let v = self.mem_read(addr); let r = self.alu_inc(v); self.mem_write(addr, r); 23 }
            0x35 => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); let v = self.mem_read(addr); let r = self.alu_dec(v); self.mem_write(addr, r); 23 }

            0x86 => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); let v = self.mem_read(addr); self.alu_add(v, false); 19 }
            0x8E => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); let v = self.mem_read(addr); self.alu_add(v, true); 19 }
            0x96 => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); let v = self.mem_read(addr); self.alu_sub(v, false); 19 }
            0x9E => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); let v = self.mem_read(addr); self.alu_sub(v, true); 19 }
            0xA6 => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); let v = self.mem_read(addr); self.alu_and(v); 19 }
            0xAE => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); let v = self.mem_read(addr); self.alu_xor(v); 19 }
            0xB6 => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); let v = self.mem_read(addr); self.alu_or(v); 19 }
            0xBE => { let d = self.fetch_u8() as i8; let addr = self.cpu.iy.wrapping_add(d as u16); let v = self.mem_read(addr); self.alu_cp(v); 19 }

            0x24 => { let v = (self.cpu.iy >> 8) as u8; let r = self.alu_inc(v); self.cpu.iy = (self.cpu.iy & 0xFF) | ((r as u16) << 8); 8 }
            0x25 => { let v = (self.cpu.iy >> 8) as u8; let r = self.alu_dec(v); self.cpu.iy = (self.cpu.iy & 0xFF) | ((r as u16) << 8); 8 }
            0x2C => { let v = self.cpu.iy as u8; let r = self.alu_inc(v); self.cpu.iy = (self.cpu.iy & 0xFF00) | r as u16; 8 }
            0x2D => { let v = self.cpu.iy as u8; let r = self.alu_dec(v); self.cpu.iy = (self.cpu.iy & 0xFF00) | r as u16; 8 }
            0x26 => { let n = self.fetch_u8(); self.cpu.iy = (self.cpu.iy & 0xFF) | ((n as u16) << 8); 11 }
            0x2E => { let n = self.fetch_u8(); self.cpu.iy = (self.cpu.iy & 0xFF00) | n as u16; 11 }

            _ => self.execute(op),
        }
    }

    // ===== DDCB / FDCB (IX/IY + d 的位元操作) =====

    fn execute_ddcb(&mut self) -> u32 {
        let d = self.fetch_u8() as i8;
        let op = self.fetch_u8();
        let addr = self.cpu.ix.wrapping_add(d as u16);
        self.execute_indexed_cb(addr, op)
    }

    fn execute_fdcb(&mut self) -> u32 {
        let d = self.fetch_u8() as i8;
        let op = self.fetch_u8();
        let addr = self.cpu.iy.wrapping_add(d as u16);
        self.execute_indexed_cb(addr, op)
    }

    fn execute_indexed_cb(&mut self, addr: u16, op: u8) -> u32 {
        let val = self.mem_read(addr);
        let result = match op >> 3 {
            0 => self.cb_rlc(val),
            1 => self.cb_rrc(val),
            2 => self.cb_rl(val),
            3 => self.cb_rr(val),
            4 => self.cb_sla(val),
            5 => self.cb_sra(val),
            6 => self.cb_sll(val),
            7 => self.cb_srl(val),
            8..=15 => {
                // BIT
                let bit = (op >> 3) & 7;
                self.cpu.set_flag(FLAG_Z, val & (1 << bit) == 0);
                self.cpu.set_flag(FLAG_H, true);
                self.cpu.set_flag(FLAG_N, false);
                self.cpu.set_flag(FLAG_PV, val & (1 << bit) == 0);
                self.cpu.set_flag(FLAG_S, bit == 7 && val & 0x80 != 0);
                return 20;
            }
            16..=23 => {
                let bit = (op >> 3) & 7;
                val & !(1 << bit)
            }
            24..=31 => {
                let bit = (op >> 3) & 7;
                val | (1 << bit)
            }
            _ => val,
        };

        self.mem_write(addr, result);
        // 非 BIT 的指令還會把結果存入暫存器 (undocumented)
        let reg = op & 7;
        if reg != 6 {
            self.write_r8(reg, result);
        }
        23
    }

    // ===== ED 前綴 =====

    fn execute_ed(&mut self) -> u32 {
        let op = self.fetch_u8();
        match op {
            // LD I, A / LD R, A / LD A, I / LD A, R
            0x47 => { self.cpu.i = self.cpu.a; 9 }
            0x4F => { self.cpu.r = self.cpu.a; 9 }
            0x57 => { // LD A, I
                self.cpu.a = self.cpu.i;
                self.cpu.set_flag(FLAG_S, self.cpu.a & 0x80 != 0);
                self.cpu.set_flag(FLAG_Z, self.cpu.a == 0);
                self.cpu.set_flag(FLAG_H, false);
                self.cpu.set_flag(FLAG_PV, self.cpu.iff2);
                self.cpu.set_flag(FLAG_N, false);
                self.cpu.set_undoc(self.cpu.a);
                9
            }
            0x5F => { // LD A, R
                self.cpu.a = self.cpu.r;
                self.cpu.set_flag(FLAG_S, self.cpu.a & 0x80 != 0);
                self.cpu.set_flag(FLAG_Z, self.cpu.a == 0);
                self.cpu.set_flag(FLAG_H, false);
                self.cpu.set_flag(FLAG_PV, self.cpu.iff2);
                self.cpu.set_flag(FLAG_N, false);
                self.cpu.set_undoc(self.cpu.a);
                9
            }

            // IM 0/1/2
            0x46 | 0x66 => { self.cpu.im = 0; 8 }
            0x56 | 0x76 => { self.cpu.im = 1; 8 }
            0x5E | 0x7E => { self.cpu.im = 2; 8 }

            // RETI / RETN
            0x4D => { self.cpu.iff1 = self.cpu.iff2; self.cpu.pc = self.pop_u16(); 14 } // RETI
            0x45 | 0x55 | 0x5D | 0x65 | 0x6D | 0x75 | 0x7D => { self.cpu.iff1 = self.cpu.iff2; self.cpu.pc = self.pop_u16(); 14 } // RETN

            // LD (nn), rr / LD rr, (nn)
            0x43 => { let addr = self.fetch_u16(); let bc = self.cpu.bc(); self.mem_write(addr, (bc & 0xFF) as u8); self.mem_write(addr + 1, (bc >> 8) as u8); 20 }
            0x53 => { let addr = self.fetch_u16(); let de = self.cpu.de(); self.mem_write(addr, (de & 0xFF) as u8); self.mem_write(addr + 1, (de >> 8) as u8); 20 }
            0x63 => { let addr = self.fetch_u16(); let hl = self.cpu.hl(); self.mem_write(addr, (hl & 0xFF) as u8); self.mem_write(addr + 1, (hl >> 8) as u8); 20 }
            0x73 => { let addr = self.fetch_u16(); let sp = self.cpu.sp; self.mem_write(addr, (sp & 0xFF) as u8); self.mem_write(addr + 1, (sp >> 8) as u8); 20 }
            0x4B => { let addr = self.fetch_u16(); let lo = self.mem_read(addr) as u16; let hi = self.mem_read(addr + 1) as u16; self.cpu.set_bc(lo | (hi << 8)); 20 }
            0x5B => { let addr = self.fetch_u16(); let lo = self.mem_read(addr) as u16; let hi = self.mem_read(addr + 1) as u16; self.cpu.set_de(lo | (hi << 8)); 20 }
            0x6B => { let addr = self.fetch_u16(); let lo = self.mem_read(addr) as u16; let hi = self.mem_read(addr + 1) as u16; self.cpu.set_hl(lo | (hi << 8)); 20 }
            0x7B => { let addr = self.fetch_u16(); let lo = self.mem_read(addr) as u16; let hi = self.mem_read(addr + 1) as u16; self.cpu.sp = lo | (hi << 8); 20 }

            // ADC HL, rr / SBC HL, rr
            0x4A => { let v = self.cpu.bc(); self.alu_adc_hl(v); 15 }
            0x5A => { let v = self.cpu.de(); self.alu_adc_hl(v); 15 }
            0x6A => { let v = self.cpu.hl(); self.alu_adc_hl(v); 15 }
            0x7A => { let v = self.cpu.sp; self.alu_adc_hl(v); 15 }
            0x42 => { let v = self.cpu.bc(); self.alu_sbc_hl(v); 15 }
            0x52 => { let v = self.cpu.de(); self.alu_sbc_hl(v); 15 }
            0x62 => { let v = self.cpu.hl(); self.alu_sbc_hl(v); 15 }
            0x72 => { let v = self.cpu.sp; self.alu_sbc_hl(v); 15 }

            // NEG
            0x44 | 0x4C | 0x54 | 0x5C | 0x64 | 0x6C | 0x74 | 0x7C => {
                let a = self.cpu.a;
                self.cpu.a = 0;
                self.alu_sub(a, false);
                8
            }

            // RLD / RRD
            0x6F => { // RLD
                let addr = self.cpu.hl();
                let mem = self.mem_read(addr);
                let a = self.cpu.a;
                self.cpu.a = (a & 0xF0) | (mem >> 4);
                self.mem_write(addr, (mem << 4) | (a & 0x0F));
                self.cpu.set_flag(FLAG_H, false);
                self.cpu.set_flag(FLAG_N, false);
                self.cpu.set_szp_flags(self.cpu.a);
                18
            }
            0x67 => { // RRD
                let addr = self.cpu.hl();
                let mem = self.mem_read(addr);
                let a = self.cpu.a;
                self.cpu.a = (a & 0xF0) | (mem & 0x0F);
                self.mem_write(addr, ((a & 0x0F) << 4) | (mem >> 4));
                self.cpu.set_flag(FLAG_H, false);
                self.cpu.set_flag(FLAG_N, false);
                self.cpu.set_szp_flags(self.cpu.a);
                18
            }

            // IN r, (C) / OUT (C), r
            0x40 => { self.cpu.b = self.io_in_c(); 12 }
            0x48 => { self.cpu.c = self.io_in_c(); 12 }
            0x50 => { self.cpu.d = self.io_in_c(); 12 }
            0x58 => { self.cpu.e = self.io_in_c(); 12 }
            0x60 => { self.cpu.h = self.io_in_c(); 12 }
            0x68 => { self.cpu.l = self.io_in_c(); 12 }
            0x70 => { self.io_in_c(); 12 } // IN F, (C) — 只影響旗標
            0x78 => { self.cpu.a = self.io_in_c(); 12 }

            0x41 => { let v = self.cpu.b; self.io_write(self.cpu.c, v); 12 }
            0x49 => { let v = self.cpu.c; self.io_write(self.cpu.c, v); 12 }
            0x51 => { let v = self.cpu.d; self.io_write(self.cpu.c, v); 12 }
            0x59 => { let v = self.cpu.e; self.io_write(self.cpu.c, v); 12 }
            0x61 => { let v = self.cpu.h; self.io_write(self.cpu.c, v); 12 }
            0x69 => { let v = self.cpu.l; self.io_write(self.cpu.c, v); 12 }
            0x71 => { self.io_write(self.cpu.c, 0); 12 } // OUT (C), 0
            0x79 => { let v = self.cpu.a; self.io_write(self.cpu.c, v); 12 }

            // Block instructions
            // LDI / LDD / LDIR / LDDR
            0xA0 => { self.block_ld(1); 16 }
            0xA8 => { self.block_ld(-1); 16 }
            0xB0 => { self.block_ld(1); if self.cpu.bc() != 0 { self.cpu.pc = self.cpu.pc.wrapping_sub(2); 21 } else { 16 } }
            0xB8 => { self.block_ld(-1); if self.cpu.bc() != 0 { self.cpu.pc = self.cpu.pc.wrapping_sub(2); 21 } else { 16 } }

            // CPI / CPD / CPIR / CPDR
            0xA1 => { self.block_cp(1); 16 }
            0xA9 => { self.block_cp(-1); 16 }
            0xB1 => { self.block_cp(1); if self.cpu.bc() != 0 && !self.cpu.flag(FLAG_Z) { self.cpu.pc = self.cpu.pc.wrapping_sub(2); 21 } else { 16 } }
            0xB9 => { self.block_cp(-1); if self.cpu.bc() != 0 && !self.cpu.flag(FLAG_Z) { self.cpu.pc = self.cpu.pc.wrapping_sub(2); 21 } else { 16 } }

            // INI / IND / INIR / INDR
            0xA2 => { self.block_in(1); 16 }
            0xAA => { self.block_in(-1); 16 }
            0xB2 => { self.block_in(1); if self.cpu.b != 0 { self.cpu.pc = self.cpu.pc.wrapping_sub(2); 21 } else { 16 } }
            0xBA => { self.block_in(-1); if self.cpu.b != 0 { self.cpu.pc = self.cpu.pc.wrapping_sub(2); 21 } else { 16 } }

            // OUTI / OUTD / OTIR / OTDR
            0xA3 => { self.block_out(1); 16 }
            0xAB => { self.block_out(-1); 16 }
            0xB3 => { self.block_out(1); if self.cpu.b != 0 { self.cpu.pc = self.cpu.pc.wrapping_sub(2); 21 } else { 16 } }
            0xBB => { self.block_out(-1); if self.cpu.b != 0 { self.cpu.pc = self.cpu.pc.wrapping_sub(2); 21 } else { 16 } }

            // 無效 ED 前綴 → NOP
            _ => 8,
        }
    }

    // ===== Block instructions =====

    fn block_ld(&mut self, dir: i32) {
        let hl = self.cpu.hl();
        let de = self.cpu.de();
        let val = self.mem_read(hl);
        self.mem_write(de, val);

        if dir > 0 {
            self.cpu.set_hl(hl.wrapping_add(1));
            self.cpu.set_de(de.wrapping_add(1));
        } else {
            self.cpu.set_hl(hl.wrapping_sub(1));
            self.cpu.set_de(de.wrapping_sub(1));
        }
        let bc = self.cpu.bc().wrapping_sub(1);
        self.cpu.set_bc(bc);

        self.cpu.set_flag(FLAG_H, false);
        self.cpu.set_flag(FLAG_N, false);
        self.cpu.set_flag(FLAG_PV, bc != 0);

        let n = val.wrapping_add(self.cpu.a);
        self.cpu.set_flag(FLAG_3, n & 0x08 != 0);
        self.cpu.set_flag(FLAG_5, n & 0x02 != 0);
    }

    fn block_cp(&mut self, dir: i32) {
        let hl = self.cpu.hl();
        let val = self.mem_read(hl);
        let a = self.cpu.a;
        let result = a.wrapping_sub(val);

        if dir > 0 {
            self.cpu.set_hl(hl.wrapping_add(1));
        } else {
            self.cpu.set_hl(hl.wrapping_sub(1));
        }
        let bc = self.cpu.bc().wrapping_sub(1);
        self.cpu.set_bc(bc);

        self.cpu.set_flag(FLAG_S, result & 0x80 != 0);
        self.cpu.set_flag(FLAG_Z, result == 0);
        self.cpu.set_flag(FLAG_H, (a & 0x0F) < (val & 0x0F));
        self.cpu.set_flag(FLAG_PV, bc != 0);
        self.cpu.set_flag(FLAG_N, true);

        let n = result.wrapping_sub(if self.cpu.flag(FLAG_H) { 1 } else { 0 });
        self.cpu.set_flag(FLAG_3, n & 0x08 != 0);
        self.cpu.set_flag(FLAG_5, n & 0x02 != 0);
    }

    fn block_in(&mut self, dir: i32) {
        let hl = self.cpu.hl();
        let val = self.io_read(self.cpu.c);

        // Z80 INI/IND: B 遞減在讀取之後、寫入之前
        self.cpu.b = self.cpu.b.wrapping_sub(1);

        self.mem_write(hl, val);
        if dir > 0 {
            self.cpu.set_hl(hl.wrapping_add(1));
        } else {
            self.cpu.set_hl(hl.wrapping_sub(1));
        }

        self.cpu.set_flag(FLAG_Z, self.cpu.b == 0);
        self.cpu.set_flag(FLAG_N, true);
    }

    fn block_out(&mut self, dir: i32) {
        let hl = self.cpu.hl();
        let val = self.mem_read(hl);
        self.cpu.b = self.cpu.b.wrapping_sub(1);
        self.io_write(self.cpu.c, val);

        if dir > 0 {
            self.cpu.set_hl(hl.wrapping_add(1));
        } else {
            self.cpu.set_hl(hl.wrapping_sub(1));
        }

        self.cpu.set_flag(FLAG_Z, self.cpu.b == 0);
        self.cpu.set_flag(FLAG_N, true);
    }

    fn io_in_c(&mut self) -> u8 {
        let val = self.io_read(self.cpu.c);
        self.cpu.set_flag(FLAG_S, val & 0x80 != 0);
        self.cpu.set_flag(FLAG_Z, val == 0);
        self.cpu.set_flag(FLAG_H, false);
        self.cpu.set_flag(FLAG_PV, parity(val));
        self.cpu.set_flag(FLAG_N, false);
        self.cpu.set_undoc(val);
        val
    }

    // ===== 暫存器讀寫輔助 =====

    fn read_r8(&self, idx: u8) -> u8 {
        match idx {
            0 => self.cpu.b,
            1 => self.cpu.c,
            2 => self.cpu.d,
            3 => self.cpu.e,
            4 => self.cpu.h,
            5 => self.cpu.l,
            6 => { let addr = self.cpu.hl(); self.mem_read(addr) }
            7 => self.cpu.a,
            _ => 0,
        }
    }

    fn write_r8(&mut self, idx: u8, val: u8) {
        match idx {
            0 => self.cpu.b = val,
            1 => self.cpu.c = val,
            2 => self.cpu.d = val,
            3 => self.cpu.e = val,
            4 => self.cpu.h = val,
            5 => self.cpu.l = val,
            6 => { let addr = self.cpu.hl(); self.mem_write(addr, val); }
            7 => self.cpu.a = val,
            _ => {}
        }
    }

    // ===== ALU 運算 =====

    fn alu_add(&mut self, val: u8, with_carry: bool) {
        let a = self.cpu.a as u16;
        let v = val as u16;
        let c = if with_carry && self.cpu.flag(FLAG_C) { 1u16 } else { 0 };
        let result = a + v + c;
        let r8 = result as u8;

        self.cpu.set_flag(FLAG_S, r8 & 0x80 != 0);
        self.cpu.set_flag(FLAG_Z, r8 == 0);
        self.cpu.set_flag(FLAG_H, (a & 0x0F) + (v & 0x0F) + c > 0x0F);
        self.cpu.set_flag(FLAG_PV, ((a ^ v ^ 0x80) & (v ^ result) & 0x80) != 0);
        // 修正溢位判斷
        let overflow = (!(self.cpu.a ^ val) & (self.cpu.a ^ r8)) & 0x80;
        self.cpu.set_flag(FLAG_PV, overflow != 0);
        self.cpu.set_flag(FLAG_N, false);
        self.cpu.set_flag(FLAG_C, result > 0xFF);
        self.cpu.set_undoc(r8);
        self.cpu.a = r8;
    }

    fn alu_sub(&mut self, val: u8, with_carry: bool) {
        let a = self.cpu.a;
        let c = if with_carry && self.cpu.flag(FLAG_C) { 1u8 } else { 0 };
        let result = (a as u16).wrapping_sub(val as u16).wrapping_sub(c as u16);
        let r8 = result as u8;

        self.cpu.set_flag(FLAG_S, r8 & 0x80 != 0);
        self.cpu.set_flag(FLAG_Z, r8 == 0);
        self.cpu.set_flag(FLAG_H, (a & 0x0F) < (val & 0x0F) + c);
        let overflow = ((a ^ val) & (a ^ r8)) & 0x80;
        self.cpu.set_flag(FLAG_PV, overflow != 0);
        self.cpu.set_flag(FLAG_N, true);
        self.cpu.set_flag(FLAG_C, result > 0xFF);
        self.cpu.set_undoc(r8);
        self.cpu.a = r8;
    }

    fn alu_and(&mut self, val: u8) {
        self.cpu.a &= val;
        self.cpu.f = FLAG_H;
        self.cpu.set_szp_flags(self.cpu.a);
    }

    fn alu_xor(&mut self, val: u8) {
        self.cpu.a ^= val;
        self.cpu.f = 0;
        self.cpu.set_szp_flags(self.cpu.a);
    }

    fn alu_or(&mut self, val: u8) {
        self.cpu.a |= val;
        self.cpu.f = 0;
        self.cpu.set_szp_flags(self.cpu.a);
    }

    fn alu_cp(&mut self, val: u8) {
        let a = self.cpu.a;
        self.alu_sub(val, false);
        self.cpu.a = a; // 恢復 A
        self.cpu.set_undoc(val); // CP 的 bit3/5 來自操作數
    }

    fn alu_inc(&mut self, val: u8) -> u8 {
        let result = val.wrapping_add(1);
        self.cpu.set_flag(FLAG_S, result & 0x80 != 0);
        self.cpu.set_flag(FLAG_Z, result == 0);
        self.cpu.set_flag(FLAG_H, (val & 0x0F) + 1 > 0x0F);
        self.cpu.set_flag(FLAG_PV, val == 0x7F);
        self.cpu.set_flag(FLAG_N, false);
        self.cpu.set_undoc(result);
        result
    }

    fn alu_dec(&mut self, val: u8) -> u8 {
        let result = val.wrapping_sub(1);
        self.cpu.set_flag(FLAG_S, result & 0x80 != 0);
        self.cpu.set_flag(FLAG_Z, result == 0);
        self.cpu.set_flag(FLAG_H, val & 0x0F == 0);
        self.cpu.set_flag(FLAG_PV, val == 0x80);
        self.cpu.set_flag(FLAG_N, true);
        self.cpu.set_undoc(result);
        result
    }

    fn alu_add_hl(&mut self, val: u16) {
        let hl = self.cpu.hl();
        let result = hl as u32 + val as u32;
        self.cpu.set_flag(FLAG_H, (hl & 0x0FFF) + (val & 0x0FFF) > 0x0FFF);
        self.cpu.set_flag(FLAG_C, result > 0xFFFF);
        self.cpu.set_flag(FLAG_N, false);
        let r16 = result as u16;
        self.cpu.set_undoc((r16 >> 8) as u8);
        self.cpu.set_hl(r16);
    }

    fn alu_add_ix(&mut self, val: u16) {
        let ix = self.cpu.ix;
        let result = ix as u32 + val as u32;
        self.cpu.set_flag(FLAG_H, (ix & 0x0FFF) + (val & 0x0FFF) > 0x0FFF);
        self.cpu.set_flag(FLAG_C, result > 0xFFFF);
        self.cpu.set_flag(FLAG_N, false);
        let r16 = result as u16;
        self.cpu.set_undoc((r16 >> 8) as u8);
        self.cpu.ix = r16;
    }

    fn alu_add_iy(&mut self, val: u16) {
        let iy = self.cpu.iy;
        let result = iy as u32 + val as u32;
        self.cpu.set_flag(FLAG_H, (iy & 0x0FFF) + (val & 0x0FFF) > 0x0FFF);
        self.cpu.set_flag(FLAG_C, result > 0xFFFF);
        self.cpu.set_flag(FLAG_N, false);
        let r16 = result as u16;
        self.cpu.set_undoc((r16 >> 8) as u8);
        self.cpu.iy = r16;
    }

    fn alu_adc_hl(&mut self, val: u16) {
        let hl = self.cpu.hl() as u32;
        let v = val as u32;
        let c = if self.cpu.flag(FLAG_C) { 1u32 } else { 0 };
        let result = hl + v + c;
        let r16 = result as u16;

        self.cpu.set_flag(FLAG_S, r16 & 0x8000 != 0);
        self.cpu.set_flag(FLAG_Z, r16 == 0);
        self.cpu.set_flag(FLAG_H, (hl & 0x0FFF) + (v & 0x0FFF) + c > 0x0FFF);
        let overflow = (!(hl ^ v) & (v ^ result) & 0x8000) != 0;
        self.cpu.set_flag(FLAG_PV, overflow);
        self.cpu.set_flag(FLAG_N, false);
        self.cpu.set_flag(FLAG_C, result > 0xFFFF);
        self.cpu.set_undoc((r16 >> 8) as u8);
        self.cpu.set_hl(r16);
    }

    fn alu_sbc_hl(&mut self, val: u16) {
        let hl = self.cpu.hl() as u32;
        let v = val as u32;
        let c = if self.cpu.flag(FLAG_C) { 1u32 } else { 0 };
        let result = hl.wrapping_sub(v).wrapping_sub(c);
        let r16 = result as u16;

        self.cpu.set_flag(FLAG_S, r16 & 0x8000 != 0);
        self.cpu.set_flag(FLAG_Z, r16 == 0);
        self.cpu.set_flag(FLAG_H, (hl & 0x0FFF) < (v & 0x0FFF) + c);
        let overflow = ((hl ^ v) & (hl ^ result) & 0x8000) != 0;
        self.cpu.set_flag(FLAG_PV, overflow);
        self.cpu.set_flag(FLAG_N, true);
        self.cpu.set_flag(FLAG_C, result > 0xFFFF);
        self.cpu.set_undoc((r16 >> 8) as u8);
        self.cpu.set_hl(r16);
    }

    fn alu_daa(&mut self) {
        let original_a = self.cpu.a;
        let mut a = self.cpu.a as u16;
        let mut correction: u16 = 0;
        let n = self.cpu.flag(FLAG_N);
        let h = self.cpu.flag(FLAG_H);
        let c = self.cpu.flag(FLAG_C);

        if h || (!n && (a & 0x0F) > 9) {
            correction |= 0x06;
        }
        if c || (!n && a > 0x99) {
            correction |= 0x60;
            self.cpu.set_flag(FLAG_C, true);
        }

        if n {
            a = a.wrapping_sub(correction);
        } else {
            a = a.wrapping_add(correction);
        }

        self.cpu.a = a as u8;
        self.cpu.set_flag(FLAG_S, self.cpu.a & 0x80 != 0);
        self.cpu.set_flag(FLAG_Z, self.cpu.a == 0);
        self.cpu.set_flag(FLAG_PV, parity(self.cpu.a));
        // H flag: MAME/ZEXALL-correct formula
        self.cpu.set_flag(FLAG_H, (original_a ^ self.cpu.a) & 0x10 != 0);
        self.cpu.set_undoc(self.cpu.a);
    }

    // ===== CB 位元操作輔助 =====

    fn cb_rlc(&mut self, val: u8) -> u8 {
        let c = val >> 7;
        let result = (val << 1) | c;
        self.cpu.f = 0;
        self.cpu.set_flag(FLAG_C, c != 0);
        self.cpu.set_szp_flags(result);
        result
    }

    fn cb_rrc(&mut self, val: u8) -> u8 {
        let c = val & 1;
        let result = (val >> 1) | (c << 7);
        self.cpu.f = 0;
        self.cpu.set_flag(FLAG_C, c != 0);
        self.cpu.set_szp_flags(result);
        result
    }

    fn cb_rl(&mut self, val: u8) -> u8 {
        let old_c = if self.cpu.flag(FLAG_C) { 1u8 } else { 0 };
        let c = val >> 7;
        let result = (val << 1) | old_c;
        self.cpu.f = 0;
        self.cpu.set_flag(FLAG_C, c != 0);
        self.cpu.set_szp_flags(result);
        result
    }

    fn cb_rr(&mut self, val: u8) -> u8 {
        let old_c = if self.cpu.flag(FLAG_C) { 0x80u8 } else { 0 };
        let c = val & 1;
        let result = (val >> 1) | old_c;
        self.cpu.f = 0;
        self.cpu.set_flag(FLAG_C, c != 0);
        self.cpu.set_szp_flags(result);
        result
    }

    fn cb_sla(&mut self, val: u8) -> u8 {
        let c = val >> 7;
        let result = val << 1;
        self.cpu.f = 0;
        self.cpu.set_flag(FLAG_C, c != 0);
        self.cpu.set_szp_flags(result);
        result
    }

    fn cb_sra(&mut self, val: u8) -> u8 {
        let c = val & 1;
        let result = (val >> 1) | (val & 0x80);
        self.cpu.f = 0;
        self.cpu.set_flag(FLAG_C, c != 0);
        self.cpu.set_szp_flags(result);
        result
    }

    fn cb_sll(&mut self, val: u8) -> u8 {
        // Undocumented: SLL shifts left, sets bit 0
        let c = val >> 7;
        let result = (val << 1) | 1;
        self.cpu.f = 0;
        self.cpu.set_flag(FLAG_C, c != 0);
        self.cpu.set_szp_flags(result);
        result
    }

    fn cb_srl(&mut self, val: u8) -> u8 {
        let c = val & 1;
        let result = val >> 1;
        self.cpu.f = 0;
        self.cpu.set_flag(FLAG_C, c != 0);
        self.cpu.set_szp_flags(result);
        result
    }

    // ===== 公開 API =====

    pub fn get_frame_buffer_ptr(&self) -> *const u8 { self.vdp.frame_buffer.as_ptr() }
    pub fn get_frame_buffer_len(&self) -> usize { self.vdp.frame_buffer.len() }
    pub fn screen_width(&self) -> u32 { self.vdp.screen_width() }
    pub fn screen_height(&self) -> u32 { self.vdp.screen_height() }
    pub fn set_audio_sample_rate(&mut self, rate: f64) { self.psg.set_sample_rate(rate); }
    pub fn get_audio_buffer_ptr(&self) -> *const f32 { self.psg.get_buffer_ptr() }
    pub fn get_audio_buffer_len(&self) -> usize { self.psg.get_available_samples() }
    pub fn consume_audio_samples(&mut self) -> usize { self.psg.consume_samples() }
    pub fn set_button(&mut self, _controller: u8, button: u8, pressed: bool) {
        let mut buttons = self.joypad.buttons;
        if pressed { buttons |= 1 << button; } else { buttons &= !(1 << button); }
        self.joypad.set_input(buttons);
    }

    // ===== Save State =====

    fn hex_char(c: u8) -> u8 {
        match c {
            b'0'..=b'9' => c - b'0',
            b'a'..=b'f' => c - b'a' + 10,
            b'A'..=b'F' => c - b'A' + 10,
            _ => 0xFF,
        }
    }

    /// 匯出存檔（hex 編碼）
    pub fn export_save_state(&self) -> String {
        self.export_state_binary().iter().map(|b| format!("{:02x}", b)).collect()
    }

    /// 匯入存檔
    pub fn import_save_state(&mut self, hex: &str) -> bool {
        if hex.len() % 2 != 0 { return false; }
        let mut data = Vec::with_capacity(hex.len() / 2);
        let bytes = hex.as_bytes();
        for i in (0..bytes.len()).step_by(2) {
            let hi = Self::hex_char(bytes[i]);
            let lo = Self::hex_char(bytes[i + 1]);
            if hi == 0xFF || lo == 0xFF { return false; }
            data.push((hi << 4) | lo);
        }
        self.import_state_binary(&data)
    }

    fn export_state_binary(&self) -> Vec<u8> {
        let mut d = Vec::new();
        // Magic + Version
        d.extend_from_slice(b"GGSW");
        d.push(1);

        // Z80 主暫存器
        d.push(self.cpu.a); d.push(self.cpu.f);
        d.push(self.cpu.b); d.push(self.cpu.c);
        d.push(self.cpu.d); d.push(self.cpu.e);
        d.push(self.cpu.h); d.push(self.cpu.l);

        // Z80 影子暫存器
        d.push(self.cpu.a_); d.push(self.cpu.f_);
        d.push(self.cpu.b_); d.push(self.cpu.c_);
        d.push(self.cpu.d_); d.push(self.cpu.e_);
        d.push(self.cpu.h_); d.push(self.cpu.l_);

        // 索引與特殊暫存器
        d.extend_from_slice(&self.cpu.ix.to_le_bytes());
        d.extend_from_slice(&self.cpu.iy.to_le_bytes());
        d.extend_from_slice(&self.cpu.sp.to_le_bytes());
        d.extend_from_slice(&self.cpu.pc.to_le_bytes());
        d.push(self.cpu.i);
        d.push(self.cpu.r);

        // 中斷 / 狀態旗標
        d.push(self.cpu.iff1 as u8);
        d.push(self.cpu.iff2 as u8);
        d.push(self.cpu.im);
        d.push(self.cpu.halted as u8);

        // 系統 RAM (8KB)
        d.extend_from_slice(&self.ram);

        // VDP 狀態
        d.extend_from_slice(&self.vdp.regs);              // 11 bytes
        d.push(self.vdp.status);
        d.push(self.vdp.line as u8);
        d.push(self.vdp.line_counter);
        d.push(self.vdp.irq_pending as u8);
        d.extend_from_slice(&self.vdp.vram);               // 16384 bytes
        d.extend_from_slice(&self.vdp.cram);               // 64 bytes

        // Cartridge mapper 狀態
        d.push(self.cartridge.page[0]);
        d.push(self.cartridge.page[1]);
        d.push(self.cartridge.page[2]);
        d.push(self.cartridge.ram_control);

        // Cartridge RAM
        let ram_len = self.cartridge.ram.len() as u32;
        d.extend_from_slice(&ram_len.to_le_bytes());
        d.extend_from_slice(&self.cartridge.ram);

        // is_game_gear 旗標
        d.push(self.is_game_gear as u8);

        d
    }

    fn import_state_binary(&mut self, data: &[u8]) -> bool {
        if data.len() < 9 || &data[0..4] != b"GGSW" || data[4] != 1 { return false; }
        let mut p = 5;

        // Z80 主暫存器 (8 bytes)
        if p + 8 > data.len() { return false; }
        self.cpu.a = data[p]; p += 1;
        self.cpu.f = data[p]; p += 1;
        self.cpu.b = data[p]; p += 1;
        self.cpu.c = data[p]; p += 1;
        self.cpu.d = data[p]; p += 1;
        self.cpu.e = data[p]; p += 1;
        self.cpu.h = data[p]; p += 1;
        self.cpu.l = data[p]; p += 1;

        // 影子暫存器 (8 bytes)
        if p + 8 > data.len() { return false; }
        self.cpu.a_ = data[p]; p += 1;
        self.cpu.f_ = data[p]; p += 1;
        self.cpu.b_ = data[p]; p += 1;
        self.cpu.c_ = data[p]; p += 1;
        self.cpu.d_ = data[p]; p += 1;
        self.cpu.e_ = data[p]; p += 1;
        self.cpu.h_ = data[p]; p += 1;
        self.cpu.l_ = data[p]; p += 1;

        // 索引與特殊暫存器
        if p + 12 > data.len() { return false; }
        self.cpu.ix = u16::from_le_bytes([data[p], data[p+1]]); p += 2;
        self.cpu.iy = u16::from_le_bytes([data[p], data[p+1]]); p += 2;
        self.cpu.sp = u16::from_le_bytes([data[p], data[p+1]]); p += 2;
        self.cpu.pc = u16::from_le_bytes([data[p], data[p+1]]); p += 2;
        self.cpu.i = data[p]; p += 1;
        self.cpu.r = data[p]; p += 1;

        // 中斷/狀態
        if p + 4 > data.len() { return false; }
        self.cpu.iff1 = data[p] != 0; p += 1;
        self.cpu.iff2 = data[p] != 0; p += 1;
        self.cpu.im = data[p]; p += 1;
        self.cpu.halted = data[p] != 0; p += 1;
        self.cpu.ei_pending = false;

        // 系統 RAM (8KB)
        if p + 0x2000 > data.len() { return false; }
        self.ram.copy_from_slice(&data[p..p+0x2000]); p += 0x2000;

        // VDP 狀態
        if p + 11 + 4 + 16384 + 64 > data.len() { return false; }
        self.vdp.regs.copy_from_slice(&data[p..p+11]); p += 11;
        self.vdp.status = data[p]; p += 1;
        self.vdp.line = data[p] as u32; p += 1;
        self.vdp.line_counter = data[p]; p += 1;
        self.vdp.irq_pending = data[p] != 0; p += 1;
        self.vdp.vram.copy_from_slice(&data[p..p+16384]); p += 16384;
        self.vdp.cram.copy_from_slice(&data[p..p+64]); p += 64;

        // Cartridge mapper
        if p + 4 > data.len() { return false; }
        self.cartridge.page[0] = data[p]; p += 1;
        self.cartridge.page[1] = data[p]; p += 1;
        self.cartridge.page[2] = data[p]; p += 1;
        self.cartridge.ram_control = data[p]; p += 1;

        // Cartridge RAM
        if p + 4 > data.len() { return false; }
        let ram_len = u32::from_le_bytes([data[p], data[p+1], data[p+2], data[p+3]]) as usize; p += 4;
        if p + ram_len > data.len() { return false; }
        if ram_len == self.cartridge.ram.len() {
            self.cartridge.ram.copy_from_slice(&data[p..p+ram_len]);
        }
        p += ram_len;

        // is_game_gear
        if p < data.len() {
            self.is_game_gear = data[p] != 0;
        }

        true
    }
}
