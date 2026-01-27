/**
 * 脈衝波 (Pulse/Square Wave) 通道
 * 
 * 產生可變占空比的方波
 * 占空比: 12.5%, 25%, 50%, 75%
 */

import { LENGTH_TABLE } from '../tables';
import { Envelope } from './envelope';
import { LengthCounter } from './length-counter';
import { Sweep } from './sweep';

/**
 * 占空比波形表
 * 每個陣列代表一個完整週期的 8 個步驟
 */
const DUTY_TABLE: number[][] = [
  [0, 1, 0, 0, 0, 0, 0, 0], // 12.5%
  [0, 1, 1, 0, 0, 0, 0, 0], // 25%
  [0, 1, 1, 1, 1, 0, 0, 0], // 50%
  [1, 0, 0, 1, 1, 1, 1, 1], // 25% (反相)
];

/**
 * 脈衝波通道類別
 */
export class PulseChannel {

  /** 包絡線生成器 */
  private envelope: Envelope;

  /** 長度計數器 */
  private lengthCounter: LengthCounter;

  /** 掃頻單元 */
  private sweep: Sweep;

  /** 占空比索引 (0-3) */
  private dutyMode: number = 0;

  /** 波形序列位置 (0-7) */
  private sequencePos: number = 0;

  /** 定時器值 */
  private timerPeriod: number = 0;
  private timerValue: number = 0;

  /** 是否啟用 */
  private enabled: boolean = false;

  constructor(isChannel1: boolean) {
    this.envelope = new Envelope();
    this.lengthCounter = new LengthCounter();
    this.sweep = new Sweep(isChannel1);
  }

  /**
   * 重置
   */
  public reset(): void {
    this.envelope.reset();
    this.lengthCounter.reset();
    this.sweep.reset();
    this.dutyMode = 0;
    this.sequencePos = 0;
    this.timerPeriod = 0;
    this.timerValue = 0;
    this.enabled = false;
  }

  /**
   * 寫入控制暫存器 ($4000/$4004)
   * 
   * DDLC VVVV
   * D: 占空比
   * L: 長度計數器停止旗標
   * C: 常量音量旗標
   * V: 音量/包絡線週期
   */
  public writeControl(data: number): void {
    this.dutyMode = (data >> 6) & 0x03;
    this.lengthCounter.setHalt((data & 0x20) !== 0);
    this.envelope.setConstantVolume((data & 0x10) !== 0);
    this.envelope.setVolume(data & 0x0F);
  }

  /**
   * 寫入掃頻暫存器 ($4001/$4005)
   * 
   * EPPP NSSS
   * E: 掃頻啟用
   * P: 掃頻週期
   * N: 否定旗標
   * S: 移位量
   */
  public writeSweep(data: number): void {
    this.sweep.write(data);
  }

  /**
   * 寫入定時器低位元組 ($4002/$4006)
   */
  public writeTimerLow(data: number): void {
    this.timerPeriod = (this.timerPeriod & 0x700) | data;
    this.sweep.setTimerPeriod(this.timerPeriod);
  }

  /**
   * 寫入定時器高位元組和長度計數器 ($4003/$4007)
   * 
   * LLLL LTTT
   * L: 長度計數器載入值
   * T: 定時器高 3 位元
   */
  public writeTimerHigh(data: number): void {
    this.timerPeriod = (this.timerPeriod & 0x0FF) | ((data & 0x07) << 8);
    this.sweep.setTimerPeriod(this.timerPeriod);

    if (this.enabled) {
      const lengthIndex = (data >> 3) & 0x1F;
      this.lengthCounter.load(LENGTH_TABLE[lengthIndex]);
    }

    this.sequencePos = 0;
    this.envelope.start();
  }

  /**
   * 定時器時鐘
   */
  public clockTimer(): void {
    if (this.timerValue === 0) {
      this.timerValue = this.timerPeriod;
      this.sequencePos = (this.sequencePos + 1) & 0x07;
    } else {
      this.timerValue--;
    }
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
   * 掃頻時鐘
   */
  public clockSweep(): void {
    const newPeriod = this.sweep.clock();
    if (newPeriod !== null) {
      this.timerPeriod = newPeriod;
    }
  }

  /**
   * 取得輸出值
   */
  public output(): number {
    // 靜音條件
    if (!this.enabled) return 0;
    if (this.lengthCounter.getValue() === 0) return 0;
    if (this.timerPeriod < 8) return 0; // 頻率太高
    if (this.sweep.isMuting(this.timerPeriod)) return 0;

    // 取得波形值
    const waveform = DUTY_TABLE[this.dutyMode][this.sequencePos];
    if (waveform === 0) return 0;

    // 回傳包絡線音量
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
      dutyMode: this.dutyMode,
      sequencePos: this.sequencePos,
      timerPeriod: this.timerPeriod,
      timerValue: this.timerValue,
      enabled: this.enabled,
      envelope: this.envelope.saveState(),
      lengthCounter: this.lengthCounter.saveState(),
      sweep: this.sweep.saveState(),
    };
  }

  public loadState(state: any): void {
    this.dutyMode = state.dutyMode;
    this.sequencePos = state.sequencePos;
    this.timerPeriod = state.timerPeriod;
    this.timerValue = state.timerValue;
    this.enabled = state.enabled;
    this.envelope.loadState(state.envelope);
    this.lengthCounter.loadState(state.lengthCounter);
    this.sweep.loadState(state.sweep);
  }
}
