// ============================================================
// NES Mapper 模擬 - 記憶體映射器集合
// ============================================================
// Mapper 負責卡帶的 bank 切換與記憶體映射，不同的遊戲使用不同的 Mapper。
//
// 已實作的 Mapper：
// - Mapper 0 (NROM): 無映射，最簡單的類型
// - Mapper 1 (MMC1): Nintendo MMC1，支援 PRG/CHR bank 切換
// - Mapper 2 (UxROM): PRG ROM 切換
// - Mapper 3 (CNROM): CHR ROM 切換
// - Mapper 4 (MMC3): Nintendo MMC3，掃描線 IRQ
// - Mapper 7 (AxROM): 32KB PRG 切換，單屏鏡像
// - Mapper 11 (Color Dreams): 簡單 PRG/CHR 切換
// - Mapper 15 (100-in-1): 多合一卡帶
// - Mapper 16 (Bandai FCG): 龍珠系列等
// - Mapper 23 (VRC2b/VRC4): Konami VRC 系列
// - Mapper 66 (GxROM): 簡單 PRG/CHR 切換
// - Mapper 71 (Camerica): Camerica/Codemasters 遊戲
// - Mapper 113 (NINA-03/06): 台灣麻將等
// - Mapper 202: 150合1 等合集卡帶
// - Mapper 225: 52/64/72合1 等合集卡帶
// - Mapper 227: 1200合1 等合集卡帶
// - Mapper 245 (Waixing MMC3): 中文版遊戲
// - Mapper 253 (Waixing VRC4): 龍珠等中文版
//
// 參考：https://www.nesdev.org/wiki/Mapper
// ============================================================

use crate::ppu::MirrorMode;

/// Mapper 寫入操作的結果
pub struct MapperWriteResult {
    /// 是否觸發 IRQ
    pub irq: bool,
    /// 新的鏡像模式（如果有變更）
    pub mirror_mode: Option<MirrorMode>,
}

impl MapperWriteResult {
    /// 建立無副作用的結果
    pub fn none() -> Self {
        MapperWriteResult {
            irq: false,
            mirror_mode: None,
        }
    }

    /// 建立帶鏡像模式變更的結果
    pub fn with_mirror(mode: MirrorMode) -> Self {
        MapperWriteResult {
            irq: false,
            mirror_mode: Some(mode),
        }
    }
}

/// Mapper 特性（介面）
/// 所有 Mapper 都必須實作此特性
pub trait MapperTrait {
    /// CPU 讀取映射
    /// 傳入 CPU 位址，回傳映射後的 ROM/RAM 偏移量
    fn cpu_read(&self, addr: u16) -> Option<u32>;

    /// CPU 寫入映射
    /// 傳入 CPU 位址與資料，回傳寫入結果（可能觸發 bank 切換等）
    fn cpu_write(&mut self, addr: u16, data: u8) -> Option<MapperWriteResult>;

    /// PPU 讀取映射
    /// 傳入 PPU 位址，回傳映射後的 CHR ROM/RAM 偏移量
    fn ppu_read(&self, addr: u16) -> Option<u32>;

    /// PPU 寫入映射
    /// 傳入 PPU 位址，回傳映射後的 CHR RAM 偏移量（僅 CHR RAM 可寫）
    fn ppu_write(&self, addr: u16) -> Option<u32>;

    /// 重置 Mapper 狀態
    fn reset(&mut self);

    /// 掃描線通知（用於 MMC3 等 scanline-based IRQ）
    fn scanline(&mut self) {}

    /// CPU 週期通知（用於 Bandai FCG 等 cycle-based IRQ）
    fn cpu_clock(&mut self) {}

    /// 檢查並消耗 IRQ 請求
    fn check_irq(&mut self) -> bool { false }

    /// 取得 CHR bank 可寫入遮罩（用於混合 CHR ROM/RAM mapper）
    /// 每個位元代表一個 1KB bank 是否可寫入
    fn chr_writable_mask(&self) -> u8 { 0 }
}

// ============================================================
// Mapper 0 (NROM) - 最簡單的 Mapper，無 bank 切換
// ============================================================
// PRG ROM: 16KB 或 32KB
// CHR ROM: 8KB
// 用於：超級瑪利歐兄弟、打磚塊等早期遊戲
// ============================================================
pub struct Mapper0 {
    prg_banks: u8,
    chr_banks: u8,
}

impl Mapper0 {
    pub fn new(prg_banks: u8, chr_banks: u8) -> Self {
        Mapper0 { prg_banks, chr_banks }
    }
}

impl MapperTrait for Mapper0 {
    fn cpu_read(&self, addr: u16) -> Option<u32> {
        if addr >= 0x8000 {
            // 16KB 鏡像或 32KB 直接映射
            let mask = if self.prg_banks > 1 { 0x7FFF } else { 0x3FFF };
            Some((addr & mask) as u32)
        } else {
            None
        }
    }

    fn cpu_write(&mut self, _addr: u16, _data: u8) -> Option<MapperWriteResult> {
        // NROM 不支援寫入 PRG ROM
        None
    }

    fn ppu_read(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 {
            Some(addr as u32)
        } else {
            None
        }
    }

    fn ppu_write(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 && self.chr_banks == 0 {
            Some(addr as u32) // CHR RAM
        } else {
            None
        }
    }

    fn reset(&mut self) {}
}

// ============================================================
// Mapper 1 (MMC1) - Nintendo MMC1
// ============================================================
// 使用串列寫入（shift register）來設定暫存器
// 支援 PRG/CHR bank 切換與鏡像控制
// 用於：塞爾達傳說、洛克人2、最終幻想 等
// ============================================================
pub struct Mapper1 {
    prg_banks: u8,
    chr_banks: u8,

    /// 移位暫存器（串列寫入用）
    shift_register: u8,
    /// 控制暫存器
    control: u8,
    /// CHR bank 0
    chr_bank0: u8,
    /// CHR bank 1
    chr_bank1: u8,
    /// PRG bank
    prg_bank: u8,
}

impl Mapper1 {
    pub fn new(prg_banks: u8, chr_banks: u8) -> Self {
        Mapper1 {
            prg_banks,
            chr_banks,
            shift_register: 0x10,
            control: 0x0C,
            chr_bank0: 0,
            chr_bank1: 0,
            prg_bank: 0,
        }
    }
}

impl MapperTrait for Mapper1 {
    fn cpu_read(&self, addr: u16) -> Option<u32> {
        if addr >= 0x8000 {
            let prg_mode = (self.control >> 2) & 0x03;

            if prg_mode <= 1 {
                // 32KB 模式：忽略 bank 最低位
                let bank = (self.prg_bank & 0x0E) as u32 * 16384;
                Some(bank + (addr & 0x7FFF) as u32)
            } else if prg_mode == 2 {
                // 固定第一個 bank 在 $8000，切換 $C000
                if addr < 0xC000 {
                    Some((addr & 0x3FFF) as u32)
                } else {
                    Some(self.prg_bank as u32 * 16384 + (addr & 0x3FFF) as u32)
                }
            } else {
                // 切換 $8000，固定最後一個 bank 在 $C000
                if addr < 0xC000 {
                    Some(self.prg_bank as u32 * 16384 + (addr & 0x3FFF) as u32)
                } else {
                    Some((self.prg_banks as u32 - 1) * 16384 + (addr & 0x3FFF) as u32)
                }
            }
        } else {
            None
        }
    }

    fn cpu_write(&mut self, addr: u16, data: u8) -> Option<MapperWriteResult> {
        if addr >= 0x8000 {
            // 位元 7：重置移位暫存器
            if data & 0x80 != 0 {
                self.shift_register = 0x10;
                self.control |= 0x0C;
                return None;
            }

            let complete = self.shift_register & 0x01 != 0;
            self.shift_register = (self.shift_register >> 1) | ((data & 0x01) << 4);

            if complete {
                let target = (addr >> 13) & 0x03;
                let value = self.shift_register;

                match target {
                    0 => self.control = value,       // 控制暫存器
                    1 => self.chr_bank0 = value,     // CHR bank 0
                    2 => self.chr_bank1 = value,     // CHR bank 1
                    3 => self.prg_bank = value & 0x0F, // PRG bank
                    _ => {}
                }

                self.shift_register = 0x10;

                // 回傳鏡像模式
                let mirror = match self.control & 0x03 {
                    0 => MirrorMode::SingleScreenLow,
                    1 => MirrorMode::SingleScreenHigh,
                    2 => MirrorMode::Vertical,
                    _ => MirrorMode::Horizontal,
                };
                return Some(MapperWriteResult::with_mirror(mirror));
            }
        }
        None
    }

