/**
 * Functions Debug MCP Server — stateless Streamable HTTP transport.
 * Started automatically when `fnx start` launches.
 *
 * Follows the official MCP SDK stateless pattern: a fresh McpServer + transport
 * is created per POST request, cleaned up on response close.
 * Reference: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/examples/server/src/simpleStatelessStreamableHttp.ts
 *
 * Tools:
 *   get_host_status    — host version, state, uptime, PID, SKU, worker runtime
 *   get_functions      — list of functions with trigger types and routes
 *   get_invocations    — recent invocation log (ring buffer)
 *   invoke_function    — trigger an HTTP function via its route
 *   get_app_settings   — merged config with secrets redacted
 *   get_errors         — recent host errors
 */

import { createServer as createHttpServer } from 'node:http';

// ─── Tool registration (called per session) ─────────────────────────

function registerTools(server, hostState, z) {
  server.registerTool(
    'get_host_status',
    {
      title: 'Get Host Status',
      description: `Get the current state of the running Azure Functions host.
Returns: host version, state, uptime, PID, SKU, extension bundle version, worker runtime, port.
Use this first to check if the host is healthy before querying functions or invocations.`,
      inputSchema: z.object({}),
    },
    async () => {
      const uptimeMs = Date.now() - hostState.startedAt;
      const uptimeMin = (uptimeMs / 60000).toFixed(1);
      const totalInvocations = hostState.invocations.length;
      const failedCount = hostState.invocations.filter(i => i.status !== 'Succeeded').length;

      let text = `# Host Status\n\n`;
      text += `| Property | Value |\n|---|---|\n`;
      text += `| State | ${hostState.state} |\n`;
      text += `| PID | ${hostState.pid || 'N/A'} |\n`;
      text += `| Uptime | ${uptimeMin} minutes |\n`;
      text += `| Host Version | ${hostState.hostVersion} |\n`;
      text += `| SKU | ${hostState.skuName} |\n`;
      text += `| Extension Bundle | ${hostState.extensionBundleVersion} |\n`;
      text += `| Worker Runtime | ${hostState.workerRuntime} |\n`;
      text += `| Port | ${hostState.port} |\n`;
      text += `| Base URL | ${hostState.baseUrl || 'not yet listening'} |\n`;
      text += `| Total Invocations | ${totalInvocations} |\n`;
      text += `| Failed Invocations | ${failedCount} |\n`;
      text += `| Errors | ${hostState.errors.length} |\n`;

      return { content: [{ type: 'text', text }] };
    }
  );

  server.registerTool(
    'get_functions',
    {
      title: 'Get Functions',
      description: `List all functions in the running app with trigger types, routes, and methods.
Returns HTTP functions (with route and allowed methods) and non-HTTP functions (blob, timer, queue triggers).`,
      inputSchema: z.object({}),
    },
    async () => {
      const http = hostState.httpFunctions || [];
      const nonHttp = hostState.nonHttpFunctions || [];

      if (http.length === 0 && nonHttp.length === 0) {
        return { content: [{ type: 'text', text: 'No functions discovered yet. The host may still be starting.' }] };
      }

      let text = `# Functions (${http.length + nonHttp.length} total)\n\n`;

      if (http.length > 0) {
        text += `## HTTP Functions\n\n`;
        text += `| Function | Methods | Route | URL |\n|---|---|---|---|\n`;
        for (const fn of http) {
          const url = hostState.baseUrl ? `${hostState.baseUrl}/${fn.route}` : fn.route;
          text += `| ${fn.name} | ${fn.methods} | /${fn.route} | ${url} |\n`;
        }
        text += `\n`;
      }

      if (nonHttp.length > 0) {
        text += `## Non-HTTP Functions\n\n`;
        text += `| Function | Trigger Type |\n|---|---|\n`;
        for (const fn of nonHttp) {
          text += `| ${fn.name} | ${fn.triggerType} |\n`;
        }
      }

      return { content: [{ type: 'text', text }] };
    }
  );

  server.registerTool(
    'get_invocations',
    {
      title: 'Get Invocations',
      description: `Get recent function invocations with status, duration, and trigger reason.
Filterable by function name and status. Returns newest first (up to 200 stored).`,
      inputSchema: z.object({
        functionName: z.string().optional().describe('Filter by function name'),
        status: z.string().optional().describe('Filter by status: Succeeded, Failed'),
        limit: z.number().optional().describe('Max results to return (default: 20)'),
      }),
    },
    async (args) => {
      let invocations = [...hostState.invocations].reverse();

      if (args.functionName) {
        invocations = invocations.filter(i => i.functionName === args.functionName);
      }
      if (args.status) {
        invocations = invocations.filter(i => i.status === args.status);
      }

      const limit = args.limit || 20;
      invocations = invocations.slice(0, limit);

      if (invocations.length === 0) {
        return { content: [{ type: 'text', text: 'No invocations recorded yet.' }] };
      }

      let text = `# Recent Invocations (${invocations.length})\n\n`;
      text += `| Function | Status | Duration | Reason | Time |\n|---|---|---|---|---|\n`;
      for (const inv of invocations) {
        text += `| ${inv.functionName} | ${inv.status} | ${inv.durationMs}ms | ${inv.reason} | ${inv.timestamp} |\n`;
      }

      const succeeded = hostState.invocations.filter(i => i.status === 'Succeeded').length;
      const failed = hostState.invocations.filter(i => i.status !== 'Succeeded').length;
      const avgDuration = hostState.invocations.length > 0
        ? (hostState.invocations.reduce((sum, i) => sum + i.durationMs, 0) / hostState.invocations.length).toFixed(0)
        : 0;

      text += `\n**Summary**: ${succeeded} succeeded, ${failed} failed, avg ${avgDuration}ms\n`;

      return { content: [{ type: 'text', text }] };
    }
  );

  server.registerTool(
    'invoke_function',
    {
      title: 'Invoke Function',
      description: `Invoke an HTTP function by name. Sends a request to the function's route and returns the response.
Only HTTP functions can be invoked. For non-HTTP, upload data to the trigger source (e.g., blob to storage).`,
      inputSchema: z.object({
        functionName: z.string().describe('Name of the HTTP function to invoke'),
        method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional().describe('HTTP method (default: GET)'),
        body: z.string().optional().describe('Request body (for POST/PUT)'),
        queryString: z.string().optional().describe('Query string to append (e.g., "name=World")'),
      }),
    },
    async (args) => {
      const fn = (hostState.httpFunctions || []).find(f => f.name === args.functionName);
      if (!fn) {
        const available = (hostState.httpFunctions || []).map(f => f.name).join(', ');
        return {
          content: [{ type: 'text', text: `Function "${args.functionName}" not found or not an HTTP function. Available: ${available || 'none'}` }],
          isError: true,
        };
      }

      if (!hostState.baseUrl) {
        return { content: [{ type: 'text', text: 'Host is not yet listening. Wait for startup to complete.' }], isError: true };
      }

      let url = `${hostState.baseUrl}/${fn.route}`;
      if (args.queryString) url += `?${args.queryString}`;

      const method = args.method || 'GET';
      const fetchOpts = { method };
      if (args.body && (method === 'POST' || method === 'PUT')) {
        fetchOpts.body = args.body;
        fetchOpts.headers = { 'Content-Type': 'application/json' };
      }

      try {
        const response = await fetch(url, fetchOpts);
        const responseText = await response.text();
        let text = `# Invocation Result\n\n`;
        text += `**URL**: ${method} ${url}\n`;
        text += `**Status**: ${response.status} ${response.statusText}\n\n`;
        text += `**Response**:\n\`\`\`\n${responseText}\n\`\`\`\n`;
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Failed to invoke: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'get_app_settings',
    {
      title: 'Get App Settings',
      description: `Get merged app settings (app.config.json + local.settings.json) with secrets redacted.
Shows environment variables injected into the host process.`,
      inputSchema: z.object({}),
    },
    async () => {
      const settings = hostState.appSettings || {};
      if (Object.keys(settings).length === 0) {
        return { content: [{ type: 'text', text: 'No app settings available.' }] };
      }

      let text = `# App Settings\n\n`;
      text += `| Key | Value |\n|---|---|\n`;
      for (const [key, value] of Object.entries(settings)) {
        text += `| ${key} | ${value} |\n`;
      }
      return { content: [{ type: 'text', text }] };
    }
  );

  server.registerTool(
    'get_errors',
    {
      title: 'Get Errors',
      description: `Get recent host errors and failures with timestamps.
Quick health check without digging through verbose logs.`,
      inputSchema: z.object({}),
    },
    async () => {
      if (hostState.errors.length === 0) {
        return { content: [{ type: 'text', text: '✅ No errors recorded.' }] };
      }

      let text = `# Host Errors (${hostState.errors.length})\n\n`;
      for (const err of hostState.errors.slice(-20)) {
        text += `- **${err.timestamp}**: ${err.message}\n`;
      }
      return { content: [{ type: 'text', text }] };
    }
  );
}

// ─── Start Functions Debug MCP Server (stateless) ───────────────────

export async function startLiveMcpServer(hostState, mcpPort) {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js'
  );
  const { z } = await import('zod/v4');

  // Factory: creates a fresh McpServer per request (stateless pattern)
  function getServer() {
    const server = new McpServer(
      { name: 'fnx-functions-debug', version: '0.1.0' },
      { capabilities: { logging: {} } },
    );
    registerTools(server, hostState, z);
    return server;
  }

  // ─── HTTP server with Streamable HTTP transport ─────────────────────

  const httpServer = createHttpServer(async (req, res) => {
    // CORS headers for browser-based MCP clients
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Accept');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', hostState: hostState.state }));
      return;
    }

    // MCP endpoint — stateless: new server + transport per POST
    if (req.url === '/mcp' || req.url?.startsWith('/mcp?')) {
      if (req.method === 'POST') {
        const server = getServer();
        try {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined, // stateless — no sessions
          });
          await server.connect(transport);
          await transport.handleRequest(req, res, await readBody(req));
          res.on('close', () => {
            transport.close();
            server.close();
          });
        } catch (err) {
          console.error('[MCP] Error handling request:', err.message);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32603, message: 'Internal server error' },
              id: null,
            }));
          }
        }
        return;
      }

      // GET and DELETE not supported in stateless mode
      if (req.method === 'GET' || req.method === 'DELETE') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Method not allowed.' },
          id: null,
        }));
        return;
      }

      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
      return;
    }

    // 404 for everything else
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. MCP endpoint is at /mcp' }));
  });

  return new Promise((resolve, reject) => {
    const maxRetries = 10;
    let attempt = 0;
    let port = mcpPort;

    function tryListen() {
      httpServer.once('error', onError);
      httpServer.listen(port, '127.0.0.1', () => {
        httpServer.removeListener('error', onError);
        // Runtime errors after startup
        httpServer.on('error', (err) => {
          console.error(`  ⚠️  MCP server error: ${err.message}`);
        });
        console.log(`  Functions Debug MCP Server: http://127.0.0.1:${port}/mcp`);
        resolve(httpServer);
      });
    }

    function onError(err) {
      if (err.code === 'EADDRINUSE' && attempt < maxRetries) {
        attempt++;
        port++;
        tryListen();
      } else {
        reject(err);
      }
    }

    tryListen();
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve(undefined);
      }
    });
    req.on('error', reject);
  });
}
