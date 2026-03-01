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

        // 預設嘗試 Game Boy
        let mut emu = gb::emulator::GbEmulator::new();
        if emu.load_rom(rom_data) {
            self.core = CoreType::Gb(emu);
            return true;
        }

        false
    }

    /// 重置模擬器
    pub fn reset(&mut self) {
        match &mut self.core {
            CoreType::Nes(emu) => emu.reset(),
            CoreType::Gb(emu) => emu.reset(),
            CoreType::None => {}
        }
    }

    /// 執行一幀
    pub fn frame(&mut self) {
        match &mut self.core {
            CoreType::Nes(emu) => emu.frame(),
            CoreType::Gb(emu) => emu.frame(),
            CoreType::None => {}
        }
    }

    /// 取得畫面寬度
    #[wasm_bindgen(js_name = "getScreenWidth")]
    pub fn get_screen_width(&self) -> u32 {
        match &self.core {
            CoreType::Nes(_) => 256,
            CoreType::Gb(_) => 160,
            CoreType::None => 256,
        }
    }

    /// 取得畫面高度
    #[wasm_bindgen(js_name = "getScreenHeight")]
    pub fn get_screen_height(&self) -> u32 {
        match &self.core {
            CoreType::Nes(_) => 240,
            CoreType::Gb(_) => 144,
            CoreType::None => 240,
        }
    }

    /// 取得目前核心類型 ("nes", "gb", "none")
    #[wasm_bindgen(js_name = "getCoreType")]
    pub fn get_core_type(&self) -> String {
        match &self.core {
            CoreType::Nes(_) => "nes".to_string(),
            CoreType::Gb(_) => "gb".to_string(),
            CoreType::None => "none".to_string(),
        }
    }

    #[wasm_bindgen(js_name = "getFrameBufferPtr")]
    pub fn get_frame_buffer_ptr(&self) -> *const u8 {
        match &self.core {
            CoreType::Nes(emu) => emu.get_frame_buffer_ptr(),
            CoreType::Gb(emu) => emu.get_frame_buffer_ptr(),
            CoreType::None => std::ptr::null(),
        }
    }

    #[wasm_bindgen(js_name = "getFrameBufferLen")]
    pub fn get_frame_buffer_len(&self) -> usize {
        match &self.core {
            CoreType::Nes(emu) => emu.get_frame_buffer_len(),
            CoreType::Gb(emu) => emu.get_frame_buffer_len(),
            CoreType::None => 0,
        }
    }

    #[wasm_bindgen(js_name = "setButton")]
    pub fn set_button(&mut self, controller: u8, button: u8, pressed: bool) {
        match &mut self.core {
            CoreType::Nes(emu) => emu.set_button(controller, button, pressed),
            CoreType::Gb(emu) => emu.set_button(controller, button, pressed),
            CoreType::None => {}
        }
    }

    #[wasm_bindgen(js_name = "setAudioSampleRate")]
    pub fn set_audio_sample_rate(&mut self, rate: f64) {
        match &mut self.core {
            CoreType::Nes(emu) => emu.set_audio_sample_rate(rate),
            CoreType::Gb(emu) => emu.set_audio_sample_rate(rate),
            CoreType::None => {}
        }
    }

    #[wasm_bindgen(js_name = "getAudioBufferPtr")]
    pub fn get_audio_buffer_ptr(&self) -> *const f32 {
        match &self.core {
            CoreType::Nes(emu) => emu.get_audio_buffer_ptr(),
            CoreType::Gb(emu) => emu.get_audio_buffer_ptr(),
            CoreType::None => std::ptr::null(),
        }
    }

    #[wasm_bindgen(js_name = "getAudioBufferLen")]
    pub fn get_audio_buffer_len(&self) -> usize {
        match &self.core {
            CoreType::Nes(emu) => emu.get_audio_buffer_len(),
            CoreType::Gb(emu) => emu.get_audio_buffer_len(),
            CoreType::None => 0,
        }
    }

    #[wasm_bindgen(js_name = "consumeAudioSamples")]
    pub fn consume_audio_samples(&mut self) -> usize {
        match &mut self.core {
            CoreType::Nes(emu) => emu.consume_audio_samples(),
            CoreType::Gb(emu) => emu.consume_audio_samples(),
            CoreType::None => 0,
        }
    }

    #[wasm_bindgen(js_name = "exportSaveState")]
    pub fn export_save_state(&self) -> String {
        match &self.core {
            CoreType::Nes(emu) => emu.export_save_state(),
            _ => String::new(),
        }
    }

    #[wasm_bindgen(js_name = "importSaveState")]
    pub fn import_save_state(&mut self, json: &str) -> bool {
        match &mut self.core {
            CoreType::Nes(emu) => emu.import_save_state(json),
            _ => false,
        }
    }

    #[wasm_bindgen(js_name = "getWasmMemory")]
    pub fn get_wasm_memory(&self) -> JsValue {
        wasm_bindgen::memory()
    }
}
