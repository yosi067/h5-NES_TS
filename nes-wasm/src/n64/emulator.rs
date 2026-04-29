use super::cartridge::Cartridge;
use super::cpu::Vr4300;

const SCREEN_WIDTH: usize = 320;
const SCREEN_HEIGHT: usize = 240;
const FRAME_STUB_STEPS: usize = 2048;

pub struct N64Emulator {
    pub cpu: Vr4300,
    pub cart: Option<Cartridge>,
    pub rdram: Vec<u8>,
    frame_buffer: Vec<u8>,
    frame_count: u64,
    audio_buffer: Vec<f32>,
}

impl N64Emulator {
    /// 建立 N64 emulator scaffold。
    ///
    /// 目前配置 4MB RDRAM、320x240 RGBA framebuffer 與 VR4300 狀態；
    /// 真正可玩路線已在前端先接 Mupen64Plus-web，這個 Rust core 保留作為後續自研實作。
    pub fn new() -> Self {
        Self {
            cpu: Vr4300::new(),
            cart: None,
            rdram: vec![0; 4 * 1024 * 1024],
            frame_buffer: vec![0; SCREEN_WIDTH * SCREEN_HEIGHT * 4],
            frame_count: 0,
            audio_buffer: Vec::new(),
        }
    }

    /// 載入 N64 ROM 並初始化核心狀態。
    /// 成功後會先畫一張 diagnostic frame，讓 UI/測試能確認 ROM header、CRC 與 framebuffer 都可用。
    pub fn load_rom(&mut self, data: &[u8]) -> bool {
        if let Some(cart) = Cartridge::load(data) {
            self.cart = Some(cart);
            self.reset();
            self.render_boot_diagnostic_frame();
            true
        } else {
            false
        }
    }

    /// 重設 CPU、RDRAM、音訊與 frame counter。
    /// 注意：這裡還不是完整硬體 reset，後續需要加入 PIF、RCP、PI/SI/VI/AI 等子系統。
    pub fn reset(&mut self) {
        self.cpu.reset_to_boot_code();
        self.rdram.fill(0);
        self.frame_count = 0;
        self.audio_buffer.clear();
    }

    /// 執行一幀 scaffold。
    /// 目前只推進 stub CPU steps 並重畫診斷畫面；真正可玩 backend 由前端 Mupen64Plus-web 負責。
    pub fn frame(&mut self) {
        for _ in 0..FRAME_STUB_STEPS {
            self.cpu.step_stub();
        }
        self.frame_count = self.frame_count.wrapping_add(1);
        self.render_boot_diagnostic_frame();
    }

    /// 設定控制器按鍵。
    /// Rust N64 core 尚未實作 SI/PIF controller pak，因此目前是 no-op。
    pub fn set_button(&mut self, _controller: u8, _button: u8, _pressed: bool) {}

    /// 設定音訊取樣率。
    /// Rust N64 core 尚未實作 AI/audio plugin，因此目前是 no-op。
    pub fn set_audio_sample_rate(&mut self, _rate: f64) {}

    /// 回傳 framebuffer 在 WASM 記憶體中的指標，供 TypeScript canvas renderer 使用。
    pub fn get_frame_buffer_ptr(&self) -> *const u8 {
        self.frame_buffer.as_ptr()
    }

    /// 回傳 framebuffer byte 長度，格式固定為 RGBA8888。
    pub fn get_frame_buffer_len(&self) -> usize {
        self.frame_buffer.len()
    }

    /// 回傳音訊 buffer 指標；目前 Rust N64 scaffold 尚未產生音訊。
    pub fn get_audio_buffer_ptr(&self) -> *const f32 {
        self.audio_buffer.as_ptr()
    }

    /// 回傳音訊樣本數；目前通常為 0。
    pub fn get_audio_buffer_len(&self) -> usize {
        self.audio_buffer.len()
    }

    /// 清空已被前端取走的音訊樣本。
    pub fn consume_audio_samples(&mut self) -> usize {
        let len = self.audio_buffer.len();
        self.audio_buffer.clear();
        len
    }

