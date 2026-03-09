/**
 * Project detection — analyzes the current directory to identify
 * Azure Functions project type, runtime, SKU, and functions.
 */

import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

/**
 * Detect Azure Functions project metadata from the given directory.
 * @param {string} appPath - Path to the function app directory
 * @returns {Promise<object|null>} Detected project info or null
 */
export async function detectProject(appPath) {
  // Must have host.json to be an Azure Functions project
  if (!existsSync(join(appPath, 'host.json'))) {
    return null;
  }

  const project = {
    runtime: null,
    language: null,
    programmingModel: null,
    sku: 'flex',
    functions: [],
    path: appPath,
  };

  // Detect runtime and language
  if (existsSync(join(appPath, 'package.json'))) {
    await detectNodeProject(appPath, project);
  } else if (existsSync(join(appPath, 'requirements.txt'))) {
    project.runtime = 'python';
    project.programmingModel = 'v2';
    project.language = 'python';
  } else if (await hasGlob(appPath, '.csproj')) {
    project.runtime = 'dotnet-isolated';
    project.language = 'csharp';
  } else if (existsSync(join(appPath, 'pom.xml'))) {
    project.runtime = 'java';
    project.language = 'java';
  }

  // Detect SKU from app-config.yaml
  await detectSku(appPath, project);

  // Detect functions
  await detectFunctions(appPath, project);

  return project.runtime ? project : null;
}

async function detectNodeProject(appPath, project) {
  project.runtime = 'node';
  try {
    const pkg = JSON.parse(await readFile(join(appPath, 'package.json'), 'utf8'));
    const afVersion = pkg.dependencies?.['@azure/functions'] || '';
    project.programmingModel = afVersion.startsWith('3') ? 'v3' : 'v4';
    project.language = existsSync(join(appPath, 'tsconfig.json')) ? 'typescript' : 'javascript';
  } catch {
    project.programmingModel = 'v4';
    project.language = 'javascript';
  }
}

async function detectSku(appPath, project) {
  // Try app-config.yaml first
  const configPath = join(appPath, 'app-config.yaml');
  if (existsSync(configPath)) {
    try {
      const content = await readFile(configPath, 'utf8');
      const match = content.match(/targetSku:\s*(\S+)/);
      if (match) { project.sku = match[1]; return; }
    } catch { /* ignore */ }
  }
  // Default: flex
  project.sku = 'flex';
}

async function detectFunctions(appPath, project) {
  // Node.js v4: scan src/functions/ for .js/.ts files
  const funcDirs = ['src/functions', 'src', '.'];
  for (const dir of funcDirs) {
    const fullDir = join(appPath, dir);
    if (!existsSync(fullDir)) continue;
    try {
      const files = await readdir(fullDir);
      for (const file of files) {
        if (/\.(js|ts)$/.test(file) && !file.startsWith('index') && !file.includes('.test.') && !file.includes('.spec.')) {
          // Quick check for trigger registration patterns
          try {
            const content = await readFile(join(fullDir, file), 'utf8');
            const triggerMatch = content.match(/app\.(http|timer|storageQueue|serviceBusQueue|cosmosDB|eventHub|storageBlob)\s*\(\s*['"]([^'"]+)['"]/);
            if (triggerMatch) {
              project.functions.push({
                name: triggerMatch[2],
                type: triggerMatch[1] + 'Trigger',
                file: join(dir, file),
              });
            }
          } catch { /* skip unreadable files */ }
        }
      }
      if (project.functions.length > 0) break;
    } catch { /* dir not readable */ }
  }
}

async function hasGlob(dir, ext) {
  try {
    const files = await readdir(dir);
    return files.some(f => f.endsWith(ext));
  } catch { return false; }
}
