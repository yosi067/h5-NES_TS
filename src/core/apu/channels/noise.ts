/**
 * 雜訊 (Noise) 通道
 * 
 * 使用線性回饋移位暫存器 (LFSR) 產生虛擬隨機雜訊
 * 支援兩種模式：普通模式和短週期模式
 */

import { LENGTH_TABLE } from '../tables';
import { Envelope } from './envelope';
import { LengthCounter } from './length-counter';

/**
 * 雜訊週期表 (NTSC)
 */
const NOISE_PERIOD_TABLE: number[] = [
  4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068
];

/**
 * 雜訊通道類別
 */
export class NoiseChannel {
  /** 包絡線生成器 */
  private envelope: Envelope;

  /** 長度計數器 */
  private lengthCounter: LengthCounter;

  /** 移位暫存器 (15 位元) */
  private shiftRegister: number = 1;

  /** 模式旗標 (短週期模式) */
  private mode: boolean = false;

  /** 定時器週期 */
  private timerPeriod: number = 0;

  /** 定時器值 */
  private timerValue: number = 0;

  /** 是否啟用 */
  private enabled: boolean = false;

  constructor() {
    this.envelope = new Envelope();
    this.lengthCounter = new LengthCounter();
  }

  /**
   * 重置
   */
  public reset(): void {
    this.envelope.reset();
    this.lengthCounter.reset();
    this.shiftRegister = 1;
    this.mode = false;
    this.timerPeriod = 0;
    this.timerValue = 0;
    this.enabled = false;
  }

  /**
   * 寫入控制暫存器 ($400C)
   * 
   * --LC VVVV
   * L: 長度計數器停止旗標
   * C: 常量音量旗標
   * V: 音量/包絡線週期
   */
  public writeControl(data: number): void {
    this.lengthCounter.setHalt((data & 0x20) !== 0);
    this.envelope.setConstantVolume((data & 0x10) !== 0);
    this.envelope.setVolume(data & 0x0F);
  }

  /**
   * 寫入週期暫存器 ($400E)
   * 
   * M--- PPPP
   * M: 模式旗標
   * P: 週期索引
   */
  public writePeriod(data: number): void {
    this.mode = (data & 0x80) !== 0;
    this.timerPeriod = NOISE_PERIOD_TABLE[data & 0x0F];
  }

  /**
   * 寫入長度計數器 ($400F)
   * 
   * LLLL L---
   * L: 長度計數器載入值
   */
  public writeLength(data: number): void {
    if (this.enabled) {
      const lengthIndex = (data >> 3) & 0x1F;
      this.lengthCounter.load(LENGTH_TABLE[lengthIndex]);
    }
    this.envelope.start();
  }

  /**
   * 定時器時鐘
   */
  public clockTimer(): void {
    if (this.timerValue === 0) {
      this.timerValue = this.timerPeriod;
      this.clockShiftRegister();
    } else {
      this.timerValue--;
    }
  }

  /**
   * 移位暫存器時鐘
   */
  private clockShiftRegister(): void {
    // 計算回饋位元
    const bit0 = this.shiftRegister & 1;
    const bit1 = this.mode 
      ? (this.shiftRegister >> 6) & 1  // 短週期模式: bit 0 XOR bit 6
      : (this.shiftRegister >> 1) & 1; // 普通模式: bit 0 XOR bit 1

    const feedback = bit0 ^ bit1;

    // 右移並設定最高位元
    this.shiftRegister = (this.shiftRegister >> 1) | (feedback << 14);
  }

  /**
   * 包絡線時鐘
   */
  public clockEnvelope(): void {
    this.envelope.clock();
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
    
    // 如果移位暫存器的 bit 0 為 1，輸出 0
    if (this.shiftRegister & 1) return 0;

    return this.envelope.output();
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
      shiftRegister: this.shiftRegister,
      mode: this.mode,
      timerPeriod: this.timerPeriod,
      timerValue: this.timerValue,
      enabled: this.enabled,
      envelope: this.envelope.saveState(),
      lengthCounter: this.lengthCounter.saveState(),
    };
  }

  public loadState(state: any): void {
    this.shiftRegister = state.shiftRegister;
    this.mode = state.mode;
    this.timerPeriod = state.timerPeriod;
    this.timerValue = state.timerValue;
    this.enabled = state.enabled;
    this.envelope.loadState(state.envelope);
    this.lengthCounter.loadState(state.lengthCounter);
  }
}
