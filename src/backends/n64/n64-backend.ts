/**
 * N64（Mupen64Plus Web）後端：啟動、停止、效能遙測與診斷。
 */
import { showN64AudioDiagnostics } from '../../n64/audio-diagnostics-panel';
import { audioOutputDiagnosticsEnabled, createAudioOutputDiagnostics, type N64AudioOutputBridge } from '../../n64/audio-output-diagnostics';
import { createN64BenchmarkSession, type N64BenchmarkSession, resolveN64BenchmarkConfig } from '../../n64/benchmark';
import { type GlCallCounter, type GlCallCounts, glCallStatsEnabled, type GlCallSummary, installGlCallCounter, summarizeGlCalls } from '../../n64/gl-call-stats';
import { applyN64PerformanceProfile, type N64PerformanceProfile, selectN64PerformanceProfile } from '../../n64/performance';
import { readRectDiagnostics } from '../../n64/rect-diagnostics';
import { getN64RuntimeAssetUrl, getN64RuntimeImportUrl, N64_REBUILT_ASSET_VERSION, shouldRetryN64WithNpm } from '../../n64/runtime-assets';
import { createN64Telemetry } from '../../n64/telemetry';
import { hasN64RomMagic } from '../../rom-assets';
import { type EmulatorControls } from 'mupen64plus-web';
import { runtime } from '../../app/runtime';
import { configureN64AudioWorklet, resumeAudio } from '../../audio/audio-output';
import { stopSnes9xBackend } from '../emulatorjs-backend';
import { stopFbNeoBackend } from '../fbneo/fbneo-backend';
import { stopEmulation } from '../lifecycle';
import { activateN64Canvas, drawN64GraphicsError, getN64GraphicsCapability, lockN64RenderSize, restoreWasmCanvas, settleN64CanvasLayout } from './n64-canvas';
import { resetWasmCore } from '../native/native-core';
import { releaseAllN64Inputs } from '../../input/n64-keys';
import { hideRomSelector, showRomSelector } from '../../session/game-loader';
import { onGameStarted } from '../../session/game-session';
import { updateControllerLayout } from '../../ui/controller-layout';
import { showAppAlert, showToast } from '../../ui/dialogs';

type N64EmulatorControls = EmulatorControls & {
  resumeAudio?: () => Promise<void>;
  configureAudioWorklet?: (workletUrl: string) => Promise<boolean>;
  getAudioOutputDiagnostics?: () => N64AudioOutputBridge;
};

export let n64Controls: N64EmulatorControls | null = null;

let n64PerformanceProfile: N64PerformanceProfile = selectN64PerformanceProfile();

let n64BenchmarkSession: N64BenchmarkSession | null = null;

let removeN64BenchmarkDiagnostics: (() => void) | null = null;

let n64GlCallCounter: GlCallCounter | null = null;

let n64GlCallBaseline: GlCallCounts = {};

let n64LatestGlCalls: GlCallSummary | null = null;


function describeN64Failure(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) {
    return { message: reason.message, stack: reason.stack };
  }
  if (typeof reason === 'string') return { message: reason };
  try {
    return { message: JSON.stringify(reason) };
  } catch {
    return { message: String(reason) };
  }
}


