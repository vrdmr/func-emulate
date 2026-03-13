/**
 * fnx setup — main entry point.
 * Analyzes an existing Azure Functions project and adds AI agent
 * skills, MCP configuration, instructions, and agent definitions.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, copyFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { detectProject } from './detect.js';
import { detectAgents, formatAgentList } from './agent-detect.js';
import { title, funcName, success, error as errorColor, warning, dim, bold } from '../colors.js';
import { copyDirRecursive } from '../utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFESTS_DIR = resolve(__dirname, '..', '..', 'manifests');

/**
 * Run fnx setup.
 * @param {string[]} args - CLI arguments
 */
export async function runSetup(args) {
  const appPath = resolveSetupAppPath(args);
  const module = getFlag(args, '--module');
  const forceFlag = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const agentFilter = getFlag(args, '--agent');
  const nonInteractive = args.includes('--non-interactive') || args.includes('--all');

  // Validate --module flag
  const VALID_MODULES = ['agent', 'mcp', 'plugin'];
  if (module && !VALID_MODULES.includes(module)) {
    console.error(errorColor(`  ✗ Unknown module: ${module}`));
    console.error(dim(`    Valid modules: ${VALID_MODULES.join(', ')}`));
    process.exit(1);
  }

  console.log();
  console.log(title('fnx setup') + dim(' — Configure your project for AI-assisted development'));
  console.log();

  // Step 1: Detect project
  console.log(bold('🔍 Detecting project...'));
  const project = await detectProject(appPath);
  if (!project) {
    console.log(warning('  ⚠ No Azure Functions project detected (no host.json).'));
    console.log(dim('    Skills and MCP config will still be installed.'));
    console.log(dim('    Run `fnx init` to create a new project, or `fnx chat` to start with an agent.'));
  } else {
    console.log(success(`  ✓ ${formatRuntime(project)} project detected`));
    console.log(dim(`    SKU: ${project.sku} | Functions: ${project.functions.length} found`));
    if (project.functions.length > 0) {
      for (const fn of project.functions) {
        console.log(dim(`      • ${fn.name} (${fn.type})`));
      }
    }
  }
  console.log();

  // Step 2: Detect agents
  console.log(bold('🤖 Detecting coding agents...'));
  let agents = await detectAgents(appPath);

  if (agentFilter) {
    const filterIds = agentFilter.split(',').map(s => normalizeAgentId(s.trim()));
    agents = agents.filter(a => filterIds.includes(a.id));
  }

  if (agents.length === 0) {
    // Default to copilot if nothing detected
    agents = [{ id: 'github-copilot', name: 'GitHub Copilot (default)', type: 'default' }];
    console.log(warning('  ⚠ No agents detected, defaulting to GitHub Copilot'));
  } else {
    console.log(formatAgentList(agents));
  }
  console.log();

  // Step 2b: If multiple plugin-capable agents and interactive, ask which to target
  const pluginAgents = agents.filter(a => PLUGIN_AGENTS[a.id]);
  let selectedAgents = agents;
  if (pluginAgents.length > 1 && !nonInteractive && !agentFilter) {
    const selected = await promptPluginAgentSelection(pluginAgents);
    // Use the selected agents for all modules (skills, MCP, plugin)
    selectedAgents = selected;
    console.log();
  } else if (pluginAgents.length === 1) {
    selectedAgents = pluginAgents;
  }

  // Step 3: Apply modules (using selected agents)
  const results = [];

  if (!module || module === 'agent') {
    console.log(bold('📦 Applying agent workspace files...'));
    const r = await applyAgentModule(appPath, project, selectedAgents, { force: forceFlag, dryRun });
    results.push(...r);
    console.log();
  }

  if (!module || module === 'mcp') {
    console.log(bold('🔌 Configuring MCP servers...'));
    const r = await applyMcpModule(appPath, selectedAgents, { force: forceFlag, dryRun });
    results.push(...r);
    console.log();
  }

  if (!module || module === 'plugin') {
    const targetPluginAgents = selectedAgents.filter(a => PLUGIN_AGENTS[a.id]);
    if (targetPluginAgents.length > 0) {
      console.log(bold('🧩 Installing azure-skills plugin...'));
      const r = await applyPluginModule(targetPluginAgents, { force: forceFlag, dryRun });
      results.push(...r);
      console.log();
    }
  }

  // Summary
  console.log(bold('─'.repeat(50)));
  const created = results.filter(r => r.action === 'created');
  const skipped = results.filter(r => r.action === 'skipped');
  const merged = results.filter(r => r.action === 'merged');
  const installed = results.filter(r => r.action === 'installed');
  console.log(success(`  ✓ ${created.length} files created`));
  if (merged.length) console.log(success(`  ✓ ${merged.length} files updated (merged)`));
  if (installed.length) console.log(success(`  ✓ ${installed.length} plugins installed`));
  if (skipped.length) console.log(dim(`  ○ ${skipped.length} files skipped (already exist, use --force to overwrite)`));
  console.log();
  console.log(dim('  Run ') + funcName('fnx chat') + dim(' to start an AI-assisted development session.'));
}

