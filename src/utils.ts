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

// Fuse.js scores 0 (perfect) to 1 (worst match that passed threshold); invert so 1 is best.
export function fuseConfidence(score: number): number {
  return Math.round((1 - score) * 100) / 100;
}

export function compactResult(
  game: Game,
  confidence: number,
): { id: string; title: string; platform: string; installed: boolean; playTime: number; confidence: number } {
  return {
    id: game.ID,
    title: game.Title,
    platform: game.Platform,
    installed: game.Installed,
    playTime: game.PlayTime,
    confidence,
  };
}

export function sortedPlatformCounts(games: readonly Game[]): { platform: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const g of games) {
    counts.set(g.Platform, (counts.get(g.Platform) ?? 0) + 1);
  }
  return [...counts.entries()].map(([platform, count]) => ({ platform, count })).sort((a, b) => b.count - a.count);
}
