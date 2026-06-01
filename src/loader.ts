import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import Fuse, { type IFuseOptions } from 'fuse.js';
import type { Game, GameVersion } from './types.js';
import { normaliseTitle, sortedPlatformCounts } from './utils.js';

const stringCache = new Map<string, string>();
let nanCount = 0;

function intern(val: unknown): string {
  const str = toStr(val);
  if (str === '') return '';
  const cached = stringCache.get(str);
  if (cached !== undefined) return cached;
  stringCache.set(str, str);
  return str;
}

function toBool(val: unknown): boolean {
  return val === true || val === 'true';
}

function toStr(val: unknown): string {
  if (val === undefined || val === null || val === '') return '';
  return String(val);
}

function toNum(val: unknown): number {
  if (val === undefined || val === null || val === '') return 0;
  const n = Number(val);
  if (Number.isNaN(n)) {
    nanCount++;
    return 0;
  }
  return n;
}

function extractGame(raw: Record<string, unknown>): Game {
  const platform = intern(raw.Platform);
  return {
    ID: toStr(raw.ID),
    Title: toStr(raw.Title),
    Platform: platform,
    Developer: intern(raw.Developer),
    Publisher: intern(raw.Publisher),
    Genre: intern(raw.Genre),
    ReleaseDate: toStr(raw.ReleaseDate),
    Notes: toStr(raw.Notes),
    Source: intern(raw.Source),
    Series: intern(raw.Series),
    PlayMode: intern(raw.PlayMode),
    Rating: intern(raw.Rating),
    MaxPlayers: intern(raw.MaxPlayers),
    CommunityStarRating: toNum(raw.CommunityStarRating),
    StarRating: toNum(raw.StarRatingFloat),
    Status: intern(raw.Status),
    Favorite: toBool(raw.Favorite),
    DatabaseID: toStr(raw.DatabaseID),
    Hide: toBool(raw.Hide),
    Broken: toBool(raw.Broken),
    PlayCount: toNum(raw.PlayCount),
    PlayTime: toNum(raw.PlayTime),
    LastPlayedDate: toStr(raw.LastPlayedDate),
    DateAdded: toStr(raw.DateAdded),
    Installed: toBool(raw.Installed),
    Completed: toBool(raw.Completed),
    Progress: intern(raw.Progress),
  };
}

function extractVersion(raw: Record<string, unknown>): { gameId: string; version: GameVersion } | undefined {
  const gameId = toStr(raw.GameID);
  const version = toStr(raw.Version);
  if (!gameId || !version) return undefined;
  const region = toStr(raw.Region);
  const entry: GameVersion = { version, installed: toBool(raw.Installed) };
  if (region) (entry as { region: string }).region = region;
  return { gameId, version: entry };
}

export async function loadGames(platformsPath: string): Promise<{
  gamesById: Map<string, Game>;
  games: Game[];
  versionsByGameId: Map<string, GameVersion[]>;
}> {
  stringCache.clear();
  nanCount = 0;

  let files: string[];
  try {
    const allFiles = await readdir(platformsPath);
    files = allFiles.filter((f) => f.endsWith('.xml'));
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(
        `Platforms directory not found at ${platformsPath}. Ensure LAUNCHBOX_PLATFORMS_PATH points to a valid platforms directory.`,
      );
    }
    if (code === 'ENOTDIR') {
      throw new Error(
        `${platformsPath} is a file, not a directory. LAUNCHBOX_PLATFORMS_PATH must point to a directory.`,
      );
    }
    throw new Error(`Failed to read platforms directory ${platformsPath}: ${error}`);
  }

  const parser = new XMLParser({
    ignoreAttributes: true,
    htmlEntities: true,
    // Ensures Game is always an array even for single-game platform files
    isArray: (_tagName: string, jPath: string) =>
      jPath === 'LaunchBox.Game' || jPath === 'LaunchBox.AdditionalApplication',
  });

  const fileResults = await Promise.all(
    files.map(async (file) => {
      let xml: string;
      try {
        xml = await readFile(join(platformsPath, file), 'utf-8');
      } catch (e) {
        // Intentional: fail the entire load rather than silently serving a partial library
        const code = (e as NodeJS.ErrnoException).code;
        throw new Error(`Failed to read "${file}" (${code ?? 'unknown'}): ${e instanceof Error ? e.message : e}`);
      }
      try {
        const parsed = parser.parse(xml);
        const games = (parsed?.LaunchBox?.Game ?? []) as Record<string, unknown>[];
        const additionalApps = (parsed?.LaunchBox?.AdditionalApplication ?? []) as Record<string, unknown>[];
        if (games.length === 0 && parsed && !parsed.LaunchBox) {
          console.warn(`"${file}" has no <LaunchBox> root element — skipping`);
        }
        return { games, additionalApps };
      } catch (e) {
        throw new Error(`Failed to parse XML in "${file}": ${e instanceof Error ? e.message : e}`);
      }
    }),
  );

  const gamesById = new Map<string, Game>();
  const games: Game[] = [];
  const versionsByGameId = new Map<string, GameVersion[]>();
  let skipped = 0;

  for (const { games: rawGames, additionalApps } of fileResults) {
    for (const raw of additionalApps) {
      const entry = extractVersion(raw);
      if (!entry) continue;
      let list = versionsByGameId.get(entry.gameId);
      if (!list) {
        list = [];
        versionsByGameId.set(entry.gameId, list);
      }
      list.push(entry.version);
    }
    for (const raw of rawGames) {
      const game = extractGame(raw);
      if (!game.ID) {
        console.warn(`Game "${game.Title}" on ${game.Platform} has no ID — skipping`);
        skipped++;
        continue;
      }
      if (!game.Title) {
        console.warn(`Game ${game.ID} on ${game.Platform} has no title — skipping`);
        skipped++;
        continue;
      }
      if (!game.Platform) {
        console.warn(`Game "${game.Title}" (${game.ID}) has no platform — skipping`);
        skipped++;
        continue;
      }
      if (gamesById.has(game.ID)) {
        console.warn(`Duplicate game ID "${game.ID}" (${game.Title}) — skipping`);
        skipped++;
        continue;
      }
      gamesById.set(game.ID, game);
      games.push(game);
    }
  }

  if (skipped > 0) {
    console.warn(`Skipped ${skipped} games (no ID, no title, no platform, or duplicate ID)`);
  }
  if (nanCount > 0) {
    console.warn(`${nanCount} non-numeric field values defaulted to 0`);
  }

  stringCache.clear();
  return { gamesById, games, versionsByGameId };
}

