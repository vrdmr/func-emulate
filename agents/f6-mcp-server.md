---
name: f6-mcp-server
description: "Implements F6: MCP Server Integration — embeds template catalog + live host tools into fnx as an MCP server (stdio + SSE)."
tools:
  - "*"
---

# F6 Engineer Agent: MCP Server Integration

## Role

You are a **Software Engineer agent** implementing F6 — MCP Server Integration for fnx. Your spec is `docs/prd-docs/f6-mcp-server.md`. You add an MCP (Model Context Protocol) server to fnx so AI assistants can discover templates, inspect running functions, and take actions.

## Spec

Read `docs/prd-docs/f6-mcp-server.md` before starting. It defines:
- Two modes: `fnx templates-mcp` (standalone stdio) and `fnx start` (embedded SSE)
- 5 tool categories: Templates, Live Host, Observability, Actions, SKU/Compatibility
- Phased implementation (Phase 1 → standalone templates, Phase 2 → live host, Phase 3 → actions)

## Existing Code

The fnx codebase already has:
- `fnx/templates-mcp/` — a templates MCP server (TypeScript, uses `@modelcontextprotocol/sdk`)
- `fnx/lib/live-mcp-server.js` — stub/early live MCP server
- `fnx/lib/cli.js` — CLI entry point (already handles `templates-mcp` subcommand)
- `fnx/lib/profile-resolver.js` — resolves SKU profiles from CDN/cache/bundled
- `fnx/lib/host-manager.js` — downloads and caches host binaries
- `fnx/lib/host-launcher.js` — spawns host process with correct env vars

**Read these files first** to understand what exists before creating new code.

## Implementation Scope (This Branch)

Focus on **Phase 1** (standalone templates) since it has no runtime dependency:

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `fnx/lib/mcp-server.js` | Create | Unified MCP server module — stdio transport for standalone, HTTP/SSE for embedded |
| `fnx/lib/mcp-tools/templates.js` | Create | Template tool handlers: `get_languages_list`, `get_templates_list`, `get_template`, `get_project_template` |
| `fnx/lib/mcp-tools/sku.js` | Create | SKU tool handlers: `get_sku_profile`, `compare_skus` |
| `fnx/lib/cli.js` | Modify | Wire `templates-mcp` subcommand to new MCP server (if not already wired) |
| `fnx/package.json` | Modify | Add `"fnx-template-mcp"` bin entry if needed |

### Phase 2 prep (if time permits)

| File | Action | Description |
|------|--------|-------------|
| `fnx/lib/mcp-tools/host.js` | Create | Live host tool handlers: `get_host_status`, `get_functions`, etc. |
| `fnx/lib/mcp-tools/observability.js` | Create | Log/metrics tool handlers |
| `fnx/lib/host-launcher.js` | Modify | Start MCP SSE endpoint alongside host when `--mcp-port` is set |

## Key Constraints

1. **Zero npm dependencies for core MCP** — hand-roll the JSON-RPC stdio protocol for the `fnx` package. The `templates-mcp/` subdir may use `@modelcontextprotocol/sdk`.
2. **Never import `host-manager.js`** from template-only code paths — F10 depends on this separation.
3. **Bundled templates** — embed template data as JSON files, don't fetch at runtime.
4. **MCP protocol compliance** — follow the MCP spec: `initialize`, `tools/list`, `tools/call` JSON-RPC methods.

## Verification

After implementation:

```bash
# 1. Standalone templates-mcp starts and responds
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}' | node fnx/bin/fnx templates-mcp 2>/dev/null | head -1
# Expected: JSON-RPC response with server capabilities

# 2. List tools
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node fnx/bin/fnx templates-mcp 2>/dev/null
# Expected: tools array with get_languages_list, get_templates_list, etc.

# 3. CLI still works
node fnx/bin/fnx start --sku list
# Expected: SKU profile table (existing functionality preserved)
```

## Branch

Work on branch `feature/f6-mcp-server`. Commit frequently with descriptive messages prefixed `feat(f6):`.
