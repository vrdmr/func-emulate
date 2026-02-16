import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, parseVersion } from '../../fnx/lib/host-manager.js';

test('parseVersion handles plain and prefixed versions', () => {
  assert.deepEqual(parseVersion('4.1047.100'), [4, 1047, 100]);
  assert.deepEqual(parseVersion('v1.2.3'), [1, 2, 3]);
});

test('compareVersions orders numeric versions', () => {
  assert.ok(compareVersions('4.1047.100', '4.1046.999') > 0);
  assert.ok(compareVersions('4.1045.200', '4.1046.100') < 0);
  assert.equal(compareVersions('4.1045.200', '4.1045.200'), 0);
});

test('compareVersions tolerates prerelease/build suffixes', () => {
  assert.ok(compareVersions('1.2.3-beta.1', '1.2.2') > 0);
  assert.ok(compareVersions('1.2.3', '1.2.3-beta.1') !== 0);
});
