import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { platform } from 'node:os';
import { getHostExeName } from './host-manager.js';

export async function launchHost(hostDir, opts) {
  const hostExe = join(hostDir, getHostExeName());

  // Build environment for the host process
  const env = {
    ...process.env,

    // Core host settings
    AZURE_FUNCTIONS_ENVIRONMENT: 'Development',
    AzureWebJobsScriptRoot: opts.scriptRoot,
    ASPNETCORE_URLS: `http://0.0.0.0:${opts.port}`,
    FUNCTIONS_WORKER_RUNTIME: opts.workerRuntime,

    // Extension bundle override from SKU profile
    'AzureFunctionsJobHost:extensionBundle:version': opts.extensionBundleVersion,

    // Enable worker indexing (V2 programming model)
    AzureWebJobsFeatureFlags: 'EnableWorkerIndexing',
  };

  // Merge all app config values into env
  if (opts.mergedValues) {
    for (const [key, value] of Object.entries(opts.mergedValues)) {
      env[key] = value;
    }
  }

  console.log('────────────────────────────────────────────────────');
  console.log('func-emu POC');
  console.log(`Target SKU:        ${opts.profile.displayName}`);
  console.log(`Host Version:      ${opts.profile.hostVersion}`);
  console.log(`Extension Bundle:  ${opts.extensionBundleVersion}`);
  console.log(`Script Root:       ${opts.scriptRoot}`);
  console.log(`Worker Runtime:    ${opts.workerRuntime}`);
  console.log(`Port:              ${opts.port}`);
  console.log('────────────────────────────────────────────────────');
  console.log();

  const child = spawn(hostExe, [], {
    env,
    stdio: ['inherit', 'inherit', 'inherit'],
    cwd: opts.scriptRoot,
  });

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
