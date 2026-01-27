/**
 * DMC (Delta Modulation Channel) 通道
 * 
 * 播放 1 位元 delta 調製的取樣資料
 * 可以直接從 PRG ROM 讀取取樣
 */

/**
 * DMC 週期表 (NTSC)
 */
const DMC_PERIOD_TABLE: number[] = [
  428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54
];

/**
 * DMC 通道類別
 */
export class DmcChannel {
  /** 記憶體讀取回調 */
  private memoryReader: ((address: number) => number) | null = null;

  /** IRQ 回調 */
  private irqCallback: (() => void) | null = null;

  /** IRQ 啟用旗標 */
  private irqEnabled: boolean = false;

  /** 迴圈旗標 */
  private loop: boolean = false;

  /** 定時器週期 */
  private timerPeriod: number = 0;

  /** 定時器值 */
  private timerValue: number = 0;

  /** 輸出電平 (7 位元) */
  private outputLevel: number = 0;

  /** 取樣位址 */
  private sampleAddress: number = 0;

  /** 當前位址 */
  private currentAddress: number = 0;

  /** 取樣長度 */
  private sampleLength: number = 0;

  /** 剩餘位元組 */
  private bytesRemaining: number = 0;

  /** 取樣緩衝區 */
  private sampleBuffer: number = 0;

  /** 緩衝區是否為空 */
  private bufferEmpty: boolean = true;

  /** 移位暫存器 */
  private shiftRegister: number = 0;

  /** 位元計數器 */
  private bitsRemaining: number = 0;

  /** 是否靜音 */
  private silence: boolean = true;

  /** IRQ 旗標 */
  private irqFlag: boolean = false;

  constructor() {
    this.reset();
  }

  /**
   * 重置
   */
  public reset(): void {
    this.irqEnabled = false;
    this.loop = false;
    this.timerPeriod = 0;
    this.timerValue = 0;
    this.outputLevel = 0;
    this.sampleAddress = 0xC000;
    this.currentAddress = 0xC000;
    this.sampleLength = 0;
    this.bytesRemaining = 0;
    this.sampleBuffer = 0;
    this.bufferEmpty = true;
    this.shiftRegister = 0;
    this.bitsRemaining = 8;
    this.silence = true;
    this.irqFlag = false;
  }

  /**
   * 設定記憶體讀取器
   */
  public setMemoryReader(reader: (address: number) => number): void {
    this.memoryReader = reader;
  }

  /**
   * 設定 IRQ 回調
   */
  public setIrqCallback(callback: () => void): void {
    this.irqCallback = callback;
  }

  /**
   * 寫入控制暫存器 ($4010)
   * 
   * IL-- RRRR
   * I: IRQ 啟用
   * L: 迴圈旗標
   * R: 週期索引
   */
  public writeControl(data: number): void {
    this.irqEnabled = (data & 0x80) !== 0;
    this.loop = (data & 0x40) !== 0;
    this.timerPeriod = DMC_PERIOD_TABLE[data & 0x0F];

    if (!this.irqEnabled) {
      this.irqFlag = false;
    }
  }

  /**
   * 寫入直接載入 ($4011)
   * 
   * -DDD DDDD
   * D: 直接載入到輸出電平
   */
  public writeDirectLoad(data: number): void {
    this.outputLevel = data & 0x7F;
  }

  /**
   * 寫入取樣位址 ($4012)
   * 
   * AAAA AAAA
   * 位址 = $C000 + (A * 64)
   */
  public writeAddress(data: number): void {
    this.sampleAddress = 0xC000 | (data << 6);
  }

  /**
   * 寫入取樣長度 ($4013)
   * 
   * LLLL LLLL
   * 長度 = (L * 16) + 1
   */
  public writeLength(data: number): void {
    this.sampleLength = (data << 4) | 1;
  }

