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

Execute these tasks in order:

### Task 1: Create `build-hosts.sh`

- Source: `implementation.md` Section 4
- Create `build-hosts.sh` at repo root
- Make it executable (`chmod +x`)
- Contains the complete bash script from the spec: clones azure-functions-host, builds 5 tags, zips output
- **Do NOT run it** — just create the file

### Task 2: Create `cdn-server/`

- Source: `implementation.md` Section 5 (server code) + Section 3 (profiles JSON)
- Create directory structure: `cdn-server/server.js`, `cdn-server/package.json`, `cdn-server/profiles/sku-profiles.json`
- Create empty `cdn-server/hosts/` directory (with `.gitkeep`)
- `server.js`: Zero-dep Node.js HTTP server from Section 5
- `package.json`: From Section 5
- `sku-profiles.json`: The full 5-SKU profiles from Section 3

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

### Task 4: Create test function apps

Use the **existing `func` CLI** (Azure Functions Core Tools v4) to scaffold real function apps.

**Node.js app:**
```bash
func init test-node-app --worker-runtime node --language javascript --model V4
cd test-node-app
func new --name hello --template "HTTP trigger" --authlevel anonymous
npm install
cd ..
```

**Python app:**
```bash
func init test-python-app --worker-runtime python --model V2
cd test-python-app
func new --name hello --template "HTTP trigger" --authlevel anonymous
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

- Both functions MUST use `authLevel: anonymous` (required — no auth bypass in POC)
- The `func` CLI must be installed and available (`func --version` shows 4.x)
- Using `func` instead of manual `cat >` ensures correct V2/V4 programming model structure

### Task 5: Validate scaffolding

After creating all files, run these checks:

```bash
# 1. CLI parses without errors
node func-emu/bin/func-emu 2>&1 | head -1
# Expected: "Usage: func-emu start ..."

# 2. CDN server starts
timeout 3 node cdn-server/server.js 2>&1 || true
# Expected: "func-emu CDN Server" banner

# 3. Profile list works (with CDN server running)
# Start CDN in background, then:
node func-emu/bin/func-emu start --sku list
# Expected: table of 5 SKUs

# 4. All expected files exist
ls -la build-hosts.sh
ls func-emu/bin/func-emu func-emu/lib/*.js func-emu/profiles/sku-profiles.json
ls cdn-server/server.js cdn-server/profiles/sku-profiles.json
ls test-node-app/host.json test-node-app/local.settings.json
ls test-python-app/function_app.py test-python-app/requirements.txt test-python-app/host.json
```

## Implementation Guidelines

1. **Copy code exactly from `implementation.md`** — do not refactor, rename, or "improve" the code. The spec is the spec.
2. **Use ESM modules** — all JS files use `import`/`export`, package.json has `"type": "module"`.
3. **Zero npm dependencies** for `func-emu/` and `cdn-server/` — Node.js 18+ built-ins only.
4. **`test-node-app/`** is the one directory that has a dependency: `@azure/functions`.
5. **Make executables executable** — `chmod +x build-hosts.sh func-emu/bin/func-emu`.
6. **Profile resolver defaults to `http://localhost:4566/api/profiles`** — this is the CDN server URL.
7. **Do not modify existing files** — `prd.md`, `implementation.md`, `testing.md`, `agents.md`, `agents/` are off-limits.

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
