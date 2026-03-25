---
source_url: "https://cdn.functions.azure.com/public/templates-manifest/manifest.json"
source_version: "1.1.0"
source_generated_at: "2026-03-16T19:14:27.007Z"
total_templates: 138
---

# Available Templates

Source: <https://cdn.functions.azure.com/public/templates-manifest/manifest.json>
Manifest version: **1.1.0** (138 templates, generated 2026-03-16)

## Templates by Language

### TypeScript (19 templates)

| Template ID | Type | Resource | Description |
|------------|------|----------|-------------|
| http-trigger-typescript | trigger | http | HTTP-triggered function for REST API endpoints and webhooks |
| queue-trigger-typescript | trigger | queue | Processes messages from Azure Storage Queues |
| timer-trigger-typescript | trigger | timer | Scheduled function execution using CRON expressions |
| blob-trigger-typescript | trigger | blob | Triggered when files are added or modified in Azure Blob Storage |
| blob-eventgrid-trigger-typescript | trigger | blob | Enhanced blob trigger using Event Grid for better performance |
| blob-input-typescript | input | blob | Reads files from Azure Blob Storage |
| blob-output-typescript | output | blob | Writes files to Azure Blob Storage |
| cosmos-input-typescript | input | cosmos | Reads documents from Azure Cosmos DB collections |
| cosmos-output-typescript | output | cosmos | Writes documents to Azure Cosmos DB collections |
| cosmos-trigger-typescript | trigger | cosmos | Triggered by changes in Cosmos DB using the change feed |
| eventhub-trigger-typescript | trigger | eventhub | Processes streaming data from Azure Event Hubs |
| mcp-resource-trigger-typescript | trigger | mcp | MCP resource trigger for exposing resources to MCP clients |
| mcp-tool-trigger-typescript | trigger | mcp | MCP trigger for exposing functions as discoverable tools |
| mcp-sdk-hosting-typescript | trigger | mcp | Host MCP SDK based servers on Azure Functions |
| mcp-server-remote-typescript | trigger | mcp | Build remote MCP servers using Azure Functions |
| generic-trigger-typescript | trigger | generic | Generic trigger for custom extension trigger types |
| blob-eventgrid-trigger-typescript-azd | trigger | blob | Blob + Event Grid trigger for TypeScript deployed with azd |
| http-trigger-typescript-azd | trigger | http | HTTP trigger quickstart for TypeScript (Flex Consumption) |
| durable-orchestration-typescript | orchestration | durable | Function Chaining and Fan-out/Fan-in patterns |

### Python (40 templates)

