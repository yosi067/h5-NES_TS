#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadRom,
  parseDirectStream,
  readStream,
  sourceOffset,
} from './decode-zombie-hunter-stream.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ROM = path.join(ROOT, 'roms', 'Zombie Hunter (Japan).nes');
const DEFAULT_OUTPUT = path.join(ROOT, 'artifacts', 'zombie-hunter-static-candidates.json');
const VERIFIED_SHA256 = '91dfb1a0c29f78c5d5b0a582c737c62103c4009ad5e2c20fdecd0c22a8648a48';

const POINTER_TABLES = [
  {
    id: 'program-table-a',
    domain: 'static-text-domain-a',
    bank: 0,
    cpuAddress: 0x8f0e,
    count: 34,
    pointerReadPc: ['0x88FE', '0x8901'],
  },
  {
    id: 'program-table-b',
    domain: 'credits',
    bank: 0,
    cpuAddress: 0x9165,
    count: 40,
    pointerReadPc: ['0x8907', '0x890A'],
  },
];

const PROGRAM_COPY_ROUTINES = [
  {
    id: 'copy-stream',
    cpuAddress: 0x8b56,
    copyMode: 'direct-source',
  },
  {
    id: 'copy-stream-with-control-flags',
    cpuAddress: 0x8b52,
    copyMode: 'control-flagged-source',
  },
];

function hex(value, width = 2) {
  return value.toString(16).padStart(width, '0');
}

function cpuAddress(value) {
  return `0x${hex(value, 4).toUpperCase()}`;
}

function prgOffset(value) {
  return `0x${hex(value, 5).toUpperCase()}`;
}

function rawHex(bytes) {
  return bytes.map(value => hex(value)).join(' ');
}

function bankCpuBase(bank, prgLength) {
  return bank === Math.floor(prgLength / 0x4000) - 1 ? 0xc000 : 0x8000;
}

function bankCpuAddress(bank, offset, prgLength) {
  return bankCpuBase(bank, prgLength) + (offset % 0x4000);
}

function readStaticStream(image, bank, address) {
  const offset = sourceOffset(bank, address, image.prg.length);
  const raw = readStream(image.prg, offset);
  const parsed = parseDirectStream(raw);
  const visibleRuns = parsed.visibleRuns.map(run => ({
    start: run.start,
    end: run.end,
    data: run.data,
    decoded: run.decoded,
  }));

  return {
    cpuAddress: cpuAddress(address),
    prgOffset: prgOffset(offset),
    raw: parsed.raw,
    rawHex: rawHex(parsed.raw),
    records: parsed.records,
    visibleRuns,
    decodedRuns: visibleRuns.map(run => run.decoded),
    decodedText: visibleRuns.map(run => run.decoded).join(''),
    roundTrip: parsed.roundTrip,
    counts: {
      bytes: parsed.raw.length,
      commandRecords: parsed.records.filter(record => !['direct-write-run', 'end'].includes(record.kind)).length,
      visibleRuns: visibleRuns.length,
      visibleGlyphs: visibleRuns.reduce((sum, run) => sum + run.data.length, 0),
    },
  };
}

function readPointerTable(image, table) {
  const tableOffset = sourceOffset(table.bank, table.cpuAddress, image.prg.length);
  const entries = [];
  for (let index = 0; index < table.count; index += 1) {
    const offset = tableOffset + index * 2;
    const pointer = image.prg[offset] | (image.prg[offset + 1] << 8);
    const stream = readStaticStream(image, table.bank, pointer);
    entries.push({
      index,
      pointer: cpuAddress(pointer),
      staticStatus: stream.visibleRuns.length > 0 ? 'text-candidate' : 'empty-entry',
      stream,
    });
  }
  return {
    id: table.id,
    domain: table.domain,
    bank: table.bank,
    cpuAddress: cpuAddress(table.cpuAddress),
    prgOffset: prgOffset(tableOffset),
    count: table.count,
    pointerReadPc: table.pointerReadPc,
    copyRoutinePc: '0x8ABC',
    terminator: '00 81',
    entries,
  };
}

