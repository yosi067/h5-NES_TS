// ============================================================
// Game Boy APU - 音效處理單元
// ============================================================
// 4 聲道：2 方波 + 1 自定義波 + 1 雜訊
// Frame Sequencer: 512 Hz (8192 T-cycles per step)
// ============================================================

const AUDIO_BUFFER_SIZE: usize = 8192;
const CPU_CLOCK_RATE: f64 = 4_194_304.0;

const DUTY_TABLE: [[u8; 8]; 4] = [
    [0, 0, 0, 0, 0, 0, 0, 1], // 12.5%
    [1, 0, 0, 0, 0, 0, 0, 1], // 25%
    [1, 0, 0, 0, 0, 1, 1, 1], // 50%
    [0, 1, 1, 1, 1, 1, 1, 0], // 75%
];

// ===== Channel 1 & 2: Square =====
struct SquareChannel {
    enabled: bool,
    has_sweep: bool,
    duty: u8,
    duty_pos: u8,
    timer_period: u16,
    timer_value: u16,
    length_counter: u16,
    length_enabled: bool,
    // Envelope
    env_initial_vol: u8,
    env_dir: bool, // true=increase
    env_period: u8,
    env_timer: u8,
    volume: u8,
    // Sweep (Channel 1 only)
    sweep_period: u8,
    sweep_negate: bool,
    sweep_shift: u8,
    sweep_timer: u8,
    sweep_enabled: bool,
    sweep_shadow: u16,
    sweep_negated_since: bool,
    // DAC
    dac_enabled: bool,
}

impl SquareChannel {
    fn new(has_sweep: bool) -> Self {
        SquareChannel {
            enabled: false, has_sweep, duty: 0, duty_pos: 0,
            timer_period: 0, timer_value: 0, length_counter: 0, length_enabled: false,
            env_initial_vol: 0, env_dir: false, env_period: 0, env_timer: 0, volume: 0,
            sweep_period: 0, sweep_negate: false, sweep_shift: 0,
            sweep_timer: 0, sweep_enabled: false, sweep_shadow: 0, sweep_negated_since: false,
            dac_enabled: false,
        }
    }

    fn clock_timer(&mut self) {
        if self.timer_value == 0 {
            self.timer_value = (2048 - self.timer_period) * 4;
            self.duty_pos = (self.duty_pos + 1) % 8;
        } else {
            self.timer_value -= 1;
        }
    }

    fn clock_length(&mut self) {
        if self.length_enabled && self.length_counter > 0 {
            self.length_counter -= 1;
            if self.length_counter == 0 {
                self.enabled = false;
            }
        }
    }

    fn clock_envelope(&mut self) {
        if self.env_period == 0 { return; }
        if self.env_timer > 0 { self.env_timer -= 1; }
        if self.env_timer == 0 {
            self.env_timer = self.env_period;
            if self.env_dir && self.volume < 15 {
                self.volume += 1;
            } else if !self.env_dir && self.volume > 0 {
                self.volume -= 1;
            }
        }
    }

    fn clock_sweep(&mut self) {
        if self.sweep_timer > 0 { self.sweep_timer -= 1; }
        if self.sweep_timer == 0 {
            self.sweep_timer = if self.sweep_period > 0 { self.sweep_period } else { 8 };
            if self.sweep_enabled && self.sweep_period > 0 {
                let new_freq = self.calc_sweep_freq();
                if new_freq <= 2047 && self.sweep_shift > 0 {
                    self.sweep_shadow = new_freq;
                    self.timer_period = new_freq;
                    // 再次計算以檢查溢出
                    self.calc_sweep_freq();
                }
            }
        }
    }

    fn calc_sweep_freq(&mut self) -> u16 {
        let delta = self.sweep_shadow >> self.sweep_shift;
        let new_freq = if self.sweep_negate {
            self.sweep_negated_since = true;
            self.sweep_shadow.wrapping_sub(delta)
        } else {
            self.sweep_shadow.wrapping_add(delta)
        };
        if new_freq > 2047 { self.enabled = false; }
        new_freq
    }

    fn trigger(&mut self) {
        self.enabled = self.dac_enabled;
        if self.length_counter == 0 { self.length_counter = 64; }
        self.timer_value = (2048 - self.timer_period) * 4;
        self.volume = self.env_initial_vol;
        self.env_timer = self.env_period;
        // Sweep
        if self.has_sweep {
            self.sweep_shadow = self.timer_period;
            self.sweep_timer = if self.sweep_period > 0 { self.sweep_period } else { 8 };
            self.sweep_enabled = self.sweep_period > 0 || self.sweep_shift > 0;
            self.sweep_negated_since = false;
            if self.sweep_shift > 0 {
                self.calc_sweep_freq();
            }
        }
    }

