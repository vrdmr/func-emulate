// doctor.js — Project diagnostics for fnx
//
// Validates project setup: config files, runtime, host compatibility,
// extension bundles, port availability, Azurite status, and resolved config.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection, createServer } from 'node:net';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';

import { validateStructure, resolveEnvVars, STRUCTURED_FIELDS } from './config-schema.js';
import { detectSecrets } from './secret-patterns.js';
import { title, info, success, error as errorColor, warning, dim, bold } from './colors.js';

const BLOB_PORT = 10000;

// ── Check definitions ──

async function checkHostJson(appPath) {
  const p = join(appPath, 'host.json');
  if (!existsSync(p)) {
    return { name: 'host.json', status: 'fail', message: 'Not found — required for Azure Functions apps', fix: 'Create host.json with: { "version": "2.0" }' };
  }
  try {
    const content = JSON.parse(await readFile(p, 'utf-8'));
    if (content.version !== '2.0') {
      return { name: 'host.json', status: 'warn', message: `version is "${content.version}" (expected "2.0")`, fix: 'Set "version": "2.0" in host.json' };
    }
    return { name: 'host.json', status: 'pass', message: 'Present and valid' };
  } catch {
    return { name: 'host.json', status: 'fail', message: 'Invalid JSON', fix: 'Fix JSON syntax in host.json' };
  }
}

async function checkAppConfig(appPath) {
  const yamlPath = join(appPath, 'app-config.yaml');
  const legacyPath = join(appPath, 'app.config.json');

  if (!existsSync(yamlPath)) {
    if (existsSync(legacyPath)) {
      return { name: 'app-config.yaml', status: 'warn', message: 'Not found — using legacy app.config.json', fix: 'Run: fnx config migrate' };
    }
    return { name: 'app-config.yaml', status: 'warn', message: 'Not found — will be auto-created on first fnx start', fix: 'Run: fnx config migrate (if local.settings.json exists)' };
  }

  try {
    const raw = await readFile(yamlPath, 'utf-8');
    const config = parseYaml(raw);
    if (!config || typeof config !== 'object') {
      return { name: 'app-config.yaml', status: 'fail', message: 'Empty or invalid YAML', fix: 'Fix YAML syntax or regenerate with: fnx config migrate' };
    }

    const { warnings } = validateStructure(config);
    const { errors } = resolveEnvVars(config);
    const secrets = detectSecrets(config);

    if (secrets.length > 0) {
      return { name: 'app-config.yaml', status: 'fail', message: `Contains ${secrets.length} secret(s) — ${secrets.map(s => s.path).join(', ')}`, fix: 'Move secrets to local.settings.json and remove from app-config.yaml' };
    }
    if (errors.length > 0) {
      return { name: 'app-config.yaml', status: 'fail', message: errors[0], fix: 'Fix the configuration errors shown above' };
    }
    if (warnings.length > 0) {
      return { name: 'app-config.yaml', status: 'warn', message: warnings.join('; ') };
    }
    return { name: 'app-config.yaml', status: 'pass', message: 'Present and valid' };
  } catch (e) {
    return { name: 'app-config.yaml', status: 'fail', message: `Parse error: ${e.message}`, fix: 'Fix YAML syntax in app-config.yaml' };
  }
}

async function checkLocalSettings(appPath) {
  const p = join(appPath, 'local.settings.json');
  if (!existsSync(p)) {
    return { name: 'local.settings.json', status: 'warn', message: 'Not found — secrets and connection strings go here', fix: 'Create with: { "IsEncrypted": false, "Values": { "AzureWebJobsStorage": "UseDevelopmentStorage=true" } }' };
  }
  try {
    JSON.parse(await readFile(p, 'utf-8'));
    return { name: 'local.settings.json', status: 'pass', message: 'Present and valid JSON' };
  } catch {
    return { name: 'local.settings.json', status: 'fail', message: 'Invalid JSON', fix: 'Fix JSON syntax in local.settings.json' };
  }
}

async function checkRuntime(appPath) {
  // Try app-config.yaml first, then local.settings.json
  const yamlPath = join(appPath, 'app-config.yaml');
  const localPath = join(appPath, 'local.settings.json');
  let runtime = null;
  let source = null;

  if (existsSync(yamlPath)) {
    try {
      const config = parseYaml(await readFile(yamlPath, 'utf-8'));
      runtime = config?.runtime?.name;
      if (runtime) source = 'app-config.yaml';
    } catch { /* ignore parse errors — checkAppConfig handles this */ }
  }

  if (!runtime && existsSync(localPath)) {
    try {
      const settings = JSON.parse(await readFile(localPath, 'utf-8'));
      runtime = settings?.Values?.FUNCTIONS_WORKER_RUNTIME;
      if (runtime) source = 'local.settings.json';
    } catch { /* ignore */ }
  }

  if (!runtime) {
    return { name: 'Worker runtime', status: 'fail', message: 'Not configured', fix: 'Set runtime.name in app-config.yaml or FUNCTIONS_WORKER_RUNTIME in local.settings.json' };
  }

  const runtimeSpec = STRUCTURED_FIELDS['runtime.name'];
  if (runtimeSpec?.allowed && !runtimeSpec.allowed.includes(runtime)) {
    return { name: 'Worker runtime', status: 'fail', message: `"${runtime}" is not a supported runtime`, fix: `Use one of: ${runtimeSpec.allowed.join(', ')}` };
  }

  return { name: 'Worker runtime', status: 'pass', message: `${runtime} (from ${source})` };
}

