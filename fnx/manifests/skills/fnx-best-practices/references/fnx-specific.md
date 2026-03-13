# fnx-Specific Best Practices

Practices unique to fnx that are not covered in general Azure Functions documentation.

## Two-File Configuration Model

fnx separates config into two files to prevent secret leakage:

| File | Content | Git | AI-Safe |
|------|---------|-----|---------|
| `app-config.yaml` | Runtime, SKU, scale, behavioral settings | ✅ Commit | ✅ Safe to read |
| `local.settings.json` | Connection strings, API keys, secrets | ❌ .gitignore | ⚠️ Contains secrets |

### Migration from Legacy Config

If only `local.settings.json` exists (legacy pattern), run:
```bash
fnx config migrate
```
This extracts non-secret settings to `app-config.yaml` and leaves only secrets in `local.settings.json`.

### Secret Detection

fnx automatically detects secrets in `app-config.yaml`:
- Key patterns: `ConnectionString`, `Password`, `Secret`, `ApiKey`, `Token`, `SAS_*`
- Value patterns: `DefaultEndpointsProtocol=`, `AccountKey=`, `SharedAccessSignature=`, `sb://`
- Safe exception: `UseDevelopmentStorage=true` (Azurite marker)

Run `fnx config validate` to check for accidentally committed secrets.

## app-config.yaml Structure

```yaml
local:
  targetSku: flex              # Which SKU to emulate

runtime:
  name: node                   # python, dotnet-isolated, java, powershell
  version: "20"                # Optional: runtime version

scaleAndConcurrency:           # Mirrors ARM functionAppConfig
  maxInstanceCount: 200

configurations:                # Non-secret app settings
  AzureWebJobsFeatureFlags: EnableWorkerIndexing
  LogLevel: Information
```

## fnx doctor — Pre-Flight Checks

Always run `fnx doctor` before `fnx start` to catch issues:

1. host.json present and valid (version 2.0)
2. app-config.yaml schema valid, no secrets
3. local.settings.json present and valid JSON
4. Worker runtime configured
5. Host cache populated (~/.fnx/hosts/)
6. Ports 7071 and 7072 available
7. Azurite status

## CI/Docker Optimization

```bash
# Pre-download host binaries in Docker build
fnx warmup --all

# Skip download in CI if already cached
FNX_SKIP_DOWNLOAD=1 fnx start

# Keep only 1 cached version to save disk
fnx sync --keep 1
```

## SKU Profile Override

For testing against custom or pre-release host versions:
```bash
fnx start --profiles ./my-profiles.json
# Or via environment variable:
export FUNC_PROFILES_URL=https://my-cdn/profiles.json
```

## Azurite Integration

fnx auto-starts Azurite when storage triggers are detected. To disable:
```bash
fnx start --no-azurite
```

For explicit Azurite connection (if auto-detection fails):
```json
{
  "Values": {
    "AzureWebJobsStorage": "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8...;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;"
  }
}
```
