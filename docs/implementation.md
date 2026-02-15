# Implementation: SKU-Aware Core Tools — JS CLI POC

## Goal

Build a lightweight **JavaScript CLI** (`fnx`) that proves the core concept: download the right self-contained Functions Host for a target SKU and launch it locally. Scoped to **non-dotnet languages only** (Node.js, Python, Java, PowerShell).

This is NOT a replacement for `func` — it's a POC to validate that:
1. A self-contained host can be launched as a standalone process.
2. `--sku` profile resolution works end-to-end.
3. Language workers (Node/Python/Java/PS) start and serve functions correctly.
4. The architecture from the PRD is viable before investing in C# changes.

### Why Non-Dotnet Only

- For non-dotnet languages, the host is a pure **HTTP server + trigger listener**. The customer's code runs in a separate **language worker process** spawned by the host via gRPC. There's zero .NET DI coupling between customer code and host.
- The CLI's `CliAuthenticationHandler` (which bypasses function key auth) is NOT needed if HTTP triggers use `"authLevel": "anonymous"` — which most local dev samples already do.
- No need to solve `DotNetIsolatedDebugConfigureBuilder` or `UserSecretsConfigurationBuilder` for this POC.
- Dotnet in-proc and dotnet-isolated have deeper coupling (debug attach, user secrets, CoreToolsHost/AppLoader chain) that can be tackled after POC validation.

### Process Tree (POC)

```
fnx start --sku flex --scriptroot ./my-node-app
  │
  ├── Fetches sku-profiles.json from CDN server (http://localhost:4566/api/profiles)
  ├── Resolves: flex → host 4.1047.100, bundle [4.22.*, 5.0.0)
  ├── Downloads self-contained host zip from CDN server (if not cached)
  ├── Extracts to ~/.fnx/hosts/4.1047.100/
  ├── Spawns host as child process:
  │     ~/.fnx/hosts/4.1047.100/Microsoft.Azure.WebJobs.Script.WebHost
  │     with env vars:
  │       AZURE_FUNCTIONS_ENVIRONMENT=Development
  │       AzureWebJobsScriptRoot=/path/to/my-node-app
  │       AzureWebJobsStorage=UseDevelopmentStorage=true
  │       FUNCTIONS_WORKER_RUNTIME=node
  │       AzureFunctionsJobHost__extensionBundle__version=[4.22.*, 5.0.0)
  │
  ├── Host starts → discovers functions → spawns Node.js worker via gRPC
  │
  └── Output forwarded to terminal:
      Functions:
        HttpTrigger1: [GET,POST] http://localhost:7071/api/HttpTrigger1
```

---

## 1. Architecture

```
POC has three components (each can be built independently by a separate agent):

┌─────────────────────────────────────────────────────────────────────────┐
│  AGENT 1: build-hosts.sh                                               │
│  Clones azure-functions-host, builds 5 release tags as self-contained  │
│  Output: hosts/ dir with zips per version per platform                 │
│                                                                        │
│  Host versions built (from real GitHub releases):                      │
│    v4.1047.100  (Jan 2026) ── Flex gets this first                    │
│    v4.1046.100  (Dec 2025)                                            │
│    v4.1045.200  (Nov 2025)                                            │
│    v4.1045.100  (Oct 2025)                                            │
│    v4.1044.400  (Oct 2025) ── oldest, linux-consumption               │
└─────────────┬───────────────────────────────────────────────────────────┘
              │ zips served by
              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  AGENT 2: cdn-server/                                                  │
│  Zero-dep Node.js HTTP server (port 4566)                              │
│                                                                        │
│  GET /api/profiles                                                     │
│    → sku-profiles.json (5 SKUs mapped to 5 real host versions)         │
│                                                                        │
│  GET /hosts/:version/Azure.Functions.Host.:platform.zip                │
│    → serves pre-built host zips from hosts/ directory                  │
│                                                                        │
│  Emulates what the real CDN would serve in production.                 │
└─────────────┬───────────────────────────────────────────────────────────┘
              │ fetched by
              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  AGENT 3: fnx/ + test-node-app/                                   │
│  Node.js CLI (~350 lines, zero deps)                                   │
│                                                                        │
│  fnx start --sku flex --scriptroot ./test-node-app                │
│    1. Fetch profiles from cdn-server (http://localhost:4566)            │
│    2. Resolve flex → host 4.1047.100                                   │
│    3. Download host zip from cdn-server (if not cached)                 │
│    4. Extract to ~/.fnx/hosts/4.1047.100/                         │
│    5. Spawn self-contained host as child process                       │
│    6. Host discovers functions → spawns Node.js worker → serves HTTP   │
└─────────────────────────────────────────────────────────────────────────┘

Directory structure:
new-core-tools/
├── build-hosts.sh                   ← Agent 1: builds hosts from source
├── cdn-server/                      ← Agent 2: dummy CDN
│   ├── server.js                    ← HTTP server (~120 lines)
│   ├── profiles/
│   │   └── sku-profiles.json        ← 5 SKUs → 5 host versions
│   └── hosts/                       ← built host zips go here
│       ├── 4.1047.100/
│       │   └── Azure.Functions.Host.osx-arm64.zip
│       ├── 4.1046.100/
│       │   └── ...
│       └── ...
├── fnx/                        ← Agent 3: CLI
│   ├── bin/fnx
│   ├── lib/
│   │   ├── cli.js
│   │   ├── profile-resolver.js
│   │   ├── host-manager.js
│   │   └── host-launcher.js
│   ├── profiles/
│   │   └── sku-profiles.json        ← bundled fallback
│   └── package.json
└── test-node-app/                   ← Agent 3: test fixture
    ├── host.json
    ├── local.settings.json
    ├── package.json
    └── src/functions/hello.js

Cache directory (populated by fnx at runtime):
~/.fnx/
├── profiles/
│   └── sku-profiles.json            ← cached from cdn-server
└── hosts/
    ├── 4.1047.100/                  ← flex (newest)
    │   ├── Microsoft.Azure.WebJobs.Script.WebHost    ← native executable
    │   └── [all .NET runtime + host DLLs]
    ├── 4.1046.100/                  ← linux-premium
    ├── 4.1045.200/                  ← windows-consumption
    ├── 4.1045.100/                  ← windows-dedicated
    └── 4.1044.400/                  ← linux-consumption (oldest)
```

---

## 2. Where Does the Host Come From? (Deep Dive)

### How Core Tools Gets the Host Today

The host is **not** available as a standalone download. Here's the actual dependency chain:

```
azure-functions-host repo (github.com/Azure/azure-functions-host)
  │
  │  builds & publishes NuGet package (INTERNAL ADO feed, not public NuGet):
  │  Microsoft.Azure.WebJobs.Script.WebHost v4.1045.200
  │  Feed: https://azfunc.pkgs.visualstudio.com/.../AzureFunctions/nuget/v3/index.json
  │
  ▼
azure-functions-core-tools repo (github.com/Azure/azure-functions-core-tools)
  │
  │  Azure.Functions.Cli.csproj references the WebHost NuGet package:
  │  <PackageVersion Include="Microsoft.Azure.WebJobs.Script.WebHost" Version="4.1045.200" />
  │
  │  Build pipeline produces three artifacts:
  │  ├── func-cli-default/    ← CLI + WebHost DLLs (out-of-proc), compiled together
  │  ├── func-cli-inproc/     ← in-proc6/ and in-proc8/ subdirectories
  │  └── func-cli-host/       ← CoreToolsHost native executable (win/linux)
  │
  │  ArtifactAssembler merges all three into one zip per platform
  │
  ▼
CDN: https://cdn.functions.azure.com/public/4.0.{buildId}/Azure.Functions.Cli.{platform}.{version}.zip
     (~359MB monolithic zip containing EVERYTHING)
     This is what `npm install -g azure-functions-core-tools@4` downloads.
```

**Key facts:**
- `Microsoft.Azure.WebJobs.Script.WebHost` NuGet is on an **internal** Azure DevOps feed, not public NuGet.org
- The host DLLs are compiled **into** `Azure.Functions.Cli.dll` as NuGet dependencies — they're not a separate binary
- Language workers (Node, Python, Java, PowerShell) are also NuGet packages pulled during build
- There is **no standalone host zip** published anywhere today

### Three Options for the POC

#### Option A: Build Host from Source (Recommended for POC)

The `azure-functions-host` repo is public. The WebHost is a standard ASP.NET Core app that can be published as self-contained:

```bash
git clone https://github.com/Azure/azure-functions-host.git
cd azure-functions-host

# Publish as self-contained — produces a native executable + all DLLs
dotnet publish src/WebJobs.Script.WebHost/WebJobs.Script.WebHost.csproj \
  -c Release \
  -r osx-arm64 \
  --self-contained \
  -o ./host-output

# Result: ~200MB directory with:
#   Microsoft.Azure.WebJobs.Script.WebHost  ← native executable
#   Microsoft.Azure.WebJobs.Script.WebHost.dll
#   [hundreds of .NET runtime + host DLLs]
```

The csproj (`src/WebJobs.Script.WebHost/WebJobs.Script.WebHost.csproj`) targets `net8.0` and already defines `RuntimeIdentifiers: win-x86;win-x64;linux-x64`. We'd add `osx-arm64` and `osx-x64`.

**For the POC**: Build two versions of the host from two different tags/commits of `azure-functions-host` to simulate the version difference between SKUs. Place them in the cache manually.

#### Option B: Extract from Existing CDN Zip

The monolithic Core Tools zip is publicly accessible:
```
https://cdn.functions.azure.com/public/4.0.226050/Azure.Functions.Cli.osx-arm64.4.0.7512.zip
```

The WebHost DLLs are at the **root** of this zip (alongside `func` CLI). We could:
1. Download the full ~359MB zip
2. Extract it
3. Run `Microsoft.Azure.WebJobs.Script.WebHost` from the extracted directory

**Problem**: The host DLLs and CLI DLLs are mixed together in the root. There's no clean separation. Also, the WebHost isn't compiled as a self-contained app here — it depends on the .NET runtime being present (via the bundled `func` native host). This approach is messy.

#### Option C: Use Internal NuGet Package

The `Microsoft.Azure.WebJobs.Script.WebHost` NuGet package is on the internal `AzureFunctions` ADO feed. If you have access:

```bash
# This is a NuGet package, not a standalone app — it contains DLLs only, no runtime
dotnet restore --source https://azfunc.pkgs.visualstudio.com/.../AzureFunctions/nuget/v3/index.json
```

**Problem**: This is a library package, not a self-contained app. You'd need to create a wrapper project that references it and publishes as self-contained. Essentially the same as Option A but using the NuGet package instead of building from source.

### Recommended POC Approach: Option A

```bash
# 1. Clone host repo, checkout a specific version tag
git clone https://github.com/Azure/azure-functions-host.git
cd azure-functions-host

# 2. Build self-contained for your platform
dotnet publish src/WebJobs.Script.WebHost/WebJobs.Script.WebHost.csproj \
  -c Release \
  -r osx-arm64 \
  --self-contained \
  -o ./host-v49

# 3. Place in cache (simulating what the POC CLI would download)
mkdir -p ~/.fnx/hosts/4.1049.2.20887
cp -r ./host-v49/* ~/.fnx/hosts/4.1049.2.20887/

# 4. For the "older" SKU, checkout an older tag and rebuild
git checkout v4.1046.x  # or whatever tag
dotnet publish src/WebJobs.Script.WebHost/WebJobs.Script.WebHost.csproj \
  -c Release \
  -r osx-arm64 \
  --self-contained \
  -o ./host-v46

mkdir -p ~/.fnx/hosts/4.1046.1.20845
cp -r ./host-v46/* ~/.fnx/hosts/4.1046.1.20845/
```

### What Production Would Need (Post-POC)

For the real implementation, the release pipeline would add a step after building the host:

```yaml
# In azure-functions-host CI/CD pipeline:
- task: DotNetCoreCLI@2
  inputs:
    command: publish
    projects: src/WebJobs.Script.WebHost/WebJobs.Script.WebHost.csproj
    arguments: >
      -c Release
      -r $(rid)
      --self-contained
      -o $(Build.ArtifactStagingDirectory)/host-$(rid)

- task: ArchiveFiles@2
  inputs:
    rootFolderOrFile: $(Build.ArtifactStagingDirectory)/host-$(rid)
    archiveFile: $(Build.ArtifactStagingDirectory)/Azure.Functions.Host.$(rid).$(hostVersion).zip

# Upload to CDN alongside existing Core Tools zips
- task: AzureBlobUpload@1
  inputs:
    containerName: public
    blobPrefix: hosts/$(hostVersion)/
    sourceFolder: $(Build.ArtifactStagingDirectory)
```

This produces the URLs referenced in `sku-profiles.json`:
```
https://functionscdn.azureedge.net/public/hosts/4.1049.2.20887/Azure.Functions.Host.osx-arm64.zip
```

---

## 3. SKU Profile Registry

### `sku-profiles.json` — 5 Real Host Versions

Uses real release tags from `azure-functions-host` GitHub releases. The `hostPackageUrl` fields point at the dummy CDN server (`localhost:4566`), which serves the pre-built host zips.

This mapping shows the **actual version skew** that exists across SKUs — the core problem this POC solves:

```json
{
  "schemaVersion": "1.0",
  "profiles": {
    "flex": {
      "displayName": "Flex Consumption",
      "hostVersion": "4.1047.100",
      "hostGitTag": "v4.1047.100",
      "extensionBundleVersion": "[4.22.*, 5.0.0)",
      "hostPackageUrl": {
        "linux-x64": "http://localhost:4566/hosts/4.1047.100/Azure.Functions.Host.linux-x64.zip",
        "osx-x64": "http://localhost:4566/hosts/4.1047.100/Azure.Functions.Host.osx-x64.zip",
        "osx-arm64": "http://localhost:4566/hosts/4.1047.100/Azure.Functions.Host.osx-arm64.zip",
        "win-x64": "http://localhost:4566/hosts/4.1047.100/Azure.Functions.Host.win-x64.zip"
      },
      "status": "GA",
      "notes": "Newest host — Flex gets bits first (2-week cadence)"
    },
    "linux-premium": {
      "displayName": "Linux Premium (EP)",
      "hostVersion": "4.1046.100",
      "hostGitTag": "v4.1046.100",
      "extensionBundleVersion": "[4.21.*, 5.0.0)",
      "hostPackageUrl": {
        "linux-x64": "http://localhost:4566/hosts/4.1046.100/Azure.Functions.Host.linux-x64.zip",
        "osx-x64": "http://localhost:4566/hosts/4.1046.100/Azure.Functions.Host.osx-x64.zip",
        "osx-arm64": "http://localhost:4566/hosts/4.1046.100/Azure.Functions.Host.osx-arm64.zip",
        "win-x64": "http://localhost:4566/hosts/4.1046.100/Azure.Functions.Host.win-x64.zip"
      },
      "status": "GA",
      "notes": "1 version behind Flex — aligned cadence but slightly delayed"
    },
    "windows-consumption": {
      "displayName": "Windows Consumption",
      "hostVersion": "4.1045.200",
      "hostGitTag": "v4.1045.200",
      "extensionBundleVersion": "[4.19.*, 5.0.0)",
      "hostPackageUrl": {
        "linux-x64": "http://localhost:4566/hosts/4.1045.200/Azure.Functions.Host.linux-x64.zip",
        "osx-x64": "http://localhost:4566/hosts/4.1045.200/Azure.Functions.Host.osx-x64.zip",
        "osx-arm64": "http://localhost:4566/hosts/4.1045.200/Azure.Functions.Host.osx-arm64.zip",
        "win-x64": "http://localhost:4566/hosts/4.1045.200/Azure.Functions.Host.win-x64.zip"
      },
      "status": "GA",
      "notes": "~3 month cadence — 2 versions behind Flex"
    },
    "windows-dedicated": {
      "displayName": "Windows Dedicated (ASP)",
      "hostVersion": "4.1045.100",
      "hostGitTag": "v4.1045.100",
      "extensionBundleVersion": "[4.19.*, 5.0.0)",
      "hostPackageUrl": {
        "linux-x64": "http://localhost:4566/hosts/4.1045.100/Azure.Functions.Host.linux-x64.zip",
        "osx-x64": "http://localhost:4566/hosts/4.1045.100/Azure.Functions.Host.osx-x64.zip",
        "osx-arm64": "http://localhost:4566/hosts/4.1045.100/Azure.Functions.Host.osx-arm64.zip",
        "win-x64": "http://localhost:4566/hosts/4.1045.100/Azure.Functions.Host.win-x64.zip"
      },
      "status": "GA",
      "notes": "Similar cadence to Windows Consumption"
    },
    "linux-consumption": {
      "displayName": "Linux Consumption",
      "hostVersion": "4.1044.400",
      "hostGitTag": "v4.1044.400",
      "extensionBundleVersion": "[4.18.*, 5.0.0)",
      "hostPackageUrl": {
        "linux-x64": "http://localhost:4566/hosts/4.1044.400/Azure.Functions.Host.linux-x64.zip",
        "osx-x64": "http://localhost:4566/hosts/4.1044.400/Azure.Functions.Host.osx-x64.zip",
        "osx-arm64": "http://localhost:4566/hosts/4.1044.400/Azure.Functions.Host.osx-arm64.zip",
        "win-x64": "http://localhost:4566/hosts/4.1044.400/Azure.Functions.Host.win-x64.zip"
      },
      "status": "deprecated",
      "retirementDate": "2028-09-30",
      "notes": "Deprecated — oldest host, ~3x/year releases"
    }
  },
  "updatedAt": "2026-02-14T00:00:00Z"
}
```

**Key observation**: The version spread from newest (4.1047.100 on Flex) to oldest (4.1044.400 on Linux Consumption) is 3 minor versions — this is the version skew gap that causes "works locally, breaks in cloud."

---

## 4. Agent 1: Host Builder (`build-hosts.sh`)

A shell script that clones `azure-functions-host` and builds self-contained hosts from 5 release tags. Each build produces a native executable + all runtime DLLs, zipped per-platform.

### Prerequisites

- .NET 8 SDK (`8.0.101` or later, with `rollForward: latestFeature` — matches host's `global.json`)
- ~10GB disk space (5 builds × ~200MB output + source + intermediate)
- ~15-25 minutes total build time (3-5 min per version)

### `build-hosts.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────
HOST_REPO="https://github.com/Azure/azure-functions-host.git"
HOST_DIR="./azure-functions-host"
OUTPUT_DIR="./cdn-server/hosts"

# The 5 release tags to build (from GitHub releases, showing real version skew)
TAGS=(
  "v4.1047.100"   # Flex Consumption (newest)
  "v4.1046.100"   # Linux Premium
  "v4.1045.200"   # Windows Consumption
  "v4.1045.100"   # Windows Dedicated
  "v4.1044.400"   # Linux Consumption (oldest, deprecated)
)

# Detect platform RID
detect_rid() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Darwin) os="osx" ;;
    Linux)  os="linux" ;;
    *)      echo "Unsupported OS: $os"; exit 1 ;;
  esac
  case "$arch" in
    x86_64)  arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *)       echo "Unsupported arch: $arch"; exit 1 ;;
  esac
  echo "${os}-${arch}"
}

RID=$(detect_rid)
echo "Building for platform: $RID"
echo "Tags to build: ${TAGS[*]}"
echo ""

# ─── Clone (if needed) ──────────────────────────────────────────────
if [ ! -d "$HOST_DIR" ]; then
  echo "Cloning azure-functions-host..."
  git clone "$HOST_REPO" "$HOST_DIR"
else
  echo "Using existing clone at $HOST_DIR"
  cd "$HOST_DIR" && git fetch --tags && cd -
fi

