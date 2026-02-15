/**
 * Test helper: sends JSON-RPC messages to `fnx templates-mcp` over stdio
 * and collects parsed responses.
 */

import { spawn } from 'node:child_process';
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FNX_BIN = resolvePath(__dirname, '..', '..', 'fnx', 'bin', 'fnx');

export const INIT_MSG = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test', version: '0.1' },
  },
};

/**
 * Spawn `fnx templates-mcp`, write JSON-RPC messages to stdin, collect responses.
 * @param {object[]} messages - JSON-RPC message objects
 * @param {number} [timeoutMs=15000] - max wait time
 * @returns {Promise<object[]>} parsed JSON-RPC responses
 */
export function mcpRequest(messages, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [FNX_BIN, 'templates-mcp'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const responses = [];
    let buf = '';

    child.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (line.trim()) {
          try { responses.push(JSON.parse(line)); } catch { /* skip */ }
        }
      }
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve(responses);
    }, timeoutMs);

    child.on('exit', () => {
      clearTimeout(timer);
      if (buf.trim()) {
        try { responses.push(JSON.parse(buf.trim())); } catch { /* skip */ }
      }
      resolve(responses);
    });

    child.on('error', reject);

    const payload = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
    child.stdin.write(payload);
    child.stdin.end();
  });
}

/** Send init + one more message, return the second response. */
export async function mcpToolCall(method, params) {
  const responses = await mcpRequest([
    INIT_MSG,
    { jsonrpc: '2.0', id: 2, method, params },
  ]);
  return responses.find((r) => r.id === 2);
}

/** Shorthand: call a tool by name and return its response. */
export async function callTool(name, args = {}) {
  return mcpToolCall('tools/call', { name, arguments: args });
}
