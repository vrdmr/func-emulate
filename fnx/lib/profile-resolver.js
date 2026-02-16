import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve as resolvePath, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CACHE_DIR = join(homedir(), '.fnx', 'profiles');
const CACHE_FILE = join(CACHE_DIR, 'sku-profiles.json');

const DEFAULT_CDN_URL = 'https://raw.githubusercontent.com/vrdmr/func-emulate/main/fnx/profiles/sku-profiles.json';

// Bundled fallback (shipped with the POC)
const BUNDLED_PROFILES_PATH = fileURLToPath(new URL('../profiles/sku-profiles.json', import.meta.url));

let profilesSource = null; // Set via setProfilesSource()

export function setProfilesSource(source) {
  profilesSource = source;
}

function isUrl(str) {
  return str.startsWith('http://') || str.startsWith('https://');
}

function isJsonString(str) {
  return str.trimStart().startsWith('{');
}

async function persistCache(rawJson) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(CACHE_FILE, rawJson);
}

export async function fetchRegistryWithMeta() {
  // If an explicit source was provided (--profiles flag or inline JSON), use it directly.
  if (profilesSource) {
    if (isJsonString(profilesSource)) {
      return { registry: JSON.parse(profilesSource), source: 'inline-json' };
    }

    if (isUrl(profilesSource)) {
      try {
        const res = await fetch(profilesSource);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.text();
        await persistCache(json);
        return { registry: JSON.parse(json), source: 'remote', url: profilesSource };
      } catch {
        throw new Error(`Cannot fetch profiles from: ${profilesSource}`);
      }
    }

    const filePath = isAbsolute(profilesSource) ? profilesSource : resolvePath(process.cwd(), profilesSource);
    try {
      return { registry: JSON.parse(await readFile(filePath, 'utf-8')), source: 'local-file', path: filePath };
    } catch (err) {
      throw new Error(`Cannot read profiles file: ${filePath} (${err.message})`);
    }
  }

  // Default behavior: always attempt CDN first to detect upgrades/rollbacks quickly,
  // then fall back to cache, then bundled profiles.
  const cdnUrl = process.env.FUNC_PROFILES_URL || DEFAULT_CDN_URL;

  try {
    const res = await fetch(cdnUrl);
    if (res.ok) {
      const json = await res.text();
      await persistCache(json);
      return { registry: JSON.parse(json), source: 'remote', url: cdnUrl };
    }
  } catch { /* CDN unreachable */ }

  try {
    return { registry: JSON.parse(await readFile(CACHE_FILE, 'utf-8')), source: 'cache' };
  } catch { /* no cache */ }

  try {
    return { registry: JSON.parse(await readFile(BUNDLED_PROFILES_PATH, 'utf-8')), source: 'bundled' };
  } catch {
    throw new Error('Cannot load SKU profiles: CDN unreachable, no cache, no bundled profiles.');
  }
}

async function fetchRegistry() {
  const { registry } = await fetchRegistryWithMeta();
  return registry;
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
  console.log('  SKU                     Host Version         Bundle Version    Max Bundle  Status');
  console.log('  ─────────────────────── ──────────────────── ───────────────── ─────────── ──────────');
  for (const [key, p] of Object.entries(registry.profiles)) {
    const sku = key.padEnd(24);
    const host = p.hostVersion.padEnd(21);
    const bundle = p.extensionBundleVersion.padEnd(18);
    const maxBundle = (p.maxExtensionBundleVersion || 'n/a').padEnd(12);
    console.log(`  ${sku}${host}${bundle}${maxBundle}${p.status}`);
  }
  console.log(`\n  Last updated: ${registry.updatedAt}`);
}
