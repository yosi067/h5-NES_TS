/** Structural subset of buildCT2MenuDefinitions()'s untransformed return value.
 * ROM/hash verification belongs to the caller. No ROM, DOM or persistent state
 * is consulted here; these definitions must describe the ORIGINAL CHR ROM.
 */
export interface MenuAssets {
  entries: readonly {
    id: string;
    source: string;
    translation: string;
    encoding?: string;
    translatable?: boolean;
    offset?: number;
    recordOffset?: number;
    dynamicRecord?: boolean;
    bodyTiles?: readonly number[];
    markTiles?: readonly number[];
    width?: number;
    height?: number;
    target?: number;
    targetRow?: string;
    targetMayBeOffset?: boolean;
    tileRows?: readonly {
      target?: number;
      tiles: readonly number[];
      chrIdentities?: readonly string[];
    }[];
    guard?: { companionEntryId?: string; chrIdentityRequired?: boolean };
  }[];
  layouts: readonly {
    target: number;
    width: number;
    targetPageDynamic?: boolean;
    placements: readonly { row: number; column: number; recordOffset: number }[];
  }[];
  font: { chrPhysicalBase: number };
  specialMenus?: {
    chrIdentities: readonly { id: string; physicalOffsets: readonly number[] }[];
    passwordInput?: {
      tileRows: readonly { target: number; tiles: readonly number[]; chrIdentities: readonly string[] }[];
      slots: readonly { target: number; markTarget: number }[];
    };
  };
}

type Entry = MenuAssets['entries'][number];
type Position = { x: number; y: number };
type Replacement = Position & {
  id: string; translation: string; width: number; height: number;
  /** Zero-based mirrored nametable cells, row-major; includes constrained blanks. */
  cells: number[];
  /** Suggested maximum size; the drawing caller must still measure/clip text. */
  fontSize?: number;
};
type Pattern = {
  entry: Entry; width: number; height: number; target?: number;
  tiles: number[]; offsets: readonly number[][]; anchor: number;
  /** Original padded width, used only for a placed dynamic numeric field. */
  numericTailWidth?: number;
};
type Match = Position & { pattern: Pattern; cell: number; cells: number[]; placements: string[] };
const SCREEN_WIDTH = 256, SCREEN_HEIGHT = 240, AMBIGUOUS = 0xffffffff;

const integer = (n: number) => Number.isInteger(n) && n >= 0;
const localCell = (target: number) => target & 0x3ff;
const page = (cell: number) => cell >>> 10;
const column = (cell: number) => cell & 31;
const row = (cell: number) => (cell & 0x3ff) >>> 5;
const numeric = (entry: Entry) => /^[\d\s:：.,+\-/ー—–−]+$/u.test(entry.source);
const strong = (entry: Entry) => !numeric(entry) && [...entry.source.replace(/\s/gu, '')].length >= 2;
const alphabet = (entry: Entry) => entry.id === 'menu.password.alphabet';

function fontOffsets(tile: number, assets: MenuAssets, identities: Map<string, readonly number[]>): readonly number[] {
  // The extractor enumerates byte-identical ORIGINAL font aliases. Do not
  // infer a bank from a neighbouring tile or apply these to graphic identities.
  return identities.get(`ct2-original-font:${tile.toString(16).padStart(2, '0')}`)
    ?? [assets.font.chrPhysicalBase + tile * 16];
}

