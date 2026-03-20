# SPEC: fnx chat — Startup Prompt & Agent Launch Enhancement

## Problem

Currently, `fnx chat` sets up skills/MCP/instructions and launches a coding agent, but the agent starts with a blank conversation. The developer sees a generic prompt and must figure out what to do next. There is no greeting, no context about what fnx can help with, and no guidance on next steps.

## Goal

When `fnx chat` launches a coding agent, it should automatically send a **startup prompt** that:
1. Greets the developer with project context (detected runtime, SKU, functions)
2. Briefly explains what fnx skills are available and what the agent can help with
3. Suggests concrete next steps based on the project state (new project → create function, existing → diagnose/optimize)

This creates a "concierge" experience — the developer is immediately guided rather than staring at a blank prompt.

## Design

### Startup Prompt File

A new file `fnx/manifests/startup-prompt.md` contains the template for the startup message. It uses `{{variable}}` placeholders that `fnx chat` resolves at runtime before passing to the agent.

```markdown
# 👋 Welcome to Azure Functions Development with fnx!

## Your Project
{{projectContext}}

## What I Can Help With
I have {{skillCount}} specialized Azure Functions skills installed:
{{skillList}}

## Suggested Next Steps
{{suggestedActions}}

How can I help you today?
```

### Agent-Specific Prompt Flags

Each LAUNCHER definition includes how to pass a prompt at startup:

| Agent | Interactive + Prompt | Non-interactive |
|-------|---------------------|-----------------|
| **Claude Code** | `claude "prompt text"` | `claude -p "prompt text"` |
| **GitHub Copilot CLI** | `copilot -i "prompt text"` | `copilot -p "prompt text" --allow-all-tools` |
| **Codex** | `codex "prompt text"` | (not supported) |
| **VS Code (Copilot)** | `code chat "prompt text"` | `code chat -m agent "prompt text"` |

### Updated LAUNCHERS Config

```javascript
const LAUNCHERS = {
  'claude-code': {
    command: 'claude',
    buildArgs: (ctx) => {
      const args = [];
      if (ctx.startupPrompt) args.push(ctx.startupPrompt);
      return args;
    },
    buildPromptArgs: (prompt) => [prompt],           // interactive with prompt
    buildNonInteractiveArgs: (prompt) => ['-p', prompt], // non-interactive
  },
  'github-copilot': {
    command: 'copilot',
    buildArgs: (ctx) => {
      const args = [];
      if (ctx.startupPrompt) args.push('-i', ctx.startupPrompt);
      return args;
    },
    buildPromptArgs: (prompt) => ['-i', prompt],
    buildNonInteractiveArgs: (prompt) => ['-p', prompt, '--allow-all-tools'],
  },
  'codex': {
    command: 'codex',
    buildArgs: (ctx) => {
      const args = [];
      if (ctx.startupPrompt) args.push(ctx.startupPrompt);
      return args;
    },
    buildPromptArgs: (prompt) => [prompt],
    buildNonInteractiveArgs: (prompt) => [prompt],
  },
  'vscode': {
    command: 'code',
    buildArgs: (ctx) => {
      const args = ['chat'];
      if (ctx.startupPrompt) args.push(ctx.startupPrompt);
      return args;
    },
    buildPromptArgs: (prompt) => ['chat', prompt],
    buildNonInteractiveArgs: (prompt) => ['chat', '-m', 'agent', prompt],
  },
};
```

### Flow Change

```
fnx chat [--agent <name>] [--prompt <text>] [--no-greeting]
  │
  ├─ 1. Detect project (unchanged)
  ├─ 2. Detect agents & select (unchanged)
  ├─ 3. Auto-run setup if needed (unchanged)
  ├─ 4. Generate .fnx/agent.md (unchanged)
  │
  ├─ 5. Build startup prompt  ← NEW
  │     ├─ Read startup-prompt.md template
  │     ├─ Resolve {{variables}} with project context
  │     └─ Combine with user's --prompt if provided
  │
  └─ 6. Launch agent WITH prompt args  ← CHANGED
        ├─ If --prompt only: use buildPromptArgs(userPrompt)
        ├─ If no --prompt (default): use buildArgs({startupPrompt})
        └─ If --no-greeting: use buildArgs({}) (no startup prompt)
```

### New CLI Flags

| Flag | Behavior |
|------|----------|
| `--prompt <text>` | User-provided prompt (replaces startup greeting) |
| `--no-greeting` | Launch agent without any startup prompt |

### Variable Resolution

| Variable | Source | Example Value |
|----------|--------|---------------|
| `{{projectContext}}` | `detectProject()` result | "Node.js (TypeScript) project targeting Flex Consumption SKU\n2 functions: httpEnqueue, processQueue" |
| `{{skillCount}}` | Count of `.agents/skills/` directories | "5" |
| `{{skillList}}` | Skill names from `.agents/skills/*/SKILL.md` frontmatter | "- fnx-intro: Overview of fnx...\n- fnx-diagnostics: Troubleshoot..." |
| `{{suggestedActions}}` | Logic based on project state | See below |

### Suggested Actions Logic

```
If no project detected:
  → "1. Create a new Azure Functions project: ask me to run `fnx init`"
  → "2. Explain Azure Functions concepts"

If project exists but no functions:
  → "1. Add a function: ask me to create an HTTP trigger, Timer, Queue, etc."
  → "2. Run the app locally: `fnx start`"

If project exists with functions:
  → "1. Add another function or binding"
  → "2. Run and test locally: `fnx start`"
  → "3. Diagnose issues: describe any errors you're seeing"
  → "4. Review best practices for your SKU"
```

## Files Changed

| File | Change |
|------|--------|
| `fnx/lib/chat/index.js` | Update LAUNCHERS with prompt args, add startup prompt builder, update launchAgent |
| `fnx/manifests/startup-prompt.md` | NEW — startup prompt template |
| `fnx/test/chat-startup-prompt.test.js` | NEW — tests for startup prompt generation and agent arg building |

## Out of Scope

- VS Code `code chat` launcher (add later — different UX since it opens VS Code)
- `--non-interactive` mode for CI/scripting (future enhancement)
- Custom startup prompt file override (`--startup-prompt <file>`)