// ─── Agent Module ───

async function applyAgentModule(appPath, project, agents, opts) {
  const results = [];

  // 1. Copy skills to .agents/skills/ (full directory including references/)
  const skillsDir = join(MANIFESTS_DIR, 'skills');
  const targetSkillsBase = join(appPath, '.agents', 'skills');
  await mkdir(targetSkillsBase, { recursive: true });

  const skillDirs = await readdir(skillsDir);
  for (const skillName of skillDirs) {
    const srcSkillDir = join(skillsDir, skillName);
    const srcSkillMd = join(srcSkillDir, 'SKILL.md');
    const dstSkillDir = join(targetSkillsBase, skillName);
    const dstSkillMd = join(dstSkillDir, 'SKILL.md');
    if (!existsSync(srcSkillMd)) continue;

    if (existsSync(dstSkillMd) && !opts.force) {
      console.log(dim(`    ○ .agents/skills/${skillName}/ (exists)`));
      results.push({ file: dstSkillMd, action: 'skipped' });
    } else {
      await copyDirRecursive(srcSkillDir, dstSkillDir, opts);
      console.log(success(`    ✓ .agents/skills/${skillName}/`));
      results.push({ file: dstSkillMd, action: 'created' });
    }
  }

  // 2. Also copy to agent-specific skill dirs for agents with custom paths
  for (const agent of agents) {
    if (agent.id === 'claude-code') {
      const claudeSkills = join(appPath, '.claude', 'skills');
      await mkdir(claudeSkills, { recursive: true });
      let claudeCopied = 0;
      for (const skillName of skillDirs) {
        const srcSkillDir = join(skillsDir, skillName);
        const srcSkillMd = join(srcSkillDir, 'SKILL.md');
        const dstSkillDir = join(claudeSkills, skillName);
        const dstSkillMd = join(dstSkillDir, 'SKILL.md');
        if (!existsSync(srcSkillMd)) continue;
        if (existsSync(dstSkillMd) && !opts.force) continue;
        await copyDirRecursive(srcSkillDir, dstSkillDir, opts);
        claudeCopied++;
      }
      if (claudeCopied > 0) {
        console.log(success(`    ✓ .claude/skills/ (${claudeCopied} skills copied)`));
        results.push({ file: claudeSkills, action: 'created' });
      } else {
        console.log(dim(`    ○ .claude/skills/ (${skillDirs.length} skills already exist)`));
        results.push({ file: claudeSkills, action: 'skipped' });
      }
    }
  }

  // 3. Generate AGENTS.md (universal instructions)
  const agentsMd = generateAgentsMd(project);
  const agentsMdPath = join(appPath, 'AGENTS.md');
  results.push(await writeIfNew(agentsMdPath, agentsMd, 'AGENTS.md', opts));

  // 4. Generate agent-specific instructions
  for (const agent of agents) {
    if (agent.id === 'github-copilot') {
      const instrPath = join(appPath, '.github', 'copilot-instructions.md');
      const content = generateCopilotInstructions(project);
      await mkdir(dirname(instrPath), { recursive: true });
      results.push(await writeIfNew(instrPath, content, '.github/copilot-instructions.md', opts));
    }
  }

  return results;
}

// ─── MCP Module ───

