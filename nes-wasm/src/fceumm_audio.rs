use crate::fceumm_coeffs::very_high_44100_ntsc_coefficients;
use serde::{Deserialize, Serialize};

const VERY_HIGH_44100_NTSC_RATIO: u64 = 2_659_740;
const WLOOKUP1_BASE: [u32; 32] = [
    0, 190, 375, 557, 734, 906, 1075, 1240,
    1402, 1560, 1714, 1865, 2013, 2157, 2299, 2438,
    2574, 2707, 2837, 2965, 3090, 3213, 3333, 3451,
    3567, 3681, 3792, 3902, 4009, 4115, 4219, 4320,
];
const WLOOKUP2_BASE: [u32; 203] = [
    0, 109, 218, 326, 433, 540, 645, 749,
    853, 956, 1058, 1159, 1260, 1360, 1459, 1557,
    1654, 1751, 1847, 1942, 2036, 2130, 2223, 2316,
    2407, 2498, 2589, 2678, 2767, 2855, 2943, 3030,
    3117, 3202, 3288, 3372, 3456, 3539, 3622, 3704,
    3786, 3867, 3947, 4027, 4106, 4185, 4263, 4341,
    4418, 4495, 4571, 4647, 4722, 4796, 4870, 4944,
    5017, 5090, 5162, 5233, 5304, 5375, 5445, 5515,
    5584, 5653, 5722, 5790, 5857, 5924, 5991, 6057,
    6123, 6189, 6254, 6318, 6382, 6446, 6510, 6573,
    6635, 6697, 6759, 6821, 6882, 6943, 7003, 7063,
    7123, 7182, 7241, 7299, 7357, 7415, 7473, 7530,
    7587, 7643, 7700, 7755, 7811, 7866, 7921, 7976,
    8030, 8084, 8137, 8191, 8244, 8296, 8349, 8401,
    8453, 8504, 8556, 8607, 8657, 8708, 8758, 8808,
    8857, 8906, 8955, 9004, 9053, 9101, 9149, 9197,
    9244, 9291, 9338, 9385, 9431, 9478, 9523, 9569,
    9615, 9660, 9705, 9750, 9794, 9838, 9883, 9926,
    9970, 10013, 10057, 10099, 10142, 10185, 10227, 10269,
    10311, 10353, 10394, 10435, 10476, 10517, 10558, 10598,
    10638, 10678, 10718, 10758, 10797, 10836, 10875, 10914,
    10953, 10991, 11030, 11068, 11106, 11143, 11181, 11218,
    11256, 11293, 11329, 11366, 11403, 11439, 11475, 11511,
    11547, 11583, 11618, 11653, 11689, 11723, 11758, 11793,
    11828, 11862, 11896, 11930, 11964, 11998, 12031, 12065,
    12098, 12131, 12164,
];

pub(crate) fn fceumm_wave_hi_mix(wave_hi: u32) -> i32 {
    let pulse = WLOOKUP1_BASE[((wave_hi >> 24) & 0x1f) as usize];
    let tnd_index = (((wave_hi >> 16) & 0xff) as usize).min(WLOOKUP2_BASE.len() - 1);
    let tnd = WLOOKUP2_BASE[tnd_index];
    (wave_hi & 0xffff).saturating_add(tnd).saturating_add(pulse) as i32
}

pub(crate) fn fceumm_wave_hi_flush(samples: &mut [i32]) {
    for sample in samples {
        *sample = fceumm_wave_hi_mix(*sample as u32);
    }
}

#[derive(Clone, Copy)]
pub(crate) enum FceummChannelState {
    Pulse {
        active: bool,
        timer_period: u16,
        duty: u8,
        volume: u8,
    },
    Triangle {
        active: bool,
        timer_period: u16,
        volume: u32,
    },
    Noise {
        active: bool,
        short_mode: bool,
        timer_period: u16,
        volume: u8,
    },
    Dmc {
        output_level: u8,
        volume: u32,
    },
}

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct FceummRenderTimeline {
    timestamp: u64,
    channel_positions: [u64; 5],
    pulse_duty_counts: [u8; 2],
    pulse_wavelength_counts: [i32; 2],
    triangle_step: u8,
    triangle_wavelength_count: i32,
    noise_state: u16,
    noise_wavelength_count: i32,
}

