import { getBridgedDiagonal } from '../virtual-stick';
import { NEUTRAL_DIRECTION, type DirectionState, type DPadConfig } from './types';

/**
 * 極座標扇形判定：8 個扇形中，斜角佔 diagonalAngleWidth 度，其餘平分給四個正方向。
 * 角度採螢幕座標（y 向下），0° 為右、90° 為下。
 */
export function classifyDirection(
  dx: number,
  dy: number,
  deadzone: number,
  diagonalAngleWidth = 45,
): DirectionState {
  if (Math.hypot(dx, dy) < deadzone) return { ...NEUTRAL_DIRECTION };

  let theta = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (theta < 0) theta += 360;

  const diagonalWidth = Math.min(80, Math.max(10, diagonalAngleWidth));
  const cardinalHalfWidth = (90 - diagonalWidth) / 2;
  const nearestCardinal = Math.round(theta / 90);
  const delta = Math.abs(theta - nearestCardinal * 90);

  if (delta <= cardinalHalfWidth) {
    switch (((nearestCardinal % 4) + 4) % 4) {
      case 0: return { up: false, down: false, left: false, right: true };
      case 1: return { up: false, down: true, left: false, right: false };
      case 2: return { up: false, down: false, left: true, right: false };
      default: return { up: true, down: false, left: false, right: false };
    }
  }

  switch (Math.floor(theta / 90) % 4) {
    case 0: return { up: false, down: true, left: false, right: true };
    case 1: return { up: false, down: true, left: true, right: false };
    case 2: return { up: true, down: false, left: true, right: false };
    default: return { up: true, down: false, left: false, right: true };
  }
}

export interface Point {
  x: number;
  y: number;
}

export interface DirectionTrackerOptions {
  config: DPadConfig;
  /** 固定模式的圓心與半徑；浮動模式不使用。 */
  getFixedCenter: () => { x: number; y: number; radius: number };
  /** 浮動模式把圓心限制在此範圍內，避免搖桿底座被推出區域。 */
  getZoneRect?: () => { left: number; top: number; right: number; bottom: number };
  floatingRadius?: number;
  onState: (state: DirectionState) => void;
  onOrigin?: (origin: Point | null) => void;
  /** 搖桿頭偏移（相對圓心，px）與是否已脫離死區。 */
  onKnob?: (dx: number, dy: number, engaged: boolean) => void;
  schedule?: (callback: () => void) => number;
  cancel?: (handle: number) => void;
}

export class DirectionTracker {
  private pointerId: number | null = null;
  private origin: Point | null = null;
  private current: DirectionState = { ...NEUTRAL_DIRECTION };
  private pendingHandle: number | null = null;
  private readonly schedule: (callback: () => void) => number;
  private readonly cancelScheduled: (handle: number) => void;

  constructor(private readonly options: DirectionTrackerOptions) {
    this.schedule = options.schedule ?? ((callback) => requestAnimationFrame(callback));
    this.cancelScheduled = options.cancel ?? ((handle) => cancelAnimationFrame(handle));
  }

  get isActive(): boolean {
    return this.pointerId !== null;
  }

  get state(): DirectionState {
    return this.current;
  }

  begin(pointerId: number, x: number, y: number): boolean {
    if (this.pointerId !== null) return false;
    this.pointerId = pointerId;
    if (this.options.config.mode === 'FIXED_DPAD') {
      this.origin = null;
    } else {
      this.origin = this.clampOrigin({ x, y });
      this.options.onOrigin?.(this.origin);
    }
    this.update(x, y);
    return true;
  }

  move(pointerId: number, x: number, y: number): void {
    if (pointerId !== this.pointerId) return;
    if (this.options.config.mode === 'RELATIVE_DRAG' && this.origin) {
      // 相對拖曳：圓心跟著手指緩慢追隨，只保留最後一段方向意圖。
      const radius = this.options.floatingRadius ?? 56;
      const dx = x - this.origin.x;
      const dy = y - this.origin.y;
      const distance = Math.hypot(dx, dy);
      if (distance > radius) {
        const pull = (distance - radius) / distance;
        this.origin = { x: this.origin.x + dx * pull, y: this.origin.y + dy * pull };
        this.options.onOrigin?.(this.origin);
      }
    }
    this.update(x, y);
  }

  end(pointerId: number): void {
    if (pointerId !== this.pointerId) return;
    this.release();
  }

  release(): void {
    this.pointerId = null;
    this.origin = null;
    this.cancelPending();
    this.options.onOrigin?.(null);
    this.options.onKnob?.(0, 0, false);
    this.commit({ ...NEUTRAL_DIRECTION });
  }

  private clampOrigin(point: Point): Point {
    const rect = this.options.getZoneRect?.();
    if (!rect) return point;
    const radius = this.options.floatingRadius ?? 56;
    return {
      x: Math.min(Math.max(point.x, rect.left + radius), Math.max(rect.left + radius, rect.right - radius)),
      y: Math.min(Math.max(point.y, rect.top + radius), Math.max(rect.top + radius, rect.bottom - radius)),
    };
  }

  private update(x: number, y: number): void {
    const { config } = this.options;
    let center: Point;
    let travelRadius: number;
    if (config.mode === 'FIXED_DPAD' || !this.origin) {
      const fixed = this.options.getFixedCenter();
      center = { x: fixed.x, y: fixed.y };
      travelRadius = fixed.radius;
    } else {
      center = this.origin;
      travelRadius = this.options.floatingRadius ?? 56;
    }

    const dx = x - center.x;
    const dy = y - center.y;
    const distance = Math.hypot(dx, dy);
    const engaged = distance >= config.deadzone;
    const maxTravel = travelRadius * 0.48;
    const scale = distance > maxTravel ? maxTravel / distance : 1;
    this.options.onKnob?.(dx * scale, dy * scale, engaged);

    const next = classifyDirection(dx, dy, config.deadzone, config.diagonalAngleWidth);
    this.cancelPending();

    if (config.enableCardinalToDiagonalInterpolation) {
      const bridge = getBridgedDiagonal(this.current, next);
      if (bridge) {
        // 垂直與水平互跳時先補一格斜角，真正的目標方向延後一幀輸出。
        this.commit(bridge);
        this.pendingHandle = this.schedule(() => {
          this.pendingHandle = null;
          this.commit(next);
        });
        return;
      }
    }
    this.commit(next);
  }

  private cancelPending(): void {
    if (this.pendingHandle === null) return;
    this.cancelScheduled(this.pendingHandle);
    this.pendingHandle = null;
  }

  private commit(next: DirectionState): void {
    const current = this.current;
    if (
      current.up === next.up
      && current.down === next.down
      && current.left === next.left
      && current.right === next.right
    ) return;
    this.current = { ...next };
    this.options.onState(this.current);
  }
}
