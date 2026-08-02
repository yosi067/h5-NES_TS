const TEMPORARY_SNES9X_FALLBACK_ROMS = new Set([
  'super mario kart (japan)',
  'super mario rpg (japan)',
  'star ocean (japan)',
]);

export const TEMPORARY_SNES9X_FALLBACK_ENABLED = false;

function normalizeRomStem(filename: string): string {
  const basename = filename.split(/[\\/]/).pop() ?? filename;
  return basename
    .replace(/\.zip$/i, '')
    .replace(/\.(?:sfc|smc|fig)$/i, '')
    .trim()
    .toLowerCase();
}

export function shouldUseTemporarySnes9xFallback(...filenames: string[]): boolean {
  return TEMPORARY_SNES9X_FALLBACK_ENABLED
    && filenames.some(filename => TEMPORARY_SNES9X_FALLBACK_ROMS.has(normalizeRomStem(filename)));
}