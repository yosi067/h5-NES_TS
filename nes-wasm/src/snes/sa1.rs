/// SA-1 shared state and memory windows.
///
/// The SA-1 DMA scheduler remains separate from this state model. Keeping the
/// register and RAM contract isolated makes it possible to validate the
/// cartridge bus independently from native SA-1 execution.
use super::cpu::{flags, Cpu65816};

pub const IRAM_SIZE: usize = 0x800;
pub const BWRAM_SIZE: usize = 0x40000;
pub const SA1_IRQ_SOURCE: u8 = 0x80;
pub const SA1_TIMER_SOURCE: u8 = 0x40;
pub const SA1_DMA_SOURCE: u8 = 0x20;
pub const SA1_NMI_SOURCE: u8 = 0x10;
const SA1_LINEAR_H_LIMIT: u32 = 0x800;
const SA1_HV_H_LIMIT: u32 = 1364;
const SA1_V_LIMIT: u16 = 262;
const SA1_LINEAR_V_LIMIT: u16 = 0x200;

pub struct Sa1 {
    pub cpu: Cpu65816,
    pub iram: Vec<u8>,
    pub bwram: Vec<u8>,
    pub scnt: u8,
    pub cie: u8,
    pub sic: u8,
    pub sa1_interrupt_enable: u8,
    pub sa1_interrupt_status: u8,
    pub sa1_interrupt_latch: u8,
    pub cfr: u8,
    pub reset_vector_high: u8,
    pub nmi_vector: u16,
    pub irq_vector: u16,
    pub bmaps: [u8; 4],
    pub bwram_bank: u8,
    pub bwram_control: u8,
    pub timer_control: u8,
    pub h_timer: u16,
    pub v_timer: u16,
    pub h_counter: u32,
    pub v_counter: u16,
    pub timer_irq_last_state: bool,
    pub dma_control: u8,
    pub dma_source: u32,
    pub dma_destination: u32,
    pub dma_length: u16,
    pub dma_active: bool,
    pub dma_stall_clocks: u32,
    pub char_dma_control: u8,
    pub char_dma_buffer: [u8; 128],
    pub char_dma_index: u8,
    pub char_dma_active: bool,
}

impl Sa1 {
    pub fn new() -> Self {
        Self {
            cpu: Cpu65816::new(),
            iram: vec![0; IRAM_SIZE],
            bwram: vec![0; BWRAM_SIZE],
            scnt: 0,
            cie: 0,
            sic: 0,
            sa1_interrupt_enable: 0,
            sa1_interrupt_status: 0,
            sa1_interrupt_latch: 0,
            cfr: 0,
            reset_vector_high: 0,
            nmi_vector: 0,
            irq_vector: 0,
            bmaps: [0, 1, 2, 3],
            bwram_bank: 0,
            bwram_control: 0,
            timer_control: 0,
            h_timer: 0,
            v_timer: 0,
            h_counter: 0,
            v_counter: 0,
            timer_irq_last_state: false,
            dma_control: 0,
            dma_source: 0,
            dma_destination: 0,
            dma_length: 0,
            dma_active: false,
            dma_stall_clocks: 0,
            char_dma_control: 0,
            char_dma_buffer: [0; 128],
            char_dma_index: 0,
            char_dma_active: false,
        }
    }

    pub fn reset(&mut self) {
        self.cpu = Cpu65816::new();
        self.iram.fill(0);
        self.bwram.fill(0);
        self.scnt = 0x20;
        self.cie = 0;
        self.sic = 0;
        self.sa1_interrupt_enable = 0;
        self.sa1_interrupt_status = 0;
        self.sa1_interrupt_latch = 0;
        self.cfr = 0;
        self.reset_vector_high = 0;
        self.nmi_vector = 0;
        self.irq_vector = 0;
        self.bmaps = [0, 1, 2, 3];
        self.bwram_bank = 0;
        self.bwram_control = 0;
        self.timer_control = 0;
        self.h_timer = 0;
        self.v_timer = 0;
        self.h_counter = 0;
        self.v_counter = 0;
        self.timer_irq_last_state = false;
        self.dma_control = 0;
        self.dma_source = 0;
        self.dma_destination = 0;
        self.dma_length = 0;
        self.dma_active = false;
        self.dma_stall_clocks = 0;
        self.char_dma_control = 0;
        self.char_dma_buffer.fill(0);
        self.char_dma_index = 0;
        self.char_dma_active = false;
    }

