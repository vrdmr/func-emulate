/**
 * Interactive prompts for fnx init
 *
 * Uses Node.js readline for cross-platform terminal interaction.
 * No external dependencies.
 */

import { createInterface } from 'node:readline';
import { success, dim, bold, funcName } from '../colors.js';

/**
 * Create a readline interface for prompts
 */
function createPrompt() {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt user to select from a list of options
 * @param {string} question - Question to display
 * @param {Array<{value: string, label: string}>} options - Available options
 * @returns {Promise<string>} Selected value
 */
async function selectPrompt(question, options) {
  const rl = createPrompt();

  // Handle readline errors (e.g., stdin closed)
  rl.on('error', () => {
    rl.close();
    process.exit(1);
  });

  console.log(bold(question));
  options.forEach((opt, i) => {
    console.log(`  ${dim(`[${i + 1}]`)} ${opt.label}`);
  });

  return new Promise((resolve) => {
    const ask = () => {
      rl.question(`\n  ${dim('Enter number (1-' + options.length + '):')} `, (answer) => {
        const num = parseInt(answer.trim(), 10);
        if (num >= 1 && num <= options.length) {
          rl.close();
          console.log(success(`  ✓ ${options[num - 1].label}\n`));
          resolve(options[num - 1].value);
        } else {
          console.log(dim('  Invalid selection, try again.'));
          ask();
        }
      });
    };
    ask();
  });
}

/**
 * Prompt for text input
 * @param {string} question - Question to display
 * @param {string} defaultValue - Default value if empty
 * @returns {Promise<string>} User input
 */
async function textPrompt(question, defaultValue = '') {
  const rl = createPrompt();
  const defaultHint = defaultValue ? ` ${dim(`(default: ${defaultValue})`)}` : '';

  // Handle readline errors
  rl.on('error', () => {
    rl.close();
    process.exit(1);
  });

  return new Promise((resolve) => {
    rl.question(`${bold(question)}${defaultHint}: `, (answer) => {
      rl.close();
      const value = answer.trim() || defaultValue;
      console.log(success(`  ✓ ${value}\n`));
      resolve(value);
    });
  });
}

/**
 * Prompt for runtime selection
 * @param {Object} manifest - Template manifest
 * @returns {Promise<string>} Selected runtime (normalized)
 */
export async function promptRuntime(manifest) {
  // Get unique languages from manifest (manifest uses 'language' field)
  const languages = new Set();
  for (const template of manifest.templates) {
    if (template.language) languages.add(template.language);
  }

  // Build options with display names and template counts
  const languageCounts = {};
  for (const template of manifest.templates) {
    if (!template.language) continue;
    languageCounts[template.language] = (languageCounts[template.language] || 0) + 1;
  }

  // Map manifest language names to internal runtime identifiers
  // Manifest uses: CSharp, Java, JavaScript, PowerShell, Python, TypeScript, ARM, Bicep, Terraform
  const languageToRuntime = {
    'Python': 'python',
    'JavaScript': 'node',
    'TypeScript': 'node',  // Node.js covers both JS/TS
    'CSharp': 'dotnet-isolated',
    'Java': 'java',
    'PowerShell': 'powershell',
  };

  const runtimeDisplayMap = {
    'python': 'Python',
    'node': 'Node.js (TypeScript/JavaScript)',
    'dotnet-isolated': '.NET (C#)',
    'java': 'Java',
    'powershell': 'PowerShell',
  };

  // Filter to supported runtimes and aggregate counts
  const runtimeCounts = {};
  for (const [lang, count] of Object.entries(languageCounts)) {
    const runtime = languageToRuntime[lang];
    if (runtime) {
      runtimeCounts[runtime] = (runtimeCounts[runtime] || 0) + count;
    }
  }

  // Prioritize common runtimes
  const priorityOrder = ['python', 'node', 'dotnet-isolated', 'java', 'powershell'];
  const sortedRuntimes = Object.keys(runtimeCounts).sort((a, b) => {
    const aIdx = priorityOrder.indexOf(a);
    const bIdx = priorityOrder.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  const options = sortedRuntimes.map(rt => ({
    value: rt,
    label: runtimeDisplayMap[rt] || rt,
  }));

  return selectPrompt('Select a runtime:', options);
}

/**
 * Prompt for Node.js language variant (TypeScript or JavaScript)
 * @returns {Promise<string>} 'typescript' or 'javascript'
 */
export async function promptNodeLanguage() {
  const options = [
    { value: 'typescript', label: `TypeScript ${dim('(recommended)')}` },
    { value: 'javascript', label: 'JavaScript' },
  ];

  return selectPrompt('Select Node.js language:', options);
}

/**
 * Prompt for trigger selection
 * @param {Array} templates - Filtered templates for the selected runtime
 * @param {string[]} priorityOrder - Resource types in priority order
 * @returns {Promise<Object>} Selected template
 */
export async function promptTrigger(templates, priorityOrder) {
  // Filter to only priority 0 templates for initial display
  const p0Templates = templates.filter(t => t.priority === 0 || t.priority === undefined);
  const allTemplates = templates;
  
  // Group P0 templates by resource type (manifest uses 'resource' field for trigger type)
  const resourceGroups = {};
  for (const template of p0Templates) {
    // Only include triggers, not input/output bindings
    if (template.bindingType !== 'trigger') continue;

    const resource = template.resource || 'other';
    if (!resourceGroups[resource]) resourceGroups[resource] = [];
    resourceGroups[resource].push(template);
  }

  // Sort resources by priority
  const sortedResources = Object.keys(resourceGroups).sort((a, b) => {
    const aIdx = priorityOrder.indexOf(a.toLowerCase());
    const bIdx = priorityOrder.indexOf(b.toLowerCase());
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  // Build flat list of P0 templates, grouped by resource
  const options = [];
  for (const resource of sortedResources) {
    const group = resourceGroups[resource];
    // Sort templates within group alphabetically
    group.sort((a, b) => (a.displayName || a.id).localeCompare(b.displayName || b.id));
    for (const template of group) {
      options.push({
        value: template,
        label: `${funcName(template.displayName || template.id)} ${dim(`(${resource})`)}`,
      });
    }
  }

  // Count all trigger templates for "More..." option
  const allTriggers = allTemplates.filter(t => t.bindingType === 'trigger');
  const hasMore = allTriggers.length > options.length;

  // Add "More..." option if there are additional templates
  if (hasMore) {
    options.push({
      value: '__MORE__',
      label: `${bold('More...')} ${dim(`— Show all ${allTriggers.length} templates`)}`,
    });
  }

  if (options.length === 0) {
    console.log(dim('  No trigger templates found for this runtime.\n'));
    return null;
  }

  const selected = await selectPrompt('Select a template:', options);
  
  // If "More..." selected, show full list
  if (selected === '__MORE__') {
    return promptTriggerAll(allTriggers, priorityOrder);
  }
  
  return selected;
}

/**
 * Show all templates when "More..." is selected
 * @param {Array} templates - All trigger templates
 * @param {string[]} priorityOrder - Resource priority order (unused, kept for API compat)
 * @returns {Promise<object>} Selected template
 */
async function promptTriggerAll(templates, priorityOrder) {
  // Sort by priority only, keeping manifest order within each priority level
  const sorted = [...templates].sort((a, b) => {
    const pA = a.priority ?? 0;
    const pB = b.priority ?? 0;
    return pA - pB;
  });

  const options = sorted.map(template => ({
    value: template,
    label: `${funcName(template.displayName || template.id)} ${dim(`(${template.resource || 'other'})`)}`,
  }));

  console.log(dim(`\n  Showing all ${options.length} templates:\n`));
  return selectPrompt('Select a template:', options);
}

/**
 * Prompt for project name
 * @param {string} targetDir - Target directory path
 * @returns {Promise<string>} Project name
 */
export async function promptProjectName(targetDir) {
  const { basename } = await import('node:path');
  const defaultName = basename(targetDir) || 'my-function-app';
  return textPrompt('Project name', defaultName);
}

/**
 * Prompt for SKU selection
 * @returns {Promise<string>} Selected SKU
 */
export async function promptSku() {
  const options = [
    { value: 'flex', label: `Flex Consumption ${dim('(recommended, serverless)')}` },
    { value: 'premium', label: `Premium ${dim('(always-warm, VNet integration)')}` },
    { value: 'dedicated', label: `Dedicated ${dim('(App Service Plan)')}` },
  ];

  return selectPrompt('Select target SKU:', options);
}
