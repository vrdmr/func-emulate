/**
 * fnx init — Initialize a new Azure Functions project
 *
 * Interactive flow:
 *   1. Check directory (empty or --force/--name)
 *   2. Prompt for runtime (Python, Node.js, .NET, Java, PowerShell)
 *   3. For Node.js: sub-prompt TypeScript vs JavaScript
 *   4. Fetch manifest, filter by runtime
 *   5. Prompt for trigger (prioritized list: HTTP, Blob, Timer, Queue, etc.)
 *   6. Prompt for project name
 *   7. Prompt for SKU (flex/premium/dedicated)
 *   8. Download template, generate config files
 *   9. Print success + next steps
 */

import { existsSync, readdirSync } from 'node:fs';
import { resolve as resolvePath, basename, join } from 'node:path';
import { spawn } from 'node:child_process';
import { title, info, success, error as errorColor, dim, bold, warning } from './colors.js';
import { fetchManifest } from './init/manifest.js';
import { promptRuntime, promptNodeLanguage, promptTrigger, promptProjectName } from './init/prompts.js';
import { downloadTemplate, generateConfigFiles, printSuccessBanner } from './init/scaffold.js';

const MANIFEST_URL = 'https://cdn.functions.azure.com/public/templates-manifest/manifest.json';
const MANIFEST_BACKUP_URL = 'https://raw.githubusercontent.com/Azure/azure-functions-templates/dev/Functions.Templates/Template-Manifest/manifest.json';

/**
 * Runtime name mapping (manifest runtime → display name)
 */
const RUNTIME_DISPLAY = {
  'python': 'Python',
  'node': 'Node.js',
  'dotnet-isolated': '.NET (Isolated)',
  'java': 'Java',
  'powershell': 'PowerShell',
};

/**
 * Priority order for templates by resource type.
 * Templates are sorted: 1) by resource priority, 2) by binding type (trigger > input > output), 3) alphabetically
 */
const TRIGGER_PRIORITY = [
  'http',
  'blob',
  'timer',
  'queue',
  'servicebus',
  'eventhub',
  'durable',
  'eventgrid',
];

/**
 * Main entry point for fnx init
 * @param {string[]} args - CLI arguments after 'init'
 */
