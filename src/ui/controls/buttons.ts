export interface HitButton {
  id: string;
  bitmask: number;
  cx: number;
  cy: number;
  /** 按鈕本身半徑 (px)。 */
  radius: number;
  autoFire?: boolean;
}

export interface ChordZone {
  cx: number;
  cy: number;
  radius: number;
  ids: string[];
}

export interface ContactPoint {
  x: number;
  y: number;
  /** 觸控接觸橢圓半徑（px），未提供時為 0。 */
  rx?: number;
  ry?: number;
}

function insideEllipse(
  point: ContactPoint,
  cx: number,
  cy: number,
  reach: number,
  minContact: number,
): boolean {
  const rx = Math.max(point.rx ?? 0, minContact) + reach;
  const ry = Math.max(point.ry ?? 0, minContact) + reach;
  const nx = (point.x - cx) / rx;
  const ny = (point.y - cy) / ry;
  return nx * nx + ny * ny <= 1;
}

/** 容器級多點掃描：只要觸控接觸面碰到按鈕或隱形重疊區就算按下，因此可滑過、可同時壓兩鍵。 */
export function hitTestButtons(
  points: ContactPoint[],
  buttons: HitButton[],
  chords: ChordZone[],
  minContact: number,
): Set<string> {
  const hits = new Set<string>();
  for (const point of points) {
    for (const button of buttons) {
      if (insideEllipse(point, button.cx, button.cy, button.radius, minContact)) hits.add(button.id);
    }
    for (const chord of chords) {
      // 重疊區採點判定，不放大接觸面，避免整排按鈕被一起觸發。
      if (insideEllipse({ x: point.x, y: point.y }, chord.cx, chord.cy, chord.radius, 0)) {
        for (const id of chord.ids) hits.add(id);
      }
    }
  }
  return hits;
}

export function buildChordZones(
  buttons: HitButton[],
  pairs: Array<[string, string]>,
  radius: number,
): ChordZone[] {
  const byId = new Map(buttons.map((button) => [button.id, button]));
  const zones: ChordZone[] = [];
  for (const [first, second] of pairs) {
    const a = byId.get(first);
    const b = byId.get(second);
    if (!a || !b) continue;
    zones.push({ cx: (a.cx + b.cx) / 2, cy: (a.cy + b.cy) / 2, radius, ids: [first, second] });
  }
  return zones;
}

export interface ComposedMask {
  /** 一般按住的位元。 */
  steady: number;
  /** 連發按住的位元。 */
  turbo: number;
}

export function composeMask(ids: ReadonlySet<string>, buttons: HitButton[]): ComposedMask {
  let steady = 0;
  let turbo = 0;
  for (const button of buttons) {
    if (!ids.has(button.id)) continue;
    if (button.autoFire) turbo |= button.bitmask;
    else steady |= button.bitmask;
  }
  return { steady, turbo };
}

/** 連發時序：按住後立即進入「按下」相位，之後每 period 毫秒反轉一次。 */
export class AutoFireClock {
  private readonly since = new Map<number, number>();

  constructor(private readonly periodMs = (3 * 1000) / 60) {}

  get active(): boolean {
    return this.since.size > 0;
  }

  apply(composed: ComposedMask, now: number): number {
    let pulsed = 0;
    for (const bit of this.since.keys()) {
      if ((composed.turbo & bit) === 0) this.since.delete(bit);
    }
    for (let bit = 1; bit !== 0 && bit <= composed.turbo; bit <<= 1) {
      if ((composed.turbo & bit) === 0) continue;
      let start = this.since.get(bit);
      if (start === undefined) {
        start = now;
        this.since.set(bit, start);
      }
      if (Math.floor((now - start) / this.periodMs) % 2 === 0) pulsed |= bit;
    }
    return composed.steady | pulsed;
  }

  reset(): void {
    this.since.clear();
  }
}

export type MaskApplier = ((mask: number) => void) & { release: () => void };

/** 把位元遮罩差異轉成逐鍵 press/release，並記住目前狀態。 */
export function createMaskApplier(table: Array<[number, (pressed: boolean) => void]>): MaskApplier {
  let previous = 0;
  const applier = ((mask: number) => {
    const changed = previous ^ mask;
    if (changed === 0) return;
    for (const [bit, setPressed] of table) {
      if (changed & bit) setPressed((mask & bit) !== 0);
    }
    previous = mask;
  }) as MaskApplier;
  applier.release = () => applier(0);
  return applier;
}

/** 多個觸控區輸出同一組實體按鍵時，以 OR 合併，避免某區放開時誤放開另一區仍按住的鍵。 */
export function createMaskMux(apply: (mask: number) => void): { slot: () => (mask: number) => void } {
  const masks: number[] = [];
  return {
    slot() {
      const index = masks.length;
      masks.push(0);
      return (mask: number) => {
        masks[index] = mask;
        apply(masks.reduce((merged, value) => merged | value, 0));
      };
    },
  };
}
