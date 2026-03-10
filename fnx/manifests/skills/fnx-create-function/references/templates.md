# Available Templates

Source: <https://cdn.functions.azure.com/public/templates-manifest/manifest.json>

## Templates by Runtime and Trigger

### JavaScript / TypeScript (Node.js v4)

| Template ID | Trigger | Description |
|------------|---------|-------------|
| HttpTrigger | HTTP | HTTP request handler |
| QueueTrigger | Queue | Azure Storage Queue processor |
| TimerTrigger | Timer | CRON-scheduled function |
| BlobTrigger | Blob | Azure Blob Storage change listener |
| CosmosDBTrigger | CosmosDB | Change feed processor |
| ServiceBusQueueTrigger | ServiceBus | Queue message processor |
| ServiceBusTopicTrigger | ServiceBus | Topic subscription processor |
| EventHubTrigger | EventHub | Event stream processor |
| EventGridTrigger | EventGrid | Event Grid event handler |
| DurableFunctionsOrchestrator | Durable | Orchestration pattern |
| DurableFunctionsEntity | Durable | Entity pattern |
| DurableFunctionsActivity | Durable | Activity function |

### Python

| Template ID | Trigger | Description |
|------------|---------|-------------|
| HttpTrigger | HTTP | HTTP request handler |
| QueueTrigger | Queue | Azure Storage Queue processor |
| TimerTrigger | Timer | CRON-scheduled function |
| BlobTrigger | Blob | Azure Blob Storage change listener |
| CosmosDBTrigger | CosmosDB | Change feed processor |
| ServiceBusQueueTrigger | ServiceBus | Queue message processor |
| EventHubTrigger | EventHub | Event stream processor |
| EventGridTrigger | EventGrid | Event Grid event handler |
| DurableFunctionsOrchestrator | Durable | Orchestration pattern |

### C# (dotnet-isolated)

| Template ID | Trigger | Description |
|------------|---------|-------------|
| HttpTrigger | HTTP | HTTP request handler |
| QueueTrigger | Queue | Azure Storage Queue processor |
| TimerTrigger | Timer | CRON-scheduled function |
| BlobTrigger | Blob | Azure Blob Storage change listener |
| CosmosDBTrigger | CosmosDB | Change feed processor |
| ServiceBusQueueTrigger | ServiceBus | Queue message processor |
| EventHubTrigger | EventHub | Event stream processor |
| EventGridTrigger | EventGrid | Event Grid event handler |

### Java

| Template ID | Trigger | Description |
|------------|---------|-------------|
| HttpTrigger | HTTP | HTTP request handler |
| QueueTrigger | Queue | Azure Storage Queue processor |
| TimerTrigger | Timer | CRON-scheduled function |
| BlobTrigger | Blob | Azure Blob Storage change listener |
| CosmosDBTrigger | CosmosDB | Change feed processor |
| EventHubTrigger | EventHub | Event stream processor |

### PowerShell

| Template ID | Trigger | Description |
|------------|---------|-------------|
| HttpTrigger | HTTP | HTTP request handler |
| QueueTrigger | Queue | Azure Storage Queue processor |
| TimerTrigger | Timer | CRON-scheduled function |
| BlobTrigger | Blob | Azure Blob Storage change listener |

## Supported Runtimes

| Runtime | `--runtime` value | Language variants |
|---------|------------------|-------------------|
| Node.js | `node` | `typescript` (default), `javascript` |
| Python | `python` | — |
| .NET Isolated | `dotnet-isolated` | — |
| Java | `java` | — |
| PowerShell | `powershell` | — |

## Trigger Connection Requirements

| Trigger | Requires Connection String | Local Dev Option |
|---------|--------------------------|------------------|
| HTTP | No | — |
| Timer | No | — |
| Queue | `AzureWebJobsStorage` | Azurite (auto-started by fnx) |
| Blob | `AzureWebJobsStorage` | Azurite |
| CosmosDB | `CosmosDBConnection` | CosmosDB emulator |
| ServiceBus | `ServiceBusConnection` | Azure ServiceBus (no local emulator) |
| EventHub | `EventHubConnection` | Azure EventHub (no local emulator) |
| EventGrid | Webhook URL | ngrok or Azure Event Grid emulator |
| Durable | `AzureWebJobsStorage` | Azurite |

## CRON Expression Reference (Timer Triggers)

```
{second} {minute} {hour} {day} {month} {day-of-week}

0 */5 * * * *     Every 5 minutes
0 0 */1 * * *     Every hour
0 0 8 * * *       Daily at 8 AM
0 0 0 * * 1       Weekly on Monday
0 0 0 1 * *       Monthly on the 1st
```
