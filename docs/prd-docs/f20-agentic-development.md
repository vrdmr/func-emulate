# F20: Agent Mode

**Status:** 📋 Proposed  
**PRD Section:** N/A (new capability)  
**Depends on:** F6 (MCP Server Integration), F10 (Standalone Template MCP), F17 (fnx init)

## Problem

Azure Functions developers today face two distinct friction points depending on where they are in their journey:

**New customers** must manually scaffold projects, discover templates, configure tooling, and wire up their development environment before writing a single line of business logic. Even with `fnx init`, the resulting project is "AI-unaware" — it doesn't ship with the context files (skills, agent instructions, MCP configs) that modern coding agents need to be effective. Developers using Copilot, Claude, Codex, or Cursor get generic assistance rather than Functions-specific guidance.

**Existing customers** have working apps but no easy way to "upgrade" their development experience. Adding AI-assisted development, CI/CD pipelines, infrastructure-as-code, or containerization requires manual research and file authoring. There's no single command that can analyze an existing project and layer on the right scaffolding.

Meanwhile, the industry is rapidly moving toward agentic development — where AI coding agents don't just autocomplete lines but orchestrate entire workflows (create functions, configure bindings, set up deployment). fnx is uniquely positioned to enable this: it already has the template MCP server (F6/F10), SKU awareness, and deep Functions domain knowledge. What's missing is the glue that connects these capabilities to the developer's AI toolchain.

## Feature

F20 introduces three complementary capabilities that make fnx the bridge between Azure Functions and agentic development:

| Command | Audience | What It Does |
|---------|----------|--------------|
| `fnx setup` | Existing apps | Analyzes a project and adds AI/DevOps scaffolding (skills, MCP configs, CI, IaC) |
| `fnx chat` | New & existing | Interactive agentic development — delegates to an underlying coding agent with Functions-specific context |
| Skill files (auto-generated) | New apps via `fnx init` | Bundled `.github/copilot-instructions.md`, `.cursor/rules/`, `.claude/` files that ship with every new project |

### Design Principle

fnx doesn't try to be the AI agent — it **equips** whatever agent the developer already uses. It generates the context files, MCP configurations, and agent instructions that make Copilot/Claude/Codex/Cursor effective at Functions development. `fnx chat` is the one exception: it provides a direct agentic experience for developers who want fnx to drive.

---

## 1. `fnx setup` — Prepare Any Project for Agentic Development

### Overview

`fnx setup` is a post-clone / post-init command that analyzes an existing Azure Functions project and offers to add development scaffolding. It's idempotent — running it twice won't duplicate files, it will update existing ones.

```
$ fnx setup

Detected: Node.js Azure Functions app (Flex Consumption)
  ├── host.json ✓
  ├── local.settings.json ✓
  ├── 3 functions found
  └── SKU: flexconsumption

What would you like to add?

  ◉ AI Skills & Agent Config  — .github/copilot-instructions.md, .cursor/rules, .claude/
  ◉ MCP Configuration         — .vscode/mcp.json (fnx template MCP + live debug MCP)
  ◯ CI/CD Pipeline            — GitHub Actions / Azure DevOps
  ◯ Infrastructure as Code    — Bicep / Terraform
  ◯ Azure Developer CLI       — azure.yaml + infra/
  ◯ Docker                    — Dockerfile + .dockerignore
  ◯ fnx chat agent            — .fnx/agent.md (custom agent instructions)

[Press space to toggle, enter to confirm]
```

### Setup Modules

Each module is independently selectable and generates files appropriate to the detected project:

#### 1a. AI Skills & Agent Config

Generates IDE-specific instruction files that give coding agents deep Functions knowledge:

| File | Target Agent | Purpose |
|------|-------------|---------|
| `.github/copilot-instructions.md` | GitHub Copilot | Repository-level instructions for Copilot |
| `.cursor/rules/azure-functions.mdc` | Cursor | Cursor rules file with Functions patterns |
| `.claude/settings.json` + `.claude/instructions.md` | Claude Code | Claude project instructions |
| `codex.md` | OpenAI Codex | Codex agent instructions |
| `AGENTS.md` | Generic | Agent-agnostic instructions (fallback) |

**Content of generated skill files** (tailored to detected project):

- Functions programming model guidance (v4 for Node, isolated for .NET, etc.)
- Binding patterns and trigger types available on the detected SKU
- Local development workflow (`fnx start`, testing, debugging)
- SKU-specific constraints (e.g., "Flex Consumption doesn't support Durable Functions timer scale")
- Available MCP tools and how to use them
- Common pitfalls and best practices
- Link to fnx template MCP for scaffolding new functions

#### 1b. MCP Configuration

Generates `.vscode/mcp.json` (and equivalent for other editors) that registers:

```json
{
  "servers": {
    "fnx-templates": {
      "command": "npx",
      "args": ["@anthropic/fnx-template-mcp"],
      "description": "Azure Functions template discovery and scaffolding"
    },
    "fnx-debug": {
      "command": "npx",
      "args": ["fnx", "start", "--mcp-port", "9100"],
      "description": "Live Functions host debugging and observability"
    }
  }
}
```

#### 1c. CI/CD Pipeline

Generates workflow files based on provider selection:

- **GitHub Actions:** `.github/workflows/deploy.yml` — build, test, deploy to Azure Functions
- **Azure DevOps:** `.azdo/pipelines/deploy.yml` — equivalent ADO pipeline

Workflow templates are SKU-aware (e.g., Flex Consumption uses `az functionapp deployment` vs. App Service uses zip deploy).

#### 1d. Infrastructure as Code

- **Bicep:** `infra/main.bicep` + `infra/modules/` — Functions app + dependencies
- **Terraform:** `infra/main.tf` + `infra/variables.tf` — equivalent HCL

Generated IaC matches the detected SKU and language runtime.

#### 1e. Azure Developer CLI

- `azure.yaml` — azd project definition
- `infra/` — Bicep templates compatible with `azd up`

Connects fnx projects to the `azd` ecosystem for one-command provisioning + deployment.

#### 1f. Docker

- `Dockerfile` — multi-stage build for the detected language runtime
- `.dockerignore` — standard exclusions

#### 1g. fnx chat agent

- `.fnx/agent.md` — custom agent instructions for `fnx chat` (see section 3)

### CLI Surface

```
fnx setup [--module <name>] [--all] [--non-interactive] [--force]

Options:
  --module <name>    Only run a specific module (skills, mcp, ci, iac, azd, docker, chat-agent)
  --all              Add all modules without prompting
  --non-interactive  Use defaults, don't prompt
  --force            Overwrite existing files
```

### Idempotency

When run on a project that already has some scaffolding:
- Existing files are **not overwritten** unless `--force` is passed
- A diff is shown for files that would be updated
- New modules are offered but existing ones are marked as "already configured"

---

## 2. Skill Files in `fnx init` — AI-Ready from Day One

### Overview

When `fnx init` creates a new project (F17), it should optionally include AI skill files so the project is immediately productive with coding agents. This is a lightweight extension to existing `fnx init` behavior.

### Behavior

```
$ fnx init --language javascript --template httpTrigger --sku flexconsumption

Creating Azure Functions project...
  ✓ host.json
  ✓ local.settings.json
  ✓ package.json
  ✓ src/functions/httpTrigger.js
  ✓ .github/copilot-instructions.md    ← NEW
  ✓ .vscode/mcp.json                   ← NEW
  ✓ AGENTS.md                          ← NEW

Project ready! Your IDE's AI assistant is pre-configured for Azure Functions development.
```

### Opt-out

```
fnx init --no-agent-config    # Skip AI skill file generation
```

### Generated Content

