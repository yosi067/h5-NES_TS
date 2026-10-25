/**
 * 依主機切換虛擬手把，並掛載觸控引擎與按鍵外觀設定。
 */
import { shouldUseDigitalArcadeDpad } from '../snes/snes9x-backend';
import { TouchControlsEngine } from './controls/engine';
import { CommandHistory, IdleFader } from './controls/feedback';
import { mountArcadeLayout, mountN64Layout, mountNesLayout, mountSnesLayout, type PadTable } from './controls/layouts';
import { getControllerProfile, type PadSystem, selectProfileType } from './controls/profiles';
import { PadBit } from './controls/types';
import { runtime } from '../app/runtime';
import { featureState } from '../app/preferences';
import { isFbNeoActive, isGenesisCore, isMupenN64Active, isSnesCore, usesSixButtonController } from '../backends/active';
import { arcadeRotation } from '../backends/fbneo/fbneo-backend';
import { getFbNeoGameName } from '../backends/fbneo/fbneo-games';
import { setArcadeInputBit } from '../input/arcade-input';
import { ArcadeInputBit, ControllerButton, SnesButton } from '../input/buttons';
import { setN64ButtonPressed } from '../input/n64-keys';
import { setNesButton, setSnesButton } from '../input/native-input';
import { loadState, loadStateForUser, saveState, saveStateForUser } from '../saves/save-states';
import { desktopStage } from './desktop-controls';
import { showToast } from './dialogs';
import { requestPortraitFit } from './responsive';

// ===== SNES 控制器設定 =====

/**
 * 切換虛擬控制器外觀（NES 或 SNES）
 */
export function updateControllerLayout(): void {
  const nesCtrl = document.getElementById('nes-controller-area');
  const snesCtrl = document.getElementById('snes-controller-area');
  const arcadeCtrl = document.getElementById('arcade-controller-area');
  const n64Ctrl = document.getElementById('n64-controller-area');
  document.body.classList.toggle('n64-mode', isMupenN64Active());
  document.body.classList.toggle('arcade-mode', isFbNeoActive());
  document.body.classList.toggle(
    'arcade-digital-fallback',
    isFbNeoActive() && shouldUseDigitalArcadeDpad(navigator.userAgent, typeof PointerEvent !== 'undefined'),
  );
  document.body.classList.toggle('arcade-vertical-mode', isFbNeoActive() && arcadeRotation !== 'none');
  document.body.classList.toggle('snes-mode', !isMupenN64Active() && !isFbNeoActive() && usesSixButtonController());
  updateSnesControllerLabels();
  if (isMupenN64Active()) {
    if (nesCtrl) nesCtrl.style.display = 'none';
    if (snesCtrl) snesCtrl.style.display = 'none';
    if (arcadeCtrl) arcadeCtrl.style.display = 'none';
    if (n64Ctrl) n64Ctrl.style.display = 'flex';
  } else if (isFbNeoActive()) {
    if (nesCtrl) nesCtrl.style.display = 'none';
    if (snesCtrl) snesCtrl.style.display = 'none';
    if (arcadeCtrl) arcadeCtrl.style.display = 'flex';
    if (n64Ctrl) n64Ctrl.style.display = 'none';
  } else if (usesSixButtonController()) {
    if (nesCtrl) nesCtrl.style.display = 'none';
    if (snesCtrl) snesCtrl.style.display = 'flex';
    if (arcadeCtrl) arcadeCtrl.style.display = 'none';
    if (n64Ctrl) n64Ctrl.style.display = 'none';
  } else {
    if (nesCtrl) nesCtrl.style.display = 'flex';
    if (snesCtrl) snesCtrl.style.display = 'none';
    if (arcadeCtrl) arcadeCtrl.style.display = 'none';
    if (n64Ctrl) n64Ctrl.style.display = 'none';
  }
  mountTouchControls();
  desktopStage?.refresh();
}


function updateSnesControllerLabels(): void {
  const labels = isGenesisCore()
    ? { l: 'X', r: 'Z', x: 'Y', y: 'A', a: 'C', b: 'B', select: 'MODE', start: 'START' }
    : { l: 'L', r: 'R', x: 'X', y: 'Y', a: 'A', b: 'B', select: 'SEL', start: 'STA' };
  for (const [id, label] of Object.entries(labels)) {
    const element = id === 'select' || id === 'start'
      ? document.querySelector<HTMLElement>(`#snes-controller-area [data-snes-btn="${id}"]`)
      : document.getElementById(`snes-btn-${id}`);
    if (element) element.textContent = label;
  }
}


