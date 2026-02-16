# F16: app-config.yaml — Configuration as Code

**Status:** 🚧 In Progress  
**PRD Section:** Developer experience, configuration  
**Depends on:** F4 (CLI surface)

## Problem

Azure Functions apps today use `local.settings.json` for ALL settings (secrets + behavior config),
but this file is git-ignored. Users cloning a repo must manually recreate it. There is no committed,
source-controlled way to define app behavior configuration.

fnx introduced `app.config.json` as a step forward, but:

1. **No comments** — JSON doesn't support comments; can't guide users or document settings inline
2. **Flat structure** — Doesn't align with Azure's hierarchical `functionAppConfig` (ARM/Bicep) schema
3. **No validation** — No feedback when config is missing, malformed, or contains secrets
4. **No migration** — Existing apps with `local.settings.json` have no path to adopt config-as-code
5. **fnx-specific** — Format not designed for broader consumption by workers, deployment, scale controller

## Design

### Core Concept

Replace `app.config.json` with **`app-config.yaml`** — a YAML configuration file for non-secret
behavioral settings, committed to source control. YAML is chosen for comment support and
cloud-native familiarity.

**Two-file model:**

| File | Purpose | Source Control | Contains Secrets |
|------|---------|---------------|-----------------|
| `app-config.yaml` | Behavioral config (runtime, SKU, app settings) | ✅ Committed | ❌ Never |
| `local.settings.json` | Secrets, connection strings, env-specific overrides | ❌ Git-ignored | ✅ Yes |

**Precedence (highest → lowest):**

```
CLI flags  →  local.settings.json  →  app-config.yaml  →  defaults
```

### app-config.yaml Schema

```yaml
# Azure Functions App Configuration
# Commit this to source control. Do NOT put secrets here.
# See: https://learn.microsoft.com/en-us/azure/azure-functions/functions-app-settings

# ── Local Emulator (fnx) ──
local:
  targetSku: flex              # SKU to emulate: flex | premium | dedicated
  # port: 7071                # Host HTTP port override
  # mcpPort: 7072             # MCP server port override

# ── Runtime ──
runtime:
  name: python                 # python | node | dotnet-isolated | java | powershell | custom
  version: "3.11"              # Language version

# ── Scale & Concurrency (mirrors ARM functionAppConfig) ──
scaleAndConcurrency:
  maximumInstanceCount: 100
  instanceMemoryMB: 2048
  # alwaysReady: []

# ── App Settings (non-secret behavioral config) ──
# Only allowlisted settings permitted. Secrets detected here will cause an error.
configurations:
  AzureWebJobsFeatureFlags: EnableWorkerIndexing
  # PYTHON_ISOLATE_WORKER_DEPENDENCIES: "1"
  # FUNCTIONS_WORKER_PROCESS_COUNT: "4"
```

**Notes:**
- `runtime`, `scaleAndConcurrency` sections mirror ARM/Bicep `functionAppConfig` schema
- `local` section is fnx-specific (emulator configuration)
- `deployment` section reserved for future use (not in Phase 1)
- YAML keys use camelCase to match ARM/Bicep conventions

### Mapping Layer (config-schema.js)

A canonical mapping from structured YAML paths → host environment variables. This is the
single source of truth — fnx is the first consumer, but workers, deployment tools, and other
components can adopt the same schema.

```js
// Structured YAML path → environment variable
'runtime.name'                              → FUNCTIONS_WORKER_RUNTIME
'runtime.version'                           → FUNCTIONS_WORKER_RUNTIME_VERSION
'scaleAndConcurrency.maximumInstanceCount'  → WEBSITE_MAX_DYNAMIC_APPLICATION_SCALE_OUT
'scaleAndConcurrency.instanceMemoryMB'      → WEBSITE_INSTANCE_MEMORY_MB

// configurations.* → passthrough (key = env var name, value = env var value)
'configurations.AzureWebJobsFeatureFlags'   → AzureWebJobsFeatureFlags
```

The mapping manifest defines: env var name, type, required/optional, allowed values, and
whether the setting is secret-capable. This ensures any tool reading `app-config.yaml` produces
identical env var output.

### Secret Protection

**app-config.yaml must never contain secrets.** Protection is enforced at multiple levels:

1. **On load** — Scan all values for secret patterns (connection strings, SAS tokens, keys, passwords).
   If any found:
   - Immediately add `app-config.yaml` to `.gitignore`
   - Error with: `"Secret detected in app-config.yaml. Moved to .gitignore. Move secret to local.settings.json."`
   - Block all fnx operations until resolved
