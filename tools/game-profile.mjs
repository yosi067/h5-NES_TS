import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { parse, printParseErrorCode } from 'jsonc-parser';

const PROFILE_SCHEMA_VERSION = 1;
const CATALOG_SCHEMA_VERSION = 1;
const CATEGORIES = new Set(['dialogue', 'battleMessage', 'interface', 'menu', 'dictionary']);
const require = createRequire(import.meta.url);
const RomPatcher = require('rom-patcher/rom-patcher-js/RomPatcher');
const BinFile = require('rom-patcher/rom-patcher-js/modules/BinFile');

function fail(message) {
  throw new Error(message);
}

export function readJsonc(filePath) {
  const errors = [];
  const value = parse(fs.readFileSync(filePath, 'utf8'), errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0) {
    const detail = errors.map(error => `${printParseErrorCode(error.error)} at ${error.offset}`).join(', ');
    fail(`Invalid JSONC in ${filePath}: ${detail}`);
  }
  return value;
}

export function validateRuntimeProfile(profile) {
  if (!profile || profile.schemaVersion !== PROFILE_SCHEMA_VERSION) fail('Unsupported runtime profile schema');
  if (typeof profile.id !== 'string' || profile.id.trim() === '') fail('Profile id is required');
  if (!/^[0-9a-f]{64}$/i.test(profile.game?.sha256 ?? '')) fail('Profile game.sha256 is invalid');
  if (!Array.isArray(profile.game?.sha256Aliases ?? [])) fail('Profile game.sha256Aliases is invalid');
  for (const hash of profile.game?.sha256Aliases ?? []) {
    if (!/^[0-9a-f]{64}$/i.test(hash)) fail('Profile game.sha256Aliases contains an invalid hash');
  }
  if (!Number.isInteger(profile.game?.mapper) || profile.game.mapper < 0 || profile.game.mapper > 255) {
    fail('Profile game.mapper is invalid');
  }
  for (const key of ['prgReadOverlays', 'chrReadOverlays']) {
    const offsets = new Set();
    for (const overlay of profile[key] ?? []) {
      if (!overlay.id || !Number.isInteger(overlay.offset) || overlay.offset < 0) fail(`Invalid ${key} entry`);
      if (offsets.has(overlay.offset)) fail(`Duplicate ${key} offset ${overlay.offset}`);
      offsets.add(overlay.offset);
      for (const byteKey of ['expectedOriginal', 'value']) {
        if (!Number.isInteger(overlay[byteKey]) || overlay[byteKey] < 0 || overlay[byteKey] > 255) {
          fail(`Invalid ${key} ${byteKey} for ${overlay.id}`);
        }
      }
    }
  }
  const pageIds = new Set();
  for (const page of profile.chrOverlayPages ?? []) {
    if (!page.id || pageIds.has(page.id)
        || !Number.isInteger(page.guard?.address) || page.guard.address < 0x2000 || page.guard.address > 0x2fff
        || !Number.isInteger(page.guard?.value) || page.guard.value < 0 || page.guard.value > 255
        || (page.guard.requireActiveTable !== undefined && typeof page.guard.requireActiveTable !== 'boolean')) {
      fail(`Invalid CHR overlay page ${page.id ?? '<unknown>'}`);
    }
    pageIds.add(page.id);
    const offsets = new Set();
    for (const overlay of page.overlays ?? []) {
      if (!overlay.id || !Number.isInteger(overlay.offset) || overlay.offset < 0
          || offsets.has(overlay.offset)
          || !Number.isInteger(overlay.expectedOriginal) || overlay.expectedOriginal < 0 || overlay.expectedOriginal > 255
          || !Number.isInteger(overlay.value) || overlay.value < 0 || overlay.value > 255) {
        fail(`Invalid CHR overlay in page ${page.id}`);
      }
      offsets.add(overlay.offset);
    }
    if (offsets.size === 0) fail(`CHR overlay page ${page.id} is empty`);
  }
  for (const write of profile.memoryWrites ?? []) {
    const validAddress = write.space === 'cpuRam'
      ? Number.isInteger(write.address) && write.address >= 0 && write.address <= 0x07ff
      : write.space === 'prgRam' && Number.isInteger(write.address)
        && write.address >= 0x6000 && write.address <= 0x7fff;
    if (!write.id || !validAddress || !Number.isInteger(write.value)
        || write.value < 0 || write.value > 255 || !['reset', 'frame'].includes(write.apply)) {
      fail(`Invalid memory write ${write.id ?? '<unknown>'}`);
    }
  }
  return profile;
}

