// ============================================================
// SNES 模擬器主體 - 整合所有硬體元件
// ============================================================
// 整合 65816 CPU、PPU、APU (SPC700+DSP)、DMA/HDMA、卡帶
// Master Clock: 21.477272 MHz (NTSC)
// CPU: 3.58 MHz (Fast) / 2.68 MHz (Slow)
// PPU: 5.37 MHz (hclock) / 掃描線驅動
// APU: 1.024 MHz (獨立時鐘)
// ============================================================

use super::cpu::{Cpu65816, flags};
use super::ppu::Ppu;
use super::apu::Apu;
use super::cartridge::Cartridge;
use super::controller::Controller;
use super::dma::{DmaController, DmaDirection};
use super::dsp1::Dsp1;
use super::cx4::Cx4;

/// Master Clock 頻率 (NTSC)
const MASTER_CLOCK: f64 = 21_477_272.0;
/// 每條掃描線的 Master Clock 數 (340 dots * 4 clocks)
const CLOCKS_PER_SCANLINE: u32 = 1364;
/// 每幀掃描線數
const SCANLINES: u32 = 262;
/// 每幀的 Master Clock 數
const CLOCKS_PER_FRAME: u32 = CLOCKS_PER_SCANLINE * SCANLINES;
/// CPU 慢速除數 (8 master clocks)
const CPU_SLOW_DIV: u32 = 8;
/// CPU 快速除數 (6 master clocks)
const CPU_FAST_DIV: u32 = 6;
/// SPC700 除數 (21 master clocks ≈ 1.024 MHz)
const APU_DIV: u32 = 21;
/// DRAM 刷新消耗 (每掃描線 40 master clocks)
const DRAM_REFRESH_CYCLES: u32 = 40;

pub struct SnesEmulator {
    pub cpu: Cpu65816,
    pub ppu: Ppu,
    pub apu: Apu,
    pub cart: Cartridge,
    pub ctrl1: Controller,
    pub ctrl2: Controller,
    pub dma: DmaController,
    pub dsp1: Dsp1,
    pub cx4: Cx4,

    /// 128KB Work RAM
    pub wram: Vec<u8>,
    /// WRAM 位址指標 ($2181-$2183)
    wram_addr: u32,

    /// CPU 暫存器 ($4200-$42FF)
    /// $4200 - NMITIMEN
    nmitimen: u8,
    /// $4201 - WRIO
    wrio: u8,
    /// $4202-$4206 - 乘除法暫存器
    wrmpya: u8,
    wrmpyb: u8,
    wrdivl: u16,
    wrdivb: u8,
    /// $4207-$420A - H/V Timer
    htime: u16,
    vtime: u16,
    /// $4210 - RDNMI
    rdnmi: u8,
    /// $4211 - TIMEUP
    timeup: u8,
    /// $4212 - HVBJOY
    hvbjoy: u8,
    /// $4214-$4217 - 乘除法結果
    rddiv: u16,
    rdmpy: u16,

    /// 自動 Joypad 讀取旗標
    auto_joypad_read: bool,

    /// 主時鐘計數器
    master_clock: u64,
    /// 當前掃描線的 CPU 週期消耗
    cpu_cycles_this_line: u32,
    /// 當前掃描線已執行的 APU 週期
    apu_cycles_this_scanline: u32,
    /// APU master clock 餘數累加器 (每掃描線 1364 % 21 = 20 的殘餘)
    apu_master_remainder: u32,
    /// 開放匯流排
    open_bus: u8,

    /// H/V IRQ
    irq_pending: bool,

    /// NMI 已在本次 VBlank 觸發過 (防止 NMITIMEN toggle 重複觸發)
    nmi_fired_this_vblank: bool,

    // Debug: BRK crash origin
    brk_origin: Option<(u8, u16)>,  // (PB, PC) where BRK was executed
    /// Frame counter for diagnostics
    frame_count: u32,
    /// Debug: one-shot trap for first invalid WRAM execution
    debug_trap_fired: bool,
    debug_trap_log: String,
    debug_prev_pb_pc: (u8, u16),
}

impl SnesEmulator {
    pub fn new() -> Self {
        SnesEmulator {
            cpu: Cpu65816::new(),
            ppu: Ppu::new(),
            apu: Apu::new(),
            cart: Cartridge::new(),
            ctrl1: Controller::new(),
            ctrl2: Controller::new(),
            dma: DmaController::new(),
            dsp1: Dsp1::new(),
            cx4: Cx4::new(),

            wram: vec![0; 0x20000], // 128KB
            wram_addr: 0,

            nmitimen: 0,
            wrio: 0xFF,
            wrmpya: 0xFF,
            wrmpyb: 0,
            wrdivl: 0xFFFF,
            wrdivb: 0,
            htime: 0x1FF,
            vtime: 0x1FF,
            rdnmi: 0,
            timeup: 0,
            hvbjoy: 0,
            rddiv: 0,
            rdmpy: 0,

            auto_joypad_read: false,

            master_clock: 0,
            cpu_cycles_this_line: 0,
            apu_cycles_this_scanline: 0,
            apu_master_remainder: 0,
            open_bus: 0,

            irq_pending: false,
            nmi_fired_this_vblank: false,
            brk_origin: None,
            frame_count: 0,
            debug_trap_fired: false,
            debug_trap_log: String::new(),
            debug_prev_pb_pc: (0, 0),
        }
    }

    pub fn load_rom(&mut self, data: &[u8]) -> bool {
        if self.cart.load(data) {
            self.dsp1.present = self.cart.has_dsp1;
            self.cx4.present = self.cart.has_cx4;
            self.reset();
            true
        } else {
            false
        }
    }

    pub fn reset(&mut self) {
        self.cart.reset();
        self.ppu.reset();
        self.apu.reset();
        self.dma.reset();
        self.dsp1.reset();
        self.cx4.reset();
        self.wram = vec![0; 0x20000];
        self.wram_addr = 0;
        self.master_clock = 0;
        self.cpu_cycles_this_line = 0;
        self.apu_cycles_this_scanline = 0;
        self.apu_master_remainder = 0;
        self.nmitimen = 0;
        self.hvbjoy = 0;
        self.rdnmi = 0;
        self.timeup = 0;
        self.irq_pending = false;
        self.nmi_fired_this_vblank = false;
        self.brk_origin = None;
        self.frame_count = 0;
        self.debug_trap_fired = false;
        self.debug_trap_log = String::new();
        self.debug_prev_pb_pc = (0, 0);

        // CPU 重置
        self.cpu = Cpu65816::new();
        // 從 Reset 向量讀取 PC
        let (lo, hi) = match self.cart.map_mode {
            super::cartridge::MapMode::HiROM => {
                (self.read(0x00FFFC), self.read(0x00FFFD))
            }
            super::cartridge::MapMode::LoROM => {
                (self.read(0x00FFFC), self.read(0x00FFFD))
            }
        };
        self.cpu.pc = (lo as u16) | ((hi as u16) << 8);
        self.cpu.pb = 0;
        self.cpu.db = 0;
        self.cpu.sp = 0x01FF;
        self.cpu.dp = 0;
        self.cpu.emulation = true;
        self.cpu.p = flags::MEM8 | flags::INDEX8 | flags::IRQ_DIS;
    }

    // ================================================================
    // 幀執行
    // ================================================================

    pub fn frame(&mut self) {
        self.ppu.frame_complete = false;
        self.frame_count += 1;

        // 執行一幀 (262 掃描線)
        for scanline in 0..SCANLINES {
            self.run_scanline(scanline);
        }
    }

    fn run_scanline(&mut self, scanline: u32) {
        self.cpu_cycles_this_line = 0;
        self.apu_cycles_this_scanline = 0;
        self.irq_pending = false; // Reset per-scanline so H-IRQ can fire each line

        // Set PPU scanline early so HDMA/IRQ/render all see the correct value
        self.ppu.scanline = scanline as u16;

        // DRAM 刷新（每掃描線消耗 40 master clocks = ~5 CPU cycles）
        self.cpu_cycles_this_line += DRAM_REFRESH_CYCLES;

        // HDMA 初始化（VBlank → Active 轉換時）+ 第一次傳輸
        if scanline == 0 {
            // VBlank 結束：先清除旗標，再讓 CPU 執行
            self.ppu.vblank_flag = false;
            self.hvbjoy &= !0x80;
            self.rdnmi &= !0x80;
            self.nmi_fired_this_vblank = false;
            self.ppu.frame_complete = true;
            self.ppu.debug_2130_frame = self.ppu.debug_2130_frame.wrapping_add(1);

            // 允許 CPU 完成 NMI handler （DSP1 讀取、WRAM 寫入）再啟動 HDMA
            let pre_hdma = 1364u32.saturating_sub(self.cpu_cycles_this_line);
            if pre_hdma > 0 {
                self.run_cpu_for(pre_hdma);
            }
            // Debug: log ch0 state at hdma_init when HDMA=$FF
            if self.dma.hdma_enable == 0xFF {
                let ch0 = &self.dma.channels[0];
                self.debug_trap_log.push_str(&format!(
                    "INIT @sl=0 ch0(ctrl={:02X} b={:02X} a={:02X}:{:04X} hdma_addr={:04X})\n",
                    ch0.control, ch0.b_addr, ch0.a_bank, ch0.a_addr, ch0.hdma_addr,
                ));
            }
            self.dma.hdma_init();
            self.hdma_init_read(); // Read first table entries for each channel
        }
        // HDMA 傳輸（掃描線 1-224 的 H-Blank）
        if scanline >= 1 && scanline <= 224 {
            self.run_hdma();
            // Debug: detect CGWSEL=0x02 and log cpu state
            if self.ppu.cgwsel == 0x02 && scanline == 1 && self.ppu.debug_2130_frame > 10 {
                // Only log once (check if last trace entry is already 0x02)
                let last_idx = if self.ppu.debug_2130_idx > 0 { (self.ppu.debug_2130_idx - 1) % 32 } else { 0 };
                let (last_val, _, _, _) = self.ppu.debug_2130_log[last_idx];
                if last_val != 0x02 || self.ppu.debug_2130_idx == 0 {
                    // Force-log this detection
                    let idx = self.ppu.debug_2130_idx % 256;
                    let pc = ((self.cpu.pb as u32) << 16) | self.cpu.pc as u32;
                    self.ppu.debug_2130_log[idx] = (0x02, 0xF000 | scanline as u16, self.ppu.debug_2130_frame, pc);
                    self.ppu.debug_2130_idx += 1;
                }
            }
        }

        // VBlank 開始
        if scanline == 225 {
            self.ppu.vblank_flag = true;
            self.hvbjoy |= 0x80; // VBlank flag
            self.nmi_fired_this_vblank = false; // 新一輪 VBlank，重設 NMI 鎖

            // RDNMI bit 7 is ALWAYS set at VBlank start, regardless of NMITIMEN
            self.rdnmi |= 0x80;

            // NMI interrupt fires only when enabled in NMITIMEN
            if self.nmitimen & 0x80 != 0 {
                self.cpu.nmi_pending = true;
                self.nmi_fired_this_vblank = true;
            }

            // OAM 地址重載
            self.ppu.oam_addr = self.ppu.oam_addr_reload;

            // 自動 Joypad 讀取
            if self.nmitimen & 0x01 != 0 {
                self.ctrl1.auto_read();
                self.ctrl2.auto_read();
                self.hvbjoy |= 0x01; // Auto-read busy
                self.auto_joypad_read = true;
            }
        }

        // (VBlank 結束已移至 scanline==0 最前面處理)

        // H/V Timer IRQ 檢查 (在渲染之前，讓 Mode 切換等操作在渲染前生效)
        self.check_hv_irq(scanline);

        // 預渲染 CPU 執行窗口：讓 IRQ handler 有機會修改 PPU 狀態
        // (例如 SMK 的 Mode 1→7 切換在 H+V IRQ 中完成)
        if scanline >= 1 && scanline <= 224 {
            let pre_render = 88u32.saturating_sub(self.cpu_cycles_this_line);
            if pre_render > 0 {
                self.run_cpu_for(pre_render);
            }
        }

        if scanline >= 1 && scanline <= 224 {
            self.ppu.render_visible_scanline(scanline as u16);
        }

        // 執行 CPU 直到掃描線結束
        let available_cycles = CLOCKS_PER_SCANLINE.saturating_sub(self.cpu_cycles_this_line);
        self.run_cpu_for(available_cycles);

        // 執行 APU（掃描線結尾追趕剩餘週期，含餘數累加）
        let total_master = CLOCKS_PER_SCANLINE + self.apu_master_remainder;
        let total_apu_cycles = total_master / APU_DIV;
        self.apu_master_remainder = total_master % APU_DIV;
        if total_apu_cycles > self.apu_cycles_this_scanline {
            self.apu.run_cycles(total_apu_cycles - self.apu_cycles_this_scanline);
        }
        self.apu_cycles_this_scanline = 0;

        // 清除自動讀取忙碌旗標
        if self.auto_joypad_read && scanline >= 228 {
            self.hvbjoy &= !0x01;
            self.auto_joypad_read = false;
        }
    }

    fn check_hv_irq(&mut self, scanline: u32) {
        let mode = (self.nmitimen >> 4) & 0x03;
        let fire = match mode {
            0 => false,
            1 => {
                // H-IRQ: fire when dot >= htime (checked per-instruction in run_cpu_for)
                let dot = (self.cpu_cycles_this_line / 4) as u16;
                dot >= self.htime
            }
            2 => scanline as u16 == self.vtime, // V-IRQ at start of scanline
            3 => {
                // H+V-IRQ: V must match and dot must have reached htime
                let dot = (self.cpu_cycles_this_line / 4) as u16;
                scanline as u16 == self.vtime && dot >= self.htime
            }
            _ => false,
        };
        if fire && !self.irq_pending {
            self.irq_pending = true;
            self.timeup |= 0x80;
            self.cpu.irq_pending = true;
            // Debug: log V-IRQ firing with $008C
            if mode == 2 || mode == 3 {
                let val_008c = self.read(0x7E008C);
                self.debug_trap_log.push_str(&format!(
                    "VIRQ @sl={} ch0(b={:02X} ctrl={:02X}) $8C={:02X}\n",
                    scanline, self.dma.channels[0].b_addr, self.dma.channels[0].control, val_008c,
                ));
            }
        }
    }

    /// 執行 CPU 指定的 master clock 數
    fn run_cpu_for(&mut self, master_clocks: u32) {
        let mut remaining = master_clocks;
        let irq_mode = (self.nmitimen >> 4) & 0x03;
        let check_hirq = irq_mode == 1 || irq_mode == 3;

        while remaining > 0 {
            if self.cpu.stopped || self.cpu.waiting {
                if self.cpu.waiting && (self.cpu.nmi_pending || self.cpu.irq_pending) {
                    self.cpu.waiting = false;
                } else if self.cpu.waiting && check_hirq && !self.irq_pending {
                    // CPU is in WAI and H-IRQ might fire - advance time and check
                    self.cpu_cycles_this_line += remaining;
                    remaining = 0;
                    let dot = (self.cpu_cycles_this_line / 4) as u16;
                    if dot >= self.htime {
                        let scanline = self.ppu.scanline as u16;
                        if irq_mode == 1 || (irq_mode == 3 && scanline == self.vtime) {
                            self.irq_pending = true;
                            self.timeup |= 0x80;
                            self.cpu.irq_pending = true;
                            self.cpu.waiting = false;
                        }
                    }
                    break;
                } else {
                    break;
                }
            }

            if self.cpu.cycles > 0 {
                let consume = self.cpu.cycles.min(remaining);
                self.cpu.cycles -= consume;
                remaining -= consume;
                self.cpu_cycles_this_line += consume;
                // Check H-IRQ after consuming cycles (dot may have advanced)
                if check_hirq && !self.irq_pending {
                    let dot = (self.cpu_cycles_this_line / 4) as u16;
                    if dot >= self.htime {
                        let scanline = self.ppu.scanline as u32;
                        if irq_mode == 1 || (irq_mode == 3 && scanline as u16 == self.vtime) {
                            self.irq_pending = true;
                            self.timeup |= 0x80;
                            self.cpu.irq_pending = true;
                        }
                    }
                }
                continue;
            }

            // 處理 NMI
            if self.cpu.nmi_pending {
                self.cpu.nmi_pending = false;
                self.do_nmi();
                continue;
            }

            // 處理 IRQ
            if self.cpu.irq_pending && !self.cpu.flag_i() {
                self.cpu.irq_pending = false;
                self.do_irq();
                continue;
            }

            // 執行一條指令
            let prev_pb = self.cpu.pb;
            let prev_pc = self.cpu.pc;
            let opcode = self.fetch_pc();

            // Debug trap: catch first BRK execution anywhere
            if !self.debug_trap_fired && opcode == 0x00 {
                self.debug_trap_fired = true;
                let sp = self.cpu.sp;
                let mut stack_bytes = String::new();
                for i in 0..=20u16 {
                    let addr = sp.wrapping_add(i);
                    // Read via bus to handle any bank
                    stack_bytes.push_str(&format!("{:02X} ", self.bus_read(0, addr)));
                }
                self.debug_trap_log = format!(
                    "FIRST_BRK at {:02X}:{:04X}\n\
                     SP={:04X} A={:04X} X={:04X} Y={:04X} P={:02X} DB={:02X} DP={:04X}\n\
                     Frame={} Scanline={} NMITIMEN={:02X} vblank={}",
                    prev_pb, prev_pc,
                    sp, self.cpu.a, self.cpu.x, self.cpu.y, self.cpu.p, self.cpu.db, self.cpu.dp,
                    self.frame_count, self.ppu.scanline, self.nmitimen, self.ppu.vblank_flag
                );
            }

            self.execute_instruction(opcode);
            self.debug_prev_pb_pc = (prev_pb, prev_pc);

            // 指令週期轉換為 master clocks (CPU 約 3.58 MHz = 6 master clocks/cycle)
            self.cpu.cycles *= CPU_FAST_DIV;

            if remaining >= self.cpu.cycles {
                remaining -= self.cpu.cycles;
                self.cpu_cycles_this_line += self.cpu.cycles;
                self.cpu.cycles = 0;
            } else {
                self.cpu_cycles_this_line += remaining;
                self.cpu.cycles -= remaining;
                remaining = 0;
            }

            // Check H-IRQ after each instruction execution
            // Re-read nmitimen to handle cases where NMI handler changes IRQ mode
            let cur_irq_mode = (self.nmitimen >> 4) & 0x03;
            let cur_check_hirq = cur_irq_mode == 1 || cur_irq_mode == 3;
            if cur_check_hirq && !self.irq_pending {
                let dot = (self.cpu_cycles_this_line / 4) as u16;
                if dot >= self.htime {
                    let sl = self.ppu.scanline as u16;
                    if cur_irq_mode == 1 || (cur_irq_mode == 3 && sl == self.vtime) {
                        self.irq_pending = true;
                        self.timeup |= 0x80;
                        self.cpu.irq_pending = true;
                    }
                }
            }
        }
    }

    /// APU 追趕：將 APU 推進到 CPU 目前的時間點
    fn catchup_apu(&mut self) {
        let target_apu_cycles = self.cpu_cycles_this_line / APU_DIV;
        if target_apu_cycles > self.apu_cycles_this_scanline {
            let delta = target_apu_cycles - self.apu_cycles_this_scanline;
            self.apu.run_cycles(delta);
            self.apu_cycles_this_scanline += delta;
        }
    }

    /// 取得記憶體存取速度 (master clocks)
    fn get_memory_speed(&self, bank: u8, addr: u16) -> u32 {
        let masked = bank & 0x7F;
        if masked <= 0x3F {
            match addr {
                0x0000..=0x1FFF => CPU_SLOW_DIV,
                0x2000..=0x3FFF => CPU_FAST_DIV,  // Internal registers
                0x4000..=0x41FF => CPU_SLOW_DIV + 6, // 12 cycles for joypad
                0x4200..=0x5FFF => CPU_FAST_DIV,
                0x6000..=0x7FFF => CPU_SLOW_DIV,
                _ => {
                    if self.cart.fast_rom && bank >= 0x80 { CPU_FAST_DIV } else { CPU_SLOW_DIV }
                }
            }
        } else if masked >= 0x40 && masked <= 0x7D {
            CPU_SLOW_DIV
        } else {
            if self.cart.fast_rom { CPU_FAST_DIV } else { CPU_SLOW_DIV }
        }
    }

