# F17: fnx init — Project Scaffolding

**Status:** 📋 Proposed  
**PRD Section:** Developer experience, onboarding  
**Depends on:** F16 (app-config.yaml)

## Problem

New Azure Functions users must manually create `host.json`, `app-config.yaml`, `local.settings.json`, and language-specific entry points. There's no guided scaffolding experience in fnx.

## Scope

- `fnx init` command that scaffolds a new function app project
- Interactive runtime selection (node, python, dotnet-isolated, java, powershell)
- Generates: `host.json`, `app-config.yaml`, `local.settings.json`, `.gitignore`, language entry point
- Template-based scaffolding (reuse templates from `fnx templates-mcp`)
- Optional `--template <name>` flag for non-interactive use

## Success Criteria

- [ ] `fnx init` creates a runnable function app in an empty directory
- [ ] Generated `app-config.yaml` follows F16 schema
- [ ] Generated project runs successfully with `fnx start`
- [ ] All 5 supported runtimes have working scaffolds
