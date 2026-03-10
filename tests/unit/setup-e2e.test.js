import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FNX_BIN = resolve(__dirname, '..', '..', 'fnx', 'bin', 'fnx');

function run(args, opts = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env, NO_COLOR: '1', ...opts.env };
    execFile('node', [FNX_BIN, ...args], { env, cwd: opts.cwd, timeout: 30000 }, (err, stdout, stderr) => {
      resolve({ exitCode: err ? err.code ?? 1 : 0, stdout, stderr });
    });
  });
}

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), 'fnx-setup-'));
}

function createMinimalProject(dir) {
  writeFileSync(join(dir, 'host.json'), '{}');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    dependencies: { '@azure/functions': '^4.0.0' }
  }));
  writeFileSync(join(dir, 'tsconfig.json'), '{}');
  mkdirSync(join(dir, 'src', 'functions'), { recursive: true });
  writeFileSync(join(dir, 'src', 'functions', 'hello.ts'), `
    import { app } from '@azure/functions';
    app.http('hello', { methods: ['GET'], handler: async (req) => ({ body: 'ok' }) });
  `);
  // Create .vscode so Copilot is detected
  mkdirSync(join(dir, '.vscode'), { recursive: true });
}

describe('fnx setup --help', { timeout: 30000 }, () => {
  it('exits 0 and shows usage', async () => {
    const result = await run(['setup', '--help']);
    assert.equal(result.exitCode, 0);
    const out = result.stdout;
    for (const term of ['fnx setup', '--module', '--all', '--dry-run', '--force']) {
      assert.ok(out.includes(term), `Should contain "${term}"`);
    }
  });
});

describe('fnx chat --help', { timeout: 30000 }, () => {
  it('exits 0 and shows usage', async () => {
    const result = await run(['chat', '--help']);
    assert.equal(result.exitCode, 0);
    const out = result.stdout;
    for (const term of ['fnx chat', '--agent', '--app-path', '--prompt']) {
      assert.ok(out.includes(term), `Should contain "${term}"`);
    }
  });
});

describe('fnx setup --all', { timeout: 60000 }, () => {
  let tmp;

  afterEach(() => {
    if (tmp && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  });

  it('succeeds even when no host.json is present (empty dir)', async () => {
    tmp = makeTmpDir();
    mkdirSync(join(tmp, '.vscode'), { recursive: true });
    const result = await run(['setup', '--all', '--app-path', tmp]);
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes('No Azure Functions project detected'),
      'Should warn about missing project');
  });

  it('creates agent files for a Node.js project', async () => {
    tmp = makeTmpDir();
    createMinimalProject(tmp);

    const result = await run(['setup', '--all', '--app-path', tmp]);
    assert.equal(result.exitCode, 0);

    // AGENTS.md should be created
    assert.ok(existsSync(join(tmp, 'AGENTS.md')), 'AGENTS.md should exist');
    const agentsMd = readFileSync(join(tmp, 'AGENTS.md'), 'utf8');
    assert.ok(agentsMd.includes('Node.js'), 'AGENTS.md should mention Node.js');
    assert.ok(agentsMd.includes('hello'), 'AGENTS.md should mention the function name');

    // Copilot instructions should be created (because .vscode/ exists)
    assert.ok(existsSync(join(tmp, '.github', 'copilot-instructions.md')),
      'copilot-instructions.md should exist');

    // Skills should be copied to .agents/skills/
    const skillDirs = ['fnx-diagnostics', 'fnx-best-practices', 'fnx-create-function', 'fnx-intro', 'fnx-feedback'];
    for (const skill of skillDirs) {
      assert.ok(existsSync(join(tmp, '.agents', 'skills', skill, 'SKILL.md')),
        `.agents/skills/${skill}/SKILL.md should exist`);
    }
  });

  it('creates MCP config in .vscode/mcp.json', async () => {
    tmp = makeTmpDir();
    createMinimalProject(tmp);

    const result = await run(['setup', '--all', '--app-path', tmp]);
    assert.equal(result.exitCode, 0);

    assert.ok(existsSync(join(tmp, '.vscode', 'mcp.json')), '.vscode/mcp.json should exist');
    const mcp = JSON.parse(readFileSync(join(tmp, '.vscode', 'mcp.json'), 'utf8'));
    assert.ok(mcp.servers?.['fnx-templates'], 'Should have fnx-templates server');
  });

  it('is idempotent — second run skips existing files', async () => {
    tmp = makeTmpDir();
    createMinimalProject(tmp);

    // First run
    await run(['setup', '--all', '--app-path', tmp]);
    const agentsMd1 = readFileSync(join(tmp, 'AGENTS.md'), 'utf8');

    // Second run
    const result2 = await run(['setup', '--all', '--app-path', tmp]);
    assert.equal(result2.exitCode, 0);
    assert.ok(result2.stdout.includes('exists') || result2.stdout.includes('skipp'),
      'Second run should mention files exist or are skipped');

    // Content should be unchanged
    const agentsMd2 = readFileSync(join(tmp, 'AGENTS.md'), 'utf8');
    assert.equal(agentsMd1, agentsMd2, 'AGENTS.md should not change on second run');
  });

  it('merges MCP config without overwriting existing servers', async () => {
    tmp = makeTmpDir();
    createMinimalProject(tmp);

    // Pre-populate .vscode/mcp.json with an existing server
    writeFileSync(join(tmp, '.vscode', 'mcp.json'), JSON.stringify({
      servers: {
        'my-existing-server': { command: 'my-server', args: [] }
      }
    }, null, 2));

    const result = await run(['setup', '--all', '--app-path', tmp]);
    assert.equal(result.exitCode, 0);

    const mcp = JSON.parse(readFileSync(join(tmp, '.vscode', 'mcp.json'), 'utf8'));
    assert.ok(mcp.servers?.['my-existing-server'], 'Existing server should be preserved');
    assert.ok(mcp.servers?.['fnx-templates'], 'fnx-templates should be added');
  });

  it('supports --module agent to only apply skills', async () => {
    tmp = makeTmpDir();
    createMinimalProject(tmp);

    const result = await run(['setup', '--module', 'agent', '--non-interactive', '--app-path', tmp]);
    assert.equal(result.exitCode, 0);

    // Skills should exist
    assert.ok(existsSync(join(tmp, '.agents', 'skills', 'fnx-diagnostics', 'SKILL.md')));
    // MCP should NOT be created (only agent module)
    assert.ok(!existsSync(join(tmp, '.vscode', 'mcp.json')),
      '.vscode/mcp.json should NOT exist with --module agent');
  });

  it('supports --module mcp to only apply MCP config', async () => {
    tmp = makeTmpDir();
    createMinimalProject(tmp);

    const result = await run(['setup', '--module', 'mcp', '--non-interactive', '--app-path', tmp]);
    assert.equal(result.exitCode, 0);

    // MCP should exist
    assert.ok(existsSync(join(tmp, '.vscode', 'mcp.json')),
      '.vscode/mcp.json should exist with --module mcp');
    // Skills should NOT exist
    assert.ok(!existsSync(join(tmp, '.agents')),
      '.agents/ should NOT exist with --module mcp');
  });
});

