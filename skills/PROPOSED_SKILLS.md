# Proposed fnx Skill Set

This document proposes a broader skill direction for making `fnx` easier to use in an agent-first workflow.

## Priority proposal

| Priority | Skill | Purpose |
| --- | --- | --- |
| 1 | `fnx-guide` | Discoverability and goal-to-command mapping |
| 2 | `fnx-existing-app-review` | Brownfield onboarding and repo readiness review |
| 3 | `fnx-local-dev-orchestrator` | Guide `warmup` → `sync` → `start` flows |
| 4 | `fnx-best-practices-review` | Review Functions apps against best practices and SKU constraints |
| 5 | `fnx-scaffold` | Natural-language entry point for `fnx init` and `templates-mcp` |
| 6 | `fnx-feedback` | Draft issues and summarize CLI pain points |


## Why this order

The current `fnx` CLI is already powerful. The biggest gap is not raw capability, but discoverability and guided workflow.

That is why the first two prototypes focus on:

1. helping users understand what `fnx` can do
2. helping users apply `fnx` to an existing Functions app

## Alignment with fnx roadmap

This skill direction aligns well with the proposed agentic roadmap:

- `F20` points toward `fnx setup`, `fnx chat`, and generated agent configuration
- `F21` points toward `fnx migrate`, `fnx audit`, and deeper review flows

These prototype skills are intentionally lightweight. They can validate user value before deeper product implementation.
