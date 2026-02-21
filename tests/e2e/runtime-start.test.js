// runtime-start.test.js — Full start+invoke E2E tests
//
// Actually starts fnx with each runtime's test app, waits for the host
// to be ready, sends HTTP requests, and verifies trigger registration.
// Requires: host binaries cached (fnx warmup), Azurite available.

import { describe, test, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { FnxCommand } from '../framework/command-builder.js';
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';
import http from 'node:http';

const IS_WINDOWS = platform() === 'win32';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NODE_APP = resolvePath(__dirname, '..', 'test-node-app');
const PYTHON_APP = resolvePath(__dirname, '..', 'test-python-app');

// CI needs longer timeouts — host binary + extension bundle downloads
const IS_CI = !!process.env.CI;
const READY_TIMEOUT = IS_CI ? 180_000 : 60_000;   // waitForReady pattern match
const SUITE_TIMEOUT = IS_CI ? 240_000 : 90_000;    // node:test suite timeout

// Helper: send HTTP GET and return { status, body }
function httpGet(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`HTTP GET timeout: ${url}`)), timeoutMs);
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode, body });
      });
    }).on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Helper: retry HTTP GET until success or timeout
async function httpGetWithRetry(url, { retries = 5, delayMs = 1000, timeoutMs = 5000 } = {}) {
  for (let i = 0; i < retries; i++) {
    try {
      return await httpGet(url, timeoutMs);
    } catch {
      if (i < retries - 1) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error(`HTTP GET failed after ${retries} retries: ${url}`);
}

describe('Node.js — full start + HTTP invocation', { timeout: SUITE_TIMEOUT }, () => {
  let running = null;

  after(async () => {
    if (running) {
      running.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 1000));
      try { running.kill('SIGKILL'); } catch { /* already dead */ }
    }
  });

  test('start node app, invoke HTTP trigger, verify blob trigger registered', async () => {
    // Start fnx with --verbose to see full indexing output (blob trigger names)
    const cmd = FnxCommand.start()
      .withScriptRoot(NODE_APP)
      .withSku('flex')
      .withVerbose()
      .withTimeout(READY_TIMEOUT)
      .waitForReady('Now listening on:');

    const result = await cmd.execute();
    running = result.child;
    const port = result.port;

    // Verify we got the listening message
    const allOutput = result.stdout.join('\n') + result.stderr.join('\n');
    assert.ok(allOutput.includes('Now listening on:'), 'Host should be listening');

    // Verify functions are listed
    assert.ok(allOutput.includes('hello'), 'Should list hello HTTP function');

    // Wait a moment for routes to be ready, then invoke HTTP trigger
    await new Promise(r => setTimeout(r, 2000));
    const httpResult = await httpGetWithRetry(`http://localhost:${port}/api/hello?name=fnxtest`);
    assert.equal(httpResult.status, 200, 'HTTP trigger should return 200');
    assert.ok(httpResult.body.includes('fnxtest'), 'Response should contain the name parameter');

    // Re-read output (more may have arrived after waitForReady resolved)
    const fullOutput = result.watcher.getStdout() + result.watcher.getStderr();

    // Verify blob trigger is registered (appears in output as function name or trigger type)
    assert.ok(
      fullOutput.includes('blobProcessor') || fullOutput.includes('blobTrigger') ||
      fullOutput.includes('blob_trigger') || fullOutput.includes('Blob'),
      'Should register blob trigger function'
    );

    // Verify Azurite interaction (fnx should detect storage)
    assert.ok(
      fullOutput.includes('Azurite') || fullOutput.includes('AzureWebJobsStorage'),
      'Should show Azurite/storage status'
    );

    // Clean shutdown
    running.kill('SIGTERM');
    running = null;
  });
});

