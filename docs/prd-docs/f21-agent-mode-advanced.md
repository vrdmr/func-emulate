# F21: Agent Mode Advanced

**Status:** 📋 Proposed  
**PRD Section:** N/A (new capability)  
**Depends on:** F6 (MCP Server Integration), F10 (Standalone Template MCP), F20 (Agent Mode)

## Problem

F20 establishes the foundation for agentic development — `fnx setup`, `fnx chat`, and skill files make it easy to start new projects and equip coding agents. But developers with **existing** codebases face deeper challenges that go beyond scaffolding:

1. **Legacy code patterns** — Thousands of Azure Functions apps use outdated programming models (Node v3, Python v1, .NET in-process). Microsoft has documented migration guides, but the actual work is tedious, error-prone, and touches every file. No tool today can analyze a legacy Functions app, understand the migration path, and execute it.

2. **Quality and security gaps** — Functions apps accumulate issues over time: auth levels left as `anonymous`, hardcoded secrets, deprecated APIs, SKU-incompatible bindings, missing telemetry. Generic linters don't understand Functions semantics. A developer on Flex Consumption has no way to know they're using a feature that won't work until they deploy and it fails.

3. **Advanced agentic workflows** — Beyond chat and scaffolding, developers need agents that can generate tests from existing code, produce documentation from running apps, design multi-function orchestrations, and review code against SKU constraints. These require deep integration with the fnx runtime and domain knowledge that general-purpose agents lack.

F21 addresses these with three capabilities: `fnx migrate`, `fnx audit`, and a suite of advanced agentic commands.

---

## 1. `fnx migrate` — Automated Programming Model Migration

### Overview

`fnx migrate` detects legacy Azure Functions programming model patterns and orchestrates migration to the current model. It combines deterministic AST-based transformations (for known patterns) with optional LLM-assisted migration (for complex/custom code).

### Supported Migration Paths

| From | To | Language | Complexity |
|------|----|----------|------------|
| Node.js v3 (function.json) | Node.js v4 (code-first) | JavaScript/TypeScript | Medium |
| Python v1 (function.json) | Python v2 (decorators) | Python | Medium |
| .NET In-Process | .NET Isolated Worker | C# | High |
| Functions v1/v2 host | Functions v4 host | All | Low (config only) |

### How It Works

```
$ fnx migrate

Analyzing project...

Detected: Node.js v3 programming model
  ├── 7 functions using function.json bindings
  ├── host.json: extensionBundle v3 (upgrade available)
  └── package.json: @azure/functions 3.5.0

Migration plan:
  1. Upgrade @azure/functions 3.x → 4.x
  2. Convert 7 function.json files → code-first registrations
  3. Update host.json extensionBundle to v4
  4. Remove function.json files
  5. Update folder structure (optional)

  ┌─────────────────────────────────────────────┐
  │  httpTrigger/function.json                  │
  │  ─────────────────────────────              │
  │  - "type": "httpTrigger"                    │
  │  - "methods": ["get", "post"]               │
  │  - "authLevel": "function"                  │
  │                     ↓                        │
  │  src/functions/httpTrigger.js                │
  │  ─────────────────────────────              │
  │  app.http('httpTrigger', {                  │
  │    methods: ['GET', 'POST'],                │
  │    authLevel: 'function',                   │
  │    handler: async (req, context) => { ... } │
  │  });                                        │
  └─────────────────────────────────────────────┘

Proceed? [y/N/preview]
```

### Migration Engine Architecture

```
┌───────────────────────────────────────────────────┐
│  fnx migrate                                       │
│                                                    │
│  1. Detect ──► Parse host.json, package.json,      │
│                function.json, *.csproj to identify │
│                current model version               │
│                                                    │
│  2. Plan ────► Generate migration plan with        │
│                file-by-file transformation list     │
│                                                    │
│  3. Transform                                      │
│     ├── Rules Engine (deterministic)               │
│     │   ├── function.json → code-first conversion  │
│     │   ├── Package version bumps                  │
│     │   ├── host.json updates                      │
│     │   └── Import/require statement rewrites      │
│     │                                              │
│     └── Agent Layer (optional, complex cases)      │
│         ├── Custom middleware migration             │
│         ├── Complex binding expressions             │
│         └── Business logic refactoring             │
│                                                    │
│  4. Validate ► Run fnx start against migrated code │
│                to verify host boots & functions     │
│                register correctly                  │
│                                                    │
│  5. Report ──► Summary of changes, manual TODOs    │
└───────────────────────────────────────────────────┘
```

