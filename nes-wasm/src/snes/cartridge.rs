// ============================================================
// SNES 卡帶解析器 - SMC/SFC 格式
// ============================================================
// 支援 HiROM ($21) 與 LoROM ($20) 映射
// 自動偵測 SMC 512-byte 標頭
// 解析 $FFB0-$FFDF 區域的遊戲資訊
// ============================================================

/// ROM 映射模式
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MapMode {
    LoROM,   // Mode $20
    HiROM,   // Mode $21
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

        // 嘗試偵測映射模式
        self.detect_map_mode();

        // 解析標頭
        self.parse_header();

        self.loaded = true;
        true
    }

    /// 偵測 ROM 映射模式
    fn detect_map_mode(&mut self) {
        // 嘗試 HiROM 標頭位置 ($FFD5)
        let hirom_score = self.score_header(0xFFD5);
        // 嘗試 LoROM 標頭位置 ($7FD5)
        let lorom_score = self.score_header(0x7FD5);

        if hirom_score > lorom_score {
            self.map_mode = MapMode::HiROM;
        } else {
            self.map_mode = MapMode::LoROM;
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
            let title_base = if map_mode_addr > 0x8000 { 0xFFC0 } else { 0x7FC0 };
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
            MapMode::LoROM => 0x7FC0,
        };

        if header_base + 0x20 > self.rom.len() {
            return;
        }

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
        if offset < self.rom.len() {
            self.rom[offset]
        } else {
            // ROM 鏡像（wrap around）
            if self.rom.is_empty() {
                0
            } else {
                self.rom[offset % self.rom.len()]
            }
        }
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
            MapMode::LoROM => {
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

    /// 重置
    pub fn reset(&mut self) {
        // SRAM 保留（電池備份），只重置內部狀態
    }
}
