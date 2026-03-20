/**
 * fnx chat — launch a coding agent with Azure Functions context.
 * Detects available agents, generates .fnx/agent.md with project
 * context, and starts the agent with the right flags.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { detectProject } from '../setup/detect.js';
import { detectAgents } from '../setup/agent-detect.js';
import { title, info, funcName, success, error as errorColor, warning, dim, bold } from '../colors.js';

const MANIFESTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'manifests');

/**
 * Agent launcher definitions — how to start each coding agent.
 */
export const LAUNCHERS = {
  'claude-code': {
    command: 'claude',
    buildArgs: (ctx) => {
      const args = [];
      if (ctx.startupPrompt) args.push(ctx.startupPrompt);
      return args;
    },
    description: 'Claude Code reads .claude/skills/ and CLAUDE.md automatically',
  },
  'github-copilot': {
    command: 'copilot',
    buildArgs: (ctx) => {
      const args = [];
      if (ctx.startupPrompt) args.push('-i', ctx.startupPrompt);
      return args;
    },
    description: 'GitHub Copilot reads .github/copilot-instructions.md automatically',
  },
  'codex': {
    command: 'codex',
    buildArgs: (ctx) => {
      const args = [];
      if (ctx.startupPrompt) args.push(ctx.startupPrompt);
      return args;
    },
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
  const setupOnly = args.includes('--setup-only');
  const noGreeting = args.includes('--no-greeting');

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
  } else {
    console.log(warning('  ⚠ No Azure Functions project detected. The agent can help you create one.'));
  }

  // Show skill status (informational only — setup runs after agent selection)
  const skillsDir = join(appPath, '.agents', 'skills');
  const needsSetup = !existsSync(skillsDir);
  if (!needsSetup) {
    try {
      const { readdir } = await import('node:fs/promises');
      const skills = (await readdir(skillsDir)).filter(d => !d.startsWith('.'));
      console.log(dim(`    Skills: ${skills.length} installed in .agents/skills/`));
    } catch { /* ignore */ }
  }
  console.log();

  // Step 2: Detect agents and select (only CLI-launchable agents)
  console.log(bold('🤖 Detecting coding agents...'));
  let agents = await detectAgents(appPath);
  const launchableAgents = agents.filter(a => LAUNCHERS[a.id] && a.type === 'cli');

  let selectedId;

  if (agentFlag) {
    // Validate explicit agent
    const launcher = LAUNCHERS[agentFlag];
    if (!launcher) {
      console.error(errorColor(`  ✗ Unknown agent: ${agentFlag}`));
      console.error(dim(`    Available: ${Object.keys(LAUNCHERS).join(', ')}`));
      process.exit(1);
    }
    selectedId = agentFlag;
  } else if (launchableAgents.length === 0) {
    console.log(warning('  ⚠ No supported CLI agents detected.'));
    console.log();
    console.log('  Install one of the following:');
    console.log(dim('    • Claude Code: https://claude.ai/download'));
    console.log(dim('    • GitHub Copilot CLI: https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-in-the-command-line'));
    console.log(dim('    • Codex CLI: npm install -g @openai/codex'));
    console.log();
    console.log(dim('  Or use --agent to specify: fnx chat --agent claude-code'));
    process.exit(1);
  } else {
    for (const a of launchableAgents) {
      console.log(success(`  ✓ ${a.name}`));
    }
    console.log();

    if (launchableAgents.length === 1) {
      selectedId = launchableAgents[0].id;
    } else {
      selectedId = await promptAgentSelection(launchableAgents);
    }
  }

  // Step 3: Auto-run setup if needed (after agent is selected)
  if (needsSetup) {
    console.log();
    console.log(warning('  ⚠ No skills installed. Running fnx setup for ' + selectedId + '...'));
    console.log();
    const { runSetup } = await import('../setup/index.js');
    await runSetup(['--all', '--agent', selectedId, '--app-path', appPath]);
  }

  // Step 4: Generate .fnx/agent.md
  const agentMdPath = join(appPath, '.fnx', 'agent.md');
  await generateAgentMd(appPath, project, agentMdPath);

  // Step 5: Launch agent (skip if --setup-only)
  if (setupOnly) {
    console.log();
    console.log(success('  ✓ Setup complete. Skipping agent launch (--setup-only).'));
    return;
  }
  const launcher = LAUNCHERS[selectedId];
  await launchAgent(selectedId, launcher, appPath, project, promptFlag, { noGreeting });
}