describe('fnx chat auto-setup', { timeout: 60000 }, () => {
  let tmp;

  afterEach(() => {
    if (tmp && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  });

  it('auto-runs setup when skills are not installed', async () => {
    tmp = makeTmpDir();
    createMinimalProject(tmp);

    // Verify no skills before chat
    assert.ok(!existsSync(join(tmp, '.agents')), 'No .agents/ before chat');

    // Run chat with a nonexistent agent to trigger setup but fail at launch
    // (we just want to verify setup runs, not actually launch an agent)
    const result = await run(['chat', '--agent', 'nonexistent-agent', '--app-path', tmp]);

    // Skills should be auto-installed even though agent launch fails
    assert.ok(existsSync(join(tmp, '.agents', 'skills', 'fnx-diagnostics', 'SKILL.md')),
      'Skills should be auto-installed by fnx chat');
    assert.ok(existsSync(join(tmp, 'AGENTS.md')),
      'AGENTS.md should be auto-created by fnx chat');
  });

  it('skips auto-setup when skills are already installed', async () => {
    tmp = makeTmpDir();
    createMinimalProject(tmp);

    // Pre-install skills via setup
    await run(['setup', '--all', '--app-path', tmp]);
    assert.ok(existsSync(join(tmp, '.agents', 'skills', 'fnx-diagnostics', 'SKILL.md')));

    // Run chat — should NOT re-run setup
    const result = await run(['chat', '--agent', 'nonexistent-agent', '--app-path', tmp]);

    // Should not mention "auto-setup" or "Running fnx setup"
    assert.ok(!result.stdout.includes('Running fnx setup'),
      'Should not re-run setup when skills already exist');
  });

  it('auto-runs setup from empty directory (no host.json)', async () => {
    tmp = makeTmpDir();
    // Empty dir — no host.json, no package.json

    const result = await run(['chat', '--agent', 'nonexistent-agent', '--app-path', tmp]);

    // Skills should still be installed even without a project
    assert.ok(existsSync(join(tmp, '.agents', 'skills', 'fnx-diagnostics', 'SKILL.md')),
      'Skills should be installed even in empty directory');
    assert.ok(existsSync(join(tmp, 'AGENTS.md')),
      'AGENTS.md should be created with getting-started guidance');

    // AGENTS.md should mention fnx init (guide user to create project)
    const agentsMd = readFileSync(join(tmp, 'AGENTS.md'), 'utf8');
    assert.ok(agentsMd.includes('fnx init'),
      'AGENTS.md should mention fnx init for new project creation');
  });
});

describe('fnx setup on empty directory', { timeout: 60000 }, () => {
  let tmp;

  afterEach(() => {
    if (tmp && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  });

  it('installs skills and MCP even without a project', async () => {
    tmp = makeTmpDir();
    mkdirSync(join(tmp, '.vscode'), { recursive: true });

    const result = await run(['setup', '--all', '--app-path', tmp]);
    assert.equal(result.exitCode, 0);

    // Skills should be installed
    assert.ok(existsSync(join(tmp, '.agents', 'skills', 'fnx-diagnostics', 'SKILL.md')),
      'Skills should be installed in empty directory');

    // AGENTS.md should exist with getting-started content
    assert.ok(existsSync(join(tmp, 'AGENTS.md')));
    const agentsMd = readFileSync(join(tmp, 'AGENTS.md'), 'utf8');
    assert.ok(agentsMd.includes('fnx init'),
      'AGENTS.md should guide user to create a project');
  });
});
