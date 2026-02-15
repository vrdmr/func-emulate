# Cosmos DB Input/Output Binding - TypeScript

This template demonstrates an Azure Function with combined Cosmos DB input and output bindings.

## Configuration

### Host Storage Configuration

The `AzureWebJobsStorage` setting is used by the Azure Functions runtime. By default, it uses Azurite for local development:

```json
"AzureWebJobsStorage": "UseDevelopmentStorage=true"
```

For production, configure identity-based connections:

- [Connecting to host storage with an identity](https://learn.microsoft.com/azure/azure-functions/functions-reference?tabs=blob&pivots=programming-language-typescript#connecting-to-host-storage-with-an-identity)

### Cosmos DB Connection Configuration

The Cosmos DB binding requires a connection to your Cosmos DB account. Configure the connection in your settings:

- [Cosmos DB connections](https://learn.microsoft.com/azure/azure-functions/functions-bindings-cosmosdb-v2-input?tabs=python-v2%2Cisolated-process%2Cnodejs-v4%2Cextensionv4&pivots=programming-language-javascript#connections)

## Local Development

1. Install [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) for local storage emulation
2. Run `npm start` to start the function locally
