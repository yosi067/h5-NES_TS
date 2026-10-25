/**
 * 玩家偏好：按鍵配置、功能設定與大廳最愛／最近玩過。
 */
import { LobbyPrefs } from '../features/lobby-prefs';
import { FeatureSettingsStore } from '../features/settings';
import { BindingStore } from '../ui/input-bindings';
import { getSafeStorage } from './storage';

export const inputBindings = new BindingStore(getSafeStorage());

export const featureSettings = new FeatureSettingsStore(getSafeStorage());

export let featureState = featureSettings.get();

// 最先註冊：其他訂閱者收到通知時，featureState 已是最新值。
featureSettings.subscribe((next) => { featureState = next; });

export const lobbyPrefs = new LobbyPrefs(getSafeStorage());
