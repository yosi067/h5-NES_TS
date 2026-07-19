import type { N64PerformanceProfile } from './performance';
import type { N64TelemetryReport } from './telemetry';

export type N64EmuMode = 1 | 2;
export type N64MobileTestVariant = 'baseline' | 'stream' | 'full';

export interface N64BenchmarkConfig {
  enabled: boolean;
  runtime: 'npm' | 'fork';
  emuMode: N64EmuMode;
  profile: N64PerformanceProfile;
  label: string;
  warmupMs: number;
  sampleMs: number;
  mobileTest: N64MobileTestVariant | null;
  nullVideo: boolean;
  suppressDrawCalls: boolean;
  persistentBuffers: boolean;
  persistentRectBuffers: boolean;
}

export interface N64BenchmarkSummary {
  label: string;
  viPerSecond: number;
  averageViMs: number;
  longestViMs: number;
  longVis: number;
  recompiles: number;
  elapsedMs: number;
  averageRspMs: number;
  averageDlistMs: number;
  averageRdpMs: number;
  averagePresentMs: number;
  averageAudioMs: number;
  averageTriangleDrawMs: number;
  averageRectDrawMs: number;
  averageTriangleDrawCalls: number;
  averageRectDrawCalls: number;
  audioUnderruns: number;
  averageCoreResidualMs: number;
}

export type N64BenchmarkEvent =
  | { type: 'warmup-complete' }
  | { type: 'complete'; summary: N64BenchmarkSummary };

export interface N64BenchmarkSession {
  record(report: N64TelemetryReport): N64BenchmarkEvent | null;
}

function parseBooleanOverride(value: string | null): boolean | null {
  if (value === '1') return true;
  if (value === '0') return false;
  return null;
}

export function resolveN64BenchmarkConfig(
  profile: N64PerformanceProfile,
  search = window.location.search,
): N64BenchmarkConfig {
  const params = new URLSearchParams(search);
  const mobileTestValue = params.get('n64MobileTest');
  const mobileTest: N64MobileTestVariant | null = mobileTestValue === 'baseline'
    || mobileTestValue === 'stream'
    || mobileTestValue === 'full'
    ? mobileTestValue
    : null;
  const enabled = mobileTest !== null || params.get('n64Benchmark') === '1';
  const runtimeOverride = params.get('n64Runtime');
  const runtime = mobileTest !== null || runtimeOverride === 'fork'
    ? 'fork'
    : 'npm';
  const normalMobileStream = !enabled
    && profile.name !== 'desktop'
    && runtime === 'fork';
  const defaultEmuMode: N64EmuMode = profile.name === 'ios-high-end' ? 1 : 2;
  if (!enabled) {
    return {
      enabled: false,
      runtime,
      emuMode: defaultEmuMode,
      profile,
      label: 'normal',
      warmupMs: 30_000,
      sampleMs: 60_000,
      mobileTest: null,
      nullVideo: false,
      suppressDrawCalls: false,
      persistentBuffers: normalMobileStream,
      persistentRectBuffers: false,
    };
  }

  const emuModeValue = params.get('n64EmuMode');
  const emuMode: N64EmuMode = emuModeValue === '1'
    ? 1
    : emuModeValue === '2' ? 2 : defaultEmuMode;
  const skipFrameOverride = parseBooleanOverride(params.get('n64SkipFrame'));
  const timingValue = params.get('n64Timing');
  const mainLoopTimingMode = timingValue === '0' || timingValue === '1'
    ? Number(timingValue)
    : profile.mainLoopTimingMode;
  const benchmarkProfile: N64PerformanceProfile = {
    ...profile,
    skipFrame: skipFrameOverride ?? profile.skipFrame,
    mainLoopTimingMode,
  };
  const nullVideo = mobileTest === null
    && params.get('n64NullVideo') === '1'
    && runtime === 'fork';
  const suppressDrawCalls = mobileTest === null
    && !nullVideo
    && params.get('n64SuppressDraw') === '1'
    && runtime === 'fork';
  const persistentBuffers = !nullVideo
    && !suppressDrawCalls
    && runtime === 'fork'
    && (mobileTest === 'stream' || mobileTest === 'full'
      || (mobileTest === null && params.get('n64PersistentBuffers') === '1'));
  const persistentRectBuffers = persistentBuffers
    && (mobileTest === 'full'
      || (mobileTest === null && params.get('n64PersistentRectBuffers') === '1'));
  const warmupMs = mobileTest === null ? 30_000 : 10_000;
  const sampleMs = mobileTest === null ? 60_000 : 20_000;
  const label = [
    ...(mobileTest === null ? [] : [`mobile-${mobileTest}`]),
    profile.name,
    `emu${emuMode}`,
    benchmarkProfile.skipFrame ? 'skip' : 'no-skip',
    benchmarkProfile.mainLoopTimingMode === 0 ? 'raf' : 'timer',
    nullVideo
      ? 'null-video'
      : suppressDrawCalls
        ? 'rice-no-draw'
        : persistentRectBuffers
          ? 'rice-persistent-full'
          : persistentBuffers ? 'rice-persistent-buffers' : 'rice',
  ].join('/');

  return {
    enabled: true,
    runtime,
    emuMode,
    profile: benchmarkProfile,
    label,
    warmupMs,
    sampleMs,
    mobileTest,
    nullVideo,
    suppressDrawCalls,
    persistentBuffers,
    persistentRectBuffers,
  };
}

