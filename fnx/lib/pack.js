import { basename, resolve as resolvePath, join } from 'node:path';
import { access, constants, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { loadFuncIgnore, getFilteredFiles } from './funcignore.js';

const RUNTIME_ALIASES = new Map([
  ['node', 'node'],
  ['nodejs', 'node'],
  ['javascript', 'node'],
  ['typescript', 'node'],
  ['python', 'python'],
  ['py', 'python'],
  ['java', 'java'],
  ['powershell', 'powershell'],
  ['pwsh', 'powershell'],
  ['dotnet-isolated', 'dotnet-isolated'],
  ['dotnetisolated', 'dotnet-isolated'],
]);

export const SUPPORTED_PACK_RUNTIMES = ['python', 'node', 'java', 'powershell', 'dotnet-isolated'];

function normalizeRuntime(input) {
  return String(input || '').trim().toLowerCase();
}

export function resolvePackRuntime(input) {
  const normalized = normalizeRuntime(input);

  if (!normalized) {
    throw new Error('Missing runtime. Set FUNCTIONS_WORKER_RUNTIME or pass --runtime.');
  }

  if (normalized === 'dotnet') {
    throw new Error('Only .NET isolated worker is supported for packing. Use dotnet-isolated runtime.');
  }

  const runtime = RUNTIME_ALIASES.get(normalized);
  if (!runtime) {
    throw new Error(
      `Unsupported runtime '${input}'. Supported values: ${SUPPORTED_PACK_RUNTIMES.join(', ')}.`
    );
  }

  return runtime;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: options.stdinFile ? ['pipe', 'inherit', 'pipe'] : (options.silent ? 'pipe' : 'inherit'),
      env: process.env,
    });

    let stderr = '';
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    // Pipe file content to stdin if specified
    if (options.stdinFile) {
      readFile(options.stdinFile, 'utf-8').then((content) => {
        child.stdin.end(content);
      }).catch(reject);
    }

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${command} ${args.join(' ')} failed with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

async function ensureExists(pathToCheck) {
  await access(pathToCheck, constants.F_OK);
}

async function zipDirectory(sourceDir, outputZip) {
  await runCommand('zip', ['-r', '-q', outputZip, '.'], { cwd: sourceDir });
}

async function zipFilteredFiles(sourceDir, outputZip, files) {
  // Write file list to a temp file for zip -@ (read names from stdin)
  const listFile = join(tmpdir(), `fnx-pack-${Date.now()}.txt`);
  try {
    await writeFile(listFile, files.join('\n'), 'utf-8');
    await runCommand('zip', ['-q', outputZip, '-@'], {
      cwd: sourceDir,
      stdinFile: listFile,
    });
  } finally {
    await rm(listFile, { force: true });
  }
}

async function stageJavaBuild(scriptRoot) {
  await runCommand('mvn', ['clean', 'package', '-DskipTests'], { cwd: scriptRoot });
  const targetDir = resolvePath(scriptRoot, 'target', 'azure-functions');
  await ensureExists(targetDir);
  return targetDir;
}

async function stageDotnetIsolatedBuild(scriptRoot, tempRoot) {
  const publishDir = resolvePath(tempRoot, 'publish');
  await runCommand('dotnet', ['publish', '--configuration', 'Release', '--output', publishDir], { cwd: scriptRoot });
  await ensureExists(publishDir);
  return publishDir;
}

export async function detectRuntimeFromConfig(scriptRoot) {
  // Try app-config.yaml first (new format), then fall back to app.config.json (legacy)
  const { parse: parseYaml } = await import('yaml');

  const tryRead = async (filePath) => {
    try { return await readFile(filePath, 'utf-8'); } catch { return null; }
  };

  // app-config.yaml: runtime.name
  const yamlContent = await tryRead(resolvePath(scriptRoot, 'app-config.yaml'));
  if (yamlContent) {
    const config = parseYaml(yamlContent);
    if (config?.runtime?.name) return config.runtime.name;
  }

  // Legacy app.config.json: Values.FUNCTIONS_WORKER_RUNTIME
  const jsonContent = await tryRead(resolvePath(scriptRoot, 'app.config.json'));
  if (jsonContent) {
    try {
      const config = JSON.parse(jsonContent);
      if (config?.Values?.FUNCTIONS_WORKER_RUNTIME) return config.Values.FUNCTIONS_WORKER_RUNTIME;
    } catch { /* ignore */ }
  }

  // local.settings.json fallback
  const localContent = await tryRead(resolvePath(scriptRoot, 'local.settings.json'));
  if (localContent) {
    try {
      const config = JSON.parse(localContent);
      if (config?.Values?.FUNCTIONS_WORKER_RUNTIME) return config.Values.FUNCTIONS_WORKER_RUNTIME;
    } catch { /* ignore */ }
  }

  return null;
}

export async function packFunctionApp({ scriptRoot, runtime, outputPath, noBuild = false }) {
  const root = resolvePath(scriptRoot || process.cwd());
  const resolvedRuntime = resolvePackRuntime(runtime);
  const resolvedOutput = resolvePath(outputPath || `${basename(root)}.zip`);

  const tempRoot = await mkdtemp(join(tmpdir(), 'fnx-pack-'));

  try {
    let sourceDir = root;

    if (!noBuild) {
      if (resolvedRuntime === 'java') {
        sourceDir = await stageJavaBuild(root);
      } else if (resolvedRuntime === 'dotnet-isolated') {
        sourceDir = await stageDotnetIsolatedBuild(root, tempRoot);
      }
    }

    // Always read .funcignore from PROJECT ROOT, not sourceDir (build output)
    const funcIgnore = await loadFuncIgnore(root, { runtime: resolvedRuntime });
    const files = await getFilteredFiles(sourceDir, funcIgnore);

    console.log(`Packing runtime '${resolvedRuntime}' from ${sourceDir} (${files.length} files)`);

    if (files.length === 0) {
      throw new Error('No files to pack after applying .funcignore filters.');
    }

    await zipFilteredFiles(sourceDir, resolvedOutput, files);
    console.log(`Created package: ${resolvedOutput}`);

    return {
      runtime: resolvedRuntime,
      sourceDir,
      outputPath: resolvedOutput,
      filesIncluded: files.length,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