    // ================================================================
    // 記憶體匯流排 (24-bit 位址空間)
    // ================================================================

    pub fn read(&mut self, full_addr: u32) -> u8 {
        let bank = ((full_addr >> 16) & 0xFF) as u8;
        let addr = (full_addr & 0xFFFF) as u16;
        self.bus_read(bank, addr)
    }

    pub fn write(&mut self, full_addr: u32, val: u8) {
        let bank = ((full_addr >> 16) & 0xFF) as u8;
        let addr = (full_addr & 0xFFFF) as u16;
        self.bus_write(bank, addr, val);
    }

    fn bus_read(&mut self, bank: u8, addr: u16) -> u8 {
        // WRAM banks $7E/$7F only (NOT $FE/$FF — those are cartridge ROM)
        if bank == 0x7E || bank == 0x7F {
            let offset = ((bank as usize - 0x7E) << 16) | addr as usize;
            let val = if offset < self.wram.len() { self.wram[offset] } else { 0 };
            self.open_bus = val;
            return val;
        }

        let effective = bank & 0x7F; // $80-$FF mirrors $00-$7F

        let val = match effective {
            // === System area: banks $00-$3F ($80-$BF) ===
            0x00..=0x3F => match addr {
                0x0000..=0x1FFF => self.wram[addr as usize],
                0x2100..=0x213F => self.ppu.read_register(addr),
                0x2140..=0x217F => {
                    self.catchup_apu();
                    self.apu.cpu_read_port(((addr - 0x2140) & 3) as u8)
                }
                0x2180 => {
                    let val = self.wram[self.wram_addr as usize & 0x1FFFF];
                    self.wram_addr = (self.wram_addr + 1) & 0x1FFFF;
                    val
                }
                0x4000..=0x40FF => self.read_cpu_register(addr),
                0x4200..=0x42FF => self.read_cpu_register(addr),
                0x4300..=0x43FF => self.dma.read_register(addr - 0x4300),
                0x6000..=0x7FFF => {
                    match self.cart.map_mode {
                        crate::snes::cartridge::MapMode::HiROM => {
                            if self.dsp1.present && effective < 0x20 {
                                // DSP-1: $00-$1F:$6000-$6FFF = DR, $7000-$7FFF = SR
                                if addr < 0x7000 {
                                    self.dsp1.read_dr()
                                } else {
                                    self.dsp1.read_sr()
                                }
                            } else if effective >= 0x20 {
                                let sram_addr = ((effective as usize - 0x20) * 0x2000) + (addr as usize - 0x6000);
                                self.cart.read_sram(sram_addr)
                            } else {
                                self.open_bus
                            }
                        }
                        crate::snes::cartridge::MapMode::LoROM => {
                            // CX4: $00-$3F/$80-$BF:$6000-$7FFF → CX4 RAM/IO
                            if self.cx4.present {
                                self.cx4.read(addr - 0x6000)
                            } else if self.cart.sram_size > 0 {
                                // LoROM: $00-$3F:$6000-$7FFF mirrors SRAM ($70-$7D:$0000-$7FFF)
                                let sram_addr = ((effective as usize & 0x1F) * 0x2000) + (addr as usize - 0x6000);
                                self.cart.read_sram(sram_addr)
                            } else {
                                self.open_bus
                            }
                        }
                    }
                }
                0x8000..=0xFFFF => self.cart.read_rom(bank, addr),
                _ => self.open_bus,
            },

            // === Banks $40-$6F: ROM area (with LoROM lower half = HW mirrors) ===
            0x40..=0x6F => {
                match self.cart.map_mode {
                    crate::snes::cartridge::MapMode::LoROM => {
                        if addr >= 0x8000 {
                            self.cart.read_rom(bank, addr)
                        } else {
                            // LoROM $40-$6F:$0000-$7FFF = mirrors of $00-$3F system area
                            self.bus_read_system_low(effective, addr)
                        }
                    }
                    crate::snes::cartridge::MapMode::HiROM => {
                        // HiROM: full 64KB is ROM
                        self.cart.read_rom(bank, addr)
                    }
                }
            }

            // === Banks $70-$7F: SRAM (LoROM) or ROM (HiROM) ===
            // Note: effective $7E/$7F come from banks $FE/$FF (after & 0x7F)
            // Physical WRAM $7E/$7F is handled above before this match
            0x70..=0x7F => {
                match self.cart.map_mode {
                    crate::snes::cartridge::MapMode::LoROM => {
                        if addr < 0x8000 && effective <= 0x7D {
                            // LoROM SRAM: $70-$7D:$0000-$7FFF
                            let sram_addr = ((effective as usize - 0x70) * 0x8000) + addr as usize;
                            self.cart.read_sram(sram_addr)
                        } else {
                            self.cart.read_rom(bank, addr)
                        }
                    }
                    crate::snes::cartridge::MapMode::HiROM => {
                        self.cart.read_rom(bank, addr)
                    }
                }
            }

            _ => self.open_bus,
        };
        self.open_bus = val;
        val
    }

    /// Helper for LoROM system area reads ($0000-$7FFF in banks $40-$6F)
    fn bus_read_system_low(&mut self, effective: u8, addr: u16) -> u8 {
        match addr {
            0x0000..=0x1FFF => self.wram[addr as usize],
            0x2100..=0x213F => self.ppu.read_register(addr),
            0x2140..=0x217F => {
                self.catchup_apu();
                self.apu.cpu_read_port(((addr - 0x2140) & 3) as u8)
            }
            0x2180 => {
                let val = self.wram[self.wram_addr as usize & 0x1FFFF];
                self.wram_addr = (self.wram_addr + 1) & 0x1FFFF;
                val
            }
            0x4000..=0x40FF => self.read_cpu_register(addr),
            0x4200..=0x42FF => self.read_cpu_register(addr),
            0x4300..=0x43FF => self.dma.read_register(addr - 0x4300),
            0x6000..=0x7FFF => {
                // CX4: 也攔截 $40-$6F:$6000-$7FFF
                if self.cx4.present {
                    self.cx4.read(addr - 0x6000)
                } else if self.cart.sram_size > 0 {
                    // LoROM SRAM mirror for banks $40-$6F
                    let sram_addr = ((effective as usize & 0x1F) * 0x2000) + (addr as usize - 0x6000);
                    self.cart.read_sram(sram_addr)
                } else {
                    self.open_bus
                }
            }
            _ => self.open_bus,
        }
    }

    fn bus_write(&mut self, bank: u8, addr: u16, val: u8) {
        // Set PC for PPU write tracing
        self.ppu.debug_2130_pc = ((self.cpu.pb as u32) << 16) | self.cpu.pc as u32;
        // WRAM banks $7E/$7F only (NOT $FE/$FF — those are cartridge ROM)
        if bank == 0x7E || bank == 0x7F {
            let offset = ((bank as usize - 0x7E) << 16) | addr as usize;
            if offset < self.wram.len() {
                self.wram[offset] = val;
            }
            return;
        }

        let effective = bank & 0x7F;
        match effective {
            // === System area: banks $00-$3F ($80-$BF) ===
            0x00..=0x3F => match addr {
                0x0000..=0x1FFF => { self.wram[addr as usize] = val; }
                0x2100..=0x2133 => { self.ppu.write_register(addr, val); }
                0x2140..=0x217F => {
                    self.catchup_apu();
                    self.apu.cpu_write_port(((addr - 0x2140) & 3) as u8, val);
                }
                0x2180 => {
                    let wa = self.wram_addr as usize & 0x1FFFF;
                    self.wram[wa] = val;
                    self.wram_addr = (self.wram_addr + 1) & 0x1FFFF;
                }
                0x2181 => { self.wram_addr = (self.wram_addr & 0x1FF00) | val as u32; }
                0x2182 => { self.wram_addr = (self.wram_addr & 0x100FF) | ((val as u32) << 8); }
                0x2183 => { self.wram_addr = (self.wram_addr & 0x0FFFF) | ((val as u32 & 0x01) << 16); }
                0x4200..=0x42FF => { self.write_cpu_register(addr, val); }
                0x4300..=0x43FF => {
                    // Debug: log ch0 control/b_addr writes
                    if addr == 0x4300 || addr == 0x4301 {
                        self.debug_trap_log.push_str(&format!(
                            "W${:04X}={:02X} @sl={}\n", addr, val, self.ppu.scanline,
                        ));
                    }
                    self.dma.write_register(addr - 0x4300, val);
                }
                0x6000..=0x7FFF => {
                    match self.cart.map_mode {
                        crate::snes::cartridge::MapMode::HiROM => {
                            if self.dsp1.present && effective < 0x20 {
                                // DSP-1: 寫入 DR ($6000-$6FFF), SR ($7000+) 為唯讀
                                if addr < 0x7000 {
                                    self.dsp1.write_dr(val);
                                }
                            } else if effective >= 0x20 {
                                let sram_addr = ((effective as usize - 0x20) * 0x2000) + (addr as usize - 0x6000);
                                self.cart.write_sram(sram_addr, val);
                            }
                        }
                        crate::snes::cartridge::MapMode::LoROM => {
                            // CX4: $00-$3F/$80-$BF:$6000-$7FFF → CX4 RAM/IO
                            if self.cx4.present {
                                self.cx4_write(addr, val);
                            } else if self.cart.sram_size > 0 {
                                // LoROM: $00-$3F:$6000-$7FFF mirrors SRAM
                                let sram_addr = ((effective as usize & 0x1F) * 0x2000) + (addr as usize - 0x6000);
                                self.cart.write_sram(sram_addr, val);
                            }
                        }
                    }
                }
                _ => {}
            },

            // === Banks $40-$6F: LoROM has HW writes in $0000-$7FFF ===
            0x40..=0x6F => {
                match self.cart.map_mode {
                    crate::snes::cartridge::MapMode::LoROM => {
                        if addr < 0x8000 {
                            self.bus_write_system_low(effective, addr, val);
                        }
                        // $8000-$FFFF = ROM, ignore writes
                    }
                    crate::snes::cartridge::MapMode::HiROM => {
                        // ROM, ignore writes
                    }
                }
            }

            // === Banks $70-$7F: LoROM SRAM or ROM (ignore writes) ===
            // Note: effective $7E/$7F come from banks $FE/$FF (after & 0x7F)
            0x70..=0x7F => {
                match self.cart.map_mode {
                    crate::snes::cartridge::MapMode::LoROM => {
                        if addr < 0x8000 && effective <= 0x7D {
                            let sram_addr = ((effective as usize - 0x70) * 0x8000) + addr as usize;
                            self.cart.write_sram(sram_addr, val);
                        }
                        // $8000-$FFFF = ROM, ignore writes
                    }
                    crate::snes::cartridge::MapMode::HiROM => {
                        // ROM, ignore writes
                    }
                }
            }

            _ => {}
        }
    }

    /// Helper for LoROM system area writes ($0000-$7FFF in banks $40-$6F)
    fn bus_write_system_low(&mut self, effective: u8, addr: u16, val: u8) {
        match addr {
            0x0000..=0x1FFF => { self.wram[addr as usize] = val; }
            0x2100..=0x2133 => { self.ppu.write_register(addr, val); }
            0x2140..=0x217F => {
                self.catchup_apu();
                self.apu.cpu_write_port(((addr - 0x2140) & 3) as u8, val);
            }
            0x2180 => {
                let wa = self.wram_addr as usize & 0x1FFFF;
                self.wram[wa] = val;
                self.wram_addr = (self.wram_addr + 1) & 0x1FFFF;
            }
            0x2181 => { self.wram_addr = (self.wram_addr & 0x1FF00) | val as u32; }
            0x2182 => { self.wram_addr = (self.wram_addr & 0x100FF) | ((val as u32) << 8); }
            0x2183 => { self.wram_addr = (self.wram_addr & 0x0FFFF) | ((val as u32 & 0x01) << 16); }
            0x4200..=0x42FF => { self.write_cpu_register(addr, val); }
            0x4300..=0x43FF => {
                    // Debug: log ch0 control/b_addr writes (bus_write path 2)
                    if addr == 0x4300 || addr == 0x4301 {
                        self.debug_trap_log.push_str(&format!(
                            "W${:04X}={:02X} @sl={}\n", addr, val, self.ppu.scanline,
                        ));
                    }
                    self.dma.write_register(addr - 0x4300, val);
                }
            0x6000..=0x7FFF => {
                // CX4: 也攔截 $40-$6F:$6000-$7FFF
                if self.cx4.present {
                    self.cx4_write(addr, val);
                } else if self.cart.sram_size > 0 {
                    // LoROM SRAM mirror for banks $40-$6F
                    let sram_addr = ((effective as usize & 0x1F) * 0x2000) + (addr as usize - 0x6000);
                    self.cart.write_sram(sram_addr, val);
                }
            }
            _ => {}
        }
    }

    /// CX4 寫入輔助（安全避開借用衝突）
    fn cx4_write(&mut self, snes_addr: u16, val: u8) {
        let offset = snes_addr.wrapping_sub(0x6000);
        self.cx4.write(offset, val, &self.cart.rom);
    }

    // === CPU 暫存器讀寫 ($4200-$42FF) ===

    fn read_cpu_register(&mut self, addr: u16) -> u8 {
        match addr {
            0x4016 => { /* Joypad serial - 簡化 */ 0 }
            0x4017 => 0,
            0x4210 => {
                // RDNMI: bit 7 = NMI flag (set at VBlank start, cleared at VBlank end)
                // 在掃描線級模擬器中，不在讀取時清除 bit 7。
                // 這避免了 NMI handler 的 LDA $4210 搶先清除旗標，
                // 導致主迴圈的 LDA $4210 / BPL 永遠無法偵測到 VBlank 的問題。
                // bit 7 改在 scanline 0（VBlank 結束）統一清除。
                (self.rdnmi & 0x80) | 0x01
            }
            0x4211 => {
                let v = self.timeup;
                self.timeup &= !0x80;
                v
            }
            0x4212 => {
                // HBlank (bit 6) is active when H position >= ~dot 274 (1096 master clocks)
                let hblank = self.cpu_cycles_this_line >= 1096;
                (self.hvbjoy & 0xBF) | (if hblank { 0x40 } else { 0 })
            }
            0x4214 => self.rddiv as u8,
            0x4215 => (self.rddiv >> 8) as u8,
            0x4216 => self.rdmpy as u8,
            0x4217 => (self.rdmpy >> 8) as u8,
            // 自動讀取結果
            0x4218 => self.ctrl1.auto_read_result as u8,
            0x4219 => (self.ctrl1.auto_read_result >> 8) as u8,
            0x421A => self.ctrl2.auto_read_result as u8,
            0x421B => (self.ctrl2.auto_read_result >> 8) as u8,
            _ => self.open_bus,
        }
    }

    fn write_cpu_register(&mut self, addr: u16, val: u8) {
        match addr {
            0x4200 => {
                let old_nmi = self.nmitimen & 0x80;
                self.nmitimen = val;
                self.ppu.nmi_enabled = val & 0x80 != 0;
                // NMI edge detection — 僅在本次 VBlank 尚未觸發過時才允許
                // 防止 NMI handler 內 toggle NMITIMEN bit7 導致無限遞迴
                if old_nmi == 0 && val & 0x80 != 0 && self.ppu.vblank_flag
                    && !self.nmi_fired_this_vblank
                {
                    self.cpu.nmi_pending = true;
                    self.nmi_fired_this_vblank = true;
                }
            }
            0x4201 => { self.wrio = val; }
            0x4202 => { self.wrmpya = val; }
            0x4203 => {
                self.wrmpyb = val;
                self.rdmpy = self.wrmpya as u16 * self.wrmpyb as u16;
            }
            0x4204 => { self.wrdivl = (self.wrdivl & 0xFF00) | val as u16; }
            0x4205 => { self.wrdivl = (self.wrdivl & 0x00FF) | ((val as u16) << 8); }
            0x4206 => {
                self.wrdivb = val;
                if self.wrdivb != 0 {
                    self.rddiv = self.wrdivl / self.wrdivb as u16;
                    self.rdmpy = self.wrdivl % self.wrdivb as u16;
                } else {
                    self.rddiv = 0xFFFF;
                    self.rdmpy = self.wrdivl;
                }
            }
            0x4207 => { self.htime = (self.htime & 0x100) | val as u16; }
            0x4208 => { self.htime = (self.htime & 0x0FF) | ((val as u16 & 0x01) << 8); }
            0x4209 => { self.vtime = (self.vtime & 0x100) | val as u16; }
            0x420A => { self.vtime = (self.vtime & 0x0FF) | ((val as u16 & 0x01) << 8); }
            0x420B => {
                self.dma.dma_enable = val;
                if val != 0 {
                    self.run_dma();
                }
            }
            0x420C => {
                // HDMA enable: channels newly enabled mid-frame should NOT run until
                // next frame's HDMA init. Mark them as completed so they're skipped this frame.
                let newly_enabled = val & !self.dma.hdma_enable;
                // Debug: log channel state when transitioning to $FF
                if val == 0xFF && self.dma.hdma_enable != 0xFF {
                    let ch0 = &self.dma.channels[0];
                    let ch1 = &self.dma.channels[1];
                    self.debug_trap_log.push_str(&format!(
                        "420C->FF @sl={} ch0(ctrl={:02X} b={:02X} a={:02X}:{:04X}) ch1(ctrl={:02X} b={:02X} a={:02X}:{:04X})\n",
                        self.ppu.scanline,
                        ch0.control, ch0.b_addr, ch0.a_bank, ch0.a_addr,
                        ch1.control, ch1.b_addr, ch1.a_bank, ch1.a_addr,
                    ));
                }
                for i in 0..8u8 {
                    if newly_enabled & (1 << i) != 0 {
                        self.dma.channels[i as usize].hdma_completed = true;
                    }
                }
                self.dma.hdma_enable = val;
            }
            0x420D => {
                // MEMSEL: FastROM enable
                self.cart.fast_rom = val & 0x01 != 0;
            }
            _ => {}
        }
    }

    // ================================================================
    // DMA 傳輸
    // ================================================================

    fn run_dma(&mut self) {
        for i in 0..8u8 {
            if self.dma.dma_enable & (1 << i) == 0 { continue; }

            let ch = self.dma.channels[i as usize].clone();
            let direction = ch.direction();
            let offsets = DmaController::get_b_offsets(ch.transfer_mode());
            let adjust = ch.a_adjust();
            let mut a_addr = ch.a_addr;
            let a_bank = ch.a_bank;
            let b_base = 0x2100u16 + ch.b_addr as u16;
            let mut count = if ch.count == 0 { 0x10000u32 } else { ch.count as u32 };

            // DMA log for OAM ($2104) and VRAM ($2118/$2119) transfers
            if ch.b_addr == 0x04 || ch.b_addr == 0x18 || ch.b_addr == 0x22 {
                self.debug_trap_log.push_str(&format!(
                    "DMA ch{}: ${:02X}{:04X}→${:04X} cnt={} mode={} adj={} dir={:?} | ",
                    i, a_bank, a_addr, b_base, count, ch.transfer_mode(), adjust, direction
                ));
            }

            // Debug: detect DMA on HDMA-enabled channels
            if self.dma.hdma_enable & (1 << i) != 0 {
                self.debug_trap_log.push_str(&format!(
                    "DMA-on-HDMA ch{}: a_addr {:04X}→", i, a_addr
                ));
            }

            while count > 0 {
                for &offset in offsets {
                    if count == 0 { break; }
                    let b_addr = b_base.wrapping_add(offset as u16);
                    let full_a = ((a_bank as u32) << 16) | a_addr as u32;

                    match direction {
                        DmaDirection::AtoB => {
                            let val = self.read(full_a);
                            self.bus_write(0, b_addr, val);
                        }
                        DmaDirection::BtoA => {
                            let val = self.bus_read(0, b_addr);
                            self.write(full_a, val);
                        }
                    }

                    a_addr = (a_addr as i32 + adjust as i32) as u16;
                    count -= 1;
                    self.cpu_cycles_this_line += 8; // 每 byte 8 master clocks
                }
            }

            self.dma.channels[i as usize].a_addr = a_addr;
            self.dma.channels[i as usize].count = 0;

            // Debug: log final a_addr after DMA on HDMA channel
            if self.dma.hdma_enable & (1 << i) != 0 {
                self.debug_trap_log.push_str(&format!(
                    "{:04X} sl={} | ", a_addr, self.ppu.scanline
                ));
            }
        }
        self.dma.dma_enable = 0;
    }

