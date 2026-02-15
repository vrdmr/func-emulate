import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const MIGRATION_URL = 'https://learn.microsoft.com/azure/azure-functions/migrate-dotnet-to-isolated-model';

/**
 * Scan scriptRoot for .csproj files and determine .NET hosting model.
 * Returns: { isDotnet: boolean, isInProcess: boolean, csprojPath: string|null }
 *
 * Detection:
 *   - Microsoft.Azure.Functions.Worker.Sdk  → isolated (supported)
 *   - Microsoft.NET.Sdk.Functions           → in-process (blocked)
 */
export async function detectDotnetModel(scriptRoot) {
  let files;
  try {
    files = await readdir(scriptRoot);
  } catch {
    return { isDotnet: false, isInProcess: false, csprojPath: null };
  }

  const csprojFiles = files.filter(f => f.endsWith('.csproj'));
  if (csprojFiles.length === 0) {
    return { isDotnet: false, isInProcess: false, csprojPath: null };
  }

  for (const file of csprojFiles) {
    const fullPath = join(scriptRoot, file);
    let content;
    try {
      content = await readFile(fullPath, 'utf-8');
    } catch {
      continue;
    }

    // Check for in-process SDK (Microsoft.NET.Sdk.Functions)
    if (content.includes('Microsoft.NET.Sdk.Functions')) {
      return { isDotnet: true, isInProcess: true, csprojPath: fullPath };
    }

    // Check for isolated worker SDK
    if (content.includes('Microsoft.Azure.Functions.Worker.Sdk')) {
      return { isDotnet: true, isInProcess: false, csprojPath: fullPath };
    }
  }

  // .csproj found but no known Functions SDK — not a Functions .NET project
  return { isDotnet: false, isInProcess: false, csprojPath: null };
}

export function printInProcessError(csprojPath) {
  console.error(`Error: fnx does not support the in-process hosting model.

Your project uses Microsoft.NET.Sdk.Functions (in-process).
fnx only supports the isolated worker model (Microsoft.Azure.Functions.Worker.Sdk).

Detected in: ${csprojPath}

To migrate: ${MIGRATION_URL}`);
}
