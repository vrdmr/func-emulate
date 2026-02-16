/**
 * E2E tests for MCP tool invocation — template and SKU tools called via
 * the full MCP server process over stdio transport.
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

describe('MCP tools E2E — template tools', { timeout: 30000 }, () => {

  test('get_languages_list returns all 4 languages', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.callTool('get_languages_list');
    assert.ok(!resp.result.isError);
    const text = resp.result.content[0].text;
    for (const lang of ['python', 'typescript', 'java', 'csharp']) {
      assert.ok(text.includes(lang), `Should mention ${lang}`);
    }
  });

  test('get_templates_list returns templates for python', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.callTool('get_templates_list', { language: 'python' });
    assert.ok(!resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('HttpTrigger'));
    assert.ok(resp.result.content[0].text.includes('Triggers'));
  });

  test('get_templates_list returns templates for typescript', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.callTool('get_templates_list', { language: 'typescript' });
    assert.ok(!resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('HttpTrigger'));
  });

  test('get_templates_list rejects invalid language', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.callTool('get_templates_list', { language: 'ruby' });
    assert.ok(resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('Invalid language'));
  });

  test('get_template returns HttpTrigger for python', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.callTool('get_template', { language: 'python', template: 'HttpTrigger' });
    assert.ok(!resp.result.isError);
    const text = resp.result.content[0].text;
    assert.ok(text.includes('Function Template: HttpTrigger'));
    assert.ok(text.includes('Function Files'));
  });

  test('get_template rejects invalid template', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.callTool('get_template', { language: 'python', template: 'FakeTrigger' });
    assert.ok(resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('Invalid template'));
  });

  test('get_project_template returns scaffolding for typescript', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.callTool('get_project_template', { language: 'typescript' });
    assert.ok(!resp.result.isError);
    const text = resp.result.content[0].text;
    assert.ok(text.includes('Project Template'));
    assert.ok(text.includes('host.json'));
  });

  test('get_project_template rejects invalid language', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.callTool('get_project_template', { language: 'rust' });
    assert.ok(resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('Invalid language'));
  });
});

describe('MCP tools E2E — SKU tools', { timeout: 30000 }, () => {

  test('get_sku_profile returns details for all known SKUs', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const skus = ['flex', 'linux-premium', 'windows-consumption', 'windows-dedicated', 'linux-consumption'];
    for (const sku of skus) {
      const resp = await client.callTool('get_sku_profile', { sku });
      assert.ok(!resp.result.isError, `Should succeed for ${sku}`);
      assert.ok(resp.result.content[0].text.includes('Host Version'));
    }
  });

  test('get_sku_profile with no sku lists all profiles', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.callTool('get_sku_profile', {});
    assert.ok(!resp.result.isError);
    const text = resp.result.content[0].text;
    assert.ok(text.includes('flex'));
    assert.ok(text.includes('linux-premium'));
    assert.ok(text.includes('windows-consumption'));
  });

  test('get_sku_profile rejects unknown SKU', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.callTool('get_sku_profile', { sku: 'nonexistent' });
    assert.ok(resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('Error'));
  });

  test('compare_skus shows differences between flex and windows-consumption', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.callTool('compare_skus', { sku1: 'flex', sku2: 'windows-consumption' });
    assert.ok(!resp.result.isError);
    const text = resp.result.content[0].text;
    assert.ok(text.includes('SKU Comparison'));
    assert.ok(text.includes('Key Differences'));
  });

  test('compare_skus with identical SKUs shows no differences', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.callTool('compare_skus', { sku1: 'flex', sku2: 'flex' });
    assert.ok(!resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('identical'));
  });

  test('compare_skus rejects unknown SKU', async () => {
    client = McpTestClient.spawn();
    await client.initialize();
    const resp = await client.callTool('compare_skus', { sku1: 'flex', sku2: 'fake-sku' });
    assert.ok(resp.result.isError);
  });
});
