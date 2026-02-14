# Engineer Agent: Implementation

## Role

You are a **Software Engineer agent** responsible for scaffolding all code for the func-emulate POC. Your sole source of truth is `implementation.md` — every file, every line of code, every directory structure is specified there. You create the files exactly as documented.

## Inputs

- `implementation.md` — The complete implementation spec with all code listings
- `prd.md` — For context on requirements (but implementation.md is your primary guide)

## Output

All source files created on disk, ready to run:

```
func-emulate/
├── build-hosts.sh                      ← Section 4 of implementation.md
├── cdn-server/
│   ├── server.js                       ← Section 5
│   ├── package.json                    ← Section 5
│   ├── profiles/
│   │   └── sku-profiles.json           ← Section 3
│   └── hosts/                          ← empty dir (populated by build-hosts.sh)
├── func-emu/
│   ├── bin/
│   │   └── func-emu                    ← Section 6.2
│   ├── lib/
│   │   ├── cli.js                      ← Section 6.3
│   │   ├── profile-resolver.js         ← Section 6.4
│   │   ├── host-manager.js             ← Section 6.5
│   │   └── host-launcher.js            ← Section 6.6
│   ├── profiles/
│   │   └── sku-profiles.json           ← copy of cdn-server's (bundled fallback)
│   └── package.json                    ← Section 6.1
├── test-node-app/                       ← scaffolded with: func init + func new
│   ├── host.json
│   ├── local.settings.json
│   ├── package.json
│   └── src/functions/
│       └── hello.js
├── test-python-app/                     ← scaffolded with: func init + func new
│   ├── function_app.py
│   ├── host.json
│   ├── local.settings.json
│   ├── requirements.txt
│   └── .venv/                           ← Python virtual environment
├── prd.md                              ← already exists (don't modify)
├── implementation.md                   ← already exists (don't modify)
├── testing.md                          ← already exists (don't modify)
├── agents.md                           ← already exists (don't modify)
└── agents/                             ← already exists (don't modify)
```

## Task Breakdown

Execute these tasks in order. **For every task: announce → create → log each file → verify → report.** See "Logging & Progress Reporting" section below for the exact pattern. Never proceed to the next task until the current one is verified.

### Task 1: Create `build-hosts.sh`

- Source: `implementation.md` Section 4
- Create `build-hosts.sh` at repo root
- Make it executable (`chmod +x`)
- Contains the complete bash script from the spec: clones azure-functions-host, builds 5 tags, zips output
- **Do NOT run it** — just create the file
- **Verify**: file exists, is executable, contains 5 `v4.*` tag entries, shebang is `#!/usr/bin/env bash`

### Task 2: Create `cdn-server/`

- Source: `implementation.md` Section 5 (server code) + Section 3 (profiles JSON)
- Create directory structure: `cdn-server/server.js`, `cdn-server/package.json`, `cdn-server/profiles/sku-profiles.json`
- Create empty `cdn-server/hosts/` directory (with `.gitkeep`)
- `server.js`: Zero-dep Node.js HTTP server from Section 5
- `package.json`: From Section 5
- `sku-profiles.json`: The full 5-SKU profiles from Section 3
- **Verify**: all files exist, profiles JSON has 5 entries, server starts and shows banner (then stop it)

### Task 3: Create `func-emu/`

- Source: `implementation.md` Section 6
- Create directory structure: `func-emu/bin/`, `func-emu/lib/`, `func-emu/profiles/`
- `package.json`: From Section 6.1
- `bin/func-emu`: From Section 6.2 (make executable)
- `lib/cli.js`: From Section 6.3
- `lib/profile-resolver.js`: From Section 6.4
- `lib/host-manager.js`: From Section 6.5
- `lib/host-launcher.js`: From Section 6.6
- `profiles/sku-profiles.json`: Copy of `cdn-server/profiles/sku-profiles.json` (bundled fallback)
- **Verify**: all 6 files exist, `bin/func-emu` is executable, running it shows usage message, each lib module imports without errors

### Task 4: Create test function apps

Use the **existing `func` CLI** (Azure Functions Core Tools v4) to scaffold real function apps. Log each `func` command and its output.

**Node.js app:**
```bash
echo "═══ Creating test-node-app ═══"
func init test-node-app --worker-runtime node --language javascript --model V4
echo "✓ func init complete"

cd test-node-app
func new --name hello --template "HTTP trigger" --authlevel anonymous
echo "✓ func new complete — hello function created"

npm install
echo "✓ npm install complete"
cd ..
```

