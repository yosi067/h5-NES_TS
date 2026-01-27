/**
 * NES 控制器模擬
 * 
 * 標準 NES 控制器有 8 個按鈕，按讀取順序：
 * A, B, Select, Start, Up, Down, Left, Right
 */

/**
 * 控制器按鈕
 */
export enum ControllerButton {
  A = 0,
  B = 1,
  Select = 2,
  Start = 3,
  Up = 4,
  Down = 5,
  Left = 6,
  Right = 7,
}

/**
 * 控制器按鈕位元遮罩
 */
export const BUTTON_MASKS = {
  [ControllerButton.A]: 1 << 7,
  [ControllerButton.B]: 1 << 6,
  [ControllerButton.Select]: 1 << 5,
  [ControllerButton.Start]: 1 << 4,
  [ControllerButton.Up]: 1 << 3,
  [ControllerButton.Down]: 1 << 2,
  [ControllerButton.Left]: 1 << 1,
  [ControllerButton.Right]: 1 << 0,
};

/**
 * 控制器類別
 */
export class Controller {
  /** 按鈕狀態 (8 位元，每個位元代表一個按鈕) */
  private buttonState: number = 0;

  constructor() {
    this.buttonState = 0;
  }

  /**
   * 設定按鈕狀態
   * @param button 按鈕
   * @param pressed 是否按下
   */
  public setButton(button: ControllerButton, pressed: boolean): void {
    const mask = BUTTON_MASKS[button];
    if (pressed) {
      this.buttonState |= mask;
    } else {
      this.buttonState &= ~mask;
    }
  }

  /**
   * 取得按鈕狀態
   * @param button 按鈕
   * @returns 是否按下
   */
  public isButtonPressed(button: ControllerButton): boolean {
    return (this.buttonState & BUTTON_MASKS[button]) !== 0;
  }

  /**
   * 取得完整的按鈕狀態 (用於序列化讀取)
   * @returns 8 位元狀態值
   */
  public getState(): number {
    return this.buttonState;
  }

  /**
   * 重置所有按鈕
   */
  public reset(): void {
    this.buttonState = 0;
  }
}

/**
 * 預設鍵盤映射 (玩家 1)
 */
export const DEFAULT_KEYBOARD_MAP_P1: Record<string, ControllerButton> = {
  'KeyZ': ControllerButton.A,
  'KeyX': ControllerButton.B,
  'ShiftRight': ControllerButton.Select,
  'Enter': ControllerButton.Start,
  'ArrowUp': ControllerButton.Up,
  'ArrowDown': ControllerButton.Down,
  'ArrowLeft': ControllerButton.Left,
  'ArrowRight': ControllerButton.Right,
};

/**
 * 預設鍵盤映射 (玩家 2)
 */
export const DEFAULT_KEYBOARD_MAP_P2: Record<string, ControllerButton> = {
  'KeyN': ControllerButton.A,
  'KeyM': ControllerButton.B,
  'KeyQ': ControllerButton.Select,
  'KeyW': ControllerButton.Start,
  'KeyI': ControllerButton.Up,
  'KeyK': ControllerButton.Down,
  'KeyJ': ControllerButton.Left,
  'KeyL': ControllerButton.Right,
};

/**
 * 鍵盤輸入處理器
 */
export class KeyboardInputHandler {
  private controller: Controller;
  private keyMap: Record<string, ControllerButton>;

  constructor(controller: Controller, keyMap: Record<string, ControllerButton>) {
    this.controller = controller;
    this.keyMap = keyMap;
  }

  /**
   * 處理按鍵按下
   */
  public handleKeyDown(event: KeyboardEvent): void {
    const button = this.keyMap[event.code];
    if (button !== undefined) {
      this.controller.setButton(button, true);
      event.preventDefault();
    }
  }

  /**
   * 處理按鍵釋放
   */
  public handleKeyUp(event: KeyboardEvent): void {
    const button = this.keyMap[event.code];
    if (button !== undefined) {
      this.controller.setButton(button, false);
      event.preventDefault();
    }
  }

  /**
   * 綁定到 window 事件
   */
  public bind(): void {
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('keyup', this.handleKeyUp.bind(this));
  }

  /**
   * 解除綁定
   */
  public unbind(): void {
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    window.removeEventListener('keyup', this.handleKeyUp.bind(this));
  }
}
