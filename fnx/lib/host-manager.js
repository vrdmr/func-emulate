import { existsSync, readdirSync } from 'node:fs';
import { mkdir, chmod, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { createWriteStream } from 'node:fs';
import { execSync } from 'node:child_process';
import { arch } from 'node:os';

const HOST_CACHE = join(homedir(), '.fnx', 'hosts');
const BUNDLE_CACHE = join(homedir(), '.fnx', 'bundles');
const BUNDLE_CDN = 'https://functionscdn.azureedge.net/public/ExtensionBundles';
const BUNDLE_ID = 'Microsoft.Azure.Functions.ExtensionBundle';

function getPlatformRid() {
  const os = platform();
  const cpu = arch();
  const osMap = { darwin: 'osx', linux: 'linux', win32: 'win' };
  const cpuMap = { x64: 'x64', arm64: 'arm64' };
  return `${osMap[os] || os}-${cpuMap[cpu] || cpu}`;
}

function getHostExeName() {
  return platform() === 'win32'
    ? 'Microsoft.Azure.WebJobs.Script.WebHost.exe'
    : 'Microsoft.Azure.WebJobs.Script.WebHost';
}

export async function ensureHost(profile, { force = false } = {}) {
  const hostDir = join(HOST_CACHE, profile.hostVersion);
  const hostExe = join(hostDir, getHostExeName());

  if (!force && existsSync(hostExe)) {
    console.log('  Host cached, skipping download.');
    return hostDir;
  }

  // Clean existing dir if forcing re-download
  if (force && existsSync(hostDir)) {
    await rm(hostDir, { recursive: true, force: true });
  }

  // Determine download URL
  const rid = getPlatformRid();
  const url = profile.hostPackageUrl?.[rid];
  if (!url) {
    throw new Error(
      `No host package for platform '${rid}'. ` +
      `Available: ${Object.keys(profile.hostPackageUrl || {}).join(', ')}`
    );
  }

  console.log(`  Downloading host ${profile.hostVersion} for ${rid}...`);

  await mkdir(hostDir, { recursive: true });
  const tempZip = join(hostDir, '_download.zip');

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const total = parseInt(res.headers.get('content-length') || '0', 10);
    let downloaded = 0;

    const fileStream = createWriteStream(tempZip);
    const reader = res.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(value);
      downloaded += value.length;
      if (total > 0) {
        const pct = Math.round((downloaded / total) * 100);
        process.stdout.write(`\r  Downloading: ${pct}% (${(downloaded / 1048576).toFixed(1)} MB)`);
      }
    }
    fileStream.end();
    await new Promise((resolve) => fileStream.on('finish', resolve));
    console.log('\r  Download complete.                              ');

    // Extract
    console.log('  Extracting...');
    if (platform() === 'win32') {
      execSync(`powershell -Command "Expand-Archive -Path '${tempZip}' -DestinationPath '${hostDir}' -Force"`,
        { stdio: 'pipe' });
    } else {
      execSync(`unzip -o -q "${tempZip}" -d "${hostDir}"`, { stdio: 'pipe' });
    }

    // Set executable permission on Unix
    if (platform() !== 'win32') {
      const exe = join(hostDir, getHostExeName());
      if (existsSync(exe)) {
        await chmod(exe, 0o755);
      }
    }

    console.log('  Host ready.');
  } finally {
    try { await rm(tempZip); } catch { /* ignore */ }
  }

  // Patch worker configs: replace 'python' → 'python3' on Unix where python3 exists but python doesn't
  await patchWorkerConfigs(hostDir);

  return hostDir;
}

// On macOS/Linux, many systems have python3 but not python.
// The host's bundled worker.config.json hardcodes "python" as the executable.
// We patch it post-extraction so the worker can actually start.
async function patchWorkerConfigs(hostDir) {
  if (platform() === 'win32') return;

  const workerConfig = join(hostDir, 'workers', 'python', 'worker.config.json');
  if (!existsSync(workerConfig)) return;

  // Find the best available python (prefer versioned 3.13 → 3.9, then python3)
  let bestPython = null;
  for (const ver of ['3.13', '3.12', '3.11', '3.10', '3.9']) {
    try { execSync(`python${ver} --version`, { stdio: 'ignore' }); bestPython = `python${ver}`; break; } catch {}
  }
  if (!bestPython) {
    try { execSync('python3 --version', { stdio: 'ignore' }); bestPython = 'python3'; } catch {}
  }
  if (!bestPython) return;

  try {
    const content = await readFile(workerConfig, 'utf-8');
    const config = JSON.parse(content);
    if (config.description?.defaultExecutablePath !== bestPython) {
      const old = config.description.defaultExecutablePath;
      config.description.defaultExecutablePath = bestPython;
      await writeFile(workerConfig, JSON.stringify(config, null, 4));
      console.log(`  Patched python worker config: ${old} → ${bestPython}`);
    }
  } catch { /* non-fatal */ }
}

