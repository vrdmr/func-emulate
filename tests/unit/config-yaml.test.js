import { describe, test, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveEnvVars, validateStructure, ALLOWED_CONFIGURATIONS } from '../../fnx/lib/config-schema.js';
import { detectSecrets } from '../../fnx/lib/secret-patterns.js';

// ── config-schema tests ──

describe('config-schema — resolveEnvVars', () => {

  test('maps runtime.name to FUNCTIONS_WORKER_RUNTIME', () => {
    const config = { runtime: { name: 'python' } };
    const { envVars, errors } = resolveEnvVars(config);
    assert.strictEqual(envVars.FUNCTIONS_WORKER_RUNTIME, 'python');
    assert.strictEqual(errors.length, 0);
  });

  test('maps runtime.version to FUNCTIONS_WORKER_RUNTIME_VERSION', () => {
    const config = { runtime: { name: 'python', version: '3.11' } };
    const { envVars } = resolveEnvVars(config);
    assert.strictEqual(envVars.FUNCTIONS_WORKER_RUNTIME_VERSION, '3.11');
  });

  test('maps scaleAndConcurrency fields', () => {
    const config = {
      runtime: { name: 'node' },
      scaleAndConcurrency: { maximumInstanceCount: 100, instanceMemoryMB: 2048 },
    };
    const { envVars, errors } = resolveEnvVars(config);
    assert.strictEqual(envVars.WEBSITE_MAX_DYNAMIC_APPLICATION_SCALE_OUT, '100');
    assert.strictEqual(envVars.WEBSITE_INSTANCE_MEMORY_MB, '2048');
    assert.strictEqual(errors.length, 0);
  });

  test('errors on missing required runtime.name', () => {
    const config = { configurations: { AzureWebJobsFeatureFlags: 'EnableWorkerIndexing' } };
    const { errors } = resolveEnvVars(config);
    assert.ok(errors.some(e => e.includes('runtime.name is required')));
  });

  test('errors on invalid runtime.name value', () => {
    const config = { runtime: { name: 'ruby' } };
    const { errors } = resolveEnvVars(config);
    assert.ok(errors.some(e => e.includes('not allowed')));
  });

  test('passes through allowlisted configurations', () => {
    const config = {
      runtime: { name: 'node' },
      configurations: { AzureWebJobsFeatureFlags: 'EnableWorkerIndexing' },
    };
    const { envVars, errors } = resolveEnvVars(config);
    assert.strictEqual(envVars.AzureWebJobsFeatureFlags, 'EnableWorkerIndexing');
    assert.strictEqual(errors.length, 0);
  });

  test('errors on non-allowlisted configuration key', () => {
    const config = {
      runtime: { name: 'node' },
      configurations: { UNKNOWN_SETTING: 'value' },
    };
    const { errors } = resolveEnvVars(config);
    assert.ok(errors.some(e => e.includes('not in the allowlist')));
  });

  test('errors on wrong type for number fields', () => {
    const config = {
      runtime: { name: 'node' },
      scaleAndConcurrency: { maximumInstanceCount: 'not-a-number' },
    };
    const { errors } = resolveEnvVars(config);
    assert.ok(errors.some(e => e.includes('expected number')));
  });
});

describe('config-schema — validateStructure', () => {

  test('valid config produces no warnings', () => {
    const config = { local: { targetSku: 'flex' }, runtime: { name: 'node' } };
    const { warnings } = validateStructure(config);
    assert.strictEqual(warnings.length, 0);
  });

  test('unknown top-level key produces warning', () => {
    const config = { runtime: { name: 'node' }, unknownKey: 'value' };
    const { warnings } = validateStructure(config);
    assert.ok(warnings.some(w => w.includes('unknownKey')));
  });

  test('unknown local key produces warning', () => {
    const config = { local: { targetSku: 'flex', badKey: 'value' } };
    const { warnings } = validateStructure(config);
    assert.ok(warnings.some(w => w.includes('badKey')));
  });

  test('null config produces warning', () => {
    const { warnings } = validateStructure(null);
    assert.ok(warnings.length > 0);
  });
});

// ── secret-patterns tests ──

