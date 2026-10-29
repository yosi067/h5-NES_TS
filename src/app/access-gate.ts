/**
 * 通關密碼：第一次開啟模擬器要輸入，通過後記在這台裝置的瀏覽器，之後不用再輸入。
 * 每輪有三次機會；三次都錯會鎖住一段時間，重新整理也不會重置。
 *
 * 注意：這是純前端的「門口告示」，擋得住一般拿到網址的人，
 * 擋不住會看原始碼的人。程式碼只存雜湊值，不存明文密碼。
 */
import { getSafeStorage } from './storage';

const ACCESS_STORAGE_KEY = 'h5emu.access.v1';
const ATTEMPTS_STORAGE_KEY = 'h5emu.access-attempts.v1';
/** 通關密碼正規化後的雜湊值（見 hashPasscode）。index.html 開頭也用到這個值。 */
const PASSCODE_HASH = '8d5119eb';

export const MAX_ATTEMPTS = 3;
export const LOCKOUT_MS = 60 * 60 * 1000;

/** 不分大小寫、全形半形、前後空白。 */
export function normalizePasscode(input: string): string {
  return input.normalize('NFKC').trim().toLowerCase();
}


/** FNV-1a 32 位元雜湊。不用 crypto.subtle，因為區網 http 測試時瀏覽器不提供。 */
export function hashPasscode(input: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(`h5emu:${normalizePasscode(input)}`)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}


export function isPasscodeCorrect(input: string): boolean {
  return hashPasscode(input) === PASSCODE_HASH;
}


export function isAccessGranted(storage: Storage | null = getSafeStorage()): boolean {
  try {
    return storage?.getItem(ACCESS_STORAGE_KEY) === PASSCODE_HASH;
  } catch {
    return false;
  }
}


interface AttemptState {
  /** 這一輪已經答錯幾次。 */
  failures: number;
  /** 鎖定到何時（毫秒時間戳）；0 表示沒有鎖定。 */
  lockedUntil: number;
}


function readAttempts(storage: Storage | null, now: number): AttemptState {
  try {
    const parsed = JSON.parse(storage?.getItem(ATTEMPTS_STORAGE_KEY) ?? 'null') as Partial<AttemptState> | null;
    const failures = Number.isInteger(parsed?.failures) ? Math.max(0, Math.min(MAX_ATTEMPTS, parsed!.failures!)) : 0;
    const lockedUntil = typeof parsed?.lockedUntil === 'number' ? parsed.lockedUntil : 0;
    // 鎖定時間已過：重新給三次機會。
    if (lockedUntil && lockedUntil <= now) return { failures: 0, lockedUntil: 0 };
    return { failures, lockedUntil };
  } catch {
    return { failures: 0, lockedUntil: 0 };
  }
}


function writeAttempts(storage: Storage | null, state: AttemptState | null): void {
  try {
    if (state) storage?.setItem(ATTEMPTS_STORAGE_KEY, JSON.stringify(state));
    else storage?.removeItem(ATTEMPTS_STORAGE_KEY);
  } catch {
    // 無法寫入時只是機會次數不會跨重新整理保留。
  }
}


export type AttemptResult =
  | { ok: true }
  | { ok: false; remaining: number; lockedUntil: number };

/** 送出一次答案並更新機會次數（鎖定中一律視為失敗、不消耗次數）。 */
export function submitPasscode(input: string, storage: Storage | null = getSafeStorage(), now = Date.now()): AttemptResult {
  const state = readAttempts(storage, now);
  if (state.lockedUntil > now) return { ok: false, remaining: 0, lockedUntil: state.lockedUntil };
  if (isPasscodeCorrect(input)) {
    writeAttempts(storage, null);
    try {
      storage?.setItem(ACCESS_STORAGE_KEY, PASSCODE_HASH);
    } catch {
      // 無痕模式等無法寫入時，只是下次要再輸入一次。
    }
    return { ok: true };
  }
  const failures = state.failures + 1;
  if (failures >= MAX_ATTEMPTS) {
    const lockedUntil = now + LOCKOUT_MS;
    writeAttempts(storage, { failures: MAX_ATTEMPTS, lockedUntil });
    return { ok: false, remaining: 0, lockedUntil };
  }
  writeAttempts(storage, { failures, lockedUntil: 0 });
  return { ok: false, remaining: MAX_ATTEMPTS - failures, lockedUntil: 0 };
}