    // ================================================================
    // HDMA
    // ================================================================

    /// Read first table entry for each HDMA channel (called at scanline 0 after hdma_init)
    fn hdma_init_read(&mut self) {
        for i in 0..8u8 {
            if self.dma.hdma_enable & (1 << i) == 0 { continue; }
            let idx = i as usize;
            if self.dma.channels[idx].hdma_completed { continue; }

            // Read first table entry
            let table_bank = self.dma.channels[idx].a_bank;
            let table_addr = self.dma.channels[idx].hdma_addr;
            let full = ((table_bank as u32) << 16) | table_addr as u32;
            let line_counter = self.read(full);
            self.dma.channels[idx].hdma_line_counter = line_counter;
            self.dma.channels[idx].hdma_addr = self.dma.channels[idx].hdma_addr.wrapping_add(1);

            if line_counter == 0 {
                self.dma.channels[idx].hdma_completed = true;
                continue;
            }

            // First transfer will happen on scanline 1
            self.dma.channels[idx].hdma_do_transfer = true;

            // Indirect mode: read 16-bit indirect address into dedicated indirect_addr
            if self.dma.channels[idx].hdma_indirect() {
                let ha = self.dma.channels[idx].hdma_addr;
                let lo = self.read(((table_bank as u32) << 16) | ha as u32);
                self.dma.channels[idx].hdma_addr = ha.wrapping_add(1);
                let ha2 = self.dma.channels[idx].hdma_addr;
                let hi = self.read(((table_bank as u32) << 16) | ha2 as u32);
                self.dma.channels[idx].hdma_addr = ha2.wrapping_add(1);
                let ptr = (lo as u16) | ((hi as u16) << 8);
                self.dma.channels[idx].indirect_addr = ptr;
            }
            self.cpu_cycles_this_line += 8;
        }
    }

    fn run_hdma(&mut self) {
        for i in 0..8u8 {
            if self.dma.hdma_enable & (1 << i) == 0 { continue; }
            let idx = i as usize;
            if self.dma.channels[idx].hdma_completed { continue; }

            // ── Step 1: Transfer (if do_transfer is set from previous scanline's setup) ──
            if self.dma.channels[idx].hdma_do_transfer {
                let tm = self.dma.channels[idx].transfer_mode();
                let offsets = DmaController::get_b_offsets(tm);
                let b_base = 0x2100u16 + self.dma.channels[idx].b_addr as u16;

                for &offset in offsets {
                    let b_addr = b_base.wrapping_add(offset as u16);
                    let indirect = self.dma.channels[idx].hdma_indirect();
                    let val = if indirect {
                        let bank = self.dma.channels[idx].hdma_bank;
                        let ia = self.dma.channels[idx].indirect_addr;
                        let full = ((bank as u32) << 16) | ia as u32;
                        self.dma.channels[idx].indirect_addr = ia.wrapping_add(1);
                        self.read(full)
                    } else {
                        let bank = self.dma.channels[idx].a_bank;
                        let ha = self.dma.channels[idx].hdma_addr;
                        let full = ((bank as u32) << 16) | ha as u32;
                        self.dma.channels[idx].hdma_addr = ha.wrapping_add(1);
                        self.read(full)
                    };
                    self.bus_write(0, b_addr, val);
                    self.cpu_cycles_this_line += 8;
                }
            }

            // ── Step 2: Decrement line counter (low 7 bits) ──
            let old_counter = self.dma.channels[idx].hdma_line_counter;
            let new_count = (old_counter & 0x7F).wrapping_sub(1);
            self.dma.channels[idx].hdma_line_counter = (old_counter & 0x80) | (new_count & 0x7F);

            // ── Step 3: If counter reached 0, load next table entry ──
            if (new_count & 0x7F) == 0 {
                let table_bank = self.dma.channels[idx].a_bank;
                let table_addr = self.dma.channels[idx].hdma_addr;
                let full = ((table_bank as u32) << 16) | table_addr as u32;
                let line_counter = self.read(full);
                self.dma.channels[idx].hdma_line_counter = line_counter;
                self.dma.channels[idx].hdma_addr = self.dma.channels[idx].hdma_addr.wrapping_add(1);

                if line_counter == 0 {
                    self.dma.channels[idx].hdma_completed = true;
                    continue;
                }

                // For next scanline, transfer must happen
                self.dma.channels[idx].hdma_do_transfer = true;

                // Indirect mode: read 16-bit indirect address from table
                if self.dma.channels[idx].hdma_indirect() {
                    let ha = self.dma.channels[idx].hdma_addr;
                    let lo = self.read(((table_bank as u32) << 16) | ha as u32);
                    self.dma.channels[idx].hdma_addr = ha.wrapping_add(1);
                    let ha2 = self.dma.channels[idx].hdma_addr;
                    let hi = self.read(((table_bank as u32) << 16) | ha2 as u32);
                    self.dma.channels[idx].hdma_addr = ha2.wrapping_add(1);
                    self.dma.channels[idx].indirect_addr = (lo as u16) | ((hi as u16) << 8);
                }
            } else {
                // Counter not zero: set do_transfer from repeat bit
                self.dma.channels[idx].hdma_do_transfer =
                    self.dma.channels[idx].hdma_line_counter & 0x80 != 0;
            }
        }
    }

    // ================================================================
    // NMI / IRQ
    // ================================================================

    fn do_nmi(&mut self) {
        if !self.cpu.emulation {
            self.push8(self.cpu.pb);
        }
        self.push16(self.cpu.pc);
        self.push8(self.cpu.p);
        self.cpu.set_flag(flags::IRQ_DIS, true);
        self.cpu.set_flag(flags::DECIMAL, false);
        self.cpu.pb = 0;

        let vector = if self.cpu.emulation { 0xFFFA } else { 0xFFEA };
        let lo = self.read(vector) as u16;
        let hi = self.read(vector + 1) as u16;
        self.cpu.pc = lo | (hi << 8);
        self.cpu.cycles = 8;
    }

    fn do_irq(&mut self) {
        if !self.cpu.emulation {
            self.push8(self.cpu.pb);
        }
        self.push16(self.cpu.pc);
        self.push8(self.cpu.p);
        self.cpu.set_flag(flags::IRQ_DIS, true);
        self.cpu.set_flag(flags::DECIMAL, false);
        self.cpu.pb = 0;

        let vector = if self.cpu.emulation { 0xFFFE } else { 0xFFEE };
        let lo = self.read(vector) as u16;
        let hi = self.read(vector + 1) as u16;
        self.cpu.pc = lo | (hi << 8);
        self.cpu.cycles = 8;
    }

    // ================================================================
    // 堆疊操作
    // ================================================================

    fn push8(&mut self, val: u8) {
        let addr = self.cpu.sp;
        self.bus_write(0, addr, val);
        if self.cpu.emulation {
            self.cpu.sp = 0x0100 | ((self.cpu.sp.wrapping_sub(1)) & 0xFF);
        } else {
            self.cpu.sp = self.cpu.sp.wrapping_sub(1);
        }
    }

    fn push16(&mut self, val: u16) {
        self.push8((val >> 8) as u8);
        self.push8(val as u8);
    }

    fn pull8(&mut self) -> u8 {
        if self.cpu.emulation {
            self.cpu.sp = 0x0100 | ((self.cpu.sp.wrapping_add(1)) & 0xFF);
        } else {
            self.cpu.sp = self.cpu.sp.wrapping_add(1);
        }
        self.bus_read(0, self.cpu.sp)
    }

    fn pull16(&mut self) -> u16 {
        let lo = self.pull8() as u16;
        let hi = self.pull8() as u16;
        lo | (hi << 8)
    }

    // ================================================================
    // CPU 取指輔助
    // ================================================================

    fn fetch_pc(&mut self) -> u8 {
        let addr = ((self.cpu.pb as u32) << 16) | self.cpu.pc as u32;
        let val = self.read(addr);
        self.cpu.pc = self.cpu.pc.wrapping_add(1);
        val
    }

    fn fetch_pc16(&mut self) -> u16 {
        let lo = self.fetch_pc() as u16;
        let hi = self.fetch_pc() as u16;
        lo | (hi << 8)
    }

    fn fetch_pc24(&mut self) -> u32 {
        let lo = self.fetch_pc() as u32;
        let mid = self.fetch_pc() as u32;
        let hi = self.fetch_pc() as u32;
        lo | (mid << 8) | (hi << 16)
    }

    // ================================================================
    // 定址模式
    // ================================================================

    /// Direct Page
    fn addr_dp(&mut self) -> u32 {
        let offset = self.fetch_pc() as u16;
        (self.cpu.dp.wrapping_add(offset)) as u32
    }

    /// Direct Page, X
    fn addr_dp_x(&mut self) -> u32 {
        let offset = self.fetch_pc() as u16;
        if self.cpu.emulation && (self.cpu.dp & 0xFF) == 0 {
            (self.cpu.dp | ((offset.wrapping_add(self.cpu.x_val())) & 0xFF)) as u32
        } else {
            self.cpu.dp.wrapping_add(offset).wrapping_add(self.cpu.x_val()) as u32
        }
    }

    /// Direct Page, Y
    fn addr_dp_y(&mut self) -> u32 {
        let offset = self.fetch_pc() as u16;
        if self.cpu.emulation && (self.cpu.dp & 0xFF) == 0 {
            (self.cpu.dp | ((offset.wrapping_add(self.cpu.y_val())) & 0xFF)) as u32
        } else {
            self.cpu.dp.wrapping_add(offset).wrapping_add(self.cpu.y_val()) as u32
        }
    }

    /// Absolute
    fn addr_abs(&mut self) -> u32 {
        let addr = self.fetch_pc16();
        ((self.cpu.db as u32) << 16) | addr as u32
    }

    /// Absolute, X — allows bank crossing per ares: readBank(V.w + I.w)
    fn addr_abs_x(&mut self) -> u32 {
        let addr = self.fetch_pc16();
        (((self.cpu.db as u32) << 16) + addr as u32 + self.cpu.x_val() as u32) & 0xFFFFFF
    }

    /// Absolute, Y — allows bank crossing per ares: readBank(V.w + I.w)
    fn addr_abs_y(&mut self) -> u32 {
        let addr = self.fetch_pc16();
        (((self.cpu.db as u32) << 16) + addr as u32 + self.cpu.y_val() as u32) & 0xFFFFFF
    }

    /// Absolute Long
    fn addr_long(&mut self) -> u32 {
        self.fetch_pc24()
    }

    /// Absolute Long, X
    fn addr_long_x(&mut self) -> u32 {
        let base = self.fetch_pc24();
        base.wrapping_add(self.cpu.x_val() as u32) & 0xFFFFFF
    }

    /// (Direct Page)
    fn addr_dp_ind(&mut self) -> u32 {
        let dp = self.addr_dp();
        let lo = self.read(dp) as u32;
        let hi = self.read(dp.wrapping_add(1) & 0xFFFF) as u32;
        ((self.cpu.db as u32) << 16) | (hi << 8) | lo
    }

    /// (Direct Page, X)
    fn addr_dp_ind_x(&mut self) -> u32 {
        let dp = self.addr_dp_x();
        let lo = self.read(dp & 0xFFFF) as u32;
        let hi = self.read((dp.wrapping_add(1)) & 0xFFFF) as u32;
        ((self.cpu.db as u32) << 16) | (hi << 8) | lo
    }

    /// (Direct Page), Y
    fn addr_dp_ind_y(&mut self) -> u32 {
        let offset = self.fetch_pc() as u16;
        let dp = self.cpu.dp.wrapping_add(offset) as u32;
        let lo = self.read(dp & 0xFFFF) as u32;
        let hi = self.read((dp.wrapping_add(1)) & 0xFFFF) as u32;
        let base = ((self.cpu.db as u32) << 16) | (hi << 8) | lo;
        base.wrapping_add(self.cpu.y_val() as u32) & 0xFFFFFF
    }

    /// [Direct Page] (Indirect Long)
    fn addr_dp_ind_long(&mut self) -> u32 {
        let offset = self.fetch_pc() as u16;
        let dp = self.cpu.dp.wrapping_add(offset) as u32;
        let lo = self.read(dp & 0xFFFF) as u32;
        let mid = self.read((dp.wrapping_add(1)) & 0xFFFF) as u32;
        let hi = self.read((dp.wrapping_add(2)) & 0xFFFF) as u32;
        (hi << 16) | (mid << 8) | lo
    }

    /// [Direct Page], Y (Indirect Long Indexed)
    fn addr_dp_ind_long_y(&mut self) -> u32 {
        let base = self.addr_dp_ind_long();
        base.wrapping_add(self.cpu.y_val() as u32) & 0xFFFFFF
    }

    /// Stack Relative
    fn addr_sr(&mut self) -> u32 {
        let offset = self.fetch_pc() as u16;
        self.cpu.sp.wrapping_add(offset) as u32
    }

    /// (Stack Relative), Y
    fn addr_sr_ind_y(&mut self) -> u32 {
        let sr = self.addr_sr();
        let lo = self.read(sr & 0xFFFF) as u32;
        let hi = self.read((sr.wrapping_add(1)) & 0xFFFF) as u32;
        let base = ((self.cpu.db as u32) << 16) | (hi << 8) | lo;
        base.wrapping_add(self.cpu.y_val() as u32) & 0xFFFFFF
    }

    // ================================================================
    // 資料讀寫 (尊重 M/X 旗標寬度)
    // ================================================================

    fn read_m(&mut self, addr: u32) -> u16 {
        if self.cpu.flag_m() {
            self.read(addr) as u16
        } else {
            let lo = self.read(addr) as u16;
            let hi = self.read(addr.wrapping_add(1) & 0xFFFFFF) as u16;
            lo | (hi << 8)
        }
    }

    fn read_x(&mut self, addr: u32) -> u16 {
        if self.cpu.flag_x() {
            self.read(addr) as u16
        } else {
            let lo = self.read(addr) as u16;
            let hi = self.read(addr.wrapping_add(1) & 0xFFFFFF) as u16;
            lo | (hi << 8)
        }
    }

    fn write_m(&mut self, addr: u32, val: u16) {
        if self.cpu.flag_m() {
            self.write(addr, val as u8);
        } else {
            self.write(addr, val as u8);
            self.write(addr.wrapping_add(1) & 0xFFFFFF, (val >> 8) as u8);
        }
    }

    fn write_x(&mut self, addr: u32, val: u16) {
        if self.cpu.flag_x() {
            self.write(addr, val as u8);
        } else {
            self.write(addr, val as u8);
            self.write(addr.wrapping_add(1) & 0xFFFFFF, (val >> 8) as u8);
        }
    }

    // ================================================================
    // ALU 操作
    // ================================================================

    fn op_adc(&mut self, val: u16) {
        let a = self.cpu.a_val();
        let c = self.cpu.flag_c() as u16;

        if self.cpu.flag_m() {
            // 8-bit
            if self.cpu.flag_d() {
                // BCD
                let mut result = (a & 0x0F) + (val & 0x0F) + c;
                if result > 9 { result += 6; }
                result += (a & 0xF0) + (val & 0xF0);
                if result > 0x9F { result += 0x60; }
                self.cpu.set_flag(flags::CARRY, result > 0xFF);
                let r8 = result as u8;
                self.cpu.set_flag(flags::OVERFLOW, !(((a as u8) ^ val as u8) & 0x80 != 0) && (((a as u8) ^ r8) & 0x80 != 0));
                self.cpu.set_flag(flags::NEGATIVE, r8 & 0x80 != 0);
                self.cpu.set_flag(flags::ZERO, r8 == 0);
                self.cpu.set_a(r8 as u16);
            } else {
                let result = (a & 0xFF) + (val & 0xFF) + c;
                self.cpu.set_flag(flags::CARRY, result > 0xFF);
                self.cpu.set_flag(flags::OVERFLOW, !((a ^ val) & 0x80 != 0) && ((a ^ result) & 0x80 != 0));
                let r = (result & 0xFF) as u16;
                self.cpu.set_a(r);
                self.cpu.set_nz_m(r);
            }
        } else {
            // 16-bit
            if self.cpu.flag_d() {
                let mut result = (a & 0x000F) + (val & 0x000F) + c;
                if result > 0x0009 { result += 0x0006; }
                result += (a & 0x00F0) + (val & 0x00F0);
                if result > 0x009F { result += 0x0060; }
                result += (a & 0x0F00) + (val & 0x0F00);
                if result > 0x09FF { result += 0x0600; }
                result += (a & 0xF000) + (val & 0xF000);
                if result > 0x9FFF { result += 0x6000; }
                self.cpu.set_flag(flags::CARRY, result > 0xFFFF);
                let r16 = result as u16;
                self.cpu.set_flag(flags::OVERFLOW, !((a ^ val) & 0x8000 != 0) && ((a ^ r16) & 0x8000 != 0));
                self.cpu.set_a(r16);
                self.cpu.set_nz_m(r16);
            } else {
                let result = a as u32 + val as u32 + c as u32;
                self.cpu.set_flag(flags::CARRY, result > 0xFFFF);
                self.cpu.set_flag(flags::OVERFLOW, !((a ^ val) & 0x8000 != 0) && ((a ^ result as u16) & 0x8000 != 0));
                let r = result as u16;
                self.cpu.set_a(r);
                self.cpu.set_nz_m(r);
            }
        }
    }

    fn op_sbc(&mut self, val: u16) {
        let a = self.cpu.a_val();
        let c = self.cpu.flag_c() as u16;

        if self.cpu.flag_m() {
            if self.cpu.flag_d() {
                let mut result = (a & 0x0F) as i16 - (val & 0x0F) as i16 + c as i16 - 1;
                if result < 0 { result -= 6; }
                result += (a & 0xF0) as i16 - (val & 0xF0) as i16;
                if result < 0 { result -= 0x60; }
                self.cpu.set_flag(flags::CARRY, (a & 0xFF) as i16 - (val & 0xFF) as i16 + c as i16 - 1 >= 0);
                let r8 = result as u8;
                self.cpu.set_flag(flags::OVERFLOW, ((a as u8 ^ val as u8) & 0x80 != 0) && ((a as u8 ^ r8) & 0x80 != 0));
                self.cpu.set_a(r8 as u16);
                self.cpu.set_nz_m(r8 as u16);
            } else {
                let result = (a & 0xFF) as i16 - (val & 0xFF) as i16 + c as i16 - 1;
                self.cpu.set_flag(flags::CARRY, result >= 0);
                self.cpu.set_flag(flags::OVERFLOW, ((a ^ val) & 0x80 != 0) && ((a ^ result as u16) & 0x80 != 0));
                let r = (result as u16) & 0xFF;
                self.cpu.set_a(r);
                self.cpu.set_nz_m(r);
            }
        } else {
            if self.cpu.flag_d() {
                // 16-bit BCD subtract
                let result = a as i32 - val as i32 + c as i32 - 1;
                self.cpu.set_flag(flags::CARRY, result >= 0);
                let r = result as u16;
                self.cpu.set_flag(flags::OVERFLOW, ((a ^ val) & 0x8000 != 0) && ((a ^ r) & 0x8000 != 0));
                self.cpu.set_a(r);
                self.cpu.set_nz_m(r);
            } else {
                let result = a as i32 - val as i32 + c as i32 - 1;
                self.cpu.set_flag(flags::CARRY, result >= 0);
                self.cpu.set_flag(flags::OVERFLOW, ((a ^ val) & 0x8000 != 0) && ((a ^ result as u16) & 0x8000 != 0));
                let r = result as u16;
                self.cpu.set_a(r);
                self.cpu.set_nz_m(r);
            }
        }
    }