    pub fn is_running(&self) -> bool {
        self.scnt & 0x60 == 0
    }

    pub fn reset_vector(&self) -> u16 {
        self.cfr as u16 | ((self.reset_vector_high as u16) << 8)
    }

    fn start_from_reset_vector(&mut self) {
        self.cpu = Cpu65816::new();
        self.cpu.pc = self.reset_vector();
        self.cpu.p = flags::MEM8 | flags::INDEX8 | flags::IRQ_DIS;
    }

    pub fn request_interrupt(&mut self, source: u8) {
        self.sa1_interrupt_status |= source;
    }

    pub fn request_s_cpu_interrupt(&mut self, source: u8) {
        self.sic |= source & 0xA0;
    }

    pub fn s_cpu_interrupt_pending(&self) -> bool {
        self.sic & self.cie & 0xA0 != 0
    }

    pub fn has_pending_nmi(&self) -> bool {
        self.scnt & SA1_NMI_SOURCE != 0
            && self.sa1_interrupt_status & SA1_NMI_SOURCE != 0
            && self.sa1_interrupt_latch & SA1_NMI_SOURCE == 0
    }

    pub fn next_irq_source(&self) -> u8 {
        let enabled = self.sa1_interrupt_enable;
        let pending = self.sa1_interrupt_status & !self.sa1_interrupt_latch;
        if self.scnt & SA1_IRQ_SOURCE != 0 && pending & SA1_IRQ_SOURCE != 0 {
            SA1_IRQ_SOURCE
        } else if enabled & SA1_TIMER_SOURCE != 0 && pending & SA1_TIMER_SOURCE != 0 {
            SA1_TIMER_SOURCE
        } else if enabled & SA1_DMA_SOURCE != 0 && pending & SA1_DMA_SOURCE != 0 {
            SA1_DMA_SOURCE
        } else {
            0
        }
    }

    pub fn acknowledge_interrupt(&mut self, source: u8) {
        self.sa1_interrupt_status |= source;
        self.sa1_interrupt_latch |= source;
    }

    pub fn interrupt_wakes_cpu(&self) -> bool {
        self.has_pending_nmi() || self.next_irq_source() != 0
    }

    pub fn advance_timer(&mut self, master_clocks: u32) {
        if master_clocks == 0 {
            return;
        }

        let h_limit = if self.timer_control & 0x80 != 0 {
            SA1_LINEAR_H_LIMIT
        } else {
            SA1_HV_H_LIMIT
        };
        let h_target = (self.h_timer as u32).saturating_mul(4);
        let old_h = self.h_counter;
        let total = old_h.saturating_add(master_clocks);
        let wraps = total / h_limit;
        self.h_counter = total % h_limit;
        let old_v = self.v_counter;
        let mut v_match = false;
        if wraps != 0 {
            let v_limit = if self.timer_control & 0x80 != 0 {
                SA1_LINEAR_V_LIMIT
            } else {
                SA1_V_LIMIT
            };
            self.v_counter = ((self.v_counter as u32 + wraps) % v_limit as u32) as u16;
            let v_target = self.v_timer;
            let v_distance = if v_target < v_limit {
                if old_v < v_target {
                    v_target - old_v
                } else {
                    v_target + v_limit - old_v
                }
            } else {
                v_limit
            };
            v_match = self.timer_control & 0x02 != 0
                && v_distance != 0
                && wraps >= v_distance as u32;
        }

        let h_distance = if h_target < h_limit {
            if old_h < h_target {
                h_target - old_h
            } else {
                h_target + h_limit - old_h
            }
        } else {
            h_limit
        };
        let h_match = self.timer_control & 0x01 != 0
            && h_distance != 0
            && master_clocks >= h_distance;
        let timer_active = h_match || v_match;
        if timer_active && !self.timer_irq_last_state {
            self.request_interrupt(SA1_TIMER_SOURCE);
        }
        self.timer_irq_last_state = timer_active;
    }

