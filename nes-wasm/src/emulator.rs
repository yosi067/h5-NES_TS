// ============================================================
// NES 模擬器主體 - 整合所有硬體元件
// ============================================================
// 這是模擬器的核心整合模組，負責：
// - 連接 CPU、PPU、APU、匯流排、卡帶、控制器
// - 管理主時鐘與各元件的時序關係
// - 提供畫面與音訊緩衝區給 WASM 介面
// - 存檔/讀檔功能
//
// NES 時序關係：
// - 主時鐘 = PPU 時鐘
// - CPU 時鐘 = 主時鐘 / 3
// - APU 時鐘 = CPU 時鐘
//
// 每一幀 = 262 條掃描線 × 341 個 PPU 週期 = 89342 個 PPU 週期
// ============================================================

use crate::cpu::Cpu;
use crate::ppu::Ppu;
use crate::apu::Apu;
use crate::bus::Bus;
use crate::cartridge::Cartridge;
use crate::controller::Controller;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DmcDmaPhase {
    Idle,
    Halt,
    Dummy,
    Align,
    Read,
}

/// NES 模擬器
pub struct Emulator {
    /// 6502 CPU
    pub cpu: Cpu,
    /// 2C02 PPU
    pub ppu: Ppu,
    /// 2A03 APU
    pub apu: Apu,
    /// 記憶體匯流排
    pub bus: Bus,
    /// 卡帶
    pub cartridge: Cartridge,
    /// 控制器 1
    pub ctrl1: Controller,
    /// 控制器 2
    pub ctrl2: Controller,

    /// 系統主時鐘計數器
    system_clock: u64,

    /// 音頻啟用旗標 (false = 靜音且停用 APU IRQ)
    pub audio_enabled: bool,

    dmc_dma_address: Option<u16>,
    dmc_dma_phase: DmcDmaPhase,

    #[cfg(test)]
    pub(crate) mapper_scanline_events: Vec<(i16, u16)>,
    #[cfg(test)]
    pub(crate) mapper_cpu_writes: Vec<(u64, u16, u8)>,
    #[cfg(test)]
    pub(crate) mapper_scanline_enabled: bool,
}

impl Emulator {
    /// 建立新的模擬器實例
    pub fn new() -> Self {
        Emulator {
            cpu: Cpu::new(),
            ppu: Ppu::new(),
            apu: Apu::new(),
            bus: Bus::new(),
            cartridge: Cartridge::new(),
            ctrl1: Controller::new(),
            ctrl2: Controller::new(),
            system_clock: 0,
            audio_enabled: true,
            dmc_dma_address: None,
            dmc_dma_phase: DmcDmaPhase::Idle,
            #[cfg(test)]
            mapper_scanline_events: Vec::new(),
            #[cfg(test)]
            mapper_cpu_writes: Vec::new(),
            #[cfg(test)]
            mapper_scanline_enabled: true,
        }
    }

    /// 載入 ROM
    pub fn load_rom(&mut self, data: &[u8]) -> bool {
        let success = self.cartridge.load_rom(data);
        if success {
            // 將卡帶的 CHR 資料同步到 PPU
            let chr_data = self.cartridge.chr_data.clone();
            let chr_ram = self.cartridge.chr_ram;
            self.ppu.set_chr_data(chr_data, chr_ram);
            // 同步 Mapper 的 CHR bank 映射和鏡像模式
            self.sync_mapper_to_ppu();
            self.reset();
        }
        success
    }

    /// 重置模擬器
    pub fn reset(&mut self) {
        self.cartridge.reset();
        self.ppu.reset();
        self.apu.reset();
        self.bus.reset();
        self.system_clock = 0;
        self.dmc_dma_address = None;
        self.dmc_dma_phase = DmcDmaPhase::Idle;
        #[cfg(test)]
        {
            self.mapper_scanline_events.clear();
            self.mapper_cpu_writes.clear();
        }

        // 同步 Mapper 狀態到 PPU（鏡像模式和 CHR bank 映射）
        self.sync_mapper_to_ppu();

        // CPU 重置 - 需要從重置向量讀取 PC
        let lo = self.bus_read(0xFFFC) as u16;
        let hi = self.bus_read(0xFFFD) as u16;

        self.cpu.pc = (hi << 8) | lo;
        self.cpu.sp = 0xFD;
        self.cpu.status = 0x24; // IRQ 禁止旗標設定
        self.cpu.a = 0;
        self.cpu.x = 0;
        self.cpu.y = 0;
        self.cpu.cycles = 0;
        self.cpu.nmi_pending = false;
        self.cpu.irq_pending = false;
    }

    /// 執行一個主時鐘週期
    ///
    /// 時序關係：
    /// - PPU 每個主時鐘都執行
    /// - CPU 每 3 個主時鐘執行一次
    /// - APU 跟 CPU 同步
    fn clock(&mut self) {
        // === PPU 時鐘（每個主時鐘） ===
        self.ppu.clock();

        // === CPU 時鐘（每 3 個主時鐘）===
        // 重要：CPU 在 NMI/IRQ 檢查之前執行，與 TypeScript 版本一致
        if self.system_clock % 3 == 0 {
            // 檢查 DMA 傳輸
            if self.bus.dma_transfer {
                let odd = self.system_clock % 2 == 1;
                let dmc_can_steal_read = !odd && self.dmc_dma_phase == DmcDmaPhase::Read;
                if dmc_can_steal_read {
                    self.clock_dmc_dma(odd, true);
                } else {
                    self.bus.do_dma_cycle(
                        odd,
                        &mut self.ppu, &mut self.apu, &self.cartridge,
                        &mut self.ctrl1, &mut self.ctrl2,
                    );
                    if self.dmc_dma_phase != DmcDmaPhase::Idle {
                        self.clock_dmc_dma(odd, false);
                    }
                }
            } else if self.dmc_dma_phase != DmcDmaPhase::Idle {
                let odd = self.system_clock % 2 == 1;
                self.clock_dmc_dma(odd, true);
            } else {
                // 執行 CPU
                self.cpu_clock();
            }

            // APU 時鐘（與 CPU 同步）
            self.apu.clock();

            // 處理 DMC 讀取請求
            if self.dmc_dma_phase == DmcDmaPhase::Idle {
                if let Some(addr) = self.apu.dmc_read_request {
                    self.dmc_dma_address = Some(addr);
                    self.dmc_dma_phase = DmcDmaPhase::Halt;
                }
            }

            // Mapper CPU 週期計時（用於 Bandai FCG 等）
            self.cartridge.cpu_clock();
        }

        // === 檢查 NMI（PPU VBlank 觸發）===
        if self.ppu.check_nmi() {
            self.cpu.nmi_pending = true;
        }

        // === 檢查 Scanline IRQ（用於 MMC3 等 Mapper）===
        if self.ppu.check_scanline_irq() {
            #[cfg(test)]
            self.mapper_scanline_events.push((self.ppu.scanline, self.ppu.cycle));
            #[cfg(test)]
            let mapper_scanline_enabled = self.mapper_scanline_enabled;
            #[cfg(not(test))]
            let mapper_scanline_enabled = true;
            if mapper_scanline_enabled {
                self.cartridge.scanline();
                // 同步 Mapper 狀態到 PPU（scanline 可能改變 bank 映射）
                self.sync_mapper_to_ppu();
            }
        }

        // IRQ 是 level-sensitive：source acknowledge 後必須立即解除 CPU IRQ line。
        self.cpu.irq_pending = (self.audio_enabled && self.apu.check_irq())
            || self.cartridge.check_irq();

        self.system_clock += 1;
    }

    fn clock_dmc_dma(&mut self, odd_cycle: bool, allow_read: bool) {
        let Some(address) = self.dmc_dma_address else {
            self.dmc_dma_phase = DmcDmaPhase::Idle;
            return;
        };

        if self.apu.dmc_read_request != Some(address) {
            self.dmc_dma_address = None;
            self.dmc_dma_phase = DmcDmaPhase::Idle;
            return;
        }

        match self.dmc_dma_phase {
            DmcDmaPhase::Idle => {}
            DmcDmaPhase::Halt => {
                self.dmc_dma_phase = DmcDmaPhase::Dummy;
            }
            DmcDmaPhase::Dummy => {
                self.dmc_dma_phase = if odd_cycle {
                    DmcDmaPhase::Read
                } else {
                    DmcDmaPhase::Align
                };
            }
            DmcDmaPhase::Align => {
                self.dmc_dma_phase = DmcDmaPhase::Read;
            }
            DmcDmaPhase::Read => {
                if !allow_read {
                    return;
                }

                let data = self.bus_read(address);
                self.apu.dmc_provide_sample(data);
                self.dmc_dma_address = None;
                self.dmc_dma_phase = DmcDmaPhase::Idle;
            }
        }
    }

    /// 執行一個 CPU 時鐘週期
    fn cpu_clock(&mut self) {
        if self.cpu.cycles > 0 {
            self.cpu.cycles -= 1;
            return;
        }

        // 處理 NMI
        if self.cpu.nmi_pending {
            self.cpu.nmi_pending = false;
            self.do_nmi();
            // 扣除本次時鐘週期（執行週期本身消耗 1 cycle）
            self.cpu.cycles = self.cpu.cycles.saturating_sub(1);
            return;
        }

        // 處理 IRQ
        if self.cpu.irq_pending && (self.cpu.status & 0x04 == 0) {
            self.cpu.irq_pending = false;
            self.do_irq();
            // 扣除本次時鐘週期
            self.cpu.cycles = self.cpu.cycles.saturating_sub(1);
            return;
        }

        // 取指令並執行
        let opcode = self.bus_read(self.cpu.pc);
        self.cpu.pc = self.cpu.pc.wrapping_add(1);
        self.execute_cpu_instruction(opcode);

        // 扣除本次時鐘週期（fetch + execute 本身消耗 1 cycle）
        self.cpu.cycles = self.cpu.cycles.saturating_sub(1);
    }

