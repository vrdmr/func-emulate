import { resolve as resolvePath, dirname, join } from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolveProfile, listProfiles, setProfilesSource, fetchRegistryWithMeta } from './profile-resolver.js';
import { ensureHost, ensureBundle, getCachedHostVersions, compareVersions, DEFAULT_KEEP_VERSIONS } from './host-manager.js';
import { launchHost, createHostState } from './host-launcher.js';
import { startLiveMcpServer } from './live-mcp-server.js';
import { detectDotnetModel, printInProcessError } from './dotnet-detector.js';

const FNX_HOME = join(homedir(), '.fnx');
const VERSION_CHECK_FILE = join(FNX_HOME, 'version-check.json');
const VERSION_CHECK_TTL_MS = 24 * 60 * 60 * 1000;

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    // Host binds 0.0.0.0, so check that address (catches both IPv4 wildcard and loopback)
    srv.listen(port, '0.0.0.0', () => { srv.close(() => resolve(true)); });
  });
}

async function findOpenPort(start, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    if (await isPortFree(start + i)) return start + i;
  }
  return start; // fall through — let the host report the error
}

export async function main(args) {
  const cmd = args[0];

  if (cmd === '-h' || cmd === '--help' || cmd === 'help' || !cmd) {
    printHelp();
    process.exit(cmd ? 0 : 1);
  }

  if (cmd === '-v' || cmd === '--version') {
    const pkg = await getFnxPackage();
    console.log(`fnx v${pkg.version}`);
    process.exit(0);
  }

  if (cmd === 'templates-mcp') {
    await startTemplatesMcp();
    return;
  }

  if (cmd === 'warmup') {
    const { warmup } = await import('./warmup.js');
    await warmup(args.slice(1));
    return;
  }

  if (cmd === 'sync') {
    await runSync(args.slice(1));
    return;
  }

  if (cmd !== 'start') {
    console.error(`Unknown command: ${cmd}\n`);
    printHelp();
    process.exit(1);
  }

  await maybeWarnForCliUpgrade();

  const scriptRoot = getFlag(args, '--scriptroot') || process.cwd();
  const requestedPort = parseInt(getFlag(args, '--port') || '7071');
  const port = await findOpenPort(requestedPort);
  if (port !== requestedPort) {
    console.log(`  Port ${requestedPort} in use, using ${port} instead.`);
  }
  const mcpPort = getFlag(args, '--mcp-port') || String(port + 1);
  const verbose = args.includes('--verbose');
  const noMcp = args.includes('--no-mcp');
  const noAzurite = args.includes('--no-azurite');
  const profilesSource = getFlag(args, '--profiles');

  // Set profiles source before any profile resolution
  if (profilesSource) {
    setProfilesSource(profilesSource);
  }

  // Read config files early (needed for SKU resolution and env vars)
  const appConfig = await readJsonFile(resolvePath(scriptRoot, 'app.config.json'));
  const localSettings = await readJsonFile(resolvePath(scriptRoot, 'local.settings.json'));

  // Resolve SKU: CLI flag > app.config.json > local.settings.json > default "flex"
  let sku = getFlag(args, '--sku');
  let skuSource = 'CLI flag';

  if (!sku && appConfig?.TargetSku) {
    sku = appConfig.TargetSku;
    skuSource = 'app.config.json';
  }
  if (!sku && localSettings?.TargetSku) {
    sku = localSettings.TargetSku;
    skuSource = 'local.settings.json';
  }
  if (!sku) {
    sku = 'flex';
    skuSource = 'default';
    console.log(`No --sku specified, defaulting to '${sku}'.`);
    console.log(`Tip: Use --sku <name> to target a specific SKU. Run --sku list to see options.\n`);
  }

  if (sku === 'list') {
    await listProfiles();
    return;
  }

  // 1. Resolve profile
  if (skuSource !== 'default') {
    console.log(`Resolving SKU profile: ${sku} (from ${skuSource})...`);
  } else {
    console.log(`Resolving SKU profile: ${sku}...`);
  }

  const { registry, source } = await fetchRegistryWithMeta();
  const profile = registry.profiles[sku];
  if (!profile) {
    const valid = Object.keys(registry.profiles).join(', ');
    throw new Error(`Unknown SKU '${sku}'. Available: ${valid}`);
  }

  profile.name = sku;
  console.log(`  Target SKU:        ${profile.displayName}`);
  console.log(`  Host Version:      ${profile.hostVersion}`);
  console.log(`  Extension Bundle:  ${profile.extensionBundleVersion}`);
  if (profile.maxExtensionBundleVersion) {
    console.log(`  Max Bundle Cap:    ${profile.maxExtensionBundleVersion}`);
  }
  console.log(`  Profile Source:    ${source}`);
  console.log();

  printHostDriftWarning(profile.hostVersion);

  // 2. Ensure host is downloaded
  const hostDir = await ensureHost(profile, { keepVersions: DEFAULT_KEEP_VERSIONS });
  console.log(`  Host path:         ${hostDir}`);

  // 3. Pre-download the correct extension bundle for this SKU
  //    This resolves the exact version from CDN index, capped by maxExtensionBundleVersion,
  //    and downloads it so the host finds it cached and never fetches a wrong version.
  const resolvedBundleVersion = await ensureBundle(profile, { keepVersions: DEFAULT_KEEP_VERSIONS });
  if (resolvedBundleVersion) {
    console.log(`  Bundle resolved:   ${resolvedBundleVersion}`);
  }
  console.log();

  // 4. Merge config: app.config.json Values + local.settings.json Values
  const mergedValues = {
    ...(appConfig?.Values || {}),
    ...(localSettings?.Values || {}),
  };

  const workerRuntime = mergedValues.FUNCTIONS_WORKER_RUNTIME;

  if (!workerRuntime) {
    console.error('Error: FUNCTIONS_WORKER_RUNTIME not set in app.config.json or local.settings.json');
    process.exit(1);
  }

  // F9: .NET isolated worker only — block in-process projects with guidance
  const dotnetRuntimes = ['dotnet', 'dotnet-isolated'];
  if (dotnetRuntimes.includes(workerRuntime)) {
    const detection = await detectDotnetModel(resolvePath(scriptRoot));
    if (detection.isInProcess) {
      printInProcessError(detection.csprojPath);
      process.exit(1);
    }
  }

  // 5. Create shared host state and start live MCP server
  const hostState = createHostState();

  if (!noMcp) {
    startLiveMcpServer(hostState, parseInt(mcpPort))
      .then((server) => { hostState._mcpServer = server; })
      .catch((err) => {
        console.error(`  ⚠️  MCP server failed to start on port ${mcpPort}: ${err.message}`);
        console.error(`     Use --no-mcp to disable, or --mcp-port <port> to change port.`);
      });
    // Don't await — host startup should not depend on MCP server
  }

  // 6. Launch host
  // Pin the bundle version to what we pre-downloaded, so the host uses exactly that.
  // If bundle resolution failed (offline, no match), fall back to the clamped range.
  let effectiveBundleVersion;
  if (resolvedBundleVersion) {
    // Exact pin: host will find this version cached and use it
    effectiveBundleVersion = `[${resolvedBundleVersion}, ${resolvedBundleVersion}]`;
  } else {
    // Fallback: clamp range if maxExtensionBundleVersion is set
    effectiveBundleVersion = profile.extensionBundleVersion;
    if (profile.maxExtensionBundleVersion) {
      const maxParts = profile.maxExtensionBundleVersion.split('.').map(Number);
      const ceilVersion = `${maxParts[0]}.${maxParts[1]}.${(maxParts[2] || 0) + 1}`;
      const lowerBound = effectiveBundleVersion.match(/^\[([^\],]+)/);
      if (lowerBound) {
        effectiveBundleVersion = `[${lowerBound[1]}, ${ceilVersion})`;
      }
    }
  }

  await launchHost(hostDir, {
    scriptRoot: resolvePath(scriptRoot),
    port,
    workerRuntime,
    extensionBundleVersion: effectiveBundleVersion,
    mergedValues,
    profile,
    verbose,
    hostState,
    noAzurite,
  });
}

