// ============================================================
// SNES 卡帶解析器 - SMC/SFC 格式
// ============================================================
// 支援 HiROM ($21) 與 LoROM ($20) 映射
// 自動偵測 SMC 512-byte 標頭
// 解析 $FFB0-$FFDF 區域的遊戲資訊
// ============================================================

/// ROM 映射模式
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MapMode {
    LoROM,   // Mode $20
    HiROM,   // Mode $21
    ExHiROM, // Mode $25/$35
    SA1,     // Mode $23
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnhancementChip {
    None,
    Dsp1,
    Cx4,
    Sa1,
    Sdd1,
    SuperFx,
    Spc7110,
    Unknown(u8),
}

impl EnhancementChip {
    pub fn supported_by_native_core(self) -> bool {
        matches!(self, Self::None | Self::Dsp1 | Self::Cx4 | Self::Sa1 | Self::Sdd1)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CartridgeProfile {
    pub map_mode: MapMode,
    pub map_mode_byte: u8,
    pub rom_type: u8,
    pub rom_size_code: u8,
    pub sram_size_code: u8,
    pub region: u8,
    pub version: u8,
    pub checksum: u16,
    pub complement: u16,
    pub header_offset: usize,
    pub copier_header_size: usize,
    pub enhancement: EnhancementChip,
}

impl Default for CartridgeProfile {
    fn default() -> Self {
        Self {
            map_mode: MapMode::HiROM,
            map_mode_byte: 0,
            rom_type: 0,
            rom_size_code: 0,
            sram_size_code: 0,
            region: 0,
            version: 0,
            checksum: 0,
            complement: 0,
            header_offset: 0,
            copier_header_size: 0,
            enhancement: EnhancementChip::None,
        }
    }
}
/// SNES 卡帶
pub struct Cartridge {
    /// ROM 資料 (去除 SMC 標頭)
    pub rom: Vec<u8>,
    /// SRAM (電池備份)
    pub sram: Vec<u8>,
    /// 映射模式
    pub map_mode: MapMode,
    /// ROM 大小 (bytes)
    pub rom_size: usize,
    /// SRAM 大小 (bytes)
    pub sram_size: usize,
    /// 遊戲名稱 (ASCII)
    pub title: String,
    /// 是否使用 FastROM
    pub fast_rom: bool,
    /// 是否包含 DSP-1 協處理器
    pub has_dsp1: bool,
    /// 是否包含 CX4 協處理器 (Mega Man X2/X3)
    pub has_cx4: bool,
    /// 由卡帶標頭推導的映射與 enhancement chip profile
    pub profile: CartridgeProfile,
    /// S-DD1 selects one 1MB ROM window for each $C0-$FF bank group.
    pub sdd1_map: [u8; 4],
    /// S-DD1 hard and per-DMA-channel decompression enables ($4800/$4801).
    pub sdd1_hard_enable: u8,
    pub sdd1_soft_enable: u8,
    /// 是否已載入
    pub loaded: bool,
}

impl Cartridge {
    pub fn new() -> Self {
        Cartridge {
            rom: Vec::new(),
            sram: vec![0; 0x8000], // 預設 32KB SRAM
            map_mode: MapMode::HiROM,
            rom_size: 0,
            sram_size: 0x8000,
            title: String::new(),
            fast_rom: false,
            has_dsp1: false,
            has_cx4: false,
            profile: CartridgeProfile::default(),
            sdd1_map: [0, 1, 2, 3],
            sdd1_hard_enable: 0,
            sdd1_soft_enable: 0,
            loaded: false,
        }
    }

    /// 載入 ROM 資料
    pub fn load(&mut self, data: &[u8]) -> bool {
        if data.len() < 0x8000 {
            return false;
        }

        // 偵測並移除 SMC 512-byte 標頭
        let offset = if data.len() % 0x400 == 0x200 { 0x200 } else { 0 };
        let rom_data = &data[offset..];

        if rom_data.len() < 0x8000 {
            return false;
        }

        self.rom = rom_data.to_vec();
        self.rom_size = self.rom.len();
        self.sdd1_map = [0, 1, 2, 3];
        self.sdd1_hard_enable = 0;
        self.sdd1_soft_enable = 0;

        // 嘗試偵測映射模式
        self.detect_map_mode();

        // 解析標頭
        self.parse_header();

        self.profile.copier_header_size = offset;

        self.loaded = true;
        true
    }

    /// 偵測 ROM 映射模式
    fn detect_map_mode(&mut self) {
        // 嘗試 HiROM 標頭位置 ($FFD5)
        let hirom_score = self.score_header(0xFFD5);
        // ExHiROM 的原始標頭通常位於 ROM offset $40FFD5
        let exhirom_score = self.score_header(0x40FFD5);
        // 嘗試 LoROM 標頭位置 ($7FD5)
        let lorom_score = self.score_header(0x7FD5);

        if exhirom_score > hirom_score && exhirom_score > lorom_score {
            self.map_mode = MapMode::ExHiROM;
        } else if hirom_score > lorom_score {
            let mode = self.rom.get(0xFFD5).copied().unwrap_or(0) & 0x0F;
            if mode == 0x05 && self.rom.len() > 0x400000 {
                self.map_mode = MapMode::ExHiROM;
            } else {
                self.map_mode = MapMode::HiROM;
            }
        } else {
            let mode = self.rom.get(0x7FD5).copied().unwrap_or(0) & 0x0F;
            if mode == 0x03 {
                self.map_mode = MapMode::SA1;
            } else {
                self.map_mode = MapMode::LoROM;
            }
        }
    }

    /// 對標頭位置進行評分（越高越可能是正確的映射模式）
    fn score_header(&self, map_mode_addr: usize) -> i32 {
        if map_mode_addr >= self.rom.len() || map_mode_addr < 5 {
            return -100;
        }

        let mut score: i32 = 0;
        let base = map_mode_addr - 5; // 回到標頭起始 ($FFD0 or $7FD0)

        // 檢查 ROM 大小是否合理
        if base + 0x1F < self.rom.len() {
            let map_byte = self.rom[map_mode_addr];
            let rom_type = self.rom[base + 6]; // ROM type
            let rom_size_byte = self.rom[base + 7];
            let sram_size_byte = self.rom[base + 8];

            // 映射模式位元檢查
            let mode = map_byte & 0x0F;
            if map_mode_addr > 0x8000 {
                // HiROM 預期 mode $21 或 $25 (ExHiROM)
                if mode == 0x01 || mode == 0x05 {
                    score += 10;
                }
            } else {
                // LoROM 預期 mode $20 或 $23
                if mode == 0x00 || mode == 0x03 {
                    score += 10;
                }
            }

            // ROM 大小合理性（8 = 256KB, 12 = 4MB, 13 = 8MB）
            if rom_size_byte >= 7 && rom_size_byte <= 13 {
                score += 5;
            }

            // SRAM 大小合理性
            if sram_size_byte <= 8 {
                score += 3;
            }

            // ROM type 合理性
            if rom_type <= 0x06 || rom_type == 0xF3 {
                score += 3;
            }

            // 補碼驗證
            if base + 0x1F < self.rom.len() && base + 0x1E < self.rom.len() {
                let checksum = (self.rom[base + 0x0F] as u16) << 8 | self.rom[base + 0x0E] as u16;
                let complement = (self.rom[base + 0x0D] as u16) << 8 | self.rom[base + 0x0C] as u16;
                if checksum ^ complement == 0xFFFF {
                    score += 20;
                }
            }

            // 標題字元合理性 (offset $FFC0-$FFD4 / $7FC0-$7FD4)
            let title_base = map_mode_addr - 0x15;
            if title_base + 20 < self.rom.len() {
                let mut valid_chars = 0;
                for i in 0..21 {
                    let c = self.rom[title_base + i];
                    if (c >= 0x20 && c <= 0x7E) || (c >= 0x80) {
                        valid_chars += 1;
                    }
                }
                score += valid_chars;
            }
        }

        score
    }

    /// 解析 ROM 標頭
    fn parse_header(&mut self) {
        let header_base = match self.map_mode {
            MapMode::HiROM => 0xFFC0,
            MapMode::ExHiROM => 0x40FFC0,
            MapMode::LoROM | MapMode::SA1 => 0x7FC0,
        };

        if header_base + 0x20 > self.rom.len() {
            return;
        }

        self.has_dsp1 = false;
        self.has_cx4 = false;

        // 讀取遊戲名稱 ($FFC0-$FFD4, 21 bytes)
        let mut title_bytes = Vec::new();
        for i in 0..21 {
            let c = self.rom[header_base + i];
            if c >= 0x20 && c <= 0x7E {
                title_bytes.push(c);
            }
        }
        self.title = String::from_utf8_lossy(&title_bytes).trim().to_string();

        // 映射模式 ($FFD5)
        let map_byte = self.rom[header_base + 0x15];
        self.fast_rom = map_byte & 0x10 != 0;

        // 協處理器偵測 ($FFD6)
        let rom_type = self.rom[header_base + 0x16];
        let map_mode_low = map_byte & 0x0F;
        let complement = u16::from_le_bytes([
            self.rom[header_base + 0x1C],
            self.rom[header_base + 0x1D],
        ]);
        let checksum = u16::from_le_bytes([
            self.rom[header_base + 0x1E],
            self.rom[header_base + 0x1F],
        ]);

        let enhancement = if map_mode_low == 0x03 {
            EnhancementChip::Sa1
        } else if matches!((rom_type as u16) << 8 | map_byte as u16, 0x4332 | 0x4532) {
            EnhancementChip::Sdd1
        } else if matches!(rom_type, 0x13 | 0x14 | 0x15 | 0x1A) {
            EnhancementChip::SuperFx
        } else if matches!(rom_type, 0xF5 | 0xF9) {
            EnhancementChip::Spc7110
        } else if rom_type == 0xF3 && map_mode_low == 0x00 {
            EnhancementChip::Cx4
        } else if (0x03..=0x05).contains(&rom_type)
            && matches!(map_mode_low, 0x00 | 0x01)
        {
            EnhancementChip::Dsp1
        } else {
            EnhancementChip::None
        };

        self.profile = CartridgeProfile {
            map_mode: self.map_mode,
            map_mode_byte: map_byte,
            rom_type,
            rom_size_code: self.rom[header_base + 0x17],
            sram_size_code: self.rom[header_base + 0x18],
            region: self.rom[header_base + 0x19],
            version: self.rom[header_base + 0x1B],
            checksum,
            complement,
            header_offset: header_base,
            copier_header_size: self.profile.copier_header_size,
            enhancement,
        };

        // ROM type $03-$05 = ROM+Coprocessor 組合
        // 排除 SA-1 (mode $23) 和 SuperFX (type $13+)
        if (rom_type >= 0x03 && rom_type <= 0x05) && (map_mode_low == 0x00 || map_mode_low == 0x01) {
            self.has_dsp1 = true;
        }

        // CX4 偵測: ROM type $F3 + Extended Header ChipType $10
        // 或者單純 ROM type $F3 配合 LoROM 模式
        if rom_type == 0xF3 && map_mode_low == 0x00 {
            self.has_cx4 = true;
            self.has_dsp1 = false; // CX4 和 DSP1 互斥
        }
        // 額外透過 Extended Header ($FFB0 區域) 確認 CX4
        let ext_header_base = header_base.wrapping_sub(0x10);
        if ext_header_base + 0x0F < self.rom.len() {
            let chip_type = self.rom[ext_header_base + 0x0F]; // $FFBF/$7FBF
            if chip_type == 0x10 {
                self.has_cx4 = true;
                self.has_dsp1 = false;
                self.profile.enhancement = EnhancementChip::Cx4;
            }
        }

        // ROM 大小 ($FFD7): 2^N KB
        let rom_size_byte = self.rom[header_base + 0x17];
        if rom_size_byte > 0 && rom_size_byte <= 13 {
            // 不改變 rom_size，保留實際大小
        }

        // SRAM 大小 ($FFD8): 2^N KB (0 = 無)
        let sram_size_byte = self.rom[header_base + 0x18];
        if sram_size_byte > 0 && sram_size_byte <= 8 {
            self.sram_size = 1024 << sram_size_byte;
        } else {
            self.sram_size = 0;
        }
        self.sram = vec![0; self.sram_size.max(0x8000)]; // 最少 32KB
    }

    /// 讀取 ROM 資料（使用 HiROM/LoROM 映射）
    pub fn read_rom(&self, bank: u8, addr: u16) -> u8 {
        let offset = self.map_rom_offset(bank, addr);
        self.read_rom_offset(offset)
    }

    pub(crate) fn debug_rom_offset(&self, bank: u8, addr: u16) -> usize {
        self.map_rom_offset(bank, addr)
    }

    /// Read an SA-1 C/D/E/F linear ROM window selected by its BMAP registers.
    pub fn read_sa1_rom(&self, bank: u8, addr: u16, bmaps: &[u8; 4]) -> u8 {
        let offset = if bank >= 0xC0 {
            let window = ((bank - 0xC0) >> 4) as usize;
            let mapped_megabyte = (bmaps[window.min(3)] & 0x07) as usize;
            (mapped_megabyte << 20) | (((bank & 0x0F) as usize) << 16) | addr as usize
        } else {
            self.map_rom_offset(bank, addr)
        };
        self.read_rom_offset(offset)
    }

    fn read_rom_offset(&self, offset: usize) -> u8 {
        if offset < self.rom.len() {
            self.rom[offset]
        } else {
            if self.rom.is_empty() {
                0
            } else {
                self.rom[Self::mirror_rom_offset(offset, self.rom.len())]
            }
        }
    }

    fn mirror_rom_offset(mut offset: usize, mut rom_size: usize) -> usize {
        let mut base = 0;
        let mut mirror_size = 1usize << (usize::BITS - 1);

        while offset >= rom_size {
            while offset & mirror_size == 0 {
                mirror_size >>= 1;
            }
            offset -= mirror_size;
            if rom_size > mirror_size {
                rom_size -= mirror_size;
                base += mirror_size;
            }
            mirror_size >>= 1;
        }
        base + offset
    }

    /// 計算 ROM 偏移量
    fn map_rom_offset(&self, bank: u8, addr: u16) -> usize {
        match self.map_mode {
            MapMode::HiROM => {
                // HiROM: 直接映射
                // Banks $C0-$FF / $40-$7D: 全 64KB
                // Banks $00-$3F / $80-$BF: $8000-$FFFF
                let mapped_bank = (bank & 0x3F) as usize;
                (mapped_bank << 16) | (addr as usize)
            }
            MapMode::ExHiROM => {
                let mapped_bank = (bank & 0x3F) as usize;
                let half = if bank & 0x80 == 0 { 0x400000 } else { 0 };
                half | (mapped_bank << 16) | addr as usize
            }
            MapMode::SA1 => {
                if bank >= 0xC0 {
                    (((bank & 0x3F) as usize) << 16) | addr as usize
                } else {
                    (((bank & 0x3F) as usize) << 15) | (addr as usize & 0x7FFF)
                }
            }
            MapMode::LoROM => {
                if self.profile.enhancement == EnhancementChip::Sdd1
                    && (0x60..=0x7D).contains(&bank)
                {
                    return (((bank - 0x60) as usize) << 16) | addr as usize;
                }
                if self.profile.enhancement == EnhancementChip::Sdd1 && bank >= 0xC0 {
                    let group = ((bank - 0xC0) >> 4) as usize;
                    let mapped_bank = (self.sdd1_map[group.min(3)] as usize & 0x0F) * 0x10
                        + (bank as usize & 0x0F);
                    return (mapped_bank << 16) | addr as usize;
                }
                // LoROM: 每 bank 只用 $8000-$FFFF
                let mapped_bank = (bank & 0x7F) as usize;
                (mapped_bank << 15) | ((addr & 0x7FFF) as usize)
            }
        }
    }

    /// 讀取 SRAM
    pub fn read_sram(&self, addr: usize) -> u8 {
        if addr < self.sram.len() {
            self.sram[addr]
        } else if !self.sram.is_empty() {
            self.sram[addr % self.sram.len()]
        } else {
            0
        }
    }

    /// 寫入 SRAM
    pub fn write_sram(&mut self, addr: usize, val: u8) {
        if !self.sram.is_empty() {
            let addr = addr % self.sram.len();
            self.sram[addr] = val;
        }
    }

    pub fn write_sdd1_map(&mut self, index: usize, value: u8) {
        if self.profile.enhancement == EnhancementChip::Sdd1 {
            if let Some(slot) = self.sdd1_map.get_mut(index) {
                *slot = value & 0x07;
            }
        }
    }

    pub fn write_sdd1_enable(&mut self, hard: bool, value: u8) {
        if self.profile.enhancement != EnhancementChip::Sdd1 {
            return;
        }
        if hard {
            self.sdd1_hard_enable = value;
        } else {
            self.sdd1_soft_enable = value;
        }
    }

    /// 重置
    pub fn reset(&mut self) {
        // SRAM 保留（電池備份），只重置內部狀態
        self.sdd1_map = [0, 1, 2, 3];
        self.sdd1_hard_enable = 0;
        self.sdd1_soft_enable = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::{Cartridge, EnhancementChip, MapMode};

    fn make_rom(map_mode: u8, rom_type: u8, copier_header: bool) -> Vec<u8> {
        let prefix = if copier_header { 0x200 } else { 0 };
        let mut rom = vec![0; prefix + 0x10000];
        let header = prefix + 0x7FC0;
        let title = b"PROFILE TEST ROM";
        rom[header..header + title.len()].copy_from_slice(title);
        rom[header + 0x15] = map_mode;
        rom[header + 0x16] = rom_type;
        rom[header + 0x17] = 0x0A;
        rom[header + 0x18] = 0x05;
        rom[header + 0x19] = 0x01;
        rom[header + 0x1B] = 0x02;
        rom[header + 0x1C..header + 0x1E].copy_from_slice(&0x1234u16.to_le_bytes());
        rom[header + 0x1E..header + 0x20].copy_from_slice(&0xEDCBu16.to_le_bytes());
        rom
    }

    #[test]
    fn mirrors_non_power_of_two_rom_like_snes_address_decoding() {
        let size = 0x180000;

        assert_eq!(Cartridge::mirror_rom_offset(0x17FFFF, size), 0x17FFFF);
        assert_eq!(Cartridge::mirror_rom_offset(0x180000, size), 0x100000);
        assert_eq!(Cartridge::mirror_rom_offset(0x200000, size), 0x000000);
        assert_eq!(Cartridge::mirror_rom_offset(0x280000, size), 0x080000);
        assert_eq!(Cartridge::mirror_rom_offset(0x300000, size), 0x100000);
    }

    #[test]
    fn maps_exhirom_banks_to_both_rom_halves() {
        let mut cartridge = Cartridge::new();
        cartridge.map_mode = MapMode::ExHiROM;

        assert_eq!(cartridge.map_rom_offset(0x00, 0x8000), 0x408000);
        assert_eq!(cartridge.map_rom_offset(0x40, 0x0000), 0x400000);
        assert_eq!(cartridge.map_rom_offset(0x80, 0x8000), 0x008000);
        assert_eq!(cartridge.map_rom_offset(0xC0, 0x0000), 0x000000);
    }

    #[test]
    fn maps_sa1_linear_and_lorom_windows() {
        let mut cartridge = Cartridge::new();
        cartridge.map_mode = MapMode::SA1;

        assert_eq!(cartridge.map_rom_offset(0x00, 0x8000), 0x000000);
        assert_eq!(cartridge.map_rom_offset(0x3F, 0xFFFF), 0x1FFFFF);
        assert_eq!(cartridge.map_rom_offset(0xC0, 0x0088), 0x000088);
        assert_eq!(cartridge.map_rom_offset(0xFF, 0xFFFF), 0x3FFFFF);
    }

    #[test]
    fn maps_sa1_linear_windows_through_bmaps() {
        let mut cartridge = Cartridge::new();
        cartridge.map_mode = MapMode::SA1;
        cartridge.rom = vec![0; 0x400000];
        cartridge.rom[0x308000] = 0x5A;
        let bmaps = [3, 1, 2, 0];

        assert_eq!(cartridge.read_sa1_rom(0xC0, 0x8000, &bmaps), 0x5A);
        assert_eq!(cartridge.read_rom(0xC0, 0x8000), 0);
    }

    #[test]
    fn maps_sa1_bmap_windows_at_bank_and_megabyte_boundaries() {
        let mut cartridge = Cartridge::new();
        cartridge.map_mode = MapMode::SA1;
        cartridge.rom = vec![0; 0x400000];
        cartridge.rom[0x008000] = 0xC0;
        cartridge.rom[0x00FFFF] = 0xCF;
        cartridge.rom[0x010000] = 0xC1;
        cartridge.rom[0x0F0000] = 0x0F;
        cartridge.rom[0x0FFFFF] = 0xFF;
        cartridge.rom[0x100000] = 0xD0;
        cartridge.rom[0x1F0000] = 0x1F;
        cartridge.rom[0x1FFFFF] = 0xDF;
        cartridge.rom[0x200000] = 0xE0;
        cartridge.rom[0x2F0000] = 0x2F;
        cartridge.rom[0x2FFFFF] = 0xEF;
        cartridge.rom[0x300000] = 0xF0;
        cartridge.rom[0x3F0000] = 0x3F;
        cartridge.rom[0x3FFFFF] = 0xFF;
        let bmaps = [0, 1, 2, 3];

        assert_eq!(cartridge.read_sa1_rom(0xC0, 0x8000, &bmaps), 0xC0);
        assert_eq!(cartridge.read_sa1_rom(0xC0, 0xFFFF, &bmaps), 0xCF);
        assert_eq!(cartridge.read_sa1_rom(0xC1, 0x0000, &bmaps), 0xC1);
        assert_eq!(cartridge.read_sa1_rom(0xCF, 0x0000, &bmaps), 0x0F);
        assert_eq!(cartridge.read_sa1_rom(0xCF, 0xFFFF, &bmaps), 0xFF);
        assert_eq!(cartridge.read_sa1_rom(0xD0, 0x0000, &bmaps), 0xD0);
        assert_eq!(cartridge.read_sa1_rom(0xDF, 0x0000, &bmaps), 0x1F);
        assert_eq!(cartridge.read_sa1_rom(0xDF, 0xFFFF, &bmaps), 0xDF);
        assert_eq!(cartridge.read_sa1_rom(0xE0, 0x0000, &bmaps), 0xE0);
        assert_eq!(cartridge.read_sa1_rom(0xEF, 0xFFFF, &bmaps), 0xEF);
        assert_eq!(cartridge.read_sa1_rom(0xF0, 0x0000, &bmaps), 0xF0);
        assert_eq!(cartridge.read_sa1_rom(0xFF, 0xFFFF, &bmaps), 0xFF);
    }

    #[test]
    fn parses_standard_header_metadata() {
        let mut cartridge = Cartridge::new();

        assert!(cartridge.load(&make_rom(0x20, 0x00, false)));
        assert_eq!(cartridge.profile.map_mode, MapMode::LoROM);
        assert_eq!(cartridge.profile.map_mode_byte, 0x20);
        assert_eq!(cartridge.profile.rom_type, 0x00);
        assert_eq!(cartridge.profile.rom_size_code, 0x0A);
        assert_eq!(cartridge.profile.sram_size_code, 0x05);
        assert_eq!(cartridge.profile.region, 0x01);
        assert_eq!(cartridge.profile.version, 0x02);
        assert_eq!(cartridge.profile.complement, 0x1234);
        assert_eq!(cartridge.profile.checksum, 0xEDCB);
        assert_eq!(cartridge.profile.header_offset, 0x7FC0);
        assert_eq!(cartridge.profile.copier_header_size, 0);
        assert_eq!(cartridge.profile.enhancement, EnhancementChip::None);
    }

    #[test]
    fn identifies_supported_and_known_unsupported_enhancement_chips() {
        let cases = [
            (0x20, 0x03, EnhancementChip::Dsp1),
            (0x20, 0xF3, EnhancementChip::Cx4),
            (0x23, 0x34, EnhancementChip::Sa1),
            (0x32, 0x45, EnhancementChip::Sdd1),
            (0x20, 0x13, EnhancementChip::SuperFx),
            (0x20, 0xF5, EnhancementChip::Spc7110),
        ];

        for (map_mode, rom_type, expected) in cases {
            let mut cartridge = Cartridge::new();
            assert!(cartridge.load(&make_rom(map_mode, rom_type, false)));
            assert_eq!(cartridge.profile.enhancement, expected);
        }
    }

    #[test]
    fn identifies_sdd1_only_by_exact_header_identifier() {
        for (map_mode, rom_type) in [(0x32, 0x43), (0x32, 0x45)] {
            let mut cartridge = Cartridge::new();
            assert!(cartridge.load(&make_rom(map_mode, rom_type, false)));
            assert_eq!(cartridge.profile.enhancement, EnhancementChip::Sdd1);
        }

        for (map_mode, rom_type) in [(0x20, 0x43), (0x20, 0x45), (0x32, 0x00)] {
            let mut cartridge = Cartridge::new();
            assert!(cartridge.load(&make_rom(map_mode, rom_type, false)));
            assert_ne!(cartridge.profile.enhancement, EnhancementChip::Sdd1);
        }
    }

    #[test]
    fn records_copier_header_and_clears_previous_chip_state_on_reload() {
        let mut cartridge = Cartridge::new();

        assert!(cartridge.load(&make_rom(0x23, 0x34, true)));
        assert_eq!(cartridge.profile.copier_header_size, 0x200);
        assert_eq!(cartridge.profile.header_offset, 0x7FC0);
        assert!(cartridge.profile.enhancement == EnhancementChip::Sa1);

        assert!(cartridge.load(&make_rom(0x20, 0x00, false)));
        assert_eq!(cartridge.profile.copier_header_size, 0);
        assert_eq!(cartridge.profile.enhancement, EnhancementChip::None);
        assert!(!cartridge.has_dsp1);
        assert!(!cartridge.has_cx4);
    }

    #[test]
    fn maps_sdd1_windows_through_selectable_megabyte_banks() {
        let mut cartridge = Cartridge::new();
        assert!(cartridge.load(&make_rom(0x32, 0x45, false)));

        cartridge.write_sdd1_map(0, 5);
        cartridge.write_sdd1_map(1, 6);
        assert_eq!(cartridge.map_rom_offset(0xC0, 0x8000), 0x508000);
        assert_eq!(cartridge.map_rom_offset(0xCF, 0x8000), 0x5F8000);
        assert_eq!(cartridge.map_rom_offset(0xD2, 0x8000), 0x628000);
        assert_eq!(cartridge.sdd1_map, [5, 6, 2, 3]);

        cartridge.write_sdd1_map(1, 0x81);
        cartridge.write_sdd1_map(3, 0x82);
        assert_eq!(cartridge.sdd1_map, [5, 1, 2, 2]);
        assert_eq!(cartridge.map_rom_offset(0x01, 0x8000), 0x008000);
        assert_eq!(cartridge.map_rom_offset(0x21, 0x8000), 0x108000);
        assert_eq!(cartridge.map_rom_offset(0x81, 0x8000), 0x008000);
        assert_eq!(cartridge.map_rom_offset(0xA1, 0x8000), 0x108000);
        assert_eq!(cartridge.map_rom_offset(0x21, 0x7FFF), 0x10FFFF);
    }

    #[test]
    fn maps_sdd1_full_and_dynamic_windows_at_exact_boundaries() {
        let mut cartridge = Cartridge::new();
        cartridge.map_mode = MapMode::LoROM;
        cartridge.profile.enhancement = EnhancementChip::Sdd1;
        cartridge.rom = vec![0; 0x400000];
        cartridge.sdd1_map = [3, 2, 1, 0];

        assert_eq!(cartridge.map_rom_offset(0x60, 0x0000), 0x000000);
        assert_eq!(cartridge.map_rom_offset(0x60, 0xFFFF), 0x00FFFF);
        assert_eq!(cartridge.map_rom_offset(0x61, 0x0000), 0x010000);
        assert_eq!(cartridge.map_rom_offset(0x7D, 0xFFFF), 0x1DFFFF);

        assert_eq!(cartridge.map_rom_offset(0xC0, 0xFFFF), 0x30FFFF);
        assert_eq!(cartridge.map_rom_offset(0xCF, 0xFFFF), 0x3FFFFF);
        assert_eq!(cartridge.map_rom_offset(0xD0, 0x0000), 0x200000);
        assert_eq!(cartridge.map_rom_offset(0xDF, 0xFFFF), 0x2FFFFF);
        assert_eq!(cartridge.map_rom_offset(0xE0, 0x0000), 0x100000);
        assert_eq!(cartridge.map_rom_offset(0xF0, 0x0000), 0x000000);
    }

    #[test]
    fn sdd1_enable_registers_reset_and_write() {
        let mut cartridge = Cartridge::new();
        assert!(cartridge.load(&make_rom(0x32, 0x45, false)));
        cartridge.write_sdd1_enable(true, 0xA5);
        cartridge.write_sdd1_enable(false, 0x5A);
        assert_eq!(cartridge.sdd1_hard_enable, 0xA5);
        assert_eq!(cartridge.sdd1_soft_enable, 0x5A);
        cartridge.reset();
        assert_eq!(cartridge.sdd1_hard_enable, 0);
        assert_eq!(cartridge.sdd1_soft_enable, 0);
    }
}