function patternFor(entry: Entry, assets: MenuAssets, identities: Map<string, readonly number[]>): Pattern | undefined {
  let rows = entry.tileRows;
  let target = entry.target;
  if (!rows) {
    if (!entry.bodyTiles?.length || entry.bodyTiles.length !== entry.markTiles?.length) return;
    rows = [{ tiles: entry.markTiles }, { tiles: entry.bodyTiles }];
    // Pregame target is BODY; data records explicitly say MARK. Rich labels
    // have no fixed target and are positioned by their layouts below.
    if (target !== undefined && entry.targetRow !== 'mark') target -= 32;
  }
  const width = rows[0]?.tiles.length ?? 0, height = rows.length;
  if (!width || width > 32 || !height || height > 30
      || (entry.width !== undefined && entry.width !== width)
      || (entry.height !== undefined && entry.height !== height)) return;
  target = rows[0].target ?? target;
  if (target !== undefined && (!integer(target) || target < 0x2000 || target >= 0x3000)) return;
  const tiles: number[] = [], offsets: number[][] = [];
  for (let y = 0; y < height; y++) {
    const r = rows[y];
    if (r.tiles.length !== width || (r.target !== undefined && r.target !== (target ?? -1) + y * 32)
        || (r.chrIdentities && r.chrIdentities.length !== width)
        || (entry.guard?.chrIdentityRequired && !r.chrIdentities)) return;
    for (let x = 0; x < width; x++) {
      const tile = r.tiles[x];
      if (!integer(tile) || tile > 255) return;
      // Unknown explicit identities never fall back to a tile-number guess.
      const physical = r.chrIdentities
        ? identities.get(r.chrIdentities[x])
        : entry.encoding === 'ct2-graphic-tiles' ? undefined : fontOffsets(tile, assets, identities);
      if (!physical?.length || physical.some(p => !integer(p) || p % 16 !== 0 || p >= AMBIGUOUS - 1)) return;
      tiles.push(tile); offsets.push([...physical]);
    }
  }
  const anchor = tiles.findIndex(tile => tile !== 0);
  if (anchor < 0) return; // Blank rectangles are not text evidence.
  return { entry, width, height, target: entry.targetMayBeOffset ? undefined : target, tiles, offsets, anchor };
}

function numericVariant(pattern: Pattern): Pattern | undefined {
  const { entry, width, height, tiles, offsets } = pattern;
  if (entry.encoding !== 'ct2-menu-glyph' || !entry.dynamicRecord || entry.tileRows
      || entry.recordOffset === undefined || entry.offset !== entry.recordOffset || height !== 2) return;
  let end = width;
  while (end > 0 && tiles[end - 1] === 0 && tiles[width + end - 1] === 0) end--;
  if (!end || end === width) return;
  const cropped = tiles.slice(0, end).concat(tiles.slice(width, width + end));
  return { ...pattern, width: end, tiles: cropped,
    offsets: offsets.slice(0, end).concat(offsets.slice(width, width + end)),
    anchor: cropped.findIndex(tile => tile !== 0), numericTailWidth: width };
}

/** Complete 8x8 cells only. Fine Y is part of the evidence, not just the cell
 * number: clipped scrolling, sprite holes and split fetches must fail closed.
 */
function visible(provenance: Uint16Array, cell: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x + 8 > SCREEN_WIDTH || y + 8 > SCREEN_HEIGHT) return false;
  for (let dy = 0; dy < 8; dy++) {
    const tag = (cell + 1) | (dy << 12);
    for (let dx = 0; dx < 8; dx++) if (provenance[(y + dy) * SCREEN_WIDTH + x + dx] !== tag) return false;
  }
  return true;
}

function overlaps(a: Match, b: Match): boolean {
  return a.x < b.x + b.pattern.width * 8 && b.x < a.x + a.pattern.width * 8
    && a.y < b.y + b.pattern.height * 8 && b.y < a.y + a.pattern.height * 8;
}

/** Same physical page AND same screen-to-nametable translation. A companion
 * on another scrolled/split-screen copy must not authorize this replacement.
 */
function sameFrame(a: Match, b: Match): boolean {
  return page(a.cell) === page(b.cell)
    && a.x - column(a.cell) * 8 === b.x - column(b.cell) * 8
    && a.y - row(a.cell) * 8 === b.y - row(b.cell) * 8;
}

