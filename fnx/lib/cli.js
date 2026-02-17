import { resolve as resolvePath, dirname, join } from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolveProfile, listProfiles, setProfilesSource, fetchRegistryWithMeta, readProfilesSync } from './profile-resolver.js';
import { ensureHost, ensureBundle, getCachedHostVersions, getCachedBundleVersions, compareVersions, DEFAULT_KEEP_VERSIONS } from './host-manager.js';
import { launchHost, createHostState } from './host-launcher.js';
import { startLiveMcpServer } from './live-mcp-server.js';
import { detectDotnetModel, printInProcessError } from './dotnet-detector.js';
import { detectRuntimeFromConfig, packFunctionApp } from './pack.js';
import { loadConfig, migrateConfig, validateConfig, showResolvedConfig } from './config.js';
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

/**
 * Resolve the function app directory.
 * 1. If --app-path is given, use it — but verify host.json exists.
 * 2. Otherwise check cwd for host.json.
 * 3. Fall back to cwd/src if it contains host.json.
 * 4. Error with actionable message if nothing found.
 *
 * opts.requireHostJson (default: true) — set to false for commands that
 * work on config files only (e.g. fnx config migrate).
 */
function resolveAppPath(args, opts = {}) {
  const requireHostJson = opts.requireHostJson !== false;
  const explicit = getFlag(args, '--app-path');
  if (explicit) {
    const resolved = resolvePath(explicit);
    if (requireHostJson && !existsSync(join(resolved, 'host.json'))) {
      console.error(errorColor(`Error: No host.json found in ${resolved}`));
      console.error(`  The --app-path must point to a directory containing host.json.`);
      console.error(dim(`  Example: fnx start --app-path ./my-function-app`));
      process.exit(1);
    }
    return resolved;
  }

  const cwd = process.cwd();
  if (existsSync(join(cwd, 'host.json'))) {
    return cwd;
  }

  const srcDir = join(cwd, 'src');
  if (existsSync(join(srcDir, 'host.json'))) {
    console.log(info(`  Using function app at ${dim('./src')} (found host.json there)`));
    return srcDir;
  }

  // For config-only commands, fall back to cwd even without host.json
  if (!requireHostJson) {
    return cwd;
  }

  console.error(errorColor(`Error: No function app found.`));
  console.error(`  Could not find host.json in the current directory or ./src.`);
  console.error(dim(`  Use --app-path <dir> to specify the function app location.`));
  process.exit(1);
}

