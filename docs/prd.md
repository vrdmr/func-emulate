# PRD: SKU-Aware `func start` for Azure Functions Core Tools

## 1. Problem Statement

Azure Functions Core Tools (`func`) serves as the primary local development tool — it bundles the Functions Host, pulls Extension Bundles from CDN, provides templates, and handles deployment. Today, Core Tools has **no awareness of the target SKU** a customer intends to deploy to (Flex Consumption, Windows Consumption, Linux Premium, Dedicated, etc.).

Different SKUs ship host versions at different cadences:
- **Flex Consumption**: every ~2 weeks (growth priority)
- **Linux EP (Premium)**: aligned with Flex
- **Windows Consumption / Dedicated**: every ~3 months
- **Linux Consumption**: deprecated, ~3x/year

Because Core Tools always ships the **latest** host and Extension Bundles, a customer can:
1. Download the latest Core Tools (containing host version e.g. `func49`).
2. Develop and validate locally against new APIs/features available in `func49`.
3. Deploy to a SKU still running `func46` (e.g. Windows Consumption).
4. **App breaks in production** because the target environment doesn't support the features they tested locally.

This "works locally, breaks in cloud" gap is the core problem. Today we avoid it by holding back Core Tools and Extension Bundle releases until **all** SKUs have completed deployment — which slows Flex Consumption releases and prevents fast feature announcements.

### Why This Matters Now

- **Flex Consumption is the growth SKU** with 30,000+ apps. Leadership wants Flex to ship features fast (every 2 weeks, ideally every check-in).
- **Windows Consumption + Dedicated** cannot move as fast (regressions are harder to fix, different usage patterns surface different issues).
- The current "wait for all SKUs" model directly conflicts with the goal of accelerating Flex.
- Linux Consumption is deprecated (retirement Sept 2028) and can tolerate documentation-only mitigation.

## 2. Scope

This PRD focuses on a single, high-impact change: **making `func start` SKU-aware** so that the local development experience accurately emulates the customer's target deployment environment. Specifically:

1. A CDN-hosted JSON registry mapping each SKU to its current host version and Extension Bundle version.
2. A `--sku` flag on `func start` that selects the correct host and Extension Bundle versions for local development.

### Out of Scope (Future Work)

The following are recognized as valuable but are **not** part of this proposal:
- Deployment-time validation (FDM manifest checks, `func publish` blocking)
- IDE integration (VS / VS Code profile awareness)
- NuGet package version guardrails
- Sovereign cloud profiles
- Template filtering by SKU capability

These can be layered on top of the profile registry once it exists.

## 3. Goals

| # | Goal | Measure |
|---|------|---------|
| G1 | Enable Flex Consumption to release host/bundles independently (≤2 weeks) without being gated on other SKUs | Flex release cadence decoupled from Windows/legacy SKUs |
| G2 | Ensure local development with `func start` accurately emulates the target SKU's runtime environment | Host + Extension Bundle versions used locally match what's deployed on the target SKU |
| G3 | Maintain a single Core Tools codebase (avoid forking into per-SKU tools) | One repo, one release artifact |
| G4 | Minimize additional cognitive burden on customers | Single `--sku` flag; no manual version cross-referencing |

## 4. Non-Goals

- Changing the SDP (Safe Deployment Practice) process for any SKU.
- Modifying the Functions Host architecture.
- Blocking deployments at the FDM layer (future work).
- Addressing sovereign cloud release cadence.

## 5. Participants & Stakeholders

| Role | Person | Perspective |
|------|--------|-------------|
| Engineering Leadership | Anirudh Garg | Wants Flex velocity; open to new Core Tools version or SKU-specific flags if full profile design is too slow |
| Core Tools / Host | Fabio Cavalcante | Advocates for profile-based design; warns against documentation-only solutions; concerned about support cost of parallel releases |
| Release Engineering | Ahmed El Sayed (MAMOUN) | Manages release trains; has independent anomaly detection for Flex; proposed version-mapping documentation |
| Runtime / Supportability | Pragna Gopa | Insists tooling-based guardrails before changing velocity; highlights FDM as future interception point; documentation alone won't cut it |
| Core Tools PM | Varad Meru | Frames Core Tools as emulator; wants problem scoped to Core Tools `func start` experience |

## 6. Proposed Solution: `func start --sku`

### 6.1 Architectural Change: Decouple CLI from Host