| Template ID | Type | Resource | Description |
|------------|------|----------|-------------|
| http-trigger-python | trigger | http | HTTP-triggered function for REST API endpoints and webhooks |
| queue-trigger-python | trigger | queue | Processes messages from Azure Storage Queues |
| timer-trigger-python | trigger | timer | Scheduled function execution using CRON expressions |
| blob-trigger-python | trigger | blob | Triggered when files are added or modified in Azure Blob Storage |
| blob-eventgrid-trigger-python | trigger | blob | Enhanced blob trigger using Event Grid |
| blob-input-python | input | blob | Reads files from Azure Blob Storage |
| blob-output-python | output | blob | Writes files to Azure Blob Storage |
| cosmos-input-python | input | cosmos | Reads documents from Azure Cosmos DB collections |
| cosmos-output-python | output | cosmos | Writes documents to Azure Cosmos DB collections |
| cosmos-trigger-python | trigger | cosmos | Triggered by changes in Cosmos DB using the change feed |
| eventhub-trigger-python | trigger | eventhub | Processes streaming data from Azure Event Hubs |
| servicebus-queue-trigger-python | trigger | servicebus | Handles messages from Azure Service Bus queues |
| servicebus-topic-trigger-python | trigger | servicebus | Subscribes to Azure Service Bus topics |
| mcp-resource-trigger-python | trigger | mcp | MCP resource trigger for exposing resources to MCP clients |
| mcp-tool-trigger-python | trigger | mcp | MCP trigger for exposing functions as discoverable tools |
| mcp-sdk-hosting-python | trigger | mcp | Host MCP SDK based servers on Azure Functions |
| mcp-server-apim-python | trigger | mcp | MCP server with Azure API Management gateway and OAuth |
| mcp-server-remote-python | trigger | mcp | Build remote MCP servers using Azure Functions |
| generic-trigger-python | trigger | generic | Generic trigger for custom extension trigger types |
| ai-agent-python | trigger | http | Simple AI agent using GitHub Copilot SDK on Azure Functions |
| ai-chatgpt-python | trigger | http | ChatGPT prompted HTTP function with state storage |
| ai-textsummarize-python | trigger | http | Summarize text using AI Cognitive Language Service |
| ai-langchain-python | trigger | http | LangChain integration with Azure OpenAI and ChatGPT |
| blob-eventgrid-trigger-python-azd | trigger | blob | Blob + Event Grid trigger for Python deployed with azd |
| http-trigger-python-azd | trigger | http | HTTP trigger quickstart for Python (Flex Consumption) |
| durable-orchestration-python | orchestration | durable | Basic orchestration with Fan-out/Fan-in pattern |
| durable-order-processor-python | orchestration | durable | Order processing workflow with azd deployment |
| durable-pdf-summarizer-python | orchestration | durable | AI-powered PDF summarization with Azure OpenAI |
| agentframework-durable-single-agent-python | orchestration | agentframework | Single AI agent with durable HTTP endpoints |
| agentframework-durable-multi-agent-python | orchestration | agentframework | Multiple AI agents with durable HTTP endpoints |
| agentframework-durable-streaming-python | orchestration | agentframework | Redis-based reliable streaming with cursor resumption |
| agentframework-durable-orchestration-chaining-python | orchestration | agentframework | Chain agent invocations in orchestration |
| agentframework-durable-orchestration-concurrency-python | orchestration | agentframework | Run multiple agents in parallel |
| agentframework-durable-orchestration-conditionals-python | orchestration | agentframework | Conditional branching with spam detection |
| agentframework-durable-orchestration-hitl-python | orchestration | agentframework | Human-in-the-loop with approval workflow |
| agentframework-durable-mcp-server-python | orchestration | agentframework | Expose durable agents as MCP tools |
| agentframework-durable-workflow-shared-state-python | orchestration | agentframework | Workflows with shared state for data passing |
| agentframework-durable-workflow-python | orchestration | agentframework | Basic durable workflow execution |
| agentframework-durable-workflow-parallel-python | orchestration | agentframework | Parallel execution patterns for executors/agents |
| agentframework-durable-workflow-hitl-python | orchestration | agentframework | Workflow with human approval using request_info |

### C# / .NET Isolated (50 templates)

