/**
 * 大廳：主機目錄、遊戲列表、最愛排序與最近玩過書架。
 */
import { getRomMagazineMeta } from '../data/rom-metadata';
import { sortFavoritesFirst } from '../features/lobby-prefs';
import { type LobbyRom, type LobbyTools, mountLobbyTools } from '../ui/lobby-tools';
import { getPublicAssetUrl } from '../app/assets';
import { lobbyPrefs } from '../app/preferences';
import type { GameMetadataResponse, RomInfo, RomListResponse, SystemKey } from '../app/types';
import { LOBBY_MARIO_ROM_FILE, MACHINES, detectRomSystem, getRomCoverUrl, getRomDisplayName } from '../catalog/machines';
import { setupLobbyCrt, startLobbyCrtPreview } from './crt-preview';
import { loadRomFromFile, loadRomFromServer } from '../session/game-loader';
import { showToast } from '../ui/dialogs';
import { escapeHtml } from '../ui/html';

export let romCatalog: RomInfo[] = [];


/**
 * 設定 ROM 選擇器
 */
export function setupRomSelector(): void {
  loadRomList();
  setupLobbyCrt();

  document.getElementById('rom-back-btn')?.addEventListener('click', renderMachineSelector);
  const selectorEl = document.getElementById('rom-selector');
  const scrollTopButton = document.getElementById('rom-scroll-top') as HTMLButtonElement | null;
  selectorEl?.addEventListener('scroll', () => {
    if (scrollTopButton) {
      scrollTopButton.hidden = scrollTopButton.dataset.enabled !== 'true' || selectorEl.scrollTop < 480;
    }
  }, { passive: true });
  scrollTopButton?.addEventListener('click', () => {
    if (selectorEl) selectorEl.scrollTop = 0;
    scrollTopButton.hidden = true;
  });
  
  // 設定檔案上傳
  const fileInput = document.getElementById('rom-file-input') as HTMLInputElement;
  fileInput?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      await loadRomFromFile(file);
    }
  });
}


/**
 * 載入 ROM 列表
 */
async function loadRomList(): Promise<void> {
  const romListEl = document.getElementById('rom-list');
  const machineGridEl = document.getElementById('machine-grid');
  if (!romListEl) return;

  try {
    // 使用 Vite 的 BASE_URL 確保在 GitHub Pages 等子目錄部署時路徑正確
    const baseUrl = import.meta.env.BASE_URL;
    const primaryUrl = `${baseUrl}roms.json`;
    const fallbackUrl = new URL('roms.json', window.location.href).href;
    const fetchCatalog = async (url: string): Promise<Response> => {
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('ROM 列表載入逾時')), 12000);
      });
      return Promise.race([fetch(url, { cache: 'no-store' }), timeout]);
    };

    let response = await fetchCatalog(primaryUrl);
    if (!response.ok && fallbackUrl !== new URL(primaryUrl, window.location.href).href) {
      response = await fetchCatalog(fallbackUrl);
    }
    if (!response.ok) {
      throw new Error('無法載入 ROM 列表');
    }
    
    const data: RomListResponse = await response.json();
    let metadata: GameMetadataResponse = { version: 1, games: {} };
    try {
      const metadataResponse = await fetch(`${baseUrl}game-metadata.json`, { cache: 'no-store' });
      if (metadataResponse.ok) metadata = await metadataResponse.json() as GameMetadataResponse;
    } catch (metadataError) {
      console.warn('遊戲 metadata 載入失敗，使用基本 ROM 清單:', metadataError);
    }
    romCatalog = data.roms.map(rom => ({
      ...rom,
      ...(metadata.games[rom.file] ?? {}),
    }));
    document.getElementById('lobby-crt')?.classList.toggle(
      'is-ready',
      romCatalog.some(rom => rom.file === LOBBY_MARIO_ROM_FILE),
    );
    setupLobbyTools();
    renderMachineSelector();
    void startLobbyCrtPreview();
  } catch (error) {
    console.error('載入 ROM 列表失敗:', error);
    if (machineGridEl) machineGridEl.style.display = 'none';
    const browserHeader = document.getElementById('rom-browser-header');
    if (browserHeader) browserHeader.style.display = 'none';
    romListEl.style.display = 'block';
    romListEl.innerHTML = `
      <div class="rom-error">
        <p>無法載入遊戲列表</p>
        <p>請使用下方按鈕選擇 ROM 檔案</p>
      </div>
    `;
  }
}