async function runSync(args) {
  const target = ['host', 'extensions'].includes(args[0]) ? args[0] : 'all';
  const force = args.includes('--force');
  const keep = parseInt(getFlag(args, '--keep') || String(DEFAULT_KEEP_VERSIONS), 10);
  const sku = getFlag(args, '--sku') || 'flex';
  const profilesSource = getFlag(args, '--profiles');
  if (profilesSource) setProfilesSource(profilesSource);

  if (sku === 'list') {
    await listProfiles();
    return;
  }

  const profile = await resolveProfile(sku);
  profile.name = sku;

  console.log(`Syncing SKU '${sku}' (${profile.displayName})...`);
  if (target === 'all' || target === 'host') {
    await ensureHost(profile, { force, keepVersions: keep });
    console.log('  ✓ Host synchronized.');
  }
  if (target === 'all' || target === 'extensions') {
    const bundle = await ensureBundle(profile, { force, keepVersions: keep });
    console.log(`  ✓ Extensions synchronized (${bundle || 'cached'}).`);
  }

  console.log(`  Retention policy: keep latest ${keep} version(s).`);
}

function printHostDriftWarning(targetHostVersion) {
  const cached = getCachedHostVersions();
  if (cached.length === 0) return;

  const highest = [...cached].sort(compareVersions).pop();
  if (!highest) return;

  if (compareVersions(targetHostVersion, highest) > 0) {
    console.log(`  ℹ️  New host available: ${targetHostVersion} (local latest: ${highest}).`);
    console.log('     Run `fnx sync` or `fnx sync host` to download it.\n');
  } else if (compareVersions(targetHostVersion, highest) < 0) {
    console.log(`  ⚠️  Host rollback detected: local ${highest}, catalog ${targetHostVersion}.`);
    console.log('     Run `fnx sync` or `fnx sync host` to align with the supported version.\n');
  }
}

