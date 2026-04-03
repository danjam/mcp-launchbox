#!/usr/bin/env node
import { createInterface } from 'node:readline';

import { createHandlers } from './handlers.js';
import { buildLibrary, type Library } from './loader.js';
import { type ToolName, tools } from './tools.js';
import type { MCPRequest, MCPResponse, RequestId } from './types.js';

const PARSE_ERROR = -32700;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const platformsPath = process.env.LAUNCHBOX_PLATFORMS_PATH;
if (!platformsPath) {
  console.error('LAUNCHBOX_PLATFORMS_PATH environment variable is required');
  process.exit(1);
}

function send(msg: MCPResponse): void {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function reply(id: RequestId, result: unknown): void {
  send({ jsonrpc: '2.0', id, result });
}

function textReply(id: RequestId, text: string): void {
  reply(id, { content: [{ type: 'text', text }] });
}

function errorReply(id: RequestId, text: string): void {
  reply(id, { content: [{ type: 'text', text }], isError: true });
}

function error(id: RequestId, code: number, message: string): void {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

console.error(`Loading games from ${platformsPath}...`);
let library: Library;
try {
  library = await buildLibrary(platformsPath!);
  console.error(`Loaded ${library.games.length} games across ${new Set(library.games.map((g) => g.Platform)).size} platforms`);
} catch (e) {
  console.error(`Failed to load games: ${e}`);
  process.exit(1);
}

const state = { library };

async function reload(): Promise<void> {
  state.library = await buildLibrary(platformsPath!);
}

const handlers = createHandlers(state, reload);

async function handleToolCall(id: RequestId, name: string, args: Record<string, unknown>): Promise<void> {
  if (!Object.hasOwn(handlers, name)) {
    error(id, INVALID_PARAMS, `Unknown tool: ${name}`);
    return;
  }
  try {
    const result = await handlers[name as ToolName](args);
    if (result.ok) {
      textReply(id, result.text);
    } else {
      errorReply(id, result.message);
    }
  } catch (e) {
    console.error(`Error in tool handler ${name}:`, e);
    errorReply(id, e instanceof Error ? e.message : 'Internal error');
  }
}

function handleRequest(req: MCPRequest): void {
  if (req.id == null) return;
  const id = req.id;

  switch (req.method) {
    case 'initialize':
      reply(id, {
        protocolVersion: '2025-11-25',
        serverInfo: { name: 'mcp-launchbox', version: '1.0.0' },
        capabilities: { tools: {} },
        instructions:
          'Search and browse a local LaunchBox game library. Use when looking up games, checking platform collections, finding duplicates, or getting library statistics.',
      });
      break;
    case 'tools/list':
      reply(id, { tools });
      break;
    case 'tools/call': {
      const name = req.params?.name;
      if (typeof name !== 'string') {
        error(id, INVALID_PARAMS, 'Missing required parameter: name');
        break;
      }
      const rawArgs = req.params?.arguments ?? {};
      if (typeof rawArgs !== 'object' || rawArgs === null || Array.isArray(rawArgs)) {
        error(id, INVALID_PARAMS, 'Invalid parameter: arguments must be an object');
        break;
      }
      handleToolCall(id, name, rawArgs as Record<string, unknown>).catch((e) => {
        console.error(`Unhandled error in tool call ${name}:`, e);
        try {
          error(id, INTERNAL_ERROR, 'Internal error');
        } catch (writeErr) {
          console.error(`Failed to write error response for tool call ${name}:`, writeErr);
        }
      });
      break;
    }
    case 'ping':
      reply(id, {});
      break;
    default:
      error(id, METHOD_NOT_FOUND, 'Method not found');
  }
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', function handleLine(line: string): void {
  if (!line.trim()) return;
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch (e) {
    console.error(`Failed to parse JSON-RPC message: ${e}`);
    send({ jsonrpc: '2.0', id: null, error: { code: PARSE_ERROR, message: 'Parse error' } });
    return;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    send({ jsonrpc: '2.0', id: null, error: { code: INVALID_PARAMS, message: 'Invalid Request: expected JSON object' } });
    return;
  }
  handleRequest(raw as MCPRequest);
});
