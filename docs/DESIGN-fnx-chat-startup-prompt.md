# Design: fnx chat — Startup Prompt Implementation

## Code Analysis (Current State)

### LAUNCHERS (chat/index.js:19-35)

Current `buildArgs` returns empty arrays for all agents — no prompt is ever passed:

```javascript
const LAUNCHERS = {
  'claude-code': { command: 'claude', buildArgs: (ctx) => [] },
  'github-copilot': { command: 'copilot', buildArgs: (ctx) => [] },
  'codex': { command: 'codex', buildArgs: (ctx) => [] },
};
```

### launchAgent (chat/index.js:137-175)

Prompt is appended as a raw positional arg. This only works if the agent accepts
a positional prompt argument (Claude does, Copilot does not — Copilot requires `-i` or `-p`):

```javascript
const args = launcher.buildArgs({ appPath, project });
if (prompt) args.push(prompt);  // ← BUG: no agent-specific flag
```

### generateAgentMd (chat/index.js:178-223)

Generates `.fnx/agent.md` with project context but this file is **never referenced**
by any agent launcher. It's a dead artifact.

---

## Implementation Plan

### 1. Updated LAUNCHERS with Prompt Support

```javascript
const LAUNCHERS = {
  'claude-code': {
    command: 'claude',
    buildArgs: (ctx) => {
      const args = [];
      if (ctx.startupPrompt) args.push(ctx.startupPrompt);
      return args;
    },
    // Claude: positional arg for interactive, -p for non-interactive
    wrapPrompt: (prompt) => [prompt],
    wrapNonInteractive: (prompt) => ['-p', prompt],
  },
  'github-copilot': {
    command: 'copilot',
    buildArgs: (ctx) => {
      const args = [];
      if (ctx.startupPrompt) args.push('-i', ctx.startupPrompt);
      return args;
    },
    // Copilot: -i for interactive with prompt, -p for non-interactive
    wrapPrompt: (prompt) => ['-i', prompt],
    wrapNonInteractive: (prompt) => ['-p', prompt, '--allow-all-tools'],
  },
  'codex': {
    command: 'codex',
    buildArgs: (ctx) => {
      const args = [];
      if (ctx.startupPrompt) args.push(ctx.startupPrompt);
      return args;
    },
    wrapPrompt: (prompt) => [prompt],
    wrapNonInteractive: (prompt) => [prompt],
  },
};
```

### 2. Startup Prompt Builder

New exported function `buildStartupPrompt(appPath, project)`:

```javascript
export async function buildStartupPrompt(appPath, project) {
  // 1. Read template from manifests/startup-prompt.md
  const templatePath = join(MANIFESTS_DIR, 'startup-prompt.md');
  let template = await readFile(templatePath, 'utf8');

  // 2. Build variables
  const vars = {
    projectContext: formatProjectContext(project),
    skillCount: await countSkills(appPath),
    skillList: await listSkillSummaries(appPath),
    suggestedActions: buildSuggestedActions(project),
  };

  // 3. Resolve {{placeholders}}
  for (const [key, value] of Object.entries(vars)) {
    template = template.replaceAll(`{{${key}}}`, value);
  }

  return template;
}
```

### 3. Updated launchAgent

```javascript
async function launchAgent(agentId, launcher, appPath, project, userPrompt, opts) {
  // ...display code unchanged...

  let args;
  if (userPrompt) {
    // User provided --prompt: use their prompt directly (replaces greeting)
    args = launcher.wrapPrompt
      ? launcher.wrapPrompt(userPrompt)
      : [userPrompt];
  } else if (opts.noGreeting) {
    // --no-greeting: launch without any prompt
    args = [];
  } else {
    // Default: build startup greeting prompt
    const startupPrompt = await buildStartupPrompt(appPath, project);
    args = launcher.buildArgs({ appPath, project, startupPrompt });
  }

  const child = spawn(launcher.command, args, {
    cwd: appPath,
    stdio: 'inherit',
    shell: false,
  });
  // ...error handling unchanged...
}
```

