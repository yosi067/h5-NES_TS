export interface N64TelemetryReport {
  viPerSecond: number;
  averageViMs: number;
  longestViMs: number;
  longVis: number;
  recompiles: number;
}

export interface N64Telemetry {
  beginStats(): void;
  endStats(numberOfRecompiles: number): void;
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

  const reset = () => {
    viStart = null;
    windowStart = now();
    viCount = 0;
    totalViMs = 0;
    longestViMs = 0;
    longVis = 0;
    recompiles = 0;
  };

  return {
    beginStats() {
      viStart = now();
    },
    endStats(numberOfRecompiles: number) {
      const endedAt = now();
      const viMs = viStart === null ? 0 : endedAt - viStart;
      viCount++;
      totalViMs += viMs;
      longestViMs = Math.max(longestViMs, viMs);
      if (viMs > 25) longVis++;
      recompiles += numberOfRecompiles;

      const elapsedMs = endedAt - windowStart;
      if (elapsedMs < reportIntervalMs) return;

      onReport({
        viPerSecond: viCount * 1000 / elapsedMs,
        averageViMs: totalViMs / viCount,
        longestViMs,
        longVis,
        recompiles,
      });
      reset();
    },
    reset,
  };
}