    pub fn read_register(&self, addr: u16) -> u8 {
        match addr {
            0x2200 => self.scnt,
            0x2201 => self.cie,
            0x2202 => self.sic,
            0x220A => self.sa1_interrupt_enable,
            0x220B => self.sa1_interrupt_latch,
            0x2203 => self.cfr,
            0x2204 => self.reset_vector_high,
            0x2205 => self.nmi_vector as u8,
            0x2206 => (self.nmi_vector >> 8) as u8,
            0x2207 => self.irq_vector as u8,
            0x2208 => (self.irq_vector >> 8) as u8,
            0x2210 => self.timer_control,
            0x2211 => 0,
            0x2212 => self.h_timer as u8,
            0x2213 => (self.h_timer >> 8) as u8,
            0x2214 => self.v_timer as u8,
            0x2215 => (self.v_timer >> 8) as u8,
            0x2230 => self.dma_control,
            0x2231 => self.char_dma_control,
            0x2232 => self.dma_source as u8,
            0x2233 => (self.dma_source >> 8) as u8,
            0x2234 => (self.dma_source >> 16) as u8,
            0x2235 => self.dma_destination as u8,
            0x2236 => (self.dma_destination >> 8) as u8,
            0x2237 => (self.dma_destination >> 16) as u8,
            0x2238 => self.dma_length as u8,
            0x2239 => (self.dma_length >> 8) as u8,
            0x2300 => (self.cie & 0x5F) | (self.sic & 0xA0),
            0x2301 => (self.scnt & 0x0F) | (self.sa1_interrupt_status & 0xF0),
            0x2302 => (self.h_counter / 4) as u8,
            0x2303 => ((self.h_counter / 4) >> 8) as u8,
            0x2304 => self.v_counter as u8,
            0x2305 => (self.v_counter >> 8) as u8,
            0x2220..=0x2223 => self.bmaps[(addr - 0x2220) as usize],
            0x2224 => self.bwram_bank,
            0x2225 => self.bwram_control,
            _ => 0,
        }
    }

    pub fn start_char_dma(&mut self) {
        self.char_dma_index = 0;
        self.char_dma_buffer.fill(0);
        self.char_dma_active = true;
    }

    pub fn write_char_dma_byte(&mut self, addr: u16, value: u8) {
        if !(0x2240..=0x224F).contains(&addr)
            || !matches!(self.dma_control & 0xB0, 0xA0 | 0xB0)
        {
            return;
        }

        let byte_index = self.char_dma_index as usize * 16 + (addr - 0x2240) as usize;
        self.char_dma_buffer[byte_index] = value;
        if addr != 0x224F {
            return;
        }

        self.char_dma_index = (self.char_dma_index + 1) & 7;
        if self.char_dma_index & 3 == 0 {
            self.convert_char_dma_group();
        }
    }

    fn convert_char_dma_group(&mut self) {
        let depth = match self.char_dma_control & 0x03 {
            0 => 8,
            1 => 4,
            _ => 2,
        };
        let bytes_per_char = 8 * depth;
        let source_offset = if self.char_dma_index == 0 { 64 } else { 0 };
        let destination = (self.dma_destination as usize & 0x7FF)
            + if self.char_dma_index == 0 { bytes_per_char } else { 0 };

        for row in 0..8 {
            for plane_group in 0..(depth / 2) {
                for plane_pair in 0..2 {
                    let plane = plane_group * 2 + plane_pair;
                    let mut packed = 0u8;
                    for column in 0..8 {
                        let pixel = self.char_dma_buffer[source_offset + row * 8 + column];
                        packed = (packed << 1) | ((pixel >> plane) & 1);
                    }
                    let output_offset = destination + plane_group * 16 + row * 2 + plane_pair;
                    self.iram[output_offset & (IRAM_SIZE - 1)] = packed;
                }
            }
        }
    }