const defaultGetFn = Fuse.config.getFn;

function normalisingGetFn(obj: Game, path: string | string[]): readonly string[] | string {
  const val = defaultGetFn(obj, path);
  if (typeof val === 'string') return normaliseTitle(val);
  if (Array.isArray(val)) return val.map((v) => (typeof v === 'string' ? normaliseTitle(v) : ''));
  return val;
}

export const FUSE_OPTIONS: IFuseOptions<Game> = {
  keys: [
    { name: 'Title', weight: 1 },
    { name: 'Series', weight: 0.5 },
  ],
  threshold: 0.3,
  ignoreLocation: true,
  includeScore: true,
  getFn: normalisingGetFn,
};

export const FUSE_TITLE_ONLY_OPTIONS: IFuseOptions<Game> = {
  keys: [{ name: 'Title', weight: 1 }],
  threshold: 0.3,
  ignoreLocation: true,
  includeScore: true,
  getFn: normalisingGetFn,
};

export async function buildLibrary(platformsPath: string): Promise<Library> {
  const { gamesById, games, versionsByGameId } = await loadGames(platformsPath);
  const fuse = new Fuse(games, FUSE_OPTIONS);
  const fuseTitleOnly = new Fuse(games, FUSE_TITLE_ONLY_OPTIONS);

  const gamesByTitle = new Map<string, Game[]>();
  const gamesByNormalisedTitle = new Map<string, Game[]>();
  for (const g of games) {
    const lower = g.Title.toLowerCase();
    let list = gamesByTitle.get(lower);
    if (!list) {
      list = [];
      gamesByTitle.set(lower, list);
    }
    list.push(g);

    const normalised = normaliseTitle(g.Title);
    let nList = gamesByNormalisedTitle.get(normalised);
    if (!nList) {
      nList = [];
      gamesByNormalisedTitle.set(normalised, nList);
    }
    nList.push(g);
  }

  const byPlatform = new Map<string, Game[]>();
  for (const g of games) {
    const key = g.Platform.toLowerCase();
    let list = byPlatform.get(key);
    if (!list) {
      list = [];
      byPlatform.set(key, list);
    }
    list.push(g);
  }

  const platformFuse = new Map<string, Fuse<Game>>();
  const platformFuseTitleOnly = new Map<string, Fuse<Game>>();
  for (const [key, pGames] of byPlatform) {
    platformFuse.set(key, new Fuse(pGames, FUSE_OPTIONS));
    platformFuseTitleOnly.set(key, new Fuse(pGames, FUSE_TITLE_ONLY_OPTIONS));
  }

  const platformCounts = sortedPlatformCounts(games);
  const duplicateGroups = buildDuplicateGroups(games);

  return {
    gamesById,
    gamesByTitle,
    gamesByNormalisedTitle,
    games,
    versionsByGameId,
    fuse,
    fuseTitleOnly,
    platformFuse,
    platformFuseTitleOnly,
    platformCounts,
    duplicateGroups,
  };
}

export type DuplicateGroup = { title: string; platforms: string[]; entries: number };

function buildDuplicateGroups(games: readonly Game[]): DuplicateGroup[] {
  const groups = new Map<string, { title: string; platforms: Set<string>; entries: number }>();
  for (const g of games) {
    const key = g.Title.toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = { title: g.Title, platforms: new Set(), entries: 0 };
      groups.set(key, group);
    }
    group.platforms.add(g.Platform);
    group.entries++;
  }
  return [...groups.values()]
    .filter((g) => g.entries >= 2)
    .map((g) => ({ title: g.title, platforms: [...g.platforms].sort(), entries: g.entries }))
    .sort((a, b) => b.entries - a.entries);
}

export interface Library {
  readonly gamesById: ReadonlyMap<string, Game>;
  readonly gamesByTitle: ReadonlyMap<string, readonly Game[]>;
  readonly gamesByNormalisedTitle: ReadonlyMap<string, readonly Game[]>;
  readonly games: readonly Game[];
  readonly versionsByGameId: ReadonlyMap<string, readonly GameVersion[]>;
  readonly fuse: Fuse<Game>;
  readonly fuseTitleOnly: Fuse<Game>;
  readonly platformFuse: ReadonlyMap<string, Fuse<Game>>;
  readonly platformFuseTitleOnly: ReadonlyMap<string, Fuse<Game>>;
  readonly platformCounts: readonly { platform: string; count: number }[];
  readonly duplicateGroups: readonly DuplicateGroup[];
}
