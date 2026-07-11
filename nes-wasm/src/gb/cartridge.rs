// ============================================================
// Game Boy 卡帶 - ROM 解析與 MBC 記憶體映射控制器
// ============================================================
// 支援：No MBC (ROM Only), MBC1, MBC3 (含 RTC), MBC5
// ============================================================

/// MBC 類型
#[derive(Clone, Copy, PartialEq)]
pub enum MbcType {
    NoMbc,
    Mbc1,
    Mbc3,
    Mbc5,
}

/// 卡帶結構
pub struct Cartridge {
    pub rom: Vec<u8>,
    pub ram: Vec<u8>,
    pub mbc: MbcType,
    pub has_battery: bool,
    pub has_rtc: bool,
    pub title: String,

    // MBC 狀態
    pub ram_enabled: bool,
    pub rom_bank: u16,      // 目前 ROM Bank（$4000-$7FFF）
    pub ram_bank: u8,       // 目前 RAM Bank / RTC 暫存器選擇
    pub banking_mode: u8,   // MBC1 banking mode (0=ROM, 1=RAM)

    // ROM/RAM 遮罩
    rom_bank_mask: u16,
    ram_bank_mask: u8,

    // MBC3 RTC
    rtc_regs: [u8; 5],       // S, M, H, DL, DH
    rtc_latched: [u8; 5],
    rtc_latch_ready: bool,
    rtc_mapped: bool,         // true = $A000 映射 RTC 而非 RAM
}

impl Cartridge {
    pub fn new() -> Self {
        Cartridge {
            rom: Vec::new(),
            ram: Vec::new(),
            mbc: MbcType::NoMbc,
            has_battery: false,
            has_rtc: false,
            title: String::new(),
            ram_enabled: false,
            rom_bank: 1,
            ram_bank: 0,
            banking_mode: 0,
            rom_bank_mask: 1,
            ram_bank_mask: 0,
            rtc_regs: [0; 5],
            rtc_latched: [0; 5],
            rtc_latch_ready: false,
            rtc_mapped: false,
        }
    }

    /// 從 ROM 資料載入卡帶
    pub fn load(&mut self, data: &[u8]) -> bool {
        if data.len() < 0x150 {
            return false;
        }

        let cart_type = data[0x147];
        let mbc = match cart_type {
            0x00 | 0x08 | 0x09 => MbcType::NoMbc,
            0x01..=0x03 => MbcType::Mbc1,
            0x0F..=0x13 => MbcType::Mbc3,
            0x19..=0x1E => MbcType::Mbc5,
            _ => return false,
        };

        self.rom = data.to_vec();

        // 解析標題 ($0134-$0143)
        let title_bytes: Vec<u8> = data[0x134..0x144]
            .iter()
            .copied()
            .take_while(|&b| b != 0)
            .collect();
        self.title = String::from_utf8_lossy(&title_bytes).to_string();

        // 解析 MBC 類型 ($0147)
        self.mbc = mbc;

        self.has_battery = matches!(cart_type, 0x03 | 0x06 | 0x09 | 0x0F | 0x10 | 0x13 | 0x1B | 0x1E);
        self.has_rtc = matches!(cart_type, 0x0F | 0x10);

        // ROM 大小 ($0148): 32KB << value
        let rom_banks = match data[0x148] {
            0 => 2,
            n if n <= 8 => 2u16 << n,
            _ => 2,
        };
        self.rom_bank_mask = rom_banks.saturating_sub(1);

        // RAM 大小 ($0149)
        let ram_size = match data[0x149] {
            0x00 => 0,
            0x01 => 2 * 1024,
            0x02 => 8 * 1024,
            0x03 => 32 * 1024,
            0x04 => 128 * 1024,
            0x05 => 64 * 1024,
            _ => 0,
        };
        self.ram = vec![0; ram_size];
        self.ram_bank_mask = if ram_size > 0 {
            ((ram_size / 8192) as u8).saturating_sub(1)
        } else {
            0
        };

        self.rom_bank = 1;
        self.ram_bank = 0;
        self.ram_enabled = false;
        self.banking_mode = 0;

        true
    }

    /// 讀取 ROM 空間 ($0000-$7FFF)
    pub fn read(&self, addr: u16) -> u8 {
        match self.mbc {
            MbcType::NoMbc => {
                let idx = addr as usize;
                if idx < self.rom.len() { self.rom[idx] } else { 0xFF }
            }
            MbcType::Mbc1 => self.mbc1_read_rom(addr),
            MbcType::Mbc3 => self.mbc3_read_rom(addr),
            MbcType::Mbc5 => self.mbc5_read_rom(addr),
        }
    }

    /// 寫入 ROM 空間（MBC 暫存器控制）
    pub fn write(&mut self, addr: u16, val: u8) {
        match self.mbc {
            MbcType::NoMbc => {}
            MbcType::Mbc1 => self.mbc1_write(addr, val),
            MbcType::Mbc3 => self.mbc3_write(addr, val),
            MbcType::Mbc5 => self.mbc5_write(addr, val),
        }
    }

