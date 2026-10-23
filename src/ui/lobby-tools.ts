import { rankSearchResults, type LobbyPrefs, type SearchableRom } from '../features/lobby-prefs';

/**
 * 大廳的搜尋列與「我的最愛／最近玩過」書架。
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
  root.setAttribute('aria-label', '搜尋與快速開始');

  const searchWrap = document.createElement('div');
  searchWrap.className = 'lobby-search';
  searchWrap.setAttribute('role', 'search');
  const icon = document.createElement('span');
  icon.className = 'lobby-search-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '⌕';
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'lobby-search-input';
  input.placeholder = '搜尋遊戲名稱，例如：洛克人、KOF、瑪利歐';
  input.setAttribute('aria-label', '搜尋遊戲');
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.enterKeyHint = 'search';
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'lobby-search-clear';
  clear.setAttribute('aria-label', '清除搜尋');
  clear.textContent = '✕';
  clear.hidden = true;
  searchWrap.append(icon, input, clear);

  const shelves = document.createElement('div');
  shelves.className = 'lobby-shelves';
  root.append(searchWrap, shelves);
  anchor.parentElement?.insertBefore(root, anchor);

  let searching = false;
  let debounce: number | null = null;

  const runSearch = () => {
    const query = input.value.trim();
    clear.hidden = query.length === 0;
    if (!query) {
      if (searching) {
        searching = false;
        host.showMachines();
      }
      return;
    }
    searching = true;
    const results = rankSearchResults(host.catalog(), query, 80);
    host.showCollection('搜尋結果', results.length > 0 ? `「${query}」找到 ${results.length} 款作品` : `找不到「${query}」，換個關鍵字試試`,
      results.map((rom) => rom.file));
  };

  input.addEventListener('input', () => {
    if (debounce !== null) window.clearTimeout(debounce);
    debounce = window.setTimeout(runSearch, 160);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && input.value) {
      event.preventDefault();
      event.stopPropagation();
      input.value = '';
      runSearch();
    }
    if (event.key === 'Enter') {
      if (debounce !== null) window.clearTimeout(debounce);
      runSearch();
      input.blur();
    }
  });
  clear.addEventListener('click', () => {
    input.value = '';
    runSearch();
    input.focus();
  });

  const chip = (rom: LobbyRom): string => `
    <button type="button" class="lobby-chip" data-file="${encodeURIComponent(rom.file)}" data-system="${escapeText(rom.systemKey)}" title="${escapeText(rom.displayName)}">
      <span class="lobby-chip-cover">${rom.coverUrl ? `<img src="${escapeText(rom.coverUrl)}" alt="" loading="lazy" decoding="async">` : ''}</span>
      <span class="lobby-chip-name">${escapeText(rom.displayName)}</span>
    </button>`;

  function refresh(): void {
    const catalog = host.catalog();
    const byFile = new Map(catalog.map((rom) => [rom.file, rom]));
    const recents = prefs.recents().map((entry) => byFile.get(entry.file)).filter((rom): rom is LobbyRom => Boolean(rom)).slice(0, 8);
    const favorites = prefs.favorites().map((file) => byFile.get(file)).filter((rom): rom is LobbyRom => Boolean(rom));

    const parts: string[] = [];
    if (recents.length > 0) {
      parts.push(`
        <div class="lobby-shelf" data-shelf="recent">
          <div class="lobby-shelf-head"><span class="lobby-shelf-title">最近玩過</span></div>
          <div class="lobby-shelf-row">${recents.map(chip).join('')}</div>
        </div>`);
    }
    if (favorites.length > 0) {
      parts.push(`
        <div class="lobby-shelf" data-shelf="favorite">
          <div class="lobby-shelf-head">
            <span class="lobby-shelf-title">★ 我的最愛</span>
            <button type="button" class="lobby-shelf-more" data-action="show-favorites">全部 ${favorites.length} 款 →</button>
          </div>
          <div class="lobby-shelf-row">${favorites.slice(0, 8).map(chip).join('')}</div>
        </div>`);
    }
    if (parts.length === 0) {
      parts.push('<p class="lobby-shelf-hint">在遊戲卡片右上角按 ☆ 加入最愛；玩過的遊戲會出現在這裡。</p>');
    }
    shelves.innerHTML = parts.join('');
    shelves.querySelectorAll<HTMLButtonElement>('.lobby-chip').forEach((button) => {
      button.addEventListener('click', () => {
        const file = decodeURIComponent(button.dataset.file ?? '');
        if (file) host.open(file);
      });
    });
    shelves.querySelectorAll<HTMLImageElement>('.lobby-chip-cover img').forEach((image) => {
      image.addEventListener('error', () => image.remove(), { once: true });
    });
    shelves.querySelector('[data-action="show-favorites"]')?.addEventListener('click', () => {
      const list = prefs.favorites().filter((file) => byFile.has(file));
      host.showCollection('我的最愛', `收藏 ${list.length} 款作品`, list);
    });
  }

  refresh();
  return {
    refresh,
    isSearching: () => searching,
    clearSearch: () => {
      input.value = '';
      clear.hidden = true;
      searching = false;
    },
    setListMode: (on: boolean) => {
      shelves.hidden = on;
      root.classList.toggle('is-list', on);
    },
  };
}
