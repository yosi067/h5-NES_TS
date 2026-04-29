// ============================================================
// SNES DMA & HDMA 引擎
// ============================================================
// 8 個 DMA/HDMA 通道
// DMA: 通用資料搬移 (VBlank 期間大量傳輸)
// HDMA: 每條掃描線自動更新暫存器 (色彩漸變、捲軸特效)
// ============================================================

/// DMA 傳輸方向
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum DmaDirection {
    AtoB,  // CPU → PPU (A-bus → B-bus)
    BtoA,  // PPU → CPU (B-bus → A-bus)
}

/// DMA 通道
#[derive(Clone)]
pub struct DmaChannel {
    // === 暫存器 ($43x0-$43xA) ===
    /// $43x0 - DMA 控制
    pub control: u8,
    /// $43x1 - B-Bus 位址 ($21xx)
    pub b_addr: u8,
    /// $43x2-$43x4 - A-Bus 位址 (24-bit)
    pub a_addr: u16,
    pub a_bank: u8,
    /// $43x5-$43x6 - 傳輸位元組數 / HDMA 間接位址
    pub count: u16,
    /// $43x7 - HDMA 間接 Bank
    pub hdma_bank: u8,
    /// $43x8-$43x9 - HDMA 表格位址
    pub hdma_addr: u16,
    /// $43xA - HDMA 行計數器
    pub hdma_line_counter: u8,

    // === HDMA 內部狀態 ===
    /// HDMA indirect data pointer (separate from count/$43x5-$43x6)
    pub indirect_addr: u16,
    pub hdma_do_transfer: bool,
    pub hdma_completed: bool,
}

impl DmaChannel {
    pub fn new() -> Self {
        DmaChannel {
            control: 0xFF,
            b_addr: 0xFF,
            a_addr: 0xFFFF,
            a_bank: 0xFF,
            count: 0xFFFF,
            hdma_bank: 0xFF,
            hdma_addr: 0,
            hdma_line_counter: 0,
            indirect_addr: 0,
            hdma_do_transfer: false,
            hdma_completed: false,
        }
    }

    /// 傳輸方向
    pub fn direction(&self) -> DmaDirection {
        if self.control & 0x80 != 0 { DmaDirection::BtoA } else { DmaDirection::AtoB }
    }

    /// 傳輸模式 (0-7)
    pub fn transfer_mode(&self) -> u8 {
        self.control & 0x07
    }

    /// A-Bus 位址調整模式
    pub fn a_adjust(&self) -> i16 {
        match (self.control >> 3) & 0x03 {
            0 => 1,   // 遞增
            1 => 0,   // 固定
            2 => -1,  // 遞減
            3 => 0,   // 固定
            _ => 0,
        }
    }

    /// HDMA 間接模式
    pub fn hdma_indirect(&self) -> bool {
        self.control & 0x40 != 0
    }
}

/// DMA 控制器（8 通道）
pub struct DmaController {
    pub channels: [DmaChannel; 8],
    /// $420B - DMA 啟用
    pub dma_enable: u8,
    /// $420C - HDMA 啟用
    pub hdma_enable: u8,
    /// Debug: ch0 write log
    pub ch0_write_log: String,
}

impl DmaController {
    pub fn new() -> Self {
        DmaController {
            channels: [
                DmaChannel::new(), DmaChannel::new(), DmaChannel::new(), DmaChannel::new(),
                DmaChannel::new(), DmaChannel::new(), DmaChannel::new(), DmaChannel::new(),
            ],
            dma_enable: 0,
            hdma_enable: 0,
            ch0_write_log: String::new(),
        }
    }

    pub fn reset(&mut self) {
        for ch in &mut self.channels {
            *ch = DmaChannel::new();
        }
        self.dma_enable = 0;
        self.hdma_enable = 0;
        self.ch0_write_log.clear();
    }

