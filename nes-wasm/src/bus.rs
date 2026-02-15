// ============================================================
// NES 記憶體匯流排 - CPU/PPU 位址空間映射
// ============================================================
// 負責管理 CPU 的記憶體存取，包含：
//
// CPU 記憶體映射（16 位元位址空間，$0000-$FFFF）：
// $0000-$07FF: 2KB 內部 RAM
// $0800-$1FFF: RAM 鏡像（每 2KB 重複）
// $2000-$2007: PPU 暫存器
// $2008-$3FFF: PPU 暫存器鏡像（每 8 位元組重複）
// $4000-$4017: APU 和 I/O 暫存器
// $4018-$401F: 通常禁用的 APU 和 I/O 功能
// $4020-$FFFF: 卡帶空間（PRG ROM, PRG RAM, mapper 暫存器）
//
// DMA 傳輸：
// 寫入 $4014 會觸發 OAM DMA，將 256 位元組從 CPU 記憶體
// 複製到 PPU 的 OAM（精靈屬性記憶體）
//
// 參考：https://www.nesdev.org/wiki/CPU_memory_map
// ============================================================

use crate::ppu::Ppu;
use crate::apu::Apu;
use crate::cartridge::Cartridge;
use crate::controller::Controller;

/// NES 記憶體匯流排
pub struct Bus {
    /// 2KB 內部 RAM
    pub ram: [u8; 2048],

    /// DMA 頁面位址（高位元組）
    pub dma_page: u8,
    /// DMA 低位元組位址
    pub dma_address: u8,
    /// DMA 讀取到的資料
    pub dma_data: u8,
    /// 是否正在進行 DMA 傳輸
    pub dma_transfer: bool,
    /// DMA 等待對齊旗標
    pub dma_dummy: bool,
}

impl Bus {
    /// 建立新的匯流排
    pub fn new() -> Self {
        Bus {
            ram: [0; 2048],
            dma_page: 0,
            dma_address: 0,
            dma_data: 0,
            dma_transfer: false,
            dma_dummy: true,
        }
    }

    /// 重置匯流排狀態
    pub fn reset(&mut self) {
        self.ram = [0; 2048];
        self.dma_page = 0;
        self.dma_address = 0;
        self.dma_data = 0;
        self.dma_transfer = false;
        self.dma_dummy = true;
    }

    /// CPU 讀取記憶體
    /// 需要傳入 PPU、APU、卡帶、控制器的引用
    pub fn cpu_read(
        &self,
        addr: u16,
        ppu: &mut Ppu,
        apu: &mut Apu,
        cartridge: &Cartridge,
        ctrl1: &mut Controller,
        ctrl2: &mut Controller,
    ) -> u8 {
        let addr = addr & 0xFFFF;

        // 卡帶空間 ($4020-$FFFF)
        if addr >= 0x4020 {
            return cartridge.cpu_read(addr);
        }

        // 內部 RAM ($0000-$1FFF，每 2KB 鏡像)
        if addr < 0x2000 {
            return self.ram[(addr & 0x07FF) as usize];
        }

        // PPU 暫存器 ($2000-$3FFF，每 8 位元組鏡像)
        if addr < 0x4000 {
            return ppu.cpu_read(addr & 0x2007);
        }

        // 控制器 1 ($4016)
        if addr == 0x4016 {
            return ctrl1.read();
        }

        // 控制器 2 ($4017)
        if addr == 0x4017 {
            return ctrl2.read();
        }

        // APU 狀態暫存器 ($4015)
        if addr == 0x4015 {
            return apu.cpu_read();
        }

        0
    }

    /// CPU 寫入記憶體
    pub fn cpu_write(
        &mut self,
        addr: u16,
        data: u8,
        ppu: &mut Ppu,
        apu: &mut Apu,
        cartridge: &mut Cartridge,
        ctrl1: &mut Controller,
        ctrl2: &mut Controller,
    ) {
        let addr = addr & 0xFFFF;
        let data = data & 0xFF;

        // 卡帶空間 ($4020-$FFFF)
        if addr >= 0x4020 {
            cartridge.cpu_write(addr, data);
            return;
        }

        // 內部 RAM ($0000-$1FFF)
        if addr < 0x2000 {
            self.ram[(addr & 0x07FF) as usize] = data;
            return;
        }

        // PPU 暫存器 ($2000-$3FFF)
        if addr < 0x4000 {
            ppu.cpu_write(addr & 0x2007, data);
            return;
        }

        // OAM DMA ($4014)
        if addr == 0x4014 {
            self.dma_page = data;
            self.dma_address = 0;
            self.dma_transfer = true;
            self.dma_dummy = true;
            return;
        }

        // 控制器 ($4016) - 寫入會鎖存控制器狀態
        if addr == 0x4016 {
            ctrl1.write(data);
            ctrl2.write(data);
            return;
        }

        // APU 暫存器 ($4000-$4013, $4015, $4017)
        if (addr >= 0x4000 && addr <= 0x4013) || addr == 0x4015 || addr == 0x4017 {
            apu.cpu_write(addr, data);
            return;
        }
    }

    /// 執行 DMA 時鐘週期
    /// 在 DMA 傳輸期間，CPU 被暫停，匯流排忙於搬運資料
    pub fn do_dma_cycle(
        &mut self,
        odd_cycle: bool,
        ppu: &mut Ppu,
        apu: &mut Apu,
        cartridge: &Cartridge,
        ctrl1: &mut Controller,
        ctrl2: &mut Controller,
    ) {
        if !self.dma_transfer {
            return;
        }

        if self.dma_dummy {
            // 等待 CPU 週期對齊到奇數週期
            if odd_cycle {
                self.dma_dummy = false;
            }
        } else {
            if !odd_cycle {
                // 偶數週期：從 CPU 記憶體讀取
                let addr = (self.dma_page as u16) << 8 | self.dma_address as u16;
                self.dma_data = self.cpu_read(addr, ppu, apu, cartridge, ctrl1, ctrl2);
            } else {
                // 奇數週期：寫入 PPU OAM
                ppu.oam[self.dma_address as usize] = self.dma_data;
                self.dma_address = self.dma_address.wrapping_add(1);
                if self.dma_address == 0 {
                    // 已傳輸 256 位元組，DMA 完成
                    self.dma_transfer = false;
                }
            }
        }
    }
}
