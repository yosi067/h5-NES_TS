// ============================================================
// NES APU 模擬 - 音效處理器 (2A03)
// ============================================================
// 完整實作 NES APU，包含 5 個聲道：
// - 2 個脈衝波聲道（Pulse 1 & 2）
// - 1 個三角波聲道（Triangle）
// - 1 個雜訊聲道（Noise）
// - 1 個 DMC（Delta Modulation Channel）聲道
//
// 以及幀計數器（Frame Counter）和混音器。
//
// 參考資料：
// - https://www.nesdev.org/wiki/APU
// - https://www.nesdev.org/wiki/APU_Mixer
// ============================================================

use crate::fceumm_audio::{
    fceumm_wave_hi_flush, FceummAudioPipeline, FceummChannelState, FceummRenderTimeline,
};

/// 音頻緩衝區大小（足夠儲存一幀的取樣）
const AUDIO_BUFFER_SIZE: usize = 8192;

/// NES CPU 時鐘頻率（NTSC）
const CPU_CLOCK_RATE: f64 = 1789773.0;

/// 脈衝波占空比查詢表
/// 4 種不同的占空比波形，每種 8 步
const DUTY_TABLE: [[u8; 8]; 4] = [
    [0, 0, 0, 0, 0, 0, 0, 1], // 12.5%
    [0, 0, 0, 0, 0, 0, 1, 1], // 25%
    [0, 0, 0, 0, 1, 1, 1, 1], // 50%
    [1, 1, 1, 1, 1, 1, 0, 0], // 75% (25% 反相)
];

/// 三角波波形查詢表（32 步，產生三角波形）
const TRIANGLE_TABLE: [u8; 32] = [
    15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];

/// 雜訊聲道的週期查詢表（NTSC）
const NOISE_PERIOD_TABLE: [u16; 16] = [
    4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068,
];

/// DMC 聲道的速率查詢表（NTSC）
const DMC_RATE_TABLE: [u16; 16] = [
    428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54,
];

/// 長度計數器查詢表
const LENGTH_TABLE: [u8; 32] = [
    10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14,
    12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30,
];

// ===== 脈衝波聲道 =====

/// 脈衝波聲道（Pulse）
#[derive(Clone)]
struct PulseChannel {
    /// 是否啟用
    enabled: bool,
    /// 聲道編號（1 或 2，影響掃頻行為）
    channel: u8,

    // 占空比
    /// 占空比模式（0-3）
    duty: u8,
    /// 占空比序列位置
    duty_pos: u8,

    // 定時器
    /// 定時器週期
    timer_period: u16,
    /// 定時器目前值
    timer_value: u16,

    // 長度計數器
    /// 長度計數器停止旗標
    length_halt: bool,
    /// 長度計數器
    length_counter: u8,

    // 包絡線
    /// 包絡線啟用
    envelope_enabled: bool,
    /// 包絡線循環
    envelope_loop: bool,
    /// 包絡線開始旗標
    envelope_start: bool,
    /// 包絡線週期
    envelope_period: u8,
    /// 包絡線分頻計數器
    envelope_divider: u8,
    /// 包絡線衰減值
    envelope_decay: u8,
    /// 常數音量值
    constant_volume: u8,

    // 掃頻
    /// 掃頻啟用
    sweep_enabled: bool,
    /// 掃頻反向
    sweep_negate: bool,
    /// 掃頻重載旗標
    sweep_reload: bool,
    /// 掃頻週期
    sweep_period: u8,
    /// 掃頻移位量
    sweep_shift: u8,
    /// 掃頻分頻計數器
    sweep_divider: u8,
}

impl PulseChannel {
    fn new(channel: u8) -> Self {
        PulseChannel {
            enabled: false,
            channel,
            duty: 0,
            duty_pos: 0,
            timer_period: 0,
            timer_value: 0,
            length_halt: false,
            length_counter: 0,
            envelope_enabled: true,
            envelope_loop: false,
            envelope_start: false,
            envelope_period: 0,
            envelope_divider: 0,
            envelope_decay: 0,
            constant_volume: 0,
            sweep_enabled: false,
            sweep_negate: false,
            sweep_reload: false,
            sweep_period: 0,
            sweep_shift: 0,
            sweep_divider: 0,
        }
    }

    /// 寫入暫存器 $4000/$4004
    fn write_ctrl(&mut self, data: u8) {
        self.duty = (data >> 6) & 0x03;
        self.length_halt = data & 0x20 != 0;
        self.envelope_loop = data & 0x20 != 0;
        self.envelope_enabled = data & 0x10 == 0;
        self.envelope_period = data & 0x0F;
        self.constant_volume = data & 0x0F;
    }

    /// 寫入暫存器 $4001/$4005
    fn write_sweep(&mut self, data: u8) {
        self.sweep_enabled = data & 0x80 != 0;
        self.sweep_period = (data >> 4) & 0x07;
        self.sweep_negate = data & 0x08 != 0;
        self.sweep_shift = data & 0x07;
        self.sweep_reload = true;
    }

    /// 寫入暫存器 $4002/$4006（定時器低位元組）
    fn write_timer_lo(&mut self, data: u8) {
        self.timer_period = (self.timer_period & 0x0700) | data as u16;
    }

    /// 寫入暫存器 $4003/$4007（長度計數器載入 + 定時器高位元組）
    fn write_length(&mut self, data: u8) {
        self.timer_period = (self.timer_period & 0x00FF) | ((data as u16 & 0x07) << 8);
        if self.enabled {
            self.length_counter = LENGTH_TABLE[(data >> 3) as usize];
        }
        self.duty_pos = 0;
        self.envelope_start = true;
    }

    /// 定時器時鐘
    fn clock_timer(&mut self) {
        if self.timer_value == 0 {
            self.timer_value = self.timer_period;
            self.duty_pos = self.duty_pos.wrapping_sub(1) & 0x07;
        } else {
            self.timer_value -= 1;
        }
    }

    /// 包絡線時鐘
    fn clock_envelope(&mut self) {
        if self.envelope_start {
            self.envelope_start = false;
            self.envelope_decay = 15;
            self.envelope_divider = self.envelope_period;
        } else if self.envelope_divider == 0 {
            self.envelope_divider = self.envelope_period;
            if self.envelope_decay > 0 {
                self.envelope_decay -= 1;
            } else if self.envelope_loop {
                self.envelope_decay = 15;
            }
        } else {
            self.envelope_divider -= 1;
        }
    }

    /// 長度計數器時鐘
    fn clock_length(&mut self) {
        if !self.length_halt && self.length_counter > 0 {
            self.length_counter -= 1;
        }
    }

    /// 掃頻時鐘
    fn clock_sweep(&mut self) {
        let target = self.sweep_target_period();
        if self.sweep_divider == 0 && self.sweep_enabled && self.sweep_shift > 0 &&
           self.timer_period >= 8 && target <= 0x7FF {
            self.timer_period = target;
        }
        if self.sweep_divider == 0 || self.sweep_reload {
            self.sweep_divider = self.sweep_period;
            self.sweep_reload = false;
        } else {
            self.sweep_divider -= 1;
        }
    }

    /// 計算掃頻目標週期
    fn sweep_target_period(&self) -> u16 {
        let delta = self.timer_period >> self.sweep_shift;
        if self.sweep_negate {
            // Pulse 1 使用一的補數（減去 delta + 1）
            // Pulse 2 使用二的補數（減去 delta）
            if self.channel == 1 {
                self.timer_period.wrapping_sub(delta).wrapping_sub(1)
            } else {
                self.timer_period.wrapping_sub(delta)
            }
        } else {
            self.timer_period.wrapping_add(delta)
        }
    }

    /// 是否被靜音
    fn is_muted(&self) -> bool {
        if self.timer_period < 8 || self.timer_period > 0x7FF {
            return true;
        }

        !self.sweep_negate
            && u32::from(self.timer_period)
                + u32::from(self.timer_period >> self.sweep_shift)
                > 0x7FF
    }

    /// 取得輸出值
    fn output(&self) -> u8 {
        if !self.enabled || self.length_counter == 0 || self.is_muted() {
            return 0;
        }

        if DUTY_TABLE[self.duty as usize][self.duty_pos as usize] == 0 {
            return 0;
        }

        self.volume()
    }

