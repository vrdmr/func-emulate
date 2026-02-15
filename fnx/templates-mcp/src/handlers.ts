/**
 * MCP tool handler implementations.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  VALID_LANGUAGES,
  VALID_TEMPLATES,
  TEMPLATE_DESCRIPTIONS,
  LANGUAGE_INFO,
  PROJECT_TEMPLATES,
  BINDING_CONFIGS,
  SUPPORTED_RUNTIMES,
  exists,
  listFilesRecursive,
  getFileExtension,
  isValidLanguage,
  isValidTemplate,
  groupTemplatesByBindingType,
} from './templates.js';

export {
  getFileExtension,
  isValidLanguage as validateLanguage,
  isValidTemplate as validateTemplate,
} from './templates.js';
export type { ValidLanguage } from './templates.js';

/** Maximum file size to read (1 MB) */
export const MAX_FILE_SIZE_BYTES = 1024 * 1024;

/** Maximum total response size (5 MB) */
export const MAX_RESPONSE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Result type for handler operations.
 * Uses index signature to be compatible with MCP SDK's CallToolResult.
 */
export interface HandlerResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/** Returns true if the path is safe (no path traversal). */
export function isPathSafe(templateDir: string, requestedPath: string): boolean {
  if (!requestedPath || requestedPath === '.' || requestedPath === '..') {
    return false;
  }

  // Normalize backslashes to forward slashes for cross-platform security
  const normalizedPath = requestedPath.replace(/\\/g, '/');

  // Reject absolute paths (Unix or Windows style)
  if (normalizedPath.startsWith('/') || /^[A-Za-z]:/.test(normalizedPath)) {
    return false;
  }

  const resolvedTemplateDir = path.resolve(templateDir);
  const fullPath = path.resolve(templateDir, normalizedPath);
  return fullPath.startsWith(resolvedTemplateDir + path.sep);
}

/**
 * Creates an error result for handler responses
 */
export function createErrorResult(message: string): HandlerResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

/**
 * Creates a success result for handler responses
 */