async function launchAgent(agentId, launcher, appPath, project, prompt, opts = {}) {
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

  let args;
  if (prompt) {
    // User provided --prompt: use their prompt directly (replaces greeting)
    args = launcher.buildArgs({ startupPrompt: prompt });
  } else if (opts.noGreeting) {
    // --no-greeting: launch without any prompt
    args = [];
  } else {
    // Default: build startup greeting prompt
    const startupPrompt = await buildStartupPrompt(appPath, project);
    args = launcher.buildArgs({ startupPrompt });
  }

  // Launch the agent as an interactive child process
  // Use shell: false to prevent shell injection via user-controlled args (e.g., --prompt)
  const child = spawn(launcher.command, args, {
    cwd: appPath,
    stdio: 'inherit',
    shell: false,
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

// --- Startup prompt helpers (exported for testing) ---

export function formatProjectContext(project) {
  if (!project) return 'No Azure Functions project detected in this directory. I can help you create one!';
  const funcs = project.functions.map(f => `${f.name} (${f.type})`).join(', ') || 'none yet';
  const name = project.runtime === 'node' ? 'Node.js' : project.runtime;
  return `Your project: ${name} (${project.language || project.runtime}) | SKU: ${project.sku} | Functions: ${funcs}`;
}

export async function countSkills(appPath) {
  const skillsDir = join(appPath, '.agents', 'skills');
  if (!existsSync(skillsDir)) return '0';
  const dirs = (await readdir(skillsDir)).filter(d => !d.startsWith('.'));
  return String(dirs.length);
}

export async function listSkillSummaries(appPath) {
  const skillsDir = join(appPath, '.agents', 'skills');
  if (!existsSync(skillsDir)) return '(none installed — run fnx setup first)';
  const dirs = (await readdir(skillsDir)).filter(d => !d.startsWith('.'));
  const summaries = [];
  for (const dir of dirs) {
    const skillMd = join(skillsDir, dir, 'SKILL.md');
    if (!existsSync(skillMd)) continue;
    const content = await readFile(skillMd, 'utf8');
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const descMatch = content.match(/^description:\s*"?([^"\n]+)"?/m);
    const name = nameMatch ? nameMatch[1].trim() : dir;
    const desc = descMatch ? descMatch[1].trim().split('.')[0] : '';
    summaries.push(`  - ${name}: ${desc}`);
  }
  return summaries.join('\n') || '(none installed — run fnx setup first)';
}

export function buildSuggestedActions(project) {
  if (!project) {
    return [
      'Tell me what kind of function you want to build, for example:',
      '  - "Create an HTTP API that processes orders"',
      '  - "Build a queue-triggered function that sends emails"',
      '  - "Set up a timer function that runs cleanup every hour"',
      '',
      'I will scaffold the project, write the code, and guide you through deployment.',
    ].join('\n');
  }
  if (project.functions.length === 0) {
    return [
      'Your project is set up but has no functions yet. Tell me what to build:',
      '  - "Add an HTTP trigger that returns user data from a database"',
      '  - "Create a queue-triggered function to process uploaded images"',
      '  - "Add a timer function that checks for expired subscriptions"',
      '',
      'I will write the function code, help you test locally, and deploy to Azure.',
    ].join('\n');
  }
  return [
    'Here are some things I can help with:',
    '  - Add another function (tell me the trigger type and what it should do)',
    '  - Run and test locally with fnx start',
    '  - Diagnose issues (paste any error messages)',
    '  - Deploy to Azure',
    '  - Review best practices for your ' + project.sku + ' plan',
  ].join('\n');
}

export async function buildStartupPrompt(appPath, project) {
  const templatePath = join(MANIFESTS_DIR, 'startup-prompt.md');
  let template = await readFile(templatePath, 'utf8');

  const vars = {
    projectContext: formatProjectContext(project),
    skillCount: await countSkills(appPath),
    skillList: await listSkillSummaries(appPath),
    suggestedActions: buildSuggestedActions(project),
  };

  for (const [key, value] of Object.entries(vars)) {
    template = template.replaceAll(`{{${key}}}`, value);
  }

  return template;
}

export function printChatHelp() {
  console.log(`${title('Usage:')} fnx chat [options]

${title('Description:')}
  Launch a coding agent with Azure Functions context. Detects your project,
  generates context files, and starts your preferred coding agent.

${title('Options:')}
  ${success('--agent')} <name>     Use a specific agent: ${funcName('claude-code')}, ${funcName('github-copilot')}, ${funcName('codex')}
  ${success('--app-path')} <dir>   Path to function app (default: current directory)
  ${success('--prompt')} <text>    Pass prompt text as CLI argument to the agent
  ${success('--no-greeting')}      Launch agent without the startup greeting prompt
  ${success('--setup-only')}       Run setup without launching the agent
  ${success('-h')}, ${success('--help')}       Show this help

${title('Examples:')}
  ${dim('# Auto-detect agent and launch')}
  fnx chat

  ${dim('# Use Claude Code specifically')}
  fnx chat --agent claude-code

  ${dim('# Non-interactive mode')}
  fnx chat --prompt "Add a timer trigger that runs every 5 minutes"

  ${dim('# Launch without startup greeting')}
  fnx chat --no-greeting
`);
}
