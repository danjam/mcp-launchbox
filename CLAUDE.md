# CLAUDE.md

## Project

MCP server for querying a local [LaunchBox](https://www.launchbox-app.com/) game library. Exposes game search and lookup tools over stdio.

## Stack

- TypeScript (ESM, Node 18+)
- MCP SDK (`@modelcontextprotocol/sdk`) — stdio transport
- Fuse.js — fuzzy search
- fast-xml-parser — XML ingestion

## Architecture

- LaunchBox stores game data as XML files in `Data/Platforms/` (one file per platform)
- All XML is parsed and loaded into memory at startup (async parallel I/O)
- In-memory index: `Map<id, Game>` for O(1) lookup, Fuse.js index for fuzzy search
- String interning on repetitive fields (Platform, Developer, Genre, etc.) to reduce memory
- `LAUNCHBOX_DATA_PATH` env var points to the LaunchBox root directory

## MCP Tools

- `search_games` — fuzzy search on Title and Series fields, optional platform filter, configurable limit; includes confidence score, installed status, and play time per result
- `get_game_details` — full metadata lookup by game ID (UUID); includes play data (PlayCount, PlayTime, LastPlayedDate, DateAdded, Installed, Completed, Progress, StarRating); excludes `normalizedPlatform`; Notes omitted by default (opt-in via `include_notes`)
- `list_platforms` — lists all platforms with game counts
- `check_library` — batch ownership check: accepts an array of game titles and returns matches for each; exact-match fast path with fuzzy fallback at 0.85 confidence threshold; optional platform filter (omit to check all platforms)
- `find_duplicates` — finds games owned on multiple platforms, grouped by title
- `get_stats` — library summary: total games, total platforms, top 10 platforms
- `reload_library` — re-read all XML from disk and rebuild indexes without restarting

## Key Files

- `src/index.ts` — MCP server setup, tool registration, Fuse.js config
- `src/loader.ts` — XML parsing, game extraction, string interning
- `src/types.ts` — `Game` interface

## Notes

- Fuse.js threshold is 0.3 with `ignoreLocation: true` — tuned for accurate matching with typo tolerance and no positional penalty for mid-title matches

## Build & Run

- `npm run build` compiles to `dist/` — the `prepare` script runs this automatically on install
- `bin` entry points to `dist/index.js` for `npx` usage
- `npm run dev` uses tsx for development without compiling