    /// 匯出即時狀態存檔。
    /// N64 狀態包含大量 RCP/CPU/RDRAM/插件資料，目前 Rust scaffold 尚未支援。
    pub fn export_save_state(&self) -> String {
        String::new()
    }

    /// 匯入即時狀態存檔；目前尚未支援。
    pub fn import_save_state(&mut self, _json: &str) -> bool {
        false
    }

    /// 輸出目前 N64 scaffold 的診斷資訊。
    /// 用於確認 ROM 標頭、CRC、CPU PC 與 frame counter 是否如預期更新。
    pub fn debug_state(&self) -> String {
        if let Some(cart) = &self.cart {
            format!(
                "N64\nTitle: {}\nROM size: {} bytes\nBoot PC: ${:08X}\nCPU PC: ${:016X}\nCRC: {:08X} {:08X}\nCountry: ${:02X}\nVersion: {}\nIPL checksum: {:08X}\nFrames: {}",
                cart.header.title,
                cart.rom.len(),
                cart.header.boot_address,
                self.cpu.pc,
                cart.header.crc1,
                cart.header.crc2,
                cart.header.country_code,
                cart.header.version,
                cart.boot_code_checksum,
                self.frame_count,
            )
        } else {
            "N64: no ROM loaded".to_string()
        }
    }

    /// 繪製 boot diagnostic framebuffer。
    /// 這不是遊戲畫面，而是用 ROM CRC/title/entry point 產生的可視化圖樣，
    /// 方便在完整 RDP/VI 還沒完成前驗證 frontend pipeline。
    fn render_boot_diagnostic_frame(&mut self) {
        let (crc1, crc2, boot_address, title_hash) = if let Some(cart) = &self.cart {
            (
                cart.header.crc1,
                cart.header.crc2,
                cart.header.boot_address,
                cart.header.title.bytes().fold(0u32, |acc, b| acc.wrapping_mul(33).wrapping_add(b as u32)),
            )
        } else {
            (0, 0, 0, 0)
        };

        for y in 0..SCREEN_HEIGHT {
            for x in 0..SCREEN_WIDTH {
                let idx = (y * SCREEN_WIDTH + x) * 4;
                let checker = (((x / 16) ^ (y / 16)) & 1) as u8;
                let base = if checker == 0 { 18 } else { 28 };
                self.frame_buffer[idx] = base + ((crc1 >> ((x / 40) % 24)) as u8 & 0x1F);
                self.frame_buffer[idx + 1] = base + ((crc2 >> ((y / 30) % 24)) as u8 & 0x1F);
                self.frame_buffer[idx + 2] = base + ((title_hash >> (((x + y) / 48) % 24)) as u8 & 0x2F);
                self.frame_buffer[idx + 3] = 0xFF;
            }
        }

        self.draw_bar(24, 28, (boot_address >> 24) as u8, 0xE8, 0xD6, 0x55);
        self.draw_bar(24, 48, (boot_address >> 16) as u8, 0x52, 0xB6, 0xE8);
        self.draw_bar(24, 68, (crc1 >> 24) as u8, 0xE8, 0x74, 0x61);
        self.draw_bar(24, 88, (crc2 >> 24) as u8, 0x73, 0xD6, 0x7A);
    }

    /// 在診斷畫面畫一條彩色數值 bar。
    fn draw_bar(&mut self, x: usize, y: usize, value: u8, r: u8, g: u8, b: u8) {
        let width = 48 + value as usize;
        for yy in y..(y + 10).min(SCREEN_HEIGHT) {
            for xx in x..(x + width).min(SCREEN_WIDTH - 24) {
                let idx = (yy * SCREEN_WIDTH + xx) * 4;
                self.frame_buffer[idx] = r;
                self.frame_buffer[idx + 1] = g;
                self.frame_buffer[idx + 2] = b;
                self.frame_buffer[idx + 3] = 0xFF;
            }
        }
    }
}