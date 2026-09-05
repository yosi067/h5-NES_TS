# Runtime Game Profiles

Runtime game profiles change emulator-visible memory without modifying ROM files. The first backend targets NES ROMs and supports mapper-resolved PRG reads, CHR reads, CPU RAM, and PRG RAM.

## Files

- `game-profiles/schema/nes-runtime-profile.schema.json`: runtime profile contract.
- `game-profiles/schema/translation-catalog.schema.json`: editable text catalog contract.
- `game-profiles/<profile-id>/runtime.jsonc`: commented authoring source.
- `game-profiles/<profile-id>/translations.json`: categorized translation source.
- `public/game-profiles/index.json`: ROM SHA-256 to deployed package lookup.
- `public/game-profiles/<profile-id>/*.gmod`: compressed runtime package.

The browser hashes a loaded NES ROM, looks it up in the index, extracts `runtime.json` from the matching package, and asks the WASM core to install it. A missing package does not prevent the original game from running.

## Runtime Addresses

`prgReadOverlays[].offset` is a physical byte offset in PRG ROM after the iNES header and optional trainer. Mapper bank selection resolves a CPU read to this offset before the overlay is applied.

`chrReadOverlays[].offset` is a physical byte offset in CHR ROM. The PPU applies it after mapper CHR bank selection.

Every overlay requires `expectedOriginal`. Profile installation is atomic: a wrong ROM hash, mapper, offset, or original byte rejects the entire profile. The original PRG and CHR buffers are never changed.

`memoryWrites` supports these spaces and timings:

| Space | Valid address | Timing |
| --- | --- | --- |
| `cpuRam` | `$0000-$07FF` | `reset` or `frame` |
| `prgRam` | `$6000-$7FFF` | `reset` or `frame` |

Use `frame` only for parameters that must be locked continuously. It intentionally overrides game writes once per frame.

## Commands

Verify profile identity and every expected byte against a ROM:

```powershell
npm run profile -- verify --profile game-profiles/captain-tsubasa-2-jp/runtime.jsonc --rom "roms/Captain Tsubasa II - Super Striker (Japan).nes"
```

Export all text or selected categories for translators and AI tools:

```powershell
npm run profile -- export --catalog game-profiles/captain-tsubasa-2-jp/translations.json --format xliff --output artifacts/captain-tsubasa-2.xlf
npm run profile -- export --catalog game-profiles/captain-tsubasa-2-jp/translations.json --format jsonl --category dialogue,battleMessage --output artifacts/captain-tsubasa-2.jsonl
```

Import targets into a new catalog. Import rejects unknown stable IDs, duplicate IDs, and removed protected placeholders:

```powershell
npm run profile -- import --catalog game-profiles/captain-tsubasa-2-jp/translations.json --format xliff --input artifacts/captain-tsubasa-2.xlf --output artifacts/captain-tsubasa-2.translated.json
```

Compile and test a deployable package:

```powershell
npm run profile -- compile --profile game-profiles/captain-tsubasa-2-jp/runtime.jsonc --output public/game-profiles/captain-tsubasa-2-jp/captain-tsubasa-2-jp.gmod
npm run test:profiles
```

## Captain Tsubasa II Status

The profile is bound to SHA-256 `bf5038afe4c9df1c1c7eff0bc74a12f3cd8ed994b9aab92617d066d9d10ad746` and Mapper 4. Its translation catalog declares `dialogue`, `battleMessage`, `interface`, and `dictionary` separately.

The opening narration is compiled by `tools/compile-captain-tsubasa-2.mjs`. It replaces the verified PRG script slots with translated tile IDs and installs a nametable-guarded CHR page, so the translated glyphs are rendered by the NES PPU rather than drawn over the emulator canvas. The guard also requires the opening's active logical nametable; when the game leaves that page, the original CHR data is restored.

The compiler reads the pinned Fusion Pixel 8px Traditional Chinese BDF at build time, verifies the archive SHA-256, caches the extracted BDF outside the repository, and emits the required NES 2bpp bytes into the `.gmod`. Set `H5_NES_PIXEL_FONT` to a local BDF path for offline or reproducible builds. It never writes to the source ROM.

The fixed-bank dictionary has a separate evidence-backed path. Export or edit `translations/fixed-bank-words.zh-Hant.json`, then compile it with `npm run profile:captain-tsubasa-2:compile-dictionary`. The optional `--glyph-map` input is a JSON object mapping one-character strings to explicit visible tile codes. Existing table assignments and code collisions are rejected; the resulting artifact is still in-place and must be passed through the guarded dictionary ROM builder before packaging.

Rebuild the package after editing the catalog or compiler:

```powershell
npm run profile:captain-tsubasa-2
```

The current catalog covers the opening narration and title menu units. Additional dialogue should only be added after its PRG slots, control codes, CHR mapping, and page lifetime have been verified for this ROM.