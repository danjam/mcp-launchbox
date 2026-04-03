import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadGames, buildLibrary } from '../dist/loader.js';

function gameXml(games) {
  const entries = games
    .map(
      (g) => `<Game>
      ${Object.entries(g)
        .map(([k, v]) => `<${k}>${v}</${k}>`)
        .join('\n      ')}
    </Game>`,
    )
    .join('\n  ');
  return `<?xml version="1.0"?>\n<LaunchBox>\n  ${entries}\n</LaunchBox>`;
}

let dir;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lb-test-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true });
});

describe('loadGames', () => {
  it('parses a valid platform file', async () => {
    await writeFile(
      join(dir, 'Windows.xml'),
      gameXml([{ ID: 'a1', Title: 'TestGame', Platform: 'Windows' }]),
    );
    const { games, gamesById } = await loadGames(dir);
    assert.equal(games.length, 1);
    assert.equal(games[0].Title, 'TestGame');
    assert.equal(games[0].Platform, 'Windows');
    assert.equal(gamesById.get('a1').Title, 'TestGame');
  });

  it('loads multiple platform files', async () => {
    await writeFile(
      join(dir, 'Windows.xml'),
      gameXml([{ ID: 'a1', Title: 'Game1', Platform: 'Windows' }]),
    );
    await writeFile(
      join(dir, 'Linux.xml'),
      gameXml([{ ID: 'a2', Title: 'Game2', Platform: 'Linux' }]),
    );
    const { games } = await loadGames(dir);
    assert.equal(games.length, 2);
  });

  it('skips games with no ID', async (t) => {
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (msg) => warnings.push(msg);
    t.after(() => { console.warn = origWarn; });

    await writeFile(
      join(dir, 'Test.xml'),
      gameXml([
        { ID: 'a1', Title: 'Good', Platform: 'Windows' },
        { Title: 'NoID', Platform: 'Windows' },
      ]),
    );
    const { games } = await loadGames(dir);
    assert.equal(games.length, 1);
    assert.equal(games[0].Title, 'Good');
    assert.ok(warnings.some((w) => w.includes('no ID')));
  });

  it('skips duplicate IDs', async (t) => {
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (msg) => warnings.push(msg);
    t.after(() => { console.warn = origWarn; });

    await writeFile(
      join(dir, 'Test.xml'),
      gameXml([
        { ID: 'dup', Title: 'First', Platform: 'Windows' },
        { ID: 'dup', Title: 'Second', Platform: 'Windows' },
      ]),
    );
    const { games } = await loadGames(dir);
    assert.equal(games.length, 1);
    assert.equal(games[0].Title, 'First');
    assert.ok(warnings.some((w) => w.includes('Duplicate')));
  });

  it('handles single-game platform file (not an array)', async () => {
    await writeFile(
      join(dir, 'Test.xml'),
      gameXml([{ ID: 'only', Title: 'OnlyGame', Platform: 'Test' }]),
    );
    const { games } = await loadGames(dir);
    assert.equal(games.length, 1);
  });

  it('ignores non-xml files', async () => {
    await writeFile(join(dir, 'notes.txt'), 'not xml');
    await writeFile(
      join(dir, 'Test.xml'),
      gameXml([{ ID: 'a1', Title: 'Game', Platform: 'Test' }]),
    );
    const { games } = await loadGames(dir);
    assert.equal(games.length, 1);
  });

  it('returns empty for directory with no xml files', async () => {
    const { games } = await loadGames(dir);
    assert.equal(games.length, 0);
  });

  it('throws on ENOENT', async () => {
    await assert.rejects(
      () => loadGames('/nonexistent/path/does/not/exist'),
      (e) => e.message.includes('not found'),
    );
  });

  it('coerces boolean fields correctly', async () => {
    await writeFile(
      join(dir, 'Test.xml'),
      gameXml([{
        ID: 'b1',
        Title: 'BoolTest',
        Platform: 'Test',
        Favorite: 'true',
        Hide: 'false',
        Broken: true,
        Installed: '',
        Completed: 'true',
      }]),
    );
    const { games } = await loadGames(dir);
    const g = games[0];
    assert.equal(g.Favorite, true);
    assert.equal(g.Hide, false);
    assert.equal(g.Broken, true);
    assert.equal(g.Installed, false);
    assert.equal(g.Completed, true);
  });

  it('coerces numeric fields correctly', async () => {
    await writeFile(
      join(dir, 'Test.xml'),
      gameXml([{
        ID: 'n1',
        Title: 'NumTest',
        Platform: 'Test',
        PlayCount: '42',
        PlayTime: '3600',
        CommunityStarRating: '4.5',
        StarRatingFloat: '3.7',
      }]),
    );
    const { games } = await loadGames(dir);
    const g = games[0];
    assert.equal(g.PlayCount, 42);
    assert.equal(g.PlayTime, 3600);
    assert.equal(g.CommunityStarRating, 4.5);
    assert.equal(g.StarRating, 3.7);
  });

  it('coerces missing/undefined fields to defaults', async () => {
    await writeFile(
      join(dir, 'Test.xml'),
      gameXml([{ ID: 'min', Title: 'Minimal', Platform: 'Test' }]),
    );
    const { games } = await loadGames(dir);
    const g = games[0];
    assert.equal(g.Developer, '');
    assert.equal(g.PlayCount, 0);
    assert.equal(g.Favorite, false);
    assert.equal(g.Notes, '');
  });

  it('maps StarRatingFloat to StarRating field', async () => {
    await writeFile(
      join(dir, 'Test.xml'),
      gameXml([{
        ID: 's1',
        Title: 'StarTest',
        Platform: 'Test',
        StarRating: '3',
        StarRatingFloat: '3.75',
      }]),
    );
    const { games } = await loadGames(dir);
    assert.equal(games[0].StarRating, 3.75);
  });

  it('warns on xml with wrong root element', async (t) => {
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (msg) => warnings.push(msg);
    t.after(() => { console.warn = origWarn; });

    await writeFile(
      join(dir, 'Wrong.xml'),
      '<?xml version="1.0"?><Root><Game><ID>x1</ID><Title>Test</Title></Game></Root>',
    );
    const { games } = await loadGames(dir);
    assert.equal(games.length, 0);
    assert.ok(warnings.some((w) => w.includes('no <LaunchBox> root element')));
  });

  it('handles xml with no Game elements', async () => {
    await writeFile(
      join(dir, 'Empty.xml'),
      '<?xml version="1.0"?><LaunchBox></LaunchBox>',
    );
    const { games } = await loadGames(dir);
    assert.equal(games.length, 0);
  });
});

describe('buildLibrary', () => {
  it('builds all indexes', async () => {
    await writeFile(
      join(dir, 'Test.xml'),
      gameXml([
        { ID: 'a1', Title: 'Half-Life 2', Platform: 'Windows' },
        { ID: 'a2', Title: 'Half-Life 2', Platform: 'Linux' },
        { ID: 'a3', Title: 'Portal', Platform: 'Windows' },
      ]),
    );
    const lib = await buildLibrary(dir);
    assert.equal(lib.games.length, 3);
    assert.equal(lib.gamesById.size, 3);
    assert.equal(lib.gamesByTitle.get('half-life 2').length, 2);
    assert.equal(lib.gamesByTitle.get('portal').length, 1);
    assert.ok(lib.fuse);
    assert.ok(lib.fuseTitleOnly);
  });

  it('fuse search returns results', async () => {
    await writeFile(
      join(dir, 'Test.xml'),
      gameXml([{ ID: 'a1', Title: 'Half-Life 2', Platform: 'Windows', Series: 'Half-Life' }]),
    );
    const lib = await buildLibrary(dir);
    const results = lib.fuse.search('Half-Life');
    assert.equal(results.length, 1);
    assert.equal(results[0].item.Title, 'Half-Life 2');
  });
});
