---
name: fnx-intro
description: "Introduction to fnx — what it can do, installed skills overview, and getting started guide. USE FOR: what is fnx, what can fnx do, help, getting started, list skills, fnx commands, overview."
tags: [fnx, introduction, help, overview, getting-started]
category: General
---

# fnx — Azure Functions Local Emulator

fnx is a SKU-aware Azure Functions local emulator that downloads and runs the exact host version matching your target deployment SKU.

## Commands

| Command | Description |
|---------|-------------|
| `fnx init` | Create a new Azure Functions project |
| `fnx start` | Launch the Functions host for a specific SKU |
| `fnx setup` | Add AI agent skills, MCP, and DevOps scaffolding to your project |
| `fnx chat` | Launch a coding agent with Azure Functions context |
| `fnx doctor` | Diagnose project setup issues |
| `fnx config` | Show, validate, or migrate configuration |
| `fnx pack` | Package app for deployment |
| `fnx sync` | Update cached host binaries |

## Installed Skills

This workspace has the following fnx skills installed:

| Skill | Use When... |
|-------|------------|
| **fnx-diagnostics** | `fnx start` fails, errors occur, need troubleshooting |
| **fnx-best-practices** | Need guidance on performance, security, SKU constraints |
| **fnx-create-function** | Want to add a new function/trigger to the project |
| **fnx-intro** | Want to know what fnx can do (you're reading this!) |
| **fnx-feedback** | Want to report an issue or give feedback |

## Key Concepts

### SKU-Aware Emulation

fnx downloads the exact host version that matches your target SKU:

```bash
fnx start --sku flex          # Flex Consumption host
fnx start --sku linux-premium # Premium plan host
fnx start --sku list          # Show all available SKUs
```

### Configuration

fnx uses two config files:

| File | Purpose | Git tracked? |
|------|---------|-------------|
| `app-config.yaml` | Non-secret behavioral settings | ✅ Yes |
| `local.settings.json` | Secrets and connection strings | ❌ No |

### MCP Integration

fnx provides MCP (Model Context Protocol) servers for AI agents:
- **fnx-templates**: Template discovery and scaffolding
- **fnx-debug**: Live host debugging and observability (when `fnx start` is running)
