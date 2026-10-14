import { createMaskApplier, createMaskMux } from './buttons';
import type { TouchControlsEngine } from './engine';
import type { CommandHistory } from './feedback';
import { PadBit, type ButtonConfig, type ControllerProfile } from './types';

export type PadTable = Array<[number, (pressed: boolean) => void]>;

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T | null => document.querySelector<T>(selector);

const DIRECTION_BITS = PadBit.Up | PadBit.Down | PadBit.Left | PadBit.Right;

function tableFor(table: PadTable, bits: number): PadTable {
  return table.filter(([bit]) => (bit & bits) !== 0);
}

function directionEls(prefix: string) {
  return {
    up: document.getElementById(`${prefix}-up`),
    down: document.getElementById(`${prefix}-down`),
    left: document.getElementById(`${prefix}-left`),
    right: document.getElementById(`${prefix}-right`),
  };
}

function profileButton(profile: ControllerProfile, id: string): ButtonConfig | undefined {
  return profile.buttons.find((button) => button.id === id);
}

interface LayoutOptions {
  engine: TouchControlsEngine;
  profile: ControllerProfile;
  table: PadTable;
  history?: CommandHistory | null;
  forceLegacy?: boolean;
}

export function mountNesLayout({ engine, profile, table, forceLegacy }: LayoutOptions): void {
  const mux = createMaskMux(createMaskApplier(table));
  const dpad = document.getElementById('dpad');
  const dpadZone = $('#nes-controller-area .dpad-container');
  if (dpad && dpadZone) {
    engine.addDirectionZone({
      container: dpadZone,
      visual: dpad,
      config: profile.dpad,
      sink: mux.slot(),
      directionEls: directionEls('dpad'),
      forceLegacy,
    });
  }

  const faceButtons = [
    ['btn-b', 'b'],
    ['btn-a', 'a'],
  ].flatMap(([elementId, id]) => {
    const el = document.getElementById(elementId);
    const config = profileButton(profile, id);
    return el && config ? [{ el, config }] : [];
  });
  const faceZone = $('#nes-controller-area .ab-buttons');
  if (faceZone && faceButtons.length > 0) {
    engine.addButtonZone({
      container: faceZone,
      buttons: faceButtons,
      enableChordOverlap: profile.enableChordOverlap,
      chordPairs: profile.chordPairs,
      sink: mux.slot(),
      forceLegacy,
    });
  }

  const turboButtons = [
    ['btn-turbo-b', 'turbo-b'],
    ['btn-turbo-a', 'turbo-a'],
  ].flatMap(([elementId, id]) => {
    const el = document.getElementById(elementId);
    const config = profileButton(profile, id);
    return el && config ? [{ el, config }] : [];
  });
  const turboZone = $('#nes-controller-area .turbo-row');
  if (turboZone && turboButtons.length > 0) {
    engine.addButtonZone({ container: turboZone, buttons: turboButtons, minContact: 8, sink: mux.slot(), forceLegacy });
  }

  mountSystemRow('#nes-controller-area .nes-utility-row .snes-func-row', [
    ['[data-btn="select"]', 'select', 'SEL', PadBit.Select],
    ['[data-btn="start"]', 'start', 'STA', PadBit.Start],
  ], engine, mux.slot(), forceLegacy);
}

function mountSystemRow(
  containerSelector: string,
  entries: Array<[string, string, string, number]>,
  engine: TouchControlsEngine,
  sink: (mask: number) => void,
  forceLegacy?: boolean,
): void {
  const container = $(containerSelector);
  if (!container) return;
  const buttons = entries.flatMap(([selector, id, label, bitmask]) => {
    const el = container.querySelector<HTMLElement>(selector);
    return el ? [{ el, config: { id, label, bitmask } as ButtonConfig }] : [];
  });
  if (buttons.length > 0) {
    engine.addButtonZone({ container, buttons, minContact: 6, sink, forceLegacy });
  }
}

