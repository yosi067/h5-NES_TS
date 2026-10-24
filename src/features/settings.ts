/**
 * 玩家偏好。預設值維持原本行為；讀取失敗或欄位不合法時一律回到預設。
 * 舊版存過的其他欄位（倒帶、雙人等）會被忽略，不影響讀取。
 */
export interface FeatureSettings {
  /** 快轉倍率（手機按鈕循環切換、電腦按住 Tab 使用）。 */
  fastForwardSpeed: 2 | 4;
  /** 觸控按鍵不透明度（%）。100 = 原本外觀。 */
  padOpacity: number;
  /** 觸控按鍵大小（%）。100 = 原本大小。 */
  padScale: number;
}

export const FEATURE_SETTINGS_KEY = 'h5emu.features.v1';

export const DEFAULT_FEATURE_SETTINGS: Readonly<FeatureSettings> = Object.freeze({
  fastForwardSpeed: 2,
  padOpacity: 100,
  padScale: 100,
});

export const PAD_OPACITY_CHOICES = [100, 70, 40] as const;
export const PAD_SCALE_CHOICES = [90, 100, 115] as const;

function pick<T extends number>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'number' && (choices as readonly number[]).includes(value) ? value as T : fallback;
}

export function normalizeFeatureSettings(raw: unknown): FeatureSettings {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    fastForwardSpeed: pick(value.fastForwardSpeed, [2, 4] as const, 2),
    padOpacity: pick(value.padOpacity, PAD_OPACITY_CHOICES, 100),
    padScale: pick(value.padScale, PAD_SCALE_CHOICES, 100),
  };
}

export class FeatureSettingsStore {
  private value: FeatureSettings;
  private readonly listeners = new Set<(settings: FeatureSettings) => void>();

  constructor(private readonly storage: Storage | null) {
    let parsed: unknown = null;
    try {
      const raw = storage?.getItem(FEATURE_SETTINGS_KEY);
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    this.value = normalizeFeatureSettings(parsed);
  }

  get(): FeatureSettings {
    return { ...this.value };
  }

  update(patch: Partial<FeatureSettings>): FeatureSettings {
    this.value = normalizeFeatureSettings({ ...this.value, ...patch });
    try {
      this.storage?.setItem(FEATURE_SETTINGS_KEY, JSON.stringify(this.value));
    } catch {
      // 無法保存時仍套用於本次工作階段。
    }
    for (const listener of this.listeners) listener(this.get());
    return this.get();
  }

  subscribe(listener: (settings: FeatureSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
