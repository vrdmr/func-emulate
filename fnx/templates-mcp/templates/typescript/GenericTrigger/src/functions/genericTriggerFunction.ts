import { app, InvocationContext } from "@azure/functions";

/**
 * A generic trigger function template.
 *
 * The app.generic() method allows you to use any Azure Functions trigger type
 * without a dedicated method. This is useful for:
 * - New trigger types not yet supported by the Node.js SDK
 * - Custom extension triggers
 * - Experimental trigger types
 *
 * @param context - The trigger context containing invocation data
 * @param invocationContext - The function invocation context
 * @returns The function response
 */
export async function genericTriggerFunction(
    context: unknown,
    invocationContext: InvocationContext
): Promise<string> {
    invocationContext.log("Generic trigger function processed a request.");

    // Process the trigger context as needed
    // The context structure depends on the trigger type being used

    return "Generic trigger function executed successfully!";
}

// Register the generic trigger function
// Replace {{triggerType}} with the actual trigger type (e.g., "mcpToolTrigger", "mcpResourceTrigger", "rabbitMqTrigger")
app.generic("genericTriggerFunction", {
    trigger: {
        type: "{{triggerType}}",   // Replace with the trigger type
        name: "context",
        // Add trigger-specific properties below based on your trigger type.
        // Examples:
        //   For mcpToolTrigger: toolName, description, toolProperties
        //   For mcpResourceTrigger: uri, resourceName, description, mimeType
        //   For rabbitMqTrigger: connectionStringSetting, queueName
        //   For other triggers: consult the trigger's documentation for required properties
    },
    handler: genericTriggerFunction,
});
