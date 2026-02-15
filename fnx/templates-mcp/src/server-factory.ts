/**
 * Server factory - Creates and configures the MCP server.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from './logger.js';
import {
  validateTemplatesExist,
  discoverTemplates,
  VALID_LANGUAGES,
  VALID_TEMPLATES,
  SUPPORTED_RUNTIMES,
  type ValidLanguage,
} from './templates.js';
import {
  handleGetLanguagesList,
  handleGetProjectTemplate,
  handleGetFunctionTemplatesList,
  handleGetFunctionTemplate,
} from './handlers.js';

/** Server configuration options */
export interface ServerConfig {
  name: string;
  version: string;
  templatesRoot: string;
}

/** Validation result from template checks */
export interface ValidationResult {
  valid: boolean;
  missingCount: number;
  extraCount: number;
  totalTemplates: number;
  messages: string[];
}

/**
 * Creates and configures an MCP server with all Azure Functions template tools.
 *
 * @param config Server configuration including name, version, and templates path
 * @returns Configured McpServer instance ready for connection
 */
export function createServer(config: ServerConfig): McpServer {
  logger.info('Creating MCP server', { name: config.name, version: config.version });

  const server = new McpServer({
    name: config.name,
    version: config.version,
  });

  registerTools(server, config.templatesRoot);

  logger.info('Server created successfully');
  return server;
}

/**
 * Registers all Azure Functions template tools on the server.
 *
 * @param server The MCP server instance
 * @param templatesRoot Path to the templates directory
 */
export function registerTools(server: McpServer, templatesRoot: string): void {
  server.registerTool(
    'get_languages_list',
    {
      title: 'Get Languages List',
      description: `Get supported programming languages for Azure Functions code development.

**USE THIS SERVER** when the user wants to:
- Create an Azure Function or Functions app
- Add a trigger (HTTP, Timer, Blob, Queue, Cosmos DB, Event Hub, Service Bus)
- Add bindings to an existing function
- Generate serverless function code for Azure

Returns for each language:
- **Runtime versions**: Supported versions (e.g., Python 3.10-3.13, Node.js 20-24)
- **Prerequisites**: What needs to be installed
- **Quick commands**: Init, build, and run commands

Start here when creating a new Azure Functions project.

**Workflow**: get_languages_list → get_project_template → get_azure_functions_templates_list → get_azure_functions_template`,
      inputSchema: {},
    },
    async () => {
      return handleGetLanguagesList();
    }
  );

  server.registerTool(
    'get_project_template',
    {
      title: 'Get Project Template',
      description: `Get project files for initializing a new Azure Functions app.

**Call this BEFORE writing function code manually.** Returns ready-to-use project structure:
- **host.json**: Azure Functions host configuration
- **local.settings.json**: Local development settings  
- **Language-specific files**: requirements.txt, package.json, pom.xml, .csproj
- **Setup instructions**: Step-by-step guide to get started

**Workflow**: get_languages_list → **get_project_template** → get_azure_functions_templates_list → get_azure_functions_template`,
      inputSchema: {
        language: z
          .enum(VALID_LANGUAGES)
          .describe(`Programming language for the project. Valid values: ${VALID_LANGUAGES.join(', ')}`),
        runtimeVersion: z
          .string()
          .optional()
          .describe(
            `Optional runtime version for Java or TypeScript. ` +
              `For Java: JDK version [${[...SUPPORTED_RUNTIMES.java.supported, ...SUPPORTED_RUNTIMES.java.preview].join(', ')}] (recommended: ${SUPPORTED_RUNTIMES.java.recommended}). ` +
              `For TypeScript: Node.js version [${[...SUPPORTED_RUNTIMES.typescript.supported, ...SUPPORTED_RUNTIMES.typescript.preview].join(', ')}] (recommended: ${SUPPORTED_RUNTIMES.typescript.recommended}). ` +
              `When provided, placeholders like {{javaVersion}} or {{nodeVersion}} are replaced automatically.`
          ),
      },
    },
    async (args: { language: ValidLanguage; runtimeVersion?: string }) => {
      return handleGetProjectTemplate(args);
    }
  );

  server.registerTool(
    'get_azure_functions_templates_list',
    {
      title: 'Get Azure Functions Templates List',
      description: `Browse available Azure Functions templates organized by binding type.

**Call this to discover templates** before writing function code. Returns:
- **Triggers** (pick one): HttpTrigger, TimerTrigger, BlobTrigger, CosmosDBTrigger, QueueTrigger, EventHubTrigger, ServiceBusTrigger
- **Input Bindings** (optional): Read from Blob, Cosmos DB, SQL
- **Output Bindings** (optional): Write to Blob, Cosmos DB, Queue, Service Bus

Each template includes description, resource type, and use cases.

**Workflow**: get_languages_list → get_project_template → **get_azure_functions_templates_list** → get_azure_functions_template`,
      inputSchema: {
        language: z.enum(VALID_LANGUAGES).describe(`Programming language. Valid values: ${VALID_LANGUAGES.join(', ')}`),
      },
    },
    async (args: { language: ValidLanguage }) => {
      return handleGetFunctionTemplatesList(args);
    }
  );

  server.registerTool(
    'get_azure_functions_template',
    {
      title: 'Get Azure Functions Template',
      description: `Get complete, ready-to-use Azure Function code and configuration.

**ALWAYS call this instead of writing Azure Function code from scratch.** Returns:
- **Function source code**: Production-ready implementation with proper bindings
- **Binding configuration**: Required connection strings and app settings
- **Integration guidance**: How to merge multiple bindings into one function

For functions with multiple bindings: fetch 1 trigger + desired input/output binding templates, then merge.

**Workflow**: get_languages_list → get_project_template → get_azure_functions_templates_list → **get_azure_functions_template**

**Available Templates**: ${VALID_TEMPLATES.csharp.length} C#, ${VALID_TEMPLATES.java.length} Java, ${VALID_TEMPLATES.python.length} Python, ${VALID_TEMPLATES.typescript.length} TypeScript`,
      inputSchema: {
        language: z
          .enum(VALID_LANGUAGES)
          .describe(`REQUIRED: Programming language. Valid values: ${VALID_LANGUAGES.join(', ')}`),
        template: z
          .string()
          .describe(
            `REQUIRED: Template name from get_azure_functions_templates_list. ` +
              `Triggers: HttpTrigger, TimerTrigger, BlobTrigger, CosmosDBTrigger, QueueTrigger. ` +
              `Input bindings: BlobInputBinding, CosmosDBInputBinding. ` +
              `Output bindings: BlobOutputBinding, CosmosDBOutputBinding.`
          ),
        runtimeVersion: z
          .string()
          .optional()
          .describe(
            `Optional runtime version for Java or TypeScript. ` +
              `For Java: JDK version [${[...SUPPORTED_RUNTIMES.java.supported, ...SUPPORTED_RUNTIMES.java.preview].join(', ')}] (recommended: ${SUPPORTED_RUNTIMES.java.recommended}). ` +
              `For TypeScript: Node.js version [${[...SUPPORTED_RUNTIMES.typescript.supported, ...SUPPORTED_RUNTIMES.typescript.preview].join(', ')}] (recommended: ${SUPPORTED_RUNTIMES.typescript.recommended}). ` +
              `When provided, placeholders like {{javaVersion}} or {{nodeVersion}} are replaced automatically.`
          ),
      },
    },
    async (args: { language: ValidLanguage; template: string; runtimeVersion?: string }) => {
      return handleGetFunctionTemplate(args, templatesRoot);
    }
  );
}