    fn op_cmp_m(&mut self, reg: u16, val: u16) {
        if self.cpu.flag_m() {
            let result = (reg & 0xFF).wrapping_sub(val & 0xFF);
            self.cpu.set_flag(flags::CARRY, (reg & 0xFF) >= (val & 0xFF));
            self.cpu.set_nz_m(result);
        } else {
            let result = reg.wrapping_sub(val);
            self.cpu.set_flag(flags::CARRY, reg >= val);
            self.cpu.set_nz_m(result);
        }
    }

    fn op_cmp_x(&mut self, reg: u16, val: u16) {
        if self.cpu.flag_x() {
            let result = (reg & 0xFF).wrapping_sub(val & 0xFF);
            self.cpu.set_flag(flags::CARRY, (reg & 0xFF) >= (val & 0xFF));
            self.cpu.set_nz_x(result);
        } else {
            let result = reg.wrapping_sub(val);
            self.cpu.set_flag(flags::CARRY, reg >= val);
            self.cpu.set_nz_x(result);
        }
    }

    // ================================================================
    // 65816 指令執行 (全 256 opcodes)
    // ================================================================

    fn execute_instruction(&mut self, opcode: u8) {
        match opcode {
            // === BRK ===
            0x00 => {
                // Record crash origin: PC was at opcode $00, which is 1 before current PC
                let brk_pc = self.cpu.pc.wrapping_sub(1); // PC already advanced past opcode
                if self.brk_origin.is_none() {
                    self.brk_origin = Some((self.cpu.pb, brk_pc));
                }
                self.fetch_pc(); // signature byte
                if !self.cpu.emulation { self.push8(self.cpu.pb); }
                self.push16(self.cpu.pc);
                self.push8(self.cpu.p);
                self.cpu.set_flag(flags::IRQ_DIS, true);
                self.cpu.set_flag(flags::DECIMAL, false);
                self.cpu.pb = 0;
                let vector = if self.cpu.emulation { 0xFFFE } else { 0xFFE6 };
                let lo = self.read(vector) as u16;
                let hi = self.read(vector + 1) as u16;
                self.cpu.pc = lo | (hi << 8);
                self.cpu.cycles = 7;
            }
            // === COP ===
            0x02 => {
                self.fetch_pc();
                if !self.cpu.emulation { self.push8(self.cpu.pb); }
                self.push16(self.cpu.pc);
                self.push8(self.cpu.p);
                self.cpu.set_flag(flags::IRQ_DIS, true);
                self.cpu.set_flag(flags::DECIMAL, false);
                self.cpu.pb = 0;
                let vector = if self.cpu.emulation { 0xFFF4 } else { 0xFFE4 };
                let lo = self.read(vector) as u16;
                let hi = self.read(vector + 1) as u16;
                self.cpu.pc = lo | (hi << 8);
                self.cpu.cycles = 7;
            }

            // === ORA ===
            0x01 => { let a = self.addr_dp_ind_x(); let v = self.read_m(a); let r = self.cpu.a_val() | v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 6; }
            0x03 => { let a = self.addr_sr(); let v = self.read_m(a); let r = self.cpu.a_val() | v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 4; }
            0x05 => { let a = self.addr_dp(); let v = self.read_m(a); let r = self.cpu.a_val() | v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 3; }
            0x07 => { let a = self.addr_dp_ind_long(); let v = self.read_m(a); let r = self.cpu.a_val() | v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 6; }
            0x09 => { let v = if self.cpu.flag_m() { self.fetch_pc() as u16 } else { self.fetch_pc16() }; let r = self.cpu.a_val() | v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 2; }
            0x0D => { let a = self.addr_abs(); let v = self.read_m(a); let r = self.cpu.a_val() | v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 4; }
            0x0F => { let a = self.addr_long(); let v = self.read_m(a); let r = self.cpu.a_val() | v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 5; }
            0x11 => { let a = self.addr_dp_ind_y(); let v = self.read_m(a); let r = self.cpu.a_val() | v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 5; }
            0x12 => { let a = self.addr_dp_ind(); let v = self.read_m(a); let r = self.cpu.a_val() | v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 5; }
            0x13 => { let a = self.addr_sr_ind_y(); let v = self.read_m(a); let r = self.cpu.a_val() | v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 7; }
            0x15 => { let a = self.addr_dp_x(); let v = self.read_m(a); let r = self.cpu.a_val() | v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 4; }
            0x17 => { let a = self.addr_dp_ind_long_y(); let v = self.read_m(a); let r = self.cpu.a_val() | v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 6; }
            0x19 => { let a = self.addr_abs_y(); let v = self.read_m(a); let r = self.cpu.a_val() | v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 4; }
            0x1D => { let a = self.addr_abs_x(); let v = self.read_m(a); let r = self.cpu.a_val() | v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 4; }
            0x1F => { let a = self.addr_long_x(); let v = self.read_m(a); let r = self.cpu.a_val() | v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 5; }

            // === AND ===
            0x21 => { let a = self.addr_dp_ind_x(); let v = self.read_m(a); let r = self.cpu.a_val() & v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 6; }
            0x23 => { let a = self.addr_sr(); let v = self.read_m(a); let r = self.cpu.a_val() & v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 4; }
            0x25 => { let a = self.addr_dp(); let v = self.read_m(a); let r = self.cpu.a_val() & v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 3; }
            0x27 => { let a = self.addr_dp_ind_long(); let v = self.read_m(a); let r = self.cpu.a_val() & v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 6; }
            0x29 => { let v = if self.cpu.flag_m() { self.fetch_pc() as u16 } else { self.fetch_pc16() }; let r = self.cpu.a_val() & v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 2; }
            0x2D => { let a = self.addr_abs(); let v = self.read_m(a); let r = self.cpu.a_val() & v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 4; }
            0x2F => { let a = self.addr_long(); let v = self.read_m(a); let r = self.cpu.a_val() & v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 5; }
            0x31 => { let a = self.addr_dp_ind_y(); let v = self.read_m(a); let r = self.cpu.a_val() & v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 5; }
            0x32 => { let a = self.addr_dp_ind(); let v = self.read_m(a); let r = self.cpu.a_val() & v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 5; }
            0x33 => { let a = self.addr_sr_ind_y(); let v = self.read_m(a); let r = self.cpu.a_val() & v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 7; }
            0x35 => { let a = self.addr_dp_x(); let v = self.read_m(a); let r = self.cpu.a_val() & v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 4; }
            0x37 => { let a = self.addr_dp_ind_long_y(); let v = self.read_m(a); let r = self.cpu.a_val() & v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 6; }
            0x39 => { let a = self.addr_abs_y(); let v = self.read_m(a); let r = self.cpu.a_val() & v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 4; }
            0x3D => { let a = self.addr_abs_x(); let v = self.read_m(a); let r = self.cpu.a_val() & v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 4; }
            0x3F => { let a = self.addr_long_x(); let v = self.read_m(a); let r = self.cpu.a_val() & v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 5; }

            // === EOR ===
            0x41 => { let a = self.addr_dp_ind_x(); let v = self.read_m(a); let r = self.cpu.a_val() ^ v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 6; }
            0x43 => { let a = self.addr_sr(); let v = self.read_m(a); let r = self.cpu.a_val() ^ v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 4; }
            0x45 => { let a = self.addr_dp(); let v = self.read_m(a); let r = self.cpu.a_val() ^ v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 3; }
            0x47 => { let a = self.addr_dp_ind_long(); let v = self.read_m(a); let r = self.cpu.a_val() ^ v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 6; }
            0x49 => { let v = if self.cpu.flag_m() { self.fetch_pc() as u16 } else { self.fetch_pc16() }; let r = self.cpu.a_val() ^ v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 2; }
            0x4D => { let a = self.addr_abs(); let v = self.read_m(a); let r = self.cpu.a_val() ^ v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 4; }
            0x4F => { let a = self.addr_long(); let v = self.read_m(a); let r = self.cpu.a_val() ^ v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 5; }
            0x51 => { let a = self.addr_dp_ind_y(); let v = self.read_m(a); let r = self.cpu.a_val() ^ v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 5; }
            0x52 => { let a = self.addr_dp_ind(); let v = self.read_m(a); let r = self.cpu.a_val() ^ v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 5; }
            0x53 => { let a = self.addr_sr_ind_y(); let v = self.read_m(a); let r = self.cpu.a_val() ^ v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 7; }
            0x55 => { let a = self.addr_dp_x(); let v = self.read_m(a); let r = self.cpu.a_val() ^ v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 4; }
            0x57 => { let a = self.addr_dp_ind_long_y(); let v = self.read_m(a); let r = self.cpu.a_val() ^ v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 6; }
            0x59 => { let a = self.addr_abs_y(); let v = self.read_m(a); let r = self.cpu.a_val() ^ v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 4; }
            0x5D => { let a = self.addr_abs_x(); let v = self.read_m(a); let r = self.cpu.a_val() ^ v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 4; }
            0x5F => { let a = self.addr_long_x(); let v = self.read_m(a); let r = self.cpu.a_val() ^ v; self.cpu.set_a(r); self.cpu.set_nz_m(r); self.cpu.cycles = 5; }

            // === ADC ===
            0x61 => { let a = self.addr_dp_ind_x(); let v = self.read_m(a); self.op_adc(v); self.cpu.cycles = 6; }
            0x63 => { let a = self.addr_sr(); let v = self.read_m(a); self.op_adc(v); self.cpu.cycles = 4; }
            0x65 => { let a = self.addr_dp(); let v = self.read_m(a); self.op_adc(v); self.cpu.cycles = 3; }
            0x67 => { let a = self.addr_dp_ind_long(); let v = self.read_m(a); self.op_adc(v); self.cpu.cycles = 6; }
            0x69 => { let v = if self.cpu.flag_m() { self.fetch_pc() as u16 } else { self.fetch_pc16() }; self.op_adc(v); self.cpu.cycles = 2; }
            0x6D => { let a = self.addr_abs(); let v = self.read_m(a); self.op_adc(v); self.cpu.cycles = 4; }
            0x6F => { let a = self.addr_long(); let v = self.read_m(a); self.op_adc(v); self.cpu.cycles = 5; }
            0x71 => { let a = self.addr_dp_ind_y(); let v = self.read_m(a); self.op_adc(v); self.cpu.cycles = 5; }
            0x72 => { let a = self.addr_dp_ind(); let v = self.read_m(a); self.op_adc(v); self.cpu.cycles = 5; }
            0x73 => { let a = self.addr_sr_ind_y(); let v = self.read_m(a); self.op_adc(v); self.cpu.cycles = 7; }
            0x75 => { let a = self.addr_dp_x(); let v = self.read_m(a); self.op_adc(v); self.cpu.cycles = 4; }
            0x77 => { let a = self.addr_dp_ind_long_y(); let v = self.read_m(a); self.op_adc(v); self.cpu.cycles = 6; }
            0x79 => { let a = self.addr_abs_y(); let v = self.read_m(a); self.op_adc(v); self.cpu.cycles = 4; }
            0x7D => { let a = self.addr_abs_x(); let v = self.read_m(a); self.op_adc(v); self.cpu.cycles = 4; }
            0x7F => { let a = self.addr_long_x(); let v = self.read_m(a); self.op_adc(v); self.cpu.cycles = 5; }

            // === STA ===
            0x81 => { let a = self.addr_dp_ind_x(); let v = self.cpu.a_val(); self.write_m(a, v); self.cpu.cycles = 6; }
            0x83 => { let a = self.addr_sr(); let v = self.cpu.a_val(); self.write_m(a, v); self.cpu.cycles = 4; }
            0x85 => { let a = self.addr_dp(); let v = self.cpu.a_val(); self.write_m(a, v); self.cpu.cycles = 3; }
            0x87 => { let a = self.addr_dp_ind_long(); let v = self.cpu.a_val(); self.write_m(a, v); self.cpu.cycles = 6; }
            0x8D => { let a = self.addr_abs(); let v = self.cpu.a_val(); self.write_m(a, v); self.cpu.cycles = 4; }
            0x8F => { let a = self.addr_long(); let v = self.cpu.a_val(); self.write_m(a, v); self.cpu.cycles = 5; }
            0x91 => { let a = self.addr_dp_ind_y(); let v = self.cpu.a_val(); self.write_m(a, v); self.cpu.cycles = 6; }
            0x92 => { let a = self.addr_dp_ind(); let v = self.cpu.a_val(); self.write_m(a, v); self.cpu.cycles = 5; }
            0x93 => { let a = self.addr_sr_ind_y(); let v = self.cpu.a_val(); self.write_m(a, v); self.cpu.cycles = 7; }
            0x95 => { let a = self.addr_dp_x(); let v = self.cpu.a_val(); self.write_m(a, v); self.cpu.cycles = 4; }
            0x97 => { let a = self.addr_dp_ind_long_y(); let v = self.cpu.a_val(); self.write_m(a, v); self.cpu.cycles = 6; }
            0x99 => { let a = self.addr_abs_y(); let v = self.cpu.a_val(); self.write_m(a, v); self.cpu.cycles = 5; }
            0x9D => { let a = self.addr_abs_x(); let v = self.cpu.a_val(); self.write_m(a, v); self.cpu.cycles = 5; }
            0x9F => { let a = self.addr_long_x(); let v = self.cpu.a_val(); self.write_m(a, v); self.cpu.cycles = 5; }

            // === LDA ===
            0xA1 => { let a = self.addr_dp_ind_x(); let v = self.read_m(a); self.cpu.set_a(v); self.cpu.set_nz_m(v); self.cpu.cycles = 6; }
            0xA3 => { let a = self.addr_sr(); let v = self.read_m(a); self.cpu.set_a(v); self.cpu.set_nz_m(v); self.cpu.cycles = 4; }
            0xA5 => { let a = self.addr_dp(); let v = self.read_m(a); self.cpu.set_a(v); self.cpu.set_nz_m(v); self.cpu.cycles = 3; }
            0xA7 => { let a = self.addr_dp_ind_long(); let v = self.read_m(a); self.cpu.set_a(v); self.cpu.set_nz_m(v); self.cpu.cycles = 6; }
            0xA9 => { let v = if self.cpu.flag_m() { self.fetch_pc() as u16 } else { self.fetch_pc16() }; self.cpu.set_a(v); self.cpu.set_nz_m(v); self.cpu.cycles = 2; }
            0xAD => { let a = self.addr_abs(); let v = self.read_m(a); self.cpu.set_a(v); self.cpu.set_nz_m(v); self.cpu.cycles = 4; }
            0xAF => { let a = self.addr_long(); let v = self.read_m(a); self.cpu.set_a(v); self.cpu.set_nz_m(v); self.cpu.cycles = 5; }
            0xB1 => { let a = self.addr_dp_ind_y(); let v = self.read_m(a); self.cpu.set_a(v); self.cpu.set_nz_m(v); self.cpu.cycles = 5; }
            0xB2 => { let a = self.addr_dp_ind(); let v = self.read_m(a); self.cpu.set_a(v); self.cpu.set_nz_m(v); self.cpu.cycles = 5; }
            0xB3 => { let a = self.addr_sr_ind_y(); let v = self.read_m(a); self.cpu.set_a(v); self.cpu.set_nz_m(v); self.cpu.cycles = 7; }
            0xB5 => { let a = self.addr_dp_x(); let v = self.read_m(a); self.cpu.set_a(v); self.cpu.set_nz_m(v); self.cpu.cycles = 4; }
            0xB7 => { let a = self.addr_dp_ind_long_y(); let v = self.read_m(a); self.cpu.set_a(v); self.cpu.set_nz_m(v); self.cpu.cycles = 6; }
            0xB9 => { let a = self.addr_abs_y(); let v = self.read_m(a); self.cpu.set_a(v); self.cpu.set_nz_m(v); self.cpu.cycles = 4; }
            0xBD => { let a = self.addr_abs_x(); let v = self.read_m(a); self.cpu.set_a(v); self.cpu.set_nz_m(v); self.cpu.cycles = 4; }
            0xBF => { let a = self.addr_long_x(); let v = self.read_m(a); self.cpu.set_a(v); self.cpu.set_nz_m(v); self.cpu.cycles = 5; }

            // === CMP ===
            0xC1 => { let a = self.addr_dp_ind_x(); let v = self.read_m(a); let r = self.cpu.a_val(); self.op_cmp_m(r, v); self.cpu.cycles = 6; }
            0xC3 => { let a = self.addr_sr(); let v = self.read_m(a); let r = self.cpu.a_val(); self.op_cmp_m(r, v); self.cpu.cycles = 4; }
            0xC5 => { let a = self.addr_dp(); let v = self.read_m(a); let r = self.cpu.a_val(); self.op_cmp_m(r, v); self.cpu.cycles = 3; }
            0xC7 => { let a = self.addr_dp_ind_long(); let v = self.read_m(a); let r = self.cpu.a_val(); self.op_cmp_m(r, v); self.cpu.cycles = 6; }
            0xC9 => { let v = if self.cpu.flag_m() { self.fetch_pc() as u16 } else { self.fetch_pc16() }; let r = self.cpu.a_val(); self.op_cmp_m(r, v); self.cpu.cycles = 2; }
            0xCD => { let a = self.addr_abs(); let v = self.read_m(a); let r = self.cpu.a_val(); self.op_cmp_m(r, v); self.cpu.cycles = 4; }
            0xCF => { let a = self.addr_long(); let v = self.read_m(a); let r = self.cpu.a_val(); self.op_cmp_m(r, v); self.cpu.cycles = 5; }
            0xD1 => { let a = self.addr_dp_ind_y(); let v = self.read_m(a); let r = self.cpu.a_val(); self.op_cmp_m(r, v); self.cpu.cycles = 5; }
            0xD2 => { let a = self.addr_dp_ind(); let v = self.read_m(a); let r = self.cpu.a_val(); self.op_cmp_m(r, v); self.cpu.cycles = 5; }
            0xD3 => { let a = self.addr_sr_ind_y(); let v = self.read_m(a); let r = self.cpu.a_val(); self.op_cmp_m(r, v); self.cpu.cycles = 7; }
            0xD5 => { let a = self.addr_dp_x(); let v = self.read_m(a); let r = self.cpu.a_val(); self.op_cmp_m(r, v); self.cpu.cycles = 4; }
            0xD7 => { let a = self.addr_dp_ind_long_y(); let v = self.read_m(a); let r = self.cpu.a_val(); self.op_cmp_m(r, v); self.cpu.cycles = 6; }
            0xD9 => { let a = self.addr_abs_y(); let v = self.read_m(a); let r = self.cpu.a_val(); self.op_cmp_m(r, v); self.cpu.cycles = 4; }
            0xDD => { let a = self.addr_abs_x(); let v = self.read_m(a); let r = self.cpu.a_val(); self.op_cmp_m(r, v); self.cpu.cycles = 4; }
            0xDF => { let a = self.addr_long_x(); let v = self.read_m(a); let r = self.cpu.a_val(); self.op_cmp_m(r, v); self.cpu.cycles = 5; }

            // === SBC ===
            0xE1 => { let a = self.addr_dp_ind_x(); let v = self.read_m(a); self.op_sbc(v); self.cpu.cycles = 6; }
            0xE3 => { let a = self.addr_sr(); let v = self.read_m(a); self.op_sbc(v); self.cpu.cycles = 4; }
            0xE5 => { let a = self.addr_dp(); let v = self.read_m(a); self.op_sbc(v); self.cpu.cycles = 3; }
            0xE7 => { let a = self.addr_dp_ind_long(); let v = self.read_m(a); self.op_sbc(v); self.cpu.cycles = 6; }
            0xE9 => { let v = if self.cpu.flag_m() { self.fetch_pc() as u16 } else { self.fetch_pc16() }; self.op_sbc(v); self.cpu.cycles = 2; }
            0xED => { let a = self.addr_abs(); let v = self.read_m(a); self.op_sbc(v); self.cpu.cycles = 4; }
            0xEF => { let a = self.addr_long(); let v = self.read_m(a); self.op_sbc(v); self.cpu.cycles = 5; }
            0xF1 => { let a = self.addr_dp_ind_y(); let v = self.read_m(a); self.op_sbc(v); self.cpu.cycles = 5; }
            0xF2 => { let a = self.addr_dp_ind(); let v = self.read_m(a); self.op_sbc(v); self.cpu.cycles = 5; }
            0xF3 => { let a = self.addr_sr_ind_y(); let v = self.read_m(a); self.op_sbc(v); self.cpu.cycles = 7; }
            0xF5 => { let a = self.addr_dp_x(); let v = self.read_m(a); self.op_sbc(v); self.cpu.cycles = 4; }
            0xF7 => { let a = self.addr_dp_ind_long_y(); let v = self.read_m(a); self.op_sbc(v); self.cpu.cycles = 6; }
            0xF9 => { let a = self.addr_abs_y(); let v = self.read_m(a); self.op_sbc(v); self.cpu.cycles = 4; }
            0xFD => { let a = self.addr_abs_x(); let v = self.read_m(a); self.op_sbc(v); self.cpu.cycles = 4; }
            0xFF => { let a = self.addr_long_x(); let v = self.read_m(a); self.op_sbc(v); self.cpu.cycles = 5; }

            // === TSB dp / abs ===
            0x04 => { let a = self.addr_dp(); let v = self.read_m(a); let av = self.cpu.a_val(); self.cpu.set_flag(flags::ZERO, (av & v) == 0); self.write_m(a, v | av); self.cpu.cycles = 5; }
            0x0C => { let a = self.addr_abs(); let v = self.read_m(a); let av = self.cpu.a_val(); self.cpu.set_flag(flags::ZERO, (av & v) == 0); self.write_m(a, v | av); self.cpu.cycles = 6; }
            // === TRB dp / abs ===
            0x14 => { let a = self.addr_dp(); let v = self.read_m(a); let av = self.cpu.a_val(); self.cpu.set_flag(flags::ZERO, (av & v) == 0); self.write_m(a, v & !av); self.cpu.cycles = 5; }
            0x1C => { let a = self.addr_abs(); let v = self.read_m(a); let av = self.cpu.a_val(); self.cpu.set_flag(flags::ZERO, (av & v) == 0); self.write_m(a, v & !av); self.cpu.cycles = 6; }

            // === ASL ===
            0x06 => { let a = self.addr_dp(); let v = self.read_m(a); let r = self.op_asl(v); self.write_m(a, r); self.cpu.cycles = 5; }
            0x0A => { let v = self.cpu.a_val(); let r = self.op_asl(v); self.cpu.set_a(r); self.cpu.cycles = 2; }
            0x0E => { let a = self.addr_abs(); let v = self.read_m(a); let r = self.op_asl(v); self.write_m(a, r); self.cpu.cycles = 6; }
            0x16 => { let a = self.addr_dp_x(); let v = self.read_m(a); let r = self.op_asl(v); self.write_m(a, r); self.cpu.cycles = 6; }
            0x1E => { let a = self.addr_abs_x(); let v = self.read_m(a); let r = self.op_asl(v); self.write_m(a, r); self.cpu.cycles = 7; }
            // === LSR ===
            0x46 => { let a = self.addr_dp(); let v = self.read_m(a); let r = self.op_lsr(v); self.write_m(a, r); self.cpu.cycles = 5; }
            0x4A => { let v = self.cpu.a_val(); let r = self.op_lsr(v); self.cpu.set_a(r); self.cpu.cycles = 2; }
            0x4E => { let a = self.addr_abs(); let v = self.read_m(a); let r = self.op_lsr(v); self.write_m(a, r); self.cpu.cycles = 6; }
            0x56 => { let a = self.addr_dp_x(); let v = self.read_m(a); let r = self.op_lsr(v); self.write_m(a, r); self.cpu.cycles = 6; }
            0x5E => { let a = self.addr_abs_x(); let v = self.read_m(a); let r = self.op_lsr(v); self.write_m(a, r); self.cpu.cycles = 7; }
            // === ROL ===
            0x26 => { let a = self.addr_dp(); let v = self.read_m(a); let r = self.op_rol(v); self.write_m(a, r); self.cpu.cycles = 5; }
            0x2A => { let v = self.cpu.a_val(); let r = self.op_rol(v); self.cpu.set_a(r); self.cpu.cycles = 2; }
            0x2E => { let a = self.addr_abs(); let v = self.read_m(a); let r = self.op_rol(v); self.write_m(a, r); self.cpu.cycles = 6; }
            0x36 => { let a = self.addr_dp_x(); let v = self.read_m(a); let r = self.op_rol(v); self.write_m(a, r); self.cpu.cycles = 6; }
            0x3E => { let a = self.addr_abs_x(); let v = self.read_m(a); let r = self.op_rol(v); self.write_m(a, r); self.cpu.cycles = 7; }
            // === ROR ===
            0x66 => { let a = self.addr_dp(); let v = self.read_m(a); let r = self.op_ror(v); self.write_m(a, r); self.cpu.cycles = 5; }
            0x6A => { let v = self.cpu.a_val(); let r = self.op_ror(v); self.cpu.set_a(r); self.cpu.cycles = 2; }
            0x6E => { let a = self.addr_abs(); let v = self.read_m(a); let r = self.op_ror(v); self.write_m(a, r); self.cpu.cycles = 6; }
            0x76 => { let a = self.addr_dp_x(); let v = self.read_m(a); let r = self.op_ror(v); self.write_m(a, r); self.cpu.cycles = 6; }
            0x7E => { let a = self.addr_abs_x(); let v = self.read_m(a); let r = self.op_ror(v); self.write_m(a, r); self.cpu.cycles = 7; }

            // === DEC memory === (0xC6/0xCE/0xD6/0xDE)
            0xC6 => { let a = self.addr_dp(); let v = self.read_m(a); let r = self.op_dec(v); self.write_m(a, r); self.cpu.cycles = 5; }
            0xCE => { let a = self.addr_abs(); let v = self.read_m(a); let r = self.op_dec(v); self.write_m(a, r); self.cpu.cycles = 6; }
            0xD6 => { let a = self.addr_dp_x(); let v = self.read_m(a); let r = self.op_dec(v); self.write_m(a, r); self.cpu.cycles = 6; }
            0xDE => { let a = self.addr_abs_x(); let v = self.read_m(a); let r = self.op_dec(v); self.write_m(a, r); self.cpu.cycles = 7; }
            // === INC memory === (0xE6/0xEE/0xF6/0xFE)
            0xE6 => { let a = self.addr_dp(); let v = self.read_m(a); let r = self.op_inc(v); self.write_m(a, r); self.cpu.cycles = 5; }
            0xEE => { let a = self.addr_abs(); let v = self.read_m(a); let r = self.op_inc(v); self.write_m(a, r); self.cpu.cycles = 6; }
            0xF6 => { let a = self.addr_dp_x(); let v = self.read_m(a); let r = self.op_inc(v); self.write_m(a, r); self.cpu.cycles = 6; }
            0xFE => { let a = self.addr_abs_x(); let v = self.read_m(a); let r = self.op_inc(v); self.write_m(a, r); self.cpu.cycles = 7; }
            // === INC/DEC A ===
            0x1A => { let v = self.cpu.a_val(); let r = self.op_inc(v); self.cpu.set_a(r); self.cpu.cycles = 2; }
            0x3A => { let v = self.cpu.a_val(); let r = self.op_dec(v); self.cpu.set_a(r); self.cpu.cycles = 2; }

            // === INX/DEX/INY/DEY ===
            0xE8 => { let v = self.cpu.x_val().wrapping_add(1); self.cpu.set_x(v); self.cpu.set_nz_x(self.cpu.x_val()); self.cpu.cycles = 2; }
            0xCA => { let v = self.cpu.x_val().wrapping_sub(1); self.cpu.set_x(v); self.cpu.set_nz_x(self.cpu.x_val()); self.cpu.cycles = 2; }
            0xC8 => { let v = self.cpu.y_val().wrapping_add(1); self.cpu.set_y(v); self.cpu.set_nz_x(self.cpu.y_val()); self.cpu.cycles = 2; }
            0x88 => { let v = self.cpu.y_val().wrapping_sub(1); self.cpu.set_y(v); self.cpu.set_nz_x(self.cpu.y_val()); self.cpu.cycles = 2; }

            // === BIT ===
            0x24 => { let a = self.addr_dp(); let v = self.read_m(a); self.op_bit(v); self.cpu.cycles = 3; }
            0x2C => { let a = self.addr_abs(); let v = self.read_m(a); self.op_bit(v); self.cpu.cycles = 4; }
            0x34 => { let a = self.addr_dp_x(); let v = self.read_m(a); self.op_bit(v); self.cpu.cycles = 4; }
            0x3C => { let a = self.addr_abs_x(); let v = self.read_m(a); self.op_bit(v); self.cpu.cycles = 4; }
            0x89 => {
                // BIT #imm (不影響 N/V)
                let v = if self.cpu.flag_m() { self.fetch_pc() as u16 } else { self.fetch_pc16() };
                self.cpu.set_flag(flags::ZERO, (self.cpu.a_val() & v) == 0);
                self.cpu.cycles = 2;
            }

            // === LDX ===
            0xA2 => { let v = if self.cpu.flag_x() { self.fetch_pc() as u16 } else { self.fetch_pc16() }; self.cpu.set_x(v); self.cpu.set_nz_x(self.cpu.x_val()); self.cpu.cycles = 2; }
            0xA6 => { let a = self.addr_dp(); let v = self.read_x(a); self.cpu.set_x(v); self.cpu.set_nz_x(self.cpu.x_val()); self.cpu.cycles = 3; }
            0xAE => { let a = self.addr_abs(); let v = self.read_x(a); self.cpu.set_x(v); self.cpu.set_nz_x(self.cpu.x_val()); self.cpu.cycles = 4; }
            0xB6 => { let a = self.addr_dp_y(); let v = self.read_x(a); self.cpu.set_x(v); self.cpu.set_nz_x(self.cpu.x_val()); self.cpu.cycles = 4; }
            0xBE => { let a = self.addr_abs_y(); let v = self.read_x(a); self.cpu.set_x(v); self.cpu.set_nz_x(self.cpu.x_val()); self.cpu.cycles = 4; }
            // === LDY ===
            0xA0 => { let v = if self.cpu.flag_x() { self.fetch_pc() as u16 } else { self.fetch_pc16() }; self.cpu.set_y(v); self.cpu.set_nz_x(self.cpu.y_val()); self.cpu.cycles = 2; }
            0xA4 => { let a = self.addr_dp(); let v = self.read_x(a); self.cpu.set_y(v); self.cpu.set_nz_x(self.cpu.y_val()); self.cpu.cycles = 3; }
            0xAC => { let a = self.addr_abs(); let v = self.read_x(a); self.cpu.set_y(v); self.cpu.set_nz_x(self.cpu.y_val()); self.cpu.cycles = 4; }
            0xB4 => { let a = self.addr_dp_x(); let v = self.read_x(a); self.cpu.set_y(v); self.cpu.set_nz_x(self.cpu.y_val()); self.cpu.cycles = 4; }
            0xBC => { let a = self.addr_abs_x(); let v = self.read_x(a); self.cpu.set_y(v); self.cpu.set_nz_x(self.cpu.y_val()); self.cpu.cycles = 4; }

            // === STX ===
            0x86 => { let a = self.addr_dp(); let v = self.cpu.x_val(); self.write_x(a, v); self.cpu.cycles = 3; }
            0x8E => { let a = self.addr_abs(); let v = self.cpu.x_val(); self.write_x(a, v); self.cpu.cycles = 4; }
            0x96 => { let a = self.addr_dp_y(); let v = self.cpu.x_val(); self.write_x(a, v); self.cpu.cycles = 4; }
            // === STY ===
            0x84 => { let a = self.addr_dp(); let v = self.cpu.y_val(); self.write_x(a, v); self.cpu.cycles = 3; }
            0x8C => { let a = self.addr_abs(); let v = self.cpu.y_val(); self.write_x(a, v); self.cpu.cycles = 4; }
            0x94 => { let a = self.addr_dp_x(); let v = self.cpu.y_val(); self.write_x(a, v); self.cpu.cycles = 4; }
            // === STZ ===
            0x64 => { let a = self.addr_dp(); self.write_m(a, 0); self.cpu.cycles = 3; }
            0x74 => { let a = self.addr_dp_x(); self.write_m(a, 0); self.cpu.cycles = 4; }
            0x9C => { let a = self.addr_abs(); self.write_m(a, 0); self.cpu.cycles = 4; }
            0x9E => { let a = self.addr_abs_x(); self.write_m(a, 0); self.cpu.cycles = 5; }

            // === CPX ===
            0xE0 => { let v = if self.cpu.flag_x() { self.fetch_pc() as u16 } else { self.fetch_pc16() }; let r = self.cpu.x_val(); self.op_cmp_x(r, v); self.cpu.cycles = 2; }
            0xE4 => { let a = self.addr_dp(); let v = self.read_x(a); let r = self.cpu.x_val(); self.op_cmp_x(r, v); self.cpu.cycles = 3; }
            0xEC => { let a = self.addr_abs(); let v = self.read_x(a); let r = self.cpu.x_val(); self.op_cmp_x(r, v); self.cpu.cycles = 4; }
            // === CPY ===
            0xC0 => { let v = if self.cpu.flag_x() { self.fetch_pc() as u16 } else { self.fetch_pc16() }; let r = self.cpu.y_val(); self.op_cmp_x(r, v); self.cpu.cycles = 2; }
            0xC4 => { let a = self.addr_dp(); let v = self.read_x(a); let r = self.cpu.y_val(); self.op_cmp_x(r, v); self.cpu.cycles = 3; }
            0xCC => { let a = self.addr_abs(); let v = self.read_x(a); let r = self.cpu.y_val(); self.op_cmp_x(r, v); self.cpu.cycles = 4; }

            // === Branches ===
            0x10 => { let o = self.fetch_pc() as i8; if !self.cpu.flag_n() { self.cpu.pc = self.cpu.pc.wrapping_add(o as u16); } self.cpu.cycles = 2; }
            0x30 => { let o = self.fetch_pc() as i8; if self.cpu.flag_n() { self.cpu.pc = self.cpu.pc.wrapping_add(o as u16); } self.cpu.cycles = 2; }
            0x50 => { let o = self.fetch_pc() as i8; if !self.cpu.flag_v() { self.cpu.pc = self.cpu.pc.wrapping_add(o as u16); } self.cpu.cycles = 2; }
            0x70 => { let o = self.fetch_pc() as i8; if self.cpu.flag_v() { self.cpu.pc = self.cpu.pc.wrapping_add(o as u16); } self.cpu.cycles = 2; }
            0x80 => { let o = self.fetch_pc() as i8; self.cpu.pc = self.cpu.pc.wrapping_add(o as u16); self.cpu.cycles = 3; } // BRA
            0x82 => { let o = self.fetch_pc16() as i16; self.cpu.pc = self.cpu.pc.wrapping_add(o as u16); self.cpu.cycles = 4; } // BRL
            0x90 => { let o = self.fetch_pc() as i8; if !self.cpu.flag_c() { self.cpu.pc = self.cpu.pc.wrapping_add(o as u16); } self.cpu.cycles = 2; }
            0xB0 => { let o = self.fetch_pc() as i8; if self.cpu.flag_c() { self.cpu.pc = self.cpu.pc.wrapping_add(o as u16); } self.cpu.cycles = 2; }
            0xD0 => { let o = self.fetch_pc() as i8; if !self.cpu.flag_z() { self.cpu.pc = self.cpu.pc.wrapping_add(o as u16); } self.cpu.cycles = 2; }
            0xF0 => { let o = self.fetch_pc() as i8; if self.cpu.flag_z() { self.cpu.pc = self.cpu.pc.wrapping_add(o as u16); } self.cpu.cycles = 2; }

            // === JMP ===
            0x4C => { self.cpu.pc = self.fetch_pc16(); self.cpu.cycles = 3; }
            0x5C => { let addr = self.fetch_pc24(); self.cpu.pb = (addr >> 16) as u8; self.cpu.pc = addr as u16; self.cpu.cycles = 4; } // JML
            0x6C => { let addr = self.fetch_pc16(); let lo = self.read(addr as u32) as u16; let hi = self.read(addr.wrapping_add(1) as u32) as u16; self.cpu.pc = lo | (hi << 8); self.cpu.cycles = 5; }
            0x7C => { let addr = self.fetch_pc16().wrapping_add(self.cpu.x_val()); let base = ((self.cpu.pb as u32) << 16) | addr as u32; let lo = self.read(base) as u16; let hi = self.read(base.wrapping_add(1) & 0xFFFFFF) as u16; self.cpu.pc = lo | (hi << 8); self.cpu.cycles = 6; }
            0xDC => { let addr = self.fetch_pc16(); let lo = self.read(addr as u32) as u16; let hi = self.read(addr.wrapping_add(1) as u32) as u16; let bank = self.read(addr.wrapping_add(2) as u32); self.cpu.pb = bank; self.cpu.pc = lo | (hi << 8); self.cpu.cycles = 6; } // JML [abs]

            // === JSR / JSL ===
            0x20 => { let addr = self.fetch_pc16(); self.push16(self.cpu.pc.wrapping_sub(1)); self.cpu.pc = addr; self.cpu.cycles = 6; }
            0x22 => { let addr = self.fetch_pc24(); self.push8(self.cpu.pb); self.push16(self.cpu.pc.wrapping_sub(1)); self.cpu.pb = (addr >> 16) as u8; self.cpu.pc = addr as u16; self.cpu.cycles = 8; } // JSL
            0xFC => { let addr = self.fetch_pc16().wrapping_add(self.cpu.x_val()); self.push16(self.cpu.pc.wrapping_sub(1)); let base = ((self.cpu.pb as u32) << 16) | addr as u32; let lo = self.read(base) as u16; let hi = self.read(base.wrapping_add(1) & 0xFFFFFF) as u16; self.cpu.pc = lo | (hi << 8); self.cpu.cycles = 8; }

            // === RTS / RTL / RTI ===
            0x60 => { self.cpu.pc = self.pull16().wrapping_add(1); self.cpu.cycles = 6; }
            0x6B => { self.cpu.pc = self.pull16().wrapping_add(1); self.cpu.pb = self.pull8(); self.cpu.cycles = 6; }
            0x40 => {
                self.cpu.p = self.pull8();
                self.cpu.pc = self.pull16();
                if !self.cpu.emulation { self.cpu.pb = self.pull8(); }
                self.cpu.update_mode();
                self.cpu.cycles = 6;
            }

            // === Stack ===
            0x08 => { let v = self.cpu.p; self.push8(v); self.cpu.cycles = 3; }     // PHP
            0x0B => { let v = self.cpu.dp; self.push16(v); self.cpu.cycles = 4; }    // PHD
            0x28 => { self.cpu.p = self.pull8(); self.cpu.update_mode(); self.cpu.cycles = 4; } // PLP
            0x2B => { self.cpu.dp = self.pull16(); self.cpu.cycles = 5; }             // PLD
            0x48 => { let v = self.cpu.a_val(); if self.cpu.flag_m() { self.push8(v as u8); } else { self.push16(v); } self.cpu.cycles = 3; } // PHA
            0x4B => { let v = self.cpu.pb; self.push8(v); self.cpu.cycles = 3; }     // PHK
            0x5A => { let v = self.cpu.y_val(); if self.cpu.flag_x() { self.push8(v as u8); } else { self.push16(v); } self.cpu.cycles = 3; } // PHY
            0x68 => { let v = if self.cpu.flag_m() { self.pull8() as u16 } else { self.pull16() }; self.cpu.set_a(v); self.cpu.set_nz_m(self.cpu.a_val()); self.cpu.cycles = 4; } // PLA
            0x7A => { let v = if self.cpu.flag_x() { self.pull8() as u16 } else { self.pull16() }; self.cpu.set_y(v); self.cpu.set_nz_x(self.cpu.y_val()); self.cpu.cycles = 4; } // PLY
            0x8B => { let v = self.cpu.db; self.push8(v); self.cpu.cycles = 3; }     // PHB
            0xAB => { self.cpu.db = self.pull8(); self.cpu.set_flag(flags::ZERO, self.cpu.db == 0); self.cpu.set_flag(flags::NEGATIVE, self.cpu.db & 0x80 != 0); self.cpu.cycles = 4; } // PLB
            0xDA => { let v = self.cpu.x_val(); if self.cpu.flag_x() { self.push8(v as u8); } else { self.push16(v); } self.cpu.cycles = 3; } // PHX
            0xFA => { let v = if self.cpu.flag_x() { self.pull8() as u16 } else { self.pull16() }; self.cpu.set_x(v); self.cpu.set_nz_x(self.cpu.x_val()); self.cpu.cycles = 4; } // PLX

            // === PEA / PEI / PER ===
            0xF4 => { let v = self.fetch_pc16(); self.push16(v); self.cpu.cycles = 5; } // PEA
            0xD4 => { let a = self.addr_dp(); let lo = self.read(a) as u16; let hi = self.read(a.wrapping_add(1) & 0xFFFF) as u16; self.push16(lo | (hi << 8)); self.cpu.cycles = 6; } // PEI
            0x62 => { let o = self.fetch_pc16() as i16; let addr = self.cpu.pc.wrapping_add(o as u16); self.push16(addr); self.cpu.cycles = 6; } // PER

            // === Transfers (source always full 16-bit; destination flag controls write width) ===
            0xAA => { let v = self.cpu.a; self.cpu.set_x(v); self.cpu.set_nz_x(self.cpu.x_val()); self.cpu.cycles = 2; } // TAX
            0xA8 => { let v = self.cpu.a; self.cpu.set_y(v); self.cpu.set_nz_x(self.cpu.y_val()); self.cpu.cycles = 2; } // TAY
            0x8A => { let v = self.cpu.x; self.cpu.set_a(v); self.cpu.set_nz_m(self.cpu.a_val()); self.cpu.cycles = 2; } // TXA
            0x98 => { let v = self.cpu.y; self.cpu.set_a(v); self.cpu.set_nz_m(self.cpu.a_val()); self.cpu.cycles = 2; } // TYA
            0xBA => { let v = self.cpu.sp; self.cpu.set_x(if self.cpu.flag_x() { v & 0xFF } else { v }); self.cpu.set_nz_x(self.cpu.x_val()); self.cpu.cycles = 2; } // TSX
            0x9A => { self.cpu.sp = if self.cpu.emulation { 0x0100 | (self.cpu.x & 0xFF) } else { self.cpu.x }; self.cpu.cycles = 2; } // TXS
            0x9B => { let v = self.cpu.x_val(); self.cpu.set_y(v); self.cpu.set_nz_x(self.cpu.y_val()); self.cpu.cycles = 2; } // TXY
            0xBB => { let v = self.cpu.y_val(); self.cpu.set_x(v); self.cpu.set_nz_x(self.cpu.x_val()); self.cpu.cycles = 2; } // TYX
            0x5B => { self.cpu.dp = self.cpu.a; self.cpu.set_flag(flags::ZERO, self.cpu.dp == 0); self.cpu.set_flag(flags::NEGATIVE, self.cpu.dp & 0x8000 != 0); self.cpu.cycles = 2; } // TCD
            0x7B => { self.cpu.a = self.cpu.dp; self.cpu.set_flag(flags::ZERO, self.cpu.a == 0); self.cpu.set_flag(flags::NEGATIVE, self.cpu.a & 0x8000 != 0); self.cpu.cycles = 2; } // TDC
            0x1B => { self.cpu.sp = if self.cpu.emulation { 0x0100 | (self.cpu.a & 0xFF) } else { self.cpu.a }; self.cpu.cycles = 2; } // TCS
            0x3B => { self.cpu.a = self.cpu.sp; self.cpu.set_flag(flags::ZERO, self.cpu.a == 0); self.cpu.set_flag(flags::NEGATIVE, self.cpu.a & 0x8000 != 0); self.cpu.cycles = 2; } // TSC

            // === XBA ===
            0xEB => {
                let lo = self.cpu.a & 0xFF;
                let hi = (self.cpu.a >> 8) & 0xFF;
                self.cpu.a = (lo << 8) | hi;
                self.cpu.set_flag(flags::ZERO, (self.cpu.a & 0xFF) == 0);
                self.cpu.set_flag(flags::NEGATIVE, self.cpu.a & 0x80 != 0);
                self.cpu.cycles = 3;
            }

            // === Flags ===
            0x18 => { self.cpu.set_flag(flags::CARRY, false); self.cpu.cycles = 2; }   // CLC
            0x38 => { self.cpu.set_flag(flags::CARRY, true); self.cpu.cycles = 2; }    // SEC
            0x58 => { self.cpu.set_flag(flags::IRQ_DIS, false); self.cpu.cycles = 2; } // CLI
            0x78 => { self.cpu.set_flag(flags::IRQ_DIS, true); self.cpu.cycles = 2; }  // SEI
            0xD8 => { self.cpu.set_flag(flags::DECIMAL, false); self.cpu.cycles = 2; } // CLD
            0xF8 => { self.cpu.set_flag(flags::DECIMAL, true); self.cpu.cycles = 2; }  // SED
            0xB8 => { self.cpu.set_flag(flags::OVERFLOW, false); self.cpu.cycles = 2; }// CLV

            // === REP / SEP ===
            0xC2 => {
                let mask = self.fetch_pc();
                self.cpu.p &= !mask;
                self.cpu.update_mode();
                self.cpu.cycles = 3;
            }
            0xE2 => {
                let mask = self.fetch_pc();
                self.cpu.p |= mask;
                self.cpu.update_mode();
                self.cpu.cycles = 3;
            }

            // === XCE (Exchange Carry and Emulation) ===
            0xFB => {
                let old_e = self.cpu.emulation;
                self.cpu.emulation = self.cpu.flag_c();
                self.cpu.set_flag(flags::CARRY, old_e);
                self.cpu.update_mode();
                self.cpu.cycles = 2;
            }

            // === MVP / MVN (Block Move) ===
            0x44 => {
                // MVP: Move Previous (decrementing)
                let dst_bank = self.fetch_pc();
                let src_bank = self.fetch_pc();
                self.cpu.db = dst_bank;
                let src = ((src_bank as u32) << 16) | self.cpu.x_val() as u32;
                let dst = ((dst_bank as u32) << 16) | self.cpu.y_val() as u32;
                let val = self.read(src);
                self.write(dst, val);
                self.cpu.set_x(self.cpu.x_val().wrapping_sub(1));
                self.cpu.set_y(self.cpu.y_val().wrapping_sub(1));
                self.cpu.a = self.cpu.a.wrapping_sub(1);
                if self.cpu.a != 0xFFFF { self.cpu.pc = self.cpu.pc.wrapping_sub(3); }
                self.cpu.cycles = 7;
            }
            0x54 => {
                // MVN: Move Next (incrementing)
                let dst_bank = self.fetch_pc();
                let src_bank = self.fetch_pc();
                self.cpu.db = dst_bank;
                let src = ((src_bank as u32) << 16) | self.cpu.x_val() as u32;
                let dst = ((dst_bank as u32) << 16) | self.cpu.y_val() as u32;
                let val = self.read(src);
                self.write(dst, val);
                self.cpu.set_x(self.cpu.x_val().wrapping_add(1));
                self.cpu.set_y(self.cpu.y_val().wrapping_add(1));
                self.cpu.a = self.cpu.a.wrapping_sub(1);
                if self.cpu.a != 0xFFFF { self.cpu.pc = self.cpu.pc.wrapping_sub(3); }
                self.cpu.cycles = 7;
            }

            // === NOP / WDM / WAI / STP ===
            0xEA => { self.cpu.cycles = 2; } // NOP
            0x42 => { self.fetch_pc(); self.cpu.cycles = 2; } // WDM (2-byte NOP)
            0xCB => { self.cpu.waiting = true; self.cpu.cycles = 3; } // WAI
            0xDB => { self.cpu.stopped = true; self.cpu.cycles = 3; } // STP

            // 未對應的 opcode 作為 NOP 處理
            _ => { self.cpu.cycles = 2; }
        }
    }

