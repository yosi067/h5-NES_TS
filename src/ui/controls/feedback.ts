import type { DirectionState } from './types';

let lastHapticAt = 0;

/** 極短促微震動；不支援的瀏覽器（iOS Safari / LINE）靜默略過。 */
export function triggerHaptic(durationMs = 10): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const now = performance.now();
  if (now - lastHapticAt < 25) return;
  lastHapticAt = now;
  try {
    navigator.vibrate(durationMs);
  } catch {
    // 某些 WebView 在無使用者啟動時會拋錯。
  }
}

/** 未觸碰超過 idleMs 就淡出，觸碰時立即恢復。 */
export class IdleFader {
  private timer: number | null = null;

  constructor(private readonly el: HTMLElement, private readonly idleMs = 3000) {
    this.el.classList.add('pad-fader');
    this.schedule();
  }

  wake(): void {
    this.el.classList.remove('pad-idle');
    this.schedule();
  }

  dispose(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.el.classList.remove('pad-idle', 'pad-fader');
  }

  private schedule(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.el.classList.add('pad-idle'), this.idleMs);
  }
}

const TRAIL_MAX_POINTS = 10;
const TRAIL_LIFETIME_MS = 420;

interface TrailPoint {
  x: number;
  y: number;
  at: number;
}

/** 方向區滑動殘影：最近 10 個點，漸細、半透明淡出。 */
export class InputRibbon {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private points: TrailPoint[] = [];
  private frame: number | null = null;

  constructor(private readonly host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pad-ribbon';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.context = this.canvas.getContext('2d');
    this.host.appendChild(this.canvas);
  }

  push(clientX: number, clientY: number): void {
    const rect = this.host.getBoundingClientRect();
    this.points.push({ x: clientX - rect.left, y: clientY - rect.top, at: performance.now() });
    if (this.points.length > TRAIL_MAX_POINTS) this.points.shift();
    if (this.frame === null) this.frame = requestAnimationFrame(this.draw);
  }

  clear(): void {
    this.points = [];
  }

  dispose(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.canvas.remove();
  }

  private readonly draw = (): void => {
    this.frame = null;
    const context = this.context;
    if (!context) return;
    const rect = this.host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);

    const now = performance.now();
    this.points = this.points.filter((point) => now - point.at < TRAIL_LIFETIME_MS);
    if (this.points.length >= 2) {
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.shadowColor = 'rgba(120, 220, 255, 0.9)';
      context.shadowBlur = 10;
      for (let index = 1; index < this.points.length; index++) {
        const previous = this.points[index - 1];
        const point = this.points[index];
        const age = (now - point.at) / TRAIL_LIFETIME_MS;
        const progress = index / (this.points.length - 1);
        context.strokeStyle = `rgba(150, 230, 255, ${Math.max(0, (1 - age) * 0.85)})`;
        context.lineWidth = 2 + 7 * progress;
        context.beginPath();
        context.moveTo(previous.x, previous.y);
        context.lineTo(point.x, point.y);
        context.stroke();
      }
    }
    if (this.points.length > 0) this.frame = requestAnimationFrame(this.draw);
  };
}

const ARROWS: Record<string, string> = {
  up: '↑',
  'up+right': '↗',
  right: '→',
  'down+right': '↘',
  down: '↓',
  'down+left': '↙',
  left: '←',
  'up+left': '↖',
};

export function directionSymbol(state: DirectionState): string | null {
  const vertical = state.up ? 'up' : state.down ? 'down' : '';
  const horizontal = state.left ? 'left' : state.right ? 'right' : '';
  const key = [vertical, horizontal].filter(Boolean).join('+');
  return key ? ARROWS[key] : null;
}

/** 邊緣指令列：最近 15 個方向與按鍵變化。 */
export class CommandHistory {
  private readonly entries: string[] = [];
  private fadeTimer: number | null = null;

  constructor(private readonly el: HTMLElement, private readonly max = 15) {}

  push(symbol: string): void {
    if (this.entries[this.entries.length - 1] === symbol && symbol.length === 1 && ARROWS_SET.has(symbol)) return;
    this.entries.push(symbol);
    if (this.entries.length > this.max) this.entries.shift();
    this.el.classList.remove('is-faded');
    this.render();
    if (this.fadeTimer !== null) window.clearTimeout(this.fadeTimer);
    this.fadeTimer = window.setTimeout(() => this.el.classList.add('is-faded'), 4000);
  }

  clear(): void {
    this.entries.length = 0;
    this.render();
  }

  dispose(): void {
    if (this.fadeTimer !== null) window.clearTimeout(this.fadeTimer);
    this.el.replaceChildren();
  }

  private render(): void {
    this.el.replaceChildren(...this.entries.map((symbol) => {
      const item = document.createElement('span');
      item.className = ARROWS_SET.has(symbol) ? 'pad-history-dir' : 'pad-history-btn';
      item.textContent = symbol;
      return item;
    }));
  }
}

const ARROWS_SET = new Set(Object.values(ARROWS));
