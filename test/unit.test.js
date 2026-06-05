import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fuse from 'fuse.js';

import { createHandlers } from '../dist/handlers.js';
import { FUSE_OPTIONS, FUSE_TITLE_ONLY_OPTIONS } from '../dist/loader.js';
import { buildToolDefinitions } from '../dist/tools.js';
import {
  normaliseTitle, parseLimit, asString, compactResult, fail, fuseConfidence, ok,
  passesTokenBoundaryGuard, tokenMatchConfidence,
  requireString, sortedPlatformCounts,
} from '../dist/utils.js';


/** @returns {import('../dist/types.js').Game[]} */
function mockGames() {
  return [
    {
      ID: 'aaa-111',
      Title: 'Half-Life 2',
      Platform: 'Windows',
      Developer: 'Valve',
      Publisher: 'Valve',
      Genre: 'FPS',
      ReleaseDate: '2004-11-16',
      Notes: 'Classic FPS',
      Source: '',
      Series: 'Half-Life',
      PlayMode: '',
      Rating: '',
      MaxPlayers: '',
      CommunityStarRating: 4.5,
      StarRating: 5,
      Status: '',
      Favorite: true,
      DatabaseID: '203774',
      Hide: false,
      Broken: false,
      PlayCount: 10,
      PlayTime: 3600,
      LastPlayedDate: '2024-01-01',
      DateAdded: '2023-01-01',
      Installed: true,
      Completed: true,
      Progress: 'Active / In Progress',
    },
    {
      ID: 'bbb-222',
      Title: 'Half-Life 2',
      Platform: 'Linux',
      Developer: 'Valve',
      Publisher: 'Valve',
      Genre: 'FPS',
      ReleaseDate: '2004-11-16',
      Notes: '',
      Source: '',
      Series: 'Half-Life',
      PlayMode: '',
      Rating: '',
      MaxPlayers: '',
      CommunityStarRating: 4.5,
      StarRating: 0,
      Status: '',
      Favorite: false,
      DatabaseID: 'db-2',
      Hide: false,
      Broken: false,
      PlayCount: 0,
      PlayTime: 0,
      LastPlayedDate: '',
      DateAdded: '2023-06-01',
      Installed: false,
      Completed: false,
      Progress: '',
    },
    {
      ID: 'ccc-333',
      Title: 'Portal',
      Platform: 'Windows',
      Developer: 'Valve',
      Publisher: 'Valve',
      Genre: 'Puzzle',
      ReleaseDate: '2007-10-10',
      Notes: '',
      Source: '',
      Series: '',
      PlayMode: '',
      Rating: '',
      MaxPlayers: '',
      CommunityStarRating: 4.8,
      StarRating: 4,
      Status: '',
      Favorite: true,
      DatabaseID: 'db-3',
      Hide: false,
      Broken: false,
      PlayCount: 5,
      PlayTime: 1800,
      LastPlayedDate: '2024-02-01',
      DateAdded: '2023-02-01',
      Installed: true,
      Completed: false,
      Progress: 'Active / In Progress',
    },
    {
      ID: 'ddd-444',
      Title: 'Behind the Frame',
      Platform: 'Windows',
      Developer: 'Silver Lining Studio',
      Publisher: 'Akupara Games',
      Genre: 'Adventure',
      ReleaseDate: '2021-08-25',
      Notes: '',
      Source: '',
      Series: '',
      PlayMode: '',
      Rating: '',
      MaxPlayers: '',
      CommunityStarRating: 4.2,
      StarRating: 0,
      Status: '',
      Favorite: false,
      DatabaseID: 'db-4',
      Hide: false,
      Broken: false,
      PlayCount: 0,
      PlayTime: 0,
      LastPlayedDate: '',
      DateAdded: '2024-01-01',
      Installed: false,
      Completed: false,
      Progress: '',
    },
    {
      ID: 'eee-555',
      Title: 'DOOM',
      Platform: 'Windows',
      Developer: 'id Software',
      Publisher: 'Bethesda Softworks',
      Genre: 'FPS',
      ReleaseDate: '2016-05-13',
      Notes: '',
      Source: '',
      Series: 'DOOM',
      PlayMode: '',
      Rating: '',
      MaxPlayers: '',
      CommunityStarRating: 4.7,
      StarRating: 5,
      Status: '',
      Favorite: true,
      DatabaseID: 'db-5',
      Hide: false,
      Broken: false,
      PlayCount: 3,
      PlayTime: 7200,
      LastPlayedDate: '2024-03-01',
      DateAdded: '2023-03-01',
      Installed: true,
      Completed: false,
      Progress: '',
    },
    {
      ID: 'fff-666',
      Title: 'Doomblade',
      Platform: 'Windows',
      Developer: 'Muro Studios',
      Publisher: 'Muro Studios',
      Genre: 'Action',
      ReleaseDate: '2023-04-01',
      Notes: '',
      Source: '',
      Series: '',
      PlayMode: '',
      Rating: '',
      MaxPlayers: '',
      CommunityStarRating: 3.5,
      StarRating: 0,
      Status: '',
      Favorite: false,
      DatabaseID: 'db-6',
      Hide: false,
      Broken: false,
      PlayCount: 0,
      PlayTime: 0,
      LastPlayedDate: '',
      DateAdded: '2024-02-01',
      Installed: false,
      Completed: false,
      Progress: '',
    },
    {
      ID: 'ggg-777',
      Title: 'DOOM Eternal',
      Platform: 'Windows',
      Developer: 'id Software',
      Publisher: 'Bethesda Softworks',
      Genre: 'FPS',
      ReleaseDate: '2020-03-20',
      Notes: '',
      Source: '',
      Series: 'DOOM',
      PlayMode: '',
      Rating: '',
      MaxPlayers: '',
      CommunityStarRating: 4.6,
      StarRating: 4,
      Status: '',
      Favorite: false,
      DatabaseID: 'db-7',
      Hide: false,
      Broken: false,
      PlayCount: 1,
      PlayTime: 3600,
      LastPlayedDate: '2024-01-15',
      DateAdded: '2023-04-01',
      Installed: true,
      Completed: false,
      Progress: '',
    },
  ];
}

