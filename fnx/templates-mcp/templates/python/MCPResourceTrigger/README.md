# MCP Resource Trigger - Python

This template demonstrates the **MCP Resource Trigger** for exposing resources to AI agents and LLMs via the Model Context Protocol (MCP).

## Overview

The MCP Resource Trigger allows you to expose application resources (files, data, documentation, etc.) that AI agents can discover and access. Unlike the MCP Tool Trigger which exposes callable functions, the Resource Trigger exposes readable content.

## How It Works

```python
@app.generic_trigger(
    arg_name="context",
    type="mcpResourceTrigger",
    uri="file://readme.md",
    resourceName="readme",
    description="Project README documentation",
    mimeType="text/plain",
)
def mcp_resource_function(context) -> str:
    return "Resource content here..."
```

## Trigger Properties

| Property | Required | Description |
|----------|----------|-------------|
| `uri` | Yes | The unique identifier URI for the resource (e.g., `file://readme.md`, `https://...`) |
| `resourceName` | Yes | A short name for the resource used by MCP clients |
| `description` | Yes | Human-readable description of what the resource contains |
| `mimeType` | Yes | The MIME type of the resource content (e.g., `text/plain`, `application/json`) |

## Use Cases

- **Documentation**: Expose README files, API docs, or guides for AI agents
- **Configuration**: Share application configuration or settings
- **Data Snapshots**: Provide access to current data states
- **Knowledge Bases**: Make internal knowledge accessible to LLMs

## Configuration

### Host Storage Configuration

The `AzureWebJobsStorage` setting is used by the Azure Functions runtime. By default, it uses Azurite for local development:

```json
"AzureWebJobsStorage": "UseDevelopmentStorage=true"
```

For production, configure identity-based connections:

- [Connecting to host storage with an identity](https://learn.microsoft.com/azure/azure-functions/functions-reference?tabs=blob&pivots=programming-language-python#connecting-to-host-storage-with-an-identity)

### Extension Bundle Configuration

The MCP Resource Trigger is not yet available in the production extension bundle. Until it is released, add the following setting to your `local.settings.json` (or App Settings in Azure) to use the staging bundle:

```json
"FUNCTIONS_EXTENSIONBUNDLE_SOURCE_URI": "https://cdn-staging.functions.azure.com/public"
```

> **Note**: This setting can be removed once the MCP Resource Trigger is available in the production extension bundle.

## Local Development

1. Install [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) for local storage emulation
2. Run `func start` to start the function locally
3. Connect an MCP client to discover and access the resource

## Learn More

- [Azure Functions MCP Extension](https://learn.microsoft.com/azure/azure-functions/functions-bindings-mcp)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Azure Functions Python Developer Guide](https://learn.microsoft.com/azure/azure-functions/functions-reference-python)
