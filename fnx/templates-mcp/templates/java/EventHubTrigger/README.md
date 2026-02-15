# Event Hub Trigger - Java

This template demonstrates an Azure Function that processes streaming data from Azure Event Hubs.

## Configuration

### Host Storage Configuration

The `AzureWebJobsStorage` setting is used by the Azure Functions runtime. By default, it uses Azurite for local development:

```json
"AzureWebJobsStorage": "UseDevelopmentStorage=true"
```

For production, configure identity-based connections:

- [Connecting to host storage with an identity](https://learn.microsoft.com/azure/azure-functions/functions-reference?tabs=blob&pivots=programming-language-java#connecting-to-host-storage-with-an-identity)

### Event Hub Connection Configuration

The Event Hub trigger requires a connection to your Event Hub namespace. Configure the connection in your settings:

- [Event Hub connections](https://learn.microsoft.com/azure/azure-functions/functions-bindings-event-hubs-trigger?tabs=python-v2%2Cisolated-process%2Cnodejs-v4%2Cfunctionsv2%2Cextensionv5&pivots=programming-language-java#connections)

## Local Development

1. Install [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) for local storage emulation
2. Run `mvn azure-functions:run` to start the function locally