    fn ppu_read(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 {
            let chr_mode = (self.control >> 4) & 0x01;
            let total_chr_banks = (self.chr_banks as u32 * 2).max(1);

            if chr_mode == 0 {
                // 8KB 模式
                let bank = (self.chr_bank0 & 0x1E) as u32 % total_chr_banks;
                Some(bank * 4096 + addr as u32)
            } else {
                // 4KB 模式
                if addr < 0x1000 {
                    let bank = self.chr_bank0 as u32 % total_chr_banks;
                    Some(bank * 4096 + addr as u32)
                } else {
                    let bank = self.chr_bank1 as u32 % total_chr_banks;
                    Some(bank * 4096 + (addr & 0x0FFF) as u32)
                }
            }
        } else {
            None
        }
    }

    fn ppu_write(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 && self.chr_banks == 0 {
            Some(addr as u32) // CHR RAM
        } else {
            None
        }
    }

    fn reset(&mut self) {
        self.shift_register = 0x10;
        self.control = 0x0C;
        self.chr_bank0 = 0;
        self.chr_bank1 = 0;
        self.prg_bank = 0;
    }
}

// ============================================================
// Mapper 2 (UxROM) - PRG ROM bank 切換
// ============================================================
// 最後一個 bank 固定在 $C000-$FFFF
// 可切換的 bank 在 $8000-$BFFF
// 用於：洛克人、魂斗羅、惡魔城 等
// ============================================================
pub struct Mapper2 {
    prg_banks: u8,
    selected_bank: u8,
}

impl Mapper2 {
    pub fn new(prg_banks: u8, _chr_banks: u8) -> Self {
        Mapper2 {
            prg_banks,
            selected_bank: 0,
        }
    }
}

impl MapperTrait for Mapper2 {
    fn cpu_read(&self, addr: u16) -> Option<u32> {
        if addr >= 0x8000 && addr < 0xC000 {
            Some(self.selected_bank as u32 * 16384 + (addr & 0x3FFF) as u32)
        } else if addr >= 0xC000 {
            Some((self.prg_banks as u32 - 1) * 16384 + (addr & 0x3FFF) as u32)
        } else {
            None
        }
    }

    fn cpu_write(&mut self, addr: u16, data: u8) -> Option<MapperWriteResult> {
        if addr >= 0x8000 {
            self.selected_bank = data & 0x0F;
        }
        None
    }

    fn ppu_read(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 { Some(addr as u32) } else { None }
    }

    fn ppu_write(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 { Some(addr as u32) } else { None } // CHR RAM
    }

    fn reset(&mut self) {
        self.selected_bank = 0;
    }
}

// ============================================================
// Mapper 3 (CNROM) - CHR ROM bank 切換
// ============================================================
// PRG ROM 固定（16KB 或 32KB）
// 可切換 8KB CHR ROM bank
// 用於：所羅門之鑰、暴力拆除 等
// ============================================================
pub struct Mapper3 {
    prg_banks: u8,
    _chr_banks: u8,
    selected_chr_bank: u8,
}

impl Mapper3 {
    pub fn new(prg_banks: u8, chr_banks: u8) -> Self {
        Mapper3 {
            prg_banks,
            _chr_banks: chr_banks,
            selected_chr_bank: 0,
        }
    }
}

impl MapperTrait for Mapper3 {
    fn cpu_read(&self, addr: u16) -> Option<u32> {
        if addr >= 0x8000 {
            let mask = if self.prg_banks > 1 { 0x7FFF } else { 0x3FFF };
            Some((addr & mask) as u32)
        } else {
            None
        }
    }

    fn cpu_write(&mut self, addr: u16, data: u8) -> Option<MapperWriteResult> {
        if addr >= 0x8000 {
            self.selected_chr_bank = data & 0x03;
        }
        None
    }

    fn ppu_read(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 {
            Some(self.selected_chr_bank as u32 * 8192 + addr as u32)
        } else {
            None
        }
    }

    fn ppu_write(&self, _addr: u16) -> Option<u32> {
        None
    }

    fn reset(&mut self) {
        self.selected_chr_bank = 0;
    }
}

// ============================================================
// Mapper 4 (MMC3) - Nintendo MMC3
// ============================================================
// 最常見的 Mapper 之一，支援：
// - 可切換的 PRG ROM banks（8KB 單位）
// - 可切換的 CHR ROM banks（1KB/2KB 單位）
// - 掃描線計數器（用於 IRQ）
// - 可控的鏡像模式
// 用於：超級瑪利歐兄弟3、忍者龍劍傳、大金剛3 等
// ============================================================
pub struct Mapper4 {
    prg_banks: u8,
    chr_banks: u8,

    /// Bank 暫存器（R0-R7）
    registers: [u8; 8],
    /// Bank 選擇暫存器
    bank_select: u8,
    /// PRG ROM bank 模式
    prg_rom_bank_mode: bool,
    /// CHR A12 反轉
    chr_a12_inversion: bool,
    /// 鏡像模式
    mirror_mode: MirrorMode,

    // IRQ 相關
    irq_counter: u8,
    irq_latch: u8,
    irq_enabled: bool,
    irq_reload: bool,
    irq_pending: bool,
}

impl Mapper4 {
    pub fn new(prg_banks: u8, chr_banks: u8) -> Self {
        Mapper4 {
            prg_banks,
            chr_banks,
            registers: [0; 8],
            bank_select: 0,
            prg_rom_bank_mode: false,
            chr_a12_inversion: false,
            mirror_mode: MirrorMode::Vertical,
            irq_counter: 0,
            irq_latch: 0,
            irq_enabled: false,
            irq_reload: false,
            irq_pending: false,
        }
    }

    /// 取得 PRG bank 編號（以 8KB 為單位）
    fn get_prg_bank(&self, addr: u16) -> u32 {
        let last_bank = self.prg_banks as u32 * 2 - 1;
        let second_last = self.prg_banks as u32 * 2 - 2;

        match addr {
            0x8000..=0x9FFF => {
                if self.prg_rom_bank_mode { second_last }
                else { (self.registers[6] & 0x3F) as u32 }
            }
            0xA000..=0xBFFF => (self.registers[7] & 0x3F) as u32,
            0xC000..=0xDFFF => {
                if self.prg_rom_bank_mode { (self.registers[6] & 0x3F) as u32 }
                else { second_last }
            }
            _ => last_bank, // $E000-$FFFF
        }
    }

    /// 取得 CHR bank 編號（以 1KB 為單位）
    fn get_chr_bank(&self, addr: u16) -> u32 {
        let region = (addr >> 10) as usize; // 0-7（每個區域 1KB）

        if self.chr_a12_inversion {
            // A12 反轉: R2-R5 在 $0000, R0-R1 在 $1000
            match region {
                0 => self.registers[2] as u32,
                1 => self.registers[3] as u32,
                2 => self.registers[4] as u32,
                3 => self.registers[5] as u32,
                4 => (self.registers[0] & 0xFE) as u32,
                5 => (self.registers[0] & 0xFE) as u32 | 1,
                6 => (self.registers[1] & 0xFE) as u32,
                7 => (self.registers[1] & 0xFE) as u32 | 1,
                _ => 0,
            }
        } else {
            // 正常: R0-R1 在 $0000, R2-R5 在 $1000
            match region {
                0 => (self.registers[0] & 0xFE) as u32,
                1 => (self.registers[0] & 0xFE) as u32 | 1,
                2 => (self.registers[1] & 0xFE) as u32,
                3 => (self.registers[1] & 0xFE) as u32 | 1,
                4 => self.registers[2] as u32,
                5 => self.registers[3] as u32,
                6 => self.registers[4] as u32,
                7 => self.registers[5] as u32,
                _ => 0,
            }
        }
    }
}

impl MapperTrait for Mapper4 {
    fn cpu_read(&self, addr: u16) -> Option<u32> {
        if addr >= 0x8000 {
            let bank = self.get_prg_bank(addr);
            Some(bank * 8192 + (addr & 0x1FFF) as u32)
        } else {
            None
        }
    }

