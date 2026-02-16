import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { resolveProfile, listProfiles, fetchRegistryWithMeta } from './profile-resolver.js';
import { ensureHost, ensureBundle, getHostExeName, getPlatformRid } from './host-manager.js';
import { title, info, success, warning, dim } from './colors.js';

const FNX_DIR = join(homedir(), '.fnx');
const META_FILE = join(FNX_DIR, '_meta.json');
const HOST_CACHE = join(FNX_DIR, 'hosts');
const BUNDLE_CACHE = join(FNX_DIR, 'bundles');
const BUNDLE_ID = 'Microsoft.Azure.Functions.ExtensionBundle';

function getFlag(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

export async function warmup(args) {
  try {
    await runWarmup(args);
  } catch (err) {
    // Never crash — postinstall must not break npm install
    console.error(`fnx warmup: ${err.message}`);
  }
}

async function runWarmup(args) {
  if (args.includes('-h') || args.includes('--help')) {
    printWarmupHelp();
    return;
  }

  if (process.env.FNX_SKIP_DOWNLOAD === '1') {
    console.log('fnx warmup: skipped (FNX_SKIP_DOWNLOAD=1)');
    return;
  }

  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const all = args.includes('--all');
  let sku = getFlag(args, '--sku');

  if (sku === 'list') {
    await listProfiles();
    return;
  }

  let targetSkus;
  if (all) {
    targetSkus = await getAllSkuNames();
  } else {
    sku = sku || process.env.FNX_DEFAULT_SKU || 'flex';
    targetSkus = [sku];
  }

  const rid = getPlatformRid();

  console.log();
  console.log(title(`fnx warmup — pre-downloading assets for ${all ? 'ALL SKUs' : 'offline use'}`));
  console.log();
  console.log(`  ${dim('Platform:')}        ${info(rid)}`);

  const meta = await loadMeta();

  for (const skuName of targetSkus) {
    try {
      console.log();
      const profile = await resolveProfile(skuName);

      console.log(`  ${dim('Target SKU:')}      ${info(`${profile.displayName} (${skuName})`)}`);
      console.log(`  ${dim('Host Version:')}    ${info(profile.hostVersion)}`);
      if (profile.maxExtensionBundleVersion) {
        console.log(`  ${dim('Bundle Range:')}    ${info(`${profile.extensionBundleVersion} (max: ${profile.maxExtensionBundleVersion})`)}`);
      }
      console.log();

      if (dryRun) {
        printDryRun(profile, force);
        continue;
      }

      // Download host + bundle (reuse existing ensureHost/ensureBundle)
      const hostDir = await ensureHost(profile, { force });
      const bundleVersion = await ensureBundle(profile, { force });

      // Update meta
      if (!meta.warmedSkus.includes(skuName)) {
        meta.warmedSkus.push(skuName);
      }
      meta.hosts[profile.hostVersion] = {
        rid,
        downloadedAt: new Date().toISOString(),
      };
      if (bundleVersion) {
        meta.bundles[bundleVersion] = {
          downloadedAt: new Date().toISOString(),
        };
      }

      console.log();
      console.log(success(`  ✓ fnx start --sku ${skuName} will work offline.`));
    } catch (err) {
      console.error(warning(`  ⚠️  Warmup failed for ${skuName}: ${err.message}`));
    }
  }

  if (!dryRun) {
    meta.fnxVersion = await getFnxVersion();
    meta.installedAt = new Date().toISOString();
    meta.platform = rid;
    await saveMeta(meta);
  }

  console.log();
  console.log(success('  Done.'));
  console.log();
}

function printDryRun(profile, force) {
  const hostExePath = join(HOST_CACHE, profile.hostVersion, getHostExeName());
  const hostCached = !force && existsSync(hostExePath);

  const bundleDir = join(BUNDLE_CACHE, BUNDLE_ID);
  const bundleCached = !force && findAnyCachedBundle(bundleDir);

  console.log(`  [1/3] Profiles                  ✓ resolved`);
  console.log(`  [2/3] Host ${profile.hostVersion.padEnd(14)} ${hostCached ? '✓ cached' : '↓ needs download'}`);
  console.log(`  [3/3] Bundle                    ${bundleCached ? `✓ cached (${bundleCached})` : '↓ needs download'}`);
}

function findAnyCachedBundle(bundleDir) {
  try {
    const dirs = readdirSync(bundleDir);
    for (const d of dirs) {
      if (existsSync(join(bundleDir, d, 'bundle.json'))) {
        return d;
      }
    }
  } catch { /* not cached */ }
  return null;
}

async function getAllSkuNames() {
  try {
    const { registry } = await fetchRegistryWithMeta();
    return Object.keys(registry.profiles || {});
  } catch {
    return ['flex', 'linux-premium', 'windows-consumption', 'windows-dedicated', 'linux-consumption'];
  }
}

async function loadMeta() {
  try {
    return JSON.parse(await readFile(META_FILE, 'utf-8'));
  } catch {
    return { warmedSkus: [], hosts: {}, bundles: {} };
  }
}

async function saveMeta(meta) {
  await mkdir(FNX_DIR, { recursive: true });
  await writeFile(META_FILE, JSON.stringify(meta, null, 2));
}

async function getFnxVersion() {
  try {
    const pkgPath = new URL('../package.json', import.meta.url).pathname;
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

function printWarmupHelp() {
  console.log(`
fnx warmup — Pre-download host binaries and extension bundles for offline use.

Usage: fnx warmup [options]

Options:
  --sku <name>     Target SKU to warm (default: flex). Use --sku list to see options.
  --all            Warm ALL available SKUs (useful for CI/build agents).
  --dry-run        Show what would be downloaded without actually downloading.
  --force          Re-download even if already cached.
  -h, --help       Show this help message.

Environment Variables:
  FNX_SKIP_DOWNLOAD=1       Skip warmup entirely (useful for CI/Docker).
  FNX_DEFAULT_SKU=<name>    Warm a specific SKU instead of flex.

Examples:
  fnx warmup                            Pre-download default SKU (flex)
  fnx warmup --sku flex                 Explicit SKU
  fnx warmup --sku windows-consumption  Warm a specific SKU
  fnx warmup --sku list                 Show available SKUs
  fnx warmup --all                      Warm ALL SKUs
  fnx warmup --dry-run                  Show what would be downloaded
  fnx warmup --force                    Re-download even if cached
`.trim());
}
