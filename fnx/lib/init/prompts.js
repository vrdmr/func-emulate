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
 * Check if we can use raw mode (interactive terminal)
 */
function canUseRawMode() {
  return process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';
}

/**
 * Clean up stdin after raw mode usage to allow process to exit
 */
function cleanupStdin(stdin, listener) {
  stdin.setRawMode(false);
  stdin.removeListener('data', listener);
  stdin.pause();
}

/**
 * Prompt user to select from a list of options using arrow keys
 * Falls back to number input if raw mode is not available
 * @param {string} question - Question to display
 * @param {Array<{value: any, label: string}>} options - Available options
 * @returns {Promise<any>} Selected value
 */
async function selectPrompt(question, options) {
  // Fall back to number input if raw mode not available (CI, piped input)
  if (!canUseRawMode()) {
    return selectPromptNumbered(question, options);
  }

  return new Promise((resolve) => {
    // Find first selectable index
    let selectedIndex = options.findIndex(o => !o.disabled);
    if (selectedIndex === -1) selectedIndex = 0;
    
    const stdin = process.stdin;

    // Find next/prev selectable index (skipping disabled)
    const findNextSelectable = (from, direction) => {
      let idx = from;
      for (let i = 0; i < options.length; i++) {
        idx = (idx + direction + options.length) % options.length;
        if (!options[idx].disabled) return idx;
      }
      return from; // No selectable found, stay in place
    };

    // Track total lines rendered (options + hint)
    let totalLines = 0;

    // Render the menu
    const render = (isFirstRender = false) => {
      // Move cursor up to overwrite previous render (except first render)
      if (!isFirstRender && totalLines > 0) {
        process.stdout.write(`\x1b[${totalLines}A`);
      }

      let lines = 0;
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        if (opt.disabled) {
          // Show separator/disabled items without selection indicator
          process.stdout.write(`\x1b[2K  ${opt.label}\n`);
        } else {
          const prefix = i === selectedIndex ? success('❯') : ' ';
          const label = i === selectedIndex ? bold(opt.label) : opt.label;
          process.stdout.write(`\x1b[2K  ${prefix} ${label}\n`);
        }
        lines++;
      }

      // Show hint on first render, clear and rewrite on subsequent
      process.stdout.write(`\x1b[2K${dim('  ↑/↓ to move, Enter to select')}\n`);
      lines++;

      totalLines = lines;
    };

    // Show question and initial render
    console.log(bold(question));
    render(true);

    // Enable raw mode for keypress detection
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const onKeypress = (key) => {
      // Handle Ctrl+C
      if (key === '\x03') {
        cleanupStdin(stdin, onKeypress);
        console.log('\n');
        process.exit(0);
      }

      // Handle arrow keys (escape sequences)
      if (key === '\x1b[A' || key === 'k') {
        // Up arrow or k - find previous selectable
        selectedIndex = findNextSelectable(selectedIndex, -1);
        render();
      } else if (key === '\x1b[B' || key === 'j') {
        // Down arrow or j - find next selectable
        selectedIndex = findNextSelectable(selectedIndex, 1);
        render();
      } else if (key === '\r' || key === '\n') {
        // Enter - only if current option is selectable
        if (!options[selectedIndex].disabled) {
          cleanupStdin(stdin, onKeypress);
          process.stdout.write(`\x1b[2K`);
          console.log(success(`  ✓ ${options[selectedIndex].label}\n`));
          resolve(options[selectedIndex].value);
        }
      } else if (key >= '1' && key <= '9') {
        // Number keys - count only selectable options
        const num = parseInt(key, 10);
        const selectableOptions = options.filter(o => !o.disabled);
        if (num >= 1 && num <= selectableOptions.length) {
          // Find the actual index of the nth selectable option
          let count = 0;
          for (let i = 0; i < options.length; i++) {
            if (!options[i].disabled) {
              count++;
              if (count === num) {
                cleanupStdin(stdin, onKeypress);
                process.stdout.write(`\x1b[2K`);
                console.log(success(`  ✓ ${options[i].label}\n`));
                resolve(options[i].value);
                break;
              }
            }
          }
        }
      }
    };

    stdin.on('data', onKeypress);
  });
}

