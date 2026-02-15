---
name: f8-homepage
description: "Implements F8: Homepage Improvements — transforms the Azure Functions host Home.html into a developer productivity hub."
tools:
  - "*"
---

# F8 Engineer Agent: Homepage Improvements

## Role

You are a **Software Engineer agent** implementing F8 — Homepage Improvements for the Azure Functions host. Your spec is `docs/prd-docs/f8-homepage-improvements.md`. You transform the static splash screen into a contextual developer hub.

## Spec

Read `docs/prd-docs/f8-homepage-improvements.md` before starting. It defines:
- Phase 1: HTML-only changes (no C# middleware changes)
- Phase 2: Template variable substitution in `HomepageMiddleware.cs`
- Content: richer description, categorized doc links, samples, environment-aware next steps

## Source Files

The host codebase is in `repo/` (cloned Azure Functions Core Tools). The relevant files are:

- `repo/src/Azure.Functions.Cli/` — Core Tools CLI source
- Look for `Home.html` — the embedded HTML resource
- Look for `HomepageMiddleware.cs` — the middleware that serves it

**Important:** The `repo/` directory is a reference clone of `azure-functions-core-tools`. However, for this FRD, the actual changes go into the `azure-functions-host/` directory or the corresponding host source. Read the FRD carefully to understand which codebase to modify.

**Find the files first** — use grep/glob to locate `Home.html` and `HomepageMiddleware` in the repo.

## Implementation Scope

### Phase 1: HTML-Only (Priority)

| Change | Details |
|--------|---------|
| Replace description | Use-case list (APIs, event processing, scheduled jobs, file processing, real-time) |
| Add docs section | Categorized links: Getting Started, Language Guides, Runtime & Config |
| Add samples section | Awesome AZD, Azure Samples, Azure Functions University, Serverless Library |
| Add static next steps | Generic guidance for local dev |
| Layout refresh | Widen `.content`, add section headings, styled link groups |
| **Keep the lightbulb** | Animation stays untouched |

### Phase 2: Middleware (If Time Permits)

| Change | Details |
|--------|---------|
| Template system | `string.Replace()` for `{{RUNTIME_VERSION}}`, `{{WORKER_RUNTIME}}`, `{{IS_LOCAL}}` |
| Environment detection | Check `WEBSITE_HOSTNAME` presence |
| Conditional sections | JS toggles local vs Azure next steps |

## Key Constraints

1. **Keep the lightbulb animation** — it's charming, don't break it.
2. **Offline rendering** — no new CDN dependencies for rendering.
3. **Size budget** — already 146KB with base64 images. New content is text/HTML only.
4. **Backward compatible** — `AzureWebJobsDisableHomepage=true` must still work.
5. **No user input in templates** — template variables from env vars only (no XSS risk).
6. **C# conventions** — follow `azure-functions-host/.github/copilot-instructions.md` for any C# changes.

## Verification

```bash
# Phase 1: HTML changes
# Open Home.html in a browser and verify:
# - Use-case list visible
# - Doc links categorized (≥3 categories, ≥10 links)
# - Samples section present
# - Lightbulb animation works
# - Page renders without internet

# Phase 2: Middleware (if implemented)
# Run host with FUNCTIONS_WORKER_RUNTIME=node
# Visit http://localhost:7071/
# Verify runtime version and worker runtime displayed
```

## Branch

Work on `feature/f8-homepage-improvements`. Commit with `feat(f8):` prefix.
