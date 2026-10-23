/**
 * 新增功能的使用者偏好。全部是「選用」：預設值維持原本行為，
 * 讀取失敗或欄位不合法時一律回到預設，不影響既有設定鍵。
 */
export interface FeatureSettings {
  /** 倒帶需要每隔數十幀存一份快照，預設關閉以免增加記憶體與 CPU 負擔。 */
  rewindEnabled: boolean;
  /** 快轉倍率（按住 Tab 或開啟快轉開關時使用）。 */
  fastForwardSpeed: 2 | 3 | 4;
  /** 離開遊戲時自動存一份「續玩」存檔，並在下次開啟同一款遊戲時提示。 */
  autosave: boolean;
  /** 鍵盤第二玩家（I/J/K/L 等）。第二支手把一律對應 2P，不受此開關影響。 */
  twoPlayerKeyboard: boolean;
  /** 觸控按鍵不透明度（%）。100 = 原本外觀。 */
  padOpacity: number;
  /** 觸控按鍵大小（%）。100 = 原本大小。 */
  padScale: number;
}

export const FEATURE_SETTINGS_KEY = 'h5emu.features.v1';

export const DEFAULT_FEATURE_SETTINGS: Readonly<FeatureSettings> = Object.freeze({
  rewindEnabled: false,
  fastForwardSpeed: 2,
  autosave: true,
  twoPlayerKeyboard: false,
  padOpacity: 100,
  padScale: 100,
});

export const PAD_OPACITY_CHOICES = [100, 80, 60, 40] as const;
export const PAD_SCALE_CHOICES = [85, 100, 110, 120] as const;

function pick<T extends number>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'number' && (choices as readonly number[]).includes(value) ? value as T : fallback;
}

export function normalizeFeatureSettings(raw: unknown): FeatureSettings {
  const base = { ...DEFAULT_FEATURE_SETTINGS };
  if (!raw || typeof raw !== 'object') return base;
  const value = raw as Record<string, unknown>;
  return {
    rewindEnabled: value.rewindEnabled === true,
    fastForwardSpeed: pick(value.fastForwardSpeed, [2, 3, 4] as const, base.fastForwardSpeed),
    autosave: value.autosave !== false,
    twoPlayerKeyboard: value.twoPlayerKeyboard === true,
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
