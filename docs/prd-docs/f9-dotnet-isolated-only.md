# F9: .NET Isolated Worker Only — No In-Process Model

**Status:** 📋 Proposed  
**PRD Section:** Runtime support  
**Depends on:** F1 (SKU profiles), F2 (host version manager)

## Problem

Azure Functions currently supports two .NET hosting models:

1. **In-process** — Function code runs inside the host process (`Microsoft.NET.Sdk.Functions`)
2. **Isolated worker** — Function code runs in a separate worker process (`Microsoft.Azure.Functions.Worker`)

Supporting both models doubles the surface area for fnx:

- **Two different project templates**, SDK packages, and startup patterns
- **DI (dependency injection) conflicts** — in-process shares the host's DI container, leading to version collisions (e.g., `Microsoft.Extensions.Logging` version mismatches). This has been a persistent source of developer pain and support tickets.
- **Two different debugging attach models** — in-process attaches to the host; isolated attaches to the worker
- **Two different sets of middleware, bindings, and extension APIs**
- **In-process is on a deprecation path** — Microsoft has announced the isolated model as the future

By scoping fnx to **isolated worker only**, we cut implementation effort roughly in half and eliminate the entire class of DI conflicts that plagued Core Tools.

## Feature

fnx supports **.NET isolated worker projects only**. Specifically:

1. **Templates** — `fnx init` and the MCP template tools only scaffold isolated worker projects for .NET
2. **SKU profiles** — .NET SKUs reference only isolated-compatible host versions
3. **Documentation & errors** — If a user attempts to run an in-process project, fnx produces a clear error with migration guidance
4. **No in-process host shims** — No need to handle `Microsoft.NET.Sdk.Functions` project detection or in-process startup hooks

## How It Works

### Detection

When `fnx start` is invoked in a .NET project, fnx checks the `.csproj` for the SDK:

| SDK | Model | fnx Support |
|-----|-------|-------------|
| `Microsoft.Azure.Functions.Worker.Sdk` | Isolated | ✅ Supported |
| `Microsoft.NET.Sdk.Functions` | In-process | ❌ Blocked with guidance |

If an in-process project is detected:

```
Error: fnx does not support the in-process hosting model.

Your project uses Microsoft.NET.Sdk.Functions (in-process).
fnx only supports the isolated worker model (Microsoft.Azure.Functions.Worker.Sdk).

To migrate: https://learn.microsoft.com/azure/azure-functions/migrate-dotnet-to-isolated-model
```

### Template Scaffolding

All .NET templates use the isolated worker SDK:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <AzureFunctionsVersion>v4</AzureFunctionsVersion>
    <OutputType>Exe</OutputType>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Azure.Functions.Worker" Version="2.0.0" />
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Sdk" Version="2.0.0" />
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Http.AspNetCore" Version="2.0.0" />
  </ItemGroup>
</Project>
```

### What We Don't Need to Implement

| Concern | In-Process | Isolated | fnx Scope |
|---------|-----------|----------|-----------|
| DI container sharing | Host + user code share container | Separate processes | Eliminated |
| SDK version conflicts | Common (binding extension versions) | Rare (worker manages own deps) | Eliminated |
| Startup class model | `FunctionsStartup` | Standard `Program.cs` | Simpler |
| Debugging | Attach to host PID | Attach to worker PID | One model |
| Middleware | IFunctionsHostBuilder | ASP.NET Core middleware | Standard |

## Success Criteria

- [ ] `fnx init --worker-runtime dotnet` scaffolds an isolated worker project
- [ ] `fnx start` in an in-process project shows a clear error with migration link
- [ ] No in-process-specific code paths exist in fnx codebase
- [ ] MCP template tools only return isolated worker .NET templates
- [ ] SKU profiles for .NET reference isolated-compatible host versions only

## Open Questions

- [ ] Should fnx detect in-process projects proactively during `fnx init` (if run in an existing project dir)?
- [ ] Should we support .NET 6 isolated (LTS ended) or only .NET 8+?
- [ ] Do we need a `--force` flag to bypass the in-process block for edge cases?
