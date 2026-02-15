# MCP Resource Trigger - C# Isolated

This template demonstrates the **MCP Resource Trigger** for exposing resources to AI agents and LLMs via the Model Context Protocol (MCP).

## Overview

The MCP Resource Trigger allows you to expose application resources (files, data, documentation, etc.) that AI agents can discover and access. Unlike the MCP Tool Trigger which exposes callable functions, the Resource Trigger exposes readable content.

## How It Works

```csharp
[Function(nameof(GetResource))]
public string GetResource(
    [McpResourceTrigger("azure-functions-mcp-extension", 
        "https://github.com/Azure/azure-functions-mcp-extension",
        "Azure Functions MCP Extension documentation and source code",
        "text/plain")] 
    ResourceInvocationContext context
)
{
    return "Resource content here...";
}
```

## Trigger Properties

| Parameter | Required | Description |
|-----------|----------|-------------|
| `name` | Yes | A short name for the resource used by MCP clients |
| `uri` | Yes | The unique identifier URI for the resource (e.g., `file://readme.md`, `https://...`) |
| `description` | Yes | Human-readable description of what the resource contains |
| `mimeType` | Yes | The MIME type of the resource content (e.g., `text/plain`, `application/json`) |

## Use Cases

- **Documentation**: Expose README files, API docs, or guides for AI agents
- **Configuration**: Share application configuration or settings
- **Data Snapshots**: Provide access to current data states
- **Knowledge Bases**: Make internal knowledge accessible to LLMs

## Files

- `McpResourceFunction.cs` – Function endpoint exposing the resource
- `Program.cs` – Isolated worker host setup
- `FunctionsMcpResource.csproj` – Project file with MCP extension package

## Requirements

- .NET 10+ and Azure Functions isolated worker
- NuGet packages:
  - `Microsoft.Azure.Functions.Worker.Extensions.Mcp` (Preview)
- Storage connection: `AzureWebJobsStorage` (Azurite recommended for local)

## Local Development

1. Start Azurite (or configure real Storage) so `AzureWebJobsStorage` is valid.
2. Run `dotnet build` to build the project.
3. Run `func start` or `dotnet run` to start the function locally.
4. MCP SSE endpoint (local): `http://localhost:7071/runtime/webhooks/mcp/sse`

## Testing

- VS Code (GitHub Copilot / MCP client): add the SSE URL as a server.
- MCP Inspector: connect to the SSE URL, list resources, and access them.

## Notes

- For cloud deployment, call the SSE endpoint with the system key `mcp_extension` (e.g., header `x-functions-key`).

## Learn More

- [Azure Functions MCP Extension](https://learn.microsoft.com/azure/azure-functions/functions-bindings-mcp?pivots=programming-language-csharp)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Azure Functions C# Developer Guide](https://learn.microsoft.com/azure/azure-functions/functions-dotnet-class-library)
