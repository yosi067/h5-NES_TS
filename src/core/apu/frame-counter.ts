/**
 * APU 幀計數器
 * 
 * 控制包絡線、長度計數器和掃頻單元的時序
 * 支援 4 步模式和 5 步模式
 */

/**
 * 幀計數器模式
 */
export enum FrameCounterMode {
  /** 4 步模式 (產生 IRQ) */
  FourStep = 0,
  /** 5 步模式 (不產生 IRQ) */
  FiveStep = 1,
}

/**
 * 4 步序列 (以 CPU 週期為單位)
 * 每個值表示該步驟觸發的時間點
 */
const FOUR_STEP_SEQUENCE = [7457, 14913, 22371, 29829];

/**
 * 5 步序列 (以 CPU 週期為單位)
 */
const FIVE_STEP_SEQUENCE = [7457, 14913, 22371, 29829, 37281];

/**
 * 幀計數器類別
 */
export class FrameCounter {
  /** 模式 */
  private mode: FrameCounterMode = FrameCounterMode.FourStep;

  /** IRQ 禁用旗標 */
  private irqInhibit: boolean = false;

  /** 時鐘計數器 */
  private clockCounter: number = 0;

  /** 當前步驟 */
  private currentStep: number = 0;

  /** IRQ 旗標 */
  private irqFlag: boolean = false;

  /** IRQ 回調 */
  private irqCallback: (() => void) | null = null;

  constructor() {
    this.reset();
  }

  /**
   * 重置
   */
  public reset(): void {
    this.mode = FrameCounterMode.FourStep;
    this.irqInhibit = false;
    this.clockCounter = 0;
    this.currentStep = 0;
    this.irqFlag = false;
  }

  /**
   * 設定 IRQ 回調
   */
  public setIrqCallback(callback: () => void): void {
    this.irqCallback = callback;
  }

  /**
   * 寫入暫存器 ($4017)
   * 
   * MI-- ----
   * M: 模式 (0 = 4步, 1 = 5步)
   * I: IRQ 禁用
   */
  public write(data: number): void {
    this.mode = (data & 0x80) ? FrameCounterMode.FiveStep : FrameCounterMode.FourStep;
    this.irqInhibit = (data & 0x40) !== 0;

    if (this.irqInhibit) {
      this.irqFlag = false;
    }

    // 重置計數器
    this.clockCounter = 0;
    this.currentStep = 0;

    // 5 步模式在寫入時立即觸發一次
    if (this.mode === FrameCounterMode.FiveStep) {
      // 立即觸發半幀和四分之一幀
      return; // 回傳到主循環處理
    }
  }

  /**
   * 時鐘 (每個 CPU 週期呼叫)
   * 回傳需要執行的動作:
   * - 0: 無動作
   * - 1: 四分之一幀 (包絡線 & 線性計數器)
   * - 2: 半幀 (長度計數器 & 掃頻)
   * - 3: 兩者都執行
   */
  public clock(): number {
    this.clockCounter++;

    const sequence = this.mode === FrameCounterMode.FourStep 
      ? FOUR_STEP_SEQUENCE 
      : FIVE_STEP_SEQUENCE;

    if (this.currentStep >= sequence.length) {
      return 0;
    }

    if (this.clockCounter >= sequence[this.currentStep]) {
      let action = 0;

      if (this.mode === FrameCounterMode.FourStep) {
        // 4 步模式
        switch (this.currentStep) {
          case 0: // 步驟 1: 四分之一幀
            action = 1;
            break;
          case 1: // 步驟 2: 半幀
            action = 3;
            break;
          case 2: // 步驟 3: 四分之一幀
            action = 1;
            break;
          case 3: // 步驟 4: 半幀 + IRQ
            action = 3;
            if (!this.irqInhibit) {
              this.irqFlag = true;
              if (this.irqCallback) {
                this.irqCallback();
              }
            }
            // 重置計數器
            this.clockCounter = 0;
            this.currentStep = -1; // 會在下面 +1
            break;
        }
      } else {
        // 5 步模式
        switch (this.currentStep) {
          case 0: // 步驟 1: 四分之一幀
            action = 1;
            break;
          case 1: // 步驟 2: 半幀
            action = 3;
            break;
          case 2: // 步驟 3: 四分之一幀
            action = 1;
            break;
          case 3: // 步驟 4: 無動作
            action = 0;
            break;
          case 4: // 步驟 5: 半幀
            action = 3;
            // 重置計數器
            this.clockCounter = 0;
            this.currentStep = -1;
            break;
        }
      }

      this.currentStep++;
      return action;
    }

    return 0;
  }

  /**
   * 取得 IRQ 旗標
   */
  public getIrqFlag(): boolean {
    return this.irqFlag;
  }

  /**
   * 清除 IRQ 旗標
   */
  public clearIrqFlag(): void {
    this.irqFlag = false;
  }

  // ===== 序列化 =====

  public saveState(): object {
    return {
      mode: this.mode,
      irqInhibit: this.irqInhibit,
      clockCounter: this.clockCounter,
      currentStep: this.currentStep,
      irqFlag: this.irqFlag,
    };
  }

  public loadState(state: any): void {
    this.mode = state.mode;
    this.irqInhibit = state.irqInhibit;
    this.clockCounter = state.clockCounter;
    this.currentStep = state.currentStep;
    this.irqFlag = state.irqFlag;
  }
}
