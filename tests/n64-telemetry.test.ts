import { describe, expect, it, vi } from 'vitest';
import { createN64Telemetry } from '../src/n64/telemetry';

describe('N64 runtime telemetry', () => {
  it('reports VI throughput, stalls, and recompilation bursts', () => {
    let time = 0;
    const onReport = vi.fn();
    const telemetry = createN64Telemetry({
      now: () => time,
      reportIntervalMs: 100,
      onReport,
    });

    for (let index = 0; index < 5; index++) {
      telemetry.beginStats();
      time += index === 4 ? 30 : 20;
      telemetry.endStats(index === 2 ? 3 : 0);
    }

    expect(onReport).toHaveBeenCalledOnce();
    expect(onReport.mock.calls[0][0]).toMatchObject({
      viPerSecond: 1000 / 22,
      averageViMs: 22,
      longestViMs: 30,
      longVis: 1,
      recompiles: 3,
    });
  });
});