# ─── Build each tag ─────────────────────────────────────────────────
for tag in "${TAGS[@]}"; do
  version="${tag#v}"  # strip leading 'v' → "4.1047.100"
  zip_dir="$OUTPUT_DIR/$version"
  zip_file="$zip_dir/Azure.Functions.Host.${RID}.zip"

  if [ -f "$zip_file" ]; then
    echo "[$version] Already built, skipping."
    continue
  fi

  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "Building host $version (tag: $tag) for $RID"
  echo "═══════════════════════════════════════════════════"

  cd "$HOST_DIR"
  git checkout "$tag" --quiet

  # Build self-contained (disable ReadyToRun for cross-platform compat)
  dotnet publish src/WebJobs.Script.WebHost/WebJobs.Script.WebHost.csproj \
    -c Release \
    -r "$RID" \
    --self-contained \
    -p:PublishReadyToRun=false \
    -o "./build-output/$version" \
    --verbosity quiet

  # Verify the native executable exists
  local exe_name="Microsoft.Azure.WebJobs.Script.WebHost"
  if [ ! -f "./build-output/$version/$exe_name" ]; then
    echo "ERROR: Build did not produce $exe_name"
    exit 1
  fi

  # Zip it
  cd -
  mkdir -p "$zip_dir"
  cd "$HOST_DIR/build-output/$version"
  zip -r -q "$OLDPWD/$zip_file" .
  cd "$OLDPWD"

  echo "[$version] Built and zipped → $zip_file"
done

echo ""
echo "════════════════════════════════════"
echo "All host builds complete!"
echo "Output: $OUTPUT_DIR/"
ls -la "$OUTPUT_DIR"/*/Azure.Functions.Host.*.zip 2>/dev/null || echo "(no zips found)"
echo "════════════════════════════════════"
```

### Build Output

After running, `cdn-server/hosts/` contains:

```
cdn-server/hosts/
├── 4.1047.100/
│   └── Azure.Functions.Host.osx-arm64.zip   (~200MB)
├── 4.1046.100/
│   └── Azure.Functions.Host.osx-arm64.zip
├── 4.1045.200/
│   └── Azure.Functions.Host.osx-arm64.zip
├── 4.1045.100/
│   └── Azure.Functions.Host.osx-arm64.zip
└── 4.1044.400/
    └── Azure.Functions.Host.osx-arm64.zip
```

### Known Issues

1. **`PublishReadyToRun=false`**: The host csproj enables ReadyToRun by default, which requires crossgen2 for the target platform. This fails for `osx-arm64` since it's not in the csproj's `RuntimeIdentifiers`. Disabling it works — just slightly slower cold start.
2. **Build warnings**: Some NuGet packages may warn about platform compatibility. These are non-fatal.
3. **Internal NuGet feeds**: If the build fails with restore errors for `Microsoft.Azure.AppService.Middleware.Functions` or similar, these may be on an internal feed. Workaround: add the internal feed URL or build with `--no-restore` after manually restoring.

---

## 5. Agent 2: Dummy CDN Server (`cdn-server/`)

A zero-dependency Node.js HTTP server that emulates the CDN. Serves two endpoints: the profile registry and host zip downloads.

### `cdn-server/server.js`

```javascript
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = parseInt(process.env.CDN_PORT || '4566', 10);
const PROFILES_PATH = join(__dirname, 'profiles', 'sku-profiles.json');
const HOSTS_DIR = join(__dirname, 'hosts');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  console.log(`${new Date().toISOString()} ${req.method} ${path}`);

  try {
    // GET /api/profiles → serve sku-profiles.json
    if (path === '/api/profiles') {
      const json = await readFile(PROFILES_PATH, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(json);
      return;
    }

    // GET /hosts/:version/:filename → serve host zip
    const hostMatch = path.match(/^\/hosts\/([^/]+)\/(.+\.zip)$/);
    if (hostMatch) {
      const [, version, filename] = hostMatch;
      const filePath = resolve(join(HOSTS_DIR, version, filename));

      // Security: ensure path is within HOSTS_DIR
      if (!filePath.startsWith(resolve(HOSTS_DIR))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      try {
        const fileStat = await stat(filePath);
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Length': fileStat.size,
          'Content-Disposition': `attachment; filename="${filename}"`,
        });
        createReadStream(filePath).pipe(res);
      } catch {
        res.writeHead(404);
        res.end(`Host package not found: ${version}/${filename}\n` +
          `Expected at: ${filePath}\n` +
          `Run build-hosts.sh to build host packages.`);
      }
      return;
    }

    // GET / → health check / listing
    if (path === '/') {
      const profiles = JSON.parse(await readFile(PROFILES_PATH, 'utf-8'));
      const skus = Object.entries(profiles.profiles).map(([key, p]) =>
        `  ${key.padEnd(24)} → host ${p.hostVersion} (${p.status})`
      ).join('\n');

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(
        `fnx CDN Server\n` +
        `────────────────────────────────────────\n` +
        `Endpoints:\n` +
        `  GET /api/profiles          → SKU profiles JSON\n` +
        `  GET /hosts/:ver/:file.zip  → Host package download\n\n` +
        `Available profiles:\n${skus}\n\n` +
        `Updated: ${profiles.updatedAt}\n`
      );
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (err) {
    console.error(`Error: ${err.message}`);
    res.writeHead(500);
    res.end(`Internal error: ${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`╔════════════════════════════════════════════╗`);
  console.log(`║  fnx CDN Server                      ║`);
  console.log(`║  http://localhost:${PORT}                    ║`);
  console.log(`║                                            ║`);
  console.log(`║  GET /api/profiles     → SKU profiles      ║`);
  console.log(`║  GET /hosts/:v/:f.zip  → Host packages     ║`);
  console.log(`╚════════════════════════════════════════════╝`);
});
```

### `cdn-server/package.json`

```json
{
  "name": "fnx-cdn-server",
  "version": "0.1.0",
  "type": "module",
  "description": "Dummy CDN server for fnx POC",
  "scripts": {
    "start": "node server.js"
  },
  "engines": {
    "node": ">=18"
  }
}
```

### How the CDN Server Fits In

```
Developer runs: node cdn-server/server.js
                      │
                      ▼
                http://localhost:4566
                      │
    ┌─────────────────┼─────────────────────────┐
    │                 │                          │
    ▼                 ▼                          ▼
/api/profiles    /hosts/4.1047.100/         /hosts/4.1044.400/
    │            Azure.Functions.Host.      Azure.Functions.Host.
    │            osx-arm64.zip             osx-arm64.zip
    │                 │                          │
    ▼                 ▼                          ▼
fnx reads   fnx downloads        fnx downloads
sku-profiles.json  for --sku flex           for --sku linux-consumption
```

In production, `localhost:4566` would be replaced by `https://functionscdn.azureedge.net` — the same CDN already used for Core Tools zip downloads. The profiles JSON and host zips would be published as part of the release pipeline.

---

## 6. Agent 3: fnx CLI + Test App

### 6.1 `package.json`

```json
{
  "name": "fnx",
  "version": "0.1.0",
  "type": "module",
  "description": "POC: SKU-aware Azure Functions local emulator",
  "bin": {
    "fnx": "./bin/fnx"
  },
  "dependencies": {},
  "engines": {
    "node": ">=18"
  }
}
```

Zero dependencies — Node.js 18+ has built-in `fetch`, `fs/promises`, `child_process`, and `node:stream`. The POC should be runnable with just `node`.

### 6.2 `bin/fnx`

```javascript
#!/usr/bin/env node
import { main } from '../lib/cli.js';
main(process.argv.slice(2));
```

### 6.3 `lib/cli.js` — Main Orchestration

```javascript
import { resolve as resolvePath } from 'node:path';
import { resolveProfile, listProfiles } from './profile-resolver.js';
import { ensureHost } from './host-manager.js';
import { launchHost } from './host-launcher.js';

export async function main(args) {
  const cmd = args[0];

  if (cmd !== 'start') {
    console.log('Usage: fnx start --sku <sku-name> [--scriptroot <path>] [--port <port>]');
    console.log('       fnx start --sku list');
    process.exit(1);
  }

  const sku = getFlag(args, '--sku');
  const scriptRoot = getFlag(args, '--scriptroot') || process.cwd();
  const port = getFlag(args, '--port') || '7071';

  if (!sku) {
    console.error('Error: --sku is required. Use --sku list to see available profiles.');
    process.exit(1);
  }

  if (sku === 'list') {
    await listProfiles();
    return;
  }

  // 1. Resolve profile
  console.log(`Resolving SKU profile: ${sku}...`);
  const profile = await resolveProfile(sku);
  console.log(`  Target SKU:        ${profile.displayName}`);
  console.log(`  Host Version:      ${profile.hostVersion}`);
  console.log(`  Extension Bundle:  ${profile.extensionBundleVersion}`);
  console.log();

  // 2. Ensure host is downloaded
  const hostDir = await ensureHost(profile);
  console.log(`  Host path:         ${hostDir}`);
  console.log();

  // 3. Read local.settings.json for worker runtime + app settings
  const localSettings = await readLocalSettings(scriptRoot);
  const workerRuntime = localSettings?.Values?.FUNCTIONS_WORKER_RUNTIME;

  if (!workerRuntime) {
    console.error('Error: FUNCTIONS_WORKER_RUNTIME not set in local.settings.json');
    process.exit(1);
  }

  const dotnetRuntimes = ['dotnet', 'dotnet-isolated'];
  if (dotnetRuntimes.includes(workerRuntime)) {
    console.error(`Error: This POC only supports non-dotnet runtimes (node, python, java, powershell).`);
    console.error(`       Got: ${workerRuntime}`);
    process.exit(1);
  }

  // 4. Launch host
  await launchHost(hostDir, {
    scriptRoot: resolvePath(scriptRoot),
    port,
    workerRuntime,
    extensionBundleVersion: profile.extensionBundleVersion,
    localSettings,
    profile,
  });
}

function getFlag(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

async function readLocalSettings(scriptRoot) {
  const { readFile } = await import('node:fs/promises');
  const settingsPath = resolvePath(scriptRoot, 'local.settings.json');
  try {
    return JSON.parse(await readFile(settingsPath, 'utf-8'));
  } catch {
    return null;
  }
}
```

### 6.4 `lib/profile-resolver.js` — Fetch and Cache Profiles

```javascript
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CACHE_DIR = join(homedir(), '.fnx', 'profiles');
const CACHE_FILE = join(CACHE_DIR, 'sku-profiles.json');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// For POC: default to local dummy CDN server
const CDN_URL = process.env.FUNC_EMU_PROFILES_URL ||
  'http://localhost:4566/api/profiles';

// Bundled fallback (shipped with the POC)
const BUNDLED_PROFILES_PATH = new URL('../profiles/sku-profiles.json', import.meta.url).pathname;

async function fetchRegistry() {
  // 1. Try cache (if fresh)
  try {
    const cacheStat = await stat(CACHE_FILE);
    if (Date.now() - cacheStat.mtimeMs < CACHE_TTL_MS) {
      return JSON.parse(await readFile(CACHE_FILE, 'utf-8'));
    }
  } catch { /* no cache or stale */ }

  // 2. Try CDN
  try {
    const res = await fetch(CDN_URL);
    if (res.ok) {
      const json = await res.text();
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(CACHE_FILE, json);
      return JSON.parse(json);
    }
  } catch { /* CDN unreachable */ }

  // 3. Try stale cache
  try {
    return JSON.parse(await readFile(CACHE_FILE, 'utf-8'));
  } catch { /* no cache at all */ }

  // 4. Fall back to bundled profiles
  try {
    return JSON.parse(await readFile(BUNDLED_PROFILES_PATH, 'utf-8'));
  } catch {
    throw new Error('Cannot load SKU profiles: CDN unreachable, no cache, no bundled profiles.');
  }
}

