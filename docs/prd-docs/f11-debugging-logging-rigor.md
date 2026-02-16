# F11: Debugging & Logging Test Rigor — Matching Core Tools

**Status:** ✅ Implemented  
**PRD Section:** Testing & quality  
**Depends on:** F4 (CLI surface)  
**Source:** Core Tools repo (`azure-functions-core-tools/test/Cli/`)

## Problem

The existing Azure Functions Core Tools repo has deep test coverage for debugging and logging scenarios — configuration layering, log level filtering, colored console output, multi-runtime log validation, and async process lifecycle management. fnx currently has minimal test coverage in these areas.

Debugging and logging are **the #1 developer touchpoint** when something goes wrong. If `fnx start` produces confusing logs, swallows errors, or breaks debugger attach, developers will abandon the tool immediately.

## Feature

Replicate the debugging and logging test rigor from Core Tools into fnx, adapted for our Node.js/JavaScript architecture.

## Reference: Core Tools Test Patterns

Analysis of `repo/test/Cli/` reveals the following patterns we must replicate:

### Unit Tests (Func.UnitTests)

| Test Area | Core Tools Coverage | fnx Equivalent |
|-----------|-------------------|----------------|
| **LoggingFilterHelperTests** | 8 tests — log level config from host.json, env vars, CLI params; priority resolution (CLI > env > host.json); CI environment detection; user vs system log separation | Log level resolution tests for fnx CLI flags, host.json parsing, env var overrides |
| **ColoredConsoleLoggerTests** | 5 tests — message pattern whitelisting, LogLevel filtering, category-based filtering, rule selection | Console output formatting tests — correct prefixes, colors, filtering of host noise |
| **ConsoleTests** | Console output capture and validation | stdout/stderr capture and assertion helpers |

### E2E Tests (Func.E2ETests)

| Test Area | Core Tools Coverage | fnx Equivalent |
|-----------|-------------------|----------------|
| **LogLevelTests** | Multi-runtime (Node, Dotnet, DotnetIsolated) — host.json config application, `--verbose` flag, output validation | `fnx start` with `--verbose`, log level config per SKU |
| **BaseLogLevelTests** | Parametric base class — file system mods (host.json rewrite), process lifecycle, port management | Base test class for fnx process lifecycle with host.json manipulation |
| **FuncStartTests** | Full process start/stop, port binding, output assertions | `fnx start` E2E with output assertions |

### Test Infrastructure (TestFramework)

| Component | Core Tools | fnx Equivalent |
|-----------|-----------|----------------|
| **LogWatcher** | Async stdout monitoring with timeout; polls for expected output patterns | Process output watcher — wait for "Host started" or error patterns |
| **CommandResultAssertions** | FluentAssertions: `.HaveStdOutContaining()`, `.NotHaveStdOutContaining()`, `.HaveStdErrContaining()`, `.ExitWith()` | Custom Jest/Vitest matchers: `toHaveStdout()`, `toNotHaveStdout()`, `toHaveExitCode()` |
| **FuncStartCommand** | Builder pattern: `.WithWorkingDirectory()`, `.WithEnvironmentVariable()`, `.Execute()` | `FnxStartCommand` builder with same fluent API |
| **Process helpers** | Port availability, process lifecycle, retry logic | Port management, graceful shutdown, retry on transient failures |

## Implementation Plan

### Phase 1: Test Infrastructure

Build the shared test helpers that all debugging/logging tests depend on:

```
tests/
├── framework/
│   ├── command-builder.js    ← Fluent builder for fnx CLI invocation
│   ├── output-watcher.js     ← Async stdout/stderr monitor with timeout
│   ├── assertions.js         ← Custom matchers (toHaveStdout, toHaveExitCode)
│   ├── port-manager.js       ← Find available ports, avoid conflicts
│   └── fixtures/             ← Pre-configured function app projects per SKU
├── unit/
│   ├── log-filter.test.js    ← Log level resolution priority
│   ├── console-output.test.js ← Output formatting and filtering
│   └── config-layering.test.js ← host.json + env + CLI flag precedence
├── e2e/
│   ├── start-logging.test.js  ← fnx start output validation
│   ├── verbose-mode.test.js   ← --verbose flag across SKUs
│   └── debug-attach.test.js   ← Debugger port and attach flow
```

### Phase 2: Unit Tests — Log Configuration

Test the full configuration layering:

```javascript
// Example: CLI flag overrides env var overrides host.json
describe('Log level resolution', () => {
  test('CLI --verbose overrides host.json logLevel', ...);
  test('FUNCTIONS_LOG_LEVEL env var overrides host.json', ...);
  test('CLI flag takes highest priority', ...);
  test('default log level is Information when nothing set', ...);
  test('user logs vs system logs have separate levels', ...);
});
```

### Phase 3: E2E Tests — Multi-SKU Logging

Run `fnx start` across SKUs and validate output:

```javascript
describe.each(['node20', 'dotnet-isolated', 'python3.11'])('Logging: %s', (sku) => {
  test('host.json logLevel:Debug shows debug output', ...);
  test('--verbose shows host startup details', ...);
  test('default hides noisy host logs', ...);
  test('error in function code appears in stderr', ...);
  test('graceful shutdown logs exit message', ...);
});
```

### Phase 4: Debug Attach Tests

```javascript
describe('Debug attach', () => {
  test('--debug flag opens debug port', ...);
  test('debug port is configurable via --debug-port', ...);
  test('Node inspect protocol works on debug port', ...);
  test('.NET isolated debugger attach works', ...);
});
```

## Success Criteria

- [ ] Test framework provides fluent command builder, output watcher, and custom assertions
- [ ] ≥8 unit tests for log level configuration layering (matching Core Tools' LoggingFilterHelperTests depth)
- [ ] ≥5 unit tests for console output formatting and filtering
- [ ] E2E log validation tests run across ≥3 SKUs
- [ ] `--verbose` flag tested end-to-end with output assertions
- [ ] Debug attach flow tested for ≥2 runtimes (Node, .NET isolated)
- [ ] All tests run in CI with <5 minute total execution time

## Open Questions

- [ ] Jest or Vitest for the test runner? (Vitest is faster, Jest has broader ecosystem)
- [ ] Should E2E tests start the CDN server as a fixture or use a mock?
- [ ] How do we handle debug attach tests in CI (no IDE available)?
- [ ] Should we test colored output (ANSI codes) or just content?
