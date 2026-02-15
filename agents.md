# Agents: func-emulate POC

This project uses a **top-level orchestrator** and **three specialized agents** to build the func-emulate POC. Each agent has a focused scope, clear inputs/outputs, and can work independently.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Orchestrator (agents.md — this file)                    │
│  Coordinates the three agents, validates handoffs,       │
│  ensures end-to-end integration.                         │
│                                                          │
│  Inputs:  docs/prd.md, docs/implementation.md, docs/testing.md │
│  Outputs: Working POC, validated end-to-end              │
│                                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │ PM Agent     │ │ Eng Agent    │ │ Test Agent       │ │
│  │ (Validation) │ │ (Build)      │ │ (Verification)   │ │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────────┘ │
│         │                │                │              │
│  agents/pm.md     agents/engineer.md  agents/tester.md   │
└──────────────────────────────────────────────────────────┘
```

## Execution Order

1. **Engineer Agent** runs first — scaffolds all code (build script, CDN server, CLI, test app)
2. **PM Agent** runs second — validates the implementation matches the PRD spec
3. **Test Agent** runs third — executes the test plan against the running system

The PM Agent and Test Agent can run in parallel after the Engineer Agent completes.

## Agent Summaries

| Agent | Scope | Key Files | Success Criteria |
|-------|-------|-----------|------------------|
| **PM** | Validate PRD requirements are met by the implementation | `docs/prd.md`, all source files | Checklist of PRD requirements mapped to implementation |
| **Engineer** | Scaffold all code from `docs/implementation.md` spec | `build-hosts.sh`, `cdn-server/`, `func-emu/`, `tests/test-node-app/` | All files created, CLI runs without errors |
| **Test** | Execute `docs/testing.md` plan, validate end-to-end | `docs/testing.md`, running system | Tests 1-6 (P0) pass |

## Handoff Protocol

### Engineer → PM
The Engineer Agent produces:
- `build-hosts.sh` (executable)
- `cdn-server/server.js` + `cdn-server/profiles/sku-profiles.json` + `cdn-server/package.json`
- `func-emu/` with all 4 JS files + `package.json` + bundled `profiles/sku-profiles.json`
- `test-node-app/` with `host.json`, `local.settings.json`, `package.json`, `src/functions/hello.js`

The PM Agent then validates these against `docs/prd.md` requirements.

### Engineer → Test
The Test Agent needs:
- All code scaffolded by Engineer Agent
- Host binaries built (by running `build-hosts.sh`) OR manually placed in cache
- CDN server running on `localhost:4566`

### PM → Orchestrator
PM Agent produces a validation report: checklist of PRD requirements with pass/fail/partial status.

### Test → Orchestrator
Test Agent produces a test report: pass/fail for each test in `docs/testing.md`.

## How to Run

```bash
# 1. Engineer Agent builds everything
#    (see agents/engineer.md)

# 2. Build host packages (long-running, ~20 min)
./build-hosts.sh

# 3. Start CDN server (background)
cd cdn-server && node server.js &

# 4. PM Agent validates
#    (see agents/pm.md)

# 5. Test Agent executes
#    (see agents/tester.md)
```
