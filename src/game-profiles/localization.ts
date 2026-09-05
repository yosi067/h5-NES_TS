export const CT2_SOURCE_HASHES = [
  'bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746',
  'ee08f9134ef0e9e3a5f77e4f08244d24739c68d781cb58e2be737916bb3ab5ae',
];
export const LOCALIZATION_STORAGE_KEY = 'nes-localization:captain-tsubasa-2-jp:zh-Hant:v1';
export interface LocalizationEntry { id: string; category: string; source: string; translation: string; notes?: string }
export interface LocalizationCatalog {
  format: 'nes-localization'; version: 1; gameId: string; sourceSha256: string;
  locale: string; entries: LocalizationEntry[]; values: [];
}
export interface TextRun { id: string; scene: string; line: string; offset: number; bytes: number[]; domain?: 'battle' }
export interface TextRuntime {
  version: number; sourceSha256: string; sourceHashes: string[];
  scenes: { id: string; start: number; length: number }[];
  runs: TextRun[]; lowerTiles: number[];
  fontAliases?: number[][];
}
export interface LocalizationAssets { catalog: LocalizationCatalog; runtime: TextRuntime; menus?: import('./menu-localization').MenuAssets }

/** All immutable identity/source fields are compared; a bad draft is never partially applied. */
export function mergeLocalizationDraft(base: LocalizationCatalog, input: unknown): LocalizationCatalog {
  const value = input as LocalizationCatalog;
  if (!value || value.format !== base.format || value.version !== 1 || value.gameId !== base.gameId
      || value.sourceSha256 !== base.sourceSha256 || value.locale !== base.locale
      || !Array.isArray(value.values) || value.values.length || !Array.isArray(value.entries)
      || value.entries.length !== base.entries.length) throw new Error('翻譯檔的遊戲、來源或完整性不符');
  const byId = new Map<string, LocalizationEntry>();
  for (const entry of value.entries) {
    if (!entry || typeof entry.id !== 'string' || byId.has(entry.id)
        || !entry.id || entry.id.length > 256 || typeof entry.source !== 'string' || entry.source.length > 16384
        || typeof entry.category !== 'string' || !entry.category || entry.category.length > 256
        || typeof entry.translation !== 'string' || entry.translation.length > 16384
        || (entry.notes !== undefined && (typeof entry.notes !== 'string' || entry.notes.length > 4096))) {
      throw new Error('翻譯檔包含重複 ID 或無效文字');
    }
    byId.set(entry.id, entry);
  }
  return { ...base, entries: base.entries.map(original => {
    const entry = byId.get(original.id);
    if (!entry || entry.source !== original.source || entry.category !== original.category) throw new Error(`原文已變動：${original.id}`);
    return { ...original, translation: entry.translation, notes: entry.notes };
  }) };
}

export function validateLocalizationAssets(assets: LocalizationAssets): void {
  const { catalog, runtime } = assets;
  if (catalog?.format !== 'nes-localization' || catalog.version !== 1 || catalog.gameId !== 'captain-tsubasa-2-jp'
      || catalog.locale !== 'zh-Hant' || catalog.sourceSha256 !== CT2_SOURCE_HASHES[0]
      || !Array.isArray(catalog.entries) || !catalog.entries.length || catalog.entries.length > 10000
      || runtime?.version !== 1 || runtime.sourceSha256 !== catalog.sourceSha256
      || !Array.isArray(runtime.sourceHashes) || runtime.sourceHashes.length !== CT2_SOURCE_HASHES.length
      || CT2_SOURCE_HASHES.some(hash => !runtime.sourceHashes.includes(hash))
      || !Array.isArray(runtime.runs) || runtime.runs.length > 10000
      || !Array.isArray(runtime.scenes) || runtime.scenes.length > 256
      || runtime.scenes.some(s => typeof s?.id !== 'string' || !s.id || !Number.isInteger(s.start)
        || !Number.isInteger(s.length) || s.length <= 0 || s.start < 0x6000 || s.start + s.length > 0xc000)
      || !Array.isArray(runtime.lowerTiles) || runtime.lowerTiles.length !== 256
      || runtime.lowerTiles.some(v => !Number.isInteger(v) || v < 0 || v > 255)) throw new Error('不支援的中文化資源');
  mergeLocalizationDraft(catalog, catalog);
  if (runtime.fontAliases && (runtime.fontAliases.length !== 256 || runtime.fontAliases.some(offsets =>
      !Array.isArray(offsets) || offsets.length > 8192 || offsets.some(offset => !Number.isInteger(offset) || offset < 0 || offset >= 0x20000 || offset % 16)))) {
    throw new Error('字庫來源索引不符');
  }
  const ids = new Set(catalog.entries.map(e => e.id));
  const runIds = new Set<string>();
  const scenes = new Map(runtime.scenes.map(scene => [scene.id, scene]));
  if (scenes.size !== runtime.scenes.length) throw new Error('劇情索引重複');
  const offsets = new Set<number>();
  for (const run of runtime.runs) {
    if (!run || !ids.has(run.id) || runIds.has(run.id) || typeof run.line !== 'string' || !run.line || typeof run.scene !== 'string'
      || !run.scene || !Number.isInteger(run.offset)
      || (run.domain !== undefined && run.domain !== 'battle')
        || !Array.isArray(run.bytes) || !run.bytes.length || !(
          (run.offset >= 0x6000 && run.offset + run.bytes.length <= 0xc000)
          || (run.domain === 'battle' && run.offset >= 0x31400 && run.offset + run.bytes.length <= 0x34000)
          || (run.domain === 'battle' && run.offset >= 0x3f509 && run.offset + run.bytes.length <= 0x3facd))) {
      throw new Error('文字來源索引不符');
    }
    runIds.add(run.id);
    if (run.domain !== 'battle') {
      const scene = scenes.get(run.scene);
      if (!scene || run.offset < scene.start || run.offset + run.bytes.length > scene.start + scene.length) throw new Error('文字不屬於指定劇情');
    }
    run.bytes.forEach((value, i) => {
      if (!Number.isInteger(value) || value < 0 || value > 0xd8 || offsets.has(run.offset + i)) throw new Error('文字來源重疊或無效');
      offsets.add(run.offset + i);
    });
  }
}

