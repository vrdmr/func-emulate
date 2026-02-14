# func-emulate

**SKU-aware Azure Functions local emulator** — a POC proving that `func start --sku <sku-name>` can download and launch the correct Functions Host version for any target deployment SKU.

## Problem

Azure Functions Core Tools bundles a single host version, but different SKUs (Flex Consumption, Windows Consumption, etc.) deploy host versions at different cadences. This causes "works locally, breaks in cloud" failures.

## Solution

A thin Node.js CLI (`func-emu`) that:
1. Fetches a **SKU profile registry** mapping each SKU to its current host version
2. Downloads the correct **self-contained host** from CDN
3. Launches it as a child process

```bash
# Run with Flex host (newest)
func-emu start --sku flex --scriptroot ./my-app --port 7071

# Run with Windows Consumption host (older) — side by side!
func-emu start --sku windows-consumption --scriptroot ./my-app --port 7072
```

## Docs

| Document | Description |
|----------|-------------|
| [prd.md](prd.md) | Product Requirements Document |
| [implementation.md](implementation.md) | Full implementation spec (3 agents) |
| [testing.md](testing.md) | Test plan (10 scenarios) |
| [agents.md](agents.md) | Agent orchestration guide |
| [agents/](agents/) | Individual agent specs (PM, Engineer, Test) |

## Quick Start

```bash
# 1. Build host packages (requires .NET 8 SDK, ~20 min)
./build-hosts.sh

# 2. Start dummy CDN server
cd cdn-server && node server.js &

# 3. Run with a SKU
cd func-emu && node bin/func-emu start --sku flex --scriptroot ../test-node-app
```

## Status

🚧 **POC — Not for production use.** Scoped to non-dotnet languages (Node.js, Python, Java, PowerShell) with `authLevel: anonymous` HTTP triggers.