function placementsFor(pattern: Pattern, cell: number, assets: MenuAssets): string[] {
  const e = pattern.entry;
  // A PRG byte offset is NOT a display-column offset after a dynamic opcode.
  // Only a record's initial text has a statically known placement.
  if (e.recordOffset === undefined || e.offset !== e.recordOffset) return [];
  const result: string[] = [];
  assets.layouts.forEach((layout, index) => {
    for (const p of layout.placements) {
      // $8956/$8C85 select BODY at placement.row, MARK at row - 1.
      const target = localCell(layout.target) + (p.row - 1) * 32 + p.column;
      if (p.recordOffset === e.recordOffset && p.row >= 1 && p.column >= 0
          && p.column + (pattern.numericTailWidth ?? pattern.width) <= layout.width && localCell(cell) === target) {
        result.push(`${index}`);
      }
    }
  });
  return result;
}

/** Locate display-only replacements from one completed PPU frame.
 *
 * metadata: four u32 words per MIRRORED cell: generation/tile, CHR offset+1,
 * backdrop RGB+1, foreground RGB+1. Zero foreground is normal on blank tiles.
 * No generation equality across cells is assumed (separate writes are normal).
 *
 * The API has no mirroring mode. Fixed targets constrain the within-page cell;
 * their physical page and screen position come from actual provenance, never
 * from target & 0x7ff or from a guessed screen coordinate. Companions/layouts
 * must agree on that page and screen mapping. This cannot establish historical
 * writer ownership or distinguish identical tokens in unrelated game scenes.
 */
