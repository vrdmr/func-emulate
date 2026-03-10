import { spawn, execSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { info, url as urlColor, warning, error as errorColor } from './colors.js';

const BLOB_PORT = 10000;
const QUEUE_PORT = 10001;
const TABLE_PORT = 10002;
const AZURITE_INSTALL_DIR = join(homedir(), '.fnx', 'tools', 'azurite');

let azuriteProcess = null;
let weStartedAzurite = false;

/**
 * Check if a connection string value indicates development/emulator storage.
 * Matches:
 * - "UseDevelopmentStorage=true"
 * - "UseDevelopmentStorage=true;DevelopmentStorageProxyUri=..."
 * - Connection strings pointing to devstoreaccount1 (Azurite default)
 * - Connection strings pointing to 127.0.0.1:10000 (Azurite default ports)
 */
function isDevStorageConnectionString(value) {
  if (!value || typeof value !== 'string') return false;
  
  const normalized = value.toLowerCase();
  
  // Check for UseDevelopmentStorage=true (with or without additional params)
  if (normalized.startsWith('usedevelopmentstorage=true')) {
    return true;
  }
  
  // Check for Azurite default account name
  if (normalized.includes('devstoreaccount1')) {
    return true;
  }
  
  // Check for localhost Azurite ports (10000, 10001, 10002)
  if (normalized.includes('127.0.0.1:10000') || 
      normalized.includes('127.0.0.1:10001') || 
      normalized.includes('127.0.0.1:10002') ||
      normalized.includes('localhost:10000') ||
      normalized.includes('localhost:10001') ||
      normalized.includes('localhost:10002')) {
    return true;
  }
  
  return false;
}

/**
 * Determine whether Azurite is needed based on any setting using development storage.
 * Returns { needed: boolean, keys: string[] } where keys are the ones using dev storage.
 */
function needsAzurite(mergedValues) {
  if (!mergedValues) return { needed: false, keys: [] };
  
  const devStorageKeys = [];
  
  for (const [key, value] of Object.entries(mergedValues)) {
    if (isDevStorageConnectionString(value)) {
      devStorageKeys.push(key);
    }
  }
  
  // Also check AzureWebJobsStorage specially - empty/missing means dev storage
  const webJobsStorage = mergedValues.AzureWebJobsStorage;
  if ((!webJobsStorage || webJobsStorage === '') && !devStorageKeys.includes('AzureWebJobsStorage')) {
    devStorageKeys.push('AzureWebJobsStorage');
  }
  
  return { needed: devStorageKeys.length > 0, keys: devStorageKeys };
}

/**
 * TCP probe — resolves true if a connection can be established on the given port.
 */
function isPortInUse(port, host = '127.0.0.1', timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const timer = setTimeout(() => { socket.destroy(); resolve(false); }, timeoutMs);
    socket.on('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true); });
    socket.on('error', () => { clearTimeout(timer); socket.destroy(); resolve(false); });
  });
}

/**
 * Wait until a TCP port becomes reachable (up to timeoutMs).
 */
