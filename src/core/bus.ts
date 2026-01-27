/**
 * NES 記憶體匯流排
 * 
 * 負責管理 CPU 和 PPU 的記憶體存取
 * 
 * CPU 記憶體映射 (16 位元位址空間，$0000-$FFFF):
 * $0000-$07FF: 2KB 內部 RAM
 * $0800-$1FFF: RAM 鏡像 (每 2KB 重複)
 * $2000-$2007: PPU 暫存器
 * $2008-$3FFF: PPU 暫存器鏡像 (每 8 位元組重複)
 * $4000-$4017: APU 和 I/O 暫存器
 * $4018-$401F: 通常禁用的 APU 和 I/O 功能
 * $4020-$FFFF: 卡帶空間 (PRG ROM, PRG RAM, mapper 暫存器)
 */

import type { Ppu } from './ppu/ppu';
import type { Apu } from './apu/apu';
import type { Cartridge } from './cartridge';
import type { Controller } from './controller';

export class Bus {
  /** 2KB 內部 RAM */
  private ram: Uint8Array = new Uint8Array(2048);

  /** PPU 參考 */
  private ppu: Ppu | null = null;

  /** APU 參考 */
  private apu: Apu | null = null;

  /** 卡帶參考 */
  private cartridge: Cartridge | null = null;

  /** 控制器參考 */
  private controller1: Controller | null = null;
  private controller2: Controller | null = null;

  /** 控制器讀取狀態 */
  private controllerState: [number, number] = [0, 0];

  /** DMA 傳輸相關 */
  private dmaPage: number = 0;
  private dmaAddress: number = 0;
  private dmaData: number = 0;
  private dmaTransfer: boolean = false;
  private dmaDummy: boolean = true;

  constructor() {
    this.ram.fill(0);
  }

  // ===== 元件連接 =====

  /** 連接 PPU */
  public connectPpu(ppu: Ppu): void {
    this.ppu = ppu;
  }

  /** 連接 APU */
  public connectApu(apu: Apu): void {
    this.apu = apu;
  }

  /** 連接卡帶 */
  public connectCartridge(cartridge: Cartridge): void {
    this.cartridge = cartridge;
  }

  /** 連接控制器 */
  public connectController(port: 1 | 2, controller: Controller): void {
    if (port === 1) {
      this.controller1 = controller;
    } else {
      this.controller2 = controller;
    }
  }

  // ===== CPU 記憶體存取 =====

  /**
   * CPU 讀取記憶體
   * @param address 16 位元位址
   * @returns 8 位元資料
   */
  public cpuRead(address: number): number {
    address &= 0xFFFF;

    // 卡帶空間 ($4020-$FFFF)
    if (address >= 0x4020) {
      if (this.cartridge) {
        return this.cartridge.cpuRead(address);
      }
      return 0;
    }

    // 內部 RAM ($0000-$1FFF，每 2KB 鏡像)
    if (address < 0x2000) {
      return this.ram[address & 0x07FF];
    }

    // PPU 暫存器 ($2000-$3FFF，每 8 位元組鏡像)
    if (address < 0x4000) {
      if (this.ppu) {
        return this.ppu.cpuRead(address & 0x2007);
      }
      return 0;
    }

    // APU 和 I/O ($4000-$401F)
    if (address === 0x4016) {
      // 控制器 1
      const data = (this.controllerState[0] & 0x80) ? 1 : 0;
      this.controllerState[0] <<= 1;
      return data;
    }

    if (address === 0x4017) {
      // 控制器 2
      const data = (this.controllerState[1] & 0x80) ? 1 : 0;
      this.controllerState[1] <<= 1;
      return data;
    }

    // APU 狀態暫存器 ($4015)
    if (address === 0x4015 && this.apu) {
      return this.apu.cpuRead(address);
    }

    return 0;
  }

  /**
   * CPU 寫入記憶體
   * @param address 16 位元位址
   * @param data 8 位元資料
   */
  public cpuWrite(address: number, data: number): void {
    address &= 0xFFFF;
    data &= 0xFF;

    // 卡帶空間 ($4020-$FFFF)
    if (address >= 0x4020) {
      if (this.cartridge) {
        this.cartridge.cpuWrite(address, data);
      }
      return;
    }

    // 內部 RAM ($0000-$1FFF)
    if (address < 0x2000) {
      this.ram[address & 0x07FF] = data;
      return;
    }

    // PPU 暫存器 ($2000-$3FFF)
    if (address < 0x4000) {
      if (this.ppu) {
        this.ppu.cpuWrite(address & 0x2007, data);
      }
      return;
    }

    // OAM DMA ($4014)
    if (address === 0x4014) {
      this.dmaPage = data;
      this.dmaAddress = 0;
      this.dmaTransfer = true;
      this.dmaDummy = true;
      return;
    }

    // 控制器 ($4016)
    if (address === 0x4016) {
      this.controllerState[0] = this.controller1?.getState() ?? 0;
      this.controllerState[1] = this.controller2?.getState() ?? 0;
      return;
    }

    // APU 暫存器 ($4000-$4013, $4015, $4017)
    if ((address >= 0x4000 && address <= 0x4013) || address === 0x4015 || address === 0x4017) {
      if (this.apu) {
        this.apu.cpuWrite(address, data);
      }
      return;
    }
  }

  // ===== DMA 處理 =====

  /** 是否正在進行 DMA 傳輸 */
  public isDmaTransferring(): boolean {
    return this.dmaTransfer;
  }

  /** 執行 DMA 時鐘週期 */
  public doCycle(oddCycle: boolean): void {
    if (!this.dmaTransfer) return;

    if (this.dmaDummy) {
      // DMA 開始時需要等待對齊
      if (oddCycle) {
        this.dmaDummy = false;
      }
    } else {
      if (!oddCycle) {
        // 偶數週期：讀取資料
        this.dmaData = this.cpuRead((this.dmaPage << 8) | this.dmaAddress);
      } else {
        // 奇數週期：寫入 OAM
        if (this.ppu) {
          this.ppu.oamWrite(this.dmaAddress, this.dmaData);
        }
        this.dmaAddress++;
        if (this.dmaAddress > 255) {
          this.dmaTransfer = false;
          this.dmaAddress = 0;
        }
      }
    }
  }

  // ===== 除錯方法 =====

  /** 直接讀取 RAM (不經過 mapper) */
  public debugReadRam(address: number): number {
    return this.ram[address & 0x07FF];
  }

  /** 直接寫入 RAM (不經過 mapper) */
  public debugWriteRam(address: number, data: number): void {
    this.ram[address & 0x07FF] = data & 0xFF;
  }

  // ===== 序列化 (存檔) =====

  /** 儲存狀態 */
  public saveState(): object {
    return {
      ram: Array.from(this.ram),
      controllerState: [...this.controllerState],
      dmaPage: this.dmaPage,
      dmaAddress: this.dmaAddress,
      dmaData: this.dmaData,
      dmaTransfer: this.dmaTransfer,
      dmaDummy: this.dmaDummy,
    };
  }

  /** 載入狀態 */
  public loadState(state: any): void {
    this.ram.set(state.ram);
    this.controllerState = [state.controllerState[0], state.controllerState[1]];
    this.dmaPage = state.dmaPage;
    this.dmaAddress = state.dmaAddress;
    this.dmaData = state.dmaData;
    this.dmaTransfer = state.dmaTransfer;
    this.dmaDummy = state.dmaDummy;
  }
}