  /**
   * 定時器時鐘
   */
  public clockTimer(): void {
    if (!this.silence) {
      if (this.shiftRegister & 1) {
        // 增加輸出電平
        if (this.outputLevel <= 125) {
          this.outputLevel += 2;
        }
      } else {
        // 減少輸出電平
        if (this.outputLevel >= 2) {
          this.outputLevel -= 2;
        }
      }
    }

    this.shiftRegister >>= 1;
    this.bitsRemaining--;

    if (this.bitsRemaining === 0) {
      this.bitsRemaining = 8;
      this.startOutputCycle();
    }
  }

  /**
   * 開始輸出週期
   */
  private startOutputCycle(): void {
    if (this.bufferEmpty) {
      this.silence = true;
    } else {
      this.silence = false;
      this.shiftRegister = this.sampleBuffer;
      this.bufferEmpty = true;
      this.fetchSample();
    }
  }

  /**
   * 讀取取樣
   */
  private fetchSample(): void {
    if (this.bytesRemaining > 0 && this.bufferEmpty) {
      // 從記憶體讀取取樣
      if (this.memoryReader) {
        this.sampleBuffer = this.memoryReader(this.currentAddress);
        this.bufferEmpty = false;
      }

      // 更新位址
      this.currentAddress = ((this.currentAddress + 1) & 0xFFFF) | 0x8000;
      this.bytesRemaining--;

      // 檢查是否完成
      if (this.bytesRemaining === 0) {
        if (this.loop) {
          // 重新開始
          this.currentAddress = this.sampleAddress;
          this.bytesRemaining = this.sampleLength;
        } else if (this.irqEnabled) {
          // 觸發 IRQ
          this.irqFlag = true;
          if (this.irqCallback) {
            this.irqCallback();
          }
        }
      }
    }
  }

  /**
   * 取得輸出值
   */
  public output(): number {
    return this.outputLevel;
  }

  /**
   * 設定是否啟用
   */
  public setEnabled(enabled: boolean): void {
    if (!enabled) {
      this.bytesRemaining = 0;
    } else {
      if (this.bytesRemaining === 0) {
        this.currentAddress = this.sampleAddress;
        this.bytesRemaining = this.sampleLength;
      }
    }
    this.irqFlag = false;
  }

  /**
   * 取得剩餘位元組數
   */
  public getBytesRemaining(): number {
    return this.bytesRemaining;
  }

  /**
   * 取得 IRQ 旗標
   */
  public getIrqFlag(): boolean {
    return this.irqFlag;
  }

  // ===== 序列化 =====

  public saveState(): object {
    return {
      irqEnabled: this.irqEnabled,
      loop: this.loop,
      timerPeriod: this.timerPeriod,
      timerValue: this.timerValue,
      outputLevel: this.outputLevel,
      sampleAddress: this.sampleAddress,
      currentAddress: this.currentAddress,
      sampleLength: this.sampleLength,
      bytesRemaining: this.bytesRemaining,
      sampleBuffer: this.sampleBuffer,
      bufferEmpty: this.bufferEmpty,
      shiftRegister: this.shiftRegister,
      bitsRemaining: this.bitsRemaining,
      silence: this.silence,
      irqFlag: this.irqFlag,
    };
  }

  public loadState(state: any): void {
    this.irqEnabled = state.irqEnabled;
    this.loop = state.loop;
    this.timerPeriod = state.timerPeriod;
    this.timerValue = state.timerValue;
    this.outputLevel = state.outputLevel;
    this.sampleAddress = state.sampleAddress;
    this.currentAddress = state.currentAddress;
    this.sampleLength = state.sampleLength;
    this.bytesRemaining = state.bytesRemaining;
    this.sampleBuffer = state.sampleBuffer;
    this.bufferEmpty = state.bufferEmpty;
    this.shiftRegister = state.shiftRegister;
    this.bitsRemaining = state.bitsRemaining;
    this.silence = state.silence;
    this.irqFlag = state.irqFlag;
  }
}
