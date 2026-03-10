# fnx Roadmap & Status

Source: <https://github.com/vrdmr/func-emulate>

## Current Version

- **0.4.x (Alpha)** — Core functionality working, API may change

## Release Milestones

| Phase | Version | Scope |
|-------|---------|-------|
| Alpha | 0.1.x–0.4.x | POC, local CDN, core commands |
| Beta | 0.5.x | Production CDN URLs, GitHub Releases hosting |
| RC | 0.9.x | CI/CD pipeline, changelog, update notifier |
| GA | 1.0.0 | Stable API, all SKUs tested |

## Implemented Features

- SKU-aware host download and caching (5 SKUs)
- `fnx init` with interactive wizard (5 runtimes, 8 trigger types)
- `fnx start` with live MCP server and auto-Azurite
- `fnx doctor` (7 diagnostic checks)
- `fnx config` (show, migrate, validate)
- `fnx pack` (deployment zip with auto-build)
- `fnx setup` / `fnx chat` (AI agent integration)
- Two-file config model (app-config.yaml + local.settings.json)
- Extension bundle version sync per SKU

## Planned Features

- Deployment validation (`func publish --sku` checking against FDM)
- Template filtering by SKU capability
- NuGet version guardrails per SKU
- Update notifier (auto-check for newer fnx version)
- Telemetry opt-in
- Sovereign cloud profiles
- IDE integration (VS / VS Code profile awareness)

## Known Limitations

- .NET in-process model not supported (dotnet-isolated only)
- Python on Windows is local dev only (Azure doesn't host Python on Windows)
- HTTP auth limited to anonymous triggers locally
- No deployment validation yet

## The Version-Skew Problem fnx Solves

Azure Functions SKUs update on different cadences:
```
Flex Consumption:    v4.1047.x  (newest, ~2-week cadence)
Linux Premium:       v4.1046.x  (1 version behind)
Windows Consumption: v4.1045.x  (~3 month cadence)
Windows Dedicated:   v4.1045.x
Linux Consumption:   v4.1044.x  (oldest, deprecated)
```

Gap = 3 minor versions — code tested with latest can break on older SKUs.

For the latest information, check the repository: <https://github.com/vrdmr/func-emulate>