export function createN64BenchmarkSession(
  label: string,
  warmupMs = 30_000,
  sampleMs = 60_000,
): N64BenchmarkSession {
  let warmupElapsedMs = 0;
  let sampleElapsedMs = 0;
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
  let triangleDrawCalls = 0;
  let rectDrawCalls = 0;
  let audioUnderruns = 0;
  let coreResidualMs = 0;
  let complete = false;

  return {
    record(report) {
      if (complete) return null;

      if (warmupElapsedMs < warmupMs) {
        warmupElapsedMs += report.elapsedMs;
        return warmupElapsedMs >= warmupMs ? { type: 'warmup-complete' } : null;
      }

      sampleElapsedMs += report.elapsedMs;
      viCount += report.viCount;
      totalViMs += report.averageViMs * report.viCount;
      longestViMs = Math.max(longestViMs, report.longestViMs);
      longVis += report.longVis;
      recompiles += report.recompiles;
      rspMs += report.rspMs;
      dlistMs += report.dlistMs;
      rdpMs += report.rdpMs;
      presentMs += report.presentMs;
      audioMs += report.audioMs;
      triangleDrawMs += report.triangleDrawMs;
      rectDrawMs += report.rectDrawMs;
      triangleDrawCalls += report.triangleDrawCalls;
      rectDrawCalls += report.rectDrawCalls;
      audioUnderruns += report.audioUnderruns;
      coreResidualMs += report.coreResidualMs;

      if (sampleElapsedMs < sampleMs) return null;
      complete = true;
      return {
        type: 'complete',
        summary: {
          label,
          viPerSecond: viCount * 1000 / sampleElapsedMs,
          averageViMs: viCount === 0 ? 0 : totalViMs / viCount,
          longestViMs,
          longVis,
          recompiles,
          elapsedMs: sampleElapsedMs,
          averageRspMs: viCount === 0 ? 0 : rspMs / viCount,
          averageDlistMs: viCount === 0 ? 0 : dlistMs / viCount,
          averageRdpMs: viCount === 0 ? 0 : rdpMs / viCount,
          averagePresentMs: viCount === 0 ? 0 : presentMs / viCount,
          averageAudioMs: viCount === 0 ? 0 : audioMs / viCount,
          averageTriangleDrawMs: viCount === 0 ? 0 : triangleDrawMs / viCount,
          averageRectDrawMs: viCount === 0 ? 0 : rectDrawMs / viCount,
          averageTriangleDrawCalls: viCount === 0 ? 0 : triangleDrawCalls / viCount,
          averageRectDrawCalls: viCount === 0 ? 0 : rectDrawCalls / viCount,
          audioUnderruns,
          averageCoreResidualMs: viCount === 0 ? 0 : coreResidualMs / viCount,
        },
      };
    },
  };
}