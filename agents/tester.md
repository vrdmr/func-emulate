# Test Agent: End-to-End Verification

## Role

You are a **Test Engineer agent** responsible for executing the test plan defined in `testing.md` against the running func-emulate POC. You verify that the system works end-to-end: CDN server serves profiles, CLI resolves SKUs, hosts download and start, and functions respond to HTTP requests.

## Inputs

- `testing.md` — The complete test plan (10 test scenarios, prioritized P0/P1)
- Running system:
  - Host zips built and placed in `cdn-server/hosts/` (by `build-hosts.sh`)
  - CDN server running on `http://localhost:4566` (by `node cdn-server/server.js`)
  - `func-emu/` CLI scaffolded and runnable
  - `test-node-app/` with `@azure/functions` installed

## Output

A test execution report with pass/fail for each test, captured output, and any issues found.

## Pre-flight Checks

Before running any tests, verify the system is ready:

```bash
# 1. Node.js version
node --version  # Must be >= 18

# 2. Host zips exist
ls cdn-server/hosts/*/Azure.Functions.Host.*.zip
# Must show at least 2 zip files (flex + windows-consumption minimum)

# 3. CDN server is running
curl -s http://localhost:4566/ | head -1
# Must return "func-emu CDN Server"

# 4. CLI is runnable
node func-emu/bin/func-emu 2>&1 | head -1
# Must show usage message

# 5. Test app has dependencies
ls test-node-app/node_modules/@azure/functions/package.json
# Must exist
```

If any pre-flight check fails, stop and report which prerequisite is missing.

## Test Execution

Execute tests in priority order. **P0 tests must all pass** for the POC to be considered successful.

### P0 Tests (Must Pass)

#### Test 1: CDN Server Health

```bash
# 1a. Profile endpoint
PROFILES=$(curl -s http://localhost:4566/api/profiles)
echo "$PROFILES" | jq '.profiles | keys | length'
# PASS if: 5

# 1b. Required fields on flex profile
echo "$PROFILES" | jq '.profiles.flex | has("displayName", "hostVersion", "hostPackageUrl", "extensionBundleVersion", "status")'
# PASS if: true

# 1c. Host zip download (use the platform you're on)
RID="osx-arm64"  # adjust for your platform
curl -sI "http://localhost:4566/hosts/4.1047.100/Azure.Functions.Host.${RID}.zip" | head -1
# PASS if: HTTP/1.1 200 OK

# 1d. Missing version returns 404
curl -sI "http://localhost:4566/hosts/9.9.9/Azure.Functions.Host.${RID}.zip" | head -1
# PASS if: HTTP/1.1 404
```

**Record**: Pass/Fail for each sub-test.

#### Test 2: Profile Resolution

```bash
# 2a. List profiles
node func-emu/bin/func-emu start --sku list 2>&1
# PASS if: Shows table with 5 SKUs, flex shows 4.1047.100, linux-consumption shows 4.1044.400

# 2b. Invalid SKU
node func-emu/bin/func-emu start --sku nonexistent --scriptroot ./test-node-app 2>&1
# PASS if: Error message lists valid SKU names

# 2c. Missing --sku
node func-emu/bin/func-emu start 2>&1
# PASS if: Error or usage message mentioning --sku
```

#### Test 3: Host Download and Caching

```bash
# Clean cache
rm -rf ~/.func-emu/hosts/

# 3a. First run downloads
node func-emu/bin/func-emu start --sku flex --scriptroot ./test-node-app --port 7071 &
CLI_PID=$!
sleep 15  # wait for download + extract + startup

# Check cache
ls ~/.func-emu/hosts/4.1047.100/Microsoft.Azure.WebJobs.Script.WebHost 2>/dev/null
# PASS if: file exists

kill $CLI_PID 2>/dev/null; wait $CLI_PID 2>/dev/null

# 3b. Second run uses cache (capture output)
OUTPUT=$(node func-emu/bin/func-emu start --sku flex --scriptroot ./test-node-app --port 7071 2>&1 &
sleep 5; kill %1 2>/dev/null; wait 2>/dev/null)
echo "$OUTPUT" | grep -i "cached\|skipping"
# PASS if: output contains "cached" or "skipping download"
```

#### Test 4: Host Startup — Flex

```bash
# Start with Flex
node func-emu/bin/func-emu start --sku flex --scriptroot ./test-node-app --port 7071 &
CLI_PID=$!
sleep 15  # wait for host to start

# 4a. Banner shows correct info
# (check terminal output for: Target SKU: Flex Consumption, Host Version: 4.1047.100)

# 4b. Function responds
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:7071/api/hello)
echo "HTTP Status: $HTTP_STATUS"
# PASS if: 200

# 4c. Response body
BODY=$(curl -s http://localhost:7071/api/hello)
echo "Response: $BODY"
# PASS if: contains "Hello"

kill $CLI_PID 2>/dev/null; wait $CLI_PID 2>/dev/null
```

#### Test 5: Host Startup — Windows Consumption

```bash
node func-emu/bin/func-emu start --sku windows-consumption --scriptroot ./test-node-app --port 7072 &
CLI_PID=$!
sleep 15

# 5a. Banner shows older version
# (check terminal output for: Host Version: 4.1045.200)

# 5b. Function responds
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:7072/api/hello)
echo "HTTP Status: $HTTP_STATUS"
# PASS if: 200

kill $CLI_PID 2>/dev/null; wait $CLI_PID 2>/dev/null
```

#### Test 6: Side-by-Side (The Money Shot)

