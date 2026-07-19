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
      telemetry.endStats(index === 2 ? 3 : 0, 4, 2, 1, 3, 1, 6, 2, 10, 4, (index + 1) * 2);
    }

    expect(onReport).toHaveBeenCalledOnce();
    expect(onReport.mock.calls[0][0]).toMatchObject({
      viPerSecond: 1000 / 22,
      averageViMs: 22,
      longestViMs: 30,
      longVis: 1,
      recompiles: 3,
      rspMs: 20,
      dlistMs: 10,
      rdpMs: 5,
      presentMs: 15,
      audioMs: 5,
      triangleDrawMs: 30,
      rectDrawMs: 10,
      triangleDrawCalls: 50,
      rectDrawCalls: 20,
      audioUnderruns: 10,
      coreResidualMs: 70,
    });
  });

  it('handles an audio device reset without losing subsequent underruns', () => {
    let time = 0;
    const onReport = vi.fn();
    const telemetry = createN64Telemetry({
      now: () => time,
      reportIntervalMs: 60,
      onReport,
    });

    for (const cumulativeUnderruns of [3, 5, 1]) {
      telemetry.beginStats();
      time += 20;
      telemetry.endStats(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, cumulativeUnderruns);
    }

    expect(onReport.mock.calls[0][0].audioUnderruns).toBe(6);
  });
});