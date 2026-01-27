/**
 * NES PPU (Picture Processing Unit) 模擬器
 * 
 * PPU 規格：
 * - 解析度：256 x 240 像素
 * - 調色盤：64 種顏色中選擇 25 種 (背景 13 + 精靈 12)
 * - 背景：由 8x8 的圖塊組成，使用 2 個圖案表
 * - 精靈：最多 64 個，每條掃描線最多 8 個
 * 
 * PPU 記憶體映射：
 * $0000-$0FFF: 圖案表 0 (CHR)
 * $1000-$1FFF: 圖案表 1 (CHR)
 * $2000-$23FF: 命名表 0
 * $2400-$27FF: 命名表 1
 * $2800-$2BFF: 命名表 2
 * $2C00-$2FFF: 命名表 3
 * $3000-$3EFF: 命名表鏡像
 * $3F00-$3F1F: 調色盤
 * $3F20-$3FFF: 調色盤鏡像
 */

import type { Cartridge } from '../cartridge';

/**
 * NES 系統調色盤 (RGB 值)
 * 來源：Nestopia 調色盤
 */
const SYSTEM_PALETTE: number[] = [
  0x666666, 0x002A88, 0x1412A7, 0x3B00A4, 0x5C007E, 0x6E0040, 0x6C0600, 0x561D00,
  0x333500, 0x0B4800, 0x005200, 0x004F08, 0x00404D, 0x000000, 0x000000, 0x000000,
  0xADADAD, 0x155FD9, 0x4240FF, 0x7527FE, 0xA01ACC, 0xB71E7B, 0xB53120, 0x994E00,
  0x6B6D00, 0x388700, 0x0C9300, 0x008F32, 0x007C8D, 0x000000, 0x000000, 0x000000,
  0xFFFEFF, 0x64B0FF, 0x9290FF, 0xC676FF, 0xF36AFF, 0xFE6ECC, 0xFE8170, 0xEA9E22,
  0xBCBE00, 0x88D800, 0x5CE430, 0x45E082, 0x48CDDE, 0x4F4F4F, 0x000000, 0x000000,
  0xFFFEFF, 0xC0DFFF, 0xD3D2FF, 0xE8C8FF, 0xFBC2FF, 0xFEC4EA, 0xFECCC5, 0xF7D8A5,
  0xE4E594, 0xCFEF96, 0xBDF4AB, 0xB3F3CC, 0xB5EBF2, 0xB8B8B8, 0x000000, 0x000000,
];

/**
 * PPU 控制暫存器 ($2000 PPUCTRL)
 */
enum PpuCtrl {
  /** 命名表選擇 bit 0 */
  NAMETABLE_X = 1 << 0,
  /** 命名表選擇 bit 1 */
  NAMETABLE_Y = 1 << 1,
  /** VRAM 位址增量 (0: +1, 1: +32) */
  INCREMENT_MODE = 1 << 2,
  /** 精靈圖案表選擇 (8x8 模式) */
  SPRITE_PATTERN = 1 << 3,
  /** 背景圖案表選擇 */
  BACKGROUND_PATTERN = 1 << 4,
  /** 精靈尺寸 (0: 8x8, 1: 8x16) */
  SPRITE_SIZE = 1 << 5,
  /** PPU 主/從選擇 (NES 不使用) */
  MASTER_SLAVE = 1 << 6,
  /** VBlank 時產生 NMI */
  NMI_ENABLE = 1 << 7,
}

/**
 * PPU 遮罩暫存器 ($2001 PPUMASK)
 */
enum PpuMask {
  /** 灰階模式 */
  GRAYSCALE = 1 << 0,
  /** 顯示最左側 8 像素的背景 */
  SHOW_BACKGROUND_LEFT = 1 << 1,
  /** 顯示最左側 8 像素的精靈 */
  SHOW_SPRITES_LEFT = 1 << 2,
  /** 顯示背景 */
  SHOW_BACKGROUND = 1 << 3,
  /** 顯示精靈 */
  SHOW_SPRITES = 1 << 4,
  /** 加強紅色 */
  EMPHASIZE_RED = 1 << 5,
  /** 加強綠色 */
  EMPHASIZE_GREEN = 1 << 6,
  /** 加強藍色 */
  EMPHASIZE_BLUE = 1 << 7,
}

