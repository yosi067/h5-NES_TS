#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RomByteOrder {
    BigEndian,
    ByteSwapped,
    LittleEndian,
}

#[derive(Clone, Debug)]
pub struct N64Header {
    pub pi_bsd_dom1_latency: u8,
    pub pi_bsd_dom1_pulse_width: u8,
    pub pi_bsd_dom1_page_size: u8,
    pub pi_bsd_dom1_release: u8,
    pub clock_rate: u32,
    pub boot_address: u32,
    pub release_address: u32,
    pub crc1: u32,
    pub crc2: u32,
    pub title: String,
    pub manufacturer: u8,
    pub cartridge_id: u16,
    pub country_code: u8,
    pub version: u8,
}

#[derive(Clone, Debug)]
pub struct Cartridge {
    pub rom: Vec<u8>,
    pub byte_order: RomByteOrder,
    pub header: N64Header,
    pub boot_code_checksum: u32,
}

impl Cartridge {
    /// 載入 N64 卡帶資料。
    ///
    /// N64 ROM 常見有三種 byte order：`.z64` big-endian、`.v64` 16-bit byte-swapped、
    /// `.n64` little-endian。這裡先偵測格式並正規化成 big-endian，後面的 CPU/匯流排
    /// 才能用固定的位元組順序讀取指令與資料。
    pub fn load(data: &[u8]) -> Option<Self> {
        if data.len() < 0x1000 {
            return None;
        }

        let byte_order = detect_byte_order(data)?;
        let rom = normalize_to_big_endian(data, byte_order);
        if rom.get(0..4) != Some(&[0x80, 0x37, 0x12, 0x40]) {
            return None;
        }

        let header = parse_header(&rom)?;
        let boot_code_checksum = checksum32(&rom[0x40..0x1000.min(rom.len())]);

        Some(Self {
            rom,
            byte_order,
            header,
            boot_code_checksum,
        })
    }

    /// 依 N64 physical address 讀取一個 byte。
    ///
    /// 目前只實作 cartridge ROM 視窗 `0x1000_0000..=0x1FBF_FFFF`；
    /// 之後接 PI bus / PIF boot / save chip 時會從這裡擴充。
    pub fn read_u8(&self, physical_addr: u32) -> u8 {
        match physical_addr {
            0x1000_0000..=0x1FBF_FFFF => {
                let offset = (physical_addr - 0x1000_0000) as usize;
                self.rom.get(offset).copied().unwrap_or(0xFF)
            }
            _ => 0xFF,
        }
    }

    /// 依 N64 big-endian bus 規則讀取 32-bit word。
    ///
    /// VR4300 指令是 32-bit big-endian，所以 interpreter 取指時會走這類 helper。
    pub fn read_u32(&self, physical_addr: u32) -> u32 {
        let b0 = self.read_u8(physical_addr) as u32;
        let b1 = self.read_u8(physical_addr.wrapping_add(1)) as u32;
        let b2 = self.read_u8(physical_addr.wrapping_add(2)) as u32;
        let b3 = self.read_u8(physical_addr.wrapping_add(3)) as u32;
        (b0 << 24) | (b1 << 16) | (b2 << 8) | b3
    }
}

fn detect_byte_order(data: &[u8]) -> Option<RomByteOrder> {
    match data.get(0..4)? {
        [0x80, 0x37, 0x12, 0x40] => Some(RomByteOrder::BigEndian),
        [0x37, 0x80, 0x40, 0x12] => Some(RomByteOrder::ByteSwapped),
        [0x40, 0x12, 0x37, 0x80] => Some(RomByteOrder::LittleEndian),
        _ => None,
    }
}

/// 將不同 dump 格式的 ROM 統一轉成 N64 原生 big-endian 排列。
/// 這是模擬器 loader 的第一道防線，可避免後面每次讀 ROM 都要判斷格式。
fn normalize_to_big_endian(data: &[u8], byte_order: RomByteOrder) -> Vec<u8> {
    let mut rom = data.to_vec();
    match byte_order {
        RomByteOrder::BigEndian => {}
        RomByteOrder::ByteSwapped => {
            for chunk in rom.chunks_exact_mut(2) {
                chunk.swap(0, 1);
            }
        }
        RomByteOrder::LittleEndian => {
            for chunk in rom.chunks_exact_mut(4) {
                chunk.swap(0, 3);
                chunk.swap(1, 2);
            }
        }
    }
    rom
}

