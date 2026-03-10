# fnx Command Reference

## fnx init

Create a new Azure Functions project with interactive wizard.

```bash
fnx init [name] [options]
```

| Option | Description |
|--------|-------------|
| `--runtime, -r <rt>` | Runtime: `python`, `node`, `dotnet-isolated`, `java`, `powershell` |
| `--version <ver>` | Runtime version (e.g., `3.11`, `20`) |
| `--language, -l <lang>` | For Node.js: `typescript` (default) or `javascript` |
| `--template, -t <tpl>` | Template name (e.g., `HttpTrigger`, `BlobTrigger`) |
| `--sku <sku>` | Target SKU: `flex` (default), `premium`, `dedicated` |
| `--force, -f` | Initialize in non-empty directory |
| `--yes, -y` | Accept all defaults (non-interactive) |

Interactive flow: Runtime → Language variant → Trigger type → Project name → SKU → Download template.

## fnx start

Launch the Azure Functions host runtime for a specific SKU.

```bash
fnx start [options]
```

| Option | Description |
|--------|-------------|
| `--sku <name>` | Target SKU (default: `flex`). Use `--sku list` for all |
| `--app-path <dir>` | Path to function app (default: cwd, fallback: ./src) |
| `--port <port>` | HTTP listener port (default: `7071`) |
| `--mcp-port <port>` | Live MCP server port (default: host port + 1) |
| `--verbose` | Show all unfiltered host output |
| `--no-mcp` | Disable the live MCP server |
| `--no-azurite` | Skip automatic Azurite startup |
| `--profiles <src>` | Override SKU profiles source |

Startup sequence: Resolve app path → Load config → Resolve SKU profile → Download host (if needed) → Check ports → Launch host → Start MCP server → Auto-start Azurite (if storage triggers detected).

## fnx config

Manage app-config.yaml and local.settings.json.

```bash
fnx config [subcommand] [options]
```

| Subcommand | Description |
|-----------|-------------|
| *(none)* | Show resolved config with provenance (which file each value comes from) |
| `migrate` | Create app-config.yaml from local.settings.json (separates secrets) |
| `validate` | Validate app-config.yaml (YAML syntax, schema, no secrets) |

## fnx doctor

Run 7 diagnostic checks on project setup.

```bash
fnx doctor [--app-path <dir>]
```

Checks: host.json validity → app-config.yaml schema → local.settings.json → worker runtime → host cache → port availability (7071, 7072) → Azurite status.

## fnx pack

Package function app as deployment zip.

```bash
fnx pack [options]
```

| Option | Description |
|--------|-------------|
| `--app-path <dir>` | Function app directory |
| `--runtime <name>` | Runtime (auto-detected from app-config.yaml) |
| `--output <file>` | Output zip path |
| `--no-build` | Skip build steps |

Auto-runs build: `npm install` (Node), `pip install` (Python), `dotnet build` (.NET), `mvn build` (Java).

## fnx sync

Download or update host binaries and extension bundles.

```bash
fnx sync [host|extensions] [options]
```

| Option | Description |
|--------|-------------|
| `--sku <name>` | Target SKU (default: `flex`) |
| `--keep <n>` | Keep latest N versions in cache (default: `2`) |
| `--force` | Re-download even if cached |

## fnx warmup

Pre-download host binaries for CI/Docker.

```bash
fnx warmup [options]
```

| Option | Description |
|--------|-------------|
| `--all` | Warm ALL available SKUs |
| `--dry-run` | Preview downloads without downloading |
| `--force` | Re-download even if cached |

Environment: `FNX_SKIP_DOWNLOAD=1` skips warmup entirely.

## fnx setup / fnx chat

AI agent integration commands.

- `fnx setup [--all]` — Install skills, MCP config, and agent instructions
- `fnx chat [--agent <name>]` — Launch a coding agent with Functions context

## fnx templates-mcp

Start stdio-based MCP server for AI template discovery.

```bash
fnx templates-mcp
```

VS Code config (`.vscode/mcp.json`):
```json
{
  "servers": {
    "azure-functions-templates": {
      "type": "stdio",
      "command": "fnx",
      "args": ["templates-mcp"]
    }
  }
}
```

## Global Options

| Option | Description |
|--------|-------------|
| `-v, --version` | Show fnx version |
| `-h, --help` | Show help |
| `--verbose` | Detailed output |
| `--sku <name>` | Target SKU |
| `--profiles <src>` | Override SKU profiles (URL, file, or JSON) |

## Cache Locations

- `~/.fnx/hosts/` — Host binaries
- `~/.fnx/bundles/` — Extension bundles
- `~/.fnx/tools/azurite/` — Local Azurite install
