# Blob Input Binding - Python

This template demonstrates an Azure Function with Blob input binding.

## Configuration

### Identity-Based Connections (Recommended)

For production deployments, use identity-based connections instead of connection strings:

- [Identity-based connections for Blob Storage](https://learn.microsoft.com/azure/azure-functions/functions-bindings-storage-blob-trigger?pivots=programming-language-python&tabs=python-v2%2Cextensionv5#identity-based-connections)

### Host Storage Configuration

The `AzureWebJobsStorage` setting is used by the Azure Functions runtime. By default, it uses Azurite for local development:

```json
"AzureWebJobsStorage": "UseDevelopmentStorage=true"
```

For production, configure identity-based connections:

- [Connecting to host storage with an identity](https://learn.microsoft.com/azure/azure-functions/functions-reference?tabs=blob&pivots=programming-language-python#connecting-to-host-storage-with-an-identity)

## Local Development

1. Install [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) for local storage emulation
2. Run `func start` to start the function locally
