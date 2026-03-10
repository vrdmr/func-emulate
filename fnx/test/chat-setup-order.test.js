/**
 * Integration tests for fnx chat — setup ordering.
 * Verifies that fnx chat runs setup AFTER agent selection, not before.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const FNX_BIN = resolve(__dirname, '..', 'bin', 'fnx');

describe('fnx chat — setup ordering', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fnx-chat-test-'));
    // Minimal Azure Functions project (no skills installed)
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

  it('does not run setup before agent validation for invalid agent', async () => {
    // fnx chat with an invalid --agent should fail WITHOUT running setup first
    try {
      await execFileAsync('node', [FNX_BIN, 'chat', '--app-path', tmpDir, '--agent', 'nonexistent-agent'], {
        timeout: 15000,
      });
    } catch {
      // Expected to fail (unknown agent)
    }

    // Skills should NOT have been installed before the agent error
    const skillsDir = join(tmpDir, '.agents', 'skills');
    assert.ok(!existsSync(skillsDir),
      '.agents/skills/ should NOT exist — setup should not run before agent validation');
  });

  it('installs skills when using valid --agent flag', async () => {
    // Use --agent github-copilot — setup should run, then launch will fail/succeed
    try {
      await execFileAsync('node', [FNX_BIN, 'chat', '--app-path', tmpDir, '--agent', 'github-copilot'], {
        timeout: 15000,
      });
    } catch {
      // Expected — copilot binary may exit or error
    }

    // Skills SHOULD be installed (setup ran after agent was validated)
    const skillsDir = join(tmpDir, '.agents', 'skills');
    assert.ok(existsSync(skillsDir),
      '.agents/skills/ should exist — setup runs for valid agent');

    // Verify skills have references/
    const introRefs = join(skillsDir, 'fnx-intro', 'references');
    assert.ok(existsSync(introRefs),
      'fnx-intro/references/ should be copied by setup');
  });

  it('generates copilot-instructions.md when copilot agent selected', async () => {
    try {
      await execFileAsync('node', [FNX_BIN, 'chat', '--app-path', tmpDir, '--agent', 'github-copilot'], {
        timeout: 15000,
      });
    } catch {
      // Expected
    }

    const copilotInstr = join(tmpDir, '.github', 'copilot-instructions.md');
    assert.ok(existsSync(copilotInstr),
      '.github/copilot-instructions.md should exist for selected copilot agent');
  });
});
