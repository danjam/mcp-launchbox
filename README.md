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

Requires [Node.js](https://nodejs.org/) 18+.

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

Search the game library by title. Uses fuzzy matching across title and series fields.

Each result includes: id, title, platform, installed status, play time, and a confidence score (0-1, higher is better). Use `get_game_details` for full metadata.

Tool: `search_games`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search text to match against titles and series |
| `platform` | string | No | Filter by platform name |
| `limit` | number | No | Max results to return (default 25) |

### Check Library

Check which games from a list are already in the library. Uses exact title matching first, then fuzzy matching with a 0.85 confidence threshold. Designed for bundle duplicate checking — pass all the titles in one call instead of searching one at a time. Omit `platform` to check across all platforms (recommended for bundles). Returns matches with confidence scores and a summary of how many you own vs. how many are new.

Tool: `check_library`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `games` | string[] | Yes | Array of game title strings to look up |
| `platform` | string | No | Filter matches to a specific platform |
| `limit` | number | No | Max titles to process (default 100) |

### Get Game Details

Get full details for a specific game by its ID. Returns all metadata including title, platform, developer, genre, series, ratings, and play data such as play count, play time, installed status, and more.

Tool: `get_game_details`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | The game ID (UUID from search results) |
| `include_notes` | boolean | No | Include the Notes field (default false) |

### List Platforms

List all platforms in the library with their game counts. No parameters needed.

Tool: `list_platforms`

### Find Duplicates

Find games owned on multiple platforms, grouped by title.

Tool: `find_duplicates`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | No | Optional title filter (fuzzy match) |
| `limit` | number | No | Max duplicate groups to return (default 25) |

### Get Stats

Get library summary statistics (total games, total platforms, top 10 platforms by game count). No parameters needed.

Tool: `get_stats`

### Reload Library

Reload all game data from disk. Use after adding or removing games in LaunchBox. No parameters needed.

Tool: `reload_library`

---

## License

[MIT](LICENSE)