impl FceummRenderTimeline {
    pub(crate) fn new() -> Self {
        Self {
            timestamp: 0,
            channel_positions: [0; 5],
            pulse_duty_counts: [7; 2],
            pulse_wavelength_counts: [2048; 2],
            triangle_step: 0,
            triangle_wavelength_count: 1,
            noise_state: 1,
            noise_wavelength_count: 2048,
        }
    }

    pub(crate) fn advance(&mut self) {
        self.timestamp += 1;
    }

    pub(crate) fn reset_pulse_duty(&mut self, channel: usize) {
        self.pulse_duty_counts[channel] = 7;
    }

    #[cfg(test)]
    pub(crate) fn set_pulse_duty_for_test(&mut self, channel: usize, count: u8) {
        self.pulse_duty_counts[channel] = count & 7;
    }

    pub(crate) fn flush_channel(
        &mut self,
        channel: usize,
        wave_hi: &mut Vec<i32>,
        state: FceummChannelState,
    ) {
        let timestamp = self.timestamp;
        self.flush_channel_at(channel, timestamp, wave_hi, state);
    }

    pub(crate) fn flush_channel_for_current_cycle(
        &mut self,
        channel: usize,
        wave_hi: &mut Vec<i32>,
        state: FceummChannelState,
    ) {
        let timestamp = self.timestamp + 1;
        self.flush_channel_at(channel, timestamp, wave_hi, state);
    }

    fn flush_channel_at(
        &mut self,
        channel: usize,
        timestamp: u64,
        wave_hi: &mut Vec<i32>,
        state: FceummChannelState,
    ) {
        let start = self.channel_positions[channel] as usize;
        let end = timestamp as usize;
        if end < start {
            return;
        }
        if wave_hi.len() < end {
            wave_hi.resize(end, 0);
        }

        match state {
            FceummChannelState::Pulse {
                active,
                timer_period,
                duty,
                volume,
            } => {
                if active {
                    let duty_threshold = [1u8, 2, 4, 6][duty as usize];
                    let amplitude = i32::from(volume) << 24;
                    let frequency = (i32::from(timer_period) + 1) * 2;
                    let duty_count = &mut self.pulse_duty_counts[channel];
                    let wavelength_count = &mut self.pulse_wavelength_counts[channel];
                    for sample in &mut wave_hi[start..end] {
                        if *duty_count < duty_threshold {
                            *sample += amplitude;
                        }
                        *wavelength_count -= 1;
                        if *wavelength_count == 0 {
                            *wavelength_count = frequency;
                            *duty_count = (*duty_count + 1) & 7;
                        }
                    }
                } else {
                    let frequency = (i32::from(timer_period) + 1) * 2;
                    let wavelength_count = &mut self.pulse_wavelength_counts[channel];
                    *wavelength_count -= (end - start) as i32;
                    if *wavelength_count <= 0 {
                        *wavelength_count = frequency - (-*wavelength_count % frequency);
                    }
                }
            }
            FceummChannelState::Triangle {
                active,
                timer_period,
                volume,
            } => {
                let mut amplitude = triangle_amplitude(self.triangle_step, volume);
                if active {
                    let wavelength_count = &mut self.triangle_wavelength_count;
                    for sample in &mut wave_hi[start..end] {
                        *sample += amplitude;
                        *wavelength_count -= 1;
                        if *wavelength_count == 0 {
                            *wavelength_count = i32::from(timer_period) + 1;
                            self.triangle_step = (self.triangle_step + 1) & 0x1F;
                            amplitude = triangle_amplitude(self.triangle_step, volume);
                        }
                    }
                } else {
                    for sample in &mut wave_hi[start..end] {
                        *sample += amplitude;
                    }
                }
            }
            FceummChannelState::Noise {
                active,
                short_mode,
                timer_period,
                volume,
            } => {
                let amplitude = if active {
                    i32::from(volume) << 17
                } else {
                    0
                };
                let mut output = if self.noise_state & 0x4000 == 0 {
                    amplitude
                } else {
                    0
                };
                let wavelength_count = &mut self.noise_wavelength_count;
                let period = i32::from(timer_period.max(4));
                for sample in &mut wave_hi[start..end] {
                    *sample += output;
                    *wavelength_count -= 1;
                    if *wavelength_count == 0 {
                        *wavelength_count = period;
                        let tap = if short_mode { 8 } else { 13 };
                        let feedback =
                            ((self.noise_state >> tap) ^ (self.noise_state >> 14)) & 1;
                        self.noise_state =
                            ((self.noise_state << 1) & 0x7FFF) | feedback;
                        output = if self.noise_state & 0x4000 == 0 {
                            amplitude
                        } else {
                            0
                        };
                    }
                }
            }
            FceummChannelState::Dmc {
                output_level,
                volume,
            } => {
                let amplitude =
                    (((u32::from(output_level) << 16) / 256) * volume & !0xFFFF) as i32;
                for sample in &mut wave_hi[start..end] {
                    *sample += amplitude;
                }
            }
        }

        self.channel_positions[channel] = timestamp;
    }

