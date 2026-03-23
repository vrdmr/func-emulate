/**
 * Template downloading and project scaffolding for fnx init
 *
 * Download strategy (adapts based on git availability):
 * | folderPath | git available | Action                                         |
 * |------------|---------------|------------------------------------------------|
 * | "."        | Yes           | git clone --depth 1                            |
 * | "."        | No            | Download zip archive, extract                  |
 * | "<path>"   | Yes           | git clone --filter=blob:none + sparse-checkout |
 * | "<path>"   | No            | GitHub API file-by-file                        |
 *
 * Exports:
 * - downloadTemplate(template, targetDir, manifest, options) — Download template files
 * - generateConfigFiles(targetDir, options) — Generate app-config.yaml
 * - printSuccessBanner(targetDir, projectName, sku, runtime, envSetupDone) — Print success message
 */

import { mkdir, writeFile, rm, rename, readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { title, info, success, dim, bold, funcName } from '../colors.js';
import { getDefaultVersion } from '../runtimes.js';
import { createAppConfig } from '../config.js';

/**
 * Validate that a file path is within the target directory (prevent path traversal)
 * @param {string} targetDir - Base directory
 * @param {string} fileName - File name to validate
 * @returns {string} Safe file path
 * @throws {Error} If path traversal is detected
 */
function safePath(targetDir, fileName) {
  const filePath = join(targetDir, fileName);
  const resolvedPath = resolve(filePath);
  const resolvedTarget = resolve(targetDir);
  if (!resolvedPath.startsWith(resolvedTarget + sep) && resolvedPath !== resolvedTarget) {
    throw new Error(`Path traversal detected: ${fileName}`);
  }
  return filePath;
}

/**
 * Check if git is available on the system
 * @returns {Promise<boolean>}
 */
async function hasGit() {
  return new Promise((resolve) => {
    const proc = spawn('git', ['--version'], { stdio: 'ignore', shell: true });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

/**
 * Run a git command and return success/failure
 * @param {string[]} args - Git arguments
 * @param {string} cwd - Working directory
 * @param {boolean} verbose - Log output
 * @returns {Promise<{success: boolean, output?: string}>}
 */
function runGit(args, cwd, verbose = false) {
  return new Promise((resolve) => {
    const proc = spawn('git', args, { cwd, shell: true, stdio: verbose ? 'inherit' : 'pipe' });
    let output = '';
    if (!verbose && proc.stdout) {
      proc.stdout.on('data', (d) => { output += d.toString(); });
    }
    if (!verbose && proc.stderr) {
      proc.stderr.on('data', (d) => { output += d.toString(); });
    }
    proc.on('close', (code) => resolve({ success: code === 0, output }));
    proc.on('error', (err) => resolve({ success: false, output: err.message }));
  });
}

/**
 * Download template files from GitHub
 * @param {Object} template - Template object from manifest
 * @param {string} targetDir - Target directory
 * @param {Object} manifest - Full manifest (for base URL)
 * @param {Object} options - Options
 * @returns {Promise<{success: boolean, filesDownloaded: number, error?: string}>}
 */
export async function downloadTemplate(template, targetDir, manifest, options = {}) {
  const { verbose } = options;

  // Parse repository URL to get owner/repo (with null-safe access)
  const repoUrl = template.repositoryUrl || manifest?.repositoryUrl || 'https://github.com/Azure/azure-functions-templates-mcp-server';
  // Validate URL scheme and extract owner/repo
  const repoMatch = repoUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)/);

  if (!repoMatch) {
    const error = `Could not parse repository URL: ${repoUrl}`;
    if (verbose) console.log(dim(`  Warning: ${error}`));
    return { success: false, filesDownloaded: 0, error };
  }

  const [, owner, repo] = repoMatch;
  
  // Security: Only allow Azure or Azure-Samples repos (defense against compromised manifest)
  const allowedOrgs = ['azure', 'azure-samples'];
  if (!allowedOrgs.includes(owner.toLowerCase())) {
    const error = `Template references untrusted repository (${owner}/${repo}). Please report this issue.`;
    if (verbose) console.log(dim(`  Warning: ${error}`));
    return { success: false, filesDownloaded: 0, error };
  }

  const folderPath = template.folderPath || '.';
  const isWholeRepo = folderPath === '.';

  if (verbose) {
    console.log(dim(`  Repository: ${owner}/${repo}`));
    console.log(dim(`  Folder: ${folderPath}`));
  }

  const gitAvailable = await hasGit();
  if (verbose) {
    console.log(dim(`  Git available: ${gitAvailable ? 'yes' : 'no'}`));
  }

  let result;
  try {
    if (isWholeRepo) {
      // Clone entire repo
      if (gitAvailable) {
        result = await cloneRepo(owner, repo, targetDir, verbose);
      } else {
        result = await downloadZip(owner, repo, targetDir, verbose);
      }
    } else {
      // Download subfolder
      if (gitAvailable) {
        result = await sparseCheckout(owner, repo, folderPath, targetDir, verbose);
      } else {
        result = await downloadViaApi(owner, repo, folderPath, targetDir, verbose);
      }
    }
  } catch (err) {
    return { success: false, filesDownloaded: 0, error: err.message };
  }

  return result || { success: true, filesDownloaded: 0 };
}

/**
 * Clone entire repo with --depth 1
 * @returns {Promise<{success: boolean, filesDownloaded: number, error?: string}>}
 */
async function cloneRepo(owner, repo, targetDir, verbose) {
  const repoUrl = `https://github.com/${owner}/${repo}.git`;
  
  if (verbose) console.log(dim(`  Cloning ${repoUrl}...`));

  // Clone into a temp directory first, then move contents
  const tempDir = join(dirname(targetDir), `.fnx-clone-${Date.now()}-${randomUUID().slice(0, 8)}`);
  
  const result = await runGit(['clone', '--depth', '1', repoUrl, tempDir], dirname(tempDir), verbose);
  
  if (!result.success) {
    if (verbose) console.log(dim(`  Warning: git clone failed: ${result.output}`));
    await rm(tempDir, { recursive: true, force: true });
    return { success: false, filesDownloaded: 0, error: `git clone failed: ${result.output}` };
  }

  // Move contents from temp to target (excluding .git)
  await mkdir(targetDir, { recursive: true });
  const items = await readdir(tempDir);
  let filesDownloaded = 0;
  for (const item of items) {
    if (item === '.git') continue;
    const src = join(tempDir, item);
    const dest = join(targetDir, item);
    await rename(src, dest);
    filesDownloaded++;
  }

  // Cleanup temp directory
  await rm(tempDir, { recursive: true, force: true });
  
  if (verbose) console.log(dim(`  Clone complete`));
  return { success: true, filesDownloaded };
}

/**
 * Use git sparse-checkout to download only a subfolder
 * Uses: git clone --filter=blob:none --no-checkout, then sparse-checkout
 * @returns {Promise<{success: boolean, filesDownloaded: number, error?: string}>}
 */
async function sparseCheckout(owner, repo, folderPath, targetDir, verbose) {
  const repoUrl = `https://github.com/${owner}/${repo}.git`;
  
  if (verbose) console.log(dim(`  Sparse checkout: ${folderPath}...`));

  const tempDir = join(dirname(targetDir), `.fnx-sparse-${Date.now()}-${randomUUID().slice(0, 8)}`);

  // Clone with blob filter (no file content downloaded yet)
  let result = await runGit(
    ['clone', '--filter=blob:none', '--no-checkout', '--depth', '1', '--sparse', repoUrl, tempDir],
    dirname(tempDir),
    verbose
  );
  if (!result.success) {
    if (verbose) console.log(dim(`  Falling back to API download`));
    await rm(tempDir, { recursive: true, force: true });
    return downloadViaApi(owner, repo, folderPath, targetDir, verbose);
  }

  // Set sparse-checkout to the specific folder
  result = await runGit(['sparse-checkout', 'set', folderPath], tempDir, verbose);
  if (!result.success) {
    await rm(tempDir, { recursive: true, force: true });
    return downloadViaApi(owner, repo, folderPath, targetDir, verbose);
  }

  // Checkout to actually download the files
  result = await runGit(['checkout'], tempDir, verbose);
  if (!result.success) {
    await rm(tempDir, { recursive: true, force: true });
    return downloadViaApi(owner, repo, folderPath, targetDir, verbose);
  }

  // Move the subfolder contents to target
  const sourceDir = join(tempDir, folderPath);
  let filesDownloaded = 0;
  if (existsSync(sourceDir)) {
    await mkdir(targetDir, { recursive: true });
    const items = await readdir(sourceDir);
    for (const item of items) {
      const src = join(sourceDir, item);
      const dest = join(targetDir, item);
      await rename(src, dest);
      filesDownloaded++;
    }
  }

  // Cleanup
  await rm(tempDir, { recursive: true, force: true });
  
  if (verbose) console.log(dim(`  Sparse checkout complete`));
  return { success: filesDownloaded > 0, filesDownloaded, error: filesDownloaded === 0 ? 'No files found in template folder' : undefined };
}

/**
 * Download repo as zip and extract (fallback when git not available)
 * Uses platform-specific extraction: PowerShell on Windows, unzip on Unix
 */
async function downloadZip(owner, repo, targetDir, verbose) {
  if (verbose) console.log(dim(`  Downloading zip archive...`));

  const tempDir = join(dirname(targetDir), `.fnx-zip-${Date.now()}-${randomUUID().slice(0, 8)}`);
  const zipPath = join(tempDir, 'repo.zip');
  
  try {
    await mkdir(tempDir, { recursive: true });
  } catch (err) {
    return { success: false, filesDownloaded: 0, error: `Cannot create temp directory: ${err.message}` };
  }

  // Try main branch first, then master
  let zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/main.zip`;
  let response;
  
  try {
    response = await fetch(zipUrl);
    if (!response.ok) {
      zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/master.zip`;
      response = await fetch(zipUrl);
    }
  } catch (err) {
    if (verbose) console.log(dim(`  Warning: fetch failed: ${err.message}`));
    await rm(tempDir, { recursive: true, force: true });
    return downloadViaApi(owner, repo, '.', targetDir, verbose);
  }

  if (!response.ok) {
    if (verbose) console.log(dim(`  Warning: Could not download zip: ${response.status}`));
    await rm(tempDir, { recursive: true, force: true });
    // Fallback to API
    return downloadViaApi(owner, repo, '.', targetDir, verbose);
  }

  try {
    // Save zip to temp file
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(zipPath, buffer);

    // Extract using platform-specific command
    const extractDir = join(tempDir, 'extracted');
    await mkdir(extractDir, { recursive: true });

    const isWindows = process.platform === 'win32';
    let extractResult;

    if (isWindows) {
      // PowerShell Expand-Archive with -LiteralPath to avoid injection
      // Escape single quotes by doubling them for PowerShell string safety
      const safeZipPath = zipPath.replace(/'/g, "''");
      const safeExtractDir = extractDir.replace(/'/g, "''");
      extractResult = await runCommand(
        'powershell',
        ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${safeZipPath}' -DestinationPath '${safeExtractDir}' -Force`],
        tempDir,
        verbose
      );
    } else {
      // Unix unzip
      extractResult = await runCommand('unzip', ['-q', zipPath, '-d', extractDir], tempDir, verbose);
    }

    if (!extractResult.success) {
      if (verbose) console.log(dim(`  Warning: Zip extraction failed, using API fallback`));
      await rm(tempDir, { recursive: true, force: true });
      return downloadViaApi(owner, repo, '.', targetDir, verbose);
    }

    // GitHub zips have a top-level folder like "repo-main/", move contents up
    const extractedItems = await readdir(extractDir);
    const repoFolder = extractedItems.find(item => item.startsWith(`${repo}-`));
    const sourceDir = repoFolder ? join(extractDir, repoFolder) : extractDir;

    // Move contents to target
    await mkdir(targetDir, { recursive: true });
    const items = await readdir(sourceDir);
    for (const item of items) {
      const src = join(sourceDir, item);
      const dest = join(targetDir, item);
      await rename(src, dest);
    }

    if (verbose) console.log(dim(`  Zip extraction complete`));
  } catch (err) {
    if (verbose) console.log(dim(`  Warning: Zip extraction failed: ${err.message}`));
    await rm(tempDir, { recursive: true, force: true });
    return downloadViaApi(owner, repo, '.', targetDir, verbose);
  }

  // Cleanup
  await rm(tempDir, { recursive: true, force: true });
  
  // Count files in target
  const files = await readdir(targetDir);
  return { success: files.length > 0, filesDownloaded: files.length };
}

/**
 * Run a command and return success/failure
 */
function runCommand(cmd, args, cwd, verbose = false) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd, shell: true, stdio: verbose ? 'inherit' : 'pipe' });
    let output = '';
    if (!verbose && proc.stdout) {
      proc.stdout.on('data', (d) => { output += d.toString(); });
    }
    if (!verbose && proc.stderr) {
      proc.stderr.on('data', (d) => { output += d.toString(); });
    }
    proc.on('close', (code) => resolve({ success: code === 0, output }));
    proc.on('error', (err) => resolve({ success: false, output: err.message }));
  });
}