    fn output(&self) -> f32 {
        if !self.enabled || !self.dac_enabled { return 0.0; }
        let wave = DUTY_TABLE[self.duty as usize][self.duty_pos as usize];
        if wave != 0 { self.volume as f32 / 15.0 } else { 0.0 }
    }
}

// ===== Channel 3: Wave =====
struct WaveChannel {
    enabled: bool,
    dac_enabled: bool,
    length_counter: u16,
    length_enabled: bool,
    volume_code: u8, // 0=mute, 1=100%, 2=50%, 3=25%
    timer_period: u16,
    timer_value: u16,
    sample_pos: u8,
    wave_ram: [u8; 16], // 32 4-bit samples
}

impl WaveChannel {
    fn new() -> Self {
        WaveChannel {
            enabled: false, dac_enabled: false,
            length_counter: 0, length_enabled: false,
            volume_code: 0, timer_period: 0, timer_value: 0,
            sample_pos: 0, wave_ram: [0; 16],
        }
    }

    fn clock_timer(&mut self) {
        if self.timer_value == 0 {
            self.timer_value = (2048 - self.timer_period) * 2;
            self.sample_pos = (self.sample_pos + 1) % 32;
        } else {
            self.timer_value -= 1;
        }
    }

    fn clock_length(&mut self) {
        if self.length_enabled && self.length_counter > 0 {
            self.length_counter -= 1;
            if self.length_counter == 0 { self.enabled = false; }
        }
    }

    fn trigger(&mut self) {
        self.enabled = self.dac_enabled;
        if self.length_counter == 0 { self.length_counter = 256; }
        self.timer_value = (2048 - self.timer_period) * 2;
        self.sample_pos = 0;
    }

    fn output(&self) -> f32 {
        if !self.enabled || !self.dac_enabled { return 0.0; }
        let byte = self.wave_ram[(self.sample_pos / 2) as usize];
        let sample = if self.sample_pos % 2 == 0 { byte >> 4 } else { byte & 0x0F };
        let shifted = match self.volume_code {
            0 => 0,
            1 => sample,
            2 => sample >> 1,
            3 => sample >> 2,
            _ => 0,
        };
        shifted as f32 / 15.0
    }
}

// ===== Channel 4: Noise =====
struct NoiseChannel {
    enabled: bool,
    dac_enabled: bool,
    length_counter: u16,
    length_enabled: bool,
    env_initial_vol: u8,
    env_dir: bool,
    env_period: u8,
    env_timer: u8,
    volume: u8,
    clock_shift: u8,
    width_mode: bool, // true=7-bit, false=15-bit
    divisor_code: u8,
    timer_value: u16,
    lfsr: u16,
}

impl NoiseChannel {
    fn new() -> Self {
        NoiseChannel {
            enabled: false, dac_enabled: false,
            length_counter: 0, length_enabled: false,
            env_initial_vol: 0, env_dir: false, env_period: 0,
            env_timer: 0, volume: 0,
            clock_shift: 0, width_mode: false, divisor_code: 0,
            timer_value: 0, lfsr: 0x7FFF,
        }
    }

    fn get_divisor(&self) -> u16 {
        let base = match self.divisor_code {
            0 => 8, 1 => 16, 2 => 32, 3 => 48,
            4 => 64, 5 => 80, 6 => 96, 7 => 112,
            _ => 8,
        };
        base << self.clock_shift
    }

    fn clock_timer(&mut self) {
        if self.timer_value == 0 {
            self.timer_value = self.get_divisor();
            let xor_bit = (self.lfsr & 1) ^ ((self.lfsr >> 1) & 1);
            self.lfsr = (self.lfsr >> 1) | (xor_bit << 14);
            if self.width_mode {
                self.lfsr = (self.lfsr & !(1 << 6)) | (xor_bit << 6);
            }
        } else {
            self.timer_value -= 1;
        }
    }

    fn clock_length(&mut self) {
        if self.length_enabled && self.length_counter > 0 {
            self.length_counter -= 1;
            if self.length_counter == 0 { self.enabled = false; }
        }
    }

