import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CACHE_DIR = join(homedir(), '.func-emu', 'profiles');
const CACHE_FILE = join(CACHE_DIR, 'sku-profiles.json');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// For POC: default to local dummy CDN server
const CDN_URL = process.env.FUNC_EMU_PROFILES_URL ||
  'http://localhost:4566/api/profiles';

// Bundled fallback (shipped with the POC)
const BUNDLED_PROFILES_PATH = new URL('../profiles/sku-profiles.json', import.meta.url).pathname;

async function fetchRegistry() {
  // 1. Try cache (if fresh)
  try {
    const cacheStat = await stat(CACHE_FILE);
    if (Date.now() - cacheStat.mtimeMs < CACHE_TTL_MS) {
      return JSON.parse(await readFile(CACHE_FILE, 'utf-8'));
    }
  } catch { /* no cache or stale */ }

  // 2. Try CDN
  try {
    const res = await fetch(CDN_URL);
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