/** @returns {import('../dist/loader.js').Library} */
function mockLibrary() {
  const games = mockGames();
  const gamesById = new Map(games.map((g) => [g.ID, g]));
  const gamesByTitle = new Map();
  const gamesByNormalisedTitle = new Map();
  for (const g of games) {
    const key = g.Title.toLowerCase();
    let list = gamesByTitle.get(key);
    if (!list) {
      list = [];
      gamesByTitle.set(key, list);
    }
    list.push(g);

    const nKey = normaliseTitle(g.Title);
    let nList = gamesByNormalisedTitle.get(nKey);
    if (!nList) {
      nList = [];
      gamesByNormalisedTitle.set(nKey, nList);
    }
    nList.push(g);
  }
  const fuse = new Fuse(games, FUSE_OPTIONS);
  const fuseTitleOnly = new Fuse(games, FUSE_TITLE_ONLY_OPTIONS);

  const byPlatform = new Map();
  for (const g of games) {
    const key = g.Platform.toLowerCase();
    let list = byPlatform.get(key);
    if (!list) { list = []; byPlatform.set(key, list); }
    list.push(g);
  }
  const platformFuse = new Map();
  const platformFuseTitleOnly = new Map();
  for (const [key, pGames] of byPlatform) {
    platformFuse.set(key, new Fuse(pGames, FUSE_OPTIONS));
    platformFuseTitleOnly.set(key, new Fuse(pGames, FUSE_TITLE_ONLY_OPTIONS));
  }

  const platformCounts = sortedPlatformCounts(games);
  const dupMap = new Map();
  for (const g of games) {
    const key = g.Title.toLowerCase();
    let group = dupMap.get(key);
    if (!group) { group = { title: g.Title, platforms: new Set(), entries: 0 }; dupMap.set(key, group); }
    group.platforms.add(g.Platform);
    group.entries++;
  }
  const duplicateGroups = [...dupMap.values()]
    .filter((g) => g.entries >= 2)
    .map((g) => ({ title: g.title, platforms: [...g.platforms].sort(), entries: g.entries }))
    .sort((a, b) => b.entries - a.entries);
  const statusMap = new Map();
  for (const g of games) {
    if (g.Progress) statusMap.set(g.Progress, (statusMap.get(g.Progress) ?? 0) + 1);
  }
  const distinctStatuses = [...statusMap.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  return {
    gamesById, gamesByTitle, gamesByNormalisedTitle, games, versionsByGameId: new Map(),
    fuse, fuseTitleOnly, platformFuse, platformFuseTitleOnly, platformCounts, duplicateGroups, distinctStatuses,
  };
}

function setup() {
  const state = { library: mockLibrary() };
  let reloadCalled = false;
  const reload = async () => {
    reloadCalled = true;
    state.library = mockLibrary();
  };
  const handlers = createHandlers(state, reload);
  return { handlers, state, wasReloaded: () => reloadCalled };
}

describe('search_games', () => {
  const { handlers } = setup();

  it('finds matching games', async () => {
    const result = await handlers.search_games({ query: 'Half-Life' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.results.length, 2);
      assert.equal(parsed.results[0].title, 'Half-Life 2');
    }
  });

  it('respects platform filter', async () => {
    const result = await handlers.search_games({ query: 'Half-Life', platform: 'Linux' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.results.length, 1);
      assert.equal(parsed.results[0].platform, 'Linux');
    }
  });

  it('respects limit parameter', async () => {
    const result = await handlers.search_games({ query: 'Half-Life', limit: 1 });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.results.length, 1);
    }
  });

  it('platform filter is case insensitive', async () => {
    const result = await handlers.search_games({ query: 'Half-Life', platform: 'linux' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.results.length, 1);
      assert.equal(parsed.results[0].platform, 'Linux');
    }
  });

  it('rejects missing query', async () => {
    const result = await handlers.search_games({});
    assert.equal(result.ok, false);
  });

  it('rejects non-string platform', async () => {
    const result = await handlers.search_games({ query: 'test', platform: 123 });
    assert.equal(result.ok, false);
  });

  it('returns empty results for no matches', async () => {
    const result = await handlers.search_games({ query: 'zzz_nonexistent_zzz' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.results.length, 0);
    }
  });

  it('rejects invalid limit at handler level', async () => {
    const result = await handlers.search_games({ query: 'test', limit: 0 });
    assert.equal(result.ok, false);
  });

  it('trims whitespace from query', async () => {
    const result = await handlers.search_games({ query: '  Half-Life  ' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.ok(parsed.results.length > 0);
      assert.equal(parsed.results[0].title, 'Half-Life 2');
    }
  });

  it('rejects whitespace-only query after trimming', async () => {
    const result = await handlers.search_games({ query: '   ' });
    assert.equal(result.ok, false);
  });

  it('exact:true returns exact title match with confidence 1.0', async () => {
    const result = await handlers.search_games({ query: 'Half-Life 2', exact: true });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.results.length, 2);
      assert.equal(parsed.results[0].confidence, 1.0);
      assert.equal(parsed.results[0].title, 'Half-Life 2');
    }
  });

  it('exact:true returns empty results for non-matching title (no fuzzy fallback)', async () => {
    const result = await handlers.search_games({ query: 'Half-Life', exact: true });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.results.length, 0);
    }
  });

  it('exact:true returns all platforms with same title', async () => {
    const result = await handlers.search_games({ query: 'Half-Life 2', exact: true });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      const platforms = parsed.results.map((r) => r.platform).sort();
      assert.deepEqual(platforms, ['Linux', 'Windows']);
    }
  });

  it('exact:true is case insensitive', async () => {
    const result = await handlers.search_games({ query: 'half-life 2', exact: true });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.results.length, 2);
      assert.equal(parsed.results[0].title, 'Half-Life 2');
    }
  });

  it('exact:true with platform filter', async () => {
    const result = await handlers.search_games({ query: 'Half-Life 2', exact: true, platform: 'Linux' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.results.length, 1);
      assert.equal(parsed.results[0].platform, 'Linux');
    }
  });

  it('exact title match gets confidence 1.0 and exactMatch: true', async () => {
    const result = await handlers.search_games({ query: 'DOOM' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      const doom = parsed.results.find((r) => r.title === 'DOOM');
      assert.ok(doom, 'expected DOOM in results');
      assert.equal(doom.confidence, 1);
      assert.equal(doom.exactMatch, true);
    }
  });

  it('substring-only match gets penalised confidence and no exactMatch', async () => {
    const result = await handlers.search_games({ query: 'Doom' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      const doomblade = parsed.results.find((r) => r.title === 'Doomblade');
      assert.ok(doomblade, 'expected Doomblade in results');
      assert.ok(doomblade.confidence < 1.0, `expected penalised confidence, got ${doomblade.confidence}`);
      assert.equal(doomblade.exactMatch, undefined);
    }
  });

  it('whole-token match in longer title keeps score and no exactMatch', async () => {
    const result = await handlers.search_games({ query: 'Doom' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      const eternal = parsed.results.find((r) => r.title === 'DOOM Eternal');
      assert.ok(eternal, 'expected DOOM Eternal in results');
      // "doom" is a whole token in "doom eternal", so no penalty
      assert.ok(eternal.confidence >= 0.85, `expected high confidence, got ${eternal.confidence}`);
      assert.equal(eternal.exactMatch, undefined);
    }
  });
});

describe('get_game_details', () => {
  const { handlers } = setup();

  it('returns camelCase game data', async () => {
    const result = await handlers.get_game_details({ id: 'aaa-111' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.title, 'Half-Life 2');
      assert.equal(parsed.platform, 'Windows');
      assert.equal(parsed.developer, 'Valve');
      assert.deepEqual(parsed.genres, ['FPS']);
      assert.deepEqual(parsed.playTime, { seconds: 3600, hours: 1 });
      assert.equal(parsed.communityStarRating, 4.5);
      assert.equal(parsed.starRating, 5);
      assert.equal(parsed.databaseId, 203774);
      assert.equal(parsed.maxPlayers, null);
      assert.equal(parsed.notes, undefined);
      // Empty strings become null
      assert.equal(parsed.source, null);
      assert.equal(parsed.series, 'Half-Life');
    }
  });

  it('includes notes when requested', async () => {
    const result = await handlers.get_game_details({ id: 'aaa-111', include_notes: true });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.notes, 'Classic FPS');
    }
  });

  it('excludes notes for non-boolean include_notes', async () => {
    const result = await handlers.get_game_details({ id: 'aaa-111', include_notes: 'true' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.notes, undefined);
    }
  });

  it('returns error for missing ID', async () => {
    const result = await handlers.get_game_details({ id: 'nonexistent' });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /not found/i);
  });

  it('rejects missing id param', async () => {
    const result = await handlers.get_game_details({});
    assert.equal(result.ok, false);
  });
});

