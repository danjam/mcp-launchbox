# mcp-launchbox

An MCP server for querying your [LaunchBox](https://www.launchbox-app.com/) game library.

Search your entire game collection across all platforms (Steam, GOG, Epic, emulators, etc.) directly from your AI assistant. No more accidentally buying games you already own.

## Features

- **Search games** — fuzzy text search across your full library, tolerant of typos and OCR errors, with confidence scores
- **Check library** — batch ownership check: pass a list of game titles and instantly see which ones you already own
- **Get game details** — full metadata plus play data (play time, play count, last played, installed, completed, progress, personal rating)
- **List platforms** — see all platforms in your library with game counts
- **Find duplicates** — discover games you own on multiple platforms
- **Library stats** — quick summary of your collection
- **Reload library** — refresh game data from disk without restarting the server

## Use Cases

- Send a screenshot of a game bundle and check which ones you already own
- Quick lookups before buying a game on sale
- Browse your library by platform or name
- Check how much time you've spent on a game
- Find installed games you haven't played yet
- See what you're currently playing across platforms

## Setup

### Prerequisites

- Node.js 18+
- A [LaunchBox](https://www.launchbox-app.com/) installation with game data

### Quick Start (no clone needed)

Add to your `.mcp.json` (Claude Code) or Claude Desktop config:

```json
{
  "mcpServers": {
    "launchbox": {
      "command": "npx",
      "args": ["-y", "github:danjam/mcp-launchbox"],
      "env": {
        "LAUNCHBOX_DATA_PATH": "/path/to/LaunchBox"
      }
    }
  }
}
```

This pulls and builds directly from GitHub — no local clone required.

### From Source

```bash
git clone https://github.com/danjam/mcp-launchbox.git
cd mcp-launchbox
npm install
```

Then configure with a local path:

```json
{
  "mcpServers": {
    "launchbox": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/mcp-launchbox",
      "env": {
        "LAUNCHBOX_DATA_PATH": "/path/to/LaunchBox"
      }
    }
  }
}
```

Set `LAUNCHBOX_DATA_PATH` to your LaunchBox root directory (the folder containing `Data/Platforms/`).

On WSL, this is typically `/mnt/d/LaunchBox` or similar.

## MCP Tools

### `search_games`

Search the game library by title. Uses fuzzy matching (Fuse.js) on Title and Series fields.

Each result includes: id, title, platform, installed status, play time, and a confidence score (0-1, higher is better). Use `get_game_details` for full metadata.

| Parameter  | Type   | Required | Description                          |
|------------|--------|----------|--------------------------------------|
| `query`    | string | yes      | Search text to match against titles  |
| `platform` | string | no       | Filter by platform name              |
| `limit`    | number | no       | Max results to return (default 25)   |

### `check_library`

Check which games from a list are already in the library. Designed for bundle duplicate checking — pass all the titles in one call instead of searching one at a time. Omit `platform` to check across all platforms (recommended for bundles).

Returns matches with confidence scores and a summary of how many you own vs. how many are new.

| Parameter  | Type     | Required | Description                                |
|------------|----------|----------|--------------------------------------------|
| `games`    | string[] | yes      | Array of game title strings to look up (1-100) |
| `platform` | string   | no       | Filter matches to a specific platform      |

### `get_game_details`

Get full details for a specific game by its ID. Returns metadata (title, platform, developer, publisher, genre, release date, series, etc.) and play data (play count, play time, last played, date added, installed, completed, progress, personal rating).

| Parameter       | Type    | Required | Description                            |
|-----------------|---------|----------|----------------------------------------|
| `id`            | string  | yes      | The game ID (UUID from search results) |
| `include_notes` | boolean | no       | Include the Notes field (default false) |

### `list_platforms`

List all platforms in the library with their game counts.

No parameters.

### `find_duplicates`

Find games owned on multiple platforms, grouped by title.

| Parameter | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| `query`   | string | no       | Optional title filter (fuzzy match)      |
| `limit`   | number | no       | Max duplicate groups to return (default 25) |

### `get_stats`

Get library summary statistics (total games, total platforms, top 10 platforms by game count).

No parameters.

### `reload_library`

Reload all game data from disk. Use after adding or removing games in LaunchBox.

No parameters.

## Development

```bash
npm run dev      # Run via tsx (live TypeScript)
npm start        # Run compiled JS
npm run build    # Compile TypeScript
npx tsc --noEmit # Type-check only
```