function postN64Diagnostic(type: string, reason: unknown, label: string): void {
  const diagnostic = {
    event: 'diagnostic',
    type,
    ...describeN64Failure(reason),
    label,
    rom: runtime.currentRomFilename,
    profile: n64PerformanceProfile.name,
    userAgent: navigator.userAgent,
    recordedAt: new Date().toISOString(),
  };
  console.error(`[N64 diagnostic] ${type}:`, reason);
  void fetch(`${import.meta.env.BASE_URL}__n64-benchmark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(diagnostic),
    keepalive: true,
  }).catch(error => console.warn('[N64 diagnostic] upload failed:', error));
}


function installN64BenchmarkDiagnostics(canvas: HTMLCanvasElement, label: string): () => void {
  const onError = (event: ErrorEvent) => {
    postN64Diagnostic('window-error', event.error ?? event.message, label);
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    postN64Diagnostic('unhandled-rejection', event.reason, label);
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    postN64Diagnostic('webgl-context-lost', 'WebGL context lost', label);
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  canvas.addEventListener('webglcontextlost', onContextLost);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    canvas.removeEventListener('webglcontextlost', onContextLost);
  };
}


export let n64AudioOutputDiagnostics = createAudioOutputDiagnostics(audioOutputDiagnosticsEnabled(window.location.search));

let n64Telemetry = createN64Telemetry({
  onReport: report => {
    if (n64GlCallCounter) {
      const glCalls = n64GlCallCounter.snapshot();
      n64LatestGlCalls = summarizeGlCalls(n64GlCallBaseline, glCalls, report.viCount);
      n64GlCallBaseline = glCalls;
      console.info(
        `[N64 GL calls] ${n64LatestGlCalls.callsPerLoop.toFixed(1)} calls/loop, ` +
        `sync-like ${n64LatestGlCalls.syncLikeCallsPerLoop.toFixed(1)}/loop; top: ` +
        n64LatestGlCalls.top
          .map(entry => `${entry.name}${entry.syncLike ? '*' : ''} ${entry.perLoop.toFixed(1)}`)
          .join(', '),
      );
    }
    if (audioOutputDiagnosticsEnabled(window.location.search)) {
      // SDL may replace the context/producer without any user gesture. Reattach
      // at the existing telemetry cadence; never retain a retired port's counters.
      n64AudioOutputDiagnostics.attach(n64Controls?.getAudioOutputDiagnostics?.());
      const audioOutput = n64AudioOutputDiagnostics.snapshot();
      const deviceReport = {
        recordedAt: new Date().toISOString(), userAgent: navigator.userAgent,
        secureContext: window.isSecureContext, rom: runtime.currentRomFilename,
        config: resolveN64BenchmarkConfig(n64PerformanceProfile),
        rebuiltAssetVersion: N64_REBUILT_ASSET_VERSION,
        runtimeCullStateCache: globalThis.__n64CullStateCacheEnabled ?? null,
        audioOutput, sourceAndRenderer: report,
        rectanglePhases: readRectDiagnostics(window.location.search, globalThis.__n64RectPhases),
        glCalls: n64LatestGlCalls,
      };
      showN64AudioDiagnostics(audioOutput, deviceReport);
      // Same local export surface as benchmark results; available without a benchmark.
      try {
        localStorage.setItem('n64AudioOutputDiagnostics', JSON.stringify(deviceReport));
      } catch { /* Storage can be unavailable in private browsing. */ }
      console.info('[N64 audio output]', audioOutput);
    }
    // viPerSecond counts main-loop iterations (one per Rice swap), so only the
    // runtime's VI interrupt counter can tell whether emulation is at full speed.
    const speed = report.emulationSpeed === null
      ? 'emulated VI/s unavailable'
      : `emulated ${report.emulatedViPerSecond?.toFixed(1)} VI/s, ${(report.emulationSpeed * 100).toFixed(1)}% speed`;
    const syncPauses = report.audioSyncPauses === null
      ? 'n/a'
      : `${report.audioSyncPauses} (${report.audioSyncPausedMs?.toFixed(0)} ms)`;
    console.info(
      `[N64 perf] ${report.viPerSecond.toFixed(1)} loops/s (${speed}), audio sync pauses ${syncPauses}, ` +
      `VI avg/max ${report.averageViMs.toFixed(1)}/${report.longestViMs.toFixed(1)} ms, ` +
      `long VI ${report.longVis}, recompiles ${report.recompiles}, ` +
      `avg core/RSP/present/audio ${(report.coreResidualMs / report.viCount).toFixed(1)}/` +
      `${(report.rspMs / report.viCount).toFixed(1)}/` +
      `${(report.presentMs / report.viCount).toFixed(1)}/` +
      `${(report.audioMs / report.viCount).toFixed(1)} ms, ` +
      `RSP detail DList/RDP ${(report.dlistMs / report.viCount).toFixed(1)}/` +
      `${(report.rdpMs / report.viCount).toFixed(1)} ms, ` +
      `draw tri/rect ${(report.triangleDrawMs / report.viCount).toFixed(1)}/` +
      `${(report.rectDrawMs / report.viCount).toFixed(1)} ms, calls/VI ` +
      `${(report.triangleDrawCalls / report.viCount).toFixed(1)}/` +
      `${(report.rectDrawCalls / report.viCount).toFixed(1)}, ` +
      `tri prepare/upload/submit/restore/other ` +
      `${(report.trianglePrepareMs / report.viCount).toFixed(2)}/` +
      `${(report.triangleUploadMs / report.viCount).toFixed(2)}/` +
      `${(report.triangleSubmitMs / report.viCount).toFixed(2)}/` +
      `${(report.triangleRestoreMs / report.viCount).toFixed(2)}/` +
      `${(report.triangleOtherMs / report.viCount).toFixed(2)} ms, ` +
      `audio underruns ${report.audioUnderruns}`,
      `audio callbacks ${report.audioCallbackCount}, ` +
      `partial/empty ${report.audioPartialUnderruns}/${report.audioEmptyUnderruns}, ` +
      `max callback gap ${report.audioMaxCallbackGapMs.toFixed(1)} ms`,
    );

    const benchmarkEvent = n64BenchmarkSession?.record(report);
    if (benchmarkEvent?.type === 'warmup-complete') {
      console.info('[N64 benchmark] warmup complete; collecting steady-state data');
    } else if (benchmarkEvent?.type === 'complete') {
      const summary = benchmarkEvent.summary;
      const result = {
        ...summary,
        rom: runtime.currentRomFilename,
        profile: n64PerformanceProfile.name,
        userAgent: navigator.userAgent,
        recordedAt: new Date().toISOString(),
        audioOutput: n64AudioOutputDiagnostics.snapshot(),
        config: resolveN64BenchmarkConfig(n64PerformanceProfile),
        rebuiltAssetVersion: N64_REBUILT_ASSET_VERSION,
        runtimeCullStateCache: globalThis.__n64CullStateCacheEnabled ?? null,
        glCalls: n64LatestGlCalls,
      };
      const emulatedSpeed = summary.emulationSpeed === null
        ? 'N/A'
        : `${summary.emulatedViPerSecond?.toFixed(1)} VI/s (${(summary.emulationSpeed * 100).toFixed(1)}%)`;
      const audioSyncPauses = summary.audioSyncPauses === null
        ? 'N/A'
        : `${summary.audioSyncPauses} (${summary.audioSyncPausedMs?.toFixed(0)} ms)`;
      console.info(
        `[N64 benchmark result] ${summary.label}: ${summary.viPerSecond.toFixed(1)} loops/s, ` +
        `emulated ${emulatedSpeed}, audio sync pauses ${audioSyncPauses}, ` +
        `VI avg/max ${summary.averageViMs.toFixed(1)}/${summary.longestViMs.toFixed(1)} ms, ` +
        `long VI ${summary.longVis}, recompiles ${summary.recompiles}, ` +
        `avg core/RSP/present/audio ${summary.averageCoreResidualMs.toFixed(1)}/` +
        `${summary.averageRspMs.toFixed(1)}/${summary.averagePresentMs.toFixed(1)}/` +
        `${summary.averageAudioMs.toFixed(1)} ms, ` +
        `RSP detail DList/RDP ${summary.averageDlistMs.toFixed(1)}/` +
        `${summary.averageRdpMs.toFixed(1)} ms, ` +
        `draw tri/rect ${summary.averageTriangleDrawMs.toFixed(1)}/` +
        `${summary.averageRectDrawMs.toFixed(1)} ms, calls/VI ` +
        `${summary.averageTriangleDrawCalls.toFixed(1)}/` +
        `${summary.averageRectDrawCalls.toFixed(1)}, ` +
        `tri prepare/upload/submit/restore/other ` +
        `${summary.averageTrianglePrepareMs.toFixed(2)}/` +
        `${summary.averageTriangleUploadMs.toFixed(2)}/` +
        `${summary.averageTriangleSubmitMs.toFixed(2)}/` +
        `${summary.averageTriangleRestoreMs.toFixed(2)}/` +
        `${summary.averageTriangleOtherMs.toFixed(2)} ms, ` +
        `audio underruns ${summary.audioUnderruns}, ` +
        `sample ${(summary.elapsedMs / 1000).toFixed(1)} s`,
      );
      localStorage.setItem('n64BenchmarkResult', JSON.stringify(result));
      const mobileTest = new URLSearchParams(window.location.search).get('n64MobileTest');
      if (mobileTest === 'baseline' || mobileTest === 'stream' || mobileTest === 'full') {
        localStorage.setItem(`n64MobileTestResult:${mobileTest}`, JSON.stringify(result));
      }
      void fetch(`${import.meta.env.BASE_URL}__n64-benchmark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      }).catch(error => console.warn('[N64 benchmark] result upload failed:', error));
      void showAppAlert(
        `${mobileTest ? 'N64 手機簡易測試' : 'N64 Benchmark'}完成\n\n${summary.label}\n` +
        `${summary.viPerSecond.toFixed(1)} loops/s\n` +
        `Emulated: ${emulatedSpeed}\n` +
        `VI avg/max: ${summary.averageViMs.toFixed(1)}/${summary.longestViMs.toFixed(1)} ms\n` +
        `Triangle/Rect: ${summary.averageTriangleDrawMs.toFixed(1)}/${summary.averageRectDrawMs.toFixed(1)} ms\n` +
        `SDL audio underruns: ${summary.audioUnderruns}\n` +
        `SDL sync pauses: ${audioSyncPauses}\n` +
        `Output diagnostics: ${result.audioOutput.status}\n` +
        `Output gap total/max (since attach): ${result.audioOutput.underflowMs ?? 'N/A'}/${result.audioOutput.longestGapMs ?? 'N/A'} ms\n` +
        `Long VI: ${summary.longVis}\nRecompiles: ${summary.recompiles}`,
        'N64 測試結果',
      );
    }
  },
});


