// ============================================================
// 多平台模擬器 WASM 核心 - 主模組入口
// ============================================================
// 本模組提供 NES 與 Game Boy 的完整硬體模擬，
// 透過統一的 WASM 介面暴露給 JavaScript 使用。
//
// NES 模組：
// - cpu: 6502 CPU 模擬（含所有合法指令與定址模式）
// - ppu: 圖形處理器模擬（背景、精靈、捲軸）
// - apu: 音效處理器模擬（脈衝、三角、雜訊、DMC、混音）
// - bus: 記憶體匯流排（CPU/PPU 位址空間映射）
// - cartridge: 卡帶與 iNES 格式解析
// - mappers: 各種記憶體映射器（Mapper 0~4 等）
// - controller: 控制器輸入處理
// - emulator: 整合所有元件的模擬器主體
//
// Game Boy 模組：
// - gb::cpu: Sharp LR35902 CPU
// - gb::ppu: Game Boy 圖形處理（160×144, 4灰階）
// - gb::apu: Game Boy 音效（2方波+波形+雜訊）
// - gb::cartridge: MBC 記憶體映射控制器
// - gb::timer: 計時器
// - gb::joypad: 輸入處理
// - gb::emulator: 整合所有元件
//
// Game Gear / Master System 模組：
// - gg::cpu: Zilog Z80 CPU（完整指令集含 DD/FD/ED/CB 前綴）
// - gg::vdp: TMS9918 衍生 VDP（256×192 內部, GG 160×144 裁切, 4096 色）
// - gg::psg: SN76489 PSG（3 聲道 + 雜訊, GG 立體聲）
// - gg::cartridge: Sega / Codemasters Mapper
// - gg::joypad: 輸入處理（Port $DC/$DD/$00）
// - gg::emulator: 整合所有元件
// ============================================================

use wasm_bindgen::prelude::*;

// NES 模組
pub mod cpu;
pub mod ppu;
pub mod apu;
pub mod bus;
pub mod cartridge;
pub mod mappers;
pub mod controller;
pub mod emulator;

// Game Boy 模組
pub mod gb;

// Game Gear / Master System 模組
pub mod gg;

// SNES (Super Famicom) 模組
pub mod snes;

// Nintendo 64 模組
pub mod n64;

// ============================================================
// WASM 匯出介面 - 供 JavaScript 呼叫
// ============================================================

/// NES 模擬器 WASM 包裝器
/// 這是暴露給 JavaScript 的主要介面
#[wasm_bindgen]
pub struct NesWasm {
    /// 內部模擬器實例
    emu: emulator::Emulator,
}

#[wasm_bindgen]
impl NesWasm {
    /// 建立新的 NES 模擬器實例
    #[wasm_bindgen(constructor)]
    pub fn new() -> NesWasm {
        NesWasm {
            emu: emulator::Emulator::new(),
        }
    }

    /// 載入 ROM 資料
    /// 傳入 ROM 的 Uint8Array，回傳是否載入成功
    #[wasm_bindgen(js_name = "loadRom")]
    pub fn load_rom(&mut self, rom_data: &[u8]) -> bool {
        self.emu.load_rom(rom_data)
    }

    /// 重置模擬器
    pub fn reset(&mut self) {
        self.emu.reset();
    }

    /// 執行一幀（包含所有 CPU/PPU/APU 週期）
    pub fn frame(&mut self) {
        self.emu.frame();
    }

    /// 取得畫面緩衝區指標（256x240 的 RGBA 像素資料）
    /// 回傳的是 WASM 記憶體中的指標，JavaScript 可直接存取
    #[wasm_bindgen(js_name = "getFrameBufferPtr")]
    pub fn get_frame_buffer_ptr(&self) -> *const u8 {
        self.emu.get_frame_buffer_ptr()
    }

    /// 取得畫面緩衝區長度（位元組數）
    #[wasm_bindgen(js_name = "getFrameBufferLen")]
    pub fn get_frame_buffer_len(&self) -> usize {
        self.emu.get_frame_buffer_len()
    }

    /// 設定控制器按鈕狀態
    /// controller: 控制器編號（0 或 1）
    /// button: 按鈕編號（0=A, 1=B, 2=Select, 3=Start, 4=Up, 5=Down, 6=Left, 7=Right）
    /// pressed: 是否按下
    #[wasm_bindgen(js_name = "setButton")]
    pub fn set_button(&mut self, controller: u8, button: u8, pressed: bool) {
        self.emu.set_button(controller, button, pressed);
    }

    /// 設定音頻取樣率
    #[wasm_bindgen(js_name = "setAudioSampleRate")]
    pub fn set_audio_sample_rate(&mut self, rate: f64) {
        self.emu.set_audio_sample_rate(rate);
    }