    // ================================================================
    // Shift/Rotate/Inc/Dec 輔助
    // ================================================================

    fn op_asl(&mut self, val: u16) -> u16 {
        if self.cpu.flag_m() {
            self.cpu.set_flag(flags::CARRY, val & 0x80 != 0);
            let r = (val << 1) & 0xFF;
            self.cpu.set_nz_m(r);
            r
        } else {
            self.cpu.set_flag(flags::CARRY, val & 0x8000 != 0);
            let r = val << 1;
            self.cpu.set_nz_m(r);
            r
        }
    }

    fn op_lsr(&mut self, val: u16) -> u16 {
        self.cpu.set_flag(flags::CARRY, val & 0x01 != 0);
        let r = if self.cpu.flag_m() { (val >> 1) & 0xFF } else { val >> 1 };
        self.cpu.set_nz_m(r);
        r
    }

    fn op_rol(&mut self, val: u16) -> u16 {
        let c = self.cpu.flag_c() as u16;
        if self.cpu.flag_m() {
            self.cpu.set_flag(flags::CARRY, val & 0x80 != 0);
            let r = ((val << 1) | c) & 0xFF;
            self.cpu.set_nz_m(r);
            r
        } else {
            self.cpu.set_flag(flags::CARRY, val & 0x8000 != 0);
            let r = (val << 1) | c;
            self.cpu.set_nz_m(r);
            r
        }
    }

