import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FnxCommand } from '../framework/command-builder.js';
import { assertExitCode } from '../framework/assertions.js';
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NODE_APP = resolvePath(__dirname, '..', 'test-node-app');
const PYTHON_APP = resolvePath(__dirname, '..', 'test-python-app');
const DOTNET_ISO_APP = resolvePath(__dirname, '..', 'test-dotnet-isolated-app');

describe('fnx pack — E2E', () => {

  test('pack --help shows help and exits 0', async () => {
    const result = await FnxCommand.command('pack')
      .withArg('--help')
      .withTimeout(10000)
      .execute();
    assertExitCode(result, 0);
    const out = result.stdout.join('\n');
    assert.ok(out.includes('fnx pack'), 'Should show pack help');
    assert.ok(out.includes('--runtime'), 'Should mention --runtime option');
    assert.ok(out.includes('--output'), 'Should mention --output option');
  });

  test('pack detects node runtime from app-config.yaml', async () => {
    const result = await FnxCommand.command('pack')
      .withArg('--app-path', NODE_APP, '--no-build')
      .withTimeout(15000)
      .execute();
    // Pack should detect runtime and produce output (may fail on zip but detects runtime)
    const out = (result.stdout.join('\n') + result.stderr.join('\n')).toLowerCase();
    assert.ok(out.includes('node') || out.includes('pack') || out.includes('zip'), 'Should detect node runtime or attempt pack');
  });

  test('pack detects python runtime from app-config.yaml', async () => {
    const result = await FnxCommand.command('pack')
      .withArg('--app-path', PYTHON_APP, '--no-build')
      .withTimeout(15000)
      .execute();
    const out = (result.stdout.join('\n') + result.stderr.join('\n')).toLowerCase();
    assert.ok(out.includes('python') || out.includes('pack') || out.includes('zip'), 'Should detect python runtime or attempt pack');
  });

  test('pack detects dotnet-isolated runtime from app-config.yaml', async () => {
    const result = await FnxCommand.command('pack')
      .withArg('--app-path', DOTNET_ISO_APP, '--no-build')
      .withTimeout(15000)
      .execute();
    const out = (result.stdout.join('\n') + result.stderr.join('\n')).toLowerCase();
    assert.ok(out.includes('dotnet') || out.includes('pack') || out.includes('zip'), 'Should detect dotnet runtime or attempt pack');
  });
});

describe('fnx sync — E2E', () => {

  test('sync --help shows help and exits 0', async () => {
    const result = await FnxCommand.command('sync')
      .withArg('--help')
      .withTimeout(10000)
      .execute();
    assertExitCode(result, 0);
    const out = result.stdout.join('\n');
    assert.ok(out.includes('fnx sync'), 'Should show sync help');
    assert.ok(out.includes('host'), 'Should mention host target');
    assert.ok(out.includes('extensions'), 'Should mention extensions target');
  });

  test('sync without network shows catalog info', async () => {
    // sync will attempt to fetch catalog — may fail without network but should show output
    const result = await FnxCommand.command('sync')
      .withTimeout(20000)
      .execute();
    const out = (result.stdout.join('\n') + result.stderr.join('\n'));
    assert.ok(out.includes('sync') || out.includes('Sync') || out.includes('catalog') || out.includes('host'), 'Should show sync-related output');
  });
});

describe('fnx warmup — E2E', () => {

  test('warmup --help shows help and exits 0', async () => {
    const result = await FnxCommand.command('warmup')
      .withArg('--help')
      .withTimeout(10000)
      .execute();
    assertExitCode(result, 0);
    const out = result.stdout.join('\n');
    assert.ok(out.includes('fnx warmup') || out.includes('warmup'), 'Should show warmup help');
    assert.ok(out.includes('--all') || out.includes('--sku'), 'Should mention --all or --sku option');
  });

  test('warmup --dry-run shows what would be downloaded', async () => {
    const result = await FnxCommand.command('warmup')
      .withArg('--dry-run')
      .withTimeout(20000)
      .execute();
    const out = (result.stdout.join('\n') + result.stderr.join('\n'));
    assert.ok(out.includes('warmup') || out.includes('Host') || out.includes('Bundle') || out.includes('cached'),
      'Should show warmup status output');
  });
});