    pub fn write_register(&mut self, addr: u16, value: u8) {
        match addr {
            0x2200 => {
                let was_reset = self.scnt & 0x20 != 0;
                self.scnt = value;
                if value & SA1_IRQ_SOURCE != 0 {
                    self.request_interrupt(SA1_IRQ_SOURCE);
                }
                if value & SA1_NMI_SOURCE != 0 {
                    self.request_interrupt(SA1_NMI_SOURCE);
                }
                if was_reset && value & 0x20 == 0 && value & 0x80 == 0 {
                    self.start_from_reset_vector();
                }
            }
            0x2201 => self.cie = value,
            0x2202 => self.sic &= !value,
            0x220A => {
                self.sa1_interrupt_enable = value & 0xF0;
                self.sa1_interrupt_latch &= !value;
            }
            0x220B => {
                self.sa1_interrupt_latch = value & 0xF0;
                self.sa1_interrupt_status &= !(value & 0xF0);
            }
            0x2203 => self.cfr = value,
            0x2204 => self.reset_vector_high = value,
            0x2205 => self.nmi_vector = (self.nmi_vector & 0xFF00) | value as u16,
            0x2206 => self.nmi_vector = (self.nmi_vector & 0x00FF) | ((value as u16) << 8),
            0x2207 => self.irq_vector = (self.irq_vector & 0xFF00) | value as u16,
            0x2208 => self.irq_vector = (self.irq_vector & 0x00FF) | ((value as u16) << 8),
            0x2210 => {
                self.timer_control = value & 0x83;
                self.timer_irq_last_state = false;
            }
            0x2211 => {
                self.h_counter = 0;
                self.v_counter = 0;
                self.timer_irq_last_state = false;
            }
            0x2212 => self.h_timer = (self.h_timer & 0xFF00) | value as u16,
            0x2213 => self.h_timer = (self.h_timer & 0x00FF) | ((value as u16) << 8),
            0x2214 => self.v_timer = (self.v_timer & 0xFF00) | value as u16,
            0x2215 => self.v_timer = (self.v_timer & 0x00FF) | ((value as u16) << 8),
            0x2230 => self.dma_control = value,
            0x2231 => {
                self.char_dma_control = value & 0x9F;
                if value & 0x80 != 0 {
                    self.char_dma_active = false;
                }
            }
            0x2232 => self.dma_source = (self.dma_source & 0xFFFF00) | value as u32,
            0x2233 => self.dma_source = (self.dma_source & 0xFF00FF) | ((value as u32) << 8),
            0x2234 => self.dma_source = (self.dma_source & 0x00FFFF) | ((value as u32) << 16),
            0x2235 => self.dma_destination = (self.dma_destination & 0xFFFF00) | value as u32,
            0x2236 => self.dma_destination = (self.dma_destination & 0xFF00FF) | ((value as u32) << 8),
            0x2237 => self.dma_destination = (self.dma_destination & 0x00FFFF) | ((value as u32) << 16),
            0x2238 => self.dma_length = (self.dma_length & 0xFF00) | value as u16,
            0x2239 => self.dma_length = (self.dma_length & 0x00FF) | ((value as u16) << 8),
            0x2220..=0x2223 => self.bmaps[(addr - 0x2220) as usize] = value & 0x3F,
            0x2224 => self.bwram_bank = value & 0x1F,
            0x2225 => self.bwram_control = value,
            _ => {}
        }
    }

    pub fn read_iram(&self, addr: u16) -> u8 {
        self.iram[(addr as usize) & (IRAM_SIZE - 1)]
    }

    pub fn write_iram(&mut self, addr: u16, value: u8) {
        self.iram[(addr as usize) & (IRAM_SIZE - 1)] = value;
    }

    pub fn read_bwram(&self, addr: u16) -> u8 {
        let offset = ((self.bwram_bank as usize) << 13) | (addr as usize & 0x1FFF);
        self.bwram[offset % BWRAM_SIZE]
    }

    pub fn write_bwram(&mut self, addr: u16, value: u8) {
        let offset = ((self.bwram_bank as usize) << 13) | (addr as usize & 0x1FFF);
        self.bwram[offset % BWRAM_SIZE] = value;
    }
}

impl Default for Sa1 {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::{Sa1, BWRAM_SIZE, IRAM_SIZE, SA1_HV_H_LIMIT, SA1_LINEAR_H_LIMIT};

    #[test]
    fn register_windows_update_sa1_state() {
        let mut sa1 = Sa1::new();
        sa1.write_register(0x2200, 0x81);
        sa1.write_register(0x2201, 0x22);
        sa1.write_register(0x2220, 0x1F);
        sa1.write_register(0x2224, 0x1E);

        assert_eq!(sa1.read_register(0x2200), 0x81);
        assert_eq!(sa1.read_register(0x2201), 0x22);
        assert_eq!(sa1.read_register(0x2220), 0x1F);
        assert_eq!(sa1.read_register(0x2224), 0x1E);
    }