export function updateArcadeButtonCount(buttonCount: number | null): void {
  arcadeFireButtonCount = buttonCount;
  document.body.classList.toggle('arcade-no-buttons', buttonCount === 0);
  document.querySelectorAll<HTMLElement>('#arcade-controller-area .arcade-face-btn').forEach((button, index) => {
    button.hidden = buttonCount !== null && index >= buttonCount;
  });
  const grid = document.querySelector<HTMLElement>('#arcade-controller-area .arcade-face-grid');
  if (grid) grid.dataset.buttonCount = buttonCount === null ? '6' : String(buttonCount);
  if (isFbNeoActive()) mountTouchControls();
}


// ===== 虛擬控制器（觸控引擎） =====

export let touchControls: TouchControlsEngine | null = null;

let padFader: IdleFader | null = null;

let arcadeFireButtonCount: number | null = null;

const PAD_HISTORY_STORAGE_KEY = 'h5emu.pad-history';


function getPadSystem(): PadSystem {
  if (isMupenN64Active()) return 'n64';
  if (isFbNeoActive()) return 'arcade';
  if (isGenesisCore()) return 'genesis';
  if (isSnesCore()) return 'snes';
  const core = runtime.nes?.getCoreType();
  return core === 'gb' || core === 'gg' ? core : 'nes';
}


function buildPadTable<T>(entries: Array<[number, T]>, apply: (target: T, pressed: boolean) => void): PadTable {
  return entries.map(([bit, target]) => [bit, (pressed: boolean) => apply(target, pressed)]);
}


function createCommandHistory(area: HTMLElement): CommandHistory {
  const wrap = document.createElement('div');
  wrap.className = 'pad-history-wrap';
  const list = document.createElement('div');
  list.className = 'pad-history';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'pad-history-toggle';
  toggle.textContent = '指令';
  const applyVisibility = (visible: boolean) => {
    list.hidden = !visible;
    toggle.setAttribute('aria-pressed', String(visible));
  };
  let visible = false;
  try {
    visible = localStorage.getItem(PAD_HISTORY_STORAGE_KEY) === '1';
  } catch {
    // 無痕模式可能禁止存取 localStorage。
  }
  applyVisibility(visible);
  toggle.addEventListener('click', () => {
    visible = list.hidden;
    applyVisibility(visible);
    try {
      localStorage.setItem(PAD_HISTORY_STORAGE_KEY, visible ? '1' : '0');
    } catch {
      // 設定無法保存時仍保留本次切換。
    }
  });
  wrap.append(list, toggle);
  area.appendChild(wrap);
  return new CommandHistory(list);
}


