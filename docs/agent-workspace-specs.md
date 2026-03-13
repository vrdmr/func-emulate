# Coding Agent Workspace Specification Comparison

> **Date**: 2026-03-09  
> **Purpose**: Organize workspace configuration specs across coding agents, clarify shared standards vs. platform-specific specs

---

## 1. Instructions (Agent Directives)

Mechanisms for giving project-specific instructions to agents.

| Agent | File / Path | Format | Scope | Notes |
|-------|-------------|--------|-------|-------|
| **GitHub Copilot (VSCode/CLI)** | `.github/copilot-instructions.md` | Markdown | Repository-wide | Official spec. Works in both VSCode and CLI |
| | `.github/instructions/*.instructions.md` | Markdown | Path-scoped | Glob patterns to specify target files |
| | `AGENTS.md` (any level) | Markdown | Directory-scoped | Adopts OpenAI's agents.md spec. Nearest file takes precedence |
| | `CLAUDE.md` (root) | Markdown | Repository-wide | Claude-compatible. Automatically read by Copilot CLI |
| | `GEMINI.md` (root) | Markdown | Repository-wide | Gemini-compatible |
| | `$HOME/.copilot/copilot-instructions.md` | Markdown | User-global | Personal global instructions |
| **Claude Code** | `CLAUDE.md` (root / any level) | Markdown | Repository / directory | Claude's official spec. Nestable |
| | `~/.claude/CLAUDE.md` | Markdown | User-global | Cross-project instructions |
| | `.claude/settings.json` | JSON | Project settings | Allowed commands, MCP servers, etc. |
| **Cursor** | `.cursor/rules/*.mdc` | MDC (Markdown+) | Rule files | 4 modes: `alwaysApply`, `autoAttached`, `agentRequested`, `manual`. Path glob scoping |
| | `.cursorrules` (root) | Text | Repository-wide | Legacy (deprecated; migrate to `.cursor/rules/`) |
| **Codex (OpenAI)** | `AGENTS.md` (any level) | Markdown | Directory-scoped | Official OpenAI spec. Nearest file wins |
| | `codex.md` (root) | Markdown | Repository-wide | Codex-specific supplement |
| **Gemini CLI** | `GEMINI.md` (root / any level) | Markdown | Repository / directory | Google's official spec |
| **Cline** | `.cline/rules/*.md` | Markdown | Project | Rule files |
| | `.clinerules` (root) | Text | Repository-wide | Legacy format |
| **Windsurf** | `.windsurfrules` (root) | Text | Repository-wide | Windsurf-specific |
| **Amp** | `AGENT.md` (root) | Markdown | Repository-wide | Amp-specific |

### Convergence Trends

- **`AGENTS.md`** is emerging as the de facto common standard (originated by OpenAI, adopted by GitHub Copilot)
- **`CLAUDE.md`** is Claude Code-specific but also read by GitHub Copilot CLI
- `.github/copilot-instructions.md` is GitHub-ecosystem-only but offers the most structured approach (path-scoped instructions)
- Agents increasingly **read other agents' instruction files** (cross-compatibility is growing)

---

## 2. Skills (Knowledge & Workflow Injection)

Mechanisms for giving agents specialized knowledge and workflows.

| Agent | File / Path | Format | Installation | Notes |
|-------|-------------|--------|-------------|-------|
| **GitHub Copilot (VSCode)** | `plugin/skills/*/SKILL.md` | Markdown (YAML frontmatter) | `/plugin install` | Plugin system (e.g., Copilot for Azure) |
| **GitHub Copilot CLI** | `.github/skills/*/SKILL.md` | Markdown (YAML frontmatter) | Loom templates / manual | Workspace template-driven |
| **skills.sh ecosystem** | `.agents/skills/*/SKILL.md` | Markdown (YAML frontmatter) | `npx skills add <repo> --skill <name>` | **Multi-agent compatible**. Symlinks to each agent. 37+ agents supported |
| **Claude Code** | `.claude/skills/*/SKILL.md` | Markdown (YAML frontmatter) | `npx skills add` / manual | skills.sh compatible |
| **Cursor** | `.cursor/skills/*/SKILL.md` | Markdown (YAML frontmatter) | `npx skills add` / manual | skills.sh compatible |
| **Codex** | `.codex/skills/*/SKILL.md` | Markdown (YAML frontmatter) | `npx skills add` / manual | skills.sh compatible |