    fn cpu_write(&mut self, addr: u16, data: u8) -> Option<MapperWriteResult> {
        if addr >= 0x8000 {
            let even = (addr & 1) == 0;
            let region = (addr >> 13) & 0x03;

            match region {
                0 => {
                    // $8000-$9FFF
                    if even {
                        self.bank_select = data & 0x07;
                        self.prg_rom_bank_mode = (data & 0x40) != 0;
                        self.chr_a12_inversion = (data & 0x80) != 0;
                    } else {
                        self.registers[self.bank_select as usize] = data;
                    }
                }
                1 => {
                    // $A000-$BFFF
                    if even {
                        self.mirror_mode = if data & 1 != 0 {
                            MirrorMode::Horizontal
                        } else {
                            MirrorMode::Vertical
                        };
                        return Some(MapperWriteResult::with_mirror(self.mirror_mode));
                    }
                }
                2 => {
                    // $C000-$DFFF
                    if even {
                        self.irq_latch = data;
                    } else {
                        self.irq_reload = true;
                    }
                }
                3 => {
                    // $E000-$FFFF
                    if even {
                        self.irq_enabled = false;
                        self.irq_pending = false;
                    } else {
                        self.irq_enabled = true;
                    }
                }
                _ => {}
            }
        }
        None
    }

    fn ppu_read(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 {
            Some(self.get_chr_bank(addr) * 1024 + (addr & 0x03FF) as u32)
        } else {
            None
        }
    }

    fn ppu_write(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 && self.chr_banks == 0 {
            Some(addr as u32) // CHR RAM
        } else {
            None
        }
    }

    fn reset(&mut self) {
        self.registers = [0; 8];
        self.bank_select = 0;
        self.prg_rom_bank_mode = false;
        self.chr_a12_inversion = false;
        self.mirror_mode = MirrorMode::Vertical;
        self.irq_counter = 0;
        self.irq_latch = 0;
        self.irq_enabled = false;
        self.irq_reload = false;
        self.irq_pending = false;
    }

    fn scanline(&mut self) {
        if self.irq_counter == 0 || self.irq_reload {
            self.irq_counter = self.irq_latch;
            self.irq_reload = false;
        } else {
            self.irq_counter -= 1;
        }

        if self.irq_counter == 0 && self.irq_enabled {
            self.irq_pending = true;
        }
    }

    fn check_irq(&mut self) -> bool {
        let pending = self.irq_pending;
        self.irq_pending = false;
        pending
    }
}

// ============================================================
// Mapper 7 (AxROM) - 32KB PRG 切換，單屏鏡像
// ============================================================
// PRG ROM: 32KB 切換
// CHR: RAM
// 鏡像: 單屏
// 用於：雙截龍、戰斧 等
// ============================================================
pub struct Mapper7 {
    _prg_banks: u8,
    selected_bank: u8,
    mirror_mode: MirrorMode,
}

impl Mapper7 {
    pub fn new(prg_banks: u8, _chr_banks: u8) -> Self {
        Mapper7 {
            _prg_banks: prg_banks,
            selected_bank: 0,
            mirror_mode: MirrorMode::SingleScreenLow,
        }
    }
}

impl MapperTrait for Mapper7 {
    fn cpu_read(&self, addr: u16) -> Option<u32> {
        if addr >= 0x8000 {
            Some(self.selected_bank as u32 * 32768 + (addr & 0x7FFF) as u32)
        } else {
            None
        }
    }

    fn cpu_write(&mut self, addr: u16, data: u8) -> Option<MapperWriteResult> {
        if addr >= 0x8000 {
            self.selected_bank = data & 0x07;
            self.mirror_mode = if data & 0x10 != 0 {
                MirrorMode::SingleScreenHigh
            } else {
                MirrorMode::SingleScreenLow
            };
            return Some(MapperWriteResult::with_mirror(self.mirror_mode));
        }
        None
    }

    fn ppu_read(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 { Some(addr as u32) } else { None }
    }

    fn ppu_write(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 { Some(addr as u32) } else { None }
    }

    fn reset(&mut self) {
        self.selected_bank = 0;
        self.mirror_mode = MirrorMode::SingleScreenLow;
    }
}

// ============================================================
// Mapper 11 (Color Dreams) - 簡單 PRG/CHR 切換
// ============================================================
pub struct Mapper11 {
    prg_banks: u8,
    chr_banks: u8,
    prg_bank: u8,
    chr_bank: u8,
}

impl Mapper11 {
    pub fn new(prg_banks: u8, chr_banks: u8) -> Self {
        Mapper11 { prg_banks, chr_banks, prg_bank: 0, chr_bank: 0 }
    }
}

impl MapperTrait for Mapper11 {
    fn cpu_read(&self, addr: u16) -> Option<u32> {
        if addr >= 0x8000 {
            let bank = self.prg_bank as u32 % self.prg_banks.max(1) as u32;
            Some(bank * 32768 + (addr & 0x7FFF) as u32)
        } else {
            None
        }
    }

    fn cpu_write(&mut self, addr: u16, data: u8) -> Option<MapperWriteResult> {
        if addr >= 0x8000 {
            self.prg_bank = data & 0x03;
            self.chr_bank = (data >> 4) & 0x0F;
        }
        None
    }

    fn ppu_read(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 {
            let bank = self.chr_bank as u32 % self.chr_banks.max(1) as u32;
            Some(bank * 8192 + addr as u32)
        } else {
            None
        }
    }

    fn ppu_write(&self, _addr: u16) -> Option<u32> { None }
    fn reset(&mut self) { self.prg_bank = 0; self.chr_bank = 0; }
}

// ============================================================
// Mapper 15 (100-in-1 Contra Function 16)
// ============================================================
// 用於 100 合 1 多遊戲卡帶
// ============================================================
pub struct Mapper15 {
    prg_banks: u8,
    /// 記錄地址鎖存器 (用於模式選擇)
    latch_addr: u16,
    /// 記錄資料鎖存器
    latch_data: u8,
    mirror_mode: MirrorMode,
}

impl Mapper15 {
    pub fn new(prg_banks: u8, _chr_banks: u8) -> Self {
        Mapper15 {
            prg_banks,
            latch_addr: 0,
            latch_data: 0,
            mirror_mode: MirrorMode::Vertical,
        }
    }
}

impl MapperTrait for Mapper15 {
    fn cpu_read(&self, addr: u16) -> Option<u32> {
        if addr >= 0x8000 {
            let total_8k = self.prg_banks as u32 * 2; // 8KB banks
            let data6 = (self.latch_data & 0x3F) as u32; // 6-bit bank number
            let p_bit = (self.latch_data >> 7) as u32;     // p bit (PRG A13)
            let mode = (self.latch_addr & 0x03) as u8;

            // 依照 FCEUX 實作：
            // i = (addr >> 13) & 3 → 0=$8000, 1=$A000, 2=$C000, 3=$E000
            let i = ((addr >> 13) & 3) as u32;

            let bank8k = match mode {
                0 => {
                    // NROM-256：4 個連續 8KB bank
                    // setprg8(base, (data6 << 1) + i)
                    (data6 << 1) + i
                }
                2 => {
                    // NROM-64：全部映射到同一個 8KB bank
                    // setprg8(base, (data6 << 1) + p_bit)
                    (data6 << 1) + p_bit
                }
                1 | 3 => {
                    // Mode 1 (UNROM) 和 Mode 3 (NROM-128) 共用邏輯
                    // b = data6; if i>=2 && mode==1: b = b | 7
                    let mut b = data6;
                    if i >= 2 && mode == 1 {
                        b |= 0x07; // 固定到 128KB 區塊的最後 16KB
                    }
                    // setprg8(base, (i & 1) + (b << 1))
                    (i & 1) + (b << 1)
                }
                _ => 0,
            };

            let offset = (bank8k % total_8k) as u32 * 8192 + (addr & 0x1FFF) as u32;
            Some(offset)
        } else {
            None
        }
    }

    fn cpu_write(&mut self, addr: u16, data: u8) -> Option<MapperWriteResult> {
        if addr >= 0x8000 {
            self.latch_addr = addr;
            self.latch_data = data;
            self.mirror_mode = if data & 0x40 != 0 {
                MirrorMode::Horizontal
            } else {
                MirrorMode::Vertical
            };
            return Some(MapperWriteResult::with_mirror(self.mirror_mode));
        }
        None
    }

    fn ppu_read(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 { Some(addr as u32) } else { None }
    }
    fn ppu_write(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 { Some(addr as u32) } else { None }
    }
    fn reset(&mut self) {
        self.latch_addr = 0;
        self.latch_data = 0;
    }
}

