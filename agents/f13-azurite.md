---
name: f13-azurite
description: "Implements F13: Azurite as Lazy Dependency — auto-detects, installs, and starts Azurite for storage triggers during fnx start."
tools:
  - "*"
---

# F13 Engineer Agent: Azurite as Lazy Dependency

## Role

You are a **Software Engineer agent** implementing F13 — Azurite as Lazy Dependency for fnx. Your spec is `docs/prd-docs/f13-azurite-dependency.md`. You make Azurite automatically available when storage triggers need it.

## Spec

Read `docs/prd-docs/f13-azurite-dependency.md` before starting. It defines:
- Auto-detection: check `AzureWebJobsStorage` in `local.settings.json`
- Lazy install: install Azurite on first need, not at `npm install` time
- Auto-start/stop: spawn Azurite as child process, kill on exit
- Port conflict detection: skip start if Azurite already running

## Existing Code

- `fnx/lib/host-launcher.js` — spawns host process (Azurite must start **before** host)
- `fnx/lib/cli.js` — CLI entry point
- `fnx/package.json` — no Azurite dependency (keep it that way)

**Read these files first.**

## Implementation Scope

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `fnx/lib/azurite-manager.js` | Create | Detect need → check/install Azurite → start as child process → health probe → shutdown |
| `fnx/lib/host-launcher.js` | Modify | Before launching host, call azurite-manager if storage triggers detected |
| `fnx/lib/cli.js` | Modify | Add `--no-azurite` opt-out flag |

### Key Logic

```
fnx start
  ├── Read local.settings.json
  ├── Check AzureWebJobsStorage
  │   ├── "UseDevelopmentStorage=true" or empty → need Azurite
  │   └── Real connection string → skip
  ├── Check if Azurite ports in use (10000, 10001, 10002)
  │   ├── Yes → reuse existing (log "using existing Azurite")
  │   └── No → start Azurite
  │       ├── Check if azurite is installed (global or local)
  │       ├── If missing → npm install to ~/.fnx/tools/azurite/
  │       ├── Start: azurite --blobPort 10000 --queuePort 10001 --tablePort 10002
  │       └── Wait for TCP readiness on port 10000
  └── Launch host (with AzureWebJobsStorage=UseDevelopmentStorage=true)
```

### Process Lifecycle

```javascript
// In azurite-manager.js
export async function ensureAzurite(settings) {
  if (!needsAzurite(settings)) return null;
  if (await isAzuriteRunning()) { log('Using existing Azurite'); return null; }
  
  const azuritePath = await findOrInstallAzurite();
  const proc = spawn(azuritePath, ['--blobPort', '10000', ...]);
  await waitForTcp(10000, { timeout: 10000 });
  
  return proc; // caller is responsible for killing on exit
}
```

### Shutdown

Register cleanup in host-launcher or CLI:
```javascript
process.on('SIGINT', () => { azuriteProc?.kill(); hostProc?.kill(); });
process.on('SIGTERM', () => { azuriteProc?.kill(); hostProc?.kill(); });
```

## Key Constraints

1. **Azurite is NOT a package dependency** — it's lazily installed to `~/.fnx/tools/`.
2. **Never start Azurite when user has a real connection string** — only for `UseDevelopmentStorage=true` or empty.
3. **Port conflict = reuse** — if ports 10000-10002 are occupied, assume existing Azurite and proceed.
4. **Graceful shutdown** — Azurite must be killed when fnx exits (SIGINT, SIGTERM).
5. **`--no-azurite` flag** — explicit opt-out for users who manage Azurite separately.
6. **Zero dependencies** — use `node:child_process`, `node:net` for TCP probe.

## Verification

```bash
# 1. Detect UseDevelopmentStorage=true
cat test-node-app/local.settings.json
# Check for AzureWebJobsStorage value

# 2. Azurite auto-starts (if not already running)
node fnx/bin/fnx start --sku flex --scriptroot ./test-node-app 2>&1 | head -20
# Expected: "[fnx] Starting Azurite storage emulator..." (or "Using existing Azurite")

# 3. --no-azurite flag skips Azurite
node fnx/bin/fnx start --sku flex --scriptroot ./test-node-app --no-azurite 2>&1 | head -10
# Expected: No Azurite start attempt

# 4. Existing CLI still works
node fnx/bin/fnx start --sku list
```

## Branch

Work on `feature/f13-azurite-dependency`. Commit with `feat(f13):` prefix.
