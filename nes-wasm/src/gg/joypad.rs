// ============================================================
// Game Gear / SMS Joypad — 輸入處理
// ============================================================
// GG: D-Pad, Button 1, Button 2, Start
// SMS: D-Pad, Button 1, Button 2 (×2 players)
// I/O 端口：$DC (Port A), $DD (Port B)
// GG Start: 端口 $00 bit 7
// ============================================================

pub struct Joypad {
    // 按鍵狀態 (active-low: 0 = 按下)
    // Bit mapping (NES 相容):
    //   0 = Button 1 (A)
    //   1 = Button 2 (B)
    //   2 = (unused)
    //   3 = Start
    //   4 = Up
    //   5 = Down
    //   6 = Left
    //   7 = Right
    pub buttons: u8,   // 原始輸入 (1 = 按下)
}

impl Joypad {
    pub fn new() -> Self {
        Joypad {
            buttons: 0,
        }
    }

    pub fn set_input(&mut self, buttons: u8) {
        self.buttons = buttons;
    }

    /// 讀取端口 $DC (Player 1 + 部分 Player 2)
    /// Bit 0: P1 Up     (active low)
    /// Bit 1: P1 Down
    /// Bit 2: P1 Left
    /// Bit 3: P1 Right
    /// Bit 4: P1 Button 1 (TL)
    /// Bit 5: P1 Button 2 (TR)
    /// Bit 6: P2 Up
    /// Bit 7: P2 Down
    pub fn read_port_dc(&self) -> u8 {
        let mut result: u8 = 0xFF; // 全部放開

        // P1 方向鍵
        if self.buttons & (1 << 4) != 0 { result &= !0x01; } // Up
        if self.buttons & (1 << 5) != 0 { result &= !0x02; } // Down
        if self.buttons & (1 << 6) != 0 { result &= !0x04; } // Left
        if self.buttons & (1 << 7) != 0 { result &= !0x08; } // Right

        // P1 按鈕
        if self.buttons & (1 << 0) != 0 { result &= !0x10; } // Button 1 (A)
        if self.buttons & (1 << 1) != 0 { result &= !0x20; } // Button 2 (B)

        // P2 不處理 (保持高位)

        result
    }

    /// 讀取端口 $DD (Player 2 剩餘 + 其他)
    /// Bit 0: P2 Left
    /// Bit 1: P2 Right
    /// Bit 2: P2 Button 1
    /// Bit 3: P2 Button 2
    /// Bit 4: Reset (active low)
    /// Bit 5-7: 未使用 / 國碼
    pub fn read_port_dd(&self) -> u8 {
        0xFF // Player 2 不處理
    }

    /// GG 端口 $00 讀取
    /// Bit 7: Start 按鈕 (active low: 0 = 按下)
    /// Bit 6: 區域碼 (0 = Japanese, 1 = Export)
    /// Bit 5-1: 未使用 (pulled high)
    /// Bit 0: 模式 (0 = Game Gear, 1 = Master System)
    pub fn read_gg_port_00(&self) -> u8 {
        // 預設值: 0xFE = 1111_1110
        //   bit 7 = 1 (Start 未按下)
        //   bit 6 = 1 (Export 區域)
        //   bit 5-1 = 11111 (pulled high)
        //   bit 0 = 0 (Game Gear 模式 ← 關鍵！)
        let mut val: u8 = 0xFE;

        // Start 按鈕 (active low: 按下時 bit 7 = 0)
        if self.buttons & (1 << 3) != 0 {
            val &= !0x80; // pressed → clear bit 7
        }

        val
    }
}
