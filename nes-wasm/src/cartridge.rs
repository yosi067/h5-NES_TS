// ============================================================
// NES 卡帶模擬 - iNES 格式解析與記憶體管理
// ============================================================
// 負責解析 iNES 和 NES 2.0 格式的 ROM 檔案，
// 並管理 PRG ROM、CHR ROM/RAM 的存取。
//
// iNES 格式：
// - 16 位元組標頭
// - 可選的 512 位元組訓練器（Trainer）
// - PRG ROM 資料（16KB 為單位）
// - CHR ROM 資料（8KB 為單位，可能為 0）
//
// 參考：https://www.nesdev.org/wiki/INES
// ============================================================

use crate::ppu::MirrorMode;
use crate::mappers::*;

/// iNES 標頭結構
pub struct CartridgeHeader {
    /// PRG ROM 大小（16KB 為單位）
    pub prg_rom_banks: u8,
    /// CHR ROM 大小（8KB 為單位，0 表示使用 CHR RAM）
    pub chr_rom_banks: u8,
    /// Mapper 編號
    pub mapper_id: u8,
    /// 鏡像模式
    pub mirror_mode: MirrorMode,
    /// 是否有電池供電的 SRAM
    pub has_battery: bool,
    /// 是否有訓練器資料
    pub has_trainer: bool,
}

/// NES 卡帶
pub struct Cartridge {
    /// 卡帶標頭資訊
    pub header: CartridgeHeader,
    /// PRG ROM 資料
    pub prg_rom: Vec<u8>,
    /// CHR ROM/RAM 資料
    pub chr_data: Vec<u8>,
    /// PRG RAM（8KB，可能有電池供電）
    pub prg_ram: Vec<u8>,
    /// 是否使用 CHR RAM
    pub chr_ram: bool,
    /// Mapper 實例
    pub mapper: Box<dyn MapperTrait>,
    /// 是否已載入 ROM
    pub loaded: bool,
}

impl Cartridge {
    /// 建立空的卡帶
    pub fn new() -> Self {
        Cartridge {
            header: CartridgeHeader {
                prg_rom_banks: 0,
                chr_rom_banks: 0,
                mapper_id: 0,
                mirror_mode: MirrorMode::Horizontal,
                has_battery: false,
                has_trainer: false,
            },
            prg_rom: Vec::new(),
            chr_data: Vec::new(),
            prg_ram: vec![0; 8192], // 8KB PRG RAM
            chr_ram: false,
            mapper: Box::new(Mapper0::new(1, 1)),
            loaded: false,
        }
    }

    /// 載入 ROM 資料
    pub fn load_rom(&mut self, data: &[u8]) -> bool {
        // 檢查 iNES 標頭魔數 "NES\x1A"
        if data.len() < 16 || data[0] != 0x4E || data[1] != 0x45 ||
           data[2] != 0x53 || data[3] != 0x1A {
            return false;
        }

        // 解析標頭
        let prg_banks = data[4];
        let chr_banks = data[5];
        let flags6 = data[6];
        let flags7 = data[7];

        // Mapper 編號（低 4 位元在 flags6，高 4 位元在 flags7）
        let mapper_id = (flags7 & 0xF0) | (flags6 >> 4);

        // 鏡像模式
        let mirror_mode = if flags6 & 0x08 != 0 {
            MirrorMode::FourScreen
        } else if flags6 & 0x01 != 0 {
            MirrorMode::Vertical
        } else {
            MirrorMode::Horizontal
        };

        let has_battery = flags6 & 0x02 != 0;
        let has_trainer = flags6 & 0x04 != 0;

        self.header = CartridgeHeader {
            prg_rom_banks: prg_banks,
            chr_rom_banks: chr_banks,
            mapper_id,
            mirror_mode,
            has_battery,
            has_trainer,
        };

        // 計算資料偏移
        let mut offset = 16;
        if has_trainer {
            offset += 512; // 跳過訓練器
        }

        // 讀取 PRG ROM
        let prg_size = prg_banks as usize * 16384; // 16KB per bank
        if offset + prg_size > data.len() {
            return false;
        }
        self.prg_rom = data[offset..offset + prg_size].to_vec();
        offset += prg_size;

        // 讀取 CHR ROM/RAM
        if chr_banks > 0 {
            let chr_size = chr_banks as usize * 8192; // 8KB per bank
            if offset + chr_size > data.len() {
                // 某些 ROM 的 CHR 資料可能不完整，用 0 填充
                self.chr_data = vec![0; chr_size];
                let available = data.len().saturating_sub(offset);
                if available > 0 {
                    self.chr_data[..available].copy_from_slice(&data[offset..offset + available]);
                }
            } else {
                self.chr_data = data[offset..offset + chr_size].to_vec();
            }
            self.chr_ram = false;
        } else {
            // 使用 CHR RAM（8KB）
            self.chr_data = vec![0; 8192];
            self.chr_ram = true;
        }

        // 重置 PRG RAM
        self.prg_ram = vec![0; 8192];

        // 建立 Mapper
        self.mapper = create_mapper(mapper_id, prg_banks, chr_banks);

        // Mapper 253 (Waixing VRC4) 需要額外的 CHR RAM 空間
        // 在 CHR ROM 末尾追加 8KB CHR RAM，用於動態 CHR bank 替換
        if mapper_id == 253 && !self.chr_ram {
            let chr_rom_size = self.chr_data.len();
            self.chr_data.resize(chr_rom_size + 8192, 0);
        }

        self.loaded = true;

        true
    }

