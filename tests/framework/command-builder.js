import { spawn } from 'node:child_process';
import { resolve as resolvePath, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OutputWatcher } from './output-watcher.js';
import { findAvailablePort } from './port-manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FNX_BIN = resolvePath(__dirname, '..', '..', 'fnx', 'bin', 'fnx');
const DEFAULT_SCRIPT_ROOT = resolvePath(__dirname, '..', 'test-node-app');

/**
 * Fluent command builder for fnx CLI invocations.
 *
 * Usage:
 *   const result = await FnxCommand
 *     .start()
 *     .withSku('flex')
 *     .withPort(7071)
 *     .withScriptRoot('./test-node-app')
 *     .withTimeout(30000)
 *     .execute();
 */
export class FnxCommand {
  constructor(action) {
    this._action = action;
    this._args = [];
    this._env = {};
    this._timeout = 30000;
    this._scriptRoot = DEFAULT_SCRIPT_ROOT;
    this._port = null;
    this._autoPort = true;
    this._verbose = false;
    this._noMcp = true; // Disable MCP by default in tests
    this._profilesSource = null;
    this._waitForReady = false;
    this._readyPattern = 'Now listening on:';
  }

  /** Create a builder for `fnx start` */
  static start() {
    return new FnxCommand('start');
  }

  /** Create a builder for `fnx --help` */
  static help() {
    return new FnxCommand('--help');
  }

  /** Create a builder for `fnx --version` */
  static version() {
    return new FnxCommand('--version');
  }

  /** Create a builder for an arbitrary command */
  static command(cmd) {
    return new FnxCommand(cmd);
  }

  // ─── Builder Methods ─────────────────────────────────────────────────

  withSku(sku) {
    this._args.push('--sku', sku);
    return this;
  }

  withPort(port) {
    this._port = String(port);
    this._autoPort = false;
    return this;
  }

  withScriptRoot(path) {
    this._scriptRoot = resolvePath(path);
    return this;
  }

  withVerbose() {
    this._verbose = true;
    return this;
  }

  withMcp(port) {
    this._noMcp = false;
    if (port) this._args.push('--mcp-port', String(port));
    return this;
  }

  withNoMcp() {
    this._noMcp = true;
    return this;
  }

  withEnv(key, value) {
    this._env[key] = value;
    return this;
  }

  withArg(...args) {
    this._args.push(...args);
    return this;
  }

  withTimeout(ms) {
    this._timeout = ms;
    return this;
  }

  withProfilesSource(source) {
    this._profilesSource = source;
    return this;
  }

  /** Wait for the "Now listening on:" message before resolving */
  waitForReady(pattern) {
    this._waitForReady = true;
    if (pattern) this._readyPattern = pattern;
    return this;
  }

  // ─── Execution ────────────────────────────────────────────────────────

  /**
   * Execute the command and wait for it to complete (or timeout).
   * Returns { stdout, stderr, exitCode, signal, watcher }.
   */
  async execute() {
    if (this._autoPort && this._action === 'start') {
      this._port = String(await findAvailablePort());
    }

    const args = [this._action];
    if (this._action === 'start') {
      args.push('--app-path', this._scriptRoot);
      if (this._port) args.push('--port', this._port);
      if (this._verbose) args.push('--verbose');
      if (this._noMcp) args.push('--no-mcp');
      if (this._profilesSource) args.push('--profiles', this._profilesSource);
    }
    args.push(...this._args);

    const env = { ...process.env, ...this._env };

    const child = spawn('node', [FNX_BIN, ...args], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: this._scriptRoot,
    });

    const watcher = new OutputWatcher(child);

    if (this._waitForReady) {
      try {
        await watcher.waitFor(this._readyPattern, { timeout: this._timeout });
        return {
          stdout: watcher.stdout,
          stderr: watcher.stderr,
          exitCode: null,
          signal: null,
          watcher,
          child,
          port: this._port,
          kill: (sig) => child.kill(sig || 'SIGTERM'),
        };
      } catch (err) {
        child.kill('SIGTERM');
        throw err;
      }
    }

    // Wait for exit with timeout
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        // Follow up with SIGKILL and stream cleanup to prevent event loop hangs.
        // fetch() inside the child can keep the process alive after SIGTERM.
        setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* already dead */ }
          if (child.stdout) child.stdout.destroy();
          if (child.stderr) child.stderr.destroy();
        }, 1000);
        resolve({
          stdout: watcher.stdout,
          stderr: watcher.stderr,
          exitCode: null,
          signal: 'SIGTERM',
          timedOut: true,
          watcher,
        });
      }, this._timeout);

      child.on('exit', (code, signal) => {
        clearTimeout(timer);
        resolve({
          stdout: watcher.stdout,
          stderr: watcher.stderr,
          exitCode: code,
          signal,
          timedOut: false,
          watcher,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * Spawn the command and return immediately with a watcher.
   * Caller is responsible for killing the process.
   */
  async spawn() {
    if (this._autoPort && this._action === 'start') {
      this._port = String(await findAvailablePort());
    }

    const args = [this._action];
    if (this._action === 'start') {
      args.push('--app-path', this._scriptRoot);
      if (this._port) args.push('--port', this._port);
      if (this._verbose) args.push('--verbose');
      if (this._noMcp) args.push('--no-mcp');
      if (this._profilesSource) args.push('--profiles', this._profilesSource);
    }
    args.push(...this._args);

    const env = { ...process.env, ...this._env };

    const child = spawn('node', [FNX_BIN, ...args], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: this._scriptRoot,
    });

    const watcher = new OutputWatcher(child);

    return { child, watcher, port: this._port };
  }
}
