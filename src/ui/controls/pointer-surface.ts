export interface SurfacePoint {
  id: number;
  x: number;
  y: number;
  /** 觸控接觸橢圓半徑 (px)。 */
  rx: number;
  ry: number;
}

export interface SurfaceHandlers {
  /** 回傳 false 代表忽略這次接觸（不攔截、不捕捉）。 */
  down(point: SurfacePoint, event: Event): boolean;
  move(point: SurfacePoint): void;
  up(point: SurfacePoint): void;
}

/**
 * 在單一容器上追蹤所有指標：優先使用 Pointer Events，
 * 舊版 Android WebView 等缺少支援時退回 Touch/Mouse 事件。
 */
export function bindSurface(el: HTMLElement, handlers: SurfaceHandlers, forceLegacy = false): () => void {
  const disposers: Array<() => void> = [];
  const owned = new Set<number>();
  const listen = <T extends Event>(
    target: EventTarget,
    type: string,
    listener: (event: T) => void,
    options?: AddEventListenerOptions,
  ) => {
    target.addEventListener(type, listener as EventListener, options);
    disposers.push(() => target.removeEventListener(type, listener as EventListener, options));
  };

  listen(el, 'contextmenu', (event: Event) => event.preventDefault());

  if (typeof PointerEvent !== 'undefined' && !forceLegacy) {
    const toPoint = (event: PointerEvent): SurfacePoint => ({
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      rx: event.pointerType === 'mouse' ? 0 : Math.max(0, event.width / 2),
      ry: event.pointerType === 'mouse' ? 0 : Math.max(0, event.height / 2),
    });

    listen(el, 'pointerdown', (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const point = toPoint(event);
      if (!handlers.down(point, event)) return;
      owned.add(point.id);
      event.preventDefault();
      try {
        el.setPointerCapture(point.id);
      } catch {
        // 部分舊瀏覽器拒絕捕捉，但仍會送出後續事件。
      }
    });
    listen(el, 'pointermove', (event: PointerEvent) => {
      if (!owned.has(event.pointerId)) return;
      event.preventDefault();
      handlers.move(toPoint(event));
    });
    const finish = (event: PointerEvent) => {
      if (!owned.has(event.pointerId)) return;
      owned.delete(event.pointerId);
      event.preventDefault();
      handlers.up(toPoint(event));
    };
    listen(el, 'pointerup', finish);
    listen(el, 'pointercancel', finish);
    listen(el, 'lostpointercapture', finish);
  } else {
    const toTouchPoint = (touch: Touch): SurfacePoint => ({
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      rx: touch.radiusX || 0,
      ry: touch.radiusY || 0,
    });
    listen(el, 'touchstart', (event: TouchEvent) => {
      let claimed = false;
      for (const touch of Array.from(event.changedTouches)) {
        const point = toTouchPoint(touch);
        if (handlers.down(point, event)) {
          owned.add(point.id);
          claimed = true;
        }
      }
      if (claimed) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, { passive: false });
    listen(el, 'touchmove', (event: TouchEvent) => {
      let handled = false;
      for (const touch of Array.from(event.changedTouches)) {
        if (!owned.has(touch.identifier)) continue;
        handlers.move(toTouchPoint(touch));
        handled = true;
      }
      if (handled) event.preventDefault();
    }, { passive: false });
    const finishTouch = (event: TouchEvent) => {
      let handled = false;
      for (const touch of Array.from(event.changedTouches)) {
        if (!owned.has(touch.identifier)) continue;
        owned.delete(touch.identifier);
        handlers.up(toTouchPoint(touch));
        handled = true;
      }
      if (handled) event.preventDefault();
    };
    listen(el, 'touchend', finishTouch, { passive: false });
    listen(el, 'touchcancel', finishTouch, { passive: false });

    const MOUSE_ID = -1;
    listen(el, 'mousedown', (event: MouseEvent) => {
      if (event.button !== 0) return;
      const point = { id: MOUSE_ID, x: event.clientX, y: event.clientY, rx: 0, ry: 0 };
      if (!handlers.down(point, event)) return;
      owned.add(MOUSE_ID);
      event.preventDefault();
    });
    listen(document, 'mousemove', (event: MouseEvent) => {
      if (!owned.has(MOUSE_ID)) return;
      handlers.move({ id: MOUSE_ID, x: event.clientX, y: event.clientY, rx: 0, ry: 0 });
    });
    listen(document, 'mouseup', (event: MouseEvent) => {
      if (!owned.has(MOUSE_ID)) return;
      owned.delete(MOUSE_ID);
      handlers.up({ id: MOUSE_ID, x: event.clientX, y: event.clientY, rx: 0, ry: 0 });
    });
  }

  return () => {
    for (const dispose of disposers) dispose();
    disposers.length = 0;
  };
}
