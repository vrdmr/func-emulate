# F13: Azurite as Lazy Dependency for Local Storage Emulation

**Status:** ✅ Implemented  
**PRD Section:** Local development experience  
**Depends on:** F1 (SKU profiles), F4 (CLI surface)

## Problem

Many Azure Functions use storage-backed triggers (Queue, Blob, Table) or require `AzureWebJobsStorage` for internal host operations (timer trigger leases, singleton locks, durable task hubs). Today, developers must:

1. **Manually install Azurite** (`npm install -g azurite` or Docker)
2. **Manually start it** before running `func start`
3. **Configure the connection string** (`UseDevelopmentStorage=true` or explicit localhost URLs)
4. **Debug cryptic errors** when they forget any of these steps — the host fails with opaque storage connection errors

This is a **friction point in every "Getting Started" tutorial**. New developers hit storage errors within minutes of their first `func start`.

## Feature

Make Azurite a managed dependency of fnx, installed and started automatically when needed:

1. **Lazy install** — Azurite is installed on first `fnx start` when `AzureWebJobsStorage` is set to `UseDevelopmentStorage=true` (or equivalent)
2. **Auto-start** — fnx starts Azurite as a child process before launching the host
3. **Auto-stop** — Azurite is stopped when `fnx start` exits
4. **Zero config** — No manual connection string setup; fnx injects the right values

## How It Works

### Trigger: When Does Azurite Start?

```
fnx start
  ├── Read local.settings.json
  ├── Check AzureWebJobsStorage value
  │   ├── "UseDevelopmentStorage=true"  → Start Azurite ✅
  │   ├── "" (empty) or missing         → Start Azurite ✅ (assume local dev)
  │   └── Real connection string         → Skip Azurite ❌ (user has real storage)
  └── Launch host (after Azurite is ready)
```

### Lazy Installation

Azurite is **not installed at `npm install fnx` time**. It's installed on first need:

```
First `fnx start` with UseDevelopmentStorage=true:
  1. Check if azurite is available (node_modules or global)
  2. If not: `npm install azurite --save-dev` in the project (or fnx internal cache)
  3. Start azurite with configured ports
  4. Wait for azurite to be ready (probe health endpoint)
  5. Proceed with host start
```

Why lazy? Azurite is ~50MB installed. Users who connect to real Azure Storage shouldn't pay this cost.

### Process Management

```
fnx start
  ├── Azurite process (child)
  │   ├── Blob service  → localhost:10000
  │   ├── Queue service → localhost:10001
  │   └── Table service → localhost:10002
  └── Host process (child)
      └── AzureWebJobsStorage → "UseDevelopmentStorage=true"
          (resolved to Azurite localhost endpoints)

SIGINT/SIGTERM → fnx stops host → fnx stops Azurite → exit
```

### Connection String Injection

fnx ensures the host sees the right connection:

```javascript
// When starting with Azurite
const env = {
  ...userEnv,
  AzureWebJobsStorage: 'UseDevelopmentStorage=true',
  // Azurite defaults: blob=10000, queue=10001, table=10002
};
```

No user configuration needed. `UseDevelopmentStorage=true` is a well-known .NET Storage SDK shorthand that resolves to `http://127.0.0.1:10000/devstoreaccount1` etc.

### CLI Output

```
$ fnx start
[fnx] Detected AzureWebJobsStorage=UseDevelopmentStorage=true
[fnx] Starting Azurite storage emulator...
[fnx] Azurite Blob  → http://127.0.0.1:10000
[fnx] Azurite Queue → http://127.0.0.1:10001
[fnx] Azurite Table → http://127.0.0.1:10002
[fnx] Starting Azure Functions host (node20)...
...
Azure Functions runtime is ready
```

## Implementation Plan

### Phase 1: Auto-Start Azurite

- Detect `UseDevelopmentStorage=true` in `local.settings.json`
- Start Azurite as child process before host launch
- Wait for Azurite readiness (TCP probe on port 10000)
- Graceful shutdown: stop Azurite when fnx exits

### Phase 2: Lazy Install

- Check for Azurite availability before starting
- If missing, install to fnx internal cache (`~/.fnx/tools/azurite/`)
- Show progress indicator during install
- Cache the installation for subsequent runs

### Phase 3: Port Conflict Handling

- Detect if Azurite ports are already in use (user running Azurite separately)
- If ports occupied, skip Azurite start and use existing instance
- Configurable ports via `--azurite-blob-port`, `--azurite-queue-port`, `--azurite-table-port`

## Edge Cases

| Case | Handling |
|------|----------|
| Azurite already running (user started manually) | Detect occupied ports, skip auto-start, use existing |
| No `local.settings.json` | Don't start Azurite (no storage config = no storage needed) |
| `AzureWebJobsStorage` = real connection string | Don't start Azurite |
| Azurite install fails (no network) | Error with instructions to install manually |
| Port conflict with non-Azurite process | Error with suggestion to use `--azurite-blob-port` etc. |
| `fnx start` killed with SIGKILL | Orphan Azurite process; next run detects port in use |
| Azurite crashes during function execution | Host gets storage errors; fnx logs Azurite exit and suggests restart |

## Success Criteria

- [x] `fnx start` with `UseDevelopmentStorage=true` auto-starts Azurite without manual setup
- [x] Azurite is installed lazily on first need, not at `npm install fnx`
- [x] Azurite stops when `fnx start` exits (SIGINT, SIGTERM)
- [x] Existing Azurite instance is detected and reused (no duplicate start)
- [x] Storage triggers (Queue, Blob) work out-of-the-box with zero config
- [x] Users with real Azure Storage connection strings are unaffected

## Resolved Questions

- **Install location:** fnx global cache (`~/.fnx/tools/azurite/`) — avoids polluting project `node_modules`
- **Opt-out flag:** Yes — `fnx start --no-azurite` skips Azurite entirely
- **Data persistence:** Azurite data persists in `~/.fnx/tools/azurite/` across runs (workspace dir)
- **Version pinning:** Uses latest Azurite at install time; cached thereafter
- **Log verbosity:** Azurite logs shown only with `--verbose`; startup/port info always shown
