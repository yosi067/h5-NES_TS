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
use crate::cartridge::{Cartridge, PortableCartridgeState};
use crate::controller::Controller;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use std::cell::{Cell, RefCell};
use std::collections::VecDeque;
use crate::game_profile::{sha256_hex, MemorySpace, NesGameProfile, WriteTiming};
#[cfg(test)]
use crate::mappers::Mapper1TraceState;

#[cfg(test)]
#[path = "ct2_stats_diagnostic.rs"]
mod ct2_stats_diagnostic;

#[cfg(test)]
#[path = "zombie_stats_diagnostic.rs"]
mod zombie_stats_diagnostic;

#[path = "zombie_tuning.rs"]
mod zombie_tuning;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
enum DmcDmaPhase {
    Idle,
    Halt,
    Dummy,
    Align,
    Read,
}

// Session-only snapshots, not a portable serialization format. Cloning the
// hardware includes private mapper/APU/PPU pipeline state and owns all buffers.
// Never snapshot raw WASM memory: it also contains allocator/JS-owned pointers.
const TEMP_STATE_PREFIX: &str = "#NES-TEMP-2:";
const TEMP_STATE_LIMIT: usize = 16;
const PERSISTENT_STATE_PREFIX: &str = "NES-SAVE-1:";
const PERSISTENT_STATE_FORMAT: &str = "NES-SAVE-1";
const PERSISTENT_STATE_LIMIT: usize = 8_000_000;

#[derive(Clone)]
struct TemporaryState {
    token: String,
    cpu: Cpu,
    ppu: Ppu,
    apu: Apu,
    bus: Bus,
    cartridge: Cartridge,
    ctrl1: Controller,
    ctrl2: Controller,
    system_clock: u64,
    audio_enabled: bool,
    dmc_dma_address: Option<u16>,
    dmc_dma_phase: DmcDmaPhase,
    #[cfg(test)]
    current_instruction_pc: u16,
}

#[derive(Serialize, Deserialize)]
struct PersistentState {
    format: String,
    rom_sha256: String,
    cpu: Cpu,
    ppu: Ppu,
    apu: Apu,
    bus: Bus,
    cartridge: PortableCartridgeState,
    ctrl1: Controller,
    ctrl2: Controller,
    system_clock: u64,
    audio_enabled: bool,
    dmc_dma_address: Option<u16>,
    dmc_dma_phase: DmcDmaPhase,
}

#[cfg(test)]
#[derive(Debug)]
pub(crate) struct ZombieTextTraceEvent {
    pub clock: u64,
    pub pc: u16,
    pub physical_prg_offset: u32,
    pub source_pointer: Option<u16>,
    pub source_prg_offset: Option<u32>,
    pub buffer_cursor: u8,
    pub buffer: Option<Vec<u8>>,
    pub chr_bank_offsets: [u32; 8],
    pub ppu_ctrl: u8,
    pub mapper1_state: Option<Mapper1TraceState>,
}

#[cfg(test)]
#[derive(Debug)]
pub(crate) struct ZombieGenerationTraceEvent {
    pub clock: u64,
    pub pc: u16,
    pub physical_prg_offset: u32,
    pub a: u8,
    pub x: u8,
    pub y: u8,
    pub source_pointer: u16,
    pub source_prg_offset: Option<u32>,
    pub buffer_cursor: u8,
    pub state_06a0: u8,
    pub state_06a1: u8,
    pub state_06a2: u8,
    pub state_06a3: u8,
    pub state_06a6: u8,
    pub state_06a8: u8,
    pub state_06a9: u8,
    pub state_06aa: u8,
    pub chr_bank_offsets: [u32; 8],
    pub ppu_ctrl: u8,
    pub mapper1_state: Option<Mapper1TraceState>,
}

#[cfg(test)]
#[derive(Debug)]
pub(crate) struct ZombieInputTraceEvent {
    pub clock: u64,
    pub pc: u16,
    pub physical_prg_offset: u32,
    pub stack_pointer: u8,
    pub stack_return: u16,
    pub edge: u8,
    pub current: u8,
    pub cursor: u8,
    pub count: u8,
    pub mode: u8,
    pub state_57: u8,
    pub state_7e: u8,
    pub state_c1: u8,
    pub state_3f: u8,
    pub state_26: u8,
    pub state_2a: u8,
    pub state_28: u8,
    pub state_17: u8,
    pub state_16: u8,
    pub state_29: u8,
    pub state_2b: u8,
    pub state_06c3: u8,
    pub state_06c6: u8,
    pub state_06c7: u8,
    pub state_2c: u8,
    pub state_06c1: u8,
    pub mapper1_state: Option<Mapper1TraceState>,
}

#[cfg(test)]
#[derive(Debug)]
pub(crate) struct ZombieCandidateReadEvent {
    pub clock: u64,
    pub pc: u16,
    pub cpu_address: u16,
    pub physical_prg_offset: u32,
    pub value: u8,
    pub mapper1_state: Option<Mapper1TraceState>,
}

#[cfg(test)]
#[derive(Debug)]
pub(crate) struct ZombieModeTraceEvent {
    pub clock: u64,
    pub pc: u16,
    pub physical_prg_offset: u32,
    pub edge: u8,
    pub current: u8,
    pub state_f4: u8,
    pub state_f7: u8,
    pub state_0610: u8,
    pub state_3a: u8,
    pub state_38: u8,
    pub state_2a: u8,
    pub state_06c1: u8,
    pub mapper1_state: Option<Mapper1TraceState>,
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
    loaded_rom_sha256: String,
    game_profile: Option<NesGameProfile>,
    ct2_tuning: crate::game_profile::ct2_tuning::Ct2Tuning,
    ct2_level_read_instruction: bool,
    zombie_tuning: zombie_tuning::ZombieTuning,
    zombie_initial_level_instruction: bool,
    temporary_states: RefCell<VecDeque<TemporaryState>>,
    // User slots must not be evicted by quick-save overwrites or diagnostic exports.
    temporary_slots: RefCell<Vec<(u32, TemporaryState)>>,
    next_temporary_state: Cell<u64>,

    pub text_observer: crate::text_observer::TextObserver,

