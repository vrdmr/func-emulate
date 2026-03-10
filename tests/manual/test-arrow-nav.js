#!/usr/bin/env node
/**
 * Manual test for arrow key navigation and search in prompts
 * 
 * Run with: node tests/manual/test-arrow-nav.js
 * 
 * Tests:
 * 1. Arrow keys (up/down) navigation
 * 2. Vim keys (j/k) navigation  
 * 3. Number keys (1-9) quick selection
 * 4. Enter key selection
 * 5. Ctrl+C exit
 * 6. Wrap-around navigation
 * 7. Disabled options (separator) skipping
 * 8. Pagination (9 items + More...)
 * 9. Type-to-filter search (3+ chars)
 * 10. Backspace to edit search
 * 11. Escape to clear search
 */

import { createInterface } from 'node:readline';

// Mock colors (simplified)
const success = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[90m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

function canUseRawMode() {
  return process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';
}

async function selectPrompt(question, options) {
  if (!canUseRawMode()) {
    console.log('Raw mode not available - would fall back to numbered input');
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
      return from;
    };

    const render = () => {
      if (render.rendered) {
        process.stdout.write(`\x1b[${options.length}A`);
      }
      render.rendered = true;

      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        if (opt.disabled) {
          process.stdout.write(`\x1b[2K  ${opt.label}\n`);
        } else {
          const prefix = i === selectedIndex ? success('❯') : ' ';
          const label = i === selectedIndex ? bold(opt.label) : opt.label;
          process.stdout.write(`\x1b[2K  ${prefix} ${label}\n`);
        }
      }
    };

    console.log(bold(question));
    render();
    console.log(dim('\n  ↑/↓ to move, j/k vim keys, 1-9 quick select, Enter to confirm'));
    process.stdout.write(`\x1b[1A\x1b[2K`);

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const onKeypress = (key) => {
      if (key === '\x03') {
        stdin.setRawMode(false);
        stdin.removeListener('data', onKeypress);
        console.log('\nCtrl+C - Exiting');
        process.exit(0);
      }

      if (key === '\x1b[A' || key === 'k') {
        selectedIndex = findNextSelectable(selectedIndex, -1);
        render();
      } else if (key === '\x1b[B' || key === 'j') {
        selectedIndex = findNextSelectable(selectedIndex, 1);
        render();
      } else if (key === '\r' || key === '\n') {
        if (!options[selectedIndex].disabled) {
          stdin.setRawMode(false);
          stdin.removeListener('data', onKeypress);
          process.stdout.write(`\x1b[2K`);
          console.log(success(`  ✓ ${options[selectedIndex].label}\n`));
          resolve(options[selectedIndex].value);
        }
      } else if (key >= '1' && key <= '9') {
        const num = parseInt(key, 10);
        const selectableOptions = options.filter(o => !o.disabled);
        if (num >= 1 && num <= selectableOptions.length) {
          let count = 0;
          for (let i = 0; i < options.length; i++) {
            if (!options[i].disabled) {
              count++;
              if (count === num) {
                stdin.setRawMode(false);
                stdin.removeListener('data', onKeypress);
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

async function selectPromptWithSearch(question, allOptions) {
  if (!canUseRawMode()) {
    console.log('Raw mode not available');
    return selectPromptNumbered(question, allOptions);
  }

  const MIN_SEARCH_LENGTH = 3;

  return new Promise((resolve) => {
    let searchQuery = '';
    let filteredOptions = allOptions.filter(o => !o.disabled);
    let displayOptions = allOptions;
    let selectedIndex = displayOptions.findIndex(o => !o.disabled);
    if (selectedIndex === -1) selectedIndex = 0;

    const stdin = process.stdin;

    const filterOptions = () => {
      if (searchQuery.length >= MIN_SEARCH_LENGTH) {
        const query = searchQuery.toLowerCase();
        filteredOptions = allOptions.filter(opt => {
          if (opt.disabled) return false;
          const label = (opt.label || '').toLowerCase();
          const searchText = (opt.searchText || '').toLowerCase();
          return label.includes(query) || searchText.includes(query);
        });
        displayOptions = filteredOptions;
      } else {
        filteredOptions = allOptions.filter(o => !o.disabled);
        displayOptions = allOptions;
      }
      selectedIndex = displayOptions.findIndex(o => !o.disabled);
      if (selectedIndex === -1) selectedIndex = 0;
    };

    const findNextSelectable = (from, direction) => {
      let idx = from;
      for (let i = 0; i < displayOptions.length; i++) {
        idx = (idx + direction + displayOptions.length) % displayOptions.length;
        if (!displayOptions[idx].disabled) return idx;
      }
      return from;
    };

    let lastRenderHeight = 0;

    const render = () => {
      if (lastRenderHeight > 0) {
        process.stdout.write(`\x1b[${lastRenderHeight}A`);
        for (let i = 0; i < lastRenderHeight; i++) {
          process.stdout.write(`\x1b[2K\n`);
        }
        process.stdout.write(`\x1b[${lastRenderHeight}A`);
      }

      let lines = 0;
      if (searchQuery.length > 0) {
        process.stdout.write(`\x1b[2K  ${dim('Filter:')} ${searchQuery}\n`);
        lines++;
      }

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

      lastRenderHeight = lines;
    };

    console.log(bold(question));
    render();
    console.log(dim('\n  ↑/↓ to move, type to filter (3+ chars), Esc to clear, Enter to select'));
    process.stdout.write(`\x1b[1A\x1b[2K`);

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const onKeypress = (key) => {
      if (key === '\x03') {
        stdin.setRawMode(false);
        stdin.removeListener('data', onKeypress);
        console.log('\nCtrl+C - Exiting');
        process.exit(0);
      }

      // Escape - clear search
      if (key === '\x1b' && key.length === 1) {
        searchQuery = '';
        filterOptions();
        render();
        return;
      }

      if (key === '\x1b[A' || key === 'k') {
        selectedIndex = findNextSelectable(selectedIndex, -1);
        render();
        return;
      }

      if (key === '\x1b[B' || key === 'j') {
        selectedIndex = findNextSelectable(selectedIndex, 1);
        render();
        return;
      }

      if (key === '\r' || key === '\n') {
        if (displayOptions.length > 0 && !displayOptions[selectedIndex].disabled) {
          stdin.setRawMode(false);
          stdin.removeListener('data', onKeypress);
          process.stdout.write(`\x1b[2K`);
          console.log(success(`  ✓ ${displayOptions[selectedIndex].label}\n`));
          resolve(displayOptions[selectedIndex].value);
        }
        return;
      }

      // Backspace
      if (key === '\x7f' || key === '\x08') {
        if (searchQuery.length > 0) {
          searchQuery = searchQuery.slice(0, -1);
          filterOptions();
          render();
        }
        return;
      }

      // Number keys (only when not searching)
      if (searchQuery.length === 0 && key >= '1' && key <= '9') {
        const num = parseInt(key, 10);
        const selectableOptions = displayOptions.filter(o => !o.disabled);
        if (num >= 1 && num <= selectableOptions.length) {
          let count = 0;
          for (let i = 0; i < displayOptions.length; i++) {
            if (!displayOptions[i].disabled) {
              count++;
              if (count === num) {
                stdin.setRawMode(false);
                stdin.removeListener('data', onKeypress);
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

async function selectPromptNumbered(question, options) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const selectableOptions = [];
  console.log(bold(question));
  let displayNum = 0;
  options.forEach((opt) => {
    if (opt.disabled) {
      console.log(`  ${opt.label}`);
    } else {
      displayNum++;
      selectableOptions.push(opt);
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

// Run test
async function main() {
  console.log('=== Arrow Key Navigation Test ===\n');
  console.log('Test the following:');
  console.log('  1. Press ↓ (down arrow) to move selection down');
  console.log('  2. Press ↑ (up arrow) to move selection up');
  console.log('  3. Press j/k (vim keys) to move down/up');
  console.log('  4. Press 1-5 to quick-select by number');
  console.log('  5. Press Enter to confirm selection');
  console.log('  6. Press Ctrl+C to exit');
  console.log('  7. Test wrap-around: at first item, press ↑ to go to last\n');

  const runtimes = [
    { value: 'node', label: 'Node.js (JavaScript/TypeScript)' },
    { value: 'python', label: 'Python' },
    { value: 'dotnet-isolated', label: '.NET Isolated (C#)' },
    { value: 'java', label: 'Java' },
    { value: 'powershell', label: 'PowerShell' },
  ];

  const result = await selectPrompt('Select a runtime:', runtimes);
  console.log(`You selected: ${result}`);

  // Test with search capability
  console.log('\n--- Search Test: Type to filter templates ---\n');
  console.log('Try typing "http", "timer", "blob", or "queue" to filter.');
  console.log('Backspace to edit, Escape to clear filter.\n');
  
  const templates = [
    { value: 'http', label: 'HTTP Trigger', searchText: 'http api web' },
    { value: 'http-openapi', label: 'HTTP Trigger with OpenAPI', searchText: 'http api swagger' },
    { value: 'timer', label: 'Timer Trigger', searchText: 'timer cron schedule' },
    { value: 'blob', label: 'Blob Trigger', searchText: 'blob storage' },
    { value: 'blob-input', label: 'Blob Input Binding', searchText: 'blob storage input' },
    { value: 'blob-output', label: 'Blob Output Binding', searchText: 'blob storage output' },
    { value: 'queue', label: 'Queue Trigger', searchText: 'queue storage' },
    { value: 'queue-output', label: 'Queue Output Binding', searchText: 'queue storage output' },
    { value: 'cosmosdb', label: 'CosmosDB Trigger', searchText: 'cosmos database' },
    { value: 'servicebus', label: 'Service Bus Queue Trigger', searchText: 'servicebus message' },
    { value: 'eventhub', label: 'Event Hub Trigger', searchText: 'eventhub streaming' },
    { value: 'eventgrid', label: 'Event Grid Trigger', searchText: 'eventgrid events' },
    { value: 'durable-orchestrator', label: 'Durable Functions Orchestrator', searchText: 'durable workflow' },
    { value: 'durable-activity', label: 'Durable Functions Activity', searchText: 'durable activity' },
    { value: 'durable-entity', label: 'Durable Functions Entity', searchText: 'durable entity' },
  ];

  const template = await selectPromptWithSearch('Select a template (type to filter):', templates);
  console.log(`You selected: ${template}`);

  console.log('\n✅ All tests complete!');
}

main().catch(console.error);