describe('list_games', () => {
  const { handlers } = setup();

  it('returns all games sorted by title by default', async () => {
    const result = await handlers.list_games({});
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.total, 7);
      assert.equal(parsed.results[0].title, 'Behind the Frame');
      assert.ok(!('confidence' in parsed.results[0]));
    }
  });

  it('filters by platform', async () => {
    const result = await handlers.list_games({ platform: 'Linux' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.total, 1);
      assert.equal(parsed.results[0].platform, 'Linux');
    }
  });

  it('filters by installed', async () => {
    const result = await handlers.list_games({ installed: true });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.ok(parsed.results.every((r) => r.installed === true));
    }
  });

  it('filters by favorite', async () => {
    const result = await handlers.list_games({ favorite: true });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.ok(parsed.total > 0);
      assert.ok(parsed.results.length > 0);
    }
  });

  it('sorts by playTime descending', async () => {
    const result = await handlers.list_games({ sort: 'playTime' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.results[0].title, 'DOOM');
    }
  });

  it('respects limit and offset', async () => {
    const result = await handlers.list_games({ limit: 1, offset: 1 });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.total, 7);
      assert.equal(parsed.results.length, 1);
      assert.equal(parsed.results[0].title, 'DOOM');
    }
  });

  it('rejects invalid sort', async () => {
    const result = await handlers.list_games({ sort: 'bogus' });
    assert.equal(result.ok, false);
  });

  it('rejects invalid offset', async () => {
    const result = await handlers.list_games({ offset: -1 });
    assert.equal(result.ok, false);
  });

  it('filters by single status string', async () => {
    const result = await handlers.list_games({ status: 'Active / In Progress' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.total, 2);
      assert.ok(parsed.results.every((r) => ['Half-Life 2', 'Portal'].includes(r.title)));
    }
  });

  it('filters by status array (OR logic)', async () => {
    const result = await handlers.list_games({ status: ['Active / In Progress', 'Completed'] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.total, 2);
    }
  });

  it('returns empty results for non-matching status', async () => {
    const result = await handlers.list_games({ status: 'Completed' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.total, 0);
    }
  });

  it('rejects non-string non-array status', async () => {
    const result = await handlers.list_games({ status: 123 });
    assert.equal(result.ok, false);
  });

  it('combines status with other filters', async () => {
    const result = await handlers.list_games({ status: 'Active / In Progress', platform: 'Windows' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.total, 2);
    }
  });
});

