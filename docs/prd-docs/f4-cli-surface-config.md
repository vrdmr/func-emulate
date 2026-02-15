# F4: CLI Surface & Configuration

**Status:** ✅ POC validated  
**PRD Section:** 6.2, 6.4  
**Source:** `fnx/lib/cli.js`

## Problem

Developers need a simple, ergonomic way to specify their target SKU and have it persist across sessions without re-typing flags.

## Feature

The `fnx start` command with `--sku` flag, config file merging, and a clean help experience.

## Command Surface

```
fnx start                                    # Default to flex
fnx start --sku flex                         # Explicit SKU
fnx start --sku windows-consumption          # Older host version
fnx start --sku list                         # Show all SKUs
fnx start --sku flex --port 8080             # Custom port
fnx start --scriptroot ./my-app              # Custom app directory
fnx start --profiles ./custom-profiles.json  # Custom profile source
fnx start --verbose                          # Unfiltered host output
fnx --version                                # Show version
fnx --help                                   # Show help
```

## SKU Resolution Order

1. `--sku` CLI flag
2. `app.config.json` → `TargetSku` field
3. `local.settings.json` → `TargetSku` field
4. Default: `flex` (with tip message)

## Config Merging

Two config files are merged, with `local.settings.json` taking precedence:

```
app.config.json      ← Non-secret settings (committed to source control)
  + TargetSku        ← Default SKU for the project
  + Values           ← App settings (FUNCTIONS_WORKER_RUNTIME, etc.)

local.settings.json  ← Secrets and overrides (git-ignored)
  + TargetSku        ← Per-developer SKU override
  + Values           ← Connection strings, keys (override app.config)
```

Merged values are injected as environment variables into the host process.

## Log Filtering

- **Default (clean mode):** Startup banner, function list, user logs only
- **`--verbose`:** All host output unfiltered
- Suppress noisy macOS/dev warnings (shared memory, health checks)
- Extract function routes from host output for clean display

## Production Requirements

- `func start --sku` compatibility (same flag on existing `func` CLI)
- Write `TargetSku` back to `local.settings.json` on first use
- Colored console output matching Core Tools style
- `NO_COLOR` env var and `--no-color` flag support
