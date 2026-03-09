---
name: fnx-diagnostics
description: "Diagnose and resolve fnx start issues. Analyzes error messages, interprets logs, and provides solutions for common problems. USE FOR: fnx start failed, error occurred, function not working, host crashed, 503 error, port conflict, Azurite error, binding error."
tags: [fnx, diagnostics, troubleshooting, azure-functions]
category: Development
---

# fnx Diagnostics

Diagnose and resolve issues when running Azure Functions locally with fnx.

## When to Use

Use this skill when:
- `fnx start` fails or crashes
- Functions return unexpected errors (503, 500, etc.)
- Host doesn't start or hangs
- Triggers don't fire (Queue, Timer, etc.)
- Azurite-related errors occur

## Diagnostic Flow

### Step 1: Identify the Error Category

| Symptom | Category | Go to |
|---------|----------|-------|
| `fnx start` exits immediately | Startup failure | Section A |
| Host starts but function returns 503 | Worker issue | Section B |
| Queue/Timer trigger never fires | Non-HTTP trigger | Section C |
| Port already in use | Port conflict | Section D |
| Azurite connection refused / 403 | Storage emulator | Section E |

### Section A: Startup Failures

1. Check `host.json` exists and is valid JSON
2. Check runtime is detected: `fnx config`
3. Check if port is free: `netstat -an | findstr 7071`
4. Run with verbose: `fnx start --verbose` to see full host output
5. Check SKU profile: `fnx start --sku list`

### Section B: Worker / 503 Errors

- **Node.js**: Ensure `@azure/functions` v4 is installed: `npm ls @azure/functions`
- **Python**: Check `requirements.txt` includes `azure-functions`
- Check `FUNCTIONS_WORKER_RUNTIME` in `app-config.yaml` or `local.settings.json`

### Section C: Non-HTTP Triggers

- Queue triggers require Azurite or real Azure Storage
- Use `fnx start --verbose` to check if QueueListener activates
- Known issue: `UseDevelopmentStorage=true` may not work with some Azurite versions
- Try explicit connection string: `DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8...;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;`

### Section D: Port Conflicts

```bash
# Find what's using port 7071
netstat -an | findstr 7071

# Use a different port
fnx start --port 7072
```

### Section E: Azurite Issues

- Ensure Azurite is running: `azurite --silent`
- fnx auto-starts Azurite by default; use `--no-azurite` to disable
- 403 errors may indicate auth mismatch between Azurite version and host
