import { describe, test, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { getFlag, readJsonFile } from '../../fnx/lib/cli.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Config layering — getFlag', () => {

  test('returns value for a flag that exists', () => {
    assert.strictEqual(getFlag(['start', '--sku', 'flex', '--port', '8080'], '--sku'), 'flex');
    assert.strictEqual(getFlag(['start', '--sku', 'flex', '--port', '8080'], '--port'), '8080');
  });

  test('returns null for a flag that does not exist', () => {
    assert.strictEqual(getFlag(['start', '--port', '8080'], '--sku'), null);
  });

  test('returns null for a flag at the end with no value', () => {
    assert.strictEqual(getFlag(['start', '--sku'], '--sku'), null);
  });

  test('returns first match when flag appears multiple times', () => {
    assert.strictEqual(getFlag(['start', '--sku', 'flex', '--sku', 'premium'], '--sku'), 'flex');
  });

  test('handles empty args array', () => {
    assert.strictEqual(getFlag([], '--sku'), null);
  });

  test('does not return values for unrelated flags', () => {
    assert.strictEqual(getFlag(['start', '--port', '7071'], '--sku'), null);
  });
});

describe('Config layering — readJsonFile', () => {

  let tmpDir;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `fnx-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
  });

  test('reads and parses valid JSON file', async () => {
    const filePath = join(tmpDir, 'test.json');
    await writeFile(filePath, JSON.stringify({ key: 'value' }));
    const result = await readJsonFile(filePath);
    assert.deepStrictEqual(result, { key: 'value' });
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('returns null for non-existent file', async () => {
    const result = await readJsonFile(join(tmpDir, 'does-not-exist.json'));
    assert.strictEqual(result, null);
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('returns null for invalid JSON', async () => {
    const filePath = join(tmpDir, 'bad.json');
    await writeFile(filePath, 'not json at all {{{');
    const result = await readJsonFile(filePath);
    assert.strictEqual(result, null);
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('reads nested JSON structures', async () => {
    const filePath = join(tmpDir, 'nested.json');
    const data = { TargetSku: 'flex', Values: { FUNCTIONS_WORKER_RUNTIME: 'node' } };
    await writeFile(filePath, JSON.stringify(data));
    const result = await readJsonFile(filePath);
    assert.deepStrictEqual(result, data);
    assert.strictEqual(result.Values.FUNCTIONS_WORKER_RUNTIME, 'node');
    await rm(tmpDir, { recursive: true, force: true });
  });
});

describe('Config layering — SKU resolution precedence', () => {

  test('CLI flag --sku takes highest priority', () => {
    // Simulate the resolution logic from cli.js
    const args = ['start', '--sku', 'linux-premium'];
    const appConfig = { TargetSku: 'flex' };
    const localSettings = { TargetSku: 'windows-consumption' };

    let sku = getFlag(args, '--sku');
    let skuSource = 'CLI flag';

    if (!sku && appConfig?.TargetSku) {
      sku = appConfig.TargetSku;
      skuSource = 'app.config.json';
    }
    if (!sku && localSettings?.TargetSku) {
      sku = localSettings.TargetSku;
      skuSource = 'local.settings.json';
    }

    assert.strictEqual(sku, 'linux-premium');
    assert.strictEqual(skuSource, 'CLI flag');
  });

  test('app.config.json is used when no CLI flag', () => {
    const args = ['start'];
    const appConfig = { TargetSku: 'flex' };
    const localSettings = { TargetSku: 'windows-consumption' };

    let sku = getFlag(args, '--sku');
    let skuSource = null;

    if (!sku && appConfig?.TargetSku) {
      sku = appConfig.TargetSku;
      skuSource = 'app.config.json';
    }
    if (!sku && localSettings?.TargetSku) {
      sku = localSettings.TargetSku;
      skuSource = 'local.settings.json';
    }

    assert.strictEqual(sku, 'flex');
    assert.strictEqual(skuSource, 'app.config.json');
  });

  test('local.settings.json is used when no CLI flag and no app.config', () => {
    const args = ['start'];
    const appConfig = null;
    const localSettings = { TargetSku: 'windows-consumption' };

    let sku = getFlag(args, '--sku');
    let skuSource = null;

    if (!sku && appConfig?.TargetSku) {
      sku = appConfig.TargetSku;
      skuSource = 'app.config.json';
    }
    if (!sku && localSettings?.TargetSku) {
      sku = localSettings.TargetSku;
      skuSource = 'local.settings.json';
    }

    assert.strictEqual(sku, 'windows-consumption');
    assert.strictEqual(skuSource, 'local.settings.json');
  });

  test('defaults to flex when no config specifies SKU', () => {
    const args = ['start'];
    const appConfig = {};
    const localSettings = {};

    let sku = getFlag(args, '--sku');
    let skuSource = null;

    if (!sku && appConfig?.TargetSku) {
      sku = appConfig.TargetSku;
      skuSource = 'app.config.json';
    }
    if (!sku && localSettings?.TargetSku) {
      sku = localSettings.TargetSku;
      skuSource = 'local.settings.json';
    }
    if (!sku) {
      sku = 'flex';
      skuSource = 'default';
    }

    assert.strictEqual(sku, 'flex');
    assert.strictEqual(skuSource, 'default');
  });

  test('null configs are handled gracefully (no crash)', () => {
    const args = ['start'];
    const appConfig = null;
    const localSettings = null;

    let sku = getFlag(args, '--sku');
    let skuSource = null;

    if (!sku && appConfig?.TargetSku) {
      sku = appConfig.TargetSku;
      skuSource = 'app.config.json';
    }
    if (!sku && localSettings?.TargetSku) {
      sku = localSettings.TargetSku;
      skuSource = 'local.settings.json';
    }
    if (!sku) {
      sku = 'flex';
      skuSource = 'default';
    }

    assert.strictEqual(sku, 'flex');
    assert.strictEqual(skuSource, 'default');
  });
});

describe('Config layering — merged values precedence', () => {

  test('local.settings.json Values override app.config.json Values', () => {
    const appConfig = { Values: { FUNCTIONS_WORKER_RUNTIME: 'node', CUSTOM_KEY: 'from-app' } };
    const localSettings = { Values: { CUSTOM_KEY: 'from-local', SECRET: 'secret-val' } };

    const mergedValues = {
      ...(appConfig?.Values || {}),
      ...(localSettings?.Values || {}),
    };

    assert.strictEqual(mergedValues.FUNCTIONS_WORKER_RUNTIME, 'node');
    assert.strictEqual(mergedValues.CUSTOM_KEY, 'from-local');
    assert.strictEqual(mergedValues.SECRET, 'secret-val');
  });

  test('handles missing Values in either config', () => {
    const appConfig = { TargetSku: 'flex' }; // no Values
    const localSettings = { Values: { FUNCTIONS_WORKER_RUNTIME: 'node' } };

    const mergedValues = {
      ...(appConfig?.Values || {}),
      ...(localSettings?.Values || {}),
    };

    assert.strictEqual(mergedValues.FUNCTIONS_WORKER_RUNTIME, 'node');
  });

  test('handles both configs being null', () => {
    const appConfig = null;
    const localSettings = null;

    const mergedValues = {
      ...(appConfig?.Values || {}),
      ...(localSettings?.Values || {}),
    };

    assert.deepStrictEqual(mergedValues, {});
  });
});