export interface ObservedGlyph { run: TextRun; index: number; cell: number; glyph: number; generations?: [number, number]; expectedGenerations?: [number, number]; pendingFrames?: number }

/** Pure event reducer. Unknown source bytes and changed scenes fail closed. */
export class TextObservationState {
  private sources = new Map<number, { run: TextRun; index: number }>();
  readonly glyphs = new Map<number, ObservedGlyph>();
  private scene = '';
  readonly runtime: TextRuntime;
  constructor(runtime: TextRuntime) {
    this.runtime = runtime;
    for (const run of runtime.runs) run.bytes.forEach((_, index) => this.sources.set(run.offset + index, { run, index }));
  }
  clear(): void { this.glyphs.clear(); this.scene = ''; }
  consume(events: ArrayLike<number>): void {
    if (events.length % 4) { this.clear(); return; }
    for (let i = 0; i < events.length; i += 4) {
      const [kind, source, cell, value] = [events[i], events[i + 1], events[i + 2], events[i + 3]];
      if (kind === 0) {
        this.clear(); continue;
      }
      if (kind === 4) {
        const glyph = this.glyphs.get(cell);
        if (glyph) glyph.expectedGenerations = [source, value];
        continue;
      }
      if (kind !== 1 && kind !== 3) continue;
      const found = this.sources.get(source);
      if (!found || found.run.bytes[found.index] !== value || cell < 0 || cell >= 2048) {
        if (kind === 1) this.clear();
        continue;
      }
      const scene = kind === 3 ? 'battle' : found.run.scene;
      // Script transitions queue PPU work; they do not change displayed pixels.
      // Retire each old cell only when its fetched write generation changes.
      this.scene = scene;
      this.glyphs.set(cell, { ...found, cell, glyph: value });
    }
  }
}

/** Find actual on-screen tile positions from the PPU fetch pipeline, including
 * split-screen scrolling. This never inspects pixels or recognizes glyph shapes. */
export function locateTextCells(provenance: Uint16Array, wanted: Set<number>): Map<number, { x: number; y: number }> {
  const positions = new Map<number, { x: number; y: number }>();
  const duplicate = new Set<number>();
  for (let y = 0; y < 233; y++) {
    for (let x = 0; x < 249; x++) {
      const tag = provenance[y * 256 + x];
      if (!tag || tag & 0x7000 || !wanted.has(tag - 1) || (x && provenance[y * 256 + x - 1] === tag)) continue;
      if (positions.has(tag - 1)) duplicate.add(tag - 1);
      else positions.set(tag - 1, { x, y });
    }
  }
  for (const cell of duplicate) positions.delete(cell);
  return positions;
}

export function cellRectangleVisible(provenance: Uint16Array, cell: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x + 8 > 256 || y + 16 > 240 || (cell & 0x3ff) + 32 >= 0x3c0) return false;
  for (let dy = 0; dy < 16; dy++) {
    const expected = cell + (dy >= 8 ? 32 : 0) + 1 | ((dy % 8) << 12);
    for (let dx = 0; dx < 8; dx++) if (provenance[(y + dy) * 256 + x + dx] !== expected) return false;
  }
  return true;
}