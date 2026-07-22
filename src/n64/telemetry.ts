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
  coreResidualMs: number;
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
  ): void;
  reset(): void;
}

interface TelemetryOptions {
  now?: () => number;
  reportIntervalMs?: number;
  onReport: (report: N64TelemetryReport) => void;
}

// Mupen 會在每次 VI 前後呼叫這兩個 hook。只累加數值，避免診斷本身造成額外卡頓。
export function createN64Telemetry({
  now = () => performance.now(),
  reportIntervalMs = 5000,
  onReport,
}: TelemetryOptions): N64Telemetry {
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
  let lastAudioUnderrunCount = 0;

  const reset = () => {
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
  };

  return {
    beginStats() {
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
        coreResidualMs: Math.max(0, totalViMs - rspMs - presentMs - audioMs),
      });
      reset();
    },
    reset,
  };
}