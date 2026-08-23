import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEFAULT_ROM = 'roms/Rockman 6 - Shijou Saidai no Tatakai (Rockman 6 Hack).nes';
const DEFAULT_APP_URL = 'http://127.0.0.1:5174/';
const DEFAULT_OUTPUT = 'nes-wasm/target/fceumm-probe/rockman-6-44100.f32';
const DEFAULT_FRAMES = 180;

function readOption(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find(value => value.startsWith(prefix));
  return argument === undefined ? fallback : argument.slice(prefix.length);
}

function readNumberOption(name, fallback) {
  const value = Number(readOption(name, fallback));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid --${name} value`);
  return value;
}

class CdpConnection {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.events = new Map();
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id !== undefined) {
        const resolver = this.pending.get(message.id);
        if (resolver) {
          this.pending.delete(message.id);
          resolver(message);
        }
        return;
      }
      const listeners = this.events.get(message.method) ?? [];
      for (const listener of listeners) listener(message.params ?? {});
    });
  }

  async open() {
    await new Promise((resolvePromise, rejectPromise) => {
      const onOpen = () => {
        this.socket.removeEventListener('error', onError);
        resolvePromise();
      };
      const onError = error => {
        this.socket.removeEventListener('open', onOpen);
        rejectPromise(error);
      };
      this.socket.addEventListener('open', onOpen, { once: true });
      this.socket.addEventListener('error', onError, { once: true });
    });
  }

  on(method, listener) {
    const listeners = this.events.get(method) ?? [];
    listeners.push(listener);
    this.events.set(method, listeners);
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, resolvePromise);
      this.socket.send(JSON.stringify({ id, method, params }));
      if (this.pending.size > 1000) rejectPromise(new Error('Too many pending CDP requests'));
    }).then(message => {
      if (message.error) throw new Error(`${method}: ${message.error.message}`);
      return message.result;
    });
  }

  close() {
    this.socket.close();
  }
}

async function getPageTarget(cdpUrl) {
  const targets = await (await fetch(`${cdpUrl}/json/list`)).json();
  let target = targets.find(item => item.type === 'page' && item.url === 'about:blank');
  if (target) return target;

  target = targets.find(item => item.type === 'page');
  if (target) return target;

  const response = await fetch(`${cdpUrl}/json/new?about:blank`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Unable to create a Chrome page: ${response.status}`);
  return response.json();
}

async function evaluate(cdp, expression, returnByValue = true) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description
      ?? result.exceptionDetails.text
      ?? 'Runtime.evaluate failed';
    throw new Error(description);
  }
  return result.result?.value;
}

