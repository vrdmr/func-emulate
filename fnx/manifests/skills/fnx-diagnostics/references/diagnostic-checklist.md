# Diagnostic Checklist

Structured checklist for comprehensive diagnosis. Work through relevant sections.

## Security Audit

- [ ] **Secrets in committed files**: Run `fnx config validate` — any secrets in app-config.yaml?
- [ ] **Auth levels**: Are HTTP triggers using `anonymous` when they shouldn't?
- [ ] **Connection strings**: Are production connection strings in local.settings.json? (should use Key Vault refs in prod)
- [ ] **CORS**: Is `host.json` CORS configured with `*`? (risk in production)
- [ ] **.gitignore**: Does it include `local.settings.json` and `.env`?

## Configuration Health

- [ ] **host.json**: Valid JSON, version "2.0"
- [ ] **app-config.yaml**: Valid YAML, runtime.name set, no secrets
- [ ] **local.settings.json**: Valid JSON, has `Values` section
- [ ] **Worker runtime**: Matches actual project (node for Node.js, python for Python, etc.)
- [ ] **Extension bundle**: host.json has `extensionBundle` section (unless using explicit NuGet refs)

## Runtime Health

- [ ] **Dependencies installed**: `npm ls @azure/functions` (Node), `pip list | grep azure-functions` (Python)
- [ ] **Correct runtime version**: Node.js >=18, Python 3.9-3.13, .NET 8+
- [ ] **Programming model**: Node.js v4 (import from `@azure/functions`), Python v2 (decorators)
- [ ] **Entry point**: Functions discoverable by host (check `fnx start --verbose` for worker indexing)

## Infrastructure Health

- [ ] **Host cache**: `ls ~/.fnx/hosts/` — any versions cached?
- [ ] **Host workers intact**: Check `~/.fnx/hosts/<ver>/workers/<runtime>/worker.config.json` exists — if missing, cache is corrupt. Fix: `rm -rf ~/.fnx/hosts/`
- [ ] **Ports**: 7071 (HTTP) and 7072 (MCP) available
- [ ] **Stale processes**: Check for orphaned `Microsoft.Azure.WebJobs.Script.WebHost` processes holding ports
- [ ] **Azurite**: Running if storage triggers exist. Check ports 10000-10002
- [ ] **Network**: Can reach CDN for host download (if first run)

## Failure Categories

### Category A: Won't Start
1. Run `fnx doctor` — fix ✗ items
2. Run `fnx start --verbose` — read full output
3. Check host.json + config files
4. Read `fnx/lib/cli.js` startup sequence for exact failure point

### Category B: Starts but Functions Fail
1. Check function registration in verbose output
2. Verify runtime dependencies installed
3. Check binding configuration (connection strings)
4. Read customer function code for errors

### Category C: Triggers Don't Fire
1. HTTP: Test with `curl http://localhost:7071/api/<name>`
2. Queue: Verify Azurite running, queue exists, connection string correct
3. Timer: Check CRON expression format (6 fields, not 5)
4. Blob: Check container exists in Azurite

### Category D: Performance Issues
1. Check `host.json` concurrency settings
2. Look for synchronous blocking in async functions
3. Check for SDK client recreation (should be module-level)
4. Monitor with `fnx start --verbose` for slow worker init
