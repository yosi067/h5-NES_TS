// ============================================================
// SNES 控制器 - 12 鍵手把模擬
// ============================================================
// B, Y, Select, Start, Up, Down, Left, Right, A, X, L, R
// 透過 $4016/$4017 自動讀取 ($4218-$421F)
// ============================================================

/// SNES 控制器按鈕定義
/// 按鈕在 16-bit 暫存器中的位元位置
pub mod buttons {
    pub const B: u16      = 1 << 15;  // bit 15
    pub const Y: u16      = 1 << 14;  // bit 14
    pub const SELECT: u16 = 1 << 13;  // bit 13
    pub const START: u16  = 1 << 12;  // bit 12
    pub const UP: u16     = 1 << 11;  // bit 11
    pub const DOWN: u16   = 1 << 10;  // bit 10
    pub const LEFT: u16   = 1 << 9;   // bit 9
    pub const RIGHT: u16  = 1 << 8;   // bit 8
    pub const A: u16      = 1 << 7;   // bit 7
    pub const X: u16      = 1 << 6;   // bit 6
    pub const L: u16      = 1 << 5;   // bit 5
    pub const R: u16      = 1 << 4;   // bit 4
}

pub struct Controller {
    /// 當前按鈕狀態 (16-bit, 按下=1)
    pub state: u16,
    /// 自動讀取結果 (latched)
    pub auto_read_result: u16,
}

impl Controller {
    pub fn new() -> Self {
        Controller {
            state: 0,
            auto_read_result: 0,
        }
    }

    /// 設定按鈕狀態
    /// button: 0=B, 1=Y, 2=Select, 3=Start, 4=Up, 5=Down, 6=Left, 7=Right,
    ///         8=A, 9=X, 10=L, 11=R
    pub fn set_button(&mut self, button: u8, pressed: bool) {
        let mask = match button {
            0  => buttons::B,
            1  => buttons::Y,
            2  => buttons::SELECT,
            3  => buttons::START,
            4  => buttons::UP,
            5  => buttons::DOWN,
            6  => buttons::LEFT,
            7  => buttons::RIGHT,
            8  => buttons::A,
            9  => buttons::X,
            10 => buttons::L,
            11 => buttons::R,
            _  => return,
        };
        if pressed {
            self.state |= mask;
        } else {
            self.state &= !mask;
        }
    }

    /// 執行自動讀取（VBlank 期間由硬體觸發）
    pub fn auto_read(&mut self) {
        self.auto_read_result = self.state;
    }
}
