import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { detectProject } = await import('../../fnx/lib/setup/detect.js');

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), 'fnx-detect-'));
}

describe('detectProject', () => {
  let tmp;

  afterEach(() => {
    if (tmp && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  });

  it('returns null when host.json is missing', async () => {
    tmp = makeTmpDir();
    const result = await detectProject(tmp);
    assert.equal(result, null);
  });

  it('returns null when host.json exists but no runtime detected', async () => {
    tmp = makeTmpDir();
    writeFileSync(join(tmp, 'host.json'), '{}');
    const result = await detectProject(tmp);
    assert.equal(result, null);
  });

  describe('Node.js detection', () => {
    it('detects Node.js TypeScript v4 project', async () => {
      tmp = makeTmpDir();
      writeFileSync(join(tmp, 'host.json'), '{}');
      writeFileSync(join(tmp, 'package.json'), JSON.stringify({
        dependencies: { '@azure/functions': '^4.0.0' }
      }));
      writeFileSync(join(tmp, 'tsconfig.json'), '{}');

      const result = await detectProject(tmp);
      assert.equal(result.runtime, 'node');
      assert.equal(result.language, 'typescript');
      assert.equal(result.programmingModel, 'v4');
      assert.equal(result.sku, 'flex');
      assert.equal(result.path, tmp);
    });

    it('detects Node.js JavaScript v4 project (no tsconfig)', async () => {
      tmp = makeTmpDir();
      writeFileSync(join(tmp, 'host.json'), '{}');
      writeFileSync(join(tmp, 'package.json'), JSON.stringify({
        dependencies: { '@azure/functions': '^4.1.0' }
      }));

      const result = await detectProject(tmp);
      assert.equal(result.runtime, 'node');
      assert.equal(result.language, 'javascript');
      assert.equal(result.programmingModel, 'v4');
    });

    it('detects v3 programming model', async () => {
      tmp = makeTmpDir();
      writeFileSync(join(tmp, 'host.json'), '{}');
      writeFileSync(join(tmp, 'package.json'), JSON.stringify({
        dependencies: { '@azure/functions': '3.5.0' }
      }));

      const result = await detectProject(tmp);
      assert.equal(result.programmingModel, 'v3');
    });

    it('defaults to v4 when package.json has no @azure/functions', async () => {
      tmp = makeTmpDir();
      writeFileSync(join(tmp, 'host.json'), '{}');
      writeFileSync(join(tmp, 'package.json'), JSON.stringify({
        dependencies: {}
      }));

      const result = await detectProject(tmp);
      assert.equal(result.runtime, 'node');
      assert.equal(result.programmingModel, 'v4');
    });
  });

  describe('Python detection', () => {
    it('detects Python project', async () => {
      tmp = makeTmpDir();
      writeFileSync(join(tmp, 'host.json'), '{}');
      writeFileSync(join(tmp, 'requirements.txt'), 'azure-functions');

      const result = await detectProject(tmp);
      assert.equal(result.runtime, 'python');
      assert.equal(result.language, 'python');
      assert.equal(result.programmingModel, 'v2');
    });
  });

  describe('Java detection', () => {
    it('detects Java project', async () => {
      tmp = makeTmpDir();
      writeFileSync(join(tmp, 'host.json'), '{}');
      writeFileSync(join(tmp, 'pom.xml'), '<project></project>');

      const result = await detectProject(tmp);
      assert.equal(result.runtime, 'java');
      assert.equal(result.language, 'java');
    });
  });

  describe('SKU detection', () => {
    it('defaults to flex when no app-config.yaml', async () => {
      tmp = makeTmpDir();
      writeFileSync(join(tmp, 'host.json'), '{}');
      writeFileSync(join(tmp, 'package.json'), '{"dependencies":{}}');

      const result = await detectProject(tmp);
      assert.equal(result.sku, 'flex');
    });

    it('reads SKU from app-config.yaml', async () => {
      tmp = makeTmpDir();
      writeFileSync(join(tmp, 'host.json'), '{}');
      writeFileSync(join(tmp, 'package.json'), '{"dependencies":{}}');
      writeFileSync(join(tmp, 'app-config.yaml'), 'targetSku: windows-consumption');

      const result = await detectProject(tmp);
      assert.equal(result.sku, 'windows-consumption');
    });
  });

  describe('Function detection', () => {
    it('detects HTTP trigger in src/functions/', async () => {
      tmp = makeTmpDir();
      writeFileSync(join(tmp, 'host.json'), '{}');
      writeFileSync(join(tmp, 'package.json'), '{"dependencies":{}}');
      mkdirSync(join(tmp, 'src', 'functions'), { recursive: true });
      writeFileSync(join(tmp, 'src', 'functions', 'hello.ts'), `
        import { app } from '@azure/functions';
        app.http('hello', { methods: ['GET'], handler: async (req) => ({ body: 'ok' }) });
      `);

      const result = await detectProject(tmp);
      assert.equal(result.functions.length, 1);
      assert.equal(result.functions[0].name, 'hello');
      assert.equal(result.functions[0].type, 'httpTrigger');
    });

    it('detects storage queue trigger', async () => {
      tmp = makeTmpDir();
      writeFileSync(join(tmp, 'host.json'), '{}');
      writeFileSync(join(tmp, 'package.json'), '{"dependencies":{}}');
      mkdirSync(join(tmp, 'src', 'functions'), { recursive: true });
      writeFileSync(join(tmp, 'src', 'functions', 'process.ts'), `
        import { app } from '@azure/functions';
        app.storageQueue('processItem', { queueName: 'items', handler: async (msg) => {} });
      `);

      const result = await detectProject(tmp);
      assert.equal(result.functions.length, 1);
      assert.equal(result.functions[0].name, 'processItem');
      assert.equal(result.functions[0].type, 'storageQueueTrigger');
    });

    it('detects multiple functions', async () => {
      tmp = makeTmpDir();
      writeFileSync(join(tmp, 'host.json'), '{}');
      writeFileSync(join(tmp, 'package.json'), '{"dependencies":{}}');
      mkdirSync(join(tmp, 'src', 'functions'), { recursive: true });
      writeFileSync(join(tmp, 'src', 'functions', 'api.ts'), `
        app.http('myApi', { methods: ['GET'] });
      `);
      writeFileSync(join(tmp, 'src', 'functions', 'worker.ts'), `
        app.timer('myTimer', { schedule: '0 */5 * * * *' });
      `);

      const result = await detectProject(tmp);
      assert.equal(result.functions.length, 2);
      const names = result.functions.map(f => f.name).sort();
      assert.deepEqual(names, ['myApi', 'myTimer']);
    });

    it('ignores index.ts and test files', async () => {
      tmp = makeTmpDir();
      writeFileSync(join(tmp, 'host.json'), '{}');
      writeFileSync(join(tmp, 'package.json'), '{"dependencies":{}}');
      mkdirSync(join(tmp, 'src', 'functions'), { recursive: true });
      writeFileSync(join(tmp, 'src', 'functions', 'index.ts'), `app.http('nope', {});`);
      writeFileSync(join(tmp, 'src', 'functions', 'hello.test.ts'), `app.http('nope2', {});`);
      writeFileSync(join(tmp, 'src', 'functions', 'real.ts'), `app.http('real', {});`);

      const result = await detectProject(tmp);
      assert.equal(result.functions.length, 1);
      assert.equal(result.functions[0].name, 'real');
    });

    it('returns empty array when no functions found', async () => {
      tmp = makeTmpDir();
      writeFileSync(join(tmp, 'host.json'), '{}');
      writeFileSync(join(tmp, 'package.json'), '{"dependencies":{}}');

      const result = await detectProject(tmp);
      assert.deepEqual(result.functions, []);
    });
  });
});