/**
 * Validates that all declared templates exist on disk.
 *
 * NOTE: Primary validation happens at build time via `npm run validate:templates`.
 * This runtime check provides additional safety and verbose logging.
 *
 * @param templatesRoot Path to the templates directory
 * @param verbose Whether to log verbose output
 * @returns Validation result with details
 */
export async function validateTemplates(templatesRoot: string, verbose = false): Promise<ValidationResult> {
  const messages: string[] = [];
  let valid = true;

  const result = await validateTemplatesExist(templatesRoot);

  if (!result.valid) {
    valid = false;
    messages.push(`[ERROR] Template validation failed - ${result.missing.length} missing template(s):`);
    for (const { language, template } of result.missing) {
      messages.push(`  - ${language}/${template}`);
    }
    messages.push(`Templates root: ${templatesRoot}`);
    messages.push(`[HINT] Run 'npm run validate:templates' for detailed diagnostics`);
  }

  // Discover templates from filesystem and report discrepancies
  const discovered = await discoverTemplates(templatesRoot);

  if (discovered.extraOnDisk.length > 0) {
    valid = false;
    messages.push(`[WARNING] Found ${discovered.extraOnDisk.length} undocumented template(s) on disk:`);
    for (const { language, template } of discovered.extraOnDisk) {
      messages.push(`  + ${language}/${template}`);
    }
    messages.push(`[HINT] Add to TEMPLATE_DESCRIPTIONS in src/templates.ts or run 'npm run validate:templates'`);
  }

  if (verbose) {
    messages.push(
      `[INFO] Template discovery: ${discovered.totalTemplates} templates found across ${discovered.languages.length} languages`
    );
  }

  return {
    valid,
    missingCount: result.missing.length,
    extraCount: discovered.extraOnDisk.length,
    totalTemplates: discovered.totalTemplates,
    messages,
  };
}

/**
 * Logs validation messages to stderr.
 *
 * @param result Validation result to log
 */
export function logValidationResult(result: ValidationResult): void {
  for (const message of result.messages) {
    console.error(message);
  }
}
