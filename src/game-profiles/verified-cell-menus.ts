export const ZOMBIE_HUNTER_HASH = '91dfb1a0c29f78c5d5b0a582c737c62103c4009ad5e2c20fdecd0c22a8648a48';
export interface CellMenuEntry {
  id: string; source: string; translation: string; group: string;
  width: number; height: number;
  cells: { cell: number; tile: number; chr: number }[];
}
export interface CellMenuCatalog {
  schemaVersion: number; format: string; sourceSha256: string; entries: CellMenuEntry[];
  /** One source-table record per selector, not one record per screen position. */
  names?: { selector: number; source: string; translation: string; tiles: number[][] }[];
}
export function validateCellMenus(value: CellMenuCatalog): void {
  if (value.schemaVersion !== 1 || value.format !== 'nes-verified-cell-menus'
    || value.sourceSha256 !== ZOMBIE_HUNTER_HASH || !Array.isArray(value.entries)
    || value.entries.length > 64) throw Error('Invalid menu catalog');
  const ids = new Set<string>();
  if (value.names !== undefined) {
    if (!Array.isArray(value.names) || value.names.length !== 32) throw Error('Invalid name table');
    value.names.forEach((n, i) => {
      if (n.selector !== i || typeof n.source !== 'string' || !n.source || typeof n.translation !== 'string'
        || n.translation.length > 20 || !Array.isArray(n.tiles) || n.tiles.length !== 2
        || !Array.isArray(n.tiles[0]) || !Array.isArray(n.tiles[1]) || n.tiles[0].length < 2
        || n.tiles[0].length > 8 || n.tiles[1].length !== n.tiles[0].length
        || n.tiles[0].some(t => t !== 36 && t !== 115)
        || n.tiles[1].some(t => !Number.isInteger(t) || !(t === 36 || (t >= 64 && t <= 113) || (t >= 128 && t <= 178)))) throw Error('Invalid name glyphs');
    });
  }
  for (const e of value.entries) {
    if (!e.id || ids.has(e.id) || typeof e.source !== 'string' || typeof e.translation !== 'string'
      || e.translation.length > 80 || !['title', 'pause', 'hud', 'items', 'weapons', 'equipment', 'status', 'items-select', 'items-helmet', 'items-shield', 'status-next', 'items-helmet-scroll', 'items-helmet-end', 'items-shield-scroll', 'items-shield-end'].includes(e.group)
      || !Number.isInteger(e.width) || e.width < 1 || e.width > 32
      || !Number.isInteger(e.height) || e.height < 1 || e.height > 2
      || !Array.isArray(e.cells) || e.cells.length !== e.width * e.height) throw Error('Invalid menu entry');
    ids.add(e.id);
    e.cells.forEach((c, i) => {
      if (!Number.isInteger(c.cell) || c.cell < 0 || c.cell >= 960
        || c.cell !== e.cells[0].cell + Math.floor(i / e.width) * 32 + i % e.width
        || (e.cells[0].cell % 32) + e.width > 32
        || !Number.isInteger(c.tile) || c.tile < 0 || c.tile > 255
        || !Number.isInteger(c.chr) || c.chr < 0 || c.chr >= 32768 || c.chr % 16) throw Error('Invalid cell identity');
    });
  }
}
export interface CellMenuReplacement {
  entry: CellMenuEntry; x: number; y: number; background: number; foreground: number;
  /** Current-frame winning-background runs only; absent when the whole box is safe. */
  clips?: { x: number; y: number; width: number; height: number }[];
  partial?: boolean;
}

// Bank 6 $862d..$86ae copies eight 16-byte staging rows at $600 to
// $226e,$228e,...,$234e. Only these source-backed cells can authorize partials.
function stagedTile(source: Uint8Array | undefined, cell: number): number | undefined {
  const row = Math.floor(cell / 32), col = cell % 32;
  return source?.length === 128 && row >= 19 && row <= 26 && col >= 14 && col < 30
    ? source[(row - 19) * 16 + col - 14] : undefined;
}
function nameEntries(catalog: CellMenuCatalog, metadata: Uint32Array, source?: Uint8Array): CellMenuEntry[] {
  const entries: CellMenuEntry[] = [];
  const make = (id: string, text: string, translation: string, row: number, col: number, tiles: number[][]): CellMenuEntry => ({
    id, source: text, translation, group: 'names', width: tiles[0].length, height: 2,
    cells: tiles.flatMap((line, y) => line.map((tile, x) => ({ cell: (row + y) * 32 + col + x, tile, chr: 0x7000 + tile * 16 }))),
  });
  for (const name of catalog.names ?? []) for (let row = 19; row <= 25; row++) {
    const width = name.tiles[0].length;
    const entry = make(`name.${name.selector}.${row}`, name.source, name.translation, row, 14, name.tiles);
    // Exact writer-added separator + レベル + native level digit prevents
    // matching a shorter name inside another name (いかずち / おおいかずち).
    const suffix = make('suffix', '', '', row, 14 + width, [[36,36,115,36],[36,169,156,168]]);
    const digit = (row + 1) * 32 + 14 + width + 4;
    const exact = (c: CellMenuEntry['cells'][number]) => metadata[c.cell*4] !== 0xffffffff
      && (metadata[c.cell*4] >>> 8) !== 0 && (metadata[c.cell*4] & 255) === c.tile && metadata[c.cell*4+1] === c.chr+1;
    const staged = [...entry.cells, ...suffix.cells].every(c => stagedTile(source,c.cell) === c.tile)
      && (stagedTile(source,digit) ?? 255) >= 1 && (stagedTile(source,digit) ?? 255) <= 8;
    const level = metadata[digit*4] & 255;
    const visible = [...entry.cells, ...suffix.cells].every(exact) && level >= 1 && level <= 8
      && metadata[digit*4+1] === 0x7000+level*16+1;
    if (!staged && !visible) continue;
    entries.push(entry, make(`name-level.${name.selector}.${row}`, 'レベル', '等級', row, 15+width, [[36,115,36],[169,156,168]]));
  }
  return entries;
}
/** Stateless: no stale text across closing, blinking, reset or save restoration.
 * Whole-entry identity is required unless the ROM's staging rows authorize
 * the target; then only exact two-cell glyph columns may be replaced. Winning
 * pixel provenance clips sprite overlap without reverting unrelated labels.
 * Only the returned width/height cells are safe to mask; neighbouring cells
 * may contain cursors/icons even when their background colour is identical. */