async function applyMcpModule(appPath, agents, opts) {
  const results = [];

  const mcpServer = {
    "fnx-templates": {
      type: "stdio",
      command: "npx",
      args: ["-y", "manvir-templates-mcp-server"],
      env: {},
    }
  };

  for (const agent of agents) {
    if (agent.id === 'github-copilot') {
      const mcpPath = join(appPath, '.vscode', 'mcp.json');
      results.push(await mergeMcpConfig(mcpPath, 'servers', mcpServer, '.vscode/mcp.json', opts));
    }
    if (agent.id === 'claude-code') {
      const settingsPath = join(appPath, '.claude', 'settings.json');
      results.push(await mergeMcpConfig(settingsPath, 'mcpServers', mcpServer, '.claude/settings.json', opts));
    }
    if (agent.id === 'cursor') {
      const mcpPath = join(appPath, '.cursor', 'mcp.json');
      results.push(await mergeMcpConfig(mcpPath, 'mcpServers', mcpServer, '.cursor/mcp.json', opts));
    }
  }

  return results;
}

async function mergeMcpConfig(filePath, key, servers, displayName, opts) {
  await mkdir(dirname(filePath), { recursive: true });
  let existing = {};
  if (existsSync(filePath)) {
    try { existing = JSON.parse(await readFile(filePath, 'utf8')); } catch {
      console.log(warning(`    ⚠ ${displayName} has invalid JSON, will be overwritten`));
    }
  }

  if (!existing[key]) existing[key] = {};

  let changed = false;
  for (const [name, config] of Object.entries(servers)) {
    if (!existing[key][name]) {
      existing[key][name] = config;
      changed = true;
    }
  }

  if (!changed) {
    console.log(dim(`    ○ ${displayName} (fnx-templates already configured)`));
    return { file: filePath, action: 'skipped' };
  }

  if (!opts.dryRun) {
    await writeFile(filePath, JSON.stringify(existing, null, 2) + '\n');
  }
  console.log(success(`    ✓ ${displayName} (fnx-templates MCP added)`));
  return { file: filePath, action: 'merged' };
}

// ─── Plugin Module ───

const AZURE_SKILLS_PLUGIN = {
  marketplace: { owner: 'microsoft', repo: 'azure-skills', name: 'azure-skills' },
  pluginId: 'azure',
};

const PLUGIN_AGENTS = {
  'github-copilot': {
    command: 'copilot',
    marketplaceAddArgs: ['plugin', 'marketplace', 'add', 'microsoft/azure-skills'],
    installArgs: ['plugin', 'install', 'azure@azure-skills'],
    listArgs: ['plugin', 'list'],
    marketplaceListArgs: ['plugin', 'marketplace', 'list'],
  },
  'claude-code': {
    command: 'claude',
    marketplaceAddArgs: ['plugin', 'marketplace', 'add', 'microsoft/azure-skills'],
    installArgs: ['plugin', 'install', 'azure@azure-skills'],
    listArgs: ['plugin', 'list'],
    marketplaceListArgs: ['plugin', 'marketplace', 'list'],
  },
};

const execFileAsync = promisify(execFile);

async function applyPluginModule(agents, opts) {
  const results = [];

  for (const agent of agents) {
    const pluginDef = PLUGIN_AGENTS[agent.id];
    if (!pluginDef) continue;

    const agentLabel = agent.name || agent.id;

    if (opts.dryRun) {
      console.log(dim(`    ○ ${agentLabel}: azure-skills plugin (dry-run, skipped)`));
      results.push({ file: `plugin:${agent.id}:azure-skills`, action: 'skipped' });
      continue;
    }

    try {
      // Check if plugin is already installed
      const alreadyInstalled = await isPluginInstalled(pluginDef);
      if (alreadyInstalled && !opts.force) {
        console.log(dim(`    ○ ${agentLabel}: azure-skills plugin (already installed)`));
        results.push({ file: `plugin:${agent.id}:azure-skills`, action: 'skipped' });
        continue;
      }

      // Ensure marketplace is registered
      const marketplaceReady = await ensureMarketplace(pluginDef, agentLabel);
      if (!marketplaceReady) {
        console.log(warning(`    ⚠ ${agentLabel}: could not register marketplace, skipping plugin`));
        results.push({ file: `plugin:${agent.id}:azure-skills`, action: 'skipped' });
        continue;
      }

      // Install the plugin
      console.log(dim(`    ⏳ ${agentLabel}: installing azure-skills plugin...`));
      await execFileAsync(pluginDef.command, pluginDef.installArgs, { timeout: 60000 });
      console.log(success(`    ✓ ${agentLabel}: azure-skills plugin installed`));
      results.push({ file: `plugin:${agent.id}:azure-skills`, action: 'installed' });
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log(warning(`    ⚠ ${agentLabel}: '${pluginDef.command}' not found, skipping plugin`));
      } else {
        // Show stderr if available (contains the actual error), otherwise fall back to message
        const detail = err.stderr?.trim().split('\n').pop() || err.message?.split('\n')[0] || 'unknown error';
        console.log(warning(`    ⚠ ${agentLabel}: plugin install failed (${detail})`));
        console.log(dim(`      Try manually: ${pluginDef.command} ${pluginDef.installArgs.join(' ')}`));
      }
      results.push({ file: `plugin:${agent.id}:azure-skills`, action: 'skipped' });
    }
  }

  if (results.length === 0) {
    console.log(dim('    ○ No agents with plugin support detected'));
  }

  return results;
}