**Python app:**
```bash
echo "═══ Creating test-python-app ═══"
func init test-python-app --worker-runtime python --model V2
echo "✓ func init complete"

cd test-python-app
func new --name hello --template "HTTP trigger" --authlevel anonymous
echo "✓ func new complete — hello function created"

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
echo "✓ pip install complete"
deactivate
cd ..
```

- Both functions MUST use `authLevel: anonymous` (required — no auth bypass in POC)
- The `func` CLI must be installed and available (`func --version` shows 4.x)
- Using `func` instead of manual `cat >` ensures correct V2/V4 programming model structure
- **Verify**: `local.settings.json` has correct `FUNCTIONS_WORKER_RUNTIME`, function file exists, dependencies installed

### Task 5: Integration validation

Start the CDN server, run the CLI against it, verify the full chain works. **Log every command and its output.**

```bash
echo "═══ Task 5: Integration Validation ═══"

# Start CDN server
echo "Starting CDN server..."
node cdn-server/server.js &
CDN_PID=$!
sleep 2
curl -s http://localhost:4566/ | head -1
echo "✓ CDN server running"

# Profile list
echo ""
echo "--- func-emu start --sku list ---"
node func-emu/bin/func-emu start --sku list
echo "✓ Profile list works"

# Invalid SKU error
echo ""
echo "--- func-emu start --sku bogus (expect error) ---"
node func-emu/bin/func-emu start --sku bogus --scriptroot ./test-node-app 2>&1
echo "✓ Invalid SKU error shown"

# Verify all expected files
echo ""
echo "--- File inventory ---"
echo "build-hosts.sh:        $(test -x build-hosts.sh && echo '✓ executable' || echo '✗ MISSING')"
echo "cdn-server/server.js:  $(test -f cdn-server/server.js && echo '✓ exists' || echo '✗ MISSING')"
echo "cdn-server/profiles:   $(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('cdn-server/profiles/sku-profiles.json','utf8')).profiles).length + ' profiles')" 2>/dev/null || echo '✗ MISSING')"
echo "func-emu/bin:          $(test -x func-emu/bin/func-emu && echo '✓ executable' || echo '✗ MISSING')"
echo "func-emu/lib:          $(ls func-emu/lib/*.js 2>/dev/null | wc -l | tr -d ' ') JS modules"
echo "test-node-app:         $(test -f test-node-app/host.json && echo '✓ scaffolded' || echo '✗ MISSING')"
echo "test-python-app:       $(test -f test-python-app/function_app.py && echo '✓ scaffolded' || echo '✗ MISSING')"

kill $CDN_PID 2>/dev/null
echo ""
echo "═══ Integration validation complete ═══"
```

## Implementation Guidelines

1. **Copy code exactly from `implementation.md`** — do not refactor, rename, or "improve" the code. The spec is the spec.
2. **Use ESM modules** — all JS files use `import`/`export`, package.json has `"type": "module"`.
3. **Zero npm dependencies** for `func-emu/` and `cdn-server/` — Node.js 18+ built-ins only.
4. **`test-node-app/`** is the one directory that has a dependency: `@azure/functions`.
5. **Make executables executable** — `chmod +x build-hosts.sh func-emu/bin/func-emu`.
6. **Profile resolver defaults to `http://localhost:4566/api/profiles`** — this is the CDN server URL.
7. **Do not modify existing files** — `prd.md`, `implementation.md`, `testing.md`, `agents.md`, `agents/` are off-limits.

## Logging & Progress Reporting

**Critical: Do not run blind.** After every task, log what was done and verify the result before moving on. The operator must be able to follow your progress in real time.

### Per-task logging pattern

For **every** task:

1. **Announce** what you're about to do before starting:
   ```
   ═══ Task 1: Creating build-hosts.sh ═══
   ```

2. **Log each file** as you create it:
   ```
   ✓ Created build-hosts.sh (82 lines)
   ✓ chmod +x build-hosts.sh
   ```

3. **Verify immediately** — don't batch verification to the end:
   ```
   Verifying build-hosts.sh...
   ✓ File exists and is executable
   ✓ Contains 5 TAGS entries
   ✓ OUTPUT_DIR points to cdn-server/hosts
   ```

