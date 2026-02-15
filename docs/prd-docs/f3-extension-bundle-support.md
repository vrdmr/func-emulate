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

// SKU-specific version range override
'AzureFunctionsJobHost:extensionBundle:version' = '[4.22.*, 5.0.0)'  // from profile
```

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

- Pre-cache bundles for offline support (`--offline` mode)
- Verify bundle version loaded by host matches profile expectation
- Support custom bundle IDs (not just `Microsoft.Azure.Functions.ExtensionBundle`)
- Log bundle version in startup banner for visibility
