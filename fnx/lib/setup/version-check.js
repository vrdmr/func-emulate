/**
 * version-check.js — Track and compare manifest versions for skill freshness.
 *
 * When `fnx setup` copies skills, it writes a marker file `.fnx/manifest-version.json`
 * with the manifest version from `manifests/default.yaml`. On subsequent runs, the
 * installed version is compared with the package's current manifest version to detect
 * when skills are outdated.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFESTS_DIR = resolve(__dirname, '..', '..', 'manifests');
const MARKER_FILE = '.fnx/manifest-version.json';

/**
 * Write the manifest version marker after skills are installed.
 * @param {string} appPath - Project root directory
 * @param {string} version - Manifest version string (e.g. "1.0.1")
 */
export async function writeManifestVersion(appPath, version) {
  const markerPath = join(appPath, MARKER_FILE);
  await mkdir(dirname(markerPath), { recursive: true });
  const data = {
    version,
    installedAt: new Date().toISOString(),
  };
  await writeFile(markerPath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Read the installed manifest version from the marker file.
 * @param {string} appPath - Project root directory
 * @returns {Promise<string|null>} Version string, or null if not found/corrupted
 */
export async function readInstalledVersion(appPath) {
  try {
    const raw = await readFile(join(appPath, MARKER_FILE), 'utf8');
    const data = JSON.parse(raw);
    return data.version || null;
  } catch {
    return null;
  }
}

/**
 * Read the manifest version from the package's manifests/default.yaml.
 * @returns {Promise<string>} Version string from default.yaml
 */
export async function readPackageManifestVersion() {
  const yamlPath = join(MANIFESTS_DIR, 'default.yaml');
  const raw = await readFile(yamlPath, 'utf8');
  const doc = YAML.parse(raw);
  return doc.version;
}

/**
 * Check whether installed skills are outdated compared to the package manifest.
 * @param {string} appPath - Project root directory
 * @returns {Promise<{outdated: boolean, missing: boolean, installed: string|null, latest: string}>}
 */
export async function checkSkillsOutdated(appPath) {
  const installed = await readInstalledVersion(appPath);
  const latest = await readPackageManifestVersion();

  if (installed === null) {
    return { outdated: false, missing: true, installed: null, latest };
  }

  return {
    outdated: installed !== latest,
    missing: false,
    installed,
    latest,
  };
}
