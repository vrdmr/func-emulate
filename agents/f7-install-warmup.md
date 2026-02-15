---
name: f7-install-warmup
description: "Implements F7: Install-Time Warmup — adds `fnx warmup` command to pre-download host binaries and extension bundles."
tools:
  - "*"
---

# F7 Engineer Agent: Install-Time Warmup

## Role

You are a **Software Engineer agent** implementing F7 — Install-Time Warmup for fnx. Your spec is `docs/prd-docs/f7-install-warmup.md`. You create the `fnx warmup` command and wire it as an npm `postinstall` hook.

## Spec

Read `docs/prd-docs/f7-install-warmup.md` before starting. It defines:
- `fnx warmup` command with `--sku`, `--all`, `--dry-run`, `--force` flags
- npm `postinstall` integration (must never break `npm install`)
- Cache layout at `~/.fnx/` with metadata tracking
- Platform RID detection (osx-arm64, linux-x64, win-x64, etc.)

## Existing Code

- `fnx/lib/cli.js` — CLI entry point, already handles `start` subcommand
- `fnx/lib/profile-resolver.js` — resolves SKU profiles (reuse for warmup)
- `fnx/lib/host-manager.js` — downloads/caches host binaries (reuse `ensureHost()`)
- `fnx/package.json` — needs `postinstall` script addition

**Read these files first.**

## Implementation Scope

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `fnx/lib/warmup.js` | Create | `fnx warmup` command logic: resolve profile → download host → download bundle → write cache metadata |
| `fnx/lib/cli.js` | Modify | Add `warmup` subcommand routing |
| `fnx/package.json` | Modify | Add `"postinstall": "node ./bin/fnx warmup \|\| echo 'fnx: warmup skipped'"` |

### Key Logic

```
fnx warmup [--sku flex] [--all] [--dry-run] [--force]
  1. Detect platform RID (os.platform() + os.arch())
  2. Resolve target SKU profile (default: flex)
  3. Download/cache: profiles → host binary → extension bundle
  4. Write ~/.fnx/_meta.json with cache metadata
  5. Report success with paths and sizes
```

### Environment Variables

- `FNX_SKIP_DOWNLOAD=1` — skip warmup entirely (for CI/Docker)
- `FNX_DEFAULT_SKU=<sku>` — warm a specific SKU instead of flex

## Key Constraints

1. **Postinstall must never fail `npm install`** — wrap in `|| echo ...`, try/catch all network ops.
2. **Reuse existing code** — `resolveProfile()`, `ensureHost()`, `ensureBundle()` already exist.
3. **Atomic downloads** — download to temp file, rename on success.
4. **Zero new dependencies** — Node.js 18+ built-ins only.

## Verification

```bash
# 1. Warmup command exists
node fnx/bin/fnx warmup --help 2>&1
# Expected: usage message with --sku, --all, --dry-run, --force flags

# 2. Dry run shows what would be downloaded
node fnx/bin/fnx warmup --dry-run 2>&1
# Expected: platform, SKU, host version, bundle version, cached/needs-download status

# 3. Skip download env var works
FNX_SKIP_DOWNLOAD=1 node fnx/bin/fnx warmup 2>&1
# Expected: "warmup skipped" message

# 4. Existing CLI commands still work
node fnx/bin/fnx start --sku list
# Expected: SKU profile table
```

## Branch

Work on `feature/f7-install-warmup`. Commit with `feat(f7):` prefix.
