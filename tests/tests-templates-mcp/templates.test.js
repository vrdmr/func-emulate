/**
 * Tests for the 4 template tools: get_languages_list, get_templates_list,
 * get_template, get_project_template.
 */

import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { callTool } from './helpers.js';

describe('MCP template tools', () => {

  test('get_languages_list returns all 4 languages', async () => {
    const resp = await callTool('get_languages_list');
    assert.ok(!resp.result.isError);

    const text = resp.result.content[0].text;
    assert.ok(text.includes('Azure Functions Supported Languages'));
    for (const lang of ['python', 'typescript', 'java', 'csharp']) {
      assert.ok(text.includes(lang), `Should mention ${lang}`);
    }
  });

  test('get_templates_list returns triggers for python', async () => {
    const resp = await callTool('get_templates_list', { language: 'python' });
    assert.ok(!resp.result.isError);

    const text = resp.result.content[0].text;
    assert.ok(text.includes('Function Templates'));
    assert.ok(text.includes('HttpTrigger'));
    assert.ok(text.includes('Triggers'));
  });

  test('get_templates_list returns triggers for typescript', async () => {
    const resp = await callTool('get_templates_list', { language: 'typescript' });
    assert.ok(!resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('HttpTrigger'));
  });

  test('get_templates_list rejects invalid language', async () => {
    const resp = await callTool('get_templates_list', { language: 'ruby' });
    assert.ok(resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('Invalid language'));
  });

  test('get_template returns HttpTrigger source for python', async () => {
    const resp = await callTool('get_template', { language: 'python', template: 'HttpTrigger' });
    assert.ok(!resp.result.isError);

    const text = resp.result.content[0].text;
    assert.ok(text.includes('Function Template: HttpTrigger'));
    assert.ok(text.includes('Function Files'));
  });

  test('get_template returns TimerTrigger for typescript', async () => {
    const resp = await callTool('get_template', { language: 'typescript', template: 'TimerTrigger' });
    assert.ok(!resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('TimerTrigger'));
  });

  test('get_template rejects invalid language', async () => {
    const resp = await callTool('get_template', { language: 'go', template: 'HttpTrigger' });
    assert.ok(resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('Invalid language'));
  });

  test('get_template rejects invalid template name', async () => {
    const resp = await callTool('get_template', { language: 'python', template: 'FakeTrigger' });
    assert.ok(resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('Invalid template'));
  });

  test('get_project_template returns scaffolding for typescript', async () => {
    const resp = await callTool('get_project_template', { language: 'typescript' });
    assert.ok(!resp.result.isError);

    const text = resp.result.content[0].text;
    assert.ok(text.includes('Project Template'));
    assert.ok(text.includes('host.json'));
    assert.ok(text.includes('package.json'));
  });

  test('get_project_template returns scaffolding for java', async () => {
    const resp = await callTool('get_project_template', { language: 'java' });
    assert.ok(!resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('Project Template'));
  });

  test('get_project_template rejects invalid language', async () => {
    const resp = await callTool('get_project_template', { language: 'rust' });
    assert.ok(resp.result.isError);
    assert.ok(resp.result.content[0].text.includes('Invalid language'));
  });
});
