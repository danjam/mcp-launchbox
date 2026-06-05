import type { Library } from './loader.js';
import type { ToolName } from './tools.js';
import type { Game, ToolHandler, ToolResult } from './types.js';
import {
  asString,
  compactResult,
  emptyToNull,
  fail,
  formatPlayTime,
  fuseConfidence,
  normaliseTitle,
  ok,
  parseLimit,
  passesSingleTokenTitleGuard,
  requireString,
} from './utils.js';

function matchesPlatform(gamePlatform: string, filter: string): boolean {
  return gamePlatform.toLowerCase() === filter.toLowerCase();
}

export function createHandlers(
  state: {
    library: Library;
    lastReloadDiff?: {
      added: { id: string; title: string; platform: string }[];
      removed: { id: string; title: string; platform: string }[];
    } | null;
  },
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
      ? (state.library.platformFuse.get(platform.toLowerCase()) ?? state.library.fuse)
      : state.library.fuse;
    const results = index.search(exact ? query : normaliseTitle(query));

    const items = results.slice(0, limit).map((r) => compactResult(r.item, fuseConfidence(r.score ?? 0)));

    return ok(JSON.stringify({ results: items }));
  }

  function handleCheckLibrary(args: Record<string, unknown>): ToolResult {
    const titles = args.games;
    if (!Array.isArray(titles) || titles.length === 0 || !titles.every((t) => typeof t === 'string'))
      return fail('games is required (array of strings)');
    const validTitles: string[] = titles.filter((t) => t.trim() !== '');
    if (validTitles.length === 0) return fail('games must contain at least one non-empty string');
    const maxTitles = 100;
    if (validTitles.length > maxTitles) return fail(`Too many titles (${validTitles.length}), max is ${maxTitles}`);
    const platform = asString(args.platform);
    if (typeof platform === 'object') return platform;
    const exact = args.exact === true;
    // High threshold, check_library is for bundle duplicate checking, so
    // false positives (claiming you own a game you don't) are worse than misses
    const CONFIDENCE_THRESHOLD = 0.85;

    const results = validTitles.map((query) => {
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
        ? (state.library.platformFuseTitleOnly.get(platform.toLowerCase()) ?? state.library.fuseTitleOnly)
        : state.library.fuseTitleOnly;
      const normalisedQuery = exact ? query : normaliseTitle(query);
      const fuzzyResults = titleIndex.search(normalisedQuery);

      const NEAR_MISS_FLOOR = 0.4;
      const matches: ReturnType<typeof compactResult>[] = [];
      const nearMisses: (
        | { title: string; platform: string; confidence: number }
        | { title: string; platform: string; prefixMatch: true }
      )[] = [];

      for (const r of fuzzyResults) {
        const confidence = fuseConfidence(r.score ?? 0);
        // Issue #2: a single-token query (`"Gord"`) should not trigger an
        // owned-confidence match against a mid-token substring of a longer
        // title (`"Flash Gordon"`). With `ignoreLocation: true` Fuse scores
        // the substring 0.99 even though the user clearly hasn't typed
        // "Flash Gordon". Drop matches whose title has no whole-token
        // (Levenshtein-tolerant) hit for the query token. Multi-token
        // queries already get IDF differentiation and are unaffected.
        const titleNorm = normaliseTitle(r.item.Title);
        if (!passesSingleTokenTitleGuard(normalisedQuery, titleNorm)) continue;
        if (confidence >= CONFIDENCE_THRESHOLD) {
          matches.push(compactResult(r.item, confidence));
        } else if (confidence >= NEAR_MISS_FLOOR && nearMisses.length < 5) {
          nearMisses.push({ title: r.item.Title, platform: r.item.Platform, confidence });
        }
      }

      if (matches.length > 0) return { query, matches };

      // Prefix fallback: the query may have a subtitle the library entry
      // lacks (e.g. query "Behind the Frame: The Finest Scenery", library
      // has "Behind the Frame"). Try progressively shorter token prefixes
      // of the normalised query against the title map. Surfaced as
      // nearMisses with `prefixMatch: true` — not matches — prefix hits
      // are leads, not ownership assertions.
      if (nearMisses.length < 5) {
        const normTokens = normaliseTitle(query).split(/\s+/).filter(Boolean);
        for (let i = normTokens.length - 1; i >= 1; i--) {
          const prefix = normTokens.slice(0, i).join(' ');
          let prefixCandidates = state.library.gamesByNormalisedTitle.get(prefix);
          if (!prefixCandidates) continue;
          if (platform) {
            prefixCandidates = prefixCandidates.filter((g) => matchesPlatform(g.Platform, platform));
          }
          for (const g of prefixCandidates) {
            if (nearMisses.length >= 5) break;
            nearMisses.push({ title: g.Title, platform: g.Platform, prefixMatch: true });
          }
          break;
        }
      }

      return { query, matches, nearMisses };
    });

    const owned = results.filter((r) => r.matches.length > 0).length;

    return ok(
      JSON.stringify({
        results,
        summary: { total: validTitles.length, owned, new: validTitles.length - owned },
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
    const versions = state.library.versionsByGameId.get(game.ID);
    if (versions && versions.length > 0) detail.versions = versions;
    return ok(JSON.stringify(detail));
  }

  function applyFilters(args: Record<string, unknown>): readonly Game[] | ToolResult {
    const platform = asString(args.platform);
    if (typeof platform === 'object') return platform;

    let statusFilter: string[] | undefined;
    if (args.status !== undefined && args.status !== null) {
      if (typeof args.status === 'string') {
        statusFilter = [args.status];
      } else if (Array.isArray(args.status) && args.status.every((s) => typeof s === 'string')) {
        statusFilter = args.status as string[];
      } else {
        return fail('status must be a string or array of strings');
      }
    }

    let filtered: readonly Game[] = state.library.games;
    if (platform) filtered = filtered.filter((g) => matchesPlatform(g.Platform, platform));
    if (args.installed === true) filtered = filtered.filter((g) => g.Installed);
    if (args.installed === false) filtered = filtered.filter((g) => !g.Installed);
    if (args.favorite === true) filtered = filtered.filter((g) => g.Favorite);
    if (args.favorite === false) filtered = filtered.filter((g) => !g.Favorite);
    if (statusFilter) filtered = filtered.filter((g) => statusFilter.includes(g.Progress));
    return filtered;
  }

  function handleListGames(args: Record<string, unknown>): ToolResult {
    const limit = parseLimit(args.limit, 25);
    if (typeof limit !== 'number') return limit;
    const offsetVal = args.offset;
    const offset =
      offsetVal === undefined || offsetVal === null
        ? 0
        : Number.isInteger(Number(offsetVal)) && Number(offsetVal) >= 0
          ? Number(offsetVal)
          : undefined;
    if (offset === undefined) return fail(`offset must be a non-negative integer, got: ${offsetVal}`);
    const sort = asString(args.sort);
    if (typeof sort === 'object') return sort;
    const validSorts = ['title', 'dateAdded', 'lastPlayedDate', 'playTime'] as const;
    if (sort && !validSorts.includes(sort as (typeof validSorts)[number]))
      return fail(`sort must be one of: ${validSorts.join(', ')}`);
    const sortKey = (sort ?? 'title') as (typeof validSorts)[number];

    const filtered = applyFilters(args);
    if (!Array.isArray(filtered) && 'ok' in filtered) return filtered;

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'dateAdded':
          return (b.DateAdded || '').localeCompare(a.DateAdded || '');
        case 'lastPlayedDate':
          return (b.LastPlayedDate || '').localeCompare(a.LastPlayedDate || '');
        case 'playTime':
          return b.PlayTime - a.PlayTime;
        default:
          return a.Title.toLowerCase().localeCompare(b.Title.toLowerCase());
      }
    });

    const page = sorted.slice(offset, offset + limit);
    const items = page.map((g) => ({
      ...compactResult(g),
      dateAdded: emptyToNull(g.DateAdded),
      lastPlayedDate: emptyToNull(g.LastPlayedDate),
    }));

    return ok(JSON.stringify({ total: filtered.length, results: items }));
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

    const matchRank = new Map<string, number>();
    const fuseResults = state.library.fuse.search(query).filter((r) => fuseConfidence(r.score ?? 0) >= 0.5);
    for (let i = 0; i < fuseResults.length; i++) {
      const r = fuseResults[i];
      if (!r) continue;
      const key = r.item.Title.toLowerCase();
      if (!matchRank.has(key)) matchRank.set(key, i);
    }

    const duplicates = state.library.duplicateGroups
      .filter((g) => matchRank.has(g.title.toLowerCase()))
      .sort((a, b) => (matchRank.get(a.title.toLowerCase()) ?? 0) - (matchRank.get(b.title.toLowerCase()) ?? 0))
      .slice(0, limit);

    return ok(JSON.stringify(duplicates));
  }

  function handleGetStats(): ToolResult {
    const platforms = state.library.platformCounts;

    const statusMap = new Map<string, number>();
    for (const g of state.library.games) {
      const status = g.Progress || 'No Status';
      statusMap.set(status, (statusMap.get(status) ?? 0) + 1);
    }
    const statusCounts = [...statusMap.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    const stats = {
      totalGames: state.library.games.length,
      totalPlatforms: platforms.length,
      topPlatforms: platforms.slice(0, 10),
      statusCounts,
    };

    return ok(JSON.stringify(stats));
  }

  function handleRandomGame(args: Record<string, unknown>): ToolResult {
    const filtered = applyFilters(args);
    if (!Array.isArray(filtered) && 'ok' in filtered) return filtered;

    if (filtered.length === 0) return ok(JSON.stringify({ game: null, matchPool: 0 }));

    const pick = filtered[Math.floor(Math.random() * filtered.length)] as Game;
    const game = {
      ...compactResult(pick),
      dateAdded: emptyToNull(pick.DateAdded),
      lastPlayedDate: emptyToNull(pick.LastPlayedDate),
    };
    return ok(JSON.stringify({ game, matchPool: filtered.length }));
  }

  async function handleReloadLibrary(): Promise<ToolResult> {
    try {
      await reload();
    } catch (e) {
      return fail(`Reload failed: ${e instanceof Error ? e.message : e}. The previous library data is still active.`);
    }
    const result: Record<string, unknown> = {
      reloaded: true,
      games: state.library.games.length,
      platforms: state.library.platformCounts.length,
    };
    if (state.lastReloadDiff) {
      result.added = state.lastReloadDiff.added;
      result.removed = state.lastReloadDiff.removed;
    }
    return ok(JSON.stringify(result));
  }

  return {
    search_games: handleSearchGames,
    check_library: handleCheckLibrary,
    get_game_details: handleGetGameDetails,
    list_games: handleListGames,
    list_platforms: handleListPlatforms,
    find_duplicates: handleFindDuplicates,
    get_stats: handleGetStats,
    random_game: handleRandomGame,
    reload_library: handleReloadLibrary,
  };
}
