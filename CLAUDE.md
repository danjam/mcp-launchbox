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
- `src/index.ts` — Entrypoint: JSON-RPC error code constants, I/O helpers (`send`, `reply`, `textReply`, `errorReply`, `error`), env var check, library loading, reload concurrency guard, request dispatch with structural validation, readline listener, stdout error handler
- `src/handlers.ts` — `matchesPlatform` helper, `createHandlers(state, reload)` factory returning `Record<ToolName, ToolHandler>`; all 7 tool handler functions (sync except `handleReloadLibrary`)
- `src/utils.ts` — Pure helpers: result constructors (`ok`, `fail`), argument validation (`parseLimit`, `asString`, `requireString`), search helpers (`fuseConfidence(score: number)`, `normaliseTitle`, `compactResult`, `sortedPlatformCounts`), response formatting (`formatPlayTime`, `emptyToNull`)
- `src/tools.ts` — Tool schema definitions with MCP annotations (`as const satisfies MCPToolDefinition[]`); derives `ToolName` union type for type-safe handler map
- `src/loader.ts` — XML parsing with `htmlEntities`, game extraction, string interning (`loadGames`); Fuse.js index building (full + per-platform + title-only variants), `gamesByTitle` (lowercase) and `gamesByNormalisedTitle` maps for fast-path lookups, `normalisingGetFn` custom Fuse getter for punctuation-normalised matching, precomputed `platformCounts` and `duplicateGroups` (`buildLibrary`); exports `FUSE_OPTIONS` and `FUSE_TITLE_ONLY_OPTIONS`
- `src/types.ts` — All type definitions: `Game`, `RequestId`, `ToolResult`, `ToolHandler`, `MCPToolAnnotations`, MCP interfaces

**Request flow:** stdin line → JSON parse → structural validation (object check) → `handleRequest` dispatches by MCP method (`initialize`, `tools/list`, `tools/call`) → `handleToolCall` looks up handler via `Object.hasOwn` → handler returns `ToolResult` → dispatch maps result to JSON-RPC response on stdout. Parse errors and invalid structures return proper JSON-RPC error codes via named constants.

**Data loading:**
- `LAUNCHBOX_PLATFORMS_PATH` points directly at the directory containing platform XML files (one file per platform)
- All XML is parsed and loaded into memory at startup (async parallel I/O)
- Games with no ID, no title, no platform, or duplicate IDs are skipped with per-game and aggregate warnings to stderr
- Non-numeric field values are counted and logged as an aggregate warning (not per-game)
- File I/O errors and XML parse errors are reported separately with distinct messages; ENOENT and ENOTDIR get helpful error messages
- XML files with non-`<LaunchBox>` root elements are warned and skipped
- In-memory index: `Map<id, Game>` for O(1) lookup, `gamesByTitle` (lowercase key) and `gamesByNormalisedTitle` (punctuation-normalised key) for fast exact matching, Fuse.js indexes for fuzzy search (full library + per-platform, keyed by lowercase platform name)
- Title-only Fuse indexes (`fuseTitleOnly`, `platformFuseTitleOnly`) used by `check_library` for fuzzy fallback — separate from the main indexes that also search Series
- Per-platform Fuse indexes avoid full-library scans when a platform filter is provided; Game objects are shared by reference across all indexes
- Fuse indexes use a custom `normalisingGetFn` that applies `normaliseTitle` at index time (dashes, colons, `&`/`and`, smart quotes → normalised form)
- Precomputed at build time: `platformCounts` (sorted) and `duplicateGroups` (cross-platform and same-platform, by `entries` count) for O(1) access
- String interning on repetitive fields (Platform, Developer, Genre, etc.) to reduce memory; cache cleared after loading
- `buildLibrary()` returns a `Library` object held in a mutable `state` ref so `reload_library` can swap it
- Concurrent `reload_library` calls coalesce (second call awaits the first)

**Tools exposed:** `search_games`, `check_library`, `get_game_details`, `list_platforms`, `find_duplicates`, `get_stats`, `reload_library`.

**Response conventions:**
- `playTime` is always `{seconds, hours}` (hours rounded to 1 decimal)
- `get_game_details` returns camelCase keys, `genres` as an array (split from semicolons), empty strings as `null`
- `search_games` and `check_library` accept an optional `exact` param to disable punctuation normalisation
- `check_library` includes `nearMisses` (up to 3 candidates with confidence 0.40–0.84) when `matches` is empty

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
