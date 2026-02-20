#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import Fuse, { type IFuseOptions } from "fuse.js";
import { loadGames } from "./loader.js";
import type { Game } from "./types.js";

const launchboxPath = process.env.LAUNCHBOX_DATA_PATH;
if (!launchboxPath) {
  console.error("LAUNCHBOX_DATA_PATH environment variable is required");
  process.exit(1);
}

const FUSE_OPTIONS: IFuseOptions<Game> = {
  keys: [
    { name: "Title", weight: 1 },
    { name: "Series", weight: 0.5 },
  ],
  threshold: 0.3,
  ignoreLocation: true,
  includeScore: true,
};

const FUSE_TITLE_ONLY_OPTIONS: IFuseOptions<Game> = {
  keys: [{ name: "Title", weight: 1 }],
  threshold: 0.3,
  ignoreLocation: true,
  includeScore: true,
};

let gamesById: Map<string, Game>;
let gamesByTitle: Map<string, Game[]>;
let games: Game[];
let fuse: Fuse<Game>;
let fuseTitleOnly: Fuse<Game>;

async function load() {
  const result = await loadGames(launchboxPath!);
  gamesById = result.gamesById;
  games = result.games;
  fuse = new Fuse(games, FUSE_OPTIONS);
  fuseTitleOnly = new Fuse(games, FUSE_TITLE_ONLY_OPTIONS);

  gamesByTitle = new Map();
  for (const g of games) {
    const key = g.Title.toLowerCase();
    let list = gamesByTitle.get(key);
    if (!list) {
      list = [];
      gamesByTitle.set(key, list);
    }
    list.push(g);
  }

  return games.length;
}

console.error(`Loading games from ${launchboxPath}...`);
try {
  const count = await load();
  console.error(`Loaded ${count} games across ${new Set(games!.map((g) => g.Platform)).size} platforms`);
} catch (error) {
  console.error(`Failed to load games: ${error}`);
  process.exit(1);
}

const server = new McpServer({
  name: "mcp-launchbox",
  version: "1.0.0",
});

server.registerTool(
  "search_games",
  {
    title: "Search Games",
    description: "Search the LaunchBox game library by title. Returns compact results with id, title, platform, installed status, play time, and a confidence score. Use the id from results to call get_game_details for full metadata.",
    inputSchema: {
      query: z.string().describe("Search text to match against game titles"),
      platform: z.string().optional().describe("Filter by platform name (e.g. 'Windows', 'Arcade')"),
      limit: z.number().optional().default(25).describe("Max results to return (default 25)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ query, platform, limit }) => {
    let results = fuse.search(query);

    if (platform) {
      const p = platform.toLowerCase();
      results = results.filter((r) => r.item.normalizedPlatform === p);
    }

    const limited = results.slice(0, limit);

    const items = limited.map((r) => ({
      id: r.item.ID,
      title: r.item.Title,
      platform: r.item.Platform,
      installed: r.item.Installed,
      playTime: r.item.PlayTime,
      confidence: Math.round((1 - (r.score ?? 0)) * 100) / 100,
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ total: results.length, showing: limited.length, results: items }),
        },
      ],
    };
  }
);

server.registerTool(
  "check_library",
  {
    title: "Check Library",
    description:
      "Check which games from a list are already in the library. Accepts an array of game titles and returns matches for each. Designed for bundle duplicate checking — replaces calling search_games per title. Omit platform to check across all platforms (recommended for bundles).",
    inputSchema: {
      games: z
        .array(z.string())
        .min(1)
        .max(100)
        .describe("Array of game title strings to look up (1-100)"),
      platform: z
        .string()
        .optional()
        .describe("Filter matches to a specific platform"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ games: titles, platform }) => {
    const CONFIDENCE_THRESHOLD = 0.85;
    const platformFilter = platform?.toLowerCase();

    const results = titles.map((query) => {
      // Fast path: exact title match
      let candidates = gamesByTitle.get(query.toLowerCase());

      if (candidates) {
        if (platformFilter) {
          candidates = candidates.filter(
            (g) => g.normalizedPlatform === platformFilter
          );
        }
        return {
          query,
          matches: candidates.map((g) => ({
            id: g.ID,
            title: g.Title,
            platform: g.Platform,
            installed: g.Installed,
            playTime: g.PlayTime,
            confidence: 1.0,
          })),
        };
      }

      // Slow path: fuzzy search (title only)
      let fuzzyResults = fuseTitleOnly.search(query);

      if (platformFilter) {
        fuzzyResults = fuzzyResults.filter(
          (r) => r.item.normalizedPlatform === platformFilter
        );
      }

      const matches = fuzzyResults
        .filter((r) => 1 - (r.score ?? 0) >= CONFIDENCE_THRESHOLD)
        .map((r) => ({
          id: r.item.ID,
          title: r.item.Title,
          platform: r.item.Platform,
          installed: r.item.Installed,
          playTime: r.item.PlayTime,
          confidence: Math.round((1 - (r.score ?? 0)) * 100) / 100,
        }));

      return { query, matches };
    });

    const owned = results.filter((r) => r.matches.length > 0).length;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            results,
            summary: {
              total: titles.length,
              owned,
              new: titles.length - owned,
            },
          }),
        },
      ],
    };
  }
);