describe('random_game', () => {
  const { handlers } = setup();

  it('returns a game from the library', async () => {
    const result = await handlers.random_game({});
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.ok(parsed.game);
      assert.ok(parsed.game.id);
      assert.ok(parsed.game.title);
      assert.ok(parsed.game.platform);
      assert.ok('dateAdded' in parsed.game);
      assert.ok('lastPlayedDate' in parsed.game);
      assert.equal(parsed.matchPool, 7);
    }
  });

  it('filters by platform', async () => {
    const result = await handlers.random_game({ platform: 'Linux' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.game.platform, 'Linux');
      assert.equal(parsed.matchPool, 1);
    }
  });

  it('filters by status', async () => {
    const result = await handlers.random_game({ status: 'Active / In Progress' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.ok(['Half-Life 2', 'Portal'].includes(parsed.game.title));
      assert.equal(parsed.matchPool, 2);
    }
  });

  it('returns null game when no matches', async () => {
    const result = await handlers.random_game({ platform: 'Virtual Boy' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.game, null);
      assert.equal(parsed.matchPool, 0);
    }
  });

  it('rejects invalid status', async () => {
    const result = await handlers.random_game({ status: 123 });
    assert.equal(result.ok, false);
  });
});

describe('list_platforms', () => {
  const { handlers } = setup();

  it('returns platform counts sorted by count', async () => {
    const result = await handlers.list_platforms({});
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed[0].platform, 'Windows');
      assert.equal(parsed[0].count, 6);
      assert.equal(parsed[1].platform, 'Linux');
      assert.equal(parsed[1].count, 1);
    }
  });
});

describe('get_stats', () => {
  const { handlers } = setup();

  it('returns correct totals', async () => {
    const result = await handlers.get_stats({});
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.totalGames, 7);
      assert.equal(parsed.totalPlatforms, 2);
      assert.equal(parsed.topPlatforms.length, 2);
      assert.ok(Array.isArray(parsed.statusCounts));
      assert.ok(parsed.statusCounts.length > 0);
      assert.ok(parsed.statusCounts[0].status);
      assert.ok(parsed.statusCounts[0].count > 0);
      assert.ok(parsed.statusCounts[0].count >= parsed.statusCounts[parsed.statusCounts.length - 1].count);
    }
  });
});