export async function startN64Game(romData: ArrayBuffer, forceNpmRuntime = false): Promise<void> {
  globalThis.__n64RectPhases = undefined; // Never export a previous runtime's rectangle capture.
  globalThis.__n64CullStateCacheEnabled = undefined;
  if (!hasN64RomMagic(romData)) {
    throw new Error(`無效的 N64 ROM 資料: ${runtime.currentRomFilename}`);
  }

  if (!runtime.canvas) return;

  stopEmulation();
  await stopN64Backend();
  await stopSnes9xBackend();
  stopFbNeoBackend();
  resetWasmCore();
  let startupDiagnosticLabel: string | null = null;

  const graphicsCapability = getN64GraphicsCapability();
  if (!graphicsCapability.supported) {
    hideRomSelector();
    runtime.powerLed?.classList.remove('on');
    runtime.isRunning = false;
    runtime.currentN64RomData = null;
    drawN64GraphicsError(graphicsCapability.message);
    showToast('N64 圖形初始化失敗');
    console.warn(`[N64] ${graphicsCapability.message}`);
    return;
  }

  console.log(`[N64] WebGL2 renderer: ${graphicsCapability.renderer ?? 'unknown'}`);

  try {
    runtime.activeBackend = 'mupen64';
    n64AudioOutputDiagnostics.dispose();
    n64AudioOutputDiagnostics = createAudioOutputDiagnostics(audioOutputDiagnosticsEnabled(window.location.search));
    runtime.currentN64RomData = romData;
    const benchmarkConfig = resolveN64BenchmarkConfig(selectN64PerformanceProfile());
    const useRebuiltRuntime = benchmarkConfig.runtime === 'fork' && !forceNpmRuntime;
    if (benchmarkConfig.enabled) {
      benchmarkConfig.label += useRebuiltRuntime ? '/fork' : '/npm';
      startupDiagnosticLabel = benchmarkConfig.label;
    }
    n64PerformanceProfile = benchmarkConfig.profile;
    n64BenchmarkSession = benchmarkConfig.enabled
      ? createN64BenchmarkSession(
        benchmarkConfig.label,
        benchmarkConfig.warmupMs,
        benchmarkConfig.sampleMs,
      )
      : null;
    console.log(
      `[N64] performance profile: ${n64PerformanceProfile.name} ` +
      `(${n64PerformanceProfile.width}x${n64PerformanceProfile.height}, ` +
      `frame skip: ${n64PerformanceProfile.skipFrame ? 'on' : 'off'})`,
    );
    if (benchmarkConfig.enabled) {
      console.info(
        `[N64 benchmark] ${benchmarkConfig.label}; ` +
        `${benchmarkConfig.warmupMs / 1000} seconds warmup + ` +
        `${benchmarkConfig.sampleMs / 1000} seconds sample`,
      );
      if (benchmarkConfig.mobileTest !== null) {
        const mobileTestLabel = benchmarkConfig.mobileTest === 'baseline'
          ? '基準版'
          : benchmarkConfig.mobileTest === 'stream' ? 'Triangle 串流版' : '完整串流版';
        showToast(
          `N64 手機測試：${mobileTestLabel}`,
        );
      }
    }

    // Mupen64Plus-web 內部 SDL/Emscripten 程式碼會尋找 id="canvas"。
    // 原本的 #screen 已建立 2D context，瀏覽器不允許同一張 canvas 再切成 WebGL，
    // 因此 N64 模式必須替換成全新的 WebGL canvas，否則會在 EGL 層得到 BAD_MATCH。
    const n64Canvas = activateN64Canvas(n64PerformanceProfile);
    if (glCallStatsEnabled(window.location.search) && typeof WebGL2RenderingContext !== 'undefined') {
      // Diagnostic only: wraps the shared prototype until stopN64Backend uninstalls it.
      n64GlCallCounter = installGlCallCounter(WebGL2RenderingContext.prototype);
      n64GlCallBaseline = n64GlCallCounter.snapshot();
    }
    if (benchmarkConfig.enabled) {
      removeN64BenchmarkDiagnostics = installN64BenchmarkDiagnostics(
        n64Canvas,
        benchmarkConfig.label,
      );
    }

    hideRomSelector();
    updateControllerLayout();
    await settleN64CanvasLayout(n64Canvas);
    runtime.powerLed?.classList.add('on');
    runtime.isRunning = true;

    const baseUrl = import.meta.env.BASE_URL;
    await ensureMupen64Config(baseUrl, n64PerformanceProfile);
    const runtimeModule: typeof import('mupen64plus-web') = useRebuiltRuntime
      ? await import(/* @vite-ignore */ getN64RuntimeImportUrl(document.baseURI, baseUrl))
      : await import('mupen64plus-web');
    const createMupen64PlusWeb = runtimeModule.default;
    console.info(`[N64] runtime: ${useRebuiltRuntime ? 'rebuilt fork' : 'npm 1.5.7'}`);
    let n64CanvasReady = false;
    const finalizeN64Canvas = () => {
      if (n64CanvasReady) return;
      n64CanvasReady = true;
      lockN64RenderSize(n64Canvas, n64PerformanceProfile);
      document.body.classList.remove('n64-initializing');
      resumeAudio();
    };
    n64Controls = await createMupen64PlusWeb({
      canvas: n64Canvas,
      romData,
      beginStats: () => {
        finalizeN64Canvas();
        n64Telemetry.beginStats();
      },
      endStats: (
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
      ) => n64Telemetry.endStats(
        numberOfRecompiles,
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
        triangleDrawCalls,
        rectDrawCalls,
        audioUnderruns,
        audioCallbackCount,
        audioPartialUnderruns,
        audioEmptyUnderruns,
        audioMaxCallbackGapMs,
      ),
      // null-video只供fork benchmark判斷renderer理論上限；正常遊玩固定使用Rice。
      arguments: [
        '--gfx',
        benchmarkConfig.nullVideo
          ? 'dummy'
          : '/plugins/mupen64plus-video-rice-web-netplay-web.so',
      ],
      romConfigOptionOverrides: {
        videoRice: {
          SuppressDrawCalls: benchmarkConfig.suppressDrawCalls ? 1 : 0,
          PersistentBuffers: benchmarkConfig.persistentBuffers ? 1 : 0,
          PersistentRectBuffers: benchmarkConfig.persistentRectBuffers ? 1 : 0,
          SuppressGlFinish: benchmarkConfig.suppressGlFinish ? 1 : 0,
        },
      },
      coreConfig: {
        // iOS 預設使用量測較穩定的 cached interpreter；benchmark 可明確切換 1/2 做 A/B。
        emuMode: benchmarkConfig.emuMode,
        // 高更新率手機若綁定 requestAnimationFrame，可能每秒執行 90/120 次 VI。
        // 1ms timer 讓模擬器依 N64 自身節流，不跟著螢幕更新率增加 CPU 負載。
        mainLoopTimingMode: n64PerformanceProfile.mainLoopTimingMode,
      },
      netplayConfig: { player: 0 },
      locateFile: (path: string, prefix: string) => {
        if (path.endsWith('.wasm') || path.endsWith('.data')) {
          return getN64RuntimeAssetUrl(baseUrl, path, useRebuiltRuntime);
        }
        return prefix + path;
      },
      setErrorStatus: (message: string) => {
        console.error('[N64/Mupen64Plus]', message);
        if (benchmarkConfig.enabled) {
          postN64Diagnostic('mupen-error-status', message, benchmarkConfig.label);
        }
      },
    });

    configureN64AudioWorklet();
    console.log(`[N64] Mupen64Plus-web backend ready for ${runtime.currentRomFilename}`);
    resumeAudio();
    await settleN64CanvasLayout(n64Canvas);
    lockN64RenderSize(n64Canvas, n64PerformanceProfile);
    void n64Controls.start().catch((error) => {
      console.error('[N64] Mupen64Plus start failed:', error);
      if (benchmarkConfig.enabled) {
        postN64Diagnostic('mupen-start-failure', error, benchmarkConfig.label);
      }
      showToast('N64 啟動失敗');
    });
    onGameStarted();
  } catch (error) {
    console.error('[N64] Mupen64Plus backend failed:', error);
    if (startupDiagnosticLabel) {
      postN64Diagnostic('backend-startup-failure', error, startupDiagnosticLabel);
    }
    await stopN64Backend();
    if (shouldRetryN64WithNpm(navigator.userAgent, forceNpmRuntime)) {
      console.warn('[N64] rebuilt Android runtime failed; retrying npm 1.5.7 runtime');
      showToast('N64 相容模式重試中');
      await startN64Game(romData, true);
      return;
    }
    await showRomSelector();
    await showAppAlert('N64 模擬器啟動失敗，請查看主控台錯誤');
  }
}


