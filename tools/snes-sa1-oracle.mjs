import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { initSync, EmuWasm } from '../src/wasm/nes_wasm.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'artifacts', 'snes-rom-manifest.json');
const wasmPath = path.join(root, 'src', 'wasm', 'nes_wasm_bg.wasm');
const outputPath = path.join(root, 'artifacts', 'snes-sa1-oracle-report.json');
const selectedFile = process.env.SNES_ORACLE_FILE ?? 'Super Mario RPG (Japan).zip';
const frameCount = Number(process.env.SNES_ORACLE_FRAMES ?? 3600);
const checkpointFrames = new Set(
  (process.env.SNES_ORACLE_CHECKPOINTS ?? '0,1,60,600,1800,3600')
    .split(',')
    .map(value => Number(value.trim()))
    .filter(value => Number.isInteger(value) && value >= 0),
);

async function readCatalogRom(file) {
  const filePath = path.join(root, 'roms', file);
  if (path.extname(file).toLowerCase() !== '.zip') {
    return new Uint8Array(await readFile(filePath));
  }

  const zip = await JSZip.loadAsync(await readFile(filePath));
  const member = Object.values(zip.files)
    .filter(entry => !entry.dir && ['.sfc', '.smc', '.fig'].includes(path.extname(entry.name).toLowerCase()))
    .sort((left, right) => left.name.localeCompare(right.name))[0];
  if (!member) throw new Error(`No SNES member found in ${file}`);
  return new Uint8Array(await member.async('uint8array'));
}

function parseTrace(trace) {
  return trace.split('\n').filter(Boolean).flatMap((line, sequence) => {
    const match = line.match(/^frame=(\d+) masterClock=(\d+) (?:(sa1):)?([a-z_]+(?::[a-z_]+)?)(?:\s+(.*))?$/);
    if (!match) return [];
    const rawType = match[4];
    const fields = Object.fromEntries(
      (match[5] ?? '').split(/\s+/).filter(Boolean).flatMap(token => {
        const separator = token.indexOf('=');
        return separator > 0 ? [[token.slice(0, separator), token.slice(separator + 1)]] : [];
      }),
    );
    return [{
      sequence,
      frame: Number(match[1]),
      masterClock: Number(match[2]),
      source: match[3] ? 'sa1' : 'bus',
      type: rawType.startsWith('bus:') ? 'bus' : rawType,
      rawType,
      fields,
      line,
    }];
  });
}

function summarizeHandshake(events) {
  const cpuEvents = events.filter(event => event.source === 'sa1' && event.type === 'cpu');
  const firstLoopIndex = cpuEvents.findIndex(event => event.fields.pc === '816F');
  const firstLoopSequence = firstLoopIndex >= 0 ? cpuEvents[firstLoopIndex].sequence : null;
  const busEvents = events.filter(event => event.type === 'bus');
  const readKind = event => event.fields.kind ?? event.rawType.split(':')[1] ?? null;
  const isAddress = (event, address) => event.fields.addr === address;
  const pollReads = busEvents.filter(event => (
    event.source === 'sa1'
    && readKind(event) === 'read'
    && isAddress(event, '00:0000')
  ));
  const handshakeWrites = busEvents.filter(event => (
    event.source === 'bus'
    && readKind(event) === 'write'
    && isAddress(event, '00:3000')
  ));
  const registerWritesBeforeLoop = busEvents.filter(event => {
    if (event.source !== 'bus' || readKind(event) !== 'write' || firstLoopSequence === null) return false;
    if (event.sequence > firstLoopSequence) return false;
    const address = event.fields.addr ?? '';
    return address.startsWith('00:22') || address.startsWith('00:23');
  });
  const nonZeroHandshakeWrites = handshakeWrites.filter(event => event.fields.value !== '00');

  return {
    loop: {
      firstPc: firstLoopIndex >= 0 ? cpuEvents[firstLoopIndex].fields.pc : null,
      nextPc: firstLoopIndex >= 0 ? cpuEvents[firstLoopIndex].fields.next : null,
      firstSequence: firstLoopSequence,
      instructionBytes: ['A5', '00', 'F0', 'FC'],
      meaning: 'SA-1 reads IRAM $0000 and branches back while the value is zero',
    },
    sharedAddress: 'S-CPU $00:3000 <-> SA-1 IRAM $0000',
    sa1PollReads: {
      count: pollReads.length,
      values: [...new Set(pollReads.map(event => event.fields.value))],
      samples: pollReads.slice(0, 8).map(event => ({
        frame: event.frame,
        masterClock: event.masterClock,
        value: event.fields.value,
      })),
    },
    sCpuHandshakeWrites: {
      count: handshakeWrites.length,
      nonZeroCount: nonZeroHandshakeWrites.length,
      samples: handshakeWrites.slice(-8).map(event => ({
        frame: event.frame,
        masterClock: event.masterClock,
        value: event.fields.value,
      })),
    },
    registerWritesBeforeLoop: registerWritesBeforeLoop.slice(-16).map(event => ({
      frame: event.frame,
      masterClock: event.masterClock,
      address: event.fields.addr,
      value: event.fields.value,
    })),
    conclusion: pollReads.length > 0 && nonZeroHandshakeWrites.length === 0
      ? 'S-CPU never releases the SA-1 IRAM $0000 handshake before the polling loop; no register-side effect is proven by this trace.'
      : 'Handshake evidence is incomplete; inspect the bounded samples before changing bus semantics.',
  };
}

