#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeSources, loadRom } from './decode-zombie-hunter-stream.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ROM = path.join(ROOT, 'roms', 'Zombie Hunter (Japan).nes');
const DEFAULT_OUTPUT = path.join(ROOT, 'artifacts', 'zombie-hunter-verified-inventory.json');
const VERIFIED_SHA256 = '91dfb1a0c29f78c5d5b0a582c737c62103c4009ad5e2c20fdecd0c22a8648a48';

const VERIFIED_FAMILIES = [
  {
    id: 'title-push-start-botton',
    domain: 'title-menu',
    sourceBank: 0,
    sourceCpuAddresses: [0x8ed2, 0x8e81, 0x8ddb, 0x8e32, 0x8dc5, 0x8d6f],
    verifiedTextRuns: [{ start: 274, end: 291 }],
    runtimeProof: {
      status: 'runtime-confirmed',
      sourceCopyPc: '0x8B56',
      rendererPc: '0xF4A6',
      ppuStart: '0x22A7',
      promptTile: '0x19',
      promptChrOffset: '0x6190',
    },
  },
];

function optionValue(name, fallback) {
  const argument = process.argv.find(value => value.startsWith(`${name}=`));
  return argument ? argument.slice(name.length + 1) : fallback;
}

function buildVerifiedInventory(romPath = DEFAULT_ROM) {
  const image = loadRom(romPath);
  if (image.sha256 !== VERIFIED_SHA256) {
    throw new Error(`unexpected Zombie Hunter ROM SHA-256: ${image.sha256}`);
  }

  const entries = VERIFIED_FAMILIES.map(family => {
    const decoded = decodeSources(romPath, family.sourceBank, family.sourceCpuAddresses);
    const verifiedTextRuns = decoded.visibleRuns.filter(run => family.verifiedTextRuns.some(expected => (
      run.start === expected.start && run.end === expected.end
    )));
    if (verifiedTextRuns.length !== family.verifiedTextRuns.length) {
      throw new Error(`verified text run mismatch for ${family.id}`);
    }
    const parsedGlyphs = decoded.visibleRuns.flatMap(run => run.data);
    const visibleGlyphs = verifiedTextRuns.flatMap(run => run.data);
    const distinctGlyphs = [...new Set(visibleGlyphs)].sort((left, right) => left - right);
    return {
      id: family.id,
      domain: family.domain,
      kind: 'runtime-visible-text',
      verification: family.runtimeProof,
      source: {
        bank: decoded.bank,
        cpuAddresses: family.sourceCpuAddresses.map(address => `0x${address.toString(16).toUpperCase().padStart(4, '0')}`),
        prgOffsets: decoded.sources.map(source => source.prgOffset),
        raw: decoded.raw,
        rawHex: decoded.rawHex,
        records: decoded.records,
        parsedVisibleRuns: decoded.visibleRuns,
        verifiedTextRuns,
      },
      counts: {
        commandRecords: decoded.records.filter(record => record.kind !== 'direct-write-run' && record.kind !== 'end').length,
        parsedVisibleRuns: decoded.visibleRuns.length,
        parsedGlyphs: parsedGlyphs.length,
        verifiedTextRuns: verifiedTextRuns.length,
        visibleGlyphs: visibleGlyphs.length,
        distinctGlyphs: distinctGlyphs.length,
        distinctGlyphValues: distinctGlyphs,
      },
    };
  });

  return {
    schemaVersion: 1,
    id: 'zombie-hunter-runtime-evidence',
    status: 'partial-runtime-verified',
    rom: {
      name: path.basename(romPath),
      sha256: image.sha256,
      mapper: image.mapper,
    },
    extractionPolicy: {
      includeOnlyRuntimeConfirmedText: true,
      excludeStaticCandidatesUntilRendered: true,
      preserveRawBytes: true,
      preserveCommandRecords: true,
    },
    counts: {
      verifiedTextFamilies: entries.length,
      verifiedVisibleGlyphs: entries.reduce((sum, entry) => sum + entry.counts.visibleGlyphs, 0),
      verifiedDistinctGlyphs: new Set(entries.flatMap(entry => entry.counts.distinctGlyphValues)).size,
      verifiedTranslationUnits: entries.length,
      staticCandidatesExcluded: true,
    },
    translation: {
      catalogCreated: false,
      status: 'blocked-until-runtime-inventory-complete',
    },
    verifiedEntries: entries,
  };
}

function writeVerifiedInventory(outputPath = DEFAULT_OUTPUT, romPath = DEFAULT_ROM) {
  const report = buildVerifiedInventory(romPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const romPath = path.resolve(optionValue('--rom', DEFAULT_ROM));
  const outputPath = path.resolve(optionValue('--output', DEFAULT_OUTPUT));
  const report = writeVerifiedInventory(outputPath, romPath);
  console.log(JSON.stringify({ output: outputPath, counts: report.counts, translation: report.translation }, null, 2));
}

export { buildVerifiedInventory, writeVerifiedInventory };