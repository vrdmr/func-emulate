---
name: fnx-feedback
description: "Report issues from conversation history as GitHub Issues. Extracts problems, creates reproduction steps, and generates gh issue create commands. USE FOR: report issue, feedback, bug report, file issue, something broke, report a problem."
tags: [fnx, feedback, issue, bug-report, github]
category: Utility
---

# fnx Feedback

Report issues encountered during development as GitHub Issues. Analyzes conversation history to extract problems and generate structured bug reports.

## When to Use

Use this skill when:
- You encountered a bug while using fnx
- A function behaves unexpectedly
- You want to report a feature request
- You want to document a problem for the team

## How to Report an Issue

### Step 1: Describe the Problem

Tell me what went wrong. I'll analyze the conversation history to extract:
- What you were trying to do
- What actually happened
- Error messages or unexpected behavior
- Environment details (runtime, SKU, OS)

### Step 2: Review the Generated Issue

I'll create a structured issue with:
- **Title**: Clear, concise summary
- **Description**: What happened and why it matters
- **Reproduction Steps**: Step-by-step instructions
- **Expected vs Actual**: Clear comparison
- **Environment**: Runtime, SKU, OS, fnx version
- **Labels**: Suggested labels (bug, enhancement, etc.)

### Step 3: File the Issue

Use the generated `gh` command to create the issue:

```bash
gh issue create \
  --repo vrdmr/func-emulate \
  --title "Bug: [description]" \
  --body "..." \
  --label "bug"
```

## Issue Template

```markdown
## Description
[What happened]

## Steps to Reproduce
1. [First step]
2. [Second step]
3. [What you observed]

## Expected Behavior
[What should have happened]

## Actual Behavior
[What actually happened]

## Environment
- fnx version: [version]
- Runtime: [node/python/dotnet/java]
- SKU: [flex/premium/dedicated]
- OS: [Windows/macOS/Linux]

## Additional Context
[Error messages, logs, screenshots]
```

## Tips

- Include error messages verbatim — they help with diagnosis
- Note the exact `fnx` command you ran
- If possible, provide a minimal reproduction case