function summarizeProgress(events) {
  const cpuEvents = events.filter(event => event.type === 'cpu');
  const executionFrames = [...new Set(cpuEvents.map(event => event.frame))].sort((left, right) => left - right);
  const uniquePcs = [...new Set(cpuEvents.map(event => event.fields.pc).filter(Boolean))];
  const tail = cpuEvents.slice(-8).map(event => event.fields.pc);
  const terminalTwoPcLoop = tail.length === 8
    && tail[0] !== tail[1]
    && tail.every((pc, index) => pc === tail[index % 2]);
  const last = cpuEvents.at(-1);

  return {
    executionFrames,
    cpuEvents: cpuEvents.length,
    uniquePcs,
    firstPc: cpuEvents[0]?.fields.pc ?? null,
    lastPc: last?.fields.pc ?? null,
    lastNextPc: last?.fields.next ?? null,
    terminalTwoPcLoop,
    startupPollOnly: executionFrames.length === 1 && terminalTwoPcLoop,
  };
}

function validateTrace(events) {
  const errors = [];
  const progress = summarizeProgress(events);
  let previousClock = 0;
  let previousSequence = -1;
  const dmaStarts = [];
  const timerEvents = [];
  const irqEvents = [];
  const busRegions = new Set();

  for (const event of events) {
    if (event.sequence <= previousSequence) errors.push('trace-sequence-not-increasing');
    if (event.masterClock < previousClock) errors.push('master-clock-regressed');
    previousSequence = event.sequence;
    previousClock = event.masterClock;

    if (event.type === 'cpu' && Number(event.fields.clocks ?? 0) <= 0) {
      errors.push('sa1-cpu-event-without-positive-clocks');
    }
    if (event.type === 'bus') {
      if (event.fields.owner !== 'sa1') errors.push('sa1-bus-event-without-sa1-owner');
      if (!event.fields.region) errors.push('sa1-bus-event-without-region');
      if (event.fields.region) busRegions.add(event.fields.region);
    }
    if (event.type === 'dma_start') dmaStarts.push(event);
    if (event.type === 'timer_irq') timerEvents.push(event);
    if (event.type === 'irq') irqEvents.push(event);
  }

  for (const start of dmaStarts) {
    const release = events.find(event => event.sequence > start.sequence && event.type === 'dma_release');
    if (!release) errors.push(`dma-without-release@${start.sequence}`);
  }
  for (const timer of timerEvents) {
    const irq = irqEvents.find(event => (
      event.sequence > timer.sequence
      && event.fields.source === '40'
    ));
    if (!irq) errors.push(`timer-without-irq@${timer.sequence}`);
  }

  const hasExecution = events.some(event => event.type === 'cpu');
  const hasHardwareEvent = events.some(event => ['dma_start', 'timer_irq', 'irq', 'nmi'].includes(event.type));
  if (!hasExecution) errors.push('real-rom-sa1-cpu-event-missing');
  if (!hasHardwareEvent) errors.push('real-rom-sa1-hardware-event-missing');
  if (progress.startupPollOnly) errors.push('real-rom-sa1-startup-poll-only');

  return {
    passed: errors.length === 0,
    errors: [...new Set(errors)],
    eventCount: events.length,
    cpuEvents: events.filter(event => event.type === 'cpu').length,
    dmaEvents: dmaStarts.length,
    timerIrqEvents: timerEvents.length,
    interruptEvents: irqEvents.length + events.filter(event => event.type === 'nmi').length,
    busRegions: [...busRegions].sort(),
    progress,
  };
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const game = manifest.games.find(entry => entry.file === selectedFile);
if (!game) throw new Error(`SNES_ORACLE_FILE did not match a manifest entry: ${selectedFile}`);
if (game.enhancement !== 'SA-1') {
  throw new Error(`${selectedFile} is not marked as SA-1 in the manifest`);
}

const rom = await readCatalogRom(game.file);
const wasmBytes = await readFile(wasmPath);
initSync({ module: wasmBytes });

const emu = new EmuWasm();
let report;
try {
  if (!emu.loadSnesRom(rom)) throw new Error(`Native SA-1 load failed for ${game.file}`);
  emu.debugSetVerificationTrace(true);
  const checkpoints = [];
  const capture = frame => {
    if (!checkpointFrames.has(frame)) return;
    const state = JSON.parse(emu.debugCheckpoint());
    checkpoints.push({
      frame: state.frame,
      masterClock: state.masterClock,
      sa1: state.sa1,
      sa1Trace: state.sa1Trace,
    });
  };
  capture(0);
  for (let frame = 1; frame <= frameCount; frame += 1) {
    emu.frame();
    capture(frame);
  }
  const trace = emu.debugTakeVerificationTrace();
  const parsedEvents = parseTrace(trace);
  const events = parsedEvents.filter(event => event.source === 'sa1');
  const oracle = validateTrace(events);
  oracle.handshake = summarizeHandshake(parsedEvents);
  report = {
    schema: 1,
    file: game.file,
    enhancement: game.enhancement,
    frameCount,
    checkpointFrames: [...checkpointFrames].sort((left, right) => left - right),
    checkpoints,
    oracle,
    traceLines: trace.split('\n').filter(Boolean),
  };
} finally {
  emu.free();
}

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Wrote ${path.relative(root, outputPath)}`);
console.log(JSON.stringify(report.oracle, null, 2));
if (!report.oracle.passed) process.exitCode = 1;