    fn output_at(&self, phase: u8) -> u8 {
        const RECT_DUTIES: [u8; 4] = [1, 2, 4, 6];

        if !self.enabled || self.length_counter == 0 || self.is_muted()
            || phase >= RECT_DUTIES[self.duty as usize]
        {
            return 0;
        }

        self.volume()
    }

    fn volume(&self) -> u8 {
        if self.envelope_enabled {
            self.envelope_decay
        } else {
            self.constant_volume
        }
    }
}

// ===== 三角波聲道 =====

/// 三角波聲道（Triangle）
#[derive(Clone)]
struct TriangleChannel {
    /// 是否啟用
    enabled: bool,
    /// 定時器週期
    timer_period: u16,
    /// 定時器目前值
    timer_value: u16,
    /// 序列位置（0-31）
    sequence_pos: u8,
    /// 長度計數器停止 / 線性計數器控制
    length_halt: bool,
    /// 長度計數器
    length_counter: u8,
    /// 線性計數器
    linear_counter: u8,
    /// 線性計數器重載值
    linear_counter_reload: u8,
    /// 線性計數器重載旗標
    linear_counter_reload_flag: bool,
}

impl TriangleChannel {
    fn new() -> Self {
        TriangleChannel {
            enabled: false,
            timer_period: 0,
            timer_value: 0,
            sequence_pos: 0,
            length_halt: false,
            length_counter: 0,
            linear_counter: 0,
            linear_counter_reload: 0,
            linear_counter_reload_flag: false,
        }
    }

    /// 寫入暫存器 $4008
    fn write_ctrl(&mut self, data: u8) {
        self.length_halt = data & 0x80 != 0;
        self.linear_counter_reload = data & 0x7F;
    }

    /// 寫入暫存器 $400A（定時器低位元組）
    fn write_timer_lo(&mut self, data: u8) {
        self.timer_period = (self.timer_period & 0x0700) | data as u16;
    }

    /// 寫入暫存器 $400B（長度計數器載入 + 定時器高位元組）
    fn write_length(&mut self, data: u8) {
        self.timer_period = (self.timer_period & 0x00FF) | ((data as u16 & 0x07) << 8);
        if self.enabled {
            self.length_counter = LENGTH_TABLE[(data >> 3) as usize];
        }
        self.linear_counter_reload_flag = true;
    }

    /// 定時器時鐘
    fn clock_timer(&mut self) {
        if self.timer_value == 0 {
            self.timer_value = self.timer_period;
            if self.length_counter > 0 && self.linear_counter > 0 {
                self.sequence_pos = (self.sequence_pos + 1) % 32;
            }
        } else {
            self.timer_value -= 1;
        }
    }

    /// 線性計數器時鐘
    fn clock_linear_counter(&mut self) {
        if self.linear_counter_reload_flag {
            self.linear_counter = self.linear_counter_reload;
        } else if self.linear_counter > 0 {
            self.linear_counter -= 1;
        }
        if !self.length_halt {
            self.linear_counter_reload_flag = false;
        }
    }

    /// 長度計數器時鐘
    fn clock_length(&mut self) {
        if !self.length_halt && self.length_counter > 0 {
            self.length_counter -= 1;
        }
    }

    /// 取得輸出值
    fn output(&self) -> u8 {
        if !self.enabled || self.length_counter == 0 || self.linear_counter == 0 {
            return 0;
        }
        // 過低的頻率會導致超音波，靜音以避免雜音
        if self.timer_period < 2 {
            return 0;
        }
        TRIANGLE_TABLE[self.sequence_pos as usize]
    }
}

// ===== 雜訊聲道 =====

/// 雜訊聲道（Noise）
#[derive(Clone)]
struct NoiseChannel {
    /// 是否啟用
    enabled: bool,
    /// 線性反饋移位暫存器
    shift_register: u16,
    /// 模式旗標（short mode）
    mode: bool,
    /// 定時器週期
    timer_period: u16,
    /// 定時器目前值
    timer_value: u16,
    /// 長度計數器停止旗標
    length_halt: bool,
    /// 長度計數器
    length_counter: u8,

    // 包絡線（與脈衝波共用結構）
    envelope_enabled: bool,
    envelope_loop: bool,
    envelope_start: bool,
    envelope_period: u8,
    envelope_divider: u8,
    envelope_decay: u8,
    constant_volume: u8,
}

impl NoiseChannel {
    fn new() -> Self {
        NoiseChannel {
            enabled: false,
            shift_register: 1, // 初始值為 1
            mode: false,
            timer_period: 0,
            timer_value: 0,
            length_halt: false,
            length_counter: 0,
            envelope_enabled: true,
            envelope_loop: false,
            envelope_start: false,
            envelope_period: 0,
            envelope_divider: 0,
            envelope_decay: 0,
            constant_volume: 0,
        }
    }

    /// 寫入暫存器 $400C
    fn write_ctrl(&mut self, data: u8) {
        self.length_halt = data & 0x20 != 0;
        self.envelope_loop = data & 0x20 != 0;
        self.envelope_enabled = data & 0x10 == 0;
        self.envelope_period = data & 0x0F;
        self.constant_volume = data & 0x0F;
    }

    /// 寫入暫存器 $400E
    fn write_mode(&mut self, data: u8) {
        self.mode = data & 0x80 != 0;
        self.timer_period = NOISE_PERIOD_TABLE[(data & 0x0F) as usize];
    }

    /// 寫入暫存器 $400F
    fn write_length(&mut self, data: u8) {
        if self.enabled {
            self.length_counter = LENGTH_TABLE[(data >> 3) as usize];
        }
        self.envelope_start = true;
    }

    /// 定時器時鐘
    fn clock_timer(&mut self) {
        if self.timer_value == 0 {
            self.timer_value = self.timer_period.saturating_sub(1);
            // LFSR（線性反饋移位暫存器）
            let feedback_bit = if self.mode { 6 } else { 1 };
            let feedback = (self.shift_register & 1) ^ ((self.shift_register >> feedback_bit) & 1);
            self.shift_register >>= 1;
            self.shift_register |= feedback << 14;
        } else {
            self.timer_value -= 1;
        }
    }

    /// 包絡線時鐘
    fn clock_envelope(&mut self) {
        if self.envelope_start {
            self.envelope_start = false;
            self.envelope_decay = 15;
            self.envelope_divider = self.envelope_period;
        } else if self.envelope_divider == 0 {
            self.envelope_divider = self.envelope_period;
            if self.envelope_decay > 0 {
                self.envelope_decay -= 1;
            } else if self.envelope_loop {
                self.envelope_decay = 15;
            }
        } else {
            self.envelope_divider -= 1;
        }
    }

    /// 長度計數器時鐘
    fn clock_length(&mut self) {
        if !self.length_halt && self.length_counter > 0 {
            self.length_counter -= 1;
        }
    }

    /// 取得輸出值
    fn output(&self) -> u8 {
        if !self.enabled || self.length_counter == 0 || (self.shift_register & 1) != 0 {
            return 0;
        }
        self.volume()
    }

    fn output_at(&self, state: u16) -> u8 {
        if !self.enabled || self.length_counter == 0 || (state & 0x4000) != 0 {
            return 0;
        }
        self.volume()
    }

    fn volume(&self) -> u8 {
        if self.envelope_enabled {
            self.envelope_decay
        } else {
            self.constant_volume
        }
    }
}

// ===== DMC 聲道 =====

/// DMC 聲道（Delta Modulation Channel）
#[derive(Clone)]
struct DmcChannel {
    /// 是否啟用
    enabled: bool,
    /// IRQ 使能
    irq_enabled: bool,
    /// 循環旗標
    loop_flag: bool,
    /// 速率索引
    rate_index: u8,
    /// 定時器週期
    timer_period: u16,
    /// 定時器目前值
    timer_value: u16,
    /// 輸出值（7 位元）
    output_level: u8,
    /// 取樣位址
    sample_address: u16,
    /// 取樣長度
    sample_length: u16,
    /// 目前位址
    current_address: u16,
    /// 剩餘位元組數
    bytes_remaining: u16,
    /// 移位暫存器
    shift_register: u8,
    /// 剩餘位元數
    bits_remaining: u8,
    /// 取樣緩衝區
    sample_buffer: u8,
    /// 緩衝區是否有資料
    sample_buffer_empty: bool,
    /// 是否靜音（buffer 為空時設為 true）
    silence: bool,
    /// IRQ 旗標
    irq_flag: bool,
}