async function ensureMupen64Config(
  baseUrl: string,
  profile: N64PerformanceProfile,
): Promise<void> {
  const response = await fetch(`${baseUrl}n64-mupen/mupen64plus.cfg`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`無法載入 N64 設定檔: ${response.status}`);
  }

  const configText = applyN64PerformanceProfile(await response.text(), profile);
  if (!configText.includes('mupen64plus-video-rice-web-netplay-web.so')) {
    throw new Error('N64 設定檔沒有指定 Rice video plugin');
  }

  await putMupenIdbFile('/mupen64plus/data/mupen64plus.cfg', new TextEncoder().encode(configText));
}


function putMupenIdbFile(fileKey: string, contents: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('/mupen64plus');

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('FILE_DATA')) {
        const store = db.createObjectStore('FILE_DATA');
        store.createIndex('timestamp', 'timestamp', { unique: false, multiEntry: false });
        store.put({ timestamp: new Date(), mode: 16832 }, '/mupen64plus/saves');
        store.put({ timestamp: new Date(), mode: 16832 }, '/mupen64plus/data');
      }
    };

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('FILE_DATA', 'readwrite');
      const store = transaction.objectStore('FILE_DATA');

      store.put({ timestamp: new Date(), mode: 16832 }, '/mupen64plus/saves');
      store.put({ timestamp: new Date(), mode: 16832 }, '/mupen64plus/data');
      store.put({ contents, timestamp: new Date(), mode: 33206 }, fileKey);

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    };
  });
}


export async function stopN64Backend(): Promise<void> {
  releaseAllN64Inputs();
  document.getElementById('n64-audio-diagnostics')?.remove();
  n64Telemetry.reset();
  n64AudioOutputDiagnostics.dispose();
  n64BenchmarkSession = null;
  removeN64BenchmarkDiagnostics?.();
  removeN64BenchmarkDiagnostics = null;
  if (n64Controls) {
    try {
      await n64Controls.forceDumpSaveFiles?.();
    } catch (error) {
      console.warn('[N64] 儲存 Mupen64Plus 存檔時發生問題:', error);
    }

    try {
      n64Controls.stop();
    } catch (error) {
      console.warn('[N64] 停止 Mupen64Plus 時發生問題:', error);
    }
    n64Controls = null;
  }
  globalThis.__n64WebCounters = undefined;
  n64GlCallCounter?.uninstall();
  n64GlCallCounter = null;
  n64GlCallBaseline = {};
  n64LatestGlCalls = null;
  runtime.currentN64RomData = null;

  restoreWasmCanvas();
  if (runtime.activeBackend === 'mupen64') {
    runtime.activeBackend = 'wasm';
  }
}
