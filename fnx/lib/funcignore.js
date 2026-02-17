// .funcignore support — gitignore-syntax file filtering for fnx pack
// Mirrors func core tools behavior from repo/src/Cli/func/Common/FileSystemHelpers.cs
// and repo/src/Cli/func/Helpers/PublishHelper.cs

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import ignore from 'ignore';

// Always excluded regardless of .funcignore (matches FileSystemHelpers.GetLocalFiles)
const DEFAULT_EXCLUDED_FILES = ['.funcignore', '.gitignore', 'local.settings.json', 'project.lock.json'];
const DEFAULT_EXCLUDED_DIRS = ['.git', '.vscode'];

// Common Python virtualenv directory names
const PYTHON_VENV_DIRS = ['.venv', 'venv', 'env', '.env', 'virtualenv', '.virtualenv'];

/**
 * Load and parse .funcignore from a project root directory.
 * Returns an ignore instance with default exclusions + .funcignore patterns applied.
 *
 * @param {string} projectRoot - Path to the function app project root
 * @param {object} [options]
 * @param {string} [options.runtime] - Runtime name (e.g. 'python') for runtime-specific auto-ignores
 * @returns {import('ignore').Ignore}
 */
export async function loadFuncIgnore(projectRoot, options = {}) {
  const ig = ignore();

  // Default file exclusions
  ig.add(DEFAULT_EXCLUDED_FILES);

  // Default directory exclusions (trailing slash = directory pattern)
  ig.add(DEFAULT_EXCLUDED_DIRS.map(d => d + '/'));

  // Read .funcignore if it exists
  try {
    const content = await readFile(join(projectRoot, '.funcignore'), 'utf-8');
    ig.add(content);
  } catch {
    // No .funcignore — only defaults apply
  }

  // Python: auto-detect virtualenv directories
  if (options.runtime === 'python') {
    await addPythonVenvIgnores(ig, projectRoot);
  }

  return ig;
}

/**
 * Detect common Python virtualenv directories and add them to ignore patterns.
 * Mirrors repo/src/Cli/func/Helpers/PythonHelpers.cs venv detection.
 */
async function addPythonVenvIgnores(ig, projectRoot) {
  for (const venvName of PYTHON_VENV_DIRS) {
    try {
      const venvPath = join(projectRoot, venvName);
      const stats = await stat(venvPath);
      if (stats.isDirectory()) {
        // Check for pyvenv.cfg or activate script as confirmation it's a real venv
        try {
          await stat(join(venvPath, 'pyvenv.cfg'));
          ig.add(venvName + '/');
        } catch {
          try {
            await stat(join(venvPath, 'bin', 'activate'));
            ig.add(venvName + '/');
          } catch {
            try {
              await stat(join(venvPath, 'Scripts', 'activate.bat'));
              ig.add(venvName + '/');
            } catch {
              // Directory exists but isn't a venv — skip
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist — skip
    }
  }
}

/**
 * Walk a directory tree and return all files that pass the funcignore filter.
 * Returns paths relative to sourceDir.
 *
 * @param {string} sourceDir - Directory to walk
 * @param {import('ignore').Ignore} funcIgnore - Loaded ignore instance
 * @returns {Promise<string[]>} - Relative paths of included files
 */
export async function getFilteredFiles(sourceDir, funcIgnore) {
  const results = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(sourceDir, fullPath).replace(/\\/g, '/');

      if (funcIgnore.ignores(relPath)) continue;

      if (entry.isDirectory()) {
        // Also check if directory itself is ignored (with trailing slash)
        if (funcIgnore.ignores(relPath + '/')) continue;
        await walk(fullPath);
      } else {
        results.push(relPath);
      }
    }
  }

  await walk(sourceDir);
  return results;
}

export { DEFAULT_EXCLUDED_FILES, DEFAULT_EXCLUDED_DIRS, PYTHON_VENV_DIRS };
