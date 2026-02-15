# npm Release Plan: `func-emu`

Plan to publish `func-emu` as an installable npm package (`npm install -g func-emu`).

## Current State (POC)

- Zero npm dependencies ✅
- ESM module (`"type": "module"`) ✅
- `bin` field already declared in package.json ✅
- Node.js 18+ required (uses built-in `fetch`, `node:crypto`, `node:readline`) ✅
- Bundled fallback profiles in `profiles/sku-profiles.json` ✅

## What's Ready

The `func-emu/` directory is structured for npm publish today:

```json
{
  "name": "func-emu",
  "version": "0.1.0",
  "type": "module",
  "bin": { "func-emu": "./bin/func-emu" },
  "dependencies": {},
  "engines": { "node": ">=18" }
}
```

Running `npm install -g .` from `func-emu/` already works — it links the `func-emu` command globally.

## Changes Required for npm Publish

### P0: Must Have

| # | Change | Effort | Notes |
|---|--------|--------|-------|
| 1 | **Switch profiles URL to production** | Small | Replace `localhost:4566` default in `profile-resolver.js` with a GitHub raw URL or Azure CDN URL. The env var `FUNC_EMU_PROFILES_URL` already supports override. |
| 2 | **Host package CDN** | Medium | Host zips must be served from a public URL (GitHub Releases, Azure Blob, or npm itself). Currently `hostPackageUrl` in profiles points to `localhost:4566`. |
| 3 | **Package name availability** | Small | Check `npm info func-emu` — if taken, use scoped package `@azure/func-emu` or `azure-func-emu`. |
| 4 | **License field** | Small | Add `"license": "MIT"` (or appropriate) to package.json. |
| 5 | **README in package** | Small | Add a user-facing README.md inside `func-emu/` (npm shows this on the package page). |
| 6 | **`.npmignore` or `files` field** | Small | Restrict published files: `bin/`, `lib/`, `profiles/`, `package.json`, `README.md`. Exclude everything else. |
| 7 | **Remove POC caveats** | Medium | Support `authLevel` other than anonymous (or document the limitation clearly). |

### P1: Should Have

| # | Change | Effort | Notes |
|---|--------|--------|-------|
| 8 | **`--sku list` offline** | Done | Already works (bundled profiles). |
| 9 | **Version command reads package.json** | Done | `--version` already reads from package.json ✅ |
| 10 | **Semantic versioning** | Small | Follow semver: 0.x for pre-release, 1.0.0 for first stable. |
| 11 | **Changelog** | Small | Add CHANGELOG.md, update on each release. |
| 12 | **CI/CD pipeline** | Medium | GitHub Actions: lint → test → publish on tag push. |
| 13 | **Automated profile updates** | Medium | Scheduled job to refresh `profiles/sku-profiles.json` from the production CDN and commit/PR. |

### P2: Nice to Have

| # | Change | Effort | Notes |
|---|--------|--------|-------|
| 14 | **npx support** | Free | Already works: `npx func-emu start --sku list` (no install needed). |
| 15 | **Progress bar for downloads** | Small | Host zips are 50-100MB. Show download progress instead of "Downloading...". |
| 16 | **Update notifier** | Small | Check for newer func-emu version on startup (like npm itself does). |
| 17 | **Telemetry opt-in** | Medium | Anonymous usage stats (which SKUs are used, error rates). |

## Host Package Distribution Strategy

The biggest decision for npm release is **how to distribute host binaries** (~50-100MB per platform per version).

### Option A: GitHub Releases (Recommended for POC→GA)

```
profiles.json → hostPackageUrl: "https://github.com/Azure/azure-functions-host/releases/download/v{version}/Azure.Functions.Host.{rid}.zip"
```

- **Pros**: Free, CDN-backed, versioned, familiar
- **Cons**: Requires Azure Functions team to publish zips alongside each release
- **Effort**: Low (just change URLs in profiles.json)

### Option B: Azure Blob Storage / Azure CDN

```
profiles.json → hostPackageUrl: "https://functionscdn.azureedge.net/hosts/{version}/Azure.Functions.Host.{rid}.zip"
```

- **Pros**: Full control, fast global CDN, already used for extension bundles
- **Cons**: Requires Azure infrastructure, auth for upload
- **Effort**: Medium

### Option C: npm Separate Packages (like `esbuild`)

Publish platform-specific packages: `@func-emu/host-darwin-arm64`, `@func-emu/host-linux-x64`, etc.

- **Pros**: Single `npm install` gets everything, works offline
- **Cons**: 50-100MB per install, 5 versions × 4 platforms = 20 packages to maintain
- **Effort**: High

**Recommendation**: Start with Option A (GitHub Releases). Migrate to Option B when/if it becomes an official Azure product.

## Publish Checklist

```bash
# 1. Pre-publish checks
cd func-emu
npm pack --dry-run          # Verify included files
npm info func-emu           # Check name availability

# 2. Update for production
# - Set FUNC_EMU_PROFILES_URL default to production URL
# - Update hostPackageUrl in bundled profiles
# - Set version to 0.1.0
# - Add license, description, repository fields

# 3. Test the package
npm pack                    # Creates func-emu-0.1.0.tgz
npm install -g func-emu-0.1.0.tgz
func-emu --help
func-emu start --sku list   # Should work offline (bundled profiles)

# 4. Publish
npm login
npm publish                 # or npm publish --access public (for scoped)

# 5. Verify
npm install -g func-emu
func-emu --version          # Should show 0.1.0
```

## package.json (Production Ready)

```json
{
  "name": "func-emu",
  "version": "0.1.0",
  "description": "SKU-aware Azure Functions local emulator — run any host version locally",
  "type": "module",
  "bin": {
    "func-emu": "./bin/func-emu"
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
    "url": "https://github.com/Azure/func-emulate"
  },
  "license": "MIT",
  "engines": {
    "node": ">=18"
  },
  "dependencies": {}
}
```

## Timeline Estimate

| Phase | Scope | Dependencies |
|-------|-------|-------------|
| **Alpha** (0.1.x) | Current POC on npm, localhost CDN only | None |
| **Beta** (0.2.x) | Production CDN URLs, GitHub Releases hosting | Azure Functions team publishes host zips |
| **RC** (0.9.x) | CI/CD, changelog, update notifier | GitHub Actions pipeline |
| **GA** (1.0.0) | Stable API, all 5 SKUs tested, docs on MS Learn | Full team review |
