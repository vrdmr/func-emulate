---
name: fnx-best-practices
description: "Azure Functions SKU-specific best practices for performance, security, and cost optimization. USE FOR: best practices, performance tuning, security hardening, cost optimization, SKU constraints, Flex Consumption limits."
tags: [azure-functions, best-practices, performance, security, cost]
category: Development
---

# Azure Functions Best Practices

SKU-aware best practices for Azure Functions development.

## Security

### Do NOT Store Secrets in Workspace Files

**Critical**: With AI coding agents reading your workspace files, `local.settings.json` and `.env` files containing secrets are a security risk. Coding agents can read and potentially expose these values.

**Recommendations**:
- Use Azure Key Vault references for connection strings
- Use Managed Identity instead of connection strings where possible
- Use `app-config.yaml` (fnx) for non-secret settings — it's designed to be committed to source control
- Keep `local.settings.json` minimal and in `.gitignore`
- Never put production secrets in any workspace file

### Auth Levels

- Default to `authLevel: 'function'` for HTTP triggers
- Use `authLevel: 'anonymous'` only for public endpoints (webhooks, health checks)
- Never use `anonymous` for endpoints that modify data

## SKU-Specific Constraints

### Flex Consumption

| Constraint | Limit |
|-----------|-------|
| Max execution time | 10 minutes (default), configurable up to 30 min |
| Max instances | 1000 (default) |
| Always-ready instances | Configurable (costs extra) |
| VNet integration | Supported |
| Durable Functions timer scale | Not supported |

**Best Practices**:
- Set `functionTimeout` in host.json explicitly
- Use always-ready instances for latency-sensitive functions
- Monitor cold start times via Application Insights

### Premium (EP1/EP2/EP3)

- Pre-warmed instances available
- VNet integration with private endpoints
- No execution time limit
- Higher memory/CPU than Consumption

### Dedicated (App Service Plan)

- Predictable pricing, no cold starts
- Can run alongside web apps
- Scale manually or with autoscale rules

## Performance

### Node.js v4

- Use async/await consistently — avoid callbacks
- Reuse SDK clients across invocations (module-level initialization)
- Use `context.log` instead of `console.log` for structured logging
- Set `maxConcurrentRequests` in host.json for HTTP triggers

### General

- Keep functions focused — one trigger, one responsibility
- Use output bindings instead of SDK calls for simple data writes
- Configure `host.json` batch sizes for Queue/Event Hub triggers
