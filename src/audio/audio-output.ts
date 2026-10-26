/**
 * 音訊輸出：AudioContext、AudioWorklet 佇列、靜音與音質診斷。
 */
import { N64_REBUILT_ASSET_VERSION } from '../n64/runtime-assets';
import { runtime } from '../app/runtime';
import { n64AudioOutputDiagnostics, n64Controls } from '../backends/n64/n64-backend';
import { showToast } from '../ui/dialogs';

export let audioContext: AudioContext | null = null;

let audioWorkletNode: AudioWorkletNode | null = null;


// ===== 音頻設定 =====
export let audioMuted: boolean = false;


// ===== 音頻系統 =====

// 簡易音質診斷：為特定遊戲（目前鎖定 SoM）收集短期 RMS / 高頻能量，便於自動偵測刺耳雜訊
const audioDiag = {
  active: false,
  sampleCount: 0,
  sumSq: 0,
  sumDiffSq: 0,
  maxAbs: 0,
  clipCount: 0,
  windowsLogged: 0,
};


function shouldEnableAudioDiag(): boolean {
  const coreType = runtime.nes?.getCoreType();
  if (coreType !== 'snes') return false;
  const name = (runtime.currentRomFilename || '').toLowerCase();
  return name.includes('mana');
}


function resetAudioDiagWindow(): void {
  audioDiag.sampleCount = 0;
  audioDiag.sumSq = 0;
  audioDiag.sumDiffSq = 0;
  audioDiag.maxAbs = 0;
  audioDiag.clipCount = 0;
}


export function enqueueAudioSamples(samples: Float32Array, channels = 1): void {
  if (audioMuted || samples.length === 0 || !audioWorkletNode) return;

  if (audioDiag.active && audioContext) {
    for (let index = 0; index < samples.length; index++) {
      const value = samples[index];
      audioDiag.sampleCount++;
      audioDiag.sumSq += value * value;
      if (index > 0) {
        const difference = value - samples[index - 1];
        audioDiag.sumDiffSq += difference * difference;
      }
      const absolute = Math.abs(value);
      if (absolute > audioDiag.maxAbs) audioDiag.maxAbs = absolute;
      if (absolute > 0.98) audioDiag.clipCount++;
      if (audioDiag.sampleCount >= audioContext.sampleRate) {
        const rms = Math.sqrt(audioDiag.sumSq / audioDiag.sampleCount);
        const diffRms = Math.sqrt(audioDiag.sumDiffSq / Math.max(1, audioDiag.sampleCount - 1));
        const snrLike = rms > 1e-6 ? rms / Math.max(1e-6, diffRms) : 0;
        console.log(`[AUDIO DIAG] window=${audioDiag.windowsLogged + 1} rms=${rms.toFixed(4)} diffRms=${diffRms.toFixed(4)} snrLike=${snrLike.toFixed(2)} maxAbs=${audioDiag.maxAbs.toFixed(3)} clips=${audioDiag.clipCount}`);
        audioDiag.windowsLogged++;
        resetAudioDiagWindow();
        if (audioDiag.windowsLogged >= 12) audioDiag.active = false;
      }
    }
  }

  const transferableSamples = samples.slice();
  audioWorkletNode.port.postMessage(
    { type: 'samples', samples: transferableSamples, channels },
    [transferableSamples.buffer],
  );
}


export interface AudioQueueStats {
  /** 佇列中尚未播放的取樣幀數。 */
  bufferedFrames: number;
  /** 播放中佇列見底（會聽到斷音）的累計次數。 */
  underruns: number;
  /** 佇列過長被丟掉的區塊數（模擬跑太快）。 */
  droppedChunks: number;
}


/** 向 AudioWorklet 查詢佇列統計（效能面板用）；沒有 AudioWorklet 或逾時時回傳 null。 */
export function requestAudioQueueStats(timeoutMs = 250): Promise<AudioQueueStats | null> {
  const port = audioWorkletNode?.port;
  if (!port) return Promise.resolve(null);
  return new Promise((resolve) => {
    let timer = 0;
    const onMessage = (event: MessageEvent): void => {
      if (event.data?.type !== 'stats') return;
      window.clearTimeout(timer);
      port.removeEventListener('message', onMessage);
      resolve({
        bufferedFrames: event.data.bufferedFrames,
        underruns: event.data.underruns,
        droppedChunks: event.data.droppedChunks,
      });
    };
    timer = window.setTimeout(() => {
      port.removeEventListener('message', onMessage);
      resolve(null);
    }, timeoutMs);
    port.addEventListener('message', onMessage);
    port.start();
    port.postMessage({ type: 'stats' });
  });
}


