using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Mcp;
using Microsoft.Extensions.Logging;

namespace FunctionsMcpResource;

/// <summary>
/// Azure Function that exposes a resource via MCP (Model Context Protocol).
/// 
/// This trigger allows AI agents and LLMs to access application resources
/// through the MCP protocol. Resources can be files, data, or any content
/// that should be made available to AI consumers.
/// </summary>
public class McpResourceFunction(ILogger<McpResourceFunction> logger)
{
    private const string ResourceName = "azure-functions-mcp-extension";
    private const string ResourceUri = "https://github.com/Azure/azure-functions-mcp-extension";
    private const string ResourceDescription = "Azure Functions MCP Extension documentation and source code";
    private const string ResourceMimeType = "text/plain";

    /// <summary>
    /// Function that returns resource content when accessed via MCP.
    /// </summary>
    /// <param name="context">The resource invocation context containing request metadata.</param>
    /// <returns>The resource content to be returned to the MCP client.</returns>
    [Function(nameof(GetResource))]
    public string GetResource(
        [McpResourceTrigger(ResourceName, ResourceUri, ResourceDescription, ResourceMimeType)] 
        ResourceInvocationContext context
    )
    {
        logger.LogInformation("MCP Resource trigger function processed a request.");

        return "Azure Functions MCP Extension enables you to expose Azure Functions as MCP servers, allowing AI agents and LLMs to discover and invoke your functions as tools and access resources.";
    }
}