    pub(crate) fn finish_frame(&mut self) {
        self.timestamp = 0;
        self.channel_positions = [0; 5];
    }

    pub(crate) fn timestamp(&self) -> u64 {
        self.timestamp
    }

    #[cfg(test)]
    fn channel_position(&self, channel: usize) -> u64 {
        self.channel_positions[channel]
    }
}

fn triangle_amplitude(step: u8, volume: u32) -> i32 {
    let mut output = u32::from(step & 0x0F);
    if step & 0x10 == 0 {
        output ^= 0x0F;
    }
    let output = (output * 3) << 16;
    ((output / 256 * volume) & !0xFFFF) as i32
}

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct FceummFirResampler {
    coefficients: Vec<i32>,
    ratio: u64,
    phase: u64,
    history: Vec<i32>,
}

impl FceummFirResampler {
    pub(crate) fn new_very_high_44100_ntsc() -> Self {
        let coefficients = very_high_44100_ntsc_coefficients();
        Self::new(&coefficients, VERY_HIGH_44100_NTSC_RATIO)
    }

    pub(crate) fn new(coefficients: &[i32], ratio: u64) -> Self {
        assert!(!coefficients.is_empty());
        assert!(coefficients.len() % 2 == 0);

        let tap_count = coefficients.len();
        Self {
            coefficients: coefficients.to_vec(),
            ratio,
            phase: ((tap_count + 1) as u64) << 16,
            history: Vec::with_capacity(tap_count + 1),
        }
    }

    pub(crate) fn reset(&mut self) {
        self.phase = ((self.coefficients.len() + 1) as u64) << 16;
        self.history.clear();
    }

    pub(crate) fn process(&mut self, samples: &[i32]) -> Vec<i32> {
        if samples.is_empty() {
            return Vec::new();
        }

        let tap_count = self.coefficients.len();
        let mut input = Vec::with_capacity(self.history.len() + samples.len());
        input.extend_from_slice(&self.history);
        input.extend_from_slice(samples);

        let max = ((input.len() - 1) as u64) << 16;
        let mut position = self.phase;
        let mut output = Vec::new();

        while position < max {
            let center = (position >> 16) as usize;
            let start = center - tap_count;
            let fraction = position & 0xFFFF;
            let mut current = 0i64;
            let mut next = 0i64;

            for (coefficient_index, &coefficient) in self.coefficients.iter().enumerate() {
                let source_index = start + tap_count - coefficient_index;
                current += (i64::from(input[source_index]) * i64::from(coefficient)) >> 6;
                next += (i64::from(input[source_index + 1]) * i64::from(coefficient)) >> 6;
            }

            let interpolated = current * (0x10000 - fraction) as i64
                + next * fraction as i64;
            output.push((interpolated >> 27) as i32);
            position += self.ratio;
        }

        self.phase = position - max + ((tap_count as u64) << 16);
        let history_len = tap_count + 1;
        let history_start = input.len().saturating_sub(history_len);
        self.history.clear();
        self.history.extend_from_slice(&input[history_start..]);

        output
    }
}

