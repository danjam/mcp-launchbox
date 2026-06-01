import type { MCPToolDefinition } from './types.js';

export const tools = [
  {
    name: 'search_games',
    description:
      'Search the LaunchBox game library by title and series. Confidence scale: 1.0 = perfect, ≥0.85 = very likely, ≥0.65 = probable, <0.65 = speculative. Use id from results to call get_game_details for full metadata.',
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
      'Check which games from a list are already in the library. Only matches with confidence ≥0.85 are included to avoid false positives. When matches is empty, nearMisses shows up to 5 close candidates for diagnostics. A nearMiss with confidence 0 means a shorter version of the title exists in the library (e.g. "Behind the Frame" for query "Behind the Frame: The Finest Scenery") — search the head title (everything before the colon/subtitle) to confirm ownership. Results do not include storefront or version info — use get_game_details for that. Designed for bundle duplicate checking — replaces calling search_games per title. Omit platform to check across all platforms (recommended for bundles).',
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
      'Get full details for a specific game by ID. Rating scales: communityStarRating and starRating are both 0–5. progress is a free-form string from LaunchBox (e.g. "Not Started / Unplayed", "Completed"). versions lists alternate versions when present (e.g. storefronts like Steam/GOG/Epic, ROM regions, or platform ports) — source only reflects the import origin of the primary entry, not all owned storefronts.',
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
    description:
      'List all platforms in the library with their game counts. Platform names returned here are the exact values to use for the platform filter in search_games.',
    inputSchema: {
      type: 'object',
      properties: {},
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
    description: 'Get library summary statistics: total games, total platforms, and top 10 platforms by game count.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'reload_library',
    description: 'Reload the game library from disk. Use after adding or removing games in LaunchBox.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
] as const satisfies MCPToolDefinition[];

export type ToolName = (typeof tools)[number]['name'];
