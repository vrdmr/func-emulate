import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FNX_BIN = resolve(__dirname, '..', '..', 'fnx', 'bin', 'fnx');

function run(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, NO_COLOR: '1', ...opts.env };
    execFile('node', [FNX_BIN, ...args], { env, timeout: 15000 }, (err, stdout, stderr) => {
      resolve({
        exitCode: err ? err.code ?? 1 : 0,
        stdout,
        stderr,
      });
    });
  });
}

describe('fnx --help output', { timeout: 30000 }, () => {

  test('exits 0 and contains expected sections', async () => {
    const result = await run(['--help']);
    assert.strictEqual(result.exitCode, 0);
    const out = result.stdout;
    for (const section of [
      'Azure Functions Local Emulator',
      'Commands:',
      'Common Options:',
      'Start Options:',
      'Sync Options:',
      'Pack Options:',
      'Advanced Options:',
      'fnx Version:',
    ]) {
      assert.ok(out.includes(section), `Should contain "${section}"`);
    }
  });

  test('does NOT contain "Configuration:" section', async () => {
    const result = await run(['--help']);
    assert.ok(!result.stdout.includes('Configuration:'), 'Should not contain "Configuration:" section');
  });

  test('NO_COLOR=1 suppresses ANSI escape codes', async () => {
    const result = await run(['--help']);
    assert.ok(!result.stdout.includes('\x1b['), 'Should not contain ANSI escape codes');
  });
});

describe('fnx start -h output', { timeout: 30000 }, () => {

  test('exits 0 and contains start-specific options', async () => {
    const result = await run(['start', '-h']);
    assert.strictEqual(result.exitCode, 0);
    const out = result.stdout;
    for (const term of ['fnx start', '--app-path', '--port', '--no-mcp']) {
      assert.ok(out.includes(term), `Should contain "${term}"`);
    }
  });

  test('does not actually start downloading', async () => {
    const result = await run(['start', '-h']);
    assert.ok(!result.stdout.includes('Downloading host'), 'Should not start download');
  });

  test('--help flag works same as -h', async () => {
    const result = await run(['start', '--help']);
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('fnx start'), 'Should contain "fnx start"');
  });
});

describe('fnx sync -h output', { timeout: 30000 }, () => {

  test('exits 0 and contains sync-specific options', async () => {
    const result = await run(['sync', '-h']);
    assert.strictEqual(result.exitCode, 0);
    const out = result.stdout;
    for (const term of ['fnx sync', '--keep', '--force']) {
      assert.ok(out.includes(term), `Should contain "${term}"`);
    }
  });
});

describe('fnx pack -h output', { timeout: 30000 }, () => {

  test('exits 0 and contains pack-specific options', async () => {
    const result = await run(['pack', '-h']);
    assert.strictEqual(result.exitCode, 0);
    const out = result.stdout;
    for (const term of ['fnx pack', '--runtime', '--output', '--no-build']) {
      assert.ok(out.includes(term), `Should contain "${term}"`);
    }
  });
});

describe('fnx warmup -h output', { timeout: 30000 }, () => {

  test('exits 0 and contains warmup-specific options', async () => {
    const result = await run(['warmup', '-h']);
    assert.strictEqual(result.exitCode, 0);
    const out = result.stdout;
    for (const term of ['fnx warmup', '--all', '--dry-run']) {
      assert.ok(out.includes(term), `Should contain "${term}"`);
    }
  });
});

describe('fnx templates-mcp -h output', { timeout: 30000 }, () => {

  test('exits 0 and contains templates-mcp info', async () => {
    const result = await run(['templates-mcp', '-h']);
    assert.strictEqual(result.exitCode, 0);
    const out = result.stdout;
    for (const term of ['fnx templates-mcp', 'MCP server', 'stdio']) {
      assert.ok(out.includes(term), `Should contain "${term}"`);
    }
  });
});