2. **On clean** — If no secrets or unknown values found, ensure `app-config.yaml` is NOT in `.gitignore`
3. **Allowlist** — Only known `configurations.*` keys are permitted (see functions-app-settings reference).
   Unknown keys → error with guidance

### Auto-Creation Flow

When `fnx start` (or any fnx operation) runs:

```
1. app-config.yaml exists?
   → Read, validate (secret check + schema check), proceed

2. app-config.yaml missing + local.settings.json exists?
   → Auto-generate app-config.yaml:
     - Extract non-secret settings from local.settings.json
     - Map flat Values to structured YAML sections (runtime, configurations, etc.)
     - Leave secrets in local.settings.json
   → Print: "✓ Created app-config.yaml from local.settings.json (non-secret settings extracted)"
   → Proceed

3. Neither file exists?
   → Prompt: "No config found. Generate app-config.yaml? [Y/n]"
   → Ask for runtime: node | python | dotnet-isolated | java
   → Generate minimal app-config.yaml with defaults
   → Also create local.settings.json with AzureWebJobsStorage=UseDevelopmentStorage=true
     (so local development works out of the box with Azurite)
   → Proceed
```

### Config Commands

| Command | Purpose |
|---------|---------|
| `fnx config` | Show resolved config with provenance (which value from which file) |
| `fnx config migrate` | Extract non-secrets from local.settings.json → app-config.yaml (without starting) |
| `fnx config validate` | Validate app-config.yaml (secrets, schema, allowlist) without starting |

### local.settings.json (unchanged)

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "SOME_SECRET_KEY": "actual-secret-value"
  }
}
```

Secrets and connection strings stay here. This file remains git-ignored.
`local.settings.json` values override `app-config.yaml` values (for env-specific overrides).

## Phases

### Phase 1: Core YAML support + auto-creation (this FRD)
- YAML parser (`yaml` npm package)
- `app-config.yaml` schema with `local`, `runtime`, `scaleAndConcurrency`, `configurations` sections
- Config mapping layer (`config-schema.js`) — YAML paths → env vars
- Secret detection + `.gitignore` protection
- Allowlisted `configurations.*` keys
- Auto-creation flow on `fnx start` (from local.settings.json or interactive)
- `fnx config`, `fnx config migrate`, `fnx config validate` commands
- Update all test apps to `app-config.yaml`
- Unit and E2E tests

### Phase 2: fnx init (separate FRD → F17)
- `fnx init` scaffolds new function app with `app-config.yaml`, `host.json`, `local.settings.json`
- Template selection, runtime selection, project structure

### Phase 3: fnx doctor (separate FRD → F18)
- `fnx doctor` validates project setup: config, runtime detection, host compat
- Reports issues with actionable suggestions
- Shows resolved config provenance

## Merge Rules (Phase 1)

1. `app-config.yaml` structured sections are mapped to env vars via `config-schema.js`
2. `app-config.yaml` `configurations.*` entries are passed through as env vars
3. `local.settings.json` `Values.*` override any matching env vars
4. CLI flags (`--sku`, `--port`, etc.) override everything
5. Merged values are set as environment variables for the host process

## Success Criteria

- [ ] `app-config.yaml` is the primary committed config file (replaces `app.config.json`)
- [ ] YAML supports comments and hierarchical structure matching ARM schema
- [ ] Secret detection blocks operations and adds file to `.gitignore`
- [ ] Auto-creation from `local.settings.json` works on first `fnx start`
- [ ] Interactive creation works when no config files exist
- [ ] `fnx config` shows resolved values with provenance
- [ ] `fnx config migrate` works standalone (without starting)
- [ ] `fnx config validate` checks schema and secrets
- [ ] Mapping layer (`config-schema.js`) is documented and reusable
- [ ] All test apps use `app-config.yaml`
- [ ] Unit tests for YAML parsing, merge, secret detection, mapping
- [ ] E2E tests for auto-creation, migration, validation

## Background

This design builds on a [2023 internal design doc](./Azfunc-config.pdf) that explored configuration
options for Azure Functions. That doc proposed `app_config.yml` read by the worker. This FRD
evolves the design: fnx reads the YAML (not the worker), the schema aligns with ARM/Bicep
`functionAppConfig`, and a mapping layer makes the format consumable by any component.

## Related FRDs

- **F17: fnx init** (proposed) — project scaffolding with `app-config.yaml`
- **F18: fnx doctor** (proposed) — project validation and diagnostics