export function locateMenuTranslations(
  assets: MenuAssets, provenance: Uint16Array, metadata: Uint32Array,
): Replacement[] {
  if (provenance.length !== SCREEN_WIDTH * SCREEN_HEIGHT || metadata.length % 4 !== 0
      || metadata.length < 4 || metadata.length / 4 > 0xfff) return [];
  const cellCount = metadata.length / 4;
  const identities = new Map(assets.specialMenus?.chrIdentities.map(i => [i.id, i.physicalOffsets]));
  const patterns = assets.entries.flatMap(e => {
    const pattern = patternFor(e, assets, identities);
    if (!pattern) return [];
    const variant = numericVariant(pattern);
    return variant ? [pattern, variant] : [pattern];
  });
  const byTile: number[][] = Array.from({ length: 256 }, () => []);
  for (let cell = 0; cell < cellCount; cell++) {
    const i = cell * 4, packed = metadata[i], chr = metadata[i + 1], bg = metadata[i + 2], fg = metadata[i + 3];
    if (packed === AMBIGUOUS || (packed >>> 8) === 0 || chr === 0 || chr === AMBIGUOUS
        || (chr - 1) % 16 !== 0 || bg === 0 || bg > 0x1000000 || fg > 0x1000000
        || ((packed & 255) !== 0 && fg === 0)) continue;
    byTile[packed & 255].push(cell);
  }
  // Index entire fine-Y-zero runs. A partial edge cell cannot masquerade as
  // an origin; fine X is not encoded, so an exactly eight-pixel run is required.
  const positions = new Map<number, Position[]>();
  for (let y = 0; y < SCREEN_HEIGHT; y++) for (let x = 0; x < SCREEN_WIDTH;) {
    const tag = provenance[y * SCREEN_WIDTH + x], start = x++;
    while (x < SCREEN_WIDTH && provenance[y * SCREEN_WIDTH + x] === tag) x++;
    if (tag > 0 && tag <= cellCount && x - start === 8) {
      const list = positions.get(tag - 1) ?? [];
      list.push({ x: start, y }); positions.set(tag - 1, list);
    }
  }
  const validCells = new Set(byTile.flat());
  const matches: Match[] = [];
  const passwordCells = new Set<number>();
  const input = assets.specialMenus?.passwordInput;
  const protectInput = (physicalPage: number) => {
    for (const slot of input?.slots ?? []) {
      passwordCells.add(physicalPage + localCell(slot.target));
      passwordCells.add(physicalPage + localCell(slot.markTarget));
    }
    // Preserve display gaps as well as the eighteen editable slots.
    for (const r of input?.tileRows ?? []) for (let x = 0; x < r.tiles.length; x++) {
      passwordCells.add(physicalPage + localCell(r.target) + x);
      passwordCells.add(physicalPage + localCell(r.target) + x - 32);
    }
  };
  // An independently verified empty input field protects itself even if a
  // sprite hides alphabet cells completely. This is negative evidence only:
  // it never authorizes the submit action or any translated rectangle.
  if (input?.tileRows.length) for (let physicalPage = 0; physicalPage < cellCount; physicalPage += 0x400) {
    if (input.tileRows.every(r => r.tiles.length > 0 && r.tiles.length === r.chrIdentities.length
        && column(r.target) + r.tiles.length <= 32 && row(r.target) < 30
        && r.tiles.every((tile, x) => {
          const c = physicalPage + localCell(r.target) + x;
          return validCells.has(c) && (metadata[c * 4] & 255) === tile
            && identities.get(r.chrIdentities[x])?.includes(metadata[c * 4 + 1] - 1);
        }))) protectInput(physicalPage);
  }
  // Cursor sprites can remove even the anchor's fetched metadata. Reserve the
  // password region from a partially occluded *fixed* alphabet only when two
  // complete glyph rows (marks AND bodies) still prove its identity, and every
  // other observed cell agrees. Missing cells are allowed only for this
  // negative reservation; the positive confirm guard below remains exact.
  for (const p of patterns) if (alphabet(p.entry) && p.target !== undefined) {
    for (let physicalPage = 0; physicalPage < cellCount; physicalPage += 0x400) {
      const origin = physicalPage + localCell(p.target);
      if (column(origin) + p.width > 32 || row(origin) + p.height > 30) continue;
      const cells = p.tiles.map((_, i) => origin + Math.floor(i / p.width) * 32 + i % p.width);
      const exact = cells.map((c, i) => validCells.has(c) && (metadata[c * 4] & 255) === p.tiles[i]
        && p.offsets[i].includes(metadata[c * 4 + 1] - 1));
      if (!cells.every((c, i) => exact[i] || (c < cellCount && metadata.subarray(c * 4, c * 4 + 4).every(word => word === 0)))) continue;
      let completeRows = 0;
      for (let y = 0; y + 1 < p.height; y += 2) {
        const start = y * p.width, end = start + 2 * p.width;
        if (exact.slice(start, end).every(Boolean) && p.tiles.slice(start, end).some(tile => tile !== 0)) completeRows++;
      }
      if (completeRows >= 2) {
        cells.forEach(c => passwordCells.add(c));
        protectInput(physicalPage);
      }
    }
  }
  for (const pattern of patterns) {
    const { width, height, anchor, tiles, offsets } = pattern;
    const anchorX = anchor % width, anchorY = Math.floor(anchor / width);
    for (const anchorCell of byTile[tiles[anchor]]) {
      const cell = anchorCell - anchorY * 32 - anchorX;
      if (cell < 0 || page(cell) !== page(anchorCell) || column(cell) + (pattern.numericTailWidth ?? width) > 32 || row(cell) + height > 30
          || (pattern.target !== undefined && localCell(cell) !== localCell(pattern.target))) continue;
      const cells = tiles.map((_, i) => cell + Math.floor(i / width) * 32 + i % width);
      const bg = metadata[cell * 4 + 2];
      if (!cells.every((c, i) => validCells.has(c) && (metadata[c * 4] & 255) === tiles[i]
          && offsets[i].includes(metadata[c * 4 + 1] - 1) && metadata[c * 4 + 2] === bg)) continue;
      // A sprite hole forbids confirmation, not negative password protection.
      if (alphabet(pattern.entry)) {
        cells.forEach(c => passwordCells.add(c));
        protectInput(page(cell) * 0x400);
      }
      const placements = placementsFor(pattern, cell, assets);
      const tail: number[] = [];
      if (pattern.numericTailWidth !== undefined) {
        if (!placements.length) continue;
        let hasDigit = false, validTail = true;
        for (let x = width; x < pattern.numericTailWidth; x++) for (let y = 0; y < height; y++) {
          const c = cell + y * 32 + x, tile = metadata[c * 4] & 255;
          const digit = y === 1 && tile >= 0x33 && tile <= 0x3c; // Original CT2 0..9.
          if (!validCells.has(c) || (tile !== 0 && !digit) || metadata[c * 4 + 2] !== bg
              || !fontOffsets(tile, assets, identities).includes(metadata[c * 4 + 1] - 1)) validTail = false;
          hasDigit ||= digit;
          tail.push(c);
        }
        if (!validTail || !hasDigit) continue;
      }
      for (const pos of positions.get(cell) ?? []) {
        if (!cells.every((c, i) => visible(provenance, c, pos.x + (i % width) * 8, pos.y + Math.floor(i / width) * 8))) continue;
        if (!tail.every(c => visible(provenance, c, pos.x + (column(c) - column(cell)) * 8,
          pos.y + (row(c) - row(cell)) * 8))) continue;
        matches.push({ pattern, cell, cells, ...pos, placements });
      }
    }
  }
  // Resolve explicit guards to a fixed point. Mutual title companions are
  // allowed, but a missing member of a longer guard chain invalidates the chain.
  let guarded = matches;
  for (;;) {
    const next = guarded.filter(m => {
      const companion = m.pattern.entry.guard?.companionEntryId;
      return !companion || guarded.some(other => other !== m && other.pattern.entry.id === companion && sameFrame(m, other));
    });
    if (next.length === guarded.length) break;
    guarded = next;
  }
  const candidates = guarded.filter(m => {
    const e = m.pattern.entry;
    if (e.translatable === false || alphabet(e) || numeric(e) || !e.translation.trim() || e.translation === e.source) return false;
    if (m.cells.some(cell => passwordCells.has(cell)) && e.id !== 'menu.password.confirm') return false;
    if (e.id === 'menu.password.confirm') {
      return m.pattern.width === 1 && m.pattern.height === 2
        && e.guard?.companionEntryId === 'menu.password.alphabet';
    }
    if (strong(e)) return true;
    // An isolated kana never authorizes itself, even at a known address.
    return m.placements.length > 0 && guarded.some(other => other !== m && strong(other.pattern.entry)
      && !overlaps(m, other) && sameFrame(m, other)
      && other.placements.some(key => m.placements.includes(key)));
  });
  const area = (m: Match) => m.pattern.width * m.pattern.height;
  const preference = (m: Match) => m.placements.length > 0 ? 1 : 0;
  // A placed ability label can contain exactly the same tiles as an action
  // command. Writer-layout evidence outranks an unplaced command's padding.
  // This preference is local to overlapping rectangles, not to entry IDs or
  // sources: a stat at x=152 must not suppress the same action at x=96. Keep
  // both when their complete fetched footprints are present in this frame.
  candidates.sort((a, b) => preference(b) - preference(a) || area(b) - area(a)
    || a.y - b.y || a.x - b.x || a.pattern.entry.id.localeCompare(b.pattern.entry.id));
  const selected: Match[] = [];
  for (const m of candidates) {
    if (selected.some(other => overlaps(m, other))) continue;
    // Same evidence, different translations, no placement discriminator: do
    // not arbitrarily pick a reading based on catalog iteration order.
    if (candidates.some(other => other !== m && other.x === m.x && other.y === m.y
        && other.pattern.width === m.pattern.width && other.pattern.height === m.pattern.height
        && preference(other) === preference(m) && other.pattern.entry.translation !== m.pattern.entry.translation)) continue;
    selected.push(m);
  }
  return selected.map(m => {
    const { entry, width, height } = m.pattern;
    const translation = entry.id === 'menu.password.confirm' ? '✓' : entry.translation;
    const fontSize = Math.max(1, Math.min(12, height * 8, Math.floor(width * 8 / [...translation].length)));
    return { id: entry.id, translation, x: m.x, y: m.y, width: width * 8, height: height * 8,
      cells: [...m.cells], ...(entry.id === 'menu.password.confirm' ? { fontSize: 8 } : fontSize < 12 ? { fontSize } : {}) };
  });
}