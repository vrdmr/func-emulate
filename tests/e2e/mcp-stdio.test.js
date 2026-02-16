/**
 * E2E tests for MCP stdio transport — JSON-RPC roundtrip, concurrent calls,
 * graceful shutdown, and error handling over the stdio transport.
 */

import { describe, test, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { McpTestClient } from '../framework/mcp-client.js';

let client;

afterEach(async () => {
  if (client) {
    await client.close({ timeout: 3000 }).catch(() => {});
    client = null;
  }
});

describe('MCP stdio — initialize handshake', { timeout: 30000 }, () => {

  test('initialize returns server info and protocol version', async () => {
    client = McpTestClient.spawn();
    const resp = await client.initialize();
    assert.strictEqual(resp.jsonrpc, '2.0');
    assert.strictEqual(resp.result.protocolVersion, '2024-11-05');
    assert.strictEqual(resp.result.serverInfo.name, 'fnx-templates-mcp');
    assert.strictEqual(resp.result.serverInfo.version, '0.1.0');
    assert.ok(resp.result.capabilities.tools, 'Should advertise tools capability');
  });

  test('ping responds after initialize', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.ping();
    assert.deepStrictEqual(resp.result, {});
  });
});

describe('MCP stdio — tools/list', { timeout: 30000 }, () => {

  test('lists all 6 tools with correct names', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.listTools();
    const names = resp.result.tools.map(t => t.name).sort();
    assert.deepStrictEqual(names, [
      'compare_skus',
      'get_languages_list',
      'get_project_template',
      'get_sku_profile',
      'get_template',
      'get_templates_list',
    ]);
  });

  test('every tool has name, description, and inputSchema', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.listTools();
    for (const tool of resp.result.tools) {
      assert.ok(tool.name, 'Tool must have name');
      assert.ok(tool.description, `${tool.name} must have description`);
      assert.ok(tool.inputSchema, `${tool.name} must have inputSchema`);
    }
  });
});

describe('MCP stdio — tool invocation', { timeout: 30000 }, () => {

  test('get_languages_list returns languages', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.callTool('get_languages_list');
    assert.ok(!resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('Azure Functions'));
  });

  test('get_sku_profile returns flex details', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.callTool('get_sku_profile', { sku: 'flex' });
    assert.ok(!resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('Flex Consumption'));
  });

  test('unknown tool returns isError', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.callTool('nonexistent_tool');
    assert.ok(resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('Unknown tool'));
  });
});

describe('MCP stdio — error handling', { timeout: 30000 }, () => {

  test('unknown method returns -32601 error code', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.send('resources/list');
    assert.ok(resp.error);
    assert.strictEqual(resp.error.code, -32601);
  });

  test('invalid tool params return error result (not crash)', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.callTool('get_template', { language: 'invalid', template: 'invalid' });
    assert.ok(resp.result.isError);
  });
});

describe('MCP stdio — concurrent calls', { timeout: 30000 }, () => {

  test('multiple simultaneous requests produce correct responses', async () => {
    client = McpTestClient.spawn();
    await client.initialize();

    // Fire 3 calls concurrently
    const [r1, r2, r3] = await Promise.all([
      client.callTool('get_languages_list'),
      client.callTool('get_sku_profile', { sku: 'flex' }),
      client.ping(),
    ]);

    assert.ok(!r1.result.isError, 'get_languages_list should succeed');
    assert.ok(!r2.result.isError, 'get_sku_profile should succeed');
    assert.deepStrictEqual(r3.result, {}, 'ping should return empty');
  });
});

describe('MCP stdio — graceful shutdown', { timeout: 30000 }, () => {

  test('server exits cleanly when stdin is closed', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const { code } = await client.close({ timeout: 5000 });
    assert.strictEqual(code, 0, 'Should exit with code 0');
    client = null; // Already closed
  });
});
