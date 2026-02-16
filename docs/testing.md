# Testing Plan: fnx POC

## Overview

This document defines the test scenarios for the fnx POC. The goal is to validate that SKU-aware host selection works end-to-end: the CLI resolves a profile, downloads the correct host version from the CDN server, launches it, and serves functions correctly.

## Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | ≥ 18 | `node --version` |
| .NET 8 SDK | ≥ 8.0.101 | `dotnet --version` |
| Azure Functions Core Tools | 4.x | `func --version` |
| Python 3 | ≥ 3.9 | `python3 --version` |
| curl | any | `curl --version` |
| jq (optional) | any | `jq --version` |

---

## Test Harness Setup

This section creates everything needed to run the tests — from zero to ready. Run these steps once before the first test execution.

### Step 1: Scaffold the fnx CLI and CDN server (Engineer Agent)

If the Engineer Agent has already run, skip this step. Otherwise, create the files as described in `implementation.md` Sections 4–6 and the `agents/engineer.md` spec.

```bash
# Verify Engineer Agent output exists
ls build-hosts.sh cdn-server/server.js fnx/bin/fnx
```

### Step 2: Build host packages

```bash
chmod +x build-hosts.sh
./build-hosts.sh
# Builds 5 host versions from real release tags (~15-25 min)
# Output: cdn-server/hosts/{version}/Azure.Functions.Host.{platform}.zip
```

Verify:
```bash
ls cdn-server/hosts/*/Azure.Functions.Host.*.zip | wc -l
# Expected: 5
```

### Step 3: Start the CDN server

```bash
cd cdn-server && node server.js &
CDN_PID=$!
cd ..

# Verify
curl -s http://localhost:4566/ | head -1
# Expected: "fnx CDN Server"
```

### Step 4: Scaffold test function apps with `func` CLI

Use the **existing production `func` CLI** (v4) to create real function apps. This ensures correct V2/V4 programming model structure — and proves `fnx` can run any app scaffolded by the existing tooling.

```bash
# Node.js test app (V4 programming model)
func init test-node-app --worker-runtime node --language javascript --model V4
cd test-node-app
func new --name hello --template "HTTP trigger" --authlevel anonymous
npm install
cd ..

# Python test app (V2 programming model)
func init test-python-app --worker-runtime python --model V2
cd test-python-app
func new --name hello --template "HTTP trigger" --authlevel anonymous
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
deactivate
cd ..
```

**Why `func init` / `func new` instead of manual `cat >`?**
- Correct boilerplate for the programming model version
- All expected files present (`host.json`, `local.settings.json`, `.funcignore`, etc.)
- Validates that `fnx` works with apps created by the real tooling — not hand-crafted files

---

## Pre-flight Checks

Run these before every test session. They only **verify** — they don't create anything.

```bash
# 1. Tools available
node --version      # ≥ 18
func --version      # 4.x
python3 --version   # ≥ 3.9

# 2. Host zips built
ls cdn-server/hosts/*/Azure.Functions.Host.*.zip | wc -l   # 5

# 3. CDN server responding
curl -s http://localhost:4566/api/profiles | jq '.profiles | keys | length'   # 5

# 4. fnx CLI runnable
node fnx/bin/fnx 2>&1 | head -1   # "Usage: fnx start ..."

# 5. Node test app ready
ls test-node-app/host.json test-node-app/node_modules/@azure/functions/package.json   # both exist

# 6. Python test app ready
ls test-python-app/function_app.py test-python-app/requirements.txt test-python-app/.venv/bin/activate   # all exist
```

If any check fails, go back to the corresponding Test Harness Setup step.

---

## Test Tools (`test-tools/`)

Reusable shell scripts that eliminate repetitive bash patterns across tests. The Engineer Agent creates these alongside the other code. The Tester Agent invokes them directly instead of writing ad-hoc curl/sleep/kill loops.

### Why

Without these, every test repeats the same fragile patterns:
- `sleep 15` hoping the host is ready (it might not be)
- Manual PID tracking and cleanup (easy to leak processes)
- Copy-pasted curl + status code checks
- Platform RID detection (osx-arm64 vs linux-x64)

### `test-tools/start-cdn.sh`

Starts the CDN server, waits for it to be healthy, prints the PID.

