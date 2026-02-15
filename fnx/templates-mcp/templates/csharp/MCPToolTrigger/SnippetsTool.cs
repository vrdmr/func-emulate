using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Mcp;
using Microsoft.Extensions.Logging;
using static FunctionsSnippetTool.ToolsInformation;

namespace FunctionsSnippetTool;

public class SnippetsTool()
{
    private const string BlobPath = "snippets/{mcptoolargs." + SnippetNamePropertyName + "}.json";

    [Function(nameof(GetSnippet))]
    public object GetSnippet(
        [McpToolTrigger(GetSnippetToolName, GetSnippetToolDescription)]
            ToolInvocationContext context,
        [BlobInput(BlobPath, Connection = "BlobStoreConnection")] string snippetContent
    )
    {
        return snippetContent;
    }

    [Function(nameof(SaveSnippet))]
    [BlobOutput(BlobPath, Connection = "BlobStoreConnection")]
    public string SaveSnippet(
        [McpToolTrigger(SaveSnippetToolName, SaveSnippetToolDescription)]
            ToolInvocationContext context,
        [McpToolProperty(SnippetNamePropertyName, PropertyType, SnippetNamePropertyDescription, Required = true)]
            string name,
        [McpToolProperty(SnippetPropertyName, PropertyType, SnippetPropertyDescription, Required = true)]
            string snippet
    )
    {
        return snippet;
    }
}
