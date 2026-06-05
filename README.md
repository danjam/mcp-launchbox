# MCP LaunchBox

An [MCP](https://modelcontextprotocol.io/) server that lets AI assistants query your [LaunchBox](https://www.launchbox-app.com/) game library. Search your entire game collection across all platforms (Steam, GOG, Epic, emulators, etc.) directly from your AI assistant.

Works with Claude Desktop, Claude Code, or any MCP-compatible client.

---

## Use Cases

- Send a screenshot of a game bundle and check which ones you already own — fuzzy matching handles OCR errors and typos
- Quick lookups before buying a game on sale
- Browse your library by platform or name
- Check how much time you've spent on a game
- Find installed games you haven't played yet
- See what you're currently playing across platforms

---

## Setup

Requires [Node.js](https://nodejs.org/) 20+.

### 1. Have a LaunchBox Installation

You'll need [LaunchBox](https://www.launchbox-app.com/) installed with your game data.

### 2. Configure Your MCP Client

Add the server to your MCP client's configuration. There are two ways to do this:

**Option A: Run directly from GitHub (no install needed)**

```json
{
  "mcpServers": {
    "launchbox": {
      "command": "npx",
      "args": ["-y", "github:danjam/mcp-launchbox"],
      "env": {
        "LAUNCHBOX_PLATFORMS_PATH": "C:/LaunchBox/Data/Platforms"
      }
    }
  }
}
```

**Option B: Clone and run locally**

```bash
git clone https://github.com/danjam/mcp-launchbox.git
cd mcp-launchbox
npm install
```

Then point your MCP client at the local build:

```json
{
  "mcpServers": {
    "launchbox": {
      "command": "node",
      "args": ["/path/to/mcp-launchbox/dist/index.js"],
      "env": {
        "LAUNCHBOX_PLATFORMS_PATH": "C:/LaunchBox/Data/Platforms"
      }
    }
  }
}
```

Replace `/path/to/mcp-launchbox` with the actual path where you cloned the project.

---

## What You Can Do

### Search Games

Search the game library by title. Uses fuzzy matching across title and series fields. Punctuation (dashes, colons, `&`/`and`) is normalised before matching by default.

Confidence scale: 1.0 = perfect match, ≥0.85 = very likely, ≥0.65 = probable, <0.65 = speculative. Confidence is penalised when a query token only matches as a substring of a title token (e.g. "Doom" matching "Doomblade"). Results include `exactMatch: true` when the normalised query equals the normalised title. Use `get_game_details` for full metadata.

Tool: `search_games`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Game title or series |
| `platform` | string | No | Platform (e.g. 'Windows', 'Arcade') |
| `limit` | number | No | Max results (default 25) |
| `exact` | boolean | No | Exact title match only, no fuzzy search (default false) |

### Check Library

Check which games from a list are already in the library. Uses normalised title matching first, then fuzzy matching — only matches with confidence ≥0.85 are included to avoid false positives. When `exact` is true, only exact title matches are returned with no fuzzy or prefix fallback. When no match is found, `nearMisses` shows up to 5 close candidates for diagnostics. A nearMiss with `shorterTitle: true` (no confidence field) means a shorter version of the title exists in the library (e.g. "Behind the Frame" for query "Behind the Frame: The Finest Scenery") — search the shorter title to confirm ownership. Punctuation is normalised before matching by default.

Results do not include storefront or version info — use `get_game_details` for that.

Designed for bundle duplicate checking — pass all the titles in one call instead of searching one at a time. Omit `platform` to check across all platforms (recommended for bundles).

Tool: `check_library`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `games` | string[] | Yes | Game titles to look up |
| `platform` | string | No | Platform (e.g. 'Windows', 'Arcade') |
| `exact` | boolean | No | Exact title match only, no fuzzy search (default false) |

### Get Game Details

Get full details for a specific game by its ID. Returns all metadata in camelCase: title, platform, developer, genres (array), series, ratings (communityStarRating and starRating, both 0–5), playTime ({seconds, hours}), installed status, and more. String fields are `null` when empty/missing.

When a game has alternate versions (e.g. multiple storefronts like Steam/GOG/Epic, ROM regions, or platform ports), a `versions` array is included. Each entry has `version` (storefront name or region identifier), `installed` (boolean), and optionally `region` (normalised geographic label for ROM variants). Note: `source` only reflects the import origin of the primary entry, not all owned storefronts — check `versions` for the full picture.

Tool: `get_game_details`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Game ID from search results |
| `include_notes` | boolean | No | Include notes (default false) |

### List Games

List and filter games in the library. Unlike `search_games`, this does not do fuzzy matching — it returns games matching the specified filters, sorted and paginated. Use for browsing by platform, installed status, or favorites, and for recency queries like "what did I add this week." Returns `total` (filtered count) and `results` (compact game objects without confidence scores, but with `dateAdded` and `lastPlayedDate` timestamps).

Tool: `list_games`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `platform` | string | No | Platform (e.g. 'Windows', 'Arcade') |
| `installed` | boolean | No | true = installed only, false = uninstalled only, omit = all |
| `favorite` | boolean | No | true = favorites only, false = non-favorites only, omit = all |
| `status` | string \| string[] | No | Progress status (OR logic for arrays) |
| `sort` | string | No | Sort order; default "title". dateAdded/lastPlayedDate: most recent first; playTime: most played first |
| `limit` | number | No | Max results (default 25) |
| `offset` | number | No | Results to skip (default 0) |

### List Platforms

List all platforms in the library with their game counts. No parameters needed.

Tool: `list_platforms`

### Find Duplicates

Find duplicate game entries grouped by title — includes cross-platform and same-platform duplicates.

Tool: `find_duplicates`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | No | Optional title filter (fuzzy match) |
| `limit` | number | No | Max duplicate groups to return (default 25) |

### Random Game

Pick a random game from the library, optionally filtered. Use for "what should I play?" or "surprise me" queries. Returns a single game (same shape as `list_games` results) plus `matchPool` showing how many games matched the filters. Returns `null` game when no matches.

Tool: `random_game`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `platform` | string | No | Platform (e.g. 'Windows', 'Arcade') |
| `installed` | boolean | No | true = installed only, false = uninstalled only, omit = all |
| `favorite` | boolean | No | true = favorites only, false = non-favorites only, omit = all |
| `status` | string \| string[] | No | Progress status (OR logic for arrays) |

### Get Stats

Get library summary statistics (total games, total platforms, top 10 platforms by game count, and status counts). `statusCounts` lists all distinct progress values with their counts, sorted descending — use it to discover what free-form status values exist in the library. No parameters needed.

Tool: `get_stats`

### Reload Library

Reload all game data from disk. Use after adding or removing games in LaunchBox. Returns game/platform counts plus `added` and `removed` arrays showing what changed since the previous load (id, title, platform for each). On first load, the diff is omitted. If the set of progress/status values changes, a `notifications/tools/list_changed` notification is sent so clients can re-fetch updated tool schemas. No parameters needed.

Tool: `reload_library`

---

## License

[MIT](LICENSE)