export function validateCatalog(catalog) {
  if (!catalog || catalog.schemaVersion !== CATALOG_SCHEMA_VERSION) fail('Unsupported translation catalog schema');
  if (!catalog.profileId || !catalog.sourceLocale || !catalog.targetLocale) fail('Catalog metadata is incomplete');
  const categorySet = new Set(catalog.categories ?? []);
  for (const category of categorySet) if (!CATEGORIES.has(category)) fail(`Unknown category ${category}`);
  const ids = new Set();
  for (const unit of catalog.units ?? []) {
    if (!unit.id || ids.has(unit.id)) fail(`Duplicate or empty unit id ${unit.id ?? '<empty>'}`);
    ids.add(unit.id);
    if (!categorySet.has(unit.category)) fail(`Unit ${unit.id} has undeclared category ${unit.category}`);
    if (typeof unit.source !== 'string' || typeof unit.target !== 'string') fail(`Unit ${unit.id} text is invalid`);
    if (!Array.isArray(unit.placeholders)) fail(`Unit ${unit.id} placeholders must be an array`);
    validatePlaceholders(unit);
  }
  return catalog;
}

function validatePlaceholders(unit) {
  if (!unit.target) return;
  for (const placeholder of unit.placeholders) {
    if (!unit.source.includes(placeholder)) fail(`Unit ${unit.id} source is missing placeholder ${placeholder}`);
    if (!unit.target.includes(placeholder)) fail(`Unit ${unit.id} target is missing placeholder ${placeholder}`);
  }
}

function selectedUnits(catalog, categoryOption) {
  if (!categoryOption) return catalog.units;
  const selected = new Set(categoryOption.split(',').filter(Boolean));
  for (const category of selected) if (!CATEGORIES.has(category)) fail(`Unknown category ${category}`);
  return catalog.units.filter(unit => selected.has(unit.category));
}

export function exportJsonl(catalog, categoryOption) {
  return selectedUnits(validateCatalog(catalog), categoryOption)
    .map(unit => JSON.stringify(unit))
    .join('\n') + (catalog.units.length > 0 ? '\n' : '');
}

export function exportXliff(catalog, categoryOption) {
  validateCatalog(catalog);
  const units = selectedUnits(catalog, categoryOption).map(unit => ({
    '@_id': unit.id,
    notes: {
      note: [
        { '@_category': 'category', '#text': unit.category },
        { '@_category': 'context', '#text': unit.context },
        { '@_category': 'placeholders', '#text': JSON.stringify(unit.placeholders) },
      ],
    },
    segment: {
      source: unit.source,
      target: unit.target,
    },
  }));
  const document = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    xliff: {
      '@_xmlns': 'urn:oasis:names:tc:xliff:document:2.0',
      '@_version': '2.1',
      '@_srcLang': catalog.sourceLocale,
      '@_trgLang': catalog.targetLocale,
      file: { '@_id': catalog.profileId, unit: units },
    },
  };
  return new XMLBuilder({ ignoreAttributes: false, format: true, suppressEmptyNode: false }).build(document);
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return String(value['#text'] ?? '');
  return String(value);
}

export function importJsonl(catalog, text) {
  const updates = new Map();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let unit;
    try {
      unit = JSON.parse(line);
    } catch (error) {
      fail(`Invalid JSONL at line ${index + 1}: ${error.message}`);
    }
    if (!unit.id || updates.has(unit.id)) fail(`Duplicate or empty imported unit id at line ${index + 1}`);
    updates.set(unit.id, String(unit.target ?? ''));
  }
  return mergeTargets(catalog, updates);
}

export function importXliff(catalog, text) {
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: false });
  let document;
  try {
    document = parser.parse(text);
  } catch (error) {
    fail(`Invalid XLIFF: ${error.message}`);
  }
  const xliff = document?.xliff;
  if (xliff?.['@_version'] !== '2.1') fail('Only XLIFF 2.1 is supported');
  const updates = new Map();
  for (const unit of asArray(xliff?.file?.unit)) {
    const id = unit?.['@_id'];
    if (!id || updates.has(id)) fail(`Duplicate or empty XLIFF unit id ${id ?? '<empty>'}`);
    const segment = asArray(unit.segment)[0];
    updates.set(id, textValue(segment?.target));
  }
  return mergeTargets(catalog, updates);
}

function mergeTargets(catalog, updates) {
  validateCatalog(catalog);
  const knownIds = new Set(catalog.units.map(unit => unit.id));
  for (const id of updates.keys()) if (!knownIds.has(id)) fail(`Imported unit ${id} does not exist in the catalog`);
  const merged = {
    ...catalog,
    units: catalog.units.map(unit => updates.has(unit.id) ? { ...unit, target: updates.get(unit.id) } : unit),
  };
  validateCatalog(merged);
  return merged;
}