impl DmcChannel {
    fn new() -> Self {
        DmcChannel {
            enabled: false,
            irq_enabled: false,
            loop_flag: false,
            rate_index: 0,
            timer_period: DMC_RATE_TABLE[0] - 1,
            timer_value: 0,
            output_level: 0,
            sample_address: 0xC000,
            sample_length: 1,
            current_address: 0xC000,
            bytes_remaining: 0,
            shift_register: 0,
            bits_remaining: 8,
            sample_buffer: 0,
            sample_buffer_empty: true,
            silence: true,
            irq_flag: false,
        }
    }

    /// 寫入暫存器 $4010
    fn write_ctrl(&mut self, data: u8) {
        self.irq_enabled = data & 0x80 != 0;
        self.loop_flag = data & 0x40 != 0;
        self.rate_index = data & 0x0F;
        self.timer_period = DMC_RATE_TABLE[self.rate_index as usize] - 1;
        if !self.irq_enabled {
            self.irq_flag = false;
        }
    }

    /// 寫入暫存器 $4011（直接載入）
    fn write_direct_load(&mut self, data: u8) {
        self.output_level = data & 0x7F;
    }

    /// 寫入暫存器 $4012（取樣位址）
    fn write_sample_addr(&mut self, data: u8) {
        self.sample_address = 0xC000 + (data as u16 * 64);
    }

    /// 寫入暫存器 $4013（取樣長度）
    fn write_sample_length(&mut self, data: u8) {
        self.sample_length = (data as u16 * 16) + 1;
    }

    /// 重新開始
    fn restart(&mut self) {
        self.current_address = self.sample_address;
        self.bytes_remaining = self.sample_length;
    }

    /// 取得輸出值
    fn output(&self) -> u8 {
        self.output_level
    }
}

// ===== APU 主結構 =====

/// APU 結構體
#[derive(Clone)]
pub struct Apu {
    /// 脈衝波聲道 1
    pulse1: PulseChannel,
    /// 脈衝波聲道 2
    pulse2: PulseChannel,
    /// 三角波聲道
    triangle: TriangleChannel,
    /// 雜訊聲道
    noise: NoiseChannel,
    /// DMC 聲道
    dmc: DmcChannel,

    // 幀計數器
    /// 幀計數器模式（false=4步, true=5步）
    frame_mode: bool,
    /// 幀計數器步驟
    frame_step: u8,
    /// 幀計數器值
    frame_value: u16,
    /// 幀 IRQ 禁止
    frame_irq_inhibit: bool,
    /// 幀 IRQ 旗標
    frame_irq: bool,
    /// $4015 讀取後，下一個 APU cycle 才清除 frame IRQ status
    frame_irq_clear_pending: bool,
    /// $4015 讀取後立即解除 CPU IRQ line
    frame_irq_acknowledged: bool,
    /// 延遲套用的 $4017 frame counter 寫入
    pending_frame_counter_write: Option<(u8, u8)>,

    // 時序
    /// CPU 週期計數
    cycle: u64,
    /// FCEUmm 高品質音訊時間軸與各聲道的最後渲染位置
    fceumm_timeline: FceummRenderTimeline,
    /// 尚未送入 FIR 的 CPU-rate 固定點混音資料
    fceumm_wave_hi_input: Vec<i32>,
    /// FCEUmm Very High 44100 Hz 音訊管線
    fceumm_audio: FceummAudioPipeline,

    // 音頻輸出
    /// 取樣率
    sample_rate: f64,
    /// 取樣計數器（用於音頻降頻取樣）
    sample_counter: f64,
    /// 取樣間隔（每個取樣之間的 CPU 週期數）
    sample_interval: f64,
    /// 兩個輸出取樣點之間的混音累加值，用於降採樣前抗混疊
    sample_accumulator: f64,
    sample_accumulator_count: u32,
    /// 音頻輸出緩衝區
    pub audio_buffer: Vec<f32>,
    /// 緩衝區寫入位置
    buffer_write_pos: usize,

    // 濾波器（減少爆音和直流偏移）
    /// 類比濾波器狀態與依取樣率計算的係數
    filter_accumulator: f32,
    highpass_90_prev: f32,
    highpass_90_output: f32,
    highpass_440_prev: f32,
    highpass_440_output: f32,
    lowpass_coeff: f32,
    highpass_90_coeff: f32,
    highpass_440_coeff: f32,
    #[cfg(test)]
    test_fceumm_mixer: bool,
    #[cfg(test)]
    test_fceumm_filter: bool,
    #[cfg(test)]
    test_channel_mask: u8,
    #[cfg(test)]
    pub(crate) test_register_writes: Vec<(u64, u16, u8)>,

    /// DMC 記憶體讀取請求（需要由匯流排處理）
    pub dmc_read_request: Option<u16>,
    /// DMC 啟用後開始第一次 DMA 的延遲
    dmc_transfer_start_delay: u8,
    /// DMC 停用後清除剩餘資料的延遲
    dmc_disable_delay: u8,
}

impl Apu {
    /// 建立新的 APU 實例
    pub fn new() -> Self {
        Apu {
            pulse1: PulseChannel::new(1),
            pulse2: PulseChannel::new(2),
            triangle: TriangleChannel::new(),
            noise: NoiseChannel::new(),
            dmc: DmcChannel::new(),
            frame_mode: false,
            frame_step: 0,
            frame_value: 0,
            frame_irq_inhibit: false,
            frame_irq: false,
            frame_irq_clear_pending: false,
            frame_irq_acknowledged: false,
            pending_frame_counter_write: None,
            cycle: 0,
            fceumm_timeline: FceummRenderTimeline::new(),
            fceumm_wave_hi_input: Vec::with_capacity(32_000),
            fceumm_audio: FceummAudioPipeline::new_very_high_44100(),
            sample_rate: 44100.0,
            sample_counter: 0.0,
            sample_interval: CPU_CLOCK_RATE / 44100.0,
            sample_accumulator: 0.0,
            sample_accumulator_count: 0,
            audio_buffer: vec![0.0; AUDIO_BUFFER_SIZE],
            buffer_write_pos: 0,
            filter_accumulator: 0.0,
            highpass_90_prev: 0.0,
            highpass_90_output: 0.0,
            highpass_440_prev: 0.0,
            highpass_440_output: 0.0,
            lowpass_coeff: Self::lowpass_coeff(14_000.0, 44_100.0),
            highpass_90_coeff: Self::highpass_coeff(90.0, 44_100.0),
            highpass_440_coeff: Self::highpass_coeff(440.0, 44_100.0),
            #[cfg(test)]
            test_fceumm_mixer: false,
            #[cfg(test)]
            test_fceumm_filter: false,
            #[cfg(test)]
            test_channel_mask: 0,
            #[cfg(test)]
            test_register_writes: Vec::new(),
            dmc_read_request: None,
            dmc_transfer_start_delay: 0,
            dmc_disable_delay: 0,
        }
    }

    /// 重置 APU
    pub fn reset(&mut self) {
        self.pulse1 = PulseChannel::new(1);
        self.pulse2 = PulseChannel::new(2);
        self.triangle = TriangleChannel::new();
        self.noise = NoiseChannel::new();
        self.dmc = DmcChannel::new();
        self.frame_step = 0;
        self.frame_value = 0;
        self.frame_irq = false;
        self.frame_irq_clear_pending = false;
        self.frame_irq_acknowledged = false;
        self.pending_frame_counter_write = None;
        self.cycle = 0;
        self.fceumm_timeline = FceummRenderTimeline::new();
        self.fceumm_wave_hi_input.clear();
        self.fceumm_audio.reset();
        self.sample_counter = 0.0;
        self.sample_accumulator = 0.0;
        self.sample_accumulator_count = 0;
        self.buffer_write_pos = 0;
        self.filter_accumulator = 0.0;
        self.highpass_90_prev = 0.0;
        self.highpass_90_output = 0.0;
        self.highpass_440_prev = 0.0;
        self.highpass_440_output = 0.0;
        #[cfg(test)]
        {
            self.test_fceumm_filter = false;
            self.test_channel_mask = 0;
            self.test_register_writes.clear();
        }
        self.dmc_read_request = None;
        self.dmc_transfer_start_delay = 0;
        self.dmc_disable_delay = 0;
    }

