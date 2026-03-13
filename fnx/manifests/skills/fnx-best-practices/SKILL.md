---
name: fnx-best-practices
description: "Azure Functions best practices for performance, security, and cost optimization. Provides curated documentation links and fnx-specific guidance. USE FOR: best practices, performance tuning, security hardening, cost optimization, SKU constraints, configuration advice, secret management, app-config.yaml guidance."
---

# Azure Functions Best Practices

Provide best-practice guidance by directing the agent to authoritative documentation and fnx-specific patterns. Do not repeat general knowledge — link to official docs instead.

## Prerequisites Check

```bash
fnx --version   # Check version; suggest update if outdated
```

## Workflow

1. Identify the user's concern (security, performance, cost, configuration)
2. Detect project runtime and SKU from `app-config.yaml` or `fnx config`
3. Point to relevant official documentation (see references)
4. Apply fnx-specific practices where applicable

## Security (Critical)

### Secrets in Workspace Files

With AI coding agents reading workspace files, **never store secrets in committed files**.

- Use `app-config.yaml` for non-secret settings only (committed to git)
- Keep secrets in `local.settings.json` (git-ignored)
- Run `fnx config validate` to detect accidentally committed secrets
- fnx detects patterns: `ConnectionString`, `Password`, `ApiKey`, `Token`, `AccountKey`

### Auth Levels

- Default to `authLevel: 'function'` for HTTP triggers
- Use `anonymous` only for public endpoints (webhooks, health checks)

## fnx-Specific Practices

For detailed fnx-specific guidance, see [references/fnx-specific.md](references/fnx-specific.md).

Key points:
- Use `app-config.yaml` (not `local.settings.json`) for behavioral settings
- Run `fnx doctor` before `fnx start` to catch issues early
- Use `fnx config migrate` to separate secrets from settings
- Cache host binaries with `fnx warmup` in CI/Docker

## Official Documentation

For curated links to Microsoft documentation by topic, see [references/azure-functions-docs.md](references/azure-functions-docs.md).

**Tip**: If a `microsoft-docs` MCP server is available, use it to search for the latest Azure Functions documentation directly. Consider adding it to `.vscode/mcp.json`:
```json
{
  "servers": {
    "microsoft-docs": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@anthropic/microsoft-docs-mcp"]
    }
  }
}
```