### CLI Surface

```
fnx migrate [--dry-run] [--agent] [--backup] [--function <name>]

Options:
  --dry-run           Show migration plan without applying changes
  --agent             Use LLM agent for complex transformations (requires coding agent)
  --backup            Create .fnx-migrate-backup/ before transforming
  --function <name>   Migrate a single function (incremental migration)
```

### Incremental Migration

Not every team can migrate all functions at once. `fnx migrate --function <name>` migrates one function at a time, allowing the v3 and v4 patterns to coexist temporarily (Node.js v4 supports this).

### Validation

After migration, `fnx migrate` automatically:
1. Runs `fnx start` to verify the host boots
2. Checks all functions register correctly
3. Runs existing tests if a test runner is detected
4. Reports any functions that need manual attention

---

## 2. `fnx audit` — Comprehensive Project Audit

### Overview

`fnx audit` is a two-layer analysis tool: a fast deterministic **rules engine** (works offline, no LLM) and an optional deep **agent-powered analysis** (uses coding agent for nuanced recommendations).

### Layer 1: Rules Engine (Deterministic)

The rules engine checks for known issues using SKU profiles, binding metadata, and static analysis. No LLM required — runs in seconds, works offline.

#### Rule Categories

| Category | Example Rules |
|----------|--------------|
| **SKU Compatibility** | Durable Functions timers unsupported on Flex Consumption; blob trigger not available on certain SKUs; max timeout exceeded |
| **Security** | Auth level set to `anonymous` on non-development functions; secrets in code or `local.settings.json` committed to git; CORS set to `*` |
| **Best Practices** | Missing `host.json` logging configuration; no Application Insights configured; synchronous I/O in async functions |
| **Deprecation** | Using deprecated binding types; outdated extension bundle version; end-of-life runtime version |
| **Configuration** | Missing required app settings for bindings; invalid binding expressions; conflicting route templates |
| **Performance** | Unbounded concurrency on CPU-intensive functions; missing connection pooling; large payload without streaming |

#### Output Format

```
$ fnx audit

fnx audit • my-functions-app • Flex Consumption (Node.js v4)
═══════════════════════════════════════════════════════════

ERRORS (must fix)
  ✗ SEC-001  src/functions/webhook.js:12
    Auth level is "anonymous" — this function is publicly accessible.
    Fix: Set authLevel to "function" or "admin", or use API Management.

  ✗ SKU-003  src/functions/orchestrator.js
    Durable Functions timer (createTimer) is not supported on Flex Consumption.
    Fix: Use a different delay mechanism or switch to Consumption/Premium SKU.

WARNINGS (should fix)
  ⚠ CFG-002  host.json
    Extension bundle version [3.*, 4.0.0) is outdated. Latest: [4.*, 5.0.0).
    Fix: Run `fnx audit --fix CFG-002`

  ⚠ PERF-001  src/functions/processImage.js:34
    Synchronous file read (fs.readFileSync) in async function handler.
    Fix: Use fs.promises.readFile() instead.

INFO
  ℹ BP-001   No Application Insights connection string configured.
  ℹ BP-004   3 functions have no associated test files.

Summary: 2 errors, 2 warnings, 2 info
```

#### Auto-Fix

Some rules support automatic fixing:

```
fnx audit --fix              # Fix all auto-fixable issues
fnx audit --fix SEC-001      # Fix a specific rule
fnx audit --fix --dry-run    # Preview fixes without applying
```

### Layer 2: Agent-Powered Deep Analysis

When `--deep` is passed and a coding agent is available, `fnx audit` delegates to the agent for nuanced analysis:

