# MCP Tool Trigger (C# Isolated) – Template

This template creates a .NET isolated Azure Functions MCP server exposing MCP tools via `McpToolTrigger`.

It includes two sample tools:
- `SaveSnippet` – Persists a code snippet to Blob Storage
- `GetSnippet` – Retrieves a snippet by name from Blob Storage

Blob path: `snippets/{mcptoolargs.snippetname}.txt`

## Files
- `McpToolTriggerCSharp.cs` – Function endpoints (SaveSnippet, GetSnippet)
- `Program.cs` – Isolated worker host setup and MCP tool metadata configuration
- `.template.config/template.json` – Template metadata and NuGet post-actions

## Requirements
- .NET 8+ and Azure Functions isolated worker
- NuGet packages (added by template):
  - `Microsoft.Azure.Functions.Worker.Extensions.Mcp` (Preview)
  - `Microsoft.Azure.Functions.Worker.Extensions.Storage.Blobs`
- Storage connection: `AzureWebJobsStorage` (Azurite recommended for local)

## Key Setup in `Program.cs`
- Enable MCP tool metadata:
  - `builder.EnableMcpToolMetadata()`
- Configure tool properties for discovery (example shown for `get_snippets`):
  - `.ConfigureMcpTool("get_snippets").WithProperty("snippetname", "string", "The name of the snippet.")`

## Local Run
1. Start Azurite (or configure real Storage) so `AzureWebJobsStorage` is valid.
2. From your project, start Functions locally (e.g., `func start` or `dotnet run` with Core Tools installed).
3. MCP SSE endpoint (local):
   - `http://localhost:7071/runtime/webhooks/mcp/sse`

## Testing
- VS Code (GitHub Copilot / MCP client): add the SSE URL as a server.
- MCP Inspector: connect to the SSE URL, list tools, and invoke.

## Notes
- The Azure Functions MCP extension is in Preview. Avoid production use.
- For cloud, call the SSE endpoint with the system key `mcp_extension` (e.g., header `x-functions-key`).