Today, `azure-functions-core-tools` is a monolithic npm package that bundles the `func` CLI, host DLLs, extension bundles, and templates together. This tight coupling is the root cause of the version skew problem — you can't update the host independently from the CLI, so everything must move in lockstep.

**Proposed: Split Core Tools into a thin CLI + downloadable host runtimes.**

```
Today (monolithic, v4):
  npm install -g azure-functions-core-tools@4
  └── func CLI + host DLLs + extension bundles + templates (single blob, ~300MB)
       └── Host version is fixed at install time
       └── Only way to change host = reinstall Core Tools

Proposed (split, v5):
  npm install -g azure-functions-core-tools@5        ← CLI-only (lightweight, ~30MB)
  └── func CLI, templates, deploy logic, profile resolver
  └── downloads host packages on demand based on --sku
      ├── azure-functions-host@4.1049  ← for flex, linux-premium
      ├── azure-functions-host@4.1046  ← for windows-consumption, windows-dedicated
      └── azure-functions-host@4.1044  ← for linux-consumption
```

The CLI becomes a **thin orchestrator** — it handles commands (`func init`, `func new`, `func publish`), templates, and deployment, but delegates local execution to whatever host version the SKU profile specifies. Host packages are downloaded from CDN on first use and cached locally.

```
Core Tools v5 Architecture
┌─────────────────────────────────────────────────────┐
│  azure-functions-core-tools (npm package)           │
│  ┌───────────────────────────────────────────────┐  │
│  │  func CLI                                     │  │
│  │  ├── func init / func new (templates)         │  │
│  │  ├── func publish / func pack (deployment)    │  │
│  │  ├── Profile Resolver                         │  │
│  │  │   └── fetches sku-profiles.json from CDN   │  │
│  │  └── Host Manager                             │  │
│  │      ├── resolve(sku) → host version          │  │
│  │      ├── download(version) → fetch & cache    │  │
│  │      └── launch(path) → dotnet exec WebHost   │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  NO host DLLs bundled in the npm package.           │
└─────────────────────────────────────────────────────┘
         │
         │  downloads on demand
         ▼
┌─────────────────────────────────────────────────────┐
│  ~/.azure-functions-core-tools/hosts/               │
│  ├── 4.1049.2.20887/   (flex, linux-premium)        │
│  │   └── Microsoft.Azure.WebJobs.Script.WebHost.dll │
│  ├── 4.1046.1.20845/   (windows-consumption)        │
│  │   └── Microsoft.Azure.WebJobs.Script.WebHost.dll │
│  └── 4.1044.0.20810/   (linux-consumption)           │
│      └── Microsoft.Azure.WebJobs.Script.WebHost.dll │
└─────────────────────────────────────────────────────┘
```

This is effectively **Core Tools v5** — a breaking architectural change (CLI decoupled from host). The command surface (`func init`, `func start`, `func publish`) stays identical, but the internal architecture changes from "monolith with embedded host" to "thin CLI + downloadable host runtimes." The version bump signals the change.

### 6.2 How `func start --sku` Works

When a developer runs `func start --sku <sku-name>`, Core Tools:
1. Fetches the **SKU profile registry** (a JSON file served from CDN).
2. Resolves the **host version** and **Extension Bundle version** that are currently deployed on the specified SKU.
3. Downloads (or selects from cache) the matching host package.
4. Launches the host via `dotnet exec <cached-host-path>/Microsoft.Azure.WebJobs.Script.WebHost.dll`.

The result: the developer's local environment accurately emulates what their app will encounter in production on that specific SKU.

### 6.3 SKU Profile Registry (CDN-hosted JSON)

A machine-readable JSON file hosted on CDN (e.g. `https://functionscdn.azureedge.net/public/sku-profiles.json`) that maps each SKU to its currently deployed versions:

```json
{
  "schemaVersion": "1.0",
  "profiles": {
    "flex": {
      "displayName": "Flex Consumption",
      "hostVersion": "4.1049.2.20887",
      "extensionBundleVersion": "[4.22.*, 5.0.0)",
      "status": "GA"
    },
    "windows-consumption": {
      "displayName": "Windows Consumption",
      "hostVersion": "4.1046.1.20845",
      "extensionBundleVersion": "[4.19.*, 5.0.0)",
      "status": "GA"
    },
    "linux-premium": {
      "displayName": "Linux Premium (EP)",
      "hostVersion": "4.1049.2.20887",
      "extensionBundleVersion": "[4.22.*, 5.0.0)",
      "status": "GA"
    },
    "windows-dedicated": {
      "displayName": "Windows Dedicated (ASP)",
      "hostVersion": "4.1046.1.20845",
      "extensionBundleVersion": "[4.19.*, 5.0.0)",
      "status": "GA"
    },
    "linux-consumption": {
      "displayName": "Linux Consumption",
      "hostVersion": "4.1044.0.20810",
      "extensionBundleVersion": "[4.18.*, 5.0.0)",
      "status": "deprecated",
      "retirementDate": "2028-09-30"
    }
  },
  "updatedAt": "2026-02-13T00:00:00Z"
}
```