| Template ID | Type | Resource | Description |
|------------|------|----------|-------------|
| http-trigger-csharp | trigger | http | HTTP-triggered function for REST API endpoints and webhooks |
| queue-trigger-csharp | trigger | queue | Processes messages from Azure Storage Queues |
| timer-trigger-csharp | trigger | timer | Scheduled function execution using CRON expressions |
| blob-trigger-csharp | trigger | blob | Triggered when files are added or modified in Azure Blob Storage |
| blob-eventgrid-trigger-csharp | trigger | blob | Enhanced blob trigger using Event Grid |
| blob-input-csharp | input | blob | Reads files from Azure Blob Storage |
| blob-output-csharp | output | blob | Writes files to Azure Blob Storage |
| cosmos-input-csharp | input | cosmos | Reads documents from Azure Cosmos DB collections |
| cosmos-output-csharp | output | cosmos | Writes documents to Azure Cosmos DB collections |
| cosmos-trigger-csharp | trigger | cosmos | Triggered by changes in Cosmos DB change feed |
| eventhub-trigger-csharp | trigger | eventhub | Processes streaming data from Azure Event Hubs |
| eventgrid-trigger-csharp | trigger | eventgrid | Handles Azure Event Grid events |
| servicebus-queue-trigger-csharp | trigger | servicebus | Handles messages from Azure Service Bus queues |
| servicebus-topic-trigger-csharp | trigger | servicebus | Subscribes to Azure Service Bus topics |
| signalr-connection-info-csharp | trigger | signalr | Provides SignalR connection information via HTTP |
| rabbitmq-trigger-csharp | trigger | rabbitmq | Consumes messages from RabbitMQ queues |
| sql-input-csharp | input | sql | Reads data from SQL Server/Azure SQL databases |
| sql-trigger-csharp | trigger | sql | Triggered by row changes in SQL Server/Azure SQL |
| mysql-input-csharp | input | mysql | Reads data from MySQL databases |
| mysql-output-csharp | output | mysql | Writes data to MySQL databases |
| mysql-trigger-csharp | trigger | mysql | Triggered by changes in MySQL databases |
| mcp-tool-trigger-csharp | trigger | mcp | MCP trigger for exposing functions as discoverable tools |
| mcp-resource-trigger-csharp | trigger | mcp | MCP resource trigger for exposing resources to MCP clients |
| mcp-sdk-hosting-csharp | trigger | mcp | Host MCP SDK based servers on Azure Functions |
| mcp-server-remote-csharp | trigger | mcp | Build remote MCP servers using Azure Functions |
| ai-agent-csharp | trigger | http | Simple AI agent using GitHub Copilot SDK on Azure Functions |
| ai-textsummarize-csharp | trigger | http | Summarize text using AI Cognitive Language Service |
| durable-orchestration-csharp | orchestration | durable | Orchestration with activity functions |
| durable-entity-class-csharp | entity | durable | Durable entity using class-based syntax |
| durable-entity-function-csharp | entity | durable | Durable entity using function-based syntax |
| durable-order-processor-csharp | orchestration | durable | Order processing workflow with azd deployment |
| durable-saga-csharp | orchestration | durable | Saga pattern with compensation for distributed transactions |
| durable-distributed-tracing-csharp | orchestration | durable | OpenTelemetry distributed tracing for orchestrations |
| durable-large-payload-csharp | orchestration | durable | Handling large payloads with blob storage |
| durable-pdf-summarizer-csharp | orchestration | durable | AI-powered PDF summarization with Azure OpenAI |
| durable-ai-travel-planner-csharp | orchestration | durable | AI agent orchestrating travel planning |
| durable-aspire-csharp | orchestration | durable | Durable Functions integrated with .NET Aspire |
| blob-eventgrid-trigger-csharp-azd | trigger | blob | Blob + Event Grid trigger for C# deployed with azd |
| eventhub-trigger-csharp-azd | trigger | eventhub | Event Hub trigger quickstart for C# deployed with azd |
| http-trigger-csharp-azd | trigger | http | HTTP trigger quickstart for .NET (Flex Consumption) |
| http-trigger-csharp-terraform | trigger | http | HTTP trigger quickstart for .NET with Terraform IaC |
| timer-trigger-csharp-azd | trigger | timer | Timer trigger quickstart for C# deployed with azd |
| agentframework-durable-single-agent-csharp | orchestration | agentframework | Single AI agent with durable HTTP endpoints |
| agentframework-durable-orchestration-chaining-csharp | orchestration | agentframework | Chain agent invocations |
| agentframework-durable-orchestration-concurrency-csharp | orchestration | agentframework | Run multiple agents in parallel |
| agentframework-durable-orchestration-conditionals-csharp | orchestration | agentframework | Conditional branching workflow |
| agentframework-durable-orchestration-hitl-csharp | orchestration | agentframework | Human-in-the-loop with approval |
| agentframework-durable-long-running-tools-csharp | orchestration | agentframework | Long-running tool scenarios |
| agentframework-durable-mcp-server-csharp | orchestration | agentframework | Expose durable agents as MCP tools |
| agentframework-durable-streaming-csharp | orchestration | agentframework | Redis-based reliable streaming |

### Java (19 templates)

