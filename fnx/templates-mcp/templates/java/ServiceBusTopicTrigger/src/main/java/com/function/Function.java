package com.function;

import com.microsoft.azure.functions.annotation.*;
import com.microsoft.azure.functions.*;

/**
 * Azure Functions with Service Topic Trigger.
 */
public class Function {
    /**
     * This function will be invoked when a new message is received at the Service Bus Topic.
     */
    @FunctionName("Function")
    public void run(
        @ServiceBusTopicTrigger(
            name = "message",
            topicName = "mysbtopic",
            subscriptionName = "mysubscription",
            connection = "ServiceBusConnection"
        )
        String message,
        final ExecutionContext context
    ) {
        context.getLogger().info("Java Service Bus Topic trigger function executed.");
        context.getLogger().info(message);
    }
}