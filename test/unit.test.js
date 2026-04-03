import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fuse from 'fuse.js';

import { createHandlers } from '../dist/handlers.js';

/** @returns {import('../dist/types.js').Game[]} */
function mockGames() {
  return [
    {
      ID: 'aaa-111',
      Title: 'Half-Life 2',
      Platform: 'Windows',
      normalizedPlatform: 'windows',
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
      normalizedPlatform: 'linux',
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
      normalizedPlatform: 'windows',
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

const FUSE_OPTIONS = {
  keys: [
    { name: 'Title', weight: 1 },
    { name: 'Series', weight: 0.5 },
  ],
  threshold: 0.3,
  ignoreLocation: true,
  includeScore: true,
};

const FUSE_TITLE_ONLY_OPTIONS = {
  keys: [{ name: 'Title', weight: 1 }],
  threshold: 0.3,
  ignoreLocation: true,
  includeScore: true,
};

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

  it('rejects missing query', async () => {
    const result = await handlers.search_games({});
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
      assert.equal(parsed.normalizedPlatform, undefined);
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

  it('rejects missing games param', async () => {
    const result = await handlers.check_library({});
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
