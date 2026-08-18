# Game Metadata and Cartridge Presentation

## Feasibility

The UI and loading flow can support a verified cover, Chinese description, region, variant, source, and cartridge flag for every catalog entry. The current catalog is not yet complete as a metadata set, so the data collection must be treated as a separate verification phase rather than inferred from ROM filenames.

## Current Inventory

The `npm run audit:games` report currently shows:

- 189 catalog entries
- 200 ROM assets: 199 files and 1 directory
- 159 cartridge entries
- 30 arcade entries
- 11 assets present in `roms/` but not listed in `public/roms.json`
- 0 covers, 0 Chinese descriptions, and 0 verified records in the catalog

The 11 unlisted assets must be classified before metadata collection is called complete. Some are hacks, samples, alternate dumps, or assets whose filename does not match the current catalog naming convention.

## Verification Contract

A record is complete only when all of these are present and manually checked:

- The title identifies the actual game, region, release, and hack or translation variant.
- `cover` points to the correct box or cartridge artwork, or to an explicitly labelled substitute when no original cover exists.
- `description` is a Chinese introduction written or sourced for that exact release family.
- `coverSource` and `descriptionSource` identify the source of each field.
- `verified` is `true` after the asset and text have been checked together.
- `cartridge` is `true` for cartridge software and `false` for arcade archives.

## Source Policy

Candidate data can be gathered from public databases, but it must retain source information and cannot be considered verified automatically.

- Chinese descriptions: Chinese Wikipedia or Wikidata where an appropriate article exists, with attribution requirements preserved; otherwise write a short original description and mark the source as editorial.
- Box art: Libretro Thumbnails is useful for matching canonical releases and provides system-specific `Named_Boxarts` collections. Its project documentation states that the artwork originates from developers, publishers, scanners, collectors, and other contributors, so redistribution rights must be checked before bundling the images into this project.
- Hacks, multicarts, samples, and Chinese patches: use the base game's artwork only when the UI labels it as base artwork, and write the variant-specific note manually. Do not silently present base artwork as an official cover for a modified ROM.
- Missing or uncertain artwork: use a generated text label as a placeholder until a human confirms a source. The UI already supports this fallback.

## Implementation Status

- ROM records accept optional cover, description, region, variant, cartridge, source, and verification fields.
- The game list renders cover art, Chinese description, version metadata, and an explicit missing-data state.
- Broken cover URLs fall back to a text label instead of leaving a blank tile.
- `npm run audit:games` reports coverage, integrity, unlisted assets, and verification status.
- Cartridge systems show an insert animation before downloading and starting the game; arcade archives skip the animation.
- Reduced-motion preferences shorten the sequence and disable the CSS motion.

## Completion Criteria

Metadata work is complete when:

1. Every intended ROM asset is either listed in `public/roms.json` or documented as excluded.
2. Every listed entry has a source-backed cover or an explicit no-original-cover label.
3. Every listed entry has a Chinese description appropriate to its release or variant.
4. Every record is marked `verified: true` after review.
5. `npm run audit:games -- --strict` exits successfully.
6. `npm run build` succeeds and the selector remains usable on desktop and mobile.