function mountTouchControls(): void {
  touchControls?.dispose();
  touchControls = null;
  document.querySelector('#arcade-controller-area .pad-history-wrap')?.remove();

  const system = getPadSystem();
  const game = system === 'arcade' ? getFbNeoGameName(runtime.currentRomFilename) : null;
  const profileType = selectProfileType(system, game);
  const profile = getControllerProfile(profileType, { game, fireButtonCount: arcadeFireButtonCount });
  document.body.dataset.system = system;
  document.body.dataset.padProfile = profileType;

  const engine = new TouchControlsEngine();
  touchControls = engine;
  const forceLegacy = shouldUseDigitalArcadeDpad(navigator.userAgent, typeof PointerEvent !== 'undefined');

  if (system === 'n64') {
    const n64Table = (bindings: Array<[number, string]>) => buildPadTable(bindings, (id, pressed) => setN64ButtonPressed(id, pressed));
    mountN64Layout({
      engine,
      profile,
      forceLegacy,
      stickTable: n64Table([
        [PadBit.Up, 'analog-up'], [PadBit.Down, 'analog-down'], [PadBit.Left, 'analog-left'], [PadBit.Right, 'analog-right'],
      ]),
      dpadTable: n64Table([
        [PadBit.Up, 'dpad-up'], [PadBit.Down, 'dpad-down'], [PadBit.Left, 'dpad-left'], [PadBit.Right, 'dpad-right'],
      ]),
      buttonTable: n64Table([
        [PadBit.A, 'a'], [PadBit.B, 'b'], [PadBit.Start, 'start'], [PadBit.Z, 'z'], [PadBit.L, 'l'], [PadBit.R, 'r'],
        [PadBit.CUp, 'c-up'], [PadBit.CDown, 'c-down'], [PadBit.CLeft, 'c-left'], [PadBit.CRight, 'c-right'],
      ]),
    });
  } else if (system === 'arcade') {
    const arcadeArea = document.getElementById('arcade-controller-area');
    const table = buildPadTable<number>([
      [PadBit.Up, ArcadeInputBit.Up], [PadBit.Down, ArcadeInputBit.Down],
      [PadBit.Left, ArcadeInputBit.Left], [PadBit.Right, ArcadeInputBit.Right],
      [PadBit.A, ArcadeInputBit.ButtonA], [PadBit.B, ArcadeInputBit.ButtonB], [PadBit.C, ArcadeInputBit.ButtonC],
      [PadBit.D, ArcadeInputBit.ButtonD], [PadBit.E, ArcadeInputBit.ButtonE], [PadBit.F, ArcadeInputBit.ButtonF],
      [PadBit.Select, ArcadeInputBit.Coin], [PadBit.Start, ArcadeInputBit.Start],
    ], (bit, pressed) => setArcadeInputBit(bit, pressed));
    const history = profile.inputTrail && arcadeArea ? createCommandHistory(arcadeArea) : null;
    mountArcadeLayout({ engine, profile, table, history, forceLegacy });
  } else if (usesSixButtonController()) {
    const table = buildPadTable<number>([
      [PadBit.Up, SnesButton.Up], [PadBit.Down, SnesButton.Down], [PadBit.Left, SnesButton.Left], [PadBit.Right, SnesButton.Right],
      [PadBit.A, SnesButton.A], [PadBit.B, SnesButton.B], [PadBit.X, SnesButton.X], [PadBit.Y, SnesButton.Y],
      [PadBit.L, SnesButton.L], [PadBit.R, SnesButton.R], [PadBit.Select, SnesButton.Select], [PadBit.Start, SnesButton.Start],
    ], (button, pressed) => setSnesButton(button, pressed));
    mountSnesLayout({ engine, profile, table, forceLegacy });
  } else {
    const table = buildPadTable<ControllerButton>([
      [PadBit.Up, ControllerButton.Up], [PadBit.Down, ControllerButton.Down],
      [PadBit.Left, ControllerButton.Left], [PadBit.Right, ControllerButton.Right],
      [PadBit.A, ControllerButton.A], [PadBit.B, ControllerButton.B],
      [PadBit.Select, ControllerButton.Select], [PadBit.Start, ControllerButton.Start],
    ], (button, pressed) => setNesButton(button, pressed));
    mountNesLayout({ engine, profile, table, forceLegacy });
  }
  requestPortraitFit();
}


/**
 * 設定虛擬控制器共用行為：淡出、焦點遺失時放開所有按鍵、存讀檔按鈕。
 */
export function setupVirtualController(): void {
  const controller = document.getElementById('virtual-controller');
  if (controller) {
    padFader = new IdleFader(controller, 3000);
    const wake = () => padFader?.wake();
    document.addEventListener('pointerdown', wake, { capture: true, passive: true });
    document.addEventListener('touchstart', wake, { capture: true, passive: true });
  }
  window.addEventListener('blur', () => touchControls?.releaseAll());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) touchControls?.releaseAll();
  });

  const bindClick = (id: string, handler: () => void) => {
    document.getElementById(id)?.addEventListener('click', handler);
  };
  bindClick('mobile-save-state', () => { void saveStateForUser(0, true); });
  bindClick('mobile-load-state', () => { void loadStateForUser(0, true); });
  bindClick('snes-mobile-save', () => { void saveStateForUser(0, true); });
  bindClick('snes-mobile-load', () => { void loadStateForUser(0, true); });
  bindClick('arcade-mobile-save', () => showToast(saveState(0) ? '✅ 存檔成功' : '❌ 存檔失敗'));
  bindClick('arcade-mobile-load', () => showToast(loadState(0) ? '✅ 讀取成功' : '❌ 沒有存檔'));
  bindClick('n64-mobile-save', () => showToast('N64 即時存檔尚未支援，遊戲內存檔會自動保存'));
  bindClick('n64-mobile-load', () => showToast('N64 即時讀檔尚未支援，遊戲內存檔會自動載入'));
}


export function applyPadAppearance(): void {
  const body = document.body;
  body.dataset.skin = featureState.skin;
  body.dataset.desktopFrame = featureState.desktopFrame;
  body.classList.toggle('pad-opacity-custom', featureState.padOpacity !== 100);
  body.style.setProperty('--pad-user-opacity', String(featureState.padOpacity / 100));
  body.classList.toggle('pad-scale-custom', featureState.padScale !== 100);
  body.style.setProperty('--pad-user-scale', String(featureState.padScale / 100));
}