/**
 * Prompt with search capability (type to filter)
 * Used for large lists like templates where search helps navigation
 * @param {string} question - Question to display
 * @param {Array<{value: any, label: string, searchText?: string}>} allOptions - All options
 * @returns {Promise<any>} Selected value
 */
async function selectPromptWithSearch(question, allOptions) {
  // Fall back to number input if raw mode not available
  if (!canUseRawMode()) {
    return selectPromptNumbered(question, allOptions);
  }

  const MIN_SEARCH_LENGTH = 3;

  return new Promise((resolve) => {
    let searchQuery = '';
    let displayOptions = allOptions;
    let selectedIndex = displayOptions.findIndex(o => !o.disabled);
    if (selectedIndex === -1) selectedIndex = 0;

    const stdin = process.stdin;

    // Filter options based on search query
    const filterOptions = () => {
      if (searchQuery.length >= MIN_SEARCH_LENGTH) {
        const query = searchQuery.toLowerCase();
        displayOptions = allOptions.filter(opt => {
          if (opt.disabled) return false;
          const label = (opt.label || '').toLowerCase();
          const searchText = (opt.searchText || '').toLowerCase();
          return label.includes(query) || searchText.includes(query);
        });
      } else {
        displayOptions = allOptions;
      }
      // Reset selection to first visible item
      selectedIndex = displayOptions.findIndex(o => !o.disabled);
      if (selectedIndex === -1) selectedIndex = 0;
    };

    // Find next/prev selectable index
    const findNextSelectable = (from, direction) => {
      let idx = from;
      for (let i = 0; i < displayOptions.length; i++) {
        idx = (idx + direction + displayOptions.length) % displayOptions.length;
        if (!displayOptions[idx].disabled) return idx;
      }
      return from;
    };

    // Calculate the height of the display area
    let lastRenderHeight = 0;

    // Render the menu
    const render = (isFirstRender = false) => {
      // Clear previous render
      if (!isFirstRender && lastRenderHeight > 0) {
        process.stdout.write(`\x1b[${lastRenderHeight}A`);
        for (let i = 0; i < lastRenderHeight; i++) {
          process.stdout.write(`\x1b[2K\n`);
        }
        process.stdout.write(`\x1b[${lastRenderHeight}A`);
      }

      // Show search query if typing
      let lines = 0;
      if (searchQuery.length > 0) {
        process.stdout.write(`\x1b[2K  ${dim('Filter:')} ${searchQuery}\n`);
        lines++;
      }

      // Show filtered results
      if (displayOptions.length === 0) {
        process.stdout.write(`\x1b[2K  ${dim('No matches found')}\n`);
        lines++;
      } else {
        for (let i = 0; i < displayOptions.length; i++) {
          const opt = displayOptions[i];
          if (opt.disabled) {
            process.stdout.write(`\x1b[2K  ${opt.label}\n`);
          } else {
            const prefix = i === selectedIndex ? success('❯') : ' ';
            const label = i === selectedIndex ? bold(opt.label) : opt.label;
            process.stdout.write(`\x1b[2K  ${prefix} ${label}\n`);
          }
          lines++;
        }
      }

      // Show hint as part of render
      const hintText = '↑/↓ to move, type to filter, Esc to clear, Enter to select';
      process.stdout.write(`\x1b[2K${dim('  ' + hintText)}\n`);
      lines++;

      lastRenderHeight = lines;
    };

    // Show question and initial render
    console.log(bold(question));
    render(true);

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const onKeypress = (key) => {
      // Ctrl+C
      if (key === '\x03') {
        cleanupStdin(stdin, onKeypress);
        console.log('\n');
        process.exit(0);
      }

      // Escape - clear search
      if (key === '\x1b' && key.length === 1) {
        searchQuery = '';
        filterOptions();
        render();
        return;
      }

      // Up arrow (j/k only when not searching - they're valid search chars)
      if (key === '\x1b[A' || (searchQuery.length === 0 && key === 'k')) {
        selectedIndex = findNextSelectable(selectedIndex, -1);
        render();
        return;
      }

      // Down arrow (j/k only when not searching - they're valid search chars)
      if (key === '\x1b[B' || (searchQuery.length === 0 && key === 'j')) {
        selectedIndex = findNextSelectable(selectedIndex, 1);
        render();
        return;
      }

      // Enter
      if (key === '\r' || key === '\n') {
        if (displayOptions.length > 0 && !displayOptions[selectedIndex].disabled) {
          cleanupStdin(stdin, onKeypress);
          process.stdout.write(`\x1b[2K`);
          console.log(success(`  ✓ ${displayOptions[selectedIndex].label}\n`));
          resolve(displayOptions[selectedIndex].value);
        }
        return;
      }

      // Backspace - remove last char from search
      if (key === '\x7f' || key === '\x08') {
        if (searchQuery.length > 0) {
          searchQuery = searchQuery.slice(0, -1);
          filterOptions();
          render();
        }
        return;
      }

      // Number keys 1-9 for quick selection (only when not searching)
      if (searchQuery.length === 0 && key >= '1' && key <= '9') {
        const num = parseInt(key, 10);
        const selectableOptions = displayOptions.filter(o => !o.disabled);
        if (num >= 1 && num <= selectableOptions.length) {
          let count = 0;
          for (let i = 0; i < displayOptions.length; i++) {
            if (!displayOptions[i].disabled) {
              count++;
              if (count === num) {
                cleanupStdin(stdin, onKeypress);
                process.stdout.write(`\x1b[2K`);
                console.log(success(`  ✓ ${displayOptions[i].label}\n`));
                resolve(displayOptions[i].value);
                return;
              }
            }
          }
        }
      }

      // Printable characters - add to search
      if (key.length === 1 && key >= ' ' && key <= '~') {
        searchQuery += key;
        filterOptions();
        render();
      }
    };

    stdin.on('data', onKeypress);
  });
}