    /// 匯流排讀取
    fn bus_read(&mut self, addr: u16) -> u8 {
        self.bus.cpu_read(
            addr,
            &mut self.ppu, &mut self.apu, &self.cartridge,
            &mut self.ctrl1, &mut self.ctrl2,
        )
    }

    /// 匯流排寫入
    fn bus_write(&mut self, addr: u16, data: u8) {
        #[cfg(test)]
        if addr >= 0x8000 {
            self.mapper_cpu_writes.push((self.system_clock, addr, data));
        }

        self.bus.cpu_write(
            addr, data,
            &mut self.ppu, &mut self.apu, &mut self.cartridge,
            &mut self.ctrl1, &mut self.ctrl2,
        );

        // 寫入 Mapper 暫存器空間後同步 Mapper 狀態到 PPU
        // 大多數 Mapper 的 bank 切換暫存器在 $8000-$FFFF
        // 部分 Mapper（如 Mapper 16）使用 $6000-$7FFF
        if addr >= 0x6000 {
            self.sync_mapper_to_ppu();
        }
    }

    /// 同步 Mapper 的 CHR bank 映射和鏡像模式到 PPU
    fn sync_mapper_to_ppu(&mut self) {
        // 同步鏡像模式
        let mirror = self.cartridge.mirror_mode();
        self.ppu.set_mirror_mode(mirror);

        // 同步 CHR bank 映射（透過 Mapper 計算每個 1KB bank 的偏移量）
        let mut offsets = [0u32; 8];
        for i in 0..8u16 {
            let addr = i * 0x0400; // 每個 bank 起始地址：$0000, $0400, ..., $1C00
            if let Some(mapped) = self.cartridge.mapper.ppu_read(addr) {
                // mapped 是 Mapper 回傳的位元組偏移量
                // 我們需要計算 bank 的起始偏移（去掉 bank 內的偏移）
                offsets[i as usize] = mapped; // mapped 已經是 addr 0 在 bank 內的偏移
            } else {
                offsets[i as usize] = addr as u32;
            }
        }
        self.ppu.set_chr_bank_offsets(offsets);

        // 同步 CHR bank 可寫入遮罩（用於混合 CHR ROM/RAM mapper 如 253）
        let writable_mask = self.cartridge.mapper.chr_writable_mask();
        self.ppu.set_chr_writable_mask(writable_mask);
    }

    /// 推入堆疊
    fn push(&mut self, data: u8) {
        self.bus_write(0x0100 | self.cpu.sp as u16, data);
        self.cpu.sp = self.cpu.sp.wrapping_sub(1);
    }

    /// 從堆疊彈出
    fn pop(&mut self) -> u8 {
        self.cpu.sp = self.cpu.sp.wrapping_add(1);
        self.bus_read(0x0100 | self.cpu.sp as u16)
    }

    /// 推入 16 位元值
    fn push16(&mut self, data: u16) {
        self.push((data >> 8) as u8);
        self.push(data as u8);
    }

    /// 彈出 16 位元值
    fn pop16(&mut self) -> u16 {
        let lo = self.pop() as u16;
        let hi = self.pop() as u16;
        (hi << 8) | lo
    }

    /// 設定零旗標和負旗標
    fn set_zn(&mut self, value: u8) {
        if value == 0 { self.cpu.status |= 0x02; } else { self.cpu.status &= !0x02; }
        if value & 0x80 != 0 { self.cpu.status |= 0x80; } else { self.cpu.status &= !0x80; }
    }

    fn carry(&self) -> bool { self.cpu.status & 0x01 != 0 }
    fn zero(&self) -> bool { self.cpu.status & 0x02 != 0 }
    fn overflow_flag(&self) -> bool { self.cpu.status & 0x40 != 0 }
    fn negative(&self) -> bool { self.cpu.status & 0x80 != 0 }

    fn set_carry(&mut self, v: bool) {
        if v { self.cpu.status |= 0x01; } else { self.cpu.status &= !0x01; }
    }
    fn set_overflow(&mut self, v: bool) {
        if v { self.cpu.status |= 0x40; } else { self.cpu.status &= !0x40; }
    }

    /// NMI
    fn do_nmi(&mut self) {
        self.push16(self.cpu.pc);
        self.push((self.cpu.status & !0x10) | 0x20);
        self.cpu.status |= 0x04;
        let lo = self.bus_read(0xFFFA) as u16;
        let hi = self.bus_read(0xFFFB) as u16;
        self.cpu.pc = (hi << 8) | lo;
        self.cpu.cycles = 7;
    }

    /// IRQ
    fn do_irq(&mut self) {
        self.push16(self.cpu.pc);
        self.push((self.cpu.status & !0x10) | 0x20);
        self.cpu.status |= 0x04;
        let lo = self.bus_read(0xFFFE) as u16;
        let hi = self.bus_read(0xFFFF) as u16;
        self.cpu.pc = (hi << 8) | lo;
        self.cpu.cycles = 7;
    }

    /// 讀取 16 位元（帶頁面邊界 bug）
    fn read16_bug(&mut self, addr: u16) -> u16 {
        let lo = self.bus_read(addr) as u16;
        let hi_addr = (addr & 0xFF00) | ((addr.wrapping_add(1)) & 0x00FF);
        let hi = self.bus_read(hi_addr) as u16;
        (hi << 8) | lo
    }

    /// 分支指令
    fn branch(&mut self, condition: bool) {
        let offset = self.bus_read(self.cpu.pc) as i8;
        self.cpu.pc = self.cpu.pc.wrapping_add(1);
        if condition {
            let new_pc = self.cpu.pc.wrapping_add(offset as u16);
            if (self.cpu.pc & 0xFF00) != (new_pc & 0xFF00) { self.cpu.cycles += 1; }
            self.cpu.cycles += 1;
            self.cpu.pc = new_pc;
        }
    }

