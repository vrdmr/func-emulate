import { resolve as resolvePath, dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolveProfile, listProfiles, setProfilesSource } from './profile-resolver.js';
import { ensureHost, ensureBundle } from './host-manager.js';
import { launchHost, createHostState } from './host-launcher.js';
import { startLiveMcpServer } from './live-mcp-server.js';
import { detectDotnetModel, printInProcessError } from './dotnet-detector.js';

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
    console.log(`fnx v${pkg.version}`);
    process.exit(0);
  }

  if (cmd === 'templates-mcp') {
    await startTemplatesMcp();
    return;
  }

  if (cmd !== 'start') {
    console.error(`Unknown command: ${cmd}\n`);
    printHelp();
    process.exit(1);
  }

  const scriptRoot = getFlag(args, '--scriptroot') || process.cwd();
  const port = getFlag(args, '--port') || '7071';
  const mcpPort = getFlag(args, '--mcp-port') || String(parseInt(port) + 1);
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
  const profile = await resolveProfile(sku);
  console.log(`  Target SKU:        ${profile.displayName}`);
  console.log(`  Host Version:      ${profile.hostVersion}`);
  console.log(`  Extension Bundle:  ${profile.extensionBundleVersion}`);
  if (profile.maxExtensionBundleVersion) {
    console.log(`  Max Bundle Cap:    ${profile.maxExtensionBundleVersion}`);
  }
  console.log();

  // 2. Ensure host is downloaded
  const hostDir = await ensureHost(profile);
  console.log(`  Host path:         ${hostDir}`);

  // 3. Pre-download the correct extension bundle for this SKU
  //    This resolves the exact version from CDN index, capped by maxExtensionBundleVersion,
  //    and downloads it so the host finds it cached and never fetches a wrong version.
  const resolvedBundleVersion = await ensureBundle(profile);
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
    startLiveMcpServer(hostState, parseInt(mcpPort)).catch((err) => {
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

async function startTemplatesMcp() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const templatesMcpDir = join(__dirname, '..', 'templates-mcp');
  const templatesRoot = join(templatesMcpDir, 'templates');

  // Import from templates-mcp's own dist (it has the MCP SDK in its node_modules)
  const { createServer, validateTemplates, logValidationResult } = await import('../templates-mcp/dist/src/server-factory.js');

  // Validate templates on startup
  const validationResult = await validateTemplates(templatesRoot, false);
  logValidationResult(validationResult);

  const server = createServer({
    name: 'fnx-templates-mcp',
    version: '0.1.0',
    templatesRoot,
  });

  // Use dynamic import to resolve StdioServerTransport from templates-mcp's node_modules
  const { createRequire } = await import('node:module');
  const require = createRequire(join(templatesMcpDir, 'package.json'));
  const sdkPath = require.resolve('@modelcontextprotocol/sdk/server/stdio.js');
  const { StdioServerTransport } = await import(sdkPath);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async (signal) => {
    console.error(`[INFO] Received ${signal}, shutting down...`);
    try { await server.close(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
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
Azure Functions Local Emulator (fnx — Phoenix Emulate)
SKU-aware host runtime for local development.

Usage: fnx <action> [-/--options]

Actions:
  start            Launch the Azure Functions host runtime for a specific SKU.
                   Downloads and caches the correct host version automatically.
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
  --no-mcp         Disable the live MCP server (host-only mode).
  --no-azurite     Skip automatic Azurite start (for users who manage Azurite separately).
  --profiles <src> SKU profiles source. Can be:
                   • A URL (http/https) to a profiles JSON endpoint
                   • A local file path to a profiles JSON file
                   • Inline JSON string (e.g. '{"profiles":{...}}')
                   Default: FUNC_PROFILES_URL env var, or http://localhost:4566/api/profiles.
  --verbose        Show all host output (unfiltered). Default: clean output only.
  -v, --version    Display the version of fnx.
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
  fnx start                           Start with default SKU (flex) in current directory
  fnx start --sku flex                Emulate Flex Consumption
  fnx start --sku windows-consumption Emulate Windows Consumption (older host version)
  fnx start --sku list                List all available SKU profiles with host versions
  fnx start --sku flex --port 8080    Start on a custom port
  fnx start --scriptroot ./my-app     Start from a specific function app directory

Side-by-side comparison:
  # Terminal 1: Run as Flex Consumption
  fnx start --sku flex --port 7071

  # Terminal 2: Run as Windows Consumption (different host version)
  fnx start --sku windows-consumption --port 7072

  # Compare behavior across SKUs with the same function app!

MCP server (for VS Code Copilot / AI assistants):
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
  #     "fnx-live": {
  #       "type": "http",
  #       "url": "http://127.0.0.1:7072/mcp"
  #     }
  #   }
  # }

Supported runtimes: node, python, java, powershell, dotnet-isolated
  (.NET in-process / Microsoft.NET.Sdk.Functions is not supported — isolated worker model only)
`.trim());
}
