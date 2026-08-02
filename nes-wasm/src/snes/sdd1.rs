const EVOLUTION_TABLE: [(u8, u8, u8); 33] = [
    (0, 25, 25),
    (0, 2, 1),
    (0, 3, 1),
    (0, 4, 2),
    (0, 5, 3),
    (1, 6, 4),
    (1, 7, 5),
    (1, 8, 6),
    (1, 9, 7),
    (2, 10, 8),
    (2, 11, 9),
    (2, 12, 10),
    (2, 13, 11),
    (3, 14, 12),
    (3, 15, 13),
    (3, 16, 14),
    (3, 17, 15),
    (4, 18, 16),
    (4, 19, 17),
    (5, 20, 18),
    (5, 21, 19),
    (6, 22, 20),
    (6, 23, 21),
    (7, 24, 22),
    (7, 24, 23),
    (0, 26, 1),
    (1, 27, 2),
    (2, 28, 4),
    (3, 29, 8),
    (4, 30, 12),
    (5, 31, 16),
    (6, 32, 18),
    (7, 24, 22),
];

const RUN_TABLE: [u8; 128] = [
    128, 64, 96, 32, 112, 48, 80, 16, 120, 56, 88, 24, 104, 40, 72, 8,
    124, 60, 92, 28, 108, 44, 76, 12, 116, 52, 84, 20, 100, 36, 68, 4,
    126, 62, 94, 30, 110, 46, 78, 14, 118, 54, 86, 22, 102, 38, 70, 6,
    122, 58, 90, 26, 106, 42, 74, 10, 114, 50, 82, 18, 98, 34, 66, 2,
    127, 63, 95, 31, 111, 47, 79, 15, 119, 55, 87, 23, 103, 39, 71, 7,
    123, 59, 91, 27, 107, 43, 75, 11, 115, 51, 83, 19, 99, 35, 67, 3,
    125, 61, 93, 29, 109, 45, 77, 13, 117, 53, 85, 21, 101, 37, 69, 5,
    121, 57, 89, 25, 105, 41, 73, 9, 113, 49, 81, 17, 97, 33, 65, 1,
];

struct Decoder<'a> {
    input: &'a [u8],
    input_pos: usize,
    stream: u16,
    valid_bits: i32,
    bit_count: [u8; 8],
    context_state: [u8; 32],
    context_mps: [u8; 32],
    previous_bits: [u16; 8],
    high_context_bits: u16,
    low_context_bits: u16,
    truncated: bool,
}

impl<'a> Decoder<'a> {
    fn new(input: &'a [u8]) -> Option<Self> {
        if input.len() < 2 {
            return None;
        }

        let (high_context_bits, low_context_bits) = match input[0] & 0x30 {
            0x00 => (0x01C0, 0x0001),
            0x10 => (0x0180, 0x0001),
            0x20 => (0x00C0, 0x0001),
            _ => (0x0180, 0x0003),
        };

        Some(Self {
            input,
            input_pos: 2,
            stream: ((input[0] as u16) << 11) | ((input[1] as u16) << 3),
            valid_bits: 5,
            bit_count: [0; 8],
            context_state: [0; 32],
            context_mps: [0; 32],
            previous_bits: [0; 8],
            high_context_bits,
            low_context_bits,
            truncated: false,
        })
    }

    fn next_input_byte(&mut self) -> u8 {
        let Some(value) = self.input.get(self.input_pos).copied() else {
            self.truncated = true;
            return 0;
        };
        self.input_pos = self.input_pos.saturating_add(1);
        value
    }

    fn codeword(&mut self, bits: u8) -> u8 {
        if self.valid_bits == 0 {
            self.stream |= self.next_input_byte() as u16;
            self.valid_bits = 8;
        }

        self.stream = self.stream.wrapping_shl(1);
        self.valid_bits -= 1;
        self.stream ^= 0x8000;

        if self.stream & 0x8000 != 0 {
            return 0x80 | (1 << bits);
        }

        let index = ((self.stream >> 8) | (0x7F >> bits)) as usize;
        self.stream = self.stream.wrapping_shl(bits as u32);
        self.valid_bits -= bits as i32;
        if self.valid_bits < 0 {
            self.stream |= (self.next_input_byte() as u16) << (-self.valid_bits as u32);
            self.valid_bits += 8;
        }
        RUN_TABLE[index]
    }

