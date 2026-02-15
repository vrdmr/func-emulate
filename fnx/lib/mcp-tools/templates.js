/**
 * MCP template tool definitions for the hand-rolled MCP server.
 * Imports handler functions from templates-mcp/dist (compiled TypeScript).
 *
 * Tools: get_languages_list, get_templates_list, get_template, get_project_template
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesMcpDist = join(__dirname, '..', '..', 'templates-mcp', 'dist', 'src');
const templatesRoot = join(__dirname, '..', '..', 'templates-mcp', 'templates');

let _handlers = null;
let _templates = null;

async function loadHandlers() {
  if (!_handlers) {
    _handlers = await import(join(templatesMcpDist, 'handlers.js'));
  }
  return _handlers;
}

async function loadTemplates() {
  if (!_templates) {
    _templates = await import(join(templatesMcpDist, 'templates.js'));
  }
  return _templates;
}

export async function getTemplateTools() {
  const tmpl = await loadTemplates();
  const validLanguages = tmpl.VALID_LANGUAGES;
  const validTemplates = tmpl.VALID_TEMPLATES;
  const supportedRuntimes = tmpl.SUPPORTED_RUNTIMES;

  return [
    {
      name: 'get_languages_list',
      description:
        `Get supported programming languages for Azure Functions code development.\n\n` +
        `Returns runtime versions, prerequisites, quick commands for each language.\n` +
        `Start here when creating a new Azure Functions project.\n\n` +
        `Workflow: get_languages_list → get_project_template → get_templates_list → get_template`,
      inputSchema: { type: 'object', properties: {} },
      async handler() {
        const h = await loadHandlers();
        return h.handleGetLanguagesList();
      },
    },
    {
      name: 'get_project_template',
      description:
        `Get project files for initializing a new Azure Functions app.\n\n` +
        `Returns host.json, local.settings.json, language-specific files, and setup instructions.\n` +
        `Call this BEFORE writing function code manually.\n\n` +
        `Workflow: get_languages_list → get_project_template → get_templates_list → get_template`,
      inputSchema: {
        type: 'object',
        properties: {
          language: {
            type: 'string',
            enum: [...validLanguages],
            description: `Programming language. Valid: ${validLanguages.join(', ')}`,
          },
          runtimeVersion: {
            type: 'string',
            description: 'Optional runtime version (e.g., Java JDK version, Node.js version)',
          },
        },
        required: ['language'],
      },
      async handler(args) {
        const h = await loadHandlers();
        return h.handleGetProjectTemplate(args);
      },
    },
    {
      name: 'get_templates_list',
      description:
        `Browse available Azure Functions templates organized by binding type.\n\n` +
        `Returns triggers, input bindings, and output bindings for a language.\n` +
        `Call this to discover templates before writing function code.\n\n` +
        `Workflow: get_languages_list → get_project_template → get_templates_list → get_template`,
      inputSchema: {
        type: 'object',
        properties: {
          language: {
            type: 'string',
            enum: [...validLanguages],
            description: `Programming language. Valid: ${validLanguages.join(', ')}`,
          },
        },
        required: ['language'],
      },
      async handler(args) {
        const h = await loadHandlers();
        return h.handleGetFunctionTemplatesList(args);
      },
    },
    {
      name: 'get_template',
      description:
        `Get complete, ready-to-use Azure Function code and configuration.\n\n` +
        `ALWAYS call this instead of writing Azure Function code from scratch.\n` +
        `Returns function source code, binding configuration, and integration guidance.\n\n` +
        `Workflow: get_languages_list → get_project_template → get_templates_list → get_template`,
      inputSchema: {
        type: 'object',
        properties: {
          language: {
            type: 'string',
            enum: [...validLanguages],
            description: `Programming language. Valid: ${validLanguages.join(', ')}`,
          },
          template: {
            type: 'string',
            description:
              `Template name from get_templates_list (e.g., HttpTrigger, TimerTrigger, BlobTrigger)`,
          },
          runtimeVersion: {
            type: 'string',
            description: 'Optional runtime version for Java or TypeScript',
          },
        },
        required: ['language', 'template'],
      },
      async handler(args) {
        const h = await loadHandlers();
        return h.handleGetFunctionTemplate(args, templatesRoot);
      },
    },
  ];
}
