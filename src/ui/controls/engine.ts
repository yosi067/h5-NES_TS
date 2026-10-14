import { AutoFireClock, buildChordZones, composeMask, hitTestButtons, type HitButton } from './buttons';
import { DirectionTracker } from './direction';
import { CommandHistory, InputRibbon, directionSymbol, triggerHaptic } from './feedback';
import { bindSurface, type SurfacePoint } from './pointer-surface';
import { directionToMask, type ButtonConfig, type DirectionState, type DPadConfig } from './types';

const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;

export interface DirectionZoneSpec {
  container: HTMLElement;
  /** 固定模式取圓心用，也接收搖桿頭偏移的 CSS 變數。 */
  visual: HTMLElement;
  config: DPadConfig;
  sink: (mask: number) => void;
  directionEls?: Partial<Record<(typeof DIRECTIONS)[number], HTMLElement | null>>;
  trail?: boolean;
  history?: CommandHistory | null;
  hapticOnChange?: boolean;
  floatingRadius?: number;
  forceLegacy?: boolean;
}

export interface ButtonZoneSpec {
  container: HTMLElement;
  buttons: Array<{ el: HTMLElement; config: ButtonConfig }>;
  enableChordOverlap?: boolean;
  chordPairs?: Array<[string, string]>;
  /** 最小手指接觸半徑 (px)。功能鍵區建議取小值，避免 Select/Start 同時被按。 */
  minContact?: number;
  sink: (mask: number) => void;
  history?: CommandHistory | null;
  autoFirePeriodMs?: number;
  forceLegacy?: boolean;
}

export class TouchControlsEngine {
  private readonly disposers: Array<() => void> = [];
  private readonly releasers: Array<() => void> = [];

  addDirectionZone(spec: DirectionZoneSpec): void {
    const { container, visual, config } = spec;
    const floating = config.mode !== 'FIXED_DPAD';
    container.classList.add('pad-zone');
    container.dataset.padMode = floating ? 'floating' : 'fixed';

    let floatEl: HTMLElement | null = null;
    if (floating) {
      floatEl = document.createElement('div');
      floatEl.className = 'pad-float';
      floatEl.setAttribute('aria-hidden', 'true');
      floatEl.innerHTML = '<div class="pad-float-base"></div><div class="pad-float-knob"></div>';
      container.appendChild(floatEl);
    }
    const ribbon = spec.trail ? new InputRibbon(container) : null;

    const applyVisualState = (state: DirectionState) => {
      for (const direction of DIRECTIONS) spec.directionEls?.[direction]?.classList.toggle('pressed', state[direction]);
    };

    const tracker = new DirectionTracker({
      config,
      floatingRadius: spec.floatingRadius,
      getFixedCenter: () => {
        const rect = visual.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, radius: rect.width / 2 };
      },
      getZoneRect: () => container.getBoundingClientRect(),
      onState: (state) => {
        spec.sink(directionToMask(state));
        applyVisualState(state);
        const symbol = directionSymbol(state);
        if (symbol) {
          spec.history?.push(symbol);
          if (spec.hapticOnChange) triggerHaptic();
        }
      },
      onOrigin: (origin) => {
        if (!floatEl) return;
        if (!origin) {
          container.classList.remove('is-floating');
          return;
        }
        const rect = container.getBoundingClientRect();
        floatEl.style.setProperty('--ox', `${origin.x - rect.left}px`);
        floatEl.style.setProperty('--oy', `${origin.y - rect.top}px`);
        container.classList.add('is-floating');
      },
      onKnob: (dx, dy, engaged) => {
        const target = floatEl && container.classList.contains('is-floating') ? floatEl : visual;
        target.style.setProperty('--stick-x', `${dx}px`);
        target.style.setProperty('--stick-y', `${dy}px`);
        target.style.setProperty('--kx', `${dx}px`);
        target.style.setProperty('--ky', `${dy}px`);
        visual.classList.toggle('engaged', engaged);
      },
    });

    const disposeSurface = bindSurface(container, {
      down: (point) => {
        const started = tracker.begin(point.id, point.x, point.y);
        if (started) ribbon?.push(point.x, point.y);
        return started;
      },
      move: (point) => {
        tracker.move(point.id, point.x, point.y);
        ribbon?.push(point.x, point.y);
      },
      up: (point) => {
        tracker.end(point.id);
        ribbon?.clear();
      },
    }, spec.forceLegacy);