/**
 * 渲染機台選擇畫面
 */
export function renderMachineSelector(): void {
  const selectorEl = document.getElementById('rom-selector');
  const machineGridEl = document.getElementById('machine-grid');
  const romListEl = document.getElementById('rom-list');
  const browserHeader = document.getElementById('rom-browser-header');
  const coverHeader = document.querySelector('#rom-selector > .rom-selector-content > .rom-selector-header') as HTMLElement | null;
  const scrollTopButton = document.getElementById('rom-scroll-top') as HTMLButtonElement | null;
  if (!machineGridEl || !romListEl) return;

  if (romCatalog.length === 0) {
    machineGridEl.innerHTML = '<div class="rom-empty">沒有可用的遊戲</div>';
    return;
  }

  lobbyTools?.clearSearch();
  lobbyTools?.setListMode(false);
  lobbyTools?.refresh();
  if (browserHeader) {
    browserHeader.classList.remove('is-visible');
    browserHeader.style.removeProperty('display');
  }
  if (coverHeader) coverHeader.style.removeProperty('display');
  if (selectorEl) selectorEl.scrollTop = 0;
  if (scrollTopButton) {
    scrollTopButton.dataset.enabled = 'false';
    scrollTopButton.hidden = true;
  }
  romListEl.style.display = 'none';
  machineGridEl.style.display = 'grid';

  const machineCounts = MACHINES.map((machine) => romCatalog.filter((rom) => detectRomSystem(rom) === machine.key).length);
  const activeMachines = MACHINES.filter((_, index) => machineCounts[index] > 0);
  const machineYears = activeMachines.map((machine) => Number(machine.year)).filter(Number.isFinite);
  const coverStats = document.getElementById('cover-stats');
  const setStat = (id: string, value: string) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };
  setStat('cover-stat-games', String(machineCounts.reduce((sum, count) => sum + count, 0)));
  setStat('cover-stat-systems', String(activeMachines.length).padStart(2, '0'));
  if (machineYears.length > 0) setStat('cover-stat-years', `${Math.min(...machineYears)}–${String(Math.max(...machineYears)).slice(-2)}`);
  if (coverStats) coverStats.hidden = false;

  const gridHeading = `
    <div class="machine-grid-head" aria-hidden="true">
      <span class="machine-grid-kicker">CONTENTS</span>
      <span class="machine-grid-title">主機目錄</span>
      <span class="machine-grid-note">${String(activeMachines.length).padStart(2, '0')} PLATFORMS</span>
    </div>
  `;

  machineGridEl.innerHTML = gridHeading + MACHINES.map((machine, index) => {
    const count = machineCounts[index];
    const disabled = count === 0 ? 'disabled aria-disabled="true"' : '';
    return `
      <div class="machine-card-shell" data-system="${machine.key}" style="--i:${index}">
        <button class="machine-card" type="button" data-system="${machine.key}" ${disabled}>
          <span class="machine-folio">
            <span class="machine-section">${escapeHtml(machine.section)}</span>
            <span class="machine-year">${escapeHtml(machine.year)}</span>
            <span class="machine-issue">${escapeHtml(machine.issue)}</span>
          </span>
          <span class="machine-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
          <span class="machine-art ${machine.artClass}" aria-hidden="true">
            <img class="machine-art-img" src="${getPublicAssetUrl(`assets/machines/${machine.artFile}`)}" alt="" loading="eager" decoding="async">
          </span>
          <span class="machine-copy">
            <span class="machine-title">${escapeHtml(machine.title)}</span>
            <span class="machine-meta">${escapeHtml(machine.label)}</span>
          </span>
          <span class="machine-card-footer">
            <span class="machine-count"><b aria-hidden="true">■</b> <strong>${count}</strong> GAMES</span>
            <span class="machine-tag">COLLECTOR'S ARCHIVE</span>
            <span class="machine-page">P.${escapeHtml(machine.page)}</span>
            <span class="machine-cta" aria-hidden="true"><span>進入</span></span>
          </span>
        </button>
      </div>
    `;
  }).join('');

  machineGridEl.querySelectorAll('.machine-card').forEach((item) => {
    item.addEventListener('click', () => {
      const system = (item as HTMLElement).dataset.system as SystemKey | undefined;
      if (system) renderRomList(system);
    });
  });
}


/**
 * 渲染 ROM 列表
 */