function createStartExpression(config) {
  return `(${async function startCapture(options) {
    document.body.innerHTML = '';
    const previous = window.__fceummCapture;
    previous?.cleanup?.();

    const response = await fetch(options.romPath);
    if (!response.ok) throw new Error(`ROM request failed: ${response.status}`);
    const romUrl = URL.createObjectURL(await response.blob());
    const dataPath = new URL('emulatorjs/data/', window.location.href).href;
    const runtimeUrl = new URL('emulatorjs/data/loader.js', window.location.href).href;
    const frame = document.createElement('iframe');
    frame.id = 'fceumm-capture-screen';
    frame.title = 'FCEUmm capture';
    frame.allow = 'autoplay; fullscreen; gamepad';
    frame.style.cssText = 'width:256px;height:240px;border:0;position:absolute;left:-10000px;top:-10000px';
    const coreConfig = [
      'window.EJS_player="#game";',
      'window.EJS_core=' + JSON.stringify(options.core) + ';',
      'window.EJS_gameUrl=' + JSON.stringify(romUrl) + ';',
      'window.EJS_gameName=' + JSON.stringify(options.romName) + ';',
      'window.EJS_pathtodata=' + JSON.stringify(dataPath) + ';',
      'window.EJS_defaultOptions=' + JSON.stringify(options.defaultOptions ?? {}) + ';',
      'window.EJS_startOnLoaded=true;',
      'window.EJS_DEBUG_XX=false;',
      'window.EJS_threads=false;',
      'window.EJS_forceLegacyCores=false;',
      'window.EJS_disableLocalStorage=true;',
      'window.EJS_disableAutoLang=true;',
      'window.EJS_language="en-US";',
    ].join('');
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>html,body,#game{width:100%;height:100%;margin:0;overflow:hidden;background:#000}</style></head><body><div id="game"></div><script>'
      + coreConfig
      + '</script><script src='
      + JSON.stringify(runtimeUrl)
      + '></script></body></html>';
    document.body.appendChild(frame);

    const deadline = performance.now() + options.startTimeoutMs;
    let emulator;
    while (performance.now() < deadline) {
      emulator = frame.contentWindow?.EJS_emulator;
      if (emulator?.started && emulator.gameManager && emulator.Module) break;
      await new Promise(resolvePromise => setTimeout(resolvePromise, 50));
    }
    if (!emulator?.started || !emulator.gameManager || !emulator.Module) {
      throw new Error('FCEUmm did not reach the started state');
    }

    const gameManager = emulator.gameManager;
    const module = emulator.Module;
    const readCoreOptions = () => {
      try {
        return gameManager.getCoreOptions();
      } catch {
        return null;
      }
    };
    const readRetroarchConfig = () => {
      try {
        return module.FS.readFile('/home/web_user/.config/retroarch/retroarch.cfg', { encoding: 'utf8' });
      } catch {
        return null;
      }
    };
    const optionNames = [
      'fceumm_sndquality',
      'fceumm_sndlowpass',
      'fceumm_sndstereodelay',
      'fceumm_sndvolume',
      'fceumm_show_adv_sound_options',
      'fceumm_apu_1',
      'fceumm_apu_2',
      'fceumm_apu_3',
      'fceumm_apu_4',
      'fceumm_apu_5',
    ];
    const readOptionSettings = () => Object.fromEntries(optionNames.map(name => [
      name,
      emulator.allSettings?.[name] ?? emulator.settings?.[name] ?? null,
    ]));
    const coreOptionsBefore = readCoreOptions();
    const retroarchConfigBefore = readRetroarchConfig();
    const optionSettingsBefore = readOptionSettings();
    const requestedVariables = { ...(options.defaultOptions ?? {}) };
    const getFrameCount = typeof module._get_current_frame_count === 'function'
      ? () => module._get_current_frame_count()
      : typeof gameManager.functions?.getFrameNum === 'function'
        ? () => gameManager.functions.getFrameNum()
        : () => null;
    const sourceDeadline = performance.now() + options.startTimeoutMs;
    let source;
    while (performance.now() < sourceDeadline) {
      source = module.AL?.currentCtx?.sources?.find(item => item && item.bufQueue);
      if (source) break;
      await new Promise(resolvePromise => setTimeout(resolvePromise, 50));
    }
    if (!source) throw new Error('FCEUmm audio source queue was not found');

    let queue = source.bufQueue;
    let originalPush = queue.push;
    const runtimeVariablesApplied = {};
    const setRuntimeVariable = (name, value) => {
      gameManager.setVariable(name, value);
      if (emulator.allSettings) emulator.allSettings[name] = value;
      if (emulator.settings) emulator.settings[name] = value;
    };
    for (const [name, value] of Object.entries(requestedVariables)) {
      if (optionSettingsBefore[name] !== value) {
        setRuntimeVariable(name, value);
        runtimeVariablesApplied[name] = value;
      }
    }
    let sourceReacquired = false;
    if (Object.keys(runtimeVariablesApplied).length > 0) {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
      source = module.AL?.currentCtx?.sources?.find(item => item && item.bufQueue);
      if (!source) throw new Error('FCEUmm audio source queue was not found after option update');
      queue = source.bufQueue;
      originalPush = queue.push;
      sourceReacquired = true;
      gameManager.toggleMainLoop(1);
      module.resumeMainLoop?.();
    }
    const coreOptionsAfter = readCoreOptions();
    const retroarchConfigAfter = readRetroarchConfig();
    const optionSettingsAfter = readOptionSettings();
    queue.length = 0;
    const baselineFrame = getFrameCount();
    const capture = {
      options,
      runtime: {
        requestedVariables,
        runtimeVariablesApplied,
        sourceReacquired,
        coreOptionsBefore,
        coreOptionsAfter,
        retroarchConfigBefore,
        retroarchConfigAfter,
        optionSettingsBefore,
        optionSettingsAfter,
      },
      baselineFrame,
      frameCounterAvailable: baselineFrame !== null,
      blocks: [],
      monoChunks: [],
      totalSamples: 0,
      errors: [],
      done: false,
      targetFrame: null,
      stopReason: null,
      timedOut: false,
      startedAt: performance.now(),
      cleanup() {
        if (queue.push === capture.push) queue.push = originalPush;
        capture.done = true;
        try {
          gameManager.toggleMainLoop(0);
          module.pauseMainLoop?.();
        } catch {}
      },
    };
    capture.push = function captureAudioBlocks(...items) {
      for (const item of items) {
        try {
          const audioBuffer = item?.audioBuf;
          if (!audioBuffer || typeof audioBuffer.getChannelData !== 'function') continue;
          const channelCount = Math.max(1, Number(item.channels) || audioBuffer.numberOfChannels || 1);
          const length = audioBuffer.length || audioBuffer.getChannelData(0).length;
          const channelData = Array.from({ length: channelCount }, (_, channel) => (
            audioBuffer.getChannelData(Math.min(channel, audioBuffer.numberOfChannels - 1))
          ));
          const mono = new Float32Array(length);
          for (let sampleIndex = 0; sampleIndex < length; sampleIndex++) {
            let sum = 0;
            for (const channel of channelData) sum += channel[sampleIndex] ?? 0;
            mono[sampleIndex] = sum / channelData.length;
          }
          let sum = 0;
          let sumSquared = 0;
          let peak = 0;
          let zeroCrossings = 0;
          let previous = mono[0] ?? 0;
          for (const sample of mono) {
            sum += sample;
            sumSquared += sample * sample;
            peak = Math.max(peak, Math.abs(sample));
            if ((sample < 0) !== (previous < 0)) zeroCrossings++;
            previous = sample;
          }
          capture.blocks.push({
            frame: getFrameCount(),
            frequency: Number(item.frequency) || 0,
            channels: channelCount,
            samples: length,
            dc: length === 0 ? 0 : sum / length,
            rms: length === 0 ? 0 : Math.sqrt(sumSquared / length),
            peak,
            zeroCrossings,
          });
          capture.monoChunks.push(mono);
          capture.totalSamples += length;
        } catch (error) {
          capture.errors.push(String(error));
        }
      }
      return originalPush.apply(this, items);
    };
    queue.push = capture.push;
    window.__fceummCapture = capture;

    capture.run = (async () => {
      const targetFrame = baselineFrame === null ? null : baselineFrame + options.frames;
      const timeout = performance.now() + options.captureTimeoutMs;
      capture.targetFrame = targetFrame;
      capture.stopReason = 'timeout';
      module.resumeMainLoop?.();
      while (performance.now() < timeout) {
        const currentFrame = getFrameCount();
        if (targetFrame !== null && currentFrame !== null && currentFrame >= targetFrame) {
          capture.stopReason = 'target-frame';
          break;
        }
        await new Promise(resolvePromise => setTimeout(resolvePromise, 10));
      }
      capture.timedOut = capture.stopReason === 'timeout';
      capture.endFrame = getFrameCount();
      capture.done = true;
      gameManager.toggleMainLoop(0);
      module.pauseMainLoop?.();
    })();

    return {
      baselineFrame,
      frameCounterAvailable: capture.frameCounterAvailable,
      sampleRate: module.AL?.currentCtx?.audioCtx?.sampleRate
        ?? source.gain?.context?.sampleRate
        ?? null,
      sourceCount: module.AL?.currentCtx?.sources?.length ?? 0,
      queuedBuffersBeforeCapture: queue.length,
    };
  }.toString()})(${JSON.stringify(config)})`;
}

