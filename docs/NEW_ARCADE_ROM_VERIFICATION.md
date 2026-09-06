# Supplied arcade ROM verification — 2026-09-06

## Retained game

**忍者棒球 (美版) / Ninja Baseball Batman (US, 1993)** is the only added game.
The supplied [nbbatman.zip](../roms/nbbatman.zip) matches all 15 chip sizes and
CRC32 values of the installed **nbbatmanu** driver. Its US program chips are
`a1-h0-a.34` / `a1-l0-a.31`, rather than the world driver's `6_h0.34` / `3_l0.31`.
The loader selects the US driver and mounts a copy under its MEMFS name without
changing the source archive. Both canonical driver names remain supported;
this verification covers only the supplied US archive.

Retained cover: [Ninja Baseball Batman flyer](../public/assets/covers/cover-55d88b6e2db2.jpg).
Catalog totals after this addition: **194 games / 31 arcade**.

## Reproducible verification

- [Audit](../tools/audit-new-arcade-roms.mjs): run `node tools/audit-new-arcade-roms.mjs`.
  Checks only the retained archive against world/US definitions shipped with
  the installed package; the world mismatch and complete US match are expected.
- [Runtime probe](../tools/probe-new-arcade-roms.mjs): run `node tools/probe-new-arcade-roms.mjs`.
  Runs only the retained archive offline with the installed production WASM.
  Regenerates disposable screenshots and JSON logs under `artifacts/arcade-runtime/`;
  these generated files are not retained in the change set.

Verified with **@mantou/fbneo 0.0.4 / FBNeo v1.0.0.02**: 320×240 framebuffer,
**2,166 draw and audio callbacks**, six distinct nonblack checkpoints after
boot, coin, start, selection, Stage 1 wait, and right+attack input. Prior manual
image inspection showed character selection and Stage 1 Seattle with Jose,
health HUD, timer and an enemy. The probe records runtime/source SHA-256 and
checks that the source archive is unchanged:
`3a9a9d09b3848577a631886673af1a6945fe0afc6b4be8f951bea9bfe0985c43`.

This establishes boot/start and early gameplay, not full-game completion,
browser UI, physical audio output, or multiplayer validation. The wrapper
connects two player slots although the original arcade supports four players.

## Rejected game removed

The supplied **Mega Man 2: The Power Fighters (USA)** was rejected: its 11 chips
matched but the required `megaman2.key` (20 bytes, CRC32 `6828ed6d`) was missing.
The earlier runtime probe produced no video properties or draw callbacks and
reported the missing key; `startMain` returning 0 did not establish successful
loading. No replacement ROM/key was downloaded or created.

The rejected archive and unused cover were deleted. It remains excluded from
the catalog and runtime allowlists. The intentional name-only exclusion test
is retained and does not require the deleted archive. Reusable audit/probe
scripts no longer load or assert failures for that game.

## Retained change inventory

- Runtime routing: [core](../src/arcade/fbneo-core.ts), [frontend](../src/main.ts).
- Catalog and metadata: [catalog](../public/roms.json),
  [metadata](../public/game-metadata.json), [editorial](../src/data/rom-metadata/arcade.ts),
  [cover importer](../tools/import-user-covers.mjs), retained archive and flyer above.
- Tests: [driver selection](../tests/fbneo-rom-set.test.ts),
  [catalog](../tests/rom-catalog.test.ts), [magazine metadata](../tests/rom-magazine-metadata.test.ts).
- The two reproduction tools and this document. No CT2 or unrelated asset changes.# Supplied arcade ROM verification — 2026-09-06

## Decision

Only **忍者棒球 (美版) / Ninja Baseball Batman (US, 1993)** is added to the catalog.
The original `roms/nbbatman.zip` is a complete **nbbatmanu** set, not the world
`nbbatman` revision: all 15 chip sizes and CRC32 values match the installed driver.
Its US program chips are `a1-h0-a.34` / `a1-l0-a.31`; the world driver instead
requires `6_h0.34` / `3_l0.31`. The loader selects `nbbatmanu` and mounts a copy
under that MEMFS name, preserving the original archive bytes and filename.
Both frontend/core allowlists include the canonical world and US driver names.
This audit verifies the supplied US set only, not a separate world archive.

**Mega Man 2: The Power Fighters (USA)** remains excluded from both the catalog
and runtime allowlists. Its 11 supplied chips match, but `megaman2.key` is missing
(20 bytes, CRC32 `6828ed6d`). This is a missing input asset, not something repaired
by changing the archive filename. No replacement ROM/key was downloaded or created.

## Actual runtime evidence (not ZIP recognition)

