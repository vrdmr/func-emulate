# Testing Plan: func-emu POC

## Overview

This document defines the test scenarios for the func-emu POC. The goal is to validate that SKU-aware host selection works end-to-end: the CLI resolves a profile, downloads the correct host version from the CDN server, launches it, and serves functions correctly.

## Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | ≥ 18 | `node --version` |
| .NET 8 SDK | ≥ 8.0.101 | `dotnet --version` |
| curl | any | `curl --version` |
| jq (optional) | any | `jq --version` |

### Pre-test Setup

All three agents must have completed their work:

```bash
# 1. Host builds exist (Agent 1)
ls cdn-server/hosts/*/Azure.Functions.Host.*.zip
# Should list 5 zip files

# 2. CDN server is running (Agent 2)
curl -s http://localhost:4566/api/profiles | jq '.profiles | keys'
# → ["flex", "linux-consumption", "linux-premium", "windows-consumption", "windows-dedicated"]

# 3. func-emu CLI is scaffolded (Agent 3)
node func-emu/bin/func-emu start --help 2>&1 | head -1
# → Usage: func-emu start ...

# 4. Test app exists (Agent 3)
cat test-node-app/local.settings.json | jq '.Values.FUNCTIONS_WORKER_RUNTIME'
# → "node"
```

---

## Test 1: CDN Server Health

**What**: Verify the dummy CDN server serves profiles and host zips correctly.

```bash
# 1a. Profile endpoint returns valid JSON with all 5 SKUs
curl -s http://localhost:4566/api/profiles | jq '.profiles | keys | length'
# Expected: 5

# 1b. Each SKU has required fields
curl -s http://localhost:4566/api/profiles | jq '.profiles.flex | keys'
# Expected: includes "displayName", "hostVersion", "hostPackageUrl", "extensionBundleVersion", "status"

# 1c. Host zip download returns 200 with correct Content-Type
curl -I http://localhost:4566/hosts/4.1047.100/Azure.Functions.Host.osx-arm64.zip
# Expected: HTTP 200, Content-Type: application/zip

# 1d. Missing version returns 404
curl -I http://localhost:4566/hosts/9.9.9/Azure.Functions.Host.osx-arm64.zip
# Expected: HTTP 404

# 1e. Root endpoint returns server info
curl -s http://localhost:4566/ | head -1
# Expected: "func-emu CDN Server"
```

**Pass criteria**: All 5 checks pass.

---

## Test 2: Profile Resolution

**What**: Verify func-emu resolves SKU profiles correctly from the CDN server.

```bash
# 2a. List profiles (fetches from CDN server)
node func-emu/bin/func-emu start --sku list
# Expected: Table showing 5 SKUs with versions and status
# Verify: flex shows 4.1047.100, linux-consumption shows 4.1044.400

# 2b. Invalid SKU name
node func-emu/bin/func-emu start --sku nonexistent --scriptroot ./test-node-app 2>&1
# Expected: Error message listing valid SKU names

# 2c. Missing --sku flag
node func-emu/bin/func-emu start 2>&1
# Expected: Usage message requiring --sku
```

**Pass criteria**: Correct output for valid list, clear errors for invalid input.

---

## Test 3: Host Download and Caching

**What**: Verify func-emu downloads hosts from CDN server and caches them locally.

```bash
# Clean cache first
rm -rf ~/.func-emu/hosts/

# 3a. First run triggers download
node func-emu/bin/func-emu start --sku flex --scriptroot ./test-node-app --port 7071 &
PID=$!
sleep 10  # give time for download + extraction + host startup

# Check cache was created
ls ~/.func-emu/hosts/4.1047.100/Microsoft.Azure.WebJobs.Script.WebHost
# Expected: file exists, executable

kill $PID 2>/dev/null

# 3b. Second run uses cache (no download)
node func-emu/bin/func-emu start --sku flex --scriptroot ./test-node-app --port 7071 &
PID=$!
sleep 5
# Expected output includes: "Host cached, skipping download."

kill $PID 2>/dev/null

# 3c. Different SKU triggers new download
node func-emu/bin/func-emu start --sku windows-consumption --scriptroot ./test-node-app --port 7072 &
PID=$!
sleep 10

ls ~/.func-emu/hosts/4.1045.200/Microsoft.Azure.WebJobs.Script.WebHost
# Expected: file exists (different version from flex)

kill $PID 2>/dev/null
```

**Pass criteria**: Downloads happen on first use, cache is reused on second use, different SKUs download different versions.

---

## Test 4: Host Startup — Flex (Latest)

**What**: Verify the self-contained host starts and serves a Node.js function under the Flex profile.