function findProgramCopySites(image) {
  const bankSize = 0x4000;
  const fixedBank = Math.floor(image.prg.length / bankSize) - 1;
  const sites = [];

  for (let codeBank = 0; codeBank <= fixedBank; codeBank += 1) {
    const bankStart = codeBank * bankSize;
    for (let relativeOffset = 0; relativeOffset + 6 < bankSize; relativeOffset += 1) {
      const offset = bankStart + relativeOffset;
      if (image.prg[offset] !== 0xa9 || image.prg[offset + 2] !== 0xa2) continue;
      if (image.prg[offset + 4] !== 0x20) continue;

      const routineAddress = image.prg[offset + 5] | (image.prg[offset + 6] << 8);
      const routine = PROGRAM_COPY_ROUTINES.find(item => item.cpuAddress === routineAddress);
      if (!routine) continue;

      const sourceCpu = image.prg[offset + 1] << 8 | image.prg[offset + 3];
      const sourceBank = sourceCpu >= 0xc000 ? fixedBank : codeBank;
      const source = readStaticStream(image, sourceBank, sourceCpu);
      sites.push({
        id: `program-copy-${sites.length.toString().padStart(2, '0')}`,
        codeBank,
        callerPc: cpuAddress(bankCpuAddress(codeBank, relativeOffset, image.prg.length)),
        sourceBank,
        sourceCpuAddress: cpuAddress(sourceCpu),
        routine: routine.id,
        routinePc: cpuAddress(routine.cpuAddress),
        copyMode: routine.copyMode,
        staticStatus: 'program-referenced-source',
        source,
      });
    }
  }

  return sites;
}

function extractStaticProgramData(romPath = DEFAULT_ROM) {
  const image = loadRom(romPath);
  if (image.sha256 !== VERIFIED_SHA256) {
    throw new Error(`unexpected Zombie Hunter ROM SHA-256: ${image.sha256}`);
  }

  const pointerTables = POINTER_TABLES.map(table => readPointerTable(image, table));
  const programCopySites = findProgramCopySites(image);
  const entries = pointerTables.flatMap(table => table.entries.map(entry => ({
    id: `${table.id}-${entry.index.toString().padStart(2, '0')}`,
    domain: table.domain,
    kind: entry.staticStatus,
    verification: {
      status: 'static-program-referenced',
      runtimeConfirmed: false,
      pointerTable: table.cpuAddress,
      pointerReadPc: table.pointerReadPc,
      copyRoutinePc: table.copyRoutinePc,
    },
    pointer: entry.pointer,
    source: entry.stream,
  })));

  return {
    schemaVersion: 1,
    id: 'zombie-hunter-static-program-extraction',
    status: 'static-program-extracted',
    rom: {
      name: path.basename(romPath),
      sha256: image.sha256,
      mapper: image.mapper,
    },
    extractionPolicy: {
      requiresRuntimeExecution: false,
      sourceOnly: true,
      preserveRawBytes: true,
      preserveCommandRecords: true,
      runtimeConfirmationRequiredBeforeTranslation: true,
    },
    programPaths: [
      {
        id: 'selected-pointer-to-command-stream',
        selectorPc: '0x8902',
        copyRoutinePc: '0x8ABC',
        streamTerminator: '00 81',
        note: 'The pointer tables are read from ROM and copied into the command buffer by program code.',
      },
      {
        id: 'immediate-pointer-to-copy-routine',
        discovery: 'LDA immediate high byte, LDX immediate low byte, followed by JSR to a copy routine',
        copyRoutines: PROGRAM_COPY_ROUTINES.map(routine => ({
          id: routine.id,
          cpuAddress: cpuAddress(routine.cpuAddress),
          copyMode: routine.copyMode,
        })),
        siteCount: programCopySites.length,
        note: 'These sites expose composite sources assembled by program code, including title-screen assets.',
      },
    ],
    counts: {
      pointerTables: pointerTables.length,
      staticEntries: entries.length,
      textCandidates: entries.filter(entry => entry.kind === 'text-candidate').length,
      emptyEntries: entries.filter(entry => entry.kind === 'empty-entry').length,
      runtimeConfirmedEntries: 0,
      programCopySites: programCopySites.length,
      distinctProgramCopySources: new Set(programCopySites.map(site => `${site.sourceBank}:${site.sourceCpuAddress}`)).size,
    },
    pointerTables,
    programCopySites,
    entries,
  };
}

function optionValue(name, fallback) {
  const argument = process.argv.find(value => value.startsWith(`${name}=`));
  return argument ? argument.slice(name.length + 1) : fallback;
}

function writeStaticProgramData(outputPath = DEFAULT_OUTPUT, romPath = DEFAULT_ROM) {
  const report = extractStaticProgramData(romPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const romPath = path.resolve(optionValue('--rom', DEFAULT_ROM));
  const outputPath = path.resolve(optionValue('--output', DEFAULT_OUTPUT));
  const report = writeStaticProgramData(outputPath, romPath);
  console.log(JSON.stringify({ output: outputPath, counts: report.counts }, null, 2));
}

export { extractStaticProgramData, findProgramCopySites, readPointerTable, writeStaticProgramData };