| Template ID | Type | Resource | Description |
|------------|------|----------|-------------|
| http-trigger-java | trigger | http | HTTP-triggered function for REST API endpoints and webhooks |
| queue-trigger-java | trigger | queue | Processes messages from Azure Storage Queues |
| timer-trigger-java | trigger | timer | Scheduled function execution using CRON expressions |
| blob-trigger-java | trigger | blob | Triggered when files are added or modified in Azure Blob Storage |
| blob-input-java | input | blob | Reads files from Azure Blob Storage |
| blob-output-java | output | blob | Writes files to Azure Blob Storage |
| blob-eventgrid-trigger-java-azd | trigger | blob | Blob + Event Grid trigger for Java deployed with azd |
| cosmos-input-java | input | cosmos | Reads documents from Azure Cosmos DB collections |
| cosmos-output-java | output | cosmos | Writes documents to Azure Cosmos DB collections |
| cosmos-trigger-java | trigger | cosmos | Triggered by changes in Cosmos DB using the change feed |
| eventhub-trigger-java | trigger | eventhub | Processes streaming data from Azure Event Hubs |
| eventgrid-trigger-java | trigger | eventgrid | Handles Azure Event Grid events |
| servicebus-queue-trigger-java | trigger | servicebus | Handles messages from Azure Service Bus queues |
| servicebus-topic-trigger-java | trigger | servicebus | Subscribes to Azure Service Bus topics |
| mcp-tool-trigger-java | trigger | mcp | MCP trigger for exposing functions as discoverable tools |
| mcp-sdk-hosting-java | trigger | mcp | Host MCP SDK based servers on Azure Functions |
| mcp-server-remote-java | trigger | mcp | Build remote MCP servers using Azure Functions |
| durable-orchestration-java | orchestration | durable | Orchestration with activity functions |
| http-trigger-java-azd | trigger | http | HTTP trigger quickstart for Java (Flex Consumption) |

### JavaScript (4 templates)

| Template ID | Type | Resource | Description |
|------------|------|----------|-------------|
| ai-chatgpt-javascript | trigger | http | ChatGPT prompted HTTP function with state storage |
| blob-eventgrid-trigger-javascript-azd | trigger | blob | Blob + Event Grid trigger for JavaScript deployed with azd |
| http-trigger-javascript-azd | trigger | http | HTTP trigger quickstart for JavaScript (Flex Consumption) |
| durable-orchestration-javascript | orchestration | durable | Function Chaining and Fan-out/Fan-in patterns |

### PowerShell (2 templates)

| Template ID | Type | Resource | Description |
|------------|------|----------|-------------|
| blob-eventgrid-trigger-powershell-azd | trigger | blob | Blob + Event Grid trigger for PowerShell deployed with azd |
| http-trigger-powershell-azd | trigger | http | HTTP trigger quickstart for PowerShell (Flex Consumption) |

### Infrastructure as Code (3 templates)

| Template ID | Type | Resource | Description |
|------------|------|----------|-------------|
| iac-flex-consumption-arm | none | arm | ARM template for Azure Functions Flex Consumption plan |
| iac-flex-consumption-bicep | none | bicep | Bicep template for Azure Functions Flex Consumption plan |
| iac-flex-consumption-terraform-azapi | none | terraform | Terraform (AzAPI) for Azure Functions Flex Consumption |
| iac-flex-consumption-terraform-azurerm | none | terraform | Terraform (AzureRM) for Azure Functions Flex Consumption |

## Supported Runtimes

| Runtime | `--runtime` value | Language variants | Supported versions | Default |
|---------|------------------|-------------------|--------------------|---------|
| Node.js | `node` | `typescript` (default), `javascript` | 20, 22 (preview: 24) | 22 |
| Python | `python` | — | 3.10, 3.11, 3.12, 3.13 (preview: 3.14) | 3.13 |
| .NET Isolated | `dotnet-isolated` | — | 8, 9, 10 | 8 |
| Java | `java` | — | 8, 11, 17, 21 (preview: 25) | 21 |
| PowerShell | `powershell` | — | 7.4 | 7.4 |

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
| MCP | Depends on implementation | — |
| SQL | `SqlConnectionString` | Local SQL Server |
| MySQL | `MySqlConnectionString` | Local MySQL |
| RabbitMQ | `RabbitMQConnection` | Local RabbitMQ |
| SignalR | `AzureSignalRConnectionString` | Azure SignalR (no local emulator) |

## CRON Expression Reference (Timer Triggers)

```
{second} {minute} {hour} {day} {month} {day-of-week}

0 */5 * * * *     Every 5 minutes
0 0 */1 * * *     Every hour
0 0 8 * * *       Daily at 8 AM
0 0 0 * * 1       Weekly on Monday
0 0 0 1 * *       Monthly on the 1st
```