export async function main(args) {
  const cmd = args[0];

  if (cmd === '-h' || cmd === '--help' || cmd === 'help' || !cmd) {
    await printHelpWithVersionInfo();
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

  if (cmd === 'doctor') {
    if (hasHelp(args.slice(1))) { printDoctorHelp(); return; }
    const { runDoctor } = await import('./doctor.js');
    const appPath = resolveAppPath(args, { requireHostJson: false });
    const exitCode = await runDoctor(appPath);
    process.exit(exitCode);
  }

  if (cmd === 'config') {
    if (hasHelp(args.slice(1))) { printConfigHelp(); return; }
    const subCmd = args[1];
    const appPath = resolveAppPath(args, { requireHostJson: false });
    if (subCmd === 'migrate') {
      await migrateConfig(appPath);
    } else if (subCmd === 'validate') {
      const result = await validateConfig(appPath);
      if (result.warnings.length) result.warnings.forEach(w => console.log(warning(`  ⚠ ${w}`)));
      if (result.secrets.length) result.secrets.forEach(s => console.log(errorColor(`  ✗ ${s.path}: ${s.reason}`)));
      if (result.errors.length) result.errors.forEach(e => console.log(errorColor(`  ✗ ${e}`)));
      if (result.valid) console.log(success('  ✓ app-config.yaml is valid.'));
      else process.exit(1);
    } else {
      await showResolvedConfig(appPath);
    }
    return;
  }

  if (cmd === 'sync') {
    if (hasHelp(args.slice(1))) { printSyncHelp(); return; }
    await runSync(args.slice(1));
    return;
  }

  if (cmd === 'pack') {
    if (hasHelp(args.slice(1))) { printPackHelp(); return; }
    const scriptRoot = resolveAppPath(args);
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

  // Handle --sku list early (no config needed)
  if (getFlag(args, '--sku') === 'list') {
    await listProfiles();
    return;
  }

  await maybeWarnForCliUpgrade();

  const scriptRoot = resolveAppPath(args);
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

  // Load and validate app configuration (app-config.yaml + local.settings.json)
  const appCfg = await loadConfig(scriptRoot);
  const { mergedValues, workerRuntime } = appCfg;

  if (!workerRuntime) {
    console.error(errorColor('Error: runtime.name not set in app-config.yaml and FUNCTIONS_WORKER_RUNTIME not in local.settings.json'));
    process.exit(1);
  }

  // Resolve SKU: CLI flag > app-config.yaml > default "flex"
  let sku = getFlag(args, '--sku');
  let skuSource = 'CLI flag';

  if (!sku && appCfg.sku) {
    sku = appCfg.sku;
    skuSource = appCfg.skuSource;
  }
  if (!sku) {
    sku = 'flex';
    skuSource = 'default';
    console.log(info(`No --sku specified, defaulting to '${sku}'.`));
    console.log(dim(`Tip: Use --sku <name> to target a specific SKU. Run --sku list to see options.\n`));
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

async function printHelpWithVersionInfo() {
  const pkg = await getFnxPackage();
  const cachedHosts = getCachedHostVersions().sort(compareVersions);
  const cachedBundles = getCachedBundleVersions().sort(compareVersions);

  // Build SKU → host version map from cached/bundled profiles (no network)
  const registry = readProfilesSync();
  const hostToSkus = {};
  if (registry?.profiles) {
    for (const [sku, p] of Object.entries(registry.profiles)) {
      const v = p.hostVersion;
      if (!hostToSkus[v]) hostToSkus[v] = [];
      hostToSkus[v].push(sku);
    }
  }

  // Fire-and-forget: refresh profile cache in background.
  // Won't block -h — process.exit() will terminate regardless.
  fetchRegistryWithMeta().catch(() => {});

  console.log(`
${bold(title('Azure Functions Local Emulator (fnx — Phoenix Emulate)'))}
${dim('fnx Version:')}        ${title(pkg.version)}`);

  if (cachedHosts.length) {
    console.log(`${dim('Cached Hosts:')}       ${cachedHosts.map((v) => {
      const skus = hostToSkus[v];
      return skus ? `${info(v)} ${dim('(' + skus.join(', ') + ')')}` : info(v);
    }).join(', ')}`);
  } else {
    console.log(`${dim('Cached Hosts:')}       ${dim('(none — run fnx warmup)')}`);
  }

  if (cachedBundles.length) {
    console.log(`${dim('Cached Bundles:')}     ${cachedBundles.map((v) => info(v)).join(', ')}`);
  }

  console.log();
  printHelp();
}

function printHelp() {
  console.log(`${title('Usage:')} fnx <command> [options]

${title('Commands:')}
  ${funcName('start')}            Launch the Azure Functions host runtime for a specific SKU.
  ${funcName('doctor')}           Validate project setup and diagnose common issues.
  ${funcName('sync')}             Sync cached host/extensions with current catalog profile.
  ${funcName('pack')}             Package a Functions app into a deployment zip.
  ${funcName('config')}           Show, validate, or migrate app configuration.
  ${funcName('warmup')}           Pre-download host binaries and extension bundles.
  ${funcName('templates-mcp')}    Start the Azure Functions templates MCP server (stdio).

  Run ${dim('fnx <command> -h')} for command-specific options.

${title('Common Options:')}
  ${success('--sku')} <name>     Target SKU to emulate (default: flex).
                    Use ${success('--sku list')} to see all available SKUs.
  ${success('--verbose')}        Show all host output (unfiltered).
  ${success('-v')}, ${success('--version')}    Display the version of fnx.
  ${success('-h')}, ${success('--help')}       Display this help information.

${title('Start Options:')}      ${dim('(fnx start)')}
  ${success('--app-path')} <dir>  Path to the function app directory (default: cwd).
  ${success('--port')} <port>       Port for the host HTTP listener (default: 7071).
  ${success('--mcp-port')} <port>   Port for the live MCP server (default: host port + 1).
  ${success('--no-mcp')}            Disable the live MCP server.
  ${success('--no-azurite')}        Skip automatic Azurite start.

${title('Sync Options:')}       ${dim('(fnx sync [host|extensions])')}
  ${success('--keep')} <n>          Keep latest N versions in cache (default: 2).
  ${success('--force')}             Re-download even if already cached.

${title('Pack Options:')}       ${dim('(fnx pack)')}
  ${success('--app-path')} <dir>  Path to the function app directory (default: cwd).
  ${success('--runtime')} <name>    Runtime identifier (default: auto-detected from config).
  ${success('--output')} <file>     Output zip path (default: <app-name>.zip).
  ${success('--no-build')}          Skip build steps for java/dotnet-isolated.

${title('Available SKUs:')}
  ${funcName('flex')}                   Flex Consumption (latest host, default)
  ${funcName('linux-premium')}          Linux Premium / Elastic Premium
  ${funcName('windows-consumption')}    Windows Consumption (classic)
  ${funcName('windows-dedicated')}      Windows Dedicated (App Service Plan)
  ${funcName('linux-consumption')}      Linux Consumption (retiring)

${title('Examples:')}
  fnx start                              Start with default SKU (flex)
  fnx start --sku windows-consumption    Emulate Windows Consumption
  fnx start --sku flex --port 8080       Custom port
  fnx doctor                             Validate project setup
  fnx pack --app-path ./my-app         Package function app as zip
  fnx sync host --force                  Force re-download host binary
  fnx warmup --all                       Pre-download all SKUs
  fnx templates-mcp                      Start templates MCP server

${dim('Advanced Options:')}
  ${success('--profiles')} <src> Override SKU profiles source. Can be a URL, local file path,
                    or inline JSON. Default: CDN → cached → bundled.
                    Set FUNC_PROFILES_URL env var for persistent override.`.trim());
}

function printStartHelp() {
  console.log(`
${bold(title('fnx start'))} — Launch the Azure Functions host runtime.

${title('Usage:')} fnx start [options]

${title('Options:')}
  ${success('--sku')} <name>       Target SKU to emulate (default: flex). Use ${success('--sku list')} to see options.
  ${success('--app-path')} <dir> Path to the function app directory (default: cwd).
  ${success('--port')} <port>      Port for the host HTTP listener (default: 7071).
  ${success('--mcp-port')} <port>  Port for the live MCP server (default: host port + 1).
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
  ${success('--app-path')} <dir> Path to the function app directory (default: cwd).
  ${success('--runtime')} <name>   Runtime identifier (default: auto-detected from config).
  ${success('--output')} <file>    Output zip path (default: <app-name>.zip).
  ${success('--no-build')}         Skip build steps for java/dotnet-isolated.
  ${success('-h')}, ${success('--help')}         Show this help message.

${title('Supported runtimes:')} node, python, java, powershell, dotnet-isolated

${title('Examples:')}
  fnx pack                              Package current directory
  fnx pack --app-path ./my-app        Package a specific app
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

function printConfigHelp() {
  console.log(`
${bold(title('fnx config'))} — Show, validate, or migrate app configuration.

${title('Usage:')} fnx config [subcommand] [options]

${title('Subcommands:')}
  ${funcName('(none)')}           Show resolved config with provenance (which file each value comes from).
  ${funcName('migrate')}          Create app-config.yaml from local.settings.json (extract non-secrets).
  ${funcName('validate')}         Validate app-config.yaml (schema, secrets, allowlist) without starting.

${title('Options:')}
  ${success('--app-path')} <dir>  Path to the function app directory (default: cwd).
  ${success('-h')}, ${success('--help')}         Show this help message.

${title('Configuration Files:')}
  ${funcName('app-config.yaml')}       Non-secret behavioral config (committed to source control).
                          Contains runtime, SKU target, scale settings, and app settings.
  ${funcName('local.settings.json')}   Secrets and connection strings (git-ignored).
                          Values here override app-config.yaml values.

${title('Precedence:')} CLI flags > local.settings.json > app-config.yaml > defaults

${title('Examples:')}
  fnx config                               Show resolved config
  fnx config migrate                       Create app-config.yaml from local.settings.json
  fnx config validate                      Check app-config.yaml for errors
  fnx config validate --app-path ./my-app  Validate a specific app`.trim());
}

function printDoctorHelp() {
  console.log(`
${bold(title('fnx doctor'))} — Validate project setup and diagnose common issues.

${title('Usage:')} fnx doctor [options]

${title('Checks:')}
  • host.json             Present and valid (version 2.0)
  • app-config.yaml       Schema valid, no secrets, runtime configured
  • local.settings.json   Present and valid JSON
  • Worker runtime        Detected from config files
  • Host cache            Cached host binaries in ~/.fnx/hosts/
  • Default ports         7071 (HTTP) and 7072 (MCP) availability
  • Azurite               Storage emulator status

${title('Options:')}
  ${success('--app-path')} <dir>  Path to the function app directory (default: cwd).
  ${success('-h')}, ${success('--help')}         Show this help message.

${title('Exit Codes:')}
  ${success('0')}   All checks passed (or warnings only)
  ${errorColor('1')}   One or more checks failed

${title('Examples:')}
  fnx doctor                             Check current directory
  fnx doctor --app-path ./my-app         Check a specific app`.trim());
}
