import { type LobbyPrefs, type SearchableRom } from '../features/lobby-prefs';

/**
 * 大廳的「最近玩過」書架（搜尋列已依使用者回饋移除；最愛改為在主機列表內排到最前面）。
 * 插在主機目錄上方，獨立 class，不改動既有封面與卡片版面。
 */
export interface LobbyRom extends SearchableRom {
  file: string;
  displayName: string;
  systemKey: string;
  coverUrl: string;
}

export interface LobbyToolsHost {
  catalog(): LobbyRom[];
  open(file: string): void;
  /** 在遊戲列表區顯示指定清單（搜尋結果或最愛）。 */
  showCollection(title: string, summary: string, files: string[]): void;
  /** 回到主機目錄。 */
  showMachines(): void;
}

export interface LobbyTools {
  /** 重新整理書架（回到主機目錄或最愛變更時）。 */
  refresh(): void;
  /** 目前是否處於搜尋結果模式。 */
  isSearching(): boolean;
  clearSearch(): void;
  /** 列表模式時收起書架，只保留搜尋列。 */
  setListMode(on: boolean): void;
}

function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

export function mountLobbyTools(anchor: HTMLElement, prefs: LobbyPrefs, host: LobbyToolsHost): LobbyTools {
  const root = document.createElement('section');
  root.className = 'lobby-tools';
  root.setAttribute('aria-label', '最近玩過');

  const shelves = document.createElement('div');
  shelves.className = 'lobby-shelves';
  root.append(shelves);
  anchor.parentElement?.insertBefore(root, anchor);

  const chip = (rom: LobbyRom): string => `
    <button type="button" class="lobby-chip" data-file="${encodeURIComponent(rom.file)}" data-system="${escapeText(rom.systemKey)}" title="${escapeText(rom.displayName)}">
      <span class="lobby-chip-cover">${rom.coverUrl ? `<img src="${escapeText(rom.coverUrl)}" alt="" loading="lazy" decoding="async">` : ''}</span>
      <span class="lobby-chip-name">${escapeText(rom.displayName)}</span>
    </button>`;

  function refresh(): void {
    const catalog = host.catalog();
    const byFile = new Map(catalog.map((rom) => [rom.file, rom]));
    const recents = prefs.recents().map((entry) => byFile.get(entry.file)).filter((rom): rom is LobbyRom => Boolean(rom));

    if (recents.length === 0) {
      shelves.replaceChildren();
      shelves.hidden = true;
      return;
    }
    shelves.hidden = root.classList.contains('is-list');
    shelves.innerHTML = `
      <div class="lobby-shelf" data-shelf="recent">
        <div class="lobby-shelf-head">
          <span class="lobby-shelf-title">最近玩過</span>
          <span class="lobby-shelf-nav">
            <button type="button" class="lobby-shelf-arrow" data-dir="-1" aria-label="往左捲動">‹</button>
            <button type="button" class="lobby-shelf-arrow" data-dir="1" aria-label="往右捲動">›</button>
          </span>
        </div>
        <div class="lobby-shelf-row">${recents.map(chip).join('')}</div>
      </div>`;
    const row = shelves.querySelector<HTMLElement>('.lobby-shelf-row');
    shelves.querySelectorAll<HTMLButtonElement>('.lobby-chip').forEach((button) => {
      button.addEventListener('click', () => {
        const file = decodeURIComponent(button.dataset.file ?? '');
        if (file) host.open(file);
      });
    });
    shelves.querySelectorAll<HTMLImageElement>('.lobby-chip-cover img').forEach((image) => {
      image.addEventListener('error', () => image.remove(), { once: true });
    });
    const arrows = Array.from(shelves.querySelectorAll<HTMLButtonElement>('.lobby-shelf-arrow'));
    const syncArrows = () => {
      if (!row) return;
      const max = row.scrollWidth - row.clientWidth;
      arrows[0].disabled = row.scrollLeft <= 2;
      arrows[1].disabled = row.scrollLeft >= max - 2;
      shelves.querySelector('.lobby-shelf-nav')?.toggleAttribute('hidden', max <= 2);
    };
    for (const arrow of arrows) {
      arrow.addEventListener('click', () => {
        if (!row) return;
        row.scrollBy({ left: Number(arrow.dataset.dir) * row.clientWidth * 0.8, behavior: 'smooth' });
      });
    }
    row?.addEventListener('scroll', syncArrows, { passive: true });
    requestAnimationFrame(syncArrows);
  }

  refresh();
  return {
    refresh,
    isSearching: () => false,
    clearSearch: () => undefined,
    setListMode: (on: boolean) => {
      root.classList.toggle('is-list', on);
      shelves.hidden = on || shelves.childElementCount === 0;
    },
  };
}
