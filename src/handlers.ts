import type { Library } from './loader.js';
import type { ToolName } from './tools.js';
import type { Game, ToolHandler, ToolResult } from './types.js';

function ok(text: string): ToolResult {
  return { ok: true, text };
}

function fail(message: string): ToolResult {
  return { ok: false, message };
}

function fuseConfidence(score: number | undefined): number {
  return Math.round((1 - (score ?? 0)) * 100) / 100;
}

function compactResult(game: Game, confidence: number) {
  return {
    id: game.ID,
    title: game.Title,
    platform: game.Platform,
    installed: game.Installed,
    playTime: game.PlayTime,
    confidence,
  };
}

function sortedPlatformCounts(games: Game[]): { platform: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const g of games) {
    counts.set(g.Platform, (counts.get(g.Platform) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([platform, count]) => ({ platform, count }))
    .sort((a, b) => b.count - a.count);
}

export function createHandlers(
  state: { library: Library },
  reload: () => Promise<void>,
): Record<ToolName, ToolHandler> {
  async function handleSearchGames(args: Record<string, unknown>): Promise<ToolResult> {
    const query = args.query as string | undefined;
    if (!query) return fail('query is required');
    const platform = args.platform as string | undefined;
    const limit = (args.limit as number | undefined) ?? 25;

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
    const id = args.id as string | undefined;
    if (!id) return fail('id is required');
    const includeNotes = (args.include_notes as boolean | undefined) ?? false;

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