    // ============================================================
    // CPU 指令執行
    // ============================================================
    fn execute_cpu_instruction(&mut self, opcode: u8) {
        match opcode {
            // ADC
            0x69 => { let v = self.imm(); self.op_adc(v); self.cpu.cycles = 2; }
            0x65 => { let v = self.zp_r(); self.op_adc(v); self.cpu.cycles = 3; }
            0x75 => { let v = self.zpx_r(); self.op_adc(v); self.cpu.cycles = 4; }
            0x6D => { let (v, _) = self.abs_r(); self.op_adc(v); self.cpu.cycles = 4; }
            0x7D => { let (v, e) = self.abx_r(); self.op_adc(v); self.cpu.cycles = 4 + e; }
            0x79 => { let (v, e) = self.aby_r(); self.op_adc(v); self.cpu.cycles = 4 + e; }
            0x61 => { let v = self.izx_r(); self.op_adc(v); self.cpu.cycles = 6; }
            0x71 => { let (v, e) = self.izy_r(); self.op_adc(v); self.cpu.cycles = 5 + e; }

            // AND
            0x29 => { let v = self.imm(); self.cpu.a &= v; self.set_zn(self.cpu.a); self.cpu.cycles = 2; }
            0x25 => { let v = self.zp_r(); self.cpu.a &= v; self.set_zn(self.cpu.a); self.cpu.cycles = 3; }
            0x35 => { let v = self.zpx_r(); self.cpu.a &= v; self.set_zn(self.cpu.a); self.cpu.cycles = 4; }
            0x2D => { let (v, _) = self.abs_r(); self.cpu.a &= v; self.set_zn(self.cpu.a); self.cpu.cycles = 4; }
            0x3D => { let (v, e) = self.abx_r(); self.cpu.a &= v; self.set_zn(self.cpu.a); self.cpu.cycles = 4 + e; }
            0x39 => { let (v, e) = self.aby_r(); self.cpu.a &= v; self.set_zn(self.cpu.a); self.cpu.cycles = 4 + e; }
            0x21 => { let v = self.izx_r(); self.cpu.a &= v; self.set_zn(self.cpu.a); self.cpu.cycles = 6; }
            0x31 => { let (v, e) = self.izy_r(); self.cpu.a &= v; self.set_zn(self.cpu.a); self.cpu.cycles = 5 + e; }

            // ASL
            0x0A => { self.set_carry(self.cpu.a & 0x80 != 0); self.cpu.a <<= 1; self.set_zn(self.cpu.a); self.cpu.cycles = 2; }
            0x06 => { let a = self.zp(); self.op_asl_m(a); self.cpu.cycles = 5; }
            0x16 => { let a = self.zpx(); self.op_asl_m(a); self.cpu.cycles = 6; }
            0x0E => { let a = self.abs(); self.op_asl_m(a); self.cpu.cycles = 6; }
            0x1E => { let a = self.abx_w(); self.op_asl_m(a); self.cpu.cycles = 7; }

            // 分支
            0x90 => { self.cpu.cycles = 2; let c = !self.carry(); self.branch(c); }
            0xB0 => { self.cpu.cycles = 2; let c = self.carry(); self.branch(c); }
            0xF0 => { self.cpu.cycles = 2; let c = self.zero(); self.branch(c); }
            0x30 => { self.cpu.cycles = 2; let c = self.negative(); self.branch(c); }
            0xD0 => { self.cpu.cycles = 2; let c = !self.zero(); self.branch(c); }
            0x10 => { self.cpu.cycles = 2; let c = !self.negative(); self.branch(c); }
            0x50 => { self.cpu.cycles = 2; let c = !self.overflow_flag(); self.branch(c); }
            0x70 => { self.cpu.cycles = 2; let c = self.overflow_flag(); self.branch(c); }

            // BIT
            0x24 => { let v = self.zp_r(); self.op_bit(v); self.cpu.cycles = 3; }
            0x2C => { let (v, _) = self.abs_r(); self.op_bit(v); self.cpu.cycles = 4; }

            // BRK
            0x00 => {
                self.cpu.pc = self.cpu.pc.wrapping_add(1);
                self.push16(self.cpu.pc);
                self.push(self.cpu.status | 0x30);
                self.cpu.status |= 0x04;
                let lo = self.bus_read(0xFFFE) as u16;
                let hi = self.bus_read(0xFFFF) as u16;
                self.cpu.pc = (hi << 8) | lo;
                self.cpu.cycles = 7;
            }

            // 旗標
            0x18 => { self.cpu.status &= !0x01; self.cpu.cycles = 2; }
            0xD8 => { self.cpu.status &= !0x08; self.cpu.cycles = 2; }
            0x58 => { self.cpu.status &= !0x04; self.cpu.cycles = 2; }
            0xB8 => { self.cpu.status &= !0x40; self.cpu.cycles = 2; }
            0x38 => { self.cpu.status |= 0x01; self.cpu.cycles = 2; }
            0xF8 => { self.cpu.status |= 0x08; self.cpu.cycles = 2; }
            0x78 => { self.cpu.status |= 0x04; self.cpu.cycles = 2; }

            // CMP
            0xC9 => { let v = self.imm(); let a = self.cpu.a; self.op_cmp(a, v); self.cpu.cycles = 2; }
            0xC5 => { let v = self.zp_r(); let a = self.cpu.a; self.op_cmp(a, v); self.cpu.cycles = 3; }
            0xD5 => { let v = self.zpx_r(); let a = self.cpu.a; self.op_cmp(a, v); self.cpu.cycles = 4; }
            0xCD => { let (v, _) = self.abs_r(); let a = self.cpu.a; self.op_cmp(a, v); self.cpu.cycles = 4; }
            0xDD => { let (v, e) = self.abx_r(); let a = self.cpu.a; self.op_cmp(a, v); self.cpu.cycles = 4 + e; }
            0xD9 => { let (v, e) = self.aby_r(); let a = self.cpu.a; self.op_cmp(a, v); self.cpu.cycles = 4 + e; }
            0xC1 => { let v = self.izx_r(); let a = self.cpu.a; self.op_cmp(a, v); self.cpu.cycles = 6; }
            0xD1 => { let (v, e) = self.izy_r(); let a = self.cpu.a; self.op_cmp(a, v); self.cpu.cycles = 5 + e; }

            // CPX
            0xE0 => { let v = self.imm(); let x = self.cpu.x; self.op_cmp(x, v); self.cpu.cycles = 2; }
            0xE4 => { let v = self.zp_r(); let x = self.cpu.x; self.op_cmp(x, v); self.cpu.cycles = 3; }
            0xEC => { let (v, _) = self.abs_r(); let x = self.cpu.x; self.op_cmp(x, v); self.cpu.cycles = 4; }

            // CPY
            0xC0 => { let v = self.imm(); let y = self.cpu.y; self.op_cmp(y, v); self.cpu.cycles = 2; }
            0xC4 => { let v = self.zp_r(); let y = self.cpu.y; self.op_cmp(y, v); self.cpu.cycles = 3; }
            0xCC => { let (v, _) = self.abs_r(); let y = self.cpu.y; self.op_cmp(y, v); self.cpu.cycles = 4; }

            // DEC
            0xC6 => { let a = self.zp(); self.op_dec_m(a); self.cpu.cycles = 5; }
            0xD6 => { let a = self.zpx(); self.op_dec_m(a); self.cpu.cycles = 6; }
            0xCE => { let a = self.abs(); self.op_dec_m(a); self.cpu.cycles = 6; }
            0xDE => { let a = self.abx_w(); self.op_dec_m(a); self.cpu.cycles = 7; }
            0xCA => { self.cpu.x = self.cpu.x.wrapping_sub(1); self.set_zn(self.cpu.x); self.cpu.cycles = 2; }
            0x88 => { self.cpu.y = self.cpu.y.wrapping_sub(1); self.set_zn(self.cpu.y); self.cpu.cycles = 2; }

            // EOR
            0x49 => { let v = self.imm(); self.cpu.a ^= v; self.set_zn(self.cpu.a); self.cpu.cycles = 2; }
            0x45 => { let v = self.zp_r(); self.cpu.a ^= v; self.set_zn(self.cpu.a); self.cpu.cycles = 3; }
            0x55 => { let v = self.zpx_r(); self.cpu.a ^= v; self.set_zn(self.cpu.a); self.cpu.cycles = 4; }
            0x4D => { let (v, _) = self.abs_r(); self.cpu.a ^= v; self.set_zn(self.cpu.a); self.cpu.cycles = 4; }
            0x5D => { let (v, e) = self.abx_r(); self.cpu.a ^= v; self.set_zn(self.cpu.a); self.cpu.cycles = 4 + e; }
            0x59 => { let (v, e) = self.aby_r(); self.cpu.a ^= v; self.set_zn(self.cpu.a); self.cpu.cycles = 4 + e; }
            0x41 => { let v = self.izx_r(); self.cpu.a ^= v; self.set_zn(self.cpu.a); self.cpu.cycles = 6; }
            0x51 => { let (v, e) = self.izy_r(); self.cpu.a ^= v; self.set_zn(self.cpu.a); self.cpu.cycles = 5 + e; }

            // INC
            0xE6 => { let a = self.zp(); self.op_inc_m(a); self.cpu.cycles = 5; }
            0xF6 => { let a = self.zpx(); self.op_inc_m(a); self.cpu.cycles = 6; }
            0xEE => { let a = self.abs(); self.op_inc_m(a); self.cpu.cycles = 6; }
            0xFE => { let a = self.abx_w(); self.op_inc_m(a); self.cpu.cycles = 7; }
            0xE8 => { self.cpu.x = self.cpu.x.wrapping_add(1); self.set_zn(self.cpu.x); self.cpu.cycles = 2; }
            0xC8 => { self.cpu.y = self.cpu.y.wrapping_add(1); self.set_zn(self.cpu.y); self.cpu.cycles = 2; }

            // JMP
            0x4C => { let addr = self.abs(); self.cpu.pc = addr; self.cpu.cycles = 3; }
            0x6C => { let ptr = self.abs(); let addr = self.read16_bug(ptr); self.cpu.pc = addr; self.cpu.cycles = 5; }

            // JSR
            0x20 => { let addr = self.abs(); let ret = self.cpu.pc.wrapping_sub(1); self.push16(ret); self.cpu.pc = addr; self.cpu.cycles = 6; }

            // LDA
            0xA9 => { self.cpu.a = self.imm(); self.set_zn(self.cpu.a); self.cpu.cycles = 2; }
            0xA5 => { self.cpu.a = self.zp_r(); self.set_zn(self.cpu.a); self.cpu.cycles = 3; }
            0xB5 => { self.cpu.a = self.zpx_r(); self.set_zn(self.cpu.a); self.cpu.cycles = 4; }
            0xAD => { let (v, _) = self.abs_r(); self.cpu.a = v; self.set_zn(self.cpu.a); self.cpu.cycles = 4; }
            0xBD => { let (v, e) = self.abx_r(); self.cpu.a = v; self.set_zn(self.cpu.a); self.cpu.cycles = 4 + e; }
            0xB9 => { let (v, e) = self.aby_r(); self.cpu.a = v; self.set_zn(self.cpu.a); self.cpu.cycles = 4 + e; }
            0xA1 => { self.cpu.a = self.izx_r(); self.set_zn(self.cpu.a); self.cpu.cycles = 6; }
            0xB1 => { let (v, e) = self.izy_r(); self.cpu.a = v; self.set_zn(self.cpu.a); self.cpu.cycles = 5 + e; }

            // LDX
            0xA2 => { self.cpu.x = self.imm(); self.set_zn(self.cpu.x); self.cpu.cycles = 2; }
            0xA6 => { self.cpu.x = self.zp_r(); self.set_zn(self.cpu.x); self.cpu.cycles = 3; }
            0xB6 => { // zp,Y
                let base = self.bus_read(self.cpu.pc) as u16;
                self.cpu.pc = self.cpu.pc.wrapping_add(1);
                let addr = (base.wrapping_add(self.cpu.y as u16)) & 0xFF;
                self.cpu.x = self.bus_read(addr); self.set_zn(self.cpu.x); self.cpu.cycles = 4;
            }
            0xAE => { let (v, _) = self.abs_r(); self.cpu.x = v; self.set_zn(self.cpu.x); self.cpu.cycles = 4; }
            0xBE => { let (v, e) = self.aby_r(); self.cpu.x = v; self.set_zn(self.cpu.x); self.cpu.cycles = 4 + e; }

            // LDY
            0xA0 => { self.cpu.y = self.imm(); self.set_zn(self.cpu.y); self.cpu.cycles = 2; }
            0xA4 => { self.cpu.y = self.zp_r(); self.set_zn(self.cpu.y); self.cpu.cycles = 3; }
            0xB4 => { self.cpu.y = self.zpx_r(); self.set_zn(self.cpu.y); self.cpu.cycles = 4; }
            0xAC => { let (v, _) = self.abs_r(); self.cpu.y = v; self.set_zn(self.cpu.y); self.cpu.cycles = 4; }
            0xBC => { let (v, e) = self.abx_r(); self.cpu.y = v; self.set_zn(self.cpu.y); self.cpu.cycles = 4 + e; }

            // LSR
            0x4A => { self.set_carry(self.cpu.a & 0x01 != 0); self.cpu.a >>= 1; self.set_zn(self.cpu.a); self.cpu.cycles = 2; }
            0x46 => { let a = self.zp(); self.op_lsr_m(a); self.cpu.cycles = 5; }
            0x56 => { let a = self.zpx(); self.op_lsr_m(a); self.cpu.cycles = 6; }
            0x4E => { let a = self.abs(); self.op_lsr_m(a); self.cpu.cycles = 6; }
            0x5E => { let a = self.abx_w(); self.op_lsr_m(a); self.cpu.cycles = 7; }

            // NOP
            0xEA => { self.cpu.cycles = 2; }

            // ORA
            0x09 => { let v = self.imm(); self.cpu.a |= v; self.set_zn(self.cpu.a); self.cpu.cycles = 2; }
            0x05 => { let v = self.zp_r(); self.cpu.a |= v; self.set_zn(self.cpu.a); self.cpu.cycles = 3; }
            0x15 => { let v = self.zpx_r(); self.cpu.a |= v; self.set_zn(self.cpu.a); self.cpu.cycles = 4; }
            0x0D => { let (v, _) = self.abs_r(); self.cpu.a |= v; self.set_zn(self.cpu.a); self.cpu.cycles = 4; }
            0x1D => { let (v, e) = self.abx_r(); self.cpu.a |= v; self.set_zn(self.cpu.a); self.cpu.cycles = 4 + e; }
            0x19 => { let (v, e) = self.aby_r(); self.cpu.a |= v; self.set_zn(self.cpu.a); self.cpu.cycles = 4 + e; }
            0x01 => { let v = self.izx_r(); self.cpu.a |= v; self.set_zn(self.cpu.a); self.cpu.cycles = 6; }
            0x11 => { let (v, e) = self.izy_r(); self.cpu.a |= v; self.set_zn(self.cpu.a); self.cpu.cycles = 5 + e; }

            // 堆疊
            0x48 => { let a = self.cpu.a; self.push(a); self.cpu.cycles = 3; }
            0x08 => { let s = self.cpu.status | 0x30; self.push(s); self.cpu.cycles = 3; }
            0x68 => { self.cpu.a = self.pop(); self.set_zn(self.cpu.a); self.cpu.cycles = 4; }
            0x28 => { let v = self.pop(); self.cpu.status = (v & !0x30) | (self.cpu.status & 0x30); self.cpu.status |= 0x20; self.cpu.cycles = 4; }

            // ROL
            0x2A => { let c = self.carry() as u8; self.set_carry(self.cpu.a & 0x80 != 0); self.cpu.a = (self.cpu.a << 1) | c; self.set_zn(self.cpu.a); self.cpu.cycles = 2; }
            0x26 => { let a = self.zp(); self.op_rol_m(a); self.cpu.cycles = 5; }
            0x36 => { let a = self.zpx(); self.op_rol_m(a); self.cpu.cycles = 6; }
            0x2E => { let a = self.abs(); self.op_rol_m(a); self.cpu.cycles = 6; }
            0x3E => { let a = self.abx_w(); self.op_rol_m(a); self.cpu.cycles = 7; }

            // ROR
            0x6A => { let c = if self.carry() { 0x80u8 } else { 0 }; self.set_carry(self.cpu.a & 0x01 != 0); self.cpu.a = (self.cpu.a >> 1) | c; self.set_zn(self.cpu.a); self.cpu.cycles = 2; }
            0x66 => { let a = self.zp(); self.op_ror_m(a); self.cpu.cycles = 5; }
            0x76 => { let a = self.zpx(); self.op_ror_m(a); self.cpu.cycles = 6; }
            0x6E => { let a = self.abs(); self.op_ror_m(a); self.cpu.cycles = 6; }
            0x7E => { let a = self.abx_w(); self.op_ror_m(a); self.cpu.cycles = 7; }

            // RTI
            0x40 => { let s = self.pop(); self.cpu.status = (s & !0x30) | 0x20; self.cpu.pc = self.pop16(); self.cpu.cycles = 6; }

            // RTS
            0x60 => { self.cpu.pc = self.pop16().wrapping_add(1); self.cpu.cycles = 6; }

            // SBC
            0xE9 | 0xEB => { let v = self.imm(); self.op_sbc(v); self.cpu.cycles = 2; }
            0xE5 => { let v = self.zp_r(); self.op_sbc(v); self.cpu.cycles = 3; }
            0xF5 => { let v = self.zpx_r(); self.op_sbc(v); self.cpu.cycles = 4; }
            0xED => { let (v, _) = self.abs_r(); self.op_sbc(v); self.cpu.cycles = 4; }
            0xFD => { let (v, e) = self.abx_r(); self.op_sbc(v); self.cpu.cycles = 4 + e; }
            0xF9 => { let (v, e) = self.aby_r(); self.op_sbc(v); self.cpu.cycles = 4 + e; }
            0xE1 => { let v = self.izx_r(); self.op_sbc(v); self.cpu.cycles = 6; }
            0xF1 => { let (v, e) = self.izy_r(); self.op_sbc(v); self.cpu.cycles = 5 + e; }

            // STA
            0x85 => { let a = self.zp(); let v = self.cpu.a; self.bus_write(a, v); self.cpu.cycles = 3; }
            0x95 => { let a = self.zpx(); let v = self.cpu.a; self.bus_write(a, v); self.cpu.cycles = 4; }
            0x8D => { let a = self.abs(); let v = self.cpu.a; self.bus_write(a, v); self.cpu.cycles = 4; }
            0x9D => { let a = self.abx_w(); let v = self.cpu.a; self.bus_write(a, v); self.cpu.cycles = 5; }
            0x99 => { let a = self.aby_w(); let v = self.cpu.a; self.bus_write(a, v); self.cpu.cycles = 5; }
            0x81 => { let a = self.izx(); let v = self.cpu.a; self.bus_write(a, v); self.cpu.cycles = 6; }
            0x91 => { let a = self.izy_w(); let v = self.cpu.a; self.bus_write(a, v); self.cpu.cycles = 6; }

            // STX
            0x86 => { let a = self.zp(); let v = self.cpu.x; self.bus_write(a, v); self.cpu.cycles = 3; }
            0x96 => { // zp,Y
                let base = self.bus_read(self.cpu.pc).wrapping_add(self.cpu.y) as u16 & 0xFF;
                self.cpu.pc = self.cpu.pc.wrapping_add(1);
                let v = self.cpu.x; self.bus_write(base, v); self.cpu.cycles = 4;
            }
            0x8E => { let a = self.abs(); let v = self.cpu.x; self.bus_write(a, v); self.cpu.cycles = 4; }

            // STY
            0x84 => { let a = self.zp(); let v = self.cpu.y; self.bus_write(a, v); self.cpu.cycles = 3; }
            0x94 => { let a = self.zpx(); let v = self.cpu.y; self.bus_write(a, v); self.cpu.cycles = 4; }
            0x8C => { let a = self.abs(); let v = self.cpu.y; self.bus_write(a, v); self.cpu.cycles = 4; }

            // 暫存器傳輸
            0xAA => { self.cpu.x = self.cpu.a; self.set_zn(self.cpu.x); self.cpu.cycles = 2; }
            0xA8 => { self.cpu.y = self.cpu.a; self.set_zn(self.cpu.y); self.cpu.cycles = 2; }
            0xBA => { self.cpu.x = self.cpu.sp; self.set_zn(self.cpu.x); self.cpu.cycles = 2; }
            0x8A => { self.cpu.a = self.cpu.x; self.set_zn(self.cpu.a); self.cpu.cycles = 2; }
            0x9A => { self.cpu.sp = self.cpu.x; self.cpu.cycles = 2; }
            0x98 => { self.cpu.a = self.cpu.y; self.set_zn(self.cpu.a); self.cpu.cycles = 2; }

            // === 非官方指令 ===
            // LAX
            0xA7 => { let v = self.zp_r(); self.cpu.a = v; self.cpu.x = v; self.set_zn(v); self.cpu.cycles = 3; }
            0xB7 => { let base = self.bus_read(self.cpu.pc) as u16; self.cpu.pc = self.cpu.pc.wrapping_add(1); let addr = (base.wrapping_add(self.cpu.y as u16)) & 0xFF; let v = self.bus_read(addr); self.cpu.a = v; self.cpu.x = v; self.set_zn(v); self.cpu.cycles = 4; }
            0xAF => { let (v, _) = self.abs_r(); self.cpu.a = v; self.cpu.x = v; self.set_zn(v); self.cpu.cycles = 4; }
            0xBF => { let (v, e) = self.aby_r(); self.cpu.a = v; self.cpu.x = v; self.set_zn(v); self.cpu.cycles = 4 + e; }
            0xA3 => { let v = self.izx_r(); self.cpu.a = v; self.cpu.x = v; self.set_zn(v); self.cpu.cycles = 6; }
            0xB3 => { let (v, e) = self.izy_r(); self.cpu.a = v; self.cpu.x = v; self.set_zn(v); self.cpu.cycles = 5 + e; }

            // SAX
            0x87 => { let a = self.zp(); let v = self.cpu.a & self.cpu.x; self.bus_write(a, v); self.cpu.cycles = 3; }
            0x97 => { let base = self.bus_read(self.cpu.pc).wrapping_add(self.cpu.y) as u16 & 0xFF; self.cpu.pc = self.cpu.pc.wrapping_add(1); let v = self.cpu.a & self.cpu.x; self.bus_write(base, v); self.cpu.cycles = 4; }
            0x8F => { let a = self.abs(); let v = self.cpu.a & self.cpu.x; self.bus_write(a, v); self.cpu.cycles = 4; }
            0x83 => { let a = self.izx(); let v = self.cpu.a & self.cpu.x; self.bus_write(a, v); self.cpu.cycles = 6; }

            // DCP
            0xC7 => { let a = self.zp(); self.op_dcp(a); self.cpu.cycles = 5; }
            0xD7 => { let a = self.zpx(); self.op_dcp(a); self.cpu.cycles = 6; }
            0xCF => { let a = self.abs(); self.op_dcp(a); self.cpu.cycles = 6; }
            0xDF => { let a = self.abx_w(); self.op_dcp(a); self.cpu.cycles = 7; }
            0xDB => { let a = self.aby_w(); self.op_dcp(a); self.cpu.cycles = 7; }
            0xC3 => { let a = self.izx(); self.op_dcp(a); self.cpu.cycles = 8; }
            0xD3 => { let a = self.izy_w(); self.op_dcp(a); self.cpu.cycles = 8; }

            // ISB
            0xE7 => { let a = self.zp(); self.op_isb(a); self.cpu.cycles = 5; }
            0xF7 => { let a = self.zpx(); self.op_isb(a); self.cpu.cycles = 6; }
            0xEF => { let a = self.abs(); self.op_isb(a); self.cpu.cycles = 6; }
            0xFF => { let a = self.abx_w(); self.op_isb(a); self.cpu.cycles = 7; }
            0xFB => { let a = self.aby_w(); self.op_isb(a); self.cpu.cycles = 7; }
            0xE3 => { let a = self.izx(); self.op_isb(a); self.cpu.cycles = 8; }
            0xF3 => { let a = self.izy_w(); self.op_isb(a); self.cpu.cycles = 8; }

            // SLO
            0x07 => { let a = self.zp(); self.op_slo(a); self.cpu.cycles = 5; }
            0x17 => { let a = self.zpx(); self.op_slo(a); self.cpu.cycles = 6; }
            0x0F => { let a = self.abs(); self.op_slo(a); self.cpu.cycles = 6; }
            0x1F => { let a = self.abx_w(); self.op_slo(a); self.cpu.cycles = 7; }
            0x1B => { let a = self.aby_w(); self.op_slo(a); self.cpu.cycles = 7; }
            0x03 => { let a = self.izx(); self.op_slo(a); self.cpu.cycles = 8; }
            0x13 => { let a = self.izy_w(); self.op_slo(a); self.cpu.cycles = 8; }

            // RLA
            0x27 => { let a = self.zp(); self.op_rla(a); self.cpu.cycles = 5; }
            0x37 => { let a = self.zpx(); self.op_rla(a); self.cpu.cycles = 6; }
            0x2F => { let a = self.abs(); self.op_rla(a); self.cpu.cycles = 6; }
            0x3F => { let a = self.abx_w(); self.op_rla(a); self.cpu.cycles = 7; }
            0x3B => { let a = self.aby_w(); self.op_rla(a); self.cpu.cycles = 7; }
            0x23 => { let a = self.izx(); self.op_rla(a); self.cpu.cycles = 8; }
            0x33 => { let a = self.izy_w(); self.op_rla(a); self.cpu.cycles = 8; }

            // SRE
            0x47 => { let a = self.zp(); self.op_sre(a); self.cpu.cycles = 5; }
            0x57 => { let a = self.zpx(); self.op_sre(a); self.cpu.cycles = 6; }
            0x4F => { let a = self.abs(); self.op_sre(a); self.cpu.cycles = 6; }
            0x5F => { let a = self.abx_w(); self.op_sre(a); self.cpu.cycles = 7; }
            0x5B => { let a = self.aby_w(); self.op_sre(a); self.cpu.cycles = 7; }
            0x43 => { let a = self.izx(); self.op_sre(a); self.cpu.cycles = 8; }
            0x53 => { let a = self.izy_w(); self.op_sre(a); self.cpu.cycles = 8; }

            // RRA
            0x67 => { let a = self.zp(); self.op_rra(a); self.cpu.cycles = 5; }
            0x77 => { let a = self.zpx(); self.op_rra(a); self.cpu.cycles = 6; }
            0x6F => { let a = self.abs(); self.op_rra(a); self.cpu.cycles = 6; }
            0x7F => { let a = self.abx_w(); self.op_rra(a); self.cpu.cycles = 7; }
            0x7B => { let a = self.aby_w(); self.op_rra(a); self.cpu.cycles = 7; }
            0x63 => { let a = self.izx(); self.op_rra(a); self.cpu.cycles = 8; }
            0x73 => { let a = self.izy_w(); self.op_rra(a); self.cpu.cycles = 8; }

            // NOP 變體
            0x1A | 0x3A | 0x5A | 0x7A | 0xDA | 0xFA => { self.cpu.cycles = 2; }
            0x80 | 0x82 | 0x89 | 0xC2 | 0xE2 => { self.cpu.pc = self.cpu.pc.wrapping_add(1); self.cpu.cycles = 2; }
            0x04 | 0x44 | 0x64 => { self.cpu.pc = self.cpu.pc.wrapping_add(1); self.cpu.cycles = 3; }
            0x14 | 0x34 | 0x54 | 0x74 | 0xD4 | 0xF4 => { self.cpu.pc = self.cpu.pc.wrapping_add(1); self.cpu.cycles = 4; }
            0x0C => { self.cpu.pc = self.cpu.pc.wrapping_add(2); self.cpu.cycles = 4; }
            0x1C | 0x3C | 0x5C | 0x7C | 0xDC | 0xFC => {
                let lo = self.bus_read(self.cpu.pc) as u16;
                let hi = self.bus_read(self.cpu.pc.wrapping_add(1)) as u16;
                self.cpu.pc = self.cpu.pc.wrapping_add(2);
                let base = (hi << 8) | lo;
                let addr = base.wrapping_add(self.cpu.x as u16);
                let extra = if (base & 0xFF00) != (addr & 0xFF00) { 1u8 } else { 0 };
                self.cpu.cycles = 4 + extra;
            }

            _ => { self.cpu.cycles = 2; }
        }
    }

