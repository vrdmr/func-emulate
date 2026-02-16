/**
 * Unit tests for SKU profile resolution (profile-resolver.js).
 * Tests the resolution logic with bundled profiles (no network needed).
 */

import { describe, test, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveProfile, setProfilesSource } from '../../fnx/lib/profile-resolver.js';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILES_PATH = join(__dirname, '..', '..', 'fnx', 'profiles', 'sku-profiles.json');

// Load bundled profiles for direct testing
let profilesJson;
async function loadProfiles() {
  if (!profilesJson) {
    profilesJson = JSON.parse(await readFile(PROFILES_PATH, 'utf-8'));
  }
  return profilesJson;
}

describe('Profile resolver — SKU profile resolution', () => {

  beforeEach(() => {
    // Use inline JSON to avoid network calls during tests
  });

  test('resolves flex profile with correct display name', async () => {
    const profiles = await loadProfiles();
    setProfilesSource(JSON.stringify(profiles));
    const profile = await resolveProfile('flex');
    assert.strictEqual(profile.displayName, 'Flex Consumption');
    assert.ok(profile.hostVersion.startsWith('4.'));
  });

  test('resolves linux-premium profile', async () => {
    const profiles = await loadProfiles();
    setProfilesSource(JSON.stringify(profiles));
    const profile = await resolveProfile('linux-premium');
    assert.strictEqual(profile.displayName, 'Linux Premium (EP)');
  });

  test('resolves windows-consumption profile', async () => {
    const profiles = await loadProfiles();
    setProfilesSource(JSON.stringify(profiles));
    const profile = await resolveProfile('windows-consumption');
    assert.strictEqual(profile.displayName, 'Windows Consumption');
  });

  test('resolves windows-dedicated profile', async () => {
    const profiles = await loadProfiles();
    setProfilesSource(JSON.stringify(profiles));
    const profile = await resolveProfile('windows-dedicated');
    assert.strictEqual(profile.displayName, 'Windows Dedicated (ASP)');
  });

  test('resolves linux-consumption profile', async () => {
    const profiles = await loadProfiles();
    setProfilesSource(JSON.stringify(profiles));
    const profile = await resolveProfile('linux-consumption');
    assert.strictEqual(profile.displayName, 'Linux Consumption');
    assert.strictEqual(profile.status, 'deprecated');
  });

  test('throws on unknown SKU name', async () => {
    const profiles = await loadProfiles();
    setProfilesSource(JSON.stringify(profiles));
    await assert.rejects(
      () => resolveProfile('nonexistent-sku'),
      (err) => {
        assert.ok(err.message.includes('Unknown SKU'));
        assert.ok(err.message.includes('nonexistent-sku'));
        return true;
      }
    );
  });

  test('error message lists available SKUs', async () => {
    const profiles = await loadProfiles();
    setProfilesSource(JSON.stringify(profiles));
    await assert.rejects(
      () => resolveProfile('bad-sku'),
      (err) => {
        assert.ok(err.message.includes('flex'));
        assert.ok(err.message.includes('linux-premium'));
        return true;
      }
    );
  });
});

describe('Profile resolver — profile structure validation', () => {

  test('all profiles have required fields', async () => {
    const profiles = await loadProfiles();
    const requiredFields = ['displayName', 'hostVersion', 'hostGitTag', 'extensionBundleVersion', 'status', 'notes'];
    for (const [key, profile] of Object.entries(profiles.profiles)) {
      for (const field of requiredFields) {
        assert.ok(profile[field] !== undefined, `Profile '${key}' missing field '${field}'`);
      }
    }
  });

  test('all profiles have hostPackageUrl with platform entries', async () => {
    const profiles = await loadProfiles();
    for (const [key, profile] of Object.entries(profiles.profiles)) {
      assert.ok(profile.hostPackageUrl, `Profile '${key}' missing hostPackageUrl`);
      assert.ok(profile.hostPackageUrl['osx-arm64'] || profile.hostPackageUrl['linux-x64'],
        `Profile '${key}' missing platform URLs`);
    }
  });

  test('flex profile has highest host version', async () => {
    const profiles = await loadProfiles();
    const flexVersion = profiles.profiles.flex.hostVersion;
    for (const [key, profile] of Object.entries(profiles.profiles)) {
      if (key === 'flex') continue;
      assert.ok(flexVersion >= profile.hostVersion,
        `Flex (${flexVersion}) should have >= host version than ${key} (${profile.hostVersion})`);
    }
  });

  test('extension bundle versions are valid ranges', async () => {
    const profiles = await loadProfiles();
    const rangePattern = /^\[\d+\.\d+\.\*,\s*\d+\.\d+\.\d+\)$/;
    for (const [key, profile] of Object.entries(profiles.profiles)) {
      assert.ok(
        rangePattern.test(profile.extensionBundleVersion),
        `Profile '${key}' has invalid bundle range: ${profile.extensionBundleVersion}`
      );
    }
  });

  test('profiles registry has updatedAt timestamp', async () => {
    const profiles = await loadProfiles();
    assert.ok(profiles.updatedAt, 'Registry should have updatedAt');
    assert.ok(profiles.schemaVersion, 'Registry should have schemaVersion');
  });

  test('deprecated profiles have retirementDate', async () => {
    const profiles = await loadProfiles();
    for (const [key, profile] of Object.entries(profiles.profiles)) {
      if (profile.status === 'deprecated') {
        assert.ok(profile.retirementDate, `Deprecated profile '${key}' should have retirementDate`);
      }
    }
  });
});

describe('Profile resolver — setProfilesSource with inline JSON', () => {

  test('accepts inline JSON string', async () => {
    const inline = JSON.stringify({
      profiles: {
        'test-sku': {
          displayName: 'Test SKU',
          hostVersion: '4.999.0',
          hostGitTag: 'v4.999.0',
          extensionBundleVersion: '[4.0.*, 5.0.0)',
          status: 'GA',
          notes: 'Test',
        },
      },
      updatedAt: '2026-01-01',
    });
    setProfilesSource(inline);
    const profile = await resolveProfile('test-sku');
    assert.strictEqual(profile.displayName, 'Test SKU');
    assert.strictEqual(profile.hostVersion, '4.999.0');
  });

  test('accepts local file path', async () => {
    setProfilesSource(PROFILES_PATH);
    const profile = await resolveProfile('flex');
    assert.ok(profile.displayName.includes('Flex'));
  });

  test('throws on invalid file path', async () => {
    setProfilesSource('/nonexistent/path/profiles.json');
    await assert.rejects(
      () => resolveProfile('flex'),
      (err) => {
        assert.ok(err.message.includes('Cannot read profiles file'));
        return true;
      }
    );
  });
});