export async function runInit(args) {
  const flags = parseFlags(args);

  // Step 1: Resolve target directory
  const targetDir = resolveTargetDirectory(flags);

  // Step 2: Check directory state
  checkDirectoryState(targetDir, flags);

  console.log(title('\n🚀 Initialize a new Azure Functions project\n'));

  // Step 3: Fetch manifest
  if (flags.verbose) {
    console.log(dim(`  Manifest URL: ${MANIFEST_URL}`));
  }
  
  let manifest;
  try {
    manifest = await fetchManifest(MANIFEST_URL, { verbose: flags.verbose, backupUrl: MANIFEST_BACKUP_URL });
  } catch (err) {
    console.error(errorColor(`\n✗ Cannot load template manifest`));
    console.error(dim(`
  Error: ${err.message}
  
  The manifest is required to list available templates.
  
  Troubleshooting:
    • Check your internet connection
    • Try again later (CDN may be temporarily unavailable)
    • Run with --verbose for more details
`));
    process.exit(1);
  }
  
  // Validate manifest structure
  if (!manifest.templates || !Array.isArray(manifest.templates)) {
    console.log(errorColor(`
${bold('✗ Invalid manifest format')}

  The template manifest is corrupted or in an unexpected format.
  
  Troubleshooting:
    • Clear cache: rm -rf ~/.fnx/cache
    • Try again with --verbose for more details
`));
    process.exit(1);
  }
  
  if (flags.verbose) {
    console.log(dim(`  Templates loaded: ${manifest.templates.length}`));
    console.log();
  }

  // Step 4: Prompt for runtime
  const runtime = flags.runtime || await promptRuntime(manifest);

  // Step 5: For Node.js, prompt for language variant
  let language = runtime;
  if (runtime === 'node') {
    language = flags.language || await promptNodeLanguage();
  }

  // Step 6: Filter templates by runtime and prompt for trigger
  const filteredTemplates = filterTemplatesByRuntime(manifest, language);
  const template = flags.template
    ? findTemplateByName(filteredTemplates, flags.template)
    : await promptTrigger(filteredTemplates, TRIGGER_PRIORITY);

  if (!template) {
    if (flags.template) {
      console.error(errorColor(`Error: Template '${flags.template}' not found for runtime '${language}'.`));
    } else {
      console.error(errorColor(`Error: No templates available for runtime '${language}'.`));
    }
    process.exit(1);
  }

  // Step 7: Prompt for project name
  const projectName = flags.name || await promptProjectName(targetDir);

  // Step 8: SKU defaults to flex (no prompt)
  const sku = flags.sku || 'flex';
  console.log(dim(`  Using SKU: ${sku}${!flags.sku ? ' (default)' : ''}`));

  // Step 9: Download template and generate files
  if (flags.verbose) {
    console.log(dim(`\n  Target directory: ${targetDir}`));
    console.log(dim(`  Template: ${template.id}`));
  }
  
  const downloadResult = await downloadTemplate(template, targetDir, manifest, { verbose: flags.verbose });
  
  if (!downloadResult.success) {
    const errMsg = downloadResult.error || 'unknown error';
    const isNetworkError = errMsg.includes('fetch') || errMsg.includes('network') || errMsg.includes('GitHub');
    const isPathError = errMsg.includes('EINVAL') || errMsg.includes('ENOENT') || errMsg.includes('invalid') || errMsg.includes('path');
    
    console.error(errorColor(`\n✗ Cannot download template: ${errMsg}`));
    
    if (isPathError) {
      console.error(dim(`
  The project name may contain invalid characters for this filesystem.
  
  Troubleshooting:
    • Use only letters, numbers, hyphens, and underscores
    • Avoid special characters like < > : " / \\ | ? *
    • Try a different project name with --name
`));
    } else {
      console.error(dim(`
  Template files are hosted on GitHub and require internet access.
  
  Troubleshooting:
    • Check your internet connection
    • Try again with --verbose for more details
    • If behind a proxy, configure git and npm proxy settings
`));
    }
    process.exit(1);
  }
  
  try {
    await generateConfigFiles(targetDir, { 
      projectName, 
      runtime: language, 
      version: flags.version,
      sku, 
      verbose: flags.verbose 
    });
  } catch (err) {
    console.error(errorColor(`\n✗ Cannot generate configuration files`));
    console.error(dim(`
  Error: ${err.message}
  
  Troubleshooting:
    • Check disk space and write permissions
    • Ensure the target directory is writable
`));
    process.exit(1);
  }

  // Step 10: Setup development environment (if --env flag)
  if (flags.env) {
    await setupDevEnvironment(targetDir, runtime, language, flags.verbose);
  }

  // Step 11: Print success banner
  printSuccessBanner(targetDir, projectName, sku, language, flags.env);
}

/**
 * Run a command and return a promise
 */