async function checkHostCache() {
  const cacheDir = join(homedir(), '.fnx', 'hosts');
  if (!existsSync(cacheDir)) {
    return { name: 'Host cache', status: 'warn', message: 'No cached host binaries', fix: 'Run: fnx warmup' };
  }
  try {
    const { readdirSync } = await import('node:fs');
    const entries = readdirSync(cacheDir);
    if (entries.length === 0) {
      return { name: 'Host cache', status: 'warn', message: 'Cache directory empty', fix: 'Run: fnx warmup' };
    }
    return { name: 'Host cache', status: 'pass', message: `${entries.length} version(s) cached in ~/.fnx/hosts/` };
  } catch {
    return { name: 'Host cache', status: 'warn', message: 'Unable to read cache', fix: 'Check permissions on ~/.fnx/hosts/' };
  }
}

function isPortInUse(port, host = '127.0.0.1', timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const timer = setTimeout(() => { socket.destroy(); resolve(false); }, timeoutMs);
    socket.on('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true); });
    socket.on('error', () => { clearTimeout(timer); socket.destroy(); resolve(false); });
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '0.0.0.0', () => { srv.close(() => resolve(true)); });
  });
}

async function checkPorts() {
  const ports = [
    { port: 7071, label: 'Host HTTP (7071)' },
    { port: 7072, label: 'MCP Server (7072)' },
  ];
  const results = [];
  for (const { port, label } of ports) {
    const free = await isPortFree(port);
    results.push(free
      ? { status: 'pass', detail: `${label} — available` }
      : { status: 'warn', detail: `${label} — in use` }
    );
  }
  const allFree = results.every(r => r.status === 'pass');
  return {
    name: 'Default ports',
    status: allFree ? 'pass' : 'warn',
    message: allFree ? '7071 and 7072 available' : results.filter(r => r.status === 'warn').map(r => r.detail).join('; '),
    fix: allFree ? undefined : 'Use --port to specify a different port, or stop the process using the port',
  };
}

async function checkAzurite() {
  const running = await isPortInUse(BLOB_PORT);
  if (running) {
    return { name: 'Azurite', status: 'pass', message: 'Running on default ports (10000–10002)' };
  }

  // Check if azurite binary is available (Windows uses .cmd shims)
  const isWin = process.platform === 'win32';
  const cachedBin = join(homedir(), '.fnx', 'tools', 'azurite', 'node_modules', '.bin', isWin ? 'azurite.cmd' : 'azurite');
  if (existsSync(cachedBin)) {
    return { name: 'Azurite', status: 'warn', message: 'Installed but not running — fnx start will auto-launch it', fix: 'Azurite will start automatically when needed' };
  }

  try {
    const whichCmd = isWin ? 'where azurite' : 'which azurite';
    execSync(whichCmd, { stdio: ['pipe', 'pipe', 'ignore'] });
    return { name: 'Azurite', status: 'warn', message: 'Installed globally but not running — fnx start will auto-launch it' };
  } catch { /* not found */ }

  return { name: 'Azurite', status: 'warn', message: 'Not installed — fnx will auto-install on first use', fix: 'Or install manually: npm install -g azurite' };
}

// ── Main doctor command ──

export async function runDoctor(appPath) {
  console.log(`\n${bold(title('fnx doctor'))} — Project Diagnostics\n`);
  console.log(dim(`  Checking: ${appPath}\n`));

  const checks = [
    await checkHostJson(appPath),
    await checkAppConfig(appPath),
    await checkLocalSettings(appPath),
    await checkRuntime(appPath),
    await checkHostCache(),
    await checkPorts(),
    await checkAzurite(),
  ];

  let hasIssues = false;
  for (const check of checks) {
    const icon = check.status === 'pass' ? success('✓') : check.status === 'warn' ? warning('⚠') : errorColor('✗');
    const msg = check.status === 'pass' ? info(check.message) : check.status === 'warn' ? warning(check.message) : errorColor(check.message);
    console.log(`  ${icon} ${bold(check.name)}: ${msg}`);
    if (check.fix && check.status !== 'pass') {
      console.log(dim(`    → ${check.fix}`));
    }
    if (check.status === 'fail') hasIssues = true;
  }

  console.log('');
  const failCount = checks.filter(c => c.status === 'fail').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;
  const passCount = checks.filter(c => c.status === 'pass').length;

  if (failCount === 0 && warnCount === 0) {
    console.log(success('  All checks passed! Your project is ready for fnx start.'));
  } else if (failCount === 0) {
    console.log(warning(`  ${passCount} passed, ${warnCount} warning(s). Project should work but check warnings above.`));
  } else {
    console.log(errorColor(`  ${failCount} error(s), ${warnCount} warning(s). Fix errors above before running fnx start.`));
  }
  console.log('');

  return failCount > 0 ? 1 : 0;
}
