import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual main.ts save/load functions without booting the UI or WASM.
const source = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const names = new Set(['getSaveKey', 'saveState', 'loadState', 'exportSaveToFile', 'bytesToBase64', 'base64ToBytes']);
const declarations = ast.statements.filter(node =>
  ts.isFunctionDeclaration(node) && names.has(node.name?.text)
  || ts.isVariableStatement(node) && node.declarationList.declarations.some(d =>
    ['SAVE_STATE_PREFIX', 'nesTemporaryStates', 'NES_TEMP_STATE_PREFIX'].includes(d.name.getText(ast))));
const code = ts.transpileModule(declarations.map(n => n.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(type = 'nes') {
  const persistent = new Map();
  const calls = [];
  let next = 0;
  const core = {
    getCoreType: () => type,
    exportSaveState: () => type === 'nes' ? `4e45535701#NES-TEMP-2:test:${next++}` : 'unchanged-platform-state',
    importSaveState: state => { calls.push(['import', state]); return true; },
    consumeAudioSamples: () => calls.push(['consume']),
    setAudioEnabled: enabled => calls.push(['audio', enabled]),
  };
  const context = vm.createContext({
    nes: core, activeBackend: 'wasm', currentRomFilename: 'CT2.nes', audioMuted: false,
    isSnes9xActive: () => false, isFbNeoActive: () => false, isMupenN64Active: () => false,
    localStorage: {
      setItem: (k, v) => { calls.push(['persist', k]); persistent.set(k, v); },
      getItem: k => { calls.push(['read', k]); return persistent.get(k) ?? null; },
    },
    clearAudioQueue: () => calls.push(['clearAudio']),
    renderFrame: () => calls.push(['render']),
    showToast: message => calls.push(['toast', message]),
    console: { log() {}, warn() {}, error() {} },
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
  });
  vm.runInContext(code, context);
  return { context, core, calls, persistent };
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

test('native export never downloads a session-only token', () => {
  const { context, calls } = fixture();
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