/**
 * PPU 狀態暫存器 ($2002 PPUSTATUS)
 */
enum PpuStatus {
  /** 精靈溢出 */
  SPRITE_OVERFLOW = 1 << 5,
  /** 精靈 0 碰撞 */
  SPRITE_ZERO_HIT = 1 << 6,
  /** 垂直空白期間 */
  VBLANK = 1 << 7,
}

/**
 * PPU 類別
 */
export class Ppu {
  /** 卡帶參考 */
  private cartridge: Cartridge | null = null;

  // ===== PPU 暫存器 =====
  /** 控制暫存器 $2000 */
  private ctrl: number = 0;
  /** 遮罩暫存器 $2001 */
  private mask: number = 0;
  /** 狀態暫存器 $2002 */
  private status: number = 0;

  /** OAM 位址 $2003 */
  private oamAddress: number = 0;

  // ===== 內部暫存器 =====
  /** 當前 VRAM 位址 (15 位元) */
  private vramAddr: number = 0;
  /** 暫存 VRAM 位址 */
  private tempAddr: number = 0;
  /** 精細 X 捲動 (3 位元) */
  private fineX: number = 0;
  /** 位址閂鎖 (寫入切換) */
  private addressLatch: boolean = false;
  /** 資料緩衝區 */
  private dataBuffer: number = 0;

  // ===== 記憶體 =====
  /** 命名表 RAM (2KB) */
  private nametableRam: Uint8Array = new Uint8Array(2048);
  /** 調色盤 RAM (32 位元組) */
  private paletteRam: Uint8Array = new Uint8Array(32);
  /** OAM (Object Attribute Memory) - 精靈資料 */
  private oam: Uint8Array = new Uint8Array(256);
  /** 次要 OAM (當前掃描線的精靈) */
  private secondaryOam: Uint8Array = new Uint8Array(32);

  // ===== 渲染狀態 =====
  /** 當前掃描線 */
  private scanline: number = 0;
  /** 當前週期 */
  private cycle: number = 0;
  /** 是否為偶數幀 */
  private oddFrame: boolean = false;

  /** NMI 觸發旗標 */
  private nmiTriggered: boolean = false;

  // ===== 背景渲染暫存器 =====
  private bgNextTileId: number = 0;
  private bgNextTileAttr: number = 0;
  private bgNextTileLo: number = 0;
  private bgNextTileHi: number = 0;
  private bgShifterPatternLo: number = 0;
  private bgShifterPatternHi: number = 0;
  private bgShifterAttrLo: number = 0;
  private bgShifterAttrHi: number = 0;

  // ===== 精靈渲染 =====
  private spriteCount: number = 0;
  private spriteShifterPatternLo: Uint8Array = new Uint8Array(8);
  private spriteShifterPatternHi: Uint8Array = new Uint8Array(8);
  private spriteZeroHitPossible: boolean = false;
  private spriteZeroRendering: boolean = false;

  // ===== 掃描線 IRQ (用於 MMC3) =====
  private scanlineIrqFlag: boolean = false;

  // ===== 輸出 =====
  /** 幀緩衝區 (256 x 240 像素，RGBA) */
  public frameBuffer: Uint32Array = new Uint32Array(256 * 240);

  /** 幀完成旗標 */
  public frameComplete: boolean = false;

  constructor() {
    this.reset();
  }

  /** 重置 PPU */
  public reset(): void {
    this.ctrl = 0;
    this.mask = 0;
    this.status = 0;
    this.oamAddress = 0;
    this.vramAddr = 0;
    this.tempAddr = 0;
    this.fineX = 0;
    this.addressLatch = false;
    this.dataBuffer = 0;
    this.scanline = 0;
    this.cycle = 0;
    this.oddFrame = false;
    this.nmiTriggered = false;
    this.frameComplete = false;

    this.nametableRam.fill(0);
    this.paletteRam.fill(0);
    this.oam.fill(0);
    this.frameBuffer.fill(0);
  }