/**
 * Download files via GitHub API (fallback method)
 * @returns {Promise<{success: boolean, filesDownloaded: number, error?: string}>}
 */
async function downloadViaApi(owner, repo, folderPath, targetDir, verbose) {
  await mkdir(targetDir, { recursive: true });

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${folderPath === '.' ? '' : folderPath}`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'fnx-cli',
      },
    });

    if (!response.ok) {
      const error = `GitHub API error: ${response.status}`;
      if (verbose) console.log(dim(`  Warning: Could not fetch template listing: ${response.status}`));
      return { success: false, filesDownloaded: 0, error };
    }

    const contents = await response.json();
    let filesDownloaded = 0;

    for (const item of contents) {
      if (item.type === 'file') {
        const filePath = safePath(targetDir, item.name);
        const downloaded = await downloadFile(item.download_url, filePath);
        if (downloaded) filesDownloaded++;
      } else if (item.type === 'dir') {
        const subDir = safePath(targetDir, item.name);
        const dirResult = await downloadDirectory(owner, repo, item.path, subDir, verbose);
        filesDownloaded += dirResult;
      }
    }

    if (verbose && filesDownloaded > 0) {
      console.log(dim(`  Downloaded ${filesDownloaded} files via API`));
    }

    return { success: filesDownloaded > 0, filesDownloaded, error: filesDownloaded === 0 ? 'No files downloaded' : undefined };
  } catch (err) {
    if (verbose) console.log(dim(`  Warning: Template download failed: ${err.message}`));
    return { success: false, filesDownloaded: 0, error: err.message };
  }
}

/**
 * Recursively download a directory from GitHub
 */
async function downloadDirectory(owner, repo, path, targetDir, verbose) {
  await mkdir(targetDir, { recursive: true });

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  let filesDownloaded = 0;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'fnx-cli',
      },
    });

    if (!response.ok) return 0;

    const contents = await response.json();

    for (const item of contents) {
      if (item.type === 'file') {
        const filePath = safePath(targetDir, item.name);
        const downloaded = await downloadFile(item.download_url, filePath);
        if (downloaded) filesDownloaded++;
      } else if (item.type === 'dir') {
        const subDir = safePath(targetDir, item.name);
        filesDownloaded += await downloadDirectory(owner, repo, item.path, subDir, verbose);
      }
    }
  } catch {
    // Skip failed directories
  }
  return filesDownloaded;
}

/**
 * Download a single file from URL
 * @returns {Promise<boolean>} true if download succeeded
 */
async function downloadFile(url, filePath) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return false;
    }
    const content = await response.text();
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate fnx-specific configuration files (app-config.yaml only)
 * Other files (host.json, local.settings.json, etc.) come from template download
 * @param {string} targetDir - Target directory
 * @param {Object} options - Project options
 */
export async function generateConfigFiles(targetDir, options) {
  const { runtime, version, sku, verbose } = options;

  // Replace template placeholders with runtime version
  await replaceTemplatePlaceholders(targetDir, runtime, version, verbose);

  // Map CLI runtime to worker runtime name
  const workerRuntimeMap = {
    'python': 'python',
    'node': 'node',
    'typescript': 'node',
    'javascript': 'node',
    'dotnet-isolated': 'dotnet-isolated',
    'java': 'java',
    'powershell': 'powershell',
  };
  const runtimeName = workerRuntimeMap[runtime] || runtime;
  const runtimeVersion = version || getDefaultVersion(runtime) || getDefaultVersion(runtimeName);

  // Create app-config.yaml using shared config.js function
  const created = await createAppConfig(targetDir, {
    runtime: runtimeName,
    version: runtimeVersion,
    sku,
  }, { silent: !verbose });

  if (verbose && created) {
    console.log(dim(`  Generated: app-config.yaml`));
  }
}

/**
 * Replaces template placeholders with the provided runtime version.
 * For Java: replaces {{javaVersion}} with the provided version
 *   - For <java.version> (Maven compiler): converts "8" to "1.8"
 *   - For <javaVersion> (Azure runtime): keeps as-is (e.g., "8")
 * For TypeScript/Node: replaces {{nodeVersion}} with the provided version
 * @param {string} targetDir - Target directory
 * @param {string} runtime - Runtime name
 * @param {string|null} userVersion - User-specified version (null for default)
 * @param {boolean} verbose - Log replacements
 */
async function replaceTemplatePlaceholders(targetDir, runtime, userVersion, verbose) {
  const version = userVersion || getDefaultVersion(runtime);
  if (!version) return;

  const normalizedRuntime = runtime.toLowerCase();

  // Node.js / TypeScript: package.json
  if (['node', 'typescript', 'javascript'].includes(normalizedRuntime)) {
    const packageJsonPath = join(targetDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        let content = await readFile(packageJsonPath, 'utf-8');
        if (content.includes('{{nodeVersion}}')) {
          content = content.replace(/\{\{nodeVersion\}\}/g, version);
          await writeFile(packageJsonPath, content);
          if (verbose) console.log(dim(`  Replaced {{nodeVersion}} with ${version} in package.json`));
        }
      } catch (err) {
        if (verbose) console.log(dim(`  Warning: Could not process package.json: ${err.message}`));
      }
    }

    // TypeScript: Generate tsconfig.json if missing (some templates don't include it)
    // Only generate if this is a TypeScript project (has .ts files or typescript in package.json)
    const tsconfigPath = join(targetDir, 'tsconfig.json');
    if (!existsSync(tsconfigPath)) {
      const srcDir = join(targetDir, 'src');
      const hasTypeScriptFiles = existsSync(srcDir) && 
        (await readdir(srcDir, { recursive: true }).catch(() => []))
          .some(f => f.endsWith('.ts'));
      const packageJsonPath2 = join(targetDir, 'package.json');
      const hasTypeScriptDep = existsSync(packageJsonPath2) &&
        (await readFile(packageJsonPath2, 'utf-8').catch(() => ''))
          .includes('"typescript"');

      if (normalizedRuntime === 'typescript' || hasTypeScriptFiles || hasTypeScriptDep) {
        const tsconfig = {
          compilerOptions: {
            module: 'commonjs',
            target: 'es2018',
            outDir: 'dist',
            rootDir: '.',
            sourceMap: true,
            strict: false,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            resolveJsonModule: true,
          },
          include: ['src/**/*.ts'],
        };
        try {
          await writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2));
          if (verbose) console.log(dim(`  Generated tsconfig.json`));
        } catch (err) {
          if (verbose) console.log(dim(`  Warning: Could not generate tsconfig.json: ${err.message}`));
        }
      }
    }
  }

  // Java: pom.xml
  if (normalizedRuntime === 'java') {
    const pomPath = join(targetDir, 'pom.xml');
    if (existsSync(pomPath)) {
      try {
        let content = await readFile(pomPath, 'utf-8');
        if (content.includes('{{javaVersion}}')) {
          // For <java.version> (Maven compiler): convert "8" to "1.8", "11"+ stays as-is
          const mavenVersion = version === '8' ? '1.8' : version;
          
          // Replace <java.version>{{javaVersion}}</java.version> with Maven-compatible version
          content = content.replace(
            /<java\.version>\{\{javaVersion\}\}<\/java\.version>/g,
            `<java.version>${mavenVersion}</java.version>`
          );
          
          // Replace other {{javaVersion}} placeholders (e.g., <javaVersion>) with raw version
          content = content.replace(/\{\{javaVersion\}\}/g, version);
          
          await writeFile(pomPath, content);
          if (verbose) console.log(dim(`  Replaced {{javaVersion}} with ${version} in pom.xml`));
        }
      } catch (err) {
        if (verbose) console.log(dim(`  Warning: Could not process pom.xml: ${err.message}`));
      }
    }
  }
}

/**
 * Print success banner with next steps
 * @param {string} targetDir - Target directory
 * @param {string} projectName - Project name
 * @param {string} sku - Target SKU
 * @param {string} runtime - Runtime name (python, node, dotnet-isolated, java, powershell)
 */
export function printSuccessBanner(targetDir, projectName, sku, runtime, envSetupDone = false) {
  const cwd = process.cwd();
  const relativePath = targetDir === cwd ? '.' : targetDir.replace(cwd, '.').replace(/\\/g, '/');

  // Runtime-specific install steps (skip if --env already did setup)
  let installStep;
  let extraSteps = 0;
  
  if (envSetupDone) {
    // Environment already set up via --env flag
    // But TypeScript still needs build step
    if (runtime === 'typescript') {
      installStep = `${dim('2.')} ${bold('npm run build')}`;
    } else {
      installStep = `${dim('2.')} ${dim('(Dependencies already installed via --env)')}`;
    }
  } else {
    switch (runtime) {
      case 'python':
        installStep = `${dim('2.')} ${bold('python -m venv .venv && .venv\\Scripts\\activate')} ${dim('(Windows)')}
       ${dim('or')} ${bold('python -m venv .venv && source .venv/bin/activate')} ${dim('(Linux/macOS)')}
    ${dim('3.')} ${bold('pip install -r requirements.txt')}`;
        extraSteps = 1;
        break;
      case 'typescript':
        installStep = `${dim('2.')} ${bold('npm install')}
    ${dim('3.')} ${bold('npm run build')}`;
        extraSteps = 1;
        break;
      case 'node':
      case 'javascript':
        installStep = `${dim('2.')} ${bold('npm install')}`;
        break;
      case 'dotnet-isolated':
        installStep = `${dim('2.')} ${bold('dotnet restore')}`;
        break;
      case 'java':
        installStep = `${dim('2.')} ${bold('mvn clean package')}`;
        break;
      case 'powershell':
        installStep = `${dim('2.')} ${dim('(No dependencies to install)')}`;
        break;
      default:
        installStep = `${dim('2.')} ${bold('Install dependencies')}`;
    }
  }

  // Adjust fnx start step number based on extra steps
  // Also adjust if we skip the cd step (when initializing in current directory)
  const isCurrentDir = relativePath === '.';
  const cdStepOffset = isCurrentDir ? -1 : 0;
  const startStepNum = `${3 + extraSteps + cdStepOffset}.`;

  // Build the cd step (skip if current directory)
  const cdStep = isCurrentDir ? '' : `  ${dim('1.')} ${bold('cd ' + relativePath)}\n`;
  
  // Renumber install step if we skip cd
  const installStepNum = isCurrentDir ? '1.' : '2.';
  const renumberedInstallStep = installStep.replace(/^(\s*)2\./, `$1${installStepNum}`);

  console.log(`
${success('✓')} ${bold('Project created successfully!')}

${title('Project:')}     ${funcName(projectName)}
${title('Location:')}    ${dim(relativePath)}
${title('Target SKU:')}  ${info(sku)}

${title('Next steps:')}

${cdStep}  ${renumberedInstallStep}
  ${dim(startStepNum)} ${bold('fnx start')}

${dim('For more templates:')}
  ${bold('fnx init --template <name>')}`);
}
