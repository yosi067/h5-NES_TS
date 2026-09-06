# Captain Tsubasa II Translation Inventory

## Runtime correction (2026-09-06)

The inventory below records extraction, not display coverage. Current display-only behavior is documented in [the localization studio report](CT2_LOCALIZATION_STUDIO.md#比賽中文顯示更新2026-09-06仍非全中文): original-source menus already have a matcher, and complete observed battle/dictionary occurrences now have a generation/CHR-guarded renderer. The older BPS-only and entirely-disabled battle descriptions below are historical, not the current runtime.

Original-ROM traversal verified team/player substitutions, ordinary shooting, and actual Drive Shot selection and commentary (`抽球射門`, `抽球射門！！`, `大空翼的`, `抽球射門！`). The special-menu dictionary writer at bank `$30000` / CPU `$8A79` and player-name writer at `$8D7B` supply guarded source events; these are not additional static definitions in the 221-entry menu catalog. Only Drive Shot has original-game special-shot traversal coverage, using supported level-64 read-side tuning, not RAM injection. Other moves, full sentences, RAM dictionary index 0, and incomplete/control-prefixed runs remain incomplete.

For `battle-clouds.14.text.0010`, `.58.text.0004`, and `.75.text.0004`, the original FC next-row path skips one byte. The builder verifies the cursor-advance opcode signature, preceding FC and specific prefix byte, then narrows only these three runtime spans. Exchange IDs/source text and lossless IR remain unchanged. Other control-prefixed spans are not blanket-corrected; losslessness does not imply verified semantic segmentation. See the [latest runtime report](CT2_LOCALIZATION_STUDIO.md) for evidence and limitations.

## Scope

This inventory separates verified translatable content from structural ROM candidates. It does not claim full-game coverage until battle messages, menus, names, and dictionaries have their own verified runtime writers.

Canonical source SHA-256: `bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746`

## Translation bundle contract

The detailed JSON files under `artifacts/` are machine source catalogs. Translator-facing files under `game-profiles/captain-tsubasa-2-jp/translations/` use compact schema v2: each editable entry contains only its stable `id`, `category`, `translation`, and an optional non-empty `notes` field. Source bytes, decoded source text, pointers, and allocation lengths are resolved from the extracted catalog during validation; the bundle retains the source ROM hash and the relevant scene, message, bank, or dictionary hash.

The supported categories are intentionally separate:

- `dialogue`: narrative and cutscene text.
- `menu`: player-facing menu choices, currently registered as `title.menu.*` catalog units.
- `interface`: non-menu HUD, status, and system labels.
- `battleMessage`: football battle/cloud messages.
- `dictionary`: fixed-bank reusable names, moves, and phrases.

The adapter accepts schema v1 while migrating existing files and rejects stale source hashes, missing or duplicate IDs, changed legacy source evidence, wrong categories, and incomplete source inventories. Use `validate-bundle` for a source-guarded check and `migrate-bundle` to convert a legacy file without copying its repeated source evidence:

```bash
node tools/captain-tsubasa-2-adapter.mjs validate-bundle --input <bundle.json> --require-complete false
node tools/captain-tsubasa-2-adapter.mjs migrate-bundle --input <legacy.json> --output <compact.json>
```

The title-menu catalog is distinct from dialogue and interface labels. Source/CHR-backed menu matching is enabled, but KICK OFF/CONTINUE are deliberately left in English by the display layer. Password kana remain functional code symbols; prompts and verified gameplay labels can be translated. Catalog registration alone does not establish exhaustive menu coverage.

## Verified cutscene coverage

| Pointer table | PRG offset | Scenes | Encoded bytes | Text runs | Source glyphs | Unique codes | Controls | Pauses |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `opening-cutscenes` | `0x6000` | 16 | 8,159 | 487 | 5,319 | 157 | 1,414 | 406 |
| `cutscenes-bank-04` | `0x8000` | 16 | 8,127 | 455 | 4,965 | 165 | 1,556 | 404 |
| `cutscenes-bank-05` | `0xA000` | 64 (56 unique) | 8,053 | 505 | 5,476 | 164 | 1,288 | 300 |
| Total | | 96 (88 unique) | 24,339 | 1,447 | 15,760 | | 4,258 | 1,110 |

All three tables use little-endian pointers in the MMC3 `$A000-$BFFF` CPU window. Every extracted instruction stream is byte-identical after parse and encode. The final scene is bounded by its first semantic `$FF` exit rather than the first raw `$FF` byte, because `$FF` is also a valid control argument. Bank 5 contains eight pointer aliases, which are exported once and referenced by ID rather than duplicated for translators.

The first bank uses 8,159 of the 8,160 bytes following its 32-byte pointer table. The second bank leaves only 33 bytes after its last semantic exit. A complete translation therefore cannot assume that longer translated scenes can remain in place. Compilation must support at least one of:

- shorter translated wording;
- scene repacking with rewritten pointers;
- relocation to additional PRG space or a replacement bank;
- a game-specific compression or dictionary encoding.

## Verified battle-cloud coverage

The complete canonical cloud pointer table contains 240 message IDs, 236 unique allocations, and four aliases. All 6,428 allocated bytes are inventoried and preserved. The canonical renderer uses a packed two-byte header: one pause byte followed by a configuration byte whose high nibble selects the cloud window and whose low nibble selects Charlie when the value is below `$90`. Text controls begin at `$E0`; treating these bytes as glyphs produces incorrect translation entries.

| Messages | Unique | Render IR | Opaque graph/setup | Text runs | Source glyphs | Unique codes |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 240 | 236 | 223 | 13 | 513 | 2,697 | 134 |

The 13 opaque allocations are lossless, not undiscovered. Three are setup-only records (`F0`, `F2 F0`, and `F5 02 F0`). The remaining records use `$F4` conditional target tables, sometimes with targets that point directly at a preceding block's terminal `$F0`. They require a graph IR with shared byte ranges; splitting them at sorted target addresses would duplicate or omit bytes. Until that graph encoder exists, their source bytes remain immutable and are listed under `opaqueMessages` in the editable bundle.

## Verified fixed-bank word dictionary

The canonical reset path reaches the fixed-bank word resolver through the `$C53C` trampoline (`JMP $F30F`). The resolver treats A as a word index, reads a little-endian pointer from `$F329`, and returns that pointer in zero-page `$30/$31`. The table occupies `$F329-$F508` in the fixed MMC3 `$E000-$FFFF` window, which is exactly 240 u16 entries. It does not use the upstream `$5116` bank-switch path.

| Pointer table | Fixed PRG window | Entries | Fixed records | External pointers | Record bytes | Terminator |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| CPU `$F329` / PRG `0x3F329` | CPU `$E000-$FFFF` / PRG `0x3E000` | 240 | 239 | 1 (`index 0 -> $05EB` RAM) | 1,475 | `$FC` |

For indices `1..239`, pointers increase monotonically from `$F509` through `$FAC8`. Each record ends at its first `$FC`; the 239 records occupy `$F509-$FACC` and re-encode byte-identically. The pointer at index 0 targets CPU RAM and is retained as an opaque external entry rather than decoded as ROM text. The decoded table contains player names, team/move names, and short reusable phrases; individual semantic categories remain editable metadata rather than assumptions inferred from byte layout.

The current dictionary compiler is deliberately in-place: it preserves the pointer table and each original record allocation, requires a `$FC` terminator, rejects translations that exceed their allocation, and emits source-guarded PRG overlays. It does not yet relocate records, rewrite pointers, or allocate a safe Traditional Chinese CHR page. The `compile-dictionary` command therefore remains an artifact-generation step until a reviewed glyph map and CHR/runtime path are available.

## Generated data

- `artifacts/captain-tsubasa-2-cutscene-bank-ir.json`: lossless bank 3 IR, 670,786 bytes.
- `artifacts/captain-tsubasa-2-cutscenes-bank-04-ir.json`: lossless bank 4 IR, 695,955 bytes.
- `artifacts/captain-tsubasa-2-cutscenes-bank-05-ir.json`: lossless bank 5 IR, 661,980 bytes.
- `artifacts/captain-tsubasa-2-battle-clouds-ir.json`: complete cloud inventory, 595,849 bytes.
- `artifacts/captain-tsubasa-2-fixed-bank-words-ir.json`: fixed-bank word inventory, 265,283 bytes.
- `game-profiles/captain-tsubasa-2-jp/translations/opening-cutscenes.zh-Hant.json`: 487 editable entries, including 35 reviewed opening entries, 68,582 bytes.
- `game-profiles/captain-tsubasa-2-jp/translations/cutscenes-bank-04.zh-Hant.json`: 455 editable entries, 63,716 bytes.
- `game-profiles/captain-tsubasa-2-jp/translations/cutscenes-bank-05.zh-Hant.json`: 505 editable entries, 77,814 bytes.
- `game-profiles/captain-tsubasa-2-jp/translations/battle-clouds.zh-Hant.json`: 513 editable entries, 106,746 bytes.
- `game-profiles/captain-tsubasa-2-jp/translations/fixed-bank-words.zh-Hant.json`: 239 editable entries plus one external pointer, 25,758 bytes.
- `game-profiles/captain-tsubasa-2-jp/translations/opening.intro.00.zh-Hant.json`: 35 reviewed entries, 4,871 bytes.

The six compact translator bundles total 347,487 bytes. The formerly verbose v1 bundles repeated source evidence in every entry; their replacements are source-guarded by the canonical extraction tests rather than by duplicating that evidence in editable files.

Regeneration preserves an entry's category, translation, and notes when its source hash and, for legacy entries, source evidence still match. Stale or changed source entries are not silently carried forward.

Historical extraction measurements: approximately 216 ms for one 8KB bank; four IR files about 2.5 MB and four editable bundles about 746 KB. IR and translator bundles are build-time inputs. Current supported original-ROM localization uses a generated catalog/runtime index and a display-only overlay, bypassing the legacy BPS path. Runtime observation, provenance matching and rendering do have per-frame costs; no new performance benchmark is claimed here.

## ROM-wide candidates

A structural scan inferred pointer counts from `(first pointer - $A000) / 2`. It found additional tables at PRG offsets `0xC000`, `0xE000`, `0x12000`, and `0x14000`. They are not registered as cutscenes: their `$FF` density and parser failures differ materially from the two verified dialogue banks. They may hold names, graphics commands, dictionaries, or unrelated indexed data and require category-specific validation.

Full-game coverage remains incomplete until these areas are mapped and written safely:

- remaining menu/interface variants beyond the verified source-backed matcher and Drive Shot route;
- remaining player, team, and opponent names, especially RAM-backed dictionary index 0;
- remaining repeated-word/name tables and compressed text;
- credits and result screens;
- any additional renderer-specific text reached through local call sites.

## Reuse assessment

Reusable across NES games:

- semantic script IR and editable translation bundles;
- lossless parse/encode checks;
- source and scene SHA-256 guards;
- pointer-table extraction and fixed-allocation metrics;
- BPS-only GMOD v2 packaging;
- source-aligned layout policy and build-time glyph inventory.

Game-specific for each title:

- mapper bank selection and pointer address conversion;
- text encoding and control opcode widths;
- scene termination and jump semantics;
- font/CHR allocation and tile upload behavior;
- relocation, compression, and runtime layout rules.

The framework is reusable, but a new game still needs a small evidence-backed adapter. Pointer discovery alone is not enough to classify arbitrary ROM data as text.

## Deferred non-blocking optimizations

- Replace or manually curate complex 8x8 Traditional Chinese glyphs.
- Design a safe MMC3 text CHR bank before enabling the existing offline 8x16 rasterizer.
- Add event-matched visual regression; fixed-delay screenshots drift when padding changes typewriter duration.
- Add a multi-bank compiler that repacks scenes and rewrites pointers.
- Add fixed-bank dictionary relocation and pointer rewriting after the in-place compiler has a proven free-bank allocation.
- Add a reviewed Traditional Chinese glyph map and a safe MMC3 CHR allocation for dictionary text.
- Add a shared-range graph IR and encoder for the 13 cloud setup/branch allocations.
- Benchmark profile application and frame pacing on desktop and mobile after multiple banks are compiled.
- Categorize entries automatically only after control patterns are validated; bulk cutscene exports default to `dialogue`, while menu catalog units use `menu` explicitly.

The current 8x8 output remains the safe baseline. Typography work should block broader extraction only if text becomes unreadable or native UI tiles are corrupted.