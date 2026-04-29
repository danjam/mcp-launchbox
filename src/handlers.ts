import type { Library } from './loader.js';
import type { ToolName } from './tools.js';
import type { ToolHandler, ToolResult } from './types.js';
import {
  parseLimit, asString, compactResult, emptyToNull, fail, formatPlayTime, fuseConfidence, normaliseTitle, ok,
  requireString,
} from './utils.js';

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
    const limit = parseLimit(args.limit, 25);
    if (typeof limit !== 'number') return limit;
    const exact = args.exact === true;

    const index = platform
      ? state.library.platformFuse.get(platform.toLowerCase()) ?? state.library.fuse
      : state.library.fuse;
    const results = index.search(exact ? query : normaliseTitle(query));

    const items = results.slice(0, limit).map((r) => compactResult(r.item, fuseConfidence(r.score!)));

    return ok(JSON.stringify({ results: items }));
  }

  function handleCheckLibrary(args: Record<string, unknown>): ToolResult {
    const titles = args.games;
    if (!Array.isArray(titles) || titles.length === 0 || !titles.every((t) => typeof t === 'string'))
      return fail('games is required (array of strings)');
    const maxTitles = parseLimit(args.limit, 100);
    if (typeof maxTitles !== 'number') return maxTitles;
    if (titles.length > maxTitles) return fail(`Too many titles (${titles.length}), max is ${maxTitles}`);
    const platform = asString(args.platform);
    if (typeof platform === 'object') return platform;
    const exact = args.exact === true;
    // High threshold — check_library is for bundle duplicate checking, so
    // false positives (claiming you own a game you don't) are worse than misses
    const CONFIDENCE_THRESHOLD = 0.85;

    const results = titles.map((query) => {
      const titleMap = exact ? state.library.gamesByTitle : state.library.gamesByNormalisedTitle;
      let candidates = titleMap.get(exact ? query.toLowerCase() : normaliseTitle(query));

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
      const titleIndex = platform
        ? state.library.platformFuseTitleOnly.get(platform.toLowerCase()) ?? state.library.fuseTitleOnly
        : state.library.fuseTitleOnly;
      const fuzzyResults = titleIndex.search(exact ? query : normaliseTitle(query));

      const NEAR_MISS_FLOOR = 0.4;
      const matches: ReturnType<typeof compactResult>[] = [];
      const nearMisses: { title: string; platform: string; confidence: number }[] = [];

      for (const r of fuzzyResults) {
        const confidence = fuseConfidence(r.score!);
        if (confidence >= CONFIDENCE_THRESHOLD) {
          matches.push(compactResult(r.item, confidence));
        } else if (confidence >= NEAR_MISS_FLOOR && nearMisses.length < 5) {
          nearMisses.push({ title: r.item.Title, platform: r.item.Platform, confidence });
        }
      }

      if (matches.length > 0) return { query, matches };
      return { query, matches, nearMisses };
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

    const detail: Record<string, unknown> = {
      id: game.ID,
      title: game.Title,
      platform: game.Platform,
      developer: emptyToNull(game.Developer),
      publisher: emptyToNull(game.Publisher),
      genres: game.Genre ? game.Genre.split(';').map((s) => s.trim()) : [],
      releaseDate: emptyToNull(game.ReleaseDate),
      source: emptyToNull(game.Source),
      series: emptyToNull(game.Series),
      playMode: emptyToNull(game.PlayMode),
      rating: emptyToNull(game.Rating),
      maxPlayers: game.MaxPlayers ? Number(game.MaxPlayers) || null : null,
      communityStarRating: Math.round(game.CommunityStarRating * 10) / 10,
      starRating: game.StarRating,
      status: emptyToNull(game.Status),
      favorite: game.Favorite,
      databaseId: Number(game.DatabaseID) || null,
      hide: game.Hide,
      broken: game.Broken,
      playCount: game.PlayCount,
      playTime: formatPlayTime(game.PlayTime),
      lastPlayedDate: emptyToNull(game.LastPlayedDate),
      dateAdded: emptyToNull(game.DateAdded),
      installed: game.Installed,
      completed: game.Completed,
      progress: emptyToNull(game.Progress),
    };
    if (args.include_notes === true) detail.notes = emptyToNull(game.Notes);
    return ok(JSON.stringify(detail));
  }

  function handleListPlatforms(): ToolResult {
    return ok(JSON.stringify(state.library.platformCounts));
  }

  function handleFindDuplicates(args: Record<string, unknown>): ToolResult {
    const query = asString(args.query);
    if (typeof query === 'object') return query;
    const limit = parseLimit(args.limit, 25);
    if (typeof limit !== 'number') return limit;

    if (!query) {
      return ok(JSON.stringify(state.library.duplicateGroups.slice(0, limit)));
    }

    const matchedKeys = new Set(
      state.library.fuse
        .search(query)
        .filter((r) => fuseConfidence(r.score!) >= 0.5)
        .map((r) => r.item.Title.toLowerCase()),
    );

    const duplicates = state.library.duplicateGroups
      .filter((g) => matchedKeys.has(g.title.toLowerCase()))
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