    // ============================================================
    // 定址模式輔助函數（簡短命名以減少重複碼量）
    // ============================================================

    /// 立即值
    fn imm(&mut self) -> u8 {
        let v = self.bus_read(self.cpu.pc);
        self.cpu.pc = self.cpu.pc.wrapping_add(1);
        v
    }

    /// 零頁位址
    fn zp(&mut self) -> u16 {
        let a = self.bus_read(self.cpu.pc) as u16;
        self.cpu.pc = self.cpu.pc.wrapping_add(1);
        a
    }

    /// 零頁讀取
    fn zp_r(&mut self) -> u8 { let a = self.zp(); self.bus_read(a) }

    /// 零頁+X 位址
    fn zpx(&mut self) -> u16 {
        let a = self.bus_read(self.cpu.pc).wrapping_add(self.cpu.x) as u16 & 0xFF;
        self.cpu.pc = self.cpu.pc.wrapping_add(1);
        a
    }

    /// 零頁+X 讀取
    fn zpx_r(&mut self) -> u8 { let a = self.zpx(); self.bus_read(a) }

    /// 絕對位址
    fn abs(&mut self) -> u16 {
        let lo = self.bus_read(self.cpu.pc) as u16;
        let hi = self.bus_read(self.cpu.pc.wrapping_add(1)) as u16;
        self.cpu.pc = self.cpu.pc.wrapping_add(2);
        (hi << 8) | lo
    }

