import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildDefaultLocalization } from './build-ct2-localization.mjs';

/** Fixed 12px CJK / 6px ASCII; audit complete runtime lines, never isolated runs.
 * Read-only: importing the builder does not regenerate public assets.
 * This is a conservative byte-width estimate, not a renderer geometry proof.
 */
export function auditTranslationFit({ catalog, runtime } = buildDefaultLocalization()) {
  const entries = new Map(catalog.entries.map(entry => [entry.id, entry]));
  const groups = new Map();
  for (const run of runtime.runs) {
    if (!/^(opening\.intro|opening-cutscenes|cutscenes-bank-04|cutscenes-bank-05)\./u.test(run.id)) continue;
    if (!groups.has(run.line)) groups.set(run.line, []);
    groups.get(run.line).push(run);
  }
  return [...groups].map(([line, runs]) => {
    const parts = runs.map(run => {
      const entry = entries.get(run.id);
      if (!entry) throw new Error(`Missing catalog entry: ${run.id}`);
      return { id: run.id, source: entry.source, translation: entry.translation };
    });
    const sourceBytes = runs.reduce((sum, run) => sum + run.bytes.length, 0);
    const budget = Math.floor(sourceBytes * 8 / 12);
    const translation = parts.map(part => part.translation).join('');
    const width = [...translation].reduce((sum, char) => sum + (char.codePointAt(0) < 128 ? 0.5 : 1), 0);
    return { line, sourceBytes, budget, width, excessPx: Math.max(0, (width - budget) * 12),
      source: parts.map(part => part.source).join(''), translation, parts };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lines = auditTranslationFit();
  const over = lines.filter(line => line.excessPx > 0);
  console.log(JSON.stringify({ totalLines: lines.length, fitting: lines.length - over.length,
    overBudget: over.length, over16px: over.filter(line => line.excessPx > 16).length }));
  // Largest excess first. Every unresolved line includes its source and run IDs
  // for manual review; never rewrite text or silently shrink the font.
  for (const line of over.sort((a, b) => b.excessPx - a.excessPx)) console.log(JSON.stringify(line));
}