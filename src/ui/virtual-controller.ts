/**
 * 虛擬控制器 - GameBoy 風格觸控按鈕
 * 
 * 為手機版提供虛擬按鍵控制
 */

import type { Controller } from '../core/controller';
import { ControllerButton } from '../core';

/**
 * 虛擬控制器類別
 */
export class VirtualController {
  private controller: Controller;
  private container: HTMLElement | null = null;
  
  // 按鈕元素
  private dpadUp: HTMLElement | null = null;
  private dpadDown: HTMLElement | null = null;
  private dpadLeft: HTMLElement | null = null;
  private dpadRight: HTMLElement | null = null;
  private btnA: HTMLElement | null = null;
  private btnB: HTMLElement | null = null;
  private btnStart: HTMLElement | null = null;
  private btnSelect: HTMLElement | null = null;

  constructor(controller: Controller) {
    this.controller = controller;
  }

  /**
   * 建立虛擬控制器 UI
   */
  public create(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'virtual-controller';
    this.container.innerHTML = `
      <!-- 左側 D-Pad -->
      <div class="dpad-container">
        <div class="dpad">
          <button class="dpad-btn dpad-up" data-btn="up">
            <span class="dpad-arrow">▲</span>
          </button>
          <button class="dpad-btn dpad-left" data-btn="left">
            <span class="dpad-arrow">◀</span>
          </button>
          <div class="dpad-center"></div>
          <button class="dpad-btn dpad-right" data-btn="right">
            <span class="dpad-arrow">▶</span>
          </button>
          <button class="dpad-btn dpad-down" data-btn="down">
            <span class="dpad-arrow">▼</span>
          </button>
        </div>
      </div>
      
      <!-- 中間 Select/Start -->
      <div class="center-btns">
        <button class="func-btn select-btn" data-btn="select">SELECT</button>
        <button class="func-btn start-btn" data-btn="start">START</button>
      </div>
      
      <!-- 右側 A/B 按鈕 -->
      <div class="ab-container">
        <button class="action-btn btn-b" data-btn="b">B</button>
        <button class="action-btn btn-a" data-btn="a">A</button>
      </div>
    `;

    // 綁定事件
    this.bindEvents();

    return this.container;
  }

  /**
   * 綁定觸控事件
   */
  private bindEvents(): void {
    if (!this.container) return;

    // 取得所有按鈕
    const buttons = this.container.querySelectorAll('[data-btn]');
    
    buttons.forEach(btn => {
      const button = btn as HTMLElement;
      const btnType = button.dataset.btn;

      // 觸控開始
      button.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.handleButtonPress(btnType!, true);
        button.classList.add('pressed');
      }, { passive: false });

      // 觸控結束
      button.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.handleButtonPress(btnType!, false);
        button.classList.remove('pressed');
      }, { passive: false });

      // 觸控取消
      button.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        this.handleButtonPress(btnType!, false);
        button.classList.remove('pressed');
      }, { passive: false });

      // 滑鼠事件 (用於測試)
      button.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.handleButtonPress(btnType!, true);
        button.classList.add('pressed');
      });

      button.addEventListener('mouseup', (e) => {
        e.preventDefault();
        this.handleButtonPress(btnType!, false);
        button.classList.remove('pressed');
      });

      button.addEventListener('mouseleave', () => {
        this.handleButtonPress(btnType!, false);
        button.classList.remove('pressed');
      });
    });

    // 防止意外觸發
    this.container.addEventListener('touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });
  }

  /**
   * 處理按鈕按下/釋放
   */
  private handleButtonPress(btnType: string, pressed: boolean): void {
    const buttonMap: Record<string, ControllerButton> = {
      'up': ControllerButton.Up,
      'down': ControllerButton.Down,
      'left': ControllerButton.Left,
      'right': ControllerButton.Right,
      'a': ControllerButton.A,
      'b': ControllerButton.B,
      'start': ControllerButton.Start,
      'select': ControllerButton.Select,
    };

    const button = buttonMap[btnType];
    if (button !== undefined) {
      this.controller.setButton(button, pressed);
    }
  }

  /**
   * 顯示控制器
   */
  public show(): void {
    if (this.container) {
      this.container.style.display = 'flex';
    }
  }

  /**
   * 隱藏控制器
   */
  public hide(): void {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  /**
   * 銷毀控制器
   */
  public destroy(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
  }
}

/**
 * 虛擬控制器 CSS 樣式
 */
export const virtualControllerStyles = `
/* ===== 虛擬控制器 ===== */
.virtual-controller {
  display: none;
  width: 100%;
  padding: 15px;
  justify-content: space-between;
  align-items: center;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

/* D-Pad 容器 */
.dpad-container {
  flex: 0 0 auto;
}

.dpad {
  display: grid;
  grid-template-columns: 50px 50px 50px;
  grid-template-rows: 50px 50px 50px;
  gap: 0;
}

.dpad-btn {
  width: 50px;
  height: 50px;
  border: none;
  background: linear-gradient(145deg, #3a3a4a, #2a2a3a);
  color: #666;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.1s;
}

.dpad-btn:active, .dpad-btn.pressed {
  background: linear-gradient(145deg, #2a2a3a, #3a3a4a);
  color: #e94560;
  transform: scale(0.95);
}

.dpad-up { 
  grid-column: 2; 
  grid-row: 1;
  border-radius: 8px 8px 0 0;
}

.dpad-down { 
  grid-column: 2; 
  grid-row: 3;
  border-radius: 0 0 8px 8px;
}

.dpad-left { 
  grid-column: 1; 
  grid-row: 2;
  border-radius: 8px 0 0 8px;
}

.dpad-right { 
  grid-column: 3; 
  grid-row: 2;
  border-radius: 0 8px 8px 0;
}

.dpad-center {
  grid-column: 2;
  grid-row: 2;
  background: #333;
  width: 50px;
  height: 50px;
}

.dpad-arrow {
  pointer-events: none;
}

/* 中間按鈕 (SELECT/START) */
.center-btns {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.func-btn {
  width: 70px;
  height: 28px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(145deg, #444, #333);
  color: #888;
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 1px;
  cursor: pointer;
  transform: rotate(-25deg);
  transition: all 0.1s;
}

.func-btn:active, .func-btn.pressed {
  background: linear-gradient(145deg, #333, #444);
  color: #e94560;
  transform: rotate(-25deg) scale(0.95);
}

/* A/B 按鈕 */
.ab-container {
  flex: 0 0 auto;
  display: flex;
  gap: 15px;
  transform: rotate(-25deg);
}

.action-btn {
  width: 65px;
  height: 65px;
  border: none;
  border-radius: 50%;
  font-size: 22px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.1s;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3),
              inset 0 2px 4px rgba(255, 255, 255, 0.1);
}

.btn-a {
  background: linear-gradient(145deg, #e94560, #c73550);
  color: #fff;
}

.btn-b {
  background: linear-gradient(145deg, #e94560, #c73550);
  color: #fff;
}

.action-btn:active, .action-btn.pressed {
  transform: scale(0.9);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3),
              inset 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* RWD - 只在手機版顯示 */
@media (max-width: 768px) {
  .virtual-controller {
    display: flex;
  }
}

@media (max-width: 430px) {
  .dpad-btn {
    width: 45px;
    height: 45px;
  }
  
  .dpad-center {
    width: 45px;
    height: 45px;
  }
  
  .action-btn {
    width: 58px;
    height: 58px;
    font-size: 20px;
  }
  
  .func-btn {
    width: 60px;
    height: 24px;
    font-size: 9px;
  }
}
`;
