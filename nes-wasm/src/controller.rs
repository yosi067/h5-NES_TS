// ============================================================
// NES 控制器模擬
// ============================================================
// 標準 NES 控制器有 8 個按鈕，透過串列方式讀取：
// A, B, Select, Start, Up, Down, Left, Right
//
// CPU 通過寫入 $4016 來鎖存按鈕狀態，
// 然後逐位元讀取 $4016/$4017 來取得各按鈕狀態。
// ============================================================

/// 按鈕定義（與 JavaScript 端一致）
pub const BTN_A: u8 = 0;
pub const BTN_B: u8 = 1;
pub const BTN_SELECT: u8 = 2;
pub const BTN_START: u8 = 3;
pub const BTN_UP: u8 = 4;
pub const BTN_DOWN: u8 = 5;
pub const BTN_LEFT: u8 = 6;
pub const BTN_RIGHT: u8 = 7;

/// NES 控制器
pub struct Controller {
    /// 按鈕狀態（8 位元，每位元代表一個按鈕）
    button_state: u8,
    /// 目前讀取的移位暫存器
    shift_register: u8,
    /// 選通（strobe）模式
    strobe: bool,
}

impl Controller {
    /// 建立新的控制器
    pub fn new() -> Self {
        Controller {
            button_state: 0,
            shift_register: 0,
            strobe: false,
        }
    }

    /// 設定按鈕狀態
    /// button: 0-7 對應 A, B, Select, Start, Up, Down, Left, Right
    /// pressed: 是否按下
    pub fn set_button(&mut self, button: u8, pressed: bool) {
        if button > 7 { return; }
        if pressed {
            self.button_state |= 1 << button;
        } else {
            self.button_state &= !(1 << button);
        }
    }

    /// CPU 寫入（$4016）
    /// 寫入的最低位元控制選通模式
    pub fn write(&mut self, data: u8) {
        let new_strobe = data & 0x01 != 0;
        if self.strobe && !new_strobe {
            // 選通從高到低，鎖存目前的按鈕狀態
            self.shift_register = self.button_state;
        }
        self.strobe = new_strobe;
        if self.strobe {
            // 選通為高時，持續重新載入
            self.shift_register = self.button_state;
        }
    }

    /// CPU 讀取（$4016/$4017）
    /// 每次讀取回傳一個按鈕的狀態（最低位元）
    pub fn read(&mut self) -> u8 {
        if self.strobe {
            // 選通模式下，永遠回傳 A 按鈕的狀態
            return self.button_state & 1;
        }
        let value = self.shift_register & 1;
        self.shift_register >>= 1;
        // 移位完畢後填入 1（open bus 行為）
        self.shift_register |= 0x80;
        value
    }

    /// 重置控制器
    pub fn reset(&mut self) {
        self.button_state = 0;
        self.shift_register = 0;
        self.strobe = false;
    }
}