  /** 連接卡帶 */
  public connectCartridge(cartridge: Cartridge): void {
    this.cartridge = cartridge;
  }

  // ===== CPU 介面 =====

  /** CPU 讀取 PPU 暫存器 */
  public cpuRead(address: number): number {
    let data = 0;

    switch (address & 0x2007) {
      case 0x2000: // PPUCTRL - 唯寫
        break;

      case 0x2001: // PPUMASK - 唯寫
        break;

      case 0x2002: // PPUSTATUS
        data = (this.status & 0xE0) | (this.dataBuffer & 0x1F);
        this.status &= ~PpuStatus.VBLANK; // 清除 VBlank
        this.addressLatch = false;
        break;

      case 0x2003: // OAMADDR - 唯寫
        break;

      case 0x2004: // OAMDATA
        data = this.oam[this.oamAddress];
        break;

      case 0x2005: // PPUSCROLL - 唯寫
        break;

      case 0x2006: // PPUADDR - 唯寫
        break;

      case 0x2007: // PPUDATA
        // 從緩衝區讀取 (調色盤除外)
        data = this.dataBuffer;
        this.dataBuffer = this.ppuRead(this.vramAddr);

        // 調色盤讀取不經過緩衝區
        if (this.vramAddr >= 0x3F00) {
          data = this.dataBuffer;
        }

        // 增加 VRAM 位址
        this.vramAddr += (this.ctrl & PpuCtrl.INCREMENT_MODE) ? 32 : 1;
        this.vramAddr &= 0x3FFF;
        break;
    }

    return data;
  }

  /** CPU 寫入 PPU 暫存器 */
  public cpuWrite(address: number, data: number): void {
    switch (address & 0x2007) {
      case 0x2000: // PPUCTRL
        this.ctrl = data;
        // 更新暫存位址的命名表選擇
        this.tempAddr = (this.tempAddr & 0xF3FF) | ((data & 0x03) << 10);
        break;

      case 0x2001: // PPUMASK
        this.mask = data;
        break;

      case 0x2002: // PPUSTATUS - 唯讀
        break;

      case 0x2003: // OAMADDR
        this.oamAddress = data;
        break;

      case 0x2004: // OAMDATA
        this.oam[this.oamAddress] = data;
        this.oamAddress = (this.oamAddress + 1) & 0xFF;
        break;

      case 0x2005: // PPUSCROLL
        if (!this.addressLatch) {
          // 第一次寫入：X 捲動
          this.fineX = data & 0x07;
          this.tempAddr = (this.tempAddr & 0xFFE0) | (data >> 3);
        } else {
          // 第二次寫入：Y 捲動
          this.tempAddr = (this.tempAddr & 0x8C1F) |
                         ((data & 0x07) << 12) |
                         ((data & 0xF8) << 2);
        }
        this.addressLatch = !this.addressLatch;
        break;

      case 0x2006: // PPUADDR
        if (!this.addressLatch) {
          // 第一次寫入：高位元組
          this.tempAddr = (this.tempAddr & 0x00FF) | ((data & 0x3F) << 8);
        } else {
          // 第二次寫入：低位元組
          this.tempAddr = (this.tempAddr & 0xFF00) | data;
          this.vramAddr = this.tempAddr;
        }
        this.addressLatch = !this.addressLatch;
        break;

      case 0x2007: // PPUDATA
        this.ppuWrite(this.vramAddr, data);
        this.vramAddr += (this.ctrl & PpuCtrl.INCREMENT_MODE) ? 32 : 1;
        this.vramAddr &= 0x3FFF;
        break;
    }
  }

  /** OAM DMA 寫入 */
  public oamWrite(address: number, data: number): void {
    this.oam[address] = data;
  }

  // ===== PPU 內部記憶體存取 =====

