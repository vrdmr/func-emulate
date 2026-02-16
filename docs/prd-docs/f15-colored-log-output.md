# F15: Colored Log Output

**Status:** ✅ Implemented  
**PRD Section:** Developer experience, CLI polish  
**Depends on:** F4 (CLI surface), F11 (logging rigor)

## Problem

`fnx start` currently outputs all log lines in the terminal's default foreground color. This makes it hard to:

1. **Spot function names** in a wall of host startup text
2. **Find URLs** (the most important line — where to curl)
3. **Distinguish info from warnings from errors** without reading every word
4. **Scan invocation status** during rapid-fire testing

The official `func start` (in `repo/`) uses `Colors.Net` with a well-tested theme (`OutputTheme.cs`). fnx should match this palette so users experience visual continuity when switching between `func` and `fnx`.

## Color Scheme

Matches `repo/src/Cli/func/Common/OutputTheme.cs`:

| Role | Color | ANSI Code | Where Used |
|------|-------|-----------|------------|
| Title / Info | DarkCyan | `\x1b[36m` | Banner, section headers, info-level host logs |
| Function names | DarkYellow | `\x1b[33m` | Function list (`hello`, `processOrder`) |
| URLs | DarkGreen | `\x1b[32m` | `http://localhost:7071/api/hello` |
| Errors | Red | `\x1b[31m` | Host errors, startup failures |
| Warnings | DarkYellow | `\x1b[33m` | Port fallback, missing config, deprecations |
| Verbose / Debug | DarkGreen | `\x1b[32m` | Verbose-mode host output |
| Quiet warnings | DarkGray | `\x1b[90m` | Low-priority notices |

### Reset

All colored output must end with `\x1b[0m` (reset) to avoid bleeding into subsequent lines.

### NO_COLOR Support

