export interface N64AudioOutputBridge {
  port: MessagePort | null;
  sampleRate: number | null;
  mode: 'audio-worklet' | 'script-processor';
  contextState?: string;
  contextId?: number | null;
  scriptProcessorId?: number | null;
  generation?: number;
  routeState?: string;
  acknowledged?: boolean;
  heartbeatAgeMs?: number | null;
  lastError?: string | null;
  failures?: number;
}

export interface N64AudioOutputReport {
  type: 'n64-audio-output';
  version: 1;
  mode: 'audio-worklet';
  sampleRate: number;
  sequence: number;
  renderedFrames: number;
  steadyFrames: number;
  excludedFrames: number;
  primingFrames: number;
  pausedFrames: number;
  mutedFrames: number;
  clearEvents: number;
  underflowFrames: number;
  underflowEvents: number;
  longestGapFrames: number;
  droppedFrames: number;
  dropEvents: number;
  queueMinFrames: number | null;
  queueMaxFrames: number | null;
}

/** Independent of benchmark selection: never changes the normal mobile renderer. */
export function audioOutputDiagnosticsEnabled(search: string): boolean {
  return new URLSearchParams(search).get('n64AudioDiagnostics') === '1';
}

export function createAudioOutputDiagnostics(enabled: boolean, now = Date.now) {
  let port: MessagePort | null = null;
  let latest: N64AudioOutputReport | null = null;
  let status = enabled ? 'awaiting-runtime' : 'disabled';
  let sampleRate: number | null = null;
  let mode: string = 'unknown';
  let bridgeDetails: Omit<N64AudioOutputBridge, 'port'> | null = null;
  let attachedAt = 0, reportAt = 0, session = 0;
  let transportError: string | null = null;
  const send = (message: unknown) => {
    try { port?.postMessage(message); } catch (error) { transportError = String(error); }
  };
  let lifecycle = { running: true, muted: false };
  const detach = () => {
    if (port) {
      port.removeEventListener('message', receive);
      send({ type: 'diagnostics', enabled: false });
      port = null;
    }
    latest = null;
  };
  const receive = (event: MessageEvent) => {
    const data = event.data as N64AudioOutputReport;
    if (data?.type !== 'n64-audio-output' || data.version !== 1
      || data.mode !== 'audio-worklet' || !(data.sampleRate > 0)
      || data.sampleRate !== sampleRate
      || !Number.isFinite(data.renderedFrames)
      || (latest && data.sequence <= latest.sequence)) return;
    latest = { ...data };
    reportAt = now();
    status = 'receiving';
  };
  return {
    attach(bridge?: N64AudioOutputBridge) {
      if (!enabled) return;
      if (!bridge) {
        bridgeDetails = null;
        detach(); mode = 'unknown'; sampleRate = null;
        status = 'unsupported-runtime-rebuild-required'; return;
      }
      sampleRate = bridge.sampleRate;
      mode = bridge.mode;
      const { port: ignoredPort, ...details } = bridge;
      bridgeDetails = details;
      if (!bridge.port) { detach(); status = 'output-counters-unavailable'; return; }
      if (port === bridge.port) return;
      detach();
      session++;
      attachedAt = now(); reportAt = 0; transportError = null;
      port = bridge.port;
      try {
        port.addEventListener('message', receive);
        port.start();
        send({ type: 'diagnostics', enabled: true });
        send({ type: 'diagnostics-state', ...lifecycle });
        status = 'awaiting-render-report';
      } catch (error) { transportError = String(error); }
    },
    setLifecycle(running: boolean, muted: boolean) {
      if (lifecycle.running === running && lifecycle.muted === muted) return;
      lifecycle = { running, muted };
      send({ type: 'diagnostics-state', ...lifecycle });
    },
    snapshot() {
      const age = port ? now() - (latest ? reportAt : attachedAt) : null;
      const outputStatus = transportError ? 'diagnostics-transport-error'
        : port && bridgeDetails?.contextState && bridgeDetails.contextState !== 'running' ? 'context-not-running'
        : age !== null && age > 5000 ? (latest ? 'render-report-stale' : 'render-report-timeout') : status;
      return {
        enabled, status: outputStatus, mode, sampleRate, session, bridge: bridgeDetails,
        reportAgeMs: age, transportError,
        scope: 'cumulative-since-attachment-not-benchmark-sample',
        latest: latest ? { ...latest } : null,
        underflowMs: latest ? latest.underflowFrames * 1000 / latest.sampleRate : null,
        longestGapMs: latest ? latest.longestGapFrames * 1000 / latest.sampleRate : null,
      };
    },
    dispose() {
      detach();
      status = enabled ? 'disposed' : 'disabled';
    },
  };
}