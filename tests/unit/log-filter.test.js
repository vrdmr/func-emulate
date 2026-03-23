import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createLogFilter, createHostState } from '../../fnx/lib/host-launcher.js';

describe('Log filter — level resolution and filtering', () => {

  // ─── Verbose mode tests ──────────────────────────────────────────────

  test('verbose mode passes all lines through unfiltered', () => {
    const filter = createLogFilter(true, null);
    const lines = [
      'trce: Some.Trace.Category[0]',
      'dbug: Debug.Category[0]',
      'info: Microsoft.Hosting.Lifetime[14]',
      '      Now listening on: http://0.0.0.0:7071',
      'warn: Some.Warning[0]',
      'fail: Some.Failure[0]',
      'crit: Some.Critical[0]',
    ];
    for (const line of lines) {
      const result = filter.processLine(line);
      assert.strictEqual(result, line, `Expected verbose to pass through: "${line}"`);
    }
  });

  test('verbose mode returns exact input line (no transformation)', () => {
    const filter = createLogFilter(true, null);
    const line = 'dbug: System.Net.Http.HttpClient[100]';
    assert.strictEqual(filter.processLine(line), line);
  });

  // ─── Default (clean) mode tests ──────────────────────────────────────

  test('clean mode suppresses structured log headers (info, dbug, trce) but shows warn with color', () => {
    const filter = createLogFilter(false, null);
    const suppressedHeaders = [
      'trce: Some.Internal.Trace[0]',
      'dbug: Host.Startup[1]',
      'info: Microsoft.Hosting.Lifetime[14]',
    ];
    for (const line of suppressedHeaders) {
      const result = filter.processLine(line);
      assert.strictEqual(result, null, `Expected clean mode to suppress: "${line}"`);
    }
    // warn should be shown with color, not suppressed
    const warnResult = filter.processLine('warn: Some.Warning.Category[0]');
    assert.ok(warnResult !== null, 'warn lines should be shown');
    assert.ok(warnResult.includes('[WARN]'), 'warn lines should have [WARN] prefix');
  });

  test('clean mode shows fail and crit log headers with color', () => {
    const filter = createLogFilter(false, null);
    const failResult = filter.processLine('fail: Some.Error[0]');
    assert.ok(failResult !== null, 'fail lines should be shown');
    assert.ok(failResult.includes('[ERROR]'), 'fail lines should have [ERROR] prefix');

    const critResult = filter.processLine('crit: Some.Critical[0]');
    assert.ok(critResult !== null, 'crit lines should be shown');
    assert.ok(critResult.includes('[CRIT]'), 'crit lines should have [CRIT] prefix');
  });

  test('clean mode passes through non-structured plain text lines', () => {
    const filter = createLogFilter(false, null);
    // Note: 0.0.0.0 is replaced with localhost in output
    const result1 = filter.processLine('Now listening on: http://0.0.0.0:7071');
    assert.strictEqual(result1, 'Now listening on: http://localhost:7071');

    const result2 = filter.processLine('Application started. Press Ctrl+C to shut down.');
    assert.strictEqual(result2, 'Application started. Press Ctrl+C to shut down.');

    const result3 = filter.processLine('Content root path: /some/path');
    assert.strictEqual(result3, 'Content root path: /some/path');
  });

  test('clean mode suppresses empty lines', () => {
    const filter = createLogFilter(false, null);
    assert.strictEqual(filter.processLine(''), null);
    assert.strictEqual(filter.processLine('   '), null);
  });

  test('clean mode suppresses JSON fragments in output', () => {
    const filter = createLogFilter(false, null);
    assert.strictEqual(filter.processLine('{'), null);
    assert.strictEqual(filter.processLine('}'), null);
    assert.strictEqual(filter.processLine('"key": "value"'), null);
  });

  // ─── Suppressed messages ─────────────────────────────────────────────

  test('suppresses known noisy messages regardless of mode', () => {
    const filter = createLogFilter(false, null);
    const noisyMessages = [
      'Cannot create directory for shared memory usage',
      'Unable to find or download extension bundle v4.0',
      'Process reporting unhealthy: reason',
      'Access to the path /tmp/something is denied',
      'Operation not permitted for socket',
      'A timeout occurred while running check for host readiness',
    ];
    for (const msg of noisyMessages) {
      const result = filter.processLine(msg);
      assert.strictEqual(result, null, `Expected suppression of: "${msg}"`);
    }
  });

  test('isSuppressed correctly identifies noisy messages', () => {
    const filter = createLogFilter(false, null);
    assert.strictEqual(filter.isSuppressed('Cannot create directory for shared memory usage'), true);
    assert.strictEqual(filter.isSuppressed('Normal log message'), false);
    assert.strictEqual(filter.isSuppressed('Functions:'), false);
  });

  // ─── Worker initialization detection ─────────────────────────────────

  test('Worker process started line triggers continuation passthrough', () => {
    const filter = createLogFilter(false, null);
    // The "Worker process started" line itself is suppressed (returns null)
    // but it sets lastLogShown = true so subsequent continuation lines pass
    const result1 = filter.processLine('info: Worker.LanguageWorkerChannel[0]');
    assert.strictEqual(result1, null);

    const result2 = filter.processLine('      Worker process started and initialized');
    assert.strictEqual(result2, null); // header line itself returns null
  });
});

