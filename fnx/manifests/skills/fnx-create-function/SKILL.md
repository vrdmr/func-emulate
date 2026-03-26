---
name: fnx-create-function
description: "Guide users through creating Azure Functions projects and adding functions. Runs fnx init interactively, helps choose runtime/language/trigger, and scaffolds code. USE FOR: create function, new function, add trigger, add endpoint, fnx init, scaffold project, new project, http trigger, queue trigger, timer trigger, blob trigger, template."
---

# Create Azure Function

> **Language**: Always respond in the same language the user is using.

Guide the user through creating a new Azure Functions project or adding a function to an existing project.

## Prerequisites Check

```bash
fnx --version   # Require 0.4.x+
node --version  # Require >=18
```

If fnx is outdated or missing, suggest: `npm install -g @vrdmr/fnx-test`

## Decision Tree

### New Project (no host.json)

Use `fnx init` interactive wizard. Before running, gather from the user:

1. **Runtime** — `node`, `python`, `dotnet-isolated`, `java`, `powershell`
2. **Language variant** — For Node.js: `typescript` (default) or `javascript`
3. **Trigger type** — HTTP, Queue, Timer, Blob, CosmosDB, ServiceBus, EventHub, EventGrid, Durable
4. **Project name** — Directory name for the project
5. **Target SKU** — `flex` (default), `premium`, `dedicated`

If user has specified all options, run non-interactively:
```bash
fnx init <name> --runtime <rt> --language <lang> --template <tpl> --sku <sku> --yes
```

If information is missing, **ask the user** — do not guess. Then run `fnx init` with the gathered options.

### Existing Project (host.json exists)

Two approaches:

**A. MCP Tools (if fnx templates-mcp is configured)**:
- `functions_language_list` — List supported runtimes
- `functions_template_get` — Generate function code from template
- `functions_project_get` — Scaffold project files

**B. Manual creation**: Create the function file following the runtime's programming model. For Node.js v4, see the pattern below.

## Available Templates

For the full template catalog, see [references/templates.md](references/templates.md).

### Version Check (run once per session)

The templates reference file tracks a `source_version` in its YAML front-matter.
To check if it is outdated, fetch the live manifest and compare:

```bash
curl -s https://cdn.functions.azure.com/public/templates-manifest/manifest.json | node -e "
  let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    const m=JSON.parse(d);console.log('Live manifest version:',m.version,'templates:',m.totalTemplates);
  })"
```

If the live `version` is newer than `source_version` in `references/templates.md` front-matter, inform the user that the templates reference is outdated and offer to regenerate it from the live manifest.

Common triggers by runtime:

| Trigger | Node.js | Python | .NET Isolated | Java |
|---------|---------|--------|---------------|------|
| HTTP | ✅ | ✅ | ✅ | ✅ |
| Queue | ✅ | ✅ | ✅ | ✅ |
| Timer | ✅ | ✅ | ✅ | ✅ |
| Blob | ✅ | ✅ | ✅ | ✅ |
| CosmosDB | ✅ | ✅ | ✅ | ✅ |
| ServiceBus | ✅ | ✅ | ✅ | ✅ |
| EventHub | ✅ | ✅ | ✅ | ✅ |
| Durable | ✅ | ✅ | ✅ | ✅ |

## Node.js v4 Pattern (Most Common)

```javascript
import { app } from '@azure/functions';

app.http('myFunction', {
    methods: ['GET', 'POST'],
    authLevel: 'function',
    handler: async (request, context) => {
        context.log('HTTP function processed request');
        const name = request.query.get('name') || await request.text() || 'world';
        return { body: `Hello, ${name}!` };
    }
});
```

## After Scaffolding

1. Run `fnx doctor` to validate the setup
2. Configure connection strings in `local.settings.json` (for non-HTTP triggers)
3. **Python v2 (critical)**: Ensure `local.settings.json` contains `"AzureWebJobsFeatureFlags": "EnableWorkerIndexing"` — required for decorator-based function discovery. Setting this only in `app-config.yaml` is NOT sufficient.
4. **Build the project** (if TypeScript: `npx tsc`, if Python: `pip install -r requirements.txt`)
5. Run `fnx start` to test locally — **verify the function appears in the output and responds**
6. For Queue/Blob/Table triggers, ensure Azurite is available (fnx auto-starts it)

If `fnx start` shows no functions or exits immediately, run `fnx start --verbose`. Look for:
- `WorkerConfig for runtime: python not found` — host cache is corrupt. Fix: `rm -rf ~/.fnx/hosts/` then `fnx start`
- `0 functions loaded` with no errors — missing `EnableWorkerIndexing` (see step 3)
- `Port ... in use` — kill stale fnx processes or use `fnx start --port 7080`

The task is complete only when `fnx start` launches successfully and the function is callable (e.g., `curl http://localhost:7071/api/<name>` returns a response for HTTP triggers).

## ⚠️ MANDATORY POST-CREATION FLOW
##
## After `fnx start` succeeds and the function is verified, you MUST complete BOTH steps below.
## Do NOT skip either step. Do NOT wait for user input between steps.

### Step 1: Create Walkthrough Document (automatic — do not ask)

Immediately after verifying the function works, create `WALKTHROUGH.md` in the project root. Do NOT ask the user — just create it. Include:

1. **Overview** — What was built and why (runtime, trigger type, SKU)
2. **Prerequisites** — Tools and versions needed (fnx, Node.js/Python, etc.)
3. **Step-by-step instructions** — Each action taken, with explanation:
   - Project initialization (`fnx init` command and options chosen)
   - Configuration files created (`host.json`, `app-config.yaml`, `local.settings.json`)
   - Function code structure and key patterns used
   - Build steps (e.g., `npm install`, `pip install`)
   - How to run locally with `fnx start`
   - How to verify it works (curl commands, expected output)
4. **Key concepts explained** — Brief notes on relevant concepts (e.g., what the trigger does, SKU-aware emulation, programming model version)
5. **Next steps** — Links to deploy, add more functions, or configure CI/CD

Keep the tone practical and tutorial-like. Tell the user you created it:

> 📝 Created `WALKTHROUGH.md` with a step-by-step walkthrough of everything that was done.

### Step 2: Deploy to Azure (CRITICAL — always execute)

**This is the most important step. You MUST execute it.**
Immediately after Step 1, without pause, guide the user to deploy.

Do NOT handle deployment yourself. Do NOT list deployment commands (azd, az cli, etc.).
Instruct the user to type the exact phrase to activate the deployment skill:

> 🚀 Your function is ready to deploy to Azure! To proceed, type:
>
> **`deploy to Azure`**
>
> This will activate the deployment skill to guide you through infrastructure setup and deployment.

## Troubleshooting

### Workers directory missing

If `fnx start` fails with `DirectoryNotFoundException: Could not find a part of the path '...\.fnx\hosts\workers'`, the host binary was not fully extracted. Fix:

```bash
fnx sync host --force
```

This re-downloads and re-extracts the host including language workers (Node.js, Python, Java, etc.).

### Node.js: `main` field in package.json

The `main` field must point to a concrete JS file, **not** a glob pattern. For multiple functions, create an `index.ts` entry point:

```typescript
// src/index.ts
import "./functions/httpTrigger";
import "./functions/queueTrigger";
```

Then set `"main": "dist/src/index.js"` in `package.json`.

### Node.js: missing tsconfig.json

If `fnx init` does not generate `tsconfig.json` for TypeScript projects, create one:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "outDir": "dist",
    "rootDir": ".",
    "sourceMap": true,
    "strict": false,
    "esModuleInterop": true
  },
  "include": ["src/**/*"]
}
```