function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: options.cwd,
      shell: process.platform === 'win32',
      stdio: options.verbose ? 'inherit' : 'pipe',
    });

    let stdout = '';
    let stderr = '';

    if (!options.verbose && proc.stdout) {
      proc.stdout.on('data', (data) => { stdout += data; });
    }
    if (!options.verbose && proc.stderr) {
      proc.stderr.on('data', (data) => { stderr += data; });
    }

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `Command failed with exit code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Setup development environment based on runtime
 * - Python: create venv + pip install
 * - Node.js: npm install (+ npm run build for TypeScript)
 * - .NET: dotnet restore
 * - Java: mvn dependency:resolve
 */
async function setupDevEnvironment(targetDir, runtime, language, verbose) {
  console.log(info('\n📦 Setting up development environment...\n'));

  try {
    switch (runtime) {
      case 'python': {
        // Create virtual environment
        const venvPath = join(targetDir, '.venv');
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        
        console.log(dim(`  Creating Python virtual environment...`));
        await runCommand(pythonCmd, ['-m', 'venv', '.venv'], { cwd: targetDir, verbose });
        console.log(success(`  ✓ Created .venv/`));

        // Install dependencies if requirements.txt exists
        const requirementsPath = join(targetDir, 'requirements.txt');
        if (existsSync(requirementsPath)) {
          console.log(dim(`  Installing dependencies...`));
          const pipCmd = process.platform === 'win32' 
            ? join(venvPath, 'Scripts', 'pip')
            : join(venvPath, 'bin', 'pip');
          await runCommand(pipCmd, ['install', '-r', 'requirements.txt'], { cwd: targetDir, verbose });
          console.log(success(`  ✓ Installed Python dependencies`));
        }

        // Print activation instructions
        console.log(dim(`\n  To activate the virtual environment:`));
        if (process.platform === 'win32') {
          console.log(bold(`    .venv\\Scripts\\activate`));
        } else {
          console.log(bold(`    source .venv/bin/activate`));
        }
        break;
      }

      case 'node': {
        // npm install
        const packageJson = join(targetDir, 'package.json');
        if (existsSync(packageJson)) {
          console.log(dim(`  Installing Node.js dependencies...`));
          await runCommand('npm', ['install'], { cwd: targetDir, verbose });
          console.log(success(`  ✓ Installed Node.js dependencies`));
          
          // For TypeScript, also run npm run build
          if (language === 'typescript') {
            console.log(dim(`  Building TypeScript...`));
            await runCommand('npm', ['run', 'build'], { cwd: targetDir, verbose });
            console.log(success(`  ✓ Built TypeScript project`));
          }
        }
        break;
      }

      case 'dotnet-isolated': {
        // dotnet restore
        const csproj = readdirSync(targetDir).find(f => f.endsWith('.csproj'));
        if (csproj) {
          console.log(dim(`  Restoring .NET dependencies...`));
          await runCommand('dotnet', ['restore'], { cwd: targetDir, verbose });
          console.log(success(`  ✓ Restored .NET dependencies`));
        }
        break;
      }

      case 'java': {
        // mvn dependency:resolve
        const pomPath = join(targetDir, 'pom.xml');
        if (existsSync(pomPath)) {
          console.log(dim(`  Resolving Maven dependencies...`));
          await runCommand('mvn', ['dependency:resolve'], { cwd: targetDir, verbose });
          console.log(success(`  ✓ Resolved Maven dependencies`));
        }
        break;
      }

      default:
        console.log(dim(`  No environment setup needed for ${runtime}`));
    }
  } catch (err) {
    console.log(warning(`\n  ⚠ Environment setup failed: ${err.message}`));
    console.log(dim(`  You can set up the environment manually later.`));
  }
}

/**
 * Parse CLI flags from args
 */
function parseFlags(args) {
  const flags = {
    name: null,
    runtime: null,
    version: null,
    template: null,
    sku: null,
    language: null,
    force: false,
    yes: false,
    verbose: false,
    env: false,  // Setup development environment (venv for Python, npm install for Node, etc.)
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    // Helper to validate flag has a value
    const requireValue = (flag) => {
      if (!next) {
        console.error(`Error: ${flag} requires a value`);
        process.exit(1);
      }
      if (next.startsWith('-')) {
        console.error(`Error: ${flag} value cannot start with '-' (got '${next}')`);
        process.exit(1);
      }
    };

    switch (arg) {
      case '--name':
      case '-n':
        requireValue(arg);
        flags.name = next;
        i++;
        break;
      case '--runtime':
      case '-r':
        requireValue(arg);
        flags.runtime = next;
        i++;
        break;
      case '--version':
        requireValue(arg);
        flags.version = next;
        i++;
        break;
      case '--template':
      case '-t':
        requireValue(arg);
        flags.template = next;
        i++;
        break;
      case '--sku':
        requireValue(arg);
        flags.sku = next;
        i++;
        break;
      case '--language':
      case '-l':
        requireValue(arg);
        flags.language = next;
        i++;
        break;
      case '--force':
      case '-f':
        flags.force = true;
        break;
      case '--yes':
      case '-y':
        flags.yes = true;
        break;
      case '--verbose':
      case '-v':
        flags.verbose = true;
        break;
      case '--env':
      case '-e':
        flags.env = true;
        break;
      default:
        // Positional argument — treat as search query or project name
        if (!arg.startsWith('-') && !flags.name) {
          flags.name = arg;
        }
    }
  }

  return flags;
}

/**
 * Resolve target directory based on --name flag
 */
function resolveTargetDirectory(flags) {
  if (flags.name) {
    // Create in subdirectory with given name
    return resolvePath(process.cwd(), flags.name);
  }
  // Use current directory
  return process.cwd();
}

/**
 * Check directory state and error if non-empty (unless --force)
 */
function checkDirectoryState(targetDir, flags) {
  if (!existsSync(targetDir)) {
    // Directory doesn't exist — will be created during scaffold
    return;
  }

  const contents = readdirSync(targetDir);
  // Ignore common hidden files that don't indicate a project
  const ignoredFiles = ['.git', '.gitignore', '.DS_Store', 'Thumbs.db'];
  const significantContents = contents.filter(f => !ignoredFiles.includes(f));

  if (significantContents.length > 0 && !flags.force) {
    // Check for host.json specifically
    if (contents.includes('host.json')) {
      console.error(errorColor(`\nError: Directory already contains a Functions project (host.json exists).`));
      console.error(dim(`  Use ${bold('--force')} to overwrite, or ${bold('--name <dir>')} to create in a subdirectory.\n`));
      process.exit(1);
    }

    console.error(errorColor(`\nError: Directory is not empty.`));
    console.error(dim(`  Contains: ${significantContents.slice(0, 3).join(', ')}${significantContents.length > 3 ? '...' : ''}`));
    console.error(dim(`  Use ${bold('--force')} to initialize anyway, or ${bold('--name <dir>')} to create in a subdirectory.\n`));
    process.exit(1);
  }
}

/**
 * Filter templates by runtime language
 */
function filterTemplatesByRuntime(manifest, runtime) {
  // Map our runtime names to manifest language values
  // Manifest uses: CSharp, Java, JavaScript, PowerShell, Python, TypeScript
  const runtimeToLanguages = {
    'python': ['Python'],
    'node': ['JavaScript', 'TypeScript'],
    'typescript': ['TypeScript'],
    'javascript': ['JavaScript'],
    'dotnet-isolated': ['CSharp'],
    'java': ['Java'],
    'powershell': ['PowerShell'],
  };

  const validLanguages = runtimeToLanguages[runtime] || [runtime];

  return manifest.templates.filter(t => {
    return validLanguages.includes(t.language);
  });
}

/**
 * Find a template by name (case-insensitive)
 */
function findTemplateByName(templates, name) {
  const lowerName = name.toLowerCase();
  return templates.find(t =>
    (t.displayName && t.displayName.toLowerCase().includes(lowerName)) ||
    t.id.toLowerCase() === lowerName ||
    t.id.toLowerCase().includes(lowerName)
  );
}

/**
 * Print help for fnx init
 */
export function printInitHelp() {
  console.log(`