/**
 * Fallback: Prompt user to select using number input
 * Used when raw mode is not available (CI, piped input)
 */
async function selectPromptNumbered(question, options) {
  const rl = createPrompt();

  rl.on('error', () => {
    rl.close();
    process.exit(1);
  });

  // Filter out disabled options and build mapping
  const selectableOptions = [];
  const indexMap = {}; // maps displayed number -> original index
  
  console.log(bold(question));
  let displayNum = 0;
  options.forEach((opt, originalIdx) => {
    if (opt.disabled) {
      // Show separator without number
      console.log(`  ${opt.label}`);
    } else {
      displayNum++;
      selectableOptions.push(opt);
      indexMap[displayNum] = originalIdx;
      console.log(`  ${dim(`[${displayNum}]`)} ${opt.label}`);
    }
  });

  return new Promise((resolve) => {
    const ask = () => {
      rl.question(`\n  ${dim('Enter number (1-' + selectableOptions.length + '):')} `, (answer) => {
        const num = parseInt(answer.trim(), 10);
        if (num >= 1 && num <= selectableOptions.length) {
          rl.close();
          console.log(success(`  ✓ ${selectableOptions[num - 1].label}\n`));
          resolve(selectableOptions[num - 1].value);
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
    'dotnet-isolated': '.NET Isolated (C#)',
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
 * Prompt for template selection (triggers, input bindings, output bindings)
 * Shows top 9 templates with "More..." option for additional templates.
 * Supports type-to-filter search (3+ characters).
 * @param {Array} templates - Filtered templates for the selected runtime
 * @param {Object} resourceOrderByPriority - Resource order for each priority bucket
 * @returns {Promise<Object>} Selected template
 */
export async function promptTrigger(templates, resourceOrderByPriority) {
  const MAX_INITIAL_DISPLAY = 9;
  
  // Sort all templates by priority bucket, then resource order within bucket
  const sorted = sortTemplatesByPriorityAndResource(templates, resourceOrderByPriority);
  
  // Take top 9 for initial display
  const displayTemplates = sorted.slice(0, MAX_INITIAL_DISPLAY);
  const hasMore = sorted.length > MAX_INITIAL_DISPLAY;
  
  // Build options list with searchText for filtering
  const options = displayTemplates.map(template => ({
    value: template,
    label: formatTemplateLabel(template),
    searchText: `${template.displayName || ''} ${template.id || ''} ${template.category || ''} ${template.resource || ''} ${template.bindingType || ''}`,
  }));

  // Add separator and "More..." option if there are additional templates
  if (hasMore) {
    options.push({
      value: '__SEPARATOR__',
      label: dim('────────────────────────────'),
      disabled: true,
    });
    options.push({
      value: '__MORE__',
      label: `${bold('More templates...')} ${dim(`(${sorted.length - MAX_INITIAL_DISPLAY} more)`)}`,
      searchText: 'more show all templates',
    });
  }

  if (options.length === 0) {
    console.log(dim('  No templates found for this runtime.\n'));
    return null;
  }

  // Use search-enabled prompt from the start
  const selected = await selectPromptWithSearch('Select a template:', options);
  
  // If "More..." selected, show full list
  if (selected === '__MORE__') {
    return promptTriggerAll(sorted, resourceOrderByPriority);
  }
  
  return selected;
}

/**
 * Sort templates by priority bucket first, then by resource order within each bucket.
 * 
 * Sort order:
 * 1. Priority bucket (P0 starters > P1 standard > P2 advanced > P3, etc.)
 * 2. Resource order within bucket (defined in resourceOrderByPriority)
 * 3. Templates not in the resource order go at the end of their bucket
 * 4. Alphabetical by display name within same resource
 * 
 * @param {Array} templates - Templates to sort
 * @param {Object} resourceOrderByPriority - Map of priority number to resource order array
 */
function sortTemplatesByPriorityAndResource(templates, resourceOrderByPriority) {
  return [...templates].sort((a, b) => {
    // 1. Sort by priority bucket (P0 first, then P1, P2, etc.)
    const aPriority = a.priority ?? 999;
    const bPriority = b.priority ?? 999;
    
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    
    // 2. Within same priority bucket: sort by resource order
    const resourceOrder = resourceOrderByPriority[aPriority] || [];
    const aResource = (a.resource || '').toLowerCase();
    const bResource = (b.resource || '').toLowerCase();
    
    const aResourceIdx = resourceOrder.indexOf(aResource);
    const bResourceIdx = resourceOrder.indexOf(bResource);
    
    // Resources in the defined order come first, others go to end
    const aResourcePriority = aResourceIdx === -1 ? 999 : aResourceIdx;
    const bResourcePriority = bResourceIdx === -1 ? 999 : bResourceIdx;
    
    if (aResourcePriority !== bResourcePriority) {
      return aResourcePriority - bResourcePriority;
    }
    
    // 3. If both not in resource order, sort alphabetically by resource
    if (aResourcePriority === 999 && bResourcePriority === 999) {
      const resourceCmp = aResource.localeCompare(bResource);
      if (resourceCmp !== 0) return resourceCmp;
    }
    
    // 4. Alphabetical by display name within same resource
    return (a.displayName || a.id).localeCompare(b.displayName || b.id);
  });
}

/**
 * Format template label for display
 */
function formatTemplateLabel(template) {
  const name = template.displayName || template.id;
  const category = template.category || template.resource || 'other';
  const bindingType = template.bindingType || '';
  
  // Show binding type for non-triggers
  if (bindingType && bindingType !== 'trigger') {
    return `${funcName(name)} ${dim(`(${category} ${bindingType})`)}`;
  }
  return `${funcName(name)} ${dim(`(${category})`)}`;
}

/**
 * Show all templates when "More..." is selected
 * Uses search-enabled prompt for easy filtering
 * @param {Array} templates - All templates (pre-sorted)
 * @param {Object} resourceOrderByPriority - Resource order for each priority bucket (unused, templates pre-sorted)
 * @returns {Promise<object>} Selected template
 */
async function promptTriggerAll(templates, resourceOrderByPriority) {
  // Templates are already pre-sorted, just use them directly
  const options = templates.map(template => ({
    value: template,
    label: formatTemplateLabel(template),
    // Add searchText for improved search matching
    searchText: `${template.displayName || ''} ${template.id || ''} ${template.resource || ''} ${template.bindingType || ''} ${(template.categories || []).join(' ')}`,
  }));

  console.log(dim(`\n  Showing all ${options.length} templates (type to filter):\n`));
  return selectPromptWithSearch('Select a template:', options);
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
