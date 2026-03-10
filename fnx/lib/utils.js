/**
 * Shared utility functions for fnx.
 */

import { mkdir, copyFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Recursively copy a directory, preserving structure.
 * @param {string} srcDir - Source directory path
 * @param {string} dstDir - Destination directory path
 * @param {{ dryRun?: boolean }} opts - Options
 */
export async function copyDirRecursive(srcDir, dstDir, opts = {}) {
  await mkdir(dstDir, { recursive: true });
  const entries = await readdir(srcDir);
  for (const entry of entries) {
    const srcPath = join(srcDir, entry);
    const dstPath = join(dstDir, entry);
    const s = await stat(srcPath);
    if (s.isDirectory()) {
      await copyDirRecursive(srcPath, dstPath, opts);
    } else {
      if (!opts.dryRun) await copyFile(srcPath, dstPath);
    }
  }
}
