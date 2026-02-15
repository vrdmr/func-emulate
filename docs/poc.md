# fnx POC — Path to Production

> What we built, what we learned, and what's needed to ship.

## POC Summary

The fnx (Phoenix Emulate) POC proves that a **SKU-aware local emulator** for Azure Functions is viable. It downloads the correct self-contained host binary for any target deployment SKU, launches it with the right environment, and gives developers a clean `func start`-like experience — without needing the full Core Tools installation.

**Test results:** 11/11 tests passing (Node.js + Python, 5 SKUs, side-by-side)

---

## What Works Today

| Capability | Status | Notes |
|---|---|---|
| SKU-aware host selection | ✅ | 5 SKUs with real version skew |
| Host binary download + caching | ✅ | `~/.fnx/hosts/{version}/` |
| Node.js functions (V4 model) | ✅ | HTTP trigger, anonymous auth |
| Python functions (V2 model) | ✅ | Requires Python 3.9–3.13 |
| Side-by-side SKU execution | ✅ | Different hosts on different ports |
| Profile resolution (CDN/GitHub/bundled) | ✅ | Cascading fallback chain |
| `--profiles` flag (URL/file/JSON) | ✅ | Custom profile sources |
| Config merging (app.config.json + local.settings.json) | ✅ | Priority-based merge |
| Log filtering (clean output) | ✅ | `--verbose` for raw output |
| Azurite auto-start | ✅ | When `UseDevelopmentStorage=true` |
| GitHub Releases distribution | ✅ | Pre-built host zips |

---

## Known Limitations (POC Scope)

### 1. Platform support — macOS ARM64 only

**Current:** Only `osx-arm64` host binaries are built and published.

**Production fix:**
- CI workflow (`.github/workflows/build-hosts.yml`) already supports `linux-x64`, `osx-x64`, `win-x64`
- Need to run it for all 5 host tags × 4 platforms = 20 assets per release
- Profile JSON needs platform-specific download URLs (already templated with `{rid}`)

### 2. Python worker version selection

**Current:** The host bundles per-version worker directories (`3.9/`, `3.10/`, ..., `3.14/`), each with its own version cap in `worker.py`. The host's `worker.config.json` defaults to `3.12`. We set `FUNCTIONS_WORKER_RUNTIME_VERSION` at launch time based on the detected Python binary.

**Root cause found:** The `3.12/worker.py` has `if not (7 <= minor_version <= 12)` — rejects Python 3.13+. The `3.13/worker.py` has no such restriction. Without `FUNCTIONS_WORKER_RUNTIME_VERSION`, the host always picks 3.12.

**Production fix:**
- Auto-detect Python version (done in POC)
- Allow user override via `app.config.json` `PythonPath` field (done in POC)
- Validate that the detected version has a matching worker directory in the host bundle
- Consider bundling a `python3` symlink or launcher script

### 3. Worker config patching

**Current:** `host-manager.js` patches `worker.config.json` post-extraction to rewrite `defaultExecutablePath` from `python` → `python3.{version}`. This is fragile.

**Production fix:**
- Use `languageWorkers__python__defaultExecutablePath` env var (already done as backup)
- Remove file patching once env var approach is validated across all host versions
- Or: contribute upstream fix to azure-functions-host to respect env var consistently

### 4. Non-HTTP trigger display in function listing

**Current:** The clean output parses the worker indexing JSON log line to extract non-HTTP triggers (blob, timer, queue, etc.) and displays them alongside HTTP routes. This log-parsing approach is fragile — it depends on the exact format of the Python/Node worker's indexing output, which may change across host versions.

**Production fix:**
- Use the host's `/admin/functions` REST API to get the canonical function list with binding metadata
- Requires reading the auto-generated master key from `{scriptRoot}/secrets/host.json` (set `AzureWebJobsSecretStorageType=Files`)
- Or: investigate how Core Tools uses in-process `IScriptJobHost.Functions` via DI (see `DisplayFunctionsInfoUtilities.cs` in Core Tools repo) and find an equivalent out-of-process mechanism
- Fall back to log parsing if the admin API is unavailable

### 5. Extension bundles — not validated

**Current:** `extensionBundle` in `host.json` points to `https://functionscdn.azureedge.net/public/ExtensionBundles/Microsoft.Azure.Functions.ExtensionBundle/...`. The host downloads these at startup. This works when online but fails offline.

**Production fix:**
- Pre-cache extension bundles alongside host binaries
- Or: bundle a minimal set of extensions (HTTP, Timer, Storage) in the host zip
- Support `--offline` mode that skips extension download

### 6. dotnet-isolated runtime — not supported