    /// 絕對讀取
    fn abs_r(&mut self) -> (u8, u8) { let a = self.abs(); (self.bus_read(a), 0) }

    /// 絕對+X 讀取（含頁面交叉檢查）
    fn abx_r(&mut self) -> (u8, u8) {
        let lo = self.bus_read(self.cpu.pc) as u16;
        let hi = self.bus_read(self.cpu.pc.wrapping_add(1)) as u16;
        self.cpu.pc = self.cpu.pc.wrapping_add(2);
        let base = (hi << 8) | lo;
        let addr = base.wrapping_add(self.cpu.x as u16);
        let e = if (base & 0xFF00) != (addr & 0xFF00) { 1u8 } else { 0 };
        (self.bus_read(addr), e)
    }

    /// 絕對+X 位址（寫入用）
    fn abx_w(&mut self) -> u16 {
        let lo = self.bus_read(self.cpu.pc) as u16;
        let hi = self.bus_read(self.cpu.pc.wrapping_add(1)) as u16;
        self.cpu.pc = self.cpu.pc.wrapping_add(2);
        ((hi << 8) | lo).wrapping_add(self.cpu.x as u16)
    }

    /// 絕對+Y 讀取
    fn aby_r(&mut self) -> (u8, u8) {
        let lo = self.bus_read(self.cpu.pc) as u16;
        let hi = self.bus_read(self.cpu.pc.wrapping_add(1)) as u16;
        self.cpu.pc = self.cpu.pc.wrapping_add(2);
        let base = (hi << 8) | lo;
        let addr = base.wrapping_add(self.cpu.y as u16);
        let e = if (base & 0xFF00) != (addr & 0xFF00) { 1u8 } else { 0 };
        (self.bus_read(addr), e)
    }