export function createSuccessResult(text: string): HandlerResult {
  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Replaces template placeholders with the provided runtime version.
 * For Java: replaces {{javaVersion}} with the provided version
 *   - For <java.version> (Maven compiler): converts "8" to "1.8"
 *   - For <javaVersion> (Azure runtime): keeps as-is (e.g., "8")
 * For TypeScript: replaces {{nodeVersion}} with the provided version
 */
export function replaceRuntimeVersion(content: string, language: string, runtimeVersion: string): string {
  if (language === 'java') {
    // For Java 8: Maven compiler needs "1.8" but Azure runtime needs "8"
    const mavenVersion = runtimeVersion === '8' ? '1.8' : runtimeVersion;
    // Replace <java.version>{{javaVersion}}</java.version> with Maven-compatible version
    let result = content.replace(
      /<java\.version>\{\{javaVersion\}\}<\/java\.version>/g,
      `<java.version>${mavenVersion}</java.version>`
    );
    // Replace remaining {{javaVersion}} (e.g., <javaVersion> for Azure runtime) with original version
    result = result.replace(/\{\{javaVersion\}\}/g, runtimeVersion);
    return result;
  } else if (language === 'typescript') {
    return content.replace(/\{\{nodeVersion\}\}/g, runtimeVersion);
  }
  return content;
}

/**
 * Validates if the provided runtime version is supported for the given language.
 * Returns null if valid, or an error message if invalid.
 */
export function validateRuntimeVersion(
  language: string,
  runtimeVersion: string
): { valid: true } | { valid: false; error: string; validVersions: string[] } {
  if (!isValidLanguage(language)) {
    return { valid: false, error: `Invalid language: "${language}"`, validVersions: [] };
  }

  const runtime = SUPPORTED_RUNTIMES[language];
  const allVersions = [...runtime.supported, ...runtime.preview];

  if (!allVersions.includes(runtimeVersion)) {
    const previewNote = runtime.preview.length > 0 ? ` (preview: ${runtime.preview.join(', ')})` : '';
    return {
      valid: false,
      error: `Invalid runtime version "${runtimeVersion}" for ${language}. Supported versions: ${runtime.supported.join(', ')}${previewNote}. Recommended: ${runtime.recommended}`,
      validVersions: allVersions,
    };
  }

  return { valid: true };
}

// ============================================================================
// COMPOSABLE TOOL HANDLERS
// ============================================================================

/**
 * Handler for get_languages_list tool.
 * Returns a list of supported languages with useful development information.
 */
export async function handleGetLanguagesList(): Promise<HandlerResult> {
  let result = `# Azure Functions Supported Languages\n\n`;
  result += `Total Languages: ${VALID_LANGUAGES.length}\n`;
  result += `*Runtime info last updated: ${SUPPORTED_RUNTIMES.lastUpdated}*\n\n`;

  for (const lang of VALID_LANGUAGES) {
    const info = LANGUAGE_INFO[lang];
    result += `## ${info.name} (\`${lang}\`)\n\n`;
    result += `**Runtime**: ${info.runtime}\n`;
    result += `**Programming Model**: ${info.programmingModel}\n`;
    result += `**Templates Available**: ${VALID_TEMPLATES[lang].length}\n\n`;

    result += `### Prerequisites\n`;
    for (const prereq of info.prerequisites) {
      result += `- ${prereq}\n`;
    }
    result += `\n`;

    result += `### Development Tools\n`;
    for (const tool of info.developmentTools) {
      result += `- ${tool}\n`;
    }
    result += `\n`;

    result += `### Quick Commands\n`;
    result += `- **Initialize**: \`${info.initCommand}\`\n`;
    result += `- **Run locally**: \`${info.runCommand}\`\n`;
    if (info.buildCommand) {
      result += `- **Build**: \`${info.buildCommand}\`\n`;
    }
    result += `\n---\n\n`;
  }

  return createSuccessResult(result);
}

/**
 * Arguments for the get_project_template handler
 */
export interface GetProjectTemplateArgs {
  language: string;
  runtimeVersion?: string;
}

/**
 * Handler for get_project_template tool.
 * Returns files for initializing a new Azure Functions project.
 */
export async function handleGetProjectTemplate(args: GetProjectTemplateArgs): Promise<HandlerResult> {
  const { language, runtimeVersion } = args;

  if (!isValidLanguage(language)) {
    return createErrorResult(`Invalid language: "${language}". Valid languages are: ${VALID_LANGUAGES.join(', ')}`);
  }

  // Validate runtimeVersion if provided
  if (runtimeVersion !== undefined) {
    const validation = validateRuntimeVersion(language, runtimeVersion);
    if (!validation.valid) {
      return createErrorResult(validation.error);
    }
  }

  const projectTemplate = PROJECT_TEMPLATES[language];
  const languageInfo = LANGUAGE_INFO[language];

  let result = `# Azure Functions Project Template: ${languageInfo.name}\n\n`;

  // Project structure overview
  result += `## Project Structure\n\n`;
  result += `\`\`\`\n`;
  for (const item of projectTemplate.projectStructure) {
    result += `${item}\n`;
  }
  result += `\`\`\`\n\n`;

  // Prerequisites
  result += `## Prerequisites\n\n`;
  for (const prereq of languageInfo.prerequisites) {
    result += `- ${prereq}\n`;
  }
  result += `\n`;

  // Determine if we should apply runtime version replacement
  const shouldReplaceVersion = runtimeVersion && (language === 'java' || language === 'typescript');

  // Project files
  result += `## Project Files\n\n`;
  const fileNames = Object.keys(projectTemplate.files);
  result += `This template includes ${fileNames.length} file(s):\n\n`;

  for (const [fileName, rawContent] of Object.entries(projectTemplate.files)) {
    const content = shouldReplaceVersion ? replaceRuntimeVersion(rawContent, language, runtimeVersion) : rawContent;
    const ext = getFileExtension(fileName);
    result += `### \`${fileName}\`\n\n`;
    result += `\`\`\`${ext}\n${content}\`\`\`\n\n`;
  }

  // Init instructions
  result += `## Setup Instructions\n\n`;
  result += projectTemplate.initInstructions;
  result += `\n`;

  // Template parameters (only show if not already replaced)
  if (!shouldReplaceVersion && projectTemplate.parameters && projectTemplate.parameters.length > 0) {
    result += `## Template Parameters\n\n`;
    result += `**Important**: The files above contain placeholders that must be replaced before use.\n\n`;
    result += `| Placeholder | Description | Default | Valid Values |\n`;
    result += `|-------------|-------------|---------|--------------|\n`;
    for (const param of projectTemplate.parameters) {
      const validValues = param.validValues ? param.validValues.join(', ') : 'Any';
      result += `| \`{{${param.name}}}\` | ${param.description} | \`${param.defaultValue}\` | ${validValues} |\n`;
    }
    result += `\n`;
    result += `**How to replace**: Detect the user's installed runtime version or ask their preference, then replace all occurrences of \`{{paramName}}\` with the actual value.\n\n`;
  }

  // Quick commands
  result += `## Quick Commands\n\n`;
  result += `| Action | Command |\n`;
  result += `|--------|--------|\n`;
  result += `| Initialize | \`${languageInfo.initCommand}\` |\n`;
  result += `| Run locally | \`${languageInfo.runCommand}\` |\n`;
  if (languageInfo.buildCommand) {
    result += `| Build | \`${languageInfo.buildCommand}\` |\n`;
  }

  // Next step hint
  result += `\n---\n\n`;
  result += `**Next Step**: Call \`get_azure_functions_templates_list\` with language "${language}" to browse available function Triggers and Bindings.\n`;

  return createSuccessResult(result);
}

/**
 * Handler for get_azure_functions_templates_list tool.
 * Returns a list of available function templates for a given language,
 * grouped by binding type to show composable parts.
 */
export async function handleGetFunctionTemplatesList(args: { language: string }): Promise<HandlerResult> {
  const { language } = args;

  if (!isValidLanguage(language)) {
    return createErrorResult(`Invalid language: "${language}". Valid languages are: ${VALID_LANGUAGES.join(', ')}`);
  }

  const descriptions = TEMPLATE_DESCRIPTIONS[language];
  const { triggers, inputBindings, outputBindings } = groupTemplatesByBindingType(language);
  const languageInfo = LANGUAGE_INFO[language];

  let result = `# Function Templates for ${languageInfo.name}\n\n`;
  result += `**Usage**: Select 1 trigger (required) + 0 or more bindings (optional)\n\n`;

  // Triggers section
  result += `## Triggers (pick one)\n\n`;
  result += `| Template | Description | Resource |\n`;
  result += `|----------|-------------|----------|\n`;
  for (const template of triggers) {
    const desc = descriptions[template];
    result += `| \`${template}\` | ${desc?.description ?? 'Template available'} | ${desc?.resource ?? '-'} |\n`;
  }
  result += `\n`;

  // Input Bindings section
  if (inputBindings.length > 0) {
    result += `## Input Bindings (optional, reads data)\n\n`;
    result += `| Template | Description | Resource |\n`;
    result += `|----------|-------------|----------|\n`;
    for (const template of inputBindings) {
      const desc = descriptions[template];
      result += `| \`${template}\` | ${desc?.description ?? 'Template available'} | ${desc?.resource ?? '-'} |\n`;
    }
    result += `\n`;
  }

  // Output Bindings section
  if (outputBindings.length > 0) {
    result += `## Output Bindings (optional, writes data)\n\n`;
    result += `| Template | Description | Resource |\n`;
    result += `|----------|-------------|----------|\n`;
    for (const template of outputBindings) {
      const desc = descriptions[template];
      result += `| \`${template}\` | ${desc?.description ?? 'Template available'} | ${desc?.resource ?? '-'} |\n`;
    }
    result += `\n`;
  }

  // Next step hint
  result += `---\n\n`;
  result += `**Next Step**: Call \`get_azure_functions_template\` for each template you need (1 trigger + desired bindings), then merge the bindings into one function.\n`;

  return createSuccessResult(result);
}

/**
 * Arguments for the get_azure_functions_template handler
 */
export interface GetFunctionTemplateArgs {
  language: string;
  template: string;
  runtimeVersion?: string;
}

/**
 * Handler for get_azure_functions_template tool.
 * Returns files and information for adding a new function to an existing project.
 */
export async function handleGetFunctionTemplate(
  args: GetFunctionTemplateArgs,
  templatesRoot: string
): Promise<HandlerResult> {
  const { language, template, runtimeVersion } = args;

  // Validate language
  if (!isValidLanguage(language)) {
    return createErrorResult(`Invalid language: "${language}"

Valid languages: ${VALID_LANGUAGES.map((l) => `"${l}"`).join(', ')}

Use \`get_languages_list\` to see all available languages with details.`);
  }

  // Validate template
  if (!isValidTemplate(language, template)) {
    const validTemplatesForLang = VALID_TEMPLATES[language];
    return createErrorResult(`Invalid template: "${template}" for language "${language}"

Valid templates for ${language}:
${validTemplatesForLang.map((t) => `- "${t}"`).join('\n')}

Use \`get_azure_functions_templates_list\` to see all templates with descriptions.`);
  }

  const templateDir = path.join(templatesRoot, language, template);
  if (!(await exists(templateDir))) {
    return createErrorResult(`Template directory not found: ${language}/${template}`);
  }

  const description = TEMPLATE_DESCRIPTIONS[language]?.[template];
  const bindingConfig = BINDING_CONFIGS[template];

  // Get all files in the template
  const allFiles = await listFilesRecursive(templateDir);
  const relativeFiles = allFiles.map((f) => path.relative(templateDir, f));

  // Identify function-specific files vs project files
  // Note: pom.xml is project-specific, so we return it with function templates instead
  const projectFiles = [
    'host.json',
    'local.settings.json',
    'requirements.txt',
    'package.json',
    'tsconfig.json',
    '.funcignore',
  ];
  const functionFiles = relativeFiles.filter((f) => !projectFiles.includes(f) && !f.startsWith('.template.config'));

  let result = `# Function Template: ${template}\n\n`;

  // Template info
  if (description) {
    result += `**Description**: ${description.description}\n`;
    result += `**Category**: ${description.category}\n`;
    result += `**Use Case**: ${description.useCase}\n\n`;
  }

  // Binding configuration (if any)
  if (bindingConfig && Object.keys(bindingConfig.appSettings).length > 0) {
    result += `## Configuration Requirements\n\n`;

    result += `### Required App Settings\n`;
    result += `Add to \`local.settings.json\` under "Values":\n\n`;
    result += `\`\`\`json\n`;
    for (const [settingName, settingConfig] of Object.entries(bindingConfig.appSettings)) {
      const value = settingConfig.defaultLocalValue || '<your-connection-string>';
      result += `"${settingName}": "${value}"\n`;
    }
    result += `\`\`\`\n\n`;

    result += `| Setting | Description | Required |\n`;
    result += `|---------|-------------|----------|\n`;
    for (const [settingName, settingConfig] of Object.entries(bindingConfig.appSettings)) {
      result += `| \`${settingName}\` | ${settingConfig.description} | ${settingConfig.required ? 'Yes' : 'No'} |\n`;
    }
    result += `\n`;
  }

  if (bindingConfig?.extensionBundle) {
    result += `### Extension Bundle\n`;
    result += `Ensure \`host.json\` includes the extension bundle (should be present if you used \`get_project_template\`):\n`;
    result += `\`\`\`json\n"extensionBundle": {\n  "id": "Microsoft.Azure.Functions.ExtensionBundle",\n  "version": "${SUPPORTED_RUNTIMES.extensionBundle}"\n}\n\`\`\`\n\n`;
  }

  // Determine if we should apply runtime version replacement
  const shouldReplaceVersion = runtimeVersion && (language === 'java' || language === 'typescript');

  // Template parameters for languages that have them (only show if not already replaced)
  const projectTemplate = PROJECT_TEMPLATES[language];
  if (!shouldReplaceVersion && projectTemplate.parameters && projectTemplate.parameters.length > 0) {
    result += `## Template Parameters\n\n`;
    result += `**Important**: Files may contain placeholders that must be replaced before use.\n\n`;
    result += `| Placeholder | Description | Default | Valid Values |\n`;
    result += `|-------------|-------------|---------|--------------|\n`;
    for (const param of projectTemplate.parameters) {
      const validValues = param.validValues ? param.validValues.join(', ') : 'Any';
      result += `| \`{{${param.name}}}\` | ${param.description} | \`${param.defaultValue}\` | ${validValues} |\n`;
    }
    result += `\n`;
    result += `**How to replace**: Detect the user's installed runtime version or ask their preference, then replace all occurrences of \`{{paramName}}\` with the actual value.\n\n`;
  }

  // Function files
  result += `## Function Files\n\n`;

  let totalSize = 0;
  for (const filePath of functionFiles) {
    const fullPath = path.join(templateDir, filePath);

    try {
      const stat = await fs.lstat(fullPath);
      if (stat.isFile()) {
        if (stat.size > MAX_FILE_SIZE_BYTES) {
          result += `### \`${filePath}\`\n\n`;
          result += `*File too large (${(stat.size / 1024).toFixed(1)} KB)*\n\n`;
          continue;
        }

        let content = await fs.readFile(fullPath, 'utf8');
        // Apply runtime version replacement if provided
        if (shouldReplaceVersion) {
          content = replaceRuntimeVersion(content, language, runtimeVersion);
        }
        const ext = getFileExtension(filePath);
        const fileSection = `### \`${filePath}\`\n\n\`\`\`${ext}\n${content}\n\`\`\`\n\n`;

        if (totalSize + fileSection.length > MAX_RESPONSE_SIZE_BYTES) {
          result += `### \`${filePath}\`\n\n*Response size limit reached*\n\n`;
          break;
        }

        result += fileSection;
        totalSize += fileSection.length;
      }
    } catch {
      result += `### \`${filePath}\`\n\n*Error reading file*\n\n`;
    }
  }

  // Merge instructions for brownfield projects
  result += `## Merging with Existing Projects

Consume function files directly, update logic as per user prompt. For config files, merge as follows:
- **local.settings.json**: Add new "Values", keep existing
- **host.json**: Use template's extensionBundle; merge other settings
- **Dependencies**: Merge; prefer template versions on conflict, avoid duplicates
- **.funcignore**: Merge patterns, avoid duplicates

`;

  return createSuccessResult(result);
}
