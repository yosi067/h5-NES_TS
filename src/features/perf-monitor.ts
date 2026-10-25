/**
 * 效能面板：顯示幀率、每幀模擬／繪製耗時（平均與 p95）、長幀與音訊斷音。
 *
 * 開啟方式：網址加上 ?perf=1，或遊戲中按 F9 切換。
 * 關閉時各量測點只做一次布林判斷，不呼叫 performance.now()，不影響遊戲效能。
 * window.h5Perf.snapshot() 可取得目前數據（自動化量測用）。
 */
import { runtime } from '../app/runtime';
import { requestAudioQueueStats, type AudioQueueStats } from '../audio/audio-output';

/** 量測用的環狀樣本緩衝（固定容量，覆寫最舊的樣本）。 */
class SampleWindow {
  private readonly values: Float64Array;
  private count = 0;
  private next = 0;

  constructor(capacity: number) {
    this.values = new Float64Array(capacity);
  }

  push(value: number): void {
    this.values[this.next] = value;
    this.next = (this.next + 1) % this.values.length;
    if (this.count < this.values.length) this.count++;
  }

  clear(): void {
    this.count = 0;
    this.next = 0;
  }

  summary(): { avg: number; p95: number; max: number } {
    if (this.count === 0) return { avg: 0, p95: 0, max: 0 };
    const sorted = Array.from(this.values.subarray(0, this.count)).sort((a, b) => a - b);
    const sum = sorted.reduce((total, value) => total + value, 0);
    return {
      avg: sum / this.count,
      p95: sorted[Math.min(this.count - 1, Math.floor(this.count * 0.95))],
      max: sorted[this.count - 1],
    };
  }
}


export interface PerfSnapshot {
  backend: string;
  core: string;
  /** 瀏覽器實際畫面更新率。 */
  displayFps: number;
  /** 每秒模擬的遊戲幀數（快轉時會高於 60）。 */
  emulatedFps: number;
  /** 每次畫面更新花在模擬（含音訊轉送與倒帶快照）的毫秒數。 */
  emulationMs: { avg: number; p95: number; max: number };
  /** 每次畫面更新花在把畫面畫上畫布的毫秒數。 */
  renderMs: { avg: number; p95: number; max: number };
  /** 兩次畫面更新的間隔（理想值約 16.7 ms）。 */
  frameIntervalMs: { avg: number; p95: number; max: number };
  /** 間隔超過 1.5 倍理想值的次數（看得到的卡頓）。 */
  longFrames: number;
  audio: AudioQueueStats | null;
}


const WINDOW_SIZE = 240;
const LONG_FRAME_MS = 1000 / 60 * 1.5;

export let perfEnabled = false;

const emulationSamples = new SampleWindow(WINDOW_SIZE);
const renderSamples = new SampleWindow(WINDOW_SIZE);
const intervalSamples = new SampleWindow(WINDOW_SIZE);
let longFrames = 0;
let emulatedFrameStamps: number[] = [];
let displayFrameStamps: number[] = [];
let lastAudioStats: AudioQueueStats | null = null;
let hostRafId: number | null = null;
let lastHostFrame = 0;
let panel: HTMLElement | null = null;
let panelTimer: number | null = null;


/** 量測起點：關閉時回傳 0，不呼叫計時器。 */
export function perfNow(): number {
  return perfEnabled ? performance.now() : 0;
}


export function recordEmulation(startedAt: number, emulatedFrames: number): void {
  if (!perfEnabled) return;
  const now = performance.now();
  emulationSamples.push(now - startedAt);
  for (let index = 0; index < emulatedFrames; index++) emulatedFrameStamps.push(now);
}


export function recordRender(startedAt: number): void {
  if (!perfEnabled) return;
  renderSamples.push(performance.now() - startedAt);
}


function trimStamps(stamps: number[], now: number): number[] {
  const cutoff = now - 1000;
  let first = 0;
  while (first < stamps.length && stamps[first] < cutoff) first++;
  return first === 0 ? stamps : stamps.slice(first);
}


/** 與後端無關的畫面更新計時：N64、EmulatorJS 也能看到主執行緒是否卡頓。 */
function hostFrame(now: number): void {
  if (!perfEnabled) return;
  if (lastHostFrame > 0) {
    const interval = now - lastHostFrame;
    intervalSamples.push(interval);
    if (interval > LONG_FRAME_MS && !document.hidden) longFrames++;
  }
  lastHostFrame = now;
  displayFrameStamps.push(now);
  hostRafId = requestAnimationFrame(hostFrame);
}


