import { describe, expect, it } from 'vitest';
import {
  createN64BenchmarkSession,
  resolveN64BenchmarkConfig,
} from '../src/n64/benchmark';
import type { N64PerformanceProfile } from '../src/n64/performance';
import type { N64TelemetryReport } from '../src/n64/telemetry';

const PROFILE: N64PerformanceProfile = {
  name: 'ios-high-end',
  width: 320,
  height: 240,
  skipFrame: true,
  mainLoopTimingMode: 0,
  primaryAudioTarget: 3072,
  secondaryAudioBuffer: 1024,
};

const DESKTOP_PROFILE: N64PerformanceProfile = {
  ...PROFILE,
  name: 'desktop',
  width: 640,
  height: 480,
  primaryAudioTarget: 2048,
};

function report(overrides: Partial<N64TelemetryReport> = {}): N64TelemetryReport {
  return {
    viPerSecond: 50,
    averageViMs: 20,
    longestViMs: 24,
    longVis: 0,
    recompiles: 0,
    elapsedMs: 1000,
    viCount: 50,
    rspMs: 100,
    dlistMs: 40,
    rdpMs: 10,
    presentMs: 50,
    audioMs: 20,
    triangleDrawMs: 60,
    rectDrawMs: 30,
    triangleDrawCalls: 500,
    rectDrawCalls: 200,
    audioUnderruns: 2,
    coreResidualMs: 830,
    ...overrides,
  };
}