function renderRomList(system: SystemKey, keepScroll = false): void {
  // 加了最愛的遊戲排在最前面，其餘維持原本順序。
  const roms = sortFavoritesFirst(romCatalog.filter((rom) => detectRomSystem(rom) === system), lobbyPrefs.favorites());
  const selectorEl = document.getElementById('rom-selector');
  const scrollTop = selectorEl?.scrollTop ?? 0;
  const machine = MACHINES.find((item) => item.key === system);
  renderRomListView({
    system,
    roms,
    title: machine?.title ?? '遊戲列表',
    year: machine?.year ?? '',
    issue: machine?.issue ?? '',
    summary: `本月精選 ${roms.length} 款作品`,
    artFile: machine?.artFile ?? null,
    emptyText: '沒有可用的遊戲',
  });
  if (keepScroll && selectorEl) selectorEl.scrollTop = scrollTop;
}


/** 搜尋結果或我的最愛：沿用同一套卡片，每張卡片帶自己的主機色。 */
function renderRomCollection(title: string, summary: string, roms: RomInfo[]): void {
  const firstSystem = roms[0] ? detectRomSystem(roms[0]) : 'nes';
  renderRomListView({
    system: firstSystem,
    roms,
    title,
    year: 'INDEX',
    issue: `${roms.length} TITLES`,
    summary,
    artFile: null,
    emptyText: '沒有符合的遊戲',
    collection: true,
  });
}