    /// 設定取樣率
    pub fn set_sample_rate(&mut self, rate: f64) {
        let rate = rate.clamp(8_000.0, 192_000.0);
        self.sample_rate = rate;
        self.fceumm_timeline.finish_frame();
        self.fceumm_wave_hi_input.clear();
        self.fceumm_audio.reset();
        self.sample_interval = CPU_CLOCK_RATE / rate;
        self.lowpass_coeff = Self::lowpass_coeff(14_000.0, rate);
        self.highpass_90_coeff = Self::highpass_coeff(90.0, rate);
        self.highpass_440_coeff = Self::highpass_coeff(440.0, rate);
    }

    #[cfg(test)]
    pub(crate) fn set_test_filter_mode(&mut self, mode: &str) {
        self.test_fceumm_mixer = mode.contains("fceumm-mixer");
        self.test_fceumm_filter = mode.contains("fceumm-highpass");
        self.test_channel_mask = if mode.contains("only-pulse1") {
            0x01
        } else if mode.contains("only-pulse2") {
            0x02
        } else if mode.contains("only-triangle") {
            0x04
        } else if mode.contains("only-noise") {
            0x08
        } else if mode.contains("only-dmc") {
            0x10
        } else if mode.contains("without-pulse1") {
            0x1E
        } else if mode.contains("without-pulse2") {
            0x1D
        } else if mode.contains("without-triangle") {
            0x1B
        } else if mode.contains("without-noise") {
            0x17
        } else if mode.contains("without-dmc") {
            0x0F
        } else {
            0
        };
        if mode.contains("no-filters") {
            self.highpass_90_coeff = 1.0;
            self.highpass_440_coeff = 1.0;
            self.lowpass_coeff = 1.0;
        } else {
            if mode.contains("no-highpass") {
                self.highpass_90_coeff = 1.0;
                self.highpass_440_coeff = 1.0;
            } else if mode.contains("fceumm-highpass") {
                self.highpass_90_coeff = Self::highpass_coeff(94.0, self.sample_rate);
                self.highpass_440_coeff = Self::highpass_coeff(24.0, self.sample_rate);
            } else {
                if mode.contains("no-90") {
                    self.highpass_90_coeff = 1.0;
                }
                if mode.contains("no-440") {
                    self.highpass_440_coeff = 1.0;
                }
            }
            if mode.contains("no-lowpass") {
                self.lowpass_coeff = 1.0;
            }
        }
    }

    // ===== 暫存器讀寫 =====

    /// CPU 寫入 APU 暫存器（$4000-$4017）
    pub fn cpu_write(&mut self, addr: u16, data: u8) {
        self.flush_fceumm_register(addr);

        #[cfg(test)]
        if (0x4000..=0x4017).contains(&addr) {
            self.test_register_writes.push((self.cycle, addr, data));
        }

        match addr {
            // 脈衝波 1
            0x4000 => self.pulse1.write_ctrl(data),
            0x4001 => self.pulse1.write_sweep(data),
            0x4002 => self.pulse1.write_timer_lo(data),
            0x4003 => self.pulse1.write_length(data),
            // 脈衝波 2
            0x4004 => self.pulse2.write_ctrl(data),
            0x4005 => self.pulse2.write_sweep(data),
            0x4006 => self.pulse2.write_timer_lo(data),
            0x4007 => self.pulse2.write_length(data),
            // 三角波
            0x4008 => self.triangle.write_ctrl(data),
            0x400A => self.triangle.write_timer_lo(data),
            0x400B => self.triangle.write_length(data),
            // 雜訊
            0x400C => self.noise.write_ctrl(data),
            0x400E => self.noise.write_mode(data),
            0x400F => self.noise.write_length(data),
            // DMC
            0x4010 => self.dmc.write_ctrl(data),
            0x4011 => self.dmc.write_direct_load(data),
            0x4012 => self.dmc.write_sample_addr(data),
            0x4013 => self.dmc.write_sample_length(data),
            // 狀態暫存器
            0x4015 => {
                let dmc_enabled = data & 0x10 != 0;
                let was_dmc_enabled = self.dmc.enabled;
                self.pulse1.enabled = data & 0x01 != 0;
                self.pulse2.enabled = data & 0x02 != 0;
                self.triangle.enabled = data & 0x04 != 0;
                self.noise.enabled = data & 0x08 != 0;
                self.dmc.enabled = dmc_enabled;

                if !self.pulse1.enabled { self.pulse1.length_counter = 0; }
                if !self.pulse2.enabled { self.pulse2.length_counter = 0; }
                if !self.triangle.enabled { self.triangle.length_counter = 0; }
                if !self.noise.enabled { self.noise.length_counter = 0; }

                if dmc_enabled {
                    self.dmc_disable_delay = 0;
                    if self.dmc.bytes_remaining == 0 {
                        self.dmc.restart();
                        self.dmc_transfer_start_delay = if self.cycle & 1 == 0 { 2 } else { 3 };
                    }
                } else if was_dmc_enabled || self.dmc.bytes_remaining > 0 || self.dmc_read_request.is_some() {
                    if self.dmc_disable_delay == 0 {
                        self.dmc_disable_delay = if self.cycle & 1 == 0 { 2 } else { 3 };
                    }
                    self.dmc_transfer_start_delay = 0;
                } else {
                    self.dmc_read_request = None;
                }
                self.dmc.irq_flag = false;
            }
            // 幀計數器
            0x4017 => {
                let delay = if self.cycle & 1 == 0 { 3 } else { 4 };
                self.pending_frame_counter_write = Some((data, delay));
                self.frame_irq_inhibit = data & 0x40 != 0;
                if data & 0x40 != 0 {
                    self.frame_irq = false;
                    self.frame_irq_clear_pending = false;
                    self.frame_irq_acknowledged = false;
                }
            }
            _ => {}
        }

        match addr {
            0x4003 => self.fceumm_timeline.reset_pulse_duty(0),
            0x4007 => self.fceumm_timeline.reset_pulse_duty(1),
            _ => {}
        }
    }

    fn flush_fceumm_register(&mut self, addr: u16) {
        if !self.uses_fceumm_audio() {
            return;
        }

        let channel = match addr {
            0x4000..=0x4003 => Some(0),
            0x4004..=0x4007 => Some(1),
            0x4008..=0x400B => Some(2),
            0x400C..=0x400F => Some(3),
            0x4010..=0x4013 => Some(4),
            0x4015 | 0x4017 => None,
            _ => return,
        };

        if let Some(channel) = channel {
            let state = self.fceumm_channel_state(channel);
            self.fceumm_timeline.flush_channel_for_current_cycle(
                channel,
                &mut self.fceumm_wave_hi_input,
                state,
            );
        } else {
            self.flush_fceumm_all_channels_for_current_cycle();
        }
    }

    fn fceumm_channel_state(&self, channel: usize) -> FceummChannelState {
        match channel {
            0 | 1 => {
                let pulse = if channel == 0 { &self.pulse1 } else { &self.pulse2 };
                #[cfg(test)]
                let volume = if self.test_channel_mask != 0
                    && self.test_channel_mask & (1 << channel) == 0
                {
                    0
                } else {
                    pulse.volume()
                };
                #[cfg(not(test))]
                let volume = pulse.volume();
                FceummChannelState::Pulse {
                    active: pulse.length_counter > 0 && !pulse.is_muted(),
                    timer_period: pulse.timer_period,
                    duty: pulse.duty,
                    volume,
                }
            }
            2 => {
                #[cfg(test)]
                let volume = if self.test_channel_mask != 0
                    && self.test_channel_mask & 0x04 == 0
                {
                    0
                } else {
                    256
                };
                #[cfg(not(test))]
                let volume = 256;
                FceummChannelState::Triangle {
                    active: self.triangle.length_counter > 0
                        && self.triangle.linear_counter > 0,
                    timer_period: self.triangle.timer_period,
                    volume,
                }
            }
            3 => {
                #[cfg(test)]
                let volume = if self.test_channel_mask != 0
                    && self.test_channel_mask & 0x08 == 0
                {
                    0
                } else {
                    self.noise.volume()
                };
                #[cfg(not(test))]
                let volume = self.noise.volume();
                FceummChannelState::Noise {
                    active: self.noise.length_counter > 0,
                    short_mode: self.noise.mode,
                    timer_period: self.noise.timer_period,
                    volume,
                }
            }
            4 => {
                #[cfg(test)]
                let volume = if self.test_channel_mask != 0
                    && self.test_channel_mask & 0x10 == 0
                {
                    0
                } else {
                    256
                };
                #[cfg(not(test))]
                let volume = 256;
                FceummChannelState::Dmc {
                    output_level: self.dmc.output_level,
                    volume,
                }
            }
            _ => unreachable!("invalid FCEUmm channel index"),
        }
    }