```bash
# Start with Flex SKU
node func-emu/bin/func-emu start --sku flex --scriptroot ./test-node-app --port 7071
```

**Verify** (in another terminal):
```bash
# 4a. Banner shows correct SKU and version
# Expected output includes:
#   Target SKU:        Flex Consumption
#   Host Version:      4.1047.100
#   Extension Bundle:  [4.22.*, 5.0.0)

# 4b. Host starts and lists functions
# Expected output includes:
#   Functions:
#     hello: [GET] http://localhost:7071/api/hello

# 4c. HTTP function responds
curl -s http://localhost:7071/api/hello
# Expected: "Hello from hello! Host: ..."

# 4d. Host health endpoint responds
curl -s http://localhost:7071/admin/host/status | jq '.state'
# Expected: "Running"
```

**Pass criteria**: Host starts, function is discovered, HTTP request returns 200.

---

## Test 5: Host Startup — Windows Consumption (Older)

**What**: Same as Test 4 but with the Windows Consumption profile (older host).

```bash
node func-emu/bin/func-emu start --sku windows-consumption --scriptroot ./test-node-app --port 7072
```

**Verify**:
```bash
# 5a. Banner shows Windows Consumption and older version
# Expected:
#   Target SKU:        Windows Consumption
#   Host Version:      4.1045.200           ← DIFFERENT from Test 4

# 5b. Function responds
curl -s http://localhost:7072/api/hello
# Expected: "Hello from hello! Host: ..."
```

**Pass criteria**: Older host version starts successfully with the same function app.

---

## Test 6: Side-by-Side SKU Comparison (The Money Shot)

**What**: Run two different SKUs simultaneously on different ports, proving version isolation.

```bash
# Terminal 1:
node func-emu/bin/func-emu start --sku flex --scriptroot ./test-node-app --port 7071

# Terminal 2:
node func-emu/bin/func-emu start --sku linux-consumption --scriptroot ./test-node-app --port 7072
```

**Verify**:
```bash
# 6a. Both ports serve the function
curl -s http://localhost:7071/api/hello
curl -s http://localhost:7072/api/hello
# Both return 200

# 6b. Different host versions are running
# Terminal 1 banner: Host Version: 4.1047.100
# Terminal 2 banner: Host Version: 4.1044.400
# Difference: 3 minor versions apart — this is the version skew!

# 6c. Verify different processes
ps aux | grep Microsoft.Azure.WebJobs.Script.WebHost | grep -v grep
# Expected: two separate host processes with different binary paths
```

**Pass criteria**: Two different host versions serve the same app simultaneously on different ports.

---

## Test 7: All 5 SKUs Smoke Test

**What**: Verify each of the 5 SKUs can start and serve a function. Run one at a time.

| SKU | Port | Expected Host Version | Command |
|-----|------|-----------------------|---------|
| flex | 7071 | 4.1047.100 | `node bin/func-emu start --sku flex --scriptroot ../test-node-app --port 7071` |
| linux-premium | 7072 | 4.1046.100 | `node bin/func-emu start --sku linux-premium --scriptroot ../test-node-app --port 7072` |
| windows-consumption | 7073 | 4.1045.200 | `node bin/func-emu start --sku windows-consumption --scriptroot ../test-node-app --port 7073` |
| windows-dedicated | 7074 | 4.1045.100 | `node bin/func-emu start --sku windows-dedicated --scriptroot ../test-node-app --port 7074` |
| linux-consumption | 7075 | 4.1044.400 | `node bin/func-emu start --sku linux-consumption --scriptroot ../test-node-app --port 7075` |

For each:
```bash
# Start the host, wait for "Functions:" output, then:
curl -s http://localhost:${PORT}/api/hello
# Expected: 200 response
```

**Pass criteria**: All 5 SKUs start and serve the hello function.

---

## Test 8: Offline / CDN-Down Fallback

**What**: Verify func-emu works when the CDN server is unreachable.

```bash
# Stop the CDN server (Ctrl+C)

# 8a. With cached profiles (from previous runs)
node func-emu/bin/func-emu start --sku list
# Expected: Shows profiles from ~/.func-emu/profiles/sku-profiles.json (stale cache)

# 8b. With cached host (from previous runs)
node func-emu/bin/func-emu start --sku flex --scriptroot ./test-node-app --port 7071
# Expected: Uses cached host, starts normally

# 8c. With no cache at all
rm -rf ~/.func-emu/
node func-emu/bin/func-emu start --sku list
# Expected: Falls back to bundled profiles (from func-emu/profiles/sku-profiles.json)

# 8d. With no cache and trying to download host
node func-emu/bin/func-emu start --sku flex --scriptroot ./test-node-app --port 7071
# Expected: Error — "no host package for platform" or download failure
# (bundled profiles have localhost URLs, CDN is down, and no cached host)
```