    /// 取得音頻緩衝區指標
    #[wasm_bindgen(js_name = "getAudioBufferPtr")]
    pub fn get_audio_buffer_ptr(&self) -> *const f32 {
        self.emu.get_audio_buffer_ptr()
    }

    /// 取得可用的音頻取樣數
    #[wasm_bindgen(js_name = "getAudioBufferLen")]
    pub fn get_audio_buffer_len(&self) -> usize {
        self.emu.get_audio_buffer_len()
    }

    /// 消費音頻取樣（讀取後清除緩衝區）
    #[wasm_bindgen(js_name = "consumeAudioSamples")]
    pub fn consume_audio_samples(&mut self) -> usize {
        self.emu.consume_audio_samples()
    }

    /// 匯出存檔資料為 JSON 字串
    #[wasm_bindgen(js_name = "exportSaveState")]
    pub fn export_save_state(&self) -> String {
        self.emu.export_save_state()
    }

    /// 從 JSON 字串匯入存檔
    #[wasm_bindgen(js_name = "importSaveState")]
    pub fn import_save_state(&mut self, json: &str) -> bool {
        self.emu.import_save_state(json)
    }

    /// 取得 WASM 記憶體（供 JavaScript 直接存取畫面/音頻緩衝區）
    #[wasm_bindgen(js_name = "getWasmMemory")]
    pub fn get_wasm_memory(&self) -> JsValue {
        wasm_bindgen::memory()
    }
}

// ============================================================
// 統一模擬器介面 - 自動偵測 ROM 類型
// ============================================================

enum CoreType {
    None,
    Nes(emulator::Emulator),
    Gb(gb::emulator::GbEmulator),
    Gg(gg::emulator::GgEmulator),
    Snes(snes::emulator::SnesEmulator),
    N64(n64::emulator::N64Emulator),
}

/// 統一多平台模擬器 WASM 包裝器
/// 根據 ROM 格式自動選擇對應的模擬核心 (NES / Game Boy)
#[wasm_bindgen]
pub struct EmuWasm {
    core: CoreType,
}

#[wasm_bindgen]
impl EmuWasm {
    #[wasm_bindgen(constructor)]
    pub fn new() -> EmuWasm {
        EmuWasm { core: CoreType::None }
    }

    /// 載入 ROM（自動偵測格式：NES = "NES\x1A" 標頭, 否則視為 Game Boy）
    #[wasm_bindgen(js_name = "loadRom")]
    pub fn load_rom(&mut self, rom_data: &[u8]) -> bool {
        if rom_data.len() < 4 { return false; }

        // 偵測 NES 格式 (iNES: "NES\x1A")
        if rom_data[0] == b'N' && rom_data[1] == b'E' && rom_data[2] == b'S' && rom_data[3] == 0x1A {
            let mut emu = emulator::Emulator::new();
            if emu.load_rom(rom_data) {
                self.core = CoreType::Nes(emu);
                return true;
            }
            return false;
        }

        // 偵測 N64 ROM 格式 (.z64/.v64/.n64 byte orders)
        let is_n64 = matches!(
            &rom_data[0..4],
            [0x80, 0x37, 0x12, 0x40] | [0x37, 0x80, 0x40, 0x12] | [0x40, 0x12, 0x37, 0x80]
        );
        if is_n64 {
            return self.load_n64_rom(rom_data);
        }

        // 預設嘗試 Game Boy
        let mut emu = gb::emulator::GbEmulator::new();
        if emu.load_rom(rom_data) {
            self.core = CoreType::Gb(emu);
            return true;
        }

        false
    }

    /// 載入 Game Gear ROM
    #[wasm_bindgen(js_name = "loadGgRom")]
    pub fn load_gg_rom(&mut self, rom_data: &[u8]) -> bool {
        if rom_data.is_empty() { return false; }
        let mut emu = gg::emulator::GgEmulator::new();
        if emu.load_rom(rom_data) {
            self.core = CoreType::Gg(emu);
            return true;
        }
        false
    }

    /// 載入 SNES ROM (.smc / .sfc / .fig)
    #[wasm_bindgen(js_name = "loadSnesRom")]
    pub fn load_snes_rom(&mut self, rom_data: &[u8]) -> bool {
        if rom_data.is_empty() { return false; }
        let mut emu = snes::emulator::SnesEmulator::new();
        if emu.load_rom(rom_data) {
            self.core = CoreType::Snes(emu);
            return true;
        }
        false
    }

