# F6: MCP Server Integration

**Status:** ✅ Implemented  
**PRD Section:** N/A (new capability)  
**Depends on:** F1 (profiles), F2 (host manager), F5 (trigger support)

## Problem

AI assistants (GitHub Copilot, VS Code Copilot, Claude, etc.) need structured access to Azure Functions metadata — running host state, function definitions, invocation history, template catalogs, and project scaffolding. Today this information is scattered across host logs, file system, and external docs. There's no machine-readable API for AI tools to consume.

Separately, the [Azure Functions Templates MCP Server](https://github.com/manvkaur/azure-functions-templates-mcp-server) already provides 68 templates across 4 languages via MCP — but it runs as a standalone process with no awareness of the running host or the developer's target SKU.

## Feature

When `fnx start` launches, it also starts an embedded MCP server (stdio or SSE transport) that exposes:

1. **Live host data** — running functions, trigger types, invocation logs, health status
2. **Template catalog** — merged from the templates MCP server (68 templates, 4 languages)
3. **SKU context** — current profile, host version, extension bundle version
4. **Project metadata** — config files, bindings, connection strings (redacted)

This unifies "what's running" (fnx runtime) with "what can I create" (templates) into a single MCP surface.

## Two Modes

### Mode 1: `fnx templates-mcp` (standalone, stdio)

Runs as a pure MCP server over stdio — no host process, no port needed. This is the direct replacement for the standalone templates MCP server:

```json
// .vscode/mcp.json — replaces manvir-templates-mcp-server
{
  "servers": {
    "azure-functions-create-triggers-bindings": {
      "type": "stdio",
      "command": "fnx",
      "args": ["templates-mcp"]
    }
  }
}
```

Tools available in this mode:
```
  get_languages_list       → supported languages with runtime versions
  get_project_template     → project scaffolding files for a language
  get_templates_list       → available function templates for a language
  get_template             → complete source code for a template
  get_sku_profile          → SKU profiles (from CDN/cache/bundled)
```

No running host required. Works offline with bundled templates.

### Mode 2: `fnx start` (embedded, HTTP/SSE)

When `fnx start` launches the host, it also exposes an MCP endpoint over HTTP/SSE on the same port (or `--mcp-port`). This adds live host context on top of the template tools:

```
fnx start --sku flex --scriptroot ./my-app --port 7071
  │
  ├── Host process on port 7071 (existing)
  │     └── /api/hello, blob_trigger, etc.
  │
  └── MCP endpoint on port 7071/mcp (or --mcp-port 7072)
        └── SSE transport for web-based MCP clients
```

## Tool Design Philosophy

The MCP tools are organized around **what an AI assistant or developer tool needs to know** at each stage of the development lifecycle:

1. **Discover** — What can I build? What languages/templates are available?
2. **Understand** — What's running? What functions exist? What are their bindings?
3. **Observe** — What happened? Did my invocation succeed? What did the logs say?
4. **Act** — Invoke a function, scaffold new code, modify bindings
5. **Validate** — Is my app compatible with the target SKU? Are there errors?

---

## Tool Catalog

### Category 1: Templates & Scaffolding (available in both modes)

These tools help AI assistants create new functions correctly without hallucinating boilerplate.

| Tool | Description | Why |
|------|-------------|-----|
| `get_languages_list` | List supported languages with runtime versions, programming models, template counts | AI needs to know what's possible before suggesting code |
| `get_project_template` | Get project initialization files (host.json, package.json, pom.xml, etc.) for a language | Scaffolding a new project requires correct config files — AI shouldn't guess these |
| `get_templates_list` | List available function templates for a language with descriptions and categories | AI needs a menu of triggers/bindings to offer the user |
| `get_template` | Get complete source code + required app settings + packages for a specific template | Eliminates hallucinated function code — gives AI the real boilerplate |
| `get_sku_profile` | Get current or all SKU profiles with host/bundle versions | AI can check SKU compatibility before suggesting features |

### Category 2: Live Host & Functions (only when `fnx start` is running)

These tools give AI real-time visibility into the running host — essential for debugging, observability, and context-aware assistance.

| Tool | Description | Why |
|------|-------------|-----|
| `get_host_status` | Host version, state (Running/Error/Starting), uptime, PID, SKU name, extension bundle version, worker runtime | First thing to check: "is the host healthy?" — enables AI to triage before diving deeper |
| `get_functions` | List all functions with name, trigger type, binding details, route (if HTTP), enabled/disabled state | Core context: AI needs to know what functions exist and how they're triggered |
| `get_function_detail` | Full metadata for one function: all input/output bindings, connection names, paths/queues/schedules, auth level | Deep dive for debugging: "show me everything about this blob trigger" |
| `get_bindings_summary` | Aggregate view: which connections are used, which storage accounts, which services are wired up | High-level architecture view: "what services does this app depend on?" |
| `get_app_settings` | Merged config (app.config.json + local.settings.json) with secrets redacted | AI needs to see config to diagnose "connection string not set" errors, but secrets must be safe |

### Category 3: Observability & Logs (only when `fnx start` is running)

These tools expose what's happening at runtime — invocations, errors, and performance. This is where the MCP server becomes an observability surface.

| Tool | Description | Why |
|------|-------------|-----|
| `get_invocations` | Recent invocation log: function name, trigger reason, status (Succeeded/Failed), duration, timestamp. Filterable by function name, status, time range | "Why did my function fail?" — AI can see the invocation history without asking the user to copy-paste logs |
| `get_invocation_detail` | Full detail for one invocation: input/output data, exception message + stack trace (if failed), execution timeline | Deep dive: AI can read the actual error and suggest a fix |
| `get_logs` | Structured host logs: level (info/warn/error), category, message. Filterable by level, category, time range, keyword | Raw observability: "show me all warnings in the last 5 minutes" |
| `get_errors` | Active host errors and warnings: startup failures, binding errors, worker crashes, extension load failures | Quick health check: "is anything broken?" without digging through verbose logs |
| `get_metrics` | Basic runtime metrics: invocation count (by function), success/failure rate, avg duration, active workers | Performance overview: "which function is slowest?" or "are there failures I should worry about?" |

### Category 4: Actions (only when `fnx start` is running)

These tools let AI take action — invoke functions, scaffold code, restart the host.

| Tool | Description | Why |
|------|-------------|-----|
| `invoke_function` | Trigger a function: HTTP functions via their route, non-HTTP via admin API (`POST /admin/functions/{name}`) with input payload | Testing: "call my blob trigger with this test payload" — AI can verify its fix worked |
| `create_function` | Scaffold a new function from template into the project's source directory | "Add a timer trigger" → AI fetches template and writes files, no hallucination |
| `restart_host` | Restart the host process (kill + relaunch with same config) | "My function is stuck" → AI can restart without user going to terminal |

### Category 5: SKU & Compatibility (available in both modes)

These tools help AI reason about deployment targets and compatibility.

| Tool | Description | Why |
|------|-------------|-----|
| `get_sku_profile` | Current SKU profile: host version, bundle version, status, cadence | Context for all SKU-aware decisions |
| `compare_skus` | Compare two SKUs: host version diff, bundle version diff, feature availability | "Will my app work on Windows Consumption?" — AI can diff the versions |
| `check_compatibility` | Analyze current function app against a target SKU: flag potential issues (missing APIs, bundle mismatches, deprecated features) | Pre-deployment validation: catch "works locally, breaks in cloud" before it happens |

---

## MCP Resources (live subscriptions)

Resources provide auto-updating context that AI can subscribe to:

```
  host://status            → live host state (pushes updates on state change)
  host://functions         → function list (pushes updates when functions change)
  host://errors            → active errors (pushes new errors as they occur)
  project://config         → merged app.config.json + local.settings.json
  project://host.json      → host.json contents
```

## Use Cases

### 1. AI-assisted debugging
```
User: "Why is my blob trigger not firing?"
Copilot → get_host_status() → host is Running, no errors
Copilot → get_functions() → sees blob_trigger with blobTrigger type
Copilot → get_function_detail("blob_trigger") → connection=AzureWebJobsStorage, path=test-container/{name}
Copilot → get_invocations(function="blob_trigger") → no invocations in last 10 minutes
Copilot → get_errors() → "Listener stopped for blob_trigger"
Copilot: "The blob listener stopped. This usually means the storage connection failed. Let me check your config..."
Copilot → get_app_settings() → AzureWebJobsStorage=UseDevelopmentStorage=true
Copilot: "Your connection points to Azurite. Is Azurite running on port 10000?"
```

### 2. AI-assisted scaffolding
```
User: "Add a timer trigger that runs every 5 minutes"
Copilot → get_templates_list("python") → finds TimerTrigger template
Copilot → get_template("python", "TimerTrigger") → gets complete source code with schedule="0 */5 * * * *"
Copilot → get_sku_profile() → target is flex, host 4.1047.100
Copilot: Writes function code with correct schedule expression, compatible with target SKU
```

### 3. AI-assisted deployment readiness
```
User: "Is my app ready to deploy to Windows Consumption?"
Copilot → check_compatibility(target_sku="windows-consumption") →
  ⚠ Host version diff: you're on 4.1047.100 (flex), target runs 4.1045.200
  ⚠ Extension bundle: you have [4.22.*, 5.0.0), target supports [4.19.*, 5.0.0)
  ✓ All bindings (httpTrigger, blobTrigger) are available on both versions
Copilot: "Your app should work, but test with --sku windows-consumption to verify. The older host may behave differently for edge cases."
```

### 4. Performance investigation
```
User: "My app feels slow, what's going on?"
Copilot → get_metrics() → blob_trigger avg 2.3s (last 50 invocations), hello avg 12ms
Copilot → get_invocations(function="blob_trigger", status="Succeeded", limit=5) → all took 1.5-3.2s
Copilot → get_invocation_detail(id="abc123") → 2.1s in function execution, input blob was 135KB
Copilot: "Your blob trigger takes 2.3s on average processing ~135KB files. The bottleneck is in your function code, not the host. Consider async processing or streaming."
```

### 5. Observability for live demos
```
User: "Show me what's happening in my app right now"
Copilot → get_host_status() → Running for 12m, 47 invocations, 0 errors
Copilot → get_metrics() → hello: 42 calls (100% success, 8ms avg), blob_trigger: 5 calls (100% success, 2.1s avg)
Copilot → get_bindings_summary() → Uses: Azurite (blob storage), no external services
Copilot: "Your app has 2 functions. The HTTP trigger is getting most traffic (42 calls). Blob trigger has processed 5 files. Everything healthy."
```

## Integration with Templates MCP Server

The existing [azure-functions-templates-mcp-server](https://github.com/manvkaur/azure-functions-templates-mcp-server) provides:
- `get_languages_list` — 4 languages with runtime versions
- `get_project_template` — project scaffolding (host.json, package.json, etc.)
- `get_azure_functions_templates_list` — 68 templates by language
- `get_azure_functions_template` — complete template source code

**Merge strategy:** Embed the templates data (JSON files, ~500KB) directly into fnx rather than spawning a separate MCP server process. This avoids two stdio MCP servers competing for stdin/stdout. The template tools become part of the fnx MCP server.

## Standalone Mode

When fnx is NOT running a host (no `fnx start`), the MCP server can still serve:
- Template catalog (all `get_template*` and `get_languages_list` tools)
- SKU profile information (`get_sku_profile`)
- Project metadata if `--scriptroot` is provided

This makes fnx useful as a pure templates MCP server even without host execution.

## Transport Options

| Mode | Transport | Command | Use Case |
|------|-----------|---------|----------|
| `fnx templates-mcp` | stdio | `fnx templates-mcp` | VS Code Copilot, CLI — templates only, no host |
| `fnx start` | HTTP/SSE | Auto on `--mcp-port` | Live host data + templates, web MCP clients |

## VS Code Integration

### Templates only (no running host)
```json
// .vscode/mcp.json
{
  "servers": {
    "azure-functions-create-triggers-bindings": {
      "type": "stdio",
      "command": "fnx",
      "args": ["templates-mcp"]
    }
  }
}
```

### Live host + templates (when fnx start is running)
```json
// .vscode/mcp.json
{
  "servers": {
    "fnx-live": {
      "type": "sse",
      "url": "http://localhost:7072/mcp"
    }
  }
}
```

## Implementation Plan

### Phase 1: `fnx templates-mcp` (standalone templates — Category 1 + 5)
- Embed templates data from `azure-functions-templates-mcp-server` into fnx
- Implement stdio MCP server: `get_languages_list`, `get_project_template`, `get_templates_list`, `get_template`
- Add `get_sku_profile`, `compare_skus` tools (reads profiles without starting host)
- Zero deps — hand-rolled stdio MCP protocol over stdin/stdout

### Phase 2: `fnx start` → live host tools (Category 2 + 3)
- When `fnx start` runs, expose SSE/HTTP MCP endpoint on `--mcp-port`
- Host & functions: `get_host_status`, `get_functions`, `get_function_detail`, `get_bindings_summary`, `get_app_settings`
- Observability: `get_invocations`, `get_invocation_detail`, `get_logs`, `get_errors`, `get_metrics`
- Source data from `/admin/functions` API + structured log parsing
- Include all Phase 1 tools (superset)

### Phase 3: Actions + compatibility (Category 4 + 5)
- `invoke_function` — trigger functions via HTTP route or admin API
- `create_function` — scaffold from template into project
- `restart_host` — kill + relaunch host process
- `check_compatibility` — analyze app against target SKU for deployment readiness

## Success Criteria

- `fnx templates-mcp` works as a drop-in replacement for `manvir-templates-mcp-server` in VS Code mcp.json
- `fnx start` automatically exposes an MCP endpoint that Copilot can discover
- Copilot can list running functions and their trigger types via the live MCP endpoint
- Copilot can scaffold a new function using the template tools
- MCP Inspector shows all tools working end-to-end
- Standalone mode works without a running host (templates only)