    fn clock_envelope(&mut self) {
        if self.env_period == 0 { return; }
        if self.env_timer > 0 { self.env_timer -= 1; }
        if self.env_timer == 0 {
            self.env_timer = self.env_period;
            if self.env_dir && self.volume < 15 {
                self.volume += 1;
            } else if !self.env_dir && self.volume > 0 {
                self.volume -= 1;
            }
        }
    }

    fn trigger(&mut self) {
        self.enabled = self.dac_enabled;
        if self.length_counter == 0 { self.length_counter = 64; }
        self.timer_value = self.get_divisor();
        self.volume = self.env_initial_vol;
        self.env_timer = self.env_period;
        self.lfsr = 0x7FFF;
    }

    fn output(&self) -> f32 {
        if !self.enabled || !self.dac_enabled { return 0.0; }
        if self.lfsr & 1 == 0 { self.volume as f32 / 15.0 } else { 0.0 }
    }
}

// ===== APU 主結構 =====
pub struct Apu {
    ch1: SquareChannel,
    ch2: SquareChannel,
    ch3: WaveChannel,
    ch4: NoiseChannel,

    // Master control
    power: bool,
    nr50: u8, // $FF24 Master volume
    nr51: u8, // $FF25 Panning

    // Frame sequencer
    frame_seq_counter: u32,
    frame_seq_step: u8,

    // Audio output
    sample_rate: f64,
    sample_counter: f64,
    sample_interval: f64,
    pub audio_buffer: Vec<f32>,
    buffer_write_pos: usize,

    // Filters
    filter_cap_l: f32,
    filter_cap_r: f32,
}

impl Apu {
    pub fn new() -> Self {
        let sample_rate = 44100.0;
        Apu {
            ch1: SquareChannel::new(true),
            ch2: SquareChannel::new(false),
            ch3: WaveChannel::new(),
            ch4: NoiseChannel::new(),
            power: true,
            nr50: 0x77,
            nr51: 0xF3,
            frame_seq_counter: 0,
            frame_seq_step: 0,
            sample_rate,
            sample_counter: 0.0,
            sample_interval: CPU_CLOCK_RATE / sample_rate,
            audio_buffer: vec![0.0; AUDIO_BUFFER_SIZE],
            buffer_write_pos: 0,
            filter_cap_l: 0.0,
            filter_cap_r: 0.0,
        }
    }

    pub fn set_sample_rate(&mut self, rate: f64) {
        self.sample_rate = rate;
        self.sample_interval = CPU_CLOCK_RATE / rate;
    }

    /// 推進 t_cycles
    pub fn tick(&mut self, t_cycles: u32) {
        if !self.power { return; }

        for _ in 0..t_cycles {
            // Channel timers
            self.ch1.clock_timer();
            self.ch2.clock_timer();
            self.ch3.clock_timer();
            self.ch4.clock_timer();

            // Frame sequencer (每 8192 T-cycles)
            self.frame_seq_counter += 1;
            if self.frame_seq_counter >= 8192 {
                self.frame_seq_counter = 0;
                self.clock_frame_sequencer();
            }

            // Audio sampling
            self.sample_counter += 1.0;
            if self.sample_counter >= self.sample_interval {
                self.sample_counter -= self.sample_interval;
                self.output_sample();
            }
        }
    }

    fn clock_frame_sequencer(&mut self) {
        match self.frame_seq_step {
            0 => { self.clock_lengths(); }
            1 => {}
            2 => { self.clock_lengths(); self.ch1.clock_sweep(); }
            3 => {}
            4 => { self.clock_lengths(); }
            5 => {}
            6 => { self.clock_lengths(); self.ch1.clock_sweep(); }
            7 => { self.clock_envelopes(); }
            _ => {}
        }
        self.frame_seq_step = (self.frame_seq_step + 1) % 8;
    }

    fn clock_lengths(&mut self) {
        self.ch1.clock_length();
        self.ch2.clock_length();
        self.ch3.clock_length();
        self.ch4.clock_length();
    }

    fn clock_envelopes(&mut self) {
        self.ch1.clock_envelope();
        self.ch2.clock_envelope();
        self.ch4.clock_envelope();
    }

