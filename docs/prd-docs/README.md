# Feature Requirement Documents (FRDs)

Individual feature specs broken out from the [PRD](../prd.md). Each FRD is self-contained and can be implemented independently.

## Features

| # | Feature | Status | FRD |
|---|---------|--------|-----|
| F1 | [SKU Profile Registry](./f1-sku-profile-registry.md) | ✅ POC validated | CDN-hosted JSON mapping SKUs → host/bundle versions |
| F2 | [Host Version Manager](./f2-host-version-manager.md) | ✅ POC validated | Download, cache, and launch self-contained host binaries |
| F3 | [Extension Bundle Support](./f3-extension-bundle-support.md) | ✅ POC validated | SKU-aware bundle version resolution + auto-download |
| F4 | [CLI Surface & Config](./f4-cli-surface-config.md) | ✅ POC validated | `--sku` flag, config merging, help UX |
| F5 | [Non-HTTP Trigger Support](./f5-non-http-triggers.md) | ✅ POC validated | Blob/Timer/Queue trigger indexing, display, and execution |
| F6 | [MCP Server Integration](./f6-mcp-server.md) | ✅ Implemented | Expose fnx runtime + templates as an MCP server |
| F7 | [Install-Time Warmup](./f7-install-warmup.md) | ✅ Implemented | Pre-download host + bundle during `npm install` |
| F8 | [Homepage Improvements](./f8-homepage-improvements.md) | ✅ Implemented | Transform host homepage into a developer productivity hub |
| F9 | [.NET Isolated Worker Only](./f9-dotnet-isolated-only.md) | ✅ Implemented | Block in-process .NET projects with migration guidance |
| F10 | [Standalone Template MCP Server](./f10-template-mcp-standalone.md) | ✅ Implemented | Fast, host-free MCP server entrypoint for AI agents |
| F11 | [Debugging & Logging Test Rigor](./f11-debugging-logging-rigor.md) | ✅ Implemented | Test framework + unit/E2E tests for logging and debugging |
| F12 | [Comprehensive E2E & Unit Tests](./f12-comprehensive-testing.md) | ✅ Implemented | Full test suite for Template MCP + emulator |
| F13 | [Azurite as Lazy Dependency](./f13-azurite-dependency.md) | ✅ Implemented | Auto-detect, install, and start Azurite for storage triggers |
| F14 | [npm Release & Distribution](./f14-npm-release.md) | ✅ Implemented | npm publish plan for `fnx` package |
| F15 | [Colored Log Output](./f15-colored-log-output.md) | ✅ Implemented | ANSI-colored logs matching `func start` theme |
| F16 | [Configuration Documentation](./f16-configuration-docs.md) | 📋 Proposed | Document config files, merge rules, and validation |

## Relationship to PRD

The PRD (`docs/prd.md`) defines the overall vision: make `func start` SKU-aware. These FRDs break the implementation into shippable units. F1–F5 were validated in the fnx POC. F6–F15 have been implemented. F16 covers configuration documentation.
