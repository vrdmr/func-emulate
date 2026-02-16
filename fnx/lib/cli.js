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
import { detectRuntimeFromConfig, packFunctionApp } from './pack.js';
import { title, info, funcName, url as urlColor, success, error as errorColor, warning, dim, bold, highlightUrls } from './colors.js';

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

function hasHelp(args) {
  return args.includes('-h') || args.includes('--help');
}

export async function main(args) {
  const cmd = args[0];

  if (cmd === '-h' || cmd === '--help' || cmd === 'help' || !cmd) {
    printHelp();
    process.exit(cmd ? 0 : 1);
  }

  if (cmd === '-v' || cmd === '--version') {
    const pkg = await getFnxPackage();
    console.log(title(`fnx v${pkg.version}`));
    process.exit(0);
  }

  if (cmd === 'templates-mcp') {
    if (hasHelp(args.slice(1))) { printTemplatesMcpHelp(); return; }
    await startTemplatesMcp();
    return;
  }

  if (cmd === 'warmup') {
    if (hasHelp(args.slice(1))) { printWarmupHelp(); return; }
    const { warmup } = await import('./warmup.js');
    await warmup(args.slice(1));
    return;
  }

  if (cmd === 'sync') {
    if (hasHelp(args.slice(1))) { printSyncHelp(); return; }
    await runSync(args.slice(1));
    return;
  }

  if (cmd === 'pack') {
    if (hasHelp(args.slice(1))) { printPackHelp(); return; }
    const scriptRoot = getFlag(args, '--scriptroot') || process.cwd();
    const runtime = getFlag(args, '--runtime') || await detectRuntimeFromConfig(scriptRoot);
    const outputPath = getFlag(args, '--output');
    const noBuild = args.includes('--no-build');
    await packFunctionApp({ scriptRoot, runtime, outputPath, noBuild });
    return;
  }

  if (cmd !== 'start') {
    console.error(errorColor(`Unknown command: ${cmd}\n`));
    printHelp();
    process.exit(1);
  }

  if (hasHelp(args.slice(1))) { printStartHelp(); return; }

  await maybeWarnForCliUpgrade();

  const scriptRoot = getFlag(args, '--scriptroot') || process.cwd();
  const requestedPort = parseInt(getFlag(args, '--port') || '7071');
  const port = await findOpenPort(requestedPort);
  if (port !== requestedPort) {
    console.log(warning(`  Port ${requestedPort} in use, using ${port} instead.`));
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
    console.log(info(`No --sku specified, defaulting to '${sku}'.`));
    console.log(dim(`Tip: Use --sku <name> to target a specific SKU. Run --sku list to see options.\n`));
  }

  if (sku === 'list') {
    await listProfiles();
    return;
  }

  // 1. Resolve profile
  if (skuSource !== 'default') {
    console.log(title(`Resolving SKU profile: ${sku} (from ${skuSource})...`));
  } else {
    console.log(title(`Resolving SKU profile: ${sku}...`));
  }

  const { registry, source } = await fetchRegistryWithMeta();
  const profile = registry.profiles[sku];
  if (!profile) {
    const valid = Object.keys(registry.profiles).join(', ');
    throw new Error(`Unknown SKU '${sku}'. Available: ${valid}`);
  }

  profile.name = sku;
  console.log(`  ${dim('Target SKU:')}        ${info(profile.displayName)}`);
  console.log(`  ${dim('Host Version:')}      ${info(profile.hostVersion)}`);
  console.log(`  ${dim('Extension Bundle:')}  ${info(profile.extensionBundleVersion)}`);
  if (profile.maxExtensionBundleVersion) {
    console.log(`  ${dim('Max Bundle Cap:')}    ${info(profile.maxExtensionBundleVersion)}`);
  }
  console.log(`  ${dim('Profile Source:')}    ${info(source)}`);
  console.log();

  // Early validation: merge config and check runtime before downloading anything
  const mergedValues = {
    ...(appConfig?.Values || {}),
    ...(localSettings?.Values || {}),
  };

  const workerRuntime = mergedValues.FUNCTIONS_WORKER_RUNTIME;

  if (!workerRuntime) {
    console.error(errorColor('Error: FUNCTIONS_WORKER_RUNTIME not set in app.config.json or local.settings.json'));
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

  printHostDriftWarning(profile.hostVersion);

  // 2. Ensure host is downloaded
  const hostDir = await ensureHost(profile, { keepVersions: DEFAULT_KEEP_VERSIONS });
  console.log(`  ${dim('Host path:')}         ${info(hostDir)}`);

  // 3. Pre-download the correct extension bundle for this SKU
  //    This resolves the exact version from CDN index, capped by maxExtensionBundleVersion,
  //    and downloads it so the host finds it cached and never fetches a wrong version.
  const resolvedBundleVersion = await ensureBundle(profile, { keepVersions: DEFAULT_KEEP_VERSIONS });
  if (resolvedBundleVersion) {
    console.log(`  ${dim('Bundle resolved:')}   ${info(resolvedBundleVersion)}`);
  }
  console.log();

  // 4. Create shared host state and start live MCP server
  const hostState = createHostState();

  if (!noMcp) {
    startLiveMcpServer(hostState, parseInt(mcpPort))
      .then((server) => { hostState._mcpServer = server; })
      .catch((err) => {
        console.error(warning(`  ⚠️  MCP server failed to start on port ${mcpPort}: ${err.message}`));
        console.error(dim(`     Use --no-mcp to disable, or --mcp-port <port> to change port.`));
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

  console.log(title(`Syncing SKU '${sku}' (${profile.displayName})...`));
  if (target === 'all' || target === 'host') {
    await ensureHost(profile, { force, keepVersions: keep });
    console.log(success('  ✓ Host synchronized.'));
  }
  if (target === 'all' || target === 'extensions') {
    const bundle = await ensureBundle(profile, { force, keepVersions: keep });
    console.log(success(`  ✓ Extensions synchronized (${bundle || 'cached'}).`));
  }

  console.log(dim(`  Retention policy: keep latest ${keep} version(s).`));
}

function printHostDriftWarning(targetHostVersion) {
  const cached = getCachedHostVersions();
  if (cached.length === 0) return;

  const highest = [...cached].sort(compareVersions).pop();
  if (!highest) return;

  if (compareVersions(targetHostVersion, highest) > 0) {
    console.log(info(`  ℹ️  New host available: ${targetHostVersion} (local latest: ${highest}).`));
    console.log(dim('     Run `fnx sync` or `fnx sync host` to download it.\n'));
  } else if (compareVersions(targetHostVersion, highest) < 0) {
    console.log(warning(`  ⚠️  Host rollback detected: local ${highest}, catalog ${targetHostVersion}.`));
    console.log(dim('     Run `fnx sync` or `fnx sync host` to align with the supported version.\n'));
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
  console.log(info(`  ℹ️  A newer fnx version is available (${latestVersion}).`));
  console.log(dim('     Run `npm i -g @vrdmr/fnx-test@latest` to upgrade.\n'));
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
${bold(title('Azure Functions Local Emulator (fnx — Phoenix Emulate)'))}
SKU-aware host runtime for local development.

${title('Usage:')} fnx <action> [-/--options]

${title('Actions:')}
  ${funcName('start')}            Launch the Azure Functions host runtime for a specific SKU.
                    Downloads and caches the correct host version automatically.
  ${funcName('sync')}             Sync cached host/extensions with current catalog profile.
                    Use: fnx sync, fnx sync host, fnx sync extensions.
  ${funcName('pack')}             Package a Functions app into a deployment zip (func pack equivalent).
                    Supports python, node, java, powershell, and dotnet-isolated.
  ${funcName('warmup')}           Pre-download host binaries and extension bundles for offline use.
                    Runs automatically as postinstall hook. Use --dry-run to preview.
  ${funcName('templates-mcp')}    Start the Azure Functions templates MCP server (stdio transport).
                    Drop-in replacement for manvir-templates-mcp-server.
                    Provides 68 templates across 4 languages via MCP protocol.

${title('Options:')}
  ${success('--sku')} <name>     Target SKU to emulate. Determines which host version runs.
                    Resolution order: CLI flag → app.config.json → local.settings.json → default (flex).
                    Use --sku list to see all available SKUs.
  ${success('--scriptroot')}     Path to the function app directory. Defaults to the current directory.
                    Must contain host.json and either app.config.json or local.settings.json.
  ${success('--port')} <port>    Port for the host HTTP listener. Default: 7071.
  ${success('--mcp-port')} <p>   Port for the live MCP server. Default: host port + 1 (7072).
  ${success('--profiles')} <src> SKU profiles source. Can be:
                    • A URL (http/https) to a profiles JSON endpoint
                    • A local file path to a profiles JSON file
                    • Inline JSON string (e.g. '{"profiles":{...}}')
                    Default: FUNC_PROFILES_URL env var, or ${urlColor('http://localhost:4566/api/profiles')}.
  ${success('--keep')} <n>       For sync only: keep latest N host/bundle versions in cache (default: 2).
  ${success('--force')}          For sync only: re-download assets even if already cached.
  ${success('--no-mcp')}         Disable the live MCP server (host-only mode).
  ${success('--no-azurite')}     Skip automatic Azurite start (for users who manage Azurite separately).
  ${success('--verbose')}        Show all host output (unfiltered). Default: clean output only.
  ${success('--runtime')} <name> Runtime used by pack. If omitted, reads FUNCTIONS_WORKER_RUNTIME
                    from app.config.json/local.settings.json.
  ${success('--output')} <file>  Output zip path for pack. Default: <scriptroot-name>.zip.
  ${success('--no-build')}       Skip build steps for java/dotnet-isolated during pack.
  ${success('-v')}, ${success('--version')}    Display the version of fnx.
  ${success('-h')}, ${success('--help')}       Display this help information.

${title('Available SKUs:')}
  ${funcName('flex')}                   Azure Functions Flex Consumption (latest host, default)
  ${funcName('linux-premium')}          Linux Premium / Elastic Premium
  ${funcName('windows-consumption')}    Windows Consumption (classic)
  ${funcName('windows-dedicated')}      Windows Dedicated (App Service Plan)
  ${funcName('linux-consumption')}      Linux Consumption (retiring)

${title('Configuration:')}
  app.config.json        Non-secret app settings (committed to source control).
                          Contains TargetSku and Values (e.g. FUNCTIONS_WORKER_RUNTIME).
  local.settings.json    Secrets and connection strings (git-ignored).
                          Values here override app.config.json Values.

  Config values from both files are merged and injected as environment
  variables into the host process. local.settings.json values take precedence.

${title('Examples:')}
  fnx start                           Start with default SKU (flex) in current directory
  fnx start --sku flex                Emulate Flex Consumption
  fnx start --sku windows-consumption Emulate Windows Consumption (older host version)
  fnx start --sku list                List all available SKU profiles with host versions
  fnx start --sku flex --port 8080    Start on a custom port
  fnx start --scriptroot ./my-app     Start from a specific function app directory
  fnx pack --scriptroot ./my-app      Package function app as zip deployment artifact

${title('Side-by-side comparison:')}
  # Terminal 1: Run as Flex Consumption
  fnx start --sku flex --port 7071

  # Terminal 2: Run as Windows Consumption (different host version)
  fnx start --sku windows-consumption --port 7072

  # Compare behavior across SKUs with the same function app!

${title('MCP server')} (for VS Code Copilot / AI assistants):
  fnx templates-mcp                    Start templates MCP server (stdio)
  fnx start                            Also starts live MCP server on port+1
  fnx start --mcp-port 9000            Live MCP server on custom port
  fnx start --no-mcp                   Disable live MCP server

  # .vscode/mcp.json — templates only (stdio):
  # {
  #   "servers": {
  #     "azure-functions-templates": {
  #       "type": "stdio",
  #       "command": "fnx",
  #       "args": ["templates-mcp"]
  #     }
  #   }
  # }
  #
  # .vscode/mcp.json — live host data (when fnx start is running):
  # {
  #   "servers": {
  #     "fnx-functions-debug": {
  #       "type": "http",
  #       "url": "${urlColor('http://127.0.0.1:7072/mcp')}"
  #     }
  #   }
  # }

Supported runtimes: node, python, java, powershell, dotnet-isolated
  (.NET in-process / Microsoft.NET.Sdk.Functions is not supported — isolated worker model only)`.trim());
}

function printStartHelp() {
  console.log(`
${bold(title('fnx start'))} — Launch the Azure Functions host runtime.

${title('Usage:')} fnx start [options]

${title('Options:')}
  ${success('--sku')} <name>       Target SKU to emulate (default: flex). Use ${success('--sku list')} to see options.
  ${success('--scriptroot')} <dir> Path to the function app directory (default: cwd).
  ${success('--port')} <port>      Port for the host HTTP listener (default: 7071).
  ${success('--mcp-port')} <port>  Port for the live MCP server (default: host port + 1).
  ${success('--profiles')} <src>   Custom SKU profiles source (URL, file path, or inline JSON).
  ${success('--verbose')}          Show all host output (unfiltered).
  ${success('--no-mcp')}           Disable the live MCP server.
  ${success('--no-azurite')}       Skip automatic Azurite start.
  ${success('-h')}, ${success('--help')}         Show this help message.

${title('Examples:')}
  fnx start                           Start with default SKU (flex)
  fnx start --sku flex --port 8080    Custom port
  fnx start --sku windows-consumption Emulate Windows Consumption
  fnx start --verbose                 Show all host output`.trim());
}

function printSyncHelp() {
  console.log(`
${bold(title('fnx sync'))} — Sync cached host/extensions with current catalog profile.

${title('Usage:')} fnx sync [host|extensions] [options]

${title('Options:')}
  ${success('--sku')} <name>       Target SKU to sync (default: flex). Use ${success('--sku list')} to see options.
  ${success('--keep')} <n>         Keep latest N versions in cache (default: 2).
  ${success('--force')}            Re-download even if already cached.
  ${success('--profiles')} <src>   Custom SKU profiles source.
  ${success('-h')}, ${success('--help')}         Show this help message.

${title('Examples:')}
  fnx sync                  Sync host and extensions for default SKU
  fnx sync host             Sync host only
  fnx sync extensions       Sync extensions only
  fnx sync --force          Force re-download`.trim());
}

function printPackHelp() {
  console.log(`
${bold(title('fnx pack'))} — Package a Functions app into a deployment zip.

${title('Usage:')} fnx pack [options]

${title('Options:')}
  ${success('--scriptroot')} <dir> Path to the function app directory (default: cwd).
  ${success('--runtime')} <name>   Runtime identifier (default: auto-detected from config).
  ${success('--output')} <file>    Output zip path (default: <app-name>.zip).
  ${success('--no-build')}         Skip build steps for java/dotnet-isolated.
  ${success('-h')}, ${success('--help')}         Show this help message.

${title('Supported runtimes:')} node, python, java, powershell, dotnet-isolated

${title('Examples:')}
  fnx pack                              Package current directory
  fnx pack --scriptroot ./my-app        Package a specific app
  fnx pack --runtime python --no-build  Skip build step`.trim());
}

function printWarmupHelp() {
  console.log(`
${bold(title('fnx warmup'))} — Pre-download host binaries and extension bundles for offline use.

${title('Usage:')} fnx warmup [options]

${title('Options:')}
  ${success('--sku')} <name>     Target SKU to warm (default: flex). Use ${success('--sku list')} to see options.
  ${success('--all')}            Warm ALL available SKUs (useful for CI/build agents).
  ${success('--dry-run')}        Show what would be downloaded without actually downloading.
  ${success('--force')}          Re-download even if already cached.
  ${success('-h')}, ${success('--help')}       Show this help message.

${title('Environment Variables:')}
  FNX_SKIP_DOWNLOAD=1       Skip warmup entirely (useful for CI/Docker).
  FNX_DEFAULT_SKU=<name>    Warm a specific SKU instead of flex.

${title('Examples:')}
  fnx warmup                            Pre-download default SKU (flex)
  fnx warmup --all                      Warm ALL SKUs
  fnx warmup --dry-run                  Show what would be downloaded
  fnx warmup --force                    Re-download even if cached`.trim());
}

function printTemplatesMcpHelp() {
  console.log(`
${bold(title('fnx templates-mcp'))} — Start the Azure Functions templates MCP server.

${title('Usage:')} fnx templates-mcp

Starts a stdio-based MCP server that provides Azure Functions templates
and SKU profile information to AI assistants (VS Code Copilot, etc.).

${title('Features:')}
  • 68 templates across 4 languages (JavaScript, TypeScript, Python, C#)
  • SKU profile listing and resolution tools
  • Drop-in replacement for manvir-templates-mcp-server

${title('VS Code Configuration:')}
  Add to .vscode/mcp.json:
  {
    "servers": {
      "azure-functions-templates": {
        "type": "stdio",
        "command": "fnx",
        "args": ["templates-mcp"]
      }
    }
  }`.trim());
}
