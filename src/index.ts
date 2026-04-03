#!/usr/bin/env node
import { createInterface } from 'node:readline';

import { createHandlers } from './handlers.js';
import { buildLibrary, type Library } from './loader.js';
import { type ToolName, tools } from './tools.js';
import type { MCPRequest, MCPResponse, RequestId } from './types.js';

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

const state: { library: Library } = {} as { library: Library };

async function reload(): Promise<void> {
  state.library = await buildLibrary(platformsPath!);
}

console.error(`Loading games from ${platformsPath}...`);
try {
  await reload();
  const { games } = state.library;
  console.error(`Loaded ${games.length} games across ${new Set(games.map((g) => g.Platform)).size} platforms`);
} catch (e) {
  console.error(`Failed to load games: ${e}`);
  process.exit(1);
}

const handlers = createHandlers(state, reload);

async function handleToolCall(id: RequestId, name: string, args: Record<string, unknown>): Promise<void> {
  if (!(name in handlers)) {
    error(id, -32601, `Unknown tool: ${name}`);
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
        error(id, -32602, 'Missing required parameter: name');
        break;
      }
      const rawArgs = req.params?.arguments ?? {};
      if (typeof rawArgs !== 'object' || rawArgs === null || Array.isArray(rawArgs)) {
        error(id, -32602, 'Invalid parameter: arguments must be an object');
        break;
      }
      handleToolCall(id, name, rawArgs as Record<string, unknown>).catch((e) => {
        console.error(`Unhandled error in tool call ${name}:`, e);
        try {
          error(id, -32603, 'Internal error');
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
      error(id, -32601, 'Method not found');
  }
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', function handleLine(line: string): void {
  if (!line.trim()) return;
  let req: MCPRequest;
  try {
    req = JSON.parse(line);
  } catch (e) {
    console.error(`Failed to parse JSON-RPC message: ${e}`);
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  handleRequest(req);
});