```
$ fnx audit --deep

Running rules engine... 2 errors, 2 warnings, 2 info (see above)

Running deep analysis with Claude Code...

RECOMMENDATIONS
  💡 ARCH-001  Function fan-out pattern detected
    processOrders triggers processOrder for each item sequentially.
    Consider: Durable Functions fan-out/fan-in for parallel processing.
    Estimated improvement: ~5x throughput for batch operations.

  💡 QUAL-001  Error handling inconsistency
    3 of 7 functions catch errors and return 500; 4 let exceptions propagate.
    Consider: Shared error handling middleware for consistent error responses.

  💡 SEC-002  Overly broad managed identity scope
    The function app's managed identity has Contributor role on the resource group.
    Consider: Scope to specific resources with least-privilege roles.
```

### CLI Surface

```
fnx audit [--deep] [--fix [rule]] [--category <cat>] [--format <fmt>] [--fail-on <level>]

Options:
  --deep                Use LLM agent for deep analysis (requires coding agent)
  --fix [rule]          Auto-fix issues (all or specific rule ID)
  --category <cat>      Filter by category: security, sku, perf, config, deprecation, bestpractice
  --format <fmt>        Output format: text (default), json, sarif
  --fail-on <level>     Exit non-zero if issues at level: error, warning, info (for CI)
```

### CI Integration

`fnx audit` is designed to run in CI pipelines:

```yaml
# .github/workflows/audit.yml
- name: fnx audit
  run: npx @vrdmr/fnx-test audit --fail-on error --format sarif
```

SARIF output integrates with GitHub Code Scanning to show issues inline on PRs.

### Custom Rules

Developers can add project-specific rules via `.fnx/audit-rules.js`:

```javascript
export default [
  {
    id: 'CUSTOM-001',
    name: 'require-correlation-id',
    category: 'bestpractice',
    level: 'warning',
    check: (fn) => {
      // Check that every HTTP function reads x-correlation-id header
      return fn.type === 'httpTrigger' && !fn.code.includes('correlation');
    },
    message: 'HTTP functions should read and propagate x-correlation-id header.',
  }
];
```

---

## 3. Advanced Agentic Commands (Future)

These commands build on the F20 agent infrastructure (`fnx chat`, MCP, skill files) and the F21 foundations (`migrate`, `audit`). They represent the longer-term vision for agentic Functions development.

### `fnx fix` — Agentic Error Recovery

When `fnx start` fails, `fnx fix` parses the error output and either applies a deterministic fix or delegates to an agent:

```
$ fnx start
  Error: No value for AzureWebJobsStorage in local.settings.json

$ fnx fix
  Detected: Missing AzureWebJobsStorage setting
  Fix: Adding Azurite connection string to local.settings.json
  Applied ✓ — run `fnx start` again.
```

For complex errors, `fnx fix --agent` sends the full error context (logs, config, code) to the coding agent for diagnosis.

### `fnx test-gen` — Agentic Test Generation

Analyzes existing functions and generates test files:

```
$ fnx test-gen

Generating tests for 5 functions...
  ✓ src/functions/httpTrigger.test.js    — 4 test cases (GET, POST, 400, 500)
  ✓ src/functions/queueProcessor.test.js — 3 test cases (valid, invalid, poison)
  ✓ src/functions/timerCleanup.test.js   — 2 test cases (success, partial failure)

Created 9 test cases across 3 files.
```

fnx uses its knowledge of trigger types and bindings to generate meaningful test scaffolds (not just empty stubs). HTTP functions get request/response tests, queue functions get message processing tests, etc.

### `fnx docs` — Agentic Documentation

Generates documentation from the running app and codebase:

```
$ fnx docs

Generating documentation...
  ✓ docs/api.md          — API reference (3 HTTP endpoints)
  ✓ docs/openapi.yaml    — OpenAPI 3.0 spec
  ✓ docs/architecture.md — Function catalog + data flow diagram
  ✓ README.md            — Updated project README (merged with existing)
```

fnx introspects the live host (via MCP) to get accurate route information, binding metadata, and function signatures.

### `fnx compose` — Agentic Orchestration Design

Describe a workflow in natural language and get a Durable Functions orchestration:

```
$ fnx compose "Accept order, validate inventory, charge payment, send confirmation email. 
               If payment fails, retry 3 times then send failure notification."

Generating Durable Functions orchestration...
  ✓ src/functions/orderOrchestrator.js    — Main orchestration
  ✓ src/functions/validateInventory.js    — Activity function
  ✓ src/functions/chargePayment.js        — Activity function (with retry policy)
  ✓ src/functions/sendConfirmation.js     — Activity function
  ✓ src/functions/sendFailureNotice.js    — Activity function
  ✓ src/functions/startOrder.js           — HTTP trigger (orchestration starter)

Architecture:
  startOrder (HTTP) → orderOrchestrator
    ├── validateInventory
    ├── chargePayment (retry: 3x, backoff: 5s)
    │   ├── success → sendConfirmation
    │   └── failure → sendFailureNotice
```

### `fnx review` — SKU-Aware Code Review

Goes beyond `fnx audit` with contextual, diff-aware review:

```
$ fnx review --staged    # Review staged git changes

Reviewing 2 changed files against Flex Consumption constraints...

  src/functions/newEndpoint.js:15
    ⚠ This function reads from Blob Storage using the input binding.
      On Flex Consumption, blob input bindings have a 100MB payload limit.
      Consider streaming for large files: `context.extraInputs.get(blobInput).stream()`

  src/functions/orchestrator.js:42
    ✗ Added `context.df.createTimer()` — this is not supported on Flex Consumption.
      See: https://learn.microsoft.com/azure/azure-functions/flex-consumption-plan#limitations
```

---

## Implementation Plan

### Phase 1: `fnx audit` — Rules Engine

1. Define rule schema and rule runner
2. Implement core rule categories: SKU compatibility, security, configuration
3. Auto-fix infrastructure for deterministic fixes
4. JSON/SARIF output for CI integration

### Phase 2: `fnx migrate` — Node.js v3→v4

1. Detection logic (parse function.json, package.json for v3 indicators)
2. AST-based transformation for common patterns (HTTP, queue, timer, blob triggers)
3. Validation via `fnx start` after migration
4. Backup and incremental migration support

### Phase 3: `fnx migrate` — Python v1→v2, .NET In-Process→Isolated

1. Python: function.json → decorator-based conversion
2. .NET: in-process → isolated worker model conversion
3. Agent-assisted migration for complex cases

### Phase 4: `fnx audit --deep` + Advanced Commands

1. Agent integration layer for `fnx audit --deep`
2. `fnx fix` — error recovery engine
3. `fnx test-gen` — test scaffold generation
4. `fnx docs` — documentation generation
5. `fnx compose` — orchestration design (requires agent)

---

## Success Criteria

- [ ] `fnx audit` runs in <5 seconds on a typical project (rules engine only)
- [ ] `fnx audit` detects ≥3 SKU compatibility issues correctly
- [ ] `fnx audit --fix` auto-fixes ≥50% of detected issues
- [ ] `fnx audit --format sarif` integrates with GitHub Code Scanning
- [ ] `fnx migrate` successfully converts a Node.js v3 app to v4 (7+ functions)
- [ ] `fnx migrate` successfully converts a Python v1 app to v2
- [ ] `fnx migrate --dry-run` shows accurate preview without modifying files
- [ ] Migrated apps pass `fnx start` validation (host boots, functions register)
- [ ] `fnx audit --deep` produces actionable recommendations beyond rules engine
- [ ] Custom rules (`.fnx/audit-rules.js`) are loaded and executed correctly
- [ ] `fnx audit --fail-on error` returns non-zero exit code in CI when errors found

## Open Questions

1. **Rule distribution:** Should audit rules ship with fnx, or be fetched from a central registry (allowing updates without fnx version bumps)?
2. **Migration rollback:** Beyond `--backup`, should `fnx migrate` integrate with git (create a branch, commit pre-migration state)?
3. **Migration completeness:** For .NET in-process → isolated, the transformation is substantial (different NuGet packages, startup patterns, middleware). Should fnx handle this fully or focus on scaffolding + guidance?
4. **SARIF integration:** Should `fnx audit` also support Azure DevOps code scanning format, or is SARIF sufficient?
5. **Rule severity customization:** Should developers be able to override rule severity (e.g., downgrade SEC-001 from error to warning) via `.fnx/audit-config.json`?
6. **Agent fallback:** When `--deep` is requested but no agent is available, should `fnx audit` suggest installing one, or silently skip the deep layer?
