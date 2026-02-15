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
| F6 | [MCP Server Integration](./f6-mcp-server.md) | 📋 Proposed | Expose fnx runtime + templates as an MCP server |
| F7 | [Install-Time Warmup](./f7-install-warmup.md) | 📋 Proposed | Pre-download host + bundle during `npm install` |
| F8 | [Homepage Improvements](./f8-homepage-improvements.md) | 📋 Proposed | Transform host homepage into a developer productivity hub |

## Relationship to PRD

The PRD (`docs/prd.md`) defines the overall vision: make `func start` SKU-aware. These FRDs break the implementation into shippable units. F1–F5 were validated in the fnx POC. F6 is a new capability that extends fnx with AI-tooling integration.
