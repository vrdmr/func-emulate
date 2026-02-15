# F2: Host Version Manager

**Status:** ✅ POC validated  
**PRD Section:** 6.1, 6.6  
**Source:** `fnx/lib/host-manager.js`

## Problem

Core Tools v4 bundles a single host version (~300MB). Changing the host version requires reinstalling Core Tools. There's no way to run different host versions side-by-side.

## Feature

Download, cache, and launch self-contained host binaries per-SKU. Each host version is a standalone .NET app that can run independently without Core Tools DI injection.

## Architecture

```
~/.fnx/hosts/
├── 4.1047.100/                  ← Flex (newest)
│   ├── Microsoft.Azure.WebJobs.Script.WebHost    ← native executable
│   └── [.NET runtime + host DLLs]
├── 4.1045.200/                  ← Windows Consumption
│   └── ...
└── 4.1044.400/                  ← Linux Consumption (oldest)
    └── ...
```

## Flow

1. **Check cache** — `~/.fnx/hosts/{version}/{hostExeName}` exists?
2. **Resolve platform RID** — detect OS + arch → `osx-arm64`, `linux-x64`, `win-x64`, etc.
3. **Download** — Fetch zip from `hostPackageUrl[rid]` in profile
4. **Extract** — `unzip` (Unix) or `Expand-Archive` (Windows)
5. **Set permissions** — `chmod 755` on host executable (Unix)
6. **Patch worker configs** — Rewrite `worker.config.json` for correct Python path
7. **Return host directory** — Caller spawns host from this path

## Platform-Specific Builds (RIDs)

The host is a self-contained .NET application — it includes the .NET runtime, all managed DLLs, and a native executable compiled for a specific OS + architecture combination. This is why the host binary is ~200MB and must be downloaded per-platform.

| RID | Host Executable Name | Size | Notes |
|-----|---------------------|------|-------|
| `osx-arm64` | `Microsoft.Azure.WebJobs.Script.WebHost` | ~200MB | Apple Silicon native |
| `osx-x64` | `Microsoft.Azure.WebJobs.Script.WebHost` | ~200MB | Intel Mac |
| `linux-x64` | `Microsoft.Azure.WebJobs.Script.WebHost` | ~200MB | Most Linux/WSL/CI |
| `win-x64` | `Microsoft.Azure.WebJobs.Script.WebHost.exe` | ~200MB | Windows (`.exe` suffix) |
| `linux-arm64` | `Microsoft.Azure.WebJobs.Script.WebHost` | ~200MB | 🔮 Future (Graviton/Ampere) |
| `win-arm64` | `Microsoft.Azure.WebJobs.Script.WebHost.exe` | ~200MB | 🔮 Future (ARM laptops) |

**Key distinction**: Host binaries are platform-specific (one zip per RID). Extension bundles (F3) are platform-independent (`any-any` managed code). This means:
- Switching SKUs on the same machine shares no host cache (different versions)
- Switching machines (e.g., Mac → Linux) requires re-downloading the host (different RID)
- Extension bundles are shared across all platforms and only depend on version

### RID Detection

```javascript
function getPlatformRid() {
  const osMap  = { darwin: 'osx', linux: 'linux', win32: 'win' };
  const cpuMap = { x64: 'x64', arm64: 'arm64' };
  return `${osMap[os.platform()]}-${cpuMap[os.arch()]}`;
}
```

If a user's RID is not in the profile's `hostPackageUrl`, fnx errors:
```
Error: No host package for linux-arm64. Available: linux-x64, osx-x64, osx-arm64, win-x64
```

## Host Build Source

Host binaries are built from `azure-functions-host` repo via `dotnet publish --self-contained`. Each release tag produces a zip per platform RID.

## Production Requirements

- Multi-platform builds: all RIDs in the table above (4 POC + 2 future)
- CI workflow to build all 5 host tags × 4+ platforms = 20+ zips
- `fnx cache clean` command to remove unused cached versions
- Disk space management (~200MB per host version per RID)
- Download progress bar with resumable downloads
- Integrity verification (checksum/signature on host zips)
- Atomic downloads: write to temp file, rename on success (prevents corrupt cache from interrupted downloads)
