// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountCt2RuntimeTuning } from '../src/game-profiles/ct2-runtime-tuning';

afterEach(() => { document.body.replaceChildren(); });

describe('CT2 live tuning controls', () => {
  function setup(supported = true) {
    const anchor = document.createElement('div');
    document.body.append(anchor);
    let level: number | null = 64;
    const core = {
      getGameProfileTuning: () => JSON.stringify({ supported, tsubasaLevel: level }),
      setGameProfileTuning: vi.fn((json: string) => { level = JSON.parse(json).tsubasaLevel; }),
      loadGameProfile: vi.fn(), reset: vi.fn(),
    };
    return { core, controls: mountCt2RuntimeTuning(core, anchor) };
  }

  it('only appears for a core-verified ROM and does not install anything on mount', () => {
    expect(setup(false).controls).toBeNull();
    const { core } = setup();
    expect(document.querySelector('summary')?.textContent).toContain('64');
    expect(core.setGameProfileTuning).not.toHaveBeenCalled();
  });

  it('hot updates, opts out, reenables, and disposes without resetting or loading profiles', () => {
    const { core, controls } = setup();
    const slider = document.querySelector<HTMLInputElement>('input[type=range]')!;
    const toggle = document.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    for (const value of [1, 32, 64]) {
      slider.value = String(value);
      slider.dispatchEvent(new Event('input'));
      expect(JSON.parse(core.getGameProfileTuning()).tsubasaLevel).toBe(value);
    }
    toggle.checked = false; toggle.dispatchEvent(new Event('change'));
    expect(JSON.parse(core.getGameProfileTuning()).tsubasaLevel).toBeNull();
    expect(slider.disabled).toBe(true);
    toggle.checked = true; toggle.dispatchEvent(new Event('change'));
    expect(JSON.parse(core.getGameProfileTuning()).tsubasaLevel).toBe(64);
    expect(core.reset).not.toHaveBeenCalled();
    expect(core.loadGameProfile).not.toHaveBeenCalled();
    controls!.dispose();
    const calls = core.setGameProfileTuning.mock.calls.length;
    slider.dispatchEvent(new Event('input'));
    expect(core.setGameProfileTuning).toHaveBeenCalledTimes(calls);
    expect(document.querySelector('details')).toBeNull();
  });

  it('rolls UI back when the core rejects an update', () => {
    const { core } = setup();
    core.setGameProfileTuning.mockImplementation(() => { throw new Error('identity mismatch'); });
    const slider = document.querySelector<HTMLInputElement>('input[type=range]')!;
    slider.value = '12'; slider.dispatchEvent(new Event('input'));
    expect(slider.value).toBe('64');
    expect(document.querySelector('[role=status]')?.textContent).toContain('identity mismatch');
  });

  it('keeps range keyboard edits local but allows key release outside the panel', () => {
    setup();
    const slider = document.querySelector<HTMLInputElement>('input[type=range]')!;
    const down = vi.fn(), up = vi.fn();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    try {
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      slider.dispatchEvent(event);
      expect(down).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
      slider.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
      expect(up).toHaveBeenCalledTimes(1);
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(down).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    }
  });
});