    fn flush_fceumm_all_channels_for_current_cycle(&mut self) {
        for channel in 0..5 {
            let state = self.fceumm_channel_state(channel);
            self.fceumm_timeline.flush_channel_for_current_cycle(
                channel,
                &mut self.fceumm_wave_hi_input,
                state,
            );
        }
    }

    fn flush_fceumm_all_channels(&mut self) {
        if !self.uses_fceumm_audio() {
            return;
        }
        for channel in 0..5 {
            let state = self.fceumm_channel_state(channel);
            self.fceumm_timeline.flush_channel(
                channel,
                &mut self.fceumm_wave_hi_input,
                state,
            );
        }
    }

    /// CPU 讀取 APU 狀態暫存器（$4015）
    pub fn cpu_read(&mut self) -> u8 {
        let mut status = 0u8;

        if self.pulse1.length_counter > 0 { status |= 0x01; }
        if self.pulse2.length_counter > 0 { status |= 0x02; }
        if self.triangle.length_counter > 0 { status |= 0x04; }
        if self.noise.length_counter > 0 { status |= 0x08; }
        if self.dmc.bytes_remaining > 0 { status |= 0x10; }
        if self.frame_irq {
            status |= 0x40;
            self.frame_irq_clear_pending = true;
            self.frame_irq_acknowledged = true;
        }
        if self.dmc.irq_flag { status |= 0x80; }

        status
    }

    /// 提供 DMC 記憶體讀取資料
    pub fn dmc_provide_sample(&mut self, data: u8) {
        if self.dmc_read_request.take().is_none() {
            return;
        }

        self.dmc.sample_buffer = data;
        self.dmc.sample_buffer_empty = false;
        self.dmc.current_address = if self.dmc.current_address == 0xFFFF {
            0x8000
        } else {
            self.dmc.current_address + 1
        };
        self.dmc.bytes_remaining = self.dmc.bytes_remaining.saturating_sub(1);

        if self.dmc.bytes_remaining == 0 {
            if self.dmc.loop_flag {
                self.dmc.restart();
            } else if self.dmc.irq_enabled {
                self.dmc.irq_flag = true;
            }
        }
    }

    // ===== 主要時鐘方法 =====

    /// APU 時鐘（每個 CPU 週期呼叫一次）
    pub fn clock(&mut self) {
        let use_fceumm_audio = self.uses_fceumm_audio();

        if self.frame_irq_clear_pending {
            self.frame_irq = false;
            self.frame_irq_clear_pending = false;
            self.frame_irq_acknowledged = false;
        }

        // 三角波每個 CPU 週期都計時
        self.triangle.clock_timer();

        // Pulse timers use the half-rate APU clock; the noise timer uses the CPU clock.
        if self.cycle % 2 == 0 {
            self.pulse1.clock_timer();
            self.pulse2.clock_timer();
        }
        self.noise.clock_timer();

        self.clock_dmc();
        self.clock_dmc_control_delays();

        // 幀計數器
        self.clock_frame_counter();

        if !use_fceumm_audio {
            // 在 CPU 時脈域先積分，再降採樣，避免高頻方波直接抽樣造成混疊。
            self.sample_accumulator += self.mix() as f64;
            self.sample_accumulator_count += 1;
            self.sample_counter += 1.0;
            if self.sample_counter >= self.sample_interval {
                self.sample_counter -= self.sample_interval;
                self.output_sample();
            }
        }

        self.cycle += 1;
        if use_fceumm_audio {
            self.fceumm_timeline.advance();
        }
        self.clock_pending_frame_counter_write();
    }

    fn uses_fceumm_audio(&self) -> bool {
        (self.sample_rate - 44_100.0).abs() < 0.5
    }

    /// 完成一幀的 CPU-rate 混音，保留 FIR 與後級濾波器的跨幀狀態。
    pub fn end_frame(&mut self) {
        if !self.uses_fceumm_audio() {
            return;
        }

        self.flush_fceumm_all_channels();
        let input = std::mem::take(&mut self.fceumm_wave_hi_input);
        if input.is_empty() {
            self.fceumm_timeline.finish_frame();
            return;
        }

        let mut mixed_input = input;
        fceumm_wave_hi_flush(&mut mixed_input);
        let output = self.fceumm_audio.process(&mixed_input);
        for sample in output {
            if self.buffer_write_pos >= self.audio_buffer.len() {
                break;
            }
            self.audio_buffer[self.buffer_write_pos] = sample as f32 / 32_768.0;
            self.buffer_write_pos += 1;
        }
        self.fceumm_timeline.finish_frame();
    }

    fn clock_dmc_control_delays(&mut self) {
        if self.dmc_disable_delay > 0 {
            self.dmc_disable_delay -= 1;
            if self.dmc_disable_delay == 0 {
                self.dmc.bytes_remaining = 0;
                self.dmc_read_request = None;
            }
        }

        if self.dmc_transfer_start_delay > 0 {
            self.dmc_transfer_start_delay -= 1;
            if self.dmc_transfer_start_delay == 0 {
                self.fetch_dmc_sample();
            }
        }
    }

    fn clock_pending_frame_counter_write(&mut self) {
        if let Some((data, delay)) = self.pending_frame_counter_write {
            if delay > 1 {
                self.pending_frame_counter_write = Some((data, delay - 1));
                return;
            }

            self.pending_frame_counter_write = None;
            self.frame_mode = data & 0x80 != 0;
            self.frame_irq_inhibit = data & 0x40 != 0;
            if self.frame_irq_inhibit {
                self.frame_irq = false;
                self.frame_irq_clear_pending = false;
                self.frame_irq_acknowledged = false;
            }
            self.frame_step = 0;
            self.frame_value = 0;
            if self.frame_mode {
                self.clock_quarter_frame();
                self.clock_half_frame();
            }
        }
    }

    /// DMC 時鐘
    /// 參考 NESdev wiki 和 TS 版本的正確 DMC 流程：
    /// 1. 定時器倒數
    /// 2. 定時器歸零時：修改 output level → shift → bits 減到 0 → 從 buffer 載入 → fetch
    fn clock_dmc(&mut self) {
        if self.dmc.timer_value == 0 {
            self.dmc.timer_value = self.dmc.timer_period;

            // Output cycle: 不管 enabled 狀態，只要不是 silence 就更新 output
            if !self.dmc.silence {
                if self.uses_fceumm_audio() {
                    let state = self.fceumm_channel_state(4);
                    self.fceumm_timeline.flush_channel_for_current_cycle(
                        4,
                        &mut self.fceumm_wave_hi_input,
                        state,
                    );
                }
                if self.dmc.shift_register & 1 != 0 {
                    if self.dmc.output_level <= 125 {
                        self.dmc.output_level += 2;
                    }
                } else if self.dmc.output_level >= 2 {
                    self.dmc.output_level -= 2;
                }
            }

            self.dmc.shift_register >>= 1;
            self.dmc.bits_remaining -= 1;

            // 需要新的取樣位元組
            if self.dmc.bits_remaining == 0 {
                self.dmc.bits_remaining = 8;
                // 開始新的輸出週期
                if self.dmc.sample_buffer_empty {
                    self.dmc.silence = true;
                } else {
                    self.dmc.silence = false;
                    self.dmc.shift_register = self.dmc.sample_buffer;
                    self.dmc.sample_buffer_empty = true;
                    // 嘗試獲取新的取樣
                    self.fetch_dmc_sample();
                }
            }
        } else {
            self.dmc.timer_value -= 1;
        }
    }

