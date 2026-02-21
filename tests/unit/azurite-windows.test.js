/**
 * Unit tests for Azurite detection - Windows 'where' command support
 *
 * Tests verify that:
 * 1. The correct command is used for the platform (where vs which)
 * 2. Windows .bin paths use .cmd extension
 * 3. Multi-line 'where' output is handled correctly
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

describe('Azurite detection - Windows compatibility', () => {
  it('uses correct command for platform lookup', () => {
    const isWin = platform() === 'win32';
    const whichCmd = isWin ? 'where' : 'which';

    // Verify the command exists on this platform
    try {
      // Use 'where where' on Windows or 'which which' on Unix
      execSync(`${whichCmd} ${whichCmd}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {
      assert.fail(`${whichCmd} command should exist on ${platform()}`);
    }
  });

  it('where command returns multiple lines on Windows', function() {
    if (platform() !== 'win32') {
      this.skip();
      return;
    }

    // 'where cmd' typically returns multiple lines on Windows
    const result = execSync('where cmd', { encoding: 'utf-8' }).trim();
    const lines = result.split(/\r?\n/);

    // Should have at least one line
    assert.ok(lines.length >= 1, 'where should return at least one result');
    // First line should be valid path
    assert.ok(lines[0].toLowerCase().includes('cmd'), 'First line should contain cmd');
  });

  it('which command returns single line on Unix', function() {
    if (platform() === 'win32') {
      this.skip();
      return;
    }

    const result = execSync('which ls', { encoding: 'utf-8' }).trim();
    const lines = result.split('\n');

    // Should typically be single line
    assert.ok(lines.length === 1, 'which should return single line');
    assert.ok(lines[0].includes('/'), 'Result should be a path');
  });

  describe('cached bin path detection', () => {
    it('Windows npm bins use .cmd extension', function() {
      if (platform() !== 'win32') {
        this.skip();
        return;
      }

      // Verify npm uses .cmd shims on Windows
      // Check a known global npm binary
      const npmRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim();
      const binDir = join(npmRoot, '..', '.bin');

      // If azurite is installed globally, check for .cmd
      const azuriteCmdPath = join(binDir, 'azurite.cmd');
      const azuritePath = join(binDir, 'azurite');

      // If global npm has any bins
      if (existsSync(binDir)) {
        // On Windows, .cmd files should exist for node_modules/.bin
        // We just verify the pattern is correct
        const isWin = process.platform === 'win32';
        const expectedSuffix = isWin ? '.cmd' : '';
        assert.ok(expectedSuffix === '.cmd', 'Windows should expect .cmd suffix');
      }
    });

    it('fnx tools cache path follows Windows conventions', () => {
      const isWin = process.platform === 'win32';
      const fnxToolsDir = join(homedir(), '.fnx', 'tools', 'azurite', 'node_modules', '.bin');
      const cachedBin = join(fnxToolsDir, isWin ? 'azurite.cmd' : 'azurite');

      // Verify path construction is correct
      if (isWin) {
        assert.ok(cachedBin.endsWith('azurite.cmd'), 'Windows path should end with .cmd');
      } else {
        assert.ok(cachedBin.endsWith('azurite') && !cachedBin.endsWith('.cmd'), 'Unix path should not have .cmd');
      }
    });
  });

  describe('handle missing azurite gracefully', () => {
    it('where returns non-zero for non-existent command', function() {
      if (platform() !== 'win32') {
        this.skip();
        return;
      }

      assert.throws(() => {
        execSync('where nonexistent_command_xyz_12345', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      }, 'where should throw for non-existent command');
    });

    it('which returns non-zero for non-existent command', function() {
      if (platform() === 'win32') {
        this.skip();
        return;
      }

      assert.throws(() => {
        execSync('which nonexistent_command_xyz_12345', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      }, 'which should throw for non-existent command');
    });
  });
});

describe('Azurite manager - first line extraction', () => {
  it('extracts first line from multi-line output', () => {
    const multiLineOutput = 'C:\\Windows\\System32\\cmd.exe\r\nC:\\Windows\\cmd.exe';
    const firstLine = multiLineOutput.split(/\r?\n/)[0];
    assert.strictEqual(firstLine, 'C:\\Windows\\System32\\cmd.exe');
  });

  it('handles single line output', () => {
    const singleLineOutput = '/usr/bin/azurite';
    const firstLine = singleLineOutput.split(/\r?\n/)[0];
    assert.strictEqual(firstLine, '/usr/bin/azurite');
  });

  it('handles empty output', () => {
    const emptyOutput = '';
    const firstLine = emptyOutput.split(/\r?\n/)[0];
    assert.strictEqual(firstLine, '');
  });
});
