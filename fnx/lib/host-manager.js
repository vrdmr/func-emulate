import { existsSync } from 'node:fs';
import { mkdir, chmod, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { createWriteStream } from 'node:fs';
import { execSync } from 'node:child_process';
import { arch } from 'node:os';

const HOST_CACHE = join(homedir(), '.fnx', 'hosts');

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

export async function ensureHost(profile) {
  const hostDir = join(HOST_CACHE, profile.hostVersion);
  const hostExe = join(hostDir, getHostExeName());

  if (existsSync(hostExe)) {
    console.log('  Host cached, skipping download.');
    return hostDir;
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

export { getHostExeName };