describe('N64 benchmark controls', () => {
  it('keeps normal mobile gameplay on the stable npm runtime', () => {
    const config = resolveN64BenchmarkConfig(PROFILE, '');

    expect(config).toEqual({
      enabled: false,
      runtime: 'npm',
      emuMode: 1,
      profile: PROFILE,
      label: 'normal',
      warmupMs: 30_000,
      sampleMs: 60_000,
      mobileTest: null,
      nullVideo: false,
      suppressDrawCalls: false,
      persistentBuffers: false,
      persistentRectBuffers: false,
    });
  });

  it('keeps desktop on npm and supports an explicit mobile rollback', () => {
    const desktop = resolveN64BenchmarkConfig(DESKTOP_PROFILE, '');
    const mobileRollback = resolveN64BenchmarkConfig(PROFILE, '?n64Runtime=npm');

    expect(desktop).toMatchObject({
      enabled: false,
      runtime: 'npm',
      persistentBuffers: false,
      persistentRectBuffers: false,
    });
    expect(mobileRollback).toMatchObject({
      enabled: false,
      runtime: 'npm',
      persistentBuffers: false,
      persistentRectBuffers: false,
    });
  });

  it('applies explicit benchmark overrides', () => {
    const config = resolveN64BenchmarkConfig(
      PROFILE,
      '?n64Benchmark=1&n64EmuMode=1&n64SkipFrame=0&n64Timing=1',
    );

    expect(config.enabled).toBe(true);
    expect(config.emuMode).toBe(1);
    expect(config.profile.skipFrame).toBe(false);
    expect(config.profile.mainLoopTimingMode).toBe(1);
    expect(config.label).toBe('ios-high-end/emu1/no-skip/timer/rice');
    expect(config.nullVideo).toBe(false);
    expect(config.suppressDrawCalls).toBe(false);
    expect(config.persistentBuffers).toBe(false);
  });

  it('creates short rebuilt-fork mobile renderer presets with isolated flags', () => {
    const baseline = resolveN64BenchmarkConfig(
      PROFILE,
      '?n64MobileTest=baseline&n64PersistentBuffers=1&n64Runtime=npm',
    );
    const stream = resolveN64BenchmarkConfig(PROFILE, '?n64MobileTest=stream');
    const full = resolveN64BenchmarkConfig(PROFILE, '?n64MobileTest=full');

    expect(baseline).toMatchObject({
      enabled: true,
      runtime: 'fork',
      mobileTest: 'baseline',
      warmupMs: 10_000,
      sampleMs: 20_000,
      persistentBuffers: false,
      persistentRectBuffers: false,
    });
    expect(baseline.label).toContain('mobile-baseline');
    expect(stream).toMatchObject({
      enabled: true,
      runtime: 'fork',
      mobileTest: 'stream',
      warmupMs: 10_000,
      sampleMs: 20_000,
      persistentBuffers: true,
      persistentRectBuffers: false,
    });
    expect(stream.label).toContain('mobile-stream');
    expect(full).toMatchObject({
      enabled: true,
      runtime: 'fork',
      mobileTest: 'full',
      warmupMs: 10_000,
      sampleMs: 20_000,
      persistentBuffers: true,
      persistentRectBuffers: true,
    });
    expect(full.label).toContain('mobile-full');
    expect(full.label).toContain('rice-persistent-full');
  });

  it('enables null video only for rebuilt-fork benchmarks', () => {
    const forkConfig = resolveN64BenchmarkConfig(
      PROFILE,
      '?n64Benchmark=1&n64Runtime=fork&n64NullVideo=1',
    );
    const npmConfig = resolveN64BenchmarkConfig(
      PROFILE,
      '?n64Benchmark=1&n64Runtime=npm&n64NullVideo=1',
    );

    expect(forkConfig.nullVideo).toBe(true);
    expect(forkConfig.label).toContain('/null-video');
    expect(npmConfig.nullVideo).toBe(false);
    expect(npmConfig.label).toContain('/rice');
  });

  it('enables Rice no-draw only for rebuilt-fork benchmarks', () => {
    const config = resolveN64BenchmarkConfig(
      PROFILE,
      '?n64Benchmark=1&n64Runtime=fork&n64SuppressDraw=1',
    );

    expect(config.nullVideo).toBe(false);
    expect(config.suppressDrawCalls).toBe(true);
    expect(config.label).toContain('/rice-no-draw');
  });

  it('enables persistent buffers only for rebuilt-fork Rice benchmarks', () => {
    const forkConfig = resolveN64BenchmarkConfig(
      PROFILE,
      '?n64Benchmark=1&n64Runtime=fork&n64PersistentBuffers=1',
    );
    const npmConfig = resolveN64BenchmarkConfig(
      PROFILE,
      '?n64Benchmark=1&n64Runtime=npm&n64PersistentBuffers=1',
    );

    expect(forkConfig.persistentBuffers).toBe(true);
    expect(forkConfig.label).toContain('/rice-persistent-buffers');
    expect(npmConfig.persistentBuffers).toBe(false);
    expect(npmConfig.persistentRectBuffers).toBe(false);
  });

  it('excludes warmup windows and returns a weighted steady-state summary', () => {
    const session = createN64BenchmarkSession('test', 2000, 2000);

    expect(session.record(report({ recompiles: 4 }))).toBeNull();
    expect(session.record(report({ recompiles: 3 }))).toEqual({ type: 'warmup-complete' });
    expect(session.record(report({ averageViMs: 20, viCount: 50 }))).toBeNull();

    const event = session.record(report({
      averageViMs: 25,
      longestViMs: 40,
      longVis: 2,
      recompiles: 1,
      viCount: 40,
    }));

    expect(event?.type).toBe('complete');
    if (event?.type !== 'complete') return;
    expect(event.summary.viPerSecond).toBe(45);
    expect(event.summary.averageViMs).toBeCloseTo(22.22, 2);
    expect(event.summary.longestViMs).toBe(40);
    expect(event.summary.longVis).toBe(2);
    expect(event.summary.recompiles).toBe(1);
    expect(event.summary.averageRspMs).toBeCloseTo(2.22, 2);
    expect(event.summary.averageDlistMs).toBeCloseTo(0.89, 2);
    expect(event.summary.averageTriangleDrawMs).toBeCloseTo(1.33, 2);
    expect(event.summary.averageRectDrawMs).toBeCloseTo(0.67, 2);
    expect(event.summary.averageTriangleDrawCalls).toBeCloseTo(11.11, 2);
    expect(event.summary.averageRectDrawCalls).toBeCloseTo(4.44, 2);
    expect(event.summary.audioUnderruns).toBe(4);
    expect(event.summary.averageCoreResidualMs).toBeCloseTo(18.44, 2);
  });
});