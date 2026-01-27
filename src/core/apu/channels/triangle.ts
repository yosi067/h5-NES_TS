/**
 * 三角波 (Triangle Wave) 通道
 * 
 * 產生 32 步階梯式的三角波
 * 頻率範圍較其他通道更低
 */

import { LENGTH_TABLE } from '../tables';
import { LengthCounter } from './length-counter';

/**
 * 三角波序列表 (32 步)
 */
const TRIANGLE_SEQUENCE: number[] = [
  15, 14, 13, 12, 11, 10,  9,  8,  7,  6,  5,  4,  3,  2,  1,  0,
   0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15,
];

/**
 * 三角波通道類別
 */
export class TriangleChannel {
  /** 長度計數器 */
  private lengthCounter: LengthCounter;

  /** 線性計數器控制/停止旗標 */
  private controlFlag: boolean = false;

  /** 線性計數器重載值 */
  private linearCounterReload: number = 0;

  /** 線性計數器值 */
  private linearCounter: number = 0;

  /** 線性計數器重載旗標 */
  private linearCounterReloadFlag: boolean = false;

  /** 序列位置 (0-31) */
  private sequencePos: number = 0;

  /** 定時器週期 */
  private timerPeriod: number = 0;

  /** 定時器值 */
  private timerValue: number = 0;

  /** 是否啟用 */
  private enabled: boolean = false;

  constructor() {
    this.lengthCounter = new LengthCounter();
  }

  /**
   * 重置
   */
  public reset(): void {
    this.lengthCounter.reset();
    this.controlFlag = false;
    this.linearCounterReload = 0;
    this.linearCounter = 0;
    this.linearCounterReloadFlag = false;
    this.sequencePos = 0;
    this.timerPeriod = 0;
    this.timerValue = 0;
    this.enabled = false;
  }

  /**
   * 寫入控制暫存器 ($4008)
   * 
   * CRRR RRRR
   * C: 控制旗標 (長度計數器停止)
   * R: 線性計數器重載值
   */
  public writeControl(data: number): void {
    this.controlFlag = (data & 0x80) !== 0;
    this.lengthCounter.setHalt(this.controlFlag);
    this.linearCounterReload = data & 0x7F;
  }

  /**
   * 寫入定時器低位元組 ($400A)
   */
  public writeTimerLow(data: number): void {
    this.timerPeriod = (this.timerPeriod & 0x700) | data;
  }

  /**
   * 寫入定時器高位元組和長度計數器 ($400B)
   * 
   * LLLL LTTT
   * L: 長度計數器載入值
   * T: 定時器高 3 位元
   */
  public writeTimerHigh(data: number): void {
    this.timerPeriod = (this.timerPeriod & 0x0FF) | ((data & 0x07) << 8);

    if (this.enabled) {
      const lengthIndex = (data >> 3) & 0x1F;
      this.lengthCounter.load(LENGTH_TABLE[lengthIndex]);
    }

    this.linearCounterReloadFlag = true;
  }

  /**
   * 定時器時鐘 (每個 CPU 週期)
   */
  public clockTimer(): void {
    if (this.timerValue === 0) {
      this.timerValue = this.timerPeriod;

      // 只有當兩個計數器都 > 0 時才更新序列
      if (this.lengthCounter.getValue() > 0 && this.linearCounter > 0) {
        this.sequencePos = (this.sequencePos + 1) & 0x1F;
      }
    } else {
      this.timerValue--;
    }
  }

  /**
   * 線性計數器時鐘 (每個半幀)
   */
  public clockLinearCounter(): void {
    if (this.linearCounterReloadFlag) {
      this.linearCounter = this.linearCounterReload;
    } else if (this.linearCounter > 0) {
      this.linearCounter--;
    }

    if (!this.controlFlag) {
      this.linearCounterReloadFlag = false;
    }
  }

  /**
   * 長度計數器時鐘
   */
  public clockLengthCounter(): void {
    this.lengthCounter.clock();
  }

  /**
   * 取得輸出值
   */
  public output(): number {
    if (!this.enabled) return 0;
    if (this.lengthCounter.getValue() === 0) return 0;
    if (this.linearCounter === 0) return 0;
    
    // 避免高頻時產生的噪音 (超音波)
    if (this.timerPeriod < 2) return 7; // 回傳中間值

    return TRIANGLE_SEQUENCE[this.sequencePos];
  }

  /**
   * 設定是否啟用
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.lengthCounter.clear();
    }
  }

  /**
   * 取得長度計數器值
   */
  public getLengthCounter(): number {
    return this.lengthCounter.getValue();
  }

  // ===== 序列化 =====

  public saveState(): object {
    return {
      controlFlag: this.controlFlag,
      linearCounterReload: this.linearCounterReload,
      linearCounter: this.linearCounter,
      linearCounterReloadFlag: this.linearCounterReloadFlag,
      sequencePos: this.sequencePos,
      timerPeriod: this.timerPeriod,
      timerValue: this.timerValue,
      enabled: this.enabled,
      lengthCounter: this.lengthCounter.saveState(),
    };
  }

  public loadState(state: any): void {
    this.controlFlag = state.controlFlag;
    this.linearCounterReload = state.linearCounterReload;
    this.linearCounter = state.linearCounter;
    this.linearCounterReloadFlag = state.linearCounterReloadFlag;
    this.sequencePos = state.sequencePos;
    this.timerPeriod = state.timerPeriod;
    this.timerValue = state.timerValue;
    this.enabled = state.enabled;
    this.lengthCounter.loadState(state.lengthCounter);
  }
}