export async function resolveProfile(skuName) {
  const registry = await fetchRegistry();
  const profile = registry.profiles[skuName];
  if (!profile) {
    const valid = Object.keys(registry.profiles).join(', ');
    throw new Error(`Unknown SKU '${skuName}'. Available: ${valid}`);
  }
  return profile;
}

export async function listProfiles() {
  const registry = await fetchRegistry();
  console.log('Available SKU profiles:\n');
  console.log('  SKU                     Host Version         Bundle Version    Status');
  console.log('  ─────────────────────── ──────────────────── ───────────────── ──────────');
  for (const [key, p] of Object.entries(registry.profiles)) {
    const sku = key.padEnd(24);
    const host = p.hostVersion.padEnd(21);
    const bundle = p.extensionBundleVersion.padEnd(18);
    console.log(`  ${sku}${host}${bundle}${p.status}`);
  }
  console.log(`\n  Last updated: ${registry.updatedAt}`);
}
```

### 6.5 `lib/host-manager.js` — Download and Cache Host Packages

```javascript
import { existsSync } from 'node:fs';
import { mkdir, chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { createWriteStream } from 'node:fs';
import { execSync } from 'node:child_process';
import { arch } from 'node:os';

const HOST_CACHE = join(homedir(), '.fnx', 'hosts');

function getPlatformRid() {
  const os = platform();
  const cpu = arch();
  const osMap = { darwin: 'osx', linux: 'linux', win32: 'win' };
  const cpuMap = { x64: 'x64', arm64: 'arm64' };
  return `${osMap[os] || os}-${cpuMap[cpu] || cpu}`;
}

function getHostExeName() {
  return platform() === 'win32'
    ? 'Microsoft.Azure.WebJobs.Script.WebHost.exe'
    : 'Microsoft.Azure.WebJobs.Script.WebHost';
}

export async function ensureHost(profile) {
  const hostDir = join(HOST_CACHE, profile.hostVersion);
  const hostExe = join(hostDir, getHostExeName());

  if (existsSync(hostExe)) {
    console.log('  Host cached, skipping download.');
    return hostDir;
  }

  // Determine download URL
  const rid = getPlatformRid();
  const url = profile.hostPackageUrl?.[rid];
  if (!url) {
    throw new Error(
      `No host package for platform '${rid}'. ` +
      `Available: ${Object.keys(profile.hostPackageUrl || {}).join(', ')}`
    );
  }

  console.log(`  Downloading host ${profile.hostVersion} for ${rid}...`);

  await mkdir(hostDir, { recursive: true });
  const tempZip = join(hostDir, '_download.zip');

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const total = parseInt(res.headers.get('content-length') || '0', 10);
    let downloaded = 0;

    const fileStream = createWriteStream(tempZip);
    const reader = res.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(value);
      downloaded += value.length;
      if (total > 0) {
        const pct = Math.round((downloaded / total) * 100);
        process.stdout.write(`\r  Downloading: ${pct}% (${(downloaded / 1048576).toFixed(1)} MB)`);
      }
    }
    fileStream.end();
    await new Promise((resolve) => fileStream.on('finish', resolve));
    console.log('\r  Download complete.                              ');

    // Extract
    console.log('  Extracting...');
    if (platform() === 'win32') {
      execSync(`powershell -Command "Expand-Archive -Path '${tempZip}' -DestinationPath '${hostDir}' -Force"`,
        { stdio: 'pipe' });
    } else {
      execSync(`unzip -o -q "${tempZip}" -d "${hostDir}"`, { stdio: 'pipe' });
    }

    // Set executable permission on Unix
    if (platform() !== 'win32') {
      const exe = join(hostDir, getHostExeName());
      if (existsSync(exe)) {
        await chmod(exe, 0o755);
      }
    }

    console.log('  Host ready.');
  } finally {
    try { await rm(tempZip); } catch { /* ignore */ }
  }

  return hostDir;
}

