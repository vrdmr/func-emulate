import logging

import azure.functions as func

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)


@app.generic_trigger(
    arg_name="context",
    type="{{triggerType}}",  # Replace with the trigger type (e.g., "mcpToolTrigger", "mcpResourceTrigger", "rabbitMqTrigger", etc.)
    # Add trigger-specific properties below based on your trigger type.
    # Examples:
    #   For mcpToolTrigger: toolName, description, toolProperties
    #   For mcpResourceTrigger: uri, resourceName, description, mimeType
    #   For rabbitMqTrigger: connectionStringSetting, queueName
    #   For other triggers: consult the trigger's documentation for required properties
)
def generic_trigger_function(context) -> str:
    """
    A generic trigger function template.

    The generic_trigger decorator allows you to use any Azure Functions
    trigger type without a dedicated decorator. This is useful for:
    - New trigger types not yet supported by the Python SDK
    - Custom extension triggers
    - Experimental trigger types

    Args:
        context: The trigger context containing invocation data.

    Returns:
        str: The function response.
    """
    logging.info("Generic trigger function processed a request.")

    # Process the trigger context as needed
    # The context structure depends on the trigger type being used

    return "Generic trigger function executed successfully!"
