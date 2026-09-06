// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mountZombieRuntimeTuning } from '../src/game-profiles/zombie-runtime-tuning';
afterEach(() => document.body.replaceChildren());
function setup(profileId = 'zombie-hunter-jp', supported = true) {
  const anchor = document.createElement('div'); document.body.append(anchor);
  let enabled = true;
  let money = true;
  const core = {
    getGameProfileTuning: () => JSON.stringify({ profileId, supported, maxLevelOnNewGame: enabled, maxMoneyOnNewGame: money }),
    setGameProfileTuning: vi.fn((json: string) => { enabled = JSON.parse(json).maxLevelOnNewGame; money = JSON.parse(json).maxMoneyOnNewGame; }),
    reset: vi.fn(), loadGameProfile: vi.fn(),
  };
  return { core, controls: mountZombieRuntimeTuning(core, anchor) };
}
it('requires verified Zombie Hunter identity, not CT2', () => {
  expect(setup('captain-tsubasa-2-jp').controls).toBeNull();
  expect(setup('zombie-hunter-jp', false).controls).toBeNull();
  const { core, controls } = setup();
  expect(controls).not.toBeNull();
  expect(document.body.textContent).toContain('L31');
  expect(core.setGameProfileTuning).not.toHaveBeenCalled();
});
it('changes only the next-game preference and disposes cleanly', () => {
  const { core, controls } = setup();
  const toggle = document.querySelector('input')!;
  toggle.checked = false; toggle.dispatchEvent(new Event('change'));
  expect(JSON.parse(core.getGameProfileTuning()).maxLevelOnNewGame).toBe(false);
  toggle.checked = true; toggle.dispatchEvent(new Event('change'));
  expect(JSON.parse(core.getGameProfileTuning()).maxLevelOnNewGame).toBe(true);
  expect(core.reset).not.toHaveBeenCalled();
  expect(core.loadGameProfile).not.toHaveBeenCalled();
  controls!.dispose();
  toggle.dispatchEvent(new Event('change'));
  expect(core.setGameProfileTuning).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[data-zombie-runtime-tuning]')).toBeNull();
});
it('rolls back rejected changes', () => {
  const { core } = setup();
  core.setGameProfileTuning.mockImplementation(() => { throw Error('rejected'); });
  const toggle = document.querySelector('input')!;
  toggle.checked = false; toggle.dispatchEvent(new Event('change'));
  expect(toggle.checked).toBe(true);
  expect(document.querySelector('[role=status]')?.textContent).toContain('rejected');
});
it('has independent default-on money control and explains overflow and save semantics', () => {
  const { core, controls } = setup();
  const [level, money] = Array.from(document.querySelectorAll('input'));
  expect(money.checked).toBe(true);
  money.checked = false; money.dispatchEvent(new Event('change'));
  expect(level.checked).toBe(true);
  expect(JSON.parse(core.getGameProfileTuning()).maxMoneyOnNewGame).toBe(false);
  expect(document.body.textContent).toContain('999,999');
  expect(document.body.textContent).toContain('並非封頂');
  core.setGameProfileTuning.mockImplementation(() => { throw Error('rejected'); });
  money.checked = true; money.dispatchEvent(new Event('change'));
  expect(money.checked).toBe(false);
  controls!.dispose(); money.dispatchEvent(new Event('change'));
  expect(core.setGameProfileTuning).toHaveBeenCalledTimes(2);
});