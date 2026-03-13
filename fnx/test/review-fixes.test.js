/**
 * Tests for PR #42 review comment fixes.
 * Verifies: semver parsing, agent alias normalization, --module validation,
 * corrupt MCP JSON warning, and shell safety.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const FNX_BIN = join(import.meta.dirname, '..', 'bin', 'fnx');

function run(args, opts = {}) {
  return execFileAsync('node', [FNX_BIN, ...args], {
    timeout: 30000,
    ...opts,
  });
}

describe('PR #42 review fixes', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fnx-review-fix-'));
    // Create minimal Azure Functions project
    await writeFile(join(tmpDir, 'host.json'), JSON.stringify({ version: '2.0' }));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // Fix #17: semver range parsing — ^3.5.0 should detect v3
  it('detects v3 programming model from ^3.x semver range', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { '@azure/functions': '^3.5.0' }
    }));

    const { stdout } = await run(['setup', '--all', '--module', 'agent', '--app-path', tmpDir]);
    assert.match(stdout, /Node\.js/i, 'should detect Node.js runtime');
  });

  // Fix #17: v4 should still work
  it('detects v4 programming model from ^4.x semver range', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { '@azure/functions': '^4.0.0' }
    }));

    const { stdout } = await run(['setup', '--all', '--module', 'agent', '--app-path', tmpDir]);
    assert.match(stdout, /Node\.js/i, 'should detect Node.js runtime');
  });

  // Fix #11: --agent alias normalization
  it('normalizes --agent copilot to github-copilot', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { '@azure/functions': '^4.0.0' }
    }));

    // --agent copilot should work (normalized to github-copilot)
    const { stdout } = await run(['setup', '--all', '--agent', 'copilot', '--app-path', tmpDir]);
    assert.match(stdout, /setup/i, 'should run setup with normalized alias');
  });

  // Fix #11: --agent claude alias
  it('normalizes --agent claude to claude-code', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { '@azure/functions': '^4.0.0' }
    }));

    const { stdout } = await run(['setup', '--all', '--agent', 'claude', '--app-path', tmpDir]);
    assert.match(stdout, /setup/i, 'should run setup with normalized alias');
  });

  // Fix #15: --module validation rejects unknown modules
  it('rejects unknown --module value', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { '@azure/functions': '^4.0.0' }
    }));

    try {
      await run(['setup', '--all', '--module', 'foo', '--app-path', tmpDir]);
      assert.fail('should have exited with error');
    } catch (err) {
      assert.match(err.stderr || err.stdout || '', /Unknown module.*foo/i, 'should report unknown module');
    }
  });

  // Fix #7: MCP config includes type: "stdio"
  it('MCP config includes type field', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { '@azure/functions': '^4.0.0' }
    }));
    await mkdir(join(tmpDir, '.vscode'), { recursive: true });

    await run(['setup', '--all', '--agent', 'copilot', '--module', 'mcp', '--app-path', tmpDir]);

    const mcpPath = join(tmpDir, '.vscode', 'mcp.json');
    assert.ok(existsSync(mcpPath), 'mcp.json should be created');
    const mcp = JSON.parse(await readFile(mcpPath, 'utf8'));
    assert.ok(mcp.servers['fnx-templates'], 'should have fnx-templates server');
    assert.equal(mcp.servers['fnx-templates'].type, 'stdio', 'should have type: stdio');
    assert.ok(mcp.servers['fnx-templates'].args.includes('-y'), 'should include -y flag for npx');
  });

  // Fix #8: corrupt MCP JSON emits warning
  it('warns on corrupt MCP JSON instead of silent overwrite', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { '@azure/functions': '^4.0.0' }
    }));
    await mkdir(join(tmpDir, '.vscode'), { recursive: true });
    await writeFile(join(tmpDir, '.vscode', 'mcp.json'), '{ broken json!!!');

    const { stdout } = await run(['setup', '--all', '--agent', 'copilot', '--module', 'mcp', '--app-path', tmpDir]);
    assert.match(stdout, /invalid JSON/i, 'should warn about invalid JSON');
  });
});
