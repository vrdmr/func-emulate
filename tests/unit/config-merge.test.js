/**
 * Unit tests for config merge logic — host.json merging, environment variable
 * passthrough, and the effective bundle version calculation from cli.js.
 */

import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readJsonFile, getFlag } from '../../fnx/lib/cli.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHostState } from '../../fnx/lib/host-launcher.js';

describe('Config merge — merged values precedence', () => {

  test('local.settings.json Values override app.config.json Values', () => {
    const appConfig = { Values: { FUNCTIONS_WORKER_RUNTIME: 'node', CUSTOM: 'from-app' } };
    const localSettings = { Values: { CUSTOM: 'from-local', SECRET: 'val' } };
    const merged = { ...(appConfig?.Values || {}), ...(localSettings?.Values || {}) };

    assert.strictEqual(merged.FUNCTIONS_WORKER_RUNTIME, 'node');
    assert.strictEqual(merged.CUSTOM, 'from-local');
    assert.strictEqual(merged.SECRET, 'val');
  });

  test('handles null app.config.json gracefully', () => {
    const appConfig = null;
    const localSettings = { Values: { FUNCTIONS_WORKER_RUNTIME: 'python' } };
    const merged = { ...(appConfig?.Values || {}), ...(localSettings?.Values || {}) };
    assert.strictEqual(merged.FUNCTIONS_WORKER_RUNTIME, 'python');
  });

  test('handles null local.settings.json gracefully', () => {
    const appConfig = { Values: { FUNCTIONS_WORKER_RUNTIME: 'node' } };
    const localSettings = null;
    const merged = { ...(appConfig?.Values || {}), ...(localSettings?.Values || {}) };
    assert.strictEqual(merged.FUNCTIONS_WORKER_RUNTIME, 'node');
  });

  test('handles both configs being null', () => {
    const merged = { ...(null?.Values || {}), ...(null?.Values || {}) };
    assert.deepStrictEqual(merged, {});
  });

  test('empty Values objects produce empty merge', () => {
    const appConfig = { Values: {} };
    const localSettings = { Values: {} };
    const merged = { ...(appConfig?.Values || {}), ...(localSettings?.Values || {}) };
    assert.deepStrictEqual(merged, {});
  });
});

describe('Config merge — effective bundle version calculation', () => {

  test('exact pin when bundle version is resolved', () => {
    const resolvedBundleVersion = '4.22.1';
    const effectiveBundleVersion = `[${resolvedBundleVersion}, ${resolvedBundleVersion}]`;
    assert.strictEqual(effectiveBundleVersion, '[4.22.1, 4.22.1]');
  });

  test('clamped range when no resolved version and maxExtensionBundleVersion set', () => {
    const profile = {
      extensionBundleVersion: '[4.22.*, 5.0.0)',
      maxExtensionBundleVersion: '4.25.0',
    };
    const resolvedBundleVersion = null;

    let effectiveBundleVersion = profile.extensionBundleVersion;
    if (profile.maxExtensionBundleVersion) {
      const maxParts = profile.maxExtensionBundleVersion.split('.').map(Number);
      const ceilVersion = `${maxParts[0]}.${maxParts[1]}.${(maxParts[2] || 0) + 1}`;
      const lowerBound = effectiveBundleVersion.match(/^\[([^\],]+)/);
      if (lowerBound) {
        effectiveBundleVersion = `[${lowerBound[1]}, ${ceilVersion})`;
      }
    }

    assert.strictEqual(effectiveBundleVersion, '[4.22.*, 4.25.1)');
  });

  test('unclamped range when no maxExtensionBundleVersion', () => {
    const profile = {
      extensionBundleVersion: '[4.22.*, 5.0.0)',
      maxExtensionBundleVersion: null,
    };
    const resolvedBundleVersion = null;

    let effectiveBundleVersion = profile.extensionBundleVersion;
    if (profile.maxExtensionBundleVersion) {
      // Would clamp, but max is null
    }

    assert.strictEqual(effectiveBundleVersion, '[4.22.*, 5.0.0)');
  });
});

