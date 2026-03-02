// ============================================================
// Game Gear / SMS 卡帶 — ROM 載入與 Sega Mapper
// ============================================================
// Sega Mapper: $FFFC (RAM control), $FFFD (Page 0), $FFFE (Page 1), $FFFF (Page 2)
// Codemasters Mapper: $0000 (Page 0), $4000 (Page 1), $8000 (Page 2)
// ============================================================

/// Mapper 類型
#[derive(Clone, Copy, PartialEq)]
pub enum MapperType {
    Sega,        // 標準 Sega mapper
    Codemasters, // Codemasters mapper
    None,        // ≤48KB 無需 mapper
}

pub struct Cartridge {
    pub rom: Vec<u8>,
    pub ram: Vec<u8>,     // 卡帶 RAM (最多 32KB)

    pub mapper: MapperType,
    pub is_game_gear: bool,

    // Sega Mapper 狀態
    pub page: [u8; 3],      // 3 個頁面暫存器 (每頁 16KB)
    pub ram_control: u8,     // $FFFC: RAM 控制
    ram_bank: u8,

    // ROM 資訊
    pub rom_pages: u16,      // 總 ROM 頁數 (每頁 16KB)
    pub title: String,
}

impl Cartridge {
    pub fn new() -> Self {
        Cartridge {
            rom: Vec::new(),
            ram: vec![0; 0x8000], // 32KB
            mapper: MapperType::None,
            is_game_gear: false,
            page: [0, 1, 2],
            ram_control: 0,
            ram_bank: 0,
            rom_pages: 0,
            title: String::new(),
        }
    }

    /// 載入 ROM
    pub fn load(&mut self, data: &[u8], is_gg: bool) -> bool {
        if data.is_empty() { return false; }

        // 檢測並移除 512-byte header (某些 ROM dump 有)
        let rom_data = if data.len() % 0x4000 == 512 && data.len() > 512 {
            &data[512..]
        } else {
            data
        };

        self.rom = rom_data.to_vec();
        self.is_game_gear = is_gg;

        // 計算 ROM 頁數
        self.rom_pages = ((self.rom.len() + 0x3FFF) / 0x4000) as u16;

        // 偵測 Mapper 類型
        self.mapper = self.detect_mapper();

        // 初始化頁面
        self.page = [0, 1, 2.min(self.rom_pages.saturating_sub(1) as u8)];
        self.ram_control = 0;
        self.ram_bank = 0;

        // 嘗試提取標題 (GG 標頭在 $7FF0)
        self.title = self.extract_title();

        true
    }

    fn detect_mapper(&self) -> MapperType {
        // Codemasters 偵測
        if self.is_codemasters() {
            return MapperType::Codemasters;
        }

        // 一律使用 Sega mapper 以確保相容性
        // (小 ROM 的 page[0,1,2] = [0,1,2] 等效於直接映射，
        //  且支援卡帶 RAM 存取)
        MapperType::Sega
    }

    fn is_codemasters(&self) -> bool {
        // 保守檢測：僅在確認有 Codemasters 特徵碼時才啟用
        // 避免誤判導致一般 Sega mapper 遊戲無法啟動
        if self.rom.len() < 0x10000 { return false; }

        // Codemasters 遊戲的特徵:
        // 1. 沒有 "TMR SEGA" 標頭
        // 2. $0000 處通常有跳轉 (不是 DI/$F3)
        // 3. 在 bank 暫存器位址 ($0000, $4000, $8000) 進行寫入
        // 目前保守停用，避免誤判影響正常遊戲
        false
    }

    fn extract_title(&self) -> String {
        // GG/SMS ROM 沒有標準標題欄位，使用檔案名或空
        String::new()
    }

    // ===== 記憶體讀取 =====

    /// 讀取記憶體 ($0000-$BFFF)
    pub fn read(&self, addr: u16) -> u8 {
        match self.mapper {
            MapperType::None => self.read_direct(addr),
            MapperType::Sega => self.read_sega(addr),
            MapperType::Codemasters => self.read_codemasters(addr),
        }
    }

