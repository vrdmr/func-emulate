/**
 * Tests for the MCP JSON-RPC protocol layer: initialize, tools/list, ping,
 * notifications, unknown methods, unknown tools.
 */

import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mcpRequest, mcpToolCall, INIT_MSG } from './helpers.js';

describe('MCP protocol — JSON-RPC basics', () => {

  test('initialize returns server info and protocol version', async () => {
    const [resp] = await mcpRequest([INIT_MSG]);
    assert.equal(resp.jsonrpc, '2.0');
    assert.equal(resp.id, 1);
    assert.equal(resp.result.protocolVersion, '2024-11-05');
    assert.equal(resp.result.serverInfo.name, 'fnx-templates-mcp');
    assert.equal(resp.result.serverInfo.version, '0.1.0');
    assert.ok(resp.result.capabilities.tools, 'Should advertise tools capability');
  });

  test('tools/list returns all 6 tools with schemas', async () => {
    const resp = await mcpToolCall('tools/list', {});
    assert.ok(resp, 'Should have response');

    const toolNames = resp.result.tools.map((t) => t.name).sort();
    assert.deepEqual(toolNames, [
      'compare_skus',
      'get_languages_list',
      'get_project_template',
      'get_sku_profile',
      'get_template',
      'get_templates_list',
    ]);

    for (const tool of resp.result.tools) {
      assert.ok(tool.name, 'Tool must have name');
      assert.ok(tool.description, `${tool.name} must have description`);
      assert.ok(tool.inputSchema, `${tool.name} must have inputSchema`);
    }
  });

  test('ping returns empty result', async () => {
    const resp = await mcpToolCall('ping', {});
    assert.ok(resp);
    assert.deepEqual(resp.result, {});
  });

  test('notification (no id) produces no response', async () => {
    const responses = await mcpRequest([
      INIT_MSG,
      { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
    ]);
    assert.equal(responses.length, 1, 'Only initialize should produce a response');
    assert.equal(responses[0].id, 1);
  });

  test('unknown method returns -32601 error', async () => {
    const resp = await mcpToolCall('resources/list', {});
    assert.ok(resp);
    assert.ok(resp.error, 'Should have error field');
    assert.equal(resp.error.code, -32601);
  });

  test('unknown tool returns isError result', async () => {
    const responses = await mcpRequest([
      INIT_MSG,
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'nonexistent', arguments: {} } },
    ]);
    const resp = responses.find((r) => r.id === 2);
    assert.ok(resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('Unknown tool'));
  });
});
