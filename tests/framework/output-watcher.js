/**
 * OutputWatcher — Async stdout/stderr monitor with timeout.
 * Captures process output and provides wait/assertion methods.
 */
export class OutputWatcher {
  constructor(childProcess) {
    this.stdout = [];
    this.stderr = [];
    this._stdoutRaw = '';
    this._stderrRaw = '';
    this._waiters = [];
    this._exited = false;
    this._exitCode = null;
    this._exitSignal = null;

    if (childProcess) {
      this.attach(childProcess);
    }
  }

  attach(childProcess) {
    this._child = childProcess;

    if (childProcess.stdout) {
      childProcess.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        this._stdoutRaw += text;
        const lines = text.split('\n').filter(l => l.length > 0);
        this.stdout.push(...lines);
        this._notifyWaiters();
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        this._stderrRaw += text;
        const lines = text.split('\n').filter(l => l.length > 0);
        this.stderr.push(...lines);
        this._notifyWaiters();
      });
    }

    childProcess.on('exit', (code, signal) => {
      this._exited = true;
      this._exitCode = code;
      this._exitSignal = signal;
      this._notifyWaiters();
    });
  }

  /**
   * Wait for a pattern to appear in stdout or stderr.
   * @param {string|RegExp} pattern - String or regex to match
   * @param {object} opts - { timeout: ms, stream: 'stdout'|'stderr'|'any' }
   * @returns {Promise<string>} The matching line
   */
  waitFor(pattern, { timeout = 30000, stream = 'any' } = {}) {
    return new Promise((resolve, reject) => {
      const matcher = typeof pattern === 'string'
        ? (line) => line.includes(pattern)
        : (line) => pattern.test(line);

      // Check existing output first
      const match = this._findMatch(matcher, stream);
      if (match) return resolve(match);

      const timer = setTimeout(() => {
        this._removeWaiter(waiter);
        const allOutput = [...this.stdout, ...this.stderr].join('\n');
        reject(new Error(
          `Timeout (${timeout}ms) waiting for pattern: ${pattern}\n` +
          `Captured output (${this.stdout.length + this.stderr.length} lines):\n` +
          allOutput.slice(-2000)
        ));
      }, timeout);

      const waiter = { matcher, stream, resolve, reject, timer };
      this._waiters.push(waiter);
    });
  }

  /**
   * Wait for the process to exit.
   */
  waitForExit({ timeout = 30000 } = {}) {
    if (this._exited) {
      return Promise.resolve({ code: this._exitCode, signal: this._exitSignal });
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout (${timeout}ms) waiting for process exit`));
      }, timeout);

      const check = () => {
        if (this._exited) {
          clearTimeout(timer);
          resolve({ code: this._exitCode, signal: this._exitSignal });
        }
      };

      // Poll via waiter mechanism
      const waiter = {
        matcher: () => this._exited,
        _isExitWaiter: true,
        stream: 'any',
        resolve: () => {
          clearTimeout(timer);
          resolve({ code: this._exitCode, signal: this._exitSignal });
        },
        reject,
        timer,
      };
      this._waiters.push(waiter);
    });
  }

  /** Kill the child process */
  kill(signal = 'SIGTERM') {
    if (this._child && !this._exited) {
      this._child.kill(signal);
    }
  }

  // ─── Assertions ──────────────────────────────────────────────────────

  assertStdoutContains(text) {
    const found = this.stdout.some(line => line.includes(text));
    if (!found) {
      throw new Error(
        `Expected stdout to contain "${text}".\n` +
        `Actual stdout:\n${this.stdout.join('\n')}`
      );
    }
  }

  assertStdoutNotContains(text) {
    const found = this.stdout.some(line => line.includes(text));
    if (found) {
      throw new Error(`Expected stdout NOT to contain "${text}", but it was found.`);
    }
  }

  assertStderrContains(text) {
    const found = this.stderr.some(line => line.includes(text));
    if (!found) {
      throw new Error(
        `Expected stderr to contain "${text}".\n` +
        `Actual stderr:\n${this.stderr.join('\n')}`
      );
    }
  }

  assertStderrNotContains(text) {
    const found = this.stderr.some(line => line.includes(text));
    if (found) {
      throw new Error(`Expected stderr NOT to contain "${text}", but it was found.`);
    }
  }

  getStdout() { return this.stdout.join('\n'); }
  getStderr() { return this.stderr.join('\n'); }

  // ─── Internal ─────────────────────────────────────────────────────────

  _findMatch(matcher, stream) {
    const sources = stream === 'stdout' ? [this.stdout]
      : stream === 'stderr' ? [this.stderr]
      : [this.stdout, this.stderr];

    for (const src of sources) {
      for (const line of src) {
        if (matcher(line)) return line;
      }
    }
    return null;
  }

  _notifyWaiters() {
    const resolved = [];
    for (const waiter of this._waiters) {
      const match = this._findMatch(waiter.matcher, waiter.stream);
      if (match) {
        clearTimeout(waiter.timer);
        waiter.resolve(match);
        resolved.push(waiter);
      } else if (waiter._isExitWaiter && this._exited) {
        clearTimeout(waiter.timer);
        waiter.resolve(true);
        resolved.push(waiter);
      }
    }
    for (const w of resolved) {
      this._removeWaiter(w);
    }
  }

  _removeWaiter(waiter) {
    const idx = this._waiters.indexOf(waiter);
    if (idx !== -1) this._waiters.splice(idx, 1);
  }
}
