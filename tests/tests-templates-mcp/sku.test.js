/**
 * Tests for the 2 SKU tools: get_sku_profile, compare_skus.
 */

import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { callTool } from './helpers.js';

describe('MCP SKU tools', () => {

  test('get_sku_profile returns flex profile details', async () => {
    const resp = await callTool('get_sku_profile', { sku: 'flex' });
    assert.ok(!resp.result.isError);

    const text = resp.result.content[0].text;
    assert.ok(text.includes('Flex Consumption'));
    assert.ok(text.includes('Host Version'));
    assert.ok(text.includes('Extension Bundle'));
  });

  test('get_sku_profile returns windows-consumption profile', async () => {
    const resp = await callTool('get_sku_profile', { sku: 'windows-consumption' });
    assert.ok(!resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('Windows Consumption'));
  });

  test('get_sku_profile with no sku lists all profiles', async () => {
    const resp = await callTool('get_sku_profile', {});
    assert.ok(!resp.result.isError);

    const text = resp.result.content[0].text;
    assert.ok(text.includes('SKU Profiles'));
    assert.ok(text.includes('flex'));
    assert.ok(text.includes('linux-premium'));
    assert.ok(text.includes('windows-consumption'));
    assert.ok(text.includes('windows-dedicated'));
    assert.ok(text.includes('linux-consumption'));
  });

  test('get_sku_profile rejects unknown SKU', async () => {
    const resp = await callTool('get_sku_profile', { sku: 'nonexistent-sku' });
    assert.ok(resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('Error'));
  });

  test('compare_skus shows differences between flex and windows-consumption', async () => {
    const resp = await callTool('compare_skus', { sku1: 'flex', sku2: 'windows-consumption' });
    assert.ok(!resp.result.isError);

    const text = resp.result.content[0].text;
    assert.ok(text.includes('SKU Comparison'));
    assert.ok(text.includes('Flex Consumption'));
    assert.ok(text.includes('Windows Consumption'));
    assert.ok(text.includes('Key Differences'), 'Should show differences (different host versions)');
    assert.ok(text.includes('Host version differs'));
  });

  test('compare_skus with identical SKUs shows no differences', async () => {
    const resp = await callTool('compare_skus', { sku1: 'flex', sku2: 'flex' });
    assert.ok(!resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('identical'));
  });

  test('compare_skus rejects unknown SKU', async () => {
    const resp = await callTool('compare_skus', { sku1: 'flex', sku2: 'fake-sku' });
    assert.ok(resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('Error'));
  });
});