export function getPerfSnapshot(): PerfSnapshot {
  const now = performance.now();
  displayFrameStamps = trimStamps(displayFrameStamps, now);
  emulatedFrameStamps = trimStamps(emulatedFrameStamps, now);
  return {
    backend: runtime.activeBackend,
    core: runtime.activeBackend === 'wasm' ? runtime.nes?.getCoreType() || '-' : runtime.activeBackend,
    displayFps: displayFrameStamps.length,
    emulatedFps: emulatedFrameStamps.length,
    emulationMs: emulationSamples.summary(),
    renderMs: renderSamples.summary(),
    frameIntervalMs: intervalSamples.summary(),
    longFrames,
    audio: lastAudioStats,
  };
}


function formatMs(stats: { avg: number; p95: number }): string {
  return `${stats.avg.toFixed(2)} ms（p95 ${stats.p95.toFixed(2)}）`;
}


function renderPanel(): void {
  if (!panel) return;
  const snap = getPerfSnapshot();
  const budget = 1000 / 60;
  const busy = (snap.emulationMs.avg + snap.renderMs.avg) / budget * 100;
  const audio = snap.audio
    ? `音訊 佇列 ${Math.round(snap.audio.bufferedFrames)}　斷音 ${snap.audio.underruns}　丟棄 ${snap.audio.droppedChunks}`
    : '音訊 —';
  const nativeLoop = snap.backend === 'wasm' || snap.backend === 'fbneo';
  panel.textContent = [
    `${snap.core.toUpperCase()} · ${snap.backend}`,
    `畫面 ${snap.displayFps} fps　長幀 ${snap.longFrames}`,
    `間隔 ${formatMs(snap.frameIntervalMs)}`,
    nativeLoop ? `模擬 ${snap.emulatedFps} fps　${formatMs(snap.emulationMs)}` : '模擬 由外部核心處理',
    nativeLoop ? `繪製 ${formatMs(snap.renderMs)}` : '',
    nativeLoop ? `每幀預算使用 ${busy.toFixed(0)}%` : '',
    audio,
  ].filter(Boolean).join('\n');
  void requestAudioQueueStats().then((stats) => { lastAudioStats = stats; });
}


export function setPerfMonitorEnabled(enabled: boolean): void {
  if (enabled === perfEnabled) return;
  perfEnabled = enabled;
  if (enabled) {
    emulationSamples.clear();
    renderSamples.clear();
    intervalSamples.clear();
    longFrames = 0;
    emulatedFrameStamps = [];
    displayFrameStamps = [];
    lastHostFrame = 0;
    panel = document.createElement('div');
    panel.className = 'perf-panel';
    panel.setAttribute('aria-hidden', 'true');
    Object.assign(panel.style, {
      position: 'fixed', top: '8px', left: '8px', zIndex: '99999', pointerEvents: 'none',
      padding: '6px 8px', borderRadius: '6px', background: 'rgba(0,0,0,0.72)', color: '#9effa0',
      font: '11px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace', whiteSpace: 'pre',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(panel);
    hostRafId = requestAnimationFrame(hostFrame);
    panelTimer = window.setInterval(renderPanel, 500);
    renderPanel();
  } else {
    if (hostRafId !== null) cancelAnimationFrame(hostRafId);
    if (panelTimer !== null) window.clearInterval(panelTimer);
    hostRafId = null;
    panelTimer = null;
    panel?.remove();
    panel = null;
  }
}


declare global {
  interface Window {
    h5Perf: {
      enable: (enabled?: boolean) => void;
      snapshot: () => PerfSnapshot;
      /** 重新開始統計（量測不同場景時使用）。 */
      reset: () => void;
    };
  }
}


export function setupPerfMonitor(): void {
  window.h5Perf = {
    enable: (enabled = true) => setPerfMonitorEnabled(enabled),
    snapshot: getPerfSnapshot,
    reset: () => {
      if (!perfEnabled) return;
      setPerfMonitorEnabled(false);
      setPerfMonitorEnabled(true);
    },
  };
  try {
    if (new URLSearchParams(window.location.search).get('perf') === '1') setPerfMonitorEnabled(true);
  } catch {
    // ignore
  }
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'F9' || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    setPerfMonitorEnabled(!perfEnabled);
  });
}