    fn golomb_bit(&mut self, code_size: u8) -> u8 {
        let index = (code_size & 7) as usize;
        if self.bit_count[index] == 0 {
            self.bit_count[index] = self.codeword(code_size);
        }
        self.bit_count[index] = self.bit_count[index].wrapping_sub(1);
        if self.bit_count[index] == 0x80 {
            self.bit_count[index] = 0;
            2
        } else if self.bit_count[index] == 0 {
            1
        } else {
            0
        }
    }

    fn probability_bit(&mut self, context: u8) -> u8 {
        let context_index = context as usize;
        let state = self.context_state[context_index] as usize;
        let (code_size, mps_next, lps_next) = EVOLUTION_TABLE[state];
        let bit = self.golomb_bit(code_size);

        if bit & 1 != 0 {
            self.context_state[context_index] = lps_next;
            if state < 2 {
                self.context_mps[context_index] ^= 1;
                self.context_mps[context_index]
            } else {
                self.context_mps[context_index] ^ 1
            }
        } else {
            if bit != 0 {
                self.context_state[context_index] = mps_next;
            }
            self.context_mps[context_index]
        }
    }

    fn bit(&mut self, plane: u8) -> u8 {
        let previous = self.previous_bits[plane as usize];
        let context = ((plane & 1) << 4)
            | (((previous & self.high_context_bits) >> 5) as u8)
            | ((previous & self.low_context_bits) as u8);
        let value = self.probability_bit(context);
        self.previous_bits[plane as usize] = previous.wrapping_shl(1) | value as u16;
        value
    }

    fn pair(&mut self, plane: u8) -> (u8, u8) {
        let mut first = 0;
        let mut second = 0;
        for mask in [0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01] {
            if self.bit(plane) != 0 {
                first |= mask;
            }
            if self.bit(plane + 1) != 0 {
                second |= mask;
            }
        }
        (first, second)
    }

    fn decode(&mut self, bitplane_type: u8, output_len: usize) -> Vec<u8> {
        let mut output = Vec::with_capacity(output_len);
        match bitplane_type {
            0 => {
                while output.len() < output_len {
                    let (first, second) = self.pair(0);
                    output.push(first);
                    if output.len() < output_len {
                        output.push(second);
                    }
                }
            }
            1 => {
                let mut plane = 0;
                let mut bit_count = 0u8;
                while output.len() < output_len {
                    let (first, second) = self.pair(plane);
                    output.push(first);
                    if output.len() < output_len {
                        output.push(second);
                    }
                    bit_count = bit_count.wrapping_add(32);
                    if bit_count == 0 {
                        plane = (plane + 2) & 7;
                    }
                }
            }
            2 => {
                let mut plane = 0;
                let mut bit_count = 0u8;
                while output.len() < output_len {
                    let (first, second) = self.pair(plane);
                    output.push(first);
                    if output.len() < output_len {
                        output.push(second);
                    }
                    bit_count = bit_count.wrapping_add(32);
                    if bit_count == 0 {
                        plane ^= 2;
                    }
                }
            }
            _ => {
                while output.len() < output_len {
                    let mut value = 0;
                    for bit in 0..8 {
                        if self.bit(bit) != 0 {
                            value |= 1 << bit;
                        }
                    }
                    output.push(value);
                }
            }
        }
        output
    }
}

pub fn decompress(input: &[u8], output_len: usize) -> Option<Vec<u8>> {
    let mut decoder = Decoder::new(input)?;
    let output = decoder.decode(input[0] >> 6, output_len);
    (!decoder.truncated).then_some(output)
}

#[cfg(test)]
mod tests {
    use super::decompress;

    fn digest(bytes: &[u8]) -> u64 {
        let mut value = 0xcbf29ce484222325u64;
        for byte in bytes {
            value ^= *byte as u64;
            value = value.wrapping_mul(0x100000001b3);
        }
        value
    }

