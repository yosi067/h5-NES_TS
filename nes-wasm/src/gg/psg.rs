// ============================================================
// SN76489 PSG — 可程式化聲音產生器
// ============================================================
// 3 方波聲道 + 1 雜訊聲道
// 15 級音量衰減 (每級 2dB)
// Game Gear 支援耳機立體聲 (端口 $06)
// ============================================================

const CPU_CLOCK: f64 = 3_579_545.0;
const PSG_CLOCK_DIV: f64 = 16.0;
const AUDIO_BUFFER_SIZE: usize = 8192;

/// 音量衰減表 (15 級, 每級約 2dB, 0xF = 靜音)
const VOLUME_TABLE: [f32; 16] = [
    1.0, 0.7943, 0.6310, 0.5012, 0.3981, 0.3162, 0.2512, 0.1995,
    0.1585, 0.1259, 0.1000, 0.0794, 0.0631, 0.0501, 0.0398, 0.0,
];

struct ToneChannel {
    period: u16,      // 10-bit 週期值
    counter: u16,     // 倒數計數器
    output: bool,     // 方波輸出狀態
    volume: u8,       // 音量衰減 (0-15, 15=靜音)
}

impl ToneChannel {
    fn new() -> Self {
        ToneChannel {
            period: 0,
            counter: 0,
            output: true,
            volume: 0x0F, // 靜音
        }
    }

    fn tick(&mut self) {
        if self.counter > 0 {
            self.counter -= 1;
        }
        if self.counter == 0 {
            self.counter = self.period;
            self.output = !self.output;
        }
    }

    fn sample(&self) -> f32 {
        if self.period < 2 { return 0.0; } // 極高頻率 → 靜音
        let wave = if self.output { 1.0f32 } else { -1.0f32 };
        wave * VOLUME_TABLE[self.volume as usize & 0x0F]
    }
}

struct NoiseChannel {
    period_select: u8,   // 00, 01, 10 = 固定頻率, 11 = 跟隨 Ch2
    white_noise: bool,   // true = 白雜訊, false = 週期性
    counter: u16,
    shift_reg: u16,      // 16-bit LFSR
    output: bool,
    volume: u8,
}

impl NoiseChannel {
    fn new() -> Self {
        NoiseChannel {
            period_select: 0,
            white_noise: false,
            counter: 0,
            shift_reg: 0x8000,
            output: false,
            volume: 0x0F,
        }
    }

    fn get_period(&self, ch2_period: u16) -> u16 {
        match self.period_select {
            0 => 0x10,
            1 => 0x20,
            2 => 0x40,
            _ => ch2_period, // 跟隨 Channel 2
        }
    }

    fn tick(&mut self, ch2_period: u16) {
        if self.counter > 0 {
            self.counter -= 1;
        }
        if self.counter == 0 {
            self.counter = self.get_period(ch2_period);
            // LFSR 推進
            let feedback = if self.white_noise {
                // 白雜訊: bit 0 XOR bit 3
                (self.shift_reg & 1) ^ ((self.shift_reg >> 3) & 1)
            } else {
                // 週期性: bit 0
                self.shift_reg & 1
            };
            self.shift_reg = (self.shift_reg >> 1) | (feedback << 15);
            self.output = self.shift_reg & 1 != 0;
        }
    }

    fn sample(&self) -> f32 {
        let wave = if self.output { 1.0f32 } else { -1.0f32 };
        wave * VOLUME_TABLE[self.volume as usize & 0x0F]
    }
}

pub struct Psg {
    tone: [ToneChannel; 3],
    noise: NoiseChannel,

    // 暫存器寫入狀態
    latched_channel: u8,     // 目前鎖定的聲道 (0~3)
    latched_is_volume: bool, // true = 音量, false = 頻率/雜訊

    // GG 立體聲控制 (端口 $06)
    pub stereo: u8,          // bit 0~3: 右聲道, bit 4~7: 左聲道

    // 音頻輸出緩衝
    sample_rate: f64,
    cycle_counter: f64,      // T-cycle 累積（用於取樣節拍）
    sample_period: f64,      // 每個取樣的 T-cycle 數
    psg_frac: f64,           // PSG tick 小數累積
    audio_buffer: Vec<f32>,
    buffer_pos: usize,
}

impl Psg {
    pub fn new() -> Self {
        Psg {
            tone: [ToneChannel::new(), ToneChannel::new(), ToneChannel::new()],
            noise: NoiseChannel::new(),
            latched_channel: 0,
            latched_is_volume: false,
            stereo: 0xFF, // 全部聲道開啟
            sample_rate: 44100.0,
            cycle_counter: 0.0,
            sample_period: CPU_CLOCK / 44100.0,
            psg_frac: 0.0,
            audio_buffer: vec![0.0; AUDIO_BUFFER_SIZE],
            buffer_pos: 0,
        }
    }

