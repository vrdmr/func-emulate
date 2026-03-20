/**
 * TDD tests for fnx chat startup prompt feature.
 * Tests: template resolution, LAUNCHERS prompt args, helper functions,
 * --no-greeting flag, and --prompt flag behavior.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// We import the functions we'll expose from chat/index.js
// These will be exported after implementation
const chatModule = await import('../lib/chat/index.js');

describe('startup prompt — helper functions', () => {
  it('formatProjectContext with project returns runtime/SKU/functions', () => {
    const project = {
      runtime: 'node',
      language: 'typescript',
      sku: 'flex-consumption',
      functions: [
        { name: 'httpEnqueue', type: 'httpTrigger' },
        { name: 'processQueue', type: 'queueTrigger' },
      ],
    };
    const result = chatModule.formatProjectContext(project);
    assert.ok(result.includes('Node.js'), 'should include Node.js for node runtime');
    assert.ok(result.includes('flex-consumption'), 'should include SKU');
    assert.ok(result.includes('httpEnqueue'), 'should include function names');
    assert.ok(result.includes('processQueue'), 'should include all functions');
  });

  it('formatProjectContext without project returns no-project message', () => {
    const result = chatModule.formatProjectContext(null);
    assert.ok(result.includes('No project detected'), 'should say no project');
    assert.ok(result.includes('scaffold'), 'should mention scaffolding');
  });

  it('formatProjectContext with project but no functions', () => {
    const project = {
      runtime: 'dotnet-isolated',
      language: 'csharp',
      sku: 'consumption',
      functions: [],
    };
    const result = chatModule.formatProjectContext(project);
    assert.ok(result.includes('dotnet-isolated'), 'should include runtime');
    assert.ok(result.includes('none yet'), 'should say none yet for empty functions');
  });

  it('buildSuggestedActions with no project suggests building a function', () => {
    const result = chatModule.buildSuggestedActions(null);
    assert.ok(result.includes('Tell me what to build'), 'should ask what to build');
    assert.ok(result.includes('HTTP'), 'should give HTTP example');
    assert.ok(result.includes('queue'), 'should give queue example');
    assert.ok(result.includes('deploy'), 'should mention deployment');
  });

  it('buildSuggestedActions with empty project suggests adding function', () => {
    const project = { runtime: 'node', sku: 'flex-consumption', functions: [] };
    const result = chatModule.buildSuggestedActions(project);
    assert.ok(result.includes('tell me what to build'), 'should ask what to build');
  });

  it('buildSuggestedActions with existing functions suggests next steps', () => {
    const project = {
      runtime: 'node',
      sku: 'flex-consumption',
      functions: [{ name: 'myFunc', type: 'httpTrigger' }],
    };
    const result = chatModule.buildSuggestedActions(project);
    assert.ok(result.includes('Add another function'), 'should suggest adding function');
    assert.ok(result.includes('Diagnose'), 'should suggest diagnose');
    assert.ok(result.includes('Deploy to Azure'), 'should suggest deploy');
  });
});

describe('startup prompt — skill inventory', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fnx-startup-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('countSkills returns 0 when no .agents/skills directory', async () => {
    const count = await chatModule.countSkills(tmpDir);
    assert.equal(count, '0');
  });

  it('countSkills returns correct count for installed skills', async () => {
    const skillsDir = join(tmpDir, '.agents', 'skills');
    await mkdir(join(skillsDir, 'skill-a'), { recursive: true });
    await mkdir(join(skillsDir, 'skill-b'), { recursive: true });
    await writeFile(join(skillsDir, 'skill-a', 'SKILL.md'), '---\nname: skill-a\n---\n');
    await writeFile(join(skillsDir, 'skill-b', 'SKILL.md'), '---\nname: skill-b\n---\n');
    const count = await chatModule.countSkills(tmpDir);
    assert.equal(count, '2');
  });

  it('listSkillSummaries returns "none" when no skills', async () => {
    const list = await chatModule.listSkillSummaries(tmpDir);
    assert.ok(list.includes('none'), 'should say none');
  });

  it('listSkillSummaries extracts skill names as comma-separated list', async () => {
    const skillsDir = join(tmpDir, '.agents', 'skills');
    await mkdir(join(skillsDir, 'fnx-intro'), { recursive: true });
    await writeFile(join(skillsDir, 'fnx-intro', 'SKILL.md'),
      '---\nname: fnx-intro\ndescription: "Introduction to fnx. Provides getting started guidance."\n---\n# Content\n');

    const list = await chatModule.listSkillSummaries(tmpDir);
    assert.ok(list.includes('fnx-intro'), 'should include skill name');
    assert.ok(!list.includes('\n'), 'should be single-line comma-separated');
  });
});

describe('startup prompt — template resolution', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fnx-startup-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('buildStartupPrompt resolves all template variables for a project', async () => {
    const skillsDir = join(tmpDir, '.agents', 'skills');
    await mkdir(join(skillsDir, 'fnx-intro'), { recursive: true });
    await writeFile(join(skillsDir, 'fnx-intro', 'SKILL.md'),
      '---\nname: fnx-intro\ndescription: "Introduction to fnx CLI"\n---\n# Content\n');

    const project = {
      runtime: 'node',
      language: 'typescript',
      sku: 'flex-consumption',
      functions: [{ name: 'httpTrigger1', type: 'httpTrigger' }],
    };

    const result = await chatModule.buildStartupPrompt(tmpDir, project);

    assert.ok(!result.includes('{{'), 'should not have unresolved placeholders');
    assert.ok(result.includes('Node.js'), 'should include project context');
    assert.ok(result.includes('fnx-intro'), 'should include skill names');
    assert.ok(result.includes('⚡'), 'should include emoji decoration');
    assert.ok(result.includes('━'), 'should include line separator');
    // Compact: should be under 15 lines
    const lines = result.split('\n').length;
    assert.ok(lines <= 15, `should be compact (got ${lines} lines)`);
  });

  it('buildStartupPrompt works with no project', async () => {
    const result = await chatModule.buildStartupPrompt(tmpDir, null);
    assert.ok(!result.includes('{{'), 'should not have unresolved placeholders');
    assert.ok(result.includes('No project detected'), 'should indicate no project');
    assert.ok(result.includes('Tell me what to build'), 'should ask what to build');
  });
});

describe('startup prompt — LAUNCHERS prompt args', () => {
  it('claude-code buildArgs with startupPrompt returns [promptText]', () => {
    const launcher = chatModule.LAUNCHERS['claude-code'];
    const args = launcher.buildArgs({ startupPrompt: 'Hello world' });
    assert.deepEqual(args, ['Hello world']);
  });

  it('github-copilot buildArgs with startupPrompt returns [-i, promptText]', () => {
    const launcher = chatModule.LAUNCHERS['github-copilot'];
    const args = launcher.buildArgs({ startupPrompt: 'Hello world' });
    assert.deepEqual(args, ['-i', 'Hello world']);
  });

  it('codex buildArgs with startupPrompt returns [promptText]', () => {
    const launcher = chatModule.LAUNCHERS['codex'];
    const args = launcher.buildArgs({ startupPrompt: 'Hello world' });
    assert.deepEqual(args, ['Hello world']);
  });

  it('all LAUNCHERS return empty args when no startupPrompt', () => {
    for (const [id, launcher] of Object.entries(chatModule.LAUNCHERS)) {
      const args = launcher.buildArgs({});
      assert.deepEqual(args, [], `${id} should return empty args without startupPrompt`);
    }
  });
});

describe('startup prompt — CLI flags', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fnx-startup-'));
    await writeFile(join(tmpDir, 'host.json'), JSON.stringify({ version: '2.0' }));
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { '@azure/functions': '^4.0.0' },
    }));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('--no-greeting is listed in chat help', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const FNX_BIN = join(fileURLToPath(import.meta.url), '..', '..', 'bin', 'fnx');
    const { stdout } = await execFileAsync('node', [FNX_BIN, 'chat', '--help']);
    assert.ok(stdout.includes('--no-greeting'), 'help should document --no-greeting flag');
  });

  it('--setup-only still works without startup prompt interference', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const FNX_BIN = join(fileURLToPath(import.meta.url), '..', '..', 'bin', 'fnx');
    const { stdout } = await execFileAsync('node', [FNX_BIN, 'chat', '--setup-only',
      '--agent', 'claude-code', '--app-path', tmpDir]);
    assert.ok(stdout.includes('Setup complete'), 'should complete setup without launching');
  });
});
