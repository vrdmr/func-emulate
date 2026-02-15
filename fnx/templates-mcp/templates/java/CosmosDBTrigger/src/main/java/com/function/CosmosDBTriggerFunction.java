package com.function;

import com.microsoft.azure.functions.ExecutionContext;
import com.microsoft.azure.functions.annotation.CosmosDBTrigger;
import com.microsoft.azure.functions.annotation.FunctionName;

import java.util.List;

public class CosmosDBTriggerFunction {

    @FunctionName("CosmosDBTriggerFunction")
    public void run(
        @CosmosDBTrigger(
            name = "items",
            databaseName = "ToDoList",
            containerName = "Items",
            leaseContainerName="leases",
            connection = "CosmosDbConnection",
            createLeaseContainerIfNotExists = true
        )
        List<Object> items,
        final ExecutionContext context
    ) {
        context.getLogger().info("Items modified: " + items.size());
    }
}
