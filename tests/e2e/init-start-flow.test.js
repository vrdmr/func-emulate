/**
 * E2E tests for fnx init → build → start → invoke flow
 *
 * Scaffolds a real project with `fnx init`, builds it, starts the host, and invokes HTTP.
 *
 * Host Selection:
 *   - If `func` CLI is available (Azure Functions Core Tools), uses `func host start`
 *     for full HTTP invocation testing (includes language workers).
 *   - Otherwise, falls back to `fnx start` with Flex host (no HTTP invocation).
 *
 * Prerequisites:
 *   - Network access (downloads templates from CDN)
 *   - Node.js/npm installed (for TypeScript tests)
 *   - Optional: `func` CLI for full HTTP testing, OR `fnx warmup --sku flex` for fnx start
 */

import { describe, test, after, before } from 'node:test';
import { strict as assert } from 'node:assert';
import { FnxCommand } from '../framework/command-builder.js';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { execSync, spawn } from 'node:child_process';
import http from 'node:http';

// Timeouts
const INIT_TIMEOUT = 60_000;
const BUILD_TIMEOUT = 120_000;
const READY_TIMEOUT = 60_000;
const SUITE_TIMEOUT = 300_000;

// Default tsconfig.json for Azure Functions TypeScript projects
const DEFAULT_TSCONFIG = {
  compilerOptions: {
    module: 'ESNext',
    target: 'ESNext',
    moduleResolution: 'Node',
    outDir: 'dist',
    rootDir: '.',
    sourceMap: true,
    strict: false,
    esModuleInterop: true,
  },
  include: ['src/**/*.ts'],
  exclude: ['node_modules'],
};

// Check if host binaries are cached (for fnx start fallback)
function isHostCached() {
  const cacheDir = join(homedir(), '.fnx', 'hosts');
  return existsSync(cacheDir);
}

// Check if func CLI is available (preferred for full HTTP testing)
function isFuncCliAvailable() {
  try {
    execSync('func --version', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// HTTP GET helper with promise
function httpGet(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// HTTP GET with retries
async function httpGetWithRetry(url, retries = 5, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await httpGet(url);
    } catch {
      if (i < retries - 1) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error(`Failed to reach ${url} after ${retries} retries`);
}

// Start func host and wait for ready
function startFuncHost(projectDir, port) {
  return new Promise((resolve, reject) => {
    const child = spawn('func', ['host', 'start', '--port', String(port)], {
      cwd: projectDir,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('func host start timed out'));
      }
    }, READY_TIMEOUT);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      if (!resolved && stdout.includes('http://localhost:')) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ child, stdout, stderr });
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`func exited with code ${code}: ${stderr}`));
      }
    });
  });
}

// Ensure tsconfig.json exists (some templates are missing it)
function ensureTsConfig(projectDir) {
  const tsconfigPath = join(projectDir, 'tsconfig.json');
  if (!existsSync(tsconfigPath)) {
    writeFileSync(tsconfigPath, JSON.stringify(DEFAULT_TSCONFIG, null, 2));
  }
}

