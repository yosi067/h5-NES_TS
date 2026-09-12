import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const patch = readFileSync('tools/n64/patches/mupen64plus-ui-console-web-netplay/0004-web-audio-lifecycle.patch', 'utf8');
const header = patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1)).join('\n');
const code = header.split('// BEGIN N64 AUDIO LIFECYCLE')[1].split('\n').slice(1).join('\n').split('// END N64 AUDIO LIFECYCLE')[0];

class Port extends EventTarget {
  sent: any[] = [];
  closed = false;
  start() {}
  close() { this.closed = true; }
  postMessage(data: any) { this.sent.push(data); }
  receive(data: any) { this.dispatchEvent(new MessageEvent('message', { data })); }
}
class Node {
  connections: unknown[] = [];
  failConnect = false;
  connect(target: unknown) { if (this.failConnect) throw Error('connect failed'); this.connections.push(target); }
  disconnect() { this.connections = []; }
}
class Context extends EventTarget {
  state = 'running';
  sampleRate = 48000;
  destination = {};
  audioWorklet = { addModule: vi.fn(() => Promise.resolve()) };
  createGain() { return Object.assign(new Node(), { gain: { value: 1 } }); }
  stateTo(state: string) { this.state = state; this.dispatchEvent(new Event('statechange')); }
}
function harness() {
  const nodes: any[] = [];
  class Worklet extends Node {
    port = new Port();
    onprocessorerror: (() => void) | null = null;
    constructor(public context: Context) { super(); nodes.push(this); }
  }
  const Module: any = { emulatorControls: { stop: vi.fn(), start: vi.fn() } };
  const replace = (context = new Context()) => {
    const script = new Node(); script.connect(context.destination);
    Module.SDL2 = { audioContext: context, audio: { scriptProcessorNode: script } };
    return { context, script };
  };
  const first = replace();
  vm.runInNewContext(code, { Module, AudioWorkletNode: Worklet, setTimeout, clearTimeout, Date, console });
  const controls = Module.emulatorControls;
  const ack = (node = nodes.at(-1)) => {
    const message = node.port.sent.find((m: any) => m.type === 'lifecycle');
    node.port.receive({ type: 'n64-audio-heartbeat', generation: message.generation });
  };
  return { Module, controls, nodes, replace, ack, ...first };
}
afterEach(() => vi.useRealTimers());
describe('actual native-patch AudioWorklet lifecycle bridge', () => {
  it('saves URL before SDL exists and opens without polling or a gesture', async () => {
    vi.useFakeTimers(); const h = harness(); delete h.Module.SDL2;
    expect(await h.controls.configureAudioWorklet('saved.js')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    const next = h.replace(); h.Module.n64AudioDeviceOpened();
    await h.controls.configureAudioWorklet(); h.ack();
    expect(next.context.audioWorklet.addModule).toHaveBeenCalledWith('saved.js');
    h.controls.stop();
  });
  it('restores direct routing if switching the producer to silent gain throws', async () => {
    vi.useFakeTimers(); const h = harness();
    const connect = h.script.connect.bind(h.script);
    h.script.connect = target => { if (target !== h.context.destination) throw Error('gain connection failed'); connect(target); };
    await h.controls.configureAudioWorklet('worklet.js'); h.ack();
    expect(h.script.connections).toEqual([h.context.destination]);
    expect(h.Module.n64AudioWorkletPort).toBeUndefined();
    expect(h.nodes[0].connections).toEqual([]);
    expect(h.controls.getAudioOutputDiagnostics().routeState).toBe('fallback'); h.controls.stop();
  });
  it('keeps SDL audible until render ack; automatically replaces context before first diagnostics report', async () => {
    vi.useFakeTimers();
    const h = harness();
    await h.controls.configureAudioWorklet('worklet.js');
    expect(h.controls.getAudioOutputDiagnostics()).toMatchObject({ port: null, routeState: 'awaiting-render-ack' });
    expect(h.script.connections).toEqual([h.context.destination]);
    h.ack();
    const old = h.controls.getAudioOutputDiagnostics();
    h.Module.n64AudioDeviceClosing(); h.context.stateTo('closed');
    const next = h.replace(); next.context.sampleRate = 44100;
    h.Module.n64AudioDeviceOpened();
    await h.controls.configureAudioWorklet(); h.ack();
    const result = h.controls.getAudioOutputDiagnostics();
    expect(result).toMatchObject({ mode: 'audio-worklet', sampleRate: 44100, acknowledged: true });
    expect(result.contextId).not.toBe(old.contextId);
    expect(result.port).not.toBe(old.port);
    expect(old.port.closed).toBe(true);
    expect(h.nodes[0].connections).toEqual([]);
    h.controls.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('checks ScriptProcessor identity even when context is unchanged', async () => {
    vi.useFakeTimers(); const h = harness();
    await h.controls.configureAudioWorklet('worklet.js'); h.ack();
    const old = h.controls.getAudioOutputDiagnostics();
    h.replace(h.context); h.Module.n64AudioDeviceOpened();
    await h.controls.configureAudioWorklet(); h.ack();
    expect(h.controls.getAudioOutputDiagnostics().scriptProcessorId).not.toBe(old.scriptProcessorId);
    expect(old.port.closed).toBe(true);
    h.controls.stop();
  });
  it('rejects an async old-device completion and a completion after stop', async () => {
    vi.useFakeTimers(); const h = harness();
    let finish!: () => void;
    h.context.audioWorklet.addModule.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const pending = h.controls.configureAudioWorklet('worklet.js'); await Promise.resolve();
    h.replace(); h.Module.n64AudioDeviceOpened(); await h.controls.configureAudioWorklet(); h.ack();
    const active = h.Module.n64AudioWorkletPort;
    finish(); expect(await pending).toBe(false);
    expect(h.Module.n64AudioWorkletPort).toBe(active);
    h.Module.n64AudioDeviceClosing(); h.replace(h.context);
    const stopped = h.controls.configureAudioWorklet(); await Promise.resolve();
    h.controls.stop(); finish(); expect(await stopped).toBe(false);
    expect(h.Module.n64AudioWorkletPort).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('processorerror restores SDL and does not retry indefinitely; new device recovers', async () => {
    vi.useFakeTimers(); const h = harness();
    await h.controls.configureAudioWorklet('worklet.js'); h.ack();
    h.nodes[0].onprocessorerror();
    expect(h.script.connections).toEqual([h.context.destination]);
    expect(h.controls.getAudioOutputDiagnostics()).toMatchObject({ mode: 'script-processor', lastError: 'AudioWorklet processorerror', failures: 1 });
    for (let i = 0; i < 4; i++) expect(await h.controls.configureAudioWorklet('worklet.js')).toBe(false);
    expect(h.nodes).toHaveLength(1);
    h.replace(); h.Module.n64AudioDeviceOpened(); await h.controls.configureAudioWorklet(); h.ack();
    expect(h.controls.getAudioOutputDiagnostics().mode).toBe('audio-worklet'); h.controls.stop();
  });
  it('bounds missing ack/heartbeat while excluding suspended context time', async () => {
    vi.useFakeTimers(); const h = harness();
    await h.controls.configureAudioWorklet('worklet.js');
    h.context.stateTo('suspended'); vi.advanceTimersByTime(20000);
    expect(h.controls.getAudioOutputDiagnostics().routeState).toBe('awaiting-render-ack');
    h.context.stateTo('running'); vi.advanceTimersByTime(5001);
    expect(h.controls.getAudioOutputDiagnostics().routeState).toBe('fallback');
    expect(h.script.connections).toEqual([h.context.destination]);
    h.replace(); h.Module.n64AudioDeviceOpened(); await h.controls.configureAudioWorklet(); h.ack();
    vi.advanceTimersByTime(4000); h.ack(); vi.advanceTimersByTime(4000);
    expect(h.controls.getAudioOutputDiagnostics().routeState).toBe('live');
    vi.advanceTimersByTime(1001);
    expect(h.controls.getAudioOutputDiagnostics().routeState).toBe('fallback'); h.controls.stop();
  });
  it('addModule failure leaves the original producer connected', async () => {
    vi.useFakeTimers(); const h = harness();
    h.context.audioWorklet.addModule.mockRejectedValue(Error('load failed'));
    expect(await h.controls.configureAudioWorklet('bad.js')).toBe(false);
    expect(h.script.connections).toEqual([h.context.destination]);
    expect(h.controls.getAudioOutputDiagnostics().lastError).toContain('load failed'); h.controls.stop();
  });
});