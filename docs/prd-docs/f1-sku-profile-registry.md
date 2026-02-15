# F1: SKU Profile Registry

**Status:** ✅ POC validated  
**PRD Section:** 6.3  
**Source:** `fnx/lib/profile-resolver.js`, `fnx/profiles/sku-profiles.json`

## Problem

Different Azure Functions SKUs run different host versions on different cadences. Developers have no machine-readable way to know which host version is deployed on their target SKU.

## Feature

A CDN-hosted JSON registry (`sku-profiles.json`) that maps each SKU to its current host version, extension bundle version, and status. The CLI fetches this at startup to determine what to download and run.

## Schema

```json
{
  "schemaVersion": "1.0",
  "profiles": {
    "<sku-key>": {
      "displayName": "Human-readable name",
      "hostVersion": "4.1047.100",
      "hostGitTag": "v4.1047.100",
      "extensionBundleVersion": "[4.22.*, 5.0.0)",
      "maxExtensionBundleVersion": "4.99.0",
      "hostPackageUrl": { "<rid>": "<download-url>" },
      "status": "GA | deprecated",
      "retirementDate": "2028-09-30",
      "notes": "..."
    }
  },
  "updatedAt": "ISO-8601 timestamp"
}
```

### `hostPackageUrl` — Platform RIDs

The `hostPackageUrl` map uses .NET Runtime Identifiers (RIDs) as keys. Each key maps to a platform-specific self-contained host zip. The CLI detects the user's OS + architecture at runtime and selects the correct download.

| RID | OS | Architecture | Status | Notes |
|-----|-----|-------------|--------|-------|
| `osx-arm64` | macOS | Apple Silicon (M1–M4) | ✅ POC | Most common Mac dev machine |
| `osx-x64` | macOS | Intel | ✅ POC | Older Macs, some CI runners |
| `linux-x64` | Linux | x64 | ✅ POC | WSL, CI/CD, containers, devboxes |
| `win-x64` | Windows | x64 | ✅ POC | Standard Windows dev machine |
| `linux-arm64` | Linux | ARM64 | 🔮 Future | Graviton, Ampere, Raspberry Pi |
| `win-arm64` | Windows | ARM64 | 🔮 Future | Surface Pro X, Snapdragon laptops |

RID detection:
```javascript
os.platform() + os.arch()  →  RID
// darwin + arm64  →  osx-arm64
// linux  + x64    →  linux-x64
// win32  + x64    →  win-x64
```

Every profile MUST include all actively supported RIDs. If a user's platform is missing, fnx errors with available RIDs listed.

## SKUs

| Key | Display Name | Cadence |
|-----|-------------|---------|
| `flex` | Flex Consumption | ~2 weeks (newest) |
| `linux-premium` | Linux Premium (EP) | Aligned with Flex |
| `windows-consumption` | Windows Consumption | ~3 months |
| `windows-dedicated` | Windows Dedicated (ASP) | ~3 months |
| `linux-consumption` | Linux Consumption | ~3x/year (deprecated) |

## Resolution Chain

1. `--profiles` flag (URL, file path, or inline JSON)
2. `FUNC_PROFILES_URL` env var
3. CDN endpoint (production: `functionscdn.azureedge.net`; POC: GitHub raw)
4. Local cache (`~/.fnx/profiles/sku-profiles.json`, 1-hour TTL)
5. Stale cache (any age)
6. Bundled fallback (`fnx/profiles/sku-profiles.json`)

## Production Requirements

- Registry updated automatically by each SKU's release pipeline
- Versioned schema (`schemaVersion`) for forward compatibility
- CDN cache headers for efficient polling
- Consider adding `features` array for future template filtering