function inspectNesRom(rom) {
  if (rom.length < 16 || rom.subarray(0, 4).toString('binary') !== 'NES\x1a') fail('ROM is not an iNES image');
  const flags6 = rom[6];
  const mapper = (rom[7] & 0xf0) | (flags6 >> 4);
  const dataOffset = 16 + ((flags6 & 0x04) !== 0 ? 512 : 0);
  const prgSize = rom[4] * 16 * 1024;
  const chrSize = rom[5] * 8 * 1024;
  if (dataOffset + prgSize + chrSize > rom.length) fail('ROM is truncated');
  return {
    sha256: crypto.createHash('sha256').update(rom).digest('hex'),
    mapper,
    prg: rom.subarray(dataOffset, dataOffset + prgSize),
    chr: rom.subarray(dataOffset + prgSize, dataOffset + prgSize + chrSize),
  };
}

export function verifyProfileAgainstRom(profile, rom) {
  validateRuntimeProfile(profile);
  const inspected = inspectNesRom(rom);
  const acceptedHashes = [profile.game.sha256, ...(profile.game.sha256Aliases ?? [])]
    .map(hash => hash.toLowerCase());
  if (!acceptedHashes.includes(inspected.sha256)) fail('ROM SHA-256 does not match profile');
  if (inspected.mapper !== profile.game.mapper) fail(`ROM mapper ${inspected.mapper} does not match profile`);
  for (const [kind, data, overlays] of [
    ['PRG', inspected.prg, profile.prgReadOverlays ?? []],
    ['CHR', inspected.chr, profile.chrReadOverlays ?? []],
  ]) {
    for (const overlay of overlays) {
      if (overlay.offset >= data.length) fail(`${kind} overlay ${overlay.id} is outside the ROM`);
      if (data[overlay.offset] !== overlay.expectedOriginal) {
        fail(`${kind} overlay ${overlay.id} expected 0x${overlay.expectedOriginal.toString(16).padStart(2, '0')}, found 0x${data[overlay.offset].toString(16).padStart(2, '0')}`);
      }
    }
  }
  return inspected;
}

