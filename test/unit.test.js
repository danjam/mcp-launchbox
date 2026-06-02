import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fuse from 'fuse.js';

import { createHandlers } from '../dist/handlers.js';
import { FUSE_OPTIONS, FUSE_TITLE_ONLY_OPTIONS } from '../dist/loader.js';
import {
  normaliseTitle, parseLimit, asString, compactResult, fail, fuseConfidence, ok,
  passesSingleTokenTitleGuard,
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
      Progress: '',
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
      Progress: '',
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
  return {
    gamesById, gamesByTitle, gamesByNormalisedTitle, games, versionsByGameId: new Map(),
    fuse, fuseTitleOnly, platformFuse, platformFuseTitleOnly, platformCounts, duplicateGroups,
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
      assert.equal(parsed.total, 4);
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
      assert.equal(parsed.results[0].title, 'Half-Life 2');
    }
  });

  it('respects limit and offset', async () => {
    const result = await handlers.list_games({ limit: 1, offset: 1 });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.total, 4);
      assert.equal(parsed.results.length, 1);
      assert.equal(parsed.results[0].title, 'Half-Life 2');
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
});

describe('list_platforms', () => {
  const { handlers } = setup();

  it('returns platform counts sorted by count', async () => {
    const result = await handlers.list_platforms({});
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed[0].platform, 'Windows');
      assert.equal(parsed[0].count, 3);
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
      assert.equal(parsed.totalGames, 4);
      assert.equal(parsed.totalPlatforms, 2);
      assert.equal(parsed.topPlatforms.length, 2);
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
    const result = await handlers.check_library({ games: ['Half-Life 3'] });
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

  it('rejects when titles exceed limit', async () => {
    const result = await handlers.check_library({ games: ['A', 'B', 'C'], limit: 2 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /Too many titles/);
  });

  it('rejects empty games array', async () => {
    const result = await handlers.check_library({ games: [] });
    assert.equal(result.ok, false);
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
      assert.equal(entry.nearMisses[0].confidence, 0);
      assert.equal(parsed.summary.owned, 0);
      assert.equal(parsed.summary.new, 1);
    }
  });

  it('does not run prefix fallback when fuzzy nearMisses exist', async () => {
    const result = await handlers.check_library({ games: ['Half-Life 3'] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      const entry = parsed.results[0];
      assert.ok(entry.nearMisses.length > 0);
      assert.ok(entry.nearMisses.every((n) => n.confidence > 0), 'should be Fuse nearMisses, not prefix');
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
      assert.equal(parsed.games, 4);
      assert.equal(parsed.platforms, 2);
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

  // Regression for #2: a single-token query like "gord" must not match
  // "flash gordon" (mid-token substring of the second token).
  describe('passesSingleTokenTitleGuard', () => {
    it('rejects single-token query that is only a mid-token substring (#2)', () => {
      assert.equal(passesSingleTokenTitleGuard('gord', 'flash gordon'), false);
    });

    it('accepts single-token query that matches a complete title token', () => {
      assert.equal(passesSingleTokenTitleGuard('halo', 'halo 2'), true);
    });

    it('accepts a small typo within the per-length tolerance (typos via Bitap stay)', () => {
      // 5-char query vs a 5-char title token, single-char substitution.
      // tolerance = floor(5/4) = 1, so this passes.
      assert.equal(passesSingleTokenTitleGuard('starss', 'starsx'), true);
    });

    it('rejects a single-token query when no title token is close enough', () => {
      assert.equal(passesSingleTokenTitleGuard('zzzzz', 'half-life 2'), false);
    });

    it('passes through multi-token queries unchanged (multi-token gets IDF)', () => {
      assert.equal(passesSingleTokenTitleGuard('flash gord', 'flash gordon'), true);
      assert.equal(passesSingleTokenTitleGuard('flash gord', 'half-life 2'), true);
    });

    it('handles short queries strictly (3-char query: exact only)', () => {
      assert.equal(passesSingleTokenTitleGuard('rim', 'rimworld'), false);
      assert.equal(passesSingleTokenTitleGuard('rim', 'rim runner'), true);
    });

    it('treats title hyphens as token separators (normalisation contract)', () => {
      // `normaliseTitle('half-life 2')` produces `'half life 2'`, so the
      // guard sees three tokens and `half` matches as a whole token.
      assert.equal(passesSingleTokenTitleGuard('half', 'half life 2'), true);
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
  });

  describe('sortedPlatformCounts', () => {
    it('returns empty array for empty input', () => {
      assert.deepEqual(sortedPlatformCounts([]), []);
    });

    it('counts and sorts platforms descending', () => {
      const games = mockGames();
      const result = sortedPlatformCounts(games);
      assert.equal(result[0].platform, 'Windows');
      assert.equal(result[0].count, 3);
      assert.equal(result[1].platform, 'Linux');
      assert.equal(result[1].count, 1);
    });
  });
});
