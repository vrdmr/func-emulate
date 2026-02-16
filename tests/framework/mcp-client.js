/**
 * MCP Test Client — JSON-RPC 2.0 over stdio for testing MCP servers.
 * Spawns a server process, sends requests, and collects responses.
 */

import { spawn } from 'node:child_process';
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FNX_BIN = resolvePath(__dirname, '..', '..', 'fnx', 'bin', 'fnx');

export class McpTestClient {
  constructor(serverProcess) {
    this._child = serverProcess || null;
    this._nextId = 1;
    this._pending = new Map();
    this._buf = '';
  }

  /** Spawn `fnx templates-mcp` and attach. */
  static spawn() {
    const child = spawn('node', [FNX_BIN, 'templates-mcp'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const client = new McpTestClient(child);
    client._attachListeners();
    return client;
  }

  _attachListeners() {
    this._child.stdout.on('data', (chunk) => {
      this._buf += chunk.toString();
      const lines = this._buf.split('\n');
      this._buf = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          const resolver = this._pending.get(msg.id);
          if (resolver) {
            this._pending.delete(msg.id);
            resolver.resolve(msg);
          }
        } catch { /* skip non-JSON lines */ }
      }
    });
  }

  /** Send a JSON-RPC request and wait for the response. */
  async send(method, params = {}, { timeout = 15000 } = {}) {
    const id = this._nextId++;
    const msg = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`MCP request timeout (${timeout}ms): ${method}`));
      }, timeout);

      this._pending.set(id, {
        resolve: (resp) => {
          clearTimeout(timer);
          resolve(resp);
        },
      });

      this._child.stdin.write(JSON.stringify(msg) + '\n');
    });
  }

  /** Send a notification (no response expected). */
  notify(method, params = {}) {
    const msg = { jsonrpc: '2.0', method, params };
    this._child.stdin.write(JSON.stringify(msg) + '\n');
  }

  /** Send initialize handshake. */
  async initialize() {
    const resp = await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '0.1' },
    });
    this.notify('notifications/initialized');
    return resp;
  }

  /** List all tools. */
  async listTools() {
    return this.send('tools/list');
  }

  /** Call a tool by name. */
  async callTool(name, args = {}) {
    return this.send('tools/call', { name, arguments: args });
  }

  /** Send a ping. */
  async ping() {
    return this.send('ping');
  }

  /** Close stdin and wait for process exit. */
  async close({ timeout = 5000 } = {}) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._child.kill('SIGTERM');
        resolve({ code: null, signal: 'SIGTERM' });
      }, timeout);

      this._child.on('exit', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });

      this._child.stdin.end();
    });
  }
}
