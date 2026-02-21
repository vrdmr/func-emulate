/**
 * Unit tests for fnx pack command - Windows Compress-Archive support
 *
 * These tests verify that packFunctionApp works correctly on Windows by using
 * PowerShell's Compress-Archive instead of the Unix zip command.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { packFunctionApp } from '../../fnx/lib/pack.js';

describe('fnx pack - Windows Compress-Archive support', () => {
  let testAppDir;
  let outputZip;

  before(() => {
    // Create a minimal test function app
    testAppDir = mkdtempSync(join(tmpdir(), 'fnx-pack-test-'));
    outputZip = join(testAppDir, 'output.zip');

    // Create host.json
    writeFileSync(join(testAppDir, 'host.json'), JSON.stringify({ version: '2.0' }));

    // Create local.settings.json with runtime
    writeFileSync(join(testAppDir, 'local.settings.json'), JSON.stringify({
      IsEncrypted: false,
      Values: {
        AzureWebJobsStorage: 'UseDevelopmentStorage=true',
        FUNCTIONS_WORKER_RUNTIME: 'node'
      }
    }));

    // Create a simple function
    mkdirSync(join(testAppDir, 'src'), { recursive: true });
    writeFileSync(join(testAppDir, 'src', 'index.js'), 'module.exports = async function(context) { return { body: "Hello" }; };');

    // Create package.json
    writeFileSync(join(testAppDir, 'package.json'), JSON.stringify({ name: 'test-app', version: '1.0.0' }));

    // Create .funcignore
    writeFileSync(join(testAppDir, '.funcignore'), 'local.settings.json\n.git\n');
  });

  after(() => {
    if (testAppDir && existsSync(testAppDir)) {
      rmSync(testAppDir, { recursive: true, force: true });
    }
  });

  it('creates a valid zip file on current platform', async () => {
    const result = await packFunctionApp({
      scriptRoot: testAppDir,
      runtime: 'node',
      outputPath: outputZip,
      noBuild: true,
    });

    // Verify output file exists
    assert.ok(existsSync(outputZip), 'Zip file should be created');
    assert.strictEqual(result.runtime, 'node');
    assert.ok(result.filesIncluded > 0, 'Should include at least one file');
    assert.ok(result.outputPath.endsWith('.zip'), 'Output should be a zip file');
  });

  it('zip file contains expected files', async () => {
    // First create the zip if not exists
    if (!existsSync(outputZip)) {
      await packFunctionApp({
        scriptRoot: testAppDir,
        runtime: 'node',
        outputPath: outputZip,
        noBuild: true,
      });
    }

    // Verify contents using platform-appropriate tool
    let contents;
    if (platform() === 'win32') {
      // Use PowerShell to extract and list zip contents
      try {
        execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${outputZip}' -DestinationPath '${join(testAppDir, 'extracted')}' -Force"`, { encoding: 'utf-8' });
        contents = execSync(`powershell -NoProfile -Command "Get-ChildItem -Path '${join(testAppDir, 'extracted')}' -Recurse | Select-Object -ExpandProperty Name"`, { encoding: 'utf-8' });
      } catch (e) {
        // If extraction fails, the zip is invalid
        assert.fail(`Failed to extract zip: ${e.message}`);
      }
    } else {
      // Use unzip -l on Unix
      contents = execSync(`unzip -l "${outputZip}"`, { encoding: 'utf-8' });
    }

    // Verify expected files are present
    assert.ok(contents.includes('host.json'), 'Zip should contain host.json');
    assert.ok(contents.includes('package.json'), 'Zip should contain package.json');

    // Verify .funcignore exclusions worked
    assert.ok(!contents.includes('local.settings.json'), 'Zip should NOT contain local.settings.json (excluded by .funcignore)');
  });

  it('handles paths with spaces on Windows', async function() {
    // Skip on non-Windows for this specific test
    if (platform() !== 'win32') {
      this.skip();
      return;
    }

    const spaceDir = mkdtempSync(join(tmpdir(), 'fnx pack test spaces '));
    const spaceZip = join(spaceDir, 'output with spaces.zip');

    try {
      writeFileSync(join(spaceDir, 'host.json'), JSON.stringify({ version: '2.0' }));
      writeFileSync(join(spaceDir, 'local.settings.json'), JSON.stringify({
        IsEncrypted: false,
        Values: { FUNCTIONS_WORKER_RUNTIME: 'node' }
      }));
      writeFileSync(join(spaceDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));

      const result = await packFunctionApp({
        scriptRoot: spaceDir,
        runtime: 'node',
        outputPath: spaceZip,
        noBuild: true,
      });

      assert.ok(existsSync(spaceZip), 'Zip should be created even with spaces in path');
      assert.ok(result.filesIncluded > 0);
    } finally {
      rmSync(spaceDir, { recursive: true, force: true });
    }
  });

  it('handles paths with single quotes on Windows', async function() {
    // Skip on non-Windows for this specific test
    if (platform() !== 'win32') {
      this.skip();
      return;
    }

    // Windows allows single quotes in directory names
    const quoteDir = mkdtempSync(join(tmpdir(), "fnx-pack-test'quote-"));
    const quoteZip = join(quoteDir, 'output.zip');

    try {
      writeFileSync(join(quoteDir, 'host.json'), JSON.stringify({ version: '2.0' }));
      writeFileSync(join(quoteDir, 'local.settings.json'), JSON.stringify({
        IsEncrypted: false,
        Values: { FUNCTIONS_WORKER_RUNTIME: 'node' }
      }));
      writeFileSync(join(quoteDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));

      const result = await packFunctionApp({
        scriptRoot: quoteDir,
        runtime: 'node',
        outputPath: quoteZip,
        noBuild: true,
      });

      assert.ok(existsSync(quoteZip), 'Zip should be created even with single quotes in path');
      assert.ok(result.filesIncluded > 0);
    } finally {
      rmSync(quoteDir, { recursive: true, force: true });
    }
  });
});

describe('platform detection for zip command', () => {
  it('detects current platform correctly', () => {
    const os = platform();
    assert.ok(['win32', 'darwin', 'linux'].includes(os), `Platform should be recognized: ${os}`);
  });

  it('on Windows, PowerShell is available', async function() {
    if (platform() !== 'win32') {
      this.skip();
      return;
    }

    // Verify PowerShell is available
    const result = execSync('powershell -NoProfile -Command "$PSVersionTable.PSVersion.Major"', { encoding: 'utf-8' });
    const version = parseInt(result.trim(), 10);
    assert.ok(version >= 5, `PowerShell version should be 5+, got ${version}`);
  });
});