`node tools/audit-new-arcade-roms.mjs` audits against the installed package's
`em-out/games.txt`, not a current upstream MAME manifest.
`node tools/probe-new-arcade-roms.mjs` runs that same installed production WASM
offline in Node, in separate module instances. Package **@mantou/fbneo 0.0.4**
reports **FBNeo v1.0.0.02**. The generated results record WASM/definition SHA-256,
source SHA-256, load logs, frame hashes, draw counts, and before/after source checks.

- Ninja Baseball Batman: 320×240, 60 Hz, 32-bit framebuffer. Boot 900 frames;
  coin for 2 frames + release 60; start for 2 + release 180; attack/select for
  2 + release 240; wait 600; right+attack for 180. **2,166 draw callbacks and
  2,166 audio callbacks**, six distinct nonblack checkpoints. Images manually
  inspected: character selection after coin/start, then Stage 1 Seattle with
  1P Jose, health HUD, timer 99 and an enemy. This establishes boot/start and
  early gameplay, not a full-game completion or browser/audio-output test.
- Mega Man 2: the same 2,166 loop attempts, including coin/start/action inputs,
  produce **zero draw callbacks**, no video properties, and logs explicitly say
  `Loading megaman2.key... (not found)` / `There was an error loading your selected game.`
  `startMain` returns 0 even on this failure; return value alone is insufficient.
- Input bits match the production wrapper's Mantou mapping. The original arcade
  supports four players; the current wrapper only connects two player slots.

Evidence: [results and logs](../artifacts/arcade-runtime/results.json),
[character selection](../artifacts/arcade-runtime/nbbatmanu-start.png),
[Stage 1 gameplay](../artifacts/arcade-runtime/nbbatmanu-play.png).

Source SHA-256 (unchanged after probing):

- nbbatman: `3a9a9d09b3848577a631886673af1a6945fe0afc6b4be8f951bea9bfe0985c43`
- megaman2: `f88d599c4888dedbaea3277aa9002439cabb8f5adf60075245591f6506e549a4`

## Covers

Both already-downloaded images were visually inspected; no new image download.

- [cover-55d88b6e2db2.jpg](../public/assets/covers/cover-55d88b6e2db2.jpg):
  Ninja Baseball Batman flyer, mapped to `nbbatman.zip` in game metadata and
  retained in the user-cover import targets.
- [cover-0519163b9dbf.jpg](../public/assets/covers/cover-0519163b9dbf.jpg):
  Mega Man 2: The Power Fighters artwork (Arcade Stadium 2 presentation).
  Preserved locally, deliberately not mapped to a playable catalog entry.

## Validation and limitations

- Final targeted ROM-set/catalog/magazine/arcade-input tests: **4 files, 20 tests passed**.
- Final offline runtime probe assertions passed; repeated frame hashes were identical.
- Full Vitest: **24 files passed / 2 failed; 277 tests passed / 57 failed**.
  Failures are 55 in `tests/cpu.test.ts` and 2 in `tests/ppu.test.ts`; these files
  and their `src/core` implementation are unchanged from HEAD. No unrelated
  NES-core fixes were attempted. Arcade input tests passed in the full suite.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed (wasm-pack, TypeScript, Vite). Existing Rust warnings
  and Vite warnings about the FBNeo package's Node branch remain.
- Built output includes `nbbatman.zip`, excludes `megaman2.zip`, and bundles
  `fbneo-arcade-4Zo5ca7C.wasm`. Catalog totals: **194 games / 31 arcade**.
  The magazine test's old 189 expectation was already stale before this +1 entry.
- No external blocker for the Node runtime audit/build. Missing CPS2 key blocks
  Mega Man 2; existing NES CPU/PPU failures block an all-green full suite.
  Browser UI, physical audio, multiplayer and whole-game completion were not tested.
- CT2 commit **5c0f6b5** remains HEAD. No CT2 source changes, ROM modifications,
  downloads of other ROMs, commits, or pushes.

## Change inventory

- Runtime routing: `src/arcade/fbneo-core.ts`, `src/main.ts`.
- Catalog/editorial/cover mapping: `public/roms.json`, `public/game-metadata.json`,
  `src/data/rom-metadata/arcade.ts`, `tools/import-user-covers.mjs`, both cover JPEGs.
- Tests: `tests/fbneo-rom-set.test.ts`, `tests/rom-catalog.test.ts`,
  `tests/rom-magazine-metadata.test.ts`.
- Audit/reproduction: `tools/audit-new-arcade-roms.mjs`,
  `tools/probe-new-arcade-roms.mjs`, this document, and generated
  `artifacts/arcade-runtime/results.json` plus six PNG checkpoints.
- The two supplied ZIPs remain untracked and unmodified.