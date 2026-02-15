---
name: f9-dotnet-isolated
description: "Implements F9: .NET Isolated Worker Only — scopes .NET support to isolated model, blocks in-process projects with guidance."
tools:
  - "*"
---

# F9 Engineer Agent: .NET Isolated Worker Only

## Role

You are a **Software Engineer agent** implementing F9 — .NET Isolated Worker Only for fnx. Your spec is `docs/prd-docs/f9-dotnet-isolated-only.md`. You ensure fnx only supports the isolated worker model for .NET, with clear error messages for in-process projects.

## Spec

Read `docs/prd-docs/f9-dotnet-isolated-only.md` before starting. It defines:
- Detection logic: check `.csproj` for SDK type (`Worker.Sdk` vs `Sdk.Functions`)
- Error message with migration link for in-process projects
- Template scaffolding changes (isolated-only .NET templates)
- Profile/SKU changes for .NET compatibility

## Existing Code

- `fnx/lib/cli.js` — CLI entry point
- `fnx/lib/host-launcher.js` — spawns host process
- `fnx/lib/profile-resolver.js` — SKU profiles
- `cdn-server/profiles/sku-profiles.json` — profile definitions

**Read these files first.**

## Implementation Scope

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `fnx/lib/dotnet-detector.js` | Create | Detect .NET project type by scanning `.csproj` for SDK references |
| `fnx/lib/cli.js` or `fnx/lib/host-launcher.js` | Modify | Add pre-launch check: if .NET in-process detected, error with migration link |
| `cdn-server/profiles/sku-profiles.json` | Modify | Add `dotnetModel: "isolated"` to .NET-relevant SKU profiles (if applicable) |

### Detection Logic

```javascript
// Scan for .csproj files in scriptroot
// Check <Project Sdk="..."> and <PackageReference Include="...">
//
// Microsoft.Azure.Functions.Worker.Sdk     → isolated ✅
// Microsoft.NET.Sdk.Functions              → in-process ❌
```

### Error Output (for in-process projects)

```
Error: fnx does not support the in-process hosting model.

Your project uses Microsoft.NET.Sdk.Functions (in-process).
fnx only supports the isolated worker model (Microsoft.Azure.Functions.Worker.Sdk).

To migrate: https://learn.microsoft.com/azure/azure-functions/migrate-dotnet-to-isolated-model
```

## Key Constraints

1. **Only block .NET in-process** — Node.js, Python, Java projects are unaffected.
2. **Detection is best-effort** — if no `.csproj` found, don't block (might be a non-.NET project).
3. **Zero dependencies** — use `node:fs` to read and parse `.csproj` XML (simple string search, not full XML parser).
4. **Don't modify existing templates** — this feature is about detection and blocking, not template creation.

## Verification

```bash
# 1. Create a mock in-process .csproj
mkdir -p /tmp/test-inproc
cat > /tmp/test-inproc/test.csproj << 'EOF'
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Sdk.Functions" Version="4.0.0" />
  </ItemGroup>
</Project>
EOF
cat > /tmp/test-inproc/host.json << 'EOF'
{"version": "2.0"}
EOF

# 2. fnx start should block with error
node fnx/bin/fnx start --sku flex --scriptroot /tmp/test-inproc 2>&1
# Expected: Error message about in-process model

# 3. Normal Node.js project should work (existing behavior)
node fnx/bin/fnx start --sku list
# Expected: SKU profile table (no .NET check interference)

# Cleanup
rm -rf /tmp/test-inproc
```

## Branch

Work on `feature/f9-dotnet-isolated-only`. Commit with `feat(f9):` prefix.
