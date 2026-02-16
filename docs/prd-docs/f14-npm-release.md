# F14: npm Release & Distribution

**Status:** ✅ Implemented    
**PRD Section:** Release & distribution  
**Depends on:** F1 (SKU profiles), F2 (host version manager), F4 (CLI surface)  
**Source:** `docs/npm-release-plan.md`

## Problem

fnx exists as a local POC — it runs from a cloned repo with `node bin/fnx`. To be useful beyond the team, it needs to be installable via `npm install -g fnx` (or `npx fnx`) with production-ready CDN URLs, proper packaging, and a CI/CD pipeline.

Key gaps between POC and publishable package:

1. **Profile/host URLs point to `localhost:4566`** — need production CDN
2. **No package metadata** — missing license, description, repository, `files` field
3. **No CI/CD** — no automated lint → test → publish pipeline
4. **No host binary distribution strategy** — 50-100MB zips need a public host

## Feature

Publish fnx as an npm package to the `vrdmr/fnx-test` account (initial testing), then migrate to an official scope when ready.

## Current State

Already in place:

- Zero npm dependencies ✅
- ESM module (`"type": "module"`) ✅
- `bin` field declared in package.json ✅
- Node.js 18+ (uses built-in `fetch`, `node:crypto`, `node:readline`) ✅
- Bundled fallback profiles in `profiles/sku-profiles.json` ✅
- `--version` reads from package.json ✅
- `npx` support works (free) ✅
- `--sku list` works offline (bundled profiles) ✅

## Release Phases

### Phase 1: Alpha (`0.1.x`) — Publish to `vrdmr/fnx-test`

Minimal viable package on npm under a test account for dogfooding.

| # | Change | Priority | Effort |
|---|--------|----------|--------|
| 1 | Publish as `@vrdmr/fnx-test` (scoped, public) | P0 | Small |
| 2 | Add `"files"` field: `bin/`, `lib/`, `profiles/`, `README.md` | P0 | Small |
| 3 | Add `"license": "MIT"`, description, repository fields | P0 | Small |
| 4 | User-facing README.md inside `fnx/` | P0 | Small |
| 5 | Switch default profiles URL to GitHub raw or test CDN | P0 | Small |
| 6 | `.npmignore` as safety net alongside `files` field | P1 | Small |

**Target package.json:**

```json
{
  "name": "@vrdmr/fnx-test",
  "version": "0.1.0",
  "description": "SKU-aware Azure Functions local emulator",
  "type": "module",
  "bin": {
    "fnx": "./bin/fnx"
  },
  "files": [
    "bin/",
    "lib/",
    "profiles/",
    "README.md"
  ],
  "keywords": [
    "azure-functions",
    "serverless",
    "emulator",
    "sku",
    "local-development"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/vrdmr/fnx-test"
  },
  "license": "MIT",
  "engines": {
    "node": ">=18"
  },
  "dependencies": {}
}
```

**Publish checklist:**

```bash
cd fnx
npm pack --dry-run              # Verify included files
npm pack                        # Creates tarball
npm install -g ./*.tgz          # Test install from tarball
fnx --help && fnx start --sku list  # Smoke test
npm login                       # Login as vrdmr
npm publish --access public     # Publish scoped package
```

### Phase 2: Beta (`0.2.x`) — Production CDN URLs

| # | Change | Priority | Effort |
|---|--------|----------|--------|
| 7 | Host package CDN — serve zips from public URL | P0 | Medium |
| 8 | Remove POC caveats (authLevel, error handling) | P0 | Medium |
| 9 | Semantic versioning policy documented | P1 | Small |
| 10 | CHANGELOG.md, update on each release | P1 | Small |

### Phase 3: RC (`0.9.x`) — CI/CD & Automation

| # | Change | Priority | Effort |
|---|--------|----------|--------|
| 11 | GitHub Actions: lint → test → publish on tag push | P0 | Medium |
| 12 | Automated profile updates (scheduled refresh of `sku-profiles.json`) | P1 | Medium |
| 13 | Progress bar for host downloads (50-100MB) | P1 | Small |
| 14 | Update notifier (check for newer fnx version on startup) | P2 | Small |

### Phase 4: GA (`1.0.0`) — Official Package

| # | Change | Priority | Effort |
|---|--------|----------|--------|
| 15 | Migrate from `@vrdmr/fnx-test` to `@azure/fnx` or `fnx` | P0 | Small |
| 16 | MS Learn documentation | P0 | Medium |
| 17 | Telemetry opt-in (anonymous usage stats) | P2 | Medium |
| 18 | All 5 SKUs tested end-to-end before each release | P0 | Medium |

## Host Binary Distribution Strategy

The biggest decision: **how to distribute host binaries** (~50-100MB per platform per version).

### Option A: GitHub Releases (Recommended for Alpha → Beta)

```
hostPackageUrl: "https://github.com/Azure/azure-functions-host/releases/download/v{version}/Azure.Functions.Host.{rid}.zip"
```

- **Pros:** Free, CDN-backed, versioned, familiar
- **Cons:** Requires Azure Functions team to publish zips alongside each release
- **Effort:** Low

### Option B: Azure Blob Storage / Azure CDN (Recommended for GA)

```
hostPackageUrl: "https://functionscdn.azureedge.net/hosts/{version}/Azure.Functions.Host.{rid}.zip"
```

- **Pros:** Full control, fast global CDN, already used for extension bundles
- **Cons:** Requires Azure infrastructure setup
- **Effort:** Medium

### Option C: npm Platform Packages (like `esbuild`)

Publish `@fnx/host-darwin-arm64`, `@fnx/host-linux-x64`, etc.

- **Pros:** Single `npm install` gets everything, works offline
- **Cons:** 50-100MB per install, 5 versions × 4 platforms = 20 packages
- **Effort:** High

**Recommendation:** Start with Option A, migrate to Option B at GA.

## Success Criteria

- [ ] `npm install -g @vrdmr/fnx-test` installs cleanly and `fnx --help` works
- [ ] `npx @vrdmr/fnx-test start --sku list` works without prior install
- [ ] Published package contains only `bin/`, `lib/`, `profiles/`, `README.md`, `package.json`
- [ ] Host binaries download from a public URL (not localhost)
- [ ] CI/CD pipeline publishes on tag push (Phase 3)
- [ ] Migration path from `@vrdmr/fnx-test` → official package is documented

## Open Questions

- [ ] Package name: `@vrdmr/fnx-test` for alpha — what's the final name? `fnx`, `@azure/fnx`, `azure-fnx`?
- [ ] Should alpha publish be manual or automated from day one?
- [ ] Do we need a deprecation notice on `@vrdmr/fnx-test` when migrating to official?
- [ ] Should `npx fnx` work (unscoped) or only `npx @vrdmr/fnx-test` during alpha?
