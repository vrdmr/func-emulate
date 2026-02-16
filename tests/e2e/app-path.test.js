/**
 * E2E tests for --app-path resolution and auto-detection.
 */
import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { FnxCommand } from '../framework/command-builder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, '..', 'fixtures');
const FNX_BIN = resolve(__dirname, '..', '..', 'fnx', 'bin', 'fnx');

function spawn(args, opts = {}) {
  return new Promise((res) => {
    const env = { ...process.env, NO_COLOR: '1', ...opts.env };
    execFile('node', [FNX_BIN, ...args], {
      cwd: opts.cwd,
      env,
      timeout: 30000,
    }, (err, stdout, stderr) => {
      res({
        exitCode: err ? err.code ?? 1 : 0,
        stdout,
        stderr,
      });
    });
  });
}

describe('E2E --app-path with valid function app', { timeout: 60000 }, () => {

  test('--app-path to valid-node-app with --sku list exits 0', async () => {
    const result = await FnxCommand
      .start()
      .withScriptRoot(join(FIXTURES, 'valid-node-app'))
      .withSku('list')
      .withTimeout(15000)
      .execute();

    assert.strictEqual(result.exitCode, 0);
    const output = [...result.stdout, ...result.stderr].join('\n');
    assert.ok(!output.includes('No host.json'), 'Should not report missing host.json');
  });

  test('--app-path to dir without host.json exits non-zero', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'fnx-e2e-no-host-'));
    try {
      const result = await spawn([
        'start', '--app-path', tmp, '--sku', 'list', '--no-mcp',
      ]);
      assert.notStrictEqual(result.exitCode, 0);
      const output = result.stdout + result.stderr;
      assert.ok(output.includes('No host.json'), 'Should report missing host.json');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('E2E auto-detection from ./src', { timeout: 60000 }, () => {

  test('auto-detects host.json in ./src subdirectory', async () => {
    const result = await spawn(
      ['start', '--sku', 'list', '--no-mcp'],
      { cwd: join(FIXTURES, 'src-fallback') },
    );
    const output = result.stdout + result.stderr;
    assert.ok(output.includes('Using function app at') && output.includes('./src'),
      `Should auto-detect ./src, got:\n${output}`);
  });

  test('auto-detection with temp dir containing src/host.json', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'fnx-e2e-src-'));
    const srcDir = join(tmp, 'src');
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, 'host.json'), '{}');
    try {
      const result = await spawn(
        ['start', '--sku', 'list', '--no-mcp'],
        { cwd: tmp },
      );
      const output = result.stdout + result.stderr;
      assert.ok(output.includes('Using function app at') && output.includes('./src'),
        `Should auto-detect ./src in temp dir, got:\n${output}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
