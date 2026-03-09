---
name: fnx-existing-app-review
description: "Review an existing Azure Functions project and recommend the best `fnx` onboarding path. Use this skill when users ask how to use `fnx` with an existing app, what to check before running locally, how to make a repo `fnx`-ready, how to validate configuration, or what the next local-development steps should be for a brownfield Functions app."
---

# fnx Existing App Review

Use this skill to guide brownfield onboarding for `fnx`.

## When to use

Use this skill when the user asks:

- how to use `fnx` with an existing Functions app
- what to review before starting locally
- whether a repo is `fnx`-ready
- how to validate config or runtime assumptions
- what the next steps are for local emulation

## Review workflow

1. Confirm the repo looks like an Azure Functions app.
   - Check for `host.json`
   - Check for `local.settings.json`
   - Check for `app-config.yaml` if present
2. Identify likely runtime and local-dev shape.
3. Recommend the minimum useful `fnx` sequence.
4. Explain blockers before suggesting advanced flows.

## Recommended command sequence

### Healthy existing app

1. `fnx doctor`
2. `fnx config`
3. `fnx start --sku <target>`

### Missing or weak config

1. `fnx doctor`
2. `fnx config migrate` if `app-config.yaml` is missing and `local.settings.json` exists
3. `fnx config validate`
4. `fnx start --sku <target>`

### CI or offline prep

1. `fnx warmup`
2. `fnx sync`
3. `fnx pack`

## Review output pattern

When using this skill, structure the answer as:

- **Detected state** — what is present or missing
- **Risks or blockers** — what may prevent smooth local emulation
- **Recommended next command** — the best immediate `fnx` action
- **Follow-up flow** — one short sequence of next steps

## Guardrails

- If `host.json` is missing, say the repo does not yet look like a Functions app.
- If the user only wants a quick next step, do not dump the full review workflow.
- Prefer `fnx doctor` as the first command for brownfield repos unless the user is explicitly asking about packaging or template MCP.

## Reference

See [references/review-checklist.md](references/review-checklist.md) for the brownfield checklist.
