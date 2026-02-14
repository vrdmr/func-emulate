# Retest Checklist - After Building Host Binaries

This checklist is for re-running the test plan after resolving the .NET SDK dependency.

## Prerequisites

✅ **Before retesting, ensure:**

1. .NET SDK 8.0+ is installed:
   ```bash
   dotnet --version
   # Should show: 8.0.x or higher
   ```

2. Host binaries have been built:
   ```bash
   ./build-hosts.sh
   # Wait ~20 minutes for 5 host versions to compile
   ```

3. Verify host binaries exist:
   ```bash
   ls cdn-server/hosts/*/Azure.Functions.Host.*.zip | wc -l
   # Should show: 5 (or at least 2 for minimal testing)
   ```

4. All test tools are executable:
   ```bash
   chmod +x test-tools/*.sh
   ```

---

## Quick Retest

### Step 1: Start CDN Server
```bash
eval $(./test-tools/start-cdn.sh)
# Should print: ✓ CDN server ready on port 4566 (PID xxxx)
```

### Step 2: Run Tests 3-11 (Previously Failed)

#### Test 3: Host Download & Caching
```bash
# Clean cache first
rm -rf ~/.func-emu/hosts/

# First run (should download)
eval $(./test-tools/start-emu.sh --sku flex --port 7071 --scriptroot ./test-node-app)
ls ~/.func-emu/hosts/4.1047.100/Microsoft.Azure.WebJobs.Script.WebHost
# Should exist
./test-tools/cleanup.sh $EMU_PID

# Second run (should use cache)
eval $(./test-tools/start-emu.sh --sku flex --port 7071 --scriptroot ./test-node-app)
# Check output for "cached" or "skipping download"
./test-tools/cleanup.sh $EMU_PID
```
**Expected:** ✅ Host downloads, extracts, and caches correctly.

---

#### Test 4: Host Startup — Flex
```bash
eval $(./test-tools/start-emu.sh --sku flex --port 7071 --scriptroot ./test-node-app)

# Verify function responds
./test-tools/check-endpoint.sh http://localhost:7071/api/hello 200

# Verify admin endpoint
./test-tools/check-endpoint.sh http://localhost:7071/admin/host/status 200

./test-tools/cleanup.sh $EMU_PID
```
**Expected:** ✅ Host starts, function responds with HTTP 200.

---

#### Test 5: Host Startup — Windows Consumption
```bash
eval $(./test-tools/start-emu.sh --sku windows-consumption --port 7072 --scriptroot ./test-node-app)

./test-tools/check-endpoint.sh http://localhost:7072/api/hello 200

./test-tools/cleanup.sh $EMU_PID
```
**Expected:** ✅ Older host version (4.1045.200) starts successfully.

---

#### Test 6: Side-by-Side SKU Comparison ⭐ **THE MONEY SHOT**
```bash
# Start two SKUs simultaneously
eval $(./test-tools/start-emu.sh --sku flex --port 7071 --scriptroot ./test-node-app)
FLEX_PID=$EMU_PID

eval $(./test-tools/start-emu.sh --sku linux-consumption --port 7072 --scriptroot ./test-node-app)
LINUX_PID=$EMU_PID

# Both should respond
./test-tools/check-endpoint.sh http://localhost:7071/api/hello 200
./test-tools/check-endpoint.sh http://localhost:7072/api/hello 200

# Verify two different host processes
ps aux | grep "Microsoft.Azure.WebJobs.Script.WebHost" | grep -v grep
# Should show 2 processes

# Check different cached versions
ls ~/.func-emu/hosts/
# Should show: 4.1047.100 and 4.1044.400

./test-tools/cleanup.sh $FLEX_PID $LINUX_PID
```
**Expected:** ✅ Two different host versions running simultaneously on different ports. **This is the demo!**

---

#### Test 7: All 5 SKUs Smoke Test
```bash
for SKU_PORT in "flex:7071" "linux-premium:7072" "windows-consumption:7073" "windows-dedicated:7074" "linux-consumption:7075"; do
  SKU="${SKU_PORT%%:*}"
  PORT="${SKU_PORT##*:}"
  echo "Testing $SKU on port $PORT..."
  eval $(./test-tools/start-emu.sh --sku "$SKU" --port "$PORT" --scriptroot ./test-node-app)
  ./test-tools/check-endpoint.sh "http://localhost:${PORT}/api/hello" 200
  ./test-tools/cleanup.sh $EMU_PID
done
```
**Expected:** ✅ All 5 SKUs start and serve functions.

---

#### Test 8: Offline Fallback
```bash
# Stop CDN server
./test-tools/cleanup.sh $CDN_PID

# With cached host
eval $(./test-tools/start-emu.sh --sku flex --port 7071 --scriptroot ./test-node-app)
./test-tools/check-endpoint.sh http://localhost:7071/api/hello 200
./test-tools/cleanup.sh $EMU_PID

# Restart CDN for remaining tests
eval $(./test-tools/start-cdn.sh)
```
**Expected:** ✅ Works offline with cached host.

