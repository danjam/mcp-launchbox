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

export function emptyToNull(val: string): string | null {
  return val === '' ? null : val;
}

export function formatPlayTime(seconds: number): { seconds: number; hours: number } {
  return { seconds, hours: Math.round((seconds / 3600) * 10) / 10 };
}

export function compactResult(
  game: Game,
  confidence: number,
): {
  id: string;
  title: string;
  platform: string;
  installed: boolean;
  playTime: { seconds: number; hours: number };
  confidence: number;
} {
  return {
    id: game.ID,
    title: game.Title,
    platform: game.Platform,
    installed: game.Installed,
    playTime: formatPlayTime(game.PlayTime),
    confidence,
  };
}

export function tokenSet(title: string): ReadonlySet<string> {
  const tokens = normaliseTitle(title).split(' ');
  return new Set(tokens.filter((t) => t.length > 0));
}

function isSubset(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export function hasTokenContainment(queryTokens: ReadonlySet<string>, libraryTokens: ReadonlySet<string>): boolean {
  if (queryTokens.size === 0 || libraryTokens.size === 0) return false;
  if (queryTokens.size === libraryTokens.size) return false;
  const smaller = queryTokens.size < libraryTokens.size ? queryTokens : libraryTokens;
  if (smaller.size < 2) return false;
  return isSubset(queryTokens, libraryTokens) || isSubset(libraryTokens, queryTokens);
}

export function sortedPlatformCounts(games: readonly Game[]): { platform: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const g of games) {
    counts.set(g.Platform, (counts.get(g.Platform) ?? 0) + 1);
  }
  return [...counts.entries()].map(([platform, count]) => ({ platform, count })).sort((a, b) => b.count - a.count);
}
