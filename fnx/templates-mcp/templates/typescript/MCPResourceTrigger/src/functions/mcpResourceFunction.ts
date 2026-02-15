import { app, InvocationContext } from "@azure/functions";

/**
 * Azure Function that exposes a resource via MCP (Model Context Protocol).
 *
 * This trigger allows AI agents and LLMs to access application resources
 * through the MCP protocol. Resources can be files, data, or any content
 * that should be made available to AI consumers.
 */
export async function mcpResourceFunction(
    context: unknown,
    invocationContext: InvocationContext
): Promise<string> {
    invocationContext.log("MCP Resource trigger function processed a request.");

    return "This is the content of the README resource exposed via MCP.";
}

// Register the MCP Resource trigger
app.generic("mcpResourceFunction", {
    trigger: {
        type: "mcpResourceTrigger",
        name: "context",
        uri: "file://readme.md",
        resourceName: "readme",
        description: "Project README documentation",
        mimeType: "text/plain",
    },
    handler: mcpResourceFunction,
});
