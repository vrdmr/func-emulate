import { spawn, execSync } from 'node:child_process';
import { join } from 'node:path';
import { platform, homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { getHostExeName } from './host-manager.js';
import { ensureAzurite, stopAzurite } from './azurite-manager.js';
import { title, info, funcName, url as urlColor, success, error as errorColor, warning, dim, highlightUrls } from './colors.js';

// ─── Shared host state (consumed by live MCP server) ─────────────────────
// This object is populated by the log filter and exposed for the MCP server.

export function createHostState() {
  return {
    // Host metadata
    pid: null,
    state: 'Starting',      // Starting | Running | Error | Stopped
    startedAt: Date.now(),
    hostVersion: null,
    skuName: null,
    extensionBundleVersion: null,
    workerRuntime: null,
    port: null,
    baseUrl: null,

    // Functions discovered from logs
    httpFunctions: [],       // [{ name, route, methods }]
    nonHttpFunctions: [],    // [{ name, triggerType }]

    // Invocation tracking (ring buffer, last 200)
    invocations: [],         // [{ id, functionName, status, reason, durationMs, timestamp }]
    _maxInvocations: 200,

    // App settings (secrets redacted)
    appSettings: {},

    // Errors collected from logs
    errors: [],

    addInvocation(inv) {
      this.invocations.push(inv);
      if (this.invocations.length > this._maxInvocations) {
        this.invocations.shift();
      }
    },

    addError(err) {
      this.errors.push({ message: err, timestamp: new Date().toISOString() });
      if (this.errors.length > 50) this.errors.shift();
    },
  };
}

// ─── Python executable detection ────────────────────────────────────────
// The .NET host needs a compatible Python version. The host's bundled worker
// supports up to 3.13 (3.14 is unsupported). We check:
//   1. Explicit config (app.config.json "PythonPath")
//   2. .venv in the script root
//   3. System python3.13 → python3.12 → python3.11 → python3 → python
// This mirrors Core Tools behavior which also searches versioned binaries.

const SUPPORTED_PYTHON_VERSIONS = ['3.13', '3.12', '3.11', '3.10', '3.9'];

function findPythonExecutable(scriptRoot, explicitPath) {
  // 0. Explicit path from config (app.config.json "PythonPath" or env var)
  if (explicitPath) {
    if (existsSync(explicitPath)) return explicitPath;
    // Maybe it's a command name on PATH
    try {
      execSync(`${explicitPath} --version`, { stdio: 'ignore' });
      return explicitPath;
    } catch { /* fall through */ }
  }

  // 1. Check for a .venv in the script root (may have a compatible version)
  const venvPython = join(scriptRoot, '.venv', 'bin', 'python');
  const venvPythonWin = join(scriptRoot, '.venv', 'Scripts', 'python.exe');
  if (existsSync(venvPython)) {
    // Verify the venv python version is supported
    try {
      const ver = execSync(`${venvPython} --version`, { encoding: 'utf-8' }).trim();
      const minor = ver.match(/Python 3\.(\d+)/)?.[1];
      if (minor && parseInt(minor) <= 13) return venvPython;
      // venv python is too new, fall through to versioned search
    } catch { /* fall through */ }
  }
  if (existsSync(venvPythonWin)) return venvPythonWin;

  // 2. Check for a venv/ directory
  const venvAlt = join(scriptRoot, 'venv', 'bin', 'python');
  if (existsSync(venvAlt)) return venvAlt;

  // 3. Search for versioned python binaries (most compatible first)
  for (const ver of SUPPORTED_PYTHON_VERSIONS) {
    const cmd = `python${ver}`;
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch { /* not found */ }
  }

  // 4. Fall back to python3 / python (may be unsupported version)
  for (const cmd of ['python3', 'python']) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch { /* not found */ }
  }
  return null;
}

// ─── Log filtering (mirrors Core Tools ColoredConsoleLogger behavior) ───
// Default mode: clean output like `func start` — banner, function list, user logs only.
// Verbose mode: pass all host output through unfiltered.

const LOG_LEVELS = { trce: 0, dbug: 1, info: 2, warn: 3, fail: 4, crit: 5 };

// Messages to always suppress (noisy macOS/dev warnings, not actionable)
const SUPPRESS_MESSAGES = [
  'Cannot create directory for shared memory usage',
  'Unable to find or download extension bundle',
  'Process reporting unhealthy',
  'Access to the path',
  'Operation not permitted',
  'A timeout occurred while running check',
];

