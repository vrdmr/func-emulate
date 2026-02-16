/**
 * Unit tests for MCP template tool handlers.
 * Tests the tool handler functions directly (no server process needed).
 */

import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesMcpDist = join(__dirname, '..', '..', 'fnx', 'templates-mcp', 'dist', 'src');
const templatesRoot = join(__dirname, '..', '..', 'fnx', 'templates-mcp', 'templates');

function toImportUrl(filePath) {
  return pathToFileURL(filePath).href;
}

// Lazy-load handlers and templates modules
let handlers, templates;
async function loadModules() {
  if (!handlers) {
    handlers = await import(toImportUrl(join(templatesMcpDist, 'handlers.js')));
    templates = await import(toImportUrl(join(templatesMcpDist, 'templates.js')));
  }
}

describe('MCP templates — get_languages_list handler', () => {

  test('returns success with all valid languages', async () => {
    await loadModules();
    const result = await handlers.handleGetLanguagesList();
    assert.ok(!result.isError, 'Should not be an error');
    const text = result.content[0].text;
    for (const lang of templates.VALID_LANGUAGES) {
      assert.ok(text.includes(lang), `Should include language: ${lang}`);
    }
  });

  test('response includes Azure Functions header', async () => {
    await loadModules();
    const result = await handlers.handleGetLanguagesList();
    assert.ok(result.content[0].text.includes('Azure Functions Supported Languages'));
  });

  test('response includes runtime and prerequisites for each language', async () => {
    await loadModules();
    const result = await handlers.handleGetLanguagesList();
    const text = result.content[0].text;
    assert.ok(text.includes('Runtime'), 'Should mention Runtime');
    assert.ok(text.includes('Prerequisites'), 'Should mention Prerequisites');
    assert.ok(text.includes('Quick Commands'), 'Should mention Quick Commands');
  });
});

describe('MCP templates — get_templates_list handler', () => {

  test('returns templates for each valid language', async () => {
    await loadModules();
    for (const lang of templates.VALID_LANGUAGES) {
      const result = await handlers.handleGetFunctionTemplatesList({ language: lang });
      assert.ok(!result.isError, `Should succeed for ${lang}`);
      assert.ok(result.content[0].text.includes('Function Templates'), `Should have header for ${lang}`);
    }
  });

  test('HttpTrigger is listed for all languages', async () => {
    await loadModules();
    for (const lang of templates.VALID_LANGUAGES) {
      const result = await handlers.handleGetFunctionTemplatesList({ language: lang });
      assert.ok(result.content[0].text.includes('HttpTrigger'), `HttpTrigger missing for ${lang}`);
    }
  });

  test('rejects invalid language with error', async () => {
    await loadModules();
    const result = await handlers.handleGetFunctionTemplatesList({ language: 'ruby' });
    assert.ok(result.isError, 'Should be an error');
    assert.ok(result.content[0].text.includes('Invalid language'));
  });

  test('groups templates by binding type (triggers, input, output)', async () => {
    await loadModules();
    const result = await handlers.handleGetFunctionTemplatesList({ language: 'python' });
    const text = result.content[0].text;
    assert.ok(text.includes('Triggers'), 'Should have Triggers section');
  });
});

describe('MCP templates — get_template handler', () => {

  test('returns HttpTrigger template file contents for python', async () => {
    await loadModules();
    const result = await handlers.handleGetFunctionTemplate(
      { language: 'python', template: 'HttpTrigger' },
      templatesRoot
    );
    assert.ok(!result.isError, 'Should succeed');
    const text = result.content[0].text;
    assert.ok(text.includes('Function Template: HttpTrigger'));
    assert.ok(text.includes('Function Files'));
  });

  test('returns TimerTrigger template for typescript', async () => {
    await loadModules();
    const result = await handlers.handleGetFunctionTemplate(
      { language: 'typescript', template: 'TimerTrigger' },
      templatesRoot
    );
    assert.ok(!result.isError, 'Should succeed');
    assert.ok(result.content[0].text.includes('TimerTrigger'));
  });

  test('rejects invalid template name with error', async () => {
    await loadModules();
    const result = await handlers.handleGetFunctionTemplate(
      { language: 'python', template: 'FakeTrigger' },
      templatesRoot
    );
    assert.ok(result.isError, 'Should be an error');
    assert.ok(result.content[0].text.includes('Invalid template'));
  });

  test('rejects invalid language with error', async () => {
    await loadModules();
    const result = await handlers.handleGetFunctionTemplate(
      { language: 'go', template: 'HttpTrigger' },
      templatesRoot
    );
    assert.ok(result.isError, 'Should be an error');
    assert.ok(result.content[0].text.includes('Invalid language'));
  });

  test('includes merge instructions in response', async () => {
    await loadModules();
    const result = await handlers.handleGetFunctionTemplate(
      { language: 'python', template: 'HttpTrigger' },
      templatesRoot
    );
    assert.ok(result.content[0].text.includes('Merging with Existing Projects'));
  });
});