    #[test]
    fn rejects_truncated_sdd1_header() {
        assert!(decompress(&[], 1).is_none());
        assert!(decompress(&[0], 1).is_none());
        assert!(decompress(&[0xD0, 0x2A], 96).is_none());
        assert_eq!(decompress(&[0xD0, 0x2A], 0), Some(Vec::new()));
    }

    #[test]
    fn preserves_requested_output_length_for_all_bitplane_modes() {
        for mode in 0..4u8 {
            let input = [mode << 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            let output = decompress(&input, 37).expect("valid S-DD1 header");
            assert_eq!(output.len(), 37);
        }
    }

    #[test]
    fn covers_all_bitplane_and_context_combinations() {
        let payload = [
            0x2A, 0xAA, 0x55, 0x33, 0xCC, 0xF0, 0x0F, 0x96,
            0x69, 0x3C, 0xC3, 0x81, 0x7E, 0x18, 0xE7, 0x42,
        ];
        let expected = [
            [0xE35EEFCD23C2E853, 0x47E358222ECEB3C8, 0xAA23E2900C330798, 0xFDBC0BC20DD192D7],
            [0xA6307AB32CE07F0A, 0x85F2A8395D0B1BED, 0xD08258B86561D673, 0x4A55A57DF4885EAE],
            [0x2254F69A285E9AC4, 0x7E4A4AF156C9ECE7, 0x7A2F29B99671D281, 0x1557561906D9D9E7],
            [0x5EF3EB3CB6380D92, 0xDC37F87F9E418913, 0x01054B52C32140CF, 0x028755BFD5F8F633],
        ];
        for mode in 0..4u8 {
            for (context_index, context) in [0x00, 0x10, 0x20, 0x30].into_iter().enumerate() {
                let mut input = Vec::with_capacity(payload.len() + 2);
                input.push((mode << 6) | context);
                input.push(0x17);
                input.extend_from_slice(&payload);
                input.resize(0x10000, 0);
                let output = decompress(&input, 257).expect("valid S-DD1 vector");
                let repeated = decompress(&input, 257).expect("valid S-DD1 vector");
                assert_eq!(output.len(), 257);
                assert_eq!(output, repeated);
                assert_eq!(digest(&output), expected[mode as usize][context_index]);
            }
        }

        let mut maximum_input = vec![0; 0x10002];
        maximum_input[0] = 0xF0;
        maximum_input[1] = 0x17;
        maximum_input[2..2 + payload.len()].copy_from_slice(&payload);
        let maximum = decompress(&maximum_input, 0x10000).expect("maximum S-DD1 vector");
        assert_eq!(maximum.len(), 0x10000);
    }

    #[test]
    fn decoding_is_deterministic_and_does_not_mutate_input() {
        let mut input = vec![0xD0, 0x2A, 0xAA, 0x55, 0x33, 0xCC, 0xF0, 0x0F];
        input.resize(0x10000, 0);
        let original = input.clone();
        let first = decompress(&input, 96).expect("valid S-DD1 stream");
        let second = decompress(&input, 96).expect("valid S-DD1 stream");
        assert_eq!(
            first,
            vec![
                0, 138, 8, 178, 24, 164, 201, 34, 160, 0, 32, 0, 0, 2, 0, 0,
                8, 2, 136, 2, 168, 0, 168, 2, 160, 0, 32, 0, 0, 2, 0, 0,
                8, 2, 136, 2, 168, 0, 168, 2, 160, 0, 32, 0, 0, 2, 0, 0,
                8, 2, 136, 2, 168, 0, 168, 2, 160, 0, 32, 0, 0, 2, 0, 0,
                8, 2, 136, 2, 168, 0, 168, 2, 160, 0, 32, 0, 0, 2, 0, 0,
                8, 2, 136, 2, 168, 0, 168, 2, 160, 0, 32, 0, 0, 2, 0, 0,
            ],
        );
        assert_eq!(first, second);
        assert_eq!(input, original);
    }
}