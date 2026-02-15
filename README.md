# func-emulate

**SKU-aware Azure Functions local emulator** — a POC proving that `func start --sku <sku-name>` can download and launch the correct Functions Host version for any target deployment SKU.

## Problem

Azure Functions Core Tools bundles a single host version, but different SKUs (Flex Consumption, Windows Consumption, etc.) deploy host versions at different cadences. This causes "works locally, breaks in cloud" failures.

## Solution

A thin Node.js CLI (`func-emu`) that:
1. Fetches a **SKU profile registry** mapping each SKU to its current host version
2. Downloads the correct **self-contained host** from CDN
3. Launches it as a child process with clean, filtered output

```
$ func-emu start --sku flex --scriptroot ./my-app

Azure Functions Local Emulator (func-emu)
Emulator Version:  0.1.0
Host Version:      4.1047.100 (Flex Consumption)

Functions:

    hello: [GET,POST] http://localhost:7071/api/hello

For detailed output, run func-emu with --verbose flag.
```

## Quick Start

### Prerequisites

- **Node.js 18+**
- **.NET 8+ SDK** (for building host binaries from source)
- **Azure Functions Core Tools v4** (`func` CLI, for scaffolding test apps)

### 1. Build host packages (~20 min)

```bash
./build-hosts.sh
```

This clones [Azure/azure-functions-host](https://github.com/Azure/azure-functions-host), checks out 5 release tags, and produces self-contained builds for your platform as zips in `cdn-server/hosts/`.

### 2. Start the CDN server

```bash
cd cdn-server && node server.js &
```

Serves SKU profiles and host packages on `http://localhost:4566`. The func-emu CLI fetches profiles and downloads hosts from here.

### 3. Run with a SKU

```bash
# Default (Flex Consumption, latest host)
node func-emu/bin/func-emu start --scriptroot ./tests/test-node-app

# Specific SKU
node func-emu/bin/func-emu start --sku windows-consumption --scriptroot ./tests/test-node-app --port 7072

# Side-by-side comparison (two terminals!)
node func-emu/bin/func-emu start --sku flex --port 7071 --scriptroot ./tests/test-node-app
node func-emu/bin/func-emu start --sku windows-consumption --port 7072 --scriptroot ./tests/test-node-app
```

### 4. List available SKUs

```bash
node func-emu/bin/func-emu start --sku list
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

## CLI Reference

```
func-emu <action> [options]

Actions:
  start            Launch the Azure Functions host runtime for a specific SKU

Options:
  --sku <name>     Target SKU (flex, linux-premium, windows-consumption, etc.)
                   Resolution: CLI flag → app.config.json → local.settings.json → default "flex"
  --scriptroot     Path to function app directory (default: current directory)
  --port <port>    Host HTTP port (default: 7071)
  --verbose        Show all host output (unfiltered)
  -v, --version    Show version
  -h, --help       Show full help with examples
```

## Configuration

func-emu reads two config files from the function app directory:

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
| `FUNC_EMU_PROFILES_URL` | Override the SKU profiles endpoint (default: `http://localhost:4566/api/profiles`). Can be a GitHub raw URL or any HTTP endpoint serving the profiles JSON. |

## Project Structure

```
├── func-emu/                    # The CLI (zero npm dependencies)
│   ├── bin/func-emu             # Entry point
│   ├── lib/cli.js               # Argument parsing, config merging, orchestration
│   ├── lib/profile-resolver.js  # Fetch/cache SKU profiles (CDN → cache → bundled)
│   ├── lib/host-manager.js      # Download/extract/cache host packages
│   ├── lib/host-launcher.js     # Spawn host process, filter logs
│   └── profiles/sku-profiles.json  # Bundled fallback profiles
├── cdn-server/                  # Local CDN mock (serves profiles + host zips)
│   ├── server.js
│   ├── profiles/sku-profiles.json
│   └── hosts/                   # Built host zips (populated by build-hosts.sh)
├── build-hosts.sh               # Builds 5 host versions from azure-functions-host
├── tests/                       # Test apps, tools, and reports
│   ├── test-node-app/           # Node.js V4 function app
│   ├── test-python-app/         # Python V2 function app
│   ├── test-tools/              # Test helper scripts
│   ├── TEST_REPORT.md           # Full test report
│   └── RETEST_CHECKLIST.md      # Re-test guide
├── prd.md                       # Product Requirements
├── implementation.md            # Implementation Spec
└── testing.md                   # Test Plan
```

## How It Works

1. **Profile resolution**: CLI reads `--sku` flag (or `app.config.json` → `local.settings.json` → default `flex`), fetches the SKU profile from CDN (with 1hr cache + bundled fallback)
2. **Host download**: Downloads the platform-specific host zip for the profile's `hostVersion`, extracts to `~/.func-emu/hosts/{version}/`, caches for reuse
3. **Host launch**: Spawns the self-contained .NET host executable with merged env vars from both config files. Filters host output for clean display (like `func start`)

## Supported Runtimes

Node.js, Python, Java, PowerShell. Dotnet/dotnet-isolated use in-process hosting and are not supported in this POC.

## Test Results

**9/11 tests passed** (81.8%) — see [tests/TEST_REPORT.md](tests/TEST_REPORT.md) for details.

Highlights:
- ✅ Side-by-side: Two different host versions (flex + win-consumption) serving the same app simultaneously
- ✅ All 5 SKUs start successfully
- ✅ Offline fallback works (cached profiles + hosts)
- ⚠️ Python worker returns 503 (env var investigation needed)

## Docs

| Document | Description |
|----------|-------------|
| [prd.md](prd.md) | Product Requirements Document |
| [implementation.md](implementation.md) | Full implementation spec |
| [testing.md](testing.md) | Test plan (11 scenarios) |
| [AGENTS.md](AGENTS.md) | Agent orchestration guide |

## Status

🚧 **POC — Not for production use.** Scoped to non-dotnet languages with `authLevel: anonymous` HTTP triggers.