    fn output_sample(&mut self) {
        let ch1 = self.ch1.output();
        let ch2 = self.ch2.output();
        let ch3 = self.ch3.output();
        let ch4 = self.ch4.output();

        // 混音 (立體聲→單聲道)
        let left_vol = ((self.nr50 >> 4) & 7) as f32 + 1.0;
        let right_vol = (self.nr50 & 7) as f32 + 1.0;

        let mut left = 0.0f32;
        let mut right = 0.0f32;
        if self.nr51 & 0x10 != 0 { left += ch1; }
        if self.nr51 & 0x01 != 0 { right += ch1; }
        if self.nr51 & 0x20 != 0 { left += ch2; }
        if self.nr51 & 0x02 != 0 { right += ch2; }
        if self.nr51 & 0x40 != 0 { left += ch3; }
        if self.nr51 & 0x04 != 0 { right += ch3; }
        if self.nr51 & 0x80 != 0 { left += ch4; }
        if self.nr51 & 0x08 != 0 { right += ch4; }

        left = left / 4.0 * left_vol / 8.0;
        right = right / 4.0 * right_vol / 8.0;

        // 高通濾波器（移除 DC 偏移）
        let mixed = (left + right) * 0.5;
        const HP_COEFF: f32 = 0.996;
        self.filter_cap_l = mixed - self.filter_cap_l;
        let filtered = self.filter_cap_l;
        self.filter_cap_l = mixed - filtered * HP_COEFF;

        let sample = filtered.max(-1.0).min(1.0);

        if self.buffer_write_pos < self.audio_buffer.len() {
            self.audio_buffer[self.buffer_write_pos] = sample;
            self.buffer_write_pos += 1;
        }
    }

    // ===== 暫存器讀寫 =====

    pub fn read(&self, addr: u16) -> u8 {
        if !self.power && addr != 0xFF26 && !(0xFF30..=0xFF3F).contains(&addr) {
            return 0xFF;
        }
        match addr {
            0xFF10 => 0x80 | (self.ch1.sweep_period << 4) | (if self.ch1.sweep_negate { 0x08 } else { 0 }) | self.ch1.sweep_shift,
            0xFF11 => (self.ch1.duty << 6) | 0x3F,
            0xFF12 => (self.ch1.env_initial_vol << 4) | (if self.ch1.env_dir { 0x08 } else { 0 }) | self.ch1.env_period,
            0xFF13 => 0xFF, // Write-only
            0xFF14 => (if self.ch1.length_enabled { 0x40 } else { 0 }) | 0xBF,
            0xFF16 => (self.ch2.duty << 6) | 0x3F,
            0xFF17 => (self.ch2.env_initial_vol << 4) | (if self.ch2.env_dir { 0x08 } else { 0 }) | self.ch2.env_period,
            0xFF18 => 0xFF,
            0xFF19 => (if self.ch2.length_enabled { 0x40 } else { 0 }) | 0xBF,
            0xFF1A => (if self.ch3.dac_enabled { 0x80 } else { 0 }) | 0x7F,
            0xFF1B => 0xFF,
            0xFF1C => (self.ch3.volume_code << 5) | 0x9F,
            0xFF1D => 0xFF,
            0xFF1E => (if self.ch3.length_enabled { 0x40 } else { 0 }) | 0xBF,
            0xFF20 => 0xFF,
            0xFF21 => (self.ch4.env_initial_vol << 4) | (if self.ch4.env_dir { 0x08 } else { 0 }) | self.ch4.env_period,
            0xFF22 => (self.ch4.clock_shift << 4) | (if self.ch4.width_mode { 0x08 } else { 0 }) | self.ch4.divisor_code,
            0xFF23 => (if self.ch4.length_enabled { 0x40 } else { 0 }) | 0xBF,
            0xFF24 => self.nr50,
            0xFF25 => self.nr51,
            0xFF26 => {
                let mut v = 0x70 | (if self.power { 0x80 } else { 0 });
                if self.ch1.enabled { v |= 0x01; }
                if self.ch2.enabled { v |= 0x02; }
                if self.ch3.enabled { v |= 0x04; }
                if self.ch4.enabled { v |= 0x08; }
                v
            }
            0xFF30..=0xFF3F => self.ch3.wave_ram[(addr - 0xFF30) as usize],
            _ => 0xFF,
        }
    }