// ============================================================
// Mapper 16 (Bandai FCG) - 龍珠系列
// ============================================================
// 支援 PRG/CHR bank 切換和 CPU 週期 IRQ
// 用於：龍珠Z 系列等
// ============================================================
pub struct Mapper16 {
    prg_banks: u8,
    chr_banks: u8,
    chr_bank_regs: [u8; 8],
    prg_bank: u8,
    /// IRQ 計數器（使用有號整數，FCEUX 風格：倒數到 < 0 時觸發）
    irq_counter: i32,
    irq_latch: u16,
    irq_enabled: bool,
    irq_pending: bool,
    mirror_mode: MirrorMode,
}

impl Mapper16 {
    pub fn new(prg_banks: u8, chr_banks: u8) -> Self {
        Mapper16 {
            prg_banks,
            chr_banks,
            chr_bank_regs: [0; 8],
            prg_bank: 0,
            irq_counter: 0,
            irq_latch: 0,
            irq_enabled: false,
            irq_pending: false,
            mirror_mode: MirrorMode::Vertical,
        }
    }
}

impl MapperTrait for Mapper16 {
    fn cpu_read(&self, addr: u16) -> Option<u32> {
        if addr >= 0x8000 && addr < 0xC000 {
            let bank = self.prg_bank as u32 % self.prg_banks.max(1) as u32;
            Some(bank * 16384 + (addr & 0x3FFF) as u32)
        } else if addr >= 0xC000 {
            let bank = (self.prg_banks as u32).saturating_sub(1);
            Some(bank * 16384 + (addr & 0x3FFF) as u32)
        } else {
            None
        }
    }

    fn cpu_write(&mut self, addr: u16, data: u8) -> Option<MapperWriteResult> {
        // Bandai FCG 支援 $6000-$7FFF（FCG-1/2）和 $8000-$FFFF（LZ93D50）
        let reg = if (0x6000..0x8000).contains(&addr) || addr >= 0x8000 {
            (addr & 0x000F) as u8
        } else {
            return None;
        };

        if reg < 8 {
            self.chr_bank_regs[reg as usize] = data;
        } else if reg == 8 {
            self.prg_bank = data & 0x0F;
        } else if reg == 9 {
            self.mirror_mode = match data & 0x03 {
                0 => MirrorMode::Vertical,
                1 => MirrorMode::Horizontal,
                2 => MirrorMode::SingleScreenLow,
                _ => MirrorMode::SingleScreenHigh,
            };
            return Some(MapperWriteResult::with_mirror(self.mirror_mode));
        } else if reg == 0x0A {
            self.irq_enabled = (data & 0x01) != 0;
            self.irq_counter = self.irq_latch as i32;
            self.irq_pending = false;
        } else if reg == 0x0B {
            self.irq_latch = (self.irq_latch & 0xFF00) | data as u16;
        } else if reg == 0x0C {
            self.irq_latch = (self.irq_latch & 0x00FF) | ((data as u16) << 8);
        }
        None
    }

    fn ppu_read(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 {
            let region = (addr >> 10) as usize;
            let total = (self.chr_banks as u32 * 8).max(1);
            let bank = self.chr_bank_regs[region] as u32 % total;
            Some(bank * 1024 + (addr & 0x3FF) as u32)
        } else {
            None
        }
    }

    fn ppu_write(&self, _addr: u16) -> Option<u32> { None }

    fn reset(&mut self) {
        self.chr_bank_regs = [0; 8];
        self.prg_bank = 0;
        self.irq_counter = 0;
        self.irq_latch = 0;
        self.irq_enabled = false;
        self.irq_pending = false;
    }

    /// Bandai FCG 使用 CPU 週期計時器
    /// FCEUX bandai.cpp: IRQCount -= a; if (IRQCount < 0) { trigger IRQ }
    fn cpu_clock(&mut self) {
        if self.irq_enabled {
            self.irq_counter -= 1;
            if self.irq_counter < 0 {
                self.irq_pending = true;
            }
        }
    }

    fn check_irq(&mut self) -> bool {
        let pending = self.irq_pending;
        self.irq_pending = false;
        pending
    }
}

// ============================================================
// Mapper 23 (VRC2b/VRC4) - Konami VRC 系列
// ============================================================
// 支援精細的 PRG/CHR bank 切換和 IRQ
// 用於：魂斗羅 Force 等 Konami 遊戲
// ============================================================
pub struct Mapper23 {
    prg_banks: u8,
    chr_banks: u8,
    prg_bank0: u8,
    prg_bank1: u8,
    chr_bank_regs: [u8; 8],
    prg_swap_mode: u8,
    mirror_mode: MirrorMode,
    // IRQ (VRC4)
    irq_latch: u8,
    irq_control: u8,
    irq_counter: u8,
    irq_prescaler: i16,
    irq_enabled: bool,
    irq_pending: bool,
}

impl Mapper23 {
    pub fn new(prg_banks: u8, chr_banks: u8) -> Self {
        Mapper23 {
            prg_banks, chr_banks,
            prg_bank0: 0, prg_bank1: 0,
            chr_bank_regs: [0; 8],
            prg_swap_mode: 0,
            mirror_mode: MirrorMode::Vertical,
            irq_latch: 0, irq_control: 0,
            irq_counter: 0, irq_prescaler: 0,
            irq_enabled: false, irq_pending: false,
        }
    }
}

impl MapperTrait for Mapper23 {
    fn cpu_read(&self, addr: u16) -> Option<u32> {
        let total = self.prg_banks as u32 * 2; // 8KB banks
        match addr {
            0x8000..=0x9FFF => {
                let bank = if self.prg_swap_mode != 0 { total - 2 } else { self.prg_bank0 as u32 };
                Some((bank % total) * 8192 + (addr & 0x1FFF) as u32)
            }
            0xA000..=0xBFFF => {
                Some((self.prg_bank1 as u32 % total) * 8192 + (addr & 0x1FFF) as u32)
            }
            0xC000..=0xDFFF => {
                let bank = if self.prg_swap_mode != 0 { self.prg_bank0 as u32 } else { total - 2 };
                Some((bank % total) * 8192 + (addr & 0x1FFF) as u32)
            }
            0xE000..=0xFFFF => {
                Some((total - 1) * 8192 + (addr & 0x1FFF) as u32)
            }
            _ => None,
        }
    }

    fn cpu_write(&mut self, addr: u16, data: u8) -> Option<MapperWriteResult> {
        let a0 = addr & 0x0001;
        let a1 = (addr & 0x0002) >> 1;
        let reg = (addr & 0xF000) | (a1 << 1) | a0;

        match reg {
            0x8000..=0x8003 => { self.prg_bank0 = data & 0x1F; }
            0x9000 | 0x9001 => {
                self.mirror_mode = match data & 0x03 {
                    0 => MirrorMode::Vertical,
                    1 => MirrorMode::Horizontal,
                    2 => MirrorMode::SingleScreenLow,
                    _ => MirrorMode::SingleScreenHigh,
                };
                return Some(MapperWriteResult::with_mirror(self.mirror_mode));
            }
            0x9002 | 0x9003 => { self.prg_swap_mode = (data >> 1) & 0x01; }
            0xA000..=0xA003 => { self.prg_bank1 = data & 0x1F; }
            // CHR banks（每個暫存器分高低 4 位元寫入）
            0xB000 => { self.chr_bank_regs[0] = (self.chr_bank_regs[0] & 0xF0) | (data & 0x0F); }
            0xB001 => { self.chr_bank_regs[0] = (self.chr_bank_regs[0] & 0x0F) | ((data & 0x0F) << 4); }
            0xB002 => { self.chr_bank_regs[1] = (self.chr_bank_regs[1] & 0xF0) | (data & 0x0F); }
            0xB003 => { self.chr_bank_regs[1] = (self.chr_bank_regs[1] & 0x0F) | ((data & 0x0F) << 4); }
            0xC000 => { self.chr_bank_regs[2] = (self.chr_bank_regs[2] & 0xF0) | (data & 0x0F); }
            0xC001 => { self.chr_bank_regs[2] = (self.chr_bank_regs[2] & 0x0F) | ((data & 0x0F) << 4); }
            0xC002 => { self.chr_bank_regs[3] = (self.chr_bank_regs[3] & 0xF0) | (data & 0x0F); }
            0xC003 => { self.chr_bank_regs[3] = (self.chr_bank_regs[3] & 0x0F) | ((data & 0x0F) << 4); }
            0xD000 => { self.chr_bank_regs[4] = (self.chr_bank_regs[4] & 0xF0) | (data & 0x0F); }
            0xD001 => { self.chr_bank_regs[4] = (self.chr_bank_regs[4] & 0x0F) | ((data & 0x0F) << 4); }
            0xD002 => { self.chr_bank_regs[5] = (self.chr_bank_regs[5] & 0xF0) | (data & 0x0F); }
            0xD003 => { self.chr_bank_regs[5] = (self.chr_bank_regs[5] & 0x0F) | ((data & 0x0F) << 4); }
            0xE000 => { self.chr_bank_regs[6] = (self.chr_bank_regs[6] & 0xF0) | (data & 0x0F); }
            0xE001 => { self.chr_bank_regs[6] = (self.chr_bank_regs[6] & 0x0F) | ((data & 0x0F) << 4); }
            0xE002 => { self.chr_bank_regs[7] = (self.chr_bank_regs[7] & 0xF0) | (data & 0x0F); }
            0xE003 => { self.chr_bank_regs[7] = (self.chr_bank_regs[7] & 0x0F) | ((data & 0x0F) << 4); }
            // IRQ
            0xF000 => { self.irq_latch = (self.irq_latch & 0xF0) | (data & 0x0F); }
            0xF001 => { self.irq_latch = (self.irq_latch & 0x0F) | ((data & 0x0F) << 4); }
            0xF002 => {
                self.irq_control = data;
                self.irq_enabled = (data & 0x02) != 0;
                if data & 0x02 != 0 {
                    self.irq_counter = self.irq_latch;
                    self.irq_prescaler = 341;
                }
                self.irq_pending = false;
            }
            0xF003 => {
                self.irq_enabled = (self.irq_control & 0x01) != 0;
                self.irq_pending = false;
            }
            _ => {}
        }
        None
    }

