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
            self.duty_pos = (self.duty_pos + 1) % 8;
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
        self.timer_period < 8 || self.sweep_target_period() > 0x7FF
    }

    /// 取得輸出值
    fn output(&self) -> u8 {
        if !self.enabled || self.length_counter == 0 || self.is_muted() {
            return 0;
        }

        if DUTY_TABLE[self.duty as usize][self.duty_pos as usize] == 0 {
            return 0;
        }

        if self.envelope_enabled {
            self.envelope_decay
        } else {
            self.constant_volume
        }
    }
}

// ===== 三角波聲道 =====

/// 三角波聲道（Triangle）
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
            self.timer_value = self.timer_period;
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
        if self.envelope_enabled {
            self.envelope_decay
        } else {
            self.constant_volume
        }
    }
}

// ===== DMC 聲道 =====

/// DMC 聲道（Delta Modulation Channel）
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
            timer_period: DMC_RATE_TABLE[0],
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
        self.timer_period = DMC_RATE_TABLE[self.rate_index as usize];
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

    // 時序
    /// CPU 週期計數
    cycle: u64,

    // 音頻輸出
    /// 取樣率
    sample_rate: f64,
    /// 取樣計數器（用於音頻降頻取樣）
    sample_counter: f64,
    /// 取樣間隔（每個取樣之間的 CPU 週期數）
    sample_interval: f64,
    /// 音頻輸出緩衝區
    pub audio_buffer: Vec<f32>,
    /// 緩衝區寫入位置
    buffer_write_pos: usize,

    // 濾波器（減少爆音和直流偏移）
    /// 低通濾波器累加器
    filter_accumulator: f32,
    /// 高通濾波器前一個輸入值
    highpass_prev: f32,
    /// 高通濾波器前一個輸出值
    highpass_output: f32,

    /// DMC 記憶體讀取請求（需要由匯流排處理）
    pub dmc_read_request: Option<u16>,
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
            cycle: 0,
            sample_rate: 44100.0,
            sample_counter: 0.0,
            sample_interval: CPU_CLOCK_RATE / 44100.0,
            audio_buffer: vec![0.0; AUDIO_BUFFER_SIZE],
            buffer_write_pos: 0,
            filter_accumulator: 0.0,
            highpass_prev: 0.0,
            highpass_output: 0.0,
            dmc_read_request: None,
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
        self.cycle = 0;
        self.sample_counter = 0.0;
        self.buffer_write_pos = 0;
        self.filter_accumulator = 0.0;
        self.highpass_prev = 0.0;
        self.highpass_output = 0.0;
    }

    /// 設定取樣率
    pub fn set_sample_rate(&mut self, rate: f64) {
        self.sample_rate = rate;
        self.sample_interval = CPU_CLOCK_RATE / rate;
    }

    // ===== 暫存器讀寫 =====

    /// CPU 寫入 APU 暫存器（$4000-$4017）
    pub fn cpu_write(&mut self, addr: u16, data: u8) {
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
                self.pulse1.enabled = data & 0x01 != 0;
                self.pulse2.enabled = data & 0x02 != 0;
                self.triangle.enabled = data & 0x04 != 0;
                self.noise.enabled = data & 0x08 != 0;
                self.dmc.enabled = data & 0x10 != 0;

                if !self.pulse1.enabled { self.pulse1.length_counter = 0; }
                if !self.pulse2.enabled { self.pulse2.length_counter = 0; }
                if !self.triangle.enabled { self.triangle.length_counter = 0; }
                if !self.noise.enabled { self.noise.length_counter = 0; }

                if self.dmc.enabled {
                    if self.dmc.bytes_remaining == 0 {
                        self.dmc.restart();
                    }
                } else {
                    self.dmc.bytes_remaining = 0;
                }
                self.dmc.irq_flag = false;
            }
            // 幀計數器
            0x4017 => {
                self.frame_mode = data & 0x80 != 0;
                self.frame_irq_inhibit = data & 0x40 != 0;
                if self.frame_irq_inhibit {
                    self.frame_irq = false;
                }
                self.frame_step = 0;
                self.frame_value = 0;
                // 5 步模式下立即時鐘半幀和全幀
                if self.frame_mode {
                    self.clock_half_frame();
                    self.clock_quarter_frame();
                }
            }
            _ => {}
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
        if self.frame_irq { status |= 0x40; }
        if self.dmc.irq_flag { status |= 0x80; }

        self.frame_irq = false;
        status
    }

    /// 提供 DMC 記憶體讀取資料
    pub fn dmc_provide_sample(&mut self, data: u8) {
        self.dmc.sample_buffer = data;
        self.dmc.sample_buffer_empty = false;
        self.dmc_read_request = None;
    }

    // ===== 主要時鐘方法 =====

    /// APU 時鐘（每個 CPU 週期呼叫一次）
    pub fn clock(&mut self) {
        // 三角波每個 CPU 週期都計時
        self.triangle.clock_timer();

        // 其他聲道每隔一個 CPU 週期計時（APU 週期）
        if self.cycle % 2 == 0 {
            self.pulse1.clock_timer();
            self.pulse2.clock_timer();
            self.noise.clock_timer();
            self.clock_dmc();
        }

        // 幀計數器
        self.clock_frame_counter();

        // 音頻取樣
        self.sample_counter += 1.0;
        if self.sample_counter >= self.sample_interval {
            self.sample_counter -= self.sample_interval;
            self.output_sample();
        }

        self.cycle += 1;
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
        if self.dmc.bytes_remaining > 0 && self.dmc.sample_buffer_empty {
            self.dmc_read_request = Some(self.dmc.current_address);
            self.dmc.current_address = if self.dmc.current_address == 0xFFFF {
                0x8000
            } else {
                self.dmc.current_address + 1
            };
            self.dmc.bytes_remaining -= 1;

            if self.dmc.bytes_remaining == 0 {
                if self.dmc.loop_flag {
                    self.dmc.restart();
                } else if self.dmc.irq_enabled {
                    self.dmc.irq_flag = true;
                }
            }
        }
    }

    /// 幀計數器時鐘
    fn clock_frame_counter(&mut self) {
        // 幀計數器使用 CPU 週期計數
        self.frame_value += 1;

        if !self.frame_mode {
            // 4 步模式
            match self.frame_value {
                3729 => {
                    self.clock_quarter_frame();
                }
                7457 => {
                    self.clock_quarter_frame();
                    self.clock_half_frame();
                }
                11186 => {
                    self.clock_quarter_frame();
                }
                14915 => {
                    self.clock_quarter_frame();
                    self.clock_half_frame();
                    if !self.frame_irq_inhibit {
                        self.frame_irq = true;
                    }
                    self.frame_value = 0;
                }
                _ => {}
            }
        } else {
            // 5 步模式（無 IRQ）
            match self.frame_value {
                3729 => {
                    self.clock_quarter_frame();
                }
                7457 => {
                    self.clock_quarter_frame();
                    self.clock_half_frame();
                }
                11186 => {
                    self.clock_quarter_frame();
                }
                18641 => {
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
        self.pulse1.clock_envelope();
        self.pulse2.clock_envelope();
        self.triangle.clock_linear_counter();
        self.noise.clock_envelope();
    }

    /// 二分之一幀時鐘（長度計數器和掃頻）
    fn clock_half_frame(&mut self) {
        self.pulse1.clock_length();
        self.pulse1.clock_sweep();
        self.pulse2.clock_length();
        self.pulse2.clock_sweep();
        self.triangle.clock_length();
        self.noise.clock_length();
    }

    // ===== 混音與輸出 =====

    /// 輸出一個音頻取樣到緩衝區
    fn output_sample(&mut self) {
        let mut sample = self.mix();

        // 低通濾波器（減少高頻噪音 / 抗鋸齒）
        const LOWPASS_COEFF: f32 = 0.9;
        self.filter_accumulator = self.filter_accumulator * LOWPASS_COEFF +
                                  sample * (1.0 - LOWPASS_COEFF);
        sample = self.filter_accumulator;

        // 高通濾波器（移除直流偏移）
        const HIGHPASS_COEFF: f32 = 0.996;
        let input = sample;
        self.highpass_output = HIGHPASS_COEFF * self.highpass_output +
                               input - self.highpass_prev;
        self.highpass_prev = input;
        sample = self.highpass_output;

        // 縮放到合理範圍並加入軟削波防止爆音
        sample *= 1.5;
        if sample > 0.95 {
            sample = 0.95 + (sample - 0.95) * 0.2;
        } else if sample < -0.95 {
            sample = -0.95 + (sample + 0.95) * 0.2;
        }

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
        let p1 = self.pulse1.output() as f32;
        let p2 = self.pulse2.output() as f32;
        let t = self.triangle.output() as f32;
        let n = self.noise.output() as f32;
        let d = self.dmc.output() as f32;

        // 脈衝波混音（非線性）
        let pulse_sum = p1 + p2;
        let pulse_out = if pulse_sum > 0.0 {
            95.88 / ((8128.0 / pulse_sum) + 100.0)
        } else {
            0.0
        };

        // TND 混音（非線性）
        let tnd_sum = t / 8227.0 + n / 12241.0 + d / 22638.0;
        let tnd_out = if tnd_sum > 0.0 {
            159.79 / ((1.0 / tnd_sum) + 100.0)
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
        self.frame_irq || self.dmc.irq_flag
    }
}
