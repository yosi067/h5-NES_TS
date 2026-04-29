#[derive(Clone, Debug)]
pub struct Vr4300 {
    pub regs: [u64; 32],
    pub hi: u64,
    pub lo: u64,
    pub pc: u64,
    pub next_pc: u64,
    pub count: u64,
    pub status: u32,
    pub cause: u32,
    pub epc: u64,
}

impl Vr4300 {
    /// 建立 VR4300 CPU 的初始狀態。
    ///
    /// 真機開機後會由 PIF/CIC 完成安全檢查，再跳到 cartridge boot code。
    /// 目前 scaffold 先從 `0xA400_0040` 開始，這是 N64 boot code 常見的執行位置。
    pub fn new() -> Self {
        Self {
            regs: [0; 32],
            hi: 0,
            lo: 0,
            pc: 0xA400_0040,
            next_pc: 0xA400_0044,
            count: 0,
            status: 0x3400_0000,
            cause: 0,
            epc: 0,
        }
    }

    /// 將 CPU 重設到 boot code 起點。
    /// 之後若加入 PIF ROM / CIC 模擬，會在這裡設定更完整的 CP0 與暫存器初值。
    pub fn reset_to_boot_code(&mut self) {
        *self = Self::new();
    }

    /// 暫時的 CPU step。
    ///
    /// 目前還沒有真正解碼 MIPS III 指令；這個函式只推進 PC/count，讓 WASM/UI
    /// 有穩定的 frame loop 可以測 loader 與 frontend。下一階段會替換成 interpreter。
    pub fn step_stub(&mut self) {
        self.pc = self.next_pc;
        self.next_pc = self.next_pc.wrapping_add(4);
        self.count = self.count.wrapping_add(1);
        self.regs[0] = 0;
    }
}