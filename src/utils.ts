import type { Game, ToolResult } from './types.js';

export function ok(text: string): ToolResult {
  return { ok: true, text };
}

export function fail(message: string): ToolResult {
  return { ok: false, message };
}

export function parseLimit(val: unknown, fallback: number): number | ToolResult {
  if (val === undefined || val === null) return fallback;
  const n = Number(val);
  return Number.isInteger(n) && n > 0 ? n : fail(`limit must be an integer greater than 0, got: ${val}`);
}

export function asString(val: unknown): string | undefined | ToolResult {
  if (val === undefined || val === null) return undefined;
  return typeof val === 'string' ? val : fail(`Expected string, got ${typeof val}`);
}

export function requireString(name: string, val: unknown): string | ToolResult {
  if (typeof val === 'string' && val !== '') return val;
  return fail(`${name} is required (string)`);
}

export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[-–—:]/g, ' ')
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fuse.js scores 0 (perfect) to 1 (worst match that passed threshold); invert so 1 is best.
export function fuseConfidence(score: number): number {
  return Math.round((1 - score) * 100) / 100;
}

// Levenshtein with an early-out cap, if the running edit distance exceeds
// `cap`, returns `cap + 1` so callers can short-circuit. Used by the
// single-token guard below; we never need the exact distance, only whether
// it's within the tolerance.
function levenshteinAtMost(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;
  let prev = new Array(bLen + 1);
  let curr = new Array(bLen + 1);
  for (let j = 0; j <= bLen; j++) prev[j] = j;
  for (let i = 1; i <= aLen; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bLen; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > cap) return cap + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[bLen];
}

// Token-boundary guard: every query token must have a close whole-token
// Levenshtein match against the title tokens. Prevents short differentiating
// tokens (e.g. "2" in "Halo 2") being absorbed into longer title tokens
// (e.g. "2600" in "Halo 2600") which Fuse.js scores as near-perfect.
//
// Both `query` and `title` are expected to be normalised (see
// `normaliseTitle`). Typos are still allowed via a small Levenshtein
// tolerance proportional to token length: `floor(length / 4)` for tokens
// >= 5 chars, 0 for shorter tokens.
export function passesTokenBoundaryGuard(query: string, title: string): boolean {
  const queryTokens = query.split(/\s+/).filter(Boolean);
  if (queryTokens.length === 0) return true;
  const titleTokens = title.split(/\s+/).filter(Boolean);
  for (const q of queryTokens) {
    // Allow ~1 typo per 4 characters, bounded so 3-char queries are exact-ish.
    const tolerance = q.length >= 5 ? Math.floor(q.length / 4) : 0;
    let matched = false;
    for (const t of titleTokens) {
      if (levenshteinAtMost(q, t, tolerance) <= tolerance) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

export function emptyToNull(val: string): string | null {
  return val === '' ? null : val;
}

export function formatPlayTime(seconds: number): { seconds: number; hours: number } {
  return { seconds, hours: Math.round((seconds / 3600) * 10) / 10 };
}

export function compactResult(
  game: Game,
  confidence?: number,
): {
  id: string;
  title: string;
  platform: string;
  installed: boolean;
  playTime: { seconds: number; hours: number };
  confidence?: number;
} {
  const result: {
    id: string;
    title: string;
    platform: string;
    installed: boolean;
    playTime: { seconds: number; hours: number };
    confidence?: number;
  } = {
    id: game.ID,
    title: game.Title,
    platform: game.Platform,
    installed: game.Installed,
    playTime: formatPlayTime(game.PlayTime),
  };
  if (confidence !== undefined) result.confidence = confidence;
  return result;
}

export function sortedPlatformCounts(games: readonly Game[]): { platform: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const g of games) {
    counts.set(g.Platform, (counts.get(g.Platform) ?? 0) + 1);
  }
  return [...counts.entries()].map(([platform, count]) => ({ platform, count })).sort((a, b) => b.count - a.count);
}