    fn op_ror(&mut self, val: u16) -> u16 {
        let c = self.cpu.flag_c() as u16;
        self.cpu.set_flag(flags::CARRY, val & 0x01 != 0);
        if self.cpu.flag_m() {
            let r = ((val >> 1) | (c << 7)) & 0xFF;
            self.cpu.set_nz_m(r);
            r
        } else {
            let r = (val >> 1) | (c << 15);
            self.cpu.set_nz_m(r);
            r
        }
    }

    fn op_inc(&mut self, val: u16) -> u16 {
        let r = if self.cpu.flag_m() { (val.wrapping_add(1)) & 0xFF } else { val.wrapping_add(1) };
        self.cpu.set_nz_m(r);
        r
    }

    fn op_dec(&mut self, val: u16) -> u16 {
        let r = if self.cpu.flag_m() { (val.wrapping_sub(1)) & 0xFF } else { val.wrapping_sub(1) };
        self.cpu.set_nz_m(r);
        r
    }

    fn op_bit(&mut self, val: u16) {
        let a = self.cpu.a_val();
        self.cpu.set_flag(flags::ZERO, (a & val) == 0);
        if self.cpu.flag_m() {
            self.cpu.set_flag(flags::NEGATIVE, val & 0x80 != 0);
            self.cpu.set_flag(flags::OVERFLOW, val & 0x40 != 0);
        } else {
            self.cpu.set_flag(flags::NEGATIVE, val & 0x8000 != 0);
            self.cpu.set_flag(flags::OVERFLOW, val & 0x4000 != 0);
        }
    }

    // ================================================================
    // WASM 介面
    // ================================================================

    pub fn set_button(&mut self, controller: u8, button: u8, pressed: bool) {
        match controller {
            0 => self.ctrl1.set_button(button, pressed),
            1 => self.ctrl2.set_button(button, pressed),
            _ => {}
        }
    }

    pub fn set_audio_sample_rate(&mut self, rate: f64) {
        self.apu.set_sample_rate(rate);
    }

    pub fn get_frame_buffer_ptr(&self) -> *const u8 {
        self.ppu.framebuffer.as_ptr()
    }

    pub fn get_frame_buffer_len(&self) -> usize {
        self.ppu.framebuffer.len()
    }

    pub fn get_audio_buffer_ptr(&self) -> *const f32 {
        self.apu.get_audio_buffer_ptr()
    }

    pub fn get_audio_buffer_len(&self) -> usize {
        self.apu.get_audio_buffer_len()
    }

    pub fn consume_audio_samples(&mut self) -> usize {
        self.apu.consume_audio_samples()
    }

    pub fn export_save_state(&self) -> String {
        let mut buf: Vec<u8> = Vec::with_capacity(256 * 1024);

        // Magic + version
        buf.extend_from_slice(b"SNES");
        buf.push(1);

        // CPU state (20 bytes)
        buf.extend_from_slice(&self.cpu.a.to_le_bytes());
        buf.extend_from_slice(&self.cpu.x.to_le_bytes());
        buf.extend_from_slice(&self.cpu.y.to_le_bytes());
        buf.extend_from_slice(&self.cpu.sp.to_le_bytes());
        buf.extend_from_slice(&self.cpu.dp.to_le_bytes());
        buf.push(self.cpu.db);
        buf.push(self.cpu.pb);
        buf.push(self.cpu.p);
        buf.extend_from_slice(&self.cpu.pc.to_le_bytes());
        buf.push(self.cpu.emulation as u8);
        buf.push(self.cpu.nmi_pending as u8);
        buf.push(self.cpu.irq_pending as u8);
        buf.push(self.cpu.waiting as u8);
        buf.push(self.cpu.stopped as u8);

        // Emulator registers
        buf.push(self.nmitimen);
        buf.push(self.wrio);
        buf.push(self.wrmpya);
        buf.push(self.wrmpyb);
        buf.extend_from_slice(&self.wrdivl.to_le_bytes());
        buf.push(self.wrdivb);
        buf.extend_from_slice(&self.htime.to_le_bytes());
        buf.extend_from_slice(&self.vtime.to_le_bytes());
        buf.push(self.rdnmi);
        buf.push(self.timeup);
        buf.push(self.hvbjoy);
        buf.extend_from_slice(&self.rddiv.to_le_bytes());
        buf.extend_from_slice(&self.rdmpy.to_le_bytes());
        buf.push(self.auto_joypad_read as u8);
        buf.extend_from_slice(&self.wram_addr.to_le_bytes());
        buf.push(self.open_bus);
        buf.push(self.irq_pending as u8);
        buf.extend_from_slice(&self.frame_count.to_le_bytes());

        // WRAM (128KB)
        buf.extend_from_slice(&self.wram);

        // SRAM
        let sram_len = self.cart.sram.len() as u32;
        buf.extend_from_slice(&sram_len.to_le_bytes());
        buf.extend_from_slice(&self.cart.sram);

        // PPU state
        buf.extend_from_slice(&self.ppu.vram);
        buf.extend_from_slice(&self.ppu.oam);
        for &c in &self.ppu.cgram {
            buf.extend_from_slice(&c.to_le_bytes());
        }
        buf.extend_from_slice(&self.ppu.vram_addr.to_le_bytes());
        buf.extend_from_slice(&self.ppu.vram_increment.to_le_bytes());
        buf.push(self.ppu.vram_mapping);
        buf.push(self.ppu.vram_incmode as u8);
        buf.extend_from_slice(&self.ppu.vram_prefetch.to_le_bytes());
        buf.extend_from_slice(&self.ppu.oam_addr.to_le_bytes());
        buf.extend_from_slice(&self.ppu.oam_addr_reload.to_le_bytes());
        buf.push(self.ppu.oam_latch);
        buf.push(self.ppu.oam_priority as u8);
        buf.push(self.ppu.cgram_addr);
        buf.push(self.ppu.cgram_latch);
        buf.push(self.ppu.cgram_flipflop as u8);
        buf.push(self.ppu.bg_mode);
        buf.push(self.ppu.bg3_priority as u8);
        for i in 0..4 {
            buf.extend_from_slice(&self.ppu.bg_tilemap_addr[i].to_le_bytes());
            buf.push(self.ppu.bg_tilemap_size[i]);
            buf.extend_from_slice(&self.ppu.bg_chr_addr[i].to_le_bytes());
            buf.push(self.ppu.bg_tile_size[i] as u8);
            buf.extend_from_slice(&self.ppu.bg_hscroll[i].to_le_bytes());
            buf.extend_from_slice(&self.ppu.bg_vscroll[i].to_le_bytes());
        }
        buf.push(self.ppu.scroll_latch);
        buf.push(self.ppu.scroll_latch2);
        buf.extend_from_slice(&(self.ppu.m7a as u16).to_le_bytes());
        buf.extend_from_slice(&(self.ppu.m7b as u16).to_le_bytes());
        buf.extend_from_slice(&(self.ppu.m7c as u16).to_le_bytes());
        buf.extend_from_slice(&(self.ppu.m7d as u16).to_le_bytes());
        buf.extend_from_slice(&(self.ppu.m7hofs as u16).to_le_bytes());
        buf.extend_from_slice(&(self.ppu.m7vofs as u16).to_le_bytes());
        buf.extend_from_slice(&(self.ppu.m7x as u16).to_le_bytes());
        buf.extend_from_slice(&(self.ppu.m7y as u16).to_le_bytes());
        buf.push(self.ppu.m7_latch);
        buf.push(self.ppu.m7_flipflop as u8);
        buf.push(self.ppu.m7_low_buffer);
        buf.push(self.ppu.m7_mult_b as u8);
        buf.push(self.ppu.m7sel);
        for i in 0..4 { buf.push(self.ppu.wh[i]); }
        buf.push(self.ppu.w12sel);
        buf.push(self.ppu.w34sel);
        buf.push(self.ppu.wobjsel);
        buf.push(self.ppu.wbglog);
        buf.push(self.ppu.wobjlog);
        buf.push(self.ppu.tm);
        buf.push(self.ppu.ts);
        buf.push(self.ppu.tmw);
        buf.push(self.ppu.tsw);
        buf.push(self.ppu.cgwsel);
        buf.push(self.ppu.cgadsub);
        buf.push(self.ppu.fixed_color_r);
        buf.push(self.ppu.fixed_color_g);
        buf.push(self.ppu.fixed_color_b);
        buf.push(self.ppu.brightness);
        buf.push(self.ppu.force_blank as u8);
        buf.push(self.ppu.obj_size);
        buf.extend_from_slice(&self.ppu.obj_base.to_le_bytes());
        buf.extend_from_slice(&self.ppu.obj_name_select.to_le_bytes());
        buf.push(self.ppu.setini);
        buf.extend_from_slice(&self.ppu.scanline.to_le_bytes());
        buf.push(self.ppu.nmi_flag as u8);
        buf.push(self.ppu.nmi_enabled as u8);
        buf.push(self.ppu.vblank_flag as u8);

        // APU state
        buf.push(self.apu.a);
        buf.push(self.apu.x);
        buf.push(self.apu.y);
        buf.push(self.apu.sp);
        buf.extend_from_slice(&self.apu.pc.to_le_bytes());
        buf.push(self.apu.psw);
        buf.extend_from_slice(&self.apu.ram);
        for i in 0..4 { buf.push(self.apu.ports_from_cpu[i]); }
        for i in 0..4 { buf.push(self.apu.ports_from_spc[i]); }
        for i in 0..3 { buf.push(self.apu.timer_target[i]); }
        for i in 0..3 { buf.push(self.apu.timer_counter[i]); }
        for i in 0..3 { buf.extend_from_slice(&self.apu.timer_divider[i].to_le_bytes()); }
        for i in 0..3 { buf.push(self.apu.timer_enabled[i] as u8); }
        buf.push(self.apu.dsp_addr);
        buf.push(self.apu.control);
        buf.extend_from_slice(&self.apu.cycles.to_le_bytes());
        buf.extend_from_slice(&self.apu.total_cycles.to_le_bytes());

        // DMA state
        buf.push(self.dma.dma_enable);
        buf.push(self.dma.hdma_enable);
        for ch in &self.dma.channels {
            buf.push(ch.control);
            buf.push(ch.b_addr);
            buf.extend_from_slice(&ch.a_addr.to_le_bytes());
            buf.push(ch.a_bank);
            buf.extend_from_slice(&ch.count.to_le_bytes());
            buf.push(ch.hdma_bank);
            buf.extend_from_slice(&ch.hdma_addr.to_le_bytes());
            buf.push(ch.hdma_line_counter);
            buf.extend_from_slice(&ch.indirect_addr.to_le_bytes());
            buf.push(ch.hdma_do_transfer as u8);
            buf.push(ch.hdma_completed as u8);
        }

        // Encode to base64
        Self::encode_base64(&buf)
    }

