---
name: fnx-intro
description: "Introduction to fnx — the SKU-aware Azure Functions local emulator. Answers questions about fnx commands, capabilities, architecture, and getting started. USE FOR: what is fnx, what can fnx do, help, getting started, fnx commands, overview, how does fnx work, fnx version, fnx features, list skills. Also triggers on general Azure Functions questions where fnx context is relevant."
---

# fnx — Azure Functions Local Emulator

> **Language**: Always respond in the same language the user is using.

fnx downloads and runs the exact Azure Functions host version matching your target deployment SKU, solving "works locally, breaks in cloud" version-skew issues.

**Source**: <https://github.com/vrdmr/func-emulate>

## Prerequisites Check

Before answering, verify the environment:

```bash
fnx --version    # Require 0.4.x+; if missing, install: npm install -g @vrdmr/fnx-test
node --version   # Require >=18
```

If fnx is outdated, suggest: `npm update -g @vrdmr/fnx-test`

### Command Reference Version Check

The command reference file [references/fnx-commands.md](references/fnx-commands.md) tracks a `fnx_version` in its YAML front-matter. After running `fnx --version`, compare the installed version with the `fnx_version` value. If the installed version is newer, the command reference may be outdated — inform the user that some commands or options may have changed and suggest checking `fnx <command> --help` for the latest usage.

## Commands

| Command | Description |
|---------|-------------|
| `fnx init` | Create a new Azure Functions project (interactive wizard) |
| `fnx start` | Launch the Functions host for a specific SKU |
| `fnx setup` | Add AI agent skills, MCP config, and instructions |
| `fnx chat` | Launch a coding agent with Azure Functions context |
| `fnx doctor` | Diagnose project setup issues (7 checks) |
| `fnx config` | Show, validate, or migrate configuration |
| `fnx pack` | Package app for deployment as zip |
| `fnx sync` | Update cached host binaries and extension bundles |
| `fnx warmup` | Pre-download host binaries for CI/Docker |
| `fnx templates-mcp` | Start MCP server for template discovery |

For detailed command reference, see [references/fnx-commands.md](references/fnx-commands.md).

## Key Concepts

### SKU-Aware Emulation

Different Azure SKUs run different host versions (up to 3 minor versions apart). fnx emulates the exact version:

```bash
fnx start --sku flex              # Flex Consumption (default)
fnx start --sku linux-premium     # Premium plan
fnx start --sku list              # Show all available SKUs
```

Available SKUs: `flex`, `linux-premium`, `windows-consumption`, `windows-dedicated`, `linux-consumption`

### Configuration (Two-File Model)

| File | Purpose | Git tracked? |
|------|---------|-------------|
| `app-config.yaml` | Non-secret behavioral settings (runtime, SKU, scale) | ✅ Yes |
| `local.settings.json` | Secrets and connection strings | ❌ No |

### MCP Integration

fnx provides MCP servers for AI coding agents:
- **fnx templates-mcp** — Template discovery and scaffolding (stdio)
- **Live MCP server** — Host debugging and observability (auto-starts with `fnx start` on port 7072)

### Installed Skills

| Skill | Trigger |
|-------|---------|
| **fnx-intro** | "What is fnx?", "fnx help", general questions |
| **fnx-create-function** | "Create function", "add trigger", "fnx init" |
| **fnx-best-practices** | "Best practices", "security", "performance" |
| **fnx-diagnostics** | "fnx start failed", "error", "troubleshoot" |
| **fnx-feedback** | "Report issue", "bug report", "feedback" |

## Current Limitations

- .NET in-process model not supported (dotnet-isolated only)
- Windows-only Python is for local dev only (Azure doesn't host Python on Windows)
- Currently in alpha (0.4.x) — API may change before 1.0

For planned features and roadmap, see [references/roadmap.md](references/roadmap.md).
