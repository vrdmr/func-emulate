# Generic Trigger - Python

This template demonstrates the use of the `generic_trigger` decorator in Azure Functions for Python. The generic trigger allows you to use **any Azure Functions trigger type** without requiring a dedicated runtime-specific decorator or annotation. This is particularly useful for:

- **New trigger types** not yet supported by the Python SDK
- **Custom extension triggers** from third-party extensions
- **Experimental trigger types** in preview

## How It Works

The `generic_trigger` decorator accepts a `type` parameter that specifies the trigger type, along with any trigger-specific properties required by that trigger.

### Basic Syntax

```python
@app.generic_trigger(
    arg_name="context",
    type="<triggerType>",       # The trigger type name
    # ... additional trigger-specific properties
)
def my_function(context) -> str:
    # Function logic here
    return "Response"
```

## Customizing the Trigger

### Step 1: Replace the Trigger Type

Update the `type` parameter with the trigger type you want to use:

| Trigger Type | `type` Value |
| -------------- | -------------- |
| MCP Tool Trigger | `"mcpToolTrigger"` |
| MCP Resource Trigger | `"mcpResourceTrigger"` |
| RabbitMQ Trigger | `"rabbitMqTrigger"` |
| Custom Extension | `"<extensionTriggerName>"` |

### Step 2: Add Required Trigger Properties

Each trigger type requires specific properties. Add these as additional parameters to the decorator:

#### Example: MCP Tool Trigger

```python
@app.generic_trigger(
    arg_name="context",
    type="mcpToolTrigger",
    toolName="hello_mcp",           # Required: Name of the MCP tool
    description="Hello world.",      # Required: Tool description
    toolProperties="[]",             # Required: JSON array of tool properties
)
def hello_mcp(context) -> str:
    return "Hello I am MCPTool!"
```

#### Example: MCP Resource Trigger

```python
@app.generic_trigger(
    arg_name="context",
    type="mcpResourceTrigger",
    uri="file://readme.md",              # Required: Resource URI
    resourceName="readme",               # Required: Resource name
    description="Application readme",    # Required: Resource description
    mimeType="text/plain",               # Required: MIME type of the resource
)
def mcp_resource_function(context) -> str:
    return "# Sample Readme\nThis is a sample readme file."
```

#### Example: RabbitMQ Trigger

```python
@app.generic_trigger(
    arg_name="context",
    type="rabbitMqTrigger",
    connectionStringSetting="RabbitMQConnection",  # Required: Connection string setting name
    queueName="my-queue",                          # Required: Queue name to listen to
)
def rabbitmq_function(context) -> str:
    logging.info(f"Received message: {context}")
    return "Processed"
```

## Common Trigger Properties Reference

| Trigger Type | Required Properties |
| -------------- | --------------------- |
| `mcpToolTrigger` | `toolName`, `description`, `toolProperties` |
| `mcpResourceTrigger` | `uri`, `resourceName`, `description`, `mimeType` |
| `rabbitMqTrigger` | `connectionStringSetting`, `queueName` |
| `daprServiceInvocationTrigger` | `methodName` |

> **Note**: Consult the specific trigger's documentation for a complete list of required and optional properties.

## Configuration

### Host Storage Configuration

The `AzureWebJobsStorage` setting is used by the Azure Functions runtime. By default, it uses Azurite for local development:

```json
"AzureWebJobsStorage": "UseDevelopmentStorage=true"
```

For production, configure identity-based connections:

- [Connecting to host storage with an identity](https://learn.microsoft.com/azure/azure-functions/functions-reference?tabs=blob&pivots=programming-language-python#connecting-to-host-storage-with-an-identity)

### Extension Bundle

Ensure your `host.json` includes the extension bundle to support the trigger type you're using:

```json
{
  "version": "2.0",
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
```

### Alternative: Using extensions.csproj (For Unreleased Extensions)

If the extension you need is **not yet available in the extension bundle**, you can manually reference the extension's NuGet package using an `extensions.csproj` file. This approach requires the [.NET SDK](https://dotnet.microsoft.com/download) to be installed.

#### Step 1: Remove the Extension Bundle

Remove or comment out the `extensionBundle` section in your `host.json`.

#### Step 2: Create extensions.csproj

Create an `extensions.csproj` file in your function app root directory:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <WarningsAsErrors></WarningsAsErrors>
    <DefaultItemExcludes>**</DefaultItemExcludes>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Azure.WebJobs.Extensions.<ExtensionName>" Version="<Version>" />
    <!-- Add additional extension packages as needed -->
    <!-- Example: -->
    <!-- <PackageReference Include="Microsoft.Azure.WebJobs.Extensions.RabbitMQ" Version="2.1.0" /> -->
    <!-- <PackageReference Include="Microsoft.Azure.Functions.Extensions.Mcp" Version="1.2.0" /> -->
  </ItemGroup>
</Project>
```

> **Tip**: Always use the latest version of NuGet packages. Check [nuget.org](https://www.nuget.org/) for the most recent versions.

#### Step 3: Build the Extensions

Run the following command to build and install the extensions:

```bash
dotnet build extensions.csproj
```

This will download the NuGet packages and generate the required `extensions.json` file in the `bin` directory.

> **Note**: You must rebuild the extensions whenever you add or update package references in `extensions.csproj`.

## Local Development

1. Install [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) for local storage emulation
2. Install any required dependencies in `requirements.txt`
3. Configure trigger-specific connection strings in `local.settings.json`
4. Run `func start` to start the function locally

## Learn More

- [Azure Functions Python Developer Guide](https://learn.microsoft.com/azure/azure-functions/functions-reference-python)
- [Azure Functions Triggers and Bindings](https://learn.microsoft.com/azure/azure-functions/functions-triggers-bindings)
- [Custom Bindings and Triggers](https://learn.microsoft.com/azure/azure-functions/functions-bindings-register)