  /** PPU 讀取記憶體 */
  private ppuRead(address: number): number {
    address &= 0x3FFF;

    // 圖案表 ($0000-$1FFF) - 由卡帶處理
    if (address < 0x2000) {
      return this.cartridge?.ppuRead(address) ?? 0;
    }

    // 命名表 ($2000-$3EFF)
    if (address < 0x3F00) {
      address &= 0x0FFF;
      // 根據卡帶的鏡像模式決定位址
      const mirroredAddr = this.getMirroredNametableAddr(address);
      return this.nametableRam[mirroredAddr];
    }

    // 調色盤 ($3F00-$3FFF)
    address &= 0x1F;
    // 處理鏡像：$3F10, $3F14, $3F18, $3F1C 鏡像到 $3F00, $3F04, $3F08, $3F0C
    if ((address & 0x13) === 0x10) {
      address &= 0x0F;
    }
    return this.paletteRam[address];
  }

  /** PPU 寫入記憶體 */
  private ppuWrite(address: number, data: number): void {
    address &= 0x3FFF;

    // 圖案表 ($0000-$1FFF) - 由卡帶處理
    if (address < 0x2000) {
      this.cartridge?.ppuWrite(address, data);
      return;
    }

    // 命名表 ($2000-$3EFF)
    if (address < 0x3F00) {
      address &= 0x0FFF;
      const mirroredAddr = this.getMirroredNametableAddr(address);
      this.nametableRam[mirroredAddr] = data;
      return;
    }

    // 調色盤 ($3F00-$3FFF)
    address &= 0x1F;
    if ((address & 0x13) === 0x10) {
      address &= 0x0F;
    }
    this.paletteRam[address] = data;
  }

  /** 取得鏡像後的命名表位址 */
  private getMirroredNametableAddr(address: number): number {
    const mirrorMode = this.cartridge?.getMirrorMode() ?? 0;

    switch (mirrorMode) {
      case 0: // 水平鏡像
        if (address < 0x0800) return address & 0x03FF;
        return 0x0400 + (address & 0x03FF);

      case 1: // 垂直鏡像
        return address & 0x07FF;

      case 2: // 單螢幕 (低)
        return address & 0x03FF;

      case 3: // 單螢幕 (高)
        return 0x0400 + (address & 0x03FF);

      default:
        return address & 0x07FF;
    }
  }

  // ===== 渲染方法 =====

  /** 是否啟用渲染 */
  private isRenderingEnabled(): boolean {
    return (this.mask & (PpuMask.SHOW_BACKGROUND | PpuMask.SHOW_SPRITES)) !== 0;
  }

  /** 增加 X 捲動 */
  private incrementScrollX(): void {
    if (!this.isRenderingEnabled()) return;

    if ((this.vramAddr & 0x001F) === 31) {
      this.vramAddr &= ~0x001F; // 重置粗略 X
      this.vramAddr ^= 0x0400;  // 切換水平命名表
    } else {
      this.vramAddr++;
    }
  }

  /** 增加 Y 捲動 */
  private incrementScrollY(): void {
    if (!this.isRenderingEnabled()) return;

    if ((this.vramAddr & 0x7000) !== 0x7000) {
      this.vramAddr += 0x1000; // 增加精細 Y
    } else {
      this.vramAddr &= ~0x7000; // 重置精細 Y
      let coarseY = (this.vramAddr & 0x03E0) >> 5;

      if (coarseY === 29) {
        coarseY = 0;
        this.vramAddr ^= 0x0800; // 切換垂直命名表
      } else if (coarseY === 31) {
        coarseY = 0;
      } else {
        coarseY++;
      }

      this.vramAddr = (this.vramAddr & ~0x03E0) | (coarseY << 5);
    }
  }

  /** 傳輸 X 位址 */
  private transferAddressX(): void {
    if (!this.isRenderingEnabled()) return;
    this.vramAddr = (this.vramAddr & 0xFBE0) | (this.tempAddr & 0x041F);
  }

  /** 傳輸 Y 位址 */
  private transferAddressY(): void {
    if (!this.isRenderingEnabled()) return;
    this.vramAddr = (this.vramAddr & 0x841F) | (this.tempAddr & 0x7BE0);
  }

