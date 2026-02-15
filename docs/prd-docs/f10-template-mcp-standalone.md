# F10: Standalone Template MCP Server — Fast, Host-Free

**Status:** 📋 Proposed  
**PRD Section:** MCP server  
**Depends on:** F6 (MCP server)

## Problem

The fnx template MCP server (`fnx template-mcp`) is a valuable tool on its own — AI coding agents (Copilot, Cursor, Claude) can use it to discover and scaffold Azure Functions templates without needing the full emulator.

Today, fnx bundles host download logic alongside the MCP server. If a user runs `npx fnx template-mcp`, the current architecture may:

1. **Trigger a host download** (~200MB+) that's completely unnecessary for template operations
2. **Require a full `npm install`** of the fnx package, which pulls in all dependencies
3. **Be slow to start** — startup latency kills the MCP experience (agents expect sub-second tool availability)

Users who only want the MCP server — especially via `npx` — need a **fast, zero-download, host-free** experience.

## Feature

Make `fnx template-mcp` a lightweight, standalone entrypoint that:

1. **Never downloads the host** — template operations don't need it
2. **Starts in <1 second** — minimal initialization, no network calls on startup
3. **Works via `npx fnx template-mcp`** — no prior installation required, fast cold start
4. **Shares the same package** — not a separate npm package, but a separate entrypoint with minimal dependency chain

## How It Works

### Architecture: Lazy Dependency Loading

```
fnx (npm package)
├── bin/
│   ├── fnx              ← Full CLI entrypoint (loads everything)
│   └── fnx-template-mcp ← Lightweight MCP entrypoint (loads only template code)
├── lib/
│   ├── cli.js           ← Full CLI with host download, start, etc.
│   ├── template-mcp.js  ← MCP server (templates only, no host deps)
│   ├── host-manager.js  ← Host download/cache (NOT imported by template-mcp.js)
│   └── profiles/        ← SKU profiles (needed by both, lightweight)
```

Key design: `template-mcp.js` **never imports** `host-manager.js` or any module that triggers host downloads. The dependency graph is strictly separated.

### package.json Entrypoints

```json
{
  "name": "fnx",
  "bin": {
    "fnx": "./bin/fnx",
    "fnx-template-mcp": "./bin/fnx-template-mcp"
  }
}
```

Users can invoke either:
- `npx fnx template-mcp` — routes through main CLI, parses subcommand
- `npx fnx-template-mcp` — direct entrypoint, skips CLI parsing entirely (fastest)

### Cold Start Optimization

For `npx` cold starts, every millisecond matters:

| Optimization | Impact |
|-------------|--------|
| No host download check on startup | Saves 100-500ms network probe |
| No profile resolution for host versions | Saves profile parsing time |
| Lazy-load `node:fs` operations | Only read templates when first tool is called |
| Minimal top-level imports | Only `@modelcontextprotocol/sdk`, `node:path` |
| Pre-bundled template metadata | Avoid scanning filesystem for template list |

Target: **<500ms from `npx fnx-template-mcp` to MCP server ready** on a warm npm cache.

### MCP Configuration (for AI agents)

Agents configure the MCP server in their config:

```json
{
  "mcpServers": {
    "azure-functions-templates": {
      "command": "npx",
      "args": ["fnx-template-mcp"],
      "transportType": "stdio"
    }
  }
}
```

No pre-installation needed. `npx` handles package resolution.

## Implementation Plan

### Phase 1: Separate Entrypoint

- Add `bin/fnx-template-mcp` entrypoint that directly starts MCP server
- Ensure `template-mcp.js` has no transitive dependency on `host-manager.js`
- Verify `npx fnx-template-mcp` works without prior install

### Phase 2: Startup Optimization

- Profile cold start time, identify bottlenecks
- Pre-compute template metadata at build/publish time (avoid runtime fs scan)
- Consider bundling with esbuild for single-file, zero-dependency entrypoint

### Phase 3: Standalone Distribution (Optional)

- Evaluate publishing `fnx-template-mcp` as a separate lightweight npm package
- Pro: Smaller `npx` download (only template code, no host logic)
- Con: Two packages to maintain, version sync

## Edge Cases

| Case | Handling |
|------|----------|
| User runs `fnx template-mcp` then `fnx start` | First call is fast (no host); second triggers host download as normal |
| `npx` without network | Fails if package not cached; not our problem to solve |
| Template needs host-specific info | Templates are host-agnostic; they're project scaffolds, not runtime artifacts |
| Version mismatch between MCP and full fnx | Same package — always in sync |

## Success Criteria

- [ ] `npx fnx-template-mcp` starts MCP server without downloading any host binary
- [ ] Cold start to MCP-ready is <1 second (warm npm cache)
- [ ] Template tools (list, scaffold) work identically via standalone and full CLI entrypoints
- [ ] `template-mcp.js` has zero transitive imports of host download code
- [ ] MCP config example works in VS Code Copilot, Cursor, and Claude Desktop

## Open Questions

- [ ] Should `npx fnx template-mcp` (space) and `npx fnx-template-mcp` (hyphen) both work?
- [ ] Is esbuild bundling worth the build complexity for the cold-start gain?
- [ ] Should we publish a separate `@azure/functions-template-mcp` package for minimal footprint?
- [ ] How do we measure and regress-test cold start time in CI?
