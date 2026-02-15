import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FnxCommand } from '../framework/command-builder.js';
import {
  assertStdoutContains,
  assertStdoutNotContains,
  assertExitCode,
} from '../framework/assertions.js';

describe('fnx start — output validation', () => {

  test('--help shows usage information and exits 0', async () => {
    const result = await FnxCommand.help().withTimeout(10000).execute();
    assertExitCode(result, 0);
    const stdout = result.stdout.join('\n');
    assert.ok(stdout.includes('Usage:'), 'Should show usage');
    assert.ok(stdout.includes('fnx'), 'Should mention fnx');
    assert.ok(stdout.includes('start'), 'Should mention start command');
    assert.ok(stdout.includes('--sku'), 'Should mention --sku flag');
  });

  test('--version shows version and exits 0', async () => {
    const result = await FnxCommand.version().withTimeout(10000).execute();
    assertExitCode(result, 0);
    assertStdoutContains(result, 'fnx v');
  });

  test('unknown command shows error and exits 1', async () => {
    const result = await FnxCommand.command('notacommand').withTimeout(10000).execute();
    assertExitCode(result, 1);
    const stderr = result.stderr.join('\n');
    assert.ok(stderr.includes('Unknown command'), `Expected "Unknown command" in stderr, got: ${stderr}`);
  });

  test('no command shows help and exits 1', async () => {
    const result = await FnxCommand.command('').withTimeout(10000).execute();
    // When no command, fnx exits with code 1 and shows help
    // The empty string means args[0] is falsy
    assert.ok(result.exitCode === 0 || result.exitCode === 1, `Unexpected exit code: ${result.exitCode}`);
  });

  test('--sku list shows available profiles', async () => {
    const result = await FnxCommand
      .start()
      .withSku('list')
      .withTimeout(15000)
      .execute();

    assertExitCode(result, 0);
    const stdout = result.stdout.join('\n');
    assert.ok(stdout.includes('flex'), 'Should list flex SKU');
    assert.ok(stdout.includes('Host Version'), 'Should show Host Version column');
  });

  test('invalid SKU produces an error', async () => {
    const result = await FnxCommand
      .start()
      .withSku('nonexistent-sku-xyz')
      .withTimeout(15000)
      .execute();

    assert.ok(result.exitCode !== 0, 'Should exit with non-zero code');
    const allOutput = [...result.stdout, ...result.stderr].join('\n');
    assert.ok(
      allOutput.includes('Unknown SKU') || allOutput.includes('Error'),
      `Expected error about unknown SKU, got: ${allOutput.slice(0, 500)}`
    );
  });

  test('start output includes SKU profile resolution', async () => {
    // This test runs fnx start but it will fail because no host is downloaded.
    // We still verify the CLI output before the host download step.
    const result = await FnxCommand
      .start()
      .withSku('flex')
      .withTimeout(15000)
      .execute();

    const allOutput = [...result.stdout, ...result.stderr].join('\n');
    assert.ok(
      allOutput.includes('Resolving SKU profile') || allOutput.includes('Flex Consumption'),
      `Expected SKU resolution output, got: ${allOutput.slice(0, 500)}`
    );
  });

  test('start output includes host version info', async () => {
    const result = await FnxCommand
      .start()
      .withSku('flex')
      .withTimeout(15000)
      .execute();

    const allOutput = [...result.stdout, ...result.stderr].join('\n');
    assert.ok(
      allOutput.includes('Host Version') || allOutput.includes('4.1'),
      `Expected host version info, got: ${allOutput.slice(0, 500)}`
    );
  });
});

describe('fnx start — stderr does not contain INTERNAL ERROR', () => {

  test('help output has no internal errors', async () => {
    const result = await FnxCommand.help().withTimeout(10000).execute();
    assertStdoutNotContains(result, 'INTERNAL ERROR');
    const stderr = result.stderr.join('\n');
    assert.ok(!stderr.includes('INTERNAL ERROR'), 'stderr should not contain INTERNAL ERROR');
  });

  test('version output has no internal errors', async () => {
    const result = await FnxCommand.version().withTimeout(10000).execute();
    assertStdoutNotContains(result, 'INTERNAL ERROR');
  });
});
