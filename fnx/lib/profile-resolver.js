import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, resolve as resolvePath, isAbsolute } from 'node:path';
import { homedir } from 'node:os';

const CACHE_DIR = join(homedir(), '.fnx', 'profiles');
const CACHE_FILE = join(CACHE_DIR, 'sku-profiles.json');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const DEFAULT_CDN_URL = 'http://localhost:4566/api/profiles';

// Bundled fallback (shipped with the POC)
const BUNDLED_PROFILES_PATH = new URL('../profiles/sku-profiles.json', import.meta.url).pathname;

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

async function fetchRegistry() {
  // If an explicit source was provided (--profiles flag or inline JSON), use it directly
  if (profilesSource) {
    // Inline JSON string
    if (isJsonString(profilesSource)) {
      return JSON.parse(profilesSource);
    }

    // URL (http/https)
    if (isUrl(profilesSource)) {
      try {
        const res = await fetch(profilesSource);
        if (res.ok) {
          const json = await res.text();
          await mkdir(CACHE_DIR, { recursive: true });
          await writeFile(CACHE_FILE, json);
          return JSON.parse(json);
        }
      } catch { /* fall through to error */ }
      throw new Error(`Cannot fetch profiles from: ${profilesSource}`);
    }

    // Local file path
    const filePath = isAbsolute(profilesSource) ? profilesSource : resolvePath(process.cwd(), profilesSource);
    try {
      return JSON.parse(await readFile(filePath, 'utf-8'));
    } catch (err) {
      throw new Error(`Cannot read profiles file: ${filePath} (${err.message})`);
    }
  }

  // Default resolution chain: env var → cache → CDN → stale cache → bundled
  const cdnUrl = process.env.FUNC_PROFILES_URL || DEFAULT_CDN_URL;

  // 1. Try cache (if fresh)
  try {
    const cacheStat = await stat(CACHE_FILE);
    if (Date.now() - cacheStat.mtimeMs < CACHE_TTL_MS) {
      return JSON.parse(await readFile(CACHE_FILE, 'utf-8'));
    }
  } catch { /* no cache or stale */ }

  // 2. Try CDN
  try {
    const res = await fetch(cdnUrl);
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
