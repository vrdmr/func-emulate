# F7: Install-Time Warmup (`fnx warmup`)

**Status:** 📋 Proposed  
**PRD Section:** 6.6 (Host Version Management)  
**Depends on:** F1 (profiles), F2 (host manager), F3 (extension bundles)

## Problem

fnx is a thin CLI — it ships with no host binary and no extension bundle. Everything is downloaded on-demand at `fnx start`. This creates two problems:

1. **Airplane mode**: User installs fnx online, then tries to use it offline → `fnx start` fails because it can't download the host or bundle.
2. **First-run latency**: The first `fnx start` after install downloads ~350MB (host + bundle), surprising the user with a long wait when they expect instant startup.

Core Tools v4 solves this with a `postinstall` script that downloads the host during `npm install`. fnx needs an equivalent.

## Feature

A `fnx warmup` command that pre-downloads the host binary and extension bundle for one or more SKUs. Wired as an npm `postinstall` hook for automatic setup.

## What Gets Downloaded

| Asset | Size | Platform-specific? | Cache Location |
|-------|------|-------------------|----------------|
| **Host binary** | ~200MB | ✅ Yes — per OS + arch (RID) | `~/.fnx/hosts/{version}/` |
| **Extension bundle** | ~155MB | ❌ No — `any-any` universal | `~/.fnx/bundles/Microsoft.Azure.Functions.ExtensionBundle/{version}/` |
| **SKU profiles** | ~2KB | ❌ No | `~/.fnx/profiles/sku-profiles.json` |

### Platform RIDs (Runtime Identifiers)

The host is a self-contained .NET app compiled per platform. The correct binary must be selected based on the user's OS and architecture:

| OS | Architecture | RID | Notes |
|----|-------------|-----|-------|
| macOS | Apple Silicon (M1/M2/M3/M4) | `osx-arm64` | Most common Mac developer machine |
| macOS | Intel | `osx-x64` | Older Macs, some CI runners |
| Linux | x64 | `linux-x64` | WSL, CI/CD, containers, cloud dev boxes |
| Linux | ARM64 | `linux-arm64` | Graviton, Ampere, Raspberry Pi (future) |
| Windows | x64 | `win-x64` | Standard Windows developer machine |
| Windows | ARM64 | `win-arm64` | Surface Pro X, Snapdragon laptops (future) |

**Current POC builds:** `osx-arm64`, `osx-x64`, `linux-x64`, `win-x64` (4 RIDs)  
**Future production:** Add `linux-arm64`, `win-arm64` (6 RIDs)

RID detection at install time uses Node.js `os.platform()` + `os.arch()`:
```javascript
// darwin + arm64 → osx-arm64
// linux  + x64   → linux-x64
// win32  + x64   → win-x64
```

### Extension Bundles (Platform-Independent)

Extension bundles contain .NET DLLs that the host loads at runtime. They are compiled as `any-any` (platform-independent managed code), so a single zip works on all platforms:

```
Download URL pattern:
https://functionscdn.azureedge.net/public/ExtensionBundles/
  Microsoft.Azure.Functions.ExtensionBundle/{version}/
  Microsoft.Azure.Functions.ExtensionBundle.{version}_any-any.zip
```

The bundle version is resolved from the CDN index, constrained by:
1. `extensionBundleVersion` — the version range the SKU supports (e.g., `[4.19.*, 5.0.0)`)
2. `maxExtensionBundleVersion` — the hard ceiling for this host version (e.g., `4.25.0`)

See F3 for full bundle resolution logic.

## Command Surface

```
fnx warmup                          # Pre-download default SKU (flex) host + bundle
fnx warmup --sku flex               # Explicit SKU
fnx warmup --sku windows-consumption # Warm a specific SKU
fnx warmup --sku list               # Show available SKUs
fnx warmup --all                    # Warm ALL SKUs (CI/build agents)
fnx warmup --dry-run                # Show what would be downloaded, no actual download
fnx warmup --force                  # Re-download even if cached
```

### Output Example

```
$ fnx warmup --sku flex

fnx warmup — pre-downloading assets for offline use

  Platform:        osx-arm64
  Target SKU:      Flex Consumption
  Host Version:    4.1047.100
  Bundle Version:  4.30.0 (max: 4.99.0)

  [1/3] Profiles        ✓ cached (~/.fnx/profiles/sku-profiles.json)
  [2/3] Host 4.1047.100 ✓ cached (~/.fnx/hosts/4.1047.100/)
  [3/3] Bundle 4.30.0   ✓ downloading... 78% (121.0 MB)

  Done. fnx start --sku flex will work offline.
```

### Multi-SKU Output

```
$ fnx warmup --all

fnx warmup — pre-downloading assets for ALL SKUs

  Platform: osx-arm64

  SKU                     Host           Bundle    Host Status   Bundle Status
  ─────────────────────── ────────────── ───────── ──────────── ─────────────
  flex                    4.1047.100     4.30.0    ✓ cached     ✓ cached
  linux-premium           4.1046.100     4.30.0    ↓ 45%        (waiting)
  windows-consumption     4.1045.200     4.23.1    (queued)     (queued)
  windows-dedicated       4.1045.100     4.23.1    (queued)     (queued)
  linux-consumption       4.1044.400     4.21.0    (queued)     (queued)

  Total: 5 hosts (~1 GB), 3 unique bundles (~465 MB)
```

