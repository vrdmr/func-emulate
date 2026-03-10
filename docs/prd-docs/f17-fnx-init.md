# F17: fnx init — Project Scaffolding

**Status:** ✅ Implemented  
**PRD Section:** Developer experience, onboarding  
**Depends on:** F16 (app-config.yaml)

## Problem

New Azure Functions users must manually create `host.json`, `app-config.yaml`, `local.settings.json`, and language-specific entry points. There's no guided scaffolding experience in fnx.

## Scope

### In Scope

- `fnx init` command that scaffolds a **new** function app project in an **empty directory**
- Interactive runtime selection (node, python, dotnet-isolated, java, powershell)
- Generates: `host.json`, `app-config.yaml`, `local.settings.json`, `.gitignore`, language entry point
- Template-based scaffolding using remote manifest from Azure CDN
- Optional `--template <name>` and `--runtime <name>` flags for non-interactive use
- Prioritized trigger selection (top triggers shown first: HTTP, Blob, Timer, Queue, etc.)
- Clear error messages when directory is non-empty or network is unavailable
- `--version` flag for runtime version selection (e.g., `--version 3.12` for Python)
- Template placeholder replacement (`{{nodeVersion}}`, `{{javaVersion}}`)
- Security: Path traversal protection, trusted org validation, HTTPS-only URLs

### Out of Scope (Future Work)

| Scenario | Why Out of Scope | Future Feature |
| ---------- | ------------------ | ---------------- |
| **Brownfield projects** | Requires conflict detection, merge strategies | `fnx init --merge` or `fnx migrate` |
| **Adding functions to existing app** | Different UX: detect existing app-config, append | `fnx new` command |
| **Non-empty directory merge** | Conflict resolution is complex | `fnx init --force` or `--merge` |
| **Updating existing templates** | Requires tracking template used, diffing | `fnx update` command |
| **Custom/local templates** | Manifest is CDN-only for now | `--template-path` flag |
| **Multi-function scaffolding** | Single function per init keeps UX simple | `fnx new` with batch mode |
| **Interactive version prompt** | Non-interactive `--version` flag done first | P5 in Priority List |
| **Runtime/version validation** | Requires checking local install, Azure support | `fnx doctor` integration |

### Assumptions

The current implementation makes the following assumptions:

1. **Runtime is installed** — The selected runtime (Python, Node.js, .NET, Java, PowerShell) is already installed on the user's machine
2. **Version compatibility** — The default version in `app-config.yaml` matches what's installed locally and is supported by Azure Functions
3. **Network available** — Template download requires GitHub access (manifest can work offline with cache)

These assumptions will be validated in future work (see Priority List below).

### Priority List (Future Enhancements)

| Priority | Feature | Description |
|----------|---------|-------------|
| ~~P1~~ | ~~**Version selection**~~ | ✅ Done: `--version` flag for non-interactive version selection |
| ~~P1.1~~ | ~~**Arrow key navigation**~~ | ✅ Done: Up/down arrows, vim keys (j/k), number keys for selection |
| ~~P1.2~~ | ~~**Template search**~~ | ✅ Done: Type 3+ chars to filter templates in selection prompt |
| ~~P1.3~~ | ~~**Template pagination**~~ | ✅ Done: Top 9 templates shown, "More..." option for full list |
| ~~P1.4~~ | ~~**Dev environment setup**~~ | ✅ Done: `--env` flag for venv/npm install/dotnet restore |
| P2 | **Runtime detection** | Detect installed runtimes and versions before prompting |
| P3 | **Version validation** | Check if local version is supported by Azure Functions |
| P4 | **Prerequisites validation** | Check required tools are installed (Python, Node, Maven, .NET SDK, etc.) |
| P5 | **Interactive version prompt** | Add version selection to interactive flow |
| P6 | **fnx doctor integration** | Validate runtime/version/prerequisites as part of project health check |

**Prerequisites data available in `fnx/lib/runtimes.js`:**

```javascript
LANGUAGE_INFO.python.prerequisites = [
  'Python 3.11 or later installed',
  'Azure Functions Core Tools v4.x',
  'Azure CLI (optional, for deployment)',
];

LANGUAGE_INFO.java.prerequisites = [
  'JDK 21 installed (8, 11, 17, 21 supported)',
  'Apache Maven 3.5+',
  'Azure Functions Core Tools v4.x',
  'Azure CLI (optional, for deployment)',
];
```