    fn ppu_read(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 {
            let region = (addr >> 10) as usize;
            let bank = self.chr_bank_regs[region] as u32;
            let total = self.chr_banks as u32 * 8;
            Some((bank % total.max(1)) * 1024 + (addr & 0x3FF) as u32)
        } else {
            None
        }
    }

    fn ppu_write(&self, _addr: u16) -> Option<u32> { None }

    fn reset(&mut self) {
        self.prg_bank0 = 0; self.prg_bank1 = 0;
        self.chr_bank_regs = [0; 8];
        self.prg_swap_mode = 0;
        self.irq_latch = 0; self.irq_control = 0;
        self.irq_counter = 0; self.irq_prescaler = 0;
        self.irq_enabled = false; self.irq_pending = false;
    }

    fn scanline(&mut self) {
        if self.irq_enabled {
            self.irq_prescaler -= 3;
            if self.irq_prescaler <= 0 {
                self.irq_prescaler += 341;
                if self.irq_counter == 0xFF {
                    self.irq_counter = self.irq_latch;
                    self.irq_pending = true;
                } else {
                    self.irq_counter += 1;
                }
            }
        }
    }

    fn check_irq(&mut self) -> bool {
        let p = self.irq_pending;
        self.irq_pending = false;
        p
    }
}

// ============================================================
// Mapper 66 (GxROM) - 簡單 PRG/CHR 切換
// ============================================================
pub struct Mapper66 {
    prg_banks: u8,
    chr_banks: u8,
    prg_bank: u8,
    chr_bank: u8,
}

impl Mapper66 {
    pub fn new(prg_banks: u8, chr_banks: u8) -> Self {
        Mapper66 { prg_banks, chr_banks, prg_bank: 0, chr_bank: 0 }
    }
}

impl MapperTrait for Mapper66 {
    fn cpu_read(&self, addr: u16) -> Option<u32> {
        if addr >= 0x8000 {
            let bank = self.prg_bank as u32 % self.prg_banks.max(1) as u32;
            Some(bank * 32768 + (addr & 0x7FFF) as u32)
        } else { None }
    }
    fn cpu_write(&mut self, addr: u16, data: u8) -> Option<MapperWriteResult> {
        if addr >= 0x8000 {
            self.chr_bank = data & 0x03;
            self.prg_bank = (data >> 4) & 0x03;
        }
        None
    }
    fn ppu_read(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 {
            let bank = self.chr_bank as u32 % self.chr_banks.max(1) as u32;
            Some(bank * 8192 + addr as u32)
        } else { None }
    }
    fn ppu_write(&self, _addr: u16) -> Option<u32> { None }
    fn reset(&mut self) { self.prg_bank = 0; self.chr_bank = 0; }
}

// ============================================================
// Mapper 71 (Camerica/Codemasters)
// ============================================================
pub struct Mapper71 {
    prg_banks: u8,
    selected_bank: u8,
    mirror_mode: MirrorMode,
}

impl Mapper71 {
    pub fn new(prg_banks: u8, _chr_banks: u8) -> Self {
        Mapper71 { prg_banks, selected_bank: 0, mirror_mode: MirrorMode::Horizontal }
    }
}

impl MapperTrait for Mapper71 {
    fn cpu_read(&self, addr: u16) -> Option<u32> {
        if addr >= 0x8000 && addr < 0xC000 {
            Some(self.selected_bank as u32 * 16384 + (addr & 0x3FFF) as u32)
        } else if addr >= 0xC000 {
            Some((self.prg_banks as u32 - 1) * 16384 + (addr & 0x3FFF) as u32)
        } else { None }
    }
    fn cpu_write(&mut self, addr: u16, data: u8) -> Option<MapperWriteResult> {
        if addr >= 0x9000 && addr < 0xA000 {
            self.mirror_mode = if data & 0x10 != 0 {
                MirrorMode::SingleScreenHigh
            } else {
                MirrorMode::SingleScreenLow
            };
            return Some(MapperWriteResult::with_mirror(self.mirror_mode));
        } else if addr >= 0xC000 {
            self.selected_bank = data & 0x0F;
        }
        None
    }
    fn ppu_read(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 { Some(addr as u32) } else { None }
    }
    fn ppu_write(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 { Some(addr as u32) } else { None }
    }
    fn reset(&mut self) { self.selected_bank = 0; }
}

// ============================================================
// Mapper 113 (NINA-03/06 / Sachen / HES)
// ============================================================
// 用於台灣麻將等遊戲
// ============================================================
pub struct Mapper113 {
    prg_banks: u8,
    chr_banks: u8,
    prg_bank: u8,
    chr_bank: u8,
    mirror_mode: MirrorMode,
}

impl Mapper113 {
    pub fn new(prg_banks: u8, chr_banks: u8) -> Self {
        Mapper113 {
            prg_banks, chr_banks,
            prg_bank: 0, chr_bank: 0,
            mirror_mode: MirrorMode::Vertical,
        }
    }
}

impl MapperTrait for Mapper113 {
    fn cpu_read(&self, addr: u16) -> Option<u32> {
        if addr >= 0x8000 {
            let bank = self.prg_bank as u32 % self.prg_banks.max(1) as u32;
            Some(bank * 32768 + (addr & 0x7FFF) as u32)
        } else { None }
    }
    fn cpu_write(&mut self, addr: u16, data: u8) -> Option<MapperWriteResult> {
        if addr >= 0x4100 && addr < 0x6000 {
            self.prg_bank = (data >> 3) & 0x07;
            self.chr_bank = (data & 0x07) | ((data >> 3) & 0x08);
            self.mirror_mode = if data & 0x80 != 0 {
                MirrorMode::Vertical
            } else {
                MirrorMode::Horizontal
            };
            return Some(MapperWriteResult::with_mirror(self.mirror_mode));
        }
        None
    }
    fn ppu_read(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 {
            let bank = self.chr_bank as u32 % self.chr_banks.max(1) as u32;
            Some(bank * 8192 + addr as u32)
        } else { None }
    }
    fn ppu_write(&self, _addr: u16) -> Option<u32> { None }
    fn reset(&mut self) { self.prg_bank = 0; self.chr_bank = 0; }
}

// ============================================================
// Mapper 202 - 150合1 等合集卡帶
// ============================================================
pub struct Mapper202 {
    prg_banks: u8,
    chr_banks: u8,
    prg_bank: u8,
    chr_bank: u8,
    prg_mode: u8,
    mirror_mode: MirrorMode,
}

impl Mapper202 {
    pub fn new(prg_banks: u8, chr_banks: u8) -> Self {
        Mapper202 {
            prg_banks, chr_banks,
            prg_bank: 0, chr_bank: 0, prg_mode: 0,
            mirror_mode: MirrorMode::Vertical,
        }
    }
}