Respect the [NO_COLOR](https://no-color.org/) convention:
- If `NO_COLOR` env var is set (any value), emit no ANSI codes
- If stdout is not a TTY (`!process.stdout.isTTY`), emit no ANSI codes

## Scope

### Phase 1: fnx-controlled output (banner, status, [fnx] prefixed lines)

These are lines fnx itself writes via `console.log()`:

```
[fnx] Detected AzureWebJobsStorage=UseDevelopmentStorage=true     ← DarkCyan
[fnx] Starting Azurite storage emulator...                        ← DarkCyan
  Functions Debug MCP Server: http://127.0.0.1:7072/mcp           ← URL in DarkGreen

Azure Functions Local Emulator (fnx — Phoenix Emulate)            ← Title in DarkCyan
Emulator Version:  0.1.0
Host Version:      4.1047.100 (Flex Consumption)                  ← DarkCyan
Python:            python3.13 (3.13)

  Port 7071 in use, using 7073 instead.                           ← DarkYellow (warning)
```

### Phase 2: Host log passthrough (filtered lines from the .NET host)

The host writes to stdout/stderr. fnx pipes these through `createLogFilter()`. Color the passed-through lines:

```
Functions:                                                        ← default

	hello: [all] http://localhost:7071/api/hello                  ← name DarkYellow, URL DarkGreen

Now listening on: http://0.0.0.0:7071                             ← URL in DarkGreen
Application started. Press Ctrl+C to shut down.                   ← DarkCyan

[2026-02-16T03:15:00] Worker process started and initialized.     ← DarkGreen (verbose)
[2026-02-16T03:15:01] Executing 'hello' (Reason='...')            ← function name DarkYellow
[2026-02-16T03:15:01] Executed 'hello' (Succeeded, Duration=42ms) ← DarkGreen (success)
[2026-02-16T03:15:02] Executed 'hello' (Failed, Duration=5ms)     ← Red (failure)
```

### Phase 3: Error and warning colorization

```
  ⚠️  MCP server failed to start on port 7072: ...                ← DarkYellow
  ✗ Working directory is not clean.                                ← Red
  ✓ Host cached, skipping download.                                ← DarkGreen
```

## Implementation Plan

### 1. Create `lib/colors.js` utility

```javascript
// lib/colors.js — zero-dependency ANSI color helper

const enabled = !process.env.NO_COLOR && process.stdout.isTTY;

const codes = {
  reset:      '\x1b[0m',
  red:        '\x1b[31m',
  green:      '\x1b[32m',
  yellow:     '\x1b[33m',
  cyan:       '\x1b[36m',
  gray:       '\x1b[90m',
};

const c = (code) => (str) => enabled ? `${code}${str}${codes.reset}` : str;

export const title     = c(codes.cyan);     // DarkCyan — banner, info
export const info      = c(codes.cyan);     // DarkCyan — [fnx] prefixed lines
export const funcName  = c(codes.yellow);   // DarkYellow — function names
export const url       = c(codes.green);    // DarkGreen — URLs
export const error     = c(codes.red);      // Red — errors
export const warning   = c(codes.yellow);   // DarkYellow — warnings
export const verbose   = c(codes.green);    // DarkGreen — debug/verbose
export const dim       = c(codes.gray);     // DarkGray — quiet warnings
```

### 2. Apply to fnx-controlled output

Update `cli.js`, `host-launcher.js`, `azurite-manager.js` to use `colors.js` for:
- Banner lines
- `[fnx]` prefixed messages
- Status indicators (`✓`, `✗`, `⚠️`)
- Port/URL display

### 3. Apply to log filter passthrough

Update `createLogFilter()` in `host-launcher.js` to:
- Detect function names in `Executing '...'` / `Executed '...'` patterns → DarkYellow
- Detect URLs (`http://...`) → DarkGreen
- Detect `(Succeeded, ...)` → DarkGreen
- Detect `(Failed, ...)` → Red
- Detect function listing lines → name DarkYellow, URL DarkGreen

### 4. Respect NO_COLOR and non-TTY

- Check `process.env.NO_COLOR` and `process.stdout.isTTY` once at module load
- All color functions become passthrough (identity) when disabled
- Piped output (`fnx start | tee log.txt`) stays clean

## Files to Modify

| File | Changes |
|------|---------|
| `fnx/lib/colors.js` | **New** — color utility module |
| `fnx/lib/cli.js` | Banner, status messages, port warnings |
| `fnx/lib/host-launcher.js` | Banner, log filter, function listing |
| `fnx/lib/azurite-manager.js` | `[fnx]` prefixed Azurite messages |
| `fnx/lib/live-mcp-server.js` | MCP server startup message |

## Edge Cases

| Case | Handling |
|------|----------|
| `NO_COLOR=1` env var | All color functions return plain text |
| Piped output (`fnx start \| cat`) | `isTTY` is false → no colors |
| Windows Terminal | ANSI codes work natively on Windows 10+ |
| CI/CD environments | Most set `CI=true`; respect `NO_COLOR` if set |
| Nested ANSI codes | Never nest — always reset before applying new color |

## Success Criteria

- [x] Function names appear in DarkYellow in the function listing
- [x] URLs appear in DarkGreen everywhere (function list, MCP, listening)
- [x] Errors appear in Red, warnings in DarkYellow
- [x] `NO_COLOR=1 fnx start` produces no ANSI escape codes
- [x] `fnx start | cat` produces no ANSI escape codes
- [x] Color scheme matches `func start` output (visual parity)

## Additional Improvements (delivered alongside F15)

- **Subcommand help**: `fnx start -h`, `fnx sync -h`, `fnx pack -h`, `fnx warmup -h`, `fnx templates-mcp -h` each show focused help instead of the monolithic help block
- **Grouped options in `fnx --help`**: Common, Start, Sync, Pack, and Advanced sections so flags are paired with their subcommand
- **Version info in help**: `fnx --help` shows fnx version, cached host versions (with SKU labels), and cached bundle versions
- **`--app-path` flag**: Renamed from `--scriptroot`, with smart resolution: explicit path → cwd → `./src` fallback, with host.json validation
- **Colorized help output**: Section headers, command names, flags, and URLs colored in help text
- **Background profile refresh**: `fnx --help` fires a non-blocking profile cache refresh

## Reference

- `repo/src/Cli/func/Common/OutputTheme.cs` — canonical color theme
- `repo/src/Cli/func/Diagnostics/ColoredConsoleLogger.cs` — log-level colorization
- `repo/src/Cli/Abstractions/Logging/AnsiConsole.cs` — ANSI escape handling
- [NO_COLOR convention](https://no-color.org/)