**Registry update process**: When a SKU completes deployment of a new host version (e.g. Flex deploys `func49`), the release pipeline updates the corresponding entry in this JSON and publishes to CDN. This is a simple addition to the existing release automation.

### 6.4 Core Tools Behavior

#### `func start --sku <sku-name>`

```
┌─────────────────────────────────────────────────────────────┐
│  func start --sku flex                                      │
│                                                             │
│  1. Fetch sku-profiles.json from CDN (cache locally)        │
│  2. Look up "flex" → hostVersion 4.1049.x, bundle 4.22.x   │
│  3. Download host 4.1049.x if not already cached            │
│  4. Resolve Extension Bundle 4.22.x                         │
│  5. Start host with those versions                          │
│                                                             │
│  Output:                                                    │
│  Azure Functions Core Tools                                 │
│  Core Tools Version: 4.0.6610                               │
│  Target SKU: Flex Consumption                               │
│  Host Version: 4.1049.2.20887                               │
│  Extension Bundle: 4.22.1                                   │
│                                                             │
│  Functions:                                                 │
│    HttpTrigger1: [GET,POST] http://localhost:7071/api/...   │
└─────────────────────────────────────────────────────────────┘
```

#### Behavior details

| Behavior | Description |
|----------|-------------|
| **`--sku` flag** | Accepted on `func start`. Valid values are the keys in the profile registry (e.g. `flex`, `windows-consumption`, `linux-premium`, `windows-dedicated`, `linux-consumption`). |
| **Persisted in project** | When `--sku` is used, the value is written to `local.settings.json` under `"TargetSku": "flex"`. Subsequent `func start` calls use the persisted value without needing the flag again. |
| **Host version selection** | Core Tools downloads (or uses cached) the specific host version from the profile, rather than the bundled default. Host binaries are cached under `~/.azure-functions-core-tools/hosts/<version>/`. |
| **Extension Bundle resolution** | Core Tools resolves the Extension Bundle version range from the profile, overriding whatever is in `host.json`. This ensures the local bundle matches what's available on the target SKU. |
| **No `--sku` specified** | Core Tools runs the bundled (latest) host version as it does today. A new informational message is displayed: *"Tip: Use `func start --sku <name>` to emulate a specific deployment target. Run `func start --sku list` to see available profiles."* |
| **`func start --sku list`** | Lists all available SKU profiles with their current host/bundle versions — fetched live from CDN. |
| **Offline / CDN unreachable** | Falls back to a cached copy of the profile registry. If no cache exists, falls back to bundled host with a warning. |
| **Invalid SKU name** | Error with list of valid options: *"Unknown SKU 'foo'. Available profiles: flex, windows-consumption, linux-premium, windows-dedicated, linux-consumption."* |

### 6.5 Customer Experience Examples

**Scenario 1: Flex developer (default fast-track)**
```
$ func start --sku flex
Azure Functions Core Tools (4.0.6610)
Target SKU:        Flex Consumption
Host Version:      4.1049.2.20887
Extension Bundle:  Microsoft.Azure.Functions.ExtensionBundle [4.22.1]

Functions:
  HttpTrigger1: [GET,POST] http://localhost:7071/api/HttpTrigger1
  BlobProcessor: BlobTrigger
```

**Scenario 2: Windows Consumption developer (older host)**
```
$ func start --sku windows-consumption
Azure Functions Core Tools (4.0.6610)
Target SKU:        Windows Consumption
Host Version:      4.1046.1.20845
Extension Bundle:  Microsoft.Azure.Functions.ExtensionBundle [4.19.3]

Functions:
  HttpTrigger1: [GET,POST] http://localhost:7071/api/HttpTrigger1
```
The developer tests against the exact host version running on Windows Consumption. Any API or feature not yet available in `4.1046.x` will fail locally — catching the problem before deployment.