impl MapperTrait for Mapper202 {
    fn cpu_read(&self, addr: u16) -> Option<u32> {
        if addr >= 0x8000 {
            let total_prg = self.prg_banks as u32 * 16384;
            if total_prg == 0 { return Some(0); }

            if self.prg_mode == 0 {
                // 16KB 模式（鏡像）
                let offset = addr as u32 & 0x3FFF;
                Some(((self.prg_bank as u32 * 16384) + offset) % total_prg)
            } else {
                // 32KB 模式
                let bank32k = self.prg_bank as u32 >> 1;
                let offset = addr as u32 & 0x7FFF;
                Some(((bank32k * 32768) + offset) % total_prg)
            }
        } else { None }
    }

    fn cpu_write(&mut self, addr: u16, _data: u8) -> Option<MapperWriteResult> {
        if addr >= 0x8000 {
            let bank = ((addr >> 1) & 0x07) as u8;
            self.prg_bank = bank;
            self.chr_bank = bank;
            self.prg_mode = ((addr & 0x01) ^ ((addr >> 3) & 0x01)) as u8;
            self.mirror_mode = if addr & 0x01 != 0 {
                MirrorMode::Horizontal
            } else {
                MirrorMode::Vertical
            };
            return Some(MapperWriteResult::with_mirror(self.mirror_mode));
        }
        None
    }

    fn ppu_read(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 {
            if self.chr_banks == 0 {
                return Some(addr as u32);
            }
            let total = self.chr_banks as u32 * 8192;
            Some(((self.chr_bank as u32 * 8192) + (addr & 0x1FFF) as u32) % total.max(1))
        } else { None }
    }

    fn ppu_write(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 && self.chr_banks == 0 { Some(addr as u32) } else { None }
    }

    fn reset(&mut self) {
        self.prg_bank = 0; self.chr_bank = 0;
        self.prg_mode = 0;
    }
}

// ============================================================
// Mapper 225 - 52/64/72合1 等合集卡帶
// ============================================================
// 支援高達 2MB PRG ROM 和 1MB CHR ROM
// ============================================================
pub struct Mapper225 {
    prg_banks: u8,
    chr_banks: u8,
    prg_bank: u16,
    chr_bank: u16,
    prg_mode: u8,
    mirror_mode: MirrorMode,
}

impl Mapper225 {
    pub fn new(prg_banks: u8, chr_banks: u8) -> Self {
        Mapper225 {
            prg_banks, chr_banks,
            prg_bank: 0, chr_bank: 0, prg_mode: 0,
            mirror_mode: MirrorMode::Vertical,
        }
    }
}

impl MapperTrait for Mapper225 {
    fn cpu_read(&self, addr: u16) -> Option<u32> {
        if addr >= 0x8000 {
            let total_prg = self.prg_banks as u32 * 16384;
            if total_prg == 0 { return Some(0); }

            if self.prg_mode == 0 {
                // 32KB 模式：PRG bank 忽略最低位元，映射連續 32KB
                let bank32k = (self.prg_bank as u32 >> 1) & 0x3F;
                let offset = addr as u32 & 0x7FFF;
                Some((bank32k * 32768 + offset) % total_prg)
            } else {
                // 16KB 模式：$8000 和 $C000 都映射到同一個 16KB bank
                let offset = addr as u32 & 0x3FFF;
                Some((self.prg_bank as u32 * 16384 + offset) % total_prg)
            }
        } else { None }
    }

    fn cpu_write(&mut self, addr: u16, _data: u8) -> Option<MapperWriteResult> {
        if addr >= 0x8000 {
            // 參考 FCEUX 225.cpp：
            // A~[.HMO PPPP PPCC CCCC]
            //   C = bits 0-5  → CHR 8KB bank
            //   P = bits 6-11 → PRG 16KB bank
            //   O = bit 12    → PRG mode (0=32KB, 1=16KB)
            //   M = bit 13    → Mirroring (0=Vert, 1=Horz)
            //   H = bit 14    → High bit (bank extension)
            let hi_bit = ((addr >> 14) & 1) as u16;
            self.chr_bank = (addr & 0x3F) as u16 | (hi_bit << 6);
            self.prg_bank = ((addr >> 6) & 0x3F) as u16 | (hi_bit << 6);
            self.prg_mode = ((addr >> 12) & 1) as u8;
            // FCEUX 225.cpp: mirr = (A>>13)&1; setmirror(mirr^1)
            // MI_V=0, MI_H=1, 所以 mirr=0→Horizontal, mirr=1→Vertical
            self.mirror_mode = if (addr >> 13) & 1 != 0 {
                MirrorMode::Vertical
            } else {
                MirrorMode::Horizontal
            };
            return Some(MapperWriteResult::with_mirror(self.mirror_mode));
        }
        None
    }

    fn ppu_read(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 {
            if self.chr_banks == 0 { return Some(addr as u32); }
            let total = self.chr_banks as u32 * 8192;
            Some((self.chr_bank as u32 * 8192 + (addr & 0x1FFF) as u32) % total.max(1))
        } else { None }
    }

    fn ppu_write(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 && self.chr_banks == 0 { Some(addr as u32) } else { None }
    }

    fn reset(&mut self) {
        self.prg_bank = 0; self.chr_bank = 0; self.prg_mode = 0;
    }
}

// ============================================================
// Mapper 227 - 1200合1 等合集卡帶
// ============================================================
// 參考：https://www.nesdev.org/wiki/INES_Mapper_227
//
// 位址鎖存器 ($8000-$FFFF, write):
//   bit 0 (S): 0=16KB mode (PRG A14 from p), 1=PRG A14 from CPU A14
//   bit 1 (M): Mirroring (0=Vert, 1=Horz)
//   bits 2 (p): low bit of inner bank
//   bits 3-4 (PP): high bits of inner bank
//   bits 5-6 (QQ): low bits of outer bank
//   bit 7 (O): $C000 behavior (0=fixed, 1=mirror/32KB)
//   bit 8 (Q): high bit of outer bank
//   bit 9 (L): fixed bank select (0=bank#0, 1=bank#7)
//
// Power-on: All bits clear → S=0,O=0 → UNROM-like, bank 0 at both halves
// ============================================================
pub struct Mapper227 {
    prg_banks: u8,
    _chr_banks: u8,
    s_bit: bool,       // bit 0
    o_bit: bool,       // bit 7
    l_bit: bool,       // bit 9
    inner_bank: u8,    // PPp (3 bits)
    outer_bank: u8,    // QQQ (3 bits)
    mirror_mode: MirrorMode,
}

impl Mapper227 {
    pub fn new(prg_banks: u8, chr_banks: u8) -> Self {
        Mapper227 {
            prg_banks, _chr_banks: chr_banks,
            s_bit: false, o_bit: false, l_bit: false,
            inner_bank: 0, outer_bank: 0,
            mirror_mode: MirrorMode::Vertical,
        }
    }
}

impl MapperTrait for Mapper227 {
    fn cpu_read(&self, addr: u16) -> Option<u32> {
        if addr >= 0x8000 {
            let total_prg = self.prg_banks as u32 * 16384;
            if total_prg == 0 { return Some(0); }

            let outer = self.outer_bank as u32;
            let inner = self.inner_bank as u32; // PPp (0-7)

            if self.s_bit && self.o_bit {
                // S=1, O=1: NROM-256 (32KB mode)
                // PP selects 32KB block, CPU A14 selects half
                let bank_32k = outer * 4 + (inner >> 1);
                let offset = (addr & 0x7FFF) as u32;
                Some((bank_32k * 32768 + offset) % total_prg)
            } else if !self.s_bit && self.o_bit {
                // S=0, O=1: NROM-128 (16KB mirrored at $8000 and $C000)
                let bank_16k = outer * 8 + inner;
                let offset = (addr & 0x3FFF) as u32;
                Some((bank_16k * 16384 + offset) % total_prg)
            } else if !self.o_bit {
                // O=0: UNROM-like
                // $8000-$BFFF: switchable 16KB bank
                // $C000-$FFFF: fixed bank (L selects #0 or #7)
                if addr < 0xC000 {
                    let bank_16k = outer * 8 + inner;
                    let offset = (addr & 0x3FFF) as u32;
                    Some((bank_16k * 16384 + offset) % total_prg)
                } else {
                    let fixed_inner = if self.l_bit { 7u32 } else { 0u32 };
                    let bank_16k = outer * 8 + fixed_inner;
                    let offset = (addr & 0x3FFF) as u32;
                    Some((bank_16k * 16384 + offset) % total_prg)
                }
            } else {
                // S=1, O=0: same as NROM-256 but even banks only
                let bank_32k = outer * 4 + (inner >> 1);
                let offset = (addr & 0x7FFF) as u32;
                Some((bank_32k * 32768 + offset) % total_prg)
            }
        } else { None }
    }

