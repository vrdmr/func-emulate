# fnx (Phoenix Emulate)

**SKU-aware Azure Functions local emulator** — part of Project Phoenix. A POC proving that `fnx start --sku <sku-name>` can download and launch the correct Functions Host version for any target deployment SKU.

## Problem

Azure Functions Core Tools bundles a single host version, but different SKUs (Flex Consumption, Windows Consumption, etc.) deploy host versions at different cadences. This causes "works locally, breaks in cloud" failures.

## Solution

A thin Node.js CLI (`fnx`) that:
1. Fetches a **SKU profile registry** mapping each SKU to its current host version
2. Downloads the correct **self-contained host** from CDN
3. Launches it as a child process with clean, filtered output

```
$ fnx start --sku flex --scriptroot ./my-app

Azure Functions Local Emulator (fnx)
Emulator Version:  0.1.0
Host Version:      4.1047.100 (Flex Consumption)

Functions:

    hello: [GET,POST] http://localhost:7071/api/hello

For detailed output, run fnx with --verbose flag.
```

## Quick Start

### Prerequisites

- **Node.js 18+**

That's it. Host binaries are downloaded automatically from [GitHub Releases](https://github.com/vrdmr/func-emulate/releases).

### 1. Run with a SKU

```bash
# Default (Flex Consumption, latest host)
node fnx/bin/fnx start --scriptroot ./my-function-app

# Specific SKU
node fnx/bin/fnx start --sku windows-consumption --scriptroot ./my-function-app --port 7072

# Side-by-side comparison (two terminals!)
node fnx/bin/fnx start --sku flex --port 7071 --scriptroot ./my-function-app
node fnx/bin/fnx start --sku windows-consumption --port 7072 --scriptroot ./my-function-app
```

On first run, fnx fetches the SKU profile registry from GitHub, downloads the correct host binary (~256MB), and caches it at `~/.fnx/hosts/{version}/`. Subsequent runs start instantly.

### 2. List available SKUs

```bash
node fnx/bin/fnx start --sku list
```

```
Available SKU profiles:

  SKU                     Host Version         Bundle Version    Status
  ─────────────────────── ──────────────────── ───────────────── ──────────
  flex                    4.1047.100           [4.22.*, 5.0.0)   GA
  linux-premium           4.1046.100           [4.21.*, 5.0.0)   GA
  windows-consumption     4.1045.200           [4.19.*, 5.0.0)   GA
  windows-dedicated       4.1045.100           [4.19.*, 5.0.0)   GA
  linux-consumption       4.1044.400           [4.18.*, 5.0.0)   deprecated
```

### 3. Use a custom profiles source

```bash
# Point to a different profiles JSON (URL, local file, or inline JSON)
node fnx/bin/fnx start --profiles https://example.com/my-profiles.json --scriptroot ./my-app
node fnx/bin/fnx start --profiles ./my-profiles.json --scriptroot ./my-app

# Or via environment variable
export FUNC_PROFILES_URL=https://example.com/my-profiles.json
node fnx/bin/fnx start --scriptroot ./my-app
```

## CLI Reference

```
fnx <action> [options]

Actions:
  start            Launch the Azure Functions host runtime for a specific SKU

Options:
  --sku <name>     Target SKU (flex, linux-premium, windows-consumption, etc.)
                   Resolution: CLI flag → app.config.json → local.settings.json → default "flex"
  --scriptroot     Path to function app directory (default: current directory)
  --port <port>    Host HTTP port (default: 7071)
  --profiles <src> Profiles source: URL, local file path, or inline JSON
  --verbose        Show all host output (unfiltered)
  -v, --version    Show version
  -h, --help       Show full help with examples
```

## Configuration

fnx reads two config files from the function app directory:

| File | Purpose | Git tracked? |
|------|---------|-------------|
| `app.config.json` | Non-secret settings (`TargetSku`, `FUNCTIONS_WORKER_RUNTIME`, feature flags) | ✅ Yes |
| `local.settings.json` | Secrets and connection strings | ❌ No (.gitignored) |

Values from both files are merged and injected as environment variables into the host process. `local.settings.json` values take precedence.

