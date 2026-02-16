# F18: fnx doctor — Project Diagnostics

**Status:** ✅ Implemented  
**PRD Section:** Developer experience, debugging  
**Depends on:** F16 (app-config.yaml)

## Problem

When `fnx start` fails, users lack diagnostic tools to understand why. Common issues include missing config files, wrong runtime version, incompatible host, missing extension bundles, and port conflicts. Users must manually investigate each possibility.

## Scope

- `fnx doctor` command that validates project setup
- Checks: config files present and valid, runtime detected, host cache, port availability, Azurite status
- Reports issues with actionable fix suggestions
- Exit code reflects health: 0 = healthy, 1 = issues found

## Checks Performed

| Check | Pass | Warn | Fail |
|-------|------|------|------|
| host.json | Present, version 2.0 | Wrong version | Missing or invalid JSON |
| app-config.yaml | Valid schema, no secrets | Missing (with migration path) | Secrets detected, parse errors |
| local.settings.json | Present, valid JSON | Missing | Invalid JSON |
| Worker runtime | Detected from config | — | Not configured, invalid name |
| Host cache | Versions cached in ~/.fnx/hosts/ | Empty cache | — |
| Default ports | 7071 and 7072 available | Ports in use | — |
| Azurite | Running on default ports | Installed but not running | — |

## Success Criteria

- [x] `fnx doctor` runs in under 5 seconds
- [x] Detects missing `host.json`, `app-config.yaml`, `local.settings.json`
- [x] Validates `app-config.yaml` schema and secret detection
- [x] Checks host cache and Azurite status
- [x] Actionable fix suggestions for each issue found
- [x] Exit code: 0 = pass/warn only, 1 = failures found