    /// 絕對+Y 位址（寫入用）
    fn aby_w(&mut self) -> u16 {
        let lo = self.bus_read(self.cpu.pc) as u16;
        let hi = self.bus_read(self.cpu.pc.wrapping_add(1)) as u16;
        self.cpu.pc = self.cpu.pc.wrapping_add(2);
        ((hi << 8) | lo).wrapping_add(self.cpu.y as u16)
    }

    /// (間接,X) 位址
    fn izx(&mut self) -> u16 {
        let ptr = self.bus_read(self.cpu.pc).wrapping_add(self.cpu.x) as u16;
        self.cpu.pc = self.cpu.pc.wrapping_add(1);
        let lo = self.bus_read(ptr & 0xFF) as u16;
        let hi = self.bus_read((ptr.wrapping_add(1)) & 0xFF) as u16;
        (hi << 8) | lo
    }

    /// (間接,X) 讀取
    fn izx_r(&mut self) -> u8 { let a = self.izx(); self.bus_read(a) }

    /// (間接),Y 讀取
    fn izy_r(&mut self) -> (u8, u8) {
        let ptr = self.bus_read(self.cpu.pc) as u16;
        self.cpu.pc = self.cpu.pc.wrapping_add(1);
        let lo = self.bus_read(ptr) as u16;
        let hi = self.bus_read((ptr.wrapping_add(1)) & 0xFF) as u16;
        let base = (hi << 8) | lo;
        let addr = base.wrapping_add(self.cpu.y as u16);
        let e = if (base & 0xFF00) != (addr & 0xFF00) { 1u8 } else { 0 };
        (self.bus_read(addr), e)
    }

    /// (間接),Y 位址（寫入用）
    fn izy_w(&mut self) -> u16 {
        let ptr = self.bus_read(self.cpu.pc) as u16;
        self.cpu.pc = self.cpu.pc.wrapping_add(1);
        let lo = self.bus_read(ptr) as u16;
        let hi = self.bus_read((ptr.wrapping_add(1)) & 0xFF) as u16;
        ((hi << 8) | lo).wrapping_add(self.cpu.y as u16)
    }

    // ============================================================
    // 指令操作
    // ============================================================

    fn op_adc(&mut self, value: u8) {
        let a = self.cpu.a as u16;
        let v = value as u16;
        let c = self.carry() as u16;
        let result = a + v + c;
        self.set_carry(result > 0xFF);
        self.set_overflow(((a ^ result) & (v ^ result) & 0x80) != 0);
        self.cpu.a = result as u8;
        self.set_zn(self.cpu.a);
    }

    fn op_sbc(&mut self, value: u8) {
        let a = self.cpu.a as u16;
        let v = value as u16;
        let c = self.carry() as u16;
        let result = a.wrapping_sub(v).wrapping_sub(1 - c);
        self.set_carry(result < 0x100);
        self.set_overflow(((a ^ result) & (a ^ v) & 0x80) != 0);
        self.cpu.a = result as u8;
        self.set_zn(self.cpu.a);
    }

    fn op_cmp(&mut self, reg: u8, value: u8) {
        self.set_carry(reg >= value);
        self.set_zn(reg.wrapping_sub(value));
    }

    fn op_bit(&mut self, value: u8) {
        self.set_overflow(value & 0x40 != 0);
        if value & 0x80 != 0 { self.cpu.status |= 0x80; } else { self.cpu.status &= !0x80; }
        let r = self.cpu.a & value;
        if r == 0 { self.cpu.status |= 0x02; } else { self.cpu.status &= !0x02; }
    }

    fn op_asl_m(&mut self, addr: u16) {
        let mut v = self.bus_read(addr); self.set_carry(v & 0x80 != 0);
        v <<= 1; self.bus_write(addr, v); self.set_zn(v);
    }

    fn op_lsr_m(&mut self, addr: u16) {
        let mut v = self.bus_read(addr); self.set_carry(v & 0x01 != 0);
        v >>= 1; self.bus_write(addr, v); self.set_zn(v);
    }

    fn op_rol_m(&mut self, addr: u16) {
        let mut v = self.bus_read(addr); let c = self.carry() as u8;
        self.set_carry(v & 0x80 != 0); v = (v << 1) | c;
        self.bus_write(addr, v); self.set_zn(v);
    }

    fn op_ror_m(&mut self, addr: u16) {
        let mut v = self.bus_read(addr); let c = if self.carry() { 0x80u8 } else { 0 };
        self.set_carry(v & 0x01 != 0); v = (v >> 1) | c;
        self.bus_write(addr, v); self.set_zn(v);
    }

    fn op_dec_m(&mut self, addr: u16) {
        let v = self.bus_read(addr).wrapping_sub(1); self.bus_write(addr, v); self.set_zn(v);
    }

    fn op_inc_m(&mut self, addr: u16) {
        let v = self.bus_read(addr).wrapping_add(1); self.bus_write(addr, v); self.set_zn(v);
    }

    fn op_dcp(&mut self, addr: u16) {
        let v = self.bus_read(addr).wrapping_sub(1); self.bus_write(addr, v);
        let a = self.cpu.a; self.op_cmp(a, v);
    }

    fn op_isb(&mut self, addr: u16) {
        let v = self.bus_read(addr).wrapping_add(1); self.bus_write(addr, v);
        self.op_sbc(v);
    }

    fn op_slo(&mut self, addr: u16) {
        let mut v = self.bus_read(addr); self.set_carry(v & 0x80 != 0);
        v <<= 1; self.bus_write(addr, v);
        self.cpu.a |= v; self.set_zn(self.cpu.a);
    }

    fn op_rla(&mut self, addr: u16) {
        let mut v = self.bus_read(addr); let c = self.carry() as u8;
        self.set_carry(v & 0x80 != 0); v = (v << 1) | c;
        self.bus_write(addr, v); self.cpu.a &= v; self.set_zn(self.cpu.a);
    }

    fn op_sre(&mut self, addr: u16) {
        let mut v = self.bus_read(addr); self.set_carry(v & 0x01 != 0);
        v >>= 1; self.bus_write(addr, v);
        self.cpu.a ^= v; self.set_zn(self.cpu.a);
    }

    fn op_rra(&mut self, addr: u16) {
        let mut v = self.bus_read(addr); let c = if self.carry() { 0x80u8 } else { 0 };
        self.set_carry(v & 0x01 != 0); v = (v >> 1) | c;
        self.bus_write(addr, v); self.op_adc(v);
    }

    // ============================================================
    // 公開 API
    // ============================================================

    /// 執行一幀
    pub fn frame(&mut self) {
        self.ppu.frame_complete = false;
        while !self.ppu.frame_complete {
            self.clock();
        }
        self.apu.end_frame();
    }

    /// 取得畫面緩衝區指標
    pub fn get_frame_buffer_ptr(&self) -> *const u8 { self.ppu.frame_buffer.as_ptr() }

    /// 取得畫面緩衝區長度
    pub fn get_frame_buffer_len(&self) -> usize { self.ppu.frame_buffer.len() }

    /// 設定控制器按鈕
    pub fn set_button(&mut self, controller: u8, button: u8, pressed: bool) {
        match controller {
            0 => self.ctrl1.set_button(button, pressed),
            1 => self.ctrl2.set_button(button, pressed),
            _ => {}
        }
    }

    /// 設定音頻取樣率
    pub fn set_audio_sample_rate(&mut self, rate: f64) { self.apu.set_sample_rate(rate); }

    /// 取得音頻緩衝區指標
    pub fn get_audio_buffer_ptr(&self) -> *const f32 { self.apu.get_buffer_ptr() }

    /// 取得音頻緩衝區可用取樣數
    pub fn get_audio_buffer_len(&self) -> usize { self.apu.get_available_samples() }

    /// 消耗音頻取樣
    pub fn consume_audio_samples(&mut self) -> usize { self.apu.consume_samples() }

