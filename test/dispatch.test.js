import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

function gameXml(games) {
  const entries = games
    .map(
      (g) => `<Game>
      ${Object.entries(g)
        .map(([k, v]) => `<${k}>${v}</${k}>`)
        .join('\n      ')}
    </Game>`,
    )
    .join('\n  ');
  return `<?xml version="1.0"?>\n<LaunchBox>\n  ${entries}\n</LaunchBox>`;
}

let dir;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lb-dispatch-'));
  await writeFile(
    join(dir, 'Test.xml'),
    gameXml([
      { ID: 'a1', Title: 'TestGame', Platform: 'Windows' },
      { ID: 'a2', Title: 'Portal', Platform: 'Windows' },
    ]),
  );
});

afterEach(async () => {
  await rm(dir, { recursive: true });
});

function startServer() {
  const child = spawn('node', [join(import.meta.dirname, '..', 'dist', 'index.js')], {
    env: { ...process.env, LAUNCHBOX_PLATFORMS_PATH: dir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutBuf = '';
  const responses = [];
  let resolveWaiter = null;

  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString();
    let newlineIdx;
    while ((newlineIdx = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, newlineIdx);
      stdoutBuf = stdoutBuf.slice(newlineIdx + 1);
      if (line.trim()) {
        responses.push(JSON.parse(line));
        if (resolveWaiter) {
          resolveWaiter();
          resolveWaiter = null;
        }
      }
    }
  });

  // Wait for the server to finish loading (stderr message)
  const ready = new Promise((resolve) => {
    let stderrBuf = '';
    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      if (stderrBuf.includes('Loaded')) resolve();
    });
  });

  function send(msg) {
    child.stdin.write(JSON.stringify(msg) + '\n');
  }

  async function nextResponse() {
    if (responses.length > 0) return responses.shift();
    return new Promise((resolve) => {
      resolveWaiter = () => resolve(responses.shift());
    });
  }

  function close() {
    child.stdin.end();
    return new Promise((resolve) => child.on('close', resolve));
  }

  return { ready, send, nextResponse, close, child };
}

describe('dispatch', () => {
  it('responds to initialize', async () => {
    const srv = startServer();
    await srv.ready;
    srv.send({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    const res = await srv.nextResponse();
    assert.equal(res.id, 1);
    assert.equal(res.result.protocolVersion, '2025-11-25');
    assert.equal(res.result.serverInfo.name, 'mcp-launchbox');
    await srv.close();
  });

  it('responds to tools/list', async () => {
    const srv = startServer();
    await srv.ready;
    srv.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const res = await srv.nextResponse();
    assert.equal(res.id, 2);
    assert.ok(Array.isArray(res.result.tools));
    assert.ok(res.result.tools.length >= 7);
    await srv.close();
  });

  it('responds to ping', async () => {
    const srv = startServer();
    await srv.ready;
    srv.send({ jsonrpc: '2.0', id: 3, method: 'ping' });
    const res = await srv.nextResponse();
    assert.equal(res.id, 3);
    assert.deepEqual(res.result, {});
    await srv.close();
  });

  it('returns -32601 for unknown method', async () => {
    const srv = startServer();
    await srv.ready;
    srv.send({ jsonrpc: '2.0', id: 4, method: 'nonexistent/method' });
    const res = await srv.nextResponse();
    assert.equal(res.id, 4);
    assert.equal(res.error.code, -32601);
    await srv.close();
  });

  it('returns -32602 for tools/call with missing name', async () => {
    const srv = startServer();
    await srv.ready;
    srv.send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: {} });
    const res = await srv.nextResponse();
    assert.equal(res.id, 5);
    assert.equal(res.error.code, -32602);
    await srv.close();
  });

  it('returns -32602 for tools/call with invalid arguments', async () => {
    const srv = startServer();
    await srv.ready;
    srv.send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_stats', arguments: 'bad' } });
    const res = await srv.nextResponse();
    assert.equal(res.id, 6);
    assert.equal(res.error.code, -32602);
    await srv.close();
  });

  it('returns error for unknown tool name', async () => {
    const srv = startServer();
    await srv.ready;
    srv.send({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'nonexistent_tool' } });
    const res = await srv.nextResponse();
    assert.equal(res.id, 7);
    assert.ok(res.error);
    assert.match(res.error.message, /Unknown tool/);
    await srv.close();
  });

  it('executes a tool call successfully', async () => {
    const srv = startServer();
    await srv.ready;
    srv.send({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'get_stats' } });
    const res = await srv.nextResponse();
    assert.equal(res.id, 8);
    assert.ok(res.result);
    const text = res.result.content[0].text;
    const stats = JSON.parse(text);
    assert.equal(stats.totalGames, 2);
    await srv.close();
  });

  it('returns isError for tool returning fail result', async () => {
    const srv = startServer();
    await srv.ready;
    srv.send({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'get_game_details', arguments: { id: 'nonexistent' } },
    });
    const res = await srv.nextResponse();
    assert.equal(res.id, 9);
    assert.equal(res.result.isError, true);
    await srv.close();
  });

  it('returns -32700 for invalid JSON', async () => {
    const srv = startServer();
    await srv.ready;
    srv.child.stdin.write('not json at all\n');
    const res = await srv.nextResponse();
    assert.equal(res.id, null);
    assert.equal(res.error.code, -32700);
    await srv.close();
  });

  it('silently drops requests with no id', async () => {
    const srv = startServer();
    await srv.ready;
    // notification (no id) — should not produce a response
    srv.send({ jsonrpc: '2.0', method: 'ping' });
    // follow up with a real request to prove the server is still alive
    srv.send({ jsonrpc: '2.0', id: 10, method: 'ping' });
    const res = await srv.nextResponse();
    assert.equal(res.id, 10);
    await srv.close();
  });
});
