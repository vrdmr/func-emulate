# fnx Error Patterns

Error patterns extracted from fnx source code. Use these to precisely identify root causes.

## Startup Errors

| Error | Source File | Cause | Fix |
|-------|------------|-------|-----|
| `No host.json found in {path}` | cli.js:57 | App path doesn't contain host.json | Check `--app-path` or cd to project root |
| `No function app found` | cli.js:81 | host.json not in cwd or ./src | Verify project structure |
| `Unknown SKU '{sku}'` | cli.js:259 | SKU name not in profile registry | Run `fnx start --sku list` |
| `runtime.name not set` | cli.js:229 | Missing from app-config.yaml and local.settings.json | Run `fnx config` or add runtime to config |
| `Failed to start host` | host-launcher.js:461 | Host executable spawn failed | Re-download: `fnx sync --force` |
| `Host exited with code: {n}` | host-launcher.js:472 | Host process crashed | Run `fnx start --verbose` for details |

## Platform & Download Errors

| Error | Source File | Cause | Fix |
|-------|------------|-------|-----|
| `No host package for platform '{rid}'` | host-manager.js:148 | OS/arch not in SKU profile | Check supported platforms in profile |
| `HTTP {status}: {statusText}` | host-manager.js:161 | CDN download failed | Check internet, try `fnx sync --force` |
| `Bundle index fetch failed` | host-manager.js:302 | CDN unreachable | fnx falls back to cache; if cache empty, need internet |
| `No extension bundle found matching range` | host-manager.js:307 | Bundle version not in cache or CDN | `fnx sync extensions --force` |

## Port Conflicts

| Error | Source File | Cause | Fix |
|-------|------------|-------|-----|
| `Port {port} in use` | cli.js:211 | Another process on port 7071 | Kill stale host process (`Stop-Process -Id <PID>`) or `fnx start --port 7080` |
| `MCP server failed to start on port {port}` | cli.js:304 | Port 7072 in use | `fnx start --mcp-port 7073` or `--no-mcp` |

**Stale process detection**: Previous `fnx start` may leave `Microsoft.Azure.WebJobs.Script.WebHost` running. Check with:
- Windows: `netstat -ano | findstr 7071` then `Stop-Process -Id <PID> -Force`
- Linux/macOS: `lsof -i :7071` then `kill <PID>`

## Azurite / Storage Errors

| Error | Source File | Cause | Fix |
|-------|------------|-------|-----|
| `Failed to install Azurite` | azurite-manager.js:100 | npm install timed out or failed | `npm install -g azurite` manually |
| `Azurite not available` | azurite-manager.js:149 | No azurite binary found | Install azurite or use `--no-azurite` |
| `Azurite failed to start: {msg}` | azurite-manager.js:176 | Spawn error | Check if ports 10000-10002 are free |
| `Azurite exited unexpectedly` | azurite-manager.js:182 | Process crashed | Check azurite logs, reinstall |
| `Azurite did not become ready in time` | azurite-manager.js:190 | Port 10000 not responding in 15s | Restart azurite manually |

## Configuration Errors

| Error | Source File | Cause | Fix |
|-------|------------|-------|-----|
| `app-config.yaml is empty or invalid YAML` | config.js:~400 | YAML parse failure | Check YAML syntax |
| `Secrets detected in app-config.yaml` | config.js:~380 | Secret patterns found in committed file | `fnx config migrate` to move secrets |
| `No app-config.yaml or local.settings.json found` | config.js:~376 | Neither config file exists | Run `fnx init` or create manually |
| `host.json invalid JSON` | doctor.js:34 | JSON parse error | Fix JSON syntax |
| `"{runtime}" is not a supported runtime` | doctor.js:117 | Invalid runtime value | Use: node, python, dotnet-isolated, java, powershell |

## Python-Specific

| Error | Source File | Cause | Fix |
|-------|------------|-------|-----|
| `WorkerConfig for runtime: python not found` | host-launcher.js | Host cache corrupt — `workers/python/worker.config.json` missing | Delete `~/.fnx/hosts/` and restart `fnx start` |
| `No compatible python (3.9-3.13) found` | host-launcher.js:387 | Python not in PATH or wrong version | Install Python 3.9-3.13, or set `PythonPath` in config |
| `Python on Windows is for local development only` | host-launcher.js:403 | Windows Python warning | Informational; Azure doesn't host Python on Windows |
| `0 functions loaded` (no errors) | N/A | Missing `EnableWorkerIndexing` for Python v2 model | Add `"AzureWebJobsFeatureFlags": "EnableWorkerIndexing"` to `local.settings.json` Values |

**Cache corruption diagnosis**: Check `~/.fnx/hosts/<version>/workers/python/`:
- Must contain `worker.config.json` (host-to-worker config)
- Must contain `<pyver>/<PLATFORM>/<ARCH>/worker.py` (worker entry point)
- If only `.pyd` files exist, download was interrupted — delete and re-download

## .NET-Specific

| Error | Source File | Cause | Fix |
|-------|------------|-------|-----|
| `fnx does not support the in-process hosting model` | dotnet-detector.js | .csproj has InProcessModel | Migrate to dotnet-isolated worker |

## Secret Detection Patterns (from secret-patterns.js)

**Key name patterns**: ConnectionString, AzureWebJobsStorage, APPINSIGHTS_INSTRUMENTATIONKEY, Password, Secret, ApiKey, Token, SAS_*

**Value patterns**: DefaultEndpointsProtocol=, AccountKey=, SharedAccessSignature=, sb://, mongodb, redis, amqp(s)://, sig= (SAS), Bearer, JWT (ey...)

**Safe exception**: `UseDevelopmentStorage=true` (Azurite marker)