**Current behavior for out-of-scope scenarios:**

```text
# Non-empty directory
$ fnx init
✗ Cannot initialize: directory is not empty

  'fnx init' creates a new project and requires an empty directory.
  
  Options:
  • Create a new directory: mkdir my-func && cd my-func && fnx init
  • To add a function to an existing project, use 'fnx new' (coming soon)

# Existing host.json detected  
$ fnx init
✗ Cannot initialize: existing function app detected

  Found host.json in current directory. This appears to be an existing
  Azure Functions project.
  
  To add a new function to this project, use 'fnx new' (coming soon)
```

## Design

### Template Source

Templates are fetched from a remote manifest hosted on Azure CDN:

```text
https://cdn-test.functions.azure.com/public/templates/manifest.json
```

**Manifest structure:**

- 107+ templates across 9 languages
- Each template has: `id`, `displayName`, `language`, `bindingType`, `resource`, `tags`, `folderPath`, `repositoryUrl`

**Caching & Fallback:**

- Manifest cached in `~/.fnx/cache/manifest.json`
- TTL: 24 hours (fetch with ETag for conditional refresh)
- `--offline` flag uses cached manifest only

**Fallback chain when fetching manifest:**

1. **Cache valid (< 24h):** Use cached manifest
2. **Cache stale:** Fetch from CDN with ETag (304 Not Modified → refresh TTL)
3. **CDN unavailable + cache exists:** Use stale cache
4. **CDN unavailable + no cache:** Use bundled manifest (`fnx/templates/manifest.json`)
5. **All fail:** Error with message

**Network requirements:**

| Phase | Network Required | Fallback |
| ------- | ------------------ | ---------- |
| Manifest fetch | No (if cached/bundled) | Bundled manifest |
| Template download | **Yes** | None — requires GitHub access |

The manifest can work offline, but **template files must be downloaded from GitHub**. If the user is offline during template download, show a clear error:

```text
✗ Cannot download template: network unavailable

  Template files are hosted on GitHub and require internet access.
  
  Workaround: Run 'fnx init' once while online to download templates,
  then copy the project structure for future offline use.
```

### Runtime Name Mapping

Map user-friendly runtime names to manifest language values:

| CLI Runtime       | Manifest Language            | Notes                                   |
| ----------------- | ---------------------------- | --------------------------------------- |
| `node`            | `JavaScript` or `TypeScript` | User picks JS or TS in follow-up prompt |
| `python`          | `Python`                     |                                         |
| `dotnet-isolated` | `CSharp`                     |                                         |
| `java`            | `Java`                       |                                         |
| `powershell`      | `PowerShell`                 | Fewer templates available               |

### CLI Signature

```bash
# Interactive mode (default)
fnx init

# Non-interactive mode
fnx init --runtime python --template http-trigger-python --name my-func-app
fnx init -r python -t http-trigger-python -n my-func-app

# Search mode (Proposal B)
fnx init "blob python"

# List options
fnx init --list-runtimes
fnx init --list-templates --runtime python
```

### Flags

| Flag               | Short | Description                                              | Default        |
| ------------------ | ----- | -------------------------------------------------------- | -------------- |
| `--runtime`        | `-r`  | Runtime: node, python, dotnet-isolated, java, powershell | (prompt)       |
| `--version`        |       | Runtime version (e.g., 3.11 for Python, 20 for Node.js) | (default per runtime) |
| `--template`       | `-t`  | Template ID from manifest                                | (prompt)       |
| `--name`           | `-n`  | Project directory name                                   | (prompt or cwd)|
| `--sku`            |       | Target SKU: flex, premium, dedicated                     | flex           |
| `--env`            | `-e`  | Setup dev environment (venv for Python, npm install for Node) | false |
| `--yes`            | `-y`  | Skip confirmation prompt                                 | false          |
| `--force`          | `-f`  | Initialize in non-empty directory (see below)           | false          |
| `--verbose`        | `-v`  | Show detailed output (manifest URL, cache status, files) | false          |
| `--offline`        |       | Use cached manifest only                                 | false          |
| `--list-runtimes`  |       | Print available runtimes                                 |                |
| `--list-templates` |       | Print templates (use with --runtime)                     |                |

#### `--force` Behavior

The `--force` flag allows initialization in a non-empty directory. It does **not** delete existing files.

