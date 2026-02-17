# F19: Honor .funcignore During `fnx pack`

**Status:** 📋 Planned  
**PRD Section:** CLI parity, deployment correctness  
**Depends on:** None (existing infrastructure)

## Problem

`fnx pack` (in `fnx/lib/pack.js`) currently zips the entire source directory using `zip -r -q` with **zero file filtering**. It does not read or honor `.funcignore`. This means test files, source maps, TypeScript sources, IDE config, `local.settings.json`, and other development artifacts all end up in the deployment zip.

The reference implementation (`func` in `repo/`) correctly handles this:
- Reads `.funcignore` from the project root using a gitignore-syntax parser
- Filters files through `Accepts()`/`Denies()` before adding to the zip
- Excludes `.funcignore`, `.gitignore`, `local.settings.json`, `project.lock.json` by default
- Excludes `.git/` and `.vscode/` directories by default
- Supports negation patterns (`!LICENSE.md` re-includes a file)

## How `func` Does It (reference in `repo/`, read-only)

| File in `repo/` | What it does |
|------|------|
| `src/Cli/func/Common/GitIgnoreParser.cs` | Parses `.funcignore` using gitignore syntax (globs, negation `!`, comments `#`) |
| `src/Cli/func/Helpers/PublishHelper.cs:12-27` | `GetIgnoreParser(dir)` — reads `.funcignore` from a directory, returns parser or null |
| `src/Cli/func/Common/FileSystemHelpers.cs:131-150` | `GetLocalFiles()` — walks dir tree, filters each file through `ignoreParser.Accepts()` |
| `src/Cli/func/Helpers/ZipHelper.cs:15-54` | `GetAppZipFile()` — reads `.funcignore` as fallback, then zips filtered file list |
| `src/Cli/func/StaticResources/funcignore` | Default `.funcignore` template shipped with `func init` |

### Default `.funcignore` content (from `func init` for Node):
```
*.js.map
*.ts
.git*
.vscode
local.settings.json
test
getting_started.md
node_modules/@types/
node_modules/azure-functions-core-tools/
node_modules/typescript/
```

### Key behaviors to replicate:
1. Read `.funcignore` from **project root** (not packing root — these differ for .NET/Java after build)
2. Parse using gitignore syntax: glob patterns, directory patterns (`test/`), negation (`!keep.md`), comments (`#`)
3. Always exclude these files regardless of `.funcignore`: `.funcignore`, `.gitignore`, `local.settings.json`
4. Always exclude these directories: `.git/`, `.vscode/`
5. If no `.funcignore` exists, include all files (no filtering beyond the defaults above)

## Current `fnx pack` Flow (broken)

```
fnx/lib/pack.js → packFunctionApp()
  → sourceDir = root (or build output for java/dotnet-isolated)
  → zipDirectory(sourceDir, outputZip)
    → spawn('zip', ['-r', '-q', outputZip, '.'])   // NO FILTERING AT ALL
```

## Proposed Fix for `fnx`

### 1. Add a `.funcignore` parser module (`fnx/lib/funcignore.js`)

Use an existing npm package (`ignore` — widely used, gitignore-compatible) or implement a minimal parser. The `ignore` package is battle-tested and handles all gitignore edge cases.

```js
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ignore from 'ignore';

const DEFAULT_IGNORES = ['.funcignore', '.gitignore', 'local.settings.json'];
const DEFAULT_IGNORE_DIRS = ['.git', '.vscode'];

export async function loadFuncIgnore(projectRoot) {
  const ig = ignore();

  // Always ignore defaults
  ig.add(DEFAULT_IGNORES);
  ig.add(DEFAULT_IGNORE_DIRS.map(d => `${d}/`));

  // Read .funcignore if it exists
  try {
    const content = await readFile(join(projectRoot, '.funcignore'), 'utf-8');
    ig.add(content);
  } catch {
    // No .funcignore — only defaults apply
  }

  return ig;
}
```

### 2. Replace `zipDirectory()` with filtered zip

Replace the `zip -r` shell command with a filtered approach:

```js
import { createWriteStream } from 'node:fs';
import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import archiver from 'archiver';

async function zipFiltered(sourceDir, outputZip, funcIgnore) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const output = createWriteStream(outputZip);
  archive.pipe(output);

  // Walk directory, filter through funcIgnore
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(sourceDir, fullPath);

      if (funcIgnore.ignores(relPath)) continue;

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        archive.file(fullPath, { name: relPath });
      }
    }
  }

  await walk(sourceDir);
  await archive.finalize();
  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
  });
}
```

### 3. Wire it into `packFunctionApp()`

```js
export async function packFunctionApp({ scriptRoot, runtime, outputPath, noBuild = false }) {
  const root = resolvePath(scriptRoot || process.cwd());
  // ...existing runtime/build logic...

  // Always read .funcignore from PROJECT ROOT (not sourceDir/packing root)
  const funcIgnore = await loadFuncIgnore(root);

  await zipFiltered(sourceDir, resolvedOutput, funcIgnore);
  // ...
}
```

### 4. Add `--list-included-files` / `--list-ignored-files` flags

Add flags to `fnx pack` so users can preview what gets packaged:
```
fnx pack --list-included-files    # prints files that would be in the zip
fnx pack --list-ignored-files     # prints files that would be excluded
```

## Acceptance Criteria

- [ ] `fnx pack` reads `.funcignore` from the project root and excludes matching files
- [ ] `.funcignore` is always read from `scriptRoot`, even when `sourceDir` differs (java, dotnet-isolated)
- [ ] Default exclusions applied even without `.funcignore`: `.git/`, `.vscode/`, `local.settings.json`, `.funcignore`, `.gitignore`
- [ ] Negation patterns work (`!LICENSE.md` re-includes a file)
- [ ] `fnx pack --list-included-files` prints included files
- [ ] `fnx pack --list-ignored-files` prints excluded files
- [ ] Without `.funcignore`, only default exclusions apply (no regression)
- [ ] All existing `fnx pack` tests continue to pass

## Out of Scope

- Changes to `repo/` (read-only reference — we only implement in `fnx/`)
- Changes to `.funcignore` syntax (we match `func`'s existing gitignore-compatible behavior)
- Nested `.funcignore` support (not supported by `func` today)

## Test Plan

1. **Unit test**: `loadFuncIgnore()` with various patterns — verify accepts/denies
2. **Unit test**: `loadFuncIgnore()` without `.funcignore` — verify only defaults excluded
3. **Unit test**: Negation pattern `!keep.md` re-includes file
4. **E2E test**: `fnx pack` on a Node project with `.funcignore` containing `test/` — verify `test/` absent from zip
5. **E2E test**: `fnx pack` on a dotnet-isolated project with `.funcignore` — verify patterns applied to publish output
6. **E2E test**: `fnx pack --list-ignored-files` shows excluded files
7. **E2E test**: `fnx pack` without `.funcignore` — verify all files included except defaults
