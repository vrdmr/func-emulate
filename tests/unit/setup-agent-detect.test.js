import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { detectAgents, formatAgentList } = await import('../../fnx/lib/setup/agent-detect.js');

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), 'fnx-agent-detect-'));
}

describe('detectAgents', () => {
  let tmp;

  afterEach(() => {
    if (tmp && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  });

  it('detects GitHub Copilot when .vscode/ exists', async () => {
    tmp = makeTmpDir();
    mkdirSync(join(tmp, '.vscode'));

    const agents = await detectAgents(tmp);
    const copilot = agents.find(a => a.id === 'github-copilot');
    assert.ok(copilot, 'Should detect GitHub Copilot');
    assert.equal(copilot.type, 'ide');
  });

  it('detects Cursor when .cursor/ exists', async () => {
    tmp = makeTmpDir();
    mkdirSync(join(tmp, '.cursor'));

    const agents = await detectAgents(tmp);
    const cursor = agents.find(a => a.id === 'cursor');
    assert.ok(cursor, 'Should detect Cursor');
    assert.equal(cursor.type, 'ide');
  });

  it('returns array (may include CLI agents on this machine)', async () => {
    tmp = makeTmpDir();
    const agents = await detectAgents(tmp);
    assert.ok(Array.isArray(agents));
    // Every agent should have id, name, type
    for (const agent of agents) {
      assert.ok(agent.id, 'Agent should have id');
      assert.ok(agent.name, 'Agent should have name');
      assert.ok(agent.type, 'Agent should have type');
    }
  });

  it('detects GitHub Copilot CLI via copilot command on this machine', async () => {
    tmp = makeTmpDir();
    // No .vscode/ dir — so IDE detection won't fire
    // On this machine, `copilot` binary exists
    const agents = await detectAgents(tmp);
    const copilot = agents.find(a => a.id === 'github-copilot');
    assert.ok(copilot, 'Should detect GitHub Copilot via copilot CLI binary');
    // Should be detected as 'cli' type (not just gh fallback)
    assert.equal(copilot.type, 'cli');
    assert.ok(copilot.name.includes('Copilot'), 'Name should mention Copilot');
  });

  it('does not duplicate github-copilot when .vscode/ exists and gh CLI is installed', async () => {
    tmp = makeTmpDir();
    mkdirSync(join(tmp, '.vscode'));

    const agents = await detectAgents(tmp);
    const copilots = agents.filter(a => a.id === 'github-copilot');
    assert.ok(copilots.length <= 1, `Should have at most 1 github-copilot, got ${copilots.length}`);
  });
});

describe('formatAgentList', () => {
  it('formats detected agents with checkmarks', () => {
    const agents = [
      { id: 'github-copilot', name: 'GitHub Copilot (VSCode)', type: 'ide' },
      { id: 'claude-code', name: 'Claude Code', type: 'cli' },
    ];
    const output = formatAgentList(agents);
    assert.ok(output.includes('✓ GitHub Copilot (VSCode)'));
    assert.ok(output.includes('✓ Claude Code'));
  });

  it('shows undetected agents with X mark', () => {
    const agents = [
      { id: 'github-copilot', name: 'GitHub Copilot (VSCode)', type: 'ide' },
    ];
    const output = formatAgentList(agents);
    // claude-code, codex, amp, gemini-cli, aider should show as not detected
    assert.ok(output.includes('✗ Claude Code (not detected)'));
    assert.ok(output.includes('✗ Codex CLI (not detected)'));
  });

  it('shows GitHub Copilot CLI in formatAgentList when detected', () => {
    const agents = [
      { id: 'github-copilot', name: 'GitHub Copilot (CLI)', type: 'cli' },
    ];
    const output = formatAgentList(agents);
    assert.ok(output.includes('✓ GitHub Copilot (CLI)'));
    // github-copilot should NOT also show as "not detected"
    assert.ok(!output.includes('GitHub Copilot (CLI) (not detected)'));
  });

  it('returns string output', () => {
    const output = formatAgentList([]);
    assert.equal(typeof output, 'string');
  });
});