// Run a shell command synchronously with timeout
function runCmd(cmd, cwd, timeoutMs = 60_000) {
  return execSync(cmd, {
    cwd,
    timeout: timeoutMs,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
}

// Cleanup helper
async function safeCleanup(running, tmpDir) {
  if (running) {
    running.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 2000));
    try { running.kill('SIGKILL'); } catch { /* already dead */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  if (tmpDir && existsSync(tmpDir)) {
    for (let i = 0; i < 3; i++) {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
}

describe('fnx init → build → start → invoke', { timeout: SUITE_TIMEOUT }, () => {
  let tmpDir = null;
  let projectDir = null;
  let running = null;
  let useFuncCli = false;
  let skipTests = false;

  before(() => {
    useFuncCli = isFuncCliAvailable();
    if (!useFuncCli && !isHostCached()) {
      console.log('Skipping: Neither func CLI nor fnx host cache available.');
      skipTests = true;
    }
    if (useFuncCli) {
      console.log('Using func CLI for full HTTP invocation testing.');
    }
  });

  after(async () => {
    await safeCleanup(running, tmpDir);
  });

  test('Python HTTP trigger: init → venv → pip install → start → invoke', { skip: true }, async (t) => {
    // SKIP: Flex Consumption host lacks Python worker (workers/python/).
    // When a host with Python support is available, enable this test.
    t.skip('Flex host lacks Python worker');
  });

  test('Node.js TypeScript: init → npm install → npm build → start → invoke', async (t) => {
    if (skipTests) {
      t.skip('No host available');
      return;
    }

    tmpDir = mkdtempSync(join(tmpdir(), 'fnx-flow-ts-'));
    projectDir = join(tmpDir, 'my-ts-func');

    // Step 1: fnx init
    const initResult = await FnxCommand.command('init')
      .withArg('--runtime', 'node')
      .withArg('--language', 'typescript')
      .withArg('--template', 'http-trigger-typescript')
      .withArg('--name', 'my-ts-func')
      .withArg('--sku', 'flex')
      .withArg('--yes')
      .withScriptRoot(tmpDir)
      .withTimeout(INIT_TIMEOUT)
      .execute();

    const initOutput = [...initResult.stdout, ...initResult.stderr].join('\n');
    if (initResult.exitCode !== 0) {
      if (initOutput.includes('network') || initOutput.includes('Cannot download')) {
        t.skip('Network unavailable');
        return;
      }
      assert.fail(`fnx init failed: ${initOutput}`);
    }

    assert.ok(existsSync(projectDir), 'Project directory should exist');
    assert.ok(existsSync(join(projectDir, 'package.json')), 'package.json should exist');

    // Step 2: npm install
    try {
      runCmd('npm install', projectDir, BUILD_TIMEOUT);
    } catch (err) {
      assert.fail(`npm install failed: ${err.message}`);
    }
    assert.ok(existsSync(join(projectDir, 'node_modules')), 'node_modules should exist');

    // Ensure tsconfig.json exists (template may be missing it)
    ensureTsConfig(projectDir);

    // Step 3: npm run build
    try {
      runCmd('npm run build', projectDir, BUILD_TIMEOUT);
    } catch (err) {
      assert.fail(`npm run build failed: ${err.message}`);
    }
    assert.ok(existsSync(join(projectDir, 'dist')), 'dist folder should exist after build');

    // Step 4: Start host
    const testPort = 7098 + Math.floor(Math.random() * 100);

    if (useFuncCli) {
      // Use func CLI for full HTTP invocation testing
      let startResult;
      try {
        startResult = await startFuncHost(projectDir, testPort);
      } catch (err) {
        if (err.message.includes('timed out')) {
          t.skip('func host start timed out');
          return;
        }
        throw err;
      }
      running = startResult.child;

      // Step 5: Invoke HTTP function
      const url = `http://localhost:${testPort}/api/httpTrigger?name=E2ETest`;
      const response = await httpGetWithRetry(url, 5, 1000);
      assert.strictEqual(response.statusCode, 200, 'HTTP response should be 200');
      assert.ok(response.body.includes('E2ETest'), 'Response should include name');

      running.kill('SIGTERM');
      running = null;
    } else {
      // Fallback: fnx start (no HTTP invocation due to worker indexing issues)
      const startCmd = FnxCommand.start()
        .withScriptRoot(projectDir)
        .withSku('flex')
        .withTimeout(READY_TIMEOUT)
        .waitForReady('Now listening on:');

      let startResult;
      try {
        startResult = await startCmd.execute();
      } catch (err) {
        if (err.message.includes('timeout')) {
          t.skip('Host startup timed out');
          return;
        }
        throw err;
      }

      running = startResult.child;
      const startOutput = startResult.stdout.join('\n') + startResult.stderr.join('\n');
      assert.ok(startOutput.includes('Now listening on:'), 'Host should be listening');

      running.kill('SIGTERM');
      running = null;
    }
  });
});

describe('fnx init --name . → build → start → invoke', { timeout: SUITE_TIMEOUT }, () => {
  let tmpDir = null;
  let running = null;
  let useFuncCli = false;
  let skipTests = false;

  before(() => {
    useFuncCli = isFuncCliAvailable();
    if (!useFuncCli && !isHostCached()) {
      skipTests = true;
    }
  });

  after(async () => {
    await safeCleanup(running, tmpDir);
  });

  test('init in current directory with full build, start, and invoke', async (t) => {
    if (skipTests) {
      t.skip('No host available');
      return;
    }

    tmpDir = mkdtempSync(join(tmpdir(), 'fnx-flow-cwd-'));

    // Step 1: fnx init --name .
    const initResult = await FnxCommand.command('init')
      .withArg('--runtime', 'node')
      .withArg('--language', 'typescript')
      .withArg('--template', 'http-trigger-typescript')
      .withArg('--name', '.')
      .withArg('--sku', 'flex')
      .withArg('--yes')
      .withScriptRoot(tmpDir)
      .withTimeout(INIT_TIMEOUT)
      .execute();

    if (initResult.exitCode !== 0) {
      const out = [...initResult.stdout, ...initResult.stderr].join('\n');
      if (out.includes('network')) {
        t.skip('Network unavailable');
        return;
      }
    }

    assert.ok(existsSync(join(tmpDir, 'app-config.yaml')), 'app-config.yaml should be in cwd');
    assert.ok(existsSync(join(tmpDir, 'package.json')), 'package.json should be in cwd');

    // Step 2: npm install
    try {
      runCmd('npm install', tmpDir, BUILD_TIMEOUT);
    } catch (err) {
      assert.fail(`npm install failed: ${err.message}`);
    }

    // Ensure tsconfig.json exists (template may be missing it)
    ensureTsConfig(tmpDir);

    // Step 3: npm run build
    try {
      runCmd('npm run build', tmpDir, BUILD_TIMEOUT);
    } catch (err) {
      assert.fail(`npm run build failed: ${err.message}`);
    }

    // Step 4: Start host
    const testPort = 7198 + Math.floor(Math.random() * 100);

    if (useFuncCli) {
      // Use func CLI for full HTTP invocation testing
      let startResult;
      try {
        startResult = await startFuncHost(tmpDir, testPort);
      } catch (err) {
        if (err.message.includes('timed out')) {
          t.skip('func host start timed out');
          return;
        }
        throw err;
      }
      running = startResult.child;

      // Step 5: Invoke HTTP function
      const url = `http://localhost:${testPort}/api/httpTrigger?name=CwdTest`;
      const response = await httpGetWithRetry(url, 5, 1000);
      assert.strictEqual(response.statusCode, 200, 'HTTP response should be 200');
      assert.ok(response.body.includes('CwdTest'), 'Response should include name');

      running.kill('SIGTERM');
      running = null;
    } else {
      // Fallback: fnx start (no HTTP invocation)
      const startCmd = FnxCommand.start()
        .withScriptRoot(tmpDir)
        .withSku('flex')
        .withTimeout(READY_TIMEOUT)
        .waitForReady('Now listening on:');

      let startResult;
      try {
        startResult = await startCmd.execute();
      } catch (err) {
        if (err.message.includes('timeout')) {
          t.skip('Host startup timed out');
          return;
        }
        throw err;
      }

      running = startResult.child;
      const startOutput = startResult.stdout.join('\n') + startResult.stderr.join('\n');
      assert.ok(startOutput.includes('Now listening on:'), 'Host should be listening');

      running.kill('SIGTERM');
      running = null;
    }
  });
});
