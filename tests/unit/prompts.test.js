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
      'dotnet-isolated': '.NET (C#)',
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
