---
name: fnx-create-function
description: "Create new Azure Functions using fnx templates and MCP tools. Guides template discovery, selection, and scaffolding. USE FOR: create function, add trigger, new function, add endpoint, scaffold, template, queue trigger, timer trigger, blob trigger."
tags: [fnx, create, template, scaffold, trigger]
category: Development
---

# Create Azure Function

Create new Azure Functions using fnx templates. Works with the fnx Templates MCP server for template discovery and code generation.

## Quick Start

### Using fnx init (New Project)

```bash
# Interactive mode
fnx init

# Non-interactive
fnx init --runtime node --template http-trigger-typescript --name my-app
```

### Using MCP Tools (Add to Existing Project)

If the fnx Templates MCP server is configured, use these tools:

1. **`functions_language_list`** — Get supported languages and runtime versions
2. **`functions_template_get`** — Generate function template code
3. **`functions_project_get`** — Scaffold project files

## Available Templates

### HTTP Triggers
- `http-trigger` / `http-trigger-typescript` — Basic HTTP endpoint
- Best for: REST APIs, webhooks, health checks

### Queue Triggers
- `queue-trigger` / `queue-trigger-typescript` — Azure Storage Queue processor
- Requires: Storage connection string in settings
- Note: Use Azurite for local development

### Timer Triggers
- `timer-trigger` — CRON-based scheduled function
- Format: `"0 */5 * * * *"` (every 5 minutes)

### Blob Triggers
- `blob-trigger` — Fires on blob storage changes
- Requires: Storage connection string

### Cosmos DB Triggers
- `cosmosdb-trigger` — Change feed processor
- Requires: Cosmos DB connection string + lease container

## Workflow for Adding a Function

1. **Check SKU compatibility**: Verify the trigger type works with your SKU
2. **Choose template**: Select from available templates for your runtime
3. **Scaffold**: Use MCP tool or manual creation
4. **Configure bindings**: Update connection strings in `app-config.yaml`
5. **Test locally**: `fnx start` and invoke the function

## Node.js v4 Pattern

```javascript
import { app } from '@azure/functions';

app.http('myFunction', {
    methods: ['GET', 'POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('HTTP function processed request');
        const name = request.query.get('name') || await request.text() || 'world';
        return { body: `Hello, ${name}!` };
    }
});
```