---

#### Test 9: Error Handling
```bash
# Missing scriptroot
node func-emu/bin/func-emu start --sku flex --scriptroot /tmp/nonexistent 2>&1 | grep -i "FUNCTIONS_WORKER_RUNTIME"
# Should show error about missing runtime

# Dotnet rejected
mkdir -p /tmp/dotnet-test
echo '{"IsEncrypted":false,"Values":{"FUNCTIONS_WORKER_RUNTIME":"dotnet-isolated"}}' > /tmp/dotnet-test/local.settings.json
node func-emu/bin/func-emu start --sku flex --scriptroot /tmp/dotnet-test 2>&1 | grep -i "non-dotnet"
rm -rf /tmp/dotnet-test
# Should show error about dotnet not supported
```
**Expected:** ✅ Clear error messages for invalid inputs.

---

#### Test 10: Python Function App
```bash
source test-python-app/.venv/bin/activate

eval $(./test-tools/start-emu.sh --sku flex --port 7076 --scriptroot ./test-python-app)

./test-tools/check-endpoint.sh http://localhost:7076/api/hello 200

./test-tools/cleanup.sh $EMU_PID
deactivate
```
**Expected:** ✅ Python worker starts, function responds.

---

#### Test 11: Node vs Python on Same SKU
```bash
# Node app on Flex
eval $(./test-tools/start-emu.sh --sku flex --port 7071 --scriptroot ./test-node-app)
NODE_PID=$EMU_PID

# Python app on Flex (same SKU!)
source test-python-app/.venv/bin/activate
eval $(./test-tools/start-emu.sh --sku flex --port 7076 --scriptroot ./test-python-app)
PY_PID=$EMU_PID

# Both should respond
./test-tools/check-endpoint.sh http://localhost:7071/api/hello 200
./test-tools/check-endpoint.sh http://localhost:7076/api/hello 200

./test-tools/cleanup.sh $NODE_PID $PY_PID
deactivate
```
**Expected:** ✅ Same host version serves both Node and Python apps.

---

### Step 3: Cleanup
```bash
# Stop CDN server
./test-tools/cleanup.sh

# Verify no orphaned processes
ps aux | grep "Microsoft.Azure.WebJobs.Script.WebHost\|cdn-server/server.js" | grep -v grep
# Should return nothing
```

---

## Success Criteria

The POC is **SUCCESSFUL** when all of the following pass:

- ✅ **Tests 1-2** pass (already verified)
- ✅ **Test 3** passes (host downloads and caches)
- ✅ **Test 4-5** pass (both SKUs start and serve functions)
- ✅ **Test 6** passes ⭐ **THE CRITICAL DEMO** — two host versions side-by-side
- ✅ **Test 10** passes (Python works)
- ✅ **Test 7, 8, 9, 11** pass (comprehensive coverage)

**Most Important:** Test 6 (Side-by-Side SKU Comparison) must work to prove the POC value proposition.

---

## Quick Pass/Fail Check

After running all tests, verify:

```bash
# All 5 host versions cached
ls ~/.func-emu/hosts/
# Should show: 4.1044.400, 4.1045.100, 4.1045.200, 4.1046.100, 4.1047.100

# All 5 host zips available from CDN
for VERSION in 4.1044.400 4.1045.100 4.1045.200 4.1046.100 4.1047.100; do
  curl -sI "http://localhost:4566/hosts/${VERSION}/Azure.Functions.Host.osx-arm64.zip" | head -1
done
# All should return: HTTP/1.1 200 OK
```

---

## Expected Outcome

If all tests pass:

**Status:** ✅ **POC VALIDATED**

Update `TEST_REPORT.md`:
- Overall: 11 PASS (out of 11 tests)
- P0: 7/7 PASS
- P1: 4/4 PASS

Take screenshots/video of Test 6 for the demo!

---

## If Tests Still Fail

1. Check host binaries:
   ```bash
   ls -lh cdn-server/hosts/*/Azure.Functions.Host.*.zip
   ```

2. Check CDN server logs:
   ```bash
   # CDN server should print request logs to terminal
   ```

3. Check func-emu logs:
   ```bash
   # Each test prints startup banner and any errors
   ```

4. Check host process is actually running:
   ```bash
   ps aux | grep Microsoft.Azure.WebJobs.Script.WebHost
   ```

5. Manually test a simple function:
   ```bash
   node func-emu/bin/func-emu start --sku flex --scriptroot ./test-node-app --port 7071
   # In another terminal:
   curl http://localhost:7071/api/hello
   ```

---

## Contact

If tests fail after building host binaries, the issue is likely in:
- `func-emu/lib/host-manager.js` (download/extraction logic)
- `func-emu/lib/cli.js` (host startup logic)
- Test app configuration (check `local.settings.json`)

Review the error messages carefully — they should indicate which component failed.
