import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FnxCommand } from '../framework/command-builder.js';
import {
  assertStdoutContains,
  assertStdoutNotContains,
} from '../framework/assertions.js';

describe('--verbose flag — output behavior', () => {

  test('--help with verbose still shows help', async () => {
    // --verbose doesn't apply to --help, but should not break it
    const result = await FnxCommand.help().withTimeout(10000).execute();
    assertStdoutContains(result, 'Usage:');
  });

  test('--sku list works without verbose flag', async () => {
    const result = await FnxCommand
      .start()
      .withSku('list')
      .withTimeout(15000)
      .execute();

    const stdout = result.stdout.join('\n');
    assert.ok(stdout.includes('flex'), 'Should list flex SKU');
    assert.ok(stdout.includes('linux-premium'), 'Should list linux-premium SKU');
  });

  test('start with verbose includes SKU resolution', async () => {
    const result = await FnxCommand
      .start()
      .withSku('flex')
      .withVerbose()
      .withTimeout(15000)
      .execute();

    const allOutput = [...result.stdout, ...result.stderr].join('\n');
    assert.ok(
      allOutput.includes('Resolving SKU profile') || allOutput.includes('Flex Consumption'),
      `Expected verbose output with SKU resolution, got: ${allOutput.slice(0, 500)}`
    );
  });

  test('start without verbose includes SKU resolution banner', async () => {
    const result = await FnxCommand
      .start()
      .withSku('flex')
      .withTimeout(15000)
      .execute();

    const allOutput = [...result.stdout, ...result.stderr].join('\n');
    // Even in clean mode, the banner/SKU resolution info is shown
    assert.ok(
      allOutput.includes('Resolving SKU profile') || allOutput.includes('Target SKU'),
      `Expected SKU banner in clean mode, got: ${allOutput.slice(0, 500)}`
    );
  });

  test('verbose flag appears in --help output', async () => {
    const result = await FnxCommand.help().withTimeout(10000).execute();
    assertStdoutContains(result, '--verbose');
    assertStdoutContains(result, 'Show all host output');
  });
});

describe('--verbose flag — SKU profiles', () => {

  const skus = ['flex', 'linux-premium', 'windows-consumption'];

  for (const sku of skus) {
    test(`start --sku ${sku} shows profile info`, async () => {
      const result = await FnxCommand
        .start()
        .withSku(sku)
        .withTimeout(15000)
        .execute();

      const allOutput = [...result.stdout, ...result.stderr].join('\n');
      assert.ok(
        allOutput.includes('Target SKU') || allOutput.includes('Resolving'),
        `Expected profile info for ${sku}, got: ${allOutput.slice(0, 500)}`
      );
    });
  }
});