    pub fn set_sample_rate(&mut self, rate: f64) {
        self.sample_rate = rate;
        self.sample_period = CPU_CLOCK / rate;
    }

    /// SN76489 資料寫入 (端口 $7E/$7F)
    pub fn write(&mut self, val: u8) {
        if val & 0x80 != 0 {
            // LATCH/DATA byte: 1CCTDDDD
            self.latched_channel = (val >> 5) & 0x03;
            self.latched_is_volume = val & 0x10 != 0;
            let data = (val & 0x0F) as u16;

            if self.latched_is_volume {
                // 音量
                match self.latched_channel {
                    0..=2 => self.tone[self.latched_channel as usize].volume = data as u8,
                    3 => self.noise.volume = data as u8,
                    _ => {}
                }
            } else {
                // 頻率/雜訊
                match self.latched_channel {
                    0..=2 => {
                        let ch = &mut self.tone[self.latched_channel as usize];
                        ch.period = (ch.period & 0x3F0) | data;
                    }
                    3 => {
                        self.noise.period_select = (data & 0x03) as u8;
                        self.noise.white_noise = data & 0x04 != 0;
                        self.noise.shift_reg = 0x8000; // 重置 LFSR
                    }
                    _ => {}
                }
            }
        } else {
            // DATA byte: 0-DDDDDD (更新 latched 暫存器)
            if self.latched_is_volume {
                // 音量也可以用 DATA byte 更新 (使用低 4 位)
                match self.latched_channel {
                    0..=2 => self.tone[self.latched_channel as usize].volume = val & 0x0F,
                    3 => self.noise.volume = val & 0x0F,
                    _ => {}
                }
            } else {
                match self.latched_channel {
                    0..=2 => {
                        let ch = &mut self.tone[self.latched_channel as usize];
                        let data = (val & 0x3F) as u16;
                        ch.period = (ch.period & 0x00F) | (data << 4);
                    }
                    _ => {}
                }
            }
        }
    }

    /// GG 立體聲控制寫入 (端口 $06)
    pub fn write_stereo(&mut self, val: u8) {
        self.stereo = val;
    }

    /// 時鐘推進
    pub fn tick(&mut self, t_cycles: u32) {
        let ch2_period = self.tone[2].period;

        // 累積 PSG 小數 tick，避免整數截斷（4/16=0 的問題）
        self.psg_frac += t_cycles as f64 / PSG_CLOCK_DIV;
        let int_ticks = self.psg_frac as u32;
        self.psg_frac -= int_ticks as f64;

        for _ in 0..int_ticks {
            self.tone[0].tick();
            self.tone[1].tick();
            self.tone[2].tick();
            self.noise.tick(ch2_period);
        }

        self.cycle_counter += t_cycles as f64;
        while self.cycle_counter >= self.sample_period {
            self.cycle_counter -= self.sample_period;
            self.generate_sample();
        }
    }

    fn generate_sample(&mut self) {
        if self.buffer_pos >= AUDIO_BUFFER_SIZE { return; }

        // 混合所有聲道 → 單聲道輸出
        let ch0 = self.tone[0].sample();
        let ch1 = self.tone[1].sample();
        let ch2 = self.tone[2].sample();
        let ch3 = self.noise.sample();

        // GG 立體聲混合 (簡化為單聲道)
        let mut left = 0.0f32;
        let mut right = 0.0f32;

        if self.stereo & 0x10 != 0 { left += ch0; }
        if self.stereo & 0x20 != 0 { left += ch1; }
        if self.stereo & 0x40 != 0 { left += ch2; }
        if self.stereo & 0x80 != 0 { left += ch3; }
        if self.stereo & 0x01 != 0 { right += ch0; }
        if self.stereo & 0x02 != 0 { right += ch1; }
        if self.stereo & 0x04 != 0 { right += ch2; }
        if self.stereo & 0x08 != 0 { right += ch3; }

        // 混合為單聲道
        let sample = (left + right) * 0.125; // /4 channels /2 stereo
        self.audio_buffer[self.buffer_pos] = sample.clamp(-1.0, 1.0);
        self.buffer_pos += 1;
    }

    // ===== 公開 API =====

    pub fn get_buffer_ptr(&self) -> *const f32 {
        self.audio_buffer.as_ptr()
    }

    pub fn get_available_samples(&self) -> usize {
        self.buffer_pos
    }

    pub fn consume_samples(&mut self) -> usize {
        let n = self.buffer_pos;
        self.buffer_pos = 0;
        n
    }
}
