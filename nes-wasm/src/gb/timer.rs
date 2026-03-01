// ============================================================
// Game Boy Timer - DIV / TIMA / TMA / TAC
// ============================================================
// DIV ($FF04): 16384 Hz 遞增（每 256 T-cycles）
// TIMA ($FF05): 依 TAC 頻率遞增，溢出時觸發 Timer 中斷
// TMA ($FF06): TIMA 溢出重載值
// TAC ($FF07): 計時器控制（啟用 + 頻率選擇）
// ============================================================

pub struct Timer {
    /// 內部 16-bit 分頻計數器（DIV 是高 8 位元）
    pub div_counter: u16,
    /// TIMA 計數器 ($FF05)
    pub tima: u8,
    /// TMA 重載值 ($FF06)
    pub tma: u8,
    /// TAC 控制暫存器 ($FF07)
    pub tac: u8,
    /// TIMA 溢出延遲（溢出後下一個 M-cycle 才載入 TMA 並觸發 IRQ）
    pub overflow_pending: bool,
    pub overflow_countdown: u8,
    /// Timer 中斷請求
    pub irq: bool,
}

impl Timer {
    pub fn new() -> Self {
        Timer {
            div_counter: 0xABCC, // 跳過 Boot ROM 後的初始值
            tima: 0,
            tma: 0,
            tac: 0,
            overflow_pending: false,
            overflow_countdown: 0,
            irq: false,
        }
    }

    /// 推進 T-cycles 個時鐘（通常每 M-cycle 呼叫一次，t_cycles=4）
    pub fn tick(&mut self, t_cycles: u32) {
        for _ in 0..t_cycles {
            let old_div = self.div_counter;
            self.div_counter = self.div_counter.wrapping_add(1);

            // 處理 TIMA 溢出延遲
            if self.overflow_pending {
                self.overflow_countdown -= 1;
                if self.overflow_countdown == 0 {
                    self.overflow_pending = false;
                    self.tima = self.tma;
                    self.irq = true;
                }
            }

            // TAC bit 2: Timer 啟用
            if self.tac & 0x04 != 0 {
                // 偵測 falling edge（舊值為 1，新值為 0）
                let bit = self.tac_bit();
                let old_bit = (old_div >> bit) & 1;
                let new_bit = (self.div_counter >> bit) & 1;

                if old_bit == 1 && new_bit == 0 {
                    let (new_tima, overflow) = self.tima.overflowing_add(1);
                    if overflow {
                        self.tima = 0; // 暫時設為 0，下 4 T-cycle 載入 TMA
                        self.overflow_pending = true;
                        self.overflow_countdown = 4;
                    } else {
                        self.tima = new_tima;
                    }
                }
            }
        }
    }

    /// 根據 TAC 取得 DIV 要檢測的 bit 位置
    fn tac_bit(&self) -> u8 {
        match self.tac & 0x03 {
            0 => 9,  // 4096 Hz    (每 1024 T-cycles)
            1 => 3,  // 262144 Hz  (每 16 T-cycles)
            2 => 5,  // 65536 Hz   (每 64 T-cycles)
            3 => 7,  // 16384 Hz   (每 256 T-cycles)
            _ => unreachable!(),
        }
    }

    /// 讀取 DIV ($FF04) - 回傳高 8 位元
    pub fn read_div(&self) -> u8 {
        (self.div_counter >> 8) as u8
    }

    /// 寫入 DIV ($FF04) - 任何寫入都將 DIV 重置為 0
    pub fn write_div(&mut self) {
        self.div_counter = 0;
    }
}
