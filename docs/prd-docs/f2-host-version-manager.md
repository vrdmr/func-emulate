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
2. **Resolve platform RID** — `osx-arm64`, `linux-x64`, `win-x64`, etc.
3. **Download** — Fetch zip from `hostPackageUrl[rid]` in profile
4. **Extract** — `unzip` (Unix) or `Expand-Archive` (Windows)
5. **Set permissions** — `chmod 755` on host executable (Unix)
6. **Patch worker configs** — Rewrite `worker.config.json` for correct Python path
7. **Return host directory** — Caller spawns host from this path

## Host Build Source

Host binaries are built from `azure-functions-host` repo via `dotnet publish --self-contained`. Each release tag produces a zip per platform RID.

## Production Requirements

- Multi-platform builds: `linux-x64`, `osx-x64`, `osx-arm64`, `win-x64`
- CI workflow to build all 5 tags × 4 platforms = 20 zips
- `func host cleanup` command to remove unused cached versions
- Disk space management (~200MB per version)
- Download progress bar with resumable downloads
- Integrity verification (checksum/signature)
