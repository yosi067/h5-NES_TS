export interface TouchContactPoint {
  clientX: number;
  clientY: number;
  radiusX?: number;
  radiusY?: number;
}

export interface TouchContactRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TouchContactTarget {
  id: string;
  rect: TouchContactRect;
}

export function getTouchContactTargetIds(
  touch: TouchContactPoint,
  targets: TouchContactTarget[],
  minimumContactRadius = 32,
): Set<string> {
  const radiusX = Math.max(touch.radiusX ?? 0, minimumContactRadius);
  const radiusY = Math.max(touch.radiusY ?? 0, minimumContactRadius);
  const hits = new Set<string>();

  for (const target of targets) {
    const buttonRadius = Math.min(target.rect.width, target.rect.height) / 2;
    const centerX = target.rect.left + target.rect.width / 2;
    const centerY = target.rect.top + target.rect.height / 2;
    const normalizedX = (touch.clientX - centerX) / (radiusX + buttonRadius);
    const normalizedY = (touch.clientY - centerY) / (radiusY + buttonRadius);

    if (normalizedX * normalizedX + normalizedY * normalizedY <= 1) {
      hits.add(target.id);
    }
  }

  return hits;
}