const collectExpression = `(${function collectCapture() {
  const capture = window.__fceummCapture;
  if (!capture) throw new Error('FCEUmm capture state is missing');
  const samples = new Float32Array(capture.totalSamples);
  let offset = 0;
  for (const chunk of capture.monoChunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  const bytes = new Uint8Array(samples.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let start = 0; start < bytes.length; start += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(start, Math.min(start + chunkSize, bytes.length)));
  }
  return {
    metadata: {
      ...capture.options,
      runtime: capture.runtime,
      baselineFrame: capture.baselineFrame,
      endFrame: capture.endFrame ?? null,
      targetFrame: capture.targetFrame,
      stopReason: capture.stopReason,
      timedOut: capture.timedOut,
      frameCounterAvailable: capture.frameCounterAvailable,
      done: capture.done,
      totalSamples: capture.totalSamples,
      blockCount: capture.blocks.length,
      errors: capture.errors,
      blocks: capture.blocks,
    },
    base64: btoa(binary),
  };
}.toString()})()`;

const statusExpression = `(${function readCaptureStatus() {
  const capture = window.__fceummCapture;
  if (!capture) return null;
  return {
    done: capture.done,
    blocks: capture.blocks.length,
    samples: capture.totalSamples,
    currentFrame: capture.blocks.at(-1)?.frame ?? capture.baselineFrame,
    errorCount: capture.errors.length,
    targetFrame: capture.targetFrame,
    stopReason: capture.stopReason,
    timedOut: capture.timedOut,
  };
}.toString()})()`;