**Pass criteria**: Graceful degradation — cached data works, bundled fallback works for profiles, clear error when host can't be downloaded.

---

## Test 9: Error Handling

**What**: Verify error cases produce clear, actionable messages.

```bash
# 9a. No scriptroot / missing local.settings.json
node func-emu/bin/func-emu start --sku flex --scriptroot /tmp/nonexistent
# Expected: Error about missing FUNCTIONS_WORKER_RUNTIME

# 9b. Dotnet runtime rejected
mkdir -p /tmp/dotnet-app
echo '{"IsEncrypted":false,"Values":{"FUNCTIONS_WORKER_RUNTIME":"dotnet-isolated"}}' > /tmp/dotnet-app/local.settings.json
node func-emu/bin/func-emu start --sku flex --scriptroot /tmp/dotnet-app
# Expected: Error — "This POC only supports non-dotnet runtimes"

# 9c. Unknown command
node func-emu/bin/func-emu deploy
# Expected: Usage message

# 9d. Host executable not found (corrupt cache)
mkdir -p ~/.func-emu/hosts/4.1047.100
rm -f ~/.func-emu/hosts/4.1047.100/Microsoft.Azure.WebJobs.Script.WebHost
# (with CDN server running)
node func-emu/bin/func-emu start --sku flex --scriptroot ./test-node-app --port 7071
# Expected: Re-downloads and extracts host
```

**Pass criteria**: Clear error messages, no stack traces exposed to user.

---

## Test 10: Python Function App

**What**: Verify the POC works with Python (not just Node.js).

```bash
mkdir -p test-python-app

cat > test-python-app/host.json << 'EOF'
{
  "version": "2.0",
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
EOF

cat > test-python-app/local.settings.json << 'EOF'
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "python"
  }
}
EOF

cat > test-python-app/function_app.py << 'EOF'
import azure.functions as func

app = func.FunctionApp()

@app.function_name(name="hello")
@app.route(route="hello", auth_level=func.AuthLevel.ANONYMOUS)
def hello(req: func.HttpRequest) -> func.HttpResponse:
    return func.HttpResponse("Hello from Python!")
EOF

# Install Python Functions SDK
cd test-python-app
python3 -m venv .venv
source .venv/bin/activate
pip install azure-functions
cd ..

node func-emu/bin/func-emu start --sku flex --scriptroot ./test-python-app --port 7076
```

**Verify**:
```bash
curl -s http://localhost:7076/api/hello
# Expected: "Hello from Python!"
```

**Pass criteria**: Python worker starts via gRPC, function serves HTTP.

---

## Test Summary Matrix

| # | Test | What It Validates | Priority |
|---|------|-------------------|----------|
| 1 | CDN Server Health | CDN server serves profiles and zips correctly | P0 |
| 2 | Profile Resolution | CLI resolves SKUs, handles errors | P0 |
| 3 | Host Download & Caching | Download → extract → cache → reuse flow | P0 |
| 4 | Host Startup (Flex) | Latest host starts and serves Node.js function | P0 |
| 5 | Host Startup (Win Consumption) | Older host starts with same app | P0 |
| 6 | Side-by-Side Comparison | Two host versions simultaneously (the demo) | P0 |
| 7 | All 5 SKUs Smoke | Every SKU profile works | P1 |
| 8 | Offline Fallback | Graceful degradation without CDN | P1 |
| 9 | Error Handling | Clear errors for invalid inputs | P1 |
| 10 | Python App | Non-Node language worker works | P1 |

## Definition of Done

The POC is considered successful when:

1. ✅ **Tests 1-6 all pass** — core flow works end-to-end
2. ✅ **Two different host versions** can serve the **same function app** simultaneously on different ports
3. ✅ **Version displayed in banner** matches the SKU profile (proving the correct host was selected)
4. ✅ **Download from CDN server** works (not just pre-placed cache)
5. ✅ **Caching** prevents redundant downloads on subsequent runs

## Known Limitations

| Limitation | Impact | Workaround |
|------------|--------|------------|
| `authLevel` must be `anonymous` | Non-anonymous HTTP triggers return 401 | Use anonymous for POC; production needs host-side env var support |
| No dotnet language support | Can't test C# functions | Scoped out of POC by design |
| No VS Code F5 integration | Must run from terminal | Layer on later with tasks.json |
| Extension bundle version not verified | Bundle override is set but not validated | Can verify via host logs showing bundle load |
| Self-contained host is ~200MB per version | 5 versions = ~1GB disk | Acceptable for POC; production would optimize |