    #[test]
    fn interrupt_flag_readback_matches_s_cpu_and_sa1_domains() {
        let mut sa1 = Sa1::new();
        sa1.cie = 0x3F;
        sa1.sic = 0xA0;
        sa1.scnt = 0x0B;
        sa1.sa1_interrupt_status = 0xE0;

        assert_eq!(sa1.read_register(0x2300), 0xBF);
        assert_eq!(sa1.read_register(0x2301), 0xEB);

        sa1.request_s_cpu_interrupt(0x20);
        assert!(sa1.s_cpu_interrupt_pending());
        sa1.write_register(0x2202, 0x20);
        assert!(!sa1.s_cpu_interrupt_pending());
    }

    #[test]
    fn iram_and_bwram_windows_are_banked_and_wrappable() {
        let mut sa1 = Sa1::new();
        sa1.write_iram(0x3800, 0x12);
        assert_eq!(sa1.read_iram(0x3000), 0x12);
        assert_eq!(sa1.iram.len(), IRAM_SIZE);

        sa1.write_register(0x2224, 0x1F);
        sa1.write_bwram(0x7FFF, 0x34);
        assert_eq!(sa1.read_bwram(0x7FFF), 0x34);
        assert_eq!(sa1.bwram.len(), BWRAM_SIZE);
    }

    #[test]
    fn reset_clears_memory_and_restores_mapping() {
        let mut sa1 = Sa1::new();
        sa1.write_iram(0x3000, 0xAA);
        sa1.write_register(0x2220, 0x3F);
        sa1.reset();

        assert_eq!(sa1.read_iram(0x3000), 0);
        assert_eq!(sa1.bmaps, [0, 1, 2, 3]);
        assert_eq!(sa1.read_register(0x2200), 0x20);
    }

    #[test]
    fn reset_vector_starts_cpu_when_reset_is_released() {
        let mut sa1 = Sa1::new();
        sa1.reset();
        sa1.write_register(0x2203, 0x34);
        sa1.write_register(0x2204, 0x12);
        sa1.cpu.pc = 0xBEEF;

        sa1.write_register(0x2200, 0x20);
        assert_eq!(sa1.cpu.pc, 0xBEEF);
        assert!(!sa1.is_running());

        sa1.write_register(0x2200, 0x00);
        assert_eq!(sa1.cpu.pc, 0x1234);
        assert!(sa1.is_running());
    }

    #[test]
    fn reset_vector_is_not_loaded_when_control_bit_80_is_set() {
        let mut sa1 = Sa1::new();
        sa1.reset();
        sa1.write_register(0x2203, 0x34);
        sa1.write_register(0x2204, 0x12);
        sa1.cpu.pc = 0xBEEF;

        sa1.write_register(0x2200, 0x80);

        assert_eq!(sa1.cpu.pc, 0xBEEF);
    }

    #[test]
    fn timer_crossing_sets_timer_interrupt_source() {
        let mut sa1 = Sa1::new();
        sa1.write_register(0x2210, 0x01);
        sa1.write_register(0x2212, 0x02);
        sa1.advance_timer(8);

        assert_eq!(sa1.read_register(0x2301) & 0x40, 0x40);

        sa1.write_register(0x220A, 0x40);
        assert_eq!(sa1.next_irq_source(), 0x40);
        sa1.acknowledge_interrupt(0x40);
        assert_eq!(sa1.next_irq_source(), 0);
    }

    #[test]
    fn timer_crossing_detects_h_match_inside_multiple_periods() {
        let mut sa1 = Sa1::new();
        sa1.write_register(0x2210, 0x01);
        sa1.write_register(0x2212, 0x02);
        sa1.h_counter = 10;

        sa1.advance_timer(SA1_HV_H_LIMIT * 2);

        assert_eq!(sa1.read_register(0x2301) & 0x40, 0x40);
        assert_eq!(sa1.read_register(0x2302), 2);
        assert_eq!(sa1.read_register(0x2303), 0);
    }

