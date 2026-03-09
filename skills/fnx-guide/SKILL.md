---
name: fnx-guide
description: "Guide users through the `fnx` CLI by mapping goals to commands such as `init`, `start`, `doctor`, `config`, `warmup`, `sync`, `pack`, and `templates-mcp`. Use this skill when users ask what `fnx` can do, how to use `fnx` for local development, which command to run next, how to emulate a target SKU, or how to scaffold and run an Azure Functions project with `fnx`."
---

# fnx Guide

Use this skill to turn user intent into the right `fnx` workflow.

## When to use

Use this skill when the user asks:

- what `fnx` does
- how to use `fnx`
- which `fnx` command to run
- how to start a Functions app locally with SKU awareness
- how to scaffold a new project with `fnx`
- how to prepare a project for offline or CI usage
- how `templates-mcp` fits into the workflow

## Core rule

Do not start by listing every command. Start from the user's goal, then recommend the smallest `fnx` workflow that fits.

## Goal-to-command map

| User goal | Primary `fnx` command | Typical follow-up |
|---|---|---|
| Create a new Functions app | `fnx init` | `fnx start` |
| Run an existing app locally | `fnx start` | `fnx doctor` if startup fails |
| Check project health | `fnx doctor` | `fnx config validate` |
| Understand or clean up config | `fnx config` | `fnx config migrate` / `fnx config validate` |
| Prepare for offline or CI use | `fnx warmup` | `fnx sync` |
| Refresh cached host or extensions | `fnx sync` | `fnx start` |
| Package for deployment | `fnx pack` | external deploy flow |
| Expose templates to an AI assistant | `fnx templates-mcp` | configure MCP client |

## Response pattern

1. Identify whether the user is in a **new app**, **existing app**, **local dev**, **CI/offline**, or **agent tooling** scenario.
2. Recommend the main `fnx` command.
3. Explain why that command is the right entry point.
4. Offer the next one or two commands only if they are clearly relevant.
5. If the user is vague, ask one clarifying question at most.

## Recommended workflow hints

### New app

- Start with `fnx init`
- Then use `fnx start --sku <name>`
- Mention that `fnx` is SKU-aware and can emulate target host versions

### Existing app

- Start with `fnx doctor`
- If configuration is unclear, use `fnx config`
- If the user wants to run locally, move to `fnx start`

### Offline or CI

- Start with `fnx warmup`
- Use `fnx sync` to align cached host and extension assets

### Agent tooling

- Use `fnx templates-mcp` when the user wants AI-assisted template discovery or scaffolding

## Keep answers practical

Prefer concise, task-oriented guidance over full CLI documentation. Point to the command map when the user needs a broader overview.

## Reference

See [references/fnx-command-map.md](references/fnx-command-map.md) for a compact workflow-oriented summary.
