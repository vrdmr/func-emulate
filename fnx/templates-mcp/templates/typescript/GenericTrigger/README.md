# Generic Trigger - TypeScript

This template demonstrates the use of the `app.generic()` method in Azure Functions for Node.js/TypeScript. The generic trigger allows you to use **any Azure Functions trigger type** without requiring a dedicated SDK method. This is particularly useful for:

- **New trigger types** not yet supported by the Node.js SDK
- **Custom extension triggers** from third-party extensions
- **Experimental trigger types** in preview

## How It Works

The `app.generic()` method accepts a function name and a configuration object with a `trigger` property that specifies the trigger type and its properties.

### Basic Syntax

```typescript
import { app, InvocationContext } from "@azure/functions";

export async function myFunction(
    context: unknown,
    invocationContext: InvocationContext
): Promise<string> {
    // Function logic here
    return "Response";
}

app.generic("myFunction", {
    trigger: {
        type: "<triggerType>",   // The trigger type name
        name: "context",
        // ... additional trigger-specific properties
    },
    handler: myFunction,
});
```

## Customizing the Trigger

### Step 1: Replace the Trigger Type

Update the `type` property with the trigger type you want to use:

| Trigger Type | `type` Value |
| -------------- | -------------- |
| MCP Tool Trigger | `"mcpToolTrigger"` |
| MCP Resource Trigger | `"mcpResourceTrigger"` |
| RabbitMQ Trigger | `"rabbitMqTrigger"` |
| Custom Extension | `"<extensionTriggerName>"` |

### Step 2: Add Required Trigger Properties

Each trigger type requires specific properties. Add these to the trigger configuration object:

#### Example: MCP Tool Trigger

```typescript
app.generic("helloMcp", {
    trigger: {
        type: "mcpToolTrigger",
        name: "context",
        toolName: "hello_mcp",           // Required: Name of the MCP tool
        description: "Hello world.",     // Required: Tool description
        toolProperties: "[]",            // Required: JSON array of tool properties
    },
    handler: myFunction,
});
```

#### Example: MCP Resource Trigger

```typescript
app.generic("mcpResourceFunction", {
    trigger: {
        type: "mcpResourceTrigger",
        name: "context",
        uri: "file://readme.md",             // Required: Resource URI
        resourceName: "readme",              // Required: Resource name
        description: "Application readme",  // Required: Resource description
        mimeType: "text/plain",              // Required: MIME type of the resource
    },
    handler: myFunction,
});
```

#### Example: RabbitMQ Trigger

```typescript
app.generic("rabbitMqFunction", {
    trigger: {
        type: "rabbitMqTrigger",
        name: "context",
        connectionStringSetting: "RabbitMQConnection",  // Required: Connection string setting
        queueName: "my-queue",                          // Required: Queue name
    },
    handler: myFunction,
});
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

- [Connecting to host storage with an identity](https://learn.microsoft.com/azure/azure-functions/functions-reference?tabs=blob&pivots=programming-language-javascript#connecting-to-host-storage-with-an-identity)

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
2. Install Node.js dependencies: `npm install`
3. Build the project: `npm run build`
4. Configure trigger-specific connection strings in `local.settings.json`
5. Run `func start` to start the function locally

## Learn More

- [Azure Functions Node.js Developer Guide](https://learn.microsoft.com/azure/azure-functions/functions-reference-node)
- [Azure Functions Triggers and Bindings](https://learn.microsoft.com/azure/azure-functions/functions-triggers-bindings)
- [Custom Bindings and Triggers](https://learn.microsoft.com/azure/azure-functions/functions-bindings-register)