${bold(title('fnx init'))} — Initialize a new Azure Functions project.

${title('Usage:')} fnx init [options] [name]

${title('Options:')}
  ${success('--name')}, ${success('-n')} <name>     Project name (creates subdirectory if provided).
  ${success('--runtime')}, ${success('-r')} <rt>    Runtime: python, node, dotnet-isolated, java, powershell.
  ${success('--version')} <ver>         Runtime version (e.g., 3.11 for Python, 20 for Node.js).
  ${success('--language')}, ${success('-l')} <lang> For Node.js: typescript (default) or javascript.
  ${success('--template')}, ${success('-t')} <tpl>  Template name (e.g., HttpTrigger, BlobTrigger).
  ${success('--sku')} <sku>            Target SKU: flex (default), premium, dedicated.
  ${success('--env')}, ${success('-e')}             Setup dev environment (venv for Python, npm install for Node).
  ${success('--force')}, ${success('-f')}           Initialize in non-empty directory (overwrites template files only).
  ${success('--yes')}, ${success('-y')}             Accept all defaults (non-interactive).
  ${success('--verbose')}, ${success('-v')}         Show detailed output (manifest URL, cache, files).
  ${success('-h')}, ${success('--help')}            Show this help message.

${title('Interactive Mode:')}
  Run ${bold('fnx init')} without flags for guided setup:
    1. Choose runtime (Python, Node.js, .NET, Java, PowerShell)
    2. Choose trigger (HTTP, Blob, Timer, Queue, etc.)
    3. Enter project name
    4. Choose target SKU

${title('Examples:')}
  fnx init                              Interactive mode
  fnx init my-function-app              Create in ./my-function-app
  fnx init -r python -t HttpTrigger     Python HTTP function
  fnx init -r python --env              Python project with venv setup
  fnx init -r node --env                Node.js project with npm install
  fnx init -r python --version 3.12     Python 3.12 project
  fnx init -r node -l typescript        TypeScript Node.js project
  fnx init --verbose                    Show detailed output`.trim());
}