async function isPluginInstalled(pluginDef) {
  try {
    const { stdout } = await execFileAsync(pluginDef.command, pluginDef.listArgs, { timeout: 10000 });
    return stdout.includes('azure');
  } catch {
    return false;
  }
}

async function ensureMarketplace(pluginDef, agentLabel) {
  try {
    // Check if marketplace is already registered
    const { stdout } = await execFileAsync(pluginDef.command, pluginDef.marketplaceListArgs, { timeout: 10000 });
    if (stdout.includes('azure-skills')) return true;

    // Register marketplace
    console.log(dim(`    ⏳ ${agentLabel}: registering azure-skills marketplace...`));
    await execFileAsync(pluginDef.command, pluginDef.marketplaceAddArgs, { timeout: 30000 });
    return true;
  } catch {
    return false;
  }
}

async function promptPluginAgentSelection(pluginAgents) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log(bold('  Which agent should fnx configure?'));
  pluginAgents.forEach((a, i) => {
    console.log(`    ${i + 1}. ${a.name || a.id}`);
  });
  console.log(`    ${pluginAgents.length + 1}. All of the above`);

  return new Promise((resolve) => {
    rl.question(`\n  Select [${pluginAgents.length + 1}]: `, (answer) => {
      rl.close();
      const input = (answer || String(pluginAgents.length + 1)).trim();

      // "All" option
      if (input === String(pluginAgents.length + 1) || input.toLowerCase() === 'all' || input === '') {
        resolve(pluginAgents);
        return;
      }

      // Parse comma-separated or single index
      const indices = input.split(/[,\s]+/).map(s => parseInt(s, 10) - 1);
      const selected = indices
        .filter(i => i >= 0 && i < pluginAgents.length)
        .map(i => pluginAgents[i]);

      resolve(selected.length > 0 ? selected : pluginAgents);
    });
  });
}

// ─── Content Generators ───

function generateAgentsMd(project) {
  if (!project) {
    return `# Azure Functions Development Agent

You are assisting a developer who wants to build Azure Functions applications with fnx.

## Getting Started
No Azure Functions project has been detected yet. Help the developer create one:

1. Run \`fnx init\` to create a new Azure Functions project
2. Choose a runtime (Node.js, Python, .NET, Java) and trigger type
3. After project creation, run \`fnx setup\` to install additional agent configuration
4. Use \`fnx start\` to launch the local emulator

## Available fnx Skills
- **fnx-diagnostics** — Troubleshoot fnx start issues
- **fnx-best-practices** — SKU-specific best practices
- **fnx-create-function** — Create new functions from templates
- **fnx-intro** — Overview of fnx capabilities
- **fnx-feedback** — Report issues as GitHub Issues

## Guidelines
- Use \`fnx init\` to scaffold a new project (not \`func init\`)
- Use \`fnx start\` for local testing (not \`func start\`)
- Use \`app-config.yaml\` for non-secret settings (commit to source control)
- Do NOT put secrets in workspace files — use Key Vault or Managed Identity
- Refer to installed skills in \`.agents/skills/\` for detailed guidance
`;
  }

  return `# Azure Functions Development Agent

You are assisting a developer building Azure Functions applications with fnx.

## Project Context
- **Runtime:** ${formatRuntime(project)}
- **Programming Model:** ${project.programmingModel || 'v4'}
- **SKU:** ${project.sku}
- **Functions:** ${project.functions.map(f => `${f.name} (${f.type})`).join(', ') || 'none detected'}
- **Emulator:** fnx (SKU-aware local emulator)

## Guidelines
- Use ${project.programmingModel === 'v4' ? 'v4 programming model' : project.programmingModel + ' programming model'} patterns
- Check SKU compatibility before suggesting triggers/bindings
- Use \`fnx start\` for local testing (not \`func start\`)
- Use \`app-config.yaml\` for non-secret settings (commit to source control)
- Do NOT put secrets in workspace files — use Key Vault or Managed Identity
- Refer to installed skills in \`.agents/skills/\` for detailed guidance

## Available fnx Skills
- **fnx-diagnostics** — Troubleshoot fnx start issues
- **fnx-best-practices** — SKU-specific best practices
- **fnx-create-function** — Create new functions from templates
- **fnx-intro** — Overview of fnx capabilities
- **fnx-feedback** — Report issues as GitHub Issues
`;
}