    /// 載入 Nintendo 64 ROM (.z64 / .v64 / .n64)
    #[wasm_bindgen(js_name = "loadN64Rom")]
    pub fn load_n64_rom(&mut self, rom_data: &[u8]) -> bool {
        if rom_data.is_empty() { return false; }
        let mut emu = n64::emulator::N64Emulator::new();
        if emu.load_rom(rom_data) {
            self.core = CoreType::N64(emu);
            return true;
        }
        false
    }

    /// 載入 SMS ROM
    #[wasm_bindgen(js_name = "loadSmsRom")]
    pub fn load_sms_rom(&mut self, rom_data: &[u8]) -> bool {
        if rom_data.is_empty() { return false; }
        let mut emu = gg::emulator::GgEmulator::new();
        if emu.load_rom_sms(rom_data) {
            self.core = CoreType::Gg(emu);
            return true;
        }
        false
    }

    /// 重置模擬器
    pub fn reset(&mut self) {
        match &mut self.core {
            CoreType::Nes(emu) => emu.reset(),
            CoreType::Gb(emu) => emu.reset(),
            CoreType::Gg(emu) => emu.reset(),
            CoreType::Snes(emu) => emu.reset(),
            CoreType::N64(emu) => emu.reset(),
            CoreType::None => {}
        }
    }

    /// 執行一幀
    pub fn frame(&mut self) {
        match &mut self.core {
            CoreType::Nes(emu) => emu.frame(),
            CoreType::Gb(emu) => emu.frame(),
            CoreType::Gg(emu) => emu.frame(),
            CoreType::Snes(emu) => emu.frame(),
            CoreType::N64(emu) => emu.frame(),
            CoreType::None => {}
        }
    }

    /// 取得畫面寬度
    #[wasm_bindgen(js_name = "getScreenWidth")]
    pub fn get_screen_width(&self) -> u32 {
        match &self.core {
            CoreType::Nes(_) => 256,
            CoreType::Gb(_) => 160,
            CoreType::Gg(emu) => emu.screen_width(),
            CoreType::Snes(_) => 256,
            CoreType::N64(_) => 320,
            CoreType::None => 256,
        }
    }

    /// 取得畫面高度
    #[wasm_bindgen(js_name = "getScreenHeight")]
    pub fn get_screen_height(&self) -> u32 {
        match &self.core {
            CoreType::Nes(_) => 240,
            CoreType::Gb(_) => 144,
            CoreType::Gg(emu) => emu.screen_height(),
            CoreType::Snes(_) => 224,
            CoreType::N64(_) => 240,
            CoreType::None => 240,
        }
    }

    /// 取得目前核心類型 ("nes", "gb", "gg", "none")
    #[wasm_bindgen(js_name = "getCoreType")]
    pub fn get_core_type(&self) -> String {
        match &self.core {
            CoreType::Nes(_) => "nes".to_string(),
            CoreType::Gb(_) => "gb".to_string(),
            CoreType::Gg(_) => "gg".to_string(),
            CoreType::Snes(_) => "snes".to_string(),
            CoreType::N64(_) => "n64".to_string(),
            CoreType::None => "none".to_string(),
        }
    }

    #[wasm_bindgen(js_name = "getFrameBufferPtr")]
    pub fn get_frame_buffer_ptr(&self) -> *const u8 {
        match &self.core {
            CoreType::Nes(emu) => emu.get_frame_buffer_ptr(),
            CoreType::Gb(emu) => emu.get_frame_buffer_ptr(),
            CoreType::Gg(emu) => emu.get_frame_buffer_ptr(),
            CoreType::Snes(emu) => emu.get_frame_buffer_ptr(),
            CoreType::N64(emu) => emu.get_frame_buffer_ptr(),
            CoreType::None => std::ptr::null(),
        }
    }

    #[wasm_bindgen(js_name = "getFrameBufferLen")]
    pub fn get_frame_buffer_len(&self) -> usize {
        match &self.core {
            CoreType::Nes(emu) => emu.get_frame_buffer_len(),
            CoreType::Gb(emu) => emu.get_frame_buffer_len(),
            CoreType::Gg(emu) => emu.get_frame_buffer_len(),
            CoreType::Snes(emu) => emu.get_frame_buffer_len(),
            CoreType::N64(emu) => emu.get_frame_buffer_len(),
            CoreType::None => 0,
        }
    }

    #[wasm_bindgen(js_name = "setButton")]
    pub fn set_button(&mut self, controller: u8, button: u8, pressed: bool) {
        match &mut self.core {
            CoreType::Nes(emu) => emu.set_button(controller, button, pressed),
            CoreType::Gb(emu) => emu.set_button(controller, button, pressed),
            CoreType::Gg(emu) => emu.set_button(controller, button, pressed),
            CoreType::Snes(emu) => emu.set_button(controller, button, pressed),
            CoreType::N64(emu) => emu.set_button(controller, button, pressed),
            CoreType::None => {}
        }
    }