    pub fn import_save_state(&mut self, data: &str) -> bool {
        let buf = match Self::decode_base64(data.trim()) {
            Some(b) => b,
            None => return false,
        };

        let mut pos = 0usize;
        macro_rules! read_u8 { () => { { if pos >= buf.len() { return false; } let v = buf[pos]; pos += 1; v } } }
        macro_rules! read_u16 { () => { { if pos + 1 >= buf.len() { return false; } let v = u16::from_le_bytes([buf[pos], buf[pos+1]]); pos += 2; v } } }
        macro_rules! read_u32 { () => { { if pos + 3 >= buf.len() { return false; } let v = u32::from_le_bytes([buf[pos], buf[pos+1], buf[pos+2], buf[pos+3]]); pos += 4; v } } }
        macro_rules! read_u64 { () => { { if pos + 7 >= buf.len() { return false; } let v = u64::from_le_bytes([buf[pos], buf[pos+1], buf[pos+2], buf[pos+3], buf[pos+4], buf[pos+5], buf[pos+6], buf[pos+7]]); pos += 8; v } } }
        macro_rules! read_bytes { ($n:expr) => { { if pos + $n > buf.len() { return false; } let s = &buf[pos..pos+$n]; pos += $n; s } } }

        // Magic + version
        if read_bytes!(4) != b"SNES" { return false; }
        if read_u8!() != 1 { return false; }

        // CPU
        self.cpu.a = read_u16!();
        self.cpu.x = read_u16!();
        self.cpu.y = read_u16!();
        self.cpu.sp = read_u16!();
        self.cpu.dp = read_u16!();
        self.cpu.db = read_u8!();
        self.cpu.pb = read_u8!();
        self.cpu.p = read_u8!();
        self.cpu.pc = read_u16!();
        self.cpu.emulation = read_u8!() != 0;
        self.cpu.nmi_pending = read_u8!() != 0;
        self.cpu.irq_pending = read_u8!() != 0;
        self.cpu.waiting = read_u8!() != 0;
        self.cpu.stopped = read_u8!() != 0;

        // Emulator registers
        self.nmitimen = read_u8!();
        self.wrio = read_u8!();
        self.wrmpya = read_u8!();
        self.wrmpyb = read_u8!();
        self.wrdivl = read_u16!();
        self.wrdivb = read_u8!();
        self.htime = read_u16!();
        self.vtime = read_u16!();
        self.rdnmi = read_u8!();
        self.timeup = read_u8!();
        self.hvbjoy = read_u8!();
        self.rddiv = read_u16!();
        self.rdmpy = read_u16!();
        self.auto_joypad_read = read_u8!() != 0;
        self.wram_addr = read_u32!();
        self.open_bus = read_u8!();
        self.irq_pending = read_u8!() != 0;
        self.frame_count = read_u32!();

        // WRAM
        let wram_slice = read_bytes!(0x20000);
        self.wram[..0x20000].copy_from_slice(wram_slice);

        // SRAM
        let sram_len = read_u32!() as usize;
        if sram_len > 0 && sram_len <= buf.len() - pos {
            let sram_slice = read_bytes!(sram_len);
            if sram_len <= self.cart.sram.len() {
                self.cart.sram[..sram_len].copy_from_slice(sram_slice);
            }
        }

        // PPU
        let vram_slice = read_bytes!(0x10000);
        self.ppu.vram.copy_from_slice(vram_slice);
        let oam_slice = read_bytes!(544);
        self.ppu.oam.copy_from_slice(oam_slice);
        for i in 0..256 {
            self.ppu.cgram[i] = read_u16!();
        }
        self.ppu.vram_addr = read_u16!();
        self.ppu.vram_increment = read_u16!();
        self.ppu.vram_mapping = read_u8!();
        self.ppu.vram_incmode = read_u8!() != 0;
        self.ppu.vram_prefetch = read_u16!();
        self.ppu.oam_addr = read_u16!();
        self.ppu.oam_addr_reload = read_u16!();
        self.ppu.oam_latch = read_u8!();
        self.ppu.oam_priority = read_u8!() != 0;
        self.ppu.cgram_addr = read_u8!();
        self.ppu.cgram_latch = read_u8!();
        self.ppu.cgram_flipflop = read_u8!() != 0;
        self.ppu.bg_mode = read_u8!();
        self.ppu.bg3_priority = read_u8!() != 0;
        for i in 0..4 {
            self.ppu.bg_tilemap_addr[i] = read_u16!();
            self.ppu.bg_tilemap_size[i] = read_u8!();
            self.ppu.bg_chr_addr[i] = read_u16!();
            self.ppu.bg_tile_size[i] = read_u8!() != 0;
            self.ppu.bg_hscroll[i] = read_u16!();
            self.ppu.bg_vscroll[i] = read_u16!();
        }
        self.ppu.scroll_latch = read_u8!();
        self.ppu.scroll_latch2 = read_u8!();
        self.ppu.m7a = read_u16!() as i16;
        self.ppu.m7b = read_u16!() as i16;
        self.ppu.m7c = read_u16!() as i16;
        self.ppu.m7d = read_u16!() as i16;
        self.ppu.m7hofs = read_u16!() as i16;
        self.ppu.m7vofs = read_u16!() as i16;
        self.ppu.m7x = read_u16!() as i16;
        self.ppu.m7y = read_u16!() as i16;
        self.ppu.m7_latch = read_u8!();
        self.ppu.m7_flipflop = read_u8!() != 0;
        self.ppu.m7_low_buffer = read_u8!();
        self.ppu.m7_mult_b = read_u8!() as i8;
        self.ppu.m7sel = read_u8!();
        for i in 0..4 { self.ppu.wh[i] = read_u8!(); }
        self.ppu.w12sel = read_u8!();
        self.ppu.w34sel = read_u8!();
        self.ppu.wobjsel = read_u8!();
        self.ppu.wbglog = read_u8!();
        self.ppu.wobjlog = read_u8!();
        self.ppu.tm = read_u8!();
        self.ppu.ts = read_u8!();
        self.ppu.tmw = read_u8!();
        self.ppu.tsw = read_u8!();
        self.ppu.cgwsel = read_u8!();
        self.ppu.cgadsub = read_u8!();
        self.ppu.fixed_color_r = read_u8!();
        self.ppu.fixed_color_g = read_u8!();
        self.ppu.fixed_color_b = read_u8!();
        self.ppu.brightness = read_u8!();
        self.ppu.force_blank = read_u8!() != 0;
        self.ppu.obj_size = read_u8!();
        self.ppu.obj_base = read_u16!();
        self.ppu.obj_name_select = read_u16!();
        self.ppu.setini = read_u8!();
        self.ppu.scanline = read_u16!();
        self.ppu.nmi_flag = read_u8!() != 0;
        self.ppu.nmi_enabled = read_u8!() != 0;
        self.ppu.vblank_flag = read_u8!() != 0;

        // APU
        self.apu.a = read_u8!();
        self.apu.x = read_u8!();
        self.apu.y = read_u8!();
        self.apu.sp = read_u8!();
        self.apu.pc = read_u16!();
        self.apu.psw = read_u8!();
        let apu_ram = read_bytes!(65536);
        self.apu.ram[..65536].copy_from_slice(apu_ram);
        for i in 0..4 { self.apu.ports_from_cpu[i] = read_u8!(); }
        for i in 0..4 { self.apu.ports_from_spc[i] = read_u8!(); }
        for i in 0..3 { self.apu.timer_target[i] = read_u8!(); }
        for i in 0..3 { self.apu.timer_counter[i] = read_u8!(); }
        for i in 0..3 { self.apu.timer_divider[i] = read_u16!(); }
        for i in 0..3 { self.apu.timer_enabled[i] = read_u8!() != 0; }
        self.apu.dsp_addr = read_u8!();
        self.apu.control = read_u8!();
        self.apu.cycles = read_u32!();
        self.apu.total_cycles = read_u64!();

        // DMA
        self.dma.dma_enable = read_u8!();
        self.dma.hdma_enable = read_u8!();
        for ch in &mut self.dma.channels {
            ch.control = read_u8!();
            ch.b_addr = read_u8!();
            ch.a_addr = read_u16!();
            ch.a_bank = read_u8!();
            ch.count = read_u16!();
            ch.hdma_bank = read_u8!();
            ch.hdma_addr = read_u16!();
            ch.hdma_line_counter = read_u8!();
            ch.indirect_addr = read_u16!();
            ch.hdma_do_transfer = read_u8!() != 0;
            ch.hdma_completed = read_u8!() != 0;
        }

        // Restore DSP registers from APU RAM
        self.apu.restore_dsp_from_ram();

        true
    }

    pub fn encode_base64(data: &[u8]) -> String {
        const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
        let chunks = data.chunks(3);
        for chunk in chunks {
            let b0 = chunk[0] as u32;
            let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
            let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
            let n = (b0 << 16) | (b1 << 8) | b2;
            result.push(TABLE[((n >> 18) & 0x3F) as usize] as char);
            result.push(TABLE[((n >> 12) & 0x3F) as usize] as char);
            if chunk.len() > 1 {
                result.push(TABLE[((n >> 6) & 0x3F) as usize] as char);
            } else {
                result.push('=');
            }
            if chunk.len() > 2 {
                result.push(TABLE[(n & 0x3F) as usize] as char);
            } else {
                result.push('=');
            }
        }
        result
    }

    pub fn decode_base64(data: &str) -> Option<Vec<u8>> {
        let mut result = Vec::with_capacity(data.len() * 3 / 4);
        let bytes = data.as_bytes();
        let len = bytes.len();
        if len % 4 != 0 { return None; }

        for i in (0..len).step_by(4) {
            let a = Self::b64_val(bytes[i])?;
            let b = Self::b64_val(bytes[i + 1])?;
            let c = if bytes[i + 2] == b'=' { 0 } else { Self::b64_val(bytes[i + 2])? };
            let d = if bytes[i + 3] == b'=' { 0 } else { Self::b64_val(bytes[i + 3])? };
            let n = (a << 18) | (b << 12) | (c << 6) | d;
            result.push((n >> 16) as u8);
            if bytes[i + 2] != b'=' { result.push((n >> 8) as u8); }
            if bytes[i + 3] != b'=' { result.push(n as u8); }
        }
        Some(result)
    }

