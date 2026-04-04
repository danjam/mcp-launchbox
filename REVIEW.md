# Code Review: mcp-launchbox

Full codebase review — 20 agents across 2 passes.

## Critical

- [x] **Missing tool annotations** — `src/tools.ts:3-86`: MCP supports `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` on tools. None of the 7 tools have annotations. `MCPToolDefinition` in `src/types.ts:37-45` also lacks the `annotations` field.

## High

- [x] **`handleToolCall` catch swallows errors silently** — `src/index.ts:65-67`: Exceptions sent to client via `errorReply` but never logged to stderr. Any runtime crash in handlers, Fuse.js, or `JSON.stringify` is invisible to server operators.
- [x] **`reload_library` exposes raw exceptions** — `src/handlers.ts:182-191`: No try/catch. Client gets raw error with no context that previous library is still active. Wrap with `fail("Reload failed: ... The previous library data is still active.")`.
- [x] **`loader.ts` entirely untested** — `extractGame` coercions, `StarRatingFloat` mapping (line 49), duplicate/missing ID handling, `ENOENT` path, `toBool`/`toNum`/`toStr` helpers. Regressions here silently corrupt game data.
- [x] **`index.ts` dispatch layer untested** — `handleRequest`, `handleToolCall`: JSON-RPC routing, error codes, `isError` flag, null-id handling, `arguments` validation. Zero coverage on the protocol contract surface.

## Medium

- [x] **No JSON-RPC structural validation** — `src/index.ts:119-121`: `JSON.parse(line)` assigned to `MCPRequest` with no runtime check. Non-object JSON (e.g. `42`, `"hello"`, `[1,2,3]`) silently disappears via `req.id == null`. Add `typeof raw !== 'object' || raw === null` guard returning `-32600 Invalid Request`.
- [x] **Unsafe state cast** — `src/index.ts:35`: `{} as { library: Library }` — `state.library` is `undefined` until `reload()` completes. Restructure: `const library = await buildLibrary(...); const state = { library };`.
- [x] **`asString` conflates "not provided" with "wrong type"** — `src/utils.ts:17-20`: Returns `undefined` for both. Requires fragile two-step guard at every call site (repeated 3 times). Should return `ToolResult` on type mismatch like `asInt` does.
- [x] **JSON-RPC error codes are magic numbers** — `src/index.ts:55,89,96,101,112,124`: `-32601`, `-32602`, `-32603`, `-32700` scattered as raw literals. Named constants would prevent typos and clarify intent.
- [x] **Wrong error code for unknown tool** — `src/index.ts:55`: Uses `-32601` (Method Not Found) but the method IS `tools/call` — the unknown entity is a tool name within params. Should be `-32602` (Invalid Params).
- [x] **`name in handlers` allows prototype keys** — `src/index.ts:54`: `in` checks the prototype chain. `__proto__`, `constructor`, `toString` bypass the unknown-tool guard. `handlers["constructor"](args)` calls `Object` as a function. Fix: `Object.hasOwn(handlers, name)`.
- [x] **No `process.stdout` error handler** — `src/index.ts:16`: Broken pipe (client disconnect) causes unhandled `EPIPE` error on stdout, crashing the process. Add `process.stdout.on('error', ...)`.
- [x] **XML with wrong root element silently returns 0 games** — `src/loader.ts:95`: A file with `<Root><Game>...</Game></Root>` instead of `<LaunchBox><Game>` parses successfully but `parsed?.LaunchBox?.Game` is undefined, returns `[]`. Entire platform silently missing with no warning.
- [x] **`check_library` limit enforcement untested** — `src/handlers.ts:47`.
- [x] **Handler type-validation paths untested** — Non-string `platform`/`query`, empty arrays, mixed-type arrays across `search_games`, `check_library`, `find_duplicates`.

## Low

### Data coercion

- [x] **`toNum` silently coerces garbage to 0** — `src/loader.ts:27-30`: Non-numeric XML values become 0 without warning. Corrupted `PlayTime` indistinguishable from "never played." Low risk given LaunchBox generates the XML, but a warning on non-empty non-numeric values would be a cheap diagnostic.

### Logic / behavior

- [x] **`fuseConfidence` called twice per result** — `src/handlers.ts:74-76`: Computed in `.filter()` and again in `.map()` for `check_library` fuzzy path. Use `.flatMap()` or intermediate variable.
- [x] **Empty-title games indexed** — `src/loader.ts:108`: Games with empty `Title` pass the ID check and enter all indexes including `gamesByTitle` under key `""`.
- [x] **`find_duplicates` has no confidence filter on fuzzy query results** — `src/handlers.ts:142-143`: When `query` is provided, all Fuse results (any confidence) feed into grouping. Low-confidence matches for unrelated games appear in output.

### Protocol

