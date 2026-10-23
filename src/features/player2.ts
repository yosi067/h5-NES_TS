import type { BindingLayout, LayoutBindings } from '../ui/input-bindings';
import { resolveKeyAction } from '../ui/input-bindings';

/**
 * 鍵盤第二玩家的固定鍵位（只在「雙人模式」開啟時生效）。
 * 1P 已使用的按鍵永遠優先，因此不會搶走玩家自訂的 1P 鍵。
 */
export const PLAYER2_KEYS: Record<Exclude<BindingLayout, 'n64'>, Record<string, string>> = {
  nes: {
    KeyI: 'up', KeyK: 'down', KeyJ: 'left', KeyL: 'right',
    KeyP: 'a', KeyO: 'b', Digit9: 'select', Digit0: 'start',
  },
  snes: {
    KeyI: 'up', KeyK: 'down', KeyJ: 'left', KeyL: 'right',
    KeyP: 'a', KeyO: 'b', BracketLeft: 'x', KeyU: 'y',
    Digit7: 'l', Digit8: 'r', Digit9: 'select', Digit0: 'start',
  },
  arcade: {
    KeyI: 'up', KeyK: 'down', KeyJ: 'left', KeyL: 'right',
    KeyP: 'a', KeyO: 'b', KeyU: 'c', BracketLeft: 'd', Digit7: 'e', Digit8: 'f',
    Digit6: 'coin', Digit2: 'start',
  },
};

export const PLAYER2_HELP: Array<[string, string]> = [
  ['I / J / K / L', '2P 方向'],
  ['P / O', '2P A / B'],
  ['U / [', '2P Y / X（街機 C / D）'],
  ['7 / 8', '2P L / R（街機 E / F）'],
  ['9 / 0', '2P Select / Start'],
  ['6 / 2', '街機 2P 投幣 / 開始'],
];

/** 回傳此按鍵在 2P 的動作；1P 已綁定該鍵時回傳 null。 */
export function resolvePlayer2Action(layout: BindingLayout, player1: LayoutBindings, code: string): string | null {
  if (layout === 'n64') return null;
  if (resolveKeyAction(player1, code)) return null;
  return PLAYER2_KEYS[layout][code] ?? null;
}
