/**
 * fnx chat — launch a coding agent with Azure Functions context.
 * Detects available agents, generates .fnx/agent.md with project
 * context, and starts the agent with the right flags.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { detectProject } from '../setup/detect.js';
import { detectAgents } from '../setup/agent-detect.js';
import { title, info, funcName, success, error as errorColor, warning, dim, bold } from '../colors.js';

/**
 * Agent launcher definitions — how to start each coding agent.
 */
const LAUNCHERS = {
  'claude-code': {
    command: 'claude',
    buildArgs: (ctx) => [],  // Claude reads CLAUDE.md and .claude/skills/ automatically
    description: 'Claude Code reads .claude/skills/ and CLAUDE.md automatically',
  },
  'github-copilot': {
    command: 'ghcs',
    buildArgs: (ctx) => [],  // Copilot reads .github/copilot-instructions.md automatically
    description: 'GitHub Copilot reads .github/copilot-instructions.md automatically',
  },
  'codex': {
    command: 'codex',
    buildArgs: (ctx) => [],  // Codex reads AGENTS.md automatically
    description: 'Codex reads AGENTS.md automatically',
  },
};

/**
 * Run fnx chat.
 * @param {string[]} args - CLI arguments
 */
export async function runChat(args) {
  const appPath = resolveAppPath(args);
  const agentFlag = getFlag(args, '--agent');
  const promptFlag = getFlag(args, '--prompt');

  console.log();
  console.log(title('fnx chat') + dim(' — AI-assisted Azure Functions development'));
  console.log();

  // Step 1: Detect project
  console.log(bold('🔍 Loading project context...'));
  const project = await detectProject(appPath);
  if (project) {
    console.log(success(`  ✓ ${formatRuntime(project)} (${project.sku})`));
    if (project.functions.length > 0) {
      console.log(dim(`    Functions: ${project.functions.map(f => `${f.name} (${f.type})`).join(', ')}`));
    }

    // Check if skills are installed
    const skillsDir = join(appPath, '.agents', 'skills');
    if (existsSync(skillsDir)) {
      try {
        const { readdir } = await import('node:fs/promises');
        const skills = (await readdir(skillsDir)).filter(d => !d.startsWith('.'));
        console.log(dim(`    Skills: ${skills.length} installed in .agents/skills/`));
      } catch { /* ignore */ }
    } else {
      console.log(warning('    ⚠ No skills installed. Run `fnx setup` first for best results.'));
    }
  } else {
    console.log(warning('  ⚠ No Azure Functions project detected. Continuing with generic context.'));
  }
  console.log();

  // Step 2: Generate .fnx/agent.md
  const agentMdPath = join(appPath, '.fnx', 'agent.md');
  await generateAgentMd(appPath, project, agentMdPath);

  // Step 3: Detect agents
  console.log(bold('🤖 Detecting coding agents...'));
  let agents = await detectAgents(appPath);

  // Filter to agents that have launchers
  const launchableAgents = agents.filter(a => LAUNCHERS[a.id]);

  if (agentFlag) {
    // Use explicit agent
    const launcher = LAUNCHERS[agentFlag];
    if (!launcher) {
      console.error(errorColor(`  ✗ Unknown agent: ${agentFlag}`));
      console.error(dim(`    Available: ${Object.keys(LAUNCHERS).join(', ')}`));
      process.exit(1);
    }
    await launchAgent(agentFlag, launcher, appPath, project, promptFlag);
    return;
  }

  if (launchableAgents.length === 0) {
    console.log(warning('  ⚠ No supported CLI agents detected.'));
    console.log();
    console.log('  Install one of the following:');
    console.log(dim('    • Claude Code: https://claude.ai/download'));
    console.log(dim('    • GitHub Copilot CLI: gh extension install github/gh-copilot'));
    console.log(dim('    • Codex CLI: npm install -g @openai/codex'));
    console.log();
    console.log(dim('  Or use --agent to specify: fnx chat --agent claude-code'));
    process.exit(1);
  }

  for (const a of launchableAgents) {
    console.log(success(`  ✓ ${a.name}`));
  }
  console.log();

  // Step 4: Select agent (auto-pick if only one)
  let selectedId;
  if (launchableAgents.length === 1) {
    selectedId = launchableAgents[0].id;
  } else {
    selectedId = await promptAgentSelection(launchableAgents);
  }

  const launcher = LAUNCHERS[selectedId];
  await launchAgent(selectedId, launcher, appPath, project, promptFlag);
}

