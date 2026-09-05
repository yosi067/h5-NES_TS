// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { URL as NodeURL } from 'node:url';
import { expect, it, vi } from 'vitest';
import { NesTextOverlay } from '../src/game-profiles/text-overlay';
import {
  CT2_SOURCE_HASHES, TextObservationState, cellRectangleVisible,
  validateLocalizationAssets, type LocalizationAssets,
} from '../src/game-profiles/localization';
import type { EmuWasm } from '../src/wasm/nes_wasm.js';

const FRAMES = 2400;
const HAN = /[\u3400-\u9fff]/;

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

function makeContext() {
  return {
    font: '', fillStyle: '', textBaseline: '', textAlign: '',
    setTransform: vi.fn(), clearRect: vi.fn(),
    fillRect: vi.fn(function (this: { fillStyle: string }, _x: number, _y: number, _w: number, _h: number) {
      return this.fillStyle;
    }),
    fillText: vi.fn(function (this: { font: string; fillStyle: string }, _text: string, _x: number, _y: number) {
      return { font: this.font, color: this.fillStyle };
    }),
    // Same deterministic full-width metrics as text-overlay.test.ts. A zero
    // width mock would incorrectly bypass the real renderer's fitting guard.
    measureText: vi.fn(function (this: { font: string }, text: string): TextMetrics {
      const size = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 14);
      return { width: [...text].length * size } as TextMetrics;
    }),
  };
}

function screenRect(): DOMRect {
  return { x: 10, y: 20, left: 10, top: 20, width: 256, height: 224,
    right: 266, bottom: 244, toJSON: () => ({ left: 10, top: 20, width: 256, height: 224 }) };
}