export { getHostExeName };
```

### 6.6 `lib/host-launcher.js` — Spawn Host Process

```javascript
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { platform } from 'node:os';
import { getHostExeName } from './host-manager.js';

export async function launchHost(hostDir, opts) {
  const hostExe = join(hostDir, getHostExeName());

  // Build environment for the host process
  const env = {
    ...process.env,

    // Core host settings
    AZURE_FUNCTIONS_ENVIRONMENT: 'Development',
    AzureWebJobsScriptRoot: opts.scriptRoot,
    ASPNETCORE_URLS: `http://0.0.0.0:${opts.port}`,
    FUNCTIONS_WORKER_RUNTIME: opts.workerRuntime,

    // Extension bundle override from SKU profile
    'AzureFunctionsJobHost:extensionBundle:version': opts.extensionBundleVersion,

    // Enable worker indexing (V2 programming model)
    AzureWebJobsFeatureFlags: 'EnableWorkerIndexing',
  };

  // Merge local.settings.json Values into env
  if (opts.localSettings?.Values) {
    for (const [key, value] of Object.entries(opts.localSettings.Values)) {
      env[key] = value;
    }
  }

  console.log('────────────────────────────────────────────────────');
  console.log('fnx POC');
  console.log(`Target SKU:        ${opts.profile.displayName}`);
  console.log(`Host Version:      ${opts.profile.hostVersion}`);
  console.log(`Extension Bundle:  ${opts.extensionBundleVersion}`);
  console.log(`Script Root:       ${opts.scriptRoot}`);
  console.log(`Worker Runtime:    ${opts.workerRuntime}`);
  console.log(`Port:              ${opts.port}`);
  console.log('────────────────────────────────────────────────────');
  console.log();

  const child = spawn(hostExe, [], {
    env,
    stdio: ['inherit', 'inherit', 'inherit'],
    cwd: opts.scriptRoot,
  });

  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));

  return new Promise((resolve, reject) => {
    child.on('error', (err) => {
      console.error(`\nFailed to start host: ${err.message}`);
      console.error(`Host executable: ${hostExe}`);
      reject(err);
    });

    child.on('exit', (code, signal) => {
      if (signal) {
        console.log(`\nHost terminated by signal: ${signal}`);
      } else if (code !== 0) {
        console.error(`\nHost exited with code: ${code}`);
      }
      resolve(code);
    });
  });
}
```

---

## 7. How to Build and Test the POC

This section describes the end-to-end workflow. The three agents produce their artifacts independently, then this section wires them together.

### Prerequisites

| Requirement | Why |
|-------------|-----|
| Node.js ≥ 18 | CLI + CDN server use built-in `fetch`, ESM modules |
| .NET 8 SDK | Building host from source (`dotnet publish`) |
| ~10GB disk | 5 host builds × ~200MB + source code |
| Azurite (optional) | Local storage emulator for non-HTTP triggers |

### Step 1: Build Host Packages (Agent 1)

```bash
cd /Users/varad/work/new-core-tools
chmod +x build-hosts.sh
./build-hosts.sh
# Builds 5 host versions, places zips in cdn-server/hosts/
# Takes ~15-25 minutes
```

Verify:
```bash
ls cdn-server/hosts/*/Azure.Functions.Host.*.zip
# Should show 5 zip files
```

### Step 2: Start the Dummy CDN Server (Agent 2)

```bash
cd cdn-server
node server.js
# ╔════════════════════════════════════════════╗
# ║  fnx CDN Server                      ║
# ║  http://localhost:4566                     ║
# ╚════════════════════════════════════════════╝
```

Verify:
```bash
# In another terminal:
curl http://localhost:4566/api/profiles | jq '.profiles | keys'
# → ["flex", "linux-consumption", "linux-premium", "windows-consumption", "windows-dedicated"]

curl -I http://localhost:4566/hosts/4.1047.100/Azure.Functions.Host.osx-arm64.zip
# → HTTP/1.1 200 OK, Content-Type: application/zip
```

### Step 3: Create Test Function Apps Using `func` CLI (Agent 3)

Use the existing `func` CLI (Azure Functions Core Tools v4) to scaffold real function apps. This ensures the apps have the correct structure, V2 programming model, and all expected files.

**Node.js test app:**

```bash
cd /Users/varad/work/new-core-tools

# Scaffold with func CLI
func init test-node-app --worker-runtime node --language javascript --model V4
cd test-node-app
func new --name hello --template "HTTP trigger" --authlevel anonymous

# Verify structure
ls -la src/functions/hello.js host.json local.settings.json package.json
npm install
cd ..
```

**Python test app:**

```bash
cd /Users/varad/work/new-core-tools

# Scaffold with func CLI
func init test-python-app --worker-runtime python --model V2
cd test-python-app
func new --name hello --template "HTTP trigger" --authlevel anonymous

# Set up venv and install dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

**Why `func` instead of manual `cat >`?** Using the real CLI ensures:
- Correct V2/V4 programming model boilerplate
- Proper `host.json`, `local.settings.json`, and `package.json`/`requirements.txt`
- Any worker-specific files (e.g., `.funcignore`, `getting_started.md`)
- Validates that fnx can run apps scaffolded by the production tool

### Step 4: Run with Flex SKU

```bash
cd /Users/varad/work/new-core-tools/fnx

node bin/fnx start --sku flex --scriptroot ../test-node-app
```

Expected output:
```
Resolving SKU profile: flex...
  Target SKU:        Flex Consumption
  Host Version:      4.1047.100
  Extension Bundle:  [4.22.*, 5.0.0)

  Downloading host 4.1047.100 for osx-arm64...
  Downloading: 100% (198.3 MB)
  Download complete.
  Extracting...
  Host ready.

  Host path:         /Users/varad/.fnx/hosts/4.1047.100

────────────────────────────────────────────────────
fnx POC
Target SKU:        Flex Consumption
Host Version:      4.1047.100
Extension Bundle:  [4.22.*, 5.0.0)
Script Root:       /Users/varad/work/new-core-tools/test-node-app
Worker Runtime:    node
Port:              7071
────────────────────────────────────────────────────

<host startup logs...>
Functions:
  hello: [GET] http://localhost:7071/api/hello
```

Verify:
```bash
curl http://localhost:7071/api/hello
# → Hello from hello! Host: ...
```

### Step 5: Run with Windows Consumption SKU (Side by Side)

In a **second terminal**, same test app but different SKU and port:

```bash
node bin/fnx start --sku windows-consumption --scriptroot ../test-node-app --port 7072
```

Expected output:
```
Resolving SKU profile: windows-consumption...
  Target SKU:        Windows Consumption
  Host Version:      4.1045.200              ← DIFFERENT from Flex!
  Extension Bundle:  [4.19.*, 5.0.0)         ← DIFFERENT bundle range!

  Downloading host 4.1045.200 for osx-arm64...
  ...
────────────────────────────────────────────────────
fnx POC
Target SKU:        Windows Consumption
Host Version:      4.1045.200                ← OLDER host
...
Functions:
  hello: [GET] http://localhost:7072/api/hello
```

Verify:
```bash
curl http://localhost:7072/api/hello
# → Hello from hello! Host: ...
```

**This is the money shot**: same function app, two terminals, two different host versions — emulating what would actually happen on Flex vs Windows Consumption. Any API or behavior available in 4.1047.100 but not in 4.1045.200 would fail on port 7072.

### Step 6: List All SKU Profiles

```bash
node bin/fnx start --sku list

# Expected:
# Available SKU profiles:
#
#   SKU                     Host Version         Bundle Version    Status
#   ─────────────────────── ──────────────────── ───────────────── ──────────
#   flex                    4.1047.100           [4.22.*, 5.0.0)   GA
#   linux-premium           4.1046.100           [4.21.*, 5.0.0)   GA
#   windows-consumption     4.1045.200           [4.19.*, 5.0.0)   GA
#   windows-dedicated       4.1045.100           [4.19.*, 5.0.0)   GA
#   linux-consumption       4.1044.400           [4.18.*, 5.0.0)   deprecated
#
#   Last updated: 2026-02-14T00:00:00Z
```

---

## 8. What This POC Proves

| Question | Validated By |
|----------|-------------|
| Can a self-contained host run standalone without the `func` CLI? | Step 4: host starts, discovers functions, serves HTTP |
| Can we swap host versions by pointing to a different directory? | Step 5: two terminals, two host versions, same app |
| Do language workers (Node/Python) start correctly? | Step 4: Node worker spawns via gRPC, function executes |
| Does extension bundle version override work via env var? | Profile injects `AzureFunctionsJobHost:extensionBundle:version` |
| Is the download + cache model viable? | host-manager.js downloads from CDN server, extracts, caches by version |
| Is the profile registry model viable? | profile-resolver.js fetches from CDN server, caches, resolves by SKU name |
| Can a thin JS CLI replace the monolithic Core Tools for local dev? | ~350 lines of JS, zero deps, full F5 experience |
| Does a CDN-hosted profile registry work for version resolution? | cdn-server emulates the production CDN endpoint |

## 8b. Extension Bundle Support

### Background

Azure Functions uses **extension bundles** to provide trigger and binding implementations (HTTP, Timer, Storage, etc.) without requiring customers to manage NuGet references. The `host.json` in every function app declares the bundle:

```json
{
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
```

The host needs these bundles at startup. Core Tools (`func start`) handles this by:
1. Setting `FUNCTIONS_CORETOOLS_ENVIRONMENT=true` — tells the host it's in a dev/download context
2. Setting `AzureFunctionsJobHost:extensionBundle:downloadPath` — tells the host WHERE to cache downloaded bundles
3. The host then auto-downloads from the Azure CDN: `https://cdn.functions.azure.com/public/ExtensionBundles/{id}/{version}/{id}.{version}_any-any.zip`

### How the Host Resolves Bundles

From `ExtensionBundleManager.cs` in azure-functions-host:

```
GetBundle():
  1. TryLocateExtensionBundle() — searches ProbingPaths + DownloadPath for existing bundle
  2. If (isAppService || IsCoreTools || isLinuxConsumption || isContainer) AND (!found || ensureLatest):
     a. GetLatestMatchingBundleVersionAsync() — fetches index.json from CDN, finds best match for version range
     b. DownloadExtensionBundleAsync() — downloads {id}.{version}_any-any.zip, extracts to DownloadPath
  3. Returns bundle path (or null)
```

Key env vars:
- `FUNCTIONS_CORETOOLS_ENVIRONMENT` — must be set (any non-empty value) for host to enter download path (`IsCoreTools()`)
- `AzureFunctionsJobHost:extensionBundle:downloadPath` — where host downloads and caches bundles
- `ExtensionBundleSourceUri` (optional) — override CDN URL (default: `https://cdn.functions.azure.com/public`)

### Bundle Download URL Pattern

```
Index:  https://cdn.functions.azure.com/public/ExtensionBundles/{id}/index.json
Bundle: https://cdn.functions.azure.com/public/ExtensionBundles/{id}/{version}/{id}.{version}_any-any.zip
```

The `_any-any` suffix is the "flavor" for non-AppService environments (vs `_win-any` or `_linux-any` for managed hosting).

### Bundle Directory Structure (after extraction)

```
~/.fnx/bundles/Microsoft.Azure.Functions.ExtensionBundle/4.30.0/
├── bundle.json           ← metadata: {"id": "...", "version": "4.30.0"}
├── bin/                  ← extension DLLs (161 files)
│   ├── Azure.Messaging.ServiceBus.dll
│   ├── Microsoft.Azure.WebJobs.Extensions.Http.dll
│   └── ...
├── StaticContent/        ← binding metadata for worker indexing
└── extensions.csproj
```

### fnx Implementation

In `host-launcher.js`, set three env vars before spawning the host:

```javascript
// Enable extension bundle auto-download (host checks IsCoreTools())
env['FUNCTIONS_CORETOOLS_ENVIRONMENT'] = 'true';

// Set bundle download/cache path under ~/.fnx/bundles/
const bundleDownloadPath = join(homedir(), '.fnx', 'bundles',
  'Microsoft.Azure.Functions.ExtensionBundle');
env['AzureFunctionsJobHost:extensionBundle:downloadPath'] = bundleDownloadPath;
```

This lets the host handle all bundle resolution, version matching, download, and extraction — exactly as it does under Core Tools. No custom download logic needed in fnx.

The host will:
1. Read `extensionBundle` from the function app's `host.json`
2. Check `downloadPath` for existing bundles
3. If not found (and `FUNCTIONS_CORETOOLS_ENVIRONMENT` is set), fetch index.json from CDN
4. Download best matching version zip
5. Extract to `downloadPath/{version}/`
6. Load extensions from `bin/`

### Cache Location

```
~/.fnx/
├── hosts/          ← host binaries (existing)
│   └── 4.1047.100/
└── bundles/        ← extension bundles (new)
    └── Microsoft.Azure.Functions.ExtensionBundle/
        └── 4.30.0/
            ├── bundle.json
            ├── bin/
            └── ...
```

## 9. What This POC Does NOT Prove

| Gap | Why | Path Forward |
|-----|-----|-------------|
| Auth bypass for non-anonymous functions | Host requires function keys without `CliAuthenticationHandler` | Need `AZURE_FUNCTIONS_CORE_TOOLS_ENVIRONMENT=true` support in host repo |
| Dotnet in-proc / dotnet-isolated | DI injection (debug attach, user secrets) | Separate investigation; requires host-side changes |
| F5 / VS Code integration | Requires tasks.json + extension changes | Layer on after CLI shape is validated |
| Production CDN hosting of host packages | Host zips not published independently today | Release pipeline change (ArtifactAssembler) |
| In-proc .NET worker model | CoreToolsHost/AppLoader/hostfxr chain | Not in scope for this POC |

## 10. File List

```
new-core-tools/
├── build-hosts.sh                           ← Agent 1: host build script (~80 lines bash)
├── cdn-server/                              ← Agent 2: dummy CDN
│   ├── server.js                            ← HTTP server (~120 lines JS)
│   ├── package.json
│   ├── profiles/
│   │   └── sku-profiles.json                ← 5 SKUs → 5 real host versions
│   └── hosts/                               ← built host zips (created by build-hosts.sh)
│       ├── 4.1047.100/
│       │   └── Azure.Functions.Host.osx-arm64.zip
│       ├── 4.1046.100/
│       │   └── ...
│       ├── 4.1045.200/
│       │   └── ...
│       ├── 4.1045.100/
│       │   └── ...
│       └── 4.1044.400/
│           └── ...
├── fnx/                                ← Agent 3: CLI
│   ├── bin/
│   │   └── fnx                         ← #!/usr/bin/env node entry point (2 lines)
│   ├── lib/
│   │   ├── cli.js                           ← arg parsing, orchestration (~80 lines)
│   │   ├── profile-resolver.js              ← fetch/cache profiles (~70 lines)
│   │   ├── host-manager.js                  ← download/cache host zips (~100 lines)
│   │   └── host-launcher.js                 ← spawn host, forward stdio (~70 lines)
│   ├── profiles/
│   │   └── sku-profiles.json                ← bundled fallback (copy of cdn-server's)
│   └── package.json
├── test-node-app/                           ← Agent 3: test fixture
│   ├── host.json
│   ├── local.settings.json
│   ├── package.json
│   └── src/functions/hello.js
├── prd.md                                   ← Product Requirements Document
├── implementation.md                        ← This file
└── testing.md                               ← Test plan and verification

Total new code: ~350 lines JS (fnx) + ~120 lines JS (cdn-server) + ~80 lines bash (build script)
               = ~550 lines total. Zero npm dependencies.
```

---

## 11. Existing Architecture Reference

For context on what the full v5 implementation (post-POC) would need to change in the existing C# codebase.

### Existing Host Launch Paths (from StartHostAction.cs)

**Path A: Out-of-Process Workers (Node.js, Python, Java, PowerShell, dotnet-isolated)**

```
func start
  → main.js spawns lib/bin/func
  → ConsoleApp.Parse() routes to StartHostAction
  → StartHostAction.RunAsync()
  → TryHandleInProcDotNetLaunchAsync() returns false
  → BuildWebHost() — loads WebHost DLLs IN-PROCESS via ASP.NET Core WebHost builder
  → Startup.cs configures DI (auth bypass, logging, extension bundles)
  → host.RunAsync() — host runs INSIDE the func CLI process
```

**Path B: In-Process .NET Workers (dotnet inproc6/inproc8)**

```
func start
  → StartHostAction.RunAsync()
  → TryHandleInProcDotNetLaunchAsync() returns true
  → StartHostAsChildProcess() — spawns CHILD PROCESS
     → Process.Start("in-proc8/func", originalArgs + "--no-build")
     → CoreToolsHost (Program.cs) → AppLoader → hostfxr → WebHost.dll
```

### CLI → Host DI Injection (what the POC sidesteps)

| Injection | What It Does | POC Workaround |
|-----------|-------------|----------------|
| `CliAuthenticationHandler` | Bypasses function key auth for local dev | Use `authLevel: anonymous` on HTTP triggers |
| `ColoredConsoleLoggerProvider` | Formatted colored log output | Accept plain host output |
| `UserSecretsConfigurationBuilder` | Loads .NET user secrets | Not needed for Node/Python |
| `DotNetIsolatedDebugConfigureBuilder` | Enables dotnet-isolated F5 debugging | POC doesn't support dotnet |
| `ThrowingDependencyValidator` | Better error messages for DI failures | Accept default host errors |