**Current:** Only non-dotnet languages (Node, Python, Java, PowerShell) are supported. The `dotnet-isolated` runtime model requires a different host startup flow.

**Production fix:**
- Investigate `dotnet-isolated` worker startup sequence
- May need to build the user's project (`dotnet build`) before launching host
- Consider making this a separate "advanced" path

### 7. Java and PowerShell — not tested

**Current:** Profile metadata includes Java and PowerShell as supported runtimes, but no test apps exist.

**Production fix:**
- Create test-java-app and test-powershell-app
- Validate Java worker needs (JRE path, worker config)
- Validate PowerShell worker needs (pwsh path)

### 8. npm distribution — not implemented

**Current:** `fnx` is run via `node fnx/bin/fnx`. Not published to npm.

**Production fix:** See `docs/npm-release-plan.md` for the full plan:
- Publish as `@azure/fnx` or `fnx` on npm
- `npx fnx start --sku flex` should just work
- Include bundled profiles in the package

### 9. Auth levels — anonymous only

**Current:** Test functions use `authLevel: anonymous`. The POC doesn't handle function keys or admin keys.

**Production fix:**
- The self-contained host supports keys via `AzureWebJobsSecretStorageType`
- Need to set up local key storage (file-based)
- Or: add `--no-auth` flag that injects anonymous auth middleware

### 10. HTTPS — not supported

**Current:** Host listens on HTTP only.

**Production fix:**
- Support `--useHttps` flag similar to `func start`
- Generate self-signed cert or accept user-provided cert
- Set `ASPNETCORE_URLS` to `https://...` and configure Kestrel

### 11. Colored console output

**Current:** All log output is plain text with no color differentiation.

**Production fix:**
- Add ANSI color codes matching Core Tools style (e.g., yellow for warnings, red for errors, gray for host internals, green for HTTP routes)
- Use `chalk` or built-in ANSI escapes (no dependency needed for Node 18+)
- Respect `NO_COLOR` env var and `--no-color` flag for CI/piped output
- Color the startup banner, function route listing, and request/response logs differently

### 12. Azurite lifecycle

**Current:** Auto-starts Azurite as a detached process when `UseDevelopmentStorage=true`. Cleanup happens on SIGINT/SIGTERM but orphan processes are possible.

**Production fix:**
- Use Azurite as a library (programmatic API) instead of spawning a process
- Or: manage lifecycle more robustly with PID files and health checks
- Consider bundling Azurite in the fnx package

---

## Architecture Decisions (for production)

### Host binary distribution
- **POC:** GitHub Releases on `vrdmr/func-emulate`
- **Production:** Azure CDN or npm package with lazy download
- **Decision needed:** Ship host binaries in the npm package (large, ~256MB each) or download on first use (current approach)?

### Profile schema evolution
- **POC:** Static JSON with 5 profiles
- **Production:** Versioned schema, API endpoint, auto-update
- **Decision needed:** How often do profiles change? Should `fnx` auto-update profiles?

### Relationship with Core Tools (`func`)
- **POC:** Independent tool, no dependency on `func`
- **Production:** Could wrap `func` for some operations, or replace it entirely for local dev
- **Decision needed:** Is this a replacement for `func start` or a complement?

### Relationship with Project Phoenix
- `fnx` is the unified CLI surface for Phoenix
- Current: `fnx start --sku` (emulator)
- Future: `fnx init`, `fnx scenarios`, `fnx samples`, `fnx catalog`, `fnx doctor`, `fnx deploy`
- The emulator is one command in a larger tool

---

## Test Results (Final)

| # | Test | Result |
|---|------|--------|
| 1 | Pre-flight checks | ✅ Pass |
| 2 | Profile resolution (CDN) | ✅ Pass |
| 3 | Profile fallback (bundled) | ✅ Pass |
| 4 | Host download + cache | ✅ Pass |
| 5 | Node.js function (flex) | ✅ Pass |
| 6 | Side-by-side SKUs | ✅ Pass |
| 7 | Custom scriptRoot | ✅ Pass |
| 8 | Invalid SKU error | ✅ Pass |
| 9 | `--sku list` output | ✅ Pass |
| 10 | Python function | ✅ Pass |
| 11 | Python multi-SKU | ✅ Pass |

---

## Immediate Next Steps

1. **Multi-platform host builds** — Run CI workflow for linux-x64, osx-x64, win-x64
2. **npm publish** — Package and publish to npm registry
3. **Java test app** — Validate Java worker support
4. **Offline mode** — Pre-cache extension bundles
5. **Integration with `fnx init`** — Merge emulator into Phoenix CLI surface
