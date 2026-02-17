import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Import doctor
const { runDoctor } = await import('../../fnx/lib/doctor.js');

describe('fnx doctor', () => {
  let tmpDir;
  let originalLog;
  let originalError;
  let logOutput;

  function captureConsole() {
    logOutput = [];
    originalLog = console.log;
    originalError = console.error;
    console.log = (...args) => logOutput.push(args.join(' '));
    console.error = (...args) => logOutput.push(args.join(' '));
  }

  function restoreConsole() {
    console.log = originalLog;
    console.error = originalError;
  }

  function getOutput() {
    return logOutput.join('\n');
  }

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'fnx-doctor-'));
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports missing host.json as failure', async () => {
    captureConsole();
    try {
      const exitCode = await runDoctor(tmpDir);
      const output = getOutput();
      assert.ok(output.includes('host.json'), 'Should mention host.json');
      assert.ok(output.includes('Not found'), 'Should say not found');
      assert.equal(exitCode, 1, 'Should exit 1 on failure');
    } finally {
      restoreConsole();
    }
  });

  it('passes with valid host.json', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fnx-doctor-valid-'));
    writeFileSync(join(dir, 'host.json'), JSON.stringify({ version: '2.0' }));
    writeFileSync(join(dir, 'app-config.yaml'), 'runtime:\n  name: node\nlocal:\n  targetSku: flex\n');
    writeFileSync(join(dir, 'local.settings.json'), JSON.stringify({ IsEncrypted: false, Values: { AzureWebJobsStorage: 'UseDevelopmentStorage=true' } }));

    captureConsole();
    try {
      const exitCode = await runDoctor(dir);
      const output = getOutput();
      assert.ok(output.includes('host.json'), 'Should check host.json');
      assert.ok(output.includes('Present and valid'), 'Should say valid');
    } finally {
      restoreConsole();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects missing app-config.yaml with local.settings.json present', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fnx-doctor-legacy-'));
    writeFileSync(join(dir, 'host.json'), JSON.stringify({ version: '2.0' }));
    writeFileSync(join(dir, 'local.settings.json'), JSON.stringify({ IsEncrypted: false, Values: { FUNCTIONS_WORKER_RUNTIME: 'node' } }));

    captureConsole();
    try {
      await runDoctor(dir);
      const output = getOutput();
      assert.ok(output.includes('app-config.yaml'), 'Should check app-config.yaml');
      assert.ok(output.includes('auto-created') || output.includes('fnx config migrate'), 'Should suggest migration');
    } finally {
      restoreConsole();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects secrets in app-config.yaml', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fnx-doctor-secret-'));
    writeFileSync(join(dir, 'host.json'), JSON.stringify({ version: '2.0' }));
    writeFileSync(join(dir, 'app-config.yaml'), 'runtime:\n  name: node\nconfigurations:\n  MyConnectionString: "DefaultEndpointsProtocol=https;AccountKey=abc123"\n');

    captureConsole();
    try {
      const exitCode = await runDoctor(dir);
      const output = getOutput();
      assert.ok(output.includes('secret'), 'Should detect secrets');
      assert.equal(exitCode, 1, 'Should exit 1 when secrets found');
    } finally {
      restoreConsole();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects missing runtime configuration', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fnx-doctor-noruntime-'));
    writeFileSync(join(dir, 'host.json'), JSON.stringify({ version: '2.0' }));
    writeFileSync(join(dir, 'app-config.yaml'), 'local:\n  targetSku: flex\n');

    captureConsole();
    try {
      const exitCode = await runDoctor(dir);
      const output = getOutput();
      assert.ok(output.includes('Worker runtime'), 'Should check worker runtime');
      assert.ok(output.includes('Not configured'), 'Should say not configured');
      assert.equal(exitCode, 1, 'Should exit 1 when runtime missing');
    } finally {
      restoreConsole();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects invalid runtime name', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fnx-doctor-badruntime-'));
    writeFileSync(join(dir, 'host.json'), JSON.stringify({ version: '2.0' }));
    writeFileSync(join(dir, 'app-config.yaml'), 'runtime:\n  name: ruby\nlocal:\n  targetSku: flex\n');

    captureConsole();
    try {
      const exitCode = await runDoctor(dir);
      const output = getOutput();
      assert.ok(output.includes('not a supported runtime'), 'Should flag invalid runtime');
      assert.equal(exitCode, 1);
    } finally {
      restoreConsole();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('checks port availability', async () => {
    captureConsole();
    try {
      await runDoctor(tmpDir);
      const output = getOutput();
      assert.ok(output.includes('Default ports'), 'Should check ports');
    } finally {
      restoreConsole();
    }
  });

  it('checks Azurite status', async () => {
    captureConsole();
    try {
      await runDoctor(tmpDir);
      const output = getOutput();
      assert.ok(output.includes('Azurite'), 'Should check Azurite');
    } finally {
      restoreConsole();
    }
  });

  it('reports summary counts', async () => {
    captureConsole();
    try {
      await runDoctor(tmpDir);
      const output = getOutput();
      assert.ok(output.includes('error') || output.includes('passed') || output.includes('warning'), 'Should show summary');
    } finally {
      restoreConsole();
    }
  });

  it('reads runtime from local.settings.json when no app-config.yaml', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fnx-doctor-lsj-'));
    writeFileSync(join(dir, 'host.json'), JSON.stringify({ version: '2.0' }));
    writeFileSync(join(dir, 'local.settings.json'), JSON.stringify({ IsEncrypted: false, Values: { FUNCTIONS_WORKER_RUNTIME: 'python', AzureWebJobsStorage: 'UseDevelopmentStorage=true' } }));

    captureConsole();
    try {
      await runDoctor(dir);
      const output = getOutput();
      assert.ok(output.includes('python'), 'Should detect python runtime');
      assert.ok(output.includes('local.settings.json'), 'Should show source');
    } finally {
      restoreConsole();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