    #[wasm_bindgen(js_name = "setAudioSampleRate")]
    pub fn set_audio_sample_rate(&mut self, rate: f64) {
        match &mut self.core {
            CoreType::Nes(emu) => emu.set_audio_sample_rate(rate),
            CoreType::Gb(emu) => emu.set_audio_sample_rate(rate),
            CoreType::Gg(emu) => emu.set_audio_sample_rate(rate),
            CoreType::Snes(emu) => emu.set_audio_sample_rate(rate),
            CoreType::N64(emu) => emu.set_audio_sample_rate(rate),
            CoreType::None => {}
        }
    }

    /// 設定音頻啟用/停用（停用時 NES APU IRQ 也會被抑制，用於除錯）
    #[wasm_bindgen(js_name = "setAudioEnabled")]
    pub fn set_audio_enabled(&mut self, enabled: bool) {
        match &mut self.core {
            CoreType::Nes(emu) => { emu.audio_enabled = enabled; }
            _ => {}
        }
    }

    #[wasm_bindgen(js_name = "getAudioBufferPtr")]
    pub fn get_audio_buffer_ptr(&self) -> *const f32 {
        match &self.core {
            CoreType::Nes(emu) => emu.get_audio_buffer_ptr(),
            CoreType::Gb(emu) => emu.get_audio_buffer_ptr(),
            CoreType::Gg(emu) => emu.get_audio_buffer_ptr(),
            CoreType::Snes(emu) => emu.get_audio_buffer_ptr(),
            CoreType::N64(emu) => emu.get_audio_buffer_ptr(),
            CoreType::None => std::ptr::null(),
        }
    }

    #[wasm_bindgen(js_name = "getAudioBufferLen")]
    pub fn get_audio_buffer_len(&self) -> usize {
        match &self.core {
            CoreType::Nes(emu) => emu.get_audio_buffer_len(),
            CoreType::Gb(emu) => emu.get_audio_buffer_len(),
            CoreType::Gg(emu) => emu.get_audio_buffer_len(),
            CoreType::Snes(emu) => emu.get_audio_buffer_len(),
            CoreType::N64(emu) => emu.get_audio_buffer_len(),
            CoreType::None => 0,
        }
    }

    #[wasm_bindgen(js_name = "consumeAudioSamples")]
    pub fn consume_audio_samples(&mut self) -> usize {
        match &mut self.core {
            CoreType::Nes(emu) => emu.consume_audio_samples(),
            CoreType::Gb(emu) => emu.consume_audio_samples(),
            CoreType::Gg(emu) => emu.consume_audio_samples(),
            CoreType::Snes(emu) => emu.consume_audio_samples(),
            CoreType::N64(emu) => emu.consume_audio_samples(),
            CoreType::None => 0,
        }
    }

    #[wasm_bindgen(js_name = "exportSaveState")]
    pub fn export_save_state(&self) -> String {
        match &self.core {
            CoreType::Nes(emu) => emu.export_save_state(),
            CoreType::Gb(emu) => emu.export_save_state(),
            CoreType::Gg(emu) => emu.export_save_state(),
            CoreType::Snes(emu) => emu.export_save_state(),
            CoreType::N64(emu) => emu.export_save_state(),
            CoreType::None => String::new(),
        }
    }

    #[wasm_bindgen(js_name = "importSaveState")]
    pub fn import_save_state(&mut self, json: &str) -> bool {
        match &mut self.core {
            CoreType::Nes(emu) => emu.import_save_state(json),
            CoreType::Gb(emu) => emu.import_save_state(json),
            CoreType::Gg(emu) => emu.import_save_state(json),
            CoreType::Snes(emu) => emu.import_save_state(json),
            CoreType::N64(emu) => emu.import_save_state(json),
            CoreType::None => false,
        }
    }

    /// Export SRAM (battery-backed save) as base64 string
    #[wasm_bindgen(js_name = "exportSram")]
    pub fn export_sram(&self) -> String {
        match &self.core {
            CoreType::Nes(emu) if emu.cartridge.header.has_battery => {
                snes::emulator::SnesEmulator::encode_base64(&emu.cartridge.prg_ram)
            }
            CoreType::Gb(emu) if emu.cartridge.has_battery && !emu.cartridge.ram.is_empty() => {
                snes::emulator::SnesEmulator::encode_base64(&emu.cartridge.ram)
            }
            CoreType::Gg(emu) => {
                snes::emulator::SnesEmulator::encode_base64(&emu.cartridge.ram)
            }
            CoreType::Snes(emu) => {
                if emu.cart.sram_size > 0 {
                    snes::emulator::SnesEmulator::encode_base64(&emu.cart.sram)
                } else {
                    String::new()
                }
            }
            _ => String::new(),
        }
    }