describe('check_library', () => {
  const { handlers } = setup();

  it('finds exact match via fast path', async () => {
    const result = await handlers.check_library({ games: ['Half-Life 2'] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.results[0].matches.length, 2);
      assert.equal(parsed.results[0].matches[0].confidence, 1.0);
      assert.equal(parsed.summary.total, 1);
      assert.equal(parsed.summary.owned, 1);
      assert.equal(parsed.summary.new, 0);
    }
  });

  it('returns no matches for unknown game', async () => {
    const result = await handlers.check_library({ games: ['Nonexistent Game XYZ'] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.results[0].matches.length, 0);
      assert.deepEqual(parsed.results[0].nearMisses, []);
      assert.equal(parsed.summary.new, 1);
    }
  });

  it('returns nearMisses for close but below-threshold results', async () => {
    // "Portaler" fuzzy-matches "Portal" with confidence ~0.75 (below 0.85
    // threshold but above 0.40 near-miss floor).
    const result = await handlers.check_library({ games: ['Portaler'] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      const entry = parsed.results[0];
      assert.equal(entry.matches.length, 0);
      assert.ok(entry.nearMisses.length > 0, 'expected at least one near miss');
      assert.ok(entry.nearMisses[0].confidence < 0.85);
      assert.ok(entry.nearMisses[0].confidence >= 0.4);
      assert.ok(entry.nearMisses[0].title);
      assert.ok(entry.nearMisses[0].platform);
    }
  });


  it('finds fuzzy match via slow path', async () => {
    const result = await handlers.check_library({ games: ['Half-Life'] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.results[0].matches.length, 2);
      assert.ok(parsed.results[0].matches[0].confidence < 1.0);
      assert.ok(parsed.results[0].matches[0].confidence >= 0.85);
    }
  });

  it('filters by platform', async () => {
    const result = await handlers.check_library({ games: ['Half-Life 2'], platform: 'Linux' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.results[0].matches.length, 1);
      assert.equal(parsed.results[0].matches[0].platform, 'Linux');
    }
  });

  it('returns mixed summary for owned and new games', async () => {
    const result = await handlers.check_library({ games: ['Half-Life 2', 'Nonexistent Game XYZ'] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.summary.total, 2);
      assert.equal(parsed.summary.owned, 1);
      assert.equal(parsed.summary.new, 1);
    }
  });

  it('rejects missing games param', async () => {
    const result = await handlers.check_library({});
    assert.equal(result.ok, false);
  });

  it('truncates when titles exceed internal cap and reports overflow', async () => {
    const games = Array.from({ length: 103 }, (_, i) => `Game ${i}`);
    const result = await handlers.check_library({ games });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.summary.total, 100);
      assert.equal(parsed.summary.skipped.overflow, 3);
      assert.equal(parsed.results.length, 100);
    }
  });

  it('rejects empty games array', async () => {
    const result = await handlers.check_library({ games: [] });
    assert.equal(result.ok, false);
  });

  it('skips empty-string titles and reports in skipped.empty', async () => {
    const result = await handlers.check_library({ games: ['Half-Life 2', '', '  '] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.summary.total, 1);
      assert.equal(parsed.summary.owned, 1);
      assert.equal(parsed.summary.skipped.empty, 2);
    }
  });

  it('rejects all-empty games array', async () => {
    const result = await handlers.check_library({ games: ['', '  '] });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /non-empty/i);
  });

  it('exact:true returns match with confidence 1.0', async () => {
    const result = await handlers.check_library({ games: ['Half-Life 2'], exact: true });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.results[0].matches.length, 2);
      assert.equal(parsed.results[0].matches[0].confidence, 1.0);
      assert.equal(parsed.summary.owned, 1);
    }
  });

  it('exact:true returns empty matches and empty nearMisses on miss (no fuzzy fallback)', async () => {
    const result = await handlers.check_library({ games: ['Half-Life'], exact: true });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      const entry = parsed.results[0];
      assert.equal(entry.matches.length, 0);
      assert.deepEqual(entry.nearMisses, []);
      assert.equal(parsed.summary.new, 1);
    }
  });

  it('exact:true does not run prefix fallback', async () => {
    const result = await handlers.check_library({
      games: ['Behind the Frame: The Finest Scenery'],
      exact: true,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      const entry = parsed.results[0];
      assert.equal(entry.matches.length, 0);
      assert.deepEqual(entry.nearMisses, [], 'exact mode should not run prefix fallback');
    }
  });

  it('rejects mixed-type games array', async () => {
    const result = await handlers.check_library({ games: ['valid', 123] });
    assert.equal(result.ok, false);
  });

  it('rejects non-string platform', async () => {
    const result = await handlers.check_library({ games: ['test'], platform: 42 });
    assert.equal(result.ok, false);
  });

  it('surfaces prefix match as nearMiss when subtitled query misses', async () => {
    const result = await handlers.check_library({ games: ['Behind the Frame: The Finest Scenery'] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      const entry = parsed.results[0];
      assert.equal(entry.matches.length, 0);
      assert.ok(entry.nearMisses.length > 0, 'expected prefix fallback nearMiss');
      assert.equal(entry.nearMisses[0].title, 'Behind the Frame');
      assert.equal(entry.nearMisses[0].shorterTitle, true);
      assert.equal(entry.nearMisses[0].confidence, undefined);
      assert.equal(parsed.summary.owned, 0);
      assert.equal(parsed.summary.new, 1);
    }
  });

  it('does not run prefix fallback when fuzzy nearMisses exist', async () => {
    // "Portaler" fuzzy-matches "Portal" as a near miss (confidence ~0.75),
    // so the prefix fallback should not run.
    const result = await handlers.check_library({ games: ['Portaler'] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      const entry = parsed.results[0];
      assert.ok(entry.nearMisses.length > 0);
      const fuzzy = entry.nearMisses.filter((n) => 'confidence' in n);
      assert.ok(fuzzy.length > 0, 'should have fuzzy nearMisses');
      assert.ok(fuzzy.every((n) => n.confidence >= 0.4), 'fuzzy nearMisses should have confidence >= 0.4');
    }
  });

  it('deduplicates titles and reports in skipped.duplicate', async () => {
    const result = await handlers.check_library({ games: ['Half-Life 2', 'Portal', 'Half-Life 2'] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.summary.total, 2);
      assert.equal(parsed.summary.skipped.duplicate, 1);
      assert.equal(parsed.results.length, 2);
    }
  });

  it('reports mixed skips (empties + duplicates)', async () => {
    const result = await handlers.check_library({ games: ['Half-Life 2', '', 'Portal', 'half-life 2', '  '] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.summary.total, 2);
      assert.equal(parsed.summary.skipped.empty, 2);
      assert.equal(parsed.summary.skipped.duplicate, 1);
    }
  });

  it('omits skipped from summary when no titles were skipped', async () => {
    const result = await handlers.check_library({ games: ['Half-Life 2', 'Portal'] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.summary.skipped, undefined);
    }
  });

  it('processes one title when all are duplicates of it', async () => {
    const result = await handlers.check_library({ games: ['Portal', 'PORTAL', 'portal'] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.summary.total, 1);
      assert.equal(parsed.summary.skipped.duplicate, 2);
      assert.equal(parsed.results.length, 1);
      assert.equal(parsed.results[0].query, 'Portal');
    }
  });

  it('trims whitespace from titles before matching', async () => {
    const result = await handlers.check_library({ games: ['  Half-Life 2  '] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.results[0].query, 'Half-Life 2');
      assert.equal(parsed.results[0].matches.length, 2);
    }
  });

  it('dedup is case-insensitive', async () => {
    const result = await handlers.check_library({ games: ['Doom', 'doom', 'DOOM'] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.summary.total, 1);
      assert.equal(parsed.summary.skipped.duplicate, 2);
      assert.equal(parsed.results[0].query, 'Doom');
    }
  });

  it('dedup is NOT normalisation-based (Pac-Man and Pac Man both processed)', async () => {
    const result = await handlers.check_library({ games: ['Pac-Man', 'Pac Man'] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.summary.total, 2);
      assert.equal(parsed.summary.skipped, undefined);
      assert.equal(parsed.results.length, 2);
    }
  });

  it('respects platform filter on prefix fallback', async () => {
    const result = await handlers.check_library({
      games: ['Behind the Frame: The Finest Scenery'],
      platform: 'Linux',
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      const entry = parsed.results[0];
      assert.equal(entry.matches.length, 0);
      assert.deepEqual(entry.nearMisses, []);
    }
  });

  it('caps nearMisses at 5 across fuzzy and prefix types', async () => {
    // Build a library with enough games to produce >5 nearMisses
    const games = [];
    for (let i = 0; i < 6; i++) {
      games.push({
        ID: `near-${i}`, Title: `Zork ${i + 1}`, Platform: 'Windows',
        Developer: '', Publisher: '', Genre: '', ReleaseDate: '',
        Notes: '', Source: '', Series: '', PlayMode: '', Rating: '',
        MaxPlayers: '', CommunityStarRating: 0, StarRating: 0, Status: '',
        Favorite: false, DatabaseID: '', Hide: false, Broken: false,
        PlayCount: 0, PlayTime: 0, LastPlayedDate: '', DateAdded: '',
        Installed: false, Completed: false, Progress: '',
      });
    }
    // Add a prefix-matchable title
    games.push({
      ID: 'prefix-1', Title: 'Zork', Platform: 'Windows',
      Developer: '', Publisher: '', Genre: '', ReleaseDate: '',
      Notes: '', Source: '', Series: '', PlayMode: '', Rating: '',
      MaxPlayers: '', CommunityStarRating: 0, StarRating: 0, Status: '',
      Favorite: false, DatabaseID: '', Hide: false, Broken: false,
      PlayCount: 0, PlayTime: 0, LastPlayedDate: '', DateAdded: '',
      Installed: false, Completed: false, Progress: '',
    });

    const gamesById = new Map(games.map((g) => [g.ID, g]));
    const gamesByTitle = new Map();
    const gamesByNormalisedTitle = new Map();
    for (const g of games) {
      const key = g.Title.toLowerCase();
      let list = gamesByTitle.get(key);
      if (!list) { list = []; gamesByTitle.set(key, list); }
      list.push(g);
      const nKey = normaliseTitle(g.Title);
      let nList = gamesByNormalisedTitle.get(nKey);
      if (!nList) { nList = []; gamesByNormalisedTitle.set(nKey, nList); }
      nList.push(g);
    }
    const fuse = new Fuse(games, FUSE_OPTIONS);
    const fuseTitleOnly = new Fuse(games, FUSE_TITLE_ONLY_OPTIONS);
    const lib = {
      gamesById, gamesByTitle, gamesByNormalisedTitle, games, versionsByGameId: new Map(),
      fuse, fuseTitleOnly, platformFuse: new Map(), platformFuseTitleOnly: new Map(),
      platformCounts: sortedPlatformCounts(games), duplicateGroups: [], distinctStatuses: [],
    };
    const state = { library: lib };
    const handlers = createHandlers(state, async () => {});

    // Query "Zork: Subtitle" — fuzzy should find Zork 1-6 as nearMisses,
    // prefix should find "Zork" — but total must be capped at 5
    const result = await handlers.check_library({ games: ['Zork: The Subtitle'] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      const entry = parsed.results[0];
      assert.ok(entry.nearMisses.length <= 5, `nearMisses should be capped at 5, got ${entry.nearMisses.length}`);
    }
  });
});

describe('find_duplicates', () => {
  const { handlers } = setup();

  it('finds games on multiple platforms', async () => {
    const result = await handlers.find_duplicates({});
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.length, 1);
      assert.equal(parsed[0].title, 'Half-Life 2');
      assert.deepEqual(parsed[0].platforms, ['Linux', 'Windows']);
      assert.equal(parsed[0].entries, 2);
    }
  });

  it('filters by query', async () => {
    const result = await handlers.find_duplicates({ query: 'Portal' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.length, 0);
    }
  });

  it('rejects non-string query', async () => {
    const result = await handlers.find_duplicates({ query: 999 });
    assert.equal(result.ok, false);
  });

  it('trims whitespace from query', async () => {
    const result = await handlers.find_duplicates({ query: '  Half-Life  ' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.length, 1);
      assert.equal(parsed[0].title, 'Half-Life 2');
    }
  });

  it('treats whitespace-only query as no query (returns all duplicates)', async () => {
    const result = await handlers.find_duplicates({ query: '   ' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.length, 1);
    }
  });
});

describe('reload_library', () => {
  it('calls reload and returns counts', async () => {
    const { handlers, wasReloaded } = setup();
    const result = await handlers.reload_library({});
    assert.equal(result.ok, true);
    assert.ok(wasReloaded());
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.reloaded, true);
      assert.equal(parsed.games, 7);
      assert.equal(parsed.platforms, 2);
    }
  });

  it('includes diff when lastReloadDiff is set', async () => {
    const { handlers, state } = setup();
    state.lastReloadDiff = {
      added: [{ id: 'new-1', title: 'New Game', platform: 'Windows' }],
      removed: [{ id: 'old-1', title: 'Old Game', platform: 'Linux' }],
    };
    const result = await handlers.reload_library({});
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.added.length, 1);
      assert.equal(parsed.added[0].title, 'New Game');
      assert.equal(parsed.removed.length, 1);
      assert.equal(parsed.removed[0].title, 'Old Game');
    }
  });

  it('omits diff on first load (no prior reload)', async () => {
    const { handlers } = setup();
    const result = await handlers.reload_library({});
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.added, undefined);
      assert.equal(parsed.removed, undefined);
    }
  });
});