    #[cfg(test)]
    pub(crate) mapper_scanline_events: Vec<(i16, u16)>,
    #[cfg(test)]
    pub(crate) mapper_cpu_writes: Vec<(u64, u16, u8)>,
    #[cfg(test)]
    pub(crate) mapper_scanline_enabled: bool,
    #[cfg(test)]
    pub(crate) resolver_calls: Vec<(u64, u16, u8, u8, u8)>,
    #[cfg(test)]
    pub(crate) ppu_nametable_write_trace: Vec<(u64, u16, u16, u8, u32)>,
    #[cfg(test)]
    pub(crate) cpu_ram_write_trace: Vec<(u64, u16, u16, u8, u32)>,
    #[cfg(test)]
    pub(crate) zombie_text_trace: Vec<ZombieTextTraceEvent>,
    #[cfg(test)]
    pub(crate) zombie_generation_trace: Vec<ZombieGenerationTraceEvent>,
    #[cfg(test)]
    pub(crate) zombie_input_trace: Vec<ZombieInputTraceEvent>,
    #[cfg(test)]
    pub(crate) zombie_candidate_read_trace: Vec<ZombieCandidateReadEvent>,
    #[cfg(test)]
    pub(crate) zombie_mode_trace: Vec<ZombieModeTraceEvent>,
    #[cfg(test)]
    current_instruction_pc: u16,
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
            loaded_rom_sha256: String::new(),
            game_profile: None,
            ct2_tuning: Default::default(),
            ct2_level_read_instruction: false,
            zombie_tuning: Default::default(),
            zombie_initial_level_instruction: false,
            temporary_states: RefCell::new(VecDeque::new()),
            temporary_slots: RefCell::new(Vec::new()),
            next_temporary_state: Cell::new(0),
            text_observer: crate::text_observer::TextObserver::default(),
            #[cfg(test)]
            mapper_scanline_events: Vec::new(),
            #[cfg(test)]
            mapper_cpu_writes: Vec::new(),
            #[cfg(test)]
            mapper_scanline_enabled: true,
            #[cfg(test)]
            resolver_calls: Vec::new(),
            #[cfg(test)]
            ppu_nametable_write_trace: Vec::new(),
            #[cfg(test)]
            cpu_ram_write_trace: Vec::new(),
            #[cfg(test)]
            zombie_text_trace: Vec::new(),
            #[cfg(test)]
            zombie_generation_trace: Vec::new(),
            #[cfg(test)]
            zombie_input_trace: Vec::new(),
            #[cfg(test)]
            zombie_candidate_read_trace: Vec::new(),
            #[cfg(test)]
            zombie_mode_trace: Vec::new(),
            #[cfg(test)]
            current_instruction_pc: 0,
        }
    }

    /// 載入 ROM
    pub fn load_rom(&mut self, data: &[u8]) -> bool {
        self.ct2_tuning = Default::default();
        self.zombie_tuning = Default::default();
        self.text_observer.configure(false, "");
        self.ppu.set_text_provenance(false);
        self.clear_game_profile();
        let success = self.cartridge.load_rom(data);
        if success {
            self.loaded_rom_sha256 = sha256_hex(data);
            self.zombie_tuning = zombie_tuning::ZombieTuning::for_rom(
                &self.loaded_rom_sha256, self.cartridge.header.mapper_id);
            self.ct2_tuning = crate::game_profile::ct2_tuning::Ct2Tuning::for_rom(
                &self.loaded_rom_sha256, self.cartridge.header.mapper_id);
            // 將卡帶的 CHR 資料同步到 PPU
            let chr_data = self.cartridge.chr_data.clone();
            let chr_ram = self.cartridge.chr_ram;
            self.ppu.set_chr_data(chr_data, chr_ram);
            // 同步 Mapper 的 CHR bank 映射和鏡像模式
            self.sync_mapper_to_ppu();
            self.reset();
        } else {
            self.loaded_rom_sha256.clear();
        }
        success
    }

    /// Hot update only: never reset hardware, reload overlays or invalidate saves.
    /// Session preference survives reset/restore; a new ROM load restores defaults.
    pub fn set_game_profile_tuning(&mut self, json: &str) -> Result<(), String> {
        if self.zombie_tuning.supported { return self.zombie_tuning.update(json); }
        self.ct2_tuning.update(json)
    }

    pub fn game_profile_tuning(&self) -> String {
        if self.zombie_tuning.supported { return self.zombie_tuning.status(); }
        self.ct2_tuning.status()
    }

    pub fn load_game_profile(&mut self, json: &str) -> Result<(), String> {
        let profile = NesGameProfile::parse(json)?;
        if !self.cartridge.loaded {
            return Err("load a NES ROM before loading its profile".to_string());
        }
        if !profile.matches_sha256(&self.loaded_rom_sha256) {
            return Err("profile SHA-256 does not match the loaded ROM".to_string());
        }
        if profile.game.mapper != self.cartridge.header.mapper_id {
            return Err(format!(
                "profile mapper {} does not match ROM mapper {}",
                profile.game.mapper, self.cartridge.header.mapper_id
            ));
        }

        for overlay in &profile.prg_read_overlays {
            let offset = overlay.offset as usize;
            let original = self.cartridge.prg_rom.get(offset).ok_or_else(|| {
                format!("PRG overlay {} offset is outside the ROM", overlay.id)
            })?;
            if *original != overlay.expected_original {
                return Err(format!(
                    "PRG overlay {} expected {:#04X} at {:#X}, found {:#04X}",
                    overlay.id, overlay.expected_original, overlay.offset, original
                ));
            }
        }
        for overlay in &profile.chr_read_overlays {
            let offset = overlay.offset as usize;
            let original = self.cartridge.chr_data.get(offset).ok_or_else(|| {
                format!("CHR overlay {} offset is outside the ROM", overlay.id)
            })?;
            if *original != overlay.expected_original {
                return Err(format!(
                    "CHR overlay {} expected {:#04X} at {:#X}, found {:#04X}",
                    overlay.id, overlay.expected_original, overlay.offset, original
                ));
            }
        }
        for page in &profile.chr_overlay_pages {
            for overlay in &page.overlays {
                let offset = overlay.offset as usize;
                let original = self.cartridge.chr_data.get(offset).ok_or_else(|| {
                    format!("CHR overlay {} offset is outside the ROM", overlay.id)
                })?;
                if *original != overlay.expected_original {
                    return Err(format!(
                        "CHR overlay {} expected {:#04X} at {:#X}, found {:#04X}",
                        overlay.id, overlay.expected_original, overlay.offset, original
                    ));
                }
            }
        }

        let prg_overlays: Vec<_> = profile.prg_read_overlays.iter()
            .map(|overlay| (overlay.offset as usize, overlay.value))
            .collect();
        let chr_overlays: Vec<_> = profile.chr_read_overlays.iter()
            .map(|overlay| (overlay.offset as usize, overlay.value))
            .collect();
        self.cartridge.install_prg_overlays(&prg_overlays);
        self.ppu.install_chr_overlays(&chr_overlays);
        let chr_pages = profile.chr_overlay_pages.iter().map(|page| {
            let overlays = page.overlays.iter()
                .map(|overlay| (overlay.offset as usize, overlay.value))
                .collect();
            (page.guard.address, page.guard.value, page.guard.require_active_table, overlays)
        }).collect();
        self.ppu.install_conditional_chr_overlay_pages(chr_pages);
        self.temporary_states.get_mut().clear();
        self.game_profile = Some(profile);
        self.temporary_slots.get_mut().clear();
        self.reset();
        Ok(())
    }

    pub fn clear_game_profile(&mut self) {
        self.temporary_states.get_mut().clear();
        self.temporary_slots.get_mut().clear();
        self.cartridge.clear_prg_overlays();
        self.ppu.clear_chr_overlays();
        self.game_profile = None;
    }

    pub fn active_game_profile_id(&self) -> &str {
        self.game_profile.as_ref().map_or("", |profile| profile.id.as_str())
    }

    fn apply_profile_writes(&mut self, timing: WriteTiming) {
        let Some(profile) = &self.game_profile else { return; };
        for write in profile.memory_writes.iter().filter(|write| write.apply == timing) {
            match write.space {
                MemorySpace::CpuRam => self.bus.ram[write.address as usize] = write.value,
                MemorySpace::PrgRam => {
                    self.cartridge.prg_ram[(write.address - 0x6000) as usize] = write.value;
                }
            }
        }
    }

    /// 重置模擬器
    pub fn reset(&mut self) {
        self.text_observer.reset();
        self.cartridge.reset();
        self.ppu.reset();
        self.apu.reset();
        self.bus.reset();
        self.system_clock = 0;
        self.dmc_dma_address = None;
        self.dmc_dma_phase = DmcDmaPhase::Idle;
        self.apply_profile_writes(WriteTiming::Reset);
        #[cfg(test)]
        {
            self.mapper_scanline_events.clear();
            self.mapper_cpu_writes.clear();
            self.resolver_calls.clear();
            self.ppu_nametable_write_trace.clear();
            self.cpu_ram_write_trace.clear();
            self.zombie_text_trace.clear();
            self.zombie_generation_trace.clear();
            self.zombie_input_trace.clear();
            self.zombie_candidate_read_trace.clear();
            self.zombie_mode_trace.clear();
            self.current_instruction_pc = 0;
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

        // Only two original-bank entry points are observed; checking PC first
        // avoids mapper work for the overwhelming majority of instructions.
        if self.text_observer.enabled {
            if self.cpu.pc == 0xe93d && self.cartridge.mapper.cpu_read(0xe93d) == Some(0x3e93d) {
                self.text_observer.push(6, self.cpu.a as u32, self.cpu.x as u32, 0);
            }
            if matches!(self.cpu.pc, 0x84E9 | 0x84F3 | 0x88B1) { self.observe_ct2_text(); }
            else if matches!(self.cpu.pc, 0x8017 | 0x8218 | 0x8358 | 0x864B | 0x8663 | 0x8668) { self.observe_ct2_cloud(); }
            else if matches!(self.cpu.pc, 0x8a79 | 0x8d7b) { self.observe_ct2_menu_word(); }
        }
        // 取指令並執行
        #[cfg(test)]
            {
                self.current_instruction_pc = self.cpu.pc;
                if matches!(
                    self.current_instruction_pc,
                    0x8ABC | 0x8AF2 | 0x8B4F | 0x8B52 | 0x8B56 | 0xB031 | 0xB4B8 | 0xD068
                        | 0xF49E | 0xF4A6
                ) {
                    let source_pointer = match self.current_instruction_pc {
                        0x8ABC | 0x8B52 | 0x8B56 => Some(u16::from(self.cpu.x) | (u16::from(self.cpu.a) << 8)),
                        0x8AF2 => Some(u16::from(self.bus.ram[0x34]) | (u16::from(self.bus.ram[0x35]) << 8)),
                        _ => None,
                    };
                    self.zombie_text_trace.push(ZombieTextTraceEvent {
                        clock: self.system_clock,
                        pc: self.current_instruction_pc,
                        physical_prg_offset: self.cartridge.mapper.cpu_read(self.current_instruction_pc).unwrap_or(u32::MAX),
                        source_prg_offset: source_pointer.and_then(|pointer| self.cartridge.mapper.cpu_read(pointer)),
                        source_pointer,
                        buffer_cursor: self.bus.ram[0xA6],
                        buffer: if matches!(self.current_instruction_pc, 0xB031 | 0xB4B8 | 0xF4A6) {
                            Some(self.bus.ram[0x0300..0x0400].to_vec())
                        } else {
                            None
                        },
                        chr_bank_offsets: self.ppu.chr_bank_offsets_for_test(),
                        ppu_ctrl: self.ppu.ctrl,
                        mapper1_state: self.cartridge.mapper.trace_mapper1_state(),
                    });
                }
                if matches!(
                    self.current_instruction_pc,
                    0x860E | 0x862D | 0x86B0 | 0x86B6 | 0x8D90 | 0x9660 | 0x971A | 0x9728 | 0x947B
                        | 0xF174
                ) {
                    let source_pointer =
                        u16::from(self.bus.ram[0x34]) | (u16::from(self.bus.ram[0x35]) << 8);
                    self.zombie_generation_trace.push(ZombieGenerationTraceEvent {
                        clock: self.system_clock,
                        pc: self.current_instruction_pc,
                        physical_prg_offset: self.cartridge.mapper.cpu_read(self.current_instruction_pc).unwrap_or(u32::MAX),
                        a: self.cpu.a,
                        x: self.cpu.x,
                        y: self.cpu.y,
                        source_pointer,
                        source_prg_offset: self.cartridge.mapper.cpu_read(source_pointer),
                        buffer_cursor: self.bus.ram[0xA6],
                        state_06a0: self.bus.ram[0x06A0],
                        state_06a1: self.bus.ram[0x06A1],
                        state_06a2: self.bus.ram[0x06A2],
                        state_06a3: self.bus.ram[0x06A3],
                        state_06a6: self.bus.ram[0x06A6],
                        state_06a8: self.bus.ram[0x06A8],
                        state_06a9: self.bus.ram[0x06A9],
                        state_06aa: self.bus.ram[0x06AA],
                        chr_bank_offsets: self.ppu.chr_bank_offsets_for_test(),
                        ppu_ctrl: self.ppu.ctrl,
                        mapper1_state: self.cartridge.mapper.trace_mapper1_state(),
                    });
                }
                if matches!(
                    self.current_instruction_pc,
                    0x8000 | 0x80BA | 0x80BD | 0x8103 | 0x811F | 0x8122 | 0x812D | 0x8135
                        | 0x8138 | 0x81F1 | 0x81FB | 0x81FE | 0x8203 | 0x820C | 0x8219
                        | 0x83B0 | 0x83FE | 0x8400 | 0x8403 | 0x8406 | 0x840A | 0x8411
                        | 0x8467 | 0x847B | 0x857D | 0x857F | 0x8585 | 0x8588 | 0x858A
                        | 0x85AB | 0x85B8 | 0x85DA | 0x866C | 0x8721 | 0x8752 | 0x877C
                        | 0x87BF | 0x8A38 | 0x8B19 | 0x8BA8 | 0x8C8D | 0x8902 | 0xF153
                        | 0xF173 | 0x9710
                )
                    || (self.current_instruction_pc == 0x8A57 && self.bus.ram[0x3A] != 0)
                {
                    self.zombie_input_trace.push(ZombieInputTraceEvent {
                        clock: self.system_clock,
                        pc: self.current_instruction_pc,
                        physical_prg_offset: self.cartridge.mapper.cpu_read(self.current_instruction_pc).unwrap_or(u32::MAX),
                        stack_pointer: self.cpu.sp,
                        stack_return: u16::from(self.bus.ram[0x0101 + usize::from(self.cpu.sp)])
                            | (u16::from(self.bus.ram[0x0102 + usize::from(self.cpu.sp)]) << 8),
                        edge: self.bus.ram[0x3A],
                        current: self.bus.ram[0x38],
                        cursor: self.bus.ram[0xA3],
                        count: self.bus.ram[0xAB],
                        mode: self.bus.ram[0xA4],
                        state_57: self.bus.ram[0x57],
                        state_7e: self.bus.ram[0x7E],
                        state_c1: self.bus.ram[0xC1],
                        state_3f: self.bus.ram[0x3F],
                        state_26: self.bus.ram[0x26],
                        state_2a: self.bus.ram[0x2A],
                        state_28: self.bus.ram[0x28],
                        state_17: self.bus.ram[0x17],
                        state_16: self.bus.ram[0x16],
                        state_29: self.bus.ram[0x29],
                        state_2b: self.bus.ram[0x2B],
                        state_06c3: self.bus.ram[0x06C3],
                        state_06c6: self.bus.ram[0x06C6],
                        state_06c7: self.bus.ram[0x06C7],
                        state_2c: self.bus.ram[0x2C],
                        state_06c1: self.bus.ram[0x06C1],
                        mapper1_state: self.cartridge.mapper.trace_mapper1_state(),
                    });
                }
                if matches!(
                    self.current_instruction_pc,
                    0xE000 | 0xE013 | 0xE03F | 0xE093 | 0xE35B | 0xE3FB | 0xE3EF | 0xE426
                ) {
                    self.zombie_mode_trace.push(ZombieModeTraceEvent {
                        clock: self.system_clock,
                        pc: self.current_instruction_pc,
                        physical_prg_offset: self.cartridge.mapper.cpu_read(self.current_instruction_pc).unwrap_or(u32::MAX),
                        edge: self.bus.ram[0x3A],
                        current: self.bus.ram[0x38],
                        state_f4: self.bus.ram[0xF4],
                        state_f7: self.bus.ram[0xF7],
                        state_0610: self.bus.ram[0x0610],
                        state_3a: self.bus.ram[0x3A],
                        state_38: self.bus.ram[0x38],
                        state_2a: self.bus.ram[0x2A],
                        state_06c1: self.bus.ram[0x06C1],
                        mapper1_state: self.cartridge.mapper.trace_mapper1_state(),
                    });
                }
                if matches!(self.cpu.pc, 0xC53C | 0xF30F) {
                    self.resolver_calls.push((
                        self.system_clock,
                        self.cpu.pc,
                        self.cpu.a,
                        self.bus.ram[0x30],
                        self.bus.ram[0x31],
                    ));
                }
        }
        // The original formula reads level at $8101/$8118; the panel at $ABB6.
        // Physical PRG guards distinguish MMC3 banks; opcode guards also reject
        // a profile replacing this instruction. No frame locks or RAM mutation.
        self.ct2_level_read_instruction = self.ct2_tuning.level.is_some()
            && matches!(self.cpu.pc, 0x8101 | 0x8118 | 0xabb6)
            && matches!((self.cpu.pc, self.cartridge.mapper.cpu_read(self.cpu.pc)),
                (0x8101, Some(0x38101)) | (0x8118, Some(0x38118)) | (0xabb6, Some(0x02bb6)))
            && self.cpu.y == 3
            && self.cartridge.cpu_read(self.cpu.pc) == 0xb1
            && self.cartridge.cpu_read(self.cpu.pc + 1) == 0x34;
        // New-game LDA #0 only. The original STA and stat initialization follow;
        // no frame-level RAM locks, HP refill, experience or save-state rewrite.
        self.zombie_initial_level_instruction = self.zombie_tuning.enabled && self.cpu.pc == 0x9462
            && self.zombie_tuning.initial_instruction(
            self.cpu.pc, self.cartridge.mapper.cpu_read(self.cpu.pc),
            self.cartridge.cpu_read(self.cpu.pc), self.cartridge.cpu_read(self.cpu.pc.wrapping_add(1)));
        // Seed only at the verified return from new-game initialization. Native
        // earnings/subtraction (including the undisplayed overflow byte) remain intact.
        if self.zombie_tuning.money_enabled && self.cpu.pc == 0x9469
            && self.zombie_tuning.initial_money_instruction(
                self.cpu.pc, self.cartridge.mapper.cpu_read(self.cpu.pc),
                self.cartridge.cpu_read(self.cpu.pc), self.cartridge.cpu_read(self.cpu.pc + 1)) {
            self.bus.ram[0xc8..0xcc].copy_from_slice(&[99, 99, 99, 0]);
        }
        let opcode = self.bus_read(self.cpu.pc);
        self.cpu.pc = self.cpu.pc.wrapping_add(1);
        self.execute_cpu_instruction(opcode);
        self.ct2_level_read_instruction = false;
        self.zombie_initial_level_instruction = false;

        // 扣除本次時鐘週期（fetch + execute 本身消耗 1 cycle）
        self.cpu.cycles = self.cpu.cycles.saturating_sub(1);
    }

    /// 匯流排讀取
    fn bus_read(&mut self, addr: u16) -> u8 {
        if self.zombie_initial_level_instruction && addr == 0x9463 {
            return zombie_tuning::MAX_LEVEL;
        }
        if self.ct2_level_read_instruction {
            if let Some(level) = self.ct2_tuning.level_read(&self.bus.ram, addr) {
                return level;
            }
        }
        let value = self.bus.cpu_read(
            addr,
            &mut self.ppu, &mut self.apu, &self.cartridge,
            &mut self.ctrl1, &mut self.ctrl2,
        );
        #[cfg(test)]
        if matches!(addr, 0x8F0E | 0x9165 | 0xFEFD) {
            self.zombie_candidate_read_trace.push(ZombieCandidateReadEvent {
                clock: self.system_clock,
                pc: self.current_instruction_pc,
                cpu_address: addr,
                physical_prg_offset: self.cartridge.mapper.cpu_read(addr).unwrap_or(u32::MAX),
                value,
                mapper1_state: self.cartridge.mapper.trace_mapper1_state(),
            });
        }
        value
    }

    /// 匯流排寫入
    fn bus_write(&mut self, addr: u16, data: u8) {
        #[cfg(test)]
        if addr < 0x0100 || (0x0300..0x0400).contains(&addr) {
            self.cpu_ram_write_trace.push((
                self.system_clock,
                self.current_instruction_pc,
                addr,
                data,
                self.cartridge.mapper.cpu_read(self.current_instruction_pc).unwrap_or(u32::MAX),
            ));
        }
        #[cfg(test)]
        if addr >= 0x8000 {
            self.mapper_cpu_writes.push((self.system_clock, addr, data));
        }
        #[cfg(test)]
        if addr & 0x0007 == 0x0007 && (0x2000..0x3F00).contains(&self.ppu.v) {
            self.ppu_nametable_write_trace.push((
                self.system_clock,
                self.current_instruction_pc,
                self.ppu.v,
                data,
                self.cartridge.mapper.cpu_read(self.current_instruction_pc).unwrap_or(u32::MAX),
            ));
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
        self.apply_profile_writes(WriteTiming::Frame);
        self.ppu.frame_complete = false;
        while !self.ppu.frame_complete {
            self.clock();
        }
        self.apu.end_frame();
    }

    pub fn enable_text_observer(&mut self, enabled: bool) -> bool {
        let active = self.text_observer.configure(enabled, &self.loaded_rom_sha256);
        // Zombie Hunter uses only completed-frame CHR provenance. Never enable
        // CT2's instruction observers for its unrelated mapper/routines.
        let provenance = active || (enabled && self.loaded_rom_sha256 ==
            "91dfb1a0c29f78c5d5b0a582c737c62103c4009ad5e2c20fdecd0c22a8648a48");
        self.ppu.set_text_provenance(provenance);
        provenance
    }

    fn observe_ct2_text(&mut self) {
        let pc = self.cpu.pc;
        if self.cartridge.mapper.cpu_read(pc) != Some(u32::from(pc - 0x8000)) { return; }
        if pc == 0x88B1 {
            // EB waits for input BEFORE calling this clearing routine.
            // Observing the EB dispatch itself would hide text while reading.
            self.text_observer.push(5, 0, 0, 0);
            return;
        }
        let pointer = u16::from_le_bytes([self.bus.ram[0x4d], self.bus.ram[0x4e]]);
        let Some(source) = self.cartridge.mapper.cpu_read(pointer) else { return; };
        // Verified script banks only; neither lookalike data nor other games.
        if !(0x6000..0xC000).contains(&source) { return; }
        let value = self.cartridge.cpu_read(pointer);
        if pc == 0x84F3 {
            // Original JSR $88CA: A=glyph, X=PPU address high, Y=low.
            if value != self.cpu.a || value >= 0xd8 { return; }
            let address = u16::from_be_bytes([self.cpu.x, self.cpu.y]);
            if !(0x2000..0x2FC0).contains(&address) || address & 0x3ff >= 0x3c0 { return; }
            let cell = self.ppu.text_nametable_index(address);
            self.text_observer.push(1, source, cell as u32, value as u32);
            self.text_observer.push(4, self.ppu.text_next_write_generation(cell), cell as u32,
                self.ppu.text_next_write_generation(cell + 32));
        } else if value >= 0xe8 {
            self.text_observer.push(2, source, 0, value as u32);
        }
    }

    fn observe_ct2_cloud(&mut self) {
        let pc = self.cpu.pc;
        if self.cartridge.mapper.cpu_read(pc) != Some(0x30000 + u32::from(pc - 0x8000)) { return; }
        if matches!(pc, 0x8017 | 0x8218) {
            self.text_observer.push(5, 0, 0, 0);
            return;
        }
        // $834C reads ($5F),Y after incrementing the cursor; $8645 reads
        // dictionary ($30),Y. Observe the call AFTER the actual read, not scans.
        let pointer = if pc == 0x8358 {
            u16::from_le_bytes([self.bus.ram[0x5f], self.bus.ram[0x60]])
        } else { u16::from_le_bytes([self.bus.ram[0x30], self.bus.ram[0x31]]) };
        // Player-name routine appends literal くん through two immediate
        // operands, not the dictionary pointer. Preserve their real sources.
        let address = if matches!(pc, 0x8663 | 0x8668) { pc - 1 }
            else { pointer.wrapping_add(u16::from(self.cpu.y)) };
        let Some(source) = self.cartridge.mapper.cpu_read(address) else { return; };
        let value = self.cpu.a;
        if value >= 0xe0 || self.cartridge.cpu_read(address) != value { return; }
        // Two horizontal tile rows are queued at $04A5. $3B is the upper-row
        // cursor. Unlike cutscenes, the cloud writer renders the whole row.
        let base = u16::from_le_bytes([self.bus.ram[0x4a6], self.bus.ram[0x4a7]]);
        let target = base.wrapping_add(u16::from(self.bus.ram[0x3b]));
        if !(0x2000..0x2fc0).contains(&target) || target & 0x3ff >= 0x3a0 { return; }
        let cell = self.ppu.text_nametable_index(target);
        self.text_observer.push(3, source, cell as u32, value as u32);
        self.text_observer.push(4, self.ppu.text_next_write_generation(cell), cell as u32,
            self.ppu.text_next_write_generation(cell + 32));
    }

    // Original bank $18 menu dictionary loops. Unlike battle clouds, menu
    // rows are queued separately. Observe ONLY the mark pass ($3C == 1);
    // the body pass must not replace its pending upper-row generation.
    fn observe_ct2_menu_word(&mut self) {
        let pc = self.cpu.pc;
        if self.cartridge.mapper.cpu_read(pc) != Some(0x30000 + u32::from(pc - 0x8000))
            || self.bus.ram[0x3c] != 1 { return; }
        let pointer = u16::from_le_bytes([self.bus.ram[0x30], self.bus.ram[0x31]]);
        let address = pointer.wrapping_add(u16::from(self.cpu.y));
        let Some(source) = self.cartridge.mapper.cpu_read(address) else { return; };
        let value = self.cpu.a;
        if !(0x3f509..0x40000).contains(&source) || value >= 0xe0
            || self.cartridge.cpu_read(address) != value { return; }
        // $3A selects this queued row's header; $3D is its glyph cursor.
        let queue = usize::from(self.bus.ram[0x3a]);
        let Some(column) = self.bus.ram[0x3d].checked_sub(self.bus.ram[0x3a]) else { return; };
        let base = u16::from_le_bytes([self.bus.ram[0x4a6 + queue], self.bus.ram[0x4a7 + queue]]);
        let target = base.wrapping_add(u16::from(column));
        if !(0x2000..0x2fc0).contains(&target) || target & 0x3ff >= 0x3a0 { return; }
        let cell = self.ppu.text_nametable_index(target);
        self.text_observer.push(3, source, cell as u32, value as u32);
        self.text_observer.push(4, self.ppu.text_next_write_generation(cell), cell as u32,
            self.ppu.text_next_write_generation(cell + 32));
    }

    /// 取得畫面緩衝區指標
    /// Original bank-6 $862d writer's staging rows, not a writable RAM API.
    /// Only this verified ROM may authorize partial menu glyphs.
    pub fn zombie_menu_source(&self) -> Vec<u8> {
        if !self.zombie_tuning.supported { return Vec::new(); }
        self.bus.ram[0x600..0x680].to_vec()
    }

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

    /// Capture a complete, bounded, session-only snapshot and return its token.
    /// Tokens must NOT be persisted/downloaded as portable save files.
    pub fn export_save_state(&self) -> String {
        let Some(snapshot) = self.capture_temporary_state() else { return String::new(); };
        let token = snapshot.token.clone();
        let mut states = self.temporary_states.borrow_mut();
        if states.len() == TEMP_STATE_LIMIT { states.pop_front(); }
        states.push_back(snapshot);
        token
    }

    /// Stable session-only user slots. Overwriting a slot releases its old snapshot.
    pub fn export_save_state_for_slot(&self, slot: u32) -> String {
        if slot >= TEMP_STATE_LIMIT as u32 || !self.cartridge.loaded { return String::new(); }
        let Some(snapshot) = self.capture_temporary_state() else { return String::new(); };
        let token = snapshot.token.clone();
        let mut slots = self.temporary_slots.borrow_mut();
        if let Some(entry) = slots.iter_mut().find(|(id, _)| *id == slot) {
            entry.1 = snapshot;
        } else {
            slots.push((slot, snapshot));
        }
        token
    }

    pub fn export_persistent_save_state(&self) -> String {
        if !self.cartridge.loaded || self.loaded_rom_sha256.is_empty() {
            return String::new();
        }
        let state = PersistentState {
            format: PERSISTENT_STATE_FORMAT.to_string(),
            rom_sha256: self.loaded_rom_sha256.clone(),
            cpu: self.cpu.clone(),
            ppu: self.ppu.clone(),
            apu: self.apu.clone(),
            bus: self.bus.clone(),
            cartridge: self.cartridge.export_portable_state(),
            ctrl1: self.ctrl1.clone(),
            ctrl2: self.ctrl2.clone(),
            system_clock: self.system_clock,
            audio_enabled: self.audio_enabled,
            dmc_dma_address: self.dmc_dma_address,
            dmc_dma_phase: self.dmc_dma_phase,
        };
        let Ok(payload) = bincode::serialize(&state) else { return String::new(); };
        format!("{PERSISTENT_STATE_PREFIX}{}", BASE64.encode(payload))
    }

    pub fn import_persistent_save_state(&mut self, json: &str) -> bool {
        if json.is_empty() || json.len() > PERSISTENT_STATE_LIMIT
            || !json.starts_with(PERSISTENT_STATE_PREFIX)
            || !self.cartridge.loaded || self.loaded_rom_sha256.is_empty() {
            return false;
        }
        let encoded = &json[PERSISTENT_STATE_PREFIX.len()..];
        let Ok(payload) = BASE64.decode(encoded) else { return false; };
        let Ok(state) = bincode::deserialize::<PersistentState>(&payload) else { return false; };
        if state.format != PERSISTENT_STATE_FORMAT
            || state.rom_sha256 != self.loaded_rom_sha256
            || !self.ppu.portable_state_compatible(&state.ppu)
            || !self.apu.portable_state_compatible(&state.apu) {
            return false;
        }

        let mut cartridge = self.cartridge.clone();
        if !cartridge.import_portable_state(state.cartridge) {
            return false;
        }

        self.cpu = state.cpu;
        let provenance_enabled = self.ppu.text_provenance_enabled();
        self.ppu = state.ppu;
        self.apu = state.apu;
        self.bus = state.bus;
        self.cartridge = cartridge;
        self.ctrl1 = state.ctrl1;
        self.ctrl2 = state.ctrl2;
        self.system_clock = state.system_clock;
        self.audio_enabled = state.audio_enabled;
        self.dmc_dma_address = state.dmc_dma_address;
        self.dmc_dma_phase = state.dmc_dma_phase;
        self.text_observer.reset();
        self.ppu.set_text_provenance(provenance_enabled);
        true
    }

    fn capture_temporary_state(&self) -> Option<TemporaryState> {
        let sequence = self.next_temporary_state.get();
        let next = sequence.checked_add(1)?;
        self.next_temporary_state.set(next);
        // Keep the old hex prefix readable by existing read-only ROM diagnostic
        // tools (Buffer.from(token, 'hex') stops at '#'). It is NOT restorable
        // state. The non-hex suffix also makes an older WASM decoder reject it.
        // Deterministic for twin-core diagnostics; lookup is instance-local.
        let diagnostic = self.export_state_binary().iter()
            .map(|byte| format!("{byte:02x}")).collect::<String>();
        let token = format!("{diagnostic}{TEMP_STATE_PREFIX}{}:{sequence}:{}",
            self.loaded_rom_sha256, self.system_clock);
        Some(TemporaryState {
            token: token.clone(), cpu: self.cpu.clone(), ppu: self.ppu.clone(),
            apu: self.apu.clone(), bus: self.bus.clone(), cartridge: self.cartridge.clone(),
            ctrl1: self.ctrl1.clone(), ctrl2: self.ctrl2.clone(),
            system_clock: self.system_clock, audio_enabled: self.audio_enabled,
            dmc_dma_address: self.dmc_dma_address, dmc_dma_phase: self.dmc_dma_phase,
            #[cfg(test)]
            current_instruction_pc: self.current_instruction_pc,
        })
    }

    /// Unknown, expired, or legacy partial states fail without ANY mutation.
    pub fn import_save_state(&mut self, token: &str) -> bool {
        if token.len() > 26000 || !token.contains(TEMP_STATE_PREFIX) { return false; }
        let snapshot = self.temporary_states.borrow().iter()
            .find(|state| state.token == token).cloned()
            .or_else(|| self.temporary_slots.borrow().iter()
                .find(|(_, state)| state.token == token).map(|(_, state)| state.clone()));
        let Some(state) = snapshot else { return false; };
        self.cpu = state.cpu;
        let provenance_enabled = self.ppu.text_provenance_enabled();
        self.ppu = state.ppu;
        self.apu = state.apu;
        self.bus = state.bus;
        self.cartridge = state.cartridge;
        self.ctrl1 = state.ctrl1;
        self.ctrl2 = state.ctrl2;
        self.system_clock = state.system_clock;
        self.audio_enabled = state.audio_enabled;
        self.dmc_dma_address = state.dmc_dma_address;
        self.dmc_dma_phase = state.dmc_dma_phase;
        #[cfg(test)]
        { self.current_instruction_pc = state.current_instruction_pc; }
        // Observations belong to the discarded timeline, not to hardware state.
        self.text_observer.reset();
        self.ppu.set_text_provenance(provenance_enabled);
        true
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

    // Historical decoder retained ONLY for regression evidence. NESW v1 omitted
    // mapper/APU/timing; no production path may load it, even when well-formed.
    #[cfg(test)]
    fn import_state_binary(&mut self, data: &[u8]) -> bool {
        if data.len() != 12599 || &data[0..4] != b"NESW" || data[4] != 1 { return false; }
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
        if p + 11 > data.len() { return false; }
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

    fn assert_same_hardware(a: &mut Emulator, b: &mut Emulator) {
        assert_eq!(a.export_state_binary(), b.export_state_binary(), "CPU/VRAM/RAM");
        assert_eq!(a.system_clock, b.system_clock, "master clock");
        assert_eq!((a.cpu.cycles, a.cpu.total_cycles, a.cpu.nmi_pending, a.cpu.irq_pending),
                   (b.cpu.cycles, b.cpu.total_cycles, b.cpu.nmi_pending, b.cpu.irq_pending));
        assert_eq!(a.debug_state(), b.debug_state(), "PPU/OAM DMA timing");
        assert_eq!(a.bus.dma_data_ready, b.bus.dma_data_ready);
        assert_eq!(a.bus.dma_data, b.bus.dma_data);
        assert_eq!(a.dmc_dma_phase, b.dmc_dma_phase);
        assert_eq!(a.dmc_dma_address, b.dmc_dma_address);
        assert_eq!(a.apu.dmc_read_request, b.apu.dmc_read_request);
        assert_eq!(a.audio_enabled, b.audio_enabled);
        assert_eq!(a.cartridge.mapper.trace_state(), b.cartridge.mapper.trace_state(), "MMC3 registers/IRQ");
        for addr in (0x8000..=0xe000).step_by(0x2000) {
            assert_eq!(a.cartridge.mapper.cpu_read(addr), b.cartridge.mapper.cpu_read(addr), "PRG mapping");
        }
        for addr in (0..0x2000).step_by(0x400) {
            assert_eq!(a.cartridge.mapper.ppu_read(addr), b.cartridge.mapper.ppu_read(addr), "CHR mapping");
        }
        assert_eq!(a.ppu.frame_buffer, b.ppu.frame_buffer, "video continuation");
        assert_eq!(a.apu.get_available_samples(), b.apu.get_available_samples());
        assert_eq!(a.apu.audio_buffer, b.apu.audio_buffer, "APU/filter continuation");
        let mut a1 = a.ctrl1.clone(); let mut b1 = b.ctrl1.clone();
        let mut a2 = a.ctrl2.clone(); let mut b2 = b.ctrl2.clone();
        for _ in 0..10 {
            assert_eq!(a1.read(), b1.read(), "controller 1 latch");
            assert_eq!(a2.read(), b2.read(), "controller 2 latch");
        }
    }

    #[test]
    fn temporary_state_restores_mmc3_and_mid_dma_timing() {
        let mut rom = vec![0; 16 + 4 * 16384 + 8192];
        rom[..4].copy_from_slice(b"NES\x1a");
        rom[4] = 4; rom[5] = 1; rom[6] = 0x40;
        // Each 8K PRG page identifies itself; reset enters a fixed-bank loop.
        for bank in 0..8 { rom[16 + bank * 8192..16 + (bank + 1) * 8192].fill(bank as u8); }
        rom[16 + 7 * 8192..16 + 7 * 8192 + 3].copy_from_slice(&[0x4c, 0x00, 0xe0]);
        rom[16 + 65532..16 + 65534].copy_from_slice(&[0, 0xe0]);
        let mut a = Emulator::new(); let mut b = Emulator::new();
        for emu in [&mut a, &mut b] {
            assert!(emu.load_rom(&rom));
            emu.bus_write(0x8000, 6); emu.bus_write(0x8001, 2);
            emu.bus_write(0x8000, 0); emu.bus_write(0x8001, 4);
            emu.bus_write(0xc000, 17); emu.bus_write(0xc001, 0); emu.bus_write(0xe001, 0);
            emu.cartridge.mapper.scanline();
            emu.set_button(0, 0, true); emu.set_button(1, 3, true);
            emu.ctrl1.write(1); emu.ctrl1.write(0); emu.ctrl1.read();
            emu.ctrl2.write(1); emu.ctrl2.write(0);
            emu.bus_write(0x4010, 0x8f); emu.bus_write(0x4012, 0);
            emu.bus_write(0x4013, 1); emu.bus_write(0x4015, 0x10);
            emu.bus_write(0x4014, 2);
            for _ in 0..37 { emu.clock(); }
        }
        assert!(a.bus.dma_transfer);
        let token = a.export_save_state();
        let mapping = a.cartridge.mapper.cpu_read(0x8000);
        a.bus_write(0x8000, 6); a.bus_write(0x8001, 5);
        assert_ne!(a.cartridge.mapper.cpu_read(0x8000), mapping);
        for _ in 0..2 { a.frame(); }
        assert!(a.import_save_state(&token));
        assert_same_hardware(&mut a, &mut b);
        for _ in 0..5 {
            a.frame(); b.frame();
            assert_same_hardware(&mut a, &mut b);
        }
        // Loading the same token twice must not have mutated the stored clone.
        assert!(a.import_save_state(&token));
        assert_eq!(a.cartridge.mapper.cpu_read(0x8000), mapping);
    }

    #[test]
    fn temporary_state_rejects_legacy_malformed_expired_and_reloaded_tokens_atomically() {
        let rom = nrom_with_program(&[0x4c, 0x00, 0x80]);
        let mut emu = Emulator::new();
        assert!(emu.load_rom(&rom));
        let token = emu.export_save_state();
        let legacy = emu.export_state_binary().iter().map(|v| format!("{v:02x}")).collect::<String>();
        assert_eq!(token.split('#').next(), Some(legacy.as_str()), "read-only diagnostic prefix remains compatible");
        let before = emu.export_state_binary();
        emu.text_observer.enabled = true;
        emu.text_observer.push(1, 42, 1, 3);
        for invalid in ["", "z", "NES-TEMP-2:invalid", &legacy, &legacy[..4138], &token[..token.len() - 1]] {
            assert!(!emu.import_save_state(invalid));
            assert_eq!(emu.export_state_binary(), before);
        }
        assert_eq!(emu.text_observer.take(), vec![1, 42, 1, 3], "failed imports must not reset observers");
        let mut other = Emulator::new();
        assert!(other.load_rom(&rom));
        assert!(!other.import_save_state(&token), "no snapshot in the other instance");
        for _ in 0..TEMP_STATE_LIMIT { emu.export_save_state(); }
        assert_eq!(emu.temporary_states.borrow().len(), TEMP_STATE_LIMIT);
        assert!(!emu.import_save_state(&token), "oldest snapshot evicted");
        let latest = emu.export_save_state();
        assert!(emu.import_save_state(&latest));
        assert!(emu.load_rom(&rom));
        assert!(!emu.import_save_state(&latest), "same filename/ROM reload still invalidates tokens");
        assert_ne!(emu.export_save_state(), token, "generation cannot be reused on reload");
    }

    #[test]
    fn temporary_state_user_slots_survive_overwrites_and_diagnostics() {
        let rom = nrom_with_program(&[0xe6, 0, 0x4c, 0, 0x80]);
        let mut emu = Emulator::new();
        let mut control = Emulator::new();
        assert!(emu.export_save_state_for_slot(0).is_empty());
        assert!(emu.load_rom(&rom));
        assert!(control.load_rom(&rom));
        let saved = emu.export_save_state_for_slot(1);
        let replaced = emu.export_save_state_for_slot(0);
        for _ in 0..40 {
            emu.frame();
            emu.export_save_state_for_slot(0);
            emu.export_save_state();
        }
        assert_eq!(emu.temporary_slots.borrow().len(), 2);
        assert_eq!(emu.temporary_states.borrow().len(), TEMP_STATE_LIMIT);
        assert!(!emu.import_save_state(&replaced));
        assert!(emu.export_save_state_for_slot(16).is_empty());
        assert!(emu.import_save_state(&saved));
        assert_same_hardware(&mut emu, &mut control);
        for _ in 0..5 {
            emu.frame(); control.frame();
            assert_same_hardware(&mut emu, &mut control);
        }
        emu.reset();
        assert!(emu.import_save_state(&saved));
        emu.clear_game_profile();
        assert!(!emu.import_save_state(&saved));
        let saved = emu.export_save_state_for_slot(1);
        assert!(emu.load_rom(&rom));
        assert!(!emu.import_save_state(&saved));
    }

    #[test]
    #[ignore = "requires local original CT2 ROM"]
    fn ct2_temporary_state_restores_original_game_exactly() {
        let rom = std::fs::read("../roms/Captain Tsubasa II - Super Striker (Japan).nes").unwrap();
        let mut restored = Emulator::new(); let mut control = Emulator::new();
        assert!(restored.load_rom(&rom)); assert!(control.load_rom(&rom));
        for _ in 0..300 { restored.frame(); control.frame(); }
        let saved = restored.export_save_state();
        let saved_mapper = restored.cartridge.mapper.trace_state();
        for frame in 300..1800 {
            restored.set_button(0, 3, (600..604).contains(&frame) || (900..904).contains(&frame));
            restored.set_button(0, 0, frame >= 1100 && frame % 120 < 4);
            restored.frame();
        }
        assert_ne!(restored.cartridge.mapper.trace_state(), saved_mapper);
        assert!(restored.import_save_state(&saved));
        assert_same_hardware(&mut restored, &mut control);
        for frame in 300..900 {
            for emu in [&mut restored, &mut control] {
                emu.set_button(0, 3, (600..604).contains(&frame));
                emu.frame();
            }
            assert_same_hardware(&mut restored, &mut control);
            restored.consume_audio_samples(); control.consume_audio_samples();
        }
        assert!(restored.import_save_state(&saved), "snapshot remains reusable");
        println!("Original CT2: complete restore and 600 subsequent frames/audio/mapper states match control");
    }

    #[test]
    #[ignore = "requires local original CT2 ROM"]
    fn ct2_save_state_legacy_mapper_evidence() {
        let rom = std::fs::read("../roms/Captain Tsubasa II - Super Striker (Japan).nes").unwrap();
        let mut emu = Emulator::new();
        assert!(emu.load_rom(&rom));
        for _ in 0..300 { emu.frame(); }
        let saved = emu.export_state_binary();
        let mapper = emu.cartridge.mapper.trace_state().unwrap();
        let clock = emu.system_clock;
        let pc = emu.cpu.pc;
        let mapping = emu.cartridge.mapper.cpu_read(pc);
        for frame in 300..1800 {
            emu.set_button(0, 3, (600..604).contains(&frame) || (900..904).contains(&frame));
            emu.set_button(0, 0, frame >= 1100 && frame % 120 < 4);
            emu.frame();
        }
        let later_mapper = emu.cartridge.mapper.trace_state().unwrap();
        println!("saved PC={pc:04X}, mapping={mapping:?}, mapper={mapper:?}, clock={clock}; later mapper={later_mapper:?}, clock={}", emu.system_clock);
        assert!(emu.import_state_binary(&saved));
        println!("legacy restored PC={:04X}, mapping={:?}, mapper={:?}, clock={}", emu.cpu.pc, emu.cartridge.mapper.cpu_read(emu.cpu.pc), emu.cartridge.mapper.trace_state(), emu.system_clock);
        assert_eq!(emu.cartridge.mapper.trace_state(), Some(later_mapper));
        assert_ne!(mapper, later_mapper);
        // This real frame-boundary case retains the same PRG bank; it proves
        // CHR/IRQ/timing omission, NOT a wrong-PRG-bank CPU crash.
        assert_eq!(emu.cartridge.mapper.cpu_read(pc), mapping);
        assert_ne!(emu.system_clock, clock);
        for _ in 0..120 { emu.frame(); }
        println!("120 frames after legacy restore: {}", emu.debug_state());
        emu.reset();
        assert!(emu.import_state_binary(&saved));
        assert_ne!(emu.cartridge.mapper.cpu_read(pc), mapping);
        println!("legacy restore after reset: PC={pc:04X}, expected PRG={mapping:?}, actual PRG={:?}",
            emu.cartridge.mapper.cpu_read(pc));
    }

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

    fn profile_json(rom: &[u8], expected_prg: u8) -> String {
        format!(r#"{{
            "schemaVersion": 1,
            "id": "test-profile",
            "game": {{"sha256": "{}", "mapper": 0}},
            "prgReadOverlays": [
                {{"id": "program-byte", "offset": 0, "expectedOriginal": {}, "value": 169}}
            ],
            "chrReadOverlays": [
                {{"id": "font-byte", "offset": 0, "expectedOriginal": 0, "value": 255}}
            ],
            "memoryWrites": [
                {{"id": "reset-value", "space": "cpuRam", "address": 16, "value": 51, "apply": "reset"}},
                {{"id": "frame-value", "space": "prgRam", "address": 24576, "value": 68, "apply": "frame"}}
            ]
        }}"#, sha256_hex(rom), expected_prg)
    }

    #[test]
    fn profile_applies_overlays_and_timed_memory_writes() {
        let rom = nrom_with_program(&[0xEA]);
        let mut emulator = Emulator::new();
        assert!(emulator.load_rom(&rom));
        emulator.load_game_profile(&profile_json(&rom, 0xEA)).unwrap();

        assert_eq!(emulator.active_game_profile_id(), "test-profile");
        assert_eq!(emulator.cartridge.cpu_read(0x8000), 0xA9);
        assert_eq!(emulator.cartridge.prg_rom[0], 0xEA);
        assert_eq!(emulator.bus.ram[0x10], 0x33);

        emulator.apply_profile_writes(WriteTiming::Frame);
        assert_eq!(emulator.cartridge.prg_ram[0], 0x44);
    }

    #[test]
    fn profile_rejection_is_atomic_and_new_rom_clears_active_profile() {
        let rom = nrom_with_program(&[0xEA]);
        let mut emulator = Emulator::new();
        assert!(emulator.load_rom(&rom));

        assert!(emulator.load_game_profile(&profile_json(&rom, 0x00)).is_err());
        assert_eq!(emulator.active_game_profile_id(), "");
        assert_eq!(emulator.cartridge.cpu_read(0x8000), 0xEA);

        emulator.load_game_profile(&profile_json(&rom, 0xEA)).unwrap();
        assert!(emulator.load_rom(&rom));
        assert_eq!(emulator.active_game_profile_id(), "");
        assert_eq!(emulator.cartridge.cpu_read(0x8000), 0xEA);
    }

    fn set_zombie_mmc1_register(emulator: &mut Emulator, address: u16, value: u8) {
        for bit in 0..5 {
            emulator.cartridge.cpu_write(address, (value >> bit) & 0x01);
        }
    }

    #[test]
    #[ignore]
    fn trace_zombie_hunter_bank6_generation_checkpoint() {
        let path = "../roms/Zombie Hunter (Japan).nes";
        let rom = std::fs::read(path).expect("Zombie Hunter ROM must be present");
        let mut emulator = Emulator::new();
        assert!(emulator.load_rom(&rom), "failed to load {path}");

        set_zombie_mmc1_register(&mut emulator, 0x9FFF, 0x12);
        set_zombie_mmc1_register(&mut emulator, 0xBFFF, 0x06);
        set_zombie_mmc1_register(&mut emulator, 0xDFFF, 0x06);
        set_zombie_mmc1_register(&mut emulator, 0xFFFF, 0x06);
        emulator.sync_mapper_to_ppu();

        emulator.bus.ram[0x06A0] = 0;
        emulator.bus.ram[0x06A1] = 1;
        emulator.bus.ram[0x06A2] = 0;
        emulator.bus.ram[0x06A3] = 0;
        emulator.bus.ram[0x06A6] = 0;
        emulator.bus.ram[0x06A8] = 0;
        emulator.bus.ram[0x06A9] = 0;
        emulator.bus.ram[0x06AA] = 0;
        emulator.bus.ram[0x00AB] = 0;
        emulator.bus.ram[0x00A6] = 0;
        emulator.bus.ram[0x0034] = 0;
        emulator.bus.ram[0x0035] = 0;
        emulator.bus.ram[0x003A] = 0;
        emulator.bus.ram[0x0038] = 0;
        emulator.bus.ram[0x01C0] = 0xC7;
        emulator.bus.ram[0x0300..0x0400].fill(0);

        emulator.cpu.pc = 0x860E;
        emulator.cpu.sp = 0xCF;
        emulator.cpu.status = 0x24;
        emulator.cpu.a = 0;
        emulator.cpu.x = 0;
        emulator.cpu.y = 0;
        emulator.cpu.cycles = 0;
        emulator.cpu.nmi_pending = false;
        emulator.cpu.irq_pending = false;

        let initial_mapper = emulator
            .cartridge
            .mapper
            .trace_mapper1_state()
            .expect("Zombie Hunter checkpoint must use MMC1");
        assert_eq!(initial_mapper.control, 0x12);
        assert_eq!(initial_mapper.prg_bank, 0x06);
        assert_eq!(
            emulator.cartridge.mapper.cpu_read(0x860E),
            Some(0x1860E),
            "checkpoint must fetch $860E from PRG bank 6"
        );

        emulator.mapper_cpu_writes.clear();
        emulator.zombie_candidate_read_trace.clear();
        for _ in 0..89_342 {
            emulator.clock();
            if emulator
                .zombie_generation_trace
                .iter()
                .any(|event| event.pc == 0x86B0)
                && !emulator.cpu_ram_write_trace.is_empty()
            {
                break;
            }
        }

        let generated_buffer = emulator.bus.ram[0x0300..0x0400].to_vec();
        let generated_cursor = emulator.bus.ram[0x00A6];

        let generation_events: Vec<(u16, u32, Option<Mapper1TraceState>)> = emulator
            .zombie_generation_trace
            .iter()
            .map(|event| (event.pc, event.physical_prg_offset, event.mapper1_state))
            .collect();
        let buffer_writes: Vec<(u16, u8)> = emulator
            .cpu_ram_write_trace
            .iter()
            .filter_map(|&(_, _, address, data, _)| {
                (0x0300..0x0400).contains(&address).then_some((address, data))
            })
            .collect();
        let mapper_writes: Vec<(u64, u8)> = emulator
            .mapper_cpu_writes
            .iter()
            .filter_map(|&(clock, address, data)| (address == 0xFFFF).then_some((clock, data)))
            .collect();
        let trampoline_reads: Vec<(u64, u32, u8, Option<Mapper1TraceState>)> = emulator
            .zombie_candidate_read_trace
            .iter()
            .filter_map(|event| {
                (event.cpu_address == 0xFEFD).then_some((event.clock, event.physical_prg_offset, event.value, event.mapper1_state))
            })
            .collect();

        println!(
            "generation_checkpoint mapper={:?} events={generation_events:?} writes={buffer_writes:?} mapper_writes={mapper_writes:?} trampoline_reads={trampoline_reads:?} final_pc=${:04X} final_sp=${:02X}",
            emulator.cartridge.mapper.trace_mapper1_state(),
            emulator.cpu.pc,
            emulator.cpu.sp,
        );
        assert!(generation_events.iter().any(|event| event.0 == 0x860E), "checkpoint did not enter $860E");
        assert!(generation_events.iter().any(|event| event.0 == 0x862D), "checkpoint did not enter $862D");
        assert!(
            generation_events.iter().any(|event| event.0 == 0x86B0),
            "checkpoint did not complete a generation pass"
        );
        assert!(!buffer_writes.is_empty(), "checkpoint did not write a $0300 stream");

        emulator.bus.ram[0x0300..0x0400].copy_from_slice(&generated_buffer);
        emulator.bus.ram[0x00A6] = generated_cursor;
        emulator.zombie_text_trace.clear();
        emulator.ppu_nametable_write_trace.clear();
        emulator.cpu_ram_write_trace.clear();
        emulator.cpu.pc = 0xF4A6;
        emulator.cpu.sp = 0xCF;
        emulator.cpu.cycles = 0;
        emulator.cpu.nmi_pending = false;
        emulator.cpu.irq_pending = false;
        for _ in 0..20_000 {
            emulator.clock();
            if emulator.zombie_text_trace.iter().any(|event| event.pc == 0xF4A6)
                && (emulator.zombie_text_trace.iter().any(|event| event.pc == 0xF49E)
                    || !emulator.ppu_nametable_write_trace.is_empty())
            {
                break;
            }
        }

        let renderer_event = emulator
            .zombie_text_trace
            .iter()
            .find(|event| event.pc == 0xF4A6)
            .expect("renderer checkpoint must enter $F4A6");
        let renderer_buffer_prefix = renderer_event.buffer.as_ref().map(|buffer| {
            buffer[..buffer.len().min(96)]
                .iter()
                .map(|byte| format!("{byte:02X}"))
                .collect::<Vec<_>>()
                .join(" ")
        });
        println!(
            "renderer_checkpoint clock={} physical=${:05X} cursor=${:02X} buffer={renderer_buffer_prefix:?} ppu_writes={:?}",
            renderer_event.clock,
            renderer_event.physical_prg_offset,
            renderer_event.buffer_cursor,
            emulator.ppu_nametable_write_trace,
        );
    }

    #[test]
    #[ignore]
    fn trace_zombie_hunter_static_source_renderer_checkpoints() {
        let path = "../roms/Zombie Hunter (Japan).nes";
        let rom = std::fs::read(path).expect("Zombie Hunter ROM must be present");
        let candidate_sources = [0x8F74, 0x8F81, 0x91C8, 0x91D5];

        for source_address in candidate_sources {
            let mut emulator = Emulator::new();
            assert!(emulator.load_rom(&rom), "failed to load {path}");
            set_zombie_mmc1_register(&mut emulator, 0x9FFF, 0x0E);
            set_zombie_mmc1_register(&mut emulator, 0xBFFF, 0x06);
            set_zombie_mmc1_register(&mut emulator, 0xDFFF, 0x06);
            set_zombie_mmc1_register(&mut emulator, 0xFFFF, 0x00);
            emulator.sync_mapper_to_ppu();

            emulator.bus.ram[0x00A6] = 0;
            emulator.bus.ram[0x002A] = 0;
            emulator.bus.ram[0x0300..0x0400].fill(0);
            emulator.cpu.pc = 0x8B56;
            emulator.cpu.sp = 0xCF;
            emulator.cpu.status = 0x24;
            emulator.cpu.a = (source_address >> 8) as u8;
            emulator.cpu.x = source_address as u8;
            emulator.cpu.y = 0;
            emulator.cpu.cycles = 0;
            emulator.cpu.nmi_pending = false;
            emulator.cpu.irq_pending = false;

            for _ in 0..20_000 {
                emulator.clock();
                if emulator.zombie_text_trace.iter().any(|event| event.pc == 0xF4A6)
                    && (emulator.zombie_text_trace.iter().any(|event| event.pc == 0xF49E)
                        || !emulator.ppu_nametable_write_trace.is_empty())
                {
                    break;
                }
            }

            let source_event = emulator
                .zombie_text_trace
                .iter()
                .find(|event| event.pc == 0x8B56 && event.source_pointer == Some(source_address))
                .expect("static source checkpoint must enter $8B56 with its candidate pointer");
            let renderer_event = emulator
                .zombie_text_trace
                .iter()
                .find(|event| event.pc == 0xF4A6)
                .expect("static source checkpoint must enter $F4A6");
            let buffer_prefix = renderer_event.buffer.as_ref().map(|buffer| {
                buffer[..buffer.len().min(64)]
                    .iter()
                    .map(|byte| format!("{byte:02X}"))
                    .collect::<Vec<_>>()
                    .join(" ")
            });
            let ppu_writes = emulator
                .ppu_nametable_write_trace
                .iter()
                .map(|&(_, instruction_pc, ppu_address, data, physical_prg_offset)| {
                    (instruction_pc, ppu_address, data, physical_prg_offset)
                })
                .take(16)
                .collect::<Vec<_>>();

            println!(
                "static_source_checkpoint source=${source_address:04X} source_prg={:?} renderer_clock={} renderer_physical=${:05X} buffer={buffer_prefix:?} ppu_writes={ppu_writes:?}",
                source_event.source_prg_offset,
                renderer_event.clock,
                renderer_event.physical_prg_offset,
            );
            assert_eq!(source_event.source_prg_offset, Some(u32::from(source_address - 0x8000)));
        }
    }

    #[test]
    #[ignore]
    fn trace_zombie_hunter_text_path() {
        let path = "../roms/Zombie Hunter (Japan).nes";
        let rom = std::fs::read(path).expect("Zombie Hunter ROM must be present");
        let mut emulator = Emulator::new();
        assert!(emulator.load_rom(&rom), "failed to load {path}");

        let frame_count = std::env::var("ZOMBIE_TRACE_FRAMES")
            .ok()
            .and_then(|value| value.parse::<usize>().ok())
            .filter(|&value| value > 0)
            .unwrap_or(120);
        let input_events: Vec<(usize, u8)> = std::env::var("ZOMBIE_TRACE_INPUT")
            .unwrap_or_default()
            .split(',')
            .filter_map(|event| {
                let (frame, button) = event.split_once(':')?;
                let frame = frame.parse::<usize>().ok()?;
                let button = match button.to_ascii_uppercase().as_str() {
                    "A" => crate::controller::BTN_A,
                    "B" => crate::controller::BTN_B,
                    "SELECT" => crate::controller::BTN_SELECT,
                    "START" => crate::controller::BTN_START,
                    "UP" => crate::controller::BTN_UP,
                    "DOWN" => crate::controller::BTN_DOWN,
                    "LEFT" => crate::controller::BTN_LEFT,
                    "RIGHT" => crate::controller::BTN_RIGHT,
                    _ => return None,
                };
                Some((frame, button))
            })
            .collect();

        for frame in 0..frame_count {
            for &(event_frame, button) in &input_events {
                if event_frame == frame {
                    emulator.set_button(0, button, true);
                }
                if event_frame + 1 == frame {
                    emulator.set_button(0, button, false);
                }
            }
            emulator.ppu_nametable_write_trace.clear();
            emulator.cpu_ram_write_trace.clear();
            emulator.zombie_text_trace.clear();
            emulator.zombie_input_trace.clear();
            emulator.zombie_candidate_read_trace.clear();
            emulator.zombie_mode_trace.clear();
            emulator.frame();

            if frame == 16 || frame == 48 {
                let output_name = if frame == 16 {
                    "zombie-hunter-trace-frame-16.bmp"
                } else {
                    "zombie-hunter-trace-frame-48.bmp"
                };
                write_frame_bmp(
                    std::path::Path::new("../artifacts").join(output_name).as_path(),
                    &emulator.ppu.frame_buffer,
                );
            }

            let mut ppu_writers = std::collections::BTreeMap::new();
            for &(_, instruction_pc, ppu_address, data, physical_prg_offset) in &emulator.ppu_nametable_write_trace {
                let entry = ppu_writers.entry(instruction_pc).or_insert((0usize, 0usize, 0u16, 0u16, physical_prg_offset));
                entry.0 += 1;
                entry.1 += usize::from(data != 0);
                entry.2 = entry.2.min(ppu_address);
                entry.3 = entry.3.max(ppu_address);
            }
            let mut ram_writers = std::collections::BTreeMap::new();
            for &(_, instruction_pc, address, data, physical_prg_offset) in &emulator.cpu_ram_write_trace {
                let entry = ram_writers.entry(instruction_pc).or_insert((0usize, 0xFFFFu16, 0u16, 0u8, physical_prg_offset));
                entry.0 += 1;
                entry.1 = entry.1.min(address);
                entry.2 = entry.2.max(address);
                entry.3 = data;
            }
            let state_writes = emulator
                .cpu_ram_write_trace
                .iter()
                .filter(|&&(_, _, address, _, _)| {
                    matches!(
                        address,
                        0x0028
                            | 0x0029
                            | 0x002A
                            | 0x002B
                            | 0x0038
                            | 0x0039
                            | 0x003A
                            | 0x003B
                            | 0x003E
                            | 0x003F
                            | 0x00A3
                            | 0x00A4
                            | 0x00AB
                            | 0x00F4
                            | 0x00F5
                            | 0x00F7
                            | 0x0610
                            | 0x06C1
                    )
                })
                .map(|&(clock, instruction_pc, address, data, physical_prg_offset)| {
                    (clock, instruction_pc, address, data, physical_prg_offset)
                })
                .collect::<Vec<_>>();
            if !ppu_writers.is_empty() || !ram_writers.is_empty() {
                println!(
                    "frame={frame:03} pc={:04X} ppu_writers={ppu_writers:?} ram_writers={ram_writers:?} state_writes={state_writes:?} ram0300={:02X?}",
                    emulator.cpu.pc,
                    &emulator.bus.ram[0x0300..0x0340],
                );
            }
            for (event_index, event) in emulator.zombie_text_trace.iter().enumerate() {
                let buffer_prefix = event.buffer.as_ref().map(|buffer| {
                    buffer[..buffer.len().min(128)]
                        .iter()
                        .map(|byte| format!("{byte:02X}"))
                        .collect::<Vec<_>>()
                        .join(" ")
                });
                let next_clock = emulator
                    .zombie_text_trace
                    .get(event_index + 1)
                    .map(|next_event| next_event.clock)
                    .unwrap_or(u64::MAX);
                let ppu_writes = if event.pc == 0xF4A6 {
                    emulator
                        .ppu_nametable_write_trace
                        .iter()
                        .filter(|&&(clock, _, _, _, _)| clock >= event.clock && clock < next_clock)
                        .map(|&(_, instruction_pc, ppu_address, data, _)| {
                            let pattern_address = (if event.ppu_ctrl & 0x10 != 0 { 0x1000 } else { 0 })
                                + usize::from(data) * 16;
                            let bank = pattern_address / 0x0400;
                            let chr_offset = event.chr_bank_offsets[bank]
                                + (pattern_address % 0x0400) as u32;
                            (instruction_pc, ppu_address, data, chr_offset)
                        })
                        .take(32)
                        .collect::<Vec<_>>()
                } else {
                    Vec::new()
                };
                println!(
                    "frame={frame:03} text_event clock={} pc=${:04X} physical=${:05X} source={:?} source_prg={:?} cursor=${:02X} ctrl=${:02X} chr={:?} mmc1={:?} ppu={ppu_writes:?} buffer={buffer_prefix:?}",
                    event.clock,
                    event.pc,
                    event.physical_prg_offset,
                    event.source_pointer.map(|pointer| format!("${pointer:04X}")),
                    event.source_prg_offset.map(|offset| format!("${offset:05X}")),
                    event.buffer_cursor,
                    event.ppu_ctrl,
                    event.chr_bank_offsets,
                    event.mapper1_state,
                );
            }
            for (event_index, event) in emulator.zombie_generation_trace.iter().enumerate() {
                let next_clock = emulator
                    .zombie_generation_trace
                    .get(event_index + 1)
                    .map(|next_event| next_event.clock)
                    .unwrap_or(u64::MAX);
                let ram_writes = emulator
                    .cpu_ram_write_trace
                    .iter()
                    .filter(|&&(clock, _, address, _, _)| {
                        clock >= event.clock
                            && clock < next_clock
                            && (0x0300..0x0400).contains(&address)
                    })
                    .map(|&(_, instruction_pc, address, data, physical_prg_offset)| {
                        (instruction_pc, address, data, physical_prg_offset)
                    })
                    .collect::<Vec<_>>();
                let renderer_events = emulator
                    .zombie_text_trace
                    .iter()
                    .filter(|renderer| {
                        renderer.clock >= event.clock
                            && renderer.clock < next_clock
                            && renderer.pc == 0xF4A6
                    })
                    .map(|renderer| (renderer.clock, renderer.physical_prg_offset))
                    .collect::<Vec<_>>();
                println!(
                    "frame={frame:03} generation_event clock={} pc=${:04X} physical=${:05X} regs=[A:${:02X} X:${:02X} Y:${:02X}] source=${:04X} source_prg={:?} cursor=${:02X} states=[06A0:${:02X} 06A1:${:02X} 06A2:${:02X} 06A3:${:02X} 06A6:${:02X} 06A8:${:02X} 06A9:${:02X} 06AA:${:02X}] ram_writes={ram_writes:?} renderer={renderer_events:?} chr={:?} ctrl=${:02X} mmc1={:?}",
                    event.clock,
                    event.pc,
                    event.physical_prg_offset,
                    event.a,
                    event.x,
                    event.y,
                    event.source_pointer,
                    event.source_prg_offset,
                    event.buffer_cursor,
                    event.state_06a0,
                    event.state_06a1,
                    event.state_06a2,
                    event.state_06a3,
                    event.state_06a6,
                    event.state_06a8,
                    event.state_06a9,
                    event.state_06aa,
                    event.chr_bank_offsets,
                    event.ppu_ctrl,
                    event.mapper1_state,
                );
            }
            for event in &emulator.zombie_input_trace {
                println!(
                    "frame={frame:03} input_event clock={} pc=${:04X} physical=${:05X} sp=${:02X} stack_return=${:04X} edge=${:02X} current=${:02X} cursor=${:02X} count=${:02X} mode=${:02X} state57=${:02X} state7e=${:02X} statec1=${:02X} state3f=${:02X} state26=${:02X} state2a=${:02X} state28=${:02X} state17=${:02X} state16=${:02X} state29=${:02X} state2b=${:02X} state06c3=${:02X} state06c6=${:02X} state06c7=${:02X} state2c=${:02X} state06c1=${:02X} mmc1={:?}",
                    event.clock,
                    event.pc,
                    event.physical_prg_offset,
                    event.stack_pointer,
                    event.stack_return,
                    event.edge,
                    event.current,
                    event.cursor,
                    event.count,
                    event.mode,
                    event.state_57,
                    event.state_7e,
                    event.state_c1,
                    event.state_3f,
                    event.state_26,
                    event.state_2a,
                    event.state_28,
                    event.state_17,
                    event.state_16,
                    event.state_29,
                    event.state_2b,
                    event.state_06c3,
                    event.state_06c6,
                    event.state_06c7,
                    event.state_2c,
                    event.state_06c1,
                    event.mapper1_state,
                );
            }
            for event in &emulator.zombie_candidate_read_trace {
                println!(
                    "frame={frame:03} candidate_read clock={} pc=${:04X} address=${:04X} physical=${:05X} value=${:02X} mmc1={:?}",
                    event.clock,
                    event.pc,
                    event.cpu_address,
                    event.physical_prg_offset,
                    event.value,
                    event.mapper1_state,
                );
            }
            for event in &emulator.zombie_mode_trace {
                println!(
                    "frame={frame:03} mode_event clock={} pc=${:04X} physical=${:05X} edge=${:02X} current=${:02X} f4=${:02X} f7=${:02X} state0610=${:02X} state3a=${:02X} state38=${:02X} state2a=${:02X} state06c1=${:02X} mmc1={:?}",
                    event.clock,
                    event.pc,
                    event.physical_prg_offset,
                    event.edge,
                    event.current,
                    event.state_f4,
                    event.state_f7,
                    event.state_0610,
                    event.state_3a,
                    event.state_38,
                    event.state_2a,
                    event.state_06c1,
                    event.mapper1_state,
                );
            }
        }
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

    fn write_frame_bmp(path: &std::path::Path, frame_buffer: &[u8]) {
        let width = 256u32;
        let height = 240u32;
        let row_stride = (width * 3).div_ceil(4) * 4;
        let image_size = row_stride * height;
        let file_size = 54 + image_size;
        let mut bmp = Vec::with_capacity(file_size as usize);
        bmp.extend_from_slice(b"BM");
        bmp.extend_from_slice(&file_size.to_le_bytes());
        bmp.extend_from_slice(&[0; 4]);
        bmp.extend_from_slice(&(54u32).to_le_bytes());
        bmp.extend_from_slice(&(40u32).to_le_bytes());
        bmp.extend_from_slice(&(width as i32).to_le_bytes());
        bmp.extend_from_slice(&(-(height as i32)).to_le_bytes());
        bmp.extend_from_slice(&(1u16).to_le_bytes());
        bmp.extend_from_slice(&(24u16).to_le_bytes());
        bmp.extend_from_slice(&[0; 4]);
        bmp.extend_from_slice(&image_size.to_le_bytes());
        bmp.extend_from_slice(&[0; 16]);

        for pixel_y in 0..height {
            let row_start = pixel_y as usize * width as usize * 4;
            for pixel_x in 0..width {
                let pixel_start = row_start + pixel_x as usize * 4;
                bmp.extend_from_slice(&[
                    frame_buffer[pixel_start + 2],
                    frame_buffer[pixel_start + 1],
                    frame_buffer[pixel_start],
                ]);
            }
            bmp.resize(bmp.len() + (row_stride - width * 3) as usize, 0);
        }
        std::fs::write(path, bmp).expect("frame trace image must be writable");
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
    fn trace_captain_tsubasa_chr_reads() {
        let path = "../roms/Captain Tsubasa II - Super Striker (Japan).nes";
        let rom = std::fs::read(path).expect("priority ROM must be present");
        let mut emulator = Emulator::new();
        assert!(emulator.load_rom(&rom), "failed to load {path}");

        let mut first_seen = [None; 128];
        for frame_index in 0..180 {
            emulator.ppu.clear_chr_read_counts_for_test();
            emulator.frame();

            let frame_banks: Vec<(usize, u64)> = emulator
                .ppu
                .chr_read_counts
                .iter()
                .enumerate()
                .filter_map(|(physical_bank, &read_count)| {
                    (read_count > 0).then_some((physical_bank, read_count))
                })
                .collect();
            for &(physical_bank, _) in &frame_banks {
                if first_seen[physical_bank].is_none() {
                    first_seen[physical_bank] = Some(frame_index);
                }
            }

            if frame_index < 12 || frame_index == 30 || frame_index == 60 || frame_index == 120 {
                println!(
                    "{path}: frame={frame_index:03} chr={:?} reads={frame_banks:?}",
                    emulator.ppu.chr_bank_offsets_for_test(),
                );
            }
        }

        let observed_banks: Vec<(usize, usize)> = first_seen
            .iter()
            .enumerate()
            .filter_map(|(physical_bank, first_frame)| {
                first_frame.map(|frame| (physical_bank, frame))
            })
            .collect();
        println!("{path}: first_seen_physical_chr_banks={observed_banks:?}");
        assert!(!observed_banks.is_empty(), "canonical ROM did not fetch CHR data");
        assert!(
            observed_banks.iter().any(|&(physical_bank, _)| physical_bank >= 2),
            "canonical runtime never fetched a physical CHR bank beyond the original font area"
        );
    }

    #[test]
    #[ignore]
    fn trace_captain_tsubasa_start_input() {
        let path = "../roms/Captain Tsubasa II - Super Striker (Japan).nes";
        let rom = std::fs::read(path).expect("priority ROM must be present");
        let mut emulator = Emulator::new();
        assert!(emulator.load_rom(&rom), "failed to load {path}");
        let output_dir = std::path::Path::new("target/captain-tsubasa-input-trace");
        std::fs::create_dir_all(output_dir).expect("frame trace directory must be writable");
        let frame_count = std::env::var("NES_CAPTAIN_TRACE_FRAMES")
            .ok()
            .and_then(|value| value.parse::<usize>().ok())
            .filter(|&value| value > 0)
            .unwrap_or(5000);
        let start_frame = std::env::var("NES_CAPTAIN_TRACE_START_FRAME")
            .ok()
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(90);

        let input_frames: Vec<(usize, u8)> = std::iter::once((start_frame, crate::controller::BTN_START))
            .chain((60usize..=frame_count).step_by(30).map(|frame| (frame, crate::controller::BTN_A)))
            .collect();
        let mut first_seen_physical_chr_banks = [None; 128];
        for frame_index in 0usize..=frame_count {
            if let Some((_, button)) = input_frames.iter().find(|(frame, _)| *frame == frame_index) {
                emulator.set_button(1, *button, true);
            }
            if frame_index > 0 {
                if let Some((_, button)) = input_frames.iter().find(|(frame, _)| *frame == frame_index - 1) {
                    emulator.set_button(1, *button, false);
                }
            }

            emulator.ppu.clear_chr_read_counts_for_test();
            emulator.frame();
            if frame_index == frame_count || matches!(frame_index, 0 | 30 | 60 | 90 | 120 | 150 | 180 | 240 | 300 | 360 | 390 | 600 | 900 | 1200 | 1500 | 1800 | 2100 | 2400 | 2700 | 3000 | 3030 | 3300 | 3600 | 5000) {
                write_frame_bmp(
                    &output_dir.join(format!("frame-{frame_index:03}.bmp")),
                    &emulator.ppu.frame_buffer,
                );
            }
            let frame_hash = framebuffer_summary(&emulator.ppu.frame_buffer, None).0;
            let frame_reads: Vec<(usize, u64)> = emulator
                .ppu
                .chr_read_counts
                .iter()
                .enumerate()
                .filter_map(|(physical_bank, &read_count)| {
                    (read_count > 0).then_some((physical_bank, read_count))
                })
                .collect();
            for &(physical_bank, _) in &frame_reads {
                if first_seen_physical_chr_banks[physical_bank].is_none() {
                    first_seen_physical_chr_banks[physical_bank] = Some(frame_index);
                }
            }
            let nonzero_tiles = emulator.ppu.nametable.iter().filter(|&&tile| tile != 0).count();
            let probe_nametable = matches!(frame_index, 60 | 62 | 120);
            let nonzero_tile_values = if probe_nametable {
                emulator.ppu.nametable
                    .iter()
                    .enumerate()
                    .filter_map(|(index, &tile)| (tile != 0).then_some((index, tile)))
                    .collect::<Vec<_>>()
            } else {
                Vec::new()
            };
            let tile_histogram = if probe_nametable {
                let mut counts = [0usize; 256];
                for &tile in &emulator.ppu.nametable {
                    counts[tile as usize] += 1;
                }
                counts
                    .into_iter()
                    .enumerate()
                    .filter_map(|(tile, count)| (count > 0).then_some((tile as u8, count)))
                    .collect::<Vec<_>>()
            } else {
                Vec::new()
            };
            let input_frame = input_frames.iter().any(|(frame, _)| *frame == frame_index);
            if frame_index == frame_count || input_frame || matches!(frame_index, 0 | 30 | 60 | 90 | 120 | 150 | 180 | 240 | 300 | 360 | 390 | 600 | 900 | 1200 | 1500 | 1800 | 2100 | 2400 | 2700 | 3000 | 3030 | 3300 | 3600 | 5000) {
                println!(
                    "{path}: frame={frame_index:03} pc={:04X} hash={frame_hash:016X} ppu=({:02X},{:02X}) chr={:?} reads={frame_reads:?} nt_nonzero={nonzero_tiles} nt_head={:02X?} ram={:02X?} nt_values={nonzero_tile_values:?} nt_hist={tile_histogram:?}",
                    emulator.cpu.pc,
                    emulator.ppu.ctrl,
                    emulator.ppu.mask,
                    emulator.ppu.chr_bank_offsets_for_test(),
                    &emulator.ppu.nametable[..64],
                    &emulator.bus.ram[0x0000..0x0040],
                );
            }
        }
        println!(
            "{path}: resolver_calls={} first={:?}",
            emulator.resolver_calls.len(),
            &emulator.resolver_calls[..emulator.resolver_calls.len().min(64)],
        );
        let observed_banks: Vec<(usize, usize)> = first_seen_physical_chr_banks
            .iter()
            .enumerate()
            .filter_map(|(physical_bank, first_frame)| {
                first_frame.map(|frame| (physical_bank, frame))
            })
            .collect();
        println!("{path}: first_seen_physical_chr_banks={observed_banks:?}");
        let mut nametable_write_counts = std::collections::BTreeMap::new();
        let mut nonzero_nametable_write_counts = std::collections::BTreeMap::new();
        let mut first_nonzero_nametable_writes = Vec::new();
        for &(_, instruction_pc, _, _, _) in &emulator.ppu_nametable_write_trace {
            *nametable_write_counts.entry(instruction_pc).or_insert(0usize) += 1;
        }
        for &(clock, instruction_pc, ppu_address, data, _) in &emulator.ppu_nametable_write_trace {
            if data == 0 {
                continue;
            }
            *nonzero_nametable_write_counts.entry(instruction_pc).or_insert(0usize) += 1;
            if first_nonzero_nametable_writes.len() < 64 {
                first_nonzero_nametable_writes.push(format!(
                    "clock={clock} frame={} pc={instruction_pc:04X} v={ppu_address:04X} data={data:02X}",
                    clock / 89342,
                ));
            }
        }
        println!(
            "{path}: nametable_writes={} writers={nametable_write_counts:?} first={:?}",
            emulator.ppu_nametable_write_trace.len(),
            &emulator.ppu_nametable_write_trace[..emulator.ppu_nametable_write_trace.len().min(64)],
        );
        println!(
            "{path}: nonzero_nametable_writes={} writers={nonzero_nametable_write_counts:?} first={first_nonzero_nametable_writes:?}",
            emulator.ppu_nametable_write_trace.iter().filter(|&&(_, _, _, data, _)| data != 0).count(),
        );
        let checkpoint_frames = [390usize, 600, 900, 3000, 5000];
        let mut checkpoint_writers = std::collections::BTreeMap::new();
        for &(clock, instruction_pc, ppu_address, data, physical_prg_offset) in &emulator.ppu_nametable_write_trace {
            if data == 0 {
                continue;
            }
            let frame = (clock / 89342) as usize;
            if checkpoint_frames.contains(&frame) {
                let writer = checkpoint_writers.entry(frame).or_insert_with(std::collections::BTreeMap::new);
                let summary = writer.entry(instruction_pc).or_insert((0usize, ppu_address, ppu_address, physical_prg_offset));
                summary.0 += 1;
                summary.1 = summary.1.min(ppu_address);
                summary.2 = summary.2.max(ppu_address);
            }
        }
        println!("{path}: checkpoint_nametable_writers={checkpoint_writers:?}");
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
