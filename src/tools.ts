import type { MCPToolDefinition } from './types.js';

export const tools = [
  {
    name: 'search_games',
    description:
      'Search the LaunchBox game library by title and series. Returns compact results with id, title, platform, installed status, play time, and a confidence score. Use the id from results to call get_game_details for full metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text to match against game titles and series' },
        platform: { type: 'string', description: "Filter by platform name (e.g. 'Windows', 'Arcade')" },
        limit: { type: 'integer', description: 'Max results to return (default 25)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'check_library',
    description:
      'Check which games from a list are already in the library. Accepts an array of game titles and returns matches for each. Uses exact title matching first, then fuzzy title-only matching with a 0.85 confidence threshold. Designed for bundle duplicate checking — replaces calling search_games per title. Omit platform to check across all platforms (recommended for bundles).',
    inputSchema: {
      type: 'object',
      properties: {
        games: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Array of game title strings to look up',
        },
        platform: { type: 'string', description: 'Filter matches to a specific platform' },
        limit: { type: 'integer', description: 'Max titles to process (default 100)' },
      },
      required: ['games'],
    },
  },
  {
    name: 'get_game_details',
    description:
      'Get full details for a specific game by ID. Returns all metadata including title, platform, developer, genre, series, ratings, and play data such as play count, play time, installed status, and more.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The game ID (UUID from search results)' },
        include_notes: { type: 'boolean', description: 'Include the Notes field (default false)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_platforms',
    description:
      'List all platforms in the library with their game counts. Platform names returned here are the exact values to use for the platform filter in search_games.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'find_duplicates',
    description: 'Find games owned on multiple platforms, grouped by title.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional title filter (fuzzy match)' },
        limit: { type: 'integer', description: 'Max duplicate groups to return (default 25)' },
      },
    },
  },
  {
    name: 'get_stats',
    description: 'Get library summary statistics: total games, total platforms, and top 10 platforms by game count.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'reload_library',
    description: 'Reload the game library from disk. Use after adding or removing games in LaunchBox.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
] as const satisfies MCPToolDefinition[];

export type ToolName = (typeof tools)[number]['name'];