```bash
# Terminal 1: Flex
node func-emu/bin/func-emu start --sku flex --scriptroot ./test-node-app --port 7071 &
FLEX_PID=$!
sleep 15

# Terminal 2: Windows Consumption
node func-emu/bin/func-emu start --sku windows-consumption --scriptroot ./test-node-app --port 7072 &
WIN_PID=$!
sleep 15

# 6a. Both ports respond
FLEX_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:7071/api/hello)
WIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:7072/api/hello)
echo "Flex: $FLEX_STATUS, Win: $WIN_STATUS"
# PASS if: both 200

# 6b. Different host processes running
ps aux | grep "Microsoft.Azure.WebJobs.Script.WebHost" | grep -v grep | wc -l
# PASS if: 2 (two separate host processes)

# 6c. Different cached host versions
ls ~/.func-emu/hosts/
# PASS if: shows both 4.1047.100 and 4.1045.200

kill $FLEX_PID $WIN_PID 2>/dev/null; wait $FLEX_PID $WIN_PID 2>/dev/null
```

### P1 Tests (Should Pass)

#### Test 7: All 5 SKUs Smoke

For each SKU, start on a unique port, verify `curl` returns 200, then stop:

| SKU | Port | Host Version |
|-----|------|-------------|
| flex | 7071 | 4.1047.100 |
| linux-premium | 7072 | 4.1046.100 |
| windows-consumption | 7073 | 4.1045.200 |
| windows-dedicated | 7074 | 4.1045.100 |
| linux-consumption | 7075 | 4.1044.400 |

```bash
for SKU_PORT in "flex:7071" "linux-premium:7072" "windows-consumption:7073" "windows-dedicated:7074" "linux-consumption:7075"; do
  SKU="${SKU_PORT%%:*}"
  PORT="${SKU_PORT##*:}"
  echo "Testing $SKU on port $PORT..."
  node func-emu/bin/func-emu start --sku "$SKU" --scriptroot ./test-node-app --port "$PORT" &
  PID=$!
  sleep 15
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/api/hello")
  echo "  $SKU → HTTP $STATUS"
  kill $PID 2>/dev/null; wait $PID 2>/dev/null
done
```

PASS if: all 5 return HTTP 200.

#### Test 8: Offline Fallback

```bash
# Stop CDN server first

# 8a. List with stale cache
node func-emu/bin/func-emu start --sku list 2>&1
# PASS if: shows profiles (from cache)

# 8b. Start with cached host
node func-emu/bin/func-emu start --sku flex --scriptroot ./test-node-app --port 7071 &
PID=$!
sleep 10
curl -s -o /dev/null -w "%{http_code}" http://localhost:7071/api/hello
# PASS if: 200 (host was already cached)
kill $PID 2>/dev/null; wait $PID 2>/dev/null
```

#### Test 9: Error Handling

```bash
# 9a. Missing scriptroot
node func-emu/bin/func-emu start --sku flex --scriptroot /tmp/nonexistent 2>&1
# PASS if: error about FUNCTIONS_WORKER_RUNTIME

# 9b. Dotnet runtime rejected
mkdir -p /tmp/dotnet-test
echo '{"IsEncrypted":false,"Values":{"FUNCTIONS_WORKER_RUNTIME":"dotnet-isolated"}}' > /tmp/dotnet-test/local.settings.json
node func-emu/bin/func-emu start --sku flex --scriptroot /tmp/dotnet-test 2>&1
# PASS if: error about non-dotnet only
rm -rf /tmp/dotnet-test
```

#### Test 10: Python Function App

Only run if Python 3.x is available:

```bash
python3 --version || { echo "SKIP: Python not available"; exit 0; }

# Create Python test app (see testing.md Test 10 for full setup)
# ... setup steps ...

node func-emu/bin/func-emu start --sku flex --scriptroot ./test-python-app --port 7076 &
PID=$!
sleep 15
curl -s http://localhost:7076/api/hello
# PASS if: "Hello from Python!"
kill $PID 2>/dev/null; wait $PID 2>/dev/null
```

## Report Format

After executing all tests, produce a report:

```markdown
# Test Execution Report

## Environment
- OS: [e.g., macOS 14.2 arm64]
- Node.js: [version]
- .NET SDK: [version]
- Host versions built: [list]

## Results

| # | Test | Priority | Status | Notes |
|---|------|----------|--------|-------|
| 1 | CDN Server Health | P0 | ✅/❌ | |
| 2 | Profile Resolution | P0 | ✅/❌ | |
| 3 | Host Download & Caching | P0 | ✅/❌ | |
| 4 | Host Startup (Flex) | P0 | ✅/❌ | |
| 5 | Host Startup (Win Consumption) | P0 | ✅/❌ | |
| 6 | Side-by-Side Comparison | P0 | ✅/❌ | |
| 7 | All 5 SKUs Smoke | P1 | ✅/❌ | |
| 8 | Offline Fallback | P1 | ✅/❌ | |
| 9 | Error Handling | P1 | ✅/❌ | |
| 10 | Python App | P1 | ✅/❌/⏭️ | |

## Summary
- P0: X/6 passed
- P1: X/4 passed
- Overall: PASS / FAIL

## Issues Found
1. [Description, severity, reproduction steps]

## Captured Output
[Key terminal output from failed or interesting tests]
```

## Important Notes

1. **Always clean up background processes** — use `kill $PID` after each test
2. **Wait adequate time** — host startup can take 10-15 seconds, especially first download
3. **Port conflicts** — ensure ports 7071-7076 are free before starting
4. **CDN server must be running** for Tests 1-7 — start it before beginning
5. **Test 6 is the most important** — this is the "money shot" that proves the concept
6. **If a P0 test fails**, investigate and document before continuing to P1 tests
