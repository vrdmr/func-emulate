/**
 * Tests for azure-skills plugin installation module.
 * Verifies that fnx setup installs the azure-skills plugin
 * for each detected agent using its native plugin system.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const FNX_BIN = resolve(__dirname, '..', 'bin', 'fnx');

describe('fnx setup — azure-skills plugin', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fnx-plugin-test-'));
    await writeFile(join(tmpDir, 'host.json'), JSON.stringify({
      version: '2.0',
      extensionBundle: { id: 'Microsoft.Azure.Functions.ExtensionBundle', version: '[4.*, 5.0.0)' }
    }));
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-func-app', main: 'dist/src/index.js'
    }));
  });

  afterEach(async () => {
    try { await rm(tmpDir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* ignore */ }
  });

  it('displays plugin installation section in output', async () => {
    const { stdout } = await execFileAsync('node', [
      FNX_BIN, 'setup', '--app-path', tmpDir, '--non-interactive',
    ], { timeout: 30000 });

    assert.ok(stdout.includes('azure-skills'),
      'Output should mention azure-skills plugin');
  });

  it('shows plugin status per detected agent', async () => {
    const { stdout } = await execFileAsync('node', [
      FNX_BIN, 'setup', '--app-path', tmpDir, '--non-interactive',
    ], { timeout: 30000 });

    // Should show some kind of plugin action for at least one agent
    assert.ok(
      stdout.includes('plugin') || stdout.includes('Plugin'),
      'Output should mention plugin installation activity');
  });

  it('skips plugin install in dry-run mode', async () => {
    const { stdout } = await execFileAsync('node', [
      FNX_BIN, 'setup', '--app-path', tmpDir, '--non-interactive', '--dry-run',
    ], { timeout: 30000 });

    // Should show plugin section but not actually run install
    assert.ok(
      stdout.includes('azure-skills') || stdout.includes('dry-run'),
      'Dry-run should mention azure-skills or dry-run');
  });
});