describe('utils', () => {
  describe('ok / fail', () => {
    it('ok returns success result', () => {
      const result = ok('hello');
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.text, 'hello');
    });

    it('fail returns error result', () => {
      const result = fail('bad');
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.message, 'bad');
    });
  });

  describe('parseLimit', () => {
    it('returns fallback for undefined', () => {
      assert.equal(parseLimit(undefined, 25), 25);
    });

    it('returns fallback for null', () => {
      assert.equal(parseLimit(null, 25), 25);
    });

    it('returns valid integer', () => {
      assert.equal(parseLimit(10, 25), 10);
    });

    it('returns fail result for non-integer', () => {
      const result = parseLimit('fifty', 25);
      assert.equal(result.ok, false);
    });

    it('returns fail result for zero', () => {
      const result = parseLimit(0, 25);
      assert.equal(result.ok, false);
    });

    it('returns fail result for negative', () => {
      const result = parseLimit(-5, 25);
      assert.equal(result.ok, false);
    });

    it('returns fail result for float', () => {
      const result = parseLimit(2.5, 25);
      assert.equal(result.ok, false);
    });

    it('accepts numeric strings (coerces to number)', () => {
      assert.equal(parseLimit('10', 25), 10);
    });
  });

  describe('asString', () => {
    it('returns undefined for undefined', () => {
      assert.equal(asString(undefined), undefined);
    });

    it('returns undefined for null', () => {
      assert.equal(asString(null), undefined);
    });

    it('returns string value', () => {
      assert.equal(asString('hello'), 'hello');
    });

    it('returns fail result for non-string', () => {
      const result = asString(123);
      assert.equal(result.ok, false);
    });
  });

  describe('requireString', () => {
    it('returns string for valid input', () => {
      assert.equal(requireString('x', 'hello'), 'hello');
    });

    it('returns fail for undefined', () => {
      const result = requireString('x', undefined);
      assert.equal(result.ok, false);
    });

    it('returns fail for empty string', () => {
      const result = requireString('x', '');
      assert.equal(result.ok, false);
    });

    it('returns fail for non-string', () => {
      const result = requireString('x', 123);
      assert.equal(result.ok, false);
    });
  });

  describe('normaliseTitle', () => {
    it('lowercases', () => {
      assert.equal(normaliseTitle('Half-Life'), 'half life');
    });

    it('replaces dashes and colons with spaces', () => {
      assert.equal(normaliseTitle('Wrath - Enhanced: Edition'), 'wrath enhanced edition');
    });

    it('replaces en-dash and em-dash with spaces', () => {
      assert.equal(normaliseTitle('A–B—C'), 'a b c');
    });

    it('replaces & with and', () => {
      assert.equal(normaliseTitle('Lock & Key'), 'lock and key');
    });

    it('converts smart quotes to straight quotes', () => {
      assert.equal(normaliseTitle('‘hello’ “world”'), "'hello' \"world\"");
    });

    it('collapses whitespace', () => {
      assert.equal(normaliseTitle('  a   b  '), 'a b');
    });

    it('handles the pathfinder case', () => {
      const a = normaliseTitle('Pathfinder: Wrath of the Righteous - Enhanced Edition');
      const b = normaliseTitle('Pathfinder: Wrath of the Righteous: Enhanced Edition');
      assert.equal(a, b);
    });
  });

  describe('fuseConfidence', () => {
    it('perfect score (0) returns 1', () => {
      assert.equal(fuseConfidence(0), 1);
    });

    it('worst score (1) returns 0', () => {
      assert.equal(fuseConfidence(1), 0);
    });

    it('mid score rounds to 2 decimal places', () => {
      const result = fuseConfidence(0.333);
      assert.equal(result, 0.67);
    });
  });

  describe('passesTokenBoundaryGuard', () => {
    // --- Single-token cases (regression for #2) ---
    it('rejects single-token query that is only a mid-token substring (#2)', () => {
      assert.equal(passesTokenBoundaryGuard('gord', 'flash gordon'), false);
    });

    it('accepts single-token query that matches a complete title token', () => {
      assert.equal(passesTokenBoundaryGuard('halo', 'halo 2'), true);
    });

    it('accepts a small typo within the per-length tolerance', () => {
      // 6-char query vs a 6-char title token, single-char substitution.
      // tolerance = floor(6/4) = 1, so this passes.
      assert.equal(passesTokenBoundaryGuard('starss', 'starsx'), true);
    });

    it('rejects a single-token query when no title token is close enough', () => {
      assert.equal(passesTokenBoundaryGuard('zzzzz', 'half life 2'), false);
    });

    it('handles short queries strictly (3-char query: exact only)', () => {
      assert.equal(passesTokenBoundaryGuard('rim', 'rimworld'), false);
      assert.equal(passesTokenBoundaryGuard('rim', 'rim runner'), true);
    });

    it('treats title hyphens as token separators (normalisation contract)', () => {
      assert.equal(passesTokenBoundaryGuard('half', 'half life 2'), true);
    });

    // --- Multi-token: token absorption false positives ---
    it('rejects "halo 2" vs "halo 2600" (token absorption)', () => {
      assert.equal(passesTokenBoundaryGuard('halo 2', 'halo 2600'), false);
    });

    it('rejects "grand theft auto v" vs "grand theft auto vice city" (token absorption)', () => {
      assert.equal(passesTokenBoundaryGuard('grand theft auto v', 'grand theft auto vice city'), false);
    });

    it('rejects "street fighter 2" vs "street fighter 2010 the final fight" (token absorption)', () => {
      assert.equal(passesTokenBoundaryGuard('street fighter 2', 'street fighter 2010 the final fight'), false);
    });

    // --- Multi-token: legitimate matches that must still pass ---
    it('accepts "fallout 3" vs "fallout 3" (exact match)', () => {
      assert.equal(passesTokenBoundaryGuard('fallout 3', 'fallout 3'), true);
    });

    it('accepts "the witcher 3" vs "the witcher 3 wild hunt" (all query tokens match)', () => {
      assert.equal(passesTokenBoundaryGuard('the witcher 3', 'the witcher 3 wild hunt'), true);
    });

    it('accepts "pac man" vs "pac man" (exact match)', () => {
      assert.equal(passesTokenBoundaryGuard('pac man', 'pac man'), true);
    });

    it('accepts "half life 2" vs "half life 2" (exact match)', () => {
      assert.equal(passesTokenBoundaryGuard('half life 2', 'half life 2'), true);
    });

    it('accepts multi-token query when all tokens have whole-token matches', () => {
      assert.equal(passesTokenBoundaryGuard('flash gordon', 'flash gordon'), true);
    });

    it('rejects multi-token query when a token has no whole-token match', () => {
      assert.equal(passesTokenBoundaryGuard('flash gord', 'flash gordon'), false);
    });
  });

  describe('tokenMatchConfidence', () => {
    it('returns 1.0 when query token matches a whole title token', () => {
      assert.equal(tokenMatchConfidence('doom', 'doom'), 1.0);
    });

    it('returns 1.0 when query token matches a whole token in a multi-word title', () => {
      assert.equal(tokenMatchConfidence('doom', 'doom eternal'), 1.0);
    });

    it('returns 1.0 for multi-token query where all tokens match whole title tokens', () => {
      assert.equal(tokenMatchConfidence('doom eternal', 'doom eternal'), 1.0);
    });

    it('penalises when query token only matches as substring of title token', () => {
      const result = tokenMatchConfidence('doom', 'doomblade');
      assert.equal(result, 0.75);
    });

    it('penalises each non-matching token independently', () => {
      // Both "doom" and "blade" are substrings of "doomblade" but neither is a whole token
      const result = tokenMatchConfidence('doom blade', 'doomblade');
      assert.equal(result, 0.75 * 0.75);
    });

    it('returns 1.0 for empty query', () => {
      assert.equal(tokenMatchConfidence('', 'doom'), 1.0);
    });

    it('allows typos within Levenshtein tolerance for whole-token match', () => {
      // "zelda" (5 chars) has tolerance floor(5/4) = 1
      assert.equal(tokenMatchConfidence('zelda', 'zelde'), 1.0);
    });

    it('short query tokens (< 5 chars) require exact whole-token match', () => {
      // "doom" (4 chars) has tolerance 0, so "doomx" doesn't match as whole token
      const result = tokenMatchConfidence('doom', 'doomx');
      assert.equal(result, 0.75);
    });
  });

  describe('compactResult', () => {
    it('maps game fields correctly', () => {
      const game = mockGames()[0];
      const result = compactResult(game, 0.95);
      assert.equal(result.id, 'aaa-111');
      assert.equal(result.title, 'Half-Life 2');
      assert.equal(result.platform, 'Windows');
      assert.equal(result.installed, true);
      assert.deepEqual(result.playTime, { seconds: 3600, hours: 1 });
      assert.equal(result.confidence, 0.95);
    });

    it('does not include extra fields', () => {
      const game = mockGames()[0];
      const result = compactResult(game, 1.0);
      assert.deepEqual(Object.keys(result).sort(), ['confidence', 'id', 'installed', 'platform', 'playTime', 'title']);
    });

    it('includes exactMatch when true', () => {
      const game = mockGames()[0];
      const result = compactResult(game, 1.0, true);
      assert.equal(result.exactMatch, true);
      assert.deepEqual(Object.keys(result).sort(), ['confidence', 'exactMatch', 'id', 'installed', 'platform', 'playTime', 'title']);
    });

    it('omits exactMatch when undefined', () => {
      const game = mockGames()[0];
      const result = compactResult(game, 1.0, undefined);
      assert.equal(result.exactMatch, undefined);
      assert.ok(!('exactMatch' in result));
    });
  });

  describe('sortedPlatformCounts', () => {
    it('returns empty array for empty input', () => {
      assert.deepEqual(sortedPlatformCounts([]), []);
    });

    it('counts and sorts platforms descending', () => {
      const games = mockGames();
      const result = sortedPlatformCounts(games);
      assert.equal(result[0].platform, 'Windows');
      assert.equal(result[0].count, 6);
      assert.equal(result[1].platform, 'Linux');
      assert.equal(result[1].count, 1);
    });
  });
});