export function getAttemptStatus(storage: Storage | null = getSafeStorage(), now = Date.now()): { remaining: number; lockedUntil: number } {
  const state = readAttempts(storage, now);
  return { remaining: MAX_ATTEMPTS - state.failures, lockedUntil: state.lockedUntil > now ? state.lockedUntil : 0 };
}


function formatWait(ms: number): string {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} 分 ${String(seconds).padStart(2, '0')} 秒` : `${seconds} 秒`;
}


/** 尚未通關時顯示通關畫面；通關後才 resolve。 */
export function ensureAccess(): Promise<void> {
  if (isAccessGranted()) return Promise.resolve();

  return new Promise((resolve) => {
    document.documentElement.classList.add('access-locked');

    const gate = document.createElement('div');
    gate.id = 'access-gate';
    gate.className = 'access-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', 'access-gate-title');
    gate.innerHTML = `
      <form class="access-card" novalidate>
        <div class="access-kicker">RETRO GAMES MAGAZINE</div>
        <div class="access-brand"><span>H5</span>-EMU</div>
        <h1 id="access-gate-title" class="access-title">請輸入通關密碼</h1>
        <p class="access-hint">通關提示：是誰給你網址的？</p>
        <label class="access-label" for="access-gate-input">通關密碼</label>
        <input id="access-gate-input" class="access-input" type="text" inputmode="text"
          autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go">
        <p class="access-error" role="alert" hidden></p>
        <button class="access-submit" type="submit">進入</button>
        <p class="access-note"></p>
      </form>`;
    document.body.appendChild(gate);

    const form = gate.querySelector('form')!;
    const input = gate.querySelector<HTMLInputElement>('.access-input')!;
    const submit = gate.querySelector<HTMLButtonElement>('.access-submit')!;
    const error = gate.querySelector<HTMLElement>('.access-error')!;
    const note = gate.querySelector<HTMLElement>('.access-note')!;
    const card = gate.querySelector<HTMLElement>('.access-card')!;
    let countdown: number | null = null;

    const showError = (message: string) => {
      error.textContent = message;
      error.hidden = false;
    };

    const shake = () => {
      card.classList.remove('is-wrong');
      void card.offsetWidth; // 重新觸發搖晃動畫
      card.classList.add('is-wrong');
    };

    const render = () => {
      const { remaining, lockedUntil } = getAttemptStatus();
      const locked = lockedUntil > 0;
      input.disabled = locked;
      submit.disabled = locked;
      card.classList.toggle('is-locked', locked);
      if (locked) {
        showError(`三次機會都用完了，請 ${formatWait(lockedUntil - Date.now())}後再試。`);
        note.textContent = '想不起來的話，問問給你網址的人吧。';
        if (countdown === null) countdown = window.setInterval(render, 1000);
        return;
      }
      if (countdown !== null) {
        window.clearInterval(countdown);
        countdown = null;
        error.hidden = true;
        input.value = '';
        window.setTimeout(() => input.focus(), 50);
      }
      note.textContent = `共有 ${MAX_ATTEMPTS} 次機會，目前還剩 ${remaining} 次。通關一次後，這台裝置就不用再輸入。`;
    };

    input.addEventListener('input', () => {
      if (!input.disabled) error.hidden = true;
      card.classList.remove('is-wrong');
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (input.disabled) return;
      if (!input.value.trim()) {
        showError('請先輸入通關密碼。');
        input.focus();
        return;
      }
      const result = submitPasscode(input.value);
      if (result.ok) {
        if (countdown !== null) window.clearInterval(countdown);
        input.blur();
        gate.remove();
        document.documentElement.classList.remove('access-locked');
        resolve();
        return;
      }
      shake();
      if (result.lockedUntil) {
        render();
        return;
      }
      showError(`密碼不對，還剩 ${result.remaining} 次機會。再想想看是誰給你網址的。`);
      render();
      error.hidden = false;
      input.select();
    });

    render();
    if (!input.disabled) window.setTimeout(() => input.focus(), 50);
  });
}
