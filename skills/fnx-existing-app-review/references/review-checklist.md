# Existing App Review Checklist

## Minimum checks

- `host.json` exists
- `local.settings.json` exists or there is a clear secret strategy
- `app-config.yaml` exists or can be generated
- runtime can be inferred
- target SKU is known or can be chosen

## Best next command by situation

| Situation | Next command |
| --- | --- |
| Repo health unclear | `fnx doctor` |
| Config needs explanation | `fnx config` |
| Need `app-config.yaml` | `fnx config migrate` |
| Ready to emulate locally | `fnx start --sku <target>` |
| Preparing CI/offline usage | `fnx warmup` |

