import { resolve as resolvePath } from 'node:path';
import { readFile } from 'node:fs/promises';
import { resolveProfile, listProfiles } from './profile-resolver.js';
import { ensureHost } from './host-manager.js';
import { launchHost } from './host-launcher.js';

export async function main(args) {
  const cmd = args[0];

  if (cmd === '-h' || cmd === '--help' || cmd === 'help' || !cmd) {
    printHelp();
    process.exit(cmd ? 0 : 1);
  }

  if (cmd === '-v' || cmd === '--version') {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(dir, '..', 'package.json'), 'utf-8'));
    console.log(`func-emu v${pkg.version}`);
    process.exit(0);
  }

  if (cmd !== 'start') {
    console.error(`Unknown command: ${cmd}\n`);
    printHelp();
    process.exit(1);
  }

  const scriptRoot = getFlag(args, '--scriptroot') || process.cwd();
  const port = getFlag(args, '--port') || '7071';
  const verbose = args.includes('--verbose');

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
  const profile = await resolveProfile(sku);
  console.log(`  Target SKU:        ${profile.displayName}`);
  console.log(`  Host Version:      ${profile.hostVersion}`);
  console.log(`  Extension Bundle:  ${profile.extensionBundleVersion}`);
  console.log();

  // 2. Ensure host is downloaded
  const hostDir = await ensureHost(profile);
  console.log(`  Host path:         ${hostDir}`);
  console.log();

  // 3. Merge config: app.config.json Values + local.settings.json Values
  const mergedValues = {
    ...(appConfig?.Values || {}),
    ...(localSettings?.Values || {}),
  };

  const workerRuntime = mergedValues.FUNCTIONS_WORKER_RUNTIME;

  if (!workerRuntime) {
    console.error('Error: FUNCTIONS_WORKER_RUNTIME not set in app.config.json or local.settings.json');
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
    mergedValues,
    profile,
    verbose,
  });
}

function getFlag(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function printHelp() {
  console.log(`
Azure Functions Local Emulator (func-emu)
SKU-aware host runtime for local development.

Usage: func-emu <action> [-/--options]

Actions:
  start            Launch the Azure Functions host runtime for a specific SKU.
                   Downloads and caches the correct host version automatically.

Options:
  --sku <name>     Target SKU to emulate. Determines which host version runs.
                   Resolution order: CLI flag → app.config.json → local.settings.json → default (flex).
                   Use --sku list to see all available SKUs.
  --scriptroot     Path to the function app directory. Defaults to the current directory.
                   Must contain host.json and either app.config.json or local.settings.json.
  --port <port>    Port for the host HTTP listener. Default: 7071.
  --verbose        Show all host output (unfiltered). Default: clean output only.
  -v, --version    Display the version of func-emu.
  -h, --help       Display this help information.

Available SKUs:
  flex                   Azure Functions Flex Consumption (latest host, default)
  linux-premium          Linux Premium / Elastic Premium
  windows-consumption    Windows Consumption (classic)
  windows-dedicated      Windows Dedicated (App Service Plan)
  linux-consumption      Linux Consumption (retiring)

Configuration:
  app.config.json        Non-secret app settings (committed to source control).
                         Contains TargetSku and Values (e.g. FUNCTIONS_WORKER_RUNTIME).
  local.settings.json    Secrets and connection strings (git-ignored).
                         Values here override app.config.json Values.

  Config values from both files are merged and injected as environment
  variables into the host process. local.settings.json values take precedence.

Examples:
  func-emu start                           Start with default SKU (flex) in current directory
  func-emu start --sku flex                Emulate Flex Consumption
  func-emu start --sku windows-consumption Emulate Windows Consumption (older host version)
  func-emu start --sku list                List all available SKU profiles with host versions
  func-emu start --sku flex --port 8080    Start on a custom port
  func-emu start --scriptroot ./my-app     Start from a specific function app directory

Side-by-side comparison:
  # Terminal 1: Run as Flex Consumption
  func-emu start --sku flex --port 7071

  # Terminal 2: Run as Windows Consumption (different host version)
  func-emu start --sku windows-consumption --port 7072

  # Compare behavior across SKUs with the same function app!

Supported runtimes: node, python, java, powershell
  (dotnet/dotnet-isolated use in-process hosting and are not supported in this POC)
`.trim());
}
