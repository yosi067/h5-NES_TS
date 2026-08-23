import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { EmuWasm, initSync } from '../src/wasm/nes_wasm.js';

const ROM_EXTENSIONS = new Set([
  '.nes', '.gb', '.gbc', '.gg', '.sms', '.md', '.gen', '.smd', '.sfc', '.smc', '.fig', '.z64', '.n64', '.v64',
]);
const SNES_EXTENSIONS = new Set(['.sfc', '.smc', '.fig']);
const FRAME_COUNT = 600;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(entryPath));
    if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function hash(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function collectRoms(root) {
  const records = [];
  const errors = [];
  for (const filePath of await walk(root)) {
    const extension = path.extname(filePath).toLowerCase();
    if (ROM_EXTENSIONS.has(extension)) {
      const data = await readFile(filePath);
      records.push({
        name: path.basename(filePath),
        extension,
        source: path.relative(root, filePath),
        archive: null,
        data,
      });
      continue;
    }
    if (extension !== '.zip') continue;

    try {
      const zip = await JSZip.loadAsync(await readFile(filePath));
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        const entryExtension = path.extname(entry.name).toLowerCase();
        if (!ROM_EXTENSIONS.has(entryExtension)) continue;
        records.push({
          name: path.basename(entry.name),
          extension: entryExtension,
          source: path.relative(root, filePath),
          archive: entry.name,
          data: Buffer.from(await entry.async('uint8array')),
        });
      }
    } catch (error) {
      errors.push({ source: path.relative(root, filePath), error: String(error) });
    }
  }
  return { records, errors };
}

function countNonBlackPixels(emulator) {
  const pixels = new Uint8Array(
    emulator.getWasmMemory().buffer,
    emulator.getFrameBufferPtr(),
    emulator.getFrameBufferLen(),
  );
  let count = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset] + pixels[offset + 1] + pixels[offset + 2] > 0) count++;
  }
  return count;
}

function bootRom(record) {
  if (record.extension === '.z64' || record.extension === '.n64' || record.extension === '.v64'
    || record.extension === '.md' || record.extension === '.gen' || record.extension === '.smd') {
    return { status: 'external-runtime', loaded: null, nonBlackPixels: null };
  }

  const emulator = new EmuWasm();
  try {
    let loaded = false;
    if (SNES_EXTENSIONS.has(record.extension)) loaded = emulator.loadSnesRom(record.data);
    else if (record.extension === '.gg') loaded = emulator.loadGgRom(record.data);
    else if (record.extension === '.sms') loaded = emulator.loadSmsRom(record.data);
    else loaded = emulator.loadRom(record.data);

    if (!loaded) return { status: 'load-failed', loaded, nonBlackPixels: 0 };
    for (let frame = 0; frame < FRAME_COUNT; frame++) emulator.frame();
    const nonBlackPixels = countNonBlackPixels(emulator);
    return {
      status: nonBlackPixels > 0 ? 'playable' : 'blank-framebuffer',
      loaded,
      width: emulator.getScreenWidth(),
      height: emulator.getScreenHeight(),
      nonBlackPixels,
    };
  } catch (error) {
    return { status: 'runtime-error', loaded: false, nonBlackPixels: 0, error: String(error) };
  } finally {
    emulator.free();
  }
}

const [sourceRoot, targetRoot, reportPath] = process.argv.slice(2);
if (!sourceRoot || !targetRoot) {
  console.error('Usage: node tools/audit-rom-library.mjs <source> <target> [report.json]');
  process.exitCode = 1;
} else {
  initSync({ module: await readFile(new URL('../src/wasm/nes_wasm_bg.wasm', import.meta.url)) });
  const [{ records: sourceRecords, errors }, { records: targetRecords }] = await Promise.all([
    collectRoms(sourceRoot),
    collectRoms(targetRoot),
  ]);
  const targetHashes = new Map(targetRecords.map(record => [hash(record.data), record.name]));
  const uniqueSource = new Map();
  for (const record of sourceRecords) {
    const sha256 = hash(record.data);
    if (!uniqueSource.has(sha256)) uniqueSource.set(sha256, { ...record, sha256 });
  }

  const games = [];
  for (const record of uniqueSource.values()) {
    const existing = targetHashes.get(record.sha256) ?? null;
    const result = existing ? { status: 'existing', loaded: null, nonBlackPixels: null } : bootRom(record);
    games.push({
      name: record.name,
      extension: record.extension,
      source: record.source,
      archive: record.archive,
      bytes: record.data.length,
      sha256: record.sha256,
      existing,
      ...result,
    });
  }

  const report = {
    sourceRoot,
    targetRoot,
    scannedFiles: sourceRecords.length,
    uniqueRoms: games.length,
    statusCounts: Object.fromEntries(
      [...new Set(games.map(game => game.status))].sort().map(status => [
        status,
        games.filter(game => game.status === status).length,
      ]),
    ),
    archiveErrors: errors,
    games: games.sort((left, right) => left.name.localeCompare(right.name)),
  };
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (reportPath) await writeFile(reportPath, output, 'utf8');
  else process.stdout.write(output);
}