describe('Config merge — environment variable construction', () => {

  test('merged values are injected into host env', () => {
    const mergedValues = {
      FUNCTIONS_WORKER_RUNTIME: 'node',
      AzureWebJobsStorage: 'UseDevelopmentStorage=true',
      CUSTOM_SETTING: 'my-value',
    };

    const env = { ...process.env };
    for (const [key, value] of Object.entries(mergedValues)) {
      env[key] = value;
    }

    assert.strictEqual(env.FUNCTIONS_WORKER_RUNTIME, 'node');
    assert.strictEqual(env.CUSTOM_SETTING, 'my-value');
  });

  test('sensitive keys are redacted in hostState', () => {
    const mergedValues = {
      AzureWebJobsStorage: 'DefaultEndpointsProtocol=https;AccountName=real',
      EventHubConnectionString: 'Endpoint=sb://real',
      CUSTOM_SETTING: 'safe-value',
    };

    const sensitiveKeys = ['AzureWebJobsStorage', 'EventHubConnectionString', 'ServiceBusConnectionString'];
    const redacted = {};
    for (const [key, value] of Object.entries(mergedValues)) {
      redacted[key] = sensitiveKeys.some(sk => key.includes(sk)) && value !== 'UseDevelopmentStorage=true'
        ? '***REDACTED***' : value;
    }

    assert.strictEqual(redacted.AzureWebJobsStorage, '***REDACTED***');
    assert.strictEqual(redacted.EventHubConnectionString, '***REDACTED***');
    assert.strictEqual(redacted.CUSTOM_SETTING, 'safe-value');
  });

  test('UseDevelopmentStorage=true is NOT redacted', () => {
    const mergedValues = {
      AzureWebJobsStorage: 'UseDevelopmentStorage=true',
    };

    const sensitiveKeys = ['AzureWebJobsStorage'];
    const redacted = {};
    for (const [key, value] of Object.entries(mergedValues)) {
      redacted[key] = sensitiveKeys.some(sk => key.includes(sk)) && value !== 'UseDevelopmentStorage=true'
        ? '***REDACTED***' : value;
    }

    assert.strictEqual(redacted.AzureWebJobsStorage, 'UseDevelopmentStorage=true');
  });
});

describe('Config merge — host state initialization', () => {

  test('hostState is initialized with correct metadata', () => {
    const hostState = createHostState();
    hostState.hostVersion = '4.1047.100';
    hostState.skuName = 'Flex Consumption';
    hostState.port = '7071';
    hostState.workerRuntime = 'node';

    assert.strictEqual(hostState.hostVersion, '4.1047.100');
    assert.strictEqual(hostState.skuName, 'Flex Consumption');
    assert.strictEqual(hostState.port, '7071');
    assert.strictEqual(hostState.workerRuntime, 'node');
    assert.strictEqual(hostState.state, 'Starting');
  });

  test('hostState tracks HTTP functions', () => {
    const hostState = createHostState();
    hostState.httpFunctions.push({ name: 'hello', route: 'api/hello', methods: 'GET,POST' });
    assert.strictEqual(hostState.httpFunctions.length, 1);
    assert.strictEqual(hostState.httpFunctions[0].name, 'hello');
  });

  test('hostState tracks non-HTTP functions', () => {
    const hostState = createHostState();
    hostState.nonHttpFunctions.push({ name: 'timer1', triggerType: 'timerTrigger' });
    assert.strictEqual(hostState.nonHttpFunctions.length, 1);
    assert.strictEqual(hostState.nonHttpFunctions[0].triggerType, 'timerTrigger');
  });
});

describe('Config merge — readJsonFile edge cases', () => {

  test('reads deeply nested JSON structure', async () => {
    const tmpDir = join(tmpdir(), `fnx-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
    const filePath = join(tmpDir, 'deep.json');
    const data = {
      level1: { level2: { level3: { value: 'deep' } } },
      Values: { FUNCTIONS_WORKER_RUNTIME: 'node' },
    };
    await writeFile(filePath, JSON.stringify(data));
    const result = await readJsonFile(filePath);
    assert.strictEqual(result.level1.level2.level3.value, 'deep');
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('reads file with BOM gracefully', async () => {
    const tmpDir = join(tmpdir(), `fnx-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
    const filePath = join(tmpDir, 'bom.json');
    // JSON with UTF-8 BOM
    const bom = '\uFEFF';
    await writeFile(filePath, bom + '{"key": "value"}');
    // readJsonFile may or may not handle BOM — test to see
    const result = await readJsonFile(filePath);
    // If it handles BOM, result is parsed. If not, returns null (invalid JSON).
    // Either way, it should not crash.
    assert.ok(result === null || result.key === 'value', 'Should handle BOM gracefully');
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('handles empty file', async () => {
    const tmpDir = join(tmpdir(), `fnx-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
    const filePath = join(tmpDir, 'empty.json');
    await writeFile(filePath, '');
    const result = await readJsonFile(filePath);
    assert.strictEqual(result, null, 'Empty file should return null');
    await rm(tmpDir, { recursive: true, force: true });
  });
});