describe('buildToolDefinitions', () => {
  it('returns base tools when no status values', () => {
    const tools = buildToolDefinitions([]);
    const listGames = tools.find((t) => t.name === 'list_games');
    assert.ok(listGames);
    assert.equal(listGames.inputSchema.properties.status.description, 'Progress status (OR logic for arrays)');
  });

  it('injects status values into list_games description', () => {
    const tools = buildToolDefinitions(['Active / In Progress', 'Completed']);
    const listGames = tools.find((t) => t.name === 'list_games');
    assert.ok(listGames);
    assert.ok(listGames.inputSchema.properties.status.description.includes('Active / In Progress'));
    assert.ok(listGames.inputSchema.properties.status.description.includes('Completed'));
  });

  it('injects status values into random_game description', () => {
    const tools = buildToolDefinitions(['Active / In Progress', 'Completed']);
    const randomGame = tools.find((t) => t.name === 'random_game');
    assert.ok(randomGame);
    assert.ok(randomGame.inputSchema.properties.status.description.includes('Active / In Progress'));
  });

  it('does not modify other tools', () => {
    const tools = buildToolDefinitions(['Active / In Progress']);
    const searchGames = tools.find((t) => t.name === 'search_games');
    assert.ok(searchGames);
    assert.equal(searchGames.inputSchema.properties.status, undefined);
  });
});