    fn cpu_write(&mut self, addr: u16, _data: u8) -> Option<MapperWriteResult> {
        if addr >= 0x8000 {
            self.s_bit = (addr & 0x01) != 0;                    // bit 0
            self.mirror_mode = if addr & 0x02 != 0 {
                MirrorMode::Horizontal
            } else {
                MirrorMode::Vertical
            };                                                    // bit 1
            let p = ((addr >> 2) & 0x01) as u8;                 // bit 2
            let pp = ((addr >> 3) & 0x03) as u8;                // bits 3-4
            self.inner_bank = (pp << 1) | p;                    // PPp
            self.outer_bank = ((addr >> 5) & 0x03) as u8        // bits 5-6 (QQ low)
                | (((addr >> 8) & 0x01) << 2) as u8;            // bit 8 (Q high)
            self.o_bit = (addr & 0x80) != 0;                    // bit 7
            self.l_bit = (addr & 0x0200) != 0;                  // bit 9
            return Some(MapperWriteResult::with_mirror(self.mirror_mode));
        }
        None
    }

    fn ppu_read(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 { Some(addr as u32) } else { None }
    }
    fn ppu_write(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 { Some(addr as u32) } else { None }
    }
    fn reset(&mut self) {
        self.s_bit = false;
        self.o_bit = false;
        self.l_bit = false;
        self.inner_bank = 0;
        self.outer_bank = 0;
        self.mirror_mode = MirrorMode::Vertical;
    }
}

// ============================================================
// Mapper 245 (Waixing MMC3 variant)
// ============================================================
// 類似 MMC3 但有額外的 CHR RAM 控制和 PRG 高位元
// 用於一些中文版遊戲
// ============================================================
pub struct Mapper245 {
    prg_banks: u8,
    _chr_banks: u8,
    bank_regs: [u8; 8],
    bank_select: u8,
    mirror_mode: MirrorMode,
    // IRQ
    irq_counter: u8,
    irq_latch: u8,
    irq_enabled: bool,
    irq_reload: bool,
    irq_pending: bool,
    // 額外 PRG 控制
    prg_high_bit: u8,
}

impl Mapper245 {
    pub fn new(prg_banks: u8, chr_banks: u8) -> Self {
        Mapper245 {
            prg_banks, _chr_banks: chr_banks,
            bank_regs: [0; 8], bank_select: 0,
            mirror_mode: MirrorMode::Vertical,
            irq_counter: 0, irq_latch: 0,
            irq_enabled: false, irq_reload: false, irq_pending: false,
            prg_high_bit: 0,
        }
    }
}

impl MapperTrait for Mapper245 {
    fn cpu_read(&self, addr: u16) -> Option<u32> {
        let count = self.prg_banks as u32 * 2; // 8KB banks
        match addr {
            0x8000..=0x9FFF => {
                let bank = if self.bank_select & 0x40 != 0 {
                    count - 2
                } else {
                    (self.bank_regs[6] as u32 | self.prg_high_bit as u32) % count
                };
                Some(bank * 8192 + (addr & 0x1FFF) as u32)
            }
            0xA000..=0xBFFF => {
                let bank = (self.bank_regs[7] as u32 | self.prg_high_bit as u32) % count;
                Some(bank * 8192 + (addr & 0x1FFF) as u32)
            }
            0xC000..=0xDFFF => {
                let bank = if self.bank_select & 0x40 != 0 {
                    (self.bank_regs[6] as u32 | self.prg_high_bit as u32) % count
                } else {
                    count - 2
                };
                Some(bank * 8192 + (addr & 0x1FFF) as u32)
            }
            0xE000..=0xFFFF => {
                Some((count - 1) * 8192 + (addr & 0x1FFF) as u32)
            }
            _ => None,
        }
    }

    fn cpu_write(&mut self, addr: u16, data: u8) -> Option<MapperWriteResult> {
        match addr {
            0x8000..=0x9FFF => {
                if addr & 1 != 0 {
                    let reg = (self.bank_select & 0x07) as usize;
                    self.bank_regs[reg] = data;
                    if reg == 0 {
                        self.prg_high_bit = if data & 0x02 != 0 { 0x40 } else { 0 };
                    }
                } else {
                    self.bank_select = data;
                }
            }
            0xA000..=0xBFFF => {
                if addr & 1 == 0 {
                    self.mirror_mode = if data & 0x01 != 0 {
                        MirrorMode::Horizontal
                    } else {
                        MirrorMode::Vertical
                    };
                    return Some(MapperWriteResult::with_mirror(self.mirror_mode));
                }
            }
            0xC000..=0xDFFF => {
                if addr & 1 != 0 { self.irq_reload = true; }
                else { self.irq_latch = data; }
            }
            0xE000..=0xFFFF => {
                if addr & 1 != 0 { self.irq_enabled = true; }
                else { self.irq_enabled = false; self.irq_pending = false; }
            }
            _ => {}
        }
        None
    }

    fn ppu_read(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 { Some(addr as u32) } else { None } // CHR RAM
    }
    fn ppu_write(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 { Some(addr as u32) } else { None }
    }

    fn reset(&mut self) {
        self.bank_regs = [0; 8]; self.bank_select = 0;
        self.irq_counter = 0; self.irq_latch = 0;
        self.irq_enabled = false; self.irq_reload = false; self.irq_pending = false;
        self.prg_high_bit = 0;
    }

    fn scanline(&mut self) {
        if self.irq_reload || self.irq_counter == 0 {
            self.irq_counter = self.irq_latch;
            self.irq_reload = false;
        } else {
            self.irq_counter -= 1;
        }
        if self.irq_counter == 0 && self.irq_enabled {
            self.irq_pending = true;
        }
    }

    fn check_irq(&mut self) -> bool {
        let p = self.irq_pending; self.irq_pending = false; p
    }
}

// ============================================================
// Mapper 253 (Waixing VRC4 variant)
// ============================================================
// 類似 VRC4 的中國變體，用於龍珠等遊戲
// 支援動態 CHR ROM/RAM 切換（vlock 機制）
//
// 參考：FCEUX 253.cpp
// ============================================================
pub struct Mapper253 {
    prg_banks: u8,
    chr_banks: u8,
    prg_bank0: u8,
    prg_bank1: u8,
    /// CHR bank 暫存器低 8 位元
    chr_lo: [u8; 8],
    /// CHR bank 暫存器高 4 位元（來自 V >> 4）
    chr_hi: [u8; 8],
    /// VRAM 鎖定旗標：控制 CHR RAM 替換是否啟用
    /// false = CHR RAM 替換啟用（chrlo==4||5 時使用 CHR RAM）
    /// true = CHR RAM 替換停用（所有 bank 使用 CHR ROM）
    vlock: bool,
    mirror_mode: MirrorMode,
    /// CHR ROM 大小（位元組），用於計算 CHR RAM 的起始偏移
    chr_rom_size: u32,
    // IRQ（使用 CPU 週期計時，但以 scanline 近似）
    irq_latch: u8,
    irq_control: u8,
    irq_counter: u8,
    irq_enabled: bool,
    irq_pending: bool,
    irq_prescaler: i16,
}

impl Mapper253 {
    pub fn new(prg_banks: u8, chr_banks: u8) -> Self {
        Mapper253 {
            prg_banks, chr_banks,
            prg_bank0: 0, prg_bank1: 0,
            chr_lo: [0; 8], chr_hi: [0; 8],
            vlock: false,
            mirror_mode: MirrorMode::Vertical,
            chr_rom_size: chr_banks as u32 * 8192,
            irq_latch: 0, irq_control: 0,
            irq_counter: 0, irq_enabled: false,
            irq_pending: false, irq_prescaler: 0,
        }
    }

