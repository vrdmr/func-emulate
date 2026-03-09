# fnx Command Map

## Core commands

| Command | Best used for |
| --- | --- |
| `fnx init` | Create a new Azure Functions project from a template |
| `fnx start` | Run a Functions app locally against a target SKU |
| `fnx doctor` | Diagnose setup and validation issues |
| `fnx config` | Show, migrate, or validate app configuration |
| `fnx warmup` | Pre-download host and extension assets |
| `fnx sync` | Refresh cached host or extension assets |
| `fnx pack` | Build a deployment zip |
| `fnx templates-mcp` | Expose templates and SKU information to AI assistants |


## Recommended entry points

- New project → `fnx init`
- Existing project health check → `fnx doctor`
- Local run → `fnx start --sku <name>`
- Offline preparation → `fnx warmup`
- Agent template integration → `fnx templates-mcp`