- [x] **No reload concurrency guard** — `src/index.ts:37-38`: Simultaneous `reload_library` calls both run full I/O and race to assign. Doubles peak memory.
- [x] **`ENOTDIR` gets generic error message** — `src/loader.ts:75-82`: Only `ENOENT` gets a helpful message. If `LAUNCHBOX_PLATFORMS_PATH` points to a file instead of a directory, user gets raw `Failed to read platforms directory` with no hint the path is a file.
- [x] **`error()` helper doesn't accept `null` id** — `src/index.ts:31`: Signature is `error(id: RequestId, ...)` but parse errors require `id: null`. Parse error at line 124 bypasses `error()` and calls `send()` directly. Inconsistent; a refactor to use `error(null, ...)` would be a type error.
- [x] **`fast-xml-parser` missing `htmlEntities: true`** — `src/loader.ts:85-88`: HTML entities (`&mdash;`, `&nbsp;`, `&#160;`) in XML fields stored as literal text instead of decoded characters.
- [x] **Node `>=18` is EOL** — `package.json:7`: Node 18 reached end-of-life April 2025. Bump to `>=20`.

### Test gaps

- [x] **`search_games` zero-match case untested.**
- [x] **`get_game_details` non-boolean `include_notes` untested** — `src/handlers.ts:94`: Strict `=== true` means `"true"` and `1` silently excluded.
- [x] **`requireString` failure tests never assert `ok: false`** — `test/unit.test.js:427-438`: Only check `notEqual(typeof result, 'string')`. Returning `null`, `42`, or `{}` would also pass. Should assert `result.ok === false`.
- [x] **Weak test assertions** — `test/unit.test.js:140,243`: `total >= 1` and `topPlatforms.length > 0` are too loose. Mock has exactly 2 Half-Life 2 entries and 2 platforms. Use exact values to catch regressions.
- [x] **`check_library` fuzzy test confidence bound is tautological** — `test/unit.test.js:277`: `matches.length >= 1` passes even if threshold change drops one match. Should assert exact count (2 Half-Life 2 entries should both fuzzy-match "Half-Life").
- [x] **`check_library` exact match test incomplete** — `test/unit.test.js:258-259`: Asserts `summary.owned: 1` but never checks `summary.new: 0` or `summary.total: 1`.
- [x] **`asInt` tests have redundant `typeof` assertions** — `test/unit.test.js:381,393,398`: `assert.notEqual(typeof result, 'number')` is redundant next to `result.ok === false`. Can be removed.
- [x] **`asInt("10")` behavior untested** — Numeric strings like `"10"` silently coerce to `10`. Should document whether this is intended.
- [x] **`limit: 0` / `limit: -1` rejection untested at handler level** — `asInt` unit tests cover this, but no handler-level test confirms the error propagates correctly.

### Types

- [x] **All handlers async but most don't await** — `src/handlers.ts:19,41,91,131,135,170`: Only `handleReloadLibrary` awaits. Others wrap in implicit promise. `ToolHandler` could be `() => ToolResult | Promise<ToolResult>`.

### Code quality

- [x] **`get_game_details` manually enumerates 25 Game fields** — `src/handlers.ts:99-126`: Fragile — adding a field to `Game` requires updating this list. Spread + conditional `Notes` omission would be ~3 lines.
- [x] **`includeNotes` ternary is redundant** — `src/handlers.ts:94`: `args.include_notes === undefined ? false : args.include_notes === true` simplifies to `args.include_notes === true`.
- [x] **Platform filter logic duplicated** — `src/handlers.ts:27-31,58-60,68-72`: Same `.toLowerCase() ===` in 3 places across 2 handlers. Extract `matchesPlatform` helper.
- [x] **`compactResult` missing return type annotation** — `src/utils.ts:32`: Every other exported function in utils.ts has one.

### Comments / docs

- [x] **Comment: "exact title match" is misleading** — `src/handlers.ts:54`: Lookup uses `query.toLowerCase()` — it's case-insensitive, not exact.
- [x] **Comment: Fuse score description imprecise** — `src/utils.ts:27`: Says "1 (no match)" but Fuse excludes non-matches. Should say "worst match that passed threshold." Also doesn't document `?? 0` fallback treating undefined as perfect.
- [x] **`isArray` XML parser callback unexplained** — `src/loader.ts:87`: Ensures `Game` is always an array even for single-game platform files. Non-obvious fast-xml-parser behavior; deserves a comment.
- [x] **`CONFIDENCE_THRESHOLD` rationale undocumented** — `src/handlers.ts:50`: `0.85` is a tuned value with no comment explaining the choice.
- [x] **No aggregate skip count at startup** — `src/loader.ts:108-115`: Per-game warnings for no-ID and duplicate-ID games, but no summary. "Loaded 9500 games" gives no hint that 500 were dropped.

### Efficiency

- [x] **`sortedPlatformCounts` recomputed per-request** — `src/handlers.ts:171,188`: Called by 3 handlers. Precompute in `Library` at build time for O(1) access.
- [x] **`find_duplicates` rebuilds grouping map every call** — `src/handlers.ts:141-167`: Deterministic until reload. Precompute in `Library`.
- [x] **Fuse search has no result limit** — `src/handlers.ts:27`: `fuse.search(query)` scans full index regardless of requested `limit`. Pass limit to Fuse when no platform filter.
- [x] **Startup log recomputes platform count** — `src/index.ts:45`: `new Set(games.map(...)).size` — redundant with data already in Library.

### Housekeeping

- [x] **Stale memory entry: `normalizedPlatform`** — Memory says "internal-only, excluded from get_game_details output" but the field doesn't exist anywhere in the codebase. Clean up memory.
