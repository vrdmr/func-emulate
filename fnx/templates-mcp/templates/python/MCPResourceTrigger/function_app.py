import logging

import azure.functions as func

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)


@app.generic_trigger(
    arg_name="context",
    type="mcpResourceTrigger",
    uri="file://readme.md",
    resourceName="readme",
    description="Project README documentation",
    mimeType="text/plain",
)
def mcp_resource_function(context) -> str:
    """
    A function that exposes a resource via MCP (Model Context Protocol).

    This trigger allows AI agents and LLMs to access application resources
    through the MCP protocol. Resources can be files, data, or any content
    that should be made available to AI consumers.

    Args:
        context: The resource invocation context containing request metadata.

    Returns:
        str: The resource content to be returned to the MCP client.
    """
    logging.info("MCP Resource trigger function processed a request.")

    return "This is the content of the README resource exposed via MCP."