  /** 載入背景移位器 */
  private loadBackgroundShifters(): void {
    this.bgShifterPatternLo = (this.bgShifterPatternLo & 0xFF00) | this.bgNextTileLo;
    this.bgShifterPatternHi = (this.bgShifterPatternHi & 0xFF00) | this.bgNextTileHi;
    this.bgShifterAttrLo = (this.bgShifterAttrLo & 0xFF00) | ((this.bgNextTileAttr & 1) ? 0xFF : 0);
    this.bgShifterAttrHi = (this.bgShifterAttrHi & 0xFF00) | ((this.bgNextTileAttr & 2) ? 0xFF : 0);
  }

  /** 更新移位器 */
  private updateShifters(): void {
    if (this.mask & PpuMask.SHOW_BACKGROUND) {
      this.bgShifterPatternLo <<= 1;
      this.bgShifterPatternHi <<= 1;
      this.bgShifterAttrLo <<= 1;
      this.bgShifterAttrHi <<= 1;
    }

    if ((this.mask & PpuMask.SHOW_SPRITES) && this.cycle >= 1 && this.cycle < 258) {
      for (let i = 0; i < this.spriteCount; i++) {
        const x = this.secondaryOam[i * 4 + 3];
        if (x > 0) {
          this.secondaryOam[i * 4 + 3]--;
        } else {
          this.spriteShifterPatternLo[i] <<= 1;
          this.spriteShifterPatternHi[i] <<= 1;
        }
      }
    }
  }

  /** 執行一個 PPU 時鐘週期 */
  public clock(): void {
    // 可見掃描線 (0-239) 和預渲染掃描線 (-1)
    if (this.scanline >= -1 && this.scanline < 240) {
      // 奇數幀跳過 (0,0) 週期
      if (this.scanline === 0 && this.cycle === 0 && this.oddFrame && this.isRenderingEnabled()) {
        this.cycle = 1;
      }

      // 預渲染掃描線
      if (this.scanline === -1 && this.cycle === 1) {
        this.status &= ~PpuStatus.VBLANK;
        this.status &= ~PpuStatus.SPRITE_OVERFLOW;
        this.status &= ~PpuStatus.SPRITE_ZERO_HIT;
        this.spriteShifterPatternLo.fill(0);
        this.spriteShifterPatternHi.fill(0);
      }

      // 背景渲染
      if ((this.cycle >= 2 && this.cycle < 258) || (this.cycle >= 321 && this.cycle < 338)) {
        this.updateShifters();

        switch ((this.cycle - 1) % 8) {
          case 0:
            this.loadBackgroundShifters();
            // 讀取命名表位元組
            this.bgNextTileId = this.ppuRead(0x2000 | (this.vramAddr & 0x0FFF));
            break;
          case 2:
            // 讀取屬性位元組
            this.bgNextTileAttr = this.ppuRead(
              0x23C0 |
              (this.vramAddr & 0x0C00) |
              ((this.vramAddr >> 4) & 0x38) |
              ((this.vramAddr >> 2) & 0x07)
            );
            if ((this.vramAddr >> 5) & 0x02) this.bgNextTileAttr >>= 4;
            if (this.vramAddr & 0x02) this.bgNextTileAttr >>= 2;
            this.bgNextTileAttr &= 0x03;
            break;
          case 4:
            // 讀取圖案低位元組
            this.bgNextTileLo = this.ppuRead(
              ((this.ctrl & PpuCtrl.BACKGROUND_PATTERN) ? 0x1000 : 0) +
              (this.bgNextTileId << 4) +
              ((this.vramAddr >> 12) & 0x07)
            );
            break;
          case 6:
            // 讀取圖案高位元組
            this.bgNextTileHi = this.ppuRead(
              ((this.ctrl & PpuCtrl.BACKGROUND_PATTERN) ? 0x1000 : 0) +
              (this.bgNextTileId << 4) +
              ((this.vramAddr >> 12) & 0x07) + 8
            );
            break;
          case 7:
            this.incrementScrollX();
            break;
        }
      }

      if (this.cycle === 256) {
        this.incrementScrollY();
      }

      if (this.cycle === 257) {
        this.loadBackgroundShifters();
        this.transferAddressX();
      }

      // 精靈評估
      if (this.cycle === 257 && this.scanline >= 0) {
        this.evaluateSprites();
      }
      
      // 觸發掃描線 IRQ (用於 MMC3)
      if (this.cycle === 260 && this.isRenderingEnabled()) {
        this.scanlineIrqFlag = true;
      }

      // 預渲染掃描線期間重載 Y
      if (this.scanline === -1 && this.cycle >= 280 && this.cycle < 305) {
        this.transferAddressY();
      }
    }

    // VBlank 開始
    if (this.scanline === 241 && this.cycle === 1) {
      this.status |= PpuStatus.VBLANK;
      if (this.ctrl & PpuCtrl.NMI_ENABLE) {
        this.nmiTriggered = true;
      }
    }

    // 渲染像素
    if (this.scanline >= 0 && this.scanline < 240 && this.cycle >= 1 && this.cycle <= 256) {
      this.renderPixel();
    }

    // 推進週期計數器
    this.cycle++;
    if (this.cycle >= 341) {
      this.cycle = 0;
      this.scanline++;
      if (this.scanline >= 261) {
        this.scanline = -1;
        this.frameComplete = true;
        this.oddFrame = !this.oddFrame;
      }
    }
  }