function createLogFilter(verbose, hostState) {
  const httpFunctions = [];
  const nonHttpFunctions = []; // triggers like blob, queue, timer, etc.
  let functionsShown = false;
  let lastLogShown = false;
  let lastLogLevel = null;

  // In-flight invocations: track Executing → Executed pairs
  const pendingInvocations = new Map(); // functionName → { reason, startTime }

  function isSuppressed(line) {
    for (const msg of SUPPRESS_MESSAGES) {
      if (line.includes(msg)) return true;
    }
    return false;
  }

  function processLine(line) {
    if (verbose) return line;
    if (isSuppressed(line)) { lastLogShown = false; return null; }

    // Parse .NET log format: "level: Category[EventId]"
    const levelMatch = line.match(/^(trce|dbug|info|warn|fail|crit): (.+)/);

    if (levelMatch) {
      const [, level] = levelMatch;
      lastLogLevel = level;

      // In clean mode, suppress all structured log headers.
      // The only info we surface is the function list (extracted separately)
      // and user-facing messages from Worker.LanguageWorkerChannel.
      if (line.includes('Worker process started and initialized')) {
        lastLogShown = true;
        return null; // Show the continuation message
      }

      // Suppress everything else — system, host, framework, even warnings
      lastLogShown = false;
      return null;
    }

    // Continuation line (indented message text from a structured log)
    if (line.startsWith('      ') || line.startsWith('         ')) {
      if (!lastLogShown) return null;
      const msg = line.trim();
      if (msg === '' || msg.startsWith('at ') || msg.startsWith('---') ||
          msg.startsWith('{') || msg.startsWith('}') || msg.startsWith('"')) return null;
      return msg;
    }

    // Non-structured lines (plain text from ASP.NET: "Now listening on:", etc.)
    if (line.trim() === '') return null;
    if (line.startsWith('{') || line.startsWith('}') || line.startsWith('"')) return null;
    return line;
  }

  function extractFunctionInfo(line) {
    // HTTP routes: "Mapped function route 'api/hello' [all] to 'hello'"
    const routeMatch = line.match(/Mapped function route '([^']+)' \[([^\]]+)\] to '([^']+)'/);
    if (routeMatch) {
      httpFunctions.push({ route: routeMatch[1], methods: routeMatch[2], name: routeMatch[3] });
      if (hostState) hostState.httpFunctions = [...httpFunctions];
    }

    // Worker indexing JSON: extract non-HTTP trigger types from the indexed metadata
    // Format: {"message": "Successfully indexed function app.", "functions": "Function Name: X, Function Binding: [('triggerType', ...)] ..."}
    if (line.includes('Successfully indexed function app')) {
      const jsonStart = line.indexOf('{');
      if (jsonStart !== -1) {
        try {
          const meta = JSON.parse(line.slice(jsonStart));
          const fnStr = meta.functions || '';
          const fnEntries = fnStr.split(/Function Name: /).filter(Boolean);
          for (const entry of fnEntries) {
            const nameMatch = entry.match(/^(\w+),/);
            const bindingMatch = entry.match(/Function Binding: \[([^\]]+)\]/);
            if (nameMatch && bindingMatch) {
              const name = nameMatch[1];
              const bindings = bindingMatch[1];
              // Find all trigger bindings and pick the non-HTTP one if present
              const allTriggers = [...bindings.matchAll(/\('(\w*[Tt]rigger)', '[^']*', '[^']*'\)/g)];
              const nonHttpTrigger = allTriggers.find(m => m[1] !== 'httpTrigger');
              if (nonHttpTrigger) {
                nonHttpFunctions.push({ name, triggerType: nonHttpTrigger[1] });
                if (hostState) hostState.nonHttpFunctions = [...nonHttpFunctions];
              }
            }
          }
        } catch { /* non-fatal: JSON parse failure */ }
      }
    }

    // Track invocations: "Executing 'Functions.hello' (Reason='...')"
    const execMatch = line.match(/Executing 'Functions\.(\w+)' \(Reason='([^']*)'/);
    if (execMatch) {
      pendingInvocations.set(execMatch[1], {
        reason: execMatch[2],
        startTime: Date.now(),
      });
    }

    // Track invocation completions: "Executed 'Functions.hello' (Succeeded, Id=..., Duration=...ms)"
    const doneMatch = line.match(/Executed 'Functions\.(\w+)' \((\w+),.*?Duration=(\d+)ms\)/);
    if (doneMatch && hostState) {
      const [, name, status, durationStr] = doneMatch;
      const pending = pendingInvocations.get(name);
      hostState.addInvocation({
        functionName: name,
        status,
        reason: pending?.reason || 'unknown',
        durationMs: parseInt(durationStr, 10),
        timestamp: new Date().toISOString(),
      });
      pendingInvocations.delete(name);
    }

    // Track errors
    if (hostState && line.match(/^(fail|crit):/)) {
      hostState.addError(line);
    }
  }

  function extractListeningUrl(line) {
    const match = line.match(/Now listening on: (.+)/);
    if (match && !functionsShown) {
      functionsShown = true;
      const baseUrl = match[1].replace('0.0.0.0', 'localhost');

      // Update host state
      if (hostState) {
        hostState.state = 'Running';
        hostState.baseUrl = baseUrl;
      }

      if (httpFunctions.length > 0 || nonHttpFunctions.length > 0) {
        console.log(title('\nFunctions:\n'));
        for (const fn of httpFunctions) {
          console.log(`\t${funcName(fn.name)}: [${fn.methods}] ${urlColor(`${baseUrl}/${fn.route}`)}`);
        }
        for (const fn of nonHttpFunctions) {
          console.log(`\t${funcName(fn.name)}: ${fn.triggerType}`);
        }
        if (!verbose) {
          console.log(dim('\nFor detailed output, run fnx with --verbose flag.'));
        }
        console.log();
      }
    }
  }

  return { processLine, extractFunctionInfo, extractListeningUrl, isSuppressed };
}

