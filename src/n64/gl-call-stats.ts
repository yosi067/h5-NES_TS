// Opt-in WebGL call histogram for the N64 renderer. Every WebGL call is a command the
// browser must forward to its GPU process, and getters can force a synchronous round
// trip, so call counts show where renderer work goes even when wall timings move around.

export type GlCallCounts = Record<string, number>;

export interface GlCallCounter {
  snapshot(): GlCallCounts;
  uninstall(): void;
}

export interface GlCallSummary {
  loops: number;
  callsPerLoop: number;
  /** get*, is*, finish, readPixels and similar calls that can block on the GPU process. */
  syncLikeCallsPerLoop: number;
  top: Array<{ name: string; perLoop: number; syncLike: boolean }>;
}

const SYNC_LIKE_CALLS = new Set(['finish', 'readPixels', 'checkFramebufferStatus', 'clientWaitSync']);

export function isSyncLikeGlCall(name: string): boolean {
  return SYNC_LIKE_CALLS.has(name) || /^(get|is)[A-Z]/.test(name);
}

export function glCallStatsEnabled(search: string): boolean {
  return new URLSearchParams(search).get('n64GlCallStats') === '1';
}

/** Wraps every method on the prototype; contexts created before or after install are both counted. */
export function installGlCallCounter(prototype: object): GlCallCounter {
  const counts: GlCallCounts = {};
  const originals = new Map<string, PropertyDescriptor>();

  for (const name of Object.getOwnPropertyNames(prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (name === 'constructor' || !descriptor || typeof descriptor.value !== 'function' || !descriptor.configurable) continue;
    const original = descriptor.value as (...args: unknown[]) => unknown;
    originals.set(name, descriptor);
    counts[name] = 0;
    Object.defineProperty(prototype, name, {
      ...descriptor,
      value: function countedGlCall(this: unknown, ...args: unknown[]) {
        counts[name]++;
        return original.apply(this, args);
      },
    });
  }

  return {
    snapshot: () => ({ ...counts }),
    uninstall() {
      for (const [name, descriptor] of originals) Object.defineProperty(prototype, name, descriptor);
      originals.clear();
    },
  };
}

export function summarizeGlCalls(
  previous: GlCallCounts,
  current: GlCallCounts,
  loops: number,
  topCount = 15,
): GlCallSummary {
  const divisor = Math.max(1, loops);
  let calls = 0;
  let syncLikeCalls = 0;
  const deltas: Array<{ name: string; delta: number }> = [];
  for (const [name, total] of Object.entries(current)) {
    const delta = total - (previous[name] ?? 0);
    if (delta <= 0) continue;
    calls += delta;
    if (isSyncLikeGlCall(name)) syncLikeCalls += delta;
    deltas.push({ name, delta });
  }
  deltas.sort((a, b) => b.delta - a.delta || a.name.localeCompare(b.name));
  return {
    loops,
    callsPerLoop: calls / divisor,
    syncLikeCallsPerLoop: syncLikeCalls / divisor,
    top: deltas.slice(0, topCount).map(({ name, delta }) => ({
      name,
      perLoop: delta / divisor,
      syncLike: isSyncLikeGlCall(name),
    })),
  };
}