## npm `postinstall` Hook

```json
// fnx/package.json
{
  "scripts": {
    "postinstall": "node ./bin/fnx warmup || echo 'fnx: warmup skipped (offline or error). Run fnx warmup manually.'"
  }
}
```

### Behavior

| Scenario | What Happens |
|----------|-------------|
| Normal install (online) | Downloads flex host + bundle. User sees progress during `npm install`. |
| Install offline | Warmup fails gracefully, prints warning, `npm install` succeeds. |
| `npm install --ignore-scripts` | postinstall skipped entirely (npm built-in behavior). |
| `FNX_SKIP_DOWNLOAD=1` | Warmup detects env var, prints "skipped", exits 0. Useful for CI/Docker where host isn't needed. |
| `FNX_DEFAULT_SKU=windows-consumption` | Warms the specified SKU instead of flex. Useful for teams that deploy to a specific target. |

### Fault Tolerance

The postinstall hook must **never** break `npm install`. Defensive strategy:

1. Wrap in `|| echo ...` in package.json (shell-level fallback)
2. Inside warmup command: try/catch around every network operation
3. Partial failure is OK: if host downloads but bundle fails, the cached host is still useful
4. Exit code is always 0 from postinstall context

## Cache Layout

```
~/.fnx/
├── profiles/
│   └── sku-profiles.json              ← 2KB, platform-independent
├── hosts/
│   ├── 4.1047.100/                    ← ~200MB, platform-specific (osx-arm64)
│   │   ├── Microsoft.Azure.WebJobs.Script.WebHost
│   │   ├── workers/
│   │   │   ├── node/
│   │   │   ├── python/
│   │   │   └── java/
│   │   └── [.NET runtime DLLs]
│   ├── 4.1045.200/                    ← different host version for win-con
│   │   └── ...
│   └── _meta.json                     ← tracks which RID each host was built for
├── bundles/
│   └── Microsoft.Azure.Functions.ExtensionBundle/
│       ├── 4.30.0/                    ← ~155MB, platform-independent (any-any)
│       │   ├── bundle.json
│       │   ├── bin/
│       │   └── StaticContent/
│       └── 4.23.1/                    ← different bundle version for win-con
│           └── ...
└── _meta.json                         ← cache metadata (install date, fnx version, OS, arch)
```

### Cache Metadata (`~/.fnx/_meta.json`)

```json
{
  "fnxVersion": "0.1.0",
  "installedAt": "2026-02-15T05:40:00Z",
  "platform": "osx-arm64",
  "warmedSkus": ["flex"],
  "hosts": {
    "4.1047.100": { "rid": "osx-arm64", "size": 198000000, "downloadedAt": "..." }
  },
  "bundles": {
    "4.30.0": { "size": 155000000, "downloadedAt": "..." }
  }
}
```

This metadata enables:
- `fnx warmup --dry-run` to show what's cached vs. what needs downloading
- `fnx cache clean` (future) to manage disk space
- Diagnostics: "which platform was this host built for?"

## Edge Cases

| Case | Handling |
|------|----------|
| User on `osx-arm64`, host zip only has `osx-x64` | Error: "No host package for osx-arm64. Available: osx-x64." Suggest Rosetta 2 as workaround. |
| User warms `flex`, then profile updates (new host version) | Next `fnx start --sku flex` detects version mismatch, downloads new host. `fnx warmup` can be re-run to update cache. |
| Bundle deduplication | Multiple SKUs may resolve to the same bundle version (e.g., flex and linux-premium both get 4.30.0). Download once, share cache. |
| Host deduplication | Some SKUs share host versions (e.g., flex and linux-premium if aligned). Same logic — download once. |
| Disk space | ~200MB per host × 5 SKUs + ~155MB per unique bundle ≈ 1.5 GB for `--all`. Show total size in `--dry-run`. |
| Concurrent installs | Use atomic write pattern: download to temp file, rename on success. Prevents corrupt cache from interrupted downloads. |
| Stale cache | Profiles have `updatedAt` timestamp. Consider TTL-based invalidation or `fnx warmup --force` to refresh. |

## Implementation Plan

### Phase 1: `fnx warmup` command
- Parse `--sku`, `--all`, `--dry-run`, `--force` flags
- Reuse `resolveProfile()`, `ensureHost()`, `ensureBundle()` from existing code
- Add cache metadata tracking (`~/.fnx/_meta.json`)
- Add `FNX_SKIP_DOWNLOAD` and `FNX_DEFAULT_SKU` env var support

### Phase 2: npm `postinstall` integration
- Add `postinstall` script to `fnx/package.json`
- Test: `npm install`, `npm install --ignore-scripts`, offline install
- Verify output is visible during `npm install -g`

### Phase 3: Cache management (future)
- `fnx cache list` — show cached hosts and bundles with sizes
- `fnx cache clean [--keep-latest]` — remove old/unused versions
- `fnx cache clean --all` — wipe entire `~/.fnx/` cache

## Success Criteria

- `npm install -g fnx` completes with flex host + bundle pre-cached
- `fnx start --sku flex` works immediately after install with no network
- `fnx warmup --all` downloads all 5 SKU hosts + their bundles
- postinstall never breaks `npm install`, even offline
- `FNX_SKIP_DOWNLOAD=1 npm install -g fnx` installs without downloading anything
