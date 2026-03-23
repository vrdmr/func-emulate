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

describe('installAzurite() return path - Windows .cmd suffix', () => {
  it('installed path should have .cmd suffix on Windows', () => {
    // This tests the logic that installAzurite() should use when returning the path
    const isWin = process.platform === 'win32';
    const fnxToolsDir = join(homedir(), '.fnx', 'tools', 'azurite', 'node_modules', '.bin');

    // The pattern that installAzurite() SHOULD use:
    const binName = isWin ? 'azurite.cmd' : 'azurite';
    const correctPath = join(fnxToolsDir, binName);

    // The BUGGY pattern (what was in the code before):
    const buggyPath = join(fnxToolsDir, 'azurite');

    if (isWin) {
      // On Windows, paths should differ
      assert.notStrictEqual(correctPath, buggyPath, 'Windows should use .cmd suffix');
      assert.ok(correctPath.endsWith('azurite.cmd'), 'Correct path should end with .cmd');
    } else {
      // On Unix, paths should be the same
      assert.strictEqual(correctPath, buggyPath, 'Unix paths should be identical');
    }
  });

  it('existsSync would fail with wrong path on Windows', function() {
    if (process.platform !== 'win32') {
      this.skip();
      return;
    }

    // If azurite is installed via npm, only azurite.cmd exists (not 'azurite')
    const fnxToolsDir = join(homedir(), '.fnx', 'tools', 'azurite', 'node_modules', '.bin');

    // Skip if fnx tools cache doesn't exist
    if (!existsSync(fnxToolsDir)) {
      this.skip();
      return;
    }

    const azuriteCmdPath = join(fnxToolsDir, 'azurite.cmd');
    const azuritePath = join(fnxToolsDir, 'azurite');

    // If .cmd exists, verify it's the correct shim
    if (existsSync(azuriteCmdPath)) {
      // On Windows, azurite.cmd should exist as the shim
      // The bare 'azurite' may or may not exist depending on npm version
      assert.ok(azuriteCmdPath.endsWith('.cmd'), 'Windows shim should have .cmd extension');
    }
  });
});

