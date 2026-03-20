---
name: fnx-diagnostics
description: "Diagnose and resolve Azure Functions issues using fnx tools, logs, and source code analysis. Provides precise diagnostics by reading fnx JS source code alongside error messages. USE FOR: fnx start failed, error occurred, function not working, host crashed, 503 error, port conflict, Azurite error, binding error, debug, troubleshoot, diagnose, why is my function not working."
---

# fnx Diagnostics

Diagnose Azure Functions issues by combining fnx built-in tools, host logs, and fnx source code analysis for precise root-cause identification.

## Prerequisites Check

```bash
fnx --version   # Check version; suggest update if outdated
```

## Diagnostic Workflow

### Step 1: Run fnx doctor

```bash
fnx doctor
```

Checks 7 categories: host.json, app-config.yaml, local.settings.json, runtime, host cache, ports, Azurite. Fix any ✗ (fail) items before proceeding.

### Step 2: Reproduce with Verbose Output

```bash
fnx start --verbose 2>&1 | tee fnx-output.log
```

Read the full output. Key indicators:
- `[error]` / `[crit]` — Host-level errors
- `Fail` / `Exception` — Runtime failures
- `WorkerConfig for runtime: {lang} not found` — Host cache corrupt (workers missing)
- `0 functions loaded` with no errors — Missing `EnableWorkerIndexing` for Python v2
- `Port ... in use` — Port conflicts (check for stale fnx host processes)
- `Azurite not available` — Storage emulator missing

### Step 3: Read fnx Source Code

fnx is JavaScript — read the source for precise diagnosis. Key files:

| File | What it handles |
|------|----------------|
| `fnx/lib/host-launcher.js` | Host process lifecycle, error capture, Python detection |
| `fnx/lib/host-manager.js` | Host download, cache, extension bundles |
| `fnx/lib/azurite-manager.js` | Azurite install, startup, health check |
| `fnx/lib/config.js` | Config loading, secret detection, validation |
| `fnx/lib/doctor.js` | All 7 diagnostic checks |
| `fnx/lib/secret-patterns.js` | Secret detection patterns |
| `fnx/lib/cli.js` | Command routing, startup orchestration |

Read the relevant source file to understand exactly what the error means and what conditions trigger it.

### Step 4: Diagnose by Category

| Symptom | Category | First Action |
|---------|----------|-------------|
| `fnx start` exits immediately | Startup | Check host.json, runtime config |
| Host starts, function returns 503 | Worker | Check runtime package (`@azure/functions`) |
| No functions listed in output | Worker | Check `EnableWorkerIndexing` (Python v2), or host cache corrupt |
| `WorkerConfig for runtime not found` | Cache | Delete `~/.fnx/hosts/` and restart |
| Triggers don't fire | Non-HTTP | Check Azurite, connection strings |
| Port already in use | Port | Kill stale host process or `fnx start --port 7080` |
| Azurite errors (connection refused, 403) | Storage | Check Azurite status, connection string |
| "No host package for platform" | Platform | OS/arch not in SKU profile |
| Secrets detected in app-config.yaml | Security | Run `fnx config migrate` |

For detailed error patterns from source code analysis, see [references/fnx-error-patterns.md](references/fnx-error-patterns.md).

For the full diagnostic checklist (security, best-practice, failure), see [references/diagnostic-checklist.md](references/diagnostic-checklist.md).

### Official Azure Functions Diagnostics Resources

- [Troubleshoot Azure Functions](https://learn.microsoft.com/azure/azure-functions/functions-diagnostics)
- [Monitor Azure Functions](https://learn.microsoft.com/azure/azure-functions/functions-monitoring)
- [Application Insights for Functions](https://learn.microsoft.com/azure/azure-functions/configure-monitoring)
- [Diagnose and solve problems (Portal)](https://learn.microsoft.com/azure/azure-functions/functions-diagnostics#diagnose-and-solve-problems)
- [Azure Functions error handling](https://learn.microsoft.com/azure/azure-functions/functions-bindings-error-pages)

### Step 5: Read Customer Code

After understanding the fnx-side error, read the customer's function code to identify:
- Missing dependencies (`package.json`, `requirements.txt`)
- Incorrect binding configurations
- Runtime-specific issues (e.g., async/await errors in Node.js)
- Security concerns (secrets in source, anonymous auth on mutation endpoints)
