# Blob Output Binding - Java

This template demonstrates an Azure Function with Blob output binding.

## Configuration

### Identity-Based Connections (Recommended)

For production deployments, use identity-based connections instead of connection strings for `BlobStoreConnection`:

- [Identity-based connections for Blob Storage](https://learn.microsoft.com/azure/azure-functions/functions-bindings-storage-blob-trigger?pivots=programming-language-java&tabs=in-process%2Cextensionv5#identity-based-connections)

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
