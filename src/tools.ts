import type { MCPToolDefinition } from './types.js';

export const tools = [
  {
    name: 'search_games',
    description:
      'Search the library by title and series. Confidence: 1.0 = perfect, ≥0.85 = very likely, ≥0.65 = probable, <0.65 = speculative. Results include exactMatch: true when the query equals the title after normalisation (case-folded, dashes/colons/& stripped). Use id with get_game_details.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Game title or series' },
        platform: { type: 'string', description: "Platform (e.g. 'Windows', 'Arcade')" },
        installed: { type: 'boolean', description: 'true = installed only, false = uninstalled only, omit = all' },
        favorite: { type: 'boolean', description: 'true = favorites only, false = non-favorites only, omit = all' },
        limit: { type: 'integer', description: 'Max results (default 25, max 100)' },
        exact: {
          type: 'boolean',
          description: 'Exact title match only, no fuzzy search (default false)',
        },
      },
      required: ['query'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'check_library',
    description:
      'Batch-check which games from a list are in the library — use instead of calling search_games per title. Only matches with confidence ≥0.85 count. When no match is found, nearMisses lists up to 5 candidates — nearMisses with `shorterTitle: true` indicate a shorter version of the title exists (search the shorter title to confirm). Results exclude storefront/version info — use get_game_details for that. Omit platform to check across all platforms (recommended for bundles).',
    inputSchema: {
      type: 'object',
      properties: {
        games: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Game titles to look up',
        },
        platform: { type: 'string', description: "Platform (e.g. 'Windows', 'Arcade')" },
        exact: {
          type: 'boolean',
          description: 'Exact title match only, no fuzzy search (default false)',
        },
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
        id: { type: 'string', description: 'Game ID from search results' },
        include_notes: { type: 'boolean', description: 'Include notes (default false)' },
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
        platform: { type: 'string', description: "Platform (e.g. 'Windows', 'Arcade')" },
        installed: { type: 'boolean', description: 'true = installed only, false = uninstalled only, omit = all' },
        favorite: { type: 'boolean', description: 'true = favorites only, false = non-favorites only, omit = all' },
        sort: {
          type: 'string',
          enum: ['title', 'dateAdded', 'lastPlayedDate', 'playTime'],
          description:
            'Sort order; default "title". dateAdded/lastPlayedDate: most recent first; playTime: most played first',
        },
        status: {
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
          description: 'Progress status (OR logic for arrays)',
        },
        limit: { type: 'integer', description: 'Max results (default 25)' },
        offset: { type: 'integer', description: 'Results to skip (default 0)' },
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
        offset: { type: 'integer', description: 'Groups to skip (default 0)' },
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
        platform: { type: 'string', description: "Platform (e.g. 'Windows', 'Arcade')" },
        installed: { type: 'boolean', description: 'true = installed only, false = uninstalled only, omit = all' },
        favorite: { type: 'boolean', description: 'true = favorites only, false = non-favorites only, omit = all' },
        status: {
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
          description: 'Progress status (OR logic for arrays)',
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
  const statusDescription = `Progress status (OR logic for arrays). Valid values: ${statusValues.join(', ')}`;
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
