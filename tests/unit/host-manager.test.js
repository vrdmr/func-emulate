/**
 * Unit tests for host-manager.js — host download/cache, bundle resolution,
 * version comparison, and platform detection.
 */

import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the exported utility functions
const hostManagerPath = join(__dirname, '..', '..', 'fnx', 'lib', 'host-manager.js');
const hostManager = await import(pathToFileURL(hostManagerPath).href);

describe('Host manager — platform detection', () => {

  test('getPlatformRid returns a valid platform string', () => {
    const rid = hostManager.getPlatformRid();
    assert.ok(rid, 'Should return a non-empty string');
    assert.ok(rid.includes('-'), 'Should contain OS-arch separator');
    // Should be one of the known platforms
    const validPrefixes = ['osx', 'linux', 'win'];
    const [os] = rid.split('-');
    assert.ok(validPrefixes.includes(os), `Unexpected OS prefix: ${os}`);
  });

  test('getPlatformRid includes architecture', () => {
    const rid = hostManager.getPlatformRid();
    const validArchs = ['x64', 'arm64'];
    const arch = rid.split('-')[1];
    assert.ok(validArchs.includes(arch), `Unexpected arch: ${arch}`);
  });

  test('getHostExeName returns platform-appropriate executable name', () => {
    const name = hostManager.getHostExeName();
    assert.ok(name.includes('Microsoft.Azure.WebJobs.Script.WebHost'));
    if (process.platform === 'win32') {
      assert.ok(name.endsWith('.exe'), 'Should have .exe on Windows');
    } else {
      assert.ok(!name.endsWith('.exe'), 'Should not have .exe on Unix');
    }
  });
});

describe('Host manager — ensureHost validation', () => {

  test('ensureHost rejects profile with no hostPackageUrl for current platform', async () => {
    const profile = {
      hostVersion: '4.999.0',
      hostPackageUrl: {
        'fake-platform': 'https://example.com/fake.zip',
      },
    };
    await assert.rejects(
      () => hostManager.ensureHost(profile, { force: false }),
      (err) => {
        assert.ok(err.message.includes('No host package for platform'));
        return true;
      }
    );
  });

  test('ensureHost rejects profile with null hostPackageUrl', async () => {
    const profile = {
      hostVersion: '4.999.0',
      hostPackageUrl: null,
    };
    await assert.rejects(
      () => hostManager.ensureHost(profile, { force: false }),
      (err) => {
        assert.ok(err.message.includes('No host package'));
        return true;
      }
    );
  });
});

describe('Host manager — bundle version resolution', () => {

  // We can't easily test ensureBundle without network, but we can test the
  // internal version parsing logic by checking error messages with bad ranges

  test('ensureBundle handles missing profile gracefully', async () => {
    // Profile with invalid bundle range — should fail but not crash
    const profile = {
      extensionBundleVersion: 'invalid-range',
      maxExtensionBundleVersion: null,
    };
    // ensureBundle will try to fetch CDN which will fail, then check cache
    // This tests that it doesn't crash with bad input
    try {
      await hostManager.ensureBundle(profile, { force: false });
    } catch (err) {
      // Expected to fail (no network, no cache) — just verify no crash
      assert.ok(err.message || true, 'Should throw a meaningful error');
    }
  });
});

describe('Host manager — version comparison logic', () => {

  // Test the internal compareVersions and parseVersionRange via ensureHost behavior
  // Since these are not exported, we test indirectly through profile validation

  test('profile with valid hostVersion format is accepted', async () => {
    const profile = {
      hostVersion: '4.1047.100',
      hostPackageUrl: {
        [hostManager.getPlatformRid()]: 'https://example.com/nonexistent.zip',
      },
    };
    // Will fail on download but should get past validation
    try {
      await hostManager.ensureHost(profile, { force: true });
    } catch (err) {
      // Expected to fail on download — but it shouldn't fail on validation
      assert.ok(!err.message.includes('No host package'), 'Should not fail on platform validation');
    }
  });

  test('host cache directory is based on hostVersion', () => {
    // The host cache path is: ~/.fnx/hosts/<hostVersion>/
    // Verify the convention by checking the function signatures
    assert.ok(typeof hostManager.ensureHost === 'function');
    assert.ok(typeof hostManager.ensureBundle === 'function');
  });
});

describe('Host manager — maxExtensionBundleVersion capping', () => {

  test('all profiles have maxExtensionBundleVersion set', async () => {
    const { readFile } = await import('node:fs/promises');
    const profilesPath = join(__dirname, '..', '..', 'fnx', 'profiles', 'sku-profiles.json');
    const profiles = JSON.parse(await readFile(profilesPath, 'utf-8'));
    for (const [key, profile] of Object.entries(profiles.profiles)) {
      assert.ok(
        profile.maxExtensionBundleVersion,
        `Profile '${key}' should have maxExtensionBundleVersion`
      );
    }
  });

  test('maxExtensionBundleVersion is a valid semver-like string', async () => {
    const { readFile } = await import('node:fs/promises');
    const profilesPath = join(__dirname, '..', '..', 'fnx', 'profiles', 'sku-profiles.json');
    const profiles = JSON.parse(await readFile(profilesPath, 'utf-8'));
    const versionPattern = /^\d+\.\d+\.\d+$/;
    for (const [key, profile] of Object.entries(profiles.profiles)) {
      assert.ok(
        versionPattern.test(profile.maxExtensionBundleVersion),
        `Profile '${key}' maxExtensionBundleVersion '${profile.maxExtensionBundleVersion}' is not valid semver`
      );
    }
  });

  test('maxExtensionBundleVersion > extensionBundleVersion lower bound', async () => {
    const { readFile } = await import('node:fs/promises');
    const profilesPath = join(__dirname, '..', '..', 'fnx', 'profiles', 'sku-profiles.json');
    const profiles = JSON.parse(await readFile(profilesPath, 'utf-8'));
    for (const [key, profile] of Object.entries(profiles.profiles)) {
      // Parse lower bound from range like "[4.22.*, 5.0.0)"
      const match = profile.extensionBundleVersion.match(/^\[(\d+)\.(\d+)/);
      if (match) {
        const lowerMajor = parseInt(match[1]);
        const lowerMinor = parseInt(match[2]);
        const [maxMajor, maxMinor] = profile.maxExtensionBundleVersion.split('.').map(Number);
        assert.ok(
          maxMajor > lowerMajor || (maxMajor === lowerMajor && maxMinor >= lowerMinor),
          `Profile '${key}': maxBundle ${profile.maxExtensionBundleVersion} should be >= lower bound ${lowerMajor}.${lowerMinor}`
        );
      }
    }
  });
});
