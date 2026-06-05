import type { MCPToolDefinition } from './types.js';

export const tools = [
  {
    name: 'search_games',
    description:
      'Search the library by title and series. Confidence: 1.0 = perfect, ≥0.85 = very likely, ≥0.65 = probable, <0.65 = speculative. Use id with get_game_details.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text to match against game titles and series' },
        platform: { type: 'string', description: "Filter by platform name (e.g. 'Windows', 'Arcade')" },
        limit: { type: 'integer', description: 'Max results to return (default 25)' },
        exact: { type: 'boolean', description: 'Disable punctuation normalisation for matching (default false)' },
      },
      required: ['query'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'check_library',
    description:
      'Batch-check which games from a list are in the library — use instead of calling search_games per title. Only matches with confidence ≥0.85 count. When no match is found, nearMisses lists up to 5 candidates — confidence 0 means a shorter version of the title exists (search the head title to confirm). Results exclude storefront/version info — use get_game_details for that. Omit platform to check across all platforms (recommended for bundles).',
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
        exact: { type: 'boolean', description: 'Disable punctuation normalisation for matching (default false)' },
      },
      required: ['games'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'get_game_details',
    description:
      "Get details for a game by ID. starRating and communityStarRating are 0–5, progress is free-form. versions lists storefronts, regions, and ports — source only reflects the primary entry's import origin.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The game ID (UUID from search results)' },
        include_notes: { type: 'boolean', description: 'Include the Notes field (default false)' },
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'list_platforms',
    description: 'List all platforms with game counts. Names are the exact values for platform filters in other tools.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'list_games',
    description:
      'List games sorted and paginated — unlike search_games, no fuzzy matching. Browse by platform, installed status, or favorites; recency queries like "what did I add this week."',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: "Filter by platform name (e.g. 'Windows', 'Arcade')" },
        installed: { type: 'boolean', description: 'Filter by installed status' },
        favorite: { type: 'boolean', description: 'Filter by favorite status' },
        sort: {
          type: 'string',
          enum: ['title', 'dateAdded', 'lastPlayed', 'playTime'],
          description:
            'Sort order (default "title"). dateAdded/lastPlayed sort most recent first, playTime sorts most played first',
        },
        status: {
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
          description: 'Filter by progress status (OR logic for arrays)',
        },
        limit: { type: 'integer', description: 'Max results to return (default 25)' },
        offset: { type: 'integer', description: 'Number of results to skip for pagination (default 0)' },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'find_duplicates',
    description:
      'Find duplicate game entries grouped by title — includes cross-platform and same-platform duplicates. Optional query filters by fuzzy title match.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional title filter (fuzzy match)' },
        limit: { type: 'integer', description: 'Max duplicate groups to return (default 25)' },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'get_stats',
    description:
      'Library summary: total games, total platforms, top 10 platforms by game count, and statusCounts (all distinct progress values with counts, sorted descending). Use statusCounts to discover available status filter values.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'random_game',
    description:
      'Pick a random game, optionally filtered. For "what should I play?" or "surprise me". Returns one game (same shape as list_games) or null, plus matchPool (total games matching filters).',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: "Filter by platform name (e.g. 'Windows', 'Arcade')" },
        installed: { type: 'boolean', description: 'Filter by installed status' },
        favorite: { type: 'boolean', description: 'Filter by favorite status' },
        status: {
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
          description: 'Filter by progress status (OR logic for arrays)',
        },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'reload_library',
    description:
      'Reload the library after adding or removing games in LaunchBox. Returns game/platform counts plus added/removed arrays (id, title, platform).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
] as const satisfies MCPToolDefinition[];

export type ToolName = (typeof tools)[number]['name'];

export function buildToolDefinitions(statusValues: readonly string[]): MCPToolDefinition[] {
  if (statusValues.length === 0) return [...tools];
  const statusDescription = `Filter by progress status (OR logic for arrays). Valid values: ${statusValues.join(', ')}`;
  return tools.map((t) => {
    if (!('status' in t.inputSchema.properties)) return t;
    return {
      ...t,
      inputSchema: {
        ...t.inputSchema,
        properties: {
          ...t.inputSchema.properties,
          status: {
            ...t.inputSchema.properties.status,
            description: statusDescription,
          },
        },
      },
    };
  });
}
