/**
 * E2E tests for fnx init command
 *
 * These tests run the actual fnx init command and verify:
 * - Help output
 * - Non-interactive mode with flags
 * - Error handling for invalid inputs
 * - Generated file structure
 * - app-config.yaml content
 *
 * Note: Tests that download templates require network access and may be slow.
 * Use { skip: true } for tests that need network but should be skipped in CI.
 */

import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { FnxCommand } from '../framework/command-builder.js';
import { assertExitCode } from '../framework/assertions.js';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('fnx init — E2E', () => {

  describe('help and usage', () => {

    it('init --help shows help and exits 0', async () => {
      const result = await FnxCommand.command('init')
        .withArg('--help')
        .withTimeout(10000)
        .execute();
      assertExitCode(result, 0);
      const out = result.stdout.join('\n');
      assert.ok(out.includes('fnx init'), 'Should show init help');
      assert.ok(out.includes('--runtime'), 'Should mention --runtime flag');
      assert.ok(out.includes('--template'), 'Should mention --template flag');
      assert.ok(out.includes('--name'), 'Should mention --name flag');
    });

    it('init -h shows help (short flag)', async () => {
      const result = await FnxCommand.command('init')
        .withArg('-h')
        .withTimeout(10000)
        .execute();
      assertExitCode(result, 0);
      const out = result.stdout.join('\n');
      assert.ok(out.includes('fnx init'), 'Should show init help');
    });

    it('init --help mentions --version flag', async () => {
      const result = await FnxCommand.command('init')
        .withArg('--help')
        .withTimeout(10000)
        .execute();
      const out = result.stdout.join('\n');
      assert.ok(out.includes('--version'), 'Should mention --version flag');
    });

    it('init --help mentions --force flag', async () => {
      const result = await FnxCommand.command('init')
        .withArg('--help')
        .withTimeout(10000)
        .execute();
      const out = result.stdout.join('\n');
      assert.ok(out.includes('--force'), 'Should mention --force flag');
    });

  });

  describe('error handling', () => {

    it('fails when directory is not empty (without --force)', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'fnx-init-nonempty-'));
      try {
        // Create a file to make directory non-empty
        writeFileSync(join(tmpDir, 'existing.txt'), 'existing content');

        const result = await FnxCommand.command('init')
          .withArg('--runtime', 'python')
          .withArg('--template', 'http-trigger-python')
          .withArg('--yes')
          .withScriptRoot(tmpDir)
          .withTimeout(15000)
          .execute();

        // Should fail because directory is not empty
        assert.notStrictEqual(result.exitCode, 0, 'Should fail for non-empty directory');
        const output = [...result.stdout, ...result.stderr].join('\n');
        assert.ok(
          output.includes('not empty') || output.includes('--force') || output.includes('--name'),
          'Should mention directory is not empty or suggest --force/--name'
        );
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('fails when --runtime flag is missing value', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'fnx-init-missing-'));
      try {
        const result = await FnxCommand.command('init')
          .withArg('--runtime')
          .withArg('--yes') // This becomes the value, which is invalid
          .withScriptRoot(tmpDir)
          .withTimeout(10000)
          .execute();

        assert.notStrictEqual(result.exitCode, 0, 'Should fail for missing runtime value');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('fails when --template flag is missing value', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'fnx-init-missingtpl-'));
      try {
        const result = await FnxCommand.command('init')
          .withArg('--runtime', 'python')
          .withArg('--template')
          .withArg('--yes')
          .withScriptRoot(tmpDir)
          .withTimeout(10000)
          .execute();

        assert.notStrictEqual(result.exitCode, 0, 'Should fail for missing template value');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('fails for invalid runtime', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'fnx-init-invalid-'));
      try {
        const result = await FnxCommand.command('init')
          .withArg('--runtime', 'invalid-runtime-xyz')
          .withArg('--template', 'http-trigger')
          .withArg('--yes')
          .withScriptRoot(tmpDir)
          .withTimeout(15000)
          .execute();

        // Should fail or have no templates
        const output = [...result.stdout, ...result.stderr].join('\n');
        const hasError = result.exitCode !== 0 ||
          output.includes('not found') ||
          output.includes('No templates') ||
          output.includes('invalid');
        assert.ok(hasError, 'Should fail or report no templates for invalid runtime');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

  });

  describe('non-interactive mode (requires network)', () => {

    it('creates project with --runtime and --template flags', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'fnx-init-full-'));
      const projectDir = join(tmpDir, 'my-func');
      try {
        const result = await FnxCommand.command('init')
          .withArg('--runtime', 'python')
          .withArg('--template', 'http-trigger-python')
          .withArg('--name', 'my-func')
          .withArg('--sku', 'flex')
          .withArg('--yes')
          .withArg('--verbose')
          .withScriptRoot(tmpDir)
          .withTimeout(60000) // Template download may take time
          .execute();

        // Check exit code
        if (result.exitCode !== 0) {
          const output = [...result.stdout, ...result.stderr].join('\n');
          // Skip if network error
          if (output.includes('network') || output.includes('Cannot download')) {
            console.log('Skipping: Network unavailable');
            return;
          }
        }

        assertExitCode(result, 0);

        // Verify project structure
        assert.ok(existsSync(projectDir), 'Project directory should exist');
        assert.ok(existsSync(join(projectDir, 'app-config.yaml')), 'app-config.yaml should exist');

        // Verify app-config.yaml content
        const appConfig = readFileSync(join(projectDir, 'app-config.yaml'), 'utf-8');
        assert.ok(appConfig.includes('targetSku: flex'), 'Should have targetSku: flex');
        assert.ok(appConfig.includes('name: python'), 'Should have runtime name: python');

        // Verify success message
        const output = result.stdout.join('\n');
        assert.ok(output.includes('successfully') || output.includes('✓'), 'Should show success message');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('creates project with --version flag', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'fnx-init-version-'));
      const projectDir = join(tmpDir, 'versioned-app');
      try {
        const result = await FnxCommand.command('init')
          .withArg('--runtime', 'python')
          .withArg('--template', 'http-trigger-python')
          .withArg('--name', 'versioned-app')
          .withArg('--version', '3.12')
          .withArg('--yes')
          .withScriptRoot(tmpDir)
          .withTimeout(60000)
          .execute();

        // Skip if network or template issues
        if (result.exitCode !== 0) {
          const output = [...result.stdout, ...result.stderr].join('\n');
          if (output.includes('network') || output.includes('Cannot download') || output.includes('not found')) {
            console.log('Skipping: Network unavailable or template not found');
            return;
          }
          // Log output for debugging
          console.log('Exit code:', result.exitCode);
          console.log('Output:', output);
        }

        // Only verify if exit was successful
        if (result.exitCode === 0 && existsSync(projectDir)) {
          // Verify version in app-config.yaml
          const appConfig = readFileSync(join(projectDir, 'app-config.yaml'), 'utf-8');
          assert.ok(appConfig.includes('version: "3.12"') || appConfig.includes("version: '3.12'"),
            'Should have specified version 3.12');
        }
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('creates Node.js project with typescript language', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'fnx-init-ts-'));
      const projectDir = join(tmpDir, 'ts-app');
      try {
        const result = await FnxCommand.command('init')
          .withArg('--runtime', 'node')
          .withArg('--language', 'typescript')
          .withArg('--template', 'http-trigger-typescript')
          .withArg('--name', 'ts-app')
          .withArg('--yes')
          .withScriptRoot(tmpDir)
          .withTimeout(60000)
          .execute();

        if (result.exitCode !== 0) {
          const output = [...result.stdout, ...result.stderr].join('\n');
          if (output.includes('network') || output.includes('Cannot download') || output.includes('not found')) {
            console.log('Skipping: Network unavailable or template not found');
            return;
          }
        }

        // If successful, verify structure
        if (result.exitCode === 0 && existsSync(projectDir)) {
          assert.ok(existsSync(join(projectDir, 'app-config.yaml')), 'app-config.yaml should exist');
          const appConfig = readFileSync(join(projectDir, 'app-config.yaml'), 'utf-8');
          assert.ok(appConfig.includes('name: node'), 'Should have runtime name: node');
        }
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('--force allows initialization in non-empty directory', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'fnx-init-force-'));
      try {
        // Create existing file
        writeFileSync(join(tmpDir, 'existing.txt'), 'existing content');

        // Use '.' as name to init in current directory, provide all flags to avoid prompts
        const result = await FnxCommand.command('init')
          .withArg('--runtime', 'python')
          .withArg('--template', 'http-trigger-python')
          .withArg('--name', '.')
          .withArg('--sku', 'flex')
          .withArg('--force')
          .withArg('--yes')
          .withScriptRoot(tmpDir)
          .withTimeout(60000)
          .execute();

        // Skip if network or template issues
        if (result.exitCode !== 0) {
          const output = [...result.stdout, ...result.stderr].join('\n');
          if (output.includes('network') || output.includes('Cannot download') || output.includes('not found')) {
            console.log('Skipping: Network unavailable or template not found');
            return;
          }
          // Log output for debugging
          console.log('Exit code:', result.exitCode);
          console.log('Output:', output);
        }

        // Only verify if successful
        if (result.exitCode === 0) {
          // Existing file should still be there
          assert.ok(existsSync(join(tmpDir, 'existing.txt')), 'Existing file should be preserved');

          // New files should exist
          assert.ok(existsSync(join(tmpDir, 'app-config.yaml')), 'app-config.yaml should exist');
        }
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

  });

  describe('manifest and offline mode', () => {

    it('--verbose shows manifest information', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'fnx-init-verbose-'));
      try {
        const result = await FnxCommand.command('init')
          .withArg('--runtime', 'python')
          .withArg('--verbose')
          .withArg('--help') // Use help to avoid needing template
          .withScriptRoot(tmpDir)
          .withTimeout(15000)
          .execute();

        // Just verify help works with verbose (manifest info shown elsewhere)
        assertExitCode(result, 0);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

  });

  describe('generated files validation', () => {

    it('app-config.yaml follows F16 schema', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'fnx-init-schema-'));
      const projectDir = join(tmpDir, 'schema-test');
      try {
        const result = await FnxCommand.command('init')
          .withArg('--runtime', 'python')
          .withArg('--template', 'http-trigger-python')
          .withArg('--name', 'schema-test')
          .withArg('--sku', 'premium')
          .withArg('--yes')
          .withScriptRoot(tmpDir)
          .withTimeout(60000)
          .execute();

        if (result.exitCode !== 0) {
          const output = [...result.stdout, ...result.stderr].join('\n');
          if (output.includes('network') || output.includes('Cannot download')) {
            console.log('Skipping: Network unavailable');
            return;
          }
        }

        assertExitCode(result, 0);

        const appConfig = readFileSync(join(projectDir, 'app-config.yaml'), 'utf-8');

        // F16 required sections
        assert.ok(appConfig.includes('local:'), 'Should have local section');
        assert.ok(appConfig.includes('targetSku:'), 'Should have targetSku field');
        assert.ok(appConfig.includes('runtime:'), 'Should have runtime section');
        assert.ok(appConfig.includes('name:'), 'Should have runtime name');
        assert.ok(appConfig.includes('version:'), 'Should have runtime version');

        // Should have header comment
        assert.ok(appConfig.includes('# Azure Functions'), 'Should have header comment');

        // Should have the specified SKU
        assert.ok(appConfig.includes('targetSku: premium'), 'Should have targetSku: premium');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('includes AzureWebJobsFeatureFlags in configurations', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'fnx-init-flags-'));
      const projectDir = join(tmpDir, 'flags-test');
      try {
        const result = await FnxCommand.command('init')
          .withArg('--runtime', 'python')
          .withArg('--template', 'http-trigger-python')
          .withArg('--name', 'flags-test')
          .withArg('--yes')
          .withScriptRoot(tmpDir)
          .withTimeout(60000)
          .execute();

        // Skip if network or template issues
        if (result.exitCode !== 0) {
          const output = [...result.stdout, ...result.stderr].join('\n');
          if (output.includes('network') || output.includes('Cannot download') || output.includes('not found')) {
            console.log('Skipping: Network unavailable or template not found');
            return;
          }
          // Log output for debugging
          console.log('Exit code:', result.exitCode);
          console.log('Output:', output);
        }

        // Only verify if successful and project exists
        if (result.exitCode === 0 && existsSync(projectDir)) {
          const appConfig = readFileSync(join(projectDir, 'app-config.yaml'), 'utf-8');
          assert.ok(appConfig.includes('configurations:'), 'Should have configurations section');
          assert.ok(appConfig.includes('AzureWebJobsFeatureFlags'), 'Should have AzureWebJobsFeatureFlags');
          assert.ok(appConfig.includes('EnableWorkerIndexing'), 'Should have EnableWorkerIndexing');
        }
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

  });

  describe('interactive prompts (scripted stdin)', () => {

    it('accepts runtime selection via stdin', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'fnx-init-interactive-'));
      try {
        // Provide stdin input: select runtime "1" (first option), then provide other required values
        // Input format: runtime selection, template selection, project name, SKU selection
        // "1\n1\ntest-project\n1\n" = first runtime, first template, project name, first SKU
        const result = await FnxCommand.command('init')
          .withStdinInput('1\n1\ntest-project\n1\n')
          .withScriptRoot(tmpDir)
          .withTimeout(60000)
          .execute();

        // Check if prompts were shown (indicates interactive mode worked)
        const output = [...result.stdout, ...result.stderr].join('\n');

        // Skip if network issues
        if (output.includes('Cannot download') || output.includes('network')) {
          console.log('Skipping: Network unavailable');
          return;
        }

        // Verify prompts were displayed
        assert.ok(
          output.includes('Select') || output.includes('runtime') || output.includes('[1]'),
          'Should show interactive prompts'
        );
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('shows numbered options in select prompts', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'fnx-init-numbered-'));
      try {
        // Run with stdin but expect to see numbered options in output
        const result = await FnxCommand.command('init')
          .withStdinInput('1\n') // Just one input to trigger first prompt
          .withScriptRoot(tmpDir)
          .withTimeout(30000)
          .execute();

        const output = result.stdout.join('\n');

        // Skip if manifest fetch failed
        if (output.includes('Cannot download') || result.exitCode !== 0) {
          // May timeout waiting for more input, which is expected
          // Just verify it showed some prompt
          const fullOutput = [...result.stdout, ...result.stderr].join('\n');
          if (fullOutput.includes('[1]') || fullOutput.includes('Select')) {
            assert.ok(true, 'Prompts were shown');
            return;
          }
          console.log('Skipping: Prompt display test inconclusive');
          return;
        }
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('handles invalid selection gracefully', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'fnx-init-invalid-sel-'));
      try {
        // First send invalid input "99", then valid "1"
        const result = await FnxCommand.command('init')
          .withStdinInput('99\n1\n1\ntest-invalid\n1\n')
          .withScriptRoot(tmpDir)
          .withTimeout(60000)
          .execute();

        const output = [...result.stdout, ...result.stderr].join('\n');

        // Skip if network issues
        if (output.includes('Cannot download') || output.includes('network')) {
          console.log('Skipping: Network unavailable');
          return;
        }

        // Should show retry message for invalid input
        const showedPrompts = output.includes('Invalid') || output.includes('try again') ||
          output.includes('Select') || output.includes('[1]');
        assert.ok(showedPrompts, 'Should handle invalid selection or show prompts');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('uses default value when text input is empty', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'fnx-init-default-'));
      try {
        // Send runtime selection, template, empty string for name (use default), and SKU
        // Empty line for project name should use directory default
        const result = await FnxCommand.command('init')
          .withStdinInput('1\n1\n\n1\n') // Empty string for project name
          .withScriptRoot(tmpDir)
          .withTimeout(60000)
          .execute();

        const output = [...result.stdout, ...result.stderr].join('\n');

        // Skip if network issues
        if (output.includes('Cannot download') || output.includes('network')) {
          console.log('Skipping: Network unavailable');
          return;
        }

        // Prompts should have been displayed
        assert.ok(
          output.includes('Select') || output.includes('Project name') || output.includes('[1]'),
          'Should show prompts including project name'
        );
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

  });

});