    /// 重置卡帶
    pub fn reset(&mut self) {
        self.mapper.reset();
    }

    /// CPU 讀取
    pub fn cpu_read(&self, addr: u16) -> u8 {
        // PRG RAM ($6000-$7FFF) — 直接存取，不依賴 Mapper
        if addr >= 0x6000 && addr < 0x8000 {
            let index = (addr - 0x6000) as usize;
            return self.prg_ram.get(index).copied().unwrap_or(0);
        }

        if let Some(mapped) = self.mapper.cpu_read(addr) {
            if addr >= 0x8000 {
                // PRG ROM
                let index = mapped as usize % self.prg_rom.len().max(1);
                self.prg_rom.get(index).copied().unwrap_or(0)
            } else {
                0
            }
        } else {
            0
        }
    }

    /// CPU 寫入
    pub fn cpu_write(&mut self, addr: u16, data: u8) {
        if addr >= 0x6000 && addr < 0x8000 {
            // PRG RAM 寫入
            let index = (addr - 0x6000) as usize;
            if index < self.prg_ram.len() {
                self.prg_ram[index] = data;
            }
        }

        // 通知 Mapper（可能觸發 bank 切換等）
        if let Some(result) = self.mapper.cpu_write(addr, data) {
            if let Some(mode) = result.mirror_mode {
                self.header.mirror_mode = mode;
            }
        }
    }

    /// PPU 讀取（CHR ROM/RAM）
    pub fn ppu_read(&self, addr: u16) -> u8 {
        if let Some(mapped) = self.mapper.ppu_read(addr) {
            let index = mapped as usize % self.chr_data.len().max(1);
            self.chr_data.get(index).copied().unwrap_or(0)
        } else {
            0
        }
    }

    /// PPU 寫入（只有 CHR RAM 可寫）
    pub fn ppu_write(&mut self, addr: u16, data: u8) {
        if self.chr_ram {
            if let Some(mapped) = self.mapper.ppu_write(addr) {
                let index = mapped as usize;
                if index < self.chr_data.len() {
                    self.chr_data[index] = data;
                }
            }
        }
    }

    /// 通知 Mapper 掃描線計數（用於 MMC3 等）
    pub fn scanline(&mut self) {
        self.mapper.scanline();
    }

    /// 通知 Mapper CPU 週期計數
    pub fn cpu_clock(&mut self) {
        self.mapper.cpu_clock();
    }

    /// 檢查 Mapper IRQ
    pub fn check_irq(&mut self) -> bool {
        self.mapper.check_irq()
    }

    /// 取得目前的鏡像模式
    pub fn mirror_mode(&self) -> MirrorMode {
        self.header.mirror_mode
    }
}
