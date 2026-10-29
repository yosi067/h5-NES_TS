import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureAccess, getAttemptStatus, hashPasscode, isAccessGranted, isPasscodeCorrect,
  LOCKOUT_MS, MAX_ATTEMPTS, normalizePasscode, submitPasscode,
} from '../src/app/access-gate';

function submit(value: string): void {
  const input = document.querySelector<HTMLInputElement>('#access-gate-input')!;
  input.value = value;
  document.querySelector('#access-gate form')!.dispatchEvent(new Event('submit', { cancelable: true }));
}

describe('access gate', () => {
  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    document.documentElement.classList.remove('access-locked');
  });

  it('accepts the passcode regardless of case, width and surrounding spaces', () => {
    for (const input of ['yosi', 'YOSI', 'Yosi', '  yOsI  ', 'ｙｏｓｉ', 'ＹＯＳＩ']) {
      expect(isPasscodeCorrect(input)).toBe(true);
    }
    expect(normalizePasscode(' ＹｏＳＩ ')).toBe('yosi');
  });

  it('rejects wrong answers', () => {
    for (const input of ['', 'yos', 'yosii', 'y o s i', '游']) expect(isPasscodeCorrect(input)).toBe(false);
  });

  it('gives three chances, then locks for one hour', () => {
    const now = 1_000_000;
    expect(submitPasscode('a', localStorage, now)).toEqual({ ok: false, remaining: 2, lockedUntil: 0 });
    expect(submitPasscode('b', localStorage, now)).toEqual({ ok: false, remaining: 1, lockedUntil: 0 });
    expect(submitPasscode('c', localStorage, now)).toEqual({ ok: false, remaining: 0, lockedUntil: now + LOCKOUT_MS });
    // 鎖定中連正確密碼也不接受，也不會解鎖。
    expect(submitPasscode('yosi', localStorage, now + 1000).ok).toBe(false);
    expect(isAccessGranted()).toBe(false);
    // 時間到後重新給三次機會。
    expect(getAttemptStatus(localStorage, now + LOCKOUT_MS)).toEqual({ remaining: MAX_ATTEMPTS, lockedUntil: 0 });
    expect(submitPasscode('yosi', localStorage, now + LOCKOUT_MS).ok).toBe(true);
    expect(isAccessGranted()).toBe(true);
  });

  it('a correct answer resets the chance counter', () => {
    submitPasscode('wrong');
    expect(getAttemptStatus().remaining).toBe(2);
    submitPasscode('YOSI');
    expect(localStorage.getItem('h5emu.access-attempts.v1')).toBeNull();
  });

  it('shows remaining chances, locks the form, and remembers a correct answer', async () => {
    let resolved = false;
    const done = ensureAccess().then(() => { resolved = true; });
    expect(document.documentElement.classList.contains('access-locked')).toBe(true);
    expect(document.querySelector('.access-hint')?.textContent).toContain('是誰給你網址的');
    expect(document.querySelector('.access-note')?.textContent).toContain('還剩 3 次');

    submit('');
    expect(getAttemptStatus().remaining).toBe(3); // 空白不算一次
    submit('mario');
    expect(document.querySelector('.access-error')?.textContent).toContain('還剩 2 次');
    submit('luigi');
    submit('peach');
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(document.querySelector<HTMLInputElement>('#access-gate-input')!.disabled).toBe(true);
    expect(document.querySelector('.access-error')?.textContent).toContain('三次機會都用完了');

    // 模擬鎖定結束後再試一次。
    localStorage.removeItem('h5emu.access-attempts.v1');
    document.body.innerHTML = '';
    const again = ensureAccess();
    submit('YoSi');
    await again;
    expect(document.getElementById('access-gate')).toBeNull();
    expect(document.documentElement.classList.contains('access-locked')).toBe(false);
    expect(isAccessGranted()).toBe(true);
    void done;
  });

  it('skips the gate on a device that already passed', async () => {
    localStorage.setItem('h5emu.access.v1', hashPasscode('yosi'));
    await ensureAccess();
    expect(document.getElementById('access-gate')).toBeNull();
  });

  it('keeps index.html in sync with the stored hash', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('index.html', 'utf8')).toContain(`!== '${hashPasscode('yosi')}'`);
  });
});
