# F12: Comprehensive E2E & Unit Tests — Template MCP + Emulator

**Status:** ✅ Implemented  
**PRD Section:** Testing & quality  
**Depends on:** F6 (MCP server), F11 (test infrastructure)

## Problem

fnx currently has a basic test plan (`docs/testing.md`) that covers happy-path scenarios. As the tool matures, we need:

1. **Template MCP tests** — The MCP server is an API surface consumed by AI agents. Broken tools or malformed responses silently degrade the AI experience with no user-visible error.
2. **Emulator (`fnx start`) tests** — The core value prop. Regressions in host lifecycle, function invocation, or trigger handling are show-stoppers.
3. **Unit tests** — Individual modules (profile resolution, host download, config parsing) need isolation testing.

The current test plan is manual and linear. We need automated, comprehensive, CI-runnable tests.

## Feature

A revamped test suite covering Template MCP and emulator (`fnx start`) with both unit and E2E tests.

## Test Matrix

### Template MCP — Unit Tests

| Test | Description |
|------|-------------|
| `list-templates` returns valid schema | Response has `templates[]` with required fields (name, language, description) |
| `list-templates` filter by language | `language: "javascript"` returns only JS templates |
| `list-templates` filter by trigger | `trigger: "httpTrigger"` returns only HTTP templates |
| `get-template` returns file contents | Response includes all scaffold files with correct content |
| `get-template` invalid name errors | Unknown template name returns MCP error, not crash |
| Template metadata completeness | Every template has name, language, trigger type, description, files |
| No host dependencies imported | `template-mcp.js` module graph has zero host-related imports |

### Template MCP — E2E Tests

| Test | Description |
|------|-------------|
| MCP stdio transport roundtrip | Start server, send JSON-RPC `tools/list`, validate response |
| Tool invocation: list-templates | Call via MCP protocol, validate template list |
| Tool invocation: scaffold-template | Call via MCP, validate files written to disk |
| Concurrent tool calls | Multiple simultaneous requests don't corrupt state |
| Server shutdown | Graceful exit on stdin close / SIGTERM |
| Error propagation | Invalid tool params return proper MCP error codes |
| `npx` cold start | `npx fnx-template-mcp` starts and responds within timeout |

### Emulator (`fnx start`) — Unit Tests

| Test | Description |
|------|-------------|
| SKU profile resolution | Correct profile selected for project type |
| Host version resolution | Version range → concrete version mapping |
| Host cache hit | Cached host binary is reused, no download |
| Host cache miss | Missing binary triggers download |
| host.json merge | User host.json merged with SKU defaults |
| Port selection | Default port, custom port, port conflict detection |
| Environment variable passthrough | User env vars forwarded to host process |
| Graceful shutdown | SIGINT/SIGTERM propagated to host child process |

### Emulator (`fnx start`) — E2E Tests

| Test | Description |
|------|-------------|
| HTTP trigger invocation | Start → wait for ready → GET /api/hello → 200 OK |
| Timer trigger fires | Start with timer function → validate log output |
| Queue trigger (with Azurite) | Start → enqueue message → validate function executed |
| Multiple functions | Project with 3+ functions all respond correctly |
| Config reload | Modify host.json while running → validate new config applied |
| Startup failure | Invalid project → clear error message, non-zero exit |
| Port conflict | Port in use → meaningful error or auto-select |
| Worker crash recovery | Kill worker process → host recovers or reports |
| Cross-SKU: Node 20 | Full E2E with Node.js function app |
| Cross-SKU: .NET isolated | Full E2E with .NET 8 isolated app |
| Cross-SKU: Python 3.11 | Full E2E with Python function app |

## Test Infrastructure Requirements

Shared infrastructure from F11, plus:

| Component | Purpose |
|-----------|---------|
| **MCP test client** | Send JSON-RPC requests to MCP server, validate responses |
| **Function app fixtures** | Pre-built test projects per SKU (Node, .NET, Python) |
| **Azurite fixture** | Start/stop Azurite for storage-dependent tests |
| **Snapshot testing** | Template scaffold output compared against golden files |
| **CI matrix** | Tests run on macOS, Linux, Windows |

## Implementation Plan

### Phase 1: Unit Test Foundation

- Unit tests for profile resolution, host version manager, config parsing
- Unit tests for MCP tool handlers (mock filesystem, no real server)
- Target: 80%+ code coverage on `fnx/lib/` modules

### Phase 2: MCP E2E Tests

- MCP test client that speaks JSON-RPC over stdio
- E2E tests for all MCP tools (list, scaffold)
- Snapshot tests for template output

### Phase 3: Emulator E2E Tests

- E2E test harness with process lifecycle management
- HTTP trigger tests across 3 SKUs
- Storage trigger tests with Azurite fixture

### Phase 4: CI Integration

- GitHub Actions workflow running full test suite
- Test matrix: OS × SKU × test type
- Flaky test detection and retry logic

## Success Criteria

- [ ] ≥7 unit tests for Template MCP tool handlers
- [ ] ≥5 E2E tests for Template MCP protocol flow
- [ ] ≥8 unit tests for emulator modules (profile, host, config)
- [ ] ≥8 E2E tests for emulator across ≥3 SKUs
- [ ] All tests automated and runnable via `npm test`
- [ ] CI pipeline runs tests on every PR
- [ ] Test execution <10 minutes total in CI

## Open Questions

- [ ] Should MCP E2E tests use real `npx` or a test harness that spawns the server directly?
- [ ] How do we handle host binary downloads in CI? Pre-cache or download per run?
- [ ] Should we use test containers (Docker) for cross-OS testing or rely on GitHub Actions matrix?
- [ ] What's the golden file strategy for template snapshots — check into repo or generate in CI?
