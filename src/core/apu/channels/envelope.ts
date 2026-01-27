/**
 * 包絡線生成器
 * 
 * 用於脈衝波和雜訊通道的音量控制
 * 可以產生衰減效果或固定音量
 */

export class Envelope {
  /** 是否使用常量音量 */
  private constantVolume: boolean = false;

  /** 常量音量值 / 包絡線週期 */
  private volume: number = 0;

  /** 包絡線分頻器 */
  private divider: number = 0;

  /** 包絡線衰減等級 */
  private decayLevel: number = 0;

  /** 開始旗標 */
  private startFlag: boolean = false;

  /** 迴圈旗標 (與長度計數器停止旗標共用) */
  private loopFlag: boolean = false;

  constructor() {
    this.reset();
  }

  /**
   * 重置
   */
  public reset(): void {
    this.constantVolume = false;
    this.volume = 0;
    this.divider = 0;
    this.decayLevel = 0;
    this.startFlag = false;
    this.loopFlag = false;
  }

  /**
   * 設定常量音量模式
   */
  public setConstantVolume(constant: boolean): void {
    this.constantVolume = constant;
  }

  /**
   * 設定音量/週期
   */
  public setVolume(volume: number): void {
    this.volume = volume & 0x0F;
  }

  /**
   * 設定迴圈旗標
   */
  public setLoop(loop: boolean): void {
    this.loopFlag = loop;
  }

  /**
   * 開始新的包絡線週期
   */
  public start(): void {
    this.startFlag = true;
  }

  /**
   * 時鐘 (每個四分之一幀)
   */
  public clock(): void {
    if (this.startFlag) {
      this.startFlag = false;
      this.decayLevel = 15;
      this.divider = this.volume;
    } else {
      // 分頻器計數
      if (this.divider === 0) {
        this.divider = this.volume;
        // 衰減
        if (this.decayLevel > 0) {
          this.decayLevel--;
        } else if (this.loopFlag) {
          this.decayLevel = 15;
        }
      } else {
        this.divider--;
      }
    }
  }

  /**
   * 取得輸出音量
   */
  public output(): number {
    if (this.constantVolume) {
      return this.volume;
    } else {
      return this.decayLevel;
    }
  }

  // ===== 序列化 =====

  public saveState(): object {
    return {
      constantVolume: this.constantVolume,
      volume: this.volume,
      divider: this.divider,
      decayLevel: this.decayLevel,
      startFlag: this.startFlag,
      loopFlag: this.loopFlag,
    };
  }

  public loadState(state: any): void {
    this.constantVolume = state.constantVolume;
    this.volume = state.volume;
    this.divider = state.divider;
    this.decayLevel = state.decayLevel;
    this.startFlag = state.startFlag;
    this.loopFlag = state.loopFlag;
  }
}