    this.releasers.push(() => tracker.release());
    this.disposers.push(() => {
      disposeSurface();
      tracker.release();
      ribbon?.dispose();
      floatEl?.remove();
      container.classList.remove('pad-zone', 'is-floating');
      delete container.dataset.padMode;
      visual.classList.remove('engaged');
      visual.style.removeProperty('--stick-x');
      visual.style.removeProperty('--stick-y');
      applyVisualState({ up: false, down: false, left: false, right: false });
    });
  }

  addButtonZone(spec: ButtonZoneSpec): void {
    const { container } = spec;
    const managed = new Set<HTMLElement>(spec.buttons.map((entry) => entry.el));
    const clock = new AutoFireClock(spec.autoFirePeriodMs);
    const minContact = spec.minContact ?? 28;
    const points = new Map<number, SurfacePoint>();
    let appliedMask = 0;
    let previousIds = new Set<string>();
    let tickHandle: number | null = null;
    container.classList.add('pad-zone');
    for (const el of managed) el.dataset.padManaged = '1';

    const layout = (): { buttons: HitButton[]; chordZones: ReturnType<typeof buildChordZones> } => {
      const buttons: HitButton[] = spec.buttons.map(({ el, config }) => {
        const rect = el.getBoundingClientRect();
        return {
          id: config.id,
          bitmask: config.bitmask,
          cx: rect.left + rect.width / 2,
          cy: rect.top + rect.height / 2,
          radius: config.radius ?? Math.min(rect.width, rect.height) / 2,
          autoFire: config.autoFire,
        };
      }).filter((button) => button.radius > 0);
      const chordZones = spec.enableChordOverlap
        ? buildChordZones(buttons, spec.chordPairs ?? [], Math.max(14, ...buttons.map((button) => button.radius)) * 0.6)
        : [];
      return { buttons, chordZones };
    };

    const emit = () => {
      const { buttons, chordZones } = layout();
      const ids = hitTestButtons(Array.from(points.values()).map((point) => ({
        x: point.x,
        y: point.y,
        rx: point.rx,
        ry: point.ry,
      })), buttons, chordZones, minContact);

      const composed = composeMask(ids, buttons);
      const mask = clock.apply(composed, performance.now());
      if (mask !== appliedMask) {
        appliedMask = mask;
        spec.sink(mask);
      }

      const newlyPressed: string[] = [];
      for (const { el, config } of spec.buttons) {
        const pressed = ids.has(config.id);
        el.classList.toggle('pressed', pressed);
        if (pressed && !previousIds.has(config.id)) newlyPressed.push(config.label);
      }
      previousIds = ids;
      if (newlyPressed.length > 0) {
        triggerHaptic();
        for (const label of newlyPressed) spec.history?.push(label);
      }

      if (clock.active && tickHandle === null) tickHandle = requestAnimationFrame(tick);
    };

    const tick = () => {
      tickHandle = null;
      if (points.size === 0) return;
      emit();
    };

    const disposeSurface = bindSurface(container, {
      down: (point, event) => {
        const target = event.target instanceof Element ? event.target.closest('button') : null;
        if (target && !managed.has(target as HTMLElement)) return false;
        points.set(point.id, point);
        emit();
        return true;
      },
      move: (point) => {
        points.set(point.id, point);
        emit();
      },
      up: (point) => {
        points.delete(point.id);
        emit();
      },
    }, spec.forceLegacy);

    const release = () => {
      points.clear();
      clock.reset();
      emit();
    };
    this.releasers.push(release);
    this.disposers.push(() => {
      disposeSurface();
      release();
      if (tickHandle !== null) cancelAnimationFrame(tickHandle);
      for (const el of managed) {
        delete el.dataset.padManaged;
        el.classList.remove('pressed');
      }
      container.classList.remove('pad-zone');
    });
  }

  releaseAll(): void {
    for (const release of this.releasers) release();
  }

  dispose(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers.length = 0;
    this.releasers.length = 0;
  }
}