    pub fn write(&mut self, addr: u16, val: u8) {
        // Wave RAM 總是可寫
        if (0xFF30..=0xFF3F).contains(&addr) {
            self.ch3.wave_ram[(addr - 0xFF30) as usize] = val;
            return;
        }

        // 電源控制
        if addr == 0xFF26 {
            let new_power = val & 0x80 != 0;
            if !new_power && self.power {
                // 關閉 APU：清除所有暫存器
                self.ch1 = SquareChannel::new(true);
                self.ch2 = SquareChannel::new(false);
                self.ch3.enabled = false;
                self.ch3.dac_enabled = false;
                self.ch4 = NoiseChannel::new();
                self.nr50 = 0;
                self.nr51 = 0;
            }
            self.power = new_power;
            return;
        }

        if !self.power { return; }

        match addr {
            // Channel 1
            0xFF10 => {
                self.ch1.sweep_period = (val >> 4) & 7;
                let new_negate = val & 0x08 != 0;
                if self.ch1.sweep_negated_since && !new_negate {
                    self.ch1.enabled = false;
                }
                self.ch1.sweep_negate = new_negate;
                self.ch1.sweep_shift = val & 7;
            }
            0xFF11 => {
                self.ch1.duty = (val >> 6) & 3;
                self.ch1.length_counter = 64 - (val & 0x3F) as u16;
            }
            0xFF12 => {
                self.ch1.env_initial_vol = val >> 4;
                self.ch1.env_dir = val & 0x08 != 0;
                self.ch1.env_period = val & 7;
                self.ch1.dac_enabled = val & 0xF8 != 0;
                if !self.ch1.dac_enabled { self.ch1.enabled = false; }
            }
            0xFF13 => {
                self.ch1.timer_period = (self.ch1.timer_period & 0x700) | val as u16;
            }
            0xFF14 => {
                self.ch1.timer_period = (self.ch1.timer_period & 0xFF) | ((val as u16 & 7) << 8);
                self.ch1.length_enabled = val & 0x40 != 0;
                if val & 0x80 != 0 { self.ch1.trigger(); }
            }
            // Channel 2
            0xFF16 => {
                self.ch2.duty = (val >> 6) & 3;
                self.ch2.length_counter = 64 - (val & 0x3F) as u16;
            }
            0xFF17 => {
                self.ch2.env_initial_vol = val >> 4;
                self.ch2.env_dir = val & 0x08 != 0;
                self.ch2.env_period = val & 7;
                self.ch2.dac_enabled = val & 0xF8 != 0;
                if !self.ch2.dac_enabled { self.ch2.enabled = false; }
            }
            0xFF18 => {
                self.ch2.timer_period = (self.ch2.timer_period & 0x700) | val as u16;
            }
            0xFF19 => {
                self.ch2.timer_period = (self.ch2.timer_period & 0xFF) | ((val as u16 & 7) << 8);
                self.ch2.length_enabled = val & 0x40 != 0;
                if val & 0x80 != 0 { self.ch2.trigger(); }
            }
            // Channel 3
            0xFF1A => {
                self.ch3.dac_enabled = val & 0x80 != 0;
                if !self.ch3.dac_enabled { self.ch3.enabled = false; }
            }
            0xFF1B => {
                self.ch3.length_counter = 256 - val as u16;
            }
            0xFF1C => {
                self.ch3.volume_code = (val >> 5) & 3;
            }
            0xFF1D => {
                self.ch3.timer_period = (self.ch3.timer_period & 0x700) | val as u16;
            }
            0xFF1E => {
                self.ch3.timer_period = (self.ch3.timer_period & 0xFF) | ((val as u16 & 7) << 8);
                self.ch3.length_enabled = val & 0x40 != 0;
                if val & 0x80 != 0 { self.ch3.trigger(); }
            }
            // Channel 4
            0xFF20 => {
                self.ch4.length_counter = 64 - (val & 0x3F) as u16;
            }
            0xFF21 => {
                self.ch4.env_initial_vol = val >> 4;
                self.ch4.env_dir = val & 0x08 != 0;
                self.ch4.env_period = val & 7;
                self.ch4.dac_enabled = val & 0xF8 != 0;
                if !self.ch4.dac_enabled { self.ch4.enabled = false; }
            }
            0xFF22 => {
                self.ch4.clock_shift = val >> 4;
                self.ch4.width_mode = val & 0x08 != 0;
                self.ch4.divisor_code = val & 7;
            }
            0xFF23 => {
                self.ch4.length_enabled = val & 0x40 != 0;
                if val & 0x80 != 0 { self.ch4.trigger(); }
            }
            // Master control
            0xFF24 => self.nr50 = val,
            0xFF25 => self.nr51 = val,
            _ => {}
        }
    }

    // ===== 音頻緩衝區 API =====

    pub fn get_buffer_ptr(&self) -> *const f32 { self.audio_buffer.as_ptr() }
    pub fn get_available_samples(&self) -> usize { self.buffer_write_pos }
    pub fn consume_samples(&mut self) -> usize {
        let count = self.buffer_write_pos;
        self.buffer_write_pos = 0;
        count
    }
}
