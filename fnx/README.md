# fnx — SKU-aware Azure Functions Local Emulator

Run Azure Functions locally with the **exact host version** your target SKU uses in production. No more "works locally, breaks in Azure."

## Install

```bash
npm install -g @vrdmr/fnx-test
```

Or run without installing:

```bash
npx @vrdmr/fnx-test start --sku flex --scriptroot ./my-app
```

## Quick Start

```bash
# List available SKUs
fnx start --sku list

# Run your function app with the Flex Consumption host
fnx start --sku flex --scriptroot ./my-function-app

# Run with Windows Consumption host
fnx start --sku windows-consumption --scriptroot ./my-function-app
```

## What It Does

`fnx` downloads and caches the **self-contained host binary** for your target SKU, then launches your function app against it. Each SKU maps to a specific host version, extension bundle version, and runtime configuration — matching what runs in Azure.

```
fnx start --sku flex
  ├── Resolves SKU profile (host v4.1047.100, bundle v4.30.0)
  ├── Downloads host binary (cached at ~/.fnx/hosts/)
  ├── Downloads extension bundle (cached at ~/.fnx/bundles/)
  ├── Auto-starts Azurite if needed (storage triggers)
  └── Launches host → your functions are live
```

## Available SKUs

| SKU | Description |
|-----|-------------|
| `flex` | Flex Consumption (latest host, latest bundle) |
| `linux-premium` | Linux Premium (EP1/EP2/EP3) |
| `linux-consumption` | Linux Consumption |
| `windows-consumption` | Windows Consumption |
| `windows-dedicated` | Windows Dedicated (App Service Plan) |

## Commands

```bash
fnx start --sku <sku> --scriptroot <path>   # Run function app
fnx start --sku list                         # List available SKUs
fnx warmup [--sku <sku>] [--all]            # Pre-download host + bundle
fnx templates-mcp                            # Start MCP server for AI agents
fnx pack --scriptroot <path>                # Package function app as deployment zip
```

## MCP Server (for AI Agents)

fnx includes an MCP server that exposes Azure Functions templates to AI coding assistants:

```json
// .vscode/mcp.json
{
  "servers": {
    "azure-functions-templates": {
      "type": "stdio",
      "command": "npx",
      "args": ["@vrdmr/fnx-test", "templates-mcp"]
    }
  }
}
```

Or use the direct entrypoint for faster cold starts:

```json
{
  "servers": {
    "azure-functions-templates": {
      "type": "stdio",
      "command": "npx",
      "args": ["fnx-template-mcp"]
    }
  }
}
```

## Features

- **SKU-aware** — match the exact host version your target Azure environment runs
- **Zero dependencies** — pure Node.js 18+, no native modules
- **Offline-capable** — bundled profiles + cached hosts work without network
- **Auto Azurite** — storage emulator starts automatically for blob/queue/timer triggers
- **.NET isolated only** — blocks in-process .NET projects with migration guidance
- **MCP integration** — AI agents can discover templates and SKU profiles

## Requirements

- Node.js 18+
- ~200MB disk per host version (cached at `~/.fnx/`)

## License

MIT