  /** 評估當前掃描線的精靈 */
  private evaluateSprites(): void {
    this.secondaryOam.fill(0xFF);
    this.spriteCount = 0;
    this.spriteZeroHitPossible = false;

    const spriteHeight = (this.ctrl & PpuCtrl.SPRITE_SIZE) ? 16 : 8;

    for (let i = 0; i < 64 && this.spriteCount < 8; i++) {
      const y = this.oam[i * 4];
      const diff = this.scanline - y;

      if (diff >= 0 && diff < spriteHeight) {
        if (i === 0) {
          this.spriteZeroHitPossible = true;
        }

        // 複製精靈資料
        for (let j = 0; j < 4; j++) {
          this.secondaryOam[this.spriteCount * 4 + j] = this.oam[i * 4 + j];
        }

        // 載入精靈圖案
        this.loadSpritePattern(this.spriteCount, diff);
        this.spriteCount++;
      }
    }

    // 檢查精靈溢出
    if (this.spriteCount >= 8) {
      this.status |= PpuStatus.SPRITE_OVERFLOW;
    }
  }

  /** 載入精靈圖案 */
  private loadSpritePattern(spriteIndex: number, row: number): void {
    const tileIndex = this.secondaryOam[spriteIndex * 4 + 1];
    const attributes = this.secondaryOam[spriteIndex * 4 + 2];
    const flipVertical = (attributes & 0x80) !== 0;
    const flipHorizontal = (attributes & 0x40) !== 0;
    const spriteHeight = (this.ctrl & PpuCtrl.SPRITE_SIZE) ? 16 : 8;

    let patternAddr: number;

    if (spriteHeight === 8) {
      // 8x8 精靈
      patternAddr = ((this.ctrl & PpuCtrl.SPRITE_PATTERN) ? 0x1000 : 0) + (tileIndex << 4);
      if (flipVertical) {
        row = 7 - row;
      }
    } else {
      // 8x16 精靈
      patternAddr = ((tileIndex & 0x01) ? 0x1000 : 0) + ((tileIndex & 0xFE) << 4);
      if (flipVertical) {
        row = 15 - row;
      }
      if (row >= 8) {
        patternAddr += 16;
        row -= 8;
      }
    }

    let patternLo = this.ppuRead(patternAddr + row);
    let patternHi = this.ppuRead(patternAddr + row + 8);

    // 水平翻轉
    if (flipHorizontal) {
      patternLo = this.reverseBits(patternLo);
      patternHi = this.reverseBits(patternHi);
    }

    this.spriteShifterPatternLo[spriteIndex] = patternLo;
    this.spriteShifterPatternHi[spriteIndex] = patternHi;
  }