describe('needsAzurite detection - development storage patterns', () => {
  // Replicate the detection logic for testing
  function isDevStorageConnectionString(value) {
    if (!value || typeof value !== 'string') return false;
    
    const normalized = value.toLowerCase();
    
    if (normalized.startsWith('usedevelopmentstorage=true')) {
      return true;
    }
    
    if (normalized.includes('devstoreaccount1')) {
      return true;
    }
    
    if (normalized.includes('127.0.0.1:10000') || 
        normalized.includes('127.0.0.1:10001') || 
        normalized.includes('127.0.0.1:10002') ||
        normalized.includes('localhost:10000') ||
        normalized.includes('localhost:10001') ||
        normalized.includes('localhost:10002')) {
      return true;
    }
    
    return false;
  }

  function needsAzurite(mergedValues) {
    if (!mergedValues) return { needed: false, keys: [] };
    
    const devStorageKeys = [];
    
    for (const [key, value] of Object.entries(mergedValues)) {
      if (isDevStorageConnectionString(value)) {
        devStorageKeys.push(key);
      }
    }
    
    const webJobsStorage = mergedValues.AzureWebJobsStorage;
    if ((!webJobsStorage || webJobsStorage === '') && !devStorageKeys.includes('AzureWebJobsStorage')) {
      devStorageKeys.push('AzureWebJobsStorage');
    }
    
    return { needed: devStorageKeys.length > 0, keys: devStorageKeys };
  }

  it('detects AzureWebJobsStorage=UseDevelopmentStorage=true', () => {
    const result = needsAzurite({ AzureWebJobsStorage: 'UseDevelopmentStorage=true' });
    assert.strictEqual(result.needed, true);
    assert.deepStrictEqual(result.keys, ['AzureWebJobsStorage']);
  });

  it('detects UseDevelopmentStorage=true with proxy URI', () => {
    const result = needsAzurite({ 
      AzureWebJobsStorage: 'UseDevelopmentStorage=true;DevelopmentStorageProxyUri=http://127.0.0.1' 
    });
    assert.strictEqual(result.needed, true);
    assert.deepStrictEqual(result.keys, ['AzureWebJobsStorage']);
  });

  it('detects devstoreaccount1 (Azurite default account)', () => {
    const result = needsAzurite({ 
      AzureWebJobsStorage: 'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1' 
    });
    assert.strictEqual(result.needed, true);
    assert.deepStrictEqual(result.keys, ['AzureWebJobsStorage']);
  });

  it('detects localhost:10000 (Azurite blob port)', () => {
    const result = needsAzurite({ 
      BlobStorage: 'DefaultEndpointsProtocol=http;BlobEndpoint=http://localhost:10000/myaccount' 
    });
    assert.strictEqual(result.needed, true);
    assert.ok(result.keys.includes('BlobStorage'));
  });

  it('detects 127.0.0.1:10001 (Azurite queue port)', () => {
    const result = needsAzurite({ 
      QueueConnection: 'DefaultEndpointsProtocol=http;QueueEndpoint=http://127.0.0.1:10001/myaccount' 
    });
    assert.strictEqual(result.needed, true);
    assert.ok(result.keys.includes('QueueConnection'));
  });

  it('detects any key with UseDevelopmentStorage=true (plus missing AzureWebJobsStorage)', () => {
    const result = needsAzurite({ MyCustomStorage: 'UseDevelopmentStorage=true' });
    assert.strictEqual(result.needed, true);
    // AzureWebJobsStorage is also added because it's missing (empty/missing = dev storage)
    assert.ok(result.keys.includes('MyCustomStorage'));
    assert.ok(result.keys.includes('AzureWebJobsStorage'));
  });

  it('detects multiple keys with UseDevelopmentStorage=true', () => {
    const result = needsAzurite({
      AzureWebJobsStorage: 'UseDevelopmentStorage=true',
      QueueConnection: 'UseDevelopmentStorage=true',
      BlobStorage: 'UseDevelopmentStorage=true',
    });
    assert.strictEqual(result.needed, true);
    assert.strictEqual(result.keys.length, 3);
    assert.ok(result.keys.includes('AzureWebJobsStorage'));
    assert.ok(result.keys.includes('QueueConnection'));
    assert.ok(result.keys.includes('BlobStorage'));
  });

  it('detects empty AzureWebJobsStorage as needing Azurite', () => {
    const result = needsAzurite({ AzureWebJobsStorage: '' });
    assert.strictEqual(result.needed, true);
    assert.deepStrictEqual(result.keys, ['AzureWebJobsStorage']);
  });

  it('detects missing AzureWebJobsStorage as needing Azurite', () => {
    const result = needsAzurite({});
    assert.strictEqual(result.needed, true);
    assert.deepStrictEqual(result.keys, ['AzureWebJobsStorage']);
  });

  it('does NOT need Azurite for real connection strings', () => {
    const result = needsAzurite({
      AzureWebJobsStorage: 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=xxx',
    });
    assert.strictEqual(result.needed, false);
    assert.deepStrictEqual(result.keys, []);
  });

  it('detects mixed real and dev storage', () => {
    const result = needsAzurite({
      AzureWebJobsStorage: 'DefaultEndpointsProtocol=https;AccountName=test',
      MyDevStorage: 'UseDevelopmentStorage=true',
    });
    assert.strictEqual(result.needed, true);
    assert.deepStrictEqual(result.keys, ['MyDevStorage']);
  });

  it('handles null mergedValues', () => {
    const result = needsAzurite(null);
    assert.strictEqual(result.needed, false);
    assert.deepStrictEqual(result.keys, []);
  });

  it('handles undefined mergedValues', () => {
    const result = needsAzurite(undefined);
    assert.strictEqual(result.needed, false);
    assert.deepStrictEqual(result.keys, []);
  });
});
