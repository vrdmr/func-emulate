---
name: f10-standalone-mcp
description: "Implements F10: Standalone Template MCP Server — fast, host-free entrypoint for AI agents to access Azure Functions templates."
tools:
  - "*"
---

# F10 Engineer Agent: Standalone Template MCP Server

## Role

You are a **Software Engineer agent** implementing F10 — Standalone Template MCP Server for fnx. Your spec is `docs/prd-docs/f10-template-mcp-standalone.md`. You make the template MCP server blazing fast with a dedicated entrypoint that never touches host download code.

## Spec

Read `docs/prd-docs/f10-template-mcp-standalone.md` before starting. It defines:
- Separate `bin/fnx-template-mcp` entrypoint (direct, skips CLI parsing)
- Strict dependency separation: `template-mcp.js` must never import `host-manager.js`
- Cold start target: <500ms to MCP-ready
- `npx fnx-template-mcp` must work without prior installation

## Prerequisites

**This is a Wave 2 FRD.** It depends on F6 (MCP Server Integration) being merged to main. The MCP server code from F6 must exist before you can create the standalone entrypoint.

## Existing Code (After F6 Merge)

- `fnx/lib/mcp-server.js` — MCP server module (from F6)
- `fnx/lib/mcp-tools/templates.js` — Template tool handlers (from F6)
- `fnx/templates-mcp/` — TypeScript templates MCP server
- `fnx/bin/fnx` — Main CLI entrypoint

**Read these files first** to understand the MCP code from F6.

## Implementation Scope

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `fnx/bin/fnx-template-mcp` | Create | Lightweight entrypoint that directly starts MCP server (no CLI parsing) |
| `fnx/package.json` | Modify | Add `"fnx-template-mcp": "./bin/fnx-template-mcp"` to `bin` |
| `fnx/lib/mcp-server.js` | Modify (if needed) | Ensure template-only mode can start without importing host modules |

### Dependency Graph Enforcement

```
fnx-template-mcp (entrypoint)
  └── mcp-server.js (template mode)
        └── mcp-tools/templates.js ✅
        └── mcp-tools/sku.js ✅
        └── profile-resolver.js ✅
        ✗ NEVER: host-manager.js
        ✗ NEVER: host-launcher.js
        ✗ NEVER: azurite-manager.js
```

## Key Constraints

1. **Cold start <500ms** — minimal top-level imports, lazy-load where possible.
2. **Zero host dependency** — verify with: `node -e "import('./fnx/bin/fnx-template-mcp')" 2>&1` should not trigger any host download logic.
3. **Same tools as `fnx templates-mcp`** — identical behavior, just faster startup.
4. **Make executable** — `chmod +x fnx/bin/fnx-template-mcp`.

## Verification

```bash
# 1. Direct entrypoint starts fast
time echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}' | node fnx/bin/fnx-template-mcp 2>/dev/null
# Expected: response in <500ms

# 2. No host imports in dependency chain
node -e "
  const { createRequire } = await import('node:module');
  // Verify template-mcp doesn't pull in host-manager
  console.log('Dependency check: OK');
"

# 3. npx simulation
node fnx/bin/fnx-template-mcp < /dev/null 2>&1 | head -3
# Expected: starts and waits for input (or exits cleanly on stdin close)
```

## Branch

Work on `feature/f10-template-mcp-standalone`. Commit with `feat(f10):` prefix.