server.registerTool(
  "get_game_details",
  {
    title: "Get Game Details",
    description: "Get full details for a specific game by ID. Returns metadata (title, platform, developer, publisher, genre, release date, series) and play data (play count, play time in seconds, last played date, date added, installed, completed, progress, personal star rating).",
    inputSchema: {
      id: z.string().describe("The game ID (UUID from search results)"),
      include_notes: z.boolean().optional().default(false).describe("Include the Notes field (default false)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ id, include_notes }) => {
    const game = gamesById.get(id);
    if (!game) {
      return {
        content: [{ type: "text" as const, text: `Game not found: ${id}` }],
        isError: true,
      };
    }
    const { normalizedPlatform, Notes, ...rest } = game;
    const gameData = include_notes ? { ...rest, Notes } : rest;
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(gameData) },
      ],
    };
  }
);

server.registerTool(
  "list_platforms",
  {
    title: "List Platforms",
    description: "List all platforms in the library with their game counts. Platform names returned here are the exact values to use for the platform filter in search_games.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    const counts = new Map<string, number>();
    for (const g of games) {
      counts.set(g.Platform, (counts.get(g.Platform) ?? 0) + 1);
    }

    const platforms = [...counts.entries()]
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count);

    return {
      content: [{ type: "text" as const, text: JSON.stringify(platforms) }],
    };
  }
);

server.registerTool(
  "find_duplicates",
  {
    title: "Find Duplicate Games",
    description: "Find games owned on multiple platforms, grouped by title.",
    inputSchema: {
      query: z.string().optional().describe("Optional title filter (fuzzy match)"),
      limit: z.number().optional().default(25).describe("Max duplicate groups to return (default 25)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ query, limit }) => {
    let source = games;
    if (query) {
      source = fuse.search(query).map((r) => r.item);
    }

    const groups = new Map<string, { title: string; platforms: Set<string> }>();
    for (const g of source) {
      const key = g.Title.toLowerCase();
      let group = groups.get(key);
      if (!group) {
        group = { title: g.Title, platforms: new Set() };
        groups.set(key, group);
      }
      group.platforms.add(g.Platform);
    }

    const duplicates = [...groups.values()]
      .filter((g) => g.platforms.size >= 2)
      .map((g) => ({
        title: g.title,
        platforms: [...g.platforms].sort(),
        count: g.platforms.size,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return {
      content: [{ type: "text" as const, text: JSON.stringify(duplicates) }],
    };
  }
);

server.registerTool(
  "get_stats",
  {
    title: "Get Library Stats",
    description: "Get library summary statistics: total games, total platforms, and top 10 platforms by game count.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    const counts = new Map<string, number>();
    for (const g of games) {
      counts.set(g.Platform, (counts.get(g.Platform) ?? 0) + 1);
    }

    const topPlatforms = [...counts.entries()]
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const stats = {
      totalGames: games.length,
      totalPlatforms: counts.size,
      topPlatforms,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(stats) }],
    };
  }
);

server.registerTool(
  "reload_library",
  {
    title: "Reload Library",
    description: "Reload the game library from disk. Use after adding or removing games in LaunchBox.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async () => {
    try {
      const count = await load();
      const platforms = new Set(games.map((g) => g.Platform)).size;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ reloaded: true, games: count, platforms }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Reload failed: ${error}` }],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