describe('secret-patterns — detectSecrets', () => {

  test('detects connection string in value', () => {
    const config = {
      configurations: {
        MyStorage: 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=abc123',
      },
    };
    const secrets = detectSecrets(config);
    assert.ok(secrets.length > 0);
    assert.ok(secrets[0].reason.includes('connection string'));
  });

  test('detects secret-named key (AzureWebJobsStorage with real value)', () => {
    const config = {
      configurations: {
        AzureWebJobsStorage: 'DefaultEndpointsProtocol=https;AccountName=prod;AccountKey=secret',
      },
    };
    const secrets = detectSecrets(config);
    assert.ok(secrets.length > 0);
  });

  test('allows AzureWebJobsStorage=UseDevelopmentStorage=true', () => {
    const config = {
      configurations: { AzureWebJobsStorage: 'UseDevelopmentStorage=true' },
    };
    const secrets = detectSecrets(config);
    assert.strictEqual(secrets.length, 0);
  });

  test('detects SAS token in value', () => {
    const config = {
      configurations: { BlobUrl: 'sig=abc123def456ghi789jklmno012pqrs' },
    };
    const secrets = detectSecrets(config);
    assert.ok(secrets.length > 0);
  });

  test('detects key name ending in ConnectionString', () => {
    const config = {
      configurations: { ServiceBusConnectionString: 'Endpoint=sb://test.servicebus.windows.net/' },
    };
    const secrets = detectSecrets(config);
    assert.ok(secrets.length > 0);
  });

  test('allows non-secret behavioral settings', () => {
    const config = {
      configurations: {
        AzureWebJobsFeatureFlags: 'EnableWorkerIndexing',
        PYTHON_ISOLATE_WORKER_DEPENDENCIES: '1',
      },
    };
    const secrets = detectSecrets(config);
    assert.strictEqual(secrets.length, 0);
  });

  test('empty configurations section returns no secrets', () => {
    const secrets = detectSecrets({ configurations: {} });
    assert.strictEqual(secrets.length, 0);
  });

  test('no configurations section returns no secrets', () => {
    const secrets = detectSecrets({ runtime: { name: 'node' } });
    assert.strictEqual(secrets.length, 0);
  });
});

// ── YAML loading integration tests ──

describe('config YAML loading', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'fnx-config-test-'));
    writeFileSync(join(tmpDir, 'host.json'), '{}');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('reads valid app-config.yaml', async () => {
    const { parse: parseYaml } = await import('yaml');
    const yaml = `
local:
  targetSku: flex
runtime:
  name: python
  version: "3.11"
configurations:
  AzureWebJobsFeatureFlags: EnableWorkerIndexing
`;
    writeFileSync(join(tmpDir, 'app-config.yaml'), yaml);
    const parsed = parseYaml(yaml);
    assert.strictEqual(parsed.runtime.name, 'python');
    assert.strictEqual(parsed.runtime.version, '3.11');
    assert.strictEqual(parsed.local.targetSku, 'flex');
    assert.strictEqual(parsed.configurations.AzureWebJobsFeatureFlags, 'EnableWorkerIndexing');
  });

  test('YAML with comments parses correctly', async () => {
    const { parse: parseYaml } = await import('yaml');
    const yaml = `
# This is a comment
runtime:
  name: node  # inline comment
  # version: "18"
configurations:
  AzureWebJobsFeatureFlags: EnableWorkerIndexing
`;
    const parsed = parseYaml(yaml);
    assert.strictEqual(parsed.runtime.name, 'node');
    assert.strictEqual(parsed.runtime.version, undefined);
  });

  test('resolveEnvVars round-trip from YAML', async () => {
    const { parse: parseYaml } = await import('yaml');
    const yaml = `
runtime:
  name: dotnet-isolated
  version: "8.0"
scaleAndConcurrency:
  maximumInstanceCount: 50
  instanceMemoryMB: 1024
configurations:
  AzureWebJobsFeatureFlags: EnableWorkerIndexing
`;
    const config = parseYaml(yaml);
    const { envVars, errors } = resolveEnvVars(config);
    assert.strictEqual(errors.length, 0);
    assert.strictEqual(envVars.FUNCTIONS_WORKER_RUNTIME, 'dotnet-isolated');
    assert.strictEqual(envVars.FUNCTIONS_WORKER_RUNTIME_VERSION, '8.0');
    assert.strictEqual(envVars.WEBSITE_MAX_DYNAMIC_APPLICATION_SCALE_OUT, '50');
    assert.strictEqual(envVars.WEBSITE_INSTANCE_MEMORY_MB, '1024');
    assert.strictEqual(envVars.AzureWebJobsFeatureFlags, 'EnableWorkerIndexing');
  });
});

describe('ALLOWED_CONFIGURATIONS allowlist', () => {
  test('includes core runtime settings', () => {
    assert.ok(ALLOWED_CONFIGURATIONS.has('AzureWebJobsFeatureFlags'));
    assert.ok(ALLOWED_CONFIGURATIONS.has('FUNCTIONS_WORKER_PROCESS_COUNT'));
  });

  test('includes Python worker settings', () => {
    assert.ok(ALLOWED_CONFIGURATIONS.has('PYTHON_ISOLATE_WORKER_DEPENDENCIES'));
  });

  test('includes Node worker settings', () => {
    assert.ok(ALLOWED_CONFIGURATIONS.has('languageWorkers__node__arguments'));
  });

  test('does not include secret-capable settings', () => {
    assert.ok(!ALLOWED_CONFIGURATIONS.has('AzureWebJobsStorage'));
    assert.ok(!ALLOWED_CONFIGURATIONS.has('APPLICATIONINSIGHTS_CONNECTION_STRING'));
  });
});
