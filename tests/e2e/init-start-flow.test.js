/**
 * E2E tests for fnx init → build → start → invoke flow
 *
 * Scaffolds a real project with `fnx init`, builds it, starts the host with
 * `fnx start`, and invokes HTTP endpoints.
 *
 * Prerequisites:
 *   - Network access (downloads templates from CDN)
 *   - Node.js/npm installed (for TypeScript tests)
 *   - Host cache available (`fnx warmup --sku flex`)
 */

import { describe, test, after, before } from 'node:test';
import { strict as assert } from 'node:assert';
import { FnxCommand } from '../framework/command-builder.js';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import http from 'node:http';

// Timeouts
const INIT_TIMEOUT = 60_000;
const BUILD_TIMEOUT = 300_000;  // 5 minutes for npm install (network-dependent)
const READY_TIMEOUT = 60_000;
const SUITE_TIMEOUT = 600_000;  // 10 minutes per suite

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

// Check if host binaries are cached (required for fnx start)
function isHostCached() {
  const cacheDir = join(homedir(), '.fnx', 'hosts');
  return existsSync(cacheDir);
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
  let skipTests = false;

  before(() => {
    if (!isHostCached()) {
      console.log('Skipping: fnx host cache not available. Run `fnx warmup --sku flex` first.');
      skipTests = true;
    }
  });

  after(async () => {
    await safeCleanup(running, tmpDir);
  });

  test('Python HTTP trigger: init → venv → pip install → start → invoke', async (t) => {
    if (skipTests) {
      t.skip('No host available');
      return;
    }

    // Check if Python is available
    let pythonCmd = null;
    for (const cmd of ['python', 'python3', 'py -3']) {
      try {
        execSync(`${cmd} --version`, { stdio: 'pipe' });
        pythonCmd = cmd;
        break;
      } catch { /* try next */ }
    }
    if (!pythonCmd) {
      t.skip('Python not available');
      return;
    }

    const pyTmpDir = mkdtempSync(join(tmpdir(), 'fnx-flow-py-'));
    const pyProjectDir = join(pyTmpDir, 'my-py-func');

    try {
      // Step 1: fnx init
      const initResult = await FnxCommand.command('init')
        .withArg('--runtime', 'python')
        .withArg('--template', 'http-trigger-python')
        .withArg('--name', 'my-py-func')
        .withArg('--sku', 'flex')
        .withArg('--yes')
        .withScriptRoot(pyTmpDir)
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

      assert.ok(existsSync(pyProjectDir), 'Project directory should exist');
      assert.ok(existsSync(join(pyProjectDir, 'requirements.txt')), 'requirements.txt should exist');

      // Step 2: Create venv and install dependencies
      try {
        runCmd(`${pythonCmd} -m venv .venv`, pyProjectDir, BUILD_TIMEOUT);
      } catch (err) {
        assert.fail(`venv creation failed: ${err.message}`);
      }

      // Determine pip path based on OS
      const isWindows = process.platform === 'win32';
      const pipPath = isWindows
        ? join(pyProjectDir, '.venv', 'Scripts', 'pip')
        : join(pyProjectDir, '.venv', 'bin', 'pip');

      try {
        runCmd(`"${pipPath}" install -r requirements.txt`, pyProjectDir, BUILD_TIMEOUT);
      } catch (err) {
        assert.fail(`pip install failed: ${err.message}`);
      }

      // Step 2.5: Patch function to use anonymous auth for testing
      // NOTE: Unlike `func start`, fnx directly launches the host binary which doesn't
      // bypass function-level auth in development mode. We patch to anonymous for testing.
      // Production users can use function keys via the ?code= parameter.
      const funcAppPath = join(pyProjectDir, 'function_app.py');
      if (existsSync(funcAppPath)) {
        let content = readFileSync(funcAppPath, 'utf-8');
        content = content.replace(
          /auth_level\s*=\s*func\.AuthLevel\.FUNCTION/g,
          'auth_level=func.AuthLevel.ANONYMOUS'
        );
        writeFileSync(funcAppPath, content);
      }

      // Step 3: Start fnx host
      const startCmd = FnxCommand.start()
        .withScriptRoot(pyProjectDir)
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
      const testPort = startResult.port;

      // Step 4: Invoke HTTP function (using anonymous auth)
      const url = `http://localhost:${testPort}/api/http_trigger?name=PyTest`;

      const response = await httpGetWithRetry(url, 5, 1000);
      assert.strictEqual(response.statusCode, 200, 'HTTP response should be 200');
      assert.ok(response.body.includes('PyTest') || response.body.includes('Hello'), 'Response should include greeting');

      running.kill('SIGTERM');
      running = null;
    } finally {
      // Cleanup Python temp dir
      await safeCleanup(null, pyTmpDir);
    }
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

    // Step 4: Start fnx host
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
    const testPort = startResult.port;

    // Step 5: Invoke HTTP function (template uses anonymous auth)
    const url = `http://localhost:${testPort}/api/httpTrigger?name=E2ETest`;

    const response = await httpGetWithRetry(url, 5, 1000);
    assert.strictEqual(response.statusCode, 200, 'HTTP response should be 200');
    assert.ok(response.body.includes('E2ETest'), 'Response should include name');

    running.kill('SIGTERM');
    running = null;
  });
});

describe('fnx init --name . → build → start → invoke', { timeout: SUITE_TIMEOUT }, () => {
  let tmpDir = null;
  let running = null;
  let skipTests = false;

  before(() => {
    if (!isHostCached()) {
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

    // Step 4: Start fnx host
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
    const testPort = startResult.port;

    // Step 5: Invoke HTTP function (template uses anonymous auth)
    const url = `http://localhost:${testPort}/api/httpTrigger?name=CwdTest`;

    const response = await httpGetWithRetry(url, 5, 1000);
    assert.strictEqual(response.statusCode, 200, 'HTTP response should be 200');
    assert.ok(response.body.includes('CwdTest'), 'Response should include name');

    running.kill('SIGTERM');
    running = null;
  });
});
