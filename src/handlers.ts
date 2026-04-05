import type { Library } from './loader.js';
import type { ToolName } from './tools.js';
import type { ToolHandler, ToolResult } from './types.js';
import { asInt, asString, compactResult, fail, fuseConfidence, ok, requireString } from './utils.js';

function matchesPlatform(gamePlatform: string, filter: string): boolean {
  return gamePlatform.toLowerCase() === filter.toLowerCase();
}

export function createHandlers(
  state: { library: Library },
  reload: () => Promise<void>,
): Record<ToolName, ToolHandler> {
  function handleSearchGames(args: Record<string, unknown>): ToolResult {
    const query = requireString('query', args.query);
    if (typeof query !== 'string') return query;
    const platform = asString(args.platform);
    if (typeof platform === 'object') return platform;
    const limit = asInt(args.limit, 25);
    if (typeof limit !== 'number') return limit;

    let results = state.library.fuse.search(query);

    if (platform) {
      results = results.filter((r) => matchesPlatform(r.item.Platform, platform));
    }

    const items = results.slice(0, limit).map((r) => compactResult(r.item, fuseConfidence(r.score!)));

    return ok(JSON.stringify({ results: items }));
  }

  function handleCheckLibrary(args: Record<string, unknown>): ToolResult {
    const titles = args.games;
    if (!Array.isArray(titles) || titles.length === 0 || !titles.every((t) => typeof t === 'string'))
      return fail('games is required (array of strings)');
    const maxTitles = asInt(args.limit, 100);
    if (typeof maxTitles !== 'number') return maxTitles;
    if (titles.length > maxTitles) return fail(`Too many titles (${titles.length}), max is ${maxTitles}`);
    const platform = asString(args.platform);
    if (typeof platform === 'object') return platform;
    // High threshold — check_library is for bundle duplicate checking, so
    // false positives (claiming you own a game you don't) are worse than misses
    const CONFIDENCE_THRESHOLD = 0.85;

    const results = titles.map((query) => {
      // Fast path: case-insensitive title match
      let candidates = state.library.gamesByTitle.get(query.toLowerCase());

      if (candidates) {
        if (platform) {
          candidates = candidates.filter((g) => matchesPlatform(g.Platform, platform));
        }
        return {
          query,
          matches: candidates.map((g) => compactResult(g, 1.0)),
        };
      }

      // Slow path: fuzzy search (title only)
      let fuzzyResults = state.library.fuseTitleOnly.search(query);

      if (platform) {
        fuzzyResults = fuzzyResults.filter((r) => matchesPlatform(r.item.Platform, platform));
      }

      const matches = fuzzyResults.flatMap((r) => {
        const confidence = fuseConfidence(r.score!);
        return confidence >= CONFIDENCE_THRESHOLD ? [compactResult(r.item, confidence)] : [];
      });

      return { query, matches };
    });

    const owned = results.filter((r) => r.matches.length > 0).length;

    return ok(
      JSON.stringify({
        results,
        summary: { total: titles.length, owned, new: titles.length - owned },
      }),
    );
  }

  function handleGetGameDetails(args: Record<string, unknown>): ToolResult {
    const id = requireString('id', args.id);
    if (typeof id !== 'string') return id;
    const game = state.library.gamesById.get(id);
    if (!game) return fail(`Game not found: ${id}`);

    const { Notes: _notes, ...gameData } = game;
    if (args.include_notes === true) return ok(JSON.stringify({ ...gameData, Notes: _notes }));
    return ok(JSON.stringify(gameData));
  }

  function handleListPlatforms(): ToolResult {
    return ok(JSON.stringify(state.library.platformCounts));
  }

  function handleFindDuplicates(args: Record<string, unknown>): ToolResult {
    const query = asString(args.query);
    if (typeof query === 'object') return query;
    const limit = asInt(args.limit, 25);
    if (typeof limit !== 'number') return limit;

    if (!query) {
      return ok(JSON.stringify(state.library.duplicateGroups.slice(0, limit)));
    }

    const source = state.library.fuse
      .search(query)
      .filter((r) => fuseConfidence(r.score!) >= 0.5)
      .map((r) => r.item);

    const groups = new Map<string, { title: string; platforms: Set<string>; entries: number }>();
    for (const g of source) {
      const key = g.Title.toLowerCase();
      let group = groups.get(key);
      if (!group) {
        group = { title: g.Title, platforms: new Set(), entries: 0 };
        groups.set(key, group);
      }
      group.platforms.add(g.Platform);
      group.entries++;
    }

    const duplicates = [...groups.values()]
      .filter((g) => g.entries >= 2)
      .map((g) => ({ title: g.title, platforms: [...g.platforms].sort(), entries: g.entries }))
      .sort((a, b) => b.entries - a.entries)
      .slice(0, limit);

    return ok(JSON.stringify(duplicates));
  }

  function handleGetStats(): ToolResult {
    const platforms = state.library.platformCounts;

    const stats = {
      totalGames: state.library.games.length,
      totalPlatforms: platforms.length,
      topPlatforms: platforms.slice(0, 10),
    };

    return ok(JSON.stringify(stats));
  }

  async function handleReloadLibrary(): Promise<ToolResult> {
    try {
      await reload();
    } catch (e) {
      return fail(`Reload failed: ${e instanceof Error ? e.message : e}. The previous library data is still active.`);
    }
    return ok(
      JSON.stringify({
        reloaded: true,
        games: state.library.games.length,
        platforms: state.library.platformCounts.length,
      }),
    );
  }

  return {
    search_games: handleSearchGames,
    check_library: handleCheckLibrary,
    get_game_details: handleGetGameDetails,
    list_platforms: handleListPlatforms,
    find_duplicates: handleFindDuplicates,
    get_stats: handleGetStats,
    reload_library: handleReloadLibrary,
  };
}