  /** 位元反轉 */
  private reverseBits(b: number): number {
    b = ((b & 0xF0) >> 4) | ((b & 0x0F) << 4);
    b = ((b & 0xCC) >> 2) | ((b & 0x33) << 2);
    b = ((b & 0xAA) >> 1) | ((b & 0x55) << 1);
    return b;
  }

  /** 渲染一個像素 */
  private renderPixel(): void {
    const x = this.cycle - 1;
    const y = this.scanline;

    let bgPixel = 0;
    let bgPalette = 0;
    let spritePixel = 0;
    let spritePalette = 0;
    let spritePriority = false;

    // 背景像素
    if (this.mask & PpuMask.SHOW_BACKGROUND) {
      if ((this.mask & PpuMask.SHOW_BACKGROUND_LEFT) || x >= 8) {
        const mux = 0x8000 >> this.fineX;
        const p0 = (this.bgShifterPatternLo & mux) ? 1 : 0;
        const p1 = (this.bgShifterPatternHi & mux) ? 2 : 0;
        bgPixel = p0 | p1;

        const a0 = (this.bgShifterAttrLo & mux) ? 1 : 0;
        const a1 = (this.bgShifterAttrHi & mux) ? 2 : 0;
        bgPalette = a0 | a1;
      }
    }

    // 精靈像素
    if (this.mask & PpuMask.SHOW_SPRITES) {
      if ((this.mask & PpuMask.SHOW_SPRITES_LEFT) || x >= 8) {
        this.spriteZeroRendering = false;

        for (let i = 0; i < this.spriteCount; i++) {
          const spriteX = this.secondaryOam[i * 4 + 3];
          if (spriteX === 0) {
            const p0 = (this.spriteShifterPatternLo[i] & 0x80) ? 1 : 0;
            const p1 = (this.spriteShifterPatternHi[i] & 0x80) ? 2 : 0;
            spritePixel = p0 | p1;

            const attr = this.secondaryOam[i * 4 + 2];
            spritePalette = (attr & 0x03) + 4;
            spritePriority = (attr & 0x20) === 0;

            if (spritePixel !== 0) {
              if (i === 0) {
                this.spriteZeroRendering = true;
              }
              break;
            }
          }
        }
      }
    }

    // 決定最終像素
    let finalPixel = 0;
    let finalPalette = 0;

    if (bgPixel === 0 && spritePixel === 0) {
      finalPixel = 0;
      finalPalette = 0;
    } else if (bgPixel === 0 && spritePixel !== 0) {
      finalPixel = spritePixel;
      finalPalette = spritePalette;
    } else if (bgPixel !== 0 && spritePixel === 0) {
      finalPixel = bgPixel;
      finalPalette = bgPalette;
    } else {
      // 精靈 0 碰撞檢測
      if (this.spriteZeroHitPossible && this.spriteZeroRendering) {
        if ((this.mask & PpuMask.SHOW_BACKGROUND) && (this.mask & PpuMask.SHOW_SPRITES)) {
          if (~(this.mask & (PpuMask.SHOW_BACKGROUND_LEFT | PpuMask.SHOW_SPRITES_LEFT))) {
            if (x >= 9 && x < 258) {
              this.status |= PpuStatus.SPRITE_ZERO_HIT;
            }
          } else {
            if (x >= 1 && x < 258) {
              this.status |= PpuStatus.SPRITE_ZERO_HIT;
            }
          }
        }
      }

      if (spritePriority) {
        finalPixel = spritePixel;
        finalPalette = spritePalette;
      } else {
        finalPixel = bgPixel;
        finalPalette = bgPalette;
      }
    }

    // 取得顏色並寫入幀緩衝區
    const colorIndex = this.ppuRead(0x3F00 + (finalPalette << 2) + finalPixel) & 0x3F;
    const color = SYSTEM_PALETTE[colorIndex];
    this.frameBuffer[y * 256 + x] = 0xFF000000 | color;
  }