    /// 從記憶體獲取 DMC 取樣
    fn fetch_dmc_sample(&mut self) {
        if self.dmc.bytes_remaining > 0 && self.dmc.sample_buffer_empty && self.dmc_read_request.is_none() {
            self.dmc_read_request = Some(self.dmc.current_address);
        }
    }

    /// 幀計數器時鐘
    fn clock_frame_counter(&mut self) {
        // 幀計數器使用 CPU 週期計數
        self.frame_value += 1;

        if !self.frame_mode {
            // 4 步模式
            match self.frame_value {
                7457 => {
                    self.clock_quarter_frame();
                }
                14913 => {
                    self.clock_quarter_frame();
                    self.clock_half_frame();
                }
                22371 => {
                    self.clock_quarter_frame();
                }
                29828 => {
                    if !self.frame_irq_inhibit {
                        self.frame_irq = true;
                        self.frame_irq_acknowledged = false;
                    }
                }
                29829 => {
                    self.clock_quarter_frame();
                    self.clock_half_frame();
                    self.frame_value = 0;
                }
                _ => {}
            }
        } else {
            // 5 步模式（無 IRQ）
            match self.frame_value {
                7457 => {
                    self.clock_quarter_frame();
                }
                14913 => {
                    self.clock_quarter_frame();
                    self.clock_half_frame();
                }
                22371 => {
                    self.clock_quarter_frame();
                }
                37281 => {
                    self.clock_quarter_frame();
                    self.clock_half_frame();
                    self.frame_value = 0;
                }
                _ => {}
            }
        }
    }

    /// 四分之一幀時鐘（包絡線和線性計數器）
    fn clock_quarter_frame(&mut self) {
        if self.uses_fceumm_audio() {
            self.flush_fceumm_all_channels_for_current_cycle();
        }
        self.pulse1.clock_envelope();
        self.pulse2.clock_envelope();
        self.triangle.clock_linear_counter();
        self.noise.clock_envelope();
    }

    /// 二分之一幀時鐘（長度計數器和掃頻）
    fn clock_half_frame(&mut self) {
        if self.uses_fceumm_audio() {
            self.flush_fceumm_all_channels_for_current_cycle();
        }
        self.pulse1.clock_length();
        self.pulse1.clock_sweep();
        self.pulse2.clock_length();
        self.pulse2.clock_sweep();
        self.triangle.clock_length();
        self.noise.clock_length();
    }

    // ===== 混音與輸出 =====

    fn lowpass_coeff(cutoff: f64, sample_rate: f64) -> f32 {
        (1.0 - (-2.0 * std::f64::consts::PI * cutoff / sample_rate).exp()) as f32
    }

    fn highpass_coeff(cutoff: f64, sample_rate: f64) -> f32 {
        (-2.0 * std::f64::consts::PI * cutoff / sample_rate).exp() as f32
    }

    /// 輸出一個音頻取樣到緩衝區
    fn output_sample(&mut self) {
        let count = self.sample_accumulator_count.max(1) as f64;
        let mut sample = (self.sample_accumulator / count) as f32;
        self.sample_accumulator = 0.0;
        self.sample_accumulator_count = 0;

        #[cfg(test)]
        let use_fceumm_filter = self.test_fceumm_filter;
        #[cfg(not(test))]
        let use_fceumm_filter = false;

        if use_fceumm_filter {
            let input = sample;
            let first_stage = 94.0 / self.sample_rate as f32;
            let second_stage = 24.0 / self.sample_rate as f32;
            self.highpass_90_output +=
                (input - self.highpass_90_output) * first_stage;
            self.highpass_440_output +=
                (input - self.highpass_90_output - self.highpass_440_output) * second_stage;
            sample = self.highpass_90_output - input + self.highpass_440_output;
        } else {
            let input = sample;
            self.highpass_90_output = self.highpass_90_coeff *
                (self.highpass_90_output + input - self.highpass_90_prev);
            self.highpass_90_prev = input;

            let input = self.highpass_90_output;
            self.highpass_440_output = self.highpass_440_coeff *
                (self.highpass_440_output + input - self.highpass_440_prev);
            self.highpass_440_prev = input;
            sample = self.highpass_440_output;
        }

        self.filter_accumulator += self.lowpass_coeff * (sample - self.filter_accumulator);
        sample = self.filter_accumulator;

        // 保留 headroom，避免額外增益與削波改變 NESdev mixer 的聲道比例。
        sample *= 0.95;

        // 最終限制在 [-1, 1] 範圍
        sample = sample.max(-1.0).min(1.0);

        if self.buffer_write_pos < self.audio_buffer.len() {
            self.audio_buffer[self.buffer_write_pos] = sample;
            self.buffer_write_pos += 1;
        }
    }

    /// 混音器（使用 NESdev 非線性近似公式）
    /// 參考：https://www.nesdev.org/wiki/APU_Mixer
    fn mix(&self) -> f32 {
        let mut p1 = self.pulse1.output() as f32;
        let mut p2 = self.pulse2.output() as f32;
        let mut t = self.triangle.output() as f32;
        let mut n = self.noise.output() as f32;
        let mut d = self.dmc.output() as f32;

        #[cfg(test)]
        if self.test_channel_mask != 0 {
            if self.test_channel_mask & 0x01 == 0 { p1 = 0.0; }
            if self.test_channel_mask & 0x02 == 0 { p2 = 0.0; }
            if self.test_channel_mask & 0x04 == 0 { t = 0.0; }
            if self.test_channel_mask & 0x08 == 0 { n = 0.0; }
            if self.test_channel_mask & 0x10 == 0 { d = 0.0; }
        }

        #[cfg(test)]
        let use_fceumm_mixer = self.test_fceumm_mixer;
        #[cfg(not(test))]
        let use_fceumm_mixer = false;

        // 脈衝波混音（非線性）
        let pulse_sum = p1 + p2;
        let pulse_out = if pulse_sum > 0.0 && use_fceumm_mixer {
            95.52 / ((8128.0 / pulse_sum) + 100.0)
        } else if pulse_sum > 0.0 {
            95.88 / ((8128.0 / pulse_sum) + 100.0)
        } else {
            0.0
        };

        // TND 混音（非線性）
        let tnd_sum = if use_fceumm_mixer {
            (t * 3.0 + n * 2.0 + d) / 24329.0
        } else {
            t / 8227.0 + n / 12241.0 + d / 22638.0
        };
        let tnd_out = if tnd_sum > 0.0 {
            if use_fceumm_mixer {
                163.67 / ((1.0 / tnd_sum) + 100.0)
            } else {
                159.79 / ((1.0 / tnd_sum) + 100.0)
            }
        } else {
            0.0
        };

        // 混音輸出範圍約 0.0 ~ 1.0
        pulse_out + tnd_out
    }

    /// 取得音頻緩衝區指標
    pub fn get_buffer_ptr(&self) -> *const f32 {
        self.audio_buffer.as_ptr()
    }

    /// 取得可用的取樣數
    pub fn get_available_samples(&self) -> usize {
        self.buffer_write_pos
    }

    /// 消費音頻取樣（回傳取樣數並重置寫入位置）
    pub fn consume_samples(&mut self) -> usize {
        let count = self.buffer_write_pos;
        self.buffer_write_pos = 0;
        count
    }

