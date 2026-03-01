import type { Library } from './loader.js';
import type { ToolHandler, ToolResult } from './types.js';

function ok(text: string): ToolResult {
  return { ok: true, text };
}

function fail(message: string): ToolResult {
  return { ok: false, message };
}

export function createHandlers(
  state: { library: Library },
  reload: () => Promise<void>,
): Record<string, ToolHandler> {
  async function handleSearchGames(args: Record<string, unknown>): Promise<ToolResult> {
    const query = args.query as string | undefined;
    if (!query) return fail('query is required');
    const platform = args.platform as string | undefined;
    const limit = (args.limit as number | undefined) ?? 25;

    let results = state.library.fuse.search(query);

    if (platform) {
      const p = platform.toLowerCase();
      results = results.filter((r) => r.item.normalizedPlatform === p);
    }

    const limited = results.slice(0, limit);

    const items = limited.map((r) => ({
      id: r.item.ID,
      title: r.item.Title,
      platform: r.item.Platform,
      installed: r.item.Installed,
      playTime: r.item.PlayTime,
      confidence: Math.round((1 - (r.score ?? 0)) * 100) / 100,
    }));

    return ok(JSON.stringify({ total: results.length, showing: limited.length, results: items }));
  }

  async function handleCheckLibrary(args: Record<string, unknown>): Promise<ToolResult> {
    const titles = args.games as string[] | undefined;
    if (!titles || !Array.isArray(titles) || titles.length === 0) return fail('games is required (array of strings)');
    const platform = args.platform as string | undefined;
    const CONFIDENCE_THRESHOLD = 0.85;
    const platformFilter = platform?.toLowerCase();

    const results = titles.map((query) => {
      // Fast path: exact title match
      let candidates = state.library.gamesByTitle.get(query.toLowerCase());

      if (candidates) {
        if (platformFilter) {
          candidates = candidates.filter((g) => g.normalizedPlatform === platformFilter);
        }
        return {
          query,
          matches: candidates.map((g) => ({
            id: g.ID,
            title: g.Title,
            platform: g.Platform,
            installed: g.Installed,
            playTime: g.PlayTime,
            confidence: 1.0,
          })),
        };
      }

      // Slow path: fuzzy search (title only)
      let fuzzyResults = state.library.fuseTitleOnly.search(query);

      if (platformFilter) {
        fuzzyResults = fuzzyResults.filter((r) => r.item.normalizedPlatform === platformFilter);
      }

      const matches = fuzzyResults
        .filter((r) => 1 - (r.score ?? 0) >= CONFIDENCE_THRESHOLD)
        .map((r) => ({
          id: r.item.ID,
          title: r.item.Title,
          platform: r.item.Platform,
          installed: r.item.Installed,
          playTime: r.item.PlayTime,
          confidence: Math.round((1 - (r.score ?? 0)) * 100) / 100,
        }));

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

  async function handleGetGameDetails(args: Record<string, unknown>): Promise<ToolResult> {
    const id = args.id as string | undefined;
    if (!id) return fail('id is required');
    const includeNotes = (args.include_notes as boolean | undefined) ?? false;

    const game = state.library.gamesById.get(id);
    if (!game) return fail(`Game not found: ${id}`);

    const { normalizedPlatform, Notes, ...rest } = game;
    const gameData = includeNotes ? { ...rest, Notes } : rest;
    return ok(JSON.stringify(gameData));
  }

  async function handleListPlatforms(): Promise<ToolResult> {
    const counts = new Map<string, number>();
    for (const g of state.library.games) {
      counts.set(g.Platform, (counts.get(g.Platform) ?? 0) + 1);
    }

    const platforms = [...counts.entries()]
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count);

    return ok(JSON.stringify(platforms));
  }

  async function handleFindDuplicates(args: Record<string, unknown>): Promise<ToolResult> {
    const query = args.query as string | undefined;
    const limit = (args.limit as number | undefined) ?? 25;

    let source = state.library.games;
    if (query) {
      source = state.library.fuse.search(query).map((r) => r.item);
    }

    const groups = new Map<string, { title: string; platforms: Set<string> }>();
    for (const g of source) {
      const key = g.Title.toLowerCase();
      let group = groups.get(key);
      if (!group) {
        group = { title: g.Title, platforms: new Set() };
        groups.set(key, group);
      }
      group.platforms.add(g.Platform);
    }

    const duplicates = [...groups.values()]
      .filter((g) => g.platforms.size >= 2)
      .map((g) => ({
        title: g.title,
        platforms: [...g.platforms].sort(),
        count: g.platforms.size,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return ok(JSON.stringify(duplicates));
  }

  async function handleGetStats(): Promise<ToolResult> {
    const counts = new Map<string, number>();
    for (const g of state.library.games) {
      counts.set(g.Platform, (counts.get(g.Platform) ?? 0) + 1);
    }

    const topPlatforms = [...counts.entries()]
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const stats = {
      totalGames: state.library.games.length,
      totalPlatforms: counts.size,
      topPlatforms,
    };

    return ok(JSON.stringify(stats));
  }

  async function handleReloadLibrary(): Promise<ToolResult> {
    await reload();
    const platforms = new Set(state.library.games.map((g) => g.Platform)).size;
    return ok(JSON.stringify({ reloaded: true, games: state.library.games.length, platforms }));
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
