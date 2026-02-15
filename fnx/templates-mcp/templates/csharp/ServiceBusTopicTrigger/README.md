# Service Bus Topic Trigger - CSharp

This template demonstrates an Azure Function that subscribes to Azure Service Bus topics.

## Configuration

### Service Bus Connection

The `ServiceBusConnection` setting specifies the connection to Azure Service Bus. Configure it in your `local.settings.json`:

```json
"ServiceBusConnection": "<your-service-bus-connection-string>"
```

For production, use identity-based connections:

- [Identity-based connections for Service Bus](https://learn.microsoft.com/azure/azure-functions/functions-bindings-service-bus-trigger?pivots=programming-language-csharp&tabs=isolated-process%2Cextensionv5#identity-based-connections)

### Host Storage Configuration

The `AzureWebJobsStorage` setting is used by the Azure Functions runtime. By default, it uses Azurite for local development:

```json
"AzureWebJobsStorage": "UseDevelopmentStorage=true"
```

For production, configure identity-based connections:

- [Connecting to host storage with an identity](https://learn.microsoft.com/azure/azure-functions/functions-reference?tabs=blob&pivots=programming-language-csharp#connecting-to-host-storage-with-an-identity)

## Local Development

1. Install [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) for local storage emulation
2. Run `func start` to start the function locally
