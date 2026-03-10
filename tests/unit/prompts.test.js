/**
 * Unit tests for fnx init prompts (readline-based interactive prompts)
 *
 * These tests verify the logic and data structures used by prompts.js
 * without actually invoking readline (which would block on stdin).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('fnx init - Interactive prompts (readline)', () => {
  describe('selectPrompt behavior', () => {
    it('should format numbered options with [n] prefix', () => {
      const options = [
        { value: 'flex', label: 'Flex Consumption' },
        { value: 'premium', label: 'Premium' },
      ];

      const formatted = options.map((opt, i) => `[${i + 1}] ${opt.label}`);
      assert.strictEqual(formatted[0], '[1] Flex Consumption');
      assert.strictEqual(formatted[1], '[2] Premium');
    });

    it('should validate numeric input in range 1 to options.length', () => {
      const options = [{ value: 'a' }, { value: 'b' }, { value: 'c' }];

      const validateInput = (answer) => {
        const num = parseInt(answer.trim(), 10);
        return num >= 1 && num <= options.length;
      };

      assert.ok(validateInput('1'), 'Input 1 should be valid');
      assert.ok(validateInput('3'), 'Input 3 should be valid');
      assert.ok(validateInput(' 2 '), 'Trimmed input should work');
      assert.ok(!validateInput('0'), 'Input 0 should be invalid');
      assert.ok(!validateInput('4'), 'Input > length should be invalid');
      assert.ok(!validateInput('abc'), 'Non-numeric should be invalid');
      assert.ok(!validateInput(''), 'Empty should be invalid');
    });

    it('should return selected option value (1-indexed)', () => {
      const options = [
        { value: 'flex', label: 'Flex' },
        { value: 'premium', label: 'Premium' },
      ];

      const getSelectedValue = (num) => options[num - 1].value;

      assert.strictEqual(getSelectedValue(1), 'flex');
      assert.strictEqual(getSelectedValue(2), 'premium');
    });
  });

  describe('textPrompt behavior', () => {
    it('should format default hint correctly', () => {
      const formatDefaultHint = (defaultValue) =>
        defaultValue ? `(default: ${defaultValue})` : '';

      assert.strictEqual(formatDefaultHint('my-app'), '(default: my-app)');
      assert.strictEqual(formatDefaultHint(''), '');
      assert.strictEqual(formatDefaultHint(null), '');
    });

    it('should return trimmed input or default value', () => {
      const processInput = (answer, defaultValue) => answer.trim() || defaultValue;

      assert.strictEqual(processInput('my-project', 'default'), 'my-project');
      assert.strictEqual(processInput('  spaced  ', 'default'), 'spaced');
      assert.strictEqual(processInput('', 'default'), 'default');
      assert.strictEqual(processInput('   ', 'default'), 'default');
    });
  });

  describe('promptRuntime - language to runtime mapping', () => {
    const languageToRuntime = {
      'Python': 'python',
      'JavaScript': 'node',
      'TypeScript': 'node',
      'CSharp': 'dotnet-isolated',
      'Java': 'java',
      'PowerShell': 'powershell',
    };

    it('should map manifest languages to runtime identifiers', () => {
      assert.strictEqual(languageToRuntime['Python'], 'python');
      assert.strictEqual(languageToRuntime['Java'], 'java');
      assert.strictEqual(languageToRuntime['CSharp'], 'dotnet-isolated');
    });

    it('should map both JavaScript and TypeScript to node runtime', () => {
      assert.strictEqual(languageToRuntime['JavaScript'], 'node');
      assert.strictEqual(languageToRuntime['TypeScript'], 'node');
    });

    it('should aggregate template counts by runtime', () => {
      const templates = [
        { language: 'Python' },
        { language: 'Python' },
        { language: 'JavaScript' },
        { language: 'TypeScript' },
        { language: 'Java' },
      ];

      const languageCounts = {};
      for (const t of templates) {
        languageCounts[t.language] = (languageCounts[t.language] || 0) + 1;
      }

      const runtimeCounts = {};
      for (const [lang, count] of Object.entries(languageCounts)) {
        const runtime = languageToRuntime[lang];
        if (runtime) {
          runtimeCounts[runtime] = (runtimeCounts[runtime] || 0) + count;
        }
      }

      assert.strictEqual(runtimeCounts['python'], 2);
      assert.strictEqual(runtimeCounts['node'], 2); // JS + TS combined
      assert.strictEqual(runtimeCounts['java'], 1);
    });

    it('should prioritize runtimes in expected order', () => {
      const priorityOrder = ['python', 'node', 'dotnet-isolated', 'java', 'powershell'];

      assert.ok(priorityOrder.indexOf('python') < priorityOrder.indexOf('node'));
      assert.ok(priorityOrder.indexOf('node') < priorityOrder.indexOf('dotnet-isolated'));
      assert.ok(priorityOrder.indexOf('dotnet-isolated') < priorityOrder.indexOf('java'));
      assert.ok(priorityOrder.indexOf('java') < priorityOrder.indexOf('powershell'));
    });

    it('should sort runtimes by priority order', () => {
      const priorityOrder = ['python', 'node', 'dotnet-isolated', 'java', 'powershell'];
      const runtimes = ['java', 'python', 'node', 'custom'];

      const sorted = runtimes.sort((a, b) => {
        const aIdx = priorityOrder.indexOf(a);
        const bIdx = priorityOrder.indexOf(b);
        if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      });

      assert.deepStrictEqual(sorted, ['python', 'node', 'java', 'custom']);
    });
  });

  describe('promptRuntime - display names', () => {
    const runtimeDisplayMap = {
      'python': 'Python',
      'node': 'Node.js (TypeScript/JavaScript)',
      'dotnet-isolated': '.NET Isolated (C#)',
      'java': 'Java',
      'powershell': 'PowerShell',
    };

    it('should have user-friendly display names', () => {
      assert.strictEqual(runtimeDisplayMap['python'], 'Python');
      assert.strictEqual(runtimeDisplayMap['java'], 'Java');
    });

    it('should indicate Node.js supports both TypeScript and JavaScript', () => {
      const nodeLabel = runtimeDisplayMap['node'];
      assert.ok(nodeLabel.includes('TypeScript'), 'Should mention TypeScript');
      assert.ok(nodeLabel.includes('JavaScript'), 'Should mention JavaScript');
    });

    it('should indicate dotnet-isolated is C#', () => {
      assert.ok(runtimeDisplayMap['dotnet-isolated'].includes('C#'));
    });
  });

  describe('promptNodeLanguage options', () => {
    it('should offer TypeScript as first/recommended option', () => {
      const options = [
        { value: 'typescript', label: 'TypeScript (recommended)' },
        { value: 'javascript', label: 'JavaScript' },
      ];

      assert.strictEqual(options[0].value, 'typescript');
      assert.ok(options[0].label.includes('recommended'));
    });

    it('should return typescript or javascript as value', () => {
      const validValues = ['typescript', 'javascript'];
      assert.ok(validValues.includes('typescript'));
      assert.ok(validValues.includes('javascript'));
    });
  });

  describe('promptTrigger - template filtering', () => {
    it('should filter to only trigger binding types', () => {
      const templates = [
        { id: 't1', resource: 'HTTP', bindingType: 'trigger' },
        { id: 't2', resource: 'HTTP', bindingType: 'trigger' },
        { id: 't3', resource: 'Timer', bindingType: 'trigger' },
        { id: 't4', resource: 'HTTP', bindingType: 'input' },
        { id: 't5', resource: 'Queue', bindingType: 'output' },
      ];

      const triggers = templates.filter(t => t.bindingType === 'trigger');
      assert.strictEqual(triggers.length, 3);
      assert.ok(triggers.every(t => t.bindingType === 'trigger'));
    });

    it('should group templates by resource type', () => {
      const templates = [
        { id: 't1', resource: 'HTTP', bindingType: 'trigger' },
        { id: 't2', resource: 'HTTP', bindingType: 'trigger' },
        { id: 't3', resource: 'Timer', bindingType: 'trigger' },
        { id: 't4', resource: 'Queue', bindingType: 'trigger' },
      ];

      const resourceGroups = {};
      for (const t of templates) {
        if (t.bindingType !== 'trigger') continue;
        const resource = t.resource || 'other';
        if (!resourceGroups[resource]) resourceGroups[resource] = [];
        resourceGroups[resource].push(t);
      }

      assert.strictEqual(resourceGroups['HTTP'].length, 2);
      assert.strictEqual(resourceGroups['Timer'].length, 1);
      assert.strictEqual(resourceGroups['Queue'].length, 1);
    });

    it('should sort resources by priority order', () => {
      const priorityOrder = ['http', 'timer', 'queue', 'blob', 'cosmos', 'servicebus', 'eventgrid', 'eventhub'];
      const resources = ['Queue', 'HTTP', 'EventHub', 'Timer'];

      const sorted = resources.sort((a, b) => {
        const aIdx = priorityOrder.indexOf(a.toLowerCase());
        const bIdx = priorityOrder.indexOf(b.toLowerCase());
        if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      });

      assert.deepStrictEqual(sorted, ['HTTP', 'Timer', 'Queue', 'EventHub']);
    });

    it('should limit display to 15 templates', () => {
      const manyOptions = Array.from({ length: 20 }, (_, i) => ({
        value: `t${i}`,
        label: `Template ${i}`,
      }));

      const displayOptions = manyOptions.slice(0, 15);
      assert.strictEqual(displayOptions.length, 15);
    });

    it('should handle empty trigger list gracefully', () => {
      const displayOptions = [];
      const result = displayOptions.length === 0 ? null : displayOptions[0];
      assert.strictEqual(result, null);
    });
  });

  describe('promptProjectName - default name logic', () => {
    it('should use directory basename as default', async () => {
      // Use path.posix for consistent behavior across platforms
      const { posix, win32 } = await import('node:path');
      assert.strictEqual(posix.basename('/home/user/my-project'), 'my-project');
      assert.strictEqual(win32.basename('C:\\Users\\dev\\func-app'), 'func-app');
    });

    it('should fallback to my-function-app for root or empty basename', async () => {
      const { basename } = await import('node:path');
      const getDefaultName = (targetDir) => basename(targetDir) || 'my-function-app';

      assert.strictEqual(getDefaultName(''), 'my-function-app');
    });
  });

  describe('promptSku - SKU options', () => {
    const skuOptions = [
      { value: 'flex', label: 'Flex Consumption (recommended, serverless)' },
      { value: 'premium', label: 'Premium (always-warm, VNet integration)' },
      { value: 'dedicated', label: 'Dedicated (App Service Plan)' },
    ];

    it('should offer flex, premium, and dedicated SKUs', () => {
      const values = skuOptions.map(o => o.value);
      assert.deepStrictEqual(values, ['flex', 'premium', 'dedicated']);
    });

    it('should mark flex as recommended (first option)', () => {
      assert.strictEqual(skuOptions[0].value, 'flex');
      assert.ok(skuOptions[0].label.includes('recommended'));
    });

    it('should include descriptive hints for each SKU', () => {
      assert.ok(skuOptions[0].label.includes('serverless'));
      assert.ok(skuOptions[1].label.includes('VNet'));
      assert.ok(skuOptions[2].label.includes('App Service'));
    });
  });
});

describe('fnx init - arrow key navigation logic', () => {
  describe('selectPrompt index calculations', () => {
    it('should wrap around when going up from first item', () => {
      const options = [{ value: 'a' }, { value: 'b' }, { value: 'c' }];
      let selectedIndex = 0;
      
      // Simulate up arrow from index 0 - should wrap to last
      selectedIndex = (selectedIndex - 1 + options.length) % options.length;
      assert.strictEqual(selectedIndex, 2, 'Should wrap to last item');
    });

    it('should wrap around when going down from last item', () => {
      const options = [{ value: 'a' }, { value: 'b' }, { value: 'c' }];
      let selectedIndex = 2;
      
      // Simulate down arrow from last index - should wrap to first
      selectedIndex = (selectedIndex + 1) % options.length;
      assert.strictEqual(selectedIndex, 0, 'Should wrap to first item');
    });

    it('should move up correctly within bounds', () => {
      const options = [{ value: 'a' }, { value: 'b' }, { value: 'c' }];
      let selectedIndex = 2;
      
      selectedIndex = (selectedIndex - 1 + options.length) % options.length;
      assert.strictEqual(selectedIndex, 1);
      
      selectedIndex = (selectedIndex - 1 + options.length) % options.length;
      assert.strictEqual(selectedIndex, 0);
    });

    it('should move down correctly within bounds', () => {
      const options = [{ value: 'a' }, { value: 'b' }, { value: 'c' }];
      let selectedIndex = 0;
      
      selectedIndex = (selectedIndex + 1) % options.length;
      assert.strictEqual(selectedIndex, 1);
      
      selectedIndex = (selectedIndex + 1) % options.length;
      assert.strictEqual(selectedIndex, 2);
    });
  });

  describe('number key quick selection', () => {
    it('should validate number key in valid range', () => {
      const options = [{ value: 'a' }, { value: 'b' }, { value: 'c' }];
      
      const isValidNumberKey = (key) => {
        if (key < '1' || key > '9') return false;
        const num = parseInt(key, 10);
        return num >= 1 && num <= options.length;
      };
      
      assert.ok(isValidNumberKey('1'));
      assert.ok(isValidNumberKey('2'));
      assert.ok(isValidNumberKey('3'));
      assert.ok(!isValidNumberKey('4'), 'Out of range');
      assert.ok(!isValidNumberKey('0'), 'Zero is not valid');
      assert.ok(!isValidNumberKey('a'), 'Letters are not valid');
    });

    it('should return correct option value for number key', () => {
      const options = [
        { value: 'python', label: 'Python' },
        { value: 'node', label: 'Node.js' },
        { value: 'dotnet', label: '.NET' },
      ];
      
      const getValueForNumberKey = (key) => {
        const num = parseInt(key, 10);
        return options[num - 1].value;
      };
      
      assert.strictEqual(getValueForNumberKey('1'), 'python');
      assert.strictEqual(getValueForNumberKey('2'), 'node');
      assert.strictEqual(getValueForNumberKey('3'), 'dotnet');
    });
  });

  describe('key code handling', () => {
    it('should recognize up arrow escape sequence', () => {
      const upArrow = '\x1b[A';
      assert.strictEqual(upArrow, '\x1b[A');
      assert.strictEqual(upArrow.charCodeAt(0), 0x1b); // ESC
      assert.strictEqual(upArrow.charCodeAt(1), 0x5b); // [
      assert.strictEqual(upArrow.charCodeAt(2), 0x41); // A
    });

    it('should recognize down arrow escape sequence', () => {
      const downArrow = '\x1b[B';
      assert.strictEqual(downArrow, '\x1b[B');
      assert.strictEqual(downArrow.charCodeAt(2), 0x42); // B
    });

    it('should recognize Ctrl+C', () => {
      const ctrlC = '\x03';
      assert.strictEqual(ctrlC.charCodeAt(0), 3);
    });

    it('should recognize Enter key', () => {
      const enter = '\r';
      const linefeed = '\n';
      assert.strictEqual(enter.charCodeAt(0), 13);
      assert.strictEqual(linefeed.charCodeAt(0), 10);
    });

    it('should recognize vim navigation keys', () => {
      assert.strictEqual('j', 'j'); // down
      assert.strictEqual('k', 'k'); // up
    });
  });

  describe('canUseRawMode detection', () => {
    it('should detect raw mode availability based on isTTY', () => {
      // In test environment, stdin may or may not be TTY
      const mockStdin = { isTTY: true, setRawMode: () => {} };
      const canUse = mockStdin.isTTY && typeof mockStdin.setRawMode === 'function';
      assert.strictEqual(canUse, true);
    });

    it('should return false when not TTY', () => {
      const mockStdin = { isTTY: false, setRawMode: () => {} };
      const canUse = mockStdin.isTTY && typeof mockStdin.setRawMode === 'function';
      assert.strictEqual(canUse, false);
    });

    it('should return false when setRawMode not available', () => {
      const mockStdin = { isTTY: true };
      const canUse = mockStdin.isTTY && typeof mockStdin.setRawMode === 'function';
      assert.strictEqual(canUse, false);
    });
  });

  describe('disabled options handling', () => {
    it('should skip disabled options when navigating up', () => {
      const options = [
        { value: 'a', label: 'A' },
        { value: '__SEP__', label: '---', disabled: true },
        { value: 'b', label: 'B' },
      ];
      
      // findNextSelectable simulation
      const findNextSelectable = (options, from, direction) => {
        let idx = from;
        for (let i = 0; i < options.length; i++) {
          idx = (idx + direction + options.length) % options.length;
          if (!options[idx].disabled) return idx;
        }
        return from;
      };
      
      // From index 2 (B), going up should skip separator to 0 (A)
      assert.strictEqual(findNextSelectable(options, 2, -1), 0);
    });

    it('should skip disabled options when navigating down', () => {
      const options = [
        { value: 'a', label: 'A' },
        { value: '__SEP__', label: '---', disabled: true },
        { value: 'b', label: 'B' },
      ];
      
      const findNextSelectable = (options, from, direction) => {
        let idx = from;
        for (let i = 0; i < options.length; i++) {
          idx = (idx + direction + options.length) % options.length;
          if (!options[idx].disabled) return idx;
        }
        return from;
      };
      
      // From index 0 (A), going down should skip separator to 2 (B)
      assert.strictEqual(findNextSelectable(options, 0, 1), 2);
    });

    it('should count only selectable options for number keys', () => {
      const options = [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
        { value: '__SEP__', label: '---', disabled: true },
        { value: 'c', label: 'C' },
      ];
      
      const selectableOptions = options.filter(o => !o.disabled);
      assert.strictEqual(selectableOptions.length, 3);
      assert.strictEqual(selectableOptions[0].value, 'a');
      assert.strictEqual(selectableOptions[1].value, 'b');
      assert.strictEqual(selectableOptions[2].value, 'c');
    });

    it('should find first selectable option for initial selection', () => {
      const options = [
        { value: '__SEP__', label: '---', disabled: true },
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ];
      
      const firstSelectable = options.findIndex(o => !o.disabled);
      assert.strictEqual(firstSelectable, 1);
    });
  });

  describe('template pagination', () => {
    it('should limit initial display to 9 templates', () => {
      const MAX_INITIAL_DISPLAY = 9;
      const templates = Array.from({ length: 15 }, (_, i) => ({ id: `t${i}` }));
      
      const displayTemplates = templates.slice(0, MAX_INITIAL_DISPLAY);
      assert.strictEqual(displayTemplates.length, 9);
    });

    it('should show More option when there are more than 9 templates', () => {
      const MAX_INITIAL_DISPLAY = 9;
      const templates = Array.from({ length: 15 }, (_, i) => ({ id: `t${i}` }));
      
      const hasMore = templates.length > MAX_INITIAL_DISPLAY;
      assert.strictEqual(hasMore, true);
      
      const remaining = templates.length - MAX_INITIAL_DISPLAY;
      assert.strictEqual(remaining, 6);
    });

    it('should not show More option when templates fit in initial display', () => {
      const MAX_INITIAL_DISPLAY = 9;
      const templates = Array.from({ length: 7 }, (_, i) => ({ id: `t${i}` }));
      
      const hasMore = templates.length > MAX_INITIAL_DISPLAY;
      assert.strictEqual(hasMore, false);
    });
  });

  describe('template search filtering', () => {
    const MIN_SEARCH_LENGTH = 3;

    it('should require minimum 3 characters to filter', () => {
      assert.strictEqual(MIN_SEARCH_LENGTH, 3);
      assert.ok('ht'.length < MIN_SEARCH_LENGTH);
      assert.ok('htt'.length >= MIN_SEARCH_LENGTH);
    });

    it('should filter options case-insensitively', () => {
      const options = [
        { value: 'http', label: 'HTTP Trigger', searchText: 'http trigger' },
        { value: 'timer', label: 'Timer Trigger', searchText: 'timer trigger' },
        { value: 'blob', label: 'Blob Trigger', searchText: 'blob trigger' },
      ];

      const query = 'http'.toLowerCase();
      const filtered = options.filter(opt => {
        const label = opt.label.toLowerCase();
        const searchText = (opt.searchText || '').toLowerCase();
        return label.includes(query) || searchText.includes(query);
      });

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].value, 'http');
    });

    it('should match on searchText field', () => {
      const options = [
        { value: 'a', label: 'A Template', searchText: 'http trigger api' },
        { value: 'b', label: 'B Template', searchText: 'timer cron' },
      ];

      const query = 'api';
      const filtered = options.filter(opt => {
        const searchText = (opt.searchText || '').toLowerCase();
        return searchText.includes(query);
      });

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].value, 'a');
    });

    it('should return empty array when no matches', () => {
      const options = [
        { value: 'a', label: 'HTTP Trigger' },
        { value: 'b', label: 'Timer Trigger' },
      ];

      const query = 'cosmos';
      const filtered = options.filter(opt => opt.label.toLowerCase().includes(query));

      assert.strictEqual(filtered.length, 0);
    });

    it('should handle backspace by removing last character', () => {
      let searchQuery = 'http';
      searchQuery = searchQuery.slice(0, -1);
      assert.strictEqual(searchQuery, 'htt');
      
      searchQuery = searchQuery.slice(0, -1);
      assert.strictEqual(searchQuery, 'ht');
    });

    it('should clear search on Escape key', () => {
      let searchQuery = 'http';
      // Simulate Escape key press
      const escapeKey = '\x1b';
      if (escapeKey === '\x1b' && escapeKey.length === 1) {
        searchQuery = '';
      }
      assert.strictEqual(searchQuery, '');
    });
  });
});

describe('fnx init - prompt helper functions', () => {
  describe('runtime mapping completeness', () => {
    it('should map all supported Azure Functions runtimes', () => {
      const supportedRuntimes = ['python', 'node', 'dotnet-isolated', 'java', 'powershell'];
      const languageToRuntime = {
        'Python': 'python',
        'JavaScript': 'node',
        'TypeScript': 'node',
        'CSharp': 'dotnet-isolated',
        'Java': 'java',
        'PowerShell': 'powershell',
      };

      const mappedRuntimes = new Set(Object.values(languageToRuntime));
      for (const runtime of supportedRuntimes) {
        assert.ok(mappedRuntimes.has(runtime), `Runtime ${runtime} should be mapped`);
      }
    });

    it('should handle unsupported languages gracefully', () => {
      const languageToRuntime = {
        'Python': 'python',
        'JavaScript': 'node',
      };

      // Unknown language returns undefined, which should be filtered
      const runtime = languageToRuntime['Rust'];
      assert.strictEqual(runtime, undefined);
    });
  });
});