    /// 檢查是否有 IRQ 待處理
    pub fn check_irq(&self) -> bool {
        (self.frame_irq && !self.frame_irq_acknowledged) || self.dmc.irq_flag
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mirror_noise_state(state: u16) -> u16 {
        let mut mirrored = 0;
        for bit in 0..15 {
            mirrored |= ((state >> bit) & 1) << (14 - bit);
        }
        mirrored
    }

    fn fceumm_noise_step(state: u16, short_mode: bool) -> u16 {
        let tap = if short_mode { 8 } else { 13 };
        let feedback = ((state >> 14) & 1) ^ ((state >> tap) & 1);
        ((state << 1) & 0x7FFF) | feedback
    }

    #[test]
    fn dmc_timer_advances_on_every_cpu_cycle() {
        let mut apu = Apu::new();
        apu.dmc.timer_value = 1;
        apu.dmc.bits_remaining = 8;

        apu.clock();
        assert_eq!(apu.dmc.timer_value, 0);
        assert_eq!(apu.dmc.bits_remaining, 8);

        apu.clock();
        assert_eq!(apu.dmc.timer_value, DMC_RATE_TABLE[0] - 1);
        assert_eq!(apu.dmc.bits_remaining, 7);
    }

    #[test]
    fn dmc_rate_table_produces_exact_cpu_cycle_intervals() {
        let mut apu = Apu::new();

        for (index, &rate) in DMC_RATE_TABLE.iter().enumerate() {
            apu.dmc.write_ctrl(index as u8);
            assert_eq!(apu.dmc.timer_period, rate - 1);
        }

        apu.dmc.timer_value = 0;
        apu.dmc.bits_remaining = 8;
        apu.clock();

        for _ in 0..(DMC_RATE_TABLE[15] - 1) {
            apu.clock();
        }
        assert_eq!(apu.dmc.bits_remaining, 7);

        apu.clock();
        assert_eq!(apu.dmc.bits_remaining, 6);
    }

    #[test]
    fn dmc_status_enable_restart_and_disable() {
        let mut apu = Apu::new();
        apu.cpu_write(0x4012, 0x02);
        apu.cpu_write(0x4013, 0x01);
        apu.cpu_write(0x4015, 0x10);

        assert!(apu.dmc.enabled);
        assert_eq!(apu.dmc_read_request, None);
        assert_eq!(apu.dmc.bytes_remaining, 17);

        apu.clock();
        assert_eq!(apu.dmc_read_request, None);
        apu.clock();
        assert_eq!(apu.dmc_read_request, Some(0xC080));
        assert_eq!(apu.dmc.current_address, 0xC080);
        assert_eq!(apu.dmc.bytes_remaining, 17);

        apu.dmc_provide_sample(0xA5);
        assert_eq!(apu.dmc.current_address, 0xC081);
        assert_eq!(apu.dmc.bytes_remaining, 16);
        apu.cpu_write(0x4015, 0x00);

        assert!(!apu.dmc.enabled);
        assert_eq!(apu.dmc.bytes_remaining, 16);
        apu.clock();
        assert_eq!(apu.dmc.bytes_remaining, 16);
        apu.clock();
        assert_eq!(apu.dmc.bytes_remaining, 0);
        assert_eq!(apu.cpu_read() & 0x10, 0);
    }

    #[test]
    fn dmc_enable_delay_is_three_cycles_after_odd_apu_cycle() {
        let mut apu = Apu::new();
        apu.cycle = 1;
        apu.cpu_write(0x4015, 0x10);

        assert_eq!(apu.dmc_transfer_start_delay, 3);
        assert_eq!(apu.dmc_read_request, None);

        apu.clock();
        apu.clock();
        assert_eq!(apu.dmc_read_request, None);

        apu.clock();
        assert_eq!(apu.dmc_read_request, Some(0xC000));
    }

    #[test]
    fn dmc_completion_sets_irq_and_wraps_address() {
        let mut apu = Apu::new();
        apu.dmc.write_ctrl(0x80);
        apu.dmc.sample_length = 1;
        apu.dmc.current_address = 0xFFFF;
        apu.dmc.bytes_remaining = 1;

        apu.fetch_dmc_sample();

        assert_eq!(apu.dmc_read_request, Some(0xFFFF));
        assert_eq!(apu.dmc.current_address, 0xFFFF);
        assert_eq!(apu.dmc.bytes_remaining, 1);
        assert!(!apu.dmc.irq_flag);

        apu.dmc_provide_sample(0xA5);

        assert_eq!(apu.dmc.current_address, 0x8000);
        assert_eq!(apu.dmc.bytes_remaining, 0);
        assert!(apu.dmc.irq_flag);
    }

    #[test]
    fn dmc_loop_reloads_after_the_last_sample_byte() {
        let mut apu = Apu::new();
        apu.dmc.write_ctrl(0x40);
        apu.dmc.sample_length = 1;
        apu.dmc.current_address = 0xC000;
        apu.dmc.bytes_remaining = 1;

        apu.fetch_dmc_sample();
        assert_eq!(apu.dmc_read_request, Some(0xC000));
        assert_eq!(apu.dmc.bytes_remaining, 1);
        assert_eq!(apu.dmc.current_address, 0xC000);

        apu.dmc_provide_sample(0x01);
        apu.dmc.timer_value = 0;
        apu.dmc.bits_remaining = 1;
        apu.dmc.silence = false;
        apu.clock();

        assert_eq!(apu.dmc_read_request, Some(0xC000));
        assert_eq!(apu.dmc.bytes_remaining, 1);
        assert_eq!(apu.dmc.current_address, 0xC000);
        assert!(!apu.dmc.irq_flag);
    }

    #[test]
    fn dmc_empty_buffer_enters_silence_without_changing_output_level() {
        let mut apu = Apu::new();
        apu.dmc.timer_value = 0;
        apu.dmc.bits_remaining = 1;
        apu.dmc.shift_register = 1;
        apu.dmc.output_level = 64;
        apu.dmc.sample_buffer_empty = true;
        apu.dmc.silence = false;

        apu.clock();
        assert_eq!(apu.dmc.output_level, 66);
        assert!(apu.dmc.silence);

        apu.dmc.timer_value = 0;
        apu.clock();
        assert_eq!(apu.dmc.output_level, 66);
        assert!(apu.dmc.silence);
    }

    #[test]
    fn fceumm_register_write_renders_pending_cycle_before_mutation() {
        let mut apu = Apu::new();
        apu.pulse1.enabled = true;
        apu.pulse1.length_counter = 1;
        apu.pulse1.envelope_enabled = false;
        apu.pulse1.constant_volume = 15;
        apu.pulse1.timer_period = 20;
        apu.pulse1.timer_value = 20;
        apu.pulse1.duty_pos = 7;
        apu.fceumm_timeline.set_pulse_duty_for_test(0, 0);

        apu.clock();
        apu.cpu_write(0x4015, 0x00);

        let expected = (15i32 << 24) + (45i32 << 16);
        assert_eq!(apu.fceumm_wave_hi_input, [expected, expected]);

        apu.clock();

        assert_eq!(apu.fceumm_wave_hi_input, [expected, expected]);
    }

    #[test]
    fn frame_counter_four_step_uses_ntsc_cpu_boundaries() {
        let mut apu = Apu::new();
        apu.pulse1.envelope_start = true;
        apu.pulse1.length_counter = 2;

        for _ in 0..7456 {
            apu.clock();
        }
        assert_eq!(apu.frame_value, 7456);
        assert!(apu.pulse1.envelope_start);
        assert_eq!(apu.pulse1.length_counter, 2);

        apu.clock();
        assert_eq!(apu.frame_value, 7457);
        assert!(!apu.pulse1.envelope_start);
        assert_eq!(apu.pulse1.length_counter, 2);

        for _ in 7457..14913 {
            apu.clock();
        }
        assert_eq!(apu.pulse1.length_counter, 1);

        for _ in 14913..22371 {
            apu.clock();
        }
        assert_eq!(apu.pulse1.length_counter, 1);

        for _ in 22371..29828 {
            apu.clock();
        }
        assert_eq!(apu.frame_value, 29828);
        assert!(apu.frame_irq);

        apu.clock();
        assert_eq!(apu.frame_value, 0);
        assert_eq!(apu.pulse1.length_counter, 0);
        assert!(apu.frame_irq);
    }

    #[test]
    fn frame_counter_irq_inhibit_applies_before_mode_write_delay_finishes() {
        let mut apu = Apu::new();
        apu.frame_value = 29827;
        apu.frame_irq_inhibit = true;

        apu.cpu_write(0x4017, 0x00);
        apu.clock();

        assert_eq!(apu.frame_value, 29828);
        assert!(apu.frame_irq);
    }

    #[test]
    fn frame_irq_line_acknowledges_before_status_clears() {
        let mut apu = Apu::new();
        apu.frame_irq = true;

        assert_ne!(apu.cpu_read() & 0x40, 0);
        assert!(!apu.check_irq());
        assert_ne!(apu.cpu_read() & 0x40, 0);

        apu.clock();

        assert_eq!(apu.cpu_read() & 0x40, 0);
    }

    #[test]
    fn frame_counter_final_half_frame_clocks_after_irq_window() {
        let mut apu = Apu::new();
        apu.pulse1.length_counter = 2;

        for _ in 0..29828 {
            apu.clock();
        }

        assert!(apu.frame_irq);
        assert_eq!(apu.pulse1.length_counter, 1);

        apu.clock();

        assert_eq!(apu.frame_value, 0);
        assert_eq!(apu.pulse1.length_counter, 0);
    }

    #[test]
    fn frame_counter_five_step_skips_fourth_step() {
        let mut apu = Apu::new();
        apu.frame_mode = true;
        apu.pulse1.envelope_start = true;
        apu.pulse1.length_counter = 2;

        for _ in 0..7457 {
            apu.clock();
        }
        assert_eq!(apu.pulse1.envelope_decay, 15);

        for _ in 7457..14913 {
            apu.clock();
        }
        assert_eq!(apu.pulse1.length_counter, 1);

        for _ in 14913..22371 {
            apu.clock();
        }
        assert_eq!(apu.pulse1.envelope_decay, 13);

        for _ in 22371..29829 {
            apu.clock();
        }
        assert_eq!(apu.frame_value, 29829);
        assert_eq!(apu.pulse1.length_counter, 1);
        assert_eq!(apu.pulse1.envelope_decay, 13);

        for _ in 29829..37281 {
            apu.clock();
        }
        assert_eq!(apu.frame_value, 0);
        assert_eq!(apu.pulse1.length_counter, 0);
        assert_eq!(apu.pulse1.envelope_decay, 12);
        assert!(!apu.frame_irq);
    }

    #[test]
    fn frame_counter_write_delays_and_clocks_five_step_mode() {
        let mut apu = Apu::new();
        apu.pulse1.envelope_start = true;
        apu.pulse1.length_counter = 2;

        apu.cpu_write(0x4017, 0x80);
        assert!(!apu.frame_mode);

        apu.clock();
        apu.clock();
        assert!(!apu.frame_mode);

        apu.clock();
        assert!(apu.frame_mode);
        assert!(!apu.pulse1.envelope_start);
        assert_eq!(apu.pulse1.length_counter, 1);
    }

    #[test]
    fn frame_counter_write_uses_four_cycle_delay_after_odd_apu_cycle() {
        let mut apu = Apu::new();
        apu.cycle = 1;

        apu.cpu_write(0x4017, 0x80);
        for _ in 0..3 {
            apu.clock();
            assert!(!apu.frame_mode);
        }

        apu.clock();
        assert!(apu.frame_mode);
    }

    #[test]
    fn pulse_duty_phase_matches_nes_after_length_write() {
        let expected = [
            [0, 1, 0, 0, 0, 0, 0, 0],
            [0, 1, 1, 0, 0, 0, 0, 0],
            [0, 1, 1, 1, 1, 0, 0, 0],
            [1, 0, 0, 1, 1, 1, 1, 1],
        ];

        for (duty, pattern) in expected.iter().enumerate() {
            let mut pulse = PulseChannel::new(1);
            pulse.enabled = true;
            pulse.length_counter = 1;
            pulse.envelope_enabled = false;
            pulse.constant_volume = 15;
            pulse.timer_period = 8;
            pulse.timer_value = 0;
            pulse.duty = duty as u8;
            pulse.duty_pos = 3;
            pulse.write_length(0);

            let mut output = [pulse.output(); 8];
            for sample in output.iter_mut().skip(1) {
                pulse.timer_value = 0;
                pulse.clock_timer();
                *sample = pulse.output();
            }

            let expected_output = pattern.map(|value| value * 15);
            assert_eq!(output, expected_output);
        }
    }

    #[test]
    fn pulse_one_negative_sweep_with_zero_shift_is_not_muted() {
        let mut pulse = PulseChannel::new(1);
        pulse.enabled = true;
        pulse.length_counter = 1;
        pulse.envelope_enabled = false;
        pulse.constant_volume = 15;
        pulse.duty = 2;
        pulse.duty_pos = 4;
        pulse.timer_period = 0x0A9;
        pulse.sweep_negate = true;
        pulse.sweep_shift = 0;

        assert_eq!(pulse.output(), 15);
    }

    #[test]
    fn pulse_timer_matches_fceumm_cpu_cycle_period() {
        let mut pulse = PulseChannel::new(1);
        pulse.timer_period = 5;

        let mut edge_cycles = Vec::new();
        for cpu_cycle in 0..=24 {
            if cpu_cycle % 2 == 0 {
                let previous_position = pulse.duty_pos;
                pulse.clock_timer();
                if pulse.duty_pos != previous_position {
                    edge_cycles.push(cpu_cycle);
                }
            }
        }

        assert_eq!(edge_cycles, [0, 12, 24]);
    }

    #[test]
    fn triangle_timer_matches_fceumm_cpu_cycle_period() {
        let mut triangle = TriangleChannel::new();
        triangle.timer_period = 5;
        triangle.length_counter = 1;
        triangle.linear_counter = 1;

        let mut edge_cycles = Vec::new();
        for cpu_cycle in 0..=12 {
            let previous_position = triangle.sequence_pos;
            triangle.clock_timer();
            if triangle.sequence_pos != previous_position {
                edge_cycles.push(cpu_cycle);
            }
        }

        assert_eq!(edge_cycles, [0, 6, 12]);
    }

    #[test]
    fn noise_timer_matches_fceumm_cpu_cycle_period() {
        let mut apu = Apu::new();
        apu.noise.timer_period = 4;
        apu.noise.shift_register = 1;

        let mut edge_cycles = Vec::new();
        for cpu_cycle in 0..=12 {
            let previous_state = apu.noise.shift_register;
            apu.clock();
            if apu.noise.shift_register != previous_state {
                edge_cycles.push(cpu_cycle);
            }
        }

        assert_eq!(edge_cycles, [0, 4, 8, 12]);
    }

    #[test]
    fn noise_lfsr_matches_fceumm_mirrored_sequence() {
        let mut noise = NoiseChannel::new();
        let mut states = vec![noise.shift_register];

        for _ in 0..4 {
            noise.clock_timer();
            states.push(noise.shift_register);
        }

        assert_eq!(states, [1, 0x4000, 0x2000, 0x1000, 0x0800]);
    }

    #[test]
    fn noise_output_bits_match_fceumm_after_bit_mirror() {
        for short_mode in [false, true] {
            let mut noise = NoiseChannel::new();
            noise.mode = short_mode;
            noise.timer_period = 1;
            noise.timer_value = 0;

            let mut fceumm_state = mirror_noise_state(noise.shift_register);
            for _ in 0..128 {
                assert_eq!(
                    noise.shift_register & 1 == 0,
                    fceumm_state & 0x4000 == 0,
                    "short_mode={short_mode}"
                );
                noise.clock_timer();
                fceumm_state = fceumm_noise_step(fceumm_state, short_mode);
            }
        }
    }

    #[test]
    fn noise_timer_table_matches_fceumm_timestamp_intervals() {
        for &period in NOISE_PERIOD_TABLE.iter() {
            let mut noise = NoiseChannel::new();
            noise.timer_period = period;
            noise.timer_value = 0;

            let mut edge_cycles = Vec::new();
            for cpu_cycle in 0..=(period * 2) {
                let previous_state = noise.shift_register;
                noise.clock_timer();
                if noise.shift_register != previous_state {
                    edge_cycles.push(cpu_cycle);
                }
            }

            assert_eq!(edge_cycles, [0, period, period * 2]);
        }
    }

    #[test]
    fn envelope_decay_matches_fceumm_speed_plus_one_divider() {
        let mut pulse = PulseChannel::new(1);
        pulse.envelope_period = 2;
        pulse.envelope_start = true;

        pulse.clock_envelope();
        assert_eq!(pulse.envelope_decay, 15);

        pulse.clock_envelope();
        pulse.clock_envelope();
        assert_eq!(pulse.envelope_decay, 15);

        pulse.clock_envelope();
        assert_eq!(pulse.envelope_decay, 14);
    }
}
