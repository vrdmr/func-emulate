#!/usr/bin/env node

/**
 * Azure Functions Templates MCP Server - Entry Point
 */

// Check Node.js version before any other imports
const nodeVersion = parseInt(process.versions.node.split('.')[0], 10);
if (nodeVersion < 18) {
  console.error(`Error: Node.js 18 or higher is required. Current version: ${process.versions.node}`);
  process.exit(1);
}

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer, validateTemplates, logValidationResult } from './server-factory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = path.resolve(__dirname, '..', '..', 'templates');

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');

async function main() {
  // Validate templates exist before starting server
  const verbose = process.env.MCP_VERBOSE === 'true' || process.env.MCP_VERBOSE === '1';
  const validationResult = await validateTemplates(TEMPLATES_ROOT, verbose);
  logValidationResult(validationResult);

  // Create and configure the server
  const server = createServer({
    name: packageJson.name,
    version: packageJson.version,
    templatesRoot: TEMPLATES_ROOT,
  });

  // Connect to transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    console.error(`[INFO] Received ${signal}, shutting down gracefully...`);
    try {
      await server.close();
      console.error('[INFO] Server closed successfully');
      process.exit(0);
    } catch (err) {
      console.error('[ERROR] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  // Write errors to stderr only. Never write to stdout in stdio servers.
  console.error('[FATAL] Server failed to start');
  if (err instanceof Error) {
    console.error(`[FATAL] ${err.name}: ${err.message}`);
    if (err.stack) {
      console.error(err.stack);
    }
  } else {
    console.error('[FATAL] Unknown error:', err);
  }
  process.exit(1);
});