| File Type | Behavior with `--force` |
|-----------|------------------------|
| Template files (from GitHub) | **Overwrites** if same name exists |
| `app-config.yaml` | **Skipped** if exists (preserves user config) |
| Existing project files | **Preserved** (not touched) |

**Use cases:**

- Reinitializing a project with a different template
- Adding template files to an existing codebase
- Recovering from a failed init

**Not supported:** Full overwrite mode that deletes all existing files. Use `rm -rf . && fnx init` if needed.

#### Verbose Output

When `--verbose` is enabled, additional diagnostic information is displayed:

```text
🚀 Initialize a new Azure Functions project

  Manifest URL: https://cdn-test.functions.azure.com/public/templates/manifest.json
  Cache hit: manifest cached 11 minutes ago
  Templates loaded: 107

Select a runtime:
  ...

  Target directory: /path/to/project
  Template: http-trigger-python
  Repository: https://github.com/Azure/azure-functions-templates-mcp-server
  Folder: templates/python/HttpTrigger
  Generated: host.json, local.settings.json, app-config.yaml, .gitignore, requirements.txt

✓ Project created successfully!
```

This is useful for debugging manifest fetching, cache behavior, and template resolution.

### Interactive Flow

#### Step 1: Directory Check

```text
╭─────────────────────────────────────────────────────────────╮
│  fnx init — Create a new Azure Functions project            │
╰─────────────────────────────────────────────────────────────╯

Checking directory...

✗ Directory is not empty.

  Options:
    fnx init --name my-app    Create in ./my-app/ subdirectory
    fnx init --force          Overwrite existing files (use with caution)

  Or run from an empty directory.
```

Simple rule: Empty directory → proceed. Non-empty → error with options.

#### Step 2: Runtime Selection

```text
? Select a runtime:

  › Python                    — Python 3.10+
    Node.js                   — JavaScript or TypeScript
    .NET (C# isolated)        — C# with .NET 8+
    Java                      — Java 11+
    PowerShell                — PowerShell 7+

  ↑/↓ to move, Enter to select, Ctrl+C to cancel
```

#### Step 2b: Node.js Language Selection (if Node.js selected)

```text
? Select Node.js language:

  › TypeScript                — Recommended, type-safe
    JavaScript                — Plain JavaScript

  ↑/↓ to move, Enter to select
```

TypeScript is the default/first option.

#### Step 3: Trigger Selection

Show **top triggers first** (filtered to selected language):

```text
? What type of function do you want to create?

  Popular Triggers:
  ─────────────────
  › HTTP Trigger              — REST APIs, webhooks
    Blob Trigger              — File processing
    Timer Trigger             — Scheduled jobs
    Queue Trigger             — Message processing
    Service Bus Trigger       — Enterprise messaging
    Event Hub Trigger         — Event streaming
    Durable Functions         — Orchestration workflows
    Event Grid Trigger        — Event-driven

  Other Options:
  ─────────────────
    Cosmos DB Trigger         — Database changes
    MCP Server                — AI Model Context Protocol
    Input/Output Bindings     — Blob, Cosmos DB
    All templates             — Browse everything

  ↑/↓ to move, Enter to select
```

**Top trigger priority order:**

1. HTTP — Most common starting point
2. Blob — File processing
3. Timer — Scheduled jobs
4. Queue — Storage queue messaging
5. Service Bus — Enterprise messaging
6. Event Hub — Event streaming
7. Durable — Orchestration
8. Event Grid — Event-driven

Templates vary by language. PowerShell has fewer templates — only show what's available in the manifest.

#### Step 4: Project Name

```text
? Project name: my-func-app
  Will create: ./my-func-app/
```

#### Step 5: SKU Selection

```text
? Target Azure SKU to emulate:

  › Flex Consumption    ★ Recommended — Pay-per-execution, auto-scale
    Premium             — VNet, no cold start, more memory
    Dedicated           — App Service plan, predictable pricing

  This sets local.targetSku in app-config.yaml
```

#### Step 6: Scaffold