function generateCopilotInstructions(project) {
  if (!project) {
    return `# Azure Functions Development with fnx

No Azure Functions project detected yet. Run \`fnx init\` to create one.

## Key Rules
- Use \`fnx init\` to create a new project
- Test locally with \`fnx start\` (not \`func start\`)
- Non-secret config goes in \`app-config.yaml\` (committed to git)
- Secrets in \`local.settings.json\` only (gitignored)
- See \`.agents/skills/\` for detailed Azure Functions guidance
`;
  }

  return `# Azure Functions Development with fnx

This project is an Azure Functions application using **${formatRuntime(project)}** targeting **${project.sku}** SKU.

## Key Rules
- Always use the ${project.programmingModel || 'v4'} programming model
- Test locally with \`fnx start\` (not \`func start\`)
- Non-secret config goes in \`app-config.yaml\` (committed to git)
- Secrets in \`local.settings.json\` only (gitignored)
- Check SKU constraints before adding triggers/bindings
- See \`.agents/skills/\` for detailed Azure Functions guidance
`;
}

// ─── Utilities ───

async function writeIfNew(filePath, content, displayName, opts) {
  await mkdir(dirname(filePath), { recursive: true });
  if (existsSync(filePath) && !opts.force) {
    console.log(dim(`    ○ ${displayName} (exists)`));
    return { file: filePath, action: 'skipped' };
  }
  if (!opts.dryRun) await writeFile(filePath, content);
  console.log(success(`    ✓ ${displayName}`));
  return { file: filePath, action: 'created' };
}

function formatRuntime(project) {
  if (!project) return 'unknown';
  const lang = project.language === 'typescript' ? 'TypeScript' :
               project.language === 'javascript' ? 'JavaScript' :
               project.runtime || 'unknown';
  return `${project.runtime === 'node' ? 'Node.js' : project.runtime} (${lang})`;
}

function resolveSetupAppPath(args) {
  const explicit = getFlag(args, '--app-path');
  return explicit ? resolve(explicit) : process.cwd();
}

function getFlag(args, name) {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

// Normalize short agent aliases to canonical IDs
const AGENT_ALIASES = {
  'copilot': 'github-copilot',
  'claude': 'claude-code',
  'cursor': 'cursor',
  'codex': 'codex',
};

function normalizeAgentId(input) {
  return AGENT_ALIASES[input] || input;
}

export function printSetupHelp() {
  console.log(`${title('Usage:')} fnx setup [options]

${title('Description:')}
  Analyze an existing Azure Functions project and add AI agent skills,
  MCP configuration, and instructions for your coding agents.

${title('Options:')}
  ${success('--module')} <name>     Apply specific module only: ${funcName('agent')}, ${funcName('mcp')}
  ${success('--agent')} <agents>    Target specific agents: copilot, claude, cursor, codex
  ${success('--app-path')} <dir>    Path to function app (default: current directory)
  ${success('--all')}               Apply all modules without prompts
  ${success('--force')}             Overwrite existing files
  ${success('--dry-run')}           Show what would be done without making changes
  ${success('-h')}, ${success('--help')}        Show this help

${title('Examples:')}
  ${dim('# Auto-detect project and agents, apply all')}
  fnx setup

  ${dim('# Agent skills only')}
  fnx setup --module agent

  ${dim('# MCP configuration only')}
  fnx setup --module mcp

  ${dim('# Target specific agents')}
  fnx setup --agent copilot,claude

  ${dim('# Preview changes')}
  fnx setup --dry-run
`);
}
