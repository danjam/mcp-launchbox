import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fuse from 'fuse.js';

import { createHandlers } from '../dist/handlers.js';
import { FUSE_OPTIONS, FUSE_TITLE_ONLY_OPTIONS } from '../dist/loader.js';
import { asInt, asString, compactResult, fail, fuseConfidence, ok, requireString, sortedPlatformCounts } from '../dist/utils.js';

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
      DatabaseID: 'db-1',
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
  ];
}

/** @returns {import('../dist/loader.js').Library} */
function mockLibrary() {
  const games = mockGames();
  const gamesById = new Map(games.map((g) => [g.ID, g]));
  const gamesByTitle = new Map();
  for (const g of games) {
    const key = g.Title.toLowerCase();
    let list = gamesByTitle.get(key);
    if (!list) {
      list = [];
      gamesByTitle.set(key, list);
    }
    list.push(g);
  }
  const fuse = new Fuse(games, FUSE_OPTIONS);
  const fuseTitleOnly = new Fuse(games, FUSE_TITLE_ONLY_OPTIONS);
  return { gamesById, gamesByTitle, games, fuse, fuseTitleOnly };
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
      assert.ok(parsed.total >= 1);
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
      assert.equal(parsed.showing, 1);
      assert.equal(parsed.results.length, 1);
      assert.ok(parsed.total >= 2);
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
});

describe('get_game_details', () => {
  const { handlers } = setup();

  it('returns game data', async () => {
    const result = await handlers.get_game_details({ id: 'aaa-111' });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.Title, 'Half-Life 2');
      assert.equal(parsed.Platform, 'Windows');
      assert.equal(parsed.Notes, undefined);
    }
  });

  it('includes notes when requested', async () => {
    const result = await handlers.get_game_details({ id: 'aaa-111', include_notes: true });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.Notes, 'Classic FPS');
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

describe('list_platforms', () => {
  const { handlers } = setup();

  it('returns platform counts sorted by count', async () => {
    const result = await handlers.list_platforms({});
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed[0].platform, 'Windows');
      assert.equal(parsed[0].count, 2);
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
      assert.equal(parsed.totalGames, 3);
      assert.equal(parsed.totalPlatforms, 2);
      assert.ok(parsed.topPlatforms.length > 0);
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
      assert.equal(parsed.summary.owned, 1);
    }
  });

  it('returns no matches for unknown game', async () => {
    const result = await handlers.check_library({ games: ['Nonexistent Game XYZ'] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.results[0].matches.length, 0);
      assert.equal(parsed.summary.new, 1);
    }
  });

  it('finds fuzzy match via slow path', async () => {
    const result = await handlers.check_library({ games: ['Half-Life'] });
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      assert.ok(parsed.results[0].matches.length >= 1);
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
      assert.equal(parsed[0].count, 2);
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
      assert.equal(parsed.games, 3);
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

  describe('asInt', () => {
    it('returns fallback for undefined', () => {
      assert.equal(asInt(undefined, 25), 25);
    });

    it('returns fallback for null', () => {
      assert.equal(asInt(null, 25), 25);
    });

    it('returns valid integer', () => {
      assert.equal(asInt(10, 25), 10);
    });

    it('returns fail result for non-integer', () => {
      const result = asInt('fifty', 25);
      assert.notEqual(typeof result, 'number');
      assert.equal(result.ok, false);
    });

    it('returns fail result for zero', () => {
      const result = asInt(0, 25);
      assert.notEqual(typeof result, 'number');
      assert.equal(result.ok, false);
    });

    it('returns fail result for negative', () => {
      const result = asInt(-5, 25);
      assert.notEqual(typeof result, 'number');
      assert.equal(result.ok, false);
    });

    it('returns fail result for float', () => {
      const result = asInt(2.5, 25);
      assert.notEqual(typeof result, 'number');
      assert.equal(result.ok, false);
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
      assert.notEqual(typeof result, 'string');
    });

    it('returns fail for empty string', () => {
      const result = requireString('x', '');
      assert.notEqual(typeof result, 'string');
    });

    it('returns fail for non-string', () => {
      const result = requireString('x', 123);
      assert.notEqual(typeof result, 'string');
    });
  });

  describe('fuseConfidence', () => {
    it('perfect score (0) returns 1', () => {
      assert.equal(fuseConfidence(0), 1);
    });

    it('worst score (1) returns 0', () => {
      assert.equal(fuseConfidence(1), 0);
    });

    it('undefined score returns 1', () => {
      assert.equal(fuseConfidence(undefined), 1);
    });

    it('mid score rounds to 2 decimal places', () => {
      const result = fuseConfidence(0.333);
      assert.equal(result, 0.67);
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
      assert.equal(result.playTime, 3600);
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
      assert.equal(result[0].count, 2);
      assert.equal(result[1].platform, 'Linux');
      assert.equal(result[1].count, 1);
    });
  });
});