    /// 讀取外部 RAM ($A000-$BFFF)
    pub fn read_ram(&self, addr: u16) -> u8 {
        if !self.ram_enabled { return 0xFF; }

        if self.mbc == MbcType::Mbc3 && self.rtc_mapped {
            let idx = self.ram_bank as usize;
            if idx < 5 { return self.rtc_latched[idx]; }
            return 0xFF;
        }

        let offset = (addr - 0xA000) as usize;
        let bank_offset = self.ram_bank as usize * 0x2000;
        let idx = bank_offset + offset;
        if idx < self.ram.len() { self.ram[idx] } else { 0xFF }
    }

    /// 寫入外部 RAM ($A000-$BFFF)
    pub fn write_ram(&mut self, addr: u16, val: u8) {
        if !self.ram_enabled { return; }

        if self.mbc == MbcType::Mbc3 && self.rtc_mapped {
            let idx = self.ram_bank as usize;
            if idx < 5 { self.rtc_regs[idx] = val; }
            return;
        }

        let offset = (addr - 0xA000) as usize;
        let bank_offset = self.ram_bank as usize * 0x2000;
        let idx = bank_offset + offset;
        if idx < self.ram.len() { self.ram[idx] = val; }
    }

    // ===== MBC1 =====

    fn mbc1_read_rom(&self, addr: u16) -> u8 {
        let idx = if addr < 0x4000 {
            if self.banking_mode == 1 {
                let hi = (self.ram_bank as usize & 0x03) << 5;
                (hi * 0x4000 + addr as usize) % self.rom.len().max(1)
            } else {
                addr as usize
            }
        } else {
            let bank = ((self.ram_bank as u16 & 0x03) << 5 | (self.rom_bank & 0x1F)) & self.rom_bank_mask;
            (bank as usize * 0x4000 + (addr as usize - 0x4000)) % self.rom.len().max(1)
        };
        if idx < self.rom.len() { self.rom[idx] } else { 0xFF }
    }

    fn mbc1_write(&mut self, addr: u16, val: u8) {
        match addr {
            0x0000..=0x1FFF => self.ram_enabled = (val & 0x0F) == 0x0A,
            0x2000..=0x3FFF => {
                let mut bank = val & 0x1F;
                if bank == 0 { bank = 1; }
                self.rom_bank = bank as u16;
            }
            0x4000..=0x5FFF => self.ram_bank = val & 0x03,
            0x6000..=0x7FFF => self.banking_mode = val & 0x01,
            _ => {}
        }
    }

    // ===== MBC3 =====

    fn mbc3_read_rom(&self, addr: u16) -> u8 {
        let idx = if addr < 0x4000 {
            addr as usize
        } else {
            let bank = (self.rom_bank & 0x7F).max(1) & self.rom_bank_mask;
            bank as usize * 0x4000 + (addr as usize - 0x4000)
        };
        let idx = idx % self.rom.len().max(1);
        if idx < self.rom.len() { self.rom[idx] } else { 0xFF }
    }

    fn mbc3_write(&mut self, addr: u16, val: u8) {
        match addr {
            0x0000..=0x1FFF => self.ram_enabled = (val & 0x0F) == 0x0A,
            0x2000..=0x3FFF => {
                self.rom_bank = (val & 0x7F).max(1) as u16;
            }
            0x4000..=0x5FFF => {
                if val <= 0x03 {
                    self.ram_bank = val;
                    self.rtc_mapped = false;
                } else if val >= 0x08 && val <= 0x0C {
                    self.ram_bank = val - 0x08;
                    self.rtc_mapped = true;
                }
            }
            0x6000..=0x7FFF => {
                if val == 0x01 && self.rtc_latch_ready {
                    self.rtc_latched = self.rtc_regs;
                }
                self.rtc_latch_ready = val == 0x00;
            }
            _ => {}
        }
    }

    // ===== MBC5 =====

    fn mbc5_read_rom(&self, addr: u16) -> u8 {
        let idx = if addr < 0x4000 {
            addr as usize
        } else {
            let bank = self.rom_bank & self.rom_bank_mask;
            bank as usize * 0x4000 + (addr as usize - 0x4000)
        };
        let idx = idx % self.rom.len().max(1);
        if idx < self.rom.len() { self.rom[idx] } else { 0xFF }
    }

    fn mbc5_write(&mut self, addr: u16, val: u8) {
        match addr {
            0x0000..=0x1FFF => self.ram_enabled = (val & 0x0F) == 0x0A,
            0x2000..=0x2FFF => {
                // 低 8 位元
                self.rom_bank = (self.rom_bank & 0x100) | val as u16;
            }
            0x3000..=0x3FFF => {
                // 第 9 位元
                self.rom_bank = (self.rom_bank & 0xFF) | ((val as u16 & 0x01) << 8);
            }
            0x4000..=0x5FFF => {
                self.ram_bank = val & 0x0F;
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gb_rom(cart_type: u8) -> Vec<u8> {
        let mut rom = vec![0; 32 * 1024];
        rom[0x147] = cart_type;
        rom
    }

    #[test]
    fn accepts_implemented_mbc_types() {
        for cart_type in [0x00, 0x01, 0x03, 0x0F, 0x13, 0x19, 0x1E] {
            assert!(Cartridge::new().load(&gb_rom(cart_type)), "cartridge type {cart_type:#04x}");
        }
    }

    #[test]
    fn rejects_unimplemented_mbc_types() {
        assert!(!Cartridge::new().load(&gb_rom(0x05)));
        assert!(!Cartridge::new().load(&gb_rom(0x22)));
    }
}
