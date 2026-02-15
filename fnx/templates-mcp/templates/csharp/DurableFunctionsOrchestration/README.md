# Durable Functions Orchestration - CSharp

This template demonstrates an orchestrator function for complex workflow coordination.

## Configuration

### Durable Task Configuration

The `host.json` must include the `extensions.durableTask` configuration:

```json
{
  "version": "2.0",
  "extensions": {
    "durableTask": {
      "hubName": "DurableFunctionsHub"
    }
  }
}
```

For more options, see [Durable Functions host.json settings](https://learn.microsoft.com/azure/azure-functions/durable/durable-functions-bindings#host-json).

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
