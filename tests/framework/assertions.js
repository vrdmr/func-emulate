import { strict as assert } from 'node:assert';

/**
 * Custom assertion helpers for fnx command results.
 * Designed to produce clear failure messages for debugging.
 */

/**
 * Assert result stdout contains expected text.
 */
export function assertStdoutContains(result, expected) {
  const stdout = Array.isArray(result.stdout) ? result.stdout.join('\n') : (result.stdout || '');
  assert.ok(
    stdout.includes(expected),
    `Expected stdout to contain "${expected}".\nActual stdout:\n${stdout.slice(0, 2000)}`
  );
}

/**
 * Assert result stdout does NOT contain text.
 */
export function assertStdoutNotContains(result, unexpected) {
  const stdout = Array.isArray(result.stdout) ? result.stdout.join('\n') : (result.stdout || '');
  assert.ok(
    !stdout.includes(unexpected),
    `Expected stdout NOT to contain "${unexpected}", but it was found.`
  );
}

/**
 * Assert result stderr contains expected text.
 */
export function assertStderrContains(result, expected) {
  const stderr = Array.isArray(result.stderr) ? result.stderr.join('\n') : (result.stderr || '');
  assert.ok(
    stderr.includes(expected),
    `Expected stderr to contain "${expected}".\nActual stderr:\n${stderr.slice(0, 2000)}`
  );
}

/**
 * Assert result stderr does NOT contain text.
 */
export function assertStderrNotContains(result, unexpected) {
  const stderr = Array.isArray(result.stderr) ? result.stderr.join('\n') : (result.stderr || '');
  assert.ok(
    !stderr.includes(unexpected),
    `Expected stderr NOT to contain "${unexpected}", but it was found.`
  );
}

/**
 * Assert the process exited with the expected code.
 */
export function assertExitCode(result, expected) {
  assert.strictEqual(
    result.exitCode,
    expected,
    `Expected exit code ${expected}, got ${result.exitCode}.\n` +
    `stdout: ${(result.stdout || '').slice(0, 500)}\n` +
    `stderr: ${(result.stderr || '').slice(0, 500)}`
  );
}

/**
 * Assert stdout matches a regex pattern.
 */
export function assertStdoutMatches(result, pattern) {
  const stdout = Array.isArray(result.stdout) ? result.stdout.join('\n') : (result.stdout || '');
  assert.ok(
    pattern.test(stdout),
    `Expected stdout to match ${pattern}.\nActual stdout:\n${stdout.slice(0, 2000)}`
  );
}

/**
 * Assert that stdout contains lines in the given order.
 */
export function assertStdoutOrder(result, orderedPatterns) {
  const stdout = Array.isArray(result.stdout) ? result.stdout.join('\n') : (result.stdout || '');
  let lastIndex = -1;
  for (const pattern of orderedPatterns) {
    const idx = stdout.indexOf(pattern, lastIndex + 1);
    assert.ok(
      idx > lastIndex,
      `Expected "${pattern}" to appear after position ${lastIndex} in stdout.\nActual stdout:\n${stdout.slice(0, 2000)}`
    );
    lastIndex = idx;
  }
}
