export interface N64TelemetryReport {
  viPerSecond: number;
  averageViMs: number;
  longestViMs: number;
  longVis: number;
  recompiles: number;
  elapsedMs: number;
  viCount: number;
  rspMs: number;
  dlistMs: number;
  rdpMs: number;
  presentMs: number;
  audioMs: number;
  triangleDrawMs: number;
  rectDrawMs: number;
  trianglePrepareMs: number;
  triangleUploadMs: number;
  triangleSubmitMs: number;
  triangleRestoreMs: number;
  triangleOtherMs: number;
  triangleDrawCalls: number;
  rectDrawCalls: number;
  audioUnderruns: number;
  audioCallbackCount: number;
  audioPartialUnderruns: number;
  audioEmptyUnderruns: number;
  audioMaxCallbackGapMs: number;
  coreResidualMs: number;
  // `viCount`/`viPerSecond` count main-loop iterations, which end at a Rice swap
  // (null-video ends at every VI). The fields below count real VI interrupts.
  // null means the runtime did not publish counters for the whole window.
  emulatedViCount: number | null;
  emulatedViPerSecond: number | null;
  viRefreshRate: number | null;
  /** emulatedViPerSecond / viRefreshRate; 1 is full speed. */
  emulationSpeed: number | null;
  /** SDL pause-for-sync segments; paused callbacks never reach the underrun counters. */
  audioSyncPauses: number | null;
  audioSyncPausedMs: number | null;
}

/** Cumulative counters published by the rebuilt fork on `globalThis.__n64WebCounters`. */
export interface N64RuntimeCounters {
  viInterrupts: number;
  viRefreshRate: number;
  audioSyncPauses: number;
  /** Includes the pause segment still in progress. */
  audioSyncPausedMs: number;
}

export function readN64RuntimeCounters(raw: unknown, now: number): N64RuntimeCounters | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  if (data.version !== 1 || !finite(data.viInterrupts) || !finite(data.viRefreshRate)
    || !finite(data.audioSyncPauses) || !finite(data.audioSyncPausedMs)) return null;
  const pausedSince = finite(data.audioSyncPausedSince) ? data.audioSyncPausedSince : null;
  return {
    viInterrupts: data.viInterrupts,
    viRefreshRate: data.viRefreshRate,
    audioSyncPauses: data.audioSyncPauses,
    audioSyncPausedMs: data.audioSyncPausedMs + (pausedSince === null ? 0 : Math.max(0, now - pausedSince)),
  };
}

declare global {
  var __n64WebCounters: unknown;
}

export interface N64Telemetry {
  beginStats(): void;
  endStats(
    numberOfRecompiles: number,
    rspMs?: number,
    dlistMs?: number,
    rdpMs?: number,
    presentMs?: number,
    audioMs?: number,
    triangleDrawMs?: number,
    rectDrawMs?: number,
    trianglePrepareMs?: number,
    triangleUploadMs?: number,
    triangleSubmitMs?: number,
    triangleRestoreMs?: number,
    triangleDrawCalls?: number,
    rectDrawCalls?: number,
    audioUnderruns?: number,
    audioCallbackCount?: number,
    audioPartialUnderruns?: number,
    audioEmptyUnderruns?: number,
    audioMaxCallbackGapMs?: number,
  ): void;
  reset(): void;
}

interface TelemetryOptions {
  now?: () => number;
  reportIntervalMs?: number;
  readCounters?: () => N64RuntimeCounters | null;
  onReport: (report: N64TelemetryReport) => void;
}

