/**
 * 長度計數器
 * 
 * 用於控制音符的持續時間
 * 當計數器達到 0 時，通道會被靜音
 */

export class LengthCounter {
  /** 計數器值 */
  private counter: number = 0;

  /** 停止旗標 (如果為 true，計數器不會遞減) */
  private haltFlag: boolean = false;

  constructor() {
    this.reset();
  }

  /**
   * 重置
   */
  public reset(): void {
    this.counter = 0;
    this.haltFlag = false;
  }

  /**
   * 載入計數器值
   */
  public load(value: number): void {
    this.counter = value;
  }

  /**
   * 設定停止旗標
   */
  public setHalt(halt: boolean): void {
    this.haltFlag = halt;
  }

  /**
   * 清除計數器
   */
  public clear(): void {
    this.counter = 0;
  }

  /**
   * 時鐘 (每個半幀)
   */
  public clock(): void {
    if (!this.haltFlag && this.counter > 0) {
      this.counter--;
    }
  }

  /**
   * 取得計數器值
   */
  public getValue(): number {
    return this.counter;
  }

  // ===== 序列化 =====

  public saveState(): object {
    return {
      counter: this.counter,
      haltFlag: this.haltFlag,
    };
  }

  public loadState(state: any): void {
    this.counter = state.counter;
    this.haltFlag = state.haltFlag;
  }
}
