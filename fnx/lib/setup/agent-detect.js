/**
 * Agent detection — discovers which coding agents are available
 * in the developer's environment (CLI binaries + IDE config files).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CLI_AGENTS = [
  { id: 'github-copilot', name: 'GitHub Copilot CLI', command: 'copilot', type: 'cli' },
  { id: 'claude-code', name: 'Claude Code', command: 'claude', type: 'cli' },
  { id: 'codex', name: 'Codex CLI', command: 'codex', type: 'cli' },
  { id: 'amp', name: 'Amp', command: 'amp', type: 'cli' },
  { id: 'gemini-cli', name: 'Gemini CLI', command: 'gemini', type: 'cli' },
  { id: 'aider', name: 'aider', command: 'aider', type: 'cli' },
];

/**
 * Detect available coding agents.
 * @param {string} appPath - Project directory (for IDE config file detection)
 * @returns {Promise<Array<{id: string, name: string, type: string}>>}
 */
export async function detectAgents(appPath) {
  const agents = [];

  // 1. IDE config file detection
  if (existsSync(join(appPath, '.vscode')) || existsSync(join(appPath, '.vscode', 'settings.json'))) {
    agents.push({ id: 'github-copilot', name: 'GitHub Copilot (VSCode)', type: 'ide' });
  }
  if (existsSync(join(appPath, '.cursor'))) {
    agents.push({ id: 'cursor', name: 'Cursor', type: 'ide' });
  }

  // 2. CLI binary detection (skip if already detected via IDE)
  for (const agent of CLI_AGENTS) {
    if (!agents.find(a => a.id === agent.id) && await commandExists(agent.command)) {
      agents.push({ id: agent.id, name: agent.name, type: agent.type });
    }
  }

  // 3. Fallback: check for gh copilot extension (not just gh binary)
  if (!agents.find(a => a.id === 'github-copilot')) {
    if (await commandExists('ghcs') || await hasCopilotExtension()) {
      agents.push({ id: 'github-copilot', name: 'GitHub Copilot (gh)', type: 'cli' });
    }
  }

  return agents;
}

async function commandExists(cmd) {
  try {
    const whichCmd = process.platform === 'win32' ? 'where.exe' : 'which';
    await execFileAsync(whichCmd, [cmd], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function hasCopilotExtension() {
  try {
    const { stdout } = await execFileAsync('gh', ['extension', 'list'], { timeout: 5000 });
    return stdout.includes('gh-copilot');
  } catch {
    return false;
  }
}

/**
 * Format agent list for display.
 */
export function formatAgentList(agents) {
  const lines = [];

  for (const agent of agents) {
    lines.push(`  ✓ ${agent.name}`);
  }

  // Show undetected well-known agents
  for (const known of CLI_AGENTS) {
    if (!agents.find(a => a.id === known.id)) {
      lines.push(`  ✗ ${known.name} (not detected)`);
    }
  }

  return lines.join('\n');
}
