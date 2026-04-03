import type { Library } from './loader.js';
import type { ToolName } from './tools.js';
import type { ToolHandler, ToolResult } from './types.js';
import {
  asInt,
  asString,
  compactResult,
  fail,
  fuseConfidence,
  ok,
  requireString,
  sortedPlatformCounts,
} from './utils.js';

export function createHandlers(
  state: { library: Library },
  reload: () => Promise<void>,
): Record<ToolName, ToolHandler> {
  async function handleSearchGames(args: Record<string, unknown>): Promise<ToolResult> {
    const query = requireString('query', args.query);
    if (typeof query !== 'string') return query;
    const platform = asString(args.platform);
    if (args.platform !== undefined && platform === undefined) return fail('platform must be a string');
    const limit = asInt(args.limit, 25);
    if (typeof limit !== 'number') return limit;

    let results = state.library.fuse.search(query);

    if (platform) {
      const p = platform.toLowerCase();
      results = results.filter((r) => r.item.Platform.toLowerCase() === p);
    }

    const limited = results.slice(0, limit);

    const items = limited.map((r) => compactResult(r.item, fuseConfidence(r.score)));

    return ok(JSON.stringify({ total: results.length, showing: limited.length, results: items }));
  }

  async function handleCheckLibrary(args: Record<string, unknown>): Promise<ToolResult> {
    const titles = args.games;
    if (!Array.isArray(titles) || titles.length === 0 || !titles.every((t) => typeof t === 'string'))
      return fail('games is required (array of strings)');
    const maxTitles = asInt(args.limit, 100);
    if (typeof maxTitles !== 'number') return maxTitles;
    if (titles.length > maxTitles) return fail(`Too many titles (${titles.length}), max is ${maxTitles}`);
    const platform = asString(args.platform);
    if (args.platform !== undefined && platform === undefined) return fail('platform must be a string');
    const CONFIDENCE_THRESHOLD = 0.85;
    const platformFilter = platform?.toLowerCase();

    const results = titles.map((query) => {
      // Fast path: exact title match
      let candidates = state.library.gamesByTitle.get(query.toLowerCase());

      if (candidates) {
        if (platformFilter) {
          candidates = candidates.filter((g) => g.Platform.toLowerCase() === platformFilter);
        }
        return {
          query,
          matches: candidates.map((g) => compactResult(g, 1.0)),
        };
      }

      // Slow path: fuzzy search (title only)
      let fuzzyResults = state.library.fuseTitleOnly.search(query);

      if (platformFilter) {
        fuzzyResults = fuzzyResults.filter((r) => r.item.Platform.toLowerCase() === platformFilter);
      }

      const matches = fuzzyResults
        .filter((r) => fuseConfidence(r.score) >= CONFIDENCE_THRESHOLD)
        .map((r) => compactResult(r.item, fuseConfidence(r.score)));

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
    const id = requireString('id', args.id);
    if (typeof id !== 'string') return id;
    const includeNotes = args.include_notes === undefined ? false : args.include_notes === true;

    const game = state.library.gamesById.get(id);
    if (!game) return fail(`Game not found: ${id}`);

    const gameData: Record<string, unknown> = {
      ID: game.ID,
      Title: game.Title,
      Platform: game.Platform,
      Developer: game.Developer,
      Publisher: game.Publisher,
      Genre: game.Genre,
      ReleaseDate: game.ReleaseDate,
      Source: game.Source,
      Series: game.Series,
      PlayMode: game.PlayMode,
      Rating: game.Rating,
      MaxPlayers: game.MaxPlayers,
      CommunityStarRating: game.CommunityStarRating,
      StarRating: game.StarRating,
      Status: game.Status,
      Favorite: game.Favorite,
      DatabaseID: game.DatabaseID,
      Hide: game.Hide,
      Broken: game.Broken,
      PlayCount: game.PlayCount,
      PlayTime: game.PlayTime,
      LastPlayedDate: game.LastPlayedDate,
      DateAdded: game.DateAdded,
      Installed: game.Installed,
      Completed: game.Completed,
      Progress: game.Progress,
    };
    if (includeNotes) gameData.Notes = game.Notes;
    return ok(JSON.stringify(gameData));
  }

  async function handleListPlatforms(): Promise<ToolResult> {
    return ok(JSON.stringify(sortedPlatformCounts(state.library.games)));
  }

  async function handleFindDuplicates(args: Record<string, unknown>): Promise<ToolResult> {
    const query = asString(args.query);
    if (args.query !== undefined && query === undefined) return fail('query must be a string');
    const limit = asInt(args.limit, 25);
    if (typeof limit !== 'number') return limit;

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
    const platforms = sortedPlatformCounts(state.library.games);

    const stats = {
      totalGames: state.library.games.length,
      totalPlatforms: platforms.length,
      topPlatforms: platforms.slice(0, 10),
    };

    return ok(JSON.stringify(stats));
  }

  async function handleReloadLibrary(): Promise<ToolResult> {
    await reload();
    return ok(
      JSON.stringify({
        reloaded: true,
        games: state.library.games.length,
        platforms: sortedPlatformCounts(state.library.games).length,
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
