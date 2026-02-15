import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { platform } from 'node:os';
import { createInterface } from 'node:readline';
import { getHostExeName } from './host-manager.js';

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

function createLogFilter(verbose) {
  const functions = [];
  let functionsShown = false;
  let lastLogShown = false;
  let lastLogLevel = null;

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

  function extractFunctionRoute(line) {
    const match = line.match(/Mapped function route '([^']+)' \[([^\]]+)\] to '([^']+)'/);
    if (match) {
      functions.push({ route: match[1], methods: match[2], name: match[3] });
    }
  }

  function extractListeningUrl(line) {
    const match = line.match(/Now listening on: (.+)/);
    if (match && !functionsShown) {
      functionsShown = true;
      if (functions.length > 0) {
        const baseUrl = match[1].replace('0.0.0.0', 'localhost');
        console.log('\nFunctions:\n');
        for (const fn of functions) {
          console.log(`\t${fn.name}: [${fn.methods}] ${baseUrl}/${fn.route}`);
        }
        if (!verbose) {
          console.log('\nFor detailed output, run func-emu with --verbose flag.');
        }
        console.log();
      }
    }
  }

  return { processLine, extractFunctionRoute, extractListeningUrl, functions };
}

export async function launchHost(hostDir, opts) {
  const hostExe = join(hostDir, getHostExeName());
  const verbose = opts.verbose || false;

  // Build environment for the host process
  const env = {
    ...process.env,
    AZURE_FUNCTIONS_ENVIRONMENT: 'Development',
    AzureWebJobsScriptRoot: opts.scriptRoot,
    ASPNETCORE_URLS: `http://0.0.0.0:${opts.port}`,
    FUNCTIONS_WORKER_RUNTIME: opts.workerRuntime,
    'AzureFunctionsJobHost:extensionBundle:version': opts.extensionBundleVersion,
    AzureWebJobsFeatureFlags: 'EnableWorkerIndexing',
  };

  // Merge all app config values into env
  if (opts.mergedValues) {
    for (const [key, value] of Object.entries(opts.mergedValues)) {
      env[key] = value;
    }
  }

  console.log();
  console.log('Azure Functions Local Emulator (func-emu)');
  console.log(`Emulator Version:  0.1.0`);
  console.log(`Host Version:      ${opts.profile.hostVersion} (${opts.profile.displayName})`);
  console.log();

  const filter = createLogFilter(verbose);

  const child = spawn(hostExe, [], {
    env,
    stdio: ['inherit', 'pipe', 'pipe'],
    cwd: opts.scriptRoot,
  });

  // Process stdout and stderr through the log filter
  for (const stream of [child.stdout, child.stderr]) {
    const rl = createInterface({ input: stream });
    rl.on('line', (line) => {
      filter.extractFunctionRoute(line);
      filter.extractListeningUrl(line);

      const output = filter.processLine(line);
      if (output) {
        console.log(output);
      }
    });
  }

  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));

  return new Promise((resolve, reject) => {
    child.on('error', (err) => {
      console.error(`\nFailed to start host: ${err.message}`);
      console.error(`Host executable: ${hostExe}`);
      reject(err);
    });

    child.on('exit', (code, signal) => {
      if (signal) {
        console.log(`\nHost terminated by signal: ${signal}`);
      } else if (code !== 0) {
        console.error(`\nHost exited with code: ${code}`);
      }
      resolve(code);
    });
  });
}