The skill files generated during `fnx init` are identical to those from `fnx setup --module skills`, but tailored to the exact template and SKU chosen during init. For example, a Flex Consumption + Node.js + HTTP trigger project gets:

- Node.js v4 programming model patterns
- HTTP trigger-specific binding examples
- Flex Consumption constraints and best practices
- Reference to the fnx template MCP for adding more functions

---

## 3. `fnx chat` — Agentic App Development

### Overview

`fnx chat` is an interactive command that detects available coding agents and delegates to them with Functions-specific context. fnx doesn't implement its own LLM interface — it launches the developer's existing agent (Copilot CLI, Claude Code, Codex CLI, aider, etc.) with a pre-built agent prompt that includes Functions knowledge, MCP tool access, and project context.

### How It Works

```
$ fnx chat

Detecting available coding agents...
  ✓ GitHub Copilot CLI (copilot)
  ✓ Claude Code (claude)
  ✗ Codex CLI (not installed)
  ✗ aider (not installed)

Which agent would you like to use?
  ❯ GitHub Copilot CLI (Recommended)
    Claude Code

Starting GitHub Copilot CLI with Azure Functions context...

┌─────────────────────────────────────────────────┐
│  fnx chat • Copilot CLI • Flex Consumption      │
│  MCP: fnx-templates (active)                    │
│  Project: my-functions-app (3 functions)         │
└─────────────────────────────────────────────────┘

> I want to add a Cosmos DB triggered function that processes new orders
```

### Agent Detection

fnx checks for known coding agents in `$PATH`:

| Agent | Detection | Launch Command |
|-------|-----------|----------------|
| GitHub Copilot CLI | `which copilot` | `copilot --agent-instructions .fnx/agent.md` |
| Claude Code | `which claude` | `claude --system-prompt .fnx/agent.md` |
| Codex CLI | `which codex` | `codex --instructions .fnx/agent.md` |
| aider | `which aider` | `aider --read .fnx/agent.md` |

Each agent is launched with:
1. **Agent instructions** (`.fnx/agent.md`) — Functions-specific system prompt
2. **MCP configuration** — template MCP server for scaffolding
3. **Project context** — detected SKU, language, existing functions

### The Agent Instructions File (`.fnx/agent.md`)

This is the core of `fnx chat` — a carefully crafted agent prompt that turns any general-purpose coding agent into a Functions expert:

```markdown
# Azure Functions Development Agent

You are helping a developer build an Azure Functions application.

## Project Context
- **Runtime:** Node.js (v4 programming model)
- **SKU:** Flex Consumption
- **Functions:** httpTrigger (HTTP), processOrder (Queue), ...
- **Host:** fnx emulator (local development)

## Available Tools (MCP)
You have access to the fnx template MCP server. Use it to:
- Discover available templates: `get_templates_list`
- Get template code: `get_template`
- Check SKU compatibility: `get_sku_profile`

## Guidelines
- Always use the v4 programming model for Node.js
- Check SKU compatibility before suggesting triggers/bindings
- Use `fnx start` for local testing (not `func start`)
- Follow the established project structure
- ...
```

This file is auto-generated by `fnx setup --module chat-agent` or created during `fnx chat` first run. Developers can customize it.

### CLI Surface

```
fnx chat [--agent <name>] [--no-mcp] [--prompt <text>]

Options:
  --agent <name>     Skip detection, use specific agent (copilot, claude, codex, aider)
  --no-mcp           Don't start MCP server alongside agent
  --prompt <text>    Non-interactive: send a single prompt and exit
```

### Non-Interactive Mode

For CI or scripting:

