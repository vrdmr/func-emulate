/**
 * Tests for copyDirRecursive utility.
 * Verifies that skill directories (including references/) are fully copied.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { copyDirRecursive } from '../lib/utils.js';

/** Collect all file paths relative to root, recursively */
async function listFilesRecursive(dir, root = dir) {
  const entries = await readdir(dir);
  const files = [];
  for (const e of entries) {
    const full = join(dir, e);
    const s = await stat(full);
    if (s.isDirectory()) {
      files.push(...await listFilesRecursive(full, root));
    } else {
      files.push(full.slice(root.length + 1).replace(/\\/g, '/'));
    }
  }
  return files.sort();
}

describe('copyDirRecursive', () => {
  let tmpDir;
  let srcDir;
  let dstDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fnx-test-'));
    srcDir = join(tmpDir, 'src');
    dstDir = join(tmpDir, 'dst');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('copies a flat directory with a single file', async () => {
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'SKILL.md'), '# Test Skill');

    await copyDirRecursive(srcDir, dstDir);

    assert.ok(existsSync(join(dstDir, 'SKILL.md')));
    assert.equal(await readFile(join(dstDir, 'SKILL.md'), 'utf8'), '# Test Skill');
  });

  it('copies nested references/ subdirectory', async () => {
    await mkdir(join(srcDir, 'references'), { recursive: true });
    await writeFile(join(srcDir, 'SKILL.md'), '# Skill');
    await writeFile(join(srcDir, 'references', 'docs.md'), '# Docs');
    await writeFile(join(srcDir, 'references', 'patterns.md'), '# Patterns');

    await copyDirRecursive(srcDir, dstDir);

    const files = await listFilesRecursive(dstDir);
    assert.deepEqual(files, [
      'SKILL.md',
      'references/docs.md',
      'references/patterns.md',
    ]);
    assert.equal(await readFile(join(dstDir, 'references', 'docs.md'), 'utf8'), '# Docs');
  });

  it('copies deeply nested directories (3 levels)', async () => {
    await mkdir(join(srcDir, 'a', 'b', 'c'), { recursive: true });
    await writeFile(join(srcDir, 'root.txt'), 'root');
    await writeFile(join(srcDir, 'a', 'level1.txt'), 'L1');
    await writeFile(join(srcDir, 'a', 'b', 'level2.txt'), 'L2');
    await writeFile(join(srcDir, 'a', 'b', 'c', 'level3.txt'), 'L3');

    await copyDirRecursive(srcDir, dstDir);

    assert.equal(await readFile(join(dstDir, 'root.txt'), 'utf8'), 'root');
    assert.equal(await readFile(join(dstDir, 'a', 'level1.txt'), 'utf8'), 'L1');
    assert.equal(await readFile(join(dstDir, 'a', 'b', 'level2.txt'), 'utf8'), 'L2');
    assert.equal(await readFile(join(dstDir, 'a', 'b', 'c', 'level3.txt'), 'utf8'), 'L3');
  });

  it('creates destination directory if it does not exist', async () => {
    const deepDst = join(dstDir, 'nested', 'deep', 'target');
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'file.md'), 'content');

    await copyDirRecursive(srcDir, deepDst);

    assert.ok(existsSync(join(deepDst, 'file.md')));
  });

  it('does not copy files in dryRun mode', async () => {
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'SKILL.md'), '# Skill');

    await copyDirRecursive(srcDir, dstDir, { dryRun: true });

    // Directory is created but file is not copied
    assert.ok(existsSync(dstDir));
    assert.ok(!existsSync(join(dstDir, 'SKILL.md')));
  });

  it('creates subdirectories even in dryRun mode', async () => {
    await mkdir(join(srcDir, 'references'), { recursive: true });
    await writeFile(join(srcDir, 'SKILL.md'), '# Skill');
    await writeFile(join(srcDir, 'references', 'docs.md'), '# Docs');

    await copyDirRecursive(srcDir, dstDir, { dryRun: true });

    assert.ok(existsSync(join(dstDir, 'references')));
    assert.ok(!existsSync(join(dstDir, 'SKILL.md')));
    assert.ok(!existsSync(join(dstDir, 'references', 'docs.md')));
  });

  it('overwrites existing files', async () => {
    await mkdir(srcDir, { recursive: true });
    await mkdir(dstDir, { recursive: true });
    await writeFile(join(srcDir, 'file.md'), 'new content');
    await writeFile(join(dstDir, 'file.md'), 'old content');

    await copyDirRecursive(srcDir, dstDir);

    assert.equal(await readFile(join(dstDir, 'file.md'), 'utf8'), 'new content');
  });

  it('handles empty source directory', async () => {
    await mkdir(srcDir, { recursive: true });

    await copyDirRecursive(srcDir, dstDir);

    assert.ok(existsSync(dstDir));
    const entries = await readdir(dstDir);
    assert.equal(entries.length, 0);
  });

  it('preserves file content for binary-like data', async () => {
    await mkdir(srcDir, { recursive: true });
    const buf = Buffer.from([0x00, 0x01, 0xFF, 0xFE, 0x42]);
    await writeFile(join(srcDir, 'data.bin'), buf);

    await copyDirRecursive(srcDir, dstDir);

    const copied = await readFile(join(dstDir, 'data.bin'));
    assert.ok(buf.equals(copied));
  });
});