**Scenario 3: Listing available profiles**
```
$ func start --sku list

Available SKU profiles (from https://functionscdn.azureedge.net/public/sku-profiles.json):

  SKU                     Host Version        Bundle Version   Status
  ─────────────────────── ─────────────────── ──────────────── ──────────
  flex                    4.1049.2.20887      4.22.x           GA
  linux-premium           4.1049.2.20887      4.22.x           GA
  windows-consumption     4.1046.1.20845      4.19.x           GA
  windows-dedicated       4.1046.1.20845      4.19.x           GA
  linux-consumption       4.1044.0.20810      4.18.x           Deprecated

Last updated: 2026-02-13
```

**Scenario 4: No SKU specified (backward compatible)**
```
$ func start
Azure Functions Core Tools (4.0.6610)
Host Version:      4.1049.2.20887 (bundled)

Tip: Use 'func start --sku <name>' to emulate a specific deployment target.
     Run 'func start --sku list' to see available profiles.

Functions:
  HttpTrigger1: [GET,POST] http://localhost:7071/api/HttpTrigger1
```

**Scenario 5: Persisted SKU in project**
```
$ func start --sku flex
  # ... starts with Flex profile, writes to local.settings.json

$ cat local.settings.json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node"
  },
  "TargetSku": "flex"
}

$ func start
  # Automatically uses Flex profile (from local.settings.json)
Azure Functions Core Tools (4.0.6610)
Target SKU:        Flex Consumption (from local.settings.json)
Host Version:      4.1049.2.20887
```

### 6.6 Host Version Management

Since Core Tools v5 no longer bundles the host, **all** host versions are downloaded on demand — even the first `func start` after install:

```
~/.azure-functions-core-tools/
  hosts/
    4.1049.2.20887/        ← downloaded on first `func start --sku flex`
      Microsoft.Azure.WebJobs.Script.WebHost.dll
      ...
    4.1046.1.20845/        ← downloaded on first `func start --sku windows-consumption`
      Microsoft.Azure.WebJobs.Script.WebHost.dll
      ...
  profiles/
    sku-profiles.json      ← cached from CDN
```

| Concern | Approach |
|---------|----------|
| **Download source** | Host packages are published to CDN as part of the existing release pipeline. Each host version is a self-contained .NET app packaged as a zip. |
| **Disk space** | Each host version is ~50-100 MB. `func host cleanup` removes unused cached versions. |
| **Cache invalidation** | Profile registry has `updatedAt` timestamp. Core Tools checks CDN on each `func start --sku` and re-downloads host if the version changed. TTL-based cache (1 hour) to avoid hitting CDN on every run. |
| **First-run latency** | First `func start` after install (or for a new host version) will take ~30s to download. Subsequent runs use cache. Progress bar shown during download. |
| **npm install experience** | `npm install -g azure-functions-core-tools@5` is fast and lightweight (~30MB CLI-only). No host DLLs shipped in the package. |

## 7. Alternatives Considered

| Option | Description | Pros | Cons | Verdict |
|--------|-------------|------|------|---------|
| **A. Documentation only** | Publish version compatibility tables; customers self-validate | Zero engineering cost | Customers won't check; CRIs will spike; "doesn't cut it" (Pragna) | ❌ Rejected |
| **B. Fork Core Tools per SKU** | Maintain separate Core Tools builds for Flex vs. others | Simple conceptual model | N codebases to maintain; overlapping releases; customer confusion ("which `func` do I install?"); doesn't scale with SKUs | ❌ Rejected |
| **C. Slow everything down** | Release all SKUs at the same (slower) cadence | No version skew; simple | Blocks Flex growth; defeats the purpose | ❌ Rejected |
| **D. SKU-aware `func start`** (proposed) | Single Core Tools with `--sku` flag, CDN profile registry | One codebase; accurate local emulation; enables independent SKU velocity; minimal customer overhead | Requires host download infrastructure + profile registry | ✅ Selected |
| **E. Pre-release / Preview channel** | Ship new features as pre-release Core Tools | Signals "not GA yet" | Doesn't prevent deployment to incompatible SKUs; customers often use pre-release in production | ❌ Rejected |

## 8. Rollout

### Phase 0: Immediate (No Engineering Required)
- **Linux Consumption**: Slow releases to 3x/year. Documentation-only mitigation is acceptable given deprecated status and low CRI volume.
- **Flex-first release ordering**: Already in progress. Flex gets bits first, independent anomaly detection runs, then other SKUs follow.

### Phase 0.5: POC Validation (Pre-Phase 1)

Before committing to the full C# rearchitecture, validate the decoupled architecture with a lightweight POC:

- **What**: A ~550-line JavaScript CLI (`func-emu`) that downloads self-contained host builds from a dummy CDN server and launches them as child processes. Scoped to non-dotnet languages (Node.js, Python, Java, PowerShell).
- **Why**: Proves that (a) the host can run standalone without Core Tools DI injection, (b) profile-based version resolution works, (c) language workers start correctly via gRPC, and (d) two different host versions can serve the same app simultaneously.
- **How**: Three independent workstreams:
  1. **Host Builder**: Build self-contained hosts from 5 real release tags (`v4.1047.100` through `v4.1044.400`) using `dotnet publish --self-contained`.
  2. **Dummy CDN Server**: Zero-dep Node.js HTTP server serving the SKU profiles JSON and host zip downloads on `localhost:4566`.
  3. **func-emu CLI**: Thin Node.js CLI that fetches profiles, downloads/caches hosts, and spawns them.
- **Success**: Running `func-emu start --sku flex` on port 7071 and `func-emu start --sku windows-consumption` on port 7072 simultaneously, with different host versions serving the same function app.
- **Details**: See `implementation.md` and `testing.md`.

### Phase 1: Profile Registry + `func start --sku` (This PRD)
1. **Decouple CLI from host** — restructure Core Tools so the npm package contains only the CLI, templates, and deployment logic. No bundled host DLLs.
2. **Publish host as standalone packages** — add a step to the release pipeline that publishes each host version as a downloadable zip to CDN.
3. Define and publish the SKU profile registry JSON to CDN.
4. Automate registry updates as part of each SKU's release pipeline.
5. Implement `--sku` flag on `func start`.
6. Implement host version download, caching, and launch (`dotnet exec`).
7. Implement Extension Bundle version resolution from profile.
8. Implement `TargetSku` persistence in `local.settings.json`.

### Future Phases (Separate PRDs)
- **Deployment validation**: `func publish` checks target app SKU against profile; FDM manifest validation.
- **IDE integration**: VS / VS Code extensions become profile-aware.
- **NuGet guardrails**: Worker extension packages aligned with profile availability.
- **Template filtering**: `func new` restricts templates based on target SKU capabilities.

## 9. Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| Q1 | What is the cost estimate for this approach vs. the "fork Core Tools" approach? | Fabio / Anirudh | Anirudh to brainstorm with Fabio |
| Q2 | **CLI ↔ Host compatibility**: How tightly coupled is the Core Tools CLI to the host? If the CLI ships at v5 but launches host v46, will function discovery, worker protocol negotiation, and extension loading still work? This is the key technical risk of the decoupled architecture. | Fabio | **Critical — must be answered before committing to this approach** |
| Q3 | How do we handle customers who never specify `--sku`? Display a tip (proposed) or make it required for new projects? | Varad / Fabio | Open — proposed: tip only, no breaking change |
| Q4 | Where should downloaded host versions be cached? User-level (~/.azure-functions-core-tools/) or project-level? | Fabio | Open — proposed: user-level |
| Q5 | Should the profile registry include a `features` array for future template filtering, or keep it minimal (host + bundle only) for now? | Varad | Open — proposed: minimal for v1 |
| Q6 | What is the first-run experience when no `--sku` is specified and no host is cached? Should Core Tools download the latest (flex) host automatically, or prompt the user to choose? | Varad / Fabio | Open |

## 10. Success Criteria

| Metric | Target |
|--------|--------|
| Flex Consumption release cadence | ≤ 2 weeks, independent of other SKUs |
| `--sku` adoption | > 50% of `func start` invocations use `--sku` within 6 months of release |
| "Works locally, breaks in cloud" CRIs | Reduction in version-skew-attributable CRIs |
| Core Tools codebases maintained | 1 (no forks) |

## 11. Dependencies

- **Host binaries published to downloadable feed** — already the case as part of the release process.
- **CDN endpoint for profile registry** — needs provisioning (low effort, existing CDN infrastructure).
- **Anomaly detection for Flex** — already in place (Ahmed confirmed).
- **Flex-first release ordering** — already being adopted.

## 12. Next Steps

1. **Anirudh + Fabio**: Brainstorm on feasibility and cost estimate (action item from meeting, 2-week deadline).
2. **Fabio**: Draft technical design for host version download, caching, and selection logic in Core Tools.
3. **Ahmed**: Define the automation to update `sku-profiles.json` as part of each SKU's release pipeline.
4. **Varad**: Finalize profile registry schema (minimal v1: host version + bundle version + status).