function renderRomListView(view: {
  system: SystemKey;
  roms: RomInfo[];
  title: string;
  year: string;
  issue: string;
  summary: string;
  artFile: string | null;
  emptyText: string;
  collection?: boolean;
}): void {
  const selectorEl = document.getElementById('rom-selector');
  const machineGridEl = document.getElementById('machine-grid');
  const romListEl = document.getElementById('rom-list');
  const browserHeader = document.getElementById('rom-browser-header');
  const browserTitle = document.getElementById('rom-browser-title');
  const browserYear = document.getElementById('rom-browser-year');
  const browserIssue = document.getElementById('rom-browser-issue');
  const browserSummary = document.getElementById('rom-browser-summary');
  const browserArt = document.getElementById('rom-browser-art') as HTMLImageElement | null;
  const coverHeader = document.querySelector('#rom-selector > .rom-selector-content > .rom-selector-header') as HTMLElement | null;
  const scrollTopButton = document.getElementById('rom-scroll-top') as HTMLButtonElement | null;
  if (!romListEl) return;

  const { system, roms } = view;
  lobbyTools?.setListMode(true);
  if (scrollTopButton) {
    scrollTopButton.dataset.enabled = String(roms.length > 20);
    scrollTopButton.hidden = true;
  }

  if (machineGridEl) machineGridEl.style.display = 'none';
  if (coverHeader) coverHeader.style.display = 'none';
  if (selectorEl) selectorEl.scrollTop = 0;
  if (browserHeader) {
    browserHeader.classList.add('is-visible');
    browserHeader.style.removeProperty('display');
  }
  if (browserHeader) {
    browserHeader.dataset.system = system;
    browserHeader.classList.toggle('is-collection', Boolean(view.collection));
  }
  romListEl.dataset.system = system;
  if (browserTitle) browserTitle.textContent = view.title;
  if (browserYear) browserYear.textContent = view.year;
  if (browserIssue) browserIssue.textContent = view.issue;
  if (browserSummary) browserSummary.textContent = view.summary;
  if (browserArt) {
    if (view.artFile) {
      browserArt.hidden = false;
      browserArt.src = getPublicAssetUrl(`assets/machines/${view.artFile}`);
    } else if (view.collection) {
      browserArt.hidden = true;
    }
  }
  romListEl.style.display = 'grid';

  if (roms.length === 0) {
    romListEl.innerHTML = `<div class="rom-empty">${escapeHtml(view.emptyText)}</div>`;
    return;
  }

  const favorites = new Set(lobbyPrefs.favorites());
  romListEl.innerHTML = roms.map((rom, index) => {
    const meta = getRomMagazineMeta(rom);
    const number = String(index + 1).padStart(3, '0');
    const coverUrl = getRomCoverUrl(rom);
    const coverMarkup = coverUrl
      ? `<img class="rom-cover-image" src="${escapeHtml(coverUrl)}" alt="" loading="lazy" decoding="async"><span class="rom-cover-placeholder" aria-hidden="true" hidden>${escapeHtml(getRomDisplayName(rom).slice(0, 18))}</span>`
      : `<span class="rom-cover-placeholder" aria-hidden="true">${escapeHtml(getRomDisplayName(rom).slice(0, 18))}</span>`;
    const description = rom.description?.trim() || '中文簡介待核對';
    const itemSystem = view.collection ? detectRomSystem(rom) : system;
    const isFavorite = favorites.has(rom.file);
    const favoriteMarkup = `<span class="rom-fav${isFavorite ? ' is-on' : ''}" role="button" tabindex="0" aria-pressed="${isFavorite}" aria-label="${isFavorite ? '從最愛移除' : '加入最愛'}" title="${isFavorite ? '從最愛移除' : '加入最愛'}">${isFavorite ? '★' : '☆'}</span>`;
    return `
      <button class="rom-item" data-index="${index}" data-system="${itemSystem}" data-file="${encodeURIComponent(rom.file)}" style="--i:${Math.min(index, 11)}">
        <span class="rom-item-number">No.${number}</span>
        <span class="rom-cover-frame${coverUrl ? '' : ' is-missing'}">${coverMarkup}${favoriteMarkup}</span>
        <span class="rom-copy">
          <span class="rom-name">${escapeHtml(getRomDisplayName(rom))}</span>
          <span class="rom-description">${escapeHtml(description)}</span>
          <span class="rom-item-meta">
            <span><small>發售年份</small>${escapeHtml(meta.year)}</span>
            <span><small>遊戲類型</small>${escapeHtml(meta.genre)}</span>
          </span>
        </span>
        <span class="rom-play" aria-hidden="true">PLAY</span>
      </button>
    `;
  }).join('');

  // 綁定點擊事件
  const items = romListEl.querySelectorAll('.rom-item');
  items.forEach(item => {
    item.addEventListener('click', async () => {
      const file = decodeURIComponent((item as HTMLElement).dataset.file || '');
      if (file) {
        await loadRomFromServer(file);
      }
    });
  });

  romListEl.querySelectorAll<HTMLElement>('.rom-fav').forEach((star) => {
    const toggle = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      const file = decodeURIComponent(star.closest<HTMLElement>('.rom-item')?.dataset.file || '');
      if (!file) return;
      const on = lobbyPrefs.toggleFavorite(file);
      star.classList.toggle('is-on', on);
      star.textContent = on ? '★' : '☆';
      star.setAttribute('aria-pressed', String(on));
      star.setAttribute('aria-label', on ? '從最愛移除' : '加入最愛');
      star.title = on ? '從最愛移除' : '加入最愛';
      showToast(on ? '★ 已加入最愛，排到最前面' : '已取消最愛');
      // 主機列表立即重新排序（搜尋結果維持搜尋排序）。
      if (!view.collection) renderRomList(system, true);
    };
    star.addEventListener('click', toggle);
    star.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') toggle(event);
    });
  });

  romListEl.querySelectorAll<HTMLImageElement>('.rom-cover-image').forEach(image => {
    image.addEventListener('error', () => {
      image.hidden = true;
      image.closest('.rom-cover-frame')?.classList.add('is-missing');
      const fallback = image.nextElementSibling as HTMLElement | null;
      if (fallback) fallback.hidden = false;
    }, { once: true });
  });
}

export let lobbyTools: LobbyTools | null = null;


function toLobbyRom(rom: RomInfo): LobbyRom {
  const systemKey = detectRomSystem(rom);
  const machine = MACHINES.find((item) => item.key === systemKey);
  return {
    file: rom.file,
    name: rom.name,
    displayName: getRomDisplayName(rom),
    systemKey,
    systemLabel: machine ? `${machine.title} ${machine.label}` : systemKey,
    description: rom.description,
    coverUrl: getRomCoverUrl(rom),
  };
}


function setupLobbyTools(): void {
  const machineGridEl = document.getElementById('machine-grid');
  if (!machineGridEl || lobbyTools) return;
  lobbyTools = mountLobbyTools(machineGridEl, lobbyPrefs, {
    catalog: () => romCatalog.map(toLobbyRom),
    open: (file) => { void loadRomFromServer(file); },
    showCollection: (title, summary, files) => {
      const byFile = new Map(romCatalog.map((rom) => [rom.file, rom]));
      renderRomCollection(title, summary, files.map((file) => byFile.get(file)).filter((rom): rom is RomInfo => Boolean(rom)));
    },
    showMachines: () => renderMachineSelector(),
  });
}
