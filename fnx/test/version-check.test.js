/**
 * Tests for lib/setup/version-check.js
 * Validates manifest version tracking for skill freshness detection.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writeManifestVersion,
  readInstalledVersion,
  readPackageManifestVersion,
  checkSkillsOutdated,
} from '../lib/setup/version-check.js';

describe('version-check — manifest version tracking', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fnx-version-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ─── writeManifestVersion ───

  it('writes .fnx/manifest-version.json with version and timestamp', async () => {
    await writeManifestVersion(tmpDir, '1.0.1');

    const raw = await readFile(join(tmpDir, '.fnx', 'manifest-version.json'), 'utf8');
    const data = JSON.parse(raw);

    assert.equal(data.version, '1.0.1');
    assert.ok(data.installedAt, 'should have installedAt timestamp');
    assert.ok(typeof data.installedAt === 'string', 'installedAt should be ISO string');
  });

  it('creates .fnx directory if it does not exist', async () => {
    await writeManifestVersion(tmpDir, '1.0.0');

    const raw = await readFile(join(tmpDir, '.fnx', 'manifest-version.json'), 'utf8');
    assert.ok(raw, 'file should exist');
  });

  it('overwrites existing manifest-version.json', async () => {
    await writeManifestVersion(tmpDir, '1.0.0');
    await writeManifestVersion(tmpDir, '1.0.1');

    const data = JSON.parse(
      await readFile(join(tmpDir, '.fnx', 'manifest-version.json'), 'utf8')
    );
    assert.equal(data.version, '1.0.1');
  });

  // ─── readInstalledVersion ───

  it('returns version string when marker file exists', async () => {
    await mkdir(join(tmpDir, '.fnx'), { recursive: true });
    await writeFile(
      join(tmpDir, '.fnx', 'manifest-version.json'),
      JSON.stringify({ version: '1.0.0', installedAt: new Date().toISOString() })
    );

    const version = await readInstalledVersion(tmpDir);
    assert.equal(version, '1.0.0');
  });

  it('returns null when no marker file exists', async () => {
    const version = await readInstalledVersion(tmpDir);
    assert.equal(version, null);
  });

  it('returns null when marker file is corrupted', async () => {
    await mkdir(join(tmpDir, '.fnx'), { recursive: true });
    await writeFile(join(tmpDir, '.fnx', 'manifest-version.json'), 'not-json');

    const version = await readInstalledVersion(tmpDir);
    assert.equal(version, null);
  });

  // ─── readPackageManifestVersion ───

  it('reads version from manifests/default.yaml', async () => {
    const version = await readPackageManifestVersion();
    assert.ok(version, 'should return a version string');
    assert.match(version, /^\d+\.\d+\.\d+$/, 'should be semver-like');
  });

  // ─── checkSkillsOutdated ───

  it('returns outdated=true when installed version < package version', async () => {
    await mkdir(join(tmpDir, '.fnx'), { recursive: true });
    await writeFile(
      join(tmpDir, '.fnx', 'manifest-version.json'),
      JSON.stringify({ version: '0.0.1', installedAt: new Date().toISOString() })
    );

    const result = await checkSkillsOutdated(tmpDir);
    assert.equal(result.outdated, true);
    assert.equal(result.installed, '0.0.1');
    assert.ok(result.latest, 'should have latest version');
  });

  it('returns outdated=false when installed version matches package version', async () => {
    const latest = await readPackageManifestVersion();
    await writeManifestVersion(tmpDir, latest);

    const result = await checkSkillsOutdated(tmpDir);
    assert.equal(result.outdated, false);
    assert.equal(result.installed, latest);
    assert.equal(result.latest, latest);
  });

  it('returns missing=true when no marker file exists', async () => {
    const result = await checkSkillsOutdated(tmpDir);
    assert.equal(result.missing, true);
    assert.equal(result.installed, null);
  });
});