async function launchAgent(agentId, launcher, appPath, project, prompt) {
  const agentName = agentId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  console.log(bold('🚀 Launching ' + agentName + '...'));
  console.log(dim(`  ${launcher.description}`));
  console.log();

  console.log('┌' + '─'.repeat(50) + '┐');
  console.log('│  ' + bold('fnx chat') + ' • ' + agentName.padEnd(38) + '│');
  if (project) {
    console.log('│  ' + dim(`SKU: ${project.sku} | ${project.functions.length} functions`).padEnd(56) + '│');
  }
  console.log('└' + '─'.repeat(50) + '┘');
  console.log();

  const args = launcher.buildArgs({ appPath, project });
  if (prompt) args.push(prompt);

  // Launch the agent as an interactive child process
  const child = spawn(launcher.command, args, {
    cwd: appPath,
    stdio: 'inherit',
    shell: true,
  });

  child.on('error', (err) => {
    console.error(errorColor(`  ✗ Failed to launch ${agentName}: ${err.message}`));
    if (err.code === 'ENOENT') {
      console.error(dim(`    Make sure '${launcher.command}' is installed and in your PATH.`));
    }
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.log(warning(`\n  ${agentName} exited with code ${code}`));
    }
  });
}

async function generateAgentMd(appPath, project, outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });

  const lines = [
    '# Azure Functions Development Agent',
    '',
    'You are assisting a developer building Azure Functions applications with fnx.',
    '',
  ];

  if (project) {
    const funcList = project.functions.map(f => f.name + ' (' + f.type + ')').join(', ') || 'none detected';
    lines.push(
      '## Project Context',
      '- **Runtime:** ' + formatRuntime(project),
      '- **Programming Model:** ' + (project.programmingModel || 'v4'),
      '- **SKU:** ' + project.sku,
      '- **Functions:** ' + funcList,
      '- **Emulator:** fnx (SKU-aware local emulator)',
    );
  } else {
    lines.push(
      '## No Project Detected',
      'No Azure Functions project was found in the current directory.',
    );
  }

  lines.push(
    '',
    '## Available MCP Tools',
    'If the fnx Templates MCP server is configured, you can use:',
    '- `functions_language_list` — Get supported languages and runtime versions',
    '- `functions_template_get` — Generate function template code',
    '- `functions_project_get` — Scaffold project files',
    '',
    '## Guidelines',
    '- Always use the latest programming model for the detected runtime',
    '- Check SKU compatibility before suggesting triggers/bindings',
    '- Use `fnx start` for local testing (not `func start`)',
    '- Use `app-config.yaml` for non-secret config (committed to git)',
    '- Do NOT put secrets in workspace files',
    '- Refer to installed skills for detailed guidance',
    '',
  );

  await writeFile(outputPath, lines.join('\n'));
}

async function promptAgentSelection(agents) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('Which agent would you like to use?');
  agents.forEach((a, i) => {
    console.log(`  ${i + 1}. ${a.name}${i === 0 ? dim(' (recommended)') : ''}`);
  });

  return new Promise((resolve) => {
    rl.question('\nSelect [1]: ', (answer) => {
      rl.close();
      const idx = parseInt(answer || '1', 10) - 1;
      resolve(agents[Math.max(0, Math.min(idx, agents.length - 1))].id);
    });
  });
}

function formatRuntime(project) {
  if (!project) return 'unknown';
  const name = project.runtime === 'node' ? 'Node.js' : project.runtime;
  return `${name} (${project.language || project.runtime})`;
}

function resolveAppPath(args) {
  const explicit = getFlag(args, '--app-path');
  return explicit ? resolve(explicit) : process.cwd();
}

function getFlag(args, name) {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

export function printChatHelp() {
  console.log(`${title('Usage:')} fnx chat [options]

${title('Description:')}
  Launch a coding agent with Azure Functions context. Detects your project,
  generates context files, and starts your preferred coding agent.

${title('Options:')}
  ${success('--agent')} <name>     Use a specific agent: ${funcName('claude-code')}, ${funcName('github-copilot')}, ${funcName('codex')}
  ${success('--app-path')} <dir>   Path to function app (default: current directory)
  ${success('--prompt')} <text>    Non-interactive: send a single prompt and exit
  ${success('-h')}, ${success('--help')}       Show this help

${title('Examples:')}
  ${dim('# Auto-detect agent and launch')}
  fnx chat

  ${dim('# Use Claude Code specifically')}
  fnx chat --agent claude-code

  ${dim('# Non-interactive mode')}
  fnx chat --prompt "Add a timer trigger that runs every 5 minutes"
`);
}