#[derive(Clone, Serialize, Deserialize)]
struct FceummPostFilter {
    mul1: i64,
    mul2: i64,
    volume_multiplier: i64,
    accumulator1: i64,
    accumulator2: i64,
}

impl FceummPostFilter {
    fn new_very_high_44100() -> Self {
        let sample_rate = 44_100i64;
        let sound_volume = 179i64;
        let mut volume_multiplier = (sound_volume << 16) * 3 / 4 / 100;
        volume_multiplier /= 4;

        Self {
            mul1: (94i64 << 16) / sample_rate,
            mul2: (24i64 << 16) / sample_rate,
            volume_multiplier,
            accumulator1: 0,
            accumulator2: 0,
        }
    }

    fn reset(&mut self) {
        self.accumulator1 = 0;
        self.accumulator2 = 0;
    }

    fn process(&mut self, samples: &mut [i32]) {
        for sample in samples {
            let input = i64::from(*sample);
            let scaled = input * self.volume_multiplier;
            self.accumulator1 +=
                ((scaled - self.accumulator1) * self.mul1) >> 16;
            self.accumulator2 +=
                ((scaled - self.accumulator1 - self.accumulator2) * self.mul2) >> 16;

            let filtered = (self.accumulator1 - scaled + self.accumulator2) >> 16;
            *sample = filtered.clamp(-32_768, 32_767) as i32;
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct FceummAudioPipeline {
    resampler: FceummFirResampler,
    post_filter: FceummPostFilter,
}

impl FceummAudioPipeline {
    pub(crate) fn new_very_high_44100() -> Self {
        Self {
            resampler: FceummFirResampler::new_very_high_44100_ntsc(),
            post_filter: FceummPostFilter::new_very_high_44100(),
        }
    }

    pub(crate) fn reset(&mut self) {
        self.resampler.reset();
        self.post_filter.reset();
    }

    pub(crate) fn process(&mut self, samples: &[i32]) -> Vec<i32> {
        let mut output = self.resampler.process(samples);
        self.post_filter.process(&mut output);
        output
    }

    pub(crate) fn is_portable_state_compatible(&self, baseline: &Self) -> bool {
        self.resampler.coefficients == baseline.resampler.coefficients
            && self.resampler.ratio == baseline.resampler.ratio
            && self.resampler.history.len() <= self.resampler.coefficients.len() + 1
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_timeline_flushes_a_channel_at_the_current_timestamp() {
        let mut timeline = FceummRenderTimeline::new();
        let mut wave_hi = Vec::new();

        for _ in 0..5 {
            timeline.advance();
        }
        timeline.flush_channel(
            0,
            &mut wave_hi,
            FceummChannelState::Pulse {
                active: false,
                timer_period: 20,
                duty: 0,
                volume: 15,
            },
        );

        assert_eq!(timeline.timestamp(), 5);
        assert_eq!(timeline.channel_position(0), 5);
        assert_eq!(timeline.channel_position(1), 0);
        assert_eq!(wave_hi.len(), 5);
    }

    #[test]
    fn render_timeline_accumulates_a_pulse_interval() {
        let mut timeline = FceummRenderTimeline::new();
        let mut wave_hi = Vec::new();
        timeline.set_pulse_duty_for_test(0, 0);

        for _ in 0..4 {
            timeline.advance();
        }
        timeline.flush_channel(
            0,
            &mut wave_hi,
            FceummChannelState::Pulse {
                active: true,
                timer_period: 20,
                duty: 0,
                volume: 15,
            },
        );

        assert_eq!(wave_hi, vec![15i32 << 24; 4]);
    }

    #[test]
    fn render_timeline_renders_the_pending_cycle_before_a_mutation() {
        let mut timeline = FceummRenderTimeline::new();
        let mut wave_hi = Vec::new();
        timeline.set_pulse_duty_for_test(0, 0);

        timeline.advance();
        timeline.flush_channel_for_current_cycle(
            0,
            &mut wave_hi,
            FceummChannelState::Pulse {
                active: true,
                timer_period: 20,
                duty: 0,
                volume: 15,
            },
        );
        timeline.advance();
        timeline.flush_channel(
            0,
            &mut wave_hi,
            FceummChannelState::Pulse {
                active: false,
                timer_period: 20,
                duty: 0,
                volume: 15,
            },
        );

        assert_eq!(wave_hi, vec![15i32 << 24; 2]);
    }

    #[test]
    fn render_timeline_advances_muted_pulse_wavelength_without_duty() {
        let mut timeline = FceummRenderTimeline::new();
        let mut wave_hi = Vec::new();
        timeline.set_pulse_duty_for_test(0, 3);
        timeline.pulse_wavelength_counts[0] = 5;

        for _ in 0..7 {
            timeline.advance();
        }
        timeline.flush_channel(
            0,
            &mut wave_hi,
            FceummChannelState::Pulse {
                active: false,
                timer_period: 2,
                duty: 0,
                volume: 15,
            },
        );

        assert_eq!(timeline.pulse_duty_counts[0], 3);
        assert_eq!(timeline.pulse_wavelength_counts[0], 4);
        assert_eq!(wave_hi, vec![0; 7]);
    }

    #[test]
    fn wave_hi_mix_uses_fceumm_lookup_fields() {
        let wave_hi = (5u32 << 24) | (42u32 << 16) | 0x1234;

        assert_eq!(fceumm_wave_hi_mix(wave_hi), 9_513);
    }

    #[test]
    fn wave_hi_mix_clamps_tnd_lookup_index() {
        let wave_hi = (31u32 << 24) | (0xffu32 << 16) | 0xffff;

        assert_eq!(fceumm_wave_hi_mix(wave_hi), 82_019);
    }

    #[test]
    fn wave_hi_lookup_is_applied_to_a_frame_buffer() {
        let mut samples = [(5u32 << 24 | 42u32 << 16 | 0x1234) as i32];

        fceumm_wave_hi_flush(&mut samples);

        assert_eq!(samples, [9_513]);
    }

    #[test]
    fn fceumm_lookup_tables_match_source_endpoints() {
        assert_eq!(WLOOKUP1_BASE.len(), 32);
        assert_eq!(WLOOKUP1_BASE[31], 4_320);
        assert_eq!(WLOOKUP2_BASE.len(), 203);
        assert_eq!(WLOOKUP2_BASE[202], 12_164);
    }

    #[test]
    fn preserves_fractional_phase_and_history_between_chunks() {
        let coefficients = [0, 0, 0, 131_072];
        let mut resampler = FceummFirResampler::new(&coefficients, 98_304);

        assert_eq!(resampler.process(&(0..12).collect::<Vec<_>>()), [2, 3, 5, 6]);
        assert_eq!(resampler.process(&(12..18).collect::<Vec<_>>()), [8, 9, 11, 12]);
    }

    #[test]
    fn waits_for_enough_input_before_using_fir_history() {
        let coefficients = [0, 0, 0, 131_072];
        let mut resampler = FceummFirResampler::new(&coefficients, 65_536);

        assert!(resampler.process(&[1, 2, 3, 4, 5]).is_empty());
        assert_eq!(resampler.process(&[6, 7, 8, 9, 10, 11]), [3, 4, 5, 6, 7]);
    }

    #[test]
    fn very_high_44100_factory_uses_the_fceumm_table() {
        let mut resampler = FceummFirResampler::new_very_high_44100_ntsc();
        let mut input = vec![0; 2048];
        input[1025] = 65_536;

        let output = resampler.process(&input);

        assert_eq!(output.first(), Some(&58));
        assert!(output.iter().any(|&sample| sample != 0));
    }

    #[test]
    fn post_filter_preserves_state_between_output_batches() {
        let mut filter = FceummPostFilter::new_very_high_44100();
        let mut first = [1_000, 2_000];
        let mut second = [3_000, 4_000];
        filter.process(&mut first);
        filter.process(&mut second);

        let mut combined_filter = FceummPostFilter::new_very_high_44100();
        let mut combined = [1_000, 2_000, 3_000, 4_000];
        combined_filter.process(&mut combined);

        assert_eq!([first[0], first[1], second[0], second[1]], combined);
    }
}