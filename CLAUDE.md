# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Run

```bash
npm install      # Install dependencies (also runs tsc via prepare)
npm run build    # Compile TypeScript (tsc)
npm start        # Run server (node dist/index.js)
```

Unit tests via `node:test` (built-in), linting via [Biome](https://biomejs.dev/):

```bash
npm test            # Build + run tests
npm run test:only   # Run tests without rebuilding
npm run lint        # Check for issues
npm run lint:fix    # Auto-fix issues
```

## Environment

- `LAUNCHBOX_PLATFORMS_PATH` — Required. Path to the directory containing platform XML files (e.g. `/mnt/d/LaunchBox/Data/Platforms`).

## Manual Testing

Pipe JSON-RPC messages to stdin:
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n' | LAUNCHBOX_PLATFORMS_PATH=/mnt/d/LaunchBox/Data/Platforms node dist/index.js
```

## Architecture

This is a **Model Context Protocol (MCP) server** that wraps a local LaunchBox game library. It communicates over **stdin/stdout using JSON-RPC 2.0** — there is no HTTP server or MCP SDK dependency.

**Source files:**
- `src/index.ts` — Entrypoint: I/O helpers (`send`, `reply`, `textReply`, `error`), env var check, library loading, request dispatch, readline listener
- `src/handlers.ts` — `createHandlers(state, reload)` factory returning a handler map; uses `ok`/`fail` helpers for `ToolResult`; all 7 tool handler functions
- `src/tools.ts` — Tool schema definitions (static JSON Schema data for MCP `tools/list`)
- `src/loader.ts` — XML parsing, game extraction, string interning (`loadGames`); Fuse.js index building (`buildLibrary`)
- `src/types.ts` — All type definitions: `Game`, `RequestId`, `ToolResult`, `ToolHandler`, MCP interfaces

**Request flow:** stdin line → JSON parse → `handleRequest` dispatches by MCP method (`initialize`, `tools/list`, `tools/call`) → `handleToolCall` looks up handler in map → handler returns `ToolResult` → dispatch maps result to JSON-RPC response on stdout.

**Data loading:**
- LaunchBox stores game data as XML files in `Data/Platforms/` (one file per platform)
- All XML is parsed and loaded into memory at startup (async parallel I/O)
- In-memory index: `Map<id, Game>` for O(1) lookup, Fuse.js indexes for fuzzy search
- String interning on repetitive fields (Platform, Developer, Genre, etc.) to reduce memory
- `buildLibrary()` returns a `Library` object held in a mutable `state` ref so `reload_library` can swap it

**Tools exposed:** `search_games`, `check_library`, `get_game_details`, `list_platforms`, `find_duplicates`, `get_stats`, `reload_library`.

**Key dependencies:** `fast-xml-parser` for XML parsing, `fuse.js` for fuzzy search.

## Project Config

- ES modules (`"type": "module"` in package.json)
- TypeScript strict mode (`verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`), target ES2022, module NodeNext
- Output to `dist/`, source in `src/`
- Executable as CLI via shebang (`#!/usr/bin/env node`) and `"bin"` field

## Code Style

Biome enforces: single quotes, trailing commas, 2-space indent, 120 char line width. Run `npm run lint:fix` to auto-format.

## Notes

- Fuse.js threshold is 0.3 with `ignoreLocation: true` — tuned for accurate matching with typo tolerance and no positional penalty for mid-title matches

## Gotchas

- **Import extensions**: NodeNext module resolution requires `.js` extensions in imports (e.g., `import { foo } from './bar.js'`), even though source files are `.ts`.
- **Tests are plain JS**: Test files in `test/` are `.js` and import from `../dist/`. Run `npm run build` first (or use `npm test` which builds automatically).