    /// Import SRAM (battery-backed save) from base64 string
    #[wasm_bindgen(js_name = "importSram")]
    pub fn import_sram(&mut self, data: &str) -> bool {
        let Some(bytes) = snes::emulator::SnesEmulator::decode_base64(data.trim()) else {
            return false;
        };

        match &mut self.core {
            CoreType::Nes(emu) => {
                if !emu.cartridge.header.has_battery || bytes.len() != emu.cartridge.prg_ram.len() {
                    return false;
                }
                emu.cartridge.prg_ram.copy_from_slice(&bytes);
                true
            }
            CoreType::Gb(emu) => {
                if !emu.cartridge.has_battery || bytes.len() != emu.cartridge.ram.len() {
                    return false;
                }
                emu.cartridge.ram.copy_from_slice(&bytes);
                true
            }
            CoreType::Gg(emu) => {
                if bytes.len() != emu.cartridge.ram.len() {
                    return false;
                }
                emu.cartridge.ram.copy_from_slice(&bytes);
                true
            }
            CoreType::Snes(emu) => {
                if bytes.len() != emu.cart.sram.len() {
                    return false;
                }
                emu.cart.sram.copy_from_slice(&bytes);
                true
            }
            _ => false,
        }
    }

    #[wasm_bindgen(js_name = "getWasmMemory")]
    pub fn get_wasm_memory(&self) -> JsValue {
        wasm_bindgen::memory()
    }

    /// SNES 除錯狀態
    #[wasm_bindgen(js_name = "debugState")]
    pub fn debug_state(&self) -> String {
        match &self.core {
            CoreType::Nes(emu) => emu.debug_state(),
            CoreType::Snes(emu) => emu.debug_state(),
            CoreType::N64(emu) => emu.debug_state(),
            _ => "Debug state unavailable".to_string(),
        }
    }

    /// Enable or disable the bounded SNES hardware verification trace.
    #[wasm_bindgen(js_name = "debugSetVerificationTrace")]
    pub fn debug_set_verification_trace(&mut self, enabled: bool) {
        if let CoreType::Snes(emu) = &mut self.core {
            emu.debug_set_verification_trace(enabled);
        }
    }

    /// Return and clear the bounded SNES hardware verification trace.
    #[wasm_bindgen(js_name = "debugTakeVerificationTrace")]
    pub fn debug_take_verification_trace(&mut self) -> String {
        match &mut self.core {
            CoreType::Snes(emu) => emu.debug_take_verification_trace(),
            _ => String::new(),
        }
    }

    /// Stable machine-readable SNES hardware checkpoint for regression tests.
    #[wasm_bindgen(js_name = "debugCheckpoint")]
    pub fn debug_checkpoint(&self) -> String {
        match &self.core {
            CoreType::Snes(emu) => emu.debug_checkpoint(),
            _ => "{\"schema\":1,\"core\":\"unavailable\"}".to_string(),
        }
    }

    /// SNES 精靈診斷
    #[wasm_bindgen(js_name = "debugSpriteInfo")]
    pub fn debug_sprite_info(&self) -> String {
        match &self.core {
            CoreType::Snes(emu) => emu.debug_sprite_info(),
            _ => "Not SNES".to_string(),
        }
    }

    /// SNES PPU Color Math / Window 診斷
    #[wasm_bindgen(js_name = "debugPpuColorState")]
    pub fn debug_ppu_color_state(&self) -> String {
        match &self.core {
            CoreType::Snes(emu) => emu.debug_ppu_color_state(),
            _ => "Not SNES".to_string(),
        }
    }

    #[wasm_bindgen(js_name = "debugPpuVram")]
    pub fn debug_ppu_vram(&self) -> String {
        match &self.core {
            CoreType::Snes(emu) => emu.debug_ppu_vram(),
            _ => "Not SNES".to_string(),
        }
    }

    #[wasm_bindgen(js_name = "debugPpuBgSample")]
    pub fn debug_ppu_bg_sample(&self, bg: u8, screen_x: u16, scanline: u16, bpp: u8) -> String {
        match &self.core {
            CoreType::Snes(emu) => emu.debug_ppu_bg_sample(bg, screen_x, scanline, bpp),
            _ => "Not SNES".to_string(),
        }
    }