export function mountSnesLayout({ engine, profile, table, forceLegacy }: LayoutOptions): void {
  const mux = createMaskMux(createMaskApplier(table));
  const dpad = document.getElementById('snes-dpad');
  const dpadZone = $('#snes-controller-area .dpad-container');
  if (dpad && dpadZone) {
    engine.addDirectionZone({
      container: dpadZone,
      visual: dpad,
      config: profile.dpad,
      sink: mux.slot(),
      directionEls: directionEls('snes-dpad'),
      forceLegacy,
    });
  }

  const face = ['x', 'y', 'a', 'b'].flatMap((id) => {
    const el = document.getElementById(`snes-btn-${id}`);
    const config = profileButton(profile, id);
    return el && config ? [{ el, config }] : [];
  });
  const faceZone = $('#snes-controller-area .snes-abxy-diamond');
  if (faceZone && face.length > 0) {
    engine.addButtonZone({
      container: faceZone,
      buttons: face,
      enableChordOverlap: profile.enableChordOverlap,
      chordPairs: profile.chordPairs,
      sink: mux.slot(),
      forceLegacy,
    });
  }

  const topRow = $('#snes-controller-area .snes-top-row');
  const topEntries: Array<[string, string, string, number]> = [
    ['#snes-btn-l', 'l', 'L', PadBit.L],
    ['#snes-btn-r', 'r', 'R', PadBit.R],
    ['[data-snes-btn="select"]', 'select', 'SEL', PadBit.Select],
    ['[data-snes-btn="start"]', 'start', 'STA', PadBit.Start],
  ];
  const top = topEntries.flatMap(([selector, id, label, bitmask]) => {
    const el = topRow?.querySelector<HTMLElement>(selector);
    return el ? [{ el, config: { id, label, bitmask } as ButtonConfig }] : [];
  });
  if (topRow && top.length > 0) {
    engine.addButtonZone({ container: topRow, buttons: top, minContact: 6, sink: mux.slot(), forceLegacy });
  }
}

export interface ArcadeLayoutOptions extends LayoutOptions {
  history: CommandHistory | null;
}

export function mountArcadeLayout({ engine, profile, table, history, forceLegacy }: ArcadeLayoutOptions): void {
  const mux = createMaskMux(createMaskApplier(table));
  const dpad = document.getElementById('arcade-dpad');
  const dpadZone = $('#arcade-controller-area .dpad-container');
  const fighting = profile.type === 'ARCADE_FIGHTING';
  if (dpad && dpadZone) {
    engine.addDirectionZone({
      container: dpadZone,
      visual: dpad,
      config: profile.dpad,
      sink: mux.slot(),
      directionEls: directionEls('arcade-dpad'),
      trail: profile.inputTrail,
      history,
      hapticOnChange: fighting,
      forceLegacy,
    });
  }

  const faceZone = $('#arcade-controller-area .arcade-panel');
  if (faceZone) {
    const byBit = new Map(profile.buttons.filter((button) => !button.isMacro).map((button) => [button.id, button]));
    const face = Array.from(faceZone.querySelectorAll<HTMLElement>('.arcade-face-btn[data-arcade-bit]')).flatMap((el) => {
      const config = byBit.get(el.dataset.arcadeBit ?? '');
      return config && !el.hidden ? [{ el, config }] : [];
    });
    const macros = renderMacroRow(faceZone, profile.buttons.filter((button) => button.isMacro));
    engine.addButtonZone({
      container: faceZone,
      buttons: [...face, ...macros],
      enableChordOverlap: profile.enableChordOverlap,
      chordPairs: profile.chordPairs,
      sink: mux.slot(),
      history,
      forceLegacy,
    });
  }

  const systemRow = $('#arcade-controller-area .arcade-system-row');
  if (systemRow) {
    const systemEntries: Array<[string, string, number]> = [
      ['coin', 'COIN', PadBit.Select],
      ['start', 'START', PadBit.Start],
    ];
    const system = systemEntries.flatMap(([id, label, bitmask]) => {
      const el = systemRow.querySelector<HTMLElement>(`[data-arcade-bit="${id}"]`);
      return el ? [{ el, config: { id, label, bitmask } as ButtonConfig }] : [];
    });
    engine.addButtonZone({ container: systemRow, buttons: system, minContact: 6, sink: mux.slot(), forceLegacy });
  }
}