```bash
#!/usr/bin/env bash
# Usage: ./test-tools/start-cdn.sh
# Output: CDN_PID=<pid> on stdout (for eval)
# Exit 1 if CDN doesn't become healthy within 10s
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${CDN_PORT:-4566}"

node "$SCRIPT_DIR/cdn-server/server.js" &
CDN_PID=$!

# Poll for health
for i in $(seq 1 20); do
  if curl -sf "http://localhost:${PORT}/" > /dev/null 2>&1; then
    echo "CDN_PID=$CDN_PID"
    echo "✓ CDN server ready on port $PORT (PID $CDN_PID)" >&2
    exit 0
  fi
  sleep 0.5
done

echo "✗ CDN server failed to start within 10s" >&2
kill $CDN_PID 2>/dev/null
exit 1
```

### `test-tools/start-emu.sh`

Starts fnx with a SKU, waits for the host to be ready (polls the HTTP endpoint), prints the PID.

```bash
#!/usr/bin/env bash
# Usage: ./test-tools/start-emu.sh --sku flex --port 7071 --app-path ./test-node-app
# Output: EMU_PID=<pid> on stdout (for eval)
# Exit 1 if host doesn't respond within 60s
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Parse args (pass-through to fnx)
SKU="" PORT="" SCRIPTROOT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sku) SKU="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --app-path) SCRIPTROOT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

PORT="${PORT:-7071}"
SCRIPTROOT="${SCRIPTROOT:-./test-node-app}"

echo "Starting fnx --sku $SKU --port $PORT --app-path $SCRIPTROOT" >&2

node "$SCRIPT_DIR/fnx/bin/fnx" start \
  --sku "$SKU" --port "$PORT" --app-path "$SCRIPTROOT" &
EMU_PID=$!

# Poll for host readiness (check HTTP endpoint, not just process alive)
echo "Waiting for host on port $PORT..." >&2
for i in $(seq 1 120); do
  if curl -sf "http://localhost:${PORT}/admin/host/status" > /dev/null 2>&1; then
    echo "EMU_PID=$EMU_PID"
    echo "✓ Host ready on port $PORT (PID $EMU_PID, SKU=$SKU)" >&2
    exit 0
  fi
  # Also check if process is still alive
  if ! kill -0 $EMU_PID 2>/dev/null; then
    echo "✗ fnx process died before host became ready" >&2
    exit 1
  fi
  sleep 0.5
done

echo "✗ Host not ready after 60s on port $PORT" >&2
kill $EMU_PID 2>/dev/null
exit 1
```

### `test-tools/check-endpoint.sh`

Checks an HTTP endpoint returns expected status. Retries on connection refused.

```bash
#!/usr/bin/env bash
# Usage: ./test-tools/check-endpoint.sh <url> [expected_status] [max_retries]
# Example: ./test-tools/check-endpoint.sh http://localhost:7071/api/hello 200
# Exit 0 on match, exit 1 on mismatch/timeout
set -euo pipefail

URL="$1"
EXPECTED="${2:-200}"
MAX_RETRIES="${3:-5}"

for i in $(seq 1 "$MAX_RETRIES"); do
  STATUS=$(curl -s -o /tmp/check-endpoint-body -w "%{http_code}" "$URL" 2>/dev/null) || STATUS="000"
  BODY=$(cat /tmp/check-endpoint-body 2>/dev/null || echo "")

  if [[ "$STATUS" == "$EXPECTED" ]]; then
    echo "✓ $URL → HTTP $STATUS"
    [[ -n "$BODY" ]] && echo "  Body: $(echo "$BODY" | head -c 200)"
    rm -f /tmp/check-endpoint-body
    exit 0
  fi

  if [[ "$STATUS" != "000" ]]; then
    # Got a real HTTP status, just not what we expected
    echo "✗ $URL → HTTP $STATUS (expected $EXPECTED)"
    [[ -n "$BODY" ]] && echo "  Body: $(echo "$BODY" | head -c 200)"
    rm -f /tmp/check-endpoint-body
    exit 1
  fi

  # Connection refused — retry
  sleep 1
done

echo "✗ $URL → connection refused after $MAX_RETRIES retries"
rm -f /tmp/check-endpoint-body
exit 1
```

### `test-tools/preflight.sh`

Runs all pre-flight checks. Exits 0 if all pass, 1 on first failure.