### Per-Agent Skills Directory Reference (skills.sh Official)

The actual installation path used by `npx skills add` varies by agent. Some share `.agents/skills/` while others have their own paths.

#### Agents sharing `.agents/skills/`

| Agent | `--agent` ID | Project Path | Global Path |
|---|---|---|---|
| **GitHub Copilot** | `github-copilot` | `.agents/skills/` | `~/.copilot/skills/` |
| **Cursor** | `cursor` | `.agents/skills/` | `~/.cursor/skills/` |
| **Codex** | `codex` | `.agents/skills/` | `~/.codex/skills/` |
| **Cline** | `cline` | `.agents/skills/` | `~/.agents/skills/` |
| **Gemini CLI** | `gemini-cli` | `.agents/skills/` | `~/.gemini/skills/` |
| **OpenCode** | `opencode` | `.agents/skills/` | `~/.config/opencode/skills/` |
| **Amp** | `amp` | `.agents/skills/` | `~/.config/agents/skills/` |
| **Kimi Code CLI** | `kimi-cli` | `.agents/skills/` | `~/.config/agents/skills/` |
| **Replit** | `replit` | `.agents/skills/` | `~/.config/agents/skills/` |
| **Universal** | `universal` | `.agents/skills/` | `~/.config/agents/skills/` |

#### Agents with platform-specific paths

| Agent | `--agent` ID | Project Path | Global Path |
|---|---|---|---|
| **Claude Code** | `claude-code` | `.claude/skills/` | `~/.claude/skills/` |
| **Windsurf** | `windsurf` | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` |
| **Roo Code** | `roo` | `.roo/skills/` | `~/.roo/skills/` |
| **Trae** | `trae` | `.trae/skills/` | `~/.trae/skills/` |
| **Goose** | `goose` | `.goose/skills/` | `~/.config/goose/skills/` |
| **Antigravity** | `antigravity` | `.agent/skills/` | `~/.gemini/antigravity/skills/` |
| **Augment** | `augment` | `.augment/skills/` | `~/.augment/skills/` |
| **Droid** | `droid` | `.factory/skills/` | `~/.factory/skills/` |
| **Junie** | `junie` | `.junie/skills/` | `~/.junie/skills/` |
| **Continue** | `continue` | `.continue/skills/` | `~/.continue/skills/` |
| **Cortex Code** | `cortex` | `.cortex/skills/` | `~/.snowflake/cortex/skills/` |
| **Kilo Code** | `kilo` | `.kilocode/skills/` | `~/.kilocode/skills/` |
| **Kiro CLI** | `kiro-cli` | `.kiro/skills/` | `~/.kiro/skills/` |
| **Qwen Code** | `qwen-code` | `.qwen/skills/` | `~/.qwen/skills/` |
| **Zencoder** | `zencoder` | `.zencoder/skills/` | `~/.zencoder/skills/` |
| **Mistral Vibe** | `mistral-vibe` | `.vibe/skills/` | `~/.vibe/skills/` |

> **How it works**: `npx skills add` places the canonical copy in `.agents/skills/` and creates **symlinks** from each agent's specific directory (recommended). Use `--copy` flag for independent copies when symlinks aren't supported.
>
> **Version requirements**: No specific version constraints are documented. Skills are plain `SKILL.md` files (Markdown), so any agent version that supports reading files from its skills directory will work. This is a relatively recent capability — using the latest version of each agent is recommended.

### Standard SKILL.md Format

```markdown
---
name: my-skill
description: "Skill description"
tags: [azure, functions]
category: Development
---

# Skill Name

## Overview
Detailed skill description...

