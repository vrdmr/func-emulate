# F5: Non-HTTP Trigger Support

**Status:** ✅ POC validated  
**PRD Section:** Implicit (Core Tools displays all triggers)  
**Source:** `fnx/lib/host-launcher.js` (log filter), `tests/test-python-app/function_app.py`

## Problem

Azure Functions supports many trigger types beyond HTTP (Blob, Timer, Queue, Service Bus, Cosmos DB, Event Hub, etc.). The function listing in clean output must show all triggers — not just HTTP routes — to match what `func start` displays.

## Current State (POC)

Non-HTTP triggers are extracted from the worker indexing JSON log line:

```
{"message": "Successfully indexed function app.", "function_count": 2,
 "functions": "Function Name: hello, Function Binding: [('httpTrigger', ...)]
              Function Name: blob_trigger, Function Binding: [('blobTrigger', ...)]"}
```

The log filter parses this to display:

```
Functions:

    hello: [all] http://localhost:7096/api/hello
    blob_trigger: blobTrigger
```

## Validated Triggers

| Trigger | Tested | Notes |
|---------|--------|-------|
| HTTP (`httpTrigger`) | ✅ | Node.js + Python, all 5 SKUs |
| Blob (`blobTrigger`) | ✅ | Python, with Azurite, `test-container/events.jsonl` fired successfully |
| Timer (`timerTrigger`) | ❌ | Not tested, should work (no external dependency) |
| Queue (`queueTrigger`) | ❌ | Not tested, needs Azurite queue |
| Service Bus | ❌ | Needs Service Bus emulator or connection |
| Cosmos DB | ❌ | Needs Cosmos DB emulator or connection |
| Event Hub | ❌ | Needs Event Hub connection |

## Known Limitation: Log Parsing

The current approach parses the worker indexing JSON from host stdout. This is fragile because:
- Log format may vary across host versions
- Different workers (Node, Python, Java) may format differently
- Structured log parsing depends on exact indentation

## Production Fix: `/admin/functions` API

The host exposes `GET /admin/functions` which returns canonical function metadata including all bindings and trigger types. This requires:

1. Enable file-based secrets: `AzureWebJobsSecretStorageType=Files`
2. Read master key from `{scriptRoot}/secrets/host.json` after host starts
3. Call `GET http://localhost:{port}/admin/functions` with `x-functions-key: {masterKey}`
4. Parse response to get function names, trigger types, and HTTP routes

This is how Core Tools does it internally (via in-process DI on `IScriptJobHost.Functions`, see `DisplayFunctionsInfoUtilities.cs`). The REST API is the out-of-process equivalent.

## Production Requirements

- Switch from log parsing to `/admin/functions` API
- Fall back to log parsing if admin API unavailable
- Test Timer, Queue, Service Bus, Cosmos DB, Event Hub triggers
- Display trigger-specific metadata (e.g., blob path, timer schedule, queue name)
