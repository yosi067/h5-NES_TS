import {
  LAYOUT_ACTIONS,
  LAYOUT_TITLES,
  MAX_KEYS_PER_ACTION,
  assignKey,
  assignPad,
  clearKey,
  clearPad,
  describeKey,
  describePad,
  detectPadInput,
  isDefaultLayout,
  type BindingLayout,
  type BindingStore,
  type PadInput,
} from './input-bindings';

const LAYOUT_ORDER: BindingLayout[] = ['nes', 'snes', 'arcade', 'n64'];

type CaptureTarget = { kind: 'key'; action: string; slot: number } | { kind: 'pad'; action: string };

function firstPad(): Gamepad | null {
  for (const pad of navigator.getGamepads?.() ?? []) {
    if (pad && pad.connected) return pad;
  }
  return null;
}

export interface BindingPanel {
  /** 切換到目前遊戲所屬的主機配置。 */
  showLayout(layout: BindingLayout): void;
  cancelCapture(): void;
  dispose(): void;
}

export function mountBindingPanel(
  container: HTMLElement,
  store: BindingStore,
  notify: (message: string) => void,
): BindingPanel {
  let layout: BindingLayout = 'nes';
  let capture: CaptureTarget | null = null;
  let stopCapture: (() => void) | null = null;

  const isCapturing = (target: CaptureTarget): boolean =>
    capture !== null && capture.kind === target.kind && capture.action === target.action
    && (target.kind !== 'key' || (capture.kind === 'key' && capture.slot === target.slot));

  const endCapture = () => {
    stopCapture?.();
    stopCapture = null;
    capture = null;
    document.body.classList.remove('binding-capture');
  };

  const finish = (message?: string) => {
    endCapture();
    if (message) notify(message);
    render();
  };

  const startKeyCapture = (action: string, slot: number) => {
    endCapture();
    capture = { kind: 'key', action, slot };
    document.body.classList.add('binding-capture');
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === 'Escape') return finish();
      const bindings = store.layout(layout);
      if (event.code === 'Backspace' || event.code === 'Delete') {
        clearKey(bindings, action, slot);
        store.commit();
        return finish();
      }
      const result = assignKey(bindings, action, slot, event.code);
      if (!result.ok) {
        notify(result.reason === 'reserved' ? `${describeKey(event.code)} 保留給選單與存檔，請選其他按鍵` : '無法指派');
        return;
      }
      store.commit();
      finish(result.stolenFrom.length > 0 ? `${describeKey(event.code)} 已從「${result.stolenFrom.map((id) => labelOf(id)).join('、')}」移到此動作` : undefined);
    };
    window.addEventListener('keydown', onKey, true);
    stopCapture = () => window.removeEventListener('keydown', onKey, true);
    render();
  };

  const startPadCapture = (action: string) => {
    endCapture();
    capture = { kind: 'pad', action };
    document.body.classList.add('binding-capture');
    if (!firstPad()) notify('尚未偵測到手把，請接上並按任一鍵喚醒');

    const ignore: PadInput[] = [];
    let handle = 0;
    let armed = false;
    const tick = () => {
      const pad = firstPad();
      if (pad) {
        if (!armed) {
          // 先記下已被按住的輸入，避免剛點擊時按著的鍵被誤判。
          for (let guard = 0; guard < 32; guard++) {
            const held = detectPadInput(pad, ignore);
            if (!held) break;
            ignore.push(held);
          }
          armed = true;
        } else {
          const input = detectPadInput(pad, ignore);
          if (input) {
            const result = assignPad(store.layout(layout), action, input);
            store.commit();
            finish(result.ok && result.stolenFrom.length > 0 ? `${describePad([input])} 已從「${result.stolenFrom.map((id) => labelOf(id)).join('、')}」移到此動作` : undefined);
            return;
          }
        }
      }
      handle = requestAnimationFrame(tick);
    };
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === 'Escape') return finish();
      if (event.code === 'Backspace' || event.code === 'Delete') {
        clearPad(store.layout(layout), action);
        store.commit();
        finish();
      }
    };
    window.addEventListener('keydown', onKey, true);
    handle = requestAnimationFrame(tick);
    stopCapture = () => {
      cancelAnimationFrame(handle);
      window.removeEventListener('keydown', onKey, true);
    };
    render();
  };

  const labelOf = (actionId: string): string =>
    LAYOUT_ACTIONS[layout].find((entry) => entry.id === actionId)?.label ?? actionId;

  const chip = (text: string, options: { active: boolean; empty: boolean; label: string; onClick: () => void }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bind-chip';
    button.classList.toggle('is-active', options.active);
    button.classList.toggle('is-empty', options.empty && !options.active);
    button.textContent = options.active ? '按下按鍵…' : text;
    button.setAttribute('aria-label', options.label);
    button.addEventListener('click', options.onClick);
    return button;
  };

  const render = () => {
    const bindings = store.layout(layout);
    container.replaceChildren();

    const tabs = document.createElement('div');
    tabs.className = 'bind-layouts';
    tabs.setAttribute('role', 'tablist');
    for (const id of LAYOUT_ORDER) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'bind-layout-tab';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(id === layout));
      tab.textContent = LAYOUT_TITLES[id];
      tab.addEventListener('click', () => {
        endCapture();
        layout = id;
        render();
      });
      tabs.appendChild(tab);
    }

    const hint = document.createElement('p');
    hint.className = 'bind-hint';
    hint.textContent = '點選欄位後按下鍵盤按鍵或手把按鈕（Esc 取消，Backspace 清除）。外接街機基板、搖桿皆可使用。';

    const head = document.createElement('div');
    head.className = 'bind-row bind-row-head';
    head.innerHTML = '<span>動作</span><span>鍵盤</span><span>手把 / 外接按鈕</span>';

    const rows = LAYOUT_ACTIONS[layout].map((action) => {
      const binding = bindings[action.id];
      const row = document.createElement('div');
      row.className = 'bind-row';
      const name = document.createElement('span');
      name.className = 'bind-action';
      name.textContent = action.label;

      const keys = document.createElement('span');
      keys.className = 'bind-keys';
      for (let slot = 0; slot < MAX_KEYS_PER_ACTION; slot++) {
        const code = binding.keys[slot];
        keys.appendChild(chip(code ? describeKey(code) : '—', {
          active: isCapturing({ kind: 'key', action: action.id, slot }),
          empty: !code,
          label: `${action.label} 鍵盤按鍵 ${slot + 1}`,
          onClick: () => startKeyCapture(action.id, slot),
        }));
      }

      const pad = chip(describePad(binding.pad), {
        active: isCapturing({ kind: 'pad', action: action.id }),
        empty: binding.pad.length === 0,
        label: `${action.label} 手把按鈕`,
        onClick: () => startPadCapture(action.id),
      });
      pad.classList.add('bind-pad');

      row.append(name, keys, pad);
      return row;
    });

    const footer = document.createElement('div');
    footer.className = 'bind-footer';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'stage-action';
    reset.textContent = '還原此主機預設值';
    reset.disabled = isDefaultLayout(layout, store.all);
    reset.addEventListener('click', () => {
      endCapture();
      store.reset(layout);
      render();
      notify('已還原預設按鍵');
    });
    footer.appendChild(reset);

    if (layout === 'n64') {
      const note = document.createElement('p');
      note.className = 'bind-hint';
      note.textContent = 'N64 搖桿為數位八方向；改鍵後會改由本頁轉送給模擬器。';
      footer.appendChild(note);
    }

    container.append(tabs, hint, head, ...rows, footer);
  };

  render();

  return {
    showLayout(next) {
      endCapture();
      layout = next;
      render();
    },
    cancelCapture() {
      if (capture) finish();
    },
    dispose() {
      endCapture();
      container.replaceChildren();
    },
  };
}