    fn read_direct(&self, addr: u16) -> u8 {
        let idx = addr as usize;
        if idx < self.rom.len() { self.rom[idx] } else { 0xFF }
    }

    fn read_sega(&self, addr: u16) -> u8 {
        match addr {
            0x0000..=0x03FF => {
                // 前 1KB 固定（但 page[0] = 0 時等效）
                let idx = addr as usize;
                if idx < self.rom.len() { self.rom[idx] } else { 0xFF }
            }
            0x0400..=0x3FFF => {
                // Page 0
                let bank = self.page[0] as usize % self.rom_pages.max(1) as usize;
                let idx = bank * 0x4000 + addr as usize;
                if idx < self.rom.len() { self.rom[idx] } else { 0xFF }
            }
            0x4000..=0x7FFF => {
                // Page 1
                let bank = self.page[1] as usize % self.rom_pages.max(1) as usize;
                let idx = bank * 0x4000 + (addr as usize - 0x4000);
                if idx < self.rom.len() { self.rom[idx] } else { 0xFF }
            }
            0x8000..=0xBFFF => {
                // Page 2 (或 RAM)
                if self.ram_control & 0x08 != 0 {
                    // 卡帶 RAM 映射
                    let bank = (self.ram_control >> 2) & 1;
                    let idx = bank as usize * 0x4000 + (addr as usize - 0x8000);
                    if idx < self.ram.len() { self.ram[idx] } else { 0xFF }
                } else {
                    let bank = self.page[2] as usize % self.rom_pages.max(1) as usize;
                    let idx = bank * 0x4000 + (addr as usize - 0x8000);
                    if idx < self.rom.len() { self.rom[idx] } else { 0xFF }
                }
            }
            _ => 0xFF,
        }
    }

    fn read_codemasters(&self, addr: u16) -> u8 {
        let bank = match addr {
            0x0000..=0x3FFF => self.page[0] as usize,
            0x4000..=0x7FFF => self.page[1] as usize,
            0x8000..=0xBFFF => self.page[2] as usize,
            _ => return 0xFF,
        };
        let bank = bank % self.rom_pages.max(1) as usize;
        let offset = (addr & 0x3FFF) as usize;
        let idx = bank * 0x4000 + offset;
        if idx < self.rom.len() { self.rom[idx] } else { 0xFF }
    }

    // ===== 記憶體寫入 =====

    /// 寫入 — 處理 mapper 暫存器
    pub fn write(&mut self, addr: u16, val: u8) {
        match self.mapper {
            MapperType::None => {}
            MapperType::Sega => self.write_sega(addr, val),
            MapperType::Codemasters => self.write_codemasters(addr, val),
        }
    }

    fn write_sega(&mut self, addr: u16, val: u8) {
        match addr {
            0x8000..=0xBFFF => {
                // 卡帶 RAM 寫入
                if self.ram_control & 0x08 != 0 {
                    let bank = (self.ram_control >> 2) & 1;
                    let idx = bank as usize * 0x4000 + (addr as usize - 0x8000);
                    if idx < self.ram.len() { self.ram[idx] = val; }
                }
            }
            _ => {}
        }
    }

    fn write_codemasters(&mut self, addr: u16, val: u8) {
        // Codemasters bank 寫入在 $0000, $4000, $8000
        match addr {
            0x0000 => self.page[0] = val,
            0x4000 => self.page[1] = val,
            0x8000 => self.page[2] = val,
            _ => {}
        }
    }

    /// Sega Mapper 暫存器寫入 ($FFFC-$FFFF)
    pub fn write_mapper_reg(&mut self, addr: u16, val: u8) {
        if self.mapper != MapperType::Sega { return; }
        match addr {
            0xFFFC => self.ram_control = val,
            0xFFFD => self.page[0] = val % self.rom_pages.max(1) as u8,
            0xFFFE => self.page[1] = val % self.rom_pages.max(1) as u8,
            0xFFFF => self.page[2] = val % self.rom_pages.max(1) as u8,
            _ => {}
        }
    }
}