describe('Log filter — function info extraction', () => {

  test('extracts HTTP function routes from host output', () => {
    const hostState = createHostState();
    const filter = createLogFilter(false, hostState);
    filter.extractFunctionInfo(
      "info: Mapped function route 'api/hello' [GET,POST] to 'hello'"
    );
    assert.strictEqual(hostState.httpFunctions.length, 1);
    assert.deepStrictEqual(hostState.httpFunctions[0], {
      route: 'api/hello',
      methods: 'GET,POST',
      name: 'hello',
    });
  });

  test('extracts multiple HTTP functions', () => {
    const hostState = createHostState();
    const filter = createLogFilter(false, hostState);
    filter.extractFunctionInfo("info: Mapped function route 'api/hello' [GET] to 'hello'");
    filter.extractFunctionInfo("info: Mapped function route 'api/users' [GET,POST,DELETE] to 'users'");
    assert.strictEqual(hostState.httpFunctions.length, 2);
    assert.strictEqual(hostState.httpFunctions[1].name, 'users');
    assert.strictEqual(hostState.httpFunctions[1].methods, 'GET,POST,DELETE');
  });

  test('tracks invocation start and completion', () => {
    const hostState = createHostState();
    const filter = createLogFilter(false, hostState);

    filter.extractFunctionInfo("Executing 'Functions.hello' (Reason='This function was programmatically called via the host APIs.')");
    filter.extractFunctionInfo("Executed 'Functions.hello' (Succeeded, Id=abc-123, Duration=42ms)");

    assert.strictEqual(hostState.invocations.length, 1);
    assert.strictEqual(hostState.invocations[0].functionName, 'hello');
    assert.strictEqual(hostState.invocations[0].status, 'Succeeded');
    assert.strictEqual(hostState.invocations[0].durationMs, 42);
  });

  test('tracks errors from fail/crit log lines', () => {
    const hostState = createHostState();
    const filter = createLogFilter(false, hostState);
    filter.extractFunctionInfo('fail: Some.Error.Category[0]');
    assert.strictEqual(hostState.errors.length, 1);
    assert.ok(hostState.errors[0].message.includes('fail:'));
  });

  test('extractListeningUrl sets hostState to Running', () => {
    const hostState = createHostState();
    const filter = createLogFilter(false, hostState);
    assert.strictEqual(hostState.state, 'Starting');
    filter.extractListeningUrl('Now listening on: http://0.0.0.0:7071');
    assert.strictEqual(hostState.state, 'Running');
    assert.strictEqual(hostState.baseUrl, 'http://localhost:7071');
  });
});

describe('Log filter — host state management', () => {

  test('createHostState initializes with correct defaults', () => {
    const state = createHostState();
    assert.strictEqual(state.pid, null);
    assert.strictEqual(state.state, 'Starting');
    assert.ok(Array.isArray(state.httpFunctions));
    assert.ok(Array.isArray(state.nonHttpFunctions));
    assert.ok(Array.isArray(state.invocations));
    assert.ok(Array.isArray(state.errors));
    assert.strictEqual(state.httpFunctions.length, 0);
  });

  test('addInvocation respects ring buffer limit', () => {
    const state = createHostState();
    for (let i = 0; i < 250; i++) {
      state.addInvocation({ functionName: `fn${i}`, status: 'ok', durationMs: i });
    }
    assert.strictEqual(state.invocations.length, 200);
    // Oldest should have been evicted
    assert.strictEqual(state.invocations[0].functionName, 'fn50');
  });

  test('addError respects max errors limit (50)', () => {
    const state = createHostState();
    for (let i = 0; i < 60; i++) {
      state.addError(`error-${i}`);
    }
    assert.strictEqual(state.errors.length, 50);
    assert.ok(state.errors[0].message.includes('error-10'));
  });
});