    #[wasm_bindgen(js_name = "debugSetPpuRenderPixel")]
    pub fn debug_set_ppu_render_pixel(&mut self, scanline: u16, screen_x: u16) {
        if let CoreType::Snes(emu) = &mut self.core {
            emu.debug_set_ppu_render_pixel(scanline, screen_x);
        }
    }

    #[wasm_bindgen(js_name = "debugPpuRenderPixel")]
    pub fn debug_ppu_render_pixel(&self) -> String {
        match &self.core {
            CoreType::Snes(emu) => emu.debug_ppu_render_pixel(),
            _ => "Not SNES".to_string(),
        }
    }

    #[wasm_bindgen(js_name = "debugSetPpuVramWriteWatch")]
    pub fn debug_set_ppu_vram_write_watch(
        &mut self,
        first_start: u16,
        first_len: u16,
        second_start: u16,
        second_len: u16,
    ) {
        if let CoreType::Snes(emu) = &mut self.core {
            emu.debug_set_ppu_vram_write_watch(
                first_start,
                first_len,
                second_start,
                second_len,
            );
        }
    }

    #[wasm_bindgen(js_name = "debugPpuVramWriteHistory")]
    pub fn debug_ppu_vram_write_history(&mut self) -> String {
        match &mut self.core {
            CoreType::Snes(emu) => emu.debug_ppu_vram_write_history(),
            _ => "Not SNES".to_string(),
        }
    }

    /// SNES per-scanline trace (captures one frame of mode/scroll data)
    #[wasm_bindgen(js_name = "debugTraceFrame")]
    pub fn debug_trace_frame(&mut self) -> String {
        match &mut self.core {
            CoreType::Snes(emu) => {
                if !emu.ppu.debug_trace_log.is_empty() {
                    // Return and clear existing log
                    let log = emu.ppu.debug_trace_log.clone();
                    emu.ppu.debug_trace_log.clear();
                    emu.ppu.debug_trace_frame = false;
                    log
                } else {
                    // Start tracing
                    emu.ppu.debug_trace_frame = true;
                    emu.ppu.debug_trace_log.clear();
                    "Tracing started - call again after 1 frame to get results".to_string()
                }
            }
            _ => "Not SNES".to_string(),
        }
    }

    /// SNES 掃描線層級 debug
    #[wasm_bindgen(js_name = "debugScanlineLayers")]
    pub fn debug_scanline_layers(&self, y: u16, x_start: u16, x_end: u16) -> String {
        match &self.core {
            CoreType::Snes(emu) => emu.debug_scanline_layers(y, x_start, x_end),
            _ => "Not SNES".to_string(),
        }
    }

    /// SNES per-scanline register dump
    #[wasm_bindgen(js_name = "debugSlRegs")]
    pub fn debug_sl_regs(&self) -> String {
        match &self.core {
            CoreType::Snes(emu) => emu.debug_sl_regs(),
            _ => "Not SNES".to_string(),
        }
    }

    /// SNES $2130 write trace
    #[wasm_bindgen(js_name = "debug2130Trace")]
    pub fn debug_2130_trace(&self) -> String {
        match &self.core {
            CoreType::Snes(emu) => emu.debug_2130_trace(),
            _ => "Not SNES".to_string(),
        }
    }

    /// SNES 單步追蹤
    #[wasm_bindgen(js_name = "debugStepTrace")]
    pub fn debug_step_trace(&mut self, count: u32) -> String {
        match &mut self.core {
            CoreType::Snes(emu) => emu.debug_step_trace(count),
            _ => "Not SNES".to_string(),
        }
    }

    /// SNES 幀追蹤
    #[wasm_bindgen(js_name = "debugFrameTrace")]
    pub fn debug_frame_trace(&mut self) -> String {
        match &mut self.core {
            CoreType::Snes(emu) => emu.debug_frame_trace(),
            _ => "Not SNES".to_string(),
        }
    }

    /// SNES 多幀執行計數
    #[wasm_bindgen(js_name = "debugRunFrames")]
    pub fn debug_run_frames(&mut self, num_frames: u32) -> String {
        match &mut self.core {
            CoreType::Snes(emu) => emu.debug_run_frames(num_frames),
            _ => "Not SNES".to_string(),
        }
    }

    /// SNES 指令計數執行 (不走 frame loop)
    #[wasm_bindgen(js_name = "debugRunInstructions")]
    pub fn debug_run_instructions(&mut self, count: u32) -> String {
        match &mut self.core {
            CoreType::Snes(emu) => emu.debug_run_instructions(count),
            _ => "Not SNES".to_string(),
        }
    }