```bash
#!/usr/bin/env bash
# Usage: ./test-tools/preflight.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"
PASS=0 FAIL=0

check() {
  local label="$1"; shift
  if "$@" > /dev/null 2>&1; then
    echo "  ✓ $label"
    ((PASS++))
  else
    echo "  ✗ $label"
    ((FAIL++))
  fi
}

echo "═══ Pre-flight Checks ═══"
check "Node.js ≥ 18"              node -e "process.exit(parseInt(process.version.slice(1)) >= 18 ? 0 : 1)"
check "func CLI available"        func --version
check "python3 available"         python3 --version
check "Host zips built (≥2)"      bash -c '[[ $(ls cdn-server/hosts/*/Azure.Functions.Host.*.zip 2>/dev/null | wc -l) -ge 2 ]]'
check "CDN server responding"     curl -sf http://localhost:4566/api/profiles
check "fnx CLI runnable"     node fnx/bin/fnx
check "test-node-app ready"       test -f test-node-app/host.json
check "test-python-app ready"     test -f test-python-app/function_app.py

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] && echo "✓ All pre-flight checks passed" || echo "✗ Fix failures before running tests"
exit $FAIL
```

### `test-tools/cleanup.sh`

Kills all fnx and CDN server processes started during testing.

```bash
#!/usr/bin/env bash
# Usage: ./test-tools/cleanup.sh [PID1 PID2 ...]
# If PIDs given, kills those. Otherwise kills tracked PIDs from PIDS_FILE.
set -uo pipefail

PIDS_FILE="/tmp/fnx-test-pids"

if [[ $# -gt 0 ]]; then
  for pid in "$@"; do
    kill "$pid" 2>/dev/null && echo "✓ Killed PID $pid" || echo "  PID $pid already gone"
    wait "$pid" 2>/dev/null
  done
else
  if [[ -f "$PIDS_FILE" ]]; then
    while read -r pid; do
      kill "$pid" 2>/dev/null && echo "✓ Killed PID $pid" || echo "  PID $pid already gone"
      wait "$pid" 2>/dev/null
    done < "$PIDS_FILE"
    rm -f "$PIDS_FILE"
  fi
fi

# Safety net: find any orphaned host processes
ORPHANS=$(pgrep -f "Microsoft.Azure.WebJobs.Script.WebHost" 2>/dev/null || true)
if [[ -n "$ORPHANS" ]]; then
  echo "Found orphaned host processes: $ORPHANS"
  echo "$ORPHANS" | while read -r pid; do
    kill "$pid" 2>/dev/null && echo "✓ Killed orphaned host PID $pid"
  done
fi
```

### Usage in Tests

With these tools, tests become concise and deterministic:

```bash
# Before (fragile):
node fnx/bin/fnx start --sku flex --app-path ./test-node-app --port 7071 &
PID=$!
sleep 15  # hope it's ready...
curl -s http://localhost:7071/api/hello
kill $PID 2>/dev/null

# After (deterministic):
eval $(./test-tools/start-emu.sh --sku flex --port 7071 --app-path ./test-node-app)
./test-tools/check-endpoint.sh http://localhost:7071/api/hello 200
./test-tools/cleanup.sh $EMU_PID
```

### File List

```
test-tools/
├── start-cdn.sh           ← start CDN, poll for health, print PID
├── start-emu.sh           ← start fnx, poll for host ready, print PID
├── check-endpoint.sh      ← HTTP status check with retries
├── preflight.sh           ← run all pre-flight checks
└── cleanup.sh             ← kill tracked PIDs + find orphaned hosts
```

All scripts are `chmod +x`, zero dependencies, and print `✓`/`✗` status to stderr so they work in pipelines.

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
# Expected: "fnx CDN Server"
```

**Pass criteria**: All 5 checks pass.

---

## Test 2: Profile Resolution

**What**: Verify fnx resolves SKU profiles correctly from the CDN server.

```bash
# 2a. List profiles (fetches from CDN server)
node fnx/bin/fnx start --sku list
# Expected: Table showing 5 SKUs with versions and status
# Verify: flex shows 4.1047.100, linux-consumption shows 4.1044.400

# 2b. Invalid SKU name
node fnx/bin/fnx start --sku nonexistent --app-path ./test-node-app 2>&1
# Expected: Error message listing valid SKU names

# 2c. Missing --sku flag
node fnx/bin/fnx start 2>&1
# Expected: Usage message requiring --sku
```

**Pass criteria**: Correct output for valid list, clear errors for invalid input.

---

## Test 3: Host Download and Caching

**What**: Verify fnx downloads hosts from CDN server and caches them locally.

```bash
# Clean cache first
rm -rf ~/.fnx/hosts/

# 3a. First run triggers download
node fnx/bin/fnx start --sku flex --app-path ./test-node-app --port 7071 &
PID=$!
sleep 10  # give time for download + extraction + host startup

