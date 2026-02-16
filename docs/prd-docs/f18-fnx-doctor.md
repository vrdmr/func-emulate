# F18: fnx doctor — Project Diagnostics

**Status:** 📋 Proposed  
**PRD Section:** Developer experience, debugging  
**Depends on:** F16 (app-config.yaml)

## Problem

When `fnx start` fails, users lack diagnostic tools to understand why. Common issues include missing config files, wrong runtime version, incompatible host, missing extension bundles, and port conflicts. Users must manually investigate each possibility.

## Scope

- `fnx doctor` command that validates project setup
- Checks: config files present and valid, runtime detected, host compatibility, extension bundle availability, port availability, Azurite status
- Shows resolved config with provenance (which value came from which file)
- Reports issues with actionable suggestions
- Exit code reflects health: 0 = healthy, 1 = issues found

## Success Criteria

- [ ] `fnx doctor` runs in under 5 seconds
- [ ] Detects missing `host.json`, `app-config.yaml`, `local.settings.json`
- [ ] Validates `app-config.yaml` schema and secret detection
- [ ] Reports host version compatibility with detected runtime
- [ ] Shows resolved config values with source attribution
- [ ] Actionable fix suggestions for each issue found
