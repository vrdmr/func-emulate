import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createLogFilter, createHostState } from '../../fnx/lib/host-launcher.js';

describe('Console output — formatting and filtering', () => {

  test('plain text lines pass through in clean mode', () => {
    const filter = createLogFilter(false, null);
    const lines = [
      'Azure Functions Local Emulator (fnx — Phoenix Emulate)',
      'Emulator Version:  0.1.0',
      'Host Version:      4.1047.100 (Flex Consumption)',
      'Content root path: /Users/test/myapp',
    ];
    for (const line of lines) {
      assert.strictEqual(filter.processLine(line), line);
    }
  });

  test('structured log continuation lines are suppressed by default', () => {
    const filter = createLogFilter(false, null);
    // First a structured header (suppressed)
    filter.processLine('info: Microsoft.Hosting.Lifetime[14]');
    // Continuation line should also be suppressed
    assert.strictEqual(filter.processLine('      Now listening on: http://0.0.0.0:7071'), null);
  });

  test('stack traces in continuation lines are suppressed', () => {
    const filter = createLogFilter(false, null);
    // Simulate a fail line that would set lastLogShown
    filter.processLine('info: Worker.LanguageWorkerChannel[0]');
    filter.processLine('      Worker process started and initialized');
    // Now a continuation that looks like a stack trace
    assert.strictEqual(filter.processLine('      at System.Threading.Tasks.Task'), null);
    assert.strictEqual(filter.processLine('      --- End of stack trace ---'), null);
  });

  test('JSON fragments are suppressed in clean mode', () => {
    const filter = createLogFilter(false, null);
    // Top-level lines starting with { } " are suppressed
    assert.strictEqual(filter.processLine('{'), null);
    assert.strictEqual(filter.processLine('"key": "value",'), null);
    assert.strictEqual(filter.processLine('}'), null);
  });

  test('verbose mode shows all structured log levels', () => {
    const filter = createLogFilter(true, null);
    const levels = ['trce', 'dbug', 'info', 'warn', 'fail', 'crit'];
    for (const level of levels) {
      const line = `${level}: TestCategory[0]`;
      assert.strictEqual(filter.processLine(line), line);
    }
  });

  test('banner lines with special characters pass through', () => {
    const filter = createLogFilter(false, null);
    const banner = 'Azure Functions Local Emulator (fnx — Phoenix Emulate)';
    assert.strictEqual(filter.processLine(banner), banner);
  });
});

describe('Console output — function list display', () => {

  test('function list is triggered on Application started', () => {
    const hostState = createHostState();
    const filter = createLogFilter(false, hostState);

    // Register an HTTP function first
    filter.extractFunctionInfo("Mapped function route 'api/hello' [GET] to 'hello'");
    // Set the base URL
    filter.extractListeningUrl('Now listening on: http://0.0.0.0:7071');

    // Capture console.log output
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      // Function list is triggered by "Application started"
      filter.extractListeningUrl('Application started. Press Ctrl+C to shut down.');
      const allOutput = logs.join('\n');
      assert.ok(allOutput.includes('Functions:'), 'Should print Functions: header');
      assert.ok(allOutput.includes('hello'), 'Should list the hello function');
      assert.ok(allOutput.includes('http://localhost:7071/api/hello'), 'Should show full URL');
    } finally {
      console.log = origLog;
    }
  });

  test('extractListeningUrl replaces 0.0.0.0 with localhost', () => {
    const hostState = createHostState();
    const filter = createLogFilter(false, hostState);
    filter.extractListeningUrl('Now listening on: http://0.0.0.0:9090');
    assert.strictEqual(hostState.baseUrl, 'http://localhost:9090');
  });

  test('function list only fires once', () => {
    const hostState = createHostState();
    const filter = createLogFilter(false, hostState);

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      filter.extractListeningUrl('Now listening on: http://0.0.0.0:7071');
      filter.extractListeningUrl('Application started. Press Ctrl+C to shut down.');
      const count1 = logs.length;
      // Second "Application started" should not produce additional output
      filter.extractListeningUrl('Application started. Press Ctrl+C to shut down.');
      assert.strictEqual(logs.length, count1);
    } finally {
      console.log = origLog;
    }
  });

  test('clean mode shows --verbose tip after function list', () => {
    const hostState = createHostState();
    const filter = createLogFilter(false, hostState);
    filter.extractFunctionInfo("Mapped function route 'api/test' [GET] to 'test'");
    filter.extractListeningUrl('Now listening on: http://0.0.0.0:7071');

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      filter.extractListeningUrl('Application started. Press Ctrl+C to shut down.');
      const allOutput = logs.join('\n');
      assert.ok(allOutput.includes('--verbose'), 'Should suggest --verbose flag');
    } finally {
      console.log = origLog;
    }
  });

  test('verbose mode does NOT show --verbose tip', () => {
    const hostState = createHostState();
    const filter = createLogFilter(true, hostState);
    filter.extractFunctionInfo("Mapped function route 'api/test' [GET] to 'test'");
    filter.extractListeningUrl('Now listening on: http://0.0.0.0:7071');

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      filter.extractListeningUrl('Application started. Press Ctrl+C to shut down.');
      const allOutput = logs.join('\n');
      assert.ok(!allOutput.includes('For detailed output'), 'Should NOT show verbose tip in verbose mode');
    } finally {
      console.log = origLog;
    }
  });
});