# Check cache was created
ls ~/.fnx/hosts/4.1047.100/Microsoft.Azure.WebJobs.Script.WebHost
# Expected: file exists, executable

kill $PID 2>/dev/null

# 3b. Second run uses cache (no download)
node fnx/bin/fnx start --sku flex --app-path ./test-node-app --port 7071 &
PID=$!
sleep 5
# Expected output includes: "Host cached, skipping download."

kill $PID 2>/dev/null

# 3c. Different SKU triggers new download
node fnx/bin/fnx start --sku windows-consumption --app-path ./test-node-app --port 7072 &
PID=$!
sleep 10

ls ~/.fnx/hosts/4.1045.200/Microsoft.Azure.WebJobs.Script.WebHost
# Expected: file exists (different version from flex)

kill $PID 2>/dev/null
```

**Pass criteria**: Downloads happen on first use, cache is reused on second use, different SKUs download different versions.

---

## Test 4: Host Startup — Flex (Latest)

**What**: Verify the self-contained host starts and serves a Node.js function under the Flex profile.

```bash
# Start with Flex SKU
node fnx/bin/fnx start --sku flex --app-path ./test-node-app --port 7071
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
node fnx/bin/fnx start --sku windows-consumption --app-path ./test-node-app --port 7072
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
node fnx/bin/fnx start --sku flex --app-path ./test-node-app --port 7071

# Terminal 2:
node fnx/bin/fnx start --sku linux-consumption --app-path ./test-node-app --port 7072
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
| flex | 7071 | 4.1047.100 | `node bin/fnx start --sku flex --app-path ../test-node-app --port 7071` |
| linux-premium | 7072 | 4.1046.100 | `node bin/fnx start --sku linux-premium --app-path ../test-node-app --port 7072` |
| windows-consumption | 7073 | 4.1045.200 | `node bin/fnx start --sku windows-consumption --app-path ../test-node-app --port 7073` |
| windows-dedicated | 7074 | 4.1045.100 | `node bin/fnx start --sku windows-dedicated --app-path ../test-node-app --port 7074` |
| linux-consumption | 7075 | 4.1044.400 | `node bin/fnx start --sku linux-consumption --app-path ../test-node-app --port 7075` |

For each:
```bash
# Start the host, wait for "Functions:" output, then:
curl -s http://localhost:${PORT}/api/hello
# Expected: 200 response
```

**Pass criteria**: All 5 SKUs start and serve the hello function.

---

## Test 8: Offline / CDN-Down Fallback

**What**: Verify fnx works when the CDN server is unreachable.

```bash
# Stop the CDN server (Ctrl+C)

# 8a. With cached profiles (from previous runs)
node fnx/bin/fnx start --sku list
# Expected: Shows profiles from ~/.fnx/profiles/sku-profiles.json (stale cache)

# 8b. With cached host (from previous runs)
node fnx/bin/fnx start --sku flex --app-path ./test-node-app --port 7071
# Expected: Uses cached host, starts normally

# 8c. With no cache at all
rm -rf ~/.fnx/
node fnx/bin/fnx start --sku list
# Expected: Falls back to bundled profiles (from fnx/profiles/sku-profiles.json)

# 8d. With no cache and trying to download host
node fnx/bin/fnx start --sku flex --app-path ./test-node-app --port 7071
# Expected: Error — "no host package for platform" or download failure
# (bundled profiles have localhost URLs, CDN is down, and no cached host)
```

**Pass criteria**: Graceful degradation — cached data works, bundled fallback works for profiles, clear error when host can't be downloaded.

---

## Test 9: Error Handling

**What**: Verify error cases produce clear, actionable messages.

```bash
# 9a. No scriptroot / missing local.settings.json
node fnx/bin/fnx start --sku flex --app-path /tmp/nonexistent
# Expected: Error about missing FUNCTIONS_WORKER_RUNTIME

# 9b. Dotnet runtime rejected
mkdir -p /tmp/dotnet-app
echo '{"IsEncrypted":false,"Values":{"FUNCTIONS_WORKER_RUNTIME":"dotnet-isolated"}}' > /tmp/dotnet-app/local.settings.json
node fnx/bin/fnx start --sku flex --app-path /tmp/dotnet-app
# Expected: Error — "This POC only supports non-dotnet runtimes"

# 9c. Unknown command
node fnx/bin/fnx deploy
# Expected: Usage message

# 9d. Host executable not found (corrupt cache)
mkdir -p ~/.fnx/hosts/4.1047.100
rm -f ~/.fnx/hosts/4.1047.100/Microsoft.Azure.WebJobs.Script.WebHost
# (with CDN server running)
node fnx/bin/fnx start --sku flex --app-path ./test-node-app --port 7071
# Expected: Re-downloads and extracts host
```

