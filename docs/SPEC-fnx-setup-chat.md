# fnx setup (Agent/MCP) & fnx chat — Implementation Specification

> **Date**: 2026-03-09  
> **Base spec**: F20 Agent Mode  
> **Scope**: `fnx setup --module agent`, `fnx setup --module mcp`, `fnx chat`  
> **Demo goal**: Minimal working demo by end of day (full feature set not required)

---

## Table of Contents

1. [Changes from F20](#1-changes-from-f20)
2. [Manifest File Design](#2-manifest-file-design)
3. [fnx setup — Agent/MCP Modules](#3-fnx-setup--agentmcp-modules)
4. [fnx chat — Agent Launcher](#4-fnx-chat--agent-launcher)
5. [Initial Skill Proposals](#5-initial-skill-proposals)
6. [Coexistence Design with Manvir's Work](#6-coexistence-design-with-manvirs-work)
7. [Implementation Approach Selection and Rationale](#7-implementation-approach-selection-and-rationale)
8. [Demo Scope (Today's Goal)](#8-demo-scope-todays-goal)
9. [Future Extensions](#9-future-extensions)

---

## 1. Changes from F20

This specification builds on the F20 spec as its foundation, with the following modifications and extensions.

### 1.1 Updated Skill Placement Paths

**Problem**: In F20, the design wrote directly to fixed per-agent paths (`.github/copilot-instructions.md`, `.cursor/rules/`, `.claude/`). Investigation of agent-workspace-specs revealed that **the skills.sh ecosystem's `.agents/skills/` serves as a universal directory** shared across 10+ agents.

**Change**: Skill placement is now dynamically resolved via the **Manifest's agent mapping table**.

| Category | F20 Design | This Spec's Design |
|----------|-----------|---------------------|
| Skills | Copied to each agent's unique path | Placed in `.agents/skills/` → symlinked to each agent |
| Instructions | Directly generated `.github/copilot-instructions.md` etc. | Generated according to the Manifest table, based on detected agents |
| MCP | `.vscode/mcp.json` only | Output to detected agent's MCP config file |

### 1.2 Addition of Agent Definitions

**Problem**: F20 did not account for Agent Definitions (`.github/agents/*.agent.md`).

**Change**: Added an `agentDefinitions` section to the Manifest. `fnx setup --module agent` generates `.github/agents/fnx.agent.md` etc., enabling custom agent invocation via `@fnx`.

### 1.3 One-Command Application

**Problem**: Multiple steps were required — install MCP, install skills, install instructions, etc.

**Change**: `fnx setup --module agent` **applies Skills + Instructions + Agent Definitions in one step**. `--module mcp` applies MCP configuration in one step. `fnx setup --all` applies everything.

### 1.4 Extended Agent Detection

**Problem**: F20's auto-detection only covered CLI agents (`which copilot` etc.). GUI agents (VSCode Copilot, Cursor IDE) were not detected.

**Change**: Detection strategy expanded to 3 layers:

| Detection Layer | Target | Method |
|----------------|--------|--------|
| CLI binary | Claude Code, Codex, Amp, etc. | `which` / `where.exe` |
| IDE config files | VSCode+Copilot, Cursor | Check for existence of `.vscode/`, `.cursor/` |
| Explicit specification | All agents | `--agent copilot,claude,cursor` flag |

Detection results are always displayed to the user for confirmation.

---

## 2. Manifest File Design

### 2.1 Design Principles

Defines a general-purpose format inspired by Loom's `manifest.yaml`, while incorporating fnx-specific needs (SKU detection, Functions domain).

**Rationale**:
- Loom's `$ref` pattern (external file references) provides excellent modularity
- YAML is human-readable/writable and more concise than JSON
- Future interoperability with Loom is considered

### 2.2 Manifest Schema

```yaml
# fnx-agent-manifest.yaml
version: "1.0.0"

manifest:
  id: azure-functions-agent
  name: "Azure Functions Agent Workspace"
  description: "Skills, MCP, instructions for Azure Functions development"
  author: "azure-functions-team"
  tags: [azure-functions, serverless, fnx]
  updated: "2026-03-09"

# ──── Per-Agent Path Mapping ────
# Accurate path mapping based on skills.sh + independent research
agentPaths:
  # Agents sharing .agents/skills/
  shared:
    projectSkills: ".agents/skills"
    agents:
      - github-copilot
      - cursor
      - codex
      - cline
      - gemini-cli
      - opencode
      - amp
  
  # Agents with custom paths
  custom:
    claude-code:
      projectSkills: ".claude/skills"
      instructions: ".claude/CLAUDE.md"           # append mode
      mcp: ".claude/settings.json"                # mcpServers key
    github-copilot:
      instructions: ".github/copilot-instructions.md"
      scopedInstructions: ".github/instructions/"  # *.instructions.md
      agentDefs: ".github/agents/"                 # *.agent.md
      prompts: ".github/prompts/"                  # *.prompt.md
      mcp: ".vscode/mcp.json"                     # servers key
    cursor:
      rules: ".cursor/rules/"                      # *.mdc
      mcp: ".cursor/mcp.json"
    codex:
      instructions: "AGENTS.md"
      mcp: "codex-mcp.json"
    windsurf:
      projectSkills: ".windsurf/skills"
      mcp: "~/.codeium/windsurf/mcp_config.json"  # global only

# ──── Content Definitions ────
contents:
  # Skills (SKILL.md files)
  skills:
    - id: fnx-diagnostics
      name: "fnx Diagnostics"
      description: "Diagnose fnx start issues, resolve errors, analyze logs"
      file: skills/fnx-diagnostics/SKILL.md
    
    - id: fnx-best-practices
      name: "Azure Functions Best Practices"
      description: "SKU-specific best practices, performance, and security guidance"
      file: skills/fnx-best-practices/SKILL.md
    
    - id: fnx-create-function
      name: "Create Azure Function"
      description: "New function creation workflow using fnx templates"
      file: skills/fnx-create-function/SKILL.md
    
    - id: fnx-intro
      name: "fnx Introduction"
      description: "fnx feature overview, list of installed skills, usage guide"
      file: skills/fnx-intro/SKILL.md
    
    - id: fnx-feedback
      name: "fnx Feedback"
      description: "Feedback skill that generates and reports Issues from conversation history"
      file: skills/fnx-feedback/SKILL.md

  # Instructions (shared across agents)
  instructions:
    - id: functions-general
      description: "Basic guidance for Azure Functions development"
      file: instructions/functions-general.md
      # The following template variables are injected from project detection
      variables:
        - runtime       # node, python, dotnet-isolated, java
        - sku           # flex, premium, dedicated
        - programmingModel  # v4, v2, isolated
        - functions     # list of detected functions

  # MCP server definitions
  mcp:
    - id: fnx-templates
      name: "fnx Templates MCP"
      description: "Azure Functions template discovery and scaffolding"
      command: "npx"
      args: ["manvir-templates-mcp-server"]
      # Future: migrate to Azure MCP Server (microsoft/mcp)
      # command: "npx"
      # args: ["@azure/mcp-server"]
    
    - id: fnx-debug
      name: "fnx Debug MCP"
      description: "Debugging and observability for running Functions host"
      command: "node"
      args: ["fnx/bin/fnx", "start", "--mcp-port", "9100"]
      optional: true  # Only active when fnx start is running

  # Agent Definitions (for GitHub Copilot)
  agentDefinitions:
    - id: fnx-agent
      name: "fnx"
      description: "Azure Functions development expert"
      file: agents/fnx.agent.md

# ──── Project Detection Rules ────
detection:
  # Evaluated in priority order
  rules:
    - name: "Azure Functions (Node.js)"
      match:
        files: ["host.json", "package.json"]
        content:
          "package.json": "@azure/functions"
      result:
        runtime: node
        programmingModel: v4
    
    - name: "Azure Functions (Python)"
      match:
        files: ["host.json", "requirements.txt"]
        content:
          "requirements.txt": "azure-functions"
      result:
        runtime: python
        programmingModel: v2
    
    - name: "Azure Functions (.NET)"
      match:
        files: ["host.json"]
        glob: "*.csproj"
      result:
        runtime: dotnet-isolated
    
    - name: "Azure Functions (Java)"
      match:
        files: ["host.json", "pom.xml"]
      result:
        runtime: java
  
  # SKU detection (app-config.yaml → local.settings.json → default)
  sku:
    sources:
      - file: "app-config.yaml"
        path: "local.targetSku"
      - file: "local.settings.json"
        path: "Values.FUNCTIONS_WORKER_RUNTIME"  # runtime hint
    default: flex
```

### 2.3 Manifest Placement Strategy

| Phase | Source | Description |
|-------|--------|-------------|
| **Demo (today)** | Local bundle | Bundled in the fnx package under `manifests/` |
| **Short-term** | GitHub repository | Fetched via raw URL from `vrdmr/func-emulate` `manifests/` |
| **Mid-term** | CDN + GitHub | Placed on CDN with caching. GitHub remains the source of truth |
| **Long-term** | Loom registry integration | Installable from Loom via `loom registry add fnx <url>` |

**Rationale**: Starting with a local bundle ensures the demo works today. Future remote fetching will reuse the existing pattern in `profile-resolver.js` (URL → cache → bundle fallback).

---

## 3. fnx setup — Agent/MCP Modules

### 3.1 Overall Flow

```
$ fnx setup

🔍 Detecting project...
  ├── host.json ✓
  ├── package.json → @azure/functions 4.x (Node.js v4 model)
  ├── 3 functions detected: httpTrigger, processQueue, timerCleanup
  ├── SKU: flex (from app-config.yaml)
  └── Runtime: Node.js 20

🤖 Detecting coding agents...
  ✓ GitHub Copilot (VSCode) — .vscode/ detected
  ✓ Claude Code — claude command detected
  ✗ Cursor — not detected
  ✗ Codex — not detected

What would you like to add?
  ◉ Agent (Skills + Instructions + Agent Definitions)
  ◉ MCP configuration
  ◯ CI/CD pipeline (not yet implemented)
  ◯ Infrastructure as Code (not yet implemented)

[Space to toggle, Enter to confirm]
```

### 3.2 Behavior of `fnx setup --module agent`

#### Step 1: Project Detection

```javascript
// lib/setup/detect.js
async function detectProject(appPath) {
  return {
    runtime: 'node',           // from host.json + package.json
    programmingModel: 'v4',    // from @azure/functions version
    sku: 'flex',               // app-config.yaml → local.settings.json → default
    functions: [               // from scanning src/functions/
      { name: 'httpTrigger', type: 'httpTrigger' },
      { name: 'processQueue', type: 'queueTrigger' },
    ],
    language: 'typescript',    // from presence of tsconfig.json
  };
}
```

#### Step 2: Agent Detection

```javascript
// lib/setup/agent-detect.js
async function detectAgents() {
  const agents = [];
  
  // CLI binary detection
  for (const [name, cmd] of CLI_AGENTS) {
    if (await commandExists(cmd)) agents.push({ name, type: 'cli' });
  }
  
  // IDE config file detection
  if (await fileExists('.vscode/settings.json') || await fileExists('.vscode/')) {
    agents.push({ name: 'github-copilot', type: 'ide' });
  }
  if (await fileExists('.cursor/')) {
    agents.push({ name: 'cursor', type: 'ide' });
  }
  
  return agents;
}

const CLI_AGENTS = [
  ['claude-code', 'claude'],
  ['codex', 'codex'],
  ['amp', 'amp'],
  ['gemini-cli', 'gemini'],
  ['aider', 'aider'],
];
```

#### Step 3: Applying Content

Files are placed at the correct paths by referencing the Manifest's `agentPaths` table based on detected agents.

```
# When GitHub Copilot is detected:
.agents/skills/fnx-diagnostics/SKILL.md          ← skill content
.agents/skills/fnx-best-practices/SKILL.md
.agents/skills/fnx-create-function/SKILL.md
.agents/skills/fnx-intro/SKILL.md
.agents/skills/fnx-feedback/SKILL.md
.github/copilot-instructions.md                   ← Instructions (with template variables expanded)
.github/agents/fnx.agent.md                       ← Agent Definition
AGENTS.md                                         ← Generic Instructions

# When Claude Code is also detected (additional):
.claude/skills/ → symlink to .agents/skills/       ← symlink
Append Functions section to .claude/CLAUDE.md       ← append mode
```

### 3.3 Behavior of `fnx setup --module mcp`

```
# When GitHub Copilot (VSCode) is detected:
Add the following to .vscode/mcp.json (merge if existing):
{
  "servers": {
    "fnx-templates": {
      "command": "npx",
      "args": ["manvir-templates-mcp-server"],
      "description": "Azure Functions template discovery and scaffolding"
    }
  }
}

# When Claude Code is detected:
Add to .claude/settings.json mcpServers (merge if existing):
{
  "mcpServers": {
    "fnx-templates": {
      "command": "npx",
      "args": ["manvir-templates-mcp-server"]
    }
  }
}

# When Cursor is detected:
Add to .cursor/mcp.json
```

### 3.4 CLI Interface

```
fnx setup [options]

Options:
  --module <name>        Specific module only: agent, mcp, ci, iac, docker
  --agent <agents...>    Specify agents (skip auto-detection): copilot, claude, cursor, codex
  --all                  Apply all modules (no prompts)
  --non-interactive      Use default values
  --force                Overwrite existing files
  --manifest <path|url>  Use custom Manifest (default: bundled version)
  --dry-run              Show changes without applying them
```

### 3.5 Idempotency

- If existing files are present, a **diff is displayed** and files are not overwritten without `--force`
- MCP configuration uses a **merge approach** (preserves existing servers/mcpServers and adds fnx entries)
- Skills use **version comparison** — only proposes an update if the Manifest's `updated` date is newer

---

## 4. fnx chat — Agent Launcher

### 4.1 Design Principles

Follows the F20 design with the following changes:

| Aspect | F20 | This Spec |
|--------|-----|-----------|
| Agent detection | CLI only | CLI + IDE + explicit specification |
| Instruction files | `.fnx/agent.md` only | `.fnx/agent.md` + auto-injected detection context |
| MCP startup | Started alongside the agent | Not needed if MCP is already configured (set up via `fnx setup`) |

### 4.2 Operation Flow

```
$ fnx chat

🔍 Loading project context...
  ├── Runtime: Node.js v4 (TypeScript)
  ├── SKU: Flex Consumption
  ├── Functions: httpTrigger (HTTP), processQueue (Queue)
  └── Agent workspace: .agents/skills/ (5 skills installed)

🤖 Detecting available coding agents...
  ✓ GitHub Copilot CLI (ghcs)
  ✓ Claude Code (claude)
  ✗ Codex CLI (not installed)

Which agent would you like to use?
  ❯ Claude Code (recommended — most feature-rich as a CLI agent)
    GitHub Copilot CLI

🚀 Launching Claude Code with Azure Functions context...

┌──────────────────────────────────────────────────┐
│  fnx chat • Claude Code • Flex Consumption       │
│  Skills: 5 installed • MCP: fnx-templates        │
│  Project: my-functions-app (2 functions)          │
└──────────────────────────────────────────────────┘

Claude Code has been launched, enhanced with Azure Functions knowledge.
```

### 4.3 Agent Launch Commands

Each agent requires different flags to pass context:

```javascript
// lib/chat/launchers.js
const AGENT_LAUNCHERS = {
  'claude-code': {
    command: 'claude',
    // Claude Code auto-reads CLAUDE.md and .claude/skills/
    // Additional context is passed via --system-prompt
    buildArgs: (context) => [
      '--system-prompt', context.agentMdPath,
    ],
  },
  'github-copilot-cli': {
    command: 'ghcs',
    // Copilot CLI auto-reads .github/copilot-instructions.md
    // Additional context via --agent-instructions
    buildArgs: (context) => [
      '--agent-instructions', context.agentMdPath,
    ],
  },
  'codex': {
    command: 'codex',
    buildArgs: (context) => [
      '--instructions', context.agentMdPath,
    ],
  },
};
```

### 4.4 Auto-generation of `.fnx/agent.md`

Template is expanded from project detection results:

```markdown
# Azure Functions Development Agent

You are assisting a developer building Azure Functions applications.

## Project Context
- **Runtime:** Node.js v4 (TypeScript)
- **SKU:** Flex Consumption
- **Functions:** httpTrigger (HTTP), processQueue (Queue)
- **Emulator:** fnx (local development)

## Available Skills
The following fnx skills are installed in this workspace:
- **fnx-diagnostics**: Diagnose fnx start issues, errors, logs
- **fnx-best-practices**: SKU-specific best practices
- **fnx-create-function**: Create new functions using fnx templates
- **fnx-intro**: What fnx can do, installed skills overview
- **fnx-feedback**: Report issues from conversation history

## Available MCP Tools
You have access to the fnx Templates MCP server:
- `functions_language_list`: Get supported languages and runtime versions
- `functions_project_get`: Scaffold project files
- `functions_template_get`: Generate function template code

## Guidelines
- Always use v4 programming model for Node.js
- Check SKU compatibility before suggesting triggers/bindings
- Use `fnx start` for local testing (not `func start`)
- Flex Consumption constraints: [auto-populated from manifest]
- Follow established project structure
```

### 4.5 CLI Interface

```
fnx chat [options]

Options:
  --agent <name>     Specify agent (skip detection): claude, copilot, codex, amp
  --no-mcp           Do not start MCP servers
  --prompt <text>    Non-interactive mode: send a single prompt and exit
  --no-setup         Do not error if fnx setup has not been run
```

---

## 5. Initial Skill Proposals

Five skills will be initially implemented for the demo.

### 5.1 fnx-diagnostics (Diagnostics Skill)

```yaml
---
name: fnx-diagnostics
description: "Diagnose and resolve fnx start issues. Provides error message analysis, log interpretation, and solutions for common problems. USE FOR: fnx start failed, got an error, function not working, host crashed"
tags: [fnx, diagnostics, troubleshooting]
category: Development
---
```

**Content**: Diagnostic flows for common error patterns by SKU, host.json configuration issues, port conflicts, dependency errors, and Azurite-related problems.

### 5.2 fnx-best-practices (Best Practices)

```yaml
---
name: fnx-best-practices
description: "Azure Functions SKU-specific best practices. Guidance for performance, security, and cost optimization. USE FOR: best practices, performance, security, cost, SKU constraints"
tags: [azure-functions, best-practices, performance, security]
category: Development
---
```

**Content**: Constraints, recommended patterns, `local.settings.json` security concerns (recommendation not to store secrets in the workspace), and binding patterns for Flex Consumption / Premium / Dedicated.

### 5.3 fnx-create-function (Function Creation Skill)

```yaml
---
name: fnx-create-function
description: "Workflow for creating new Azure Functions using fnx templates. Works with MCP tools to discover and apply templates. USE FOR: create function, add trigger, new function, template"
tags: [fnx, create, template, scaffold]
category: Development
---
```

**Content**: How to use MCP tools (`functions_template_get`), template list by trigger type, SKU compatibility check flow.

### 5.4 fnx-intro (Introduction Skill)

```yaml
---
name: fnx-intro
description: "Introduction to fnx features, list of installed skills, overview of capabilities. USE FOR: what is fnx, what can fnx do, list skills, help, getting started"
tags: [fnx, introduction, help, overview]
category: General
---
```

**Content**: fnx command list, installed skill descriptions, workflow examples, frequently asked questions.

### 5.5 fnx-feedback (Feedback Skill)

```yaml
---
name: fnx-feedback
description: "Report issues encountered during conversation as GitHub Issues. Extracts problems from conversation history and generates Issues with reproduction steps. USE FOR: report issue, feedback, bug report, file issue"
tags: [fnx, feedback, issue, bug-report]
category: Utility
---
```

**Content**: Conversation history analysis procedure, Issue template, structuring reproduction steps, recommended labels, `gh issue create` command generation flow.

---

## 6. Coexistence Design with Manvir's Work

### 6.1 Manvir's Current Work

| Work Item | Status | Files/Location |
|-----------|--------|----------------|
| `fnx init` (project scaffolding) | ✅ Complete | `lib/init.js`, `lib/init/` |
| CI/CD documentation (GitHub Actions, ADO) | ✅ Committed | `docs/f17-fnx-init-cd-*.md` |
| Docker documentation | ✅ Committed | `docs/f17-fnx-init-docker.md` |
| Templates MCP server | ✅ Published to npm | `manvir-templates-mcp-server` |
| Azure MCP PR (#1959) | 🔄 Under review | `microsoft/mcp` repo |

### 6.2 Coexistence Rules

```
fnx command hierarchy:

fnx init     ← Manvir's responsibility (F17). Project scaffolding.
fnx start    ← Existing. Host startup.
fnx config   ← Existing. Configuration management.
fnx setup    ← This spec (F20). Agent/DevOps scaffolding for existing projects.
fnx chat     ← This spec (F20). Agent launcher.
```

**Conflict avoidance strategies**:

1. **Do not touch `fnx init`** — No modifications to Manvir's `lib/init/` directory
2. **Implement in new directories** — Create new `lib/setup/` and `lib/chat/`
3. **CI/CD and Docker can be moved to `fnx setup`** — Manvir's documentation also states "these can be moved from init to setup". Future implementation via `fnx setup --module ci`
4. **Use Manvir's existing MCP server** — Reference `manvir-templates-mcp-server` in MCP configuration. Switch to Azure MCP (#1959) once merged
5. **Define integration points with new commands via Manifest** — Export logic so `fnx init --agent-config` can call `fnx setup --module agent`

### 6.3 File Layout (func-emulate Repository)

```
fnx/
├── lib/
│   ├── cli.js                    # Existing — add setup/chat commands
│   ├── init.js                   # Manvir's responsibility — no changes
│   ├── init/                     # Manvir's responsibility — no changes
│   ├── setup/                    # ← New (this spec)
│   │   ├── index.js              # fnx setup entry point
│   │   ├── detect.js             # Project auto-detection
│   │   ├── agent-detect.js       # Agent auto-detection
│   │   ├── manifest-loader.js    # Manifest loading (local/remote)
│   │   ├── apply-skills.js       # Skill application logic
│   │   ├── apply-instructions.js # Instructions generation & application
│   │   ├── apply-mcp.js          # MCP config generation & merging
│   │   ├── apply-agents.js       # Agent Definition generation
│   │   └── ui.js                 # Interactive UI (module selection)
│   ├── chat/                     # ← New (this spec)
│   │   ├── index.js              # fnx chat entry point
│   │   ├── launchers.js          # Agent launch definitions
│   │   └── agent-md-gen.js       # .fnx/agent.md generation
│   └── ...existing files...
├── manifests/                    # ← New
│   ├── default.yaml              # Default Manifest (bundled)
│   └── skills/                   # Bundled skill files
│       ├── fnx-diagnostics/SKILL.md
│       ├── fnx-best-practices/SKILL.md
│       ├── fnx-create-function/SKILL.md
│       ├── fnx-intro/SKILL.md
│       └── fnx-feedback/SKILL.md
└── ...
```

---

## 7. Implementation Approach Selection and Rationale

### 7.1 Manifest-Based Approach (Adopted)

**Selection**: Manage per-agent path mappings and content definitions via a YAML Manifest.

**Rationale**:
1. **Easy to support new agents** — Only update the Manifest, no code changes required
2. **Remote updates possible** — Can fetch the latest Manifest beyond what's bundled
3. **Interoperability with Loom** — Structure is similar to Loom's manifest.yaml, enabling future publication as a Loom template
4. **Declarative** — What goes where is clear from reading the Manifest

**Rejected alternatives**:
- Hardcoded approach — Requires code changes for every new agent
- skills.sh CLI dependency — Delegating to `npx skills add` was considered, but conflicts with fnx's zero-dependency policy

### 7.2 Copy as Default + Junction Option (Adopted)

**Selection**: Place skill content in `.agents/skills/` via copy by default. Provide directory junction (Windows) / symlink (macOS/Linux) via the `--link` flag as an option.

**Rationale** (changed based on the dobby investigation in Appendix A):
1. **Avoids VSCode atomic save issue** — dobby #406, #426 confirmed that file symlinks/hard links break on VSCode save
2. **Avoids Windows permission issues** — File symlinks require Developer Mode or administrator privileges. Copy does not
3. **Avoids silent failures** — Junction target disappearance silently returns empty (#658)
4. **Low cost** — Skill files are a few KB to tens of KB. Copy overhead is negligible
5. **Updates are explicit** — Update to latest via `fnx setup --force`. Safer than implicit synchronization

**Rejected alternatives**:
- File symlink → Breaks on VSCode atomic save (dobby #406)
- Hard link → Breaks for the same reason (dobby #426)
- Symlink as default → The skills.sh approach, but erring on the safe side given 6+ bugs from dobby

### 7.3 Auto-Detection + Confirmation UI (Adopted)

**Selection**: Auto-detect, but always display results to the user and ask for confirmation.

**Rationale**:
1. **Reduces cognitive load** — Works even if the user doesn't know which agents are installed
2. **Transparency** — Detection results are visible, so false positives can be caught
3. **Manual override available** — Skip detection with the `--agent` flag

### 7.4 MCP Configuration Merge Approach (Adopted)

**Selection**: Read existing MCP configuration files and add only fnx MCP servers.

**Rationale**:
1. **Does not break existing config** — Preserves other MCP servers the user has added
2. **Idempotent** — Running twice does not duplicate fnx-templates (checked by id)

**Rejected alternative**: File overwrite approach — Risk of deleting existing MCP configuration

---

## 8. Demo Scope (Today's Goal)

### 8.1 What to Implement for the Minimal Demo

| Feature | Scope | Priority |
|---------|-------|----------|
| Project auto-detection | Node.js only (host.json + package.json) | ★★★ |
| Agent auto-detection | Copilot (VSCode) + Claude Code only | ★★★ |
| `fnx setup --module agent` | Place 5 skills + Instructions + AGENTS.md | ★★★ |
| `fnx setup --module mcp` | Add fnx-templates to .vscode/mcp.json | ★★★ |
| `fnx chat` | Claude Code launcher (single agent only) | ★★☆ |
| Manifest local bundle | default.yaml + 5 skills | ★★★ |
| Agent Definition | Generate `.github/agents/fnx.agent.md` | ★☆☆ |
| Interactive UI | Simple readline-based selection | ★★☆ |

### 8.2 What the Demo Will Not Include

- Remote Manifest fetching
- CI/CD, IaC, Docker, azd modules
- Python / .NET / Java project detection
- Cursor / Codex / other agent support
- Symlinks (copy is sufficient for a Windows demo)
- Tests (unit tests to be added after the demo)

---

## 9. Future Extensions

| Phase | Content |
|-------|---------|
| **v1.1** | Remote Manifest fetching (GitHub raw URL → cache → bundle fallback) |
| **v1.2** | Python / .NET / Java project detection |
| **v1.3** | Additional agent support for Cursor / Codex / Windsurf, etc. |
| **v2.0** | `fnx setup --module ci` (CI/CD), `--module iac` (IaC) — Implement Manvir's docs |
| **v2.1** | Integration with `fnx init` — Auto-bundle skills at init time via `fnx init --agent-config` |
| **v3.0** | Loom registry integration — Install from Loom via `loom apply fnx --registry functions` |
| **v3.1** | Community-extensible Manifests — Third parties can add custom skills to Manifests |

---

## Appendix A: Known Issues and Mitigations for Symlinks / Junctions (dobby/loom Investigation)

> **Source**: [serverless-paas-balam/dobby](https://github.com/serverless-paas-balam/dobby) — A predecessor project to Loom. It encountered numerous symlink/junction-related issues, and the lessons learned are reflected in this spec's design.

### A.1 Discovered Issues

| # | Issue | Severity | Status | Summary |
|---|-------|----------|--------|---------|
| [#406](https://github.com/serverless-paas-balam/dobby/issues/406) | Agent definition symlink sometimes replaced with regular file | High | Closed | **VSCode's atomic save** (write to temp file → delete original → rename) replaces symlinks with regular files. Also occurs when agents edit their own definitions. |
| [#426](https://github.com/serverless-paas-balam/dobby/issues/426) | Personal symlinks use hard links — vulnerable to atomic save | High | Closed | **Windows hard links** (`fs.link()`) break on VSCode's atomic save. After saving, the link count drops to 1 and the two files diverge. |
| [#420](https://github.com/serverless-paas-balam/dobby/issues/420) | Instructions folder symlink not created during provisioning | Medium | Closed | Symlink creation silently fails. Caused by Windows permission issues, path calculation errors, and insufficient error handling. |
| [#658](https://github.com/serverless-paas-balam/dobby/issues/658) | Agent mode breaks when repo switches branches (junction target disappears) | High | Open | **Directory junction target disappears**. When a branch switch causes the target directory to no longer exist, the junction silently returns empty. |
| [#424](https://github.com/serverless-paas-balam/dobby/issues/424) | Improve setupPersonalSymlinks error handling | Medium | Closed | Internal symlinks fail during junction-to-real-directory conversion, but errors are swallowed. |
| [#481](https://github.com/serverless-paas-balam/dobby/issues/481) | Detect and remediate stale pre-v1.5.0 workspaces | Low | Open | Workspaces created with old methods (file symlink/hard link) become stale. Migrated to directory junctions in v1.5.0. |
| [#229](https://github.com/serverless-paas-balam/dobby/issues/229) | Create .github/skills and .github/instructions symlinks | — | Closed | Original proposal for skill and instructions symlink placement. |

**Loom (successor):**
| # | Issue | Summary |
|---|-------|---------|
| [loom#6](https://github.com/serverless-paas-balam/loom/issues/6) | Use directory junctions for cloned repos | Use `mklink /J` on Windows (no admin privileges required), `ln -s` on macOS/Linux. Recommends **directory-level junctions** rather than per-file symlinks. |

### A.2 Key Lessons

#### Lesson 1: VSCode's Atomic Save Destroys Symlinks (#406, #426)

When saving files, VSCode uses an atomic save pattern: "write to temp file → delete original file → rename temp file." This causes:

- **File symlinks** → Deleting the original file removes the symlink target, replacing it with a new regular file
- **Hard links** (`fs.link()`) → Break in the same way. After saving, the link count drops to 1 and the two files diverge

**dobby's solution**: Deprecated per-file symlinks/hard links and migrated to **directory-level junctions** (`mklink /J`) in v1.5.0, PR #468. Files within a junction are read/written through normal file operations and are unaffected by VSCode's atomic save.

#### Lesson 2: Windows Symlinks Have Permission Issues (#420)

Creating file symlinks on Windows requires **Developer Mode** or **administrator privileges**. This fails silently, leaving the user unaware.

**dobby's solution**:
- **Directory junctions** (`mklink /J`) do not require admin privileges → recommended
- **Fall back to copy** when file symlinks are needed

#### Lesson 3: Junction Target Disappearance Fails Silently (#658)

When a junction's target directory disappears (e.g., due to a Git branch switch), the junction does not return an error — it **behaves as an empty directory**. VSCode / Copilot displays nothing.

**Impact on fnx**: Since fnx skills are copied from the fnx package, branch switch issues are unlikely. However, target disappearance could occur during remote Manifest updates.

#### Lesson 4: Error Handling Is Essential (#424)

Silently swallowing symlink/junction creation failures leaves users unable to understand what happened, making debugging difficult.

### A.3 Implications for the fnx Spec

Based on the lessons above, this spec adopts the following strategies:

| Aspect | Strategy | Rationale |
|--------|----------|-----------|
| **Default method** | **Copy** (equivalent to `--copy`) | Safest option. No VSCode atomic save issues. No Windows permission issues. fnx skills are small text files, so copy cost is negligible |
| **Optional method** | `fnx setup --link` for **directory junction** (Windows) / **symlink** (macOS/Linux) | Provided for advanced users or those wanting centralized workspace management |
| **File symlinks** | **Not used** | Lesson from dobby #406, #426. Broken by VSCode's atomic save |
| **Hard links** | **Not used** | Lesson from dobby #426. Broken for the same reason |
| **Error handling** | **Explicit warning display** on failure + fallback (copy) | Lesson from dobby #420, #424 |
| **Health checks** | Verify health of existing links on `fnx setup` re-run | Lesson from dobby #481. Detect broken links and propose remediation |

#### Alignment with skills.sh

skills.sh's `npx skills add` recommends symlinks as the default, with a `--copy` flag for copy. **fnx defaults to copy, placing the default on the opposite (safer) side from skills.sh**. Rationale:

1. fnx's target users are Azure Functions developers who may not be familiar with how symlinks work
2. Skill files are small (a few KB to tens of KB), so copy cost is minimal
3. Updates can be performed explicitly via `fnx setup --force`
4. The fact that dobby experienced 6+ symlink-related bugs demonstrates that erring on the safe side is warranted

> **Note**: If skills.sh standardizes on directory junctions in the future, fnx will consider following suit. However, fnx will avoid independently using per-file symlinks/hard links.
