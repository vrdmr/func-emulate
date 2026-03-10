---
name: fnx-feedback
description: "Report fnx issues and feedback as GitHub Issues from conversation history. Analyzes what went wrong, drafts a structured bug report, and posts to the fnx repository after user approval. USE FOR: report issue, feedback, bug report, file issue, something broke, report a problem, fnx bug, give feedback."
---

# fnx Feedback

Create structured feedback from conversation history and post as a GitHub Issue on the fnx repository.

## Workflow

### 1. Analyze Conversation History

Read the conversation and identify:

- **Goal** — What the user was trying to do
- **Symptoms** — What went wrong
- **Root cause** — If identifiable (fnx bug, missing feature, bad guidance, etc.)
- **Time wasted** — How many attempts before success (or failure)
- **Workarounds** — Manual steps the user had to take

Categorize:

| Category | Label | Description |
|----------|-------|-------------|
| `bug` | `bug` | CLI command failed, wrong output, crash |
| `ux` | `ux` | Confusing prompts, poor defaults, unclear errors |
| `skill` | `skill-issue` | Skill gave wrong instructions or missed steps |
| `feature` | `enhancement` | Missing capability that would have helped |
| `docs` | `docs` | Documentation was wrong or missing |

### 2. Collect Environment

```bash
fnx --version
node --version
```

Also gather from conversation context:
- Runtime (node/python/dotnet-isolated/java/powershell)
- Target SKU (flex/premium/dedicated)
- OS (Windows/macOS/Linux)

### 3. Draft the Issue

```markdown
## Summary

[One-line description]

## Category

[bug / ux / skill / feature / docs]

## Environment

- fnx version: [version]
- Node.js: [version]
- Runtime: [runtime]
- SKU: [sku]
- OS: [os]

## What Happened

[Describe what the user was trying to do and what went wrong.
Include specific error messages or unexpected behaviors.]

## Expected Behavior

[What should have happened]

## Steps to Reproduce

1. [Step-by-step]

## Impact

- Time spent: [estimate]
- Workaround: [what the user did instead]

## Suggested Fix

[If obvious from analysis]
```

### 4. Present to User for Review

**CRITICAL**: Always show the full draft to the user before posting.

Ask:
- "Here's the feedback report. Please review it."
- "Should I post this as an issue?"

Wait for explicit approval. Do NOT post without confirmation.

### 5. Post the Issue

```bash
gh issue create \
  --repo vrdmr/func-emulate \
  --title "<title>" \
  --body "<body>" \
  --label "<label>"
```

**Issue body rules** (prevent encoding issues):
- Use `~~~` for code blocks (not triple backticks)
- Avoid special Unicode characters
- Keep text in English (translate non-English feedback)
- Use simple ASCII for tables

### 6. Confirm

Show the issue URL, summarize what was reported, and thank the user.

## Error Handling

| Issue | Solution |
|-------|----------|
| No conversation context | Ask user to describe the problem manually |
| `gh` not authenticated | `gh auth login` |
| Label doesn't exist | Create it or omit the label |
| User rejects draft | Revise and re-present |
