/** Live semantic tuning. This never installs/reloads a translation profile. */
export interface GameProfileTuningCore {
  getGameProfileTuning(): string;
  setGameProfileTuning(json: string): void;
}

export function mountCt2RuntimeTuning(core: GameProfileTuningCore, anchor: Element): { dispose(): void } | null {
  const state = JSON.parse(core.getGameProfileTuning()) as { supported: boolean; tsubasaLevel: number | null };
  if (!state.supported) return null;
  const panel = document.createElement('details');
  panel.dataset.ct2RuntimeTuning = '';
  panel.style.cssText = 'padding:8px 12px;color:#bde8e1;font:13px system-ui;max-width:420px;margin:auto;';
  const summary = document.createElement('summary');
  const toggleLabel = document.createElement('label');
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = state.tsubasaLevel !== null;
  toggleLabel.append(toggle, ' 啟用大空翼等級調整');
  const levelLabel = document.createElement('label');
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = '1'; slider.max = '64'; slider.step = '1';
  slider.value = String(state.tsubasaLevel ?? 64);
  slider.setAttribute('aria-label', '大空翼遊戲內等級');
  levelLabel.append('等級 ', slider);
  const note = document.createElement('p');
  note.textContent = '預設自然滿級 64，非全能力 255。下一次能力計算生效；既有畫面需重開。體力不補滿、不鎖定；降級可能暫時高於新上限。關閉恢復原生等級。重置／讀檔保留設定，重新載入遊戲回到預設。';
  const error = document.createElement('p');
  error.setAttribute('role', 'status');
  const render = () => {
    summary.textContent = toggle.checked ? `大空翼：等級 ${slider.value}（遊戲內）` : '大空翼：原生等級';
    slider.disabled = !toggle.checked;
  };
  const update = () => {
    const level = Number(slider.value);
    if (!Number.isInteger(level) || level < 1 || level > 64) return;
    try {
      core.setGameProfileTuning(JSON.stringify({ profileId: 'captain-tsubasa-2-jp', tsubasaLevel: toggle.checked ? level : null }));
      error.textContent = '';
    } catch (reason) {
      const actual = JSON.parse(core.getGameProfileTuning()) as { tsubasaLevel: number | null };
      toggle.checked = actual.tsubasaLevel !== null;
      slider.value = String(actual.tsubasaLevel ?? 64);
      error.textContent = `未套用：${String(reason)}`;
    }
    render();
  };
  toggle.addEventListener('change', update);
  slider.addEventListener('input', update);
  // Keep keyboard editing local without preventing the native range/checkbox
  // action. Keyup still bubbles so a game key held before focus can release.
  const editingKey = (event: KeyboardEvent) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', ' ', 'Enter'].includes(event.key)) {
      event.stopPropagation();
    }
  };
  panel.addEventListener('keydown', editingKey);
  render();
  panel.append(summary, toggleLabel, document.createElement('br'), levelLabel, note, error);
  anchor.after(panel);
  return { dispose() {
    toggle.removeEventListener('change', update);
    slider.removeEventListener('input', update);
    panel.removeEventListener('keydown', editingKey);
    panel.remove();
  } };
}