    /// SNES 記憶體讀取
    #[wasm_bindgen(js_name = "debugReadMem")]
    pub fn debug_read_mem(&mut self, bank: u8, addr: u16, count: u16) -> String {
        match &mut self.core {
            CoreType::Snes(emu) => emu.debug_read_mem(bank, addr, count),
            _ => "Not SNES".to_string(),
        }
    }

    /// SNES bank 轉移追蹤
    #[wasm_bindgen(js_name = "debugTraceBankChange")]
    pub fn debug_trace_bank_change(&mut self, target_bank: u8, max_insns: u32) -> String {
        match &mut self.core {
            CoreType::Snes(emu) => emu.debug_trace_bank_change(target_bank, max_insns),
            _ => "Not SNES".to_string(),
        }
    }

    #[wasm_bindgen(js_name = "debugRunThenTrace")]
    pub fn debug_run_then_trace(&mut self, frames: u32, trace_count: u32) -> String {
        match &mut self.core {
            CoreType::Snes(emu) => emu.debug_run_then_trace(frames, trace_count),
            _ => "Not SNES".to_string(),
        }
    }

    #[wasm_bindgen(js_name = "debugReadRomRange")]
    pub fn debug_read_rom_range(&self, bank: u8, start: u16, len: u16) -> String {
        match &self.core {
            CoreType::Snes(emu) => emu.debug_read_rom_range(bank, start, len),
            _ => "Not SNES".to_string(),
        }
    }

    #[wasm_bindgen(js_name = "debugRunUntilPcInRange")]
    pub fn debug_run_until_pc_in_range(&mut self, target_bank: u8, target_lo: u16, target_hi: u16, max_frames: u32, trace_count: u32) -> String {
        match &mut self.core {
            CoreType::Snes(emu) => emu.debug_run_until_pc_in_range(target_bank, target_lo, target_hi, max_frames, trace_count),
            _ => "Not SNES".to_string(),
        }
    }

    /// DSP voice state dump
    #[wasm_bindgen(js_name = "debugDspVoices")]
    pub fn debug_dsp_voices(&self) -> String {
        match &self.core {
            CoreType::Snes(emu) => emu.debug_dsp_voices(),
            _ => "Not SNES".to_string(),
        }
    }

    /// CGRAM (palette) dump
    #[wasm_bindgen(js_name = "debugCgram")]
    pub fn debug_cgram(&self, count: u16) -> String {
        match &self.core {
            CoreType::Snes(emu) => emu.debug_cgram(count),
            _ => "Not SNES".to_string(),
        }
    }

    /// Debug: set voice mute mask (bit N = mute voice N)
    #[wasm_bindgen(js_name = "debugSetVoiceMute")]
    pub fn debug_set_voice_mute(&mut self, mask: u8) {
        match &mut self.core {
            CoreType::Snes(emu) => emu.debug_set_voice_mute(mask),
            _ => {}
        }
    }

    #[wasm_bindgen(js_name = "debugCgram0Watch")]
    pub fn debug_cgram0_watch(&mut self, enable: bool) {
        match &mut self.core {
            CoreType::Snes(emu) => emu.debug_cgram0_watch(enable),
            _ => {}
        }
    }

    #[wasm_bindgen(js_name = "debugCgram0Log")]
    pub fn debug_cgram0_log(&mut self) -> String {
        match &mut self.core {
            CoreType::Snes(emu) => emu.debug_cgram0_log(),
            _ => String::new(),
        }
    }

    #[wasm_bindgen(js_name = "debugTrapLog")]
    pub fn debug_trap_log(&mut self) -> String {
        match &mut self.core {
            CoreType::Snes(emu) => emu.debug_get_trap_log(),
            _ => String::new(),
        }
    }
}

#[cfg(test)]
mod sram_tests {
    use super::*;

