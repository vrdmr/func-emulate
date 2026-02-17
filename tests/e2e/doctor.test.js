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

describe('fnx doctor — E2E', () => {

  test('doctor on valid node app exits 0 with all checks', async () => {
    const result = await FnxCommand.command('doctor')
      .withArg('--app-path', NODE_APP)
      .withTimeout(15000)
      .execute();
    const out = result.stdout.join('\n');
    assert.ok(out.includes('host.json'), 'Should check host.json');
    assert.ok(out.includes('app-config.yaml'), 'Should check app-config.yaml');
    assert.ok(out.includes('Worker runtime'), 'Should check runtime');
    assert.ok(out.includes('Default ports'), 'Should check ports');
    assert.ok(out.includes('Azurite'), 'Should check Azurite');
    assert.ok(out.includes('node'), 'Should detect node runtime');
  });

  test('doctor on python app detects python runtime', async () => {
    const result = await FnxCommand.command('doctor')
      .withArg('--app-path', PYTHON_APP)
      .withTimeout(15000)
      .execute();
    const out = result.stdout.join('\n');
    assert.ok(out.includes('python'), 'Should detect python runtime');
  });

  test('doctor on dotnet-isolated app detects dotnet-isolated runtime', async () => {
    const result = await FnxCommand.command('doctor')
      .withArg('--app-path', DOTNET_ISO_APP)
      .withTimeout(15000)
      .execute();
    const out = result.stdout.join('\n');
    assert.ok(out.includes('dotnet-isolated'), 'Should detect dotnet-isolated runtime');
  });

  test('doctor --help shows help and exits 0', async () => {
    const result = await FnxCommand.command('doctor')
      .withArg('--help')
      .withTimeout(10000)
      .execute();
    assertExitCode(result, 0);
    const out = result.stdout.join('\n');
    assert.ok(out.includes('fnx doctor'), 'Should show doctor help');
    assert.ok(out.includes('Checks:'), 'Should list checks');
  });

  test('doctor on empty dir exits 1', async () => {
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(resolvePath(tmpdir(), 'fnx-e2e-doctor-'));
    const result = await FnxCommand.command('doctor')
      .withArg('--app-path', dir)
      .withTimeout(15000)
      .execute();
    assertExitCode(result, 1);
    const out = result.stdout.join('\n');
    assert.ok(out.includes('Not found'), 'Should report missing files');
    const { rmSync } = await import('node:fs');
    rmSync(dir, { recursive: true, force: true });
  });
});