async function waitForTcp(port, { host = '127.0.0.1', timeoutMs = 15000, intervalMs = 300 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortInUse(port, host, 500)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Check if Azurite default ports are already in use.
 */
async function isAzuriteRunning() {
  return await isPortInUse(BLOB_PORT);
}

/**
 * Find an existing azurite binary (global install, npx, or cached in ~/.fnx/tools/azurite).
 * Returns the path/command or null.
 */
function findAzurite() {
  // 1. Check the fnx tools cache first (Windows uses .cmd shims)
  const isWin = process.platform === 'win32';
  const cachedBin = join(AZURITE_INSTALL_DIR, 'node_modules', '.bin', isWin ? 'azurite.cmd' : 'azurite');
  if (existsSync(cachedBin)) return cachedBin;

  // 2. Check global PATH (use 'where' on Windows, 'which' on Unix)
  try {
    const whichCmd = isWin ? 'where azurite' : 'which azurite';
    const result = execSync(whichCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    // 'where' on Windows may return multiple lines; take the first
    const firstLine = result.split(/\r?\n/)[0];
    if (firstLine) return firstLine;
  } catch { /* not found */ }

  return null;
}

/**
 * Install azurite into ~/.fnx/tools/azurite/ if not already present.
 */
function installAzurite() {
  console.log(info('[fnx] Installing Azurite to ~/.fnx/tools/azurite/ (first-time only)...'));
  mkdirSync(AZURITE_INSTALL_DIR, { recursive: true });

  // Initialize a minimal package.json if missing so npm install works
  const pkgPath = join(AZURITE_INSTALL_DIR, 'package.json');
  if (!existsSync(pkgPath)) {
    writeFileSync(pkgPath, JSON.stringify({ name: 'fnx-azurite-cache', private: true }, null, 2));
  }

  try {
    execSync('npm install azurite --save --loglevel=error', {
      cwd: AZURITE_INSTALL_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });
  } catch (err) {
    console.error(errorColor('[fnx] Failed to install Azurite. Install manually: npm install -g azurite'));
    console.error(warning(`      ${err.message}`));
    return null;
  }

  // Use .cmd on Windows (npm creates .cmd shims for bin entries)
  const binName = process.platform === 'win32' ? 'azurite.cmd' : 'azurite';
  const installed = join(AZURITE_INSTALL_DIR, 'node_modules', '.bin', binName);
  if (existsSync(installed)) {
    console.log(info('[fnx] Azurite installed successfully.'));
    return installed;
  }
  return null;
}

/**
 * Find azurite binary, installing if necessary.
 */
function findOrInstallAzurite() {
  let bin = findAzurite();
  if (bin) return bin;
  return installAzurite();
}

/**
 * Main entry point: ensure Azurite is available and running if needed.
 * Returns the child process (caller kills on exit), or null if not started.
 */
export async function ensureAzurite(mergedValues, opts = {}) {
  if (opts.noAzurite) {
    return null;
  }

  const { needed, keys } = needsAzurite(mergedValues);
  if (!needed) {
    return null;
  }

  // Log which connection strings are using dev storage
  if (keys.length === 1) {
    const val = mergedValues?.[keys[0]] || '(empty)';
    console.log(info(`[fnx] Detected ${keys[0]}=${val}`));
  } else {
    console.log(info(`[fnx] Detected ${keys.length} connection strings using UseDevelopmentStorage=true:`));
    for (const key of keys) {
      console.log(info(`[fnx]   • ${key}`));
    }
  }

  // Check if Azurite is already running
  if (await isAzuriteRunning()) {
    console.log(info('[fnx] Using existing Azurite instance on default ports.'));
    return null;
  }

  // Find or install azurite
  const azuriteBin = findOrInstallAzurite();
  if (!azuriteBin) {
    console.error(warning('[fnx] ⚠️  Azurite not available. Storage triggers may fail.'));
    console.error(warning('     Install with: npm install -g azurite'));
    return null;
  }

  console.log(info('[fnx] Starting Azurite storage emulator...'));

  const azuriteArgs = [
    '--blobHost', '127.0.0.1', '--blobPort', String(BLOB_PORT),
    '--queueHost', '127.0.0.1', '--queuePort', String(QUEUE_PORT),
    '--tableHost', '127.0.0.1', '--tablePort', String(TABLE_PORT),
    '--silent',
    '--location', join(homedir(), '.fnx', 'azurite-data'),
  ];

  // Ensure data directory exists
  mkdirSync(join(homedir(), '.fnx', 'azurite-data'), { recursive: true });

  // On Windows, use shell:true so cmd.exe can resolve .cmd shims from PATH-based paths
  const spawnOptions = process.platform === 'win32'
    ? { stdio: 'ignore', shell: true }
    : { stdio: 'ignore' };

  azuriteProcess = spawn(azuriteBin, azuriteArgs, spawnOptions);
  weStartedAzurite = true;

  azuriteProcess.on('error', (err) => {
    console.error(errorColor(`[fnx] Azurite failed to start: ${err.message}`));
    azuriteProcess = null;
  });

  azuriteProcess.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(errorColor(`[fnx] Azurite exited unexpectedly with code ${code}.`));
    }
    azuriteProcess = null;
  });

  // Wait for Azurite to be ready
  const ready = await waitForTcp(BLOB_PORT, { timeoutMs: 15000 });
  if (!ready) {
    console.error(warning('[fnx] ⚠️  Azurite did not become ready in time. Storage triggers may fail.'));
    return azuriteProcess;
  }

  console.log(info(`[fnx] Azurite Blob  → ${urlColor(`http://127.0.0.1:${BLOB_PORT}`)}`));
  console.log(info(`[fnx] Azurite Queue → ${urlColor(`http://127.0.0.1:${QUEUE_PORT}`)}`));
  console.log(info(`[fnx] Azurite Table → ${urlColor(`http://127.0.0.1:${TABLE_PORT}`)}`));

  return azuriteProcess;
}

/**
 * Stop the managed Azurite process (only if fnx started it).
 */
export function stopAzurite() {
  if (azuriteProcess && weStartedAzurite) {
    try { azuriteProcess.kill(); } catch { /* already dead */ }
    azuriteProcess = null;
    weStartedAzurite = false;
  }
}