    #[test]
    fn native_sram_round_trips_for_supported_cores() {
        let mut nes = emulator::Emulator::new();
        nes.cartridge.header.has_battery = true;
        nes.cartridge.prg_ram[123] = 0x5a;
        let mut wrapper = EmuWasm { core: CoreType::Nes(nes) };
        let saved = wrapper.export_sram();
        if let CoreType::Nes(emu) = &mut wrapper.core { emu.cartridge.prg_ram.fill(0); }
        assert!(wrapper.import_sram(&saved));
        assert!(matches!(&wrapper.core, CoreType::Nes(emu) if emu.cartridge.prg_ram[123] == 0x5a));

        let mut gb = gb::emulator::GbEmulator::new();
        gb.cartridge.has_battery = true;
        gb.cartridge.ram = vec![0; 8192];
        gb.cartridge.ram[456] = 0xa5;
        let mut wrapper = EmuWasm { core: CoreType::Gb(gb) };
        let saved = wrapper.export_sram();
        if let CoreType::Gb(emu) = &mut wrapper.core { emu.cartridge.ram.fill(0); }
        assert!(wrapper.import_sram(&saved));
        assert!(matches!(&wrapper.core, CoreType::Gb(emu) if emu.cartridge.ram[456] == 0xa5));

        let gg = gg::emulator::GgEmulator::new();
        let mut zeroed_wrapper = EmuWasm { core: CoreType::Gg(gg) };
        let zeroed_save = zeroed_wrapper.export_sram();
        assert!(!zeroed_save.is_empty());
        assert!(zeroed_wrapper.import_sram(&zeroed_save));

        let mut gg = gg::emulator::GgEmulator::new();
        gg.cartridge.ram[789] = 0x3c;
        let mut wrapper = EmuWasm { core: CoreType::Gg(gg) };
        let saved = wrapper.export_sram();
        if let CoreType::Gg(emu) = &mut wrapper.core { emu.cartridge.ram.fill(0); }
        assert!(wrapper.import_sram(&saved));
        assert!(matches!(&wrapper.core, CoreType::Gg(emu) if emu.cartridge.ram[789] == 0x3c));

        let mut snes = snes::emulator::SnesEmulator::new();
        snes.cart.sram_size = snes.cart.sram.len();
        snes.cart.sram[321] = 0xc3;
        let mut wrapper = EmuWasm { core: CoreType::Snes(snes) };
        let saved = wrapper.export_sram();
        if let CoreType::Snes(emu) = &mut wrapper.core { emu.cart.sram.fill(0); }
        assert!(wrapper.import_sram(&saved));
        assert!(matches!(&wrapper.core, CoreType::Snes(emu) if emu.cart.sram[321] == 0xc3));
    }

    #[test]
    fn native_sram_rejects_non_battery_and_wrong_size_data() {
        let wrapper = EmuWasm { core: CoreType::Nes(emulator::Emulator::new()) };
        assert!(wrapper.export_sram().is_empty());

        let mut gb = gb::emulator::GbEmulator::new();
        gb.cartridge.has_battery = true;
        gb.cartridge.ram = vec![0; 8192];
        let mut wrapper = EmuWasm { core: CoreType::Gb(gb) };
        let wrong_size = snes::emulator::SnesEmulator::encode_base64(&[1, 2, 3]);
        assert!(!wrapper.import_sram(&wrong_size));
    }

    #[test]
    fn emulator_save_state_round_trips_for_supported_cores() {
        let mut nes = emulator::Emulator::new();
        nes.cartridge.prg_ram[123] = 0x5a;
        let mut wrapper = EmuWasm { core: CoreType::Nes(nes) };
        let saved = wrapper.export_save_state();
        if let CoreType::Nes(emu) = &mut wrapper.core { emu.cartridge.prg_ram.fill(0); }
        assert!(wrapper.import_save_state(&saved));
        assert!(matches!(&wrapper.core, CoreType::Nes(emu) if emu.cartridge.prg_ram[123] == 0x5a));

        let mut gb = gb::emulator::GbEmulator::new();
        gb.cartridge.ram = vec![0; 8192];
        gb.cartridge.ram[456] = 0xa5;
        let mut wrapper = EmuWasm { core: CoreType::Gb(gb) };
        let saved = wrapper.export_save_state();
        if let CoreType::Gb(emu) = &mut wrapper.core { emu.cartridge.ram.fill(0); }
        assert!(wrapper.import_save_state(&saved));
        assert!(matches!(&wrapper.core, CoreType::Gb(emu) if emu.cartridge.ram[456] == 0xa5));

        let mut gg = gg::emulator::GgEmulator::new();
        gg.cartridge.ram[789] = 0x3c;
        let mut wrapper = EmuWasm { core: CoreType::Gg(gg) };
        let saved = wrapper.export_save_state();
        if let CoreType::Gg(emu) = &mut wrapper.core { emu.cartridge.ram.fill(0); }
        assert!(wrapper.import_save_state(&saved));
        assert!(matches!(&wrapper.core, CoreType::Gg(emu) if emu.cartridge.ram[789] == 0x3c));

        let mut snes = snes::emulator::SnesEmulator::new();
        snes.cart.sram[321] = 0xc3;
        let mut wrapper = EmuWasm { core: CoreType::Snes(snes) };
        let saved = wrapper.export_save_state();
        if let CoreType::Snes(emu) = &mut wrapper.core { emu.cart.sram.fill(0); }
        assert!(wrapper.import_save_state(&saved));
        assert!(matches!(&wrapper.core, CoreType::Snes(emu) if emu.cart.sram[321] == 0xc3));
    }
}