/// 解析 N64 ROM 前 0x40 bytes 的標頭。
/// 這些欄位包含 PI timing、entry point、CRC、遊戲標題、區域與版本。
fn parse_header(rom: &[u8]) -> Option<N64Header> {
    let title_bytes = rom.get(0x20..0x34)?;
    let title = title_bytes
        .iter()
        .map(|&b| if b.is_ascii_graphic() || b == b' ' { b as char } else { ' ' })
        .collect::<String>()
        .trim_end()
        .to_string();

    Some(N64Header {
        pi_bsd_dom1_latency: rom[0x00],
        pi_bsd_dom1_pulse_width: rom[0x01],
        pi_bsd_dom1_page_size: rom[0x02],
        pi_bsd_dom1_release: rom[0x03],
        clock_rate: read_be32(rom, 0x04),
        boot_address: read_be32(rom, 0x08),
        release_address: read_be32(rom, 0x0C),
        crc1: read_be32(rom, 0x10),
        crc2: read_be32(rom, 0x14),
        title,
        manufacturer: rom[0x38],
        cartridge_id: read_be16(rom, 0x3B),
        country_code: rom[0x3E],
        version: rom[0x3F],
    })
}

/// 讀取 big-endian 16-bit 值。
fn read_be16(data: &[u8], offset: usize) -> u16 {
    ((data[offset] as u16) << 8) | data[offset + 1] as u16
}

/// 讀取 big-endian 32-bit 值。
fn read_be32(data: &[u8], offset: usize) -> u32 {
    ((data[offset] as u32) << 24)
        | ((data[offset + 1] as u32) << 16)
        | ((data[offset + 2] as u32) << 8)
        | data[offset + 3] as u32
}

/// 計算 boot code 的簡易 checksum，方便 debug_state 顯示並確認 ROM 沒讀錯。
/// 這不是官方 CIC CRC，只是目前 scaffold 的診斷資訊。
fn checksum32(data: &[u8]) -> u32 {
    data.chunks(4).fold(0u32, |acc, chunk| {
        let mut word = 0u32;
        for &byte in chunk {
            word = (word << 8) | byte as u32;
        }
        acc.wrapping_add(word)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn rom_path(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("roms").join(name)
    }

    #[test]
    fn normalizes_supported_byte_orders() {
        let z64 = [0x80, 0x37, 0x12, 0x40, 0, 0, 0, 0];
        let v64 = [0x37, 0x80, 0x40, 0x12, 0, 0, 0, 0];
        let n64 = [0x40, 0x12, 0x37, 0x80, 0, 0, 0, 0];

        assert_eq!(detect_byte_order(&z64), Some(RomByteOrder::BigEndian));
        assert_eq!(detect_byte_order(&v64), Some(RomByteOrder::ByteSwapped));
        assert_eq!(detect_byte_order(&n64), Some(RomByteOrder::LittleEndian));
        assert_eq!(&normalize_to_big_endian(&v64, RomByteOrder::ByteSwapped)[0..4], &z64[0..4]);
        assert_eq!(&normalize_to_big_endian(&n64, RomByteOrder::LittleEndian)[0..4], &z64[0..4]);
    }

    #[test]
    fn loads_target_n64_rom_headers() {
        let targets = [
            "Legend of Zelda, The - Ocarina of Time.z64",
            "Mario Kart 64 (USA).z64",
            "Super Mario 64 (USA).z64",
        ];

        for target in targets {
            let data = fs::read(rom_path(target)).unwrap_or_else(|err| panic!("failed to read {target}: {err}"));
            let cart = Cartridge::load(&data).unwrap_or_else(|| panic!("failed to parse {target}"));
            assert_eq!(cart.byte_order, RomByteOrder::BigEndian);
            assert!(!cart.header.title.is_empty(), "missing title for {target}");
            assert!(cart.header.boot_address >= 0x8000_0000, "unexpected boot address for {target}");
        }
    }
}