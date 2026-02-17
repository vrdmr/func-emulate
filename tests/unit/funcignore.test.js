import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { loadFuncIgnore, getFilteredFiles, DEFAULT_EXCLUDED_FILES, DEFAULT_EXCLUDED_DIRS, PYTHON_VENV_DIRS } = await import('../../fnx/lib/funcignore.js');

describe('funcignore', () => {
  let tmpDir;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'fnx-funcignore-test-'));
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function createProject(files) {
    const projectDir = mkdtempSync(join(tmpDir, 'project-'));
    for (const [relPath, content] of Object.entries(files)) {
      const fullPath = join(projectDir, relPath);
      mkdirSync(join(fullPath, '..'), { recursive: true });
      writeFileSync(fullPath, content || '');
    }
    return projectDir;
  }

  describe('default exclusions', () => {
    it('excludes .funcignore, .gitignore, local.settings.json, project.lock.json by default', async () => {
      const dir = createProject({
        'host.json': '{}',
        '.funcignore': '# empty',
        '.gitignore': 'node_modules/',
        'local.settings.json': '{}',
        'project.lock.json': '{}',
        'package.json': '{}',
      });

      const ig = await loadFuncIgnore(dir);
      const files = await getFilteredFiles(dir, ig);

      assert.ok(files.includes('host.json'));
      assert.ok(files.includes('package.json'));
      assert.ok(!files.includes('.funcignore'));
      assert.ok(!files.includes('.gitignore'));
      assert.ok(!files.includes('local.settings.json'));
      assert.ok(!files.includes('project.lock.json'));
    });

    it('excludes .git/ and .vscode/ directories by default', async () => {
      const dir = createProject({
        'host.json': '{}',
        '.git/config': '[core]',
        '.git/HEAD': 'ref: refs/heads/main',
        '.vscode/settings.json': '{}',
        '.vscode/launch.json': '{}',
        'src/index.js': '',
      });

      const ig = await loadFuncIgnore(dir);
      const files = await getFilteredFiles(dir, ig);

      assert.ok(files.includes('host.json'));
      assert.ok(files.includes('src/index.js'));
      assert.ok(!files.some(f => f.startsWith('.git/')));
      assert.ok(!files.some(f => f.startsWith('.vscode/')));
    });
  });

  describe('.funcignore patterns', () => {
    it('excludes files matching glob patterns', async () => {
      const dir = createProject({
        'host.json': '{}',
        'index.js': '',
        'index.js.map': '',
        'lib/utils.js': '',
        'lib/utils.js.map': '',
        '.funcignore': '*.js.map',
      });

      const ig = await loadFuncIgnore(dir);
      const files = await getFilteredFiles(dir, ig);

      assert.ok(files.includes('index.js'));
      assert.ok(files.includes('lib/utils.js'));
      assert.ok(!files.includes('index.js.map'));
      assert.ok(!files.includes('lib/utils.js.map'));
    });

    it('excludes directories by name', async () => {
      const dir = createProject({
        'host.json': '{}',
        'src/index.js': '',
        'test/test1.js': '',
        'test/test2.js': '',
        '.funcignore': 'test',
      });

      const ig = await loadFuncIgnore(dir);
      const files = await getFilteredFiles(dir, ig);

      assert.ok(files.includes('src/index.js'));
      assert.ok(!files.some(f => f.startsWith('test/')));
    });

    it('supports negation patterns to re-include files', async () => {
      const dir = createProject({
        'host.json': '{}',
        'README.md': '# readme',
        'LICENSE.md': '# license',
        'CONTRIBUTING.md': '# contributing',
        '.funcignore': '*.md\n!LICENSE.md',
      });

      const ig = await loadFuncIgnore(dir);
      const files = await getFilteredFiles(dir, ig);

      assert.ok(files.includes('host.json'));
      assert.ok(files.includes('LICENSE.md'));
      assert.ok(!files.includes('README.md'));
      assert.ok(!files.includes('CONTRIBUTING.md'));
    });

    it('ignores comments and empty lines in .funcignore', async () => {
      const dir = createProject({
        'host.json': '{}',
        'test.log': 'logs',
        'app.js': '',
        '.funcignore': '# This is a comment\n\n*.log\n\n# Another comment',
      });

      const ig = await loadFuncIgnore(dir);
      const files = await getFilteredFiles(dir, ig);

      assert.ok(files.includes('host.json'));
      assert.ok(files.includes('app.js'));
      assert.ok(!files.includes('test.log'));
    });

    it('handles the default Node.js .funcignore content', async () => {
      const dir = createProject({
        'host.json': '{}',
        'package.json': '{}',
        'src/functions/hello.js': '',
        'src/functions/hello.ts': '',
        'src/functions/hello.js.map': '',
        'test/test1.js': '',
        'getting_started.md': '# Getting Started',
        'node_modules/@types/node/index.d.ts': '',
        'node_modules/azure-functions-core-tools/bin/func': '',
        'node_modules/typescript/lib/tsc.js': '',
        'node_modules/other-package/index.js': '',
        '.funcignore': [
          '*.js.map',
          '*.ts',
          '.git*',
          '.vscode',
          'local.settings.json',
          'test',
          'getting_started.md',
          'node_modules/@types/',
          'node_modules/azure-functions-core-tools/',
          'node_modules/typescript/',
        ].join('\n'),
      });

      const ig = await loadFuncIgnore(dir);
      const files = await getFilteredFiles(dir, ig);

      assert.ok(files.includes('host.json'));
      assert.ok(files.includes('package.json'));
      assert.ok(files.includes('src/functions/hello.js'));
      assert.ok(files.includes('node_modules/other-package/index.js'));
      // Excluded by .funcignore
      assert.ok(!files.includes('src/functions/hello.ts'));
      assert.ok(!files.includes('src/functions/hello.js.map'));
      assert.ok(!files.some(f => f.startsWith('test/')));
      assert.ok(!files.includes('getting_started.md'));
      assert.ok(!files.some(f => f.startsWith('node_modules/@types/')));
      assert.ok(!files.some(f => f.startsWith('node_modules/azure-functions-core-tools/')));
      assert.ok(!files.some(f => f.startsWith('node_modules/typescript/')));
    });
  });

  describe('no .funcignore', () => {
    it('includes all files except defaults when .funcignore is missing', async () => {
      const dir = createProject({
        'host.json': '{}',
        'package.json': '{}',
        'src/index.js': '',
        'test/test1.js': '',
        'README.md': '# readme',
      });

      const ig = await loadFuncIgnore(dir);
      const files = await getFilteredFiles(dir, ig);

      // All user files included
      assert.ok(files.includes('host.json'));
      assert.ok(files.includes('package.json'));
      assert.ok(files.includes('src/index.js'));
      assert.ok(files.includes('test/test1.js'));
      assert.ok(files.includes('README.md'));
    });
  });

  describe('python venv auto-detection', () => {
    it('auto-excludes .venv directory for python runtime', async () => {
      const dir = createProject({
        'host.json': '{}',
        'function_app.py': '',
        'requirements.txt': '',
        '.venv/pyvenv.cfg': 'home = /usr/bin',
        '.venv/lib/python3.11/site-packages/pkg/mod.py': '',
        '.venv/bin/activate': '#!/bin/bash',
      });

      const ig = await loadFuncIgnore(dir, { runtime: 'python' });
      const files = await getFilteredFiles(dir, ig);

      assert.ok(files.includes('host.json'));
      assert.ok(files.includes('function_app.py'));
      assert.ok(files.includes('requirements.txt'));
      assert.ok(!files.some(f => f.startsWith('.venv/')));
    });

    it('does not exclude .venv for non-python runtimes', async () => {
      const dir = createProject({
        'host.json': '{}',
        '.venv/pyvenv.cfg': 'home = /usr/bin',
        '.venv/bin/activate': '#!/bin/bash',
        '.venv/some-file.txt': 'data',
      });

      const ig = await loadFuncIgnore(dir, { runtime: 'node' });
      const files = await getFilteredFiles(dir, ig);

      assert.ok(files.some(f => f.startsWith('.venv/')));
    });

    it('does not exclude directory named .venv if it is not a real venv', async () => {
      const dir = createProject({
        'host.json': '{}',
        '.venv/not-a-venv.txt': 'just a dir named .venv',
      });

      const ig = await loadFuncIgnore(dir, { runtime: 'python' });
      const files = await getFilteredFiles(dir, ig);

      // .venv exists but has no pyvenv.cfg or activate — should NOT be excluded
      assert.ok(files.some(f => f.startsWith('.venv/')));
    });

    it('auto-excludes venv directory with Scripts/activate.bat (Windows-style)', async () => {
      const dir = createProject({
        'host.json': '{}',
        'function_app.py': '',
        'venv/Scripts/activate.bat': '@echo off',
        'venv/Lib/site-packages/pkg.py': '',
      });

      const ig = await loadFuncIgnore(dir, { runtime: 'python' });
      const files = await getFilteredFiles(dir, ig);

      assert.ok(files.includes('function_app.py'));
      assert.ok(!files.some(f => f.startsWith('venv/')));
    });
  });

  describe('exported constants', () => {
    it('exports expected default exclusion lists', () => {
      assert.ok(DEFAULT_EXCLUDED_FILES.includes('.funcignore'));
      assert.ok(DEFAULT_EXCLUDED_FILES.includes('.gitignore'));
      assert.ok(DEFAULT_EXCLUDED_FILES.includes('local.settings.json'));
      assert.ok(DEFAULT_EXCLUDED_FILES.includes('project.lock.json'));
      assert.ok(DEFAULT_EXCLUDED_DIRS.includes('.git'));
      assert.ok(DEFAULT_EXCLUDED_DIRS.includes('.vscode'));
      assert.ok(PYTHON_VENV_DIRS.includes('.venv'));
      assert.ok(PYTHON_VENV_DIRS.includes('venv'));
    });
  });
});