    /// 計算 CHR bank 對應的位元組偏移量
    /// 如果 chrlo==4||5 且 !vlock，使用 CHR RAM（在 chr_data 末尾的 8KB 區域）
    fn get_chr_offset(&self, region: usize) -> (u32, bool) {
        let chr = self.chr_lo[region] as u32 | ((self.chr_hi[region] as u32) << 8);
        let is_chr_ram = (self.chr_lo[region] == 4 || self.chr_lo[region] == 5) && !self.vlock;

        if is_chr_ram {
            // 使用 CHR RAM：偏移量 = chr_rom_size + (chr & 1) * 1024 * 4
            // FCEUX: setchr1r(0x10, i << 10, chr & 1)
            // 0x10 = CHR RAM，chr & 1 選擇 CHR RAM 中的 4KB 頁面
            let ram_bank = (chr & 1) as u32;
            let offset = self.chr_rom_size + ram_bank * 4096 + (region as u32 & 3) * 1024;
            (offset, true)
        } else {
            // 使用 CHR ROM
            let total = (self.chr_banks as u32 * 8).max(1);
            let bank = chr % total;
            (bank * 1024, false)
        }
    }
}

impl MapperTrait for Mapper253 {
    fn cpu_read(&self, addr: u16) -> Option<u32> {
        let count = self.prg_banks as u32 * 2;
        match addr {
            0x8000..=0x9FFF => Some((self.prg_bank0 as u32 % count) * 8192 + (addr & 0x1FFF) as u32),
            0xA000..=0xBFFF => Some((self.prg_bank1 as u32 % count) * 8192 + (addr & 0x1FFF) as u32),
            0xC000..=0xDFFF => Some((count - 2) * 8192 + (addr & 0x1FFF) as u32),
            0xE000..=0xFFFF => Some((count - 1) * 8192 + (addr & 0x1FFF) as u32),
            _ => None,
        }
    }

    fn cpu_write(&mut self, addr: u16, data: u8) -> Option<MapperWriteResult> {
        // FCEUX 253.cpp 地址解碼：
        // ind = ((((A & 8) | (A >> 8)) >> 3) + 2) & 7
        // sar = A & 4 (是否寫入高 4 位元)
        let a = addr;
        let ind = (((((a & 8) | (a >> 8)) >> 3) as u8).wrapping_add(2)) & 7;
        let sar = (a & 4) != 0;

        match a & 0xF000 {
            0x8000 => { self.prg_bank0 = data; }
            0xA000 => { self.prg_bank1 = data; }
            0x9000 => {
                // 鏡像控制
                self.mirror_mode = match data & 0x03 {
                    0 => MirrorMode::Vertical,
                    1 => MirrorMode::Horizontal,
                    2 => MirrorMode::SingleScreenLow,
                    _ => MirrorMode::SingleScreenHigh,
                };
                return Some(MapperWriteResult::with_mirror(self.mirror_mode));
            }
            0xB000 | 0xC000 | 0xD000 | 0xE000 => {
                // CHR bank 暫存器寫入
                if !sar {
                    // 低 4 位元：chrlo[ind] = (chrlo[ind] & 0xF0) | (V & 0x0F)
                    self.chr_lo[ind as usize] = (self.chr_lo[ind as usize] & 0xF0) | (data & 0x0F);
                } else {
                    // 高 4 位元：chrlo[ind] = (chrlo[ind] & 0x0F) | ((V & 0x0F) << 4)
                    self.chr_lo[ind as usize] = (self.chr_lo[ind as usize] & 0x0F) | ((data & 0x0F) << 4);
                    // chrhi[ind] = V >> 4 (存儲高 4 位元)
                    self.chr_hi[ind as usize] = data >> 4;
                }
                // vlock 機制：監控 chrlo[0] 的值來切換 CHR RAM 替換
                if ind == 0 {
                    let clo = self.chr_lo[0];
                    if clo == 0xC8 {
                        self.vlock = false; // 解鎖：啟用 CHR RAM 替換
                    } else if clo == 0x88 {
                        self.vlock = true;  // 鎖定：停用 CHR RAM 替換
                    }
                }
            }
            0xF000 => {
                // IRQ 暫存器
                match a & 0xF00C {
                    0xF000 => { self.irq_latch = (self.irq_latch & 0xF0) | (data & 0x0F); }
                    0xF004 => { self.irq_latch = (self.irq_latch & 0x0F) | ((data & 0x0F) << 4); }
                    0xF008 => {
                        self.irq_control = data;
                        self.irq_enabled = (data & 0x02) != 0;
                        if data & 0x02 != 0 {
                            self.irq_counter = self.irq_latch;
                            self.irq_prescaler = 341;
                        }
                        self.irq_pending = false;
                    }
                    0xF00C => {
                        self.irq_enabled = (self.irq_control & 0x01) != 0;
                        self.irq_pending = false;
                    }
                    _ => {}
                }
            }
            _ => {}
        }
        None
    }

    fn ppu_read(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 {
            if self.chr_banks == 0 { return Some(addr as u32); }
            let region = (addr >> 10) as usize;
            let (offset, _is_ram) = self.get_chr_offset(region);
            Some(offset + (addr & 0x3FF) as u32)
        } else { None }
    }

    fn ppu_write(&self, addr: u16) -> Option<u32> {
        if addr < 0x2000 {
            let region = (addr >> 10) as usize;
            let (_offset, is_ram) = self.get_chr_offset(region);
            if is_ram {
                // CHR RAM bank：允許寫入
                Some(_offset + (addr & 0x3FF) as u32)
            } else if self.chr_banks == 0 {
                Some(addr as u32)
            } else {
                None
            }
        } else { None }
    }

    fn reset(&mut self) {
        self.prg_bank0 = 0; self.prg_bank1 = 0;
        self.chr_lo = [0; 8]; self.chr_hi = [0; 8];
        self.vlock = false;
        self.irq_latch = 0; self.irq_control = 0;
        self.irq_counter = 0; self.irq_enabled = false;
        self.irq_pending = false; self.irq_prescaler = 0;
    }

    fn scanline(&mut self) {
        if self.irq_enabled {
            self.irq_prescaler -= 3;
            if self.irq_prescaler <= 0 {
                self.irq_prescaler += 341;
                if self.irq_counter == 0xFF {
                    self.irq_counter = self.irq_latch;
                    self.irq_pending = true;
                } else {
                    self.irq_counter += 1;
                }
            }
        }
    }

    fn check_irq(&mut self) -> bool {
        let p = self.irq_pending; self.irq_pending = false; p
    }

    fn chr_writable_mask(&self) -> u8 {
        if self.chr_banks == 0 { return 0xFF; }
        let mut mask = 0u8;
        for i in 0..8 {
            let (_offset, is_ram) = self.get_chr_offset(i);
            if is_ram {
                mask |= 1 << i;
            }
        }
        mask
    }
}

// ============================================================
// Mapper 工廠函數 - 根據 Mapper 編號建立對應的 Mapper 實例
// ============================================================

/// 建立 Mapper 實例
/// 根據卡帶的 Mapper 編號，建立對應的 Mapper 實作
pub fn create_mapper(mapper_id: u8, prg_banks: u8, chr_banks: u8) -> Box<dyn MapperTrait> {
    match mapper_id {
        0   => Box::new(Mapper0::new(prg_banks, chr_banks)),
        1   => Box::new(Mapper1::new(prg_banks, chr_banks)),
        2   => Box::new(Mapper2::new(prg_banks, chr_banks)),
        3   => Box::new(Mapper3::new(prg_banks, chr_banks)),
        4   => Box::new(Mapper4::new(prg_banks, chr_banks)),
        7   => Box::new(Mapper7::new(prg_banks, chr_banks)),
        11  => Box::new(Mapper11::new(prg_banks, chr_banks)),
        15  => Box::new(Mapper15::new(prg_banks, chr_banks)),
        16  => Box::new(Mapper16::new(prg_banks, chr_banks)),
        23  => Box::new(Mapper23::new(prg_banks, chr_banks)),
        66  => Box::new(Mapper66::new(prg_banks, chr_banks)),
        71  => Box::new(Mapper71::new(prg_banks, chr_banks)),
        113 => Box::new(Mapper113::new(prg_banks, chr_banks)),
        202 => Box::new(Mapper202::new(prg_banks, chr_banks)),
        225 => Box::new(Mapper225::new(prg_banks, chr_banks)),
        227 => Box::new(Mapper227::new(prg_banks, chr_banks)),
        245 => Box::new(Mapper245::new(prg_banks, chr_banks)),
        253 => Box::new(Mapper253::new(prg_banks, chr_banks)),
        // 未支援的 Mapper 預設使用 Mapper 0
        _   => {
            Box::new(Mapper0::new(prg_banks, chr_banks))
        }
    }
}