function colorizeHostOutput(line) {
  // Executing/Executed function invocations
  const execMatch = line.match(/^(.*?)(Execut(?:ing|ed) 'Functions\.)(\w+)('.*?)(\(Succeeded.*?\)|\(Failed.*?\))?(.*)$/);
  if (execMatch) {
    let result = execMatch[1] + execMatch[2] + funcName(execMatch[3]) + execMatch[4];
    if (execMatch[5]) {
      result += execMatch[5].startsWith('(Succeeded') ? success(execMatch[5]) : errorColor(execMatch[5]);
    }
    result += execMatch[6] || '';
    return highlightUrls(result);
  }
  // "Application started" line
  if (line.includes('Application started')) {
    return success(line);
  }
  return highlightUrls(line);
}

export { createLogFilter };

export async function launchHost(hostDir, opts) {
  const hostExe = join(hostDir, getHostExeName());
  const verbose = opts.verbose || false;

  // Create shared host state for MCP server
  const hostState = opts.hostState || createHostState();
  hostState.hostVersion = opts.profile.hostVersion;
  hostState.skuName = opts.profile.displayName;
  hostState.extensionBundleVersion = opts.extensionBundleVersion;
  hostState.workerRuntime = opts.workerRuntime;
  hostState.port = opts.port;

  // Build environment for the host process
  const env = {
    ...process.env,
    AZURE_FUNCTIONS_ENVIRONMENT: 'Development',
    AzureWebJobsScriptRoot: opts.scriptRoot,
    ASPNETCORE_URLS: `http://0.0.0.0:${opts.port}`,
    FUNCTIONS_WORKER_RUNTIME: opts.workerRuntime,
    'AzureFunctionsJobHost:extensionBundle:version': opts.extensionBundleVersion,
    AzureWebJobsFeatureFlags: 'EnableWorkerIndexing',
    // Enable extension bundle auto-download (host checks IsCoreTools())
    FUNCTIONS_CORETOOLS_ENVIRONMENT: 'true',
    // Set bundle download/cache path under ~/.fnx/bundles/
    'AzureFunctionsJobHost:extensionBundle:downloadPath': join(homedir(), '.fnx', 'bundles',
      'Microsoft.Azure.Functions.ExtensionBundle'),
  };

  // Merge all app config values into env
  if (opts.mergedValues) {
    for (const [key, value] of Object.entries(opts.mergedValues)) {
      env[key] = value;
    }
    // Store redacted version for MCP server
    const sensitiveKeys = ['AzureWebJobsStorage', 'EventHubConnectionString', 'ServiceBusConnectionString'];
    const redacted = {};
    for (const [key, value] of Object.entries(opts.mergedValues)) {
      redacted[key] = sensitiveKeys.some(sk => key.includes(sk)) && value !== 'UseDevelopmentStorage=true'
        ? '***REDACTED***' : value;
    }
    hostState.appSettings = redacted;
  }

  // Auto-detect Python executable if worker runtime is python
  if (opts.workerRuntime === 'python') {
    const explicitPython = opts.mergedValues?.PythonPath || process.env.FNX_PYTHON_PATH;
    const pythonPath = findPythonExecutable(opts.scriptRoot, explicitPython);
    if (pythonPath) {
      // .NET config uses __ (double underscore) as hierarchy separator in env vars on Unix
      env['languageWorkers__python__defaultExecutablePath'] = pythonPath;

      // Detect the Python minor version so the host selects the matching bundled worker.
      // The host uses FUNCTIONS_WORKER_RUNTIME_VERSION to pick the worker directory
      // (e.g. 3.13/OSX/Arm64/worker.py). Each versioned worker validates its own range.
      try {
        const verOutput = execSync(`${pythonPath} --version`, { encoding: 'utf-8' }).trim();
        const match = verOutput.match(/Python (3\.\d+)/);
        if (match) {
          env['FUNCTIONS_WORKER_RUNTIME_VERSION'] = match[1];
        }
      } catch { /* non-fatal */ }
    } else {
      console.error(warning('⚠️  Python runtime requested but no compatible python (3.9-3.13) found.'));
      console.error(dim('   Set "PythonPath" in app.config.json or FNX_PYTHON_PATH env var.'));
    }
  }

  // Auto-start Azurite if needed (lazy install + TCP readiness probe)
  const azuriteProc = await ensureAzurite(opts.mergedValues, { noAzurite: opts.noAzurite });

  console.log();
  console.log(title('Azure Functions Local Emulator (fnx — Phoenix Emulate)'));
  console.log(`${dim('Emulator Version:')}  ${info('0.1.0')}`);
  console.log(`${dim('Host Version:')}      ${info(`${opts.profile.hostVersion} (${opts.profile.displayName})`)}`);
  if (opts.workerRuntime === 'python' && env['languageWorkers__python__defaultExecutablePath']) {
    console.log(`${dim('Python:')}            ${info(`${env['languageWorkers__python__defaultExecutablePath']} (${env['FUNCTIONS_WORKER_RUNTIME_VERSION'] || 'unknown'})`)}`);
  }
  console.log();

  const filter = createLogFilter(verbose, hostState);

  // Start host in its own process group so we can kill it + all child workers together
  const child = spawn(hostExe, [], {
    env,
    stdio: ['inherit', 'pipe', 'pipe'],
    cwd: opts.scriptRoot,
    detached: true, // creates new process group (pgid = child.pid)
  });

  hostState.pid = child.pid;

  // Kill the entire process group (host + Python/Node workers it spawns)
  function killHostGroup(signal) {
    try { process.kill(-child.pid, signal); } catch { /* already dead */ }
  }

  // Ensure the host process group is killed if Node exits unexpectedly
  process.on('exit', () => killHostGroup('SIGKILL'));

  // Process stdout and stderr through the log filter
  for (const stream of [child.stdout, child.stderr]) {
    const rl = createInterface({ input: stream });
    rl.on('line', (line) => {
      filter.extractFunctionInfo(line);
      filter.extractListeningUrl(line);

      const output = filter.processLine(line);
      if (output) {
        console.log(colorizeHostOutput(output));
      }
    });
  }

  function cleanup(signal) {
    stopAzurite();
    killHostGroup(signal);
    if (hostState._mcpServer) hostState._mcpServer.close();
    // Give the host 2s to shut down gracefully, then force kill the group
    const forceTimer = setTimeout(() => {
      killHostGroup('SIGKILL');
      process.exit(0);
    }, 2000);
    forceTimer.unref();
    child.once('exit', () => process.exit(0));
  }

  process.on('SIGINT', () => cleanup('SIGINT'));
  process.on('SIGTERM', () => cleanup('SIGTERM'));

  return new Promise((resolve, reject) => {
    child.on('error', (err) => {
      console.error(errorColor(`\nFailed to start host: ${err.message}`));
      console.error(dim(`Host executable: ${hostExe}`));
      hostState.state = 'Error';
      reject(err);
    });

    child.on('exit', (code, signal) => {
      hostState.state = 'Stopped';
      if (signal) {
        console.log(dim(`\nHost terminated by signal: ${signal}`));
      } else if (code !== 0) {
        console.error(errorColor(`\nHost exited with code: ${code}`));
      }
      resolve({ code, hostState });
    });

    // Expose hostState and child for MCP server startup
    resolve.__hostState = hostState;
    resolve.__child = child;

    // Notify caller that launch is in progress (hostState is live)
    if (opts.onHostLaunched) {
      opts.onHostLaunched(hostState, child);
    }
  });
}
