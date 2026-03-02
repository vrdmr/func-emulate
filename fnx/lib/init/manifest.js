/**
 * Manifest fetching and caching for fnx init
 *
 * - Fetches template manifest from CDN
 * - Caches to ~/.fnx/cache/manifest.json with ETag
 * - 24-hour TTL for cached manifests
 * - Falls back to bundled manifest if CDN unavailable
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FNX_CACHE_DIR = join(homedir(), '.fnx', 'cache');
const MANIFEST_CACHE_FILE = join(FNX_CACHE_DIR, 'manifest.json');
const MANIFEST_META_FILE = join(FNX_CACHE_DIR, 'manifest-meta.json');
const BUNDLED_MANIFEST_FILE = join(__dirname, '..', '..', 'templates', 'manifest.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Allowed GitHub organizations for template repositories
const ALLOWED_ORGS = ['azure', 'azure-samples'];

/**
 * Filter templates to only include those from trusted Azure orgs
 * @param {Array} templates - Array of template objects
 * @param {string} defaultRepoUrl - Default repository URL from manifest
 * @param {boolean} verbose - Log filtering info
 * @returns {Array} Filtered templates
 */
function filterTrustedTemplates(templates, defaultRepoUrl, verbose) {
  const original = templates.length;
  const filtered = templates.filter(template => {
    const repoUrl = template.repositoryUrl || defaultRepoUrl || '';
    const match = repoUrl.match(/^https:\/\/github\.com\/([^/]+)\//i);
    if (!match) return false;
    const owner = match[1].toLowerCase();
    return ALLOWED_ORGS.includes(owner);
  });
  
  if (verbose && filtered.length < original) {
    console.log(`  Filtered ${original - filtered.length} templates from untrusted sources`);
  }
  
  return filtered;
}

/**
 * Fetch manifest from URL with caching and bundled fallback
 * @param {string} url - Manifest URL
 * @param {Object} options - Options
 * @param {boolean} options.verbose - Show detailed logging
 * @returns {Promise<{templates: Array}>} Parsed manifest
 */
export async function fetchManifest(url, options = {}) {
  const { verbose } = options;

  // Check if cached manifest is still valid
  const cached = await loadCachedManifest();
  if (cached && !isExpired(cached.meta)) {
    if (verbose) {
      const age = Math.round((Date.now() - cached.meta.fetchedAt) / 1000 / 60);
      console.log(`  Cache hit: manifest cached ${age} minutes ago`);
    }
    // Filter cached manifest
    cached.manifest.templates = filterTrustedTemplates(cached.manifest.templates, cached.manifest.repositoryUrl, verbose);
    return cached.manifest;
  }

  // Fetch from network with conditional request if we have ETag
  const headers = {};
  if (cached?.meta?.etag) {
    headers['If-None-Match'] = cached.meta.etag;
    if (verbose) console.log(`  Cache stale, checking with ETag...`);
  } else {
    if (verbose) console.log(`  No cache, fetching from CDN...`);
  }

  try {
    const response = await fetch(url, { headers });

    // 304 Not Modified — use cached version
    if (response.status === 304 && cached) {
      if (verbose) console.log(`  304 Not Modified, using cache`);
      await saveCacheMeta({ ...cached.meta, fetchedAt: Date.now() });
      // Filter cached manifest
      cached.manifest.templates = filterTrustedTemplates(cached.manifest.templates, cached.manifest.repositoryUrl, verbose);
      return cached.manifest;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const manifest = await response.json();
    
    // Validate manifest structure
    if (!manifest || !Array.isArray(manifest.templates)) {
      throw new Error('Invalid manifest format: missing templates array');
    }
    
    // Filter to only trusted Azure orgs (proactive security)
    manifest.templates = filterTrustedTemplates(manifest.templates, manifest.repositoryUrl, verbose);
    
    const etag = response.headers.get('etag');

    if (verbose) console.log(`  Fetched fresh manifest from CDN`);

    // Cache the manifest
    await cacheManifest(manifest, { etag, fetchedAt: Date.now(), url });

    return manifest;
  } catch (err) {
    // Network error — fall back to cache if available
    if (cached) {
      if (verbose) console.log(`  Network error, using stale cache: ${err.message}`);
      // Filter cached manifest too
      cached.manifest.templates = filterTrustedTemplates(cached.manifest.templates, cached.manifest.repositoryUrl, verbose);
      return cached.manifest;
    }

    // Fall back to bundled manifest
    const bundled = await loadBundledManifest();
    if (bundled) {
      if (verbose) console.log(`  CDN unavailable, using bundled manifest`);
      // Filter bundled manifest too
      bundled.templates = filterTrustedTemplates(bundled.templates, bundled.repositoryUrl, verbose);
      return bundled;
    }

    throw new Error(`Failed to fetch manifest: ${err.message}`);
  }
}

/**
 * Load cached manifest and metadata
 */
async function loadCachedManifest() {
  try {
    if (!existsSync(MANIFEST_CACHE_FILE) || !existsSync(MANIFEST_META_FILE)) {
      return null;
    }

    const [manifestJson, metaJson] = await Promise.all([
      readFile(MANIFEST_CACHE_FILE, 'utf-8'),
      readFile(MANIFEST_META_FILE, 'utf-8'),
    ]);

    return {
      manifest: JSON.parse(manifestJson),
      meta: JSON.parse(metaJson),
    };
  } catch {
    return null;
  }
}

/**
 * Load bundled manifest from package
 */
async function loadBundledManifest() {
  try {
    if (!existsSync(BUNDLED_MANIFEST_FILE)) {
      return null;
    }
    const content = await readFile(BUNDLED_MANIFEST_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Check if cached manifest has expired
 */
function isExpired(meta) {
  if (!meta?.fetchedAt) return true;
  return Date.now() - meta.fetchedAt > CACHE_TTL_MS;
}

/**
 * Cache manifest to disk
 */
async function cacheManifest(manifest, meta) {
  await mkdir(FNX_CACHE_DIR, { recursive: true });
  await Promise.all([
    writeFile(MANIFEST_CACHE_FILE, JSON.stringify(manifest, null, 2)),
    writeFile(MANIFEST_META_FILE, JSON.stringify(meta, null, 2)),
  ]);
}

/**
 * Update just the cache metadata (e.g., to extend TTL on 304)
 */
async function saveCacheMeta(meta) {
  await mkdir(FNX_CACHE_DIR, { recursive: true });
  await writeFile(MANIFEST_META_FILE, JSON.stringify(meta, null, 2));
}

/**
 * Get available runtimes from manifest
 * @param {Object} manifest
 * @returns {string[]} Unique runtime values
 */
export function getAvailableRuntimes(manifest) {
  const runtimes = new Set();
  for (const template of manifest.templates) {
    if (template.runtime) {
      runtimes.add(template.runtime);
    }
  }
  return Array.from(runtimes);
}

/**
 * Get available triggers from manifest for a given runtime
 * @param {Object} manifest
 * @param {string} runtime
 * @returns {string[]} Unique trigger types
 */
export function getAvailableTriggers(manifest, runtime) {
  const triggers = new Set();
  for (const template of manifest.templates) {
    if (template.runtime === runtime && template.trigger) {
      triggers.add(template.trigger);
    }
  }
  return Array.from(triggers);
}
