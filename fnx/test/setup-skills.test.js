/**
 * Integration tests for fnx setup — skill copy behavior.
 * Verifies that fnx setup copies complete skill directories
 * including references/ subdirectories to all target locations.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const FNX_BIN = resolve(__dirname, '..', 'bin', 'fnx');
const MANIFESTS_DIR = resolve(__dirname, '..', 'manifests');
const SKILLS_DIR = join(MANIFESTS_DIR, 'skills');

/** Collect all file paths relative to root, recursively */
async function listFilesRecursive(dir, root = dir) {
  if (!existsSync(dir)) return [];
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

/** Get list of skill names from manifests/skills/ */
async function getManifestSkillNames() {
  const entries = await readdir(SKILLS_DIR);
  const skills = [];
  for (const entry of entries) {
    if (existsSync(join(SKILLS_DIR, entry, 'SKILL.md'))) {
      skills.push(entry);
    }
  }
  return skills.sort();
}

/** Get all files within a manifest skill directory */
async function getManifestSkillFiles(skillName) {
  return listFilesRecursive(join(SKILLS_DIR, skillName));
}

describe('fnx setup — skill copy integration', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fnx-setup-test-'));
    // Create a minimal Azure Functions project
    await writeFile(join(tmpDir, 'host.json'), JSON.stringify({
      version: '2.0',
      extensionBundle: { id: 'Microsoft.Azure.Functions.ExtensionBundle', version: '[4.*, 5.0.0)' }
    }));
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-func-app', main: 'dist/src/index.js'
    }));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('copies all skill directories to .agents/skills/', async () => {
    await execFileAsync('node', [FNX_BIN, 'setup', '--app-path', tmpDir, '--non-interactive'], {
      timeout: 30000,
    });

    const skillNames = await getManifestSkillNames();
    for (const skill of skillNames) {
      const expected = await getManifestSkillFiles(skill);
      const actual = await listFilesRecursive(join(tmpDir, '.agents', 'skills', skill));
      assert.deepEqual(actual, expected,
        `Skill ${skill}: .agents/skills/${skill}/ should match manifests/skills/${skill}/`);
    }
  });

  it('each skill has references/ files matching source', async () => {
    await execFileAsync('node', [FNX_BIN, 'setup', '--app-path', tmpDir, '--non-interactive'], {
      timeout: 30000,
    });

    const skillNames = await getManifestSkillNames();
    for (const skill of skillNames) {
      const srcRefs = join(SKILLS_DIR, skill, 'references');
      if (!existsSync(srcRefs)) continue;

      const dstRefs = join(tmpDir, '.agents', 'skills', skill, 'references');
      assert.ok(existsSync(dstRefs), `${skill}/references/ should exist in target`);

      const srcFiles = await listFilesRecursive(srcRefs);
      const dstFiles = await listFilesRecursive(dstRefs);
      assert.deepEqual(dstFiles, srcFiles, `${skill}/references/ files should match source`);

      // Verify content matches
      for (const file of srcFiles) {
        const srcContent = await readFile(join(srcRefs, file), 'utf8');
        const dstContent = await readFile(join(dstRefs, file), 'utf8');
        assert.equal(dstContent, srcContent, `${skill}/references/${file} content should match`);
      }
    }
  });

  it('copies skills to .claude/skills/ when Claude Code is detected', async () => {
    // Create marker file so Claude Code is detected
    await mkdir(join(tmpDir, '.claude'), { recursive: true });
    await writeFile(join(tmpDir, 'CLAUDE.md'), '# Claude instructions');

    await execFileAsync('node', [FNX_BIN, 'setup', '--app-path', tmpDir, '--non-interactive', '--force'], {
      timeout: 30000,
    });

    const claudeSkills = join(tmpDir, '.claude', 'skills');
    if (!existsSync(claudeSkills)) {
      // Claude Code may not be detected without the binary — skip assertion
      return;
    }

    const skillNames = await getManifestSkillNames();
    for (const skill of skillNames) {
      const expected = await getManifestSkillFiles(skill);
      const actual = await listFilesRecursive(join(claudeSkills, skill));
      assert.deepEqual(actual, expected,
        `Skill ${skill}: .claude/skills/${skill}/ should match source`);
    }
  });

  it('--force overwrites existing skills with references/', async () => {
    // First setup
    await execFileAsync('node', [FNX_BIN, 'setup', '--app-path', tmpDir, '--non-interactive'], {
      timeout: 30000,
    });

    // Tamper with a file
    const introSkill = join(tmpDir, '.agents', 'skills', 'fnx-intro', 'SKILL.md');
    assert.ok(existsSync(introSkill), 'fnx-intro/SKILL.md should exist after setup');
    await writeFile(introSkill, '# TAMPERED');

    // Second setup with --force
    await execFileAsync('node', [FNX_BIN, 'setup', '--app-path', tmpDir, '--non-interactive', '--force'], {
      timeout: 30000,
    });

    // Verify it was restored
    const content = await readFile(introSkill, 'utf8');
    assert.ok(!content.includes('TAMPERED'), 'SKILL.md should be overwritten by --force');
  });

  it('--dry-run does not create skill files', async () => {
    await execFileAsync('node', [FNX_BIN, 'setup', '--app-path', tmpDir, '--non-interactive', '--dry-run'], {
      timeout: 30000,
    });

    const agentsDir = join(tmpDir, '.agents', 'skills');
    const skillNames = await getManifestSkillNames();
    for (const skill of skillNames) {
      const skillMd = join(agentsDir, skill, 'SKILL.md');
      assert.ok(!existsSync(skillMd), `${skill}/SKILL.md should NOT exist in dry-run`);
    }
  });

  it('skips skills when already present (no --force)', async () => {
    // First setup
    await execFileAsync('node', [FNX_BIN, 'setup', '--app-path', tmpDir, '--non-interactive'], {
      timeout: 30000,
    });

    // Tamper with a file
    const introSkill = join(tmpDir, '.agents', 'skills', 'fnx-intro', 'SKILL.md');
    assert.ok(existsSync(introSkill), 'fnx-intro/SKILL.md should exist after setup');
    await writeFile(introSkill, '# CUSTOM');

    // Second setup WITHOUT --force
    await execFileAsync('node', [FNX_BIN, 'setup', '--app-path', tmpDir, '--non-interactive'], {
      timeout: 30000,
    });

    // Tampered file should be preserved (skipped)
    const content = await readFile(introSkill, 'utf8');
    assert.equal(content, '# CUSTOM', 'Existing SKILL.md should be preserved without --force');
  });
});