### 4. startup-prompt.md Template

Located at `fnx/manifests/startup-prompt.md`:

```markdown
👋 Welcome to Azure Functions development with fnx!

{{projectContext}}

I have {{skillCount}} specialized skills to help you:
{{skillList}}

{{suggestedActions}}

What would you like to do?
```

### 5. Helper Functions

```javascript
function formatProjectContext(project) {
  if (!project) return 'No Azure Functions project detected in this directory. I can help you create one!';
  const funcs = project.functions.map(f => `${f.name} (${f.type})`).join(', ') || 'none yet';
  return `Your project: ${project.runtime === 'node' ? 'Node.js' : project.runtime} (${project.language || project.runtime}) | SKU: ${project.sku} | Functions: ${funcs}`;
}

async function countSkills(appPath) {
  const skillsDir = join(appPath, '.agents', 'skills');
  if (!existsSync(skillsDir)) return '0';
  const dirs = (await readdir(skillsDir)).filter(d => !d.startsWith('.'));
  return String(dirs.length);
}

async function listSkillSummaries(appPath) {
  const skillsDir = join(appPath, '.agents', 'skills');
  if (!existsSync(skillsDir)) return '(none installed — run fnx setup first)';
  const dirs = (await readdir(skillsDir)).filter(d => !d.startsWith('.'));
  const summaries = [];
  for (const dir of dirs) {
    const skillMd = join(skillsDir, dir, 'SKILL.md');
    if (!existsSync(skillMd)) continue;
    // Extract name from frontmatter
    const content = await readFile(skillMd, 'utf8');
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const descMatch = content.match(/^description:\s*"?([^"\n]+)"?/m);
    const name = nameMatch ? nameMatch[1].trim() : dir;
    const desc = descMatch ? descMatch[1].trim().split('.')[0] : '';
    summaries.push(`- **${name}**: ${desc}`);
  }
  return summaries.join('\n');
}

function buildSuggestedActions(project) {
  if (!project) {
    return [
      'Suggested next steps:',
      '1. Create a new Azure Functions project — ask me to run `fnx init`',
      '2. Learn about Azure Functions concepts and trigger types',
    ].join('\n');
  }
  if (project.functions.length === 0) {
    return [
      'Suggested next steps:',
      '1. Add your first function — ask me to create an HTTP trigger, Timer, Queue, etc.',
      '2. Run the app locally with `fnx start`',
    ].join('\n');
  }
  return [
    'Suggested next steps:',
    '1. Add another function or binding',
    '2. Run and test locally with `fnx start`',
    '3. Diagnose issues — describe any errors you see',
    '4. Review best practices for your ' + project.sku + ' SKU',
  ].join('\n');
}
```

---

## Test Plan

| Test | Description |
|------|-------------|
| `buildStartupPrompt with project` | Verify template resolves project context, skill count, skill list, and suggested actions for an existing project |
| `buildStartupPrompt without project` | Verify template shows "no project" message and create-project suggestions |
| `LAUNCHERS.claude-code.buildArgs with startupPrompt` | Returns `[promptText]` |
| `LAUNCHERS.github-copilot.buildArgs with startupPrompt` | Returns `['-i', promptText]` |
| `LAUNCHERS.*.buildArgs without startupPrompt` | Returns `[]` |
| `--prompt flag replaces startup greeting` | When user provides --prompt, startup greeting is not sent |
| `--no-greeting flag suppresses startup prompt` | Agent launches with no prompt args |
| `formatProjectContext with Node.js TypeScript project` | Returns correct runtime/SKU/function summary string |
| `buildSuggestedActions for new project` | Returns create-project suggestions |
| `buildSuggestedActions for project with functions` | Returns add/test/diagnose suggestions |

---

## Migration Notes

- `generateAgentMd()` remains for backward compatibility but is supplemented by the startup prompt
- The startup prompt is **in addition to** the agent.md file — it's what the agent sees first in conversation
- The `--prompt` flag behavior changes: previously it appended a raw arg; now it uses agent-specific flags
