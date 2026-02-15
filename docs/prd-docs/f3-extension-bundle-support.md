# F3: Extension Bundle Support

**Status:** ✅ POC validated  
**PRD Section:** 6.2 (bundle resolution), implementation.md Section 8b  
**Source:** `fnx/lib/host-launcher.js` (env vars)

## Problem

Extension bundles provide trigger and binding implementations (HTTP, Blob, Timer, etc.). Different SKUs may support different bundle version ranges. The host needs to download the correct bundle at startup, and the version must match what's deployed on the target SKU.

## Feature

SKU-aware extension bundle version resolution. The profile specifies a bundle version range per SKU, which is injected into the host environment so the host auto-downloads the correct bundle.

## How It Works

Three env vars set before spawning the host:

```javascript
// Tell the host it's in a local dev context (enables bundle download)
FUNCTIONS_CORETOOLS_ENVIRONMENT = 'true'

// Where to cache downloaded bundles
'AzureFunctionsJobHost:extensionBundle:downloadPath' = '~/.fnx/bundles/Microsoft.Azure.Functions.ExtensionBundle'

// SKU-specific version range override (clamped by maxExtensionBundleVersion)
'AzureFunctionsJobHost:extensionBundle:version' = '[4.22.*, 4.99.1)'  // from profile, upper-bounded
```

### Bundle Version Capping

Not every host version supports every bundle version. A host at `4.1045.200` might not handle bundles newer than `4.25.0`, even if `4.30.0` exists on CDN. The profile's `maxExtensionBundleVersion` field defines the hard ceiling.

**How it works:**
1. Profile defines `extensionBundleVersion: "[4.19.*, 5.0.0)"` (the range the SKU intends)
2. Profile also defines `maxExtensionBundleVersion: "4.25.0"` (the ceiling this host supports)
3. fnx rewrites the range upper bound: `[4.19.*, 5.0.0)` → `[4.19.*, 4.25.1)`
4. The host's bundle resolver now cannot download anything above `4.25.0`

**Why this matters:**
- Extension bundles ship new extension DLLs. A newer bundle may use host APIs that don't exist in an older host, causing runtime failures.
- Without capping, `[4.19.*, 5.0.0)` would let the host grab `4.30.0` even on a host that only supports up to `4.25.0`.
- The cap is set per-SKU by the release pipeline based on validated compatibility.

The host handles all bundle resolution, version matching, download, and extraction:

1. Reads `extensionBundle` from `host.json`
2. Checks `downloadPath` for existing bundles
3. Fetches `index.json` from Azure CDN to find best matching version
4. Downloads `{id}.{version}_any-any.zip`
5. Extracts to `downloadPath/{version}/`
6. Loads extensions from `bin/`

## Bundle Cache

```
~/.fnx/bundles/
└── Microsoft.Azure.Functions.ExtensionBundle/
    └── 4.30.0/
        ├── bundle.json
        ├── bin/              ← extension DLLs (HTTP, Storage, Timer, etc.)
        ├── StaticContent/
        └── extensions.csproj
```

## Production Requirements

- `maxExtensionBundleVersion` must be set in every SKU profile — validated at deploy time
- Pre-cache bundles for offline support (`--offline` mode)
- Verify bundle version loaded by host matches profile expectation
- Warn if user's `host.json` bundle range exceeds `maxExtensionBundleVersion`
- Support custom bundle IDs (not just `Microsoft.Azure.Functions.ExtensionBundle`)
- Log bundle version in startup banner for visibility