**Example `app.config.json`:**
```json
{
  "TargetSku": "flex",
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AzureWebJobsFeatureFlags": "EnableWorkerIndexing"
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `FUNC_PROFILES_URL` | Override the SKU profiles endpoint. Default: fetches from GitHub. Can be any URL or local file path serving the profiles JSON. |

## Project Structure

```
├── fnx/                         # The CLI (zero npm dependencies)
│   ├── bin/fnx                  # Entry point
│   ├── lib/cli.js               # Argument parsing, config merging, orchestration
│   ├── lib/profile-resolver.js  # Fetch/cache SKU profiles (GitHub → cache → bundled)
│   ├── lib/host-manager.js      # Download/extract/cache host packages
│   ├── lib/host-launcher.js     # Spawn host process, filter logs
│   └── profiles/sku-profiles.json  # Bundled fallback profiles
├── cdn-server/                  # Local CDN mock (dev/testing only)
│   ├── server.js
│   ├── profiles/sku-profiles.json
│   └── hosts/                   # Locally-built host zips
├── tests/                       # Test apps, tools, and reports
│   ├── build-hosts.sh           # Builds host versions from azure-functions-host source
│   ├── test-node-app/           # Node.js V4 function app
│   ├── test-python-app/         # Python V2 function app
│   ├── test-tools/              # Test helper scripts
│   └── TEST_REPORT.md           # Full test report
├── .github/workflows/           # CI
│   └── build-hosts.yml          # Multi-platform host build + GitHub Release upload
├── docs/                        # Spec documents
│   ├── prd.md                   # Product Requirements
│   ├── implementation.md        # Implementation Spec
│   ├── testing.md               # Test Plan
│   └── npm-release-plan.md      # npm publish roadmap
```

## How It Works

1. **Profile resolution**: CLI reads `--sku` flag (or `app.config.json` → `local.settings.json` → default `flex`), fetches the SKU profile from CDN (with 1hr cache + bundled fallback)
2. **Host download**: Downloads the platform-specific host zip for the profile's `hostVersion`, extracts to `~/.fnx/hosts/{version}/`, caches for reuse
3. **Host launch**: Spawns the self-contained .NET host executable with merged env vars from both config files. Filters host output for clean display (like `func start`)

## Supported Runtimes

Node.js, Python, Java, PowerShell. Dotnet/dotnet-isolated use in-process hosting and are not supported in this POC.

## Test Results

**158 automated tests** (114 unit + 44 E2E) — all passing.

### Running Tests

```bash
# Unit tests only (fast, no network needed)
node --test tests/unit/*.test.js

# E2E tests — MCP server (spawns fnx templates-mcp over stdio)
node --test tests/e2e/mcp-stdio.test.js tests/e2e/mcp-tools.test.js

# E2E tests — CLI startup/failure scenarios
node --test tests/e2e/startup-failure.test.js tests/e2e/cross-sku.test.js

# E2E tests — existing logging/verbose tests
node --test tests/e2e/start-logging.test.js tests/e2e/verbose-mode.test.js

# MCP protocol tests (from F6/F10 — spawns full server per test)
node --test tests/tests-templates-mcp/*.test.js

# Everything at once
node --test tests/unit/*.test.js tests/e2e/*.test.js tests/tests-templates-mcp/*.test.js
```

### Test Suites

| Suite | Tests | What it covers |
|-------|-------|----------------|
| `tests/unit/log-filter.test.js` | 18 | Log filtering, host state management |
| `tests/unit/console-output.test.js` | 10 | Clean/verbose output formatting |
| `tests/unit/config-layering.test.js` | 19 | CLI flags, config merge, SKU precedence |
| `tests/unit/mcp-templates.test.js` | 24 | Template tool handlers, path safety, metadata |
| `tests/unit/profile-resolver.test.js` | 16 | SKU resolution, inline JSON, file path, errors |
| `tests/unit/host-manager.test.js` | 12 | Platform detection, host cache, bundle capping |
| `tests/unit/config-merge.test.js` | 15 | Env construction, secret redaction, bundle calc |
| `tests/e2e/mcp-stdio.test.js` | 11 | MCP stdio transport, concurrent calls, shutdown |
| `tests/e2e/mcp-tools.test.js` | 14 | MCP tool invocation (template + SKU tools) |
| `tests/e2e/startup-failure.test.js` | 7 | Invalid project, .NET in-process detection |
| `tests/e2e/cross-sku.test.js` | 12 | Multi-SKU resolution, --sku list, version order |

### Test Fixtures

Test fixtures in `tests/fixtures/` provide deterministic inputs:
- `valid-node-app/` — Minimal Node.js function app
- `invalid-project/` — Broken host.json for error-path testing
- `inprocess-dotnet/` — In-process .NET project for F9 detection tests

### Manual Integration Tests

**9/11 manual tests passed** (81.8%) — see [tests/TEST_REPORT.md](tests/TEST_REPORT.md) for details.

Highlights:
- ✅ Side-by-side: Two different host versions (flex + win-consumption) serving the same app simultaneously
- ✅ All 5 SKUs start successfully
- ✅ Offline fallback works (cached profiles + hosts)
- ⚠️ Python worker returns 503 (env var investigation needed)

## Docs

| Document | Description |
|----------|-------------|
| [docs/prd.md](docs/prd.md) | Product Requirements Document |
| [docs/implementation.md](docs/implementation.md) | Full implementation spec |
| [docs/testing.md](docs/testing.md) | Test plan (11 scenarios) |
| [AGENTS.md](AGENTS.md) | Agent orchestration guide |

## Status

🚧 **POC — Not for production use.** Scoped to non-dotnet languages with `authLevel: anonymous` HTTP triggers.
