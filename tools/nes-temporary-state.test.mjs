import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { initSync, EmuWasm } from '../src/wasm/nes_wasm.js';

// Execute the actual main.ts save/load functions without booting the UI or WASM.
const source = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const names = new Set([
  'getSaveKey', 'saveState', 'loadState', 'exportSaveToFile', 'bytesToBase64', 'base64ToBytes',
  'writeNesPersistentState', 'readNesPersistentState', 'saveNesStateWithPersistence',
  'loadNesStateWithPersistence', 'saveStateForUser', 'loadStateForUser',
]);
const declarations = ast.statements.filter(node =>
  ts.isFunctionDeclaration(node) && names.has(node.name?.text)
  || ts.isVariableStatement(node) && node.declarationList.declarations.some(d =>
    ['SAVE_STATE_PREFIX', 'nesTemporaryStates', 'NES_TEMP_STATE_PREFIX'].includes(d.name.getText(ast))));
const code = ts.transpileModule(declarations.map(n => n.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(type = 'nes') {
  const persistent = new Map();
  const binaryPersistent = new Map();
  const calls = [];
  let next = 0;
  const core = {
    getCoreType: () => type,
    exportSaveState: () => type === 'nes' ? `4e45535701#NES-TEMP-2:test:${next++}` : 'unchanged-platform-state',
    exportSaveStateForSlot: () => core.exportSaveState(),
    exportPersistentSaveState: () => type === 'nes' ? 'NES-SAVE-1:test' : '',
    importSaveState: state => { calls.push(['import', state]); return true; },
    importPersistentSaveState: state => { calls.push(['import-persistent', state]); return true; },
    consumeAudioSamples: () => calls.push(['consume']),
    setAudioEnabled: enabled => calls.push(['audio', enabled]),
  };
  const context = vm.createContext({
    nes: core, activeBackend: 'wasm', currentRomFilename: 'CT2.nes', audioMuted: false,
    gameLoadAbortController: null,
    isSnes9xActive: () => false, isFbNeoActive: () => false, isMupenN64Active: () => false,
    localStorage: {
      setItem: (k, v) => { calls.push(['persist', k]); persistent.set(k, v); },
      getItem: k => { calls.push(['read', k]); return persistent.get(k) ?? null; },
    },
    readBinaryState: async k => binaryPersistent.get(k) ?? null,
    writeBinaryState: async (k, value) => { calls.push(['binary-persist', k]); binaryPersistent.set(k, value); },
    clearAudioQueue: () => calls.push(['clearAudio']),
    renderFrame: () => calls.push(['render']),
    showToast: message => calls.push(['toast', message]),
    console: { log() {}, warn() {}, error() {} },
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    TextEncoder,
    TextDecoder,
  });
  vm.runInContext(code, context);
  return { context, core, calls, persistent, binaryPersistent };
}

test('native NES uses only same-instance temporary slots and refreshes audio/video', () => {
  const { context, calls, persistent } = fixture();
  assert.equal(context.saveState(0), true);
  assert.equal(persistent.size, 0);
  assert.equal(context.loadState(0), true);
  assert.equal(calls.filter(c => c[0] === 'import').length, 1);
  assert.ok(calls.some(c => c[0] === 'clearAudio'));
  assert.ok(calls.some(c => c[0] === 'render'));
  assert.ok(!calls.some(c => c[0] === 'read' || c[0] === 'persist'));
  context.currentRomFilename = 'another.nes';
  assert.equal(context.loadState(0), false);
  context.currentRomFilename = 'CT2.nes';
  context.nes = { getCoreType: () => 'nes', importSaveState() { throw Error('must not import into replacement core'); } };
  assert.equal(context.loadState(0), false);
});

test('legacy native WASM and persistent partial saves fail closed without importing', () => {
  const { context, core, persistent, calls } = fixture();
  persistent.set(context.getSaveKey(0), '4e45535701' + '00'.repeat(12594));
  core.exportSaveState = () => persistent.get(context.getSaveKey(0));
  assert.equal(context.saveState(0), false);
  assert.equal(context.loadState(0), false);
  assert.ok(!calls.some(c => c[0] === 'import'));
  assert.equal(persistent.size, 1, 'do not destroy old files while refusing to load them');
});

test('expired native token is removed and cannot report a successful restore', () => {
  const { context, core, calls } = fixture();
  assert.equal(context.saveState(3), true);
  core.importSaveState = () => { calls.push(['expired']); return false; };
  assert.equal(context.loadState(3), false);
  assert.equal(context.loadState(3), false);
  assert.equal(calls.filter(c => c[0] === 'expired').length, 1);
});

test('native export rejects an empty persistent save', () => {
  const { context, core, calls } = fixture();
  core.exportPersistentSaveState = () => '';
  context.exportSaveToFile();
  assert.ok(calls.some(c => c[0] === 'toast'));
});

test('other native platforms retain their existing serialized storage format', () => {
  for (const type of ['gb', 'gg', 'snes', 'n64']) {
    const { context, persistent, calls } = fixture(type);
    assert.equal(context.saveState(0), true);
    assert.equal(persistent.get(context.getSaveKey(0)), 'unchanged-platform-state');
    assert.equal(context.loadState(0), true);
    assert.deepEqual(calls.find(c => c[0] === 'import'), ['import', 'unchanged-platform-state']);
  }
});

test('Snes9x and FBNeo retain binary/base64 persistence', () => {
  for (const backend of ['snes9x', 'fbneo']) {
    const { context, persistent } = fixture();
    const loaded = [];
    const binaryBackend = { saveState: () => new Uint8Array([1, 2, 255]), loadState: bytes => loaded.push([...bytes]) };
    if (backend === 'snes9x') { context.isSnes9xActive = () => true; context.snes9xBackend = binaryBackend; }
    else { context.isFbNeoActive = () => true; context.fbneoCore = binaryBackend; }
    assert.equal(context.saveState(1), true);
    assert.equal(persistent.get(context.getSaveKey(1)), 'AQL/');
    assert.equal(context.loadState(1), true);
    assert.deepEqual(loaded, [[1, 2, 255]]);
  }
});

test('native slots reject invalid indices before calling WASM', () => {
  const { context, core } = fixture();
  core.exportSaveStateForSlot = () => { throw Error('invalid slot reached WASM'); };
  for (const slot of [-1, 16, 1.5, NaN, Infinity, 2 ** 32]) {
    assert.equal(context.saveState(slot), false);
  }
});

test('actual WASM + frontend: quick-save and diagnostic exports cannot evict another user slot', () => {
  initSync({ module: fs.readFileSync(new URL('../src/wasm/nes_wasm_bg.wasm', import.meta.url)) });
  // Original synthetic NROM: INC $00; JMP $8000, with a valid reset vector.
  const rom = new Uint8Array(16 + 16384 + 8192);
  rom.set([0x4e, 0x45, 0x53, 0x1a, 1, 1]);
  rom.set([0xe6, 0, 0x4c, 0, 0x80], 16);
  rom.set([0, 0x80], 16 + 16380);
  const core = new EmuWasm();
  const { context } = fixture();
  context.nes = core;
  try {
    assert.equal(context.saveState(0), false, 'no loaded ROM');
    assert.equal(core.loadRom(rom), true);
    core.frame();
    const before = core.debugState();
    const persistentState = core.exportPersistentSaveState();
    assert.match(persistentState, /^NES-SAVE-1:/);
    const restoredCore = new EmuWasm();
    assert.equal(restoredCore.loadRom(rom), true);
    assert.equal(restoredCore.importPersistentSaveState(persistentState), true);
    assert.equal(restoredCore.debugState(), before);
    const wrongRom = rom.slice();
    wrongRom[wrongRom.length - 1] ^= 1;
    const wrongRomCore = new EmuWasm();
    assert.equal(wrongRomCore.loadRom(wrongRom), true);
    assert.equal(wrongRomCore.importPersistentSaveState(persistentState), false);
    wrongRomCore.free();
    restoredCore.free();
    assert.equal(context.saveState(1), true);
    for (let i = 0; i < 40; i++) {
      core.frame();
      assert.equal(context.saveState(0), true);
      core.exportSaveState();
    }
    assert.equal(context.loadState(1), true);
    assert.equal(core.debugState(), before);
    core.reset();
    assert.equal(context.loadState(1), true, 'reset retains same-ROM slots');
    assert.equal(core.debugState(), before);
    assert.equal(core.loadRom(rom), true);
    assert.equal(context.loadState(1), false, 'ROM reload invalidates even same JS wrapper');
  } finally {
    core.free();
  }
});

test('native state operations are blocked during ROM loading, not while paused', () => {
  const { context, calls } = fixture();
  assert.equal(context.saveState(0), true);
  context.gameLoadAbortController = {};
  assert.equal(context.saveState(0), false);
  assert.equal(context.loadState(0), false);
  assert.ok(!calls.some(c => c[0] === 'import'));
  context.gameLoadAbortController = null;
  context.isRunning = false;
  assert.equal(context.loadState(0), true);
});

test('native user saves persist through IndexedDB and restore into a replacement core', async () => {
  const { context, calls, binaryPersistent } = fixture();
  assert.equal(await context.saveStateForUser(0), true);
  assert.equal(binaryPersistent.size, 1);
  assert.ok(calls.some(call => call[0] === 'binary-persist'));

  const restoredCalls = [];
  context.nes = {
    getCoreType: () => 'nes',
    importPersistentSaveState: state => { restoredCalls.push(state); return true; },
    consumeAudioSamples: () => {},
    setAudioEnabled: () => {},
  };
  assert.equal(await context.loadStateForUser(0), true);
  assert.deepEqual(restoredCalls, ['NES-SAVE-1:test']);
});