const cleanupExpression = `(${function cleanupCapture() {
  const capture = window.__fceummCapture;
  capture?.cleanup?.();
  const frame = document.getElementById('fceumm-capture-screen');
  const romUrl = frame?.contentWindow?.EJS_gameUrl;
  frame?.remove();
  if (typeof romUrl === 'string' && romUrl.startsWith('blob:')) URL.revokeObjectURL(romUrl);
  delete window.__fceummCapture;
  return true;
}.toString()})()`;

const appUrl = readOption('app-url', DEFAULT_APP_URL);
const cdpPort = readOption('cdp-port', '9222');
const cdpUrl = `http://127.0.0.1:${cdpPort}`;
const romPath = readOption('rom', DEFAULT_ROM);
const frames = readNumberOption('frames', DEFAULT_FRAMES);
const outputPath = resolve(readOption('output', DEFAULT_OUTPUT));
const soundQuality = readOption('sound-quality', '');
const lowpass = readOption('lowpass', '');
const disabledChannels = readOption('disable-channels', '')
  .split(',')
  .map(value => value.trim())
  .filter(value => /^[1-5]$/.test(value));
const defaultOptions = Object.fromEntries([
  soundQuality ? ['fceumm_sndquality', soundQuality] : null,
  lowpass ? ['fceumm_sndlowpass', lowpass] : null,
  disabledChannels.length > 0 ? ['fceumm_show_adv_sound_options', 'enabled'] : null,
  ...disabledChannels.map(channel => [`fceumm_apu_${channel}`, 'disabled']),
].filter(Boolean));
const startTimeoutMs = readNumberOption('start-timeout-ms', 30_000);
const captureTimeoutMs = readNumberOption('capture-timeout-ms', Math.ceil((frames * 1000) / 59.5) + 2_000);
const romName = romPath.split(/[\\/]/).pop() ?? romPath;

let page;
try {
  const target = await getPageTarget(cdpUrl);
  page = new CdpConnection(target.webSocketDebuggerUrl);
  await page.open();
  await page.send('Runtime.enable');
  await page.send('Page.enable');
  await page.send('Page.navigate', { url: appUrl });
  await page.send('Page.bringToFront');
  await evaluate(page, 'new Promise(resolve => setTimeout(resolve, 300))');

  const startResult = await evaluate(page, createStartExpression({
    appUrl,
    core: 'nes',
    frames,
    romName,
    romPath: new URL(romPath, appUrl).href,
    soundQuality,
    lowpass,
    startTimeoutMs,
    captureTimeoutMs,
    defaultOptions,
  }));
  console.log(JSON.stringify({ event: 'started', ...startResult }));

  let status;
  do {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
    status = await evaluate(page, statusExpression);
    if (!status) throw new Error('FCEUmm capture stopped unexpectedly');
    if (status.errorCount > 0) console.warn(JSON.stringify({ event: 'capture-errors', ...status }));
  } while (!status.done);

  const result = await evaluate(page, collectExpression);
  if (!result?.metadata) {
    console.error(JSON.stringify({ event: 'empty-capture', result }));
    throw new Error('FCEUmm capture returned no metadata');
  }
  const pcm = Buffer.from(result.base64 ?? '', 'base64');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, pcm);
  const metadataPath = outputPath.replace(/\.f32$/i, '.json');
  await writeFile(metadataPath, `${JSON.stringify({ ...result.metadata, outputPath, pcmBytes: pcm.length }, null, 2)}\n`);
  console.log(JSON.stringify({
    event: 'complete',
    outputPath,
    metadataPath,
    pcmBytes: pcm.length,
    ...result.metadata,
  }));
  if (pcm.length === 0) throw new Error('FCEUmm capture returned no PCM');
} finally {
  if (page) {
    try {
      await evaluate(page, cleanupExpression);
    } catch {}
    page.close();
  }
}