## Usage
Steps and commands...
```

### Convergence Trends

- **`SKILL.md` (YAML frontmatter + Markdown body)** is the de facto standard format
- **skills.sh / `npx skills add`** serves as a universal installation CLI
- `.agents/skills/` is establishing itself as the universal directory (symlinked to each agent's specific folder)

---

## 3. MCP (Model Context Protocol)

Connecting agents to external tools and data sources. **The only true industry standard.**

| Agent | Config File | Format | Notes |
|-------|-------------|--------|-------|
| **GitHub Copilot (VSCode)** | `.vscode/mcp.json` | JSON | VSCode native integration. `servers` key |
| **GitHub Copilot CLI** | `.github/copilot-mcp.json` etc. | JSON | CLI environment. `mcpServers` key |
| **Claude Code** | `.claude/settings.json` → `mcpServers` | JSON | Project-scoped |
| | `~/.claude/settings.json` | JSON | User-global |
| **Cursor** | `.cursor/mcp.json` | JSON | Project-scoped |
| | `~/.cursor/mcp.json` | JSON | User-global |
| **Codex** | `codex-mcp.json` | JSON | OpenAI-compliant |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | JSON | Windsurf-specific path |
| **Cline** | `.cline/mcp.json` etc. | JSON | Cline-specific path |
| **ChatGPT** | MCP connectors | API | OpenAI platform integration |

### Common MCP Server Definition Schema

```json
{
  "mcpServers": {
    "server-name": {
      "command": "node",
      "args": ["./server.js"],
      "env": {
        "API_KEY": "..."
      }
    }
  }
}
```

### MCP Characteristics

- **Open protocol proposed by Anthropic** — adopted by OpenAI, Google, Microsoft, Cursor, and all major players
- Based on JSON-RPC 2.0
- 3 transports: **stdio** (local), **SSE** (legacy remote), **Streamable HTTP** (recommended remote)
- **Only the config file location differs; content is essentially identical**

---

## 4. Agent Definitions (Custom Agents/Personas)

Mechanisms for defining task-specific agent personas.

| Agent | File / Path | Format | Notes |
|-------|-------------|--------|-------|
| **GitHub Copilot (VSCode/CLI)** | `.github/agents/*.agent.md` | Markdown (YAML frontmatter) | Custom agent definitions. Invoked via `@agent-name` |
| **Cursor** | `.cursor/agents/*.md` | Markdown | Agent definitions |
| **Claude Code** | (No dedicated mechanism) | — | Uses CLAUDE.md for overall behavior. No `@agent` switching |
| **Codex** | Within `AGENTS.md` | Markdown | Multiple agent instructions in a single file |

### Convergence Trends

- Agent definitions are **not yet standardized**
- GitHub Copilot's `.agent.md` (YAML frontmatter + tools/description) is the most structured approach
- Claude Code achieves persona switching through skills rather than dedicated agent definitions

---

## 5. Slash Commands / Prompts

Pre-defined prompt template mechanisms.

| Agent | File / Path | Format | Notes |
|-------|-------------|--------|-------|
| **GitHub Copilot (VSCode/CLI)** | `.github/prompts/*.prompt.md` | Markdown (YAML frontmatter) | Invoked via `/prompt-name`. Variables: `${selection}`, `${file}`, etc. |
| **Claude Code** | `/` commands (built-in only) | Built-in | No custom slash command file definitions |
| **Cursor** | `@` mentions + manual rules | MDC | Define rules in manual mode, invoke via `@ruleName` |
| **Codex** | (None) | — | No custom prompt mechanism |

### Convergence Trends

- A standard prompt template format **does not yet exist**
- GitHub Copilot's `.prompt.md` is the most structured approach (YAML frontmatter for variables and mode specification)

---

## 6. Shared Standards vs. Platform-Specific Summary

### ✅ Industry Standards (Use Now)

| Spec | Standardization | Supported Agents | Recommendation |
|------|----------------|-------------------|----------------|
| **MCP (Model Context Protocol)** | ⭐⭐⭐⭐⭐ | Copilot, Claude, Cursor, Codex, Windsurf, Cline, ChatGPT, Gemini, etc. | **Adopt first** |
| **SKILL.md (YAML frontmatter)** | ⭐⭐⭐⭐☆ | 37+ agents via skills.sh | **Strongly recommended** |
| **AGENTS.md** | ⭐⭐⭐⭐☆ | Codex, Copilot CLI, other OpenAI-compatible | **Recommended** |

### 🔄 De Facto Standards (Growing Adoption)

| Spec | Standardization | Supported Agents | Recommendation |
|------|----------------|-------------------|----------------|
| **CLAUDE.md** | ⭐⭐⭐☆☆ | Claude Code, Copilot CLI | Viable (Copilot CLI reads it) |
| **`.agents/skills/`** directory | ⭐⭐⭐☆☆ | Entire skills.sh ecosystem | Viable (multi-agent sharing) |

### ❌ Platform-Specific (Requires Per-Platform Provider)

| Spec | Agent | Notes |
|------|-------|-------|
| `.github/copilot-instructions.md` | GitHub Copilot only | GitHub ecosystem-bound |
| `.github/agents/*.agent.md` | GitHub Copilot only | Custom agent definitions |
| `.github/prompts/*.prompt.md` | GitHub Copilot only | Slash command templates |
| `.cursor/rules/*.mdc` | Cursor only | MDC format-specific |
| `.cursorrules` / `.windsurfrules` / `.clinerules` | Each: 1 agent | Legacy formats |

---

## 7. Recommended Strategy

### Short-term (Shared Specs Available Now)

1. **MCP** — All agents support it. Config file locations differ but content is identical. Build a server once, use everywhere
2. **SKILL.md** — `npx skills add` distributes to 37+ agents at once. Place in `.agents/skills/`, symlink to each agent
3. **AGENTS.md** — OpenAI-originated, Copilot CLI also adopts it. Just place at repo root

### Medium-term (Growing Standards)

4. **CLAUDE.md** — Read by Claude Code + Copilot CLI. Can coexist with AGENTS.md
5. **`.agents/skills/` universal directory** — skills.sh multi-agent distribution platform

### Long-term (Watch for Standardization)

- **Instructions unification**: `AGENTS.md` is the frontrunner, but platform-specific formats will persist
- **Agent definition standardization**: No industry standard yet. GitHub's `.agent.md` is one candidate
- **Prompt templates**: Standardization is far off. GitHub's `.prompt.md` is the most advanced

---

## 8. Multi-Agent Workspace Layout Example

```
my-project/
├── AGENTS.md                          # Shared instructions (Codex, Copilot CLI)
├── CLAUDE.md                          # Claude Code + Copilot CLI
├── GEMINI.md                          # Gemini CLI
│
├── .agents/
│   └── skills/*/SKILL.md              # Universal skills (8+ agents)
│
├── .github/
│   ├── copilot-instructions.md        # GitHub Copilot-specific
│   ├── instructions/*.instructions.md # Path-scoped instructions (Copilot)
│   ├── agents/*.agent.md              # Custom agents (Copilot)
│   └── prompts/*.prompt.md            # Slash commands (Copilot)
│
├── .cursor/
│   ├── rules/*.mdc                    # Cursor-specific rules
│   └── mcp.json                       # MCP config (Cursor)
│
├── .vscode/
│   └── mcp.json                       # MCP config (Copilot VSCode)
│
└── .claude/
    └── settings.json                  # MCP + settings (Claude Code)
```

---

## 9. Conclusion

| Aspect | Recommendation | Rationale |
|--------|---------------|-----------|
| **Tool integration** | **MCP — no alternative** | The only true industry standard. All major agents support it |
| **Knowledge & guidance** | **SKILL.md** | De facto standard. Distribute to 37+ agents via skills.sh |
| **Base instructions** | **AGENTS.md** + optionally **CLAUDE.md** | Multiple agents auto-read these |
| **Platform-specific** | Deploy per-agent configs separately | `.github/`, `.cursor/`, etc. |
| **Long-term investment stability** | MCP > SKILL.md > AGENTS.md | Ranked by standardization maturity |

**Key Finding**: MCP is the only fully standardized industry protocol — tool integration investment should go here. Instructions and Skills have emerging de facto standards but remain in a transitional period with platform-specific formats coexisting.