function renderMacroRow(panel: HTMLElement, macros: ButtonConfig[]): Array<{ el: HTMLElement; config: ButtonConfig }> {
  panel.querySelector('.arcade-macro-row')?.remove();
  if (macros.length === 0) return [];
  const row = document.createElement('div');
  row.className = 'arcade-macro-row';
  const entries = macros.map((config) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'arcade-macro-btn';
    el.textContent = config.label;
    el.setAttribute('aria-label', `組合鍵 ${config.label}`);
    row.appendChild(el);
    return { el, config };
  });
  panel.insertBefore(row, panel.firstChild);
  return entries;
}

export interface N64LayoutOptions {
  engine: TouchControlsEngine;
  profile: ControllerProfile;
  stickTable: PadTable;
  dpadTable: PadTable;
  buttonTable: PadTable;
  forceLegacy?: boolean;
}

export function mountN64Layout({ engine, profile, stickTable, dpadTable, buttonTable, forceLegacy }: N64LayoutOptions): void {
  const stick = document.getElementById('n64-stick');
  const stickZone = document.getElementById('n64-stick-touch');
  if (stick && stickZone) {
    engine.addDirectionZone({
      container: stickZone,
      visual: stick,
      config: profile.dpad,
      sink: createMaskMux(createMaskApplier(tableFor(stickTable, DIRECTION_BITS))).slot(),
      directionEls: directionEls('n64-stick'),
      forceLegacy,
    });
  }

  const pad = document.getElementById('n64-dpad');
  const padZone = document.getElementById('n64-dpad-touch');
  if (pad && padZone) {
    engine.addDirectionZone({
      container: padZone,
      visual: pad,
      config: profile.dpad,
      sink: createMaskMux(createMaskApplier(tableFor(dpadTable, DIRECTION_BITS))).slot(),
      directionEls: directionEls('n64-dpad'),
      forceLegacy,
    });
  }

  const mux = createMaskMux(createMaskApplier(buttonTable));
  const zones: Array<[string, Array<[string, string, string, number]>, number]> = [
    ['#n64-controller-area .n64-top-row', [
      ['[data-n64-button="l"]', 'l', 'L', PadBit.L],
      ['[data-n64-button="z"]:not([data-pad-secondary])', 'z', 'Z', PadBit.Z],
      ['[data-pad-secondary][data-n64-button="z"]', 'z2', 'Z', PadBit.Z],
      ['[data-n64-button="r"]', 'r', 'R', PadBit.R],
      ['[data-n64-button="start"]', 'start', 'START', PadBit.Start],
    ], 6],
    ['#n64-controller-area .n64-face-block .n64-face-row', [
      ['[data-n64-button="b"]', 'b', 'B', PadBit.B],
      ['[data-n64-button="a"]', 'a', 'A', PadBit.A],
    ], 24],
    ['#n64-controller-area .n64-c-block', [
      ['[data-n64-button="c-up"]', 'c-up', '▲', PadBit.CUp],
      ['[data-n64-button="c-down"]', 'c-down', '▼', PadBit.CDown],
      ['[data-n64-button="c-left"]', 'c-left', '◀', PadBit.CLeft],
      ['[data-n64-button="c-right"]', 'c-right', '▶', PadBit.CRight],
    ], 16],
  ];
  for (const [containerSelector, entries, minContact] of zones) {
    const container = $(containerSelector);
    if (!container) continue;
    const buttons = entries.flatMap(([selector, id, label, bitmask]) => {
      const el = container.querySelector<HTMLElement>(selector);
      return el ? [{ el, config: { id, label, bitmask } as ButtonConfig }] : [];
    });
    if (buttons.length > 0) engine.addButtonZone({ container, buttons, minContact, sink: mux.slot(), forceLegacy });
  }
}
