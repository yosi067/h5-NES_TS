import evidence from './ct2-stats-evidence.json';

/** Isolated preview only. No emulator, storage, profile or ROM write imports. */
export function previewTsubasaLevel(level: number) {
  if (!Number.isInteger(level) || level < evidence.minLevel || level > evidence.maxLevel) {
    throw new RangeError('等級必須是 1–64 的整數；不接受可能溢位的任意 byte。');
  }
  const storedLevel = level - 1;
  return {
    player: evidence.name, level,
    maxStamina: evidence.staminaCurve[Math.min(95, evidence.coefficients[0] + storedLevel)],
    fields: evidence.fields.map(field => ({ ...field,
      value: evidence.abilityCurve[Math.min(191, evidence.coefficients[field.selector] + 2 * storedLevel)],
    })),
  };
}

export function mountTsubasaPreview(root: HTMLElement): void {
  const level = root.querySelector<HTMLInputElement>('[data-stat-level]');
  const output = root.querySelector<HTMLElement>('[data-stat-output]');
  const maxButton = root.querySelector<HTMLButtonElement>('[data-stat-max]');
  const resetButton = root.querySelector<HTMLButtonElement>('[data-stat-reset]');
  if (!level || !output || !maxButton || !resetButton) throw new Error('Missing stat preview controls');
  const render = () => {
    try {
      const result = previewTsubasaLevel(level.valueAsNumber);
      level.setCustomValidity('');
      const summary = document.createElement('p');
      summary.textContent = `${result.player} · 等級 ${result.level} · 最大體力 ${result.maxStamina}（非目前剩餘體力）`;
      const list = document.createElement('dl');
      list.className = 'stat-preview-grid';
      for (const field of result.fields) {
        const row = document.createElement('div');
        const term = document.createElement('dt');
        const value = document.createElement('dd');
        // Duplicate labels have distinct selectors/positions; do not invent
        // high/low-ball semantics until the original headings are verified.
        term.textContent = `${field.translation} · #${field.selector}`;
        term.title = `${field.source} / 原版 PPU $${field.target.toString(16).toUpperCase()}`;
        value.textContent = String(field.value);
        row.append(term, value); list.append(row);
      }
      output.replaceChildren(summary, list);
    } catch (error) {
      const message = error instanceof Error ? error.message : '無法計算預覽';
      level.setCustomValidity(message);
      output.textContent = message; // Never leave stale values resembling a valid preview.
    }
  };
  level.addEventListener('input', render);
  maxButton.addEventListener('click', () => { level.value = '64'; render(); });
  resetButton.addEventListener('click', () => { level.value = '1'; render(); });
  render();
}