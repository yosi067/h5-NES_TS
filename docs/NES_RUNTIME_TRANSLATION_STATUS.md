# NES Runtime Translation Development Status

## New display-only experiment

CT2 now has a high-resolution, source-observed Chinese overlay and a standalone
translation editor. The two recognized original ROM hashes use the original ROM
rather than the earlier compact BPS font path. See
[current implementation, coverage and limitations](CT2_LOCALIZATION_STUDIO.md).
Its 2,199 filled catalog entries are drafts, not full-game localization coverage;
102 isolated kana entries remain unchanged. Verified pregame/action/data/password
menus are now translated; title labels, password symbols and values remain native. Dynamic battle
commentary and ability editing are not enabled. The historical extraction/compiler
inventory below remains valid. Current display uses fixed-size Chinese and native-pixel
masking, with winning sprite pixels composited back above translated menus. Prose is
shortened in place (no external subtitle panel); per-fragment reveal is 2× without
accelerating emulation. Editing controls/drafts are enabled only in loopback Vite DEV.
Native NES quick saves now use complete session-only snapshots, not the unsafe legacy
partial format; page reloads invalidate them and portable export is disabled.

## Scope and Rules

This branch develops a source-verified translation and runtime overlay framework for NES games. The workflow keeps dialogue, menu text, interface labels, credits, dictionaries, and renderer-specific data in separate domains.

The evidence policy is:

1. Discover source data from program code, pointer tables, mapper-resolved ROM offsets, and command parsers.
2. Preserve original bytes, command records, source provenance, and byte-for-byte round trips.
3. Treat static program references as candidates until a renderer path or equivalent runtime evidence confirms what the player sees.
4. Create translation catalogs only from reviewed, classified units.
5. Allocate translated glyphs and build PRG/CHR overlays only after capacity, pointer, bank, and page-lifetime checks pass.
6. Validate the resulting package in the emulator without modifying the original ROM file.

Runtime navigation is validation work. It is not a prerequisite for discovering source strings from ROM tables and program paths.

## Branch Snapshot

- Branch: `feature/nes-runtime-translation`
- Base before this development set: `d5a68337`
- Original ROM files remain unchanged; generated reports and packages are build outputs or review inputs.
- No Zombie Hunter translation catalog has been created yet.

## Captain Tsubasa II

### Implemented

- Generic NES game-profile loading, schema validation, source-hash guards, and deployable `.gmod` packages.
- Separate translation categories for `dialogue`, `battleMessage`, `menu`, `interface`, and `dictionary`.
- Lossless script IR and source-preserving adapter commands for export, import, migration, validation, and round-trip checks.
- Evidence-backed inventories for cutscenes, battle-cloud messages, and the fixed-bank word dictionary.
- Reviewed opening entries and an offline Traditional Chinese compiler that rasterizes a pinned 8x8 font into NES 2bpp CHR data.
- Runtime PRG/CHR overlay support with source-byte guards and a nametable-aware opening path.

### Inventory and Limits

- Cutscene inventory: 96 table entries, 88 unique scenes, and 15,760 source glyphs across the verified banks.
- Battle-cloud inventory: 240 message IDs, 236 unique allocations, and 2,697 source glyphs in the render IR.
- Fixed-bank dictionary: 240 pointer entries, with index 0 retained as an external RAM pointer and 239 fixed-bank records preserved.
- The title-menu category is registered separately, but additional menu writers still require runtime verification before broad translation claims are made.
- Several source regions are allocation-constrained. Longer translations may require shorter wording, repacking, relocation, or a game-specific encoding strategy.

### Key References

- [Captain Tsubasa II translation inventory](CAPTAIN_TSUBASA_2_TRANSLATION_INVENTORY.md)
- [Game profile authoring](GAME_PROFILE_AUTHORING.md)
- `game-profiles/captain-tsubasa-2-jp/`
- `tools/compile-captain-tsubasa-2.mjs`
- `tools/captain-tsubasa-2-adapter.mjs`

## Zombie Hunter

### ROM Identity

