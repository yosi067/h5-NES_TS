import type { GameProfileTuningCore } from './ct2-runtime-tuning';

/** Production control: changes the next new game, never rewrites a loaded save. */
export function mountZombieRuntimeTuning(core: GameProfileTuningCore, anchor: Element): { dispose(): void } | null {
  const state = JSON.parse(core.getGameProfileTuning());
  if (!state.supported || state.profileId !== 'zombie-hunter-jp') return null;
  const panel = document.createElement('div');
  panel.dataset.zombieRuntimeTuning = '';
  panel.style.cssText = 'padding:8px 12px;color:#bde8e1;font:13px system-ui;max-width:420px;margin:auto;';
  const label = document.createElement('label');
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = state.maxLevelOnNewGame;
  label.append(toggle, ' 主角新遊戲預設滿級 L31');
  const moneyLabel = document.createElement('label');
  moneyLabel.style.display = 'block';
  const moneyToggle = document.createElement('input');
  moneyToggle.type = 'checkbox';
  moneyToggle.checked = state.maxMoneyOnNewGame;
  moneyLabel.append(moneyToggle, ' 新遊戲 MONEY 999,999（顯示上限）');
  const note = document.createElement('p');
  note.textContent = '兩個開關各自只影響下一次新遊戲；關閉後由原版 L0／MONEY 30 開始。不鎖血、不鎖金錢；原版收入超過六位數會進位至未顯示位元組，並非封頂。暫存與永久讀檔保留存檔數值及目前開關。重置保留開關，重新載入 ROM 回到預設開啟。';
  const error = document.createElement('p');
  error.setAttribute('role', 'status');
  const update = () => {
    try {
      core.setGameProfileTuning(JSON.stringify({ profileId: 'zombie-hunter-jp', maxLevelOnNewGame: toggle.checked, maxMoneyOnNewGame: moneyToggle.checked }));
      error.textContent = '';
    } catch (reason) {
      toggle.checked = JSON.parse(core.getGameProfileTuning()).maxLevelOnNewGame;
      moneyToggle.checked = JSON.parse(core.getGameProfileTuning()).maxMoneyOnNewGame;
      error.textContent = `未套用：${String(reason)}`;
    }
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
  };
  toggle.addEventListener('change', update);
  moneyToggle.addEventListener('change', update);
  panel.addEventListener('keydown', keydown);
  panel.append(label, moneyLabel, note, error);
  anchor.after(panel);
  return { dispose() {
    toggle.removeEventListener('change', update);
    moneyToggle.removeEventListener('change', update);
    panel.removeEventListener('keydown', keydown);
    panel.remove();
  } };
}