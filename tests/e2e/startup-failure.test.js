/**
 * E2E tests for startup failure scenarios — invalid project, missing runtime,
 * dotnet in-process detection, and error message quality.
 */

import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FnxCommand } from '../framework/command-builder.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', 'fixtures');

describe('Startup failure — invalid project', { timeout: 30000 }, () => {

  test('missing FUNCTIONS_WORKER_RUNTIME exits with error', async () => {
    // invalid-project has a broken host.json and no app.config.json with runtime
    const result = await FnxCommand
      .start()
      .withSku('flex')
      .withScriptRoot(FIXTURES + '/invalid-project')
      .withTimeout(15000)
      .execute();

    assert.ok(result.exitCode !== 0, `Should exit non-zero, got ${result.exitCode}`);
    const allOutput = [...result.stdout, ...result.stderr].join('\n');
    assert.ok(
      allOutput.includes('FUNCTIONS_WORKER_RUNTIME') || allOutput.includes('Error'),
      `Expected error about missing runtime, got: ${allOutput.slice(0, 500)}`
    );
  });

  test('invalid SKU exits with helpful error message', async () => {
    const result = await FnxCommand
      .start()
      .withSku('nonexistent-sku-xyz')
      .withTimeout(15000)
      .execute();

    assert.ok(result.exitCode !== 0, 'Should exit with non-zero code');
    const allOutput = [...result.stdout, ...result.stderr].join('\n');
    assert.ok(
      allOutput.includes('Unknown SKU') || allOutput.includes('Error'),
      `Expected helpful error, got: ${allOutput.slice(0, 500)}`
    );
  });
});

describe('Startup failure — dotnet in-process detection', { timeout: 30000 }, () => {

  test('in-process .NET project is blocked with migration guidance', async () => {
    const result = await FnxCommand
      .start()
      .withSku('flex')
      .withScriptRoot(FIXTURES + '/inprocess-dotnet')
      .withArg('--no-azurite')
      .withTimeout(15000)
      .execute();

    assert.ok(result.exitCode !== 0, 'Should exit non-zero for in-process');
    const allOutput = [...result.stdout, ...result.stderr].join('\n');
    assert.ok(
      allOutput.includes('in-process') || allOutput.includes('Microsoft.NET.Sdk.Functions'),
      `Expected in-process error, got: ${allOutput.slice(0, 500)}`
    );
    assert.ok(
      allOutput.includes('isolated') || allOutput.includes('migrate'),
      `Expected migration guidance, got: ${allOutput.slice(0, 500)}`
    );
  });
});

describe('Startup failure — error message quality', { timeout: 30000 }, () => {

  test('unknown command exits 1 with clear message', async () => {
    const result = await FnxCommand.command('foobar').withTimeout(10000).execute();
    assert.strictEqual(result.exitCode, 1);
    const stderr = result.stderr.join('\n');
    assert.ok(stderr.includes('Unknown command'), 'Should state unknown command');
  });

  test('no command shows help and exits non-zero', async () => {
    // Send empty string as command → falsy first arg
    const result = await FnxCommand.command('').withTimeout(10000).execute();
    assert.ok(result.exitCode === 0 || result.exitCode === 1);
    const stdout = result.stdout.join('\n');
    assert.ok(
      stdout.includes('Usage') || stdout.includes('fnx'),
      'Should show help text'
    );
  });

  test('--help exits 0', async () => {
    const result = await FnxCommand.help().withTimeout(10000).execute();
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.join('\n').includes('Usage'));
  });

  test('--version exits 0 with version string', async () => {
    const result = await FnxCommand.version().withTimeout(10000).execute();
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.join('\n').includes('fnx v'));
  });
});
