/**
 * 掃頻單元
 * 
 * 用於脈衝波通道的頻率掃描效果
 * 可以產生音高上升或下降的效果
 */

export class Sweep {
  /** 是否為通道 1 (影響否定計算) */
  private isChannel1: boolean;

  /** 是否啟用 */
  private enabled: boolean = false;

  /** 掃頻週期 */
  private period: number = 0;

  /** 否定旗標 */
  private negate: boolean = false;

  /** 移位量 */
  private shift: number = 0;

  /** 分頻器 */
  private divider: number = 0;

  /** 重載旗標 */
  private reloadFlag: boolean = false;

  /** 當前定時器週期 */
  private timerPeriod: number = 0;

  constructor(isChannel1: boolean) {
    this.isChannel1 = isChannel1;
  }

  /**
   * 重置
   */
  public reset(): void {
    this.enabled = false;
    this.period = 0;
    this.negate = false;
    this.shift = 0;
    this.divider = 0;
    this.reloadFlag = false;
    this.timerPeriod = 0;
  }

  /**
   * 寫入暫存器
   * 
   * EPPP NSSS
   * E: 啟用
   * P: 週期
   * N: 否定
   * S: 移位量
   */
  public write(data: number): void {
    this.enabled = (data & 0x80) !== 0;
    this.period = (data >> 4) & 0x07;
    this.negate = (data & 0x08) !== 0;
    this.shift = data & 0x07;
    this.reloadFlag = true;
  }

  /**
   * 設定定時器週期
   */
  public setTimerPeriod(period: number): void {
    this.timerPeriod = period;
  }

  /**
   * 時鐘 (每個半幀)
   * 回傳新的定時器週期，或 null 表示不變
   */
  public clock(): number | null {
    // 計算目標週期
    const changeAmount = this.timerPeriod >> this.shift;
    let targetPeriod: number;

    if (this.negate) {
      // 通道 1 和通道 2 的否定計算不同
      if (this.isChannel1) {
        targetPeriod = this.timerPeriod - changeAmount - 1;
      } else {
        targetPeriod = this.timerPeriod - changeAmount;
      }
    } else {
      targetPeriod = this.timerPeriod + changeAmount;
    }

    // 檢查分頻器
    let result: number | null = null;

    if (this.divider === 0 && this.enabled && this.shift > 0 && !this.isMuting(this.timerPeriod)) {
      if (targetPeriod <= 0x7FF) {
        this.timerPeriod = targetPeriod;
        result = targetPeriod;
      }
    }

    // 更新分頻器
    if (this.divider === 0 || this.reloadFlag) {
      this.divider = this.period;
      this.reloadFlag = false;
    } else {
      this.divider--;
    }

    return result;
  }

  /**
   * 檢查是否應該靜音
   */
  public isMuting(currentPeriod: number): boolean {
    // 週期太小
    if (currentPeriod < 8) {
      return true;
    }

    // 目標週期太大
    if (!this.negate) {
      const changeAmount = currentPeriod >> this.shift;
      const targetPeriod = currentPeriod + changeAmount;
      if (targetPeriod > 0x7FF) {
        return true;
      }
    }

    return false;
  }

  // ===== 序列化 =====

  public saveState(): object {
    return {
      enabled: this.enabled,
      period: this.period,
      negate: this.negate,
      shift: this.shift,
      divider: this.divider,
      reloadFlag: this.reloadFlag,
      timerPeriod: this.timerPeriod,
    };
  }

  public loadState(state: any): void {
    this.enabled = state.enabled;
    this.period = state.period;
    this.negate = state.negate;
    this.shift = state.shift;
    this.divider = state.divider;
    this.reloadFlag = state.reloadFlag;
    this.timerPeriod = state.timerPeriod;
  }
}