export function locateVerifiedCellMenus(catalog: CellMenuCatalog, metadata: Uint32Array, provenance: Uint16Array, source?: Uint8Array): CellMenuReplacement[] {
  if (metadata.length !== 8192 || provenance.length !== 256 * 240) return [];
  const entries = [...catalog.entries, ...nameEntries(catalog, metadata, source)];
  // A cursor can hide the first pixel or the entire first scanline. Find an
  // intact eight-pixel fetch row in ANY source cell instead of shifting the
  // rectangle to the first surviving pixel. Ambiguous positions fail closed.
  const origins = new Map<number, Set<number>>();
  const wanted = new Set(entries.flatMap(e => e.cells.map(c => c.cell + 1)));
  for (let p = 0; p < provenance.length; p++) {
    const value = provenance[p], cell = value & 0xfff;
    if (!wanted.has(cell) || p % 256 > 248) continue;
    let intact = true;
    for (let dx = 1; dx < 8; dx++) if (provenance[p + dx] !== value) { intact = false; break; }
    if (!intact) continue;
    const origin = p - (value >>> 12) * 256;
    if (!origins.has(cell)) origins.set(cell, new Set());
    origins.get(cell)!.add(origin);
    p += 7;
  }
  const found: CellMenuReplacement[] = [];
  for (const entry of entries) {
    if (!entry.translation.trim()) continue;
    if (entry.group === 'names' && found.some(m => m.entry.cells.some(c => entry.cells.some(n => n.cell === c.cell)))) continue;
    const candidates = new Set<number>();
    entry.cells.forEach((c, i) => {
      for (const p of origins.get(c.cell + 1) ?? []) candidates.add(p - (i % entry.width) * 8 - Math.floor(i / entry.width) * 8 * 256);
    });
    if (candidates.size !== 1) continue;
    const start = [...candidates][0];
    const x = start % 256, y = Math.floor(start / 256);
    if (x < 0 || y < 0 || x + entry.width * 8 > 256 || y + entry.height * 8 > 240) continue;
    const bg = metadata[entry.cells[0].cell * 4 + 2];
    let fg = 0;
    const authorized = entry.height === 2 && entry.cells.every(c => stagedTile(source, c.cell) === c.tile);
    const exactCells: boolean[] = [];
    const valid = entry.cells.every(c => {
      const [packed, physical, background, foreground] = metadata.subarray(c.cell * 4, c.cell * 4 + 4);
      const exact = (packed & 255) === c.tile && physical === c.chr + 1;
      exactCells.push(exact);
      if (!packed || packed === 0xffffffff || !(packed >>> 8)
        || (!exact && !(authorized && physical === 0x7001 + (packed & 255) * 16))
        || !bg || bg > 0x1000000 || background !== bg
        || foreground > 0x1000000) return false;
      if (exact && foreground) { if (fg && fg !== foreground) return false; fg = foreground; }
      return true;
    });
    if (!valid || !fg) continue;
    const partial = exactCells.some(v => !v);
    // A missing dakuten cannot authorize covering its base kana. Require a
    // complete source glyph column and mask only its winning pixels.
    const safeColumn = (col: number) => !partial || (exactCells[col] && exactCells[entry.width+col]);
    if (partial && !entry.cells.some((c,i) => i >= entry.width && c.tile !== 36 && safeColumn(i % entry.width))) continue;
    const clips: NonNullable<CellMenuReplacement['clips']> = [];
    let pixels = 0;
    for (let dy = 0; dy < entry.height * 8; dy++) {
      let run = -1;
      for (let dx = 0; dx <= entry.width * 8; dx++) {
        const c = entry.cells[Math.floor(dy / 8) * entry.width + Math.floor(dx / 8)];
        const safe = dx < entry.width * 8 && safeColumn(Math.floor(dx/8)) && provenance[(y + dy) * 256 + x + dx] === ((c.cell + 1) | ((dy % 8) << 12));
        if (safe) { pixels++; if (run < 0) run = dx; }
        else if (run >= 0) { clips.push({ x: x + run, y: y + dy, width: dx - run, height: 1 }); run = -1; }
      }
    }
    if (pixels) found.push({ entry, x, y, background: bg - 1, foreground: fg - 1,
      ...(partial ? { partial: true } : {}),
      ...(pixels === entry.width * entry.height * 64 ? {} : { clips }) });
  }
  // The game writes/clears entries over several frames. A different entry's
  // incomplete write or cursor must not revert already verified labels.
  return found;
}