// ─── Extension Bundle Pre-Download ──────────────────────────────────────
// Downloads the correct extension bundle BEFORE launching the host.
// This ensures the host finds the bundle cached and never fetches a wrong version.

function parseVersionRange(range) {
  // Parse "[4.19.*, 5.0.0)" → { minMajor, minMinor, maxVersion }
  const match = range.match(/^\[(\d+)\.(\d+)\.\*,\s*(\d+\.\d+\.\d+)\)$/);
  if (!match) return null;
  return {
    minMajor: parseInt(match[1], 10),
    minMinor: parseInt(match[2], 10),
    upperBound: match[3].split('.').map(Number),
  };
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function findBestBundleVersion(allVersions, range, maxVersion) {
  const parsed = parseVersionRange(range);
  if (!parsed) return null;

  const candidates = allVersions.filter(v => {
    const parts = v.split('.').map(Number);
    // Must match major and be >= minMinor
    if (parts[0] !== parsed.minMajor) return false;
    if (parts[1] < parsed.minMinor) return false;
    // Must be below upper bound
    if (compareVersions(v, parsed.upperBound.join('.')) >= 0) return false;
    // Must be at or below maxVersion cap
    if (maxVersion && compareVersions(v, maxVersion) > 0) return false;
    return true;
  });

  if (candidates.length === 0) return null;
  candidates.sort(compareVersions);
  return candidates[candidates.length - 1]; // highest valid version
}

export async function ensureBundle(profile, { force = false } = {}) {
  const bundleDir = join(BUNDLE_CACHE, BUNDLE_ID);
  const range = profile.extensionBundleVersion;
  const maxVersion = profile.maxExtensionBundleVersion;

  // Fetch CDN index to get all available versions
  console.log('  Resolving extension bundle...');
  let allVersions;
  try {
    const indexUrl = `${BUNDLE_CDN}/${BUNDLE_ID}/index.json`;
    const res = await fetch(indexUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allVersions = await res.json();
  } catch (err) {
    // If CDN is unreachable, check if we have any cached version that fits
    console.log(`  ⚠️  Bundle index fetch failed (${err.message}), checking cache...`);
    return findCachedBundle(bundleDir, range, maxVersion);
  }

  const bestVersion = findBestBundleVersion(allVersions, range, maxVersion);
  if (!bestVersion) {
    throw new Error(
      `No extension bundle found matching range ${range}` +
      (maxVersion ? ` with max ${maxVersion}` : '') +
      `. Available 4.x: ${allVersions.filter(v => v.startsWith('4.')).sort(compareVersions).join(', ')}`
    );
  }

  const versionDir = join(bundleDir, bestVersion);
  if (!force && existsSync(join(versionDir, 'bundle.json'))) {
    console.log(`  Bundle ${bestVersion} cached.`);
    return bestVersion;
  }

  // Clean existing version dir if forcing re-download
  if (force && existsSync(versionDir)) {
    await rm(versionDir, { recursive: true, force: true });
  }

  // Download and extract
  const zipUrl = `${BUNDLE_CDN}/${BUNDLE_ID}/${bestVersion}/${BUNDLE_ID}.${bestVersion}_any-any.zip`;
  console.log(`  Downloading bundle ${bestVersion}...`);

  await mkdir(versionDir, { recursive: true });
  const tempZip = join(versionDir, '_bundle.zip');

  try {
    const res = await fetch(zipUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const total = parseInt(res.headers.get('content-length') || '0', 10);
    let downloaded = 0;
    const fileStream = createWriteStream(tempZip);
    const reader = res.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(value);
      downloaded += value.length;
      if (total > 0) {
        const pct = Math.round((downloaded / total) * 100);
        process.stdout.write(`\r  Downloading bundle: ${pct}% (${(downloaded / 1048576).toFixed(1)} MB)`);
      }
    }
    fileStream.end();
    await new Promise((resolve) => fileStream.on('finish', resolve));
    console.log('\r  Bundle download complete.                              ');

    // Extract
    if (platform() === 'win32') {
      execSync(`powershell -Command "Expand-Archive -Path '${tempZip}' -DestinationPath '${versionDir}' -Force"`,
        { stdio: 'pipe' });
    } else {
      execSync(`unzip -o -q "${tempZip}" -d "${versionDir}"`, { stdio: 'pipe' });
    }
    console.log(`  Bundle ${bestVersion} ready.`);
  } finally {
    try { await rm(tempZip); } catch { /* ignore */ }
  }

  return bestVersion;
}

function findCachedBundle(bundleDir, range, maxVersion) {
  if (!existsSync(bundleDir)) return null;
  const cached = readdirSync(bundleDir).filter(d => existsSync(join(bundleDir, d, 'bundle.json')));
  const best = findBestBundleVersion(cached, range, maxVersion);
  if (best) {
    console.log(`  Using cached bundle ${best}.`);
  }
  return best;
}

export { getHostExeName, getPlatformRid };