    /// 寫入 DMA 暫存器
    pub fn write_register(&mut self, addr: u16, val: u8) {
        let ch = ((addr >> 4) & 0x07) as usize;
        let reg = addr & 0x0F;

        match reg {
            0x00 => self.channels[ch].control = val,
            0x01 => self.channels[ch].b_addr = val,
            0x02 => self.channels[ch].a_addr = (self.channels[ch].a_addr & 0xFF00) | val as u16,
            0x03 => self.channels[ch].a_addr = (self.channels[ch].a_addr & 0x00FF) | ((val as u16) << 8),
            0x04 => self.channels[ch].a_bank = val,
            0x05 => self.channels[ch].count = (self.channels[ch].count & 0xFF00) | val as u16,
            0x06 => self.channels[ch].count = (self.channels[ch].count & 0x00FF) | ((val as u16) << 8),
            0x07 => self.channels[ch].hdma_bank = val,
            0x08 => self.channels[ch].hdma_addr = (self.channels[ch].hdma_addr & 0xFF00) | val as u16,
            0x09 => self.channels[ch].hdma_addr = (self.channels[ch].hdma_addr & 0x00FF) | ((val as u16) << 8),
            0x0A => self.channels[ch].hdma_line_counter = val,
            _ => {}
        }
    }

    /// 讀取 DMA 暫存器
    pub fn read_register(&self, addr: u16) -> u8 {
        let ch = ((addr >> 4) & 0x07) as usize;
        let reg = addr & 0x0F;

        match reg {
            0x00 => self.channels[ch].control,
            0x01 => self.channels[ch].b_addr,
            0x02 => self.channels[ch].a_addr as u8,
            0x03 => (self.channels[ch].a_addr >> 8) as u8,
            0x04 => self.channels[ch].a_bank,
            0x05 => self.channels[ch].count as u8,
            0x06 => (self.channels[ch].count >> 8) as u8,
            0x07 => self.channels[ch].hdma_bank,
            0x08 => self.channels[ch].hdma_addr as u8,
            0x09 => (self.channels[ch].hdma_addr >> 8) as u8,
            0x0A => self.channels[ch].hdma_line_counter,
            _ => 0,
        }
    }

    /// HDMA 初始化（VBlank 開始時呼叫）
    /// Only resets the address pointer and marks as not completed.
    /// The emulator must then call hdma_init_read() to read the first table entries.
    pub fn hdma_init(&mut self) {
        // Initialize ALL 8 channels at frame start, not just currently enabled ones.
        // This ensures channels that get enabled mid-frame (via $420C) start from
        // the correct table address, preventing out-of-sync duplicate channels.
        // (e.g. SoM uses ch0-3 and ch4-7 as duplicate HDMA sets enabled at different times)
        for i in 0..8 {
            let ch = &mut self.channels[i];
            ch.hdma_addr = ch.a_addr;
            ch.hdma_line_counter = 0;
            ch.hdma_do_transfer = false;
            ch.hdma_completed = if self.hdma_enable & (1 << i) != 0 { false } else { true };
        }
    }

    /// 取得 B-Bus 偏移（根據傳輸模式）
    pub fn get_b_offsets(mode: u8) -> &'static [u8] {
        match mode {
            0 => &[0],           // 1 byte:  p
            1 => &[0, 1],       // 2 bytes: p, p+1
            2 => &[0, 0],       // 2 bytes: p, p
            3 => &[0, 0, 1, 1], // 4 bytes: p, p, p+1, p+1
            4 => &[0, 1, 2, 3], // 4 bytes: p, p+1, p+2, p+3
            5 => &[0, 1, 0, 1], // 4 bytes: p, p+1, p, p+1
            6 => &[0, 0],       // 2 bytes: p, p (same as 2)
            7 => &[0, 0, 1, 1], // 4 bytes: p, p, p+1, p+1 (same as 3)
            _ => &[0],
        }
    }
}
