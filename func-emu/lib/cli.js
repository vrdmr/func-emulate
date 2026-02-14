import { resolve as resolvePath } from 'node:path';
import { readFile } from 'node:fs/promises';
import { resolveProfile, listProfiles } from './profile-resolver.js';
import { ensureHost } from './host-manager.js';
import { launchHost } from './host-launcher.js';

export async function main(args) {
  const cmd = args[0];

  if (cmd !== 'start') {
    console.log('Usage: func-emu start [--sku <sku-name>] [--scriptroot <path>] [--port <port>]');
    console.log('       func-emu start --sku list');
    process.exit(1);
  }

  const scriptRoot = getFlag(args, '--scriptroot') || process.cwd();
  const port = getFlag(args, '--port') || '7071';

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
