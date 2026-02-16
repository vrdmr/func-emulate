# F16: Configuration Documentation & Validation

**Status:** 📋 Proposed  
**PRD Section:** Developer experience, onboarding  
**Depends on:** F4 (CLI surface)

## Problem

fnx uses two configuration files (`app.config.json` and `local.settings.json`) that are merged and injected as environment variables into the host process. This configuration model is not well documented:

1. **Discovery** — New users don't know which file to create or what fields are expected
2. **Precedence** — `local.settings.json` values override `app.config.json` but this isn't surfaced in the CLI
3. **Validation** — No feedback when config is missing, malformed, or has unexpected fields
4. **TargetSku** — The ability to set `TargetSku` in config files (instead of `--sku` flag) is undocumented outside of `--help`

## Scope

### Phase 1: Documentation

- Create a dedicated `fnx config` or `fnx doctor` command that shows the resolved configuration
- Add a `Configuration` section to the README with examples of both files
- Document the merge order and precedence rules

### Phase 2: Validation & Scaffolding

- `fnx init` scaffolds `app.config.json` and `local.settings.json` with sensible defaults
- Validate config on `fnx start` — warn on unknown fields, missing `FUNCTIONS_WORKER_RUNTIME`
- Show which config values came from which file (useful for debugging)

### Phase 3: Config Doctor

- `fnx doctor` checks the project setup: config files, runtime detection, host compatibility
- Reports issues with actionable suggestions

## Configuration Files

### app.config.json (committed to source control)
```json
{
  "TargetSku": "flex",
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "python",
    "AzureWebJobsFeatureFlags": "EnableWorkerIndexing"
  }
}
```

### local.settings.json (git-ignored, secrets)
```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "SOME_API_KEY": "secret-value"
  }
}
```

### Merge Rules
1. `app.config.json.Values` is read first
2. `local.settings.json.Values` overrides matching keys
3. Merged values are set as environment variables for the host process
4. `TargetSku` can appear in either file (CLI `--sku` flag takes precedence)

## Success Criteria

- [ ] Configuration model is documented in README and/or dedicated docs
- [ ] `fnx start` warns when no config files are found
- [ ] Users can discover config format without reading source code
- [ ] Merge precedence is clear and testable

## Open Questions

- Should `fnx init` be part of this FRD or a separate one (ties into Project Phoenix `fnx-cli`)?
- Should `fnx doctor` be a separate FRD?
- Is `app.config.json` the right name, or should it align with Azure Functions conventions?