    pub fn debug_state(&self) -> String {
        format!(
            "NES PC={:04X} SP={:02X} P={:02X} PPU=({}, {}) CTRL={:02X} MASK={:02X} STATUS={:02X} DMA={} page={:02X} addr={:02X} dummy={}",
            self.cpu.pc, self.cpu.sp, self.cpu.status,
            self.ppu.scanline, self.ppu.cycle, self.ppu.ctrl, self.ppu.mask, self.ppu.status,
            self.bus.dma_transfer, self.bus.dma_page, self.bus.dma_address, self.bus.dma_dummy,
        )
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

    fn hex_char(c: u8) -> u8 {
        match c {
            b'0'..=b'9' => c - b'0',
            b'a'..=b'f' => c - b'a' + 10,
            b'A'..=b'F' => c - b'A' + 10,
            _ => 0xFF,
        }
    }

    fn export_state_binary(&self) -> Vec<u8> {
        let mut d = Vec::new();
        d.extend_from_slice(b"NESW");
        d.push(1);
        d.push(self.cpu.a); d.push(self.cpu.x); d.push(self.cpu.y);
        d.push(self.cpu.sp); d.push(self.cpu.status);
        d.extend_from_slice(&self.cpu.pc.to_le_bytes());
        d.extend_from_slice(&self.bus.ram);
        d.push(self.ppu.ctrl); d.push(self.ppu.mask); d.push(self.ppu.status);
        d.push(self.ppu.oam_addr);
        d.extend_from_slice(&self.ppu.v.to_le_bytes());
        d.extend_from_slice(&self.ppu.t.to_le_bytes());
        d.push(self.ppu.fine_x); d.push(self.ppu.write_latch as u8);
        d.push(self.ppu.data_buffer);
        d.extend_from_slice(&self.ppu.nametable);
        d.extend_from_slice(&self.ppu.palette);
        d.extend_from_slice(&self.ppu.oam);
        d.extend_from_slice(&self.cartridge.prg_ram);
        d
    }

    fn import_state_binary(&mut self, data: &[u8]) -> bool {
        if data.len() < 9 || &data[0..4] != b"NESW" || data[4] != 1 { return false; }
        let mut p = 5;
        if p + 7 > data.len() { return false; }
        self.cpu.a = data[p]; p += 1;
        self.cpu.x = data[p]; p += 1;
        self.cpu.y = data[p]; p += 1;
        self.cpu.sp = data[p]; p += 1;
        self.cpu.status = data[p]; p += 1;
        self.cpu.pc = u16::from_le_bytes([data[p], data[p+1]]); p += 2;
        if p + 2048 > data.len() { return false; }
        self.bus.ram.copy_from_slice(&data[p..p+2048]); p += 2048;
        if p + 9 > data.len() { return false; }
        self.ppu.ctrl = data[p]; p += 1;
        self.ppu.mask = data[p]; p += 1;
        self.ppu.status = data[p]; p += 1;
        self.ppu.oam_addr = data[p]; p += 1;
        self.ppu.v = u16::from_le_bytes([data[p], data[p+1]]); p += 2;
        self.ppu.t = u16::from_le_bytes([data[p], data[p+1]]); p += 2;
        self.ppu.fine_x = data[p]; p += 1;
        self.ppu.write_latch = data[p] != 0; p += 1;
        self.ppu.data_buffer = data[p]; p += 1;
        if p + 2048 + 32 + 256 > data.len() { return false; }
        self.ppu.nametable.copy_from_slice(&data[p..p+2048]); p += 2048;
        self.ppu.palette.copy_from_slice(&data[p..p+32]); p += 32;
        self.ppu.oam.copy_from_slice(&data[p..p+256]); p += 256;
        if p + 8192 > data.len() { return false; }
        self.cartridge.prg_ram.copy_from_slice(&data[p..p+8192]);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nrom_with_program(program: &[u8]) -> Vec<u8> {
        let mut rom = vec![0; 16 + 16 * 1024 + 8 * 1024];
        rom[0..4].copy_from_slice(b"NES\x1A");
        rom[4] = 1;
        rom[5] = 1;
        rom[16..16 + program.len()].copy_from_slice(program);
        rom[16 + 0x3FFC] = 0x00;
        rom[16 + 0x3FFD] = 0x80;
        rom
    }

    fn framebuffer_summary(frame_buffer: &[u8], previous_frame: Option<&[u8]>) -> (u64, usize, usize) {
        let mut hash = 0xcbf29ce484222325u64;
        for &byte in frame_buffer {
            hash ^= u64::from(byte);
            hash = hash.wrapping_mul(0x100000001b3u64);
        }

        let non_black_pixels = frame_buffer
            .chunks_exact(4)
            .filter(|pixel| pixel[..3].iter().any(|&channel| channel != 0))
            .count();
        let changed_pixels = previous_frame
            .filter(|previous| previous.len() == frame_buffer.len())
            .map(|previous| {
                frame_buffer
                    .chunks_exact(4)
                    .zip(previous.chunks_exact(4))
                    .filter(|(current_pixel, previous_pixel)| current_pixel != previous_pixel)
                    .count()
            })
            .unwrap_or(0);

        (hash, non_black_pixels, changed_pixels)
    }

    fn audio_summary(samples: &[f32]) -> (f32, f32, f32, usize) {
        if samples.is_empty() {
            return (0.0, 0.0, 0.0, 0);
        }

        let mut sum = 0.0f64;
        let mut sum_squared = 0.0f64;
        let mut peak = 0.0f32;
        let mut zero_crossings = 0;
        let mut previous = samples[0];

        for &sample in samples {
            sum += f64::from(sample);
            sum_squared += f64::from(sample) * f64::from(sample);
            peak = peak.max(sample.abs());
            if (sample < 0.0) != (previous < 0.0) {
                zero_crossings += 1;
            }
            previous = sample;
        }

        let count = samples.len() as f64;
        (
            (sum / count) as f32,
            (sum_squared / count).sqrt() as f32,
            peak,
            zero_crossings,
        )
    }

    #[test]
    #[ignore]
    fn trace_priority_rom_audio() {
        let output_dir = std::path::Path::new("target/nes-audio-trace");
        std::fs::create_dir_all(output_dir).expect("audio trace directory must be writable");
        let frame_count = std::env::var("NES_AUDIO_TRACE_FRAMES")
            .ok()
            .and_then(|value| value.parse::<usize>().ok())
            .filter(|&value| value > 0)
            .unwrap_or(180);
        let filter_mode = std::env::var("NES_AUDIO_TRACE_FILTER")
            .unwrap_or_else(|_| "stock".to_string());

        for (path, name) in [
            (
                "../roms/Captain Tsubasa II - Super Striker (Japan).nes",
                "captain-tsubasa-ii",
            ),
            (
                "../roms/Rockman 6 - Shijou Saidai no Tatakai (Rockman 6 Hack).nes",
                "rockman-6",
            ),
        ] {
            let rom = std::fs::read(path).expect("priority ROM must be present");
            for (sample_rate, rate_name) in [(44_100.0, "44100"), (48_000.0, "48000")] {
                let mut emulator = Emulator::new();
                assert!(emulator.load_rom(&rom), "failed to load {path}");
                emulator.set_audio_sample_rate(sample_rate);
                emulator.apu.set_test_filter_mode(&filter_mode);

                let mut raw_output = Vec::new();
                let mut csv = String::from("frame,samples,dc,rms,peak,zero_crossings\n");
                for frame_index in 0..frame_count {
                    emulator.frame();
                    let sample_count = emulator.get_audio_buffer_len();
                    let samples = &emulator.apu.audio_buffer[..sample_count];
                    let (dc, rms, peak, zero_crossings) = audio_summary(samples);
                    csv.push_str(&format!(
                        "{frame_index},{sample_count},{dc:.9},{rms:.9},{peak:.9},{zero_crossings}\n"
                    ));
                    raw_output.extend(samples.iter().flat_map(|sample| sample.to_le_bytes()));
                    emulator.consume_audio_samples();
                }

                let trace_stem = if filter_mode == "stock" {
                    format!("{name}-{rate_name}")
                } else {
                    format!("{name}-{rate_name}-{filter_mode}")
                };
                std::fs::write(output_dir.join(format!("{trace_stem}.f32")), raw_output)
                    .expect("audio trace samples must be writable");
                if filter_mode == "stock" && rate_name == "44100" {
                    let mut register_csv = String::from("apu_cycle,address,data\n");
                    for &(apu_cycle, address, data) in &emulator.apu.test_register_writes {
                        register_csv.push_str(&format!("{apu_cycle},${address:04X},${data:02X}\n"));
                    }
                    std::fs::write(output_dir.join(format!("{name}-apu-writes.csv")), register_csv)
                        .expect("APU register trace must be writable");
                }
                std::fs::write(output_dir.join(format!("{trace_stem}.csv")), csv)
                    .expect("audio trace metrics must be writable");
                println!(
                    "{path}: wrote {} samples at {sample_rate} Hz",
                    std::fs::metadata(output_dir.join(format!("{trace_stem}.f32")))
                        .expect("audio trace must exist")
                        .len()
                        / 4
                );
            }
        }
    }

    #[test]
    #[ignore]
    fn trace_priority_mmc3_roms() {
        for path in [
            "../roms/Captain Tsubasa II - Super Striker (Japan).nes",
            "../roms/Rockman 6 - Shijou Saidai no Tatakai (Rockman 6 Hack).nes",
        ] {
            let rom = std::fs::read(path).expect("priority ROM must be present");
            let mut emulator = Emulator::new();
            assert!(emulator.load_rom(&rom), "failed to load {path}");
            let mut previous_frame = None;
            let mut previous_offsets = None;
            let mut previous_mapper_state = None;
            let mut first_output_change_frame = None;
            let mut first_non_black_frame = None;
            let mut first_all_black_frame = None;

            for frame_index in 0..180 {
                let event_start = emulator.mapper_scanline_events.len();
                let write_start = emulator.mapper_cpu_writes.len();
                emulator.frame();

                let (frame_hash, non_black_pixels, changed_pixels) = framebuffer_summary(
                    &emulator.ppu.frame_buffer,
                    previous_frame.as_deref(),
                );
                let offsets = emulator.ppu.chr_bank_offsets_for_test();
                let chr_changed = previous_offsets.map_or(true, |previous| previous != offsets);
                let events = &emulator.mapper_scanline_events[event_start..];
                let writes = &emulator.mapper_cpu_writes[write_start..];
                let mapper_state = emulator.cartridge.mapper.trace_state();
                let mapper_changed = previous_mapper_state != mapper_state;

                if changed_pixels > 0 && first_output_change_frame.is_none() {
                    first_output_change_frame = Some(frame_index);
                }
                if non_black_pixels > 0 && first_non_black_frame.is_none() {
                    first_non_black_frame = Some(frame_index);
                }
                if non_black_pixels == 0 && first_all_black_frame.is_none() {
                    first_all_black_frame = Some(frame_index);
                }

                println!(
                    "{path}: frame={frame_index:03} pc={:04X} ppu=({}, {}) fb={frame_hash:016X} non_black={non_black_pixels} changed={changed_pixels} chr_changed={chr_changed} chr={offsets:?} mapper_events={} writes={} write_span={:?}->{:?}",
                    emulator.cpu.pc,
                    emulator.ppu.scanline,
                    emulator.ppu.cycle,
                    events.len(),
                    writes.len(),
                    writes.first(),
                    writes.last(),
                );
                if mapper_changed {
                    println!("{path}: frame={frame_index:03} mapper={mapper_state:?}");
                }

                previous_frame = Some(emulator.ppu.frame_buffer.clone());
                previous_offsets = Some(offsets);
                previous_mapper_state = mapper_state;
            }

            let qualified: Vec<_> = emulator
                .ppu
                .a12_trace
                .iter()
                .filter(|event| event.qualified)
                .take(12)
                .collect();
            println!(
                "{path}: ctrl={:02X} mask={:02X} a12_rises={} qualified={} coarse_events={} writes={} first_qualified={qualified:?}",
                emulator.ppu.ctrl,
                emulator.ppu.mask,
                emulator.ppu.a12_rising_edges,
                emulator.ppu.a12_qualified_edges,
                emulator.mapper_scanline_events.len(),
                emulator.mapper_cpu_writes.len(),
            );
            println!(
                "{path}: first_mapper_events={:?} first_mapper_writes={:?}",
                &emulator.mapper_scanline_events[..emulator.mapper_scanline_events.len().min(8)],
                &emulator.mapper_cpu_writes[..emulator.mapper_cpu_writes.len().min(16)],
            );
            println!(
                "{path}: first_output_change={first_output_change_frame:?} first_non_black={first_non_black_frame:?} first_all_black={first_all_black_frame:?} final_mapper={:?}",
                emulator.cartridge.mapper.trace_state(),
            );
        }
    }

    #[test]
    #[ignore]
    fn compare_mmc3_scanline_notifications() {
        for path in [
            "../roms/Captain Tsubasa II - Super Striker (Japan).nes",
            "../roms/Rockman 6 - Shijou Saidai no Tatakai (Rockman 6 Hack).nes",
        ] {
            let rom = std::fs::read(path).expect("priority ROM must be present");
            let mut enabled = Emulator::new();
            let mut disabled = Emulator::new();
            assert!(enabled.load_rom(&rom), "failed to load {path}");
            assert!(disabled.load_rom(&rom), "failed to load {path}");
            disabled.mapper_scanline_enabled = false;

            let mut first_difference = None;
            for frame_index in 0..180 {
                enabled.frame();
                disabled.frame();

                let enabled_hash = framebuffer_summary(&enabled.ppu.frame_buffer, None).0;
                let disabled_hash = framebuffer_summary(&disabled.ppu.frame_buffer, None).0;
                if enabled_hash != disabled_hash || enabled.cpu.pc != disabled.cpu.pc {
                    first_difference = Some((
                        frame_index,
                        enabled_hash,
                        disabled_hash,
                        enabled.cpu.pc,
                        disabled.cpu.pc,
                    ));
                    break;
                }
            }

            println!(
                "{path}: coarse_scanline_difference={first_difference:?} enabled_mapper={:?} disabled_mapper={:?}",
                enabled.cartridge.mapper.trace_state(),
                disabled.cartridge.mapper.trace_state(),
            );
        }
    }

    #[test]
    fn frame_runs_exact_ntsc_ppu_clock_count_when_rendering_is_disabled() {
        let mut emulator = Emulator::new();
        emulator.reset();
        let start_clock = emulator.system_clock;

        emulator.frame();

        assert_eq!(emulator.system_clock - start_clock, 262 * 341);
    }

    #[test]
    fn dmc_sample_dma_stalls_cpu_for_four_cycles() {
        let mut emulator = Emulator::new();
        assert!(emulator.load_rom(&nrom_with_program(&[0xEA, 0xEA, 0xEA])));
        emulator.apu.dmc_read_request = Some(0x8000);

        emulator.clock();
        let cpu_cycles = emulator.cpu.cycles;
        assert_eq!(emulator.dmc_dma_phase, DmcDmaPhase::Halt);
        assert_eq!(emulator.dmc_dma_address, Some(0x8000));

        for _ in 0..12 {
            emulator.clock();
        }

        assert_eq!(emulator.dmc_dma_phase, DmcDmaPhase::Idle);
        assert_eq!(emulator.cpu.cycles, cpu_cycles);
        assert!(emulator.dmc_dma_address.is_none());
        assert!(emulator.apu.dmc_read_request.is_none());

        for _ in 0..3 {
            emulator.clock();
        }
        assert!(emulator.cpu.cycles < cpu_cycles);
    }

    #[test]
    fn dmc_dma_uses_three_slots_when_next_cpu_slot_is_even() {
        let mut emulator = Emulator::new();
        assert!(emulator.load_rom(&nrom_with_program(&[0xEA, 0xEA, 0xEA])));
        emulator.system_clock = 3;
        emulator.apu.dmc_read_request = Some(0x8000);

        emulator.clock();
        assert_eq!(emulator.dmc_dma_phase, DmcDmaPhase::Halt);

        for _ in 0..9 {
            emulator.clock();
        }

        assert_eq!(emulator.dmc_dma_phase, DmcDmaPhase::Idle);
        assert!(emulator.apu.dmc_read_request.is_none());
    }

    #[test]
    fn dmc_dma_is_cancelled_before_halt_when_request_is_cleared() {
        let mut emulator = Emulator::new();
        assert!(emulator.load_rom(&nrom_with_program(&[0xEA, 0xEA, 0xEA])));
        emulator.apu.dmc_read_request = Some(0x8000);

        emulator.clock();
        assert_eq!(emulator.dmc_dma_phase, DmcDmaPhase::Halt);

        emulator.apu.dmc_read_request = None;
        for _ in 0..3 {
            emulator.clock();
        }

        assert_eq!(emulator.dmc_dma_phase, DmcDmaPhase::Idle);
        assert!(emulator.dmc_dma_address.is_none());
    }

    #[test]
    fn dmc_dma_is_cancelled_during_dummy_when_request_is_cleared() {
        let mut emulator = Emulator::new();
        assert!(emulator.load_rom(&nrom_with_program(&[0xEA, 0xEA, 0xEA])));
        emulator.system_clock = 3;
        emulator.apu.dmc_read_request = Some(0x8000);

        emulator.clock();
        for _ in 0..3 {
            emulator.clock();
        }
        assert_eq!(emulator.dmc_dma_phase, DmcDmaPhase::Dummy);

        emulator.apu.dmc_read_request = None;
        for _ in 0..3 {
            emulator.clock();
        }

        assert_eq!(emulator.dmc_dma_phase, DmcDmaPhase::Idle);
        assert!(emulator.dmc_dma_address.is_none());
    }

    #[test]
    fn dmc_dma_disable_cancels_pending_request_after_control_delay() {
        let mut emulator = Emulator::new();
        assert!(emulator.load_rom(&nrom_with_program(&[0xEA, 0xEA, 0xEA])));
        emulator.apu.dmc_read_request = Some(0x8000);

        emulator.clock();
        emulator.bus_write(0x4015, 0x00);

        for _ in 0..12 {
            emulator.clock();
        }

        assert_eq!(emulator.dmc_dma_phase, DmcDmaPhase::Idle);
        assert!(emulator.dmc_dma_address.is_none());
        assert!(emulator.apu.dmc_read_request.is_none());
    }

    #[test]
    fn dmc_dma_steals_a_ready_oam_read_slot() {
        let mut emulator = Emulator::new();
        assert!(emulator.load_rom(&nrom_with_program(&[0xEA, 0xEA, 0xEA])));
        emulator.apu.dmc_read_request = Some(0x8000);
        emulator.bus.dma_page = 0x80;
        emulator.bus.dma_address = 0;
        emulator.bus.dma_dummy = false;
        emulator.bus.dma_transfer = true;
        emulator.bus.dma_data = 0xA5;
        emulator.ppu.oam[0] = 0x5A;
        emulator.dmc_dma_address = Some(0x8000);
        emulator.dmc_dma_phase = DmcDmaPhase::Read;

        emulator.clock();

        assert_eq!(emulator.dmc_dma_phase, DmcDmaPhase::Idle);
        assert_eq!(emulator.bus.dma_address, 0);
        assert!(emulator.bus.dma_transfer);
        assert_eq!(emulator.dmc_dma_phase, DmcDmaPhase::Idle);
        assert!(emulator.apu.dmc_read_request.is_none());

        for _ in 0..3 {
            emulator.clock();
        }

        assert_eq!(emulator.ppu.oam[0], 0x5A);
        assert_eq!(emulator.bus.dma_address, 0);
    }

    #[test]
    fn cpu_can_poll_two_consecutive_vblanks() {
        let program = [
            0x78,                         // SEI
            0xA9, 0x00,                   // LDA #$00
            0x8D, 0x00, 0x20,             // STA $2000
            0xAD, 0x02, 0x20,             // first: LDA $2002
            0x10, 0xFB,                   // BPL first
            0xAD, 0x02, 0x20,             // second: LDA $2002
            0x10, 0xFB,                   // BPL second
            0xA9, 0x01,                   // LDA #$01
            0x85, 0x00,                   // STA $00
            0x4C, 0x14, 0x80,             // JMP $8014
        ];
        let mut emulator = Emulator::new();
        assert!(emulator.load_rom(&nrom_with_program(&program)));

        for _ in 0..3 {
            emulator.frame();
        }

        assert_eq!(emulator.bus.ram[0], 1);
    }

}