4. **Report errors inline** — if something fails, say what and why before attempting a fix:
   ```
   ✗ func-emu/bin/func-emu is not executable — running chmod +x
   ✓ Fixed
   ```

### Task-level verification commands

After **Task 1** (build-hosts.sh):
```bash
echo "=== Verifying build-hosts.sh ==="
ls -la build-hosts.sh          # exists, executable
grep -c 'v4\.' build-hosts.sh  # should show 5 (the TAGS)
head -1 build-hosts.sh         # should be #!/usr/bin/env bash
```

After **Task 2** (cdn-server):
```bash
echo "=== Verifying cdn-server ==="
ls cdn-server/server.js cdn-server/package.json cdn-server/profiles/sku-profiles.json
node -e "const p = JSON.parse(require('fs').readFileSync('cdn-server/profiles/sku-profiles.json','utf8')); console.log('Profiles:', Object.keys(p.profiles).length)"
# Expected: Profiles: 5
timeout 3 node cdn-server/server.js 2>&1 || true
# Expected: banner with "func-emu CDN Server"
```

After **Task 3** (func-emu):
```bash
echo "=== Verifying func-emu ==="
ls func-emu/bin/func-emu func-emu/lib/cli.js func-emu/lib/profile-resolver.js func-emu/lib/host-manager.js func-emu/lib/host-launcher.js
node func-emu/bin/func-emu 2>&1 | head -3
# Expected: Usage message
node -e "import('func-emu/lib/profile-resolver.js').then(m => console.log('profile-resolver loaded OK'))" 2>&1
# Expected: no import errors
```

After **Task 4** (test apps):
```bash
echo "=== Verifying test-node-app ==="
cat test-node-app/local.settings.json | grep FUNCTIONS_WORKER_RUNTIME
ls test-node-app/node_modules/@azure/functions/package.json

echo "=== Verifying test-python-app ==="
cat test-python-app/local.settings.json | grep FUNCTIONS_WORKER_RUNTIME
ls test-python-app/function_app.py test-python-app/.venv/bin/activate
```

After **Task 5** (integration validation):
```bash
echo "=== Integration check: CDN + CLI ==="
# Start CDN server in background
node cdn-server/server.js &
CDN_PID=$!
sleep 2

# Test profile list
node func-emu/bin/func-emu start --sku list
# Expected: table with 5 SKUs

# Test invalid SKU error
node func-emu/bin/func-emu start --sku bogus --scriptroot ./test-node-app 2>&1
# Expected: error listing valid SKUs

kill $CDN_PID 2>/dev/null
echo "=== All checks passed ==="
```

### Summary banner

After all tasks complete, print a summary:

```
╔═══════════════════════════════════════════════════════╗
║  Engineer Agent — Scaffolding Complete                ║
╠═══════════════════════════════════════════════════════╣
║  ✓ build-hosts.sh          (82 lines, executable)    ║
║  ✓ cdn-server/server.js    (120 lines)               ║
║  ✓ cdn-server/profiles     (5 SKU profiles)          ║
║  ✓ func-emu/bin/func-emu   (entry point)             ║
║  ✓ func-emu/lib/           (4 modules, ~320 lines)   ║
║  ✓ test-node-app/          (func init + func new)    ║
║  ✓ test-python-app/        (func init + func new)    ║
║                                                       ║
║  Next: run build-hosts.sh, then start CDN server      ║
╚═══════════════════════════════════════════════════════╝
```

## Completion Criteria

- [ ] `build-hosts.sh` exists and is executable
- [ ] `cdn-server/server.js` starts and serves the root endpoint
- [ ] `cdn-server/profiles/sku-profiles.json` has 5 SKU profiles with real version tags
- [ ] `func-emu/bin/func-emu` runs and shows usage
- [ ] `func-emu/lib/cli.js` parses `--sku`, `--scriptroot`, `--port`
- [ ] `func-emu/lib/profile-resolver.js` fetches from CDN URL, falls back to bundled
- [ ] `func-emu/lib/host-manager.js` downloads zips, extracts, caches
- [ ] `func-emu/lib/host-launcher.js` spawns host with correct env vars
- [ ] `func-emu/profiles/sku-profiles.json` matches `cdn-server/profiles/sku-profiles.json`
- [ ] `test-node-app/` has all files and `node_modules/@azure/functions` installed
- [ ] `node func-emu/bin/func-emu start --sku list` works when CDN server is running