```text
Creating project...
  ✓ Downloaded template from CDN
  ✓ Created ./my-func-app/function_app.py
  ✓ Created ./my-func-app/requirements.txt
  ✓ Created ./my-func-app/host.json
  ✓ Created ./my-func-app/local.settings.json
  ✓ Created ./my-func-app/app-config.yaml
  ✓ Created ./my-func-app/.gitignore

╭─────────────────────────────────────────────────────────────╮
│  ✓ Project created successfully!                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Next steps:                                                 │
│                                                              │
│    cd my-func-app                                            │
│    pip install -r requirements.txt                           │
│    fnx start                                                 │
│                                                              │
│  Documentation:                                              │
│    https://aka.ms/azfunc-python                              │
│                                                              │
╰─────────────────────────────────────────────────────────────╯
```

### Future: Search Mode

> **Not in scope for v1.** This is a potential future enhancement.

For experienced users who know what they want:

```bash
$ fnx init "blob python"

Found 4 matching templates:

  1. Blob Trigger with Event Grid (Python)      ★ Best match
  2. Blob Trigger (Python)
  3. Blob Input Binding (Python)
  4. Blob Output Binding (Python)

? Select template (1-4): 1
? Project name: blob-processor

Creating project...
  ✓ Created ./blob-processor/ with Blob Trigger with Event Grid template
```

**Search algorithm:** Local keyword matching against template `displayName`, `tags`, `language`, `resource`.

**Future enhancement:** Azure AI Search for semantic search (natural language queries like "function that runs every hour" → Timer Trigger). Requires infrastructure: APIM/App Gateway → AI Search with managed identity backend auth. Public endpoint, no user auth required.

### Generated Files

```text
my-func-app/
├── app-config.yaml          ← F16 config (runtime, sku)
├── host.json                ← Functions host config
├── local.settings.json      ← Secrets (git-ignored)
├── .gitignore
├── requirements.txt         ← (python only)
├── package.json             ← (node only)
├── *.csproj                 ← (dotnet only)
├── pom.xml                  ← (java only)
└── [function entry point]   ← function_app.py, index.ts, etc.
```

**app-config.yaml generation:**

Generated using shared `createAppConfig()` from `config.js`, which:

1. Reads `local.settings.json` from template (if exists)
2. Extracts non-secret configurations using `buildConfigFromLocalSettings()`
3. Applies CLI overrides (`--runtime`, `--version`, `--sku`)
4. Writes F16-compliant YAML using `generateYaml()`

```yaml
# Azure Functions App Configuration
# Commit this to source control. Do NOT put secrets here.
# Secrets and connection strings go in local.settings.json (git-ignored).
#
# Reference: https://learn.microsoft.com/en-us/azure/azure-functions/functions-app-settings

# Local emulator (fnx) settings
local:
  targetSku: flex

# Runtime configuration
runtime:
  name: python
  version: "3.11"

# App settings (non-secret behavioral config)
configurations:
  AzureWebJobsFeatureFlags: EnableWorkerIndexing
```

### Template Download Strategy

Templates are downloaded from GitHub based on the `folderPath` and `repositoryUrl` fields in the manifest. The download strategy adapts based on git availability:

| folderPath | git available | Method | Description |
| ------------ | --------------- | -------- | ------------- |
| `.` | Yes | `git clone --depth 1` | Shallow clone entire repo |
| `.` | No | Zip download | Download `archive/refs/heads/main.zip`, extract |
| `<path>` | Yes | Sparse checkout | `git clone --filter=blob:none --sparse` + checkout specific folder |
| `<path>` | No | GitHub API | Fetch file listing via API, download each file |

**Sparse checkout flow (most common):**

```bash
# 1. Clone repo metadata only (no blobs downloaded)
git clone --filter=blob:none --no-checkout --depth 1 --sparse <repo> <tempDir>

# 2. Configure sparse-checkout for the specific folder
git sparse-checkout set <folderPath>

# 3. Checkout only the specified folder's files
git checkout
```

This is efficient — only downloads the files needed for the selected template, regardless of repository size.

**Fallback chain:**

1. **Git available:** Use git clone (full) or sparse-checkout (subfolder)
2. **Git unavailable, folderPath=".":** Download and extract zip archive
3. **Git unavailable, folderPath="path":** Use GitHub API to list and download files

**Files generated by fnx (not from template):**

- `app-config.yaml` — Always generated by fnx with project name, runtime, and SKU

### Implementation

Module structure:

```text
fnx/lib/
├── init.js                 ← Main init command, CLI flag parsing
├── config.js               ← Shared: createAppConfig(), generateYaml(), buildConfigFromLocalSettings()
├── runtimes.js             ← Shared: SUPPORTED_RUNTIMES, LANGUAGE_INFO, getDefaultVersion()
├── init/
│   ├── manifest.js         ← Fetch, cache, parse manifest (24h TTL), filterTrustedTemplates()
│   ├── prompts.js          ← Interactive prompts (runtime, template, name, SKU)
│   └── scaffold.js         ← Template download, placeholder replacement
```

**Key functions:**

| Module | Function | Purpose |
|--------|----------|---------|
| `scaffold.js` | `downloadTemplate()` | Main entry, routes to appropriate download method |
| `scaffold.js` | `cloneRepo()` | `git clone --depth 1` for whole-repo templates |
| `scaffold.js` | `sparseCheckout()` | `git clone --filter=blob:none --sparse` for subfolder templates |
| `scaffold.js` | `downloadZip()` | Fallback for whole-repo when git unavailable |
| `scaffold.js` | `downloadViaApi()` | Fallback for subfolder when git unavailable |
| `scaffold.js` | `generateConfigFiles()` | Calls `createAppConfig()`, replaces template placeholders |
| `scaffold.js` | `replaceTemplatePlaceholders()` | Replaces `{{nodeVersion}}`, `{{javaVersion}}` in templates |
| `config.js` | `createAppConfig()` | Creates `app-config.yaml` from local.settings.json + overrides |
| `config.js` | `buildConfigFromLocalSettings()` | Extracts config from local.settings.json, applies overrides |
| `config.js` | `generateYaml()` | Generates F16-compliant YAML with comments |
| `manifest.js` | `filterTrustedTemplates()` | Removes templates from non-Azure orgs (security) |
| `runtimes.js` | `getDefaultVersion()` | Returns default runtime version (e.g., Python 3.11) |

**Security measures:**

- `safePath()` — Validates paths stay within target directory (path traversal prevention)
- `filterTrustedTemplates()` — Only allows templates from `azure` or `azure-samples` GitHub orgs
- PowerShell escaping with `-LiteralPath` and single-quote escaping
- HTTPS-only URL validation for template downloads
- `randomUUID()` for unique temp directory names (race condition prevention)

**Zero dependencies:** Uses Node.js built-ins only (`node:readline`, `node:fs`, `node:child_process`, `node:crypto`).

### Error Handling

Clear, actionable error messages at each stage:

| Stage | Error | Message |
| ------- | ------- | --------- |
| Directory check | Non-empty directory | `Error: Directory is not empty.` + suggestion to use `--force` or `--name` |
| Directory check | Existing project | `Error: Directory already contains a Functions project (host.json exists).` |
| Manifest fetch | CDN unavailable, no cache, no bundle | `✗ Cannot load template manifest` + troubleshooting steps |
| Template selection | Template not found | `Error: Template '<name>' not found for runtime '<runtime>'.` |
| Template download | Network failure | `✗ Cannot download template: <error>` + troubleshooting steps |
| Config generation | Disk write failure | `✗ Cannot generate configuration files` + troubleshooting steps |

**Example error output:**

```text
✗ Cannot download template: git clone failed

  Template files are hosted on GitHub and require internet access.
  
  Troubleshooting:
    • Check your internet connection
    • Try again with --verbose for more details
    • If behind a proxy, configure git and npm proxy settings
```

All errors exit with code 1 and provide actionable next steps.

## Success Criteria

- [x] `fnx init` creates a runnable function app in an empty directory
- [x] Generated `app-config.yaml` follows F16 schema (uses shared `createAppConfig()` from config.js)
- [x] Generated project runs successfully with `fnx start`
- [x] All 5 supported runtimes have working scaffolds (templates permitting)
- [x] Interactive flow shows prioritized triggers (HTTP, Blob, Timer first)
- [x] Non-interactive mode works with `--runtime`, `--template`, and `--version` flags
- [x] Manifest caching works offline after initial download
- [x] Security: Path traversal protection, org validation, HTTPS-only URLs
- [x] Template placeholders replaced (`{{nodeVersion}}`, `{{javaVersion}}`)

## Test Coverage

- **Unit tests:** 46 tests in `tests/unit/init.test.js`
  - Manifest functions (fetch, cache, filter)
  - Scaffold functions (download, config generation)
  - Security (org validation, URL validation, path traversal)
  - Placeholder replacement (Node.js, Java)
  - Version override with `--version` flag