    pub fn b64_val(c: u8) -> Option<u32> {
        match c {
            b'A'..=b'Z' => Some((c - b'A') as u32),
            b'a'..=b'z' => Some((c - b'a' + 26) as u32),
            b'0'..=b'9' => Some((c - b'0' + 52) as u32),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }

    /// Debug: 讀取記憶體
    pub fn debug_read_mem(&mut self, bank: u8, addr: u16, count: u16) -> String {
        let mut bytes = Vec::new();
        for i in 0..count {
            let a = addr.wrapping_add(i);
            let val = self.bus_read(bank, a);
            bytes.push(format!("{:02X}", val));
        }
        format!("{:02X}:{:04X}: {}", bank, addr, bytes.join(" "))
    }

    /// Debug: 取得 CPU/PPU 狀態
    pub fn debug_state(&self) -> String {
        // Bytes at PC (next 8 bytes for instruction decode)
        let mut pc_bytes = String::new();
        for i in 0..8u16 {
            let addr = ((self.cpu.pb as u32) << 16) | self.cpu.pc.wrapping_add(i) as u32;
            let bank = (addr >> 16) as u8;
            let a = addr as u16;
            // Direct ROM/WRAM read without side effects
            let eff = bank & 0x7F;
            let b = if bank == 0x7E || bank == 0x7F {
                let offset = (bank as usize - 0x7E) * 0x10000 + a as usize;
                if offset < self.wram.len() { self.wram[offset] } else { 0 }
            } else if eff >= 0x40 {
                // HiROM banks $40-$7D/$C0-$FD: full 64KB is ROM
                // (banks $FE/$FF also land here after WRAM check above)
                self.cart.read_rom(bank, a)
            } else if a >= 0x8000 {
                // System banks $00-$3F/$80-$BF: upper half is ROM
                self.cart.read_rom(bank, a)
            } else if a < 0x2000 {
                // System banks: low WRAM mirror
                self.wram[a as usize]
            } else { 0 };
            pc_bytes.push_str(&format!("{:02X} ", b));
        }

        // Stack dump: 8 bytes above SP (the most recent pushes)
        let mut stack_bytes = String::new();
        for i in 1..=8u16 {
            let addr = self.cpu.sp.wrapping_add(i) as usize;
            if addr < self.wram.len() {
                stack_bytes.push_str(&format!("{:02X} ", self.wram[addr]));
            }
        }

        // BRK origin info
        let brk_info = match self.brk_origin {
            Some((pb, pc)) => format!("BRK CRASH at {:02X}:{:04X}", pb, pc),
            None => String::from("No BRK"),
        };

        // Debug trap info
        let trap_info = if self.debug_trap_log.is_empty() {
            String::from("No trap")
        } else {
            self.debug_trap_log.clone()
        };

        let result = format!(
            "CPU: PC={:02X}:{:04X} A={:04X} X={:04X} Y={:04X} SP={:04X} P={:02X} DP={:04X} DB={:02X} E={} cyc={} stopped={} waiting={}\n\
             Bytes@PC: {}\n\
             Stack@SP+1: {}\n\
             {}\n\
             PPU: force_blank={} brightness={} scanline={} vblank={} mode={}\n\
             M7: a={} b={} c={} d={} hofs={} vofs={} cx={} cy={} sel={:02X}\n\
             HDMA: enable={:02X} ch_info=[{}]\n\
             Cart: loaded={} map={:?} title={} has_dsp1={}\n\
             DSP1: present={} phase={:?}\n\
             NMITIMEN={:02X} RDNMI={:02X} HVBJOY={:02X} HTIME={} VTIME={}\n\
             APU: PC={:04X} A={:02X} X={:02X} Y={:02X} SP={:02X} PSW={:02X} ctrl={:02X}\n\
             APU Ports: from_cpu=[{:02X},{:02X},{:02X},{:02X}] from_spc=[{:02X},{:02X},{:02X},{:02X}]\n\
             APU cycles={} total_cycles={}\n\
             Frame={}\n\
             {}",
            self.cpu.pb, self.cpu.pc, self.cpu.a, self.cpu.x, self.cpu.y,
            self.cpu.sp, self.cpu.p, self.cpu.dp, self.cpu.db,
            self.cpu.emulation, self.cpu.cycles, self.cpu.stopped, self.cpu.waiting,
            pc_bytes.trim(),
            stack_bytes.trim(),
            brk_info,
            self.ppu.force_blank, self.ppu.brightness, self.ppu.scanline,
            self.ppu.vblank_flag, self.ppu.bg_mode,
            self.ppu.m7a, self.ppu.m7b, self.ppu.m7c, self.ppu.m7d,
            self.ppu.m7hofs, self.ppu.m7vofs, self.ppu.m7x, self.ppu.m7y, self.ppu.m7sel,
            self.dma.hdma_enable,
            {
                let mut hdma_info = String::new();
                for i in 0..8 {
                    if self.dma.hdma_enable & (1 << i) != 0 {
                        let ch = &self.dma.channels[i];
                        hdma_info.push_str(&format!(
                            "ch{}(b={:02X} tm={} ind={} abank={:02X} hbank={:02X} addr={:04X} iaddr={:04X} cnt={:04X} lc={:02X} done={}) ",
                            i, ch.b_addr, ch.transfer_mode(), ch.hdma_indirect() as u8,
                            ch.a_bank, ch.hdma_bank, ch.hdma_addr, ch.indirect_addr, ch.count, ch.hdma_line_counter, ch.hdma_completed as u8
                        ));
                    }
                }
                if hdma_info.is_empty() { hdma_info.push_str("none"); }
                hdma_info
            },
            self.cart.loaded, self.cart.map_mode, self.cart.title, self.cart.has_dsp1,
            self.dsp1.present, self.dsp1.phase_name(),
            self.nmitimen, self.rdnmi, self.hvbjoy, self.htime, self.vtime,
            self.apu.pc, self.apu.a, self.apu.x, self.apu.y, self.apu.sp, self.apu.psw, self.apu.control,
            self.apu.ports_from_cpu[0], self.apu.ports_from_cpu[1],
            self.apu.ports_from_cpu[2], self.apu.ports_from_cpu[3],
            self.apu.ports_from_spc[0], self.apu.ports_from_spc[1],
            self.apu.ports_from_spc[2], self.apu.ports_from_spc[3],
            self.apu.cycles, self.apu.total_cycles,
            self.frame_count,
            trap_info,
        );

        result
    }

    /// Debug: 渲染後 dump 指定掃描線的 main/sub 層和優先級
    pub fn debug_scanline_layers(&self, y: u16, x_start: u16, x_end: u16) -> String {
        self.ppu.debug_scanline_layers(y, x_start, x_end, self.ppu.bg_mode, self.ppu.tm, self.ppu.ts, self.ppu.cgadsub, self.ppu.cgwsel)
    }

    /// Debug: 取得 PPU Color Math / Window 狀態 (用於診斷黑屏)
    pub fn debug_ppu_color_state(&self) -> String {
        let clip_mode = (self.ppu.cgwsel >> 6) & 0x03;
        let prevent_mode = (self.ppu.cgwsel >> 4) & 0x03;
        let sub_screen_src = if self.ppu.cgwsel & 0x02 != 0 { "fixed" } else { "sub" };
        let subtract = self.ppu.cgadsub & 0x80 != 0;
        let half = self.ppu.cgadsub & 0x40 != 0;
        let math_layers = self.ppu.cgadsub & 0x3F;

        format!(
            "CGWSEL={:02X} clip={} prevent={} src={} | CGADSUB={:02X} sub={} half={} layers={:06b}\n\
             TM={:02X} TS={:02X} TMW={:02X} TSW={:02X}\n\
             W12SEL={:02X} W34SEL={:02X} WOBJSEL={:02X}\n\
             WH=[{},{},{},{}] WBGLOG={:02X} WOBJLOG={:02X}\n\
             Brightness={} ForceBlank={} Mode={} BG3Pri={}\n\
             FixedColor=({},{},{}) CGRAM[0]={:04X}\n\
             Frame={}",
            self.ppu.cgwsel, clip_mode, prevent_mode, sub_screen_src,
            self.ppu.cgadsub, subtract, half, math_layers,
            self.ppu.tm, self.ppu.ts, self.ppu.tmw, self.ppu.tsw,
            self.ppu.w12sel, self.ppu.w34sel, self.ppu.wobjsel,
            self.ppu.wh[0], self.ppu.wh[1], self.ppu.wh[2], self.ppu.wh[3],
            self.ppu.wbglog, self.ppu.wobjlog,
            self.ppu.brightness, self.ppu.force_blank, self.ppu.bg_mode, self.ppu.bg3_priority,
            self.ppu.fixed_color_r, self.ppu.fixed_color_g, self.ppu.fixed_color_b,
            self.ppu.cgram[0],
            self.frame_count,
        )
    }

    /// Debug: dump DSP voices state
    pub fn debug_dsp_voices(&self) -> String {
        let dsp = &self.apu.dsp;
        let mut out = format!(
            "DSP: mvol_l={} mvol_r={} evol_l={} evol_r={} kon={:02X} koff={:02X} flg={:02X}\n\
             NON={:02X} PMON={:02X} EON={:02X} DIR={:02X} ESA={:02X} EDL={:02X} EFB={}\n\
             FIR=[{},{},{},{},{},{},{},{}]\n\
             echo_pos={} echo_length={}\n",
            dsp.mvol_l, dsp.mvol_r, dsp.evol_l, dsp.evol_r,
            dsp.kon, dsp.koff, dsp.flg,
            dsp.non, dsp.pmon, dsp.eon, dsp.dir, dsp.esa, dsp.edl, dsp.efb,
            dsp.fir[0], dsp.fir[1], dsp.fir[2], dsp.fir[3],
            dsp.fir[4], dsp.fir[5], dsp.fir[6], dsp.fir[7],
            dsp.echo_pos, dsp.echo_length,
        );
        for i in 0..8 {
            let v = &dsp.voices[i];
            out.push_str(&format!(
                "V{}: active={} pitch={:04X} src={} brr_addr={:04X} vol_l={} vol_r={} env_mode={:?} env_level={} output={} noise={} pmod={} echo={}\n",
                i, v.active, v.pitch, v.src_addr, v.brr_addr,
                v.vol_l, v.vol_r, v.env_mode, v.env_level, v.output,
                (dsp.non >> i) & 1, (dsp.pmon >> i) & 1, (dsp.eon >> i) & 1,
            ));
        }
        out
    }

    /// Debug: dump first N CGRAM entries
    pub fn debug_cgram(&self, count: u16) -> String {
        let mut out = String::new();
        let n = (count as usize).min(256);
        for i in 0..n {
            let c = self.ppu.cgram[i];
            let r = (c & 0x1F) as u8;
            let g = ((c >> 5) & 0x1F) as u8;
            let b = ((c >> 10) & 0x1F) as u8;
            if i % 16 == 0 { out.push_str(&format!("{:3}: ", i)); }
            out.push_str(&format!("{:04X}({:2},{:2},{:2}) ", c, r, g, b));
            if i % 16 == 15 { out.push('\n'); }
        }
        out
    }

    /// Debug: set voice mute mask (bit N = mute voice N)
    pub fn debug_set_voice_mute(&mut self, mask: u8) {
        self.apu.dsp.voice_mute_mask = mask;
    }

    /// Debug: enable/disable CGRAM[0] write watchpoint
    pub fn debug_cgram0_watch(&mut self, enable: bool) {
        self.ppu.cgram0_watch_enabled = enable;
        if enable {
            self.ppu.cgram0_write_log.clear();
        }
    }

    /// Debug: get CGRAM[0] write log
    pub fn debug_cgram0_log(&mut self) -> String {
        let log = self.ppu.cgram0_write_log.clone();
        self.ppu.cgram0_write_log.clear();
        log
    }

    /// Debug: get and clear DMA trap log
    pub fn debug_get_trap_log(&mut self) -> String {
        let log = self.debug_trap_log.clone();
        self.debug_trap_log.clear();
        log
    }

    /// Debug: dump per-scanline CGWSEL/CGADSUB values from last frame
    pub fn debug_sl_regs(&self) -> String {
        let mut out = String::new();
        let mut prev_cgwsel = 0xFFu8;
        let mut prev_cgadsub = 0xFFu8;
        for y in 0..224usize {
            let cw = self.ppu.debug_sl_cgwsel[y];
            let ca = self.ppu.debug_sl_cgadsub[y];
            if cw != prev_cgwsel || ca != prev_cgadsub {
                out.push_str(&format!("SL{:3}: CGWSEL={:02X} CGADSUB={:02X}\n", y, cw, ca));
                prev_cgwsel = cw;
                prev_cgadsub = ca;
            }
        }
        out
    }

    /// Debug: dump $2130 write trace
    pub fn debug_2130_trace(&self) -> String {
        let mut out = String::new();
        let total = self.ppu.debug_2130_idx.min(256);
        let start = if self.ppu.debug_2130_idx > 256 { self.ppu.debug_2130_idx - 256 } else { 0 };
        for i in start..self.ppu.debug_2130_idx {
            let (val, sl, frame, pc) = self.ppu.debug_2130_log[i % 32];
            out.push_str(&format!("$2130={:02X} @SL{} F{} PC={:06X}\n", val, sl, frame, pc));
        }
        if total == 0 { out.push_str("No writes to $2130 recorded\n"); }
        out
    }

    /// Debug: 執行單步並回傳追蹤資訊
    pub fn debug_step_trace(&mut self, count: u32) -> String {
        let mut lines: Vec<String> = Vec::new();
        for _ in 0..count {
            if self.cpu.stopped || self.cpu.waiting { break; }
            // 先處理中斷
            if self.cpu.nmi_pending {
                self.cpu.nmi_pending = false;
                self.do_nmi();
                lines.push(format!("NMI -> PC={:02X}:{:04X}", self.cpu.pb, self.cpu.pc));
                continue;
            }
            if self.cpu.irq_pending && !self.cpu.flag_i() {
                self.cpu.irq_pending = false;
                self.do_irq();
                lines.push(format!("IRQ -> PC={:02X}:{:04X}", self.cpu.pb, self.cpu.pc));
                continue;
            }
            let pb = self.cpu.pb;
            let pc = self.cpu.pc;
            let opcode = self.fetch_pc();
            // Read up to 3 operand bytes for display
            let b1 = self.bus_read(pb, pc.wrapping_add(1));
            let b2 = self.bus_read(pb, pc.wrapping_add(2));
            let b3 = self.bus_read(pb, pc.wrapping_add(3));
            self.execute_instruction(opcode);
            self.cpu.cycles = 0; // don't track cycles during trace
            lines.push(format!(
                "{:02X}:{:04X} {:02X} {:02X} {:02X} {:02X}  A={:04X} X={:04X} Y={:04X} SP={:04X} P={:02X} DB={:02X}",
                pb, pc, opcode, b1, b2, b3,
                self.cpu.a, self.cpu.x, self.cpu.y, self.cpu.sp, self.cpu.p, self.cpu.db
            ));
        }
        lines.join("\n")
    }

    /// Debug: 執行一幀並記錄每條掃描線的 CPU PC 和 HVBJOY
    pub fn debug_frame_trace(&mut self) -> String {
        let mut lines: Vec<String> = Vec::new();
        self.ppu.frame_complete = false;
        for scanline in 0..SCANLINES {
            let pc_before = self.cpu.pc;
            let pb_before = self.cpu.pb;
            self.run_scanline(scanline);
            let pc_after = self.cpu.pc;
            // Only log interesting scanlines
            if scanline <= 3 || scanline == 224 || scanline == 225 || scanline == 261 {
                lines.push(format!(
                    "SL{:3}: HVBJOY={:02X} PC={:02X}:{:04X}->{:02X}:{:04X} NMI={} A={:04X}",
                    scanline, self.hvbjoy,
                    pb_before, pc_before,
                    self.cpu.pb, pc_after,
                    self.cpu.nmi_pending,
                    self.cpu.a,
                ));
            }
        }
        lines.join("\n")
    }

    /// Debug: 執行 N 幀並回報每幀的指令數及 PC 範圍
    pub fn debug_run_frames(&mut self, num_frames: u32) -> String {
        let mut lines: Vec<String> = Vec::new();
        for f in 0..num_frames {
            let pc_before = format!("{:02X}:{:04X}", self.cpu.pb, self.cpu.pc);
            self.frame();
            let pc_after = format!("{:02X}:{:04X}", self.cpu.pb, self.cpu.pc);
            // Report every 10 frames or certain frames
            if f < 5 || f % 10 == 0 || f == num_frames - 1 {
                lines.push(format!(
                    "F{}: PC {}->{}  NMITIMEN={:02X} HVBJOY={:02X} A={:04X} X={:04X}",
                    f, pc_before, pc_after,
                    self.nmitimen, self.hvbjoy, self.cpu.a, self.cpu.x,
                ));
            }
            // Stop early if NMITIMEN is set
            if self.nmitimen & 0x80 != 0 {
                lines.push(format!("NMI enabled at frame {}!", f));
                break;
            }
        }
        lines.join("\n")
    }

    /// Debug: 執行大量指令 (不走 frame loop，直接跑 CPU)
    pub fn debug_run_instructions(&mut self, count: u32) -> String {
        let mut executed = 0u32;
        let mut nmitimen_written = false;
        let mut nmitimen_frame = 0u32;
        let mut unique_pcs: std::collections::HashSet<u32> = std::collections::HashSet::new();

        for _ in 0..count {
            if self.cpu.stopped || self.cpu.waiting { break; }
            if self.cpu.nmi_pending {
                self.cpu.nmi_pending = false;
                self.do_nmi();
                continue;
            }
            if self.cpu.irq_pending && !self.cpu.flag_i() {
                self.cpu.irq_pending = false;
                self.do_irq();
                continue;
            }

            let pc = ((self.cpu.pb as u32) << 16) | self.cpu.pc as u32;
            unique_pcs.insert(pc);

            let opcode = self.fetch_pc();
            self.execute_instruction(opcode);
            self.cpu.cycles = 0;
            executed += 1;

            // Check if NMITIMEN was just written
            if self.nmitimen & 0x80 != 0 && !nmitimen_written {
                nmitimen_written = true;
                nmitimen_frame = executed;
            }
        }

        format!(
            "Executed {} instructions. Unique PCs: {}. NMITIMEN={:02X} (written at insn #{}).\n\
             Final: PC={:02X}:{:04X} A={:04X} X={:04X} Y={:04X} SP={:04X} P={:02X}",
            executed, unique_pcs.len(), self.nmitimen,
            if nmitimen_written { nmitimen_frame } else { 0 },
            self.cpu.pb, self.cpu.pc, self.cpu.a, self.cpu.x, self.cpu.y,
            self.cpu.sp, self.cpu.p,
        )
    }

    /// Debug: 追蹤 bank 轉移
    pub fn debug_trace_bank_change(&mut self, target_bank: u8, max_insns: u32) -> String {
        let mut ring: Vec<String> = Vec::with_capacity(32);
        for i in 0..max_insns {
            if self.cpu.stopped || self.cpu.waiting { break; }
            if self.cpu.nmi_pending {
                self.cpu.nmi_pending = false;
                self.do_nmi();
                ring.push(format!("NMI -> {:02X}:{:04X}", self.cpu.pb, self.cpu.pc));
                if ring.len() > 30 { ring.remove(0); }
                continue;
            }
            if self.cpu.irq_pending && !self.cpu.flag_i() {
                self.cpu.irq_pending = false;
                self.do_irq();
                ring.push(format!("IRQ -> {:02X}:{:04X}", self.cpu.pb, self.cpu.pc));
                if ring.len() > 30 { ring.remove(0); }
                continue;
            }
            let pb = self.cpu.pb;
            let pc = self.cpu.pc;
            let opcode = self.fetch_pc();
            let b1 = self.bus_read(pb, pc.wrapping_add(1));
            let b2 = self.bus_read(pb, pc.wrapping_add(2));
            let b3 = self.bus_read(pb, pc.wrapping_add(3));
            self.execute_instruction(opcode);
            self.cpu.cycles = 0;
            let line = format!(
                "{:02X}:{:04X} {:02X} {:02X} {:02X} {:02X} A={:04X} X={:04X} Y={:04X} SP={:04X} P={:02X}",
                pb, pc, opcode, b1, b2, b3,
                self.cpu.a, self.cpu.x, self.cpu.y, self.cpu.sp, self.cpu.p
            );
            ring.push(line);
            if ring.len() > 30 { ring.remove(0); }

            if self.cpu.pb != target_bank && pb == target_bank {
                // Bank changed! Capture 20 more
                for _ in 0..20 {
                    if self.cpu.stopped || self.cpu.waiting { break; }
                    let pb2 = self.cpu.pb;
                    let pc2 = self.cpu.pc;
                    let op = self.fetch_pc();
                    self.execute_instruction(op);
                    self.cpu.cycles = 0;
                    ring.push(format!(
                        "{:02X}:{:04X} {:02X} _ A={:04X} X={:04X} Y={:04X} SP={:04X} P={:02X}",
                        pb2, pc2, op,
                        self.cpu.a, self.cpu.x, self.cpu.y, self.cpu.sp, self.cpu.p
                    ));
                }
                return format!("Transition at insn {}\n{}", i, ring.join("\n"));
            }
        }
        format!("No transition in {} insns. PC={:02X}:{:04X}", max_insns, self.cpu.pb, self.cpu.pc)
    }

    /// Debug: 執行 N 幀，跑完後做 step trace
    pub fn debug_run_then_trace(&mut self, frames: u32, trace_count: u32) -> String {
        for _ in 0..frames {
            self.frame();
        }
        let state = format!(
            "After {} frames: PC={:02X}:{:04X} A={:04X} X={:04X} Y={:04X} SP={:04X} P={:02X} DB={:02X} DP={:04X}\n\
             NMITIMEN={:02X} RDNMI={:02X} HVBJOY={:02X}\nPPU: force_blank={} brightness={}\n---\n",
            frames, self.cpu.pb, self.cpu.pc, self.cpu.a, self.cpu.x, self.cpu.y,
            self.cpu.sp, self.cpu.p, self.cpu.db, self.cpu.dp,
            self.nmitimen, self.rdnmi, self.hvbjoy,
            self.ppu.force_blank, self.ppu.brightness,
        );
        let trace = self.debug_step_trace(trace_count);
        format!("{}{}", state, trace)
    }

    /// Debug: 讀取 ROM 資料 (直接從卡帶讀取)
    pub fn debug_read_rom_range(&self, bank: u8, start: u16, len: u16) -> String {
        let mut bytes = Vec::new();
        for i in 0..len {
            let addr = start.wrapping_add(i);
            let val = self.cart.read_rom(bank, addr);
            bytes.push(format!("{:02X}", val));
        }
        format!("{:02X}:{:04X}-{:04X}: {}", bank, start, start.wrapping_add(len.wrapping_sub(1)), bytes.join(" "))
    }

    /// Debug: 精靈/PPU 診斷
    pub fn debug_sprite_info(&self) -> String {
        let ppu = &self.ppu;
        let mut lines: Vec<String> = Vec::new();

        lines.push(format!(
            "PPU: mode={} brightness={} force_blank={} TM={:02X} TS={:02X} TMW={:02X} TSW={:02X}",
            ppu.bg_mode, ppu.brightness, ppu.force_blank, ppu.tm, ppu.ts, ppu.tmw, ppu.tsw
        ));
        lines.push(format!(
            "OBJ: size={} base={:04X} name_sel={:04X} oam_priority={} oam_addr={:03X} oam_addr_reload={:03X}",
            ppu.obj_size, ppu.obj_base, ppu.obj_name_select, ppu.oam_priority,
            ppu.oam_addr, ppu.oam_addr_reload
        ));

        // Raw OAM dump: first 8 entries (32 bytes) + high table
        let mut raw = String::from("OAM raw[0..31]: ");
        for i in 0..32 {
            raw.push_str(&format!("{:02X} ", ppu.oam[i]));
        }
        lines.push(raw);
        let mut raw_hi = String::from("OAM hi[512..543]: ");
        for i in 512..544 {
            raw_hi.push_str(&format!("{:02X} ", ppu.oam[i]));
        }
        lines.push(raw_hi);

        // Also dump WRAM OAM buffer at $0400 (common in MMX2)
        let mut wram_buf = String::from("WRAM@0400[0..31]: ");
        for i in 0..32 {
            wram_buf.push_str(&format!("{:02X} ", self.wram[0x0400 + i]));
        }
        lines.push(wram_buf);

        // Count non-empty OAM entries and show first 16 visible sprites
        let (small_w, small_h, large_w, large_h) = match ppu.obj_size {
            0 => (8, 8, 16, 16),
            1 => (8, 8, 32, 32),
            2 => (8, 8, 64, 64),
            3 => (16, 16, 32, 32),
            4 => (16, 16, 64, 64),
            5 => (32, 32, 64, 64),
            _ => (8, 8, 16, 16),
        };

        let mut visible_count = 0;
        let mut on_screen = Vec::new();
        for i in 0..128 {
            let base = i * 4;
            let extra_byte = ppu.oam[512 + (i >> 2)];
            let extra_bits = (extra_byte >> ((i & 3) * 2)) & 0x03;

            let x_low = ppu.oam[base] as i16;
            let y_pos = ppu.oam[base + 1];
            let tile = ppu.oam[base + 2] as u16;
            let attr = ppu.oam[base + 3];

            let x_high = extra_bits & 0x01;
            let size_bit = (extra_bits >> 1) & 0x01;
            let x = if x_high != 0 { x_low - 256 } else { x_low };
            let (w, h) = if size_bit != 0 { (large_w, large_h) } else { (small_w, small_h) };
            let name_table = (attr & 0x01) as u16;
            let palette = (attr >> 1) & 0x07;
            let priority = (attr >> 4) & 0x03;

            // is it on screen?
            if y_pos < 224 && x > -64 && x < 256 {
                visible_count += 1;
                if on_screen.len() < 16 {
                    let chr_base = if name_table != 0 {
                        ppu.obj_base.wrapping_add(ppu.obj_name_select) as usize
                    } else {
                        ppu.obj_base as usize
                    };
                    // Sample first pixel of tile to check if VRAM has data
                    let tile_addr = (chr_base + tile as usize * 32) & 0xFFFF;
                    let vram_byte = ppu.vram[tile_addr];
                    on_screen.push(format!(
                        "  spr{}: x={} y={} tile={:03X} nt={} pal={} pri={} size={}x{} chr_base={:04X} vram@tile={:02X}",
                        i, x, y_pos, tile, name_table, palette, priority, w, h, chr_base, vram_byte
                    ));
                }
            }
        }
        lines.push(format!("OAM: {}/128 sprites on-screen", visible_count));
        for s in &on_screen {
            lines.push(s.clone());
        }

        // BG info
        for bg in 0..4 {
            let sc = ppu.bg_tilemap_addr[bg];
            let chr = ppu.bg_chr_addr[bg];
            let enabled_main = ppu.tm & (1 << bg) != 0;
            let enabled_sub = ppu.ts & (1 << bg) != 0;
            lines.push(format!(
                "BG{}: sc={:04X} chr={:04X} main={} sub={}",
                bg + 1, sc, chr, enabled_main, enabled_sub
            ));
        }

        // CGRAM first 4 sprite palettes (base 128)
        let mut pal_info = String::from("Sprite palettes (128+): ");
        for p in 0..4 {
            let base = 128 + p * 16;
            let mut non_zero = 0;
            for c in 0..16 {
                if ppu.cgram[base + c] != 0 { non_zero += 1; }
            }
            pal_info.push_str(&format!("pal{}={}/16 ", p, non_zero));
        }
        lines.push(pal_info);

        lines.join("\n")
    }

    /// Debug: 執行幀直到 PC 落入指定範圍, 然後 step trace
    pub fn debug_run_until_pc_in_range(&mut self, target_bank: u8, target_lo: u16, target_hi: u16, max_frames: u32, trace_count: u32) -> String {
        let mut frame_num = 0u32;
        // First: run frames until PC is in the target range
        for f in 0..max_frames {
            self.frame();
            frame_num = f + 1;
            if self.cpu.pb == target_bank && self.cpu.pc >= target_lo && self.cpu.pc <= target_hi {
                break;
            }
        }
        let in_range = self.cpu.pb == target_bank && self.cpu.pc >= target_lo && self.cpu.pc <= target_hi;
        let header = format!(
            "After {} frames: in_range={} PC={:02X}:{:04X} A={:04X} X={:04X} Y={:04X} SP={:04X} P={:02X} DB={:02X} DP={:04X}\n---\n",
            frame_num, in_range, self.cpu.pb, self.cpu.pc, self.cpu.a, self.cpu.x, self.cpu.y,
            self.cpu.sp, self.cpu.p, self.cpu.db, self.cpu.dp,
        );
        let trace = self.debug_step_trace(trace_count);
        format!("{}{}", header, trace)
    }
}
