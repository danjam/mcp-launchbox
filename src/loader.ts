import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import type { Game } from "./types.js";

const stringCache = new Map<string, string>();

function intern(val: unknown): string {
  const str = toStr(val);
  if (str === "") return "";
  const cached = stringCache.get(str);
  if (cached !== undefined) return cached;
  stringCache.set(str, str);
  return str;
}

function toBool(val: unknown): boolean {
  return val === true || val === "true";
}

function toStr(val: unknown): string {
  if (val === undefined || val === null || val === "") return "";
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
    normalizedPlatform: platform.toLowerCase(),
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

export async function loadGames(launchboxPath: string): Promise<{
  gamesById: Map<string, Game>;
  games: Game[];
}> {
  stringCache.clear();

  const platformsDir = join(launchboxPath, "Data", "Platforms");

  let files: string[];
  try {
    const allFiles = await readdir(platformsDir);
    files = allFiles.filter((f) => f.endsWith(".xml"));
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(
        `Platforms directory not found at ${platformsDir}. Ensure LAUNCHBOX_DATA_PATH points to a valid LaunchBox installation.`
      );
    }
    throw new Error(`Failed to read platforms directory ${platformsDir}: ${error}`);
  }

  const parser = new XMLParser({
    ignoreAttributes: true,
    isArray: (_tagName: string, jPath: string) => jPath === "LaunchBox.Game",
  });

  const fileResults = await Promise.all(
    files.map(async (file) => {
      const xml = await readFile(join(platformsDir, file), "utf-8");
      const parsed = parser.parse(xml);
      return (parsed?.LaunchBox?.Game ?? []) as Record<string, unknown>[];
    })
  );

  const gamesById = new Map<string, Game>();
  const games: Game[] = [];

  for (const rawGames of fileResults) {
    for (const raw of rawGames) {
      const game = extractGame(raw);
      if (game.ID) {
        if (gamesById.has(game.ID)) {
          console.warn(`Duplicate game ID "${game.ID}" (${game.Title}) — overwriting previous entry`);
        }
        gamesById.set(game.ID, game);
        games.push(game);
      }
    }
  }

  return { gamesById, games };
}
