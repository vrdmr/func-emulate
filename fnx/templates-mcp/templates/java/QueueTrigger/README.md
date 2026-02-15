# Queue Trigger - Java

This template demonstrates an Azure Function triggered by Azure Storage Queue messages.

## Configuration

### Identity-Based Connections (Recommended)

For production deployments, use identity-based connections instead of connection strings:

- [Identity-based connections for Queue Storage](https://learn.microsoft.com/azure/azure-functions/functions-bindings-storage-queue-trigger?pivots=programming-language-java&tabs=in-process%2Cextensionv5#identity-based-connections)

### Queue Storage Connection

The `QueueStorageConnection` setting specifies the connection to Azure Queue Storage. For local development with Azurite:

```json
"QueueStorageConnection": "UseDevelopmentStorage=true"
```

### Host Storage Configuration

The `AzureWebJobsStorage` setting is used by the Azure Functions runtime. By default, it uses Azurite for local development:

```json
"AzureWebJobsStorage": "UseDevelopmentStorage=true"
```

For production, configure identity-based connections:

- [Connecting to host storage with an identity](https://learn.microsoft.com/azure/azure-functions/functions-reference?tabs=blob&pivots=programming-language-java#connecting-to-host-storage-with-an-identity)

## Local Development

1. Install [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) for local storage emulation
2. Run `mvn azure-functions:run` to start the function locally