export function validatePresentation(presentation, profileId) {
  if (!presentation || presentation.schemaVersion !== 1) fail('Unsupported presentation schema');
  if (presentation.profileId !== profileId) fail('Presentation profileId does not match runtime profile');
  if (!Number.isInteger(presentation.inputArmFrame) || presentation.inputArmFrame < 0) {
    fail('Presentation inputArmFrame is invalid');
  }
  const ids = new Set();
  for (const cue of presentation.cues ?? []) {
    if (!cue.id || ids.has(cue.id)) fail(`Duplicate or empty presentation cue ${cue.id ?? '<empty>'}`);
    ids.add(cue.id);
    if (!['frame', 'afterInput'].includes(cue.trigger?.type)
        || !Number.isInteger(cue.trigger.from) || cue.trigger.from < 0
        || (cue.trigger.to !== undefined && (!Number.isInteger(cue.trigger.to) || cue.trigger.to < cue.trigger.from))) {
      fail(`Presentation cue ${cue.id} has an invalid trigger`);
    }
    if (cue.regionGuard) {
      const guard = cue.regionGuard;
      if (![guard.x, guard.y, guard.width, guard.height].every(Number.isInteger)
          || guard.x < 0 || guard.y < 0 || guard.width <= 0 || guard.height <= 0
          || !/^[0-9a-f]{8}$/.test(guard.hash)
          || (guard.sampleStep !== undefined && (!Number.isInteger(guard.sampleStep) || guard.sampleStep <= 0))) {
        fail(`Presentation cue ${cue.id} has an invalid region guard`);
      }
    }
    for (const mask of cue.masks ?? []) {
      if (![mask.x, mask.y, mask.width, mask.height].every(Number.isInteger)
          || mask.width <= 0 || mask.height <= 0) fail(`Presentation cue ${cue.id} has an invalid mask`);
    }
    for (const label of cue.labels ?? []) {
      if (typeof label.text !== 'string' || !Number.isInteger(label.x) || !Number.isInteger(label.y)
          || !Number.isInteger(label.size) || label.size <= 0) fail(`Presentation cue ${cue.id} has an invalid label`);
    }
  }
  return presentation;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function applyBpsForBuild(sourceBytes, patchBytes) {
  const sourceFile = new BinFile(Uint8Array.from(sourceBytes));
  const patchFile = new BinFile(Uint8Array.from(patchBytes));
  const patch = RomPatcher.parsePatchFile(patchFile);
  if (!patch || !patch.toString().startsWith('Source size:')) fail('Invalid BPS patch');
  return Buffer.from(RomPatcher.applyPatch(sourceFile, patch, { requireValidation: true })._u8array);
}

export async function compileGmod(profile, presentation = null, patchBundle = null) {
  validateRuntimeProfile(profile);
  const zip = new JSZip();
  let manifest;
  let includeRuntime = true;
  if (patchBundle) {
    const sourceSha256 = sha256(patchBundle.sourceRomBytes);
    const rebuiltTarget = applyBpsForBuild(patchBundle.sourceRomBytes, patchBundle.patchBytes);
    const targetRomBytes = Buffer.from(patchBundle.targetRomBytes);
    if (!rebuiltTarget.equals(targetRomBytes)) fail('BPS output does not match the target ROM');
    const targetSha256 = sha256(targetRomBytes);
    includeRuntime = patchBundle.includeRuntime === true;
    if (includeRuntime) {
      const acceptedRuntimeTargets = [profile.game.sha256, ...(profile.game.sha256Aliases ?? [])];
      if (!acceptedRuntimeTargets.includes(targetSha256)) {
        fail('Runtime profile does not match the BPS target ROM');
      }
    }
    manifest = {
      format: 'gmod',
      formatVersion: 2,
      profileId: profile.id,
      platform: 'nes',
      source: { sha256: sourceSha256 },
      target: { sha256: targetSha256 },
      patch: { format: 'bps', file: 'patch.bps' },
      ...(includeRuntime ? { runtime: { file: 'runtime.json' } } : {}),
      ...(presentation ? { presentation: { file: 'presentation.json' } } : {}),
    };
    zip.file('patch.bps', patchBundle.patchBytes);
  } else {
    manifest = {
      format: 'gmod',
      formatVersion: 1,
      profileId: profile.id,
      platform: 'nes',
      game: profile.game,
    };
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  if (includeRuntime) zip.file('runtime.json', JSON.stringify(profile));
  if (presentation) {
    validatePresentation(presentation, profile.id);
    zip.file('presentation.json', JSON.stringify(presentation));
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) fail(`Unexpected argument ${token}`);
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${token}`);
    options[token.slice(2)] = value;
    index += 1;
  }
  return { command, options };
}

function required(options, name) {
  if (!options[name]) fail(`Missing --${name}`);
  return options[name];
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArguments(argv);
  if (command === 'verify') {
    const profile = readJsonc(required(options, 'profile'));
    const rom = fs.readFileSync(required(options, 'rom'));
    const inspected = verifyProfileAgainstRom(profile, rom);
    console.log(`Verified ${profile.id}: SHA-256 ${inspected.sha256}, mapper ${inspected.mapper}`);
    return;
  }
  if (command === 'export') {
    const catalog = readJsonc(required(options, 'catalog'));
    const format = required(options, 'format');
    const output = required(options, 'output');
    const text = format === 'jsonl' ? exportJsonl(catalog, options.category)
      : format === 'xliff' ? exportXliff(catalog, options.category)
        : fail(`Unsupported export format ${format}`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, text);
    console.log(`Exported ${selectedUnits(catalog, options.category).length} units to ${output}`);
    return;
  }
  if (command === 'import') {
    const catalog = readJsonc(required(options, 'catalog'));
    const input = fs.readFileSync(required(options, 'input'), 'utf8');
    const format = required(options, 'format');
    const merged = format === 'jsonl' ? importJsonl(catalog, input)
      : format === 'xliff' ? importXliff(catalog, input)
        : fail(`Unsupported import format ${format}`);
    const output = required(options, 'output');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(merged, null, 2)}\n`);
    console.log(`Imported translations to ${output}`);
    return;
  }
  if (command === 'compile') {
    const profile = readJsonc(required(options, 'profile'));
    const presentation = options.presentation ? readJsonc(options.presentation) : null;
    const patchBundle = options.patch ? {
      patchBytes: fs.readFileSync(options.patch),
      sourceRomBytes: fs.readFileSync(required(options, 'source-rom')),
      targetRomBytes: fs.readFileSync(required(options, 'target-rom')),
      includeRuntime: options['include-runtime'] === 'true',
    } : null;
    const output = required(options, 'output');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, await compileGmod(profile, presentation, patchBundle));
    console.log(`Compiled ${profile.id} to ${output}`);
    return;
  }
  fail('Usage: game-profile <verify|export|import|compile> [options]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