  // ===== 公開方法 =====

  /** 檢查並清除 NMI 旗標 */
  public checkNmi(): boolean {
    if (this.nmiTriggered) {
      this.nmiTriggered = false;
      return true;
    }
    return false;
  }

  /** 取得調色盤顏色 (用於除錯) */
  public getPaletteColor(paletteIndex: number, colorIndex: number): number {
    const index = this.ppuRead(0x3F00 + (paletteIndex << 2) + colorIndex) & 0x3F;
    return SYSTEM_PALETTE[index];
  }

  /** 取得圖案表 (用於除錯) */
  public getPatternTable(index: number, palette: number): Uint32Array {
    const table = new Uint32Array(128 * 128);

    for (let tileY = 0; tileY < 16; tileY++) {
      for (let tileX = 0; tileX < 16; tileX++) {
        const offset = tileY * 256 + tileX * 16;

        for (let row = 0; row < 8; row++) {
          let tileLo = this.ppuRead(index * 0x1000 + offset + row);
          let tileHi = this.ppuRead(index * 0x1000 + offset + row + 8);

          for (let col = 0; col < 8; col++) {
            const pixel = ((tileLo & 0x01) << 0) | ((tileHi & 0x01) << 1);
            tileLo >>= 1;
            tileHi >>= 1;

            const x = tileX * 8 + (7 - col);
            const y = tileY * 8 + row;
            const color = this.getPaletteColor(palette, pixel);
            table[y * 128 + x] = 0xFF000000 | color;
          }
        }
      }
    }

    return table;
  }

  /** 掃描線 IRQ 旗標 (用於 MMC3) */
  /**
   * 檢查是否需要觸發掃描線 IRQ
   * 在渲染期間的每條掃描線結束時檢查 A12 上升沿
   */
  public checkScanlineIrq(): boolean {
    const flag = this.scanlineIrqFlag;
    this.scanlineIrqFlag = false;
    return flag;
  }

  // ===== 序列化 (存檔) =====

  /** 儲存狀態 */
  public saveState(): object {
    return {
      ctrl: this.ctrl,
      mask: this.mask,
      status: this.status,
      oamAddress: this.oamAddress,
      vramAddr: this.vramAddr,
      tempAddr: this.tempAddr,
      fineX: this.fineX,
      addressLatch: this.addressLatch,
      dataBuffer: this.dataBuffer,
      nametableRam: Array.from(this.nametableRam),
      paletteRam: Array.from(this.paletteRam),
      oam: Array.from(this.oam),
      secondaryOam: Array.from(this.secondaryOam),
      scanline: this.scanline,
      cycle: this.cycle,
      oddFrame: this.oddFrame,
      nmiTriggered: this.nmiTriggered,
      bgNextTileId: this.bgNextTileId,
      bgNextTileAttr: this.bgNextTileAttr,
      bgNextTileLo: this.bgNextTileLo,
      bgNextTileHi: this.bgNextTileHi,
    };
  }

  /** 載入狀態 */
  public loadState(state: any): void {
    this.ctrl = state.ctrl;
    this.mask = state.mask;
    this.status = state.status;
    this.oamAddress = state.oamAddress;
    this.vramAddr = state.vramAddr;
    this.tempAddr = state.tempAddr;
    this.fineX = state.fineX;
    this.addressLatch = state.addressLatch;
    this.dataBuffer = state.dataBuffer;
    this.nametableRam.set(state.nametableRam);
    this.paletteRam.set(state.paletteRam);
    this.oam.set(state.oam);
    this.secondaryOam.set(state.secondaryOam);
    this.scanline = state.scanline;
    this.cycle = state.cycle;
    this.oddFrame = state.oddFrame;
    this.nmiTriggered = state.nmiTriggered;
    this.bgNextTileId = state.bgNextTileId;
    this.bgNextTileAttr = state.bgNextTileAttr;
    this.bgNextTileLo = state.bgNextTileLo;
    this.bgNextTileHi = state.bgNextTileHi;
  }
}
