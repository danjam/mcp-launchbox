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
    if (titles.some((t) => t.trim() === '')) return fail('games must not contain empty strings');
    const maxTitles = parseLimit(args.limit, 100);
    if (typeof maxTitles !== 'number') return maxTitles;
    if (titles.length > maxTitles) return fail(`Too many titles (${titles.length}), max is ${maxTitles}`);
    const platform = asString(args.platform);
    if (typeof platform === 'object') return platform;
    const exact = args.exact === true;
    // High threshold, check_library is for bundle duplicate checking, so
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
        ? (state.library.platformFuseTitleOnly.get(platform.toLowerCase()) ?? state.library.fuseTitleOnly)
        : state.library.fuseTitleOnly;
      const normalisedQuery = exact ? query : normaliseTitle(query);
      const fuzzyResults = titleIndex.search(normalisedQuery);

      const NEAR_MISS_FLOOR = 0.4;
      const matches: ReturnType<typeof compactResult>[] = [];
      const nearMisses: { title: string; platform: string; confidence: number }[] = [];

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

      // Prefix fallback: when both matches and nearMisses are empty, the
      // query may have a subtitle the library entry lacks (e.g. query
      // "Behind the Frame: The Finest Scenery", library has "Behind the
      // Frame"). Try progressively shorter token prefixes of the normalised
      // query against the title map. Surfaced as nearMisses (confidence 0),
      // not matches — prefix hits are leads, not ownership assertions.
      // Confidence 0 is intentionally out-of-band (nearMisses from Fuse
      // carry 0.4–0.85) so consumers can distinguish the source.
      if (nearMisses.length === 0) {
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
            nearMisses.push({ title: g.Title, platform: g.Platform, confidence: 0 });
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
    const versions = state.library.versionsByGameId.get(game.ID);
    if (versions && versions.length > 0) detail.versions = versions;
    return ok(JSON.stringify(detail));
  }

  function handleListGames(args: Record<string, unknown>): ToolResult {
    const platform = asString(args.platform);
    if (typeof platform === 'object') return platform;
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
    const validSorts = ['title', 'dateAdded', 'lastPlayed', 'playTime'] as const;
    if (sort && !validSorts.includes(sort as (typeof validSorts)[number]))
      return fail(`sort must be one of: ${validSorts.join(', ')}`);
    const sortKey = (sort ?? 'title') as (typeof validSorts)[number];

    let filtered: readonly Game[] = state.library.games;
    if (platform) filtered = filtered.filter((g) => matchesPlatform(g.Platform, platform));
    if (args.installed === true) filtered = filtered.filter((g) => g.Installed);
    if (args.installed === false) filtered = filtered.filter((g) => !g.Installed);
    if (args.favorite === true) filtered = filtered.filter((g) => g.Favorite);
    if (args.favorite === false) filtered = filtered.filter((g) => !g.Favorite);

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'dateAdded':
          return (b.DateAdded || '').localeCompare(a.DateAdded || '');
        case 'lastPlayed':
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
      lastPlayed: emptyToNull(g.LastPlayedDate),
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
    reload_library: handleReloadLibrary,
  };
}
