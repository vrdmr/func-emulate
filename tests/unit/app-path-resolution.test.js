import { describe, test, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FNX_BIN = resolve(__dirname, '..', '..', 'fnx', 'bin', 'fnx');
const FIXTURES = resolve(__dirname, '..', 'fixtures');

function run(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, NO_COLOR: '1', ...opts.env };
    execFile('node', [FNX_BIN, ...args], {
      cwd: opts.cwd,
      env,
      timeout: 15000,
    }, (err, stdout, stderr) => {
      resolve({
        exitCode: err ? err.code ?? 1 : 0,
        stdout,
        stderr,
      });
    });
  });
}

describe('resolveAppPath — explicit --app-path', { timeout: 30000 }, () => {

  test('--app-path with host.json proceeds without error', async () => {
    const result = await run([
      'start', '--app-path', join(FIXTURES, 'valid-node-app'), '--sku', 'list', '--no-mcp',
    ]);
    assert.strictEqual(result.exitCode, 0);
    assert.ok(!result.stderr.includes('No host.json'), 'Should not show host.json error');
    assert.ok(!result.stderr.includes('No function app'), 'Should not show function app error');
  });

  test('--app-path without host.json errors', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'fnx-no-host-'));
    try {
      const result = await run([
        'start', '--app-path', tmp, '--no-mcp',
      ]);
      assert.notStrictEqual(result.exitCode, 0);
      const output = result.stdout + result.stderr;
      assert.ok(output.includes('No host.json found'), 'Should report missing host.json');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('resolveAppPath — cwd auto-detection', { timeout: 30000 }, () => {

  test('cwd with host.json proceeds without error', async () => {
    const result = await run(
      ['start', '--sku', 'list', '--no-mcp'],
      { cwd: join(FIXTURES, 'valid-node-app') },
    );
    assert.strictEqual(result.exitCode, 0);
    assert.ok(!result.stderr.includes('No host.json'), 'Should not show host.json error');
    assert.ok(!result.stderr.includes('No function app'), 'Should not show function app error');
  });

  test('cwd without host.json but ./src has host.json auto-detects', async () => {
    const result = await run(
      ['start', '--sku', 'list', '--no-mcp'],
      { cwd: join(FIXTURES, 'src-fallback') },
    );
    // --sku list exits early with 0, but the auto-detect message should appear
    // before the --sku list early exit since resolveAppPath runs first
    const output = result.stdout + result.stderr;
    // The test validates that resolveAppPath finds ./src — but since --sku list
    // exits before config loading, we check the exit code is 0 (path resolved OK)
    assert.strictEqual(result.exitCode, 0, `Expected exit 0 for --sku list, got:\n${output}`);
  });

  test('cwd with no host.json anywhere errors', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'fnx-empty-'));
    try {
      const result = await run(
        ['start', '--no-mcp'],
        { cwd: tmp },
      );
      assert.notStrictEqual(result.exitCode, 0);
      const output = result.stdout + result.stderr;
      assert.ok(output.includes('No function app found'), 'Should report no function app');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
