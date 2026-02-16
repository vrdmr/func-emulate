import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolvePackRuntime } from '../../fnx/lib/pack.js';

describe('pack runtime resolution', () => {
  const validCases = [
    ['node', 'node'],
    ['nodejs', 'node'],
    ['javascript', 'node'],
    ['typescript', 'node'],
    ['python', 'python'],
    ['py', 'python'],
    ['java', 'java'],
    ['powershell', 'powershell'],
    ['pwsh', 'powershell'],
    ['dotnet-isolated', 'dotnet-isolated'],
    ['dotnetisolated', 'dotnet-isolated'],
    ['  PYTHON  ', 'python'],
  ];

  for (const [input, expected] of validCases) {
    test(`accepts '${input}'`, () => {
      assert.strictEqual(resolvePackRuntime(input), expected);
    });
  }

  const invalidCases = [
    '',
    '   ',
    'dotnet',
    'go',
    'ruby',
    'python3',
    'node18',
  ];

  for (const input of invalidCases) {
    test(`rejects '${input || '<empty>'}'`, () => {
      assert.throws(() => resolvePackRuntime(input), /runtime|Unsupported|isolated/i);
    });
  }
});
