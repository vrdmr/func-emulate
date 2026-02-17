import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FnxCommand } from '../framework/command-builder.js';
import { assertExitCode } from '../framework/assertions.js';
import { resolve as resolvePath, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NODE_APP = resolvePath(__dirname, '..', 'test-node-app');
const PYTHON_APP = resolvePath(__dirname, '..', 'test-python-app');
const DOTNET_ISO_APP = resolvePath(__dirname, '..', 'test-dotnet-isolated-app');

describe('fnx config — E2E', () => {

  test('config --help shows help and exits 0', async () => {
    const result = await FnxCommand.command('config')
      .withArg('--help')
      .withTimeout(10000)
      .execute();
    assertExitCode(result, 0);
    const out = result.stdout.join('\n');
    assert.ok(out.includes('fnx config'), 'Should show config help');
    assert.ok(out.includes('migrate'), 'Should mention migrate subcommand');
    assert.ok(out.includes('validate'), 'Should mention validate subcommand');
  });

  test('config shows resolved config for node app', async () => {
    const result = await FnxCommand.command('config')
      .withArg('--app-path', NODE_APP)
      .withTimeout(10000)
      .execute();
    const out = result.stdout.join('\n');
    assert.ok(out.includes('Resolved Configuration') || out.includes('FUNCTIONS_WORKER_RUNTIME'), 'Should show resolved config');
  });

  test('config shows resolved config for python app', async () => {
    const result = await FnxCommand.command('config')
      .withArg('--app-path', PYTHON_APP)
      .withTimeout(10000)
      .execute();
    const out = result.stdout.join('\n');
    assert.ok(out.includes('FUNCTIONS_WORKER_RUNTIME') || out.includes('python'), 'Should show python config');
  });

  test('config shows resolved config for dotnet-isolated app', async () => {
    const result = await FnxCommand.command('config')
      .withArg('--app-path', DOTNET_ISO_APP)
      .withTimeout(10000)
      .execute();
    const out = result.stdout.join('\n');
    assert.ok(out.includes('FUNCTIONS_WORKER_RUNTIME') || out.includes('dotnet-isolated'), 'Should show dotnet-isolated config');
  });
});

describe('fnx config validate — E2E', () => {

  test('validate passes for valid node app', async () => {
    const result = await FnxCommand.command('config')
      .withArg('validate', '--app-path', NODE_APP)
      .withTimeout(10000)
      .execute();
    assertExitCode(result, 0);
    const out = result.stdout.join('\n');
    assert.ok(out.includes('valid'), 'Should report valid');
  });

  test('validate passes for valid python app', async () => {
    const result = await FnxCommand.command('config')
      .withArg('validate', '--app-path', PYTHON_APP)
      .withTimeout(10000)
      .execute();
    assertExitCode(result, 0);
  });

  test('validate passes for valid dotnet-isolated app', async () => {
    const result = await FnxCommand.command('config')
      .withArg('validate', '--app-path', DOTNET_ISO_APP)
      .withTimeout(10000)
      .execute();
    assertExitCode(result, 0);
  });

  test('validate fails for app with secrets in config', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fnx-e2e-validate-'));
    writeFileSync(join(dir, 'host.json'), JSON.stringify({ version: '2.0' }));
    writeFileSync(join(dir, 'app-config.yaml'),
      'runtime:\n  name: node\nconfigurations:\n  MySecret: "DefaultEndpointsProtocol=https;AccountKey=abc123"\n');
    try {
      const result = await FnxCommand.command('config')
        .withArg('validate', '--app-path', dir)
        .withTimeout(10000)
        .execute();
      assertExitCode(result, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('validate fails for missing app-config.yaml', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fnx-e2e-validate-missing-'));
    writeFileSync(join(dir, 'host.json'), JSON.stringify({ version: '2.0' }));
    try {
      const result = await FnxCommand.command('config')
        .withArg('validate', '--app-path', dir)
        .withTimeout(10000)
        .execute();
      assertExitCode(result, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('fnx config migrate — E2E', () => {

  test('migrate creates app-config.yaml from local.settings.json', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fnx-e2e-migrate-'));
    writeFileSync(join(dir, 'host.json'), JSON.stringify({ version: '2.0' }));
    writeFileSync(join(dir, 'local.settings.json'), JSON.stringify({
      IsEncrypted: false,
      Values: {
        FUNCTIONS_WORKER_RUNTIME: 'python',
        AzureWebJobsStorage: 'UseDevelopmentStorage=true',
        PYTHON_ISOLATE_WORKER_DEPENDENCIES: '1',
      }
    }));
    try {
      const result = await FnxCommand.command('config')
        .withArg('migrate', '--app-path', dir)
        .withTimeout(10000)
        .execute();
      const out = result.stdout.join('\n') + result.stderr.join('\n');
      // Check the file was created
      const { existsSync } = await import('node:fs');
      assert.ok(existsSync(join(dir, 'app-config.yaml')), 'Should create app-config.yaml');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('migrate errors when local.settings.json is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fnx-e2e-migrate-nolsj-'));
    writeFileSync(join(dir, 'host.json'), JSON.stringify({ version: '2.0' }));
    try {
      const result = await FnxCommand.command('config')
        .withArg('migrate', '--app-path', dir)
        .withTimeout(10000)
        .execute();
      assertExitCode(result, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