    #[test]
    fn timer_crossing_detects_v_match_before_budget_end() {
        let mut sa1 = Sa1::new();
        sa1.write_register(0x2210, 0x82);
        sa1.write_register(0x2214, 0x03);

        sa1.advance_timer(SA1_LINEAR_H_LIMIT * 4);

        assert_eq!(sa1.read_register(0x2301) & 0x40, 0x40);
        assert_eq!(sa1.read_register(0x2304), 4);
        assert_eq!(sa1.read_register(0x2305), 0);
    }

    struct ReferenceTimer {
        h_counter: u32,
        v_counter: u16,
        irq_status: u8,
        irq_last_state: bool,
    }

    impl ReferenceTimer {
        fn advance(&mut self, control: u8, h_timer: u16, v_timer: u16, clocks: u32) {
            let h_limit = if control & 0x80 != 0 { 0x800 } else { 1364 };
            let v_limit = if control & 0x80 != 0 { 0x200 } else { 262 };
            let h_target = (h_timer as u32) * 4;
            let mut timer_active = false;

            for _ in 0..clocks {
                self.h_counter += 1;
                let wrapped = self.h_counter >= h_limit;
                if wrapped {
                    self.h_counter = 0;
                    self.v_counter = (self.v_counter + 1) % v_limit;
                }
                if control & 0x01 != 0 && self.h_counter == h_target {
                    timer_active = true;
                }
                if control & 0x02 != 0 && wrapped && self.v_counter == v_timer {
                    timer_active = true;
                }
            }

            if timer_active && !self.irq_last_state {
                self.irq_status |= 0x40;
            }
            self.irq_last_state = timer_active;
        }
    }

    #[test]
    fn timer_crossings_match_independent_reference_model() {
        for (control, h_timer, v_timer, h_counter, v_counter, clocks) in [
            (0x01, 0x0002, 0, 0, 0, 8),
            (0x01, 0x0000, 0, 1363, 0, 1),
            (0x02, 0, 0x0003, 1362, 1, 1364 * 2 + 2),
            (0x03, 0x0005, 0x0002, 1200, 260, 1364 * 4 + 40),
            (0x83, 0x0007, 0x0004, 0x7FE, 0x01FF, 0x805),
        ] {
            let mut actual = Sa1::new();
            actual.write_register(0x2210, control);
            actual.write_register(0x2212, h_timer as u8);
            actual.write_register(0x2213, (h_timer >> 8) as u8);
            actual.write_register(0x2214, v_timer as u8);
            actual.write_register(0x2215, (v_timer >> 8) as u8);
            actual.h_counter = h_counter;
            actual.v_counter = v_counter;

            let mut reference = ReferenceTimer {
                h_counter,
                v_counter,
                irq_status: 0,
                irq_last_state: false,
            };
            reference.advance(control, h_timer, v_timer, clocks);
            actual.advance_timer(clocks);

            assert_eq!(actual.h_counter, reference.h_counter);
            assert_eq!(actual.v_counter, reference.v_counter);
            assert_eq!(actual.sa1_interrupt_status & 0x40, reference.irq_status & 0x40);
            assert_eq!(actual.timer_irq_last_state, reference.irq_last_state);
        }
    }

    #[test]
    fn character_conversion_writes_expected_2_4_and_8bpp_planes() {
        for (control, pixel, expected_offset) in [(0x02, 0x01, 0), (0x01, 0x08, 17), (0x00, 0x80, 49)] {
            let mut sa1 = Sa1::new();
            sa1.dma_control = 0xA0;
            sa1.char_dma_control = control;
            sa1.start_char_dma();
            for chunk in 0..4 {
                for offset in 0..16 {
                    sa1.write_char_dma_byte(0x2240 + offset, pixel);
                }
                assert_eq!(sa1.char_dma_index, (chunk + 1) as u8);
            }

            assert_eq!(sa1.iram[expected_offset], 0xFF);
        }
    }

    #[test]
    fn character_dma_preserves_virtual_width_and_chdend_bits() {
        let mut sa1 = Sa1::new();
        sa1.write_register(0x2231, 0xB6);

        assert_eq!(sa1.read_register(0x2231), 0x96);
        assert!(!sa1.char_dma_active);
    }
}
