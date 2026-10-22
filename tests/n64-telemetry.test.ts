import { describe, expect, it, vi } from 'vitest';
import { createN64Telemetry, readN64RuntimeCounters, type N64RuntimeCounters } from '../src/n64/telemetry';

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
      telemetry.endStats(
        index === 2 ? 3 : 0,
        4, 2, 1, 3, 1, 6, 2,
        1, 2, 1.5, 0.5,
        10, 4, (index + 1) * 2,
        (index + 1) * 10, (index + 1) * 2, index + 1, 10 + index * 5,
      );
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
      trianglePrepareMs: 5,
      triangleUploadMs: 10,
      triangleSubmitMs: 7.5,
      triangleRestoreMs: 2.5,
      triangleOtherMs: 5,
      triangleDrawCalls: 50,
      rectDrawCalls: 20,
      audioUnderruns: 10,
      audioCallbackCount: 50,
      audioPartialUnderruns: 10,
      audioEmptyUnderruns: 5,
      audioMaxCallbackGapMs: 30,
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
      telemetry.endStats(
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, cumulativeUnderruns,
      );
    }

    expect(onReport.mock.calls[0][0].audioUnderruns).toBe(6);
  });

  it('tracks callback and partial-underrun deltas across audio device resets', () => {
    let time = 0;
    const onReport = vi.fn();
    const telemetry = createN64Telemetry({
      now: () => time,
      reportIntervalMs: 60,
      onReport,
    });

    for (const stats of [
      [8, 3, 1, 14],
      [16, 5, 2, 22],
      [2, 1, 0, 31],
    ]) {
      telemetry.beginStats();
      time += 20;
      telemetry.endStats(
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0,
        stats[0], stats[1], stats[2], stats[3],
      );
    }

    expect(onReport.mock.calls[0][0]).toMatchObject({
      audioCallbackCount: 18,
      audioPartialUnderruns: 6,
      audioEmptyUnderruns: 2,
      audioMaxCallbackGapMs: 31,
    });
  });

  it('measures real VI interrupts and SDL sync pauses separately from main-loop iterations', () => {
    let time = 0;
    let counters: N64RuntimeCounters | null = {
      viInterrupts: 100, viRefreshRate: 60, audioSyncPauses: 2, audioSyncPausedMs: 40,
    };
    const onReport = vi.fn();
    const telemetry = createN64Telemetry({
      now: () => time,
      reportIntervalMs: 1000,
      readCounters: () => counters,
      onReport,
    });

    // 25 swaps in one second while the core emulated 45 VIs (75% speed).
    for (let index = 0; index < 25; index++) {
      telemetry.beginStats();
      time += 40;
      if (index === 24) counters = { viInterrupts: 145, viRefreshRate: 60, audioSyncPauses: 5, audioSyncPausedMs: 190 };
      telemetry.endStats(0);
    }

    expect(onReport.mock.calls[0][0]).toMatchObject({
      viPerSecond: 25,
      emulatedViCount: 45,
      emulatedViPerSecond: 45,
      viRefreshRate: 60,
      emulationSpeed: 0.75,
      audioSyncPauses: 3,
      audioSyncPausedMs: 150,
    });
  });

  it('reports unknown counters as null for npm runtimes and runtime replacements', () => {
    let time = 0;
    let counters: N64RuntimeCounters | null = null;
    const onReport = vi.fn();
    const telemetry = createN64Telemetry({
      now: () => time,
      reportIntervalMs: 20,
      readCounters: () => counters,
      onReport,
    });
    const loop = () => {
      telemetry.beginStats();
      time += 20;
      telemetry.endStats(0);
    };

    loop();
    expect(onReport.mock.calls[0][0]).toMatchObject({ emulatedViPerSecond: null, emulationSpeed: null, audioSyncPauses: null });

    counters = { viInterrupts: 500, viRefreshRate: 60, audioSyncPauses: 9, audioSyncPausedMs: 900 };
    loop();
    expect(onReport.mock.calls[1][0].emulatedViCount).toBeNull();

    counters = { viInterrupts: 3, viRefreshRate: 60, audioSyncPauses: 0, audioSyncPausedMs: 0 };
    loop();
    expect(onReport.mock.calls[2][0].emulatedViCount).toBeNull();

    counters = { viInterrupts: 4, viRefreshRate: 60, audioSyncPauses: 0, audioSyncPausedMs: 0 };
    loop();
    expect(onReport.mock.calls[3][0].emulatedViCount).toBe(1);
  });

  it('re-samples the counter baseline after reset', () => {
    let time = 0;
    let counters: N64RuntimeCounters = { viInterrupts: 1000, viRefreshRate: 60, audioSyncPauses: 0, audioSyncPausedMs: 0 };
    const onReport = vi.fn();
    const telemetry = createN64Telemetry({
      now: () => time,
      reportIntervalMs: 1000,
      readCounters: () => counters,
      onReport,
    });

    telemetry.beginStats();
    telemetry.reset();
    counters = { ...counters, viInterrupts: 10 };
    telemetry.beginStats();
    time += 1000;
    counters = { ...counters, viInterrupts: 70 };
    telemetry.endStats(0);

    expect(onReport.mock.calls[0][0].emulatedViPerSecond).toBe(60);
  });
});

describe('N64 runtime counter parsing', () => {
  it('validates the published object and includes the pause still in progress', () => {
    expect(readN64RuntimeCounters(undefined, 0)).toBeNull();
    expect(readN64RuntimeCounters({ version: 2, viInterrupts: 1, viRefreshRate: 60, audioSyncPauses: 0, audioSyncPausedMs: 0 }, 0)).toBeNull();
    expect(readN64RuntimeCounters({ version: 1, viInterrupts: '1', viRefreshRate: 60, audioSyncPauses: 0, audioSyncPausedMs: 0 }, 0)).toBeNull();
    expect(readN64RuntimeCounters({
      version: 1, viInterrupts: 7, viRefreshRate: 50, audioSyncPauses: 2, audioSyncPausedMs: 30, audioSyncPausedSince: 100,
    }, 125)).toEqual({ viInterrupts: 7, viRefreshRate: 50, audioSyncPauses: 2, audioSyncPausedMs: 55 });
    expect(readN64RuntimeCounters({
      version: 1, viInterrupts: 7, viRefreshRate: 50, audioSyncPauses: 2, audioSyncPausedMs: 30, audioSyncPausedSince: null,
    }, 125)?.audioSyncPausedMs).toBe(30);
  });
});