// Mupen 會在每次 VI 前後呼叫這兩個 hook。只累加數值，避免診斷本身造成額外卡頓。
export function createN64Telemetry({
  now = () => performance.now(),
  reportIntervalMs = 5000,
  readCounters = () => readN64RuntimeCounters(globalThis.__n64WebCounters, performance.now()),
  onReport,
}: TelemetryOptions): N64Telemetry {
  // undefined: not sampled since reset; null: runtime had no counters at the window start.
  let counterBaseline: N64RuntimeCounters | null | undefined;
  let viStart: number | null = null;
  let windowStart = now();
  let viCount = 0;
  let totalViMs = 0;
  let longestViMs = 0;
  let longVis = 0;
  let recompiles = 0;
  let rspMs = 0;
  let dlistMs = 0;
  let rdpMs = 0;
  let presentMs = 0;
  let audioMs = 0;
  let triangleDrawMs = 0;
  let rectDrawMs = 0;
  let trianglePrepareMs = 0;
  let triangleUploadMs = 0;
  let triangleSubmitMs = 0;
  let triangleRestoreMs = 0;
  let triangleDrawCalls = 0;
  let rectDrawCalls = 0;
  let audioUnderruns = 0;
  let audioCallbackCount = 0;
  let audioPartialUnderruns = 0;
  let audioEmptyUnderruns = 0;
  let audioMaxCallbackGapMs = 0;
  let lastAudioUnderrunCount = 0;
  let lastAudioCallbackCount = 0;
  let lastAudioPartialUnderrunCount = 0;
  let lastAudioEmptyUnderrunCount = 0;

  const resetWindow = () => {
    viStart = null;
    windowStart = now();
    viCount = 0;
    totalViMs = 0;
    longestViMs = 0;
    longVis = 0;
    recompiles = 0;
    rspMs = 0;
    dlistMs = 0;
    rdpMs = 0;
    presentMs = 0;
    audioMs = 0;
    triangleDrawMs = 0;
    rectDrawMs = 0;
    trianglePrepareMs = 0;
    triangleUploadMs = 0;
    triangleSubmitMs = 0;
    triangleRestoreMs = 0;
    triangleDrawCalls = 0;
    rectDrawCalls = 0;
    audioUnderruns = 0;
    audioCallbackCount = 0;
    audioPartialUnderruns = 0;
    audioEmptyUnderruns = 0;
    audioMaxCallbackGapMs = 0;
  };

  const reset = () => {
    counterBaseline = undefined;
    resetWindow();
  };

  const counterDeltas = (elapsedMs: number) => {
    const current = readCounters();
    const baseline = counterBaseline;
    counterBaseline = current;
    // A missing baseline or a smaller cumulative value means the runtime changed mid-window.
    if (!current || !baseline || current.viInterrupts < baseline.viInterrupts
      || current.audioSyncPauses < baseline.audioSyncPauses) {
      return {
        emulatedViCount: null, emulatedViPerSecond: null, viRefreshRate: current?.viRefreshRate || null,
        emulationSpeed: null, audioSyncPauses: null, audioSyncPausedMs: null,
      };
    }
    const emulatedViCount = current.viInterrupts - baseline.viInterrupts;
    const emulatedViPerSecond = emulatedViCount * 1000 / elapsedMs;
    const viRefreshRate = current.viRefreshRate > 0 ? current.viRefreshRate : null;
    return {
      emulatedViCount,
      emulatedViPerSecond,
      viRefreshRate,
      emulationSpeed: viRefreshRate === null ? null : emulatedViPerSecond / viRefreshRate,
      audioSyncPauses: current.audioSyncPauses - baseline.audioSyncPauses,
      audioSyncPausedMs: Math.max(0, current.audioSyncPausedMs - baseline.audioSyncPausedMs),
    };
  };

  return {
    beginStats() {
      if (counterBaseline === undefined) counterBaseline = readCounters();
      viStart = now();
    },
    endStats(
      numberOfRecompiles: number,
      viRspMs = 0,
      viDlistMs = 0,
      viRdpMs = 0,
      viPresentMs = 0,
      viAudioMs = 0,
      viTriangleDrawMs = 0,
      viRectDrawMs = 0,
      viTrianglePrepareMs = 0,
      viTriangleUploadMs = 0,
      viTriangleSubmitMs = 0,
      viTriangleRestoreMs = 0,
      viTriangleDrawCalls = 0,
      viRectDrawCalls = 0,
      viAudioUnderruns = 0,
      viAudioCallbackCount = 0,
      viAudioPartialUnderruns = 0,
      viAudioEmptyUnderruns = 0,
      viAudioMaxCallbackGapMs = 0,
    ) {
      const endedAt = now();
      const viMs = viStart === null ? 0 : endedAt - viStart;
      viCount++;
      totalViMs += viMs;
      longestViMs = Math.max(longestViMs, viMs);
      if (viMs > 25) longVis++;
      recompiles += numberOfRecompiles;
      rspMs += viRspMs;
      dlistMs += viDlistMs;
      rdpMs += viRdpMs;
      presentMs += viPresentMs;
      audioMs += viAudioMs;
      triangleDrawMs += viTriangleDrawMs;
      rectDrawMs += viRectDrawMs;
      trianglePrepareMs += viTrianglePrepareMs;
      triangleUploadMs += viTriangleUploadMs;
      triangleSubmitMs += viTriangleSubmitMs;
      triangleRestoreMs += viTriangleRestoreMs;
      triangleDrawCalls += viTriangleDrawCalls;
      rectDrawCalls += viRectDrawCalls;
      audioUnderruns += viAudioUnderruns >= lastAudioUnderrunCount
        ? viAudioUnderruns - lastAudioUnderrunCount
        : viAudioUnderruns;
      lastAudioUnderrunCount = viAudioUnderruns;
      audioCallbackCount += viAudioCallbackCount >= lastAudioCallbackCount
        ? viAudioCallbackCount - lastAudioCallbackCount
        : viAudioCallbackCount;
      audioPartialUnderruns += viAudioPartialUnderruns >= lastAudioPartialUnderrunCount
        ? viAudioPartialUnderruns - lastAudioPartialUnderrunCount
        : viAudioPartialUnderruns;
      audioEmptyUnderruns += viAudioEmptyUnderruns >= lastAudioEmptyUnderrunCount
        ? viAudioEmptyUnderruns - lastAudioEmptyUnderrunCount
        : viAudioEmptyUnderruns;
      lastAudioCallbackCount = viAudioCallbackCount;
      lastAudioPartialUnderrunCount = viAudioPartialUnderruns;
      lastAudioEmptyUnderrunCount = viAudioEmptyUnderruns;
      audioMaxCallbackGapMs = Math.max(audioMaxCallbackGapMs, viAudioMaxCallbackGapMs);

      const elapsedMs = endedAt - windowStart;
      if (elapsedMs < reportIntervalMs) return;

      onReport({
        viPerSecond: viCount * 1000 / elapsedMs,
        averageViMs: totalViMs / viCount,
        longestViMs,
        longVis,
        recompiles,
        elapsedMs,
        viCount,
        rspMs,
        dlistMs,
        rdpMs,
        presentMs,
        audioMs,
        triangleDrawMs,
        rectDrawMs,
        trianglePrepareMs,
        triangleUploadMs,
        triangleSubmitMs,
        triangleRestoreMs,
        triangleOtherMs: Math.max(0, triangleDrawMs - trianglePrepareMs
          - triangleUploadMs - triangleSubmitMs - triangleRestoreMs),
        triangleDrawCalls,
        rectDrawCalls,
        audioUnderruns,
        audioCallbackCount,
        audioPartialUnderruns,
        audioEmptyUnderruns,
        audioMaxCallbackGapMs,
        coreResidualMs: Math.max(0, totalViMs - rspMs - presentMs - audioMs),
        ...counterDeltas(elapsedMs),
      });
      resetWindow();
    },
    reset,
  };
}