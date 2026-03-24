/**
 * E2E tests for cross-SKU validation — verify that different SKU profiles
 * resolve correctly and produce expected CLI output.
 * Uses --sku list (fast, no host download) plus profile resolution unit checks.
 */

import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FnxCommand } from '../framework/command-builder.js';
import { resolveProfile, setProfilesSource } from '../../fnx/lib/profile-resolver.js';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILES_PATH = join(__dirname, '..', '..', 'fnx', 'profiles', 'sku-profiles.json');

describe('Cross-SKU — profile resolution for each SKU', { timeout: 30000 }, () => {

  const skus = [
    { name: 'flex', display: 'Flex Consumption', hostPrefix: '4.1048' },
    { name: 'linux-premium', display: 'Linux Premium (EP)', hostPrefix: '4.1046' },
    { name: 'windows-consumption', display: 'Windows Consumption', hostPrefix: '4.1045' },
    { name: 'windows-dedicated', display: 'Windows Dedicated (ASP)', hostPrefix: '4.1045' },
    { name: 'linux-consumption', display: 'Linux Consumption', hostPrefix: '4.1044' },
  ];

  for (const { name, display, hostPrefix } of skus) {
    test(`resolveProfile('${name}') returns correct display name and host version`, async () => {
      const profiles = JSON.parse(await readFile(PROFILES_PATH, 'utf-8'));
      setProfilesSource(JSON.stringify(profiles));
      const profile = await resolveProfile(name);
      assert.strictEqual(profile.displayName, display);
      assert.ok(profile.hostVersion.startsWith(hostPrefix),
        `Expected ${name} host version to start with ${hostPrefix}, got ${profile.hostVersion}`);
    });
  }
});

describe('Cross-SKU — --sku list shows all profiles', { timeout: 30000 }, () => {

  test('lists all 5 SKU profiles', async () => {
    const result = await FnxCommand
      .start()
      .withSku('list')
      .withTimeout(15000)
      .execute();

    assert.strictEqual(result.exitCode, 0);
    const stdout = result.stdout.join('\n');
    assert.ok(stdout.includes('flex'), 'Should list flex');
    assert.ok(stdout.includes('linux-premium'), 'Should list linux-premium');
    assert.ok(stdout.includes('windows-consumption'), 'Should list windows-consumption');
    assert.ok(stdout.includes('windows-dedicated'), 'Should list windows-dedicated');
    assert.ok(stdout.includes('linux-consumption'), 'Should list linux-consumption');
  });

  test('list shows Host Version column', async () => {
    const result = await FnxCommand
      .start()
      .withSku('list')
      .withTimeout(15000)
      .execute();

    assert.ok(result.stdout.join('\n').includes('Host Version'));
  });

  test('list shows Bundle Version column', async () => {
    const result = await FnxCommand
      .start()
      .withSku('list')
      .withTimeout(15000)
      .execute();

    assert.ok(result.stdout.join('\n').includes('Bundle Version'));
  });
});

describe('Cross-SKU — different host versions across SKUs', { timeout: 30000 }, () => {

  test('flex has newer host version than windows-consumption', async () => {
    const profiles = JSON.parse(await readFile(PROFILES_PATH, 'utf-8'));
    setProfilesSource(JSON.stringify(profiles));
    const flex = await resolveProfile('flex');
    const wc = await resolveProfile('windows-consumption');
    assert.ok(flex.hostVersion > wc.hostVersion,
      `Flex (${flex.hostVersion}) should be newer than WC (${wc.hostVersion})`);
  });

  test('each SKU has unique or valid host version', async () => {
    const profiles = JSON.parse(await readFile(PROFILES_PATH, 'utf-8'));
    setProfilesSource(JSON.stringify(profiles));
    const versions = [];
    for (const sku of ['flex', 'linux-premium', 'windows-consumption', 'windows-dedicated', 'linux-consumption']) {
      const p = await resolveProfile(sku);
      versions.push(p.hostVersion);
      assert.ok(p.hostVersion.startsWith('4.'), `${sku} should be on host v4.x`);
    }
  });
});

describe('Cross-SKU — verbose flag works via CLI', { timeout: 30000 }, () => {

  test('--sku list output contains status info', async () => {
    const result = await FnxCommand
      .start()
      .withSku('list')
      .withTimeout(15000)
      .execute();

    const stdout = result.stdout.join('\n');
    assert.ok(stdout.includes('GA') || stdout.includes('deprecated'),
      'Should show status column');
  });

  test('invalid SKU with verbose flag still errors cleanly', async () => {
    const result = await FnxCommand
      .start()
      .withSku('nonexistent')
      .withVerbose()
      .withTimeout(15000)
      .execute();

    assert.ok(result.exitCode !== 0);
    const allOutput = [...result.stdout, ...result.stderr].join('\n');
    assert.ok(allOutput.includes('Unknown SKU') || allOutput.includes('Error'));
  });
});