describe('MCP templates — get_project_template handler', () => {

  test('returns project scaffolding for each valid language', async () => {
    await loadModules();
    for (const lang of templates.VALID_LANGUAGES) {
      const result = await handlers.handleGetProjectTemplate({ language: lang });
      assert.ok(!result.isError, `Should succeed for ${lang}`);
      assert.ok(result.content[0].text.includes('Project Template'), `Should have header for ${lang}`);
    }
  });

  test('includes host.json in project template', async () => {
    await loadModules();
    const result = await handlers.handleGetProjectTemplate({ language: 'typescript' });
    assert.ok(result.content[0].text.includes('host.json'));
  });

  test('rejects invalid language', async () => {
    await loadModules();
    const result = await handlers.handleGetProjectTemplate({ language: 'rust' });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('Invalid language'));
  });
});

describe('MCP templates — template metadata completeness', () => {

  test('every template has a description in TEMPLATE_DESCRIPTIONS', async () => {
    await loadModules();
    for (const lang of templates.VALID_LANGUAGES) {
      const langTemplates = templates.VALID_TEMPLATES[lang];
      const descs = templates.TEMPLATE_DESCRIPTIONS[lang];
      for (const t of langTemplates) {
        assert.ok(descs[t], `Missing description for ${lang}/${t}`);
        assert.ok(descs[t].description, `Missing description text for ${lang}/${t}`);
      }
    }
  });

  test('VALID_LANGUAGES has at least 4 languages', async () => {
    await loadModules();
    assert.ok(templates.VALID_LANGUAGES.length >= 4,
      `Expected at least 4 languages, got ${templates.VALID_LANGUAGES.length}`);
  });

  test('each language has at least HttpTrigger template', async () => {
    await loadModules();
    for (const lang of templates.VALID_LANGUAGES) {
      assert.ok(
        templates.VALID_TEMPLATES[lang].includes('HttpTrigger'),
        `${lang} missing HttpTrigger`
      );
    }
  });
});

describe('MCP templates — path safety and utilities', () => {

  test('isPathSafe rejects path traversal', async () => {
    await loadModules();
    assert.strictEqual(handlers.isPathSafe('/templates', '../../../etc/passwd'), false);
    assert.strictEqual(handlers.isPathSafe('/templates', '..'), false);
    assert.strictEqual(handlers.isPathSafe('/templates', '.'), false);
  });

  test('isPathSafe rejects absolute paths', async () => {
    await loadModules();
    assert.strictEqual(handlers.isPathSafe('/templates', '/etc/passwd'), false);
    assert.strictEqual(handlers.isPathSafe('/templates', 'C:\\Windows\\System32'), false);
  });

  test('isPathSafe accepts valid relative paths', async () => {
    await loadModules();
    assert.strictEqual(handlers.isPathSafe('/templates', 'function_app.py'), true);
    assert.strictEqual(handlers.isPathSafe('/templates', 'src/index.ts'), true);
  });

  test('validateRuntimeVersion rejects unknown versions', async () => {
    await loadModules();
    const result = handlers.validateRuntimeVersion('java', '99');
    assert.ok(!result.valid, 'Should reject unknown version');
    assert.ok(result.error.includes('Invalid runtime version'));
  });

  test('replaceRuntimeVersion replaces java placeholders', async () => {
    await loadModules();
    const content = '<java.version>{{javaVersion}}</java.version>';
    const result = handlers.replaceRuntimeVersion(content, 'java', '17');
    assert.ok(result.includes('17'));
    assert.ok(!result.includes('{{javaVersion}}'));
  });
});