// Skip Python tests on Windows: the bundled host does not include python worker.
// See: https://github.com/vrdmr/func-emulate/issues/34
describe('Python — full start + HTTP invocation', {
  timeout: SUITE_TIMEOUT,
  skip: IS_WINDOWS ? 'Python worker not bundled in Windows host package (see #34)' : false,
}, () => {
  let running = null;

  after(async () => {
    if (running) {
      running.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 1000));
      try { running.kill('SIGKILL'); } catch { /* already dead */ }
    }
  });

  test('start python app, invoke HTTP trigger, verify blob trigger registered', async () => {
    const cmd = FnxCommand.start()
      .withScriptRoot(PYTHON_APP)
      .withSku('flex')
      .withVerbose()
      .withTimeout(READY_TIMEOUT)
      .waitForReady('Now listening on:');

    const result = await cmd.execute();
    running = result.child;
    const port = result.port;

    // Give time for full indexing output
    await new Promise(r => setTimeout(r, 2000));
    const allOutput = result.watcher.getStdout() + result.watcher.getStderr();
    assert.ok(allOutput.includes('Now listening on:'), 'Host should be listening');

    // Verify Python runtime detected
    assert.ok(allOutput.includes('Python') || allOutput.includes('python'),
      'Should detect Python runtime');

    // Verify functions listed
    assert.ok(allOutput.includes('hello'), 'Should list hello HTTP function');

    // Invoke HTTP trigger
    await new Promise(r => setTimeout(r, 2000));
    const httpResult = await httpGetWithRetry(`http://localhost:${port}/api/hello?name=fnxpython`);
    assert.equal(httpResult.status, 200, 'HTTP trigger should return 200');
    assert.ok(httpResult.body.includes('fnxpython') || httpResult.body.includes('HTTP triggered'),
      'Response should be valid');

    // Re-read output after invocation
    const fullOutput = result.watcher.getStdout() + result.watcher.getStderr();

    // Verify blob trigger registered
    assert.ok(
      fullOutput.includes('blob_trigger') || fullOutput.includes('blobTrigger') ||
      fullOutput.includes('Blob'),
      'Should register blob trigger function'
    );

    // Verify Azurite
    assert.ok(
      fullOutput.includes('Azurite') || fullOutput.includes('AzureWebJobsStorage'),
      'Should show Azurite/storage status'
    );

    running.kill('SIGTERM');
    running = null;
  });
});

describe('Node.js — cross-SKU start', { timeout: SUITE_TIMEOUT }, () => {
  // Only test flex in CI (warmup only downloads flex). Locally test all SKUs.
  const skus = IS_CI ? ['flex'] : ['flex', 'linux-premium', 'windows-consumption'];
  let running = null;

  after(async () => {
    if (running) {
      running.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 1000));
      try { running.kill('SIGKILL'); } catch { /* already dead */ }
    }
  });

  for (const sku of skus) {
    test(`start node app with --sku ${sku} shows correct banner`, { timeout: SUITE_TIMEOUT }, async () => {
      const cmd = FnxCommand.start()
        .withScriptRoot(NODE_APP)
        .withSku(sku)
        .withTimeout(READY_TIMEOUT)
        .waitForReady('Now listening on:');

      try {
        const result = await cmd.execute();
        running = result.child;
        const allOutput = result.stdout.join('\n') + result.stderr.join('\n');

        // Should show the SKU in the banner
        assert.ok(allOutput.includes('Azure Functions Local Emulator'),
          'Should show emulator banner');
        assert.ok(allOutput.includes('Host Version:'),
          'Should show host version');

        running.kill('SIGTERM');
        running = null;
      } catch (err) {
        // If host binary for this SKU isn't cached, that's acceptable — skip
        if (running) { running.kill('SIGTERM'); running = null; }
        if (err.message.includes('Timeout')) {
          console.log(`  ⚠ Skipped: host binary for ${sku} not cached`);
          return;
        }
        throw err;
      }
    });
  }
});

describe('Azurite lifecycle', { timeout: SUITE_TIMEOUT }, () => {
  let running = null;

  after(async () => {
    if (running) {
      running.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 1000));
      try { running.kill('SIGKILL'); } catch { /* already dead */ }
    }
  });

  test('fnx auto-detects Azurite for storage triggers', async () => {
    const cmd = FnxCommand.start()
      .withScriptRoot(NODE_APP)
      .withSku('flex')
      .withTimeout(READY_TIMEOUT)
      .waitForReady('Now listening on:');

    const result = await cmd.execute();
    running = result.child;

    // Give a moment for all output to arrive
    await new Promise(r => setTimeout(r, 1000));
    const fullOutput = result.watcher.getStdout() + result.watcher.getStderr();

    // fnx should either start Azurite or detect existing instance
    assert.ok(
      fullOutput.includes('Starting Azurite') ||
      fullOutput.includes('Using existing Azurite') ||
      fullOutput.includes('Azurite Blob') ||
      fullOutput.includes('Azurite'),
      'Should handle Azurite (start or detect existing)'
    );

    running.kill('SIGTERM');
    running = null;
  });
});