```bash
fnx chat --agent copilot --prompt "Add a timer trigger that runs every 5 minutes"
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Developer                                                   │
│                                                              │
│  fnx init ──────► New project + skill files + MCP config     │
│  fnx setup ─────► Existing project + scaffolding modules     │
│  fnx chat ──────► Agentic session with coding agent          │
│                                                              │
├──────────────────────┬──────────────────────────────────────┤
│  Skill Files         │  MCP Servers                          │
│                      │                                       │
│  copilot-instr.md    │  fnx-templates (F10)                  │
│  cursor rules        │    ├── get_templates_list             │
│  claude settings     │    ├── get_template                   │
│  codex.md            │    └── get_sku_profile                │
│  AGENTS.md           │                                       │
│                      │  fnx-debug (F6)                       │
│                      │    ├── get_host_status                │
│                      │    ├── get_functions                  │
│                      │    └── invoke_function                │
├──────────────────────┴──────────────────────────────────────┤
│  Agent Launchers                                             │
│                                                              │
│  copilot ──► launched with .fnx/agent.md + MCP              │
│  claude  ──► launched with .fnx/agent.md + MCP              │
│  codex   ──► launched with .fnx/agent.md + MCP              │
│  aider   ──► launched with .fnx/agent.md + MCP              │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: `fnx setup` — Core Modules

1. **Project detection** — analyze `host.json`, `local.settings.json`, `package.json`/`.csproj` to determine language, SKU, programming model
2. **Skills module** — generate AI instruction files for Copilot, Cursor, Claude, Codex
3. **MCP module** — generate `.vscode/mcp.json` with fnx template + debug MCP
4. **Interactive picker** — multi-select UI for module selection

### Phase 2: `fnx init` Integration

1. Add `--no-agent-config` flag to `fnx init`
2. After project scaffolding, run skills + MCP modules from `fnx setup`
3. Tailor generated content to chosen template, language, and SKU

### Phase 3: `fnx setup` — Extended Modules

1. **CI/CD module** — GitHub Actions and Azure DevOps pipeline generation
2. **IaC module** — Bicep and Terraform templates
3. **azd module** — `azure.yaml` + infra scaffolding
4. **Docker module** — Dockerfile generation

### Phase 4: `fnx chat`

1. Agent detection logic (scan `$PATH` for known agents)
2. Agent instructions generator (`.fnx/agent.md` from project context)
3. Agent launcher (spawn with correct flags per agent)
4. MCP server lifecycle (start template MCP alongside agent)

---

## Success Criteria

- [ ] `fnx setup` detects project type (language, SKU, programming model) correctly
- [ ] `fnx setup --module skills` generates valid instruction files for ≥3 agents (Copilot, Claude, Cursor)
- [ ] `fnx setup --module mcp` generates working `.vscode/mcp.json`
- [ ] `fnx init` produces AI-ready projects (skill files included by default)
- [ ] `fnx chat` detects ≥2 installed coding agents
- [ ] `fnx chat` launches agent with Functions-specific context and MCP access
- [ ] Generated skill files improve agent accuracy on Functions tasks vs. no instructions (qualitative)
- [ ] `fnx setup` is idempotent — running twice doesn't duplicate files
- [ ] `fnx setup --module ci` generates working GitHub Actions workflow
- [ ] `fnx setup --module iac` generates valid Bicep/Terraform for detected SKU

## Open Questions

1. **Skill file maintenance:** How do we keep generated instruction files current as the Functions platform evolves? Ship templates in the fnx package? Pull from a CDN?
2. **Agent compatibility:** Each coding agent has different mechanisms for accepting instructions (flags, config files, environment variables). How do we track and adapt to agent CLI changes?
3. **MCP config portability:** `.vscode/mcp.json` is VS Code-specific. Should we also generate configs for other editors (JetBrains, Zed, etc.)?
4. **fnx chat scope:** Should `fnx chat` support multi-turn conversations that persist across sessions? Or is it purely a launcher that delegates everything to the underlying agent?
5. **Telemetry:** Should we collect (opt-in) usage data on which agents developers use and which modules they install?
6. **Template versioning:** When `fnx setup` generates CI/CD or IaC templates, how do we version them? Pin to fnx version? Separate template version?
