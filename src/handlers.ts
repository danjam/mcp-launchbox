import type { Library } from './loader.js';
import type { ToolName } from './tools.js';
import type { Game, ToolHandler, ToolResult } from './types.js';
import {
  asString,
  compactListResult,
  compactResult,
  emptyToNull,
  fail,
  formatPlayTime,
  fuseConfidence,
  normaliseTitle,
  ok,
  parseLimit,
  parseOffset,
  requireString,
  tokenMatchConfidence,
} from './utils.js';

function matchesPlatform(gamePlatform: string, filterLower: string): boolean {
  return gamePlatform.toLowerCase() === filterLower;
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
    let query = requireString('query', args.query);
    if (typeof query !== 'string') return query;
    query = query.trim();
    if (query === '') return fail('query is required (non-empty string)');
    const rawPlatform = asString(args.platform);
    if (typeof rawPlatform === 'object') return rawPlatform;
    const platform = rawPlatform?.toLowerCase();
    const rawLimit = parseLimit(args.limit, 25);
    if (typeof rawLimit !== 'number') return rawLimit;
    const limit = Math.min(rawLimit, 100);
    const exact = args.exact === true;
    const installed = args.installed;
    const favorite = args.favorite;
    const matchesFilters = (g: Game) =>
      (installed === undefined || g.Installed === installed) && (favorite === undefined || g.Favorite === favorite);

    if (exact) {
      let candidates = state.library.gamesByTitle.get(query.toLowerCase()) ?? [];
      if (platform) candidates = candidates.filter((g) => matchesPlatform(g.Platform, platform));
      candidates = candidates.filter(matchesFilters);
      const items = candidates.slice(0, limit).map((g) => compactResult(g, 1.0, true));
      return ok(JSON.stringify({ results: items }));
    }

    const index = platform ? (state.library.platformFuse.get(platform) ?? state.library.fuse) : state.library.fuse;
    const normalisedQuery = normaliseTitle(query);
    const results = index.search(normalisedQuery);

    const items: ReturnType<typeof compactResult>[] = [];
    for (const r of results) {
      if (items.length >= limit) break;
      if (!matchesFilters(r.item)) continue;
      const rawConfidence = fuseConfidence(r.score ?? 0);
      const titleNorm = normaliseTitle(r.item.Title);
      const penalty = tokenMatchConfidence(normalisedQuery, titleNorm);
      const confidence = Math.round(rawConfidence * penalty * 100) / 100;
      if (confidence <= 0) continue;
      const isExactMatch = normalisedQuery === titleNorm;
      items.push(compactResult(r.item, confidence, isExactMatch || undefined));
    }

    return ok(JSON.stringify({ results: items }));
  }

  function handleCheckLibrary(args: Record<string, unknown>): ToolResult {
    const titles = args.games;
    if (!Array.isArray(titles) || titles.length === 0 || !titles.every((t) => typeof t === 'string'))
      return fail('games is required (array of strings)');
    const maxTitles = 100;

    // Validation pipeline: trim → filter empties → dedupe → truncate
    const skipped: Record<string, number> = {};
    const trimmed: string[] = titles.map((t) => t.trim());
    const afterEmpty: string[] = [];
    for (const t of trimmed) {
      if (t === '') {
        skipped.empty = (skipped.empty ?? 0) + 1;
      } else {
        afterEmpty.push(t);
      }
    }
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const t of afterEmpty) {
      const key = t.toLowerCase();
      if (seen.has(key)) {
        skipped.duplicate = (skipped.duplicate ?? 0) + 1;
      } else {
        seen.add(key);
        deduped.push(t);
      }
    }
    let validTitles: string[];
    if (deduped.length > maxTitles) {
      skipped.overflow = deduped.length - maxTitles;
      validTitles = deduped.slice(0, maxTitles);
    } else {
      validTitles = deduped;
    }
    if (validTitles.length === 0) return fail('games must contain at least one non-empty string');

    const rawPlatform = asString(args.platform);
    if (typeof rawPlatform === 'object') return rawPlatform;
    const platform = rawPlatform?.toLowerCase();
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

      // Exact mode: no fuzzy fallback, no prefix fallback
      if (exact) return { query, matches: [], nearMisses: [] };

      // Slow path: fuzzy search (title only)
      const titleIndex = platform
        ? (state.library.platformFuseTitleOnly.get(platform) ?? state.library.fuseTitleOnly)
        : state.library.fuseTitleOnly;
      const normalisedQuery = normaliseTitle(query);
      const fuzzyResults = titleIndex.search(normalisedQuery);

      const NEAR_MISS_FLOOR = 0.4;
      const matches: ReturnType<typeof compactResult>[] = [];
      const nearMisses: (
        | { title: string; platform: string; confidence: number }
        | { title: string; platform: string; shorterTitle: true }
      )[] = [];

      const MAX_MATCHES = 25;
      for (const r of fuzzyResults) {
        const rawConfidence = fuseConfidence(r.score ?? 0);
        if (rawConfidence < NEAR_MISS_FLOOR) continue;
        const titleNorm = normaliseTitle(r.item.Title);
        const penalty = tokenMatchConfidence(normalisedQuery, titleNorm);
        const confidence = Math.round(rawConfidence * penalty * 100) / 100;
        if (confidence < NEAR_MISS_FLOOR) continue;
        if (rawConfidence >= CONFIDENCE_THRESHOLD && penalty === 1.0) {
          if (matches.length < MAX_MATCHES) matches.push(compactResult(r.item, confidence));
        } else if (nearMisses.length < 5) {
          nearMisses.push({ title: r.item.Title, platform: r.item.Platform, confidence });
        }
      }

      if (matches.length > 0) return { query, matches };

      // Prefix fallback: the query may have a subtitle the library entry
      // lacks (e.g. query "Behind the Frame: The Finest Scenery", library
      // has "Behind the Frame"). Try progressively shorter token prefixes
      // of the normalised query against the title map. Surfaced as
      // nearMisses with `shorterTitle: true` — not matches — prefix hits
      // are leads, not ownership assertions.
      if (nearMisses.length < 5) {
        const normTokens = normalisedQuery.split(/\s+/).filter(Boolean);
        for (let i = normTokens.length - 1; i >= 1; i--) {
          const prefix = normTokens.slice(0, i).join(' ');
          let prefixCandidates = state.library.gamesByNormalisedTitle.get(prefix);
          if (!prefixCandidates) continue;
          if (platform) {
            prefixCandidates = prefixCandidates.filter((g) => matchesPlatform(g.Platform, platform));
          }
          for (const g of prefixCandidates) {
            if (nearMisses.length >= 5) break;
            nearMisses.push({ title: g.Title, platform: g.Platform, shorterTitle: true });
          }
          break;
        }
      }

      return { query, matches, nearMisses };
    });

    const owned = results.filter((r) => r.matches.length > 0).length;
    const summary: Record<string, unknown> = { total: validTitles.length, owned, new: validTitles.length - owned };
    if (Object.keys(skipped).length > 0) summary.skipped = skipped;

    return ok(JSON.stringify({ results, summary }));
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
    const rawPlatform = asString(args.platform);
    if (typeof rawPlatform === 'object') return rawPlatform;
    const platform = rawPlatform?.toLowerCase();

    let statusFilter: string[] | undefined;
    if (args.status !== undefined && args.status !== null) {
      if (typeof args.status === 'string') {
        statusFilter = [args.status];
      } else if (
        Array.isArray(args.status) &&
        args.status.length > 0 &&
        args.status.every((s) => typeof s === 'string')
      ) {
        statusFilter = args.status as string[];
      } else {
        return fail('status must be a string or array of strings');
      }
    }

    const { installed, favorite } = args;
    const filtered: Game[] = [];
    for (const g of state.library.games) {
      if (platform && !matchesPlatform(g.Platform, platform)) continue;
      if (installed === true && !g.Installed) continue;
      if (installed === false && g.Installed) continue;
      if (favorite === true && !g.Favorite) continue;
      if (favorite === false && g.Favorite) continue;
      if (statusFilter && !statusFilter.includes(g.Progress)) continue;
      filtered.push(g);
    }
    return filtered;
  }

  function handleListGames(args: Record<string, unknown>): ToolResult {
    const limit = parseLimit(args.limit, 25);
    if (typeof limit !== 'number') return limit;
    const offset = parseOffset(args.offset);
    if (typeof offset !== 'number') return offset;
    const sort = asString(args.sort);
    if (typeof sort === 'object') return sort;
    const validSorts = ['title', 'dateAdded', 'lastPlayedDate', 'playTime'] as const;
    if (sort && !validSorts.includes(sort as (typeof validSorts)[number]))
      return fail(`sort must be one of: ${validSorts.join(', ')}`);
    const sortKey = (sort ?? 'title') as (typeof validSorts)[number];

    const filtered = applyFilters(args);
    if ('ok' in filtered) return filtered;

    let sorted: readonly Game[];
    if (sortKey === 'title') {
      const withKey = filtered.map((g) => ({ g, k: g.Title.toLowerCase() }));
      withKey.sort((a, b) => a.k.localeCompare(b.k));
      sorted = withKey.map((x) => x.g);
    } else {
      sorted = [...filtered].sort((a, b) => {
        if (sortKey === 'playTime') return b.PlayTime - a.PlayTime;
        const field = sortKey === 'dateAdded' ? 'DateAdded' : 'LastPlayedDate';
        return (b[field] || '').localeCompare(a[field] || '');
      });
    }

    const page = sorted.slice(offset, offset + limit);
    const items = page.map(compactListResult);

    return ok(JSON.stringify({ total: filtered.length, results: items }));
  }

  function handleListPlatforms(): ToolResult {
    return ok(JSON.stringify(state.library.platformCounts));
  }

  function handleFindDuplicates(args: Record<string, unknown>): ToolResult {
    let query = asString(args.query);
    if (typeof query === 'object') return query;
    if (query) query = query.trim() || undefined;
    const limit = parseLimit(args.limit, 25);
    if (typeof limit !== 'number') return limit;
    const offset = parseOffset(args.offset);
    if (typeof offset !== 'number') return offset;

    if (!query) {
      const page = state.library.duplicateGroups.slice(offset, offset + limit);
      return ok(JSON.stringify({ total: state.library.duplicateGroups.length, results: page }));
    }

    const matchRank = new Map<string, number>();
    const fuseResults = state.library.fuse.search(query).filter((r) => fuseConfidence(r.score ?? 0) >= 0.5);
    for (let i = 0; i < fuseResults.length; i++) {
      const r = fuseResults[i];
      if (!r) continue;
      const key = r.item.Title.toLowerCase();
      if (!matchRank.has(key)) matchRank.set(key, i);
    }

    const allMatches = state.library.duplicateGroups
      .filter((g) => matchRank.has(g.title.toLowerCase()))
      .sort((a, b) => (matchRank.get(a.title.toLowerCase()) ?? 0) - (matchRank.get(b.title.toLowerCase()) ?? 0));
    const page = allMatches.slice(offset, offset + limit);

    return ok(JSON.stringify({ total: allMatches.length, results: page }));
  }

  function handleGetStats(): ToolResult {
    const platforms = state.library.platformCounts;
    return ok(
      JSON.stringify({
        totalGames: state.library.games.length,
        totalPlatforms: platforms.length,
        topPlatforms: platforms.slice(0, 10),
        statusCounts: state.library.statusCounts,
      }),
    );
  }

  function handleRandomGame(args: Record<string, unknown>): ToolResult {
    const filtered = applyFilters(args);
    if ('ok' in filtered) return filtered;

    if (filtered.length === 0) return ok(JSON.stringify({ game: null, matchPool: 0 }));

    const pick = filtered[Math.floor(Math.random() * filtered.length)] as Game;
    const game = compactListResult(pick);
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
