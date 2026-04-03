import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import Fuse, { type IFuseOptions } from 'fuse.js';
import type { Game } from './types.js';

const stringCache = new Map<string, string>();

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
  const n = Number(val);
  return Number.isNaN(n) ? 0 : n;
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
    StarRating: toNum(raw.StarRatingFloat), // StarRatingFloat for decimal precision, not StarRating
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

export async function loadGames(platformsPath: string): Promise<{
  gamesById: Map<string, Game>;
  games: Game[];
}> {
  stringCache.clear();

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
    throw new Error(`Failed to read platforms directory ${platformsPath}: ${error}`);
  }

  const parser = new XMLParser({
    ignoreAttributes: true,
    isArray: (_tagName: string, jPath: string) => jPath === 'LaunchBox.Game',
  });

  const fileResults = await Promise.all(
    files.map(async (file) => {
      try {
        const xml = await readFile(join(platformsPath, file), 'utf-8');
        const parsed = parser.parse(xml);
        return (parsed?.LaunchBox?.Game ?? []) as Record<string, unknown>[];
      } catch (e) {
        throw new Error(`Failed to parse platform file "${file}": ${e instanceof Error ? e.message : e}`);
      }
    }),
  );

  const gamesById = new Map<string, Game>();
  const games: Game[] = [];

  for (const rawGames of fileResults) {
    for (const raw of rawGames) {
      const game = extractGame(raw);
      if (!game.ID) {
        console.warn(`Game "${game.Title}" on ${game.Platform} has no ID — skipping`);
        continue;
      }
      if (gamesById.has(game.ID)) {
        console.warn(`Duplicate game ID "${game.ID}" (${game.Title}) — skipping`);
        continue;
      }
      gamesById.set(game.ID, game);
      games.push(game);
    }
  }

  stringCache.clear();
  return { gamesById, games };
}

export const FUSE_OPTIONS: IFuseOptions<Game> = {
  keys: [
    { name: 'Title', weight: 1 },
    { name: 'Series', weight: 0.5 },
  ],
  threshold: 0.3,
  ignoreLocation: true,
  includeScore: true,
};

export const FUSE_TITLE_ONLY_OPTIONS: IFuseOptions<Game> = {
  keys: [{ name: 'Title', weight: 1 }],
  threshold: 0.3,
  ignoreLocation: true,
  includeScore: true,
};

export async function buildLibrary(platformsPath: string): Promise<Library> {
  const { gamesById, games } = await loadGames(platformsPath);
  const fuse = new Fuse(games, FUSE_OPTIONS);
  const fuseTitleOnly = new Fuse(games, FUSE_TITLE_ONLY_OPTIONS);

  const gamesByTitle = new Map<string, Game[]>();
  for (const g of games) {
    const key = g.Title.toLowerCase();
    let list = gamesByTitle.get(key);
    if (!list) {
      list = [];
      gamesByTitle.set(key, list);
    }
    list.push(g);
  }

  return { gamesById, gamesByTitle, games, fuse, fuseTitleOnly };
}

export interface Library {
  readonly gamesById: ReadonlyMap<string, Game>;
  readonly gamesByTitle: ReadonlyMap<string, readonly Game[]>;
  readonly games: readonly Game[];
  readonly fuse: Fuse<Game>;
  readonly fuseTitleOnly: Fuse<Game>;
}