- ROM: `Zombie Hunter (Japan).nes`
- SHA-256: `91dfb1a0c29f78c5d5b0a582c737c62103c4009ad5e2c20fdecd0c22a8648a48`
- Mapper: MMC1 / Mapper 1
- PRG: 8 x 16 KiB banks
- CHR: 4 x 8 KiB banks

### Verified Static Program Paths

The primary selector is in bank 0:

```text
$8902 selector
  $88FE/$8901 -> pointer table $8F0E, 34 entries
  $8907/$890A -> pointer table $9165, 40 entries
  $890D -> $8ABC command-stream copier
```

The static extractor follows each little-endian pointer to a `00 81` terminated stream and preserves the complete parser output.

The extractor also scans all PRG banks for immediate pointer loads followed by the two direct source-copy entries:

```text
LDA #high
LDX #low
JSR $8B56 or JSR $8B52
```

The current ROM contains 17 such copier sites and 7 distinct sources. These sources include title-screen composite assets and are recorded as program-referenced source data, not automatically as translation units.

### Current Static Counts

- Pointer tables: 2
- Static entries: 74
- Non-empty stream candidates: 61
- Empty entries: 13
- Immediate copier sites: 17
- Distinct copier sources: 7
- Runtime-confirmed entries in the static report: 0
- Current decoder-supported Latin/punctuation-only candidates: 32

The remaining candidates retain unknown glyph byte values. They are not discarded and are not translated until their CHR mapping and rendered role are understood.

### Runtime Evidence

The separate runtime inventory currently confirms only the title prompt `PUSH START BOTTON`, copied through `$8B56` and rendered through `$F4A6`. It remains intentionally `partial-runtime-verified`; static candidates do not bypass this gate.

### Zombie Hunter References

- [Static candidate artifact](../artifacts/zombie-hunter-static-candidates.json)
- `tools/extract-zombie-hunter-static.mjs`
- `tools/decode-zombie-hunter-stream.mjs`
- `tools/build-zombie-hunter-evidence.mjs`
- `artifacts/zombie-hunter-verified-inventory.json`
- `tools/analyze-zombie-hunter.mjs`
- `tools/disassemble-zombie-hunter.mjs`

## Validation Commands

Run from the repository root:

```powershell
node --test tools/decode-zombie-hunter-stream.test.mjs tools/build-zombie-hunter-evidence.test.mjs tools/extract-zombie-hunter-static.test.mjs
npm run extract:zombie-hunter:static
npm run test:profiles
npm test
```

The focused Zombie Hunter suite currently covers parser controls, source round trips, runtime evidence isolation, pointer-table extraction, and immediate copier-site discovery.

The focused suites currently pass: Zombie Hunter parser/evidence/static extraction `6/6`, and Captain Tsubasa II profile/adapter/compiler `34/34`. A full `npm test` run currently reports `97/155` passing tests; the remaining failures are in the existing CPU/PPU unit-test setup and ROM magazine metadata count, outside the focused translation-tool checks. This result is recorded for the branch and is not treated as evidence that the translation artifacts are invalid.

## Remaining Work

### Zombie Hunter

- Discover any additional source paths not expressed as direct pointer-table reads or immediate copier calls.
- Complete Japanese glyph-to-CHR mapping and record tile-level evidence.
- Classify table A and copier sources as menu, credits, dialogue, layout, animation, or graphics data.
- Complete runtime inventory by validating classified static candidates through the renderer path.
- Only then create a reviewed Traditional Chinese catalog.
- Design a safe CHR allocation and PRG/CHR compiler with pointer, bank, overlay, and capacity checks.
- Produce a patch package and validate translated output in the emulator.

### Shared Framework

- Add category-specific adapters as each game's text writer and encoding become evidence-backed.
- Keep source hash, expected bytes, and runtime conditions attached to every deployable overlay.
- Add coverage and safety checks that fail on missing IDs, stale source evidence, allocation overflow, and unsafe CHR/page reuse.

## Completion Criteria

The translation phase is considered ready only when every translated unit has a source location, original bytes, parsed command structure, glyph mapping, domain classification, allocation policy, and a runtime validation path. Static extraction alone is sufficient for discovery, but not for approving a translation catalog or ROM replacement.