**Pass criteria**: Clear error messages, no stack traces exposed to user.

---

## Test 10: Python Function App

**What**: Verify the POC works with Python — the second most popular Functions language. Uses the `func`-scaffolded `test-python-app/`.

**Prerequisite**: `test-python-app/` was scaffolded with `func init --worker-runtime python --model V2` and `func new --name hello --template "HTTP trigger" --authlevel anonymous`. Python venv created with `azure-functions` installed.

```bash
# Verify test app is ready
ls test-python-app/function_app.py test-python-app/requirements.txt test-python-app/local.settings.json
# All must exist

# Activate venv (the host's Python worker needs it)
source test-python-app/.venv/bin/activate

# Start with Flex SKU
node fnx/bin/fnx start --sku flex --app-path ./test-python-app --port 7076
```

**Verify** (in another terminal):
```bash
# 10a. Banner shows python runtime
# Expected output includes:
#   Worker Runtime:    python

# 10b. Function responds
curl -s http://localhost:7076/api/hello
# Expected: HTTP 200 with response body (exact text depends on func template)

# 10c. Compare with Node — same SKU, different runtime
# (test-node-app should already work from Test 4)
# This proves the host correctly spawns different language workers
```

**Pass criteria**: Python worker starts via gRPC, HTTP function returns 200.

---

## Test 11: Side-by-Side — Node vs Python on Same SKU

**What**: Prove the host correctly launches different language workers based on `FUNCTIONS_WORKER_RUNTIME`.

```bash
# Terminal 1: Node app on Flex
node fnx/bin/fnx start --sku flex --app-path ./test-node-app --port 7071

# Terminal 2: Python app on Flex (same SKU, same host version!)
node fnx/bin/fnx start --sku flex --app-path ./test-python-app --port 7076
```

**Verify**:
```bash
curl -s http://localhost:7071/api/hello  # Node response
curl -s http://localhost:7076/api/hello  # Python response
# Both should return 200 with different response bodies
```

**Pass criteria**: Same host version serves both Node and Python apps correctly.

---

## Test Summary Matrix

| # | Test | What It Validates | Priority |
|---|------|-------------------|----------|
| 1 | CDN Server Health | CDN server serves profiles and zips correctly | P0 |
| 2 | Profile Resolution | CLI resolves SKUs, handles errors | P0 |
| 3 | Host Download & Caching | Download → extract → cache → reuse flow | P0 |
| 4 | Host Startup (Flex, Node) | Latest host starts and serves Node.js function | P0 |
| 5 | Host Startup (Win Consumption, Node) | Older host starts with same app | P0 |
| 6 | Side-by-Side SKU Comparison | Two host versions simultaneously (the demo) | P0 |
| 7 | All 5 SKUs Smoke | Every SKU profile works | P1 |
| 8 | Offline Fallback | Graceful degradation without CDN | P1 |
| 9 | Error Handling | Clear errors for invalid inputs | P1 |
| 10 | Python App | Python language worker starts via gRPC | P0 |
| 11 | Node vs Python on Same SKU | Host launches correct language worker per runtime | P1 |

## Definition of Done

The POC is considered successful when:

1. ✅ **Tests 1-6 and 10 all pass** — core flow works end-to-end for both Node and Python
2. ✅ **Two different host versions** can serve the **same function app** simultaneously on different ports
3. ✅ **Version displayed in banner** matches the SKU profile (proving the correct host was selected)
4. ✅ **Download from CDN server** works (not just pre-placed cache)
5. ✅ **Caching** prevents redundant downloads on subsequent runs
6. ✅ **Both Node.js and Python** language workers start correctly via gRPC

## Known Limitations

| Limitation | Impact | Workaround |
|------------|--------|------------|
| `authLevel` must be `anonymous` | Non-anonymous HTTP triggers return 401 | Use anonymous for POC; production needs host-side env var support |
| No dotnet language support | Can't test C# functions | Scoped out of POC by design |
| No VS Code F5 integration | Must run from terminal | Layer on later with tasks.json |
| Extension bundle version not verified | Bundle override is set but not validated | Can verify via host logs showing bundle load |
| Self-contained host is ~200MB per version | 5 versions = ~1GB disk | Acceptable for POC; production would optimize |
