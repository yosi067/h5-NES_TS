// ============================================================
// Game Boy Joypad 輸入 ($FF00)
// ============================================================
// Bit 5: 選擇方向鍵 (0=選取)
// Bit 4: 選擇按鈕 (0=選取)
// Bit 3-0: 輸入狀態 (0=按下)
//
// 按鈕映射 (與 NES 相同的 8-bit 格式):
// Bit 0: A      Bit 4: Up
// Bit 1: B      Bit 5: Down
// Bit 2: Select Bit 6: Left
// Bit 3: Start  Bit 7: Right
// ============================================================

pub struct Joypad {
    /// 按鈕狀態（每 bit 為 1 = 按下）
    pub buttons: u8,
    /// 選擇暫存器（$FF00 寫入值的 bit 5-4）
    pub select: u8,
    /// Joypad 中斷請求
    pub irq: bool,
}

impl Joypad {
    pub fn new() -> Self {
        Joypad {
            buttons: 0,
            select: 0x30,
            irq: false,
        }
    }

    /// 讀取 $FF00
    ///
    /// GB 硬體使用 active-low：bit = 0 表示按下，1 表示放開。
    /// 低 4 位從 0x0F（全部放開）開始，被選取的 bank 用 AND 清除按下的位。
    /// 當兩個 bank 同時選取時，AND 效果自然合併。
    pub fn read(&self) -> u8 {
        let mut lo: u8 = 0x0F; // 起始：全部放開

        if self.select & 0x20 == 0 {
            // 動作按鈕 bank：A → bit 0, B → bit 1, Select → bit 2, Start → bit 3
            let mut btns: u8 = 0x0F;
            if self.buttons & 0x01 != 0 { btns &= !0x01; } // A
            if self.buttons & 0x02 != 0 { btns &= !0x02; } // B
            if self.buttons & 0x04 != 0 { btns &= !0x04; } // Select
            if self.buttons & 0x08 != 0 { btns &= !0x08; } // Start
            lo &= btns;
        }

        if self.select & 0x10 == 0 {
            // 方向鍵 bank：Right → bit 0, Left → bit 1, Up → bit 2, Down → bit 3
            let mut dpad: u8 = 0x0F;
            if self.buttons & 0x80 != 0 { dpad &= !0x01; } // Right
            if self.buttons & 0x40 != 0 { dpad &= !0x02; } // Left
            if self.buttons & 0x10 != 0 { dpad &= !0x04; } // Up
            if self.buttons & 0x20 != 0 { dpad &= !0x08; } // Down
            lo &= dpad;
        }

        (self.select | 0xC0) | lo
    }

    /// 寫入 $FF00（只有 bit 5-4 可寫）
    pub fn write(&mut self, val: u8) {
        self.select = val & 0x30;
    }

    /// 設定按鈕狀態（外部輸入）
    pub fn set_input(&mut self, input: u8) {
        let old = self.read() & 0x0F;
        self.buttons = input;
        let new = self.read() & 0x0F;
        // 偵測 high-to-low 轉換（按鈕按下）→ 請求中斷
        if (old & !new) != 0 {
            self.irq = true;
        }
    }
}