export function clearAudioQueue(): void {
  audioWorkletNode?.port.postMessage({ type: 'clear' });
}


export function syncAudioWorkletState(): void {
  audioWorkletNode?.port.postMessage({ type: 'state', running: runtime.isRunning, muted: audioMuted });
  n64AudioOutputDiagnostics.setLifecycle(runtime.isRunning && !document.hidden, audioMuted);
}


/**
 * 將 WASM 音頻緩衝區的樣本排入 JS 環形緩衝區
 * 在每次 frame() 後呼叫，確保所有樣本都被捕獲
 */
export function drainWasmAudioToWorklet(): void {
  if (!runtime.nes) return;
  const available = runtime.nes.getAudioBufferLen();
  if (available === 0) return;

  // 靜音時只消費 buffer 不排入環形緩衝區
  if (audioMuted) {
    runtime.nes.consumeAudioSamples();
    return;
  }

  // 重要：每次都重新取得 WASM memory 參考（記憶體增長後 buffer 可能 detached）
  const memory = runtime.nes.getWasmMemory() as WebAssembly.Memory;
  const ptr = runtime.nes.getAudioBufferPtr();
  const samples = new Float32Array(memory.buffer, ptr, available);
  enqueueAudioSamples(samples, runtime.nes.getCoreType() === 'snes' ? 2 : 1);

  runtime.nes.consumeAudioSamples();
}


/**
 * 初始化音頻系統
 */
export async function initAudio(): Promise<void> {
  try {
    audioContext = new AudioContext({ sampleRate: 44100 });
    if (!audioContext.audioWorklet) {
      await audioContext.close();
      audioContext = null;
      console.info('[Audio] AudioWorklet unavailable on LAN HTTP; N64 SDL audio remains available');
      return;
    }
    await audioContext.audioWorklet.addModule(`${import.meta.env.BASE_URL}audio-worklet.js`);
    audioWorkletNode = new AudioWorkletNode(audioContext, 'emulator-audio-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    audioWorkletNode.connect(audioContext.destination);
    
    if (runtime.nes) {
      runtime.nes.setAudioSampleRate(audioContext.sampleRate);
    }
    audioDiag.active = shouldEnableAudioDiag();
    if (audioDiag.active) {
      resetAudioDiagWindow();
      audioDiag.windowsLogged = 0;
      console.log('[AUDIO DIAG] Enabled for current ROM');
    }
    
    syncAudioWorkletState();
    console.log('AudioWorklet 音頻系統已初始化，取樣率:', audioContext.sampleRate);
  } catch (e) {
    console.error('音頻初始化失敗:', e);
  }
}


/**
 * 恢復音頻
 */
export function resumeAudio(): void {
  if (audioContext && audioContext.state !== 'running' && audioContext.state !== 'closed') {
    void audioContext.resume().catch(error => console.warn('[Audio] 恢復 AudioContext 失敗:', error));
  }
  configureN64AudioWorklet();
  void n64Controls?.resumeAudio?.().catch(error => console.warn('[N64] 恢復 SDL 音訊失敗:', error));
}


export function configureN64AudioWorklet(): void {
  const diagnostics = n64AudioOutputDiagnostics;
  diagnostics.setLifecycle(runtime.isRunning && !document.hidden, audioMuted);
  const controls = n64Controls;
  const configure = n64Controls?.configureAudioWorklet;
  if (!configure) {
    diagnostics.attach(controls?.getAudioOutputDiagnostics?.());
    return;
  }

  const workletUrl = new URL(
    `${import.meta.env.BASE_URL}n64-audio-worklet.js?v=${N64_REBUILT_ASSET_VERSION}`,
    document.baseURI,
  ).href;
  void configure(workletUrl)
    .then(enabled => {
      if (controls === n64Controls && diagnostics === n64AudioOutputDiagnostics) {
        diagnostics.attach(controls?.getAudioOutputDiagnostics?.());
      }
      if (enabled) console.info('[N64] AudioWorklet configured; live routing requires render acknowledgement');
    })
    .catch(error => console.warn('[N64] AudioWorklet fallback to SDL ScriptProcessor:', error));
}


/**
 * 切換靜音（同時停用 NES APU IRQ，用於除錯畫面問題）
 */
function toggleMute(): void {
  audioMuted = !audioMuted;
  // 通知 Rust 核心停用/啟用 APU IRQ
  runtime.nes?.setAudioEnabled(!audioMuted);

  // 靜音時清空環形緩衝區，避免殘留聲音
  if (audioMuted) {
    clearAudioQueue();
  }
  syncAudioWorkletState();

  showToast(audioMuted ? '🔇 音頻已關閉（APU IRQ 同時停用）' : '🔊 音頻已開啟');
}
