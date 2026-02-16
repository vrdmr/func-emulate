/**
 * Hand-rolled JSON-RPC 2.0 MCP server over stdio.
 * Zero npm dependencies — uses only Node.js builtins.
 *
 * Supports: initialize, notifications/initialized, tools/list, tools/call, ping
 */

import { createInterface } from 'node:readline';

const PROTOCOL_VERSION = '2024-11-05';

/**
 * Creates and runs an MCP server over stdio.
 *
 * @param {object} opts
 * @param {string} opts.name - Server name
 * @param {string} opts.version - Server version
 * @param {Array<{name: string, description: string, inputSchema: object, handler: function}>} opts.tools - Tool definitions
 */
export async function runStdioMcpServer({ name, version, tools }) {
  const toolMap = new Map();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  function sendResponse(response) {
    const json = JSON.stringify(response);
    return new Promise((resolve) => {
      process.stdout.write(json + '\n', resolve);
    });
  }

  // Track pending async tool calls so we don't exit before they complete
  const pending = new Set();

  function handleMessage(msg) {
    // Notifications have no id — no response needed
    if (msg.id === undefined || msg.id === null) {
      return; // e.g. notifications/initialized
    }

    const { id, method, params } = msg;

    if (method === 'initialize') {
      sendResponse({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name, version },
        },
      });
      return;
    }

    if (method === 'ping') {
      sendResponse({ jsonrpc: '2.0', id, result: {} });
      return;
    }

    if (method === 'tools/list') {
      const toolList = tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
      }));
      sendResponse({ jsonrpc: '2.0', id, result: { tools: toolList } });
      return;
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      const tool = toolMap.get(toolName);

      if (!tool) {
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
            isError: true,
          },
        });
        return;
      }

      // Call handler async, track the promise
      const p = Promise.resolve(tool.handler(toolArgs))
        .then((result) => {
          sendResponse({ jsonrpc: '2.0', id, result });
        })
        .catch((err) => {
          sendResponse({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: `Tool error: ${err.message}` }],
              isError: true,
            },
          });
        })
        .finally(() => pending.delete(p));
      pending.add(p);
      return;
    }

    // Unknown method
    sendResponse({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  }

  // Read newline-delimited JSON from stdin
  const rl = createInterface({ input: process.stdin });
  let stdinClosed = false;

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const msg = JSON.parse(trimmed);
      handleMessage(msg);
    } catch (err) {
      process.stderr.write(`[MCP] Parse error: ${err.message}\n`);
    }
  });

  rl.on('close', async () => {
    stdinClosed = true;
    // Wait for any in-flight tool calls to complete before exiting
    if (pending.size > 0) {
      await Promise.allSettled([...pending]);
    }
    process.exit(0);
  });

  // Handle signals gracefully
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}
