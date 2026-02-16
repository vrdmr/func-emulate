# F8: Homepage Improvements

**Status:** ✅ Implemented  
**PRD Section:** N/A (new initiative)  
**Depends on:** None (Phase 1); F2 host version info (Phase 2)

## Problem

The Azure Functions host homepage (`Home.html`) is served at the root URL (`/`) when a Function App starts — both locally via Core Tools and in Azure. It's **the first page every Azure Functions developer sees**, yet today it contains:

- A hardcoded "Functions 4.0" headline (doesn't reflect actual runtime version)
- A single shallow tagline: *"Azure Functions is an event-based serverless compute experience to accelerate your development."*
- One "Learn more" link (generic fwlink)
- No documentation links, no samples, no next steps, no environment awareness

This is a missed opportunity. The homepage could be a **developer productivity goldmine** — surfacing the right docs, samples, and next steps at the exact moment a developer is running their app.

## Feature

Transform the homepage from a static splash screen into a **contextual developer hub** with:

1. **Richer description** — What can you actually build with Functions?
2. **Categorized documentation links** — Getting started, language-specific guides, runtime config
3. **Samples & community links** — Awesome AZD, Azure Samples, community resources
4. **Environment-aware next steps** — Different guidance for local dev vs. production
5. **Dynamic runtime info** — Actual version, worker runtime, host ID
6. **Stack-specific highlighting** — Surface the right language docs based on worker runtime

## Current Architecture

```
Home.html                          ← Single static HTML file (~146KB, base64 images/fonts)
  ├── Inline CSS                   ← Segoe Light font (base64), dark theme, animation styles
  ├── jQuery 3.6 + jQuery UI 1.13 ← CDN-loaded, powers lightbulb animation
  ├── Lightbulb animation          ← Interactive click-to-toggle, emoticons (charming — keep it)
  └── Content section              ← Azure logo, headline, one-liner, single CTA link

HomepageMiddleware.cs              ← Serves Home.html as embedded resource on GET /
  ├── IsHomepageDisabled           ← Checks AzureWebJobsDisableHomepage env var
  ├── IsHomepageRequest            ← Matches path == "/"
  └── GetHomepage()                ← Reads HTML from assembly manifest stream (no templating)
```

**Key constraint:** `Home.html` is compiled as an `<EmbeddedResource>` in the `.csproj`. The middleware reads it from the assembly and returns it as-is — **no template variable substitution exists today**.

## Proposed Content Changes

### Section 1: Headline + Description

**Before:**
> Your Functions 4.0 app is up and running
> Azure Functions is an event-based serverless compute experience to accelerate your development.

**After:**
> Your Functions app is up and running ✅
> Runtime: v4.1034.2.0 | Worker: node
>
> **Azure Functions** is a serverless compute service that lets you run event-driven code without managing infrastructure:
> - **APIs & Microservices** — HTTP-triggered REST endpoints
> - **Event Processing** — React to messages from queues, Event Hubs, and Service Bus
> - **Scheduled Jobs** — Timer-triggered background tasks (CRON)
> - **File Processing** — Trigger on Blob Storage uploads
> - **Real-time Integrations** — Cosmos DB change feeds, Event Grid, and more

### Section 2: Developer Resources

Categorized link groups:

| Category | Links |
|----------|-------|
| **Getting Started** | Functions Overview, Create your first function, Triggers & Bindings reference |
| **Language Guides** | C#/.NET, JavaScript/TypeScript, Python, Java, PowerShell (highlight active worker) |
| **Runtime & Config** | host.json reference, App settings reference, Runtime versions |

All links point to `learn.microsoft.com` (stable, versioned docs).

### Section 3: Samples & Templates

| Resource | URL | Description |
|----------|-----|-------------|
| Awesome AZD | `azure.github.io/awesome-azd` | Production-ready `azd up` templates |
| Azure Samples | `github.com/Azure-Samples?q=functions` | Official sample repos |
| Azure Functions University | `github.com/marcduiker/azure-functions-university` | Community learning path |
| Serverless Community Library | `serverlesslibrary.net` | Discover ready-to-deploy Functions |

### Section 4: Next Steps (Environment-Aware)

**When running locally** (`AZURE_FUNCTIONS_ENVIRONMENT=Development` or no `WEBSITE_HOSTNAME`):

> **Next Steps**
> 1. Your HTTP functions are available at `/api/` — try calling one
> 2. Ready to deploy? Use `az functionapp create` or the VS Code Azure Functions extension
> 3. Set up CI/CD with GitHub Actions
> 4. Add monitoring with Application Insights

**When running in Azure:**

> **Next Steps**
> 1. Monitor with Application Insights
> 2. Configure scaling rules
> 3. Set up deployment slots

## Implementation

### Phase 1: HTML-Only (No middleware changes)

Modify only `Home.html`. Zero C# changes, lowest risk.

| Change | Details |
|--------|---------|
| Replace description | Use-case list instead of one-liner |
| Add docs section | HTML link groups with headings |
| Add samples section | External link cards |
| Add static next steps | Generic guidance (not environment-aware yet) |
| Layout refresh | Widen `.content` from 400px, add section headings, styled link groups |
| Keep animation | Lightbulb stays untouched |

**Risk:** None — purely additive HTML/CSS within existing embedded resource.

### Phase 2: Middleware + Template Engine

Modify `HomepageMiddleware.cs` to support placeholder replacement.

```csharp
// HomepageMiddleware.cs — GetHomepage() becomes:
private string GetHomepage()
{
    var html = ReadEmbeddedHtml(); // existing logic
    
    // Template variable replacement
    html = html.Replace("{{RUNTIME_VERSION}}", GetRuntimeVersion());
    html = html.Replace("{{WORKER_RUNTIME}}", GetWorkerRuntime());
    html = html.Replace("{{IS_LOCAL}}", IsLocalEnvironment() ? "true" : "false");
    html = html.Replace("{{HOST_NAME}}", GetHostName());
    
    return html;
}

private bool IsLocalEnvironment()
    => string.IsNullOrEmpty(Environment.GetEnvironmentVariable("WEBSITE_HOSTNAME"));

private string GetRuntimeVersion()
    => Environment.GetEnvironmentVariable("FUNCTIONS_EXTENSION_VERSION") 
       ?? typeof(HomepageMiddleware).Assembly.GetName().Version?.ToString() 
       ?? "unknown";

private string GetWorkerRuntime()
    => Environment.GetEnvironmentVariable("FUNCTIONS_WORKER_RUNTIME") ?? "";
```

Then in `Home.html`:
```html
<div class="bodyHeadline">Your Functions app is up and running</div>
<div class="runtimeInfo">Runtime: {{RUNTIME_VERSION}} | Worker: {{WORKER_RUNTIME}}</div>

<script>
  var isLocal = {{IS_LOCAL}};
  document.getElementById(isLocal ? 'local-steps' : 'azure-steps').style.display = 'block';
</script>
```

| Change | Details |
|--------|---------|
| Template system | Simple `string.Replace()` in `GetHomepage()` — no new dependencies |
| Environment detection | Check `WEBSITE_HOSTNAME` presence |
| Runtime version | Read `FUNCTIONS_EXTENSION_VERSION` or assembly version |
| Worker runtime | Read `FUNCTIONS_WORKER_RUNTIME` |
| Conditional sections | JS toggles `display:none` blocks based on injected `IS_LOCAL` flag |
| Stack highlighting | CSS class on active language link based on `WORKER_RUNTIME` |

**Risk:** Low — `GetHomepage()` is called once per request, string replacement is negligible cost. Template variables are safe (no user input, only env vars).

## Design Constraints

1. **Embedded resource** — `Home.html` is compiled into the assembly. All content must be in this single file.
2. **Keep the lightbulb** — The animation is charming and recognizable. Don't break it.
3. **Offline rendering** — Page must render without internet (local dev). External links for navigation are fine; no new CDN dependencies for rendering.
4. **Size budget** — Already 146KB (base64 images). Avoid adding more embedded assets. New content is text/HTML only.
5. **Backward compatible** — `AzureWebJobsDisableHomepage=true` must still disable the page entirely.
6. **No user input in templates** — Template variables come only from server-side env vars (no XSS risk).

## Edge Cases

| Case | Handling |
|------|----------|
| `FUNCTIONS_WORKER_RUNTIME` not set | Don't highlight any language; show all equally |
| `FUNCTIONS_EXTENSION_VERSION` = `~4` (Azure shorthand) | Fall back to assembly version for precise display |
| Homepage disabled | No change — `IsHomepageDisabled` check stays as-is |
| Custom worker runtime (e.g., `custom`) | Show generic docs, don't highlight a language |
| CDN/fwlink discussion | Use `learn.microsoft.com` direct URLs (no latency, transparent, versionable) |

## Open Questions

- [ ] Should we deprecate jQuery and rewrite the animation in vanilla JS/CSS? (Saves ~80KB CDN deps, but animation works fine today)
- [ ] Do we want `go.microsoft.com` fwlinks (redirectable) or direct `learn.microsoft.com` URLs (transparent)?
- [ ] Should Phase 2 template variables be behind a feature flag or always-on?
- [ ] Headline version: friendly "Functions 4.0" or precise "4.1034.2.0"?
- [ ] Are there WCAG accessibility requirements to address while touching this page?
- [ ] Should the page link to the Azure Portal for the specific Function App when running in Azure?

## Success Criteria

- [ ] Homepage shows categorized documentation links (≥3 categories, ≥10 links)
- [ ] Homepage shows samples section with Awesome AZD, Azure Samples, and ≥2 community resources
- [ ] Description explains ≥4 concrete use cases (not just "serverless compute")
- [ ] (Phase 2) Runtime version and worker runtime are displayed dynamically
- [ ] (Phase 2) Local environment shows local-specific next steps
- [ ] (Phase 2) Active worker runtime's language guide is visually highlighted
- [ ] Lightbulb animation still works
- [ ] Page renders correctly without internet (no new CDN deps)
- [ ] `AzureWebJobsDisableHomepage=true` still disables the page