async function maybeWarnForCliUpgrade() {
  try {
    const pkg = await getFnxPackage();
    const current = pkg.version;
    const cached = await readJsonFile(VERSION_CHECK_FILE);
    const now = Date.now();

    if (cached?.checkedAt && now - new Date(cached.checkedAt).getTime() < VERSION_CHECK_TTL_MS) {
      if (cached.latestVersion && compareVersions(cached.latestVersion, current) > 0) {
        printUpgradeTip(cached.latestVersion);
      }
      return;
    }

    const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/latest`;
    const res = await fetch(registryUrl);
    if (!res.ok) return;
    const latest = await res.json();

    await mkdir(FNX_HOME, { recursive: true });
    await writeFile(VERSION_CHECK_FILE, JSON.stringify({ checkedAt: new Date().toISOString(), latestVersion: latest.version }, null, 2));

    if (latest.version && compareVersions(latest.version, current) > 0) {
      printUpgradeTip(latest.version);
    }
  } catch {
    // non-fatal: offline/private registry/etc.
  }
}

function printUpgradeTip(latestVersion) {
  console.log(`  ℹ️  A newer fnx version is available (${latestVersion}).`);
  console.log('     Run `npm i -g @vrdmr/fnx-test@latest` to upgrade.\n');
}

async function getFnxPackage() {
  const dir = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(await readFile(join(dir, '..', 'package.json'), 'utf-8'));
}

async function startTemplatesMcp() {
  const { runStdioMcpServer } = await import('./mcp-server.js');
  const { getTemplateTools } = await import('./mcp-tools/templates.js');
  const { getSkuTools } = await import('./mcp-tools/sku.js');

  const templateTools = await getTemplateTools();
  const skuTools = getSkuTools();

  await runStdioMcpServer({
    name: 'fnx-templates-mcp',
    version: '0.1.0',
    tools: [...templateTools, ...skuTools],
  });
}

export function getFlag(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

export async function readJsonFile(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function printHelp() {
  console.log(`
Azure Functions Local Emulator (fnx — Phoenix Emulate)
SKU-aware host runtime for local development.

Usage: fnx <action> [-/--options]

Actions:
  start            Launch the Azure Functions host runtime for a specific SKU.
                   Downloads and caches the correct host version automatically.
  sync             Sync cached host/extensions with current catalog profile.
                   Use: fnx sync, fnx sync host, fnx sync extensions.
  warmup           Pre-download host binaries and extension bundles for offline use.
                   Runs automatically as postinstall hook. Use --dry-run to preview.
  templates-mcp    Start the Azure Functions templates MCP server (stdio transport).
                   Drop-in replacement for manvir-templates-mcp-server.
                   Provides 68 templates across 4 languages via MCP protocol.

Options:
  --sku <name>     Target SKU to emulate. Determines which host version runs.
                   Resolution order: CLI flag → app.config.json → local.settings.json → default (flex).
                   Use --sku list to see all available SKUs.
  --scriptroot     Path to the function app directory. Defaults to the current directory.
                   Must contain host.json and either app.config.json or local.settings.json.
  --port <port>    Port for the host HTTP listener. Default: 7071.
  --mcp-port <p>   Port for the live MCP server. Default: host port + 1 (7072).
  --profiles <src> SKU profiles source. Can be:
                   • A URL (http/https) to a profiles JSON endpoint
                   • A local file path to a profiles JSON file
                   • Inline JSON string (e.g. '{"profiles":{...}}')
                   Default: FUNC_PROFILES_URL env var, or http://localhost:4566/api/profiles.
  --keep <n>       For sync only: keep latest N host/bundle versions in cache (default: 2).
  --force          For sync only: re-download assets even if already cached.
  --no-mcp         Disable the live MCP server (host-only mode).
  --no-azurite     Skip automatic Azurite start (for users who manage Azurite separately).
  --verbose        Show all host output (unfiltered). Default: clean output only.
  -v, --version    Display the version of fnx.
  -h, --help       Display this help information.

Available SKUs:
  flex                   Azure Functions Flex Consumption (latest host, default)
  linux-premium          Linux Premium / Elastic Premium
  windows-consumption    Windows Consumption (classic)
  windows-dedicated      Windows Dedicated (App Service Plan)
  linux-consumption      Linux Consumption (retiring)

Supported runtimes: node, python, java, powershell, dotnet-isolated
  (.NET in-process / Microsoft.NET.Sdk.Functions is not supported — isolated worker model only)
`.trim());
}
