import { basename, resolve as resolvePath, join } from 'node:path';
import { access, constants, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

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
      stdio: options.silent ? 'pipe' : 'inherit',
      env: process.env,
    });

    let stderr = '';
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
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
  const appConfigPath = resolvePath(scriptRoot, 'app.config.json');
  const localSettingsPath = resolvePath(scriptRoot, 'local.settings.json');

  const parseIfExists = async (filePath) => {
    try {
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const appConfig = await parseIfExists(appConfigPath);
  const localSettings = await parseIfExists(localSettingsPath);
  return appConfig?.Values?.FUNCTIONS_WORKER_RUNTIME || localSettings?.Values?.FUNCTIONS_WORKER_RUNTIME || null;
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

    console.log(`Packing runtime '${resolvedRuntime}' from ${sourceDir}`);
    await zipDirectory(sourceDir, resolvedOutput);
    console.log(`Created package: ${resolvedOutput}`);

    return {
      runtime: resolvedRuntime,
      sourceDir,
      outputPath: resolvedOutput,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