// All file reads and WASM initialization are inside the opt-in callback: the
// ordinary test suite neither needs the ROM nor silently skips missing assets
// after CT2_TEST_ROM=1 has explicitly requested this integration test.
it.skipIf(process.env.CT2_TEST_ROM !== '1')(
  'renders original CT2 Chinese every frame and retains it throughout the real EB prompt wait',
  async () => {
    const started = performance.now();
    let core: EmuWasm | undefined;
    let overlay: NesTextOverlay | undefined;
    let framesRendered = 0, emulationMs = 0, renderMs = 0;
    let firstChineseFrame: number | null = null, chineseFrames = 0;
    let promptFrame: number | null = null, promptText = '', promptFrames = 0;
    let finalText = '', finalStrings: string[] = [];
    let generationCheckedCells = 0, renderFailures = 0, evidenceFailures = 0, waitFailures = 0;
    const failureSamples: string[] = [];
    const eventCounts = new Map<number, number>();
    const ebEvents: { frame: number; source: number; cell: number; opcode: number }[] = [];
    const observedStrings = new Set<string>();
    const completedTranslations = new Set<string>();
    const recordFailure = (message: string) => {
      if (failureSamples.length < 12) failureSamples.push(message);
    };
    const previousDraft = localStorage.getItem('nes-localization:captain-tsubasa-2-jp:zh-Hant:v1');
    const storageKey = 'nes-localization:captain-tsubasa-2-jp:zh-Hant:v1';
    const bezel = document.createElement('div');
    try {
      vi.stubEnv('DEV', false);
      const read = (path: string) => readFileSync(new NodeURL(path, import.meta.url));
      const assets: LocalizationAssets = {
        catalog: JSON.parse(read('../public/game-profiles/captain-tsubasa-2-jp/localization.json').toString('utf8')),
        runtime: JSON.parse(read('../public/game-profiles/captain-tsubasa-2-jp/text-runtime.json').toString('utf8')),
      };
      validateLocalizationAssets(assets);
      const rom = read('../roms/Captain Tsubasa II - Super Striker (Japan).nes');
      const romHash = createHash('sha256').update(rom).digest('hex');
      expect(romHash, 'canonical, unpatched Japanese ROM').toBe(CT2_SOURCE_HASHES[0]);
      expect(assets.runtime.sourceHashes).toContain(romHash);
      const { initSync, EmuWasm: GeneratedEmuWasm } = await import('../src/wasm/nes_wasm.js');
      initSync({ module: read('../src/wasm/nes_wasm_bg.wasm') });
      core = new GeneratedEmuWasm();
      expect(core.loadRom(rom)).toBe(true);
      expect(core.getCoreType()).toBe('nes');
      expect(core.getActiveGameProfileId(), 'no ROM patch or game profile installed').toBe('');
      expect(core.enableTextObserver(true)).toBe(true);
      expect(typeof core.getTextFrameMetadata, 'real core must expose frame-coherent metadata, not the legacy fallback').toBe('function');

      localStorage.removeItem(storageKey);
      const context = makeContext();
      vi.stubGlobal('ResizeObserver', ResizeObserverMock);
      vi.stubGlobal('devicePixelRatio', 1);
      // jsdom has no native pixel canvas. Exercise the deterministic fallback
      // and inspect its actual draw calls, never the renderer's private masks.
      // The ImageData/composite pixel path is covered in text-overlay.test.ts.
      vi.stubGlobal('ImageData', undefined);
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
        .mockImplementation((() => context) as unknown as HTMLCanvasElement['getContext']);
      bezel.className = 'screen-bezel';
      bezel.style.position = 'relative';
      const screen = document.createElement('canvas');
      screen.width = 256;
      screen.height = 224; // Original 240 scanlines, cropped by eight at each end.
      Object.defineProperties(screen, {
        clientWidth: { get: () => 256 }, clientHeight: { get: () => 224 },
      });
      vi.spyOn(screen, 'getBoundingClientRect').mockImplementation(screenRect);
      vi.spyOn(bezel, 'getBoundingClientRect').mockImplementation(screenRect);
      bezel.append(screen);
      document.body.append(bezel);
      overlay = new NesTextOverlay(screen, assets);
      const layer = bezel.querySelector<HTMLCanvasElement>('.nes-localization-layer')!;
      expect(bezel.nextElementSibling, 'no reading panel or production controls').toBeNull();
      expect(document.querySelector('a[href*="translation-studio.html"]')).toBeNull();

      // These spies call through unchanged. Only overlay.render drains the core;
      // inspect its returned batch afterward, never inject or replay events.
      const eventsSpy = vi.spyOn(core, 'takeTextEvents');
      const frameSpy = vi.spyOn(core, 'frame');
      const inputSpy = vi.spyOn(core, 'setButton');
      const evidence = new TextObservationState(assets.runtime);
      const entries = new Map(assets.catalog.entries.map(entry => [entry.id, entry]));
      const lines = new Map<string, string>();
      for (const run of assets.runtime.runs) {
        if (run.domain === 'battle') continue;
        lines.set(run.line, (lines.get(run.line) ?? '') + entries.get(run.id)!.translation);
      }
      const canonicalTranslations = new Set([...lines.values()].map(text => text.replace(/^ +/, '')));

      // Zero-based frame numbers match the existing CT2 trace convention:
      // Start a new game, then leave its reading prompt untouched. The attract
      // mode with no Start input is a different script and does not wait on EB.
      for (let frame = 0; frame < FRAMES; frame++) {
        context.setTransform.mockClear(); context.clearRect.mockClear();
        context.fillRect.mockClear(); context.fillText.mockClear(); context.measureText.mockClear();
        let tick = performance.now();
        if (frame === 600 || frame === 900) core.setButton(0, 3, true);
        if (frame === 604 || frame === 904) core.setButton(0, 3, false);
        core.frame();
        emulationMs += performance.now() - tick;
        tick = performance.now();
        overlay.render(core, 8);
        renderMs += performance.now() - tick;
        framesRendered++;

        const result = eventsSpy.mock.results[frame];
        expect(result?.type, `real event drain at frame ${frame}`).toBe('return');
        const events = result.value as Uint32Array;
        expect(events.length % 4, `event wire format at frame ${frame}`).toBe(0);
        evidence.consume(events);
        for (let i = 0; i < events.length; i += 4) {
          eventCounts.set(events[i], (eventCounts.get(events[i]) ?? 0) + 1);
          if (events[i] === 2 && events[i + 3] === 0xeb) {
            ebEvents.push({ frame, source: events[i + 1], cell: events[i + 2], opcode: events[i + 3] });
            if (promptFrame === null) promptFrame = frame;
          }
        }

        const inlineStrings = context.fillText.mock.calls.map(call => String(call[0]));
        finalStrings = inlineStrings;
        finalText = layer.dataset.text ?? '';
        // Every translated row must actually be drawn inside the canvas.
        const actualRows = [...finalStrings].sort();
        const datasetRows = finalText.split('\n').filter(Boolean).sort();
        const paintedText = actualRows.join('\n').trim();
        if (JSON.stringify(datasetRows) !== JSON.stringify(actualRows)
            || context.clearRect.mock.calls.length !== 1
            || context.fillText.mock.results.some(result => result.value.font !== '600 12px "Microsoft JhengHei", "Noto Sans TC", sans-serif')) {
          renderFailures++; recordFailure(`frame ${frame}: dataset/draw mismatch, missing clear or non-12px font`);
        }
        const chineseVisible = HAN.test(paintedText) && context.fillRect.mock.calls.length > 0;
        if (chineseVisible) {
          firstChineseFrame ??= frame;
          chineseFrames++;
          for (const text of finalStrings) {
            if (!HAN.test(text)) continue;
            observedStrings.add(text);
            if (canonicalTranslations.has(text)) completedTranslations.add(text);
          }
        }

        // Check every actually covered 8×8 half-cell against real kind-4
        // generations and this completed PPU frame's four-word metadata.
        // Never fabricate expectedGenerations or edit WASM memory to make a draw pass.
        if (context.fillRect.mock.calls.length) {
          const fetched = core.getTextFetchedCells();
          const metadata = core.getTextFrameMetadata();
          expect(metadata.length, `four fields per physical nametable cell at frame ${frame}`).toBe(2048 * 4);
          const ptr = core.getTextProvenancePtr();
          const provenance = new Uint16Array(core.getWasmMemory().buffer, ptr, 256 * 240);
          const rectangles = context.fillRect.mock.calls;
          const paintedOrigins = new Set(rectangles.map(([x, y]) => `${x}:${y}`));
          for (const [index, [x, y, width, height]] of rectangles.entries()) {
            const cell = (provenance[y * 256 + x] & 0x0fff) - 1;
            const glyph = evidence.glyphs.get(cell) ?? evidence.glyphs.get(cell - 32);
            const half = glyph?.cell === cell ? 0 : 1;
            const glyphY = y - half * 8;
            const expected = glyph?.expectedGenerations;
            const upper = glyph ? (glyph.glyph < 0xa0 ? 0 : glyph.glyph < 0xc8 ? 0x94 : 0x95) : -1;
            const lower = glyph ? (glyph.glyph < 0xa0 ? glyph.glyph : assets.runtime.lowerTiles[glyph.glyph]) : -1;
            const tile = half === 0 ? upper : lower;
            const [packed, physicalChr, background, ink] = metadata.subarray(cell * 4, cell * 4 + 4);
            let allPixelsSupported = true;
            for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++) {
              if (provenance[(y + dy) * 256 + x + dx] !== ((cell + 1) | (dy << 12))) allPixelsSupported = false;
            }
            if (!ptr || !glyph || !expected || width !== 8 || height !== 8 || x < 0 || x + width > 256
                || y < 8 || y + height > 232 || !allPixelsSupported
                || !cellRectangleVisible(provenance, glyph.cell, x, glyphY)
                || !paintedOrigins.has(`${x}:${glyphY}`) || !paintedOrigins.has(`${x}:${glyphY + 8}`)
                || !fetched[cell] || fetched[cell] === 0xffffffff
                || fetched[cell] >>> 8 !== expected[half] || (fetched[cell] & 255) !== tile
                || packed !== fetched[cell] || physicalChr !== tile * 16 + 1
                || !background || background > 0x1000000 || ink > 0x1000000
                || context.fillRect.mock.results[index].value !== `#${(background - 1).toString(16).padStart(6, '0')}`) {
              evidenceFailures++; recordFailure(`frame ${frame}: unsupported painted cell ${cell}`);
            } else generationCheckedCells++;
          }
        }

        if (promptFrame !== null) {
          if (frame === promptFrame) promptText = paintedText;
          promptFrames++;
          if (!chineseVisible || paintedText !== promptText) {
            waitFailures++; recordFailure(`frame ${frame}: EB wait text missing/changed: ${JSON.stringify(paintedText)}`);
          }
        }
      }

      expect(framesRendered).toBe(FRAMES);
      expect(eventsSpy).toHaveBeenCalledTimes(FRAMES);
      expect(frameSpy).toHaveBeenCalledTimes(FRAMES); // Reveal never advances the game.
      expect(bezel.nextElementSibling).toBeNull();
      expect(inputSpy.mock.calls).toEqual([[0, 3, true], [0, 3, false], [0, 3, true], [0, 3, false]]);
      expect(eventCounts.get(1) ?? 0, 'real source glyphs').toBeGreaterThan(0);
      expect(eventCounts.get(4) ?? 0, 'real expected-generation events').toBeGreaterThan(0);
      expect(generationCheckedCells, 'source-backed cells actually painted').toBeGreaterThan(0);
      expect(renderFailures, failureSamples.join('\n')).toBe(0);
      expect(evidenceFailures, failureSamples.join('\n')).toBe(0);
      expect(chineseFrames, 'Chinese drawn, not merely observed as source events').toBeGreaterThan(0);
      // This route's compact translations fit at 12px. Overflow is exercised
      // by explicit long-draft renderer tests, not assumed from ROM navigation.
      expect(completedTranslations.size, 'multiple complete canonical translations, not just reveal prefixes').toBeGreaterThan(1);
      expect(ebEvents).toHaveLength(1);
      expect(promptFrame, 'original no-input EB opcode frame (zero-based)').toBe(1576);
      expect(promptFrames).toBe(FRAMES - 1576);
      expect(promptText).toMatch(HAN);
      for (const text of finalStrings) expect(canonicalTranslations.has(text), `canonical authored phrase: ${text}`).toBe(true);
      expect(waitFailures, failureSamples.join('\n')).toBe(0);
      expect(finalText.split('\n').filter(Boolean).sort().join('\n')).toBe(promptText);
      expect(createHash('sha256').update(rom).digest('hex'), 'input ROM unchanged').toBe(romHash);
      expect(performance.now() - started, 'also enforce budget for the synchronous frame loop').toBeLessThan(60000);
    } finally {
      console.log('[CT2 real overlay runtime]', JSON.stringify({
        framesRendered, frameNumbering: 'zero-based (0..2399)',
        timingsMs: { total: Math.round(performance.now() - started), emulation: Math.round(emulationMs), render: Math.round(renderMs) },
        firstChineseFrame, chineseFrames, events: Object.fromEntries(eventCounts), ebEvents,
        promptFrames, promptText, observedStringCount: observedStrings.size,
        completedTranslations: [...completedTranslations], generationCheckedCells,
        finalStrings, finalText, renderFailures, evidenceFailures, waitFailures, failureSamples,
      }, null, 2));
      overlay?.dispose();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      core?.free();
      bezel.remove();
      if (previousDraft === null) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, previousDraft);
    }
  },
  60000,
);