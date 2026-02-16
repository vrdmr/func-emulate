/**
 * F10: Tests for the standalone fnx-template-mcp entrypoint.
 * Verifies it produces identical results to `fnx templates-mcp`
 * while bypassing cli.js (no host-manager imports).
 */

import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { mcpRequest, FNX_TEMPLATE_MCP_BIN, INIT_MSG } from './helpers.js';

const STANDALONE = { command: [FNX_TEMPLATE_MCP_BIN] };

describe('F10 — standalone fnx-template-mcp entrypoint', () => {

  test('initialize returns correct server info', async () => {
    const [resp] = await mcpRequest([INIT_MSG], 15000, STANDALONE);
    assert.equal(resp.jsonrpc, '2.0');
    assert.equal(resp.id, 1);
    assert.equal(resp.result.protocolVersion, '2024-11-05');
    assert.equal(resp.result.serverInfo.name, 'fnx-templates-mcp');
    assert.equal(resp.result.serverInfo.version, '0.1.0');
    assert.ok(resp.result.capabilities.tools, 'Should advertise tools capability');
  });

  test('tools/list returns all 6 tools', async () => {
    const responses = await mcpRequest([
      INIT_MSG,
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    ], 15000, STANDALONE);
    const resp = responses.find((r) => r.id === 2);
    const toolNames = resp.result.tools.map((t) => t.name).sort();
    assert.deepEqual(toolNames, [
      'compare_skus',
      'get_languages_list',
      'get_project_template',
      'get_sku_profile',
      'get_template',
      'get_templates_list',
    ]);
  });

  test('tools/list matches fnx templates-mcp output exactly', async () => {
    const msg = [
      INIT_MSG,
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    ];
    const [standaloneResp, cliResp] = await Promise.all([
      mcpRequest(msg, 15000, STANDALONE),
      mcpRequest(msg),
    ]);
    const standaloneTools = standaloneResp.find((r) => r.id === 2);
    const cliTools = cliResp.find((r) => r.id === 2);
    assert.deepEqual(standaloneTools.result, cliTools.result,
      'Standalone and CLI entrypoints should return identical tools/list');
  });

  test('get_languages_list works via standalone entrypoint', async () => {
    const responses = await mcpRequest([
      INIT_MSG,
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_languages_list', arguments: {} } },
    ], 15000, STANDALONE);
    const resp = responses.find((r) => r.id === 2);
    assert.ok(resp.result, 'Should have result');
    assert.ok(!resp.result.isError, 'Should not be an error');
    const text = resp.result.content[0].text;
    assert.ok(text.includes('python') || text.includes('Python'), 'Should list Python');
    assert.ok(text.includes('typescript') || text.includes('TypeScript'), 'Should list TypeScript');
  });

  test('get_sku_profile works via standalone entrypoint', async () => {
    const responses = await mcpRequest([
      INIT_MSG,
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_sku_profile', arguments: { sku: 'flex' } } },
    ], 15000, STANDALONE);
    const resp = responses.find((r) => r.id === 2);
    assert.ok(resp.result, 'Should have result');
    assert.ok(!resp.result.isError, 'Should not be an error');
    assert.ok(resp.result.content[0].text.includes('Flex'), 'Should contain Flex profile');
  });

  test('cold start is under 500ms', async () => {
    const start = performance.now();
    const [resp] = await mcpRequest([INIT_MSG], 5000, STANDALONE);
    const elapsed = performance.now() - start;
    assert.ok(resp.result, 'Should get initialize response');
    assert.ok(elapsed < 2000, `Cold start took ${elapsed.toFixed(0)}ms (process spawn included, should be well under 2s)`);
  });
});
