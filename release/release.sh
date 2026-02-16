#!/usr/bin/env bash
set -euo pipefail

# release.sh — Full release workflow: bump → commit → tag → publish → push
#
# Usage:
#   ./release/release.sh --dry-run                # Verify everything, no publish/push
#   ./release/release.sh                           # Patch bump + release @vrdmr/fnx-test
#   ./release/release.sh minor                     # Minor bump + release
#   ./release/release.sh major                     # Major bump + release
#   ./release/release.sh 0.3.0                     # Explicit version + release
#   ./release/release.sh --include-templates-mcp   # Also publish @vrdmr/fnx-templates-mcp
#   ./release/release.sh --skip-login              # Skip npm login (already authenticated)
#
# Steps:
#   1. Pre-flight    — Verify Node 18+, npm, on main branch, clean working dir, npm auth
#   2. Bump version  — Call bump-version.sh to update both package.json files
#   3. Git commit+tag — Commit version bump as "chore: release vX.Y.Z", create git tag
#   4. Publish fnx   — npm pack + smoke test + npm publish @vrdmr/fnx-test
#   5. Publish MCP   — (opt-in) Build TypeScript + npm publish @vrdmr/fnx-templates-mcp
#   6. Push to origin — Push commit + tag to GitHub
#   7. Verify        — Wait for npm propagation, confirm packages are live

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FNX_DIR="$REPO_ROOT/fnx"
TEMPLATES_MCP_DIR="$FNX_DIR/templates-mcp"

DRY_RUN=false
SKIP_LOGIN=false
INCLUDE_TEMPLATES_MCP=false
BUMP="patch"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --skip-login) SKIP_LOGIN=true; shift ;;
    --include-templates-mcp) INCLUDE_TEMPLATES_MCP=true; shift ;;
    patch|minor|major) BUMP="$1"; shift ;;
    [0-9]*) BUMP="$1"; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ── Helpers ──

banner() { echo ""; echo "═══ $1 ═══"; echo ""; }
ok()     { echo "  ✓ $1"; }
fail()   { echo "  ✗ $1"; exit 1; }
warn()   { echo "  ⚠ $1"; }

# ── Step 1: Pre-flight ──

banner "Step 1: Pre-flight checks"

node --version >/dev/null 2>&1 || fail "Node.js not found"
NODE_VER=$(node -e "console.log(process.versions.node.split('.')[0])")
[[ "$NODE_VER" -ge 18 ]] || fail "Node.js 18+ required (got $NODE_VER)"
ok "Node.js $(node --version)"

npm --version >/dev/null 2>&1 || fail "npm not found"
ok "npm $(npm --version)"

BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  fail "Must be on main branch (on $BRANCH). Checkout main first."
fi
ok "On main branch"

DIRTY_FILES=$(git -C "$REPO_ROOT" status --porcelain)
if [[ -n "$DIRTY_FILES" ]]; then
  warn "Working directory is not clean:"
  echo "$DIRTY_FILES" | sed 's/^/    /'
  echo ""

  # Check if any dirty files would end up in the package
  DIRTY_IN_PKG=false
  while IFS= read -r line; do
    file="${line:3}"
    if [[ "$file" == fnx/bin/* || "$file" == fnx/lib/* || "$file" == fnx/profiles/* || "$file" == fnx/README.md || "$file" == fnx/package.json ]]; then
      DIRTY_IN_PKG=true
    fi
  done <<< "$DIRTY_FILES"

  if [[ "$DIRTY_IN_PKG" == true ]]; then
    warn "Some dirty files are inside the published package (fnx/bin, fnx/lib, fnx/profiles)"
  else
    echo "  None of the dirty files are inside the published package."
  fi

  if [[ "$DRY_RUN" == true ]]; then
    ok "Continuing anyway (dry run)"
  else
    echo ""
    read -r -p "  Continue with release? [y/N] " REPLY
    if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
      echo "  Aborted. Clean up with: git stash or git checkout <file>"
      exit 1
    fi
    ok "User confirmed — continuing"
  fi
else
  ok "Working directory clean"
fi

git -C "$REPO_ROOT" pull origin main --quiet
ok "main is up to date"

if [[ "$SKIP_LOGIN" == false && "$DRY_RUN" == false ]]; then
  npm whoami >/dev/null 2>&1 && ok "npm: logged in as $(npm whoami)" || {
    echo "  Not logged in — running npm login..."
    npm login
    ok "npm: logged in as $(npm whoami)"
  }
fi

# ── Step 2: Bump version ──

banner "Step 2: Bump version ($BUMP)"

NEW_VER=$("$REPO_ROOT/release/bump-version.sh" "$BUMP")
ok "Version is now $NEW_VER"

# ── Step 3: Git commit + tag ──

banner "Step 3: Git commit + tag"

cd "$REPO_ROOT"

if [[ "$DRY_RUN" == true ]]; then
  echo "  Would commit: chore: release v$NEW_VER"
  echo "  Would tag: v$NEW_VER"
  ok "DRY RUN — skipping git commit/tag"
  git checkout fnx/package.json fnx/templates-mcp/package.json 2>/dev/null
else
  git add fnx/package.json fnx/templates-mcp/package.json
  git commit -m "chore: release v$NEW_VER" --quiet
  git tag "v$NEW_VER"
  ok "Committed and tagged v$NEW_VER"
fi

# ── Step 4: Publish @vrdmr/fnx-test ──

banner "Step 4: Publish @vrdmr/fnx-test"

cd "$FNX_DIR"

PKG_NAME=$(node -e "console.log(require('./package.json').name)")
PKG_VER=$(node -e "console.log(require('./package.json').version)")
echo "  Package: $PKG_NAME@$PKG_VER"

node bin/fnx --version >/dev/null 2>&1 && ok "fnx --version works" || fail "fnx --version failed"

echo ""
echo "  Contents:"
npm pack --dry-run 2>&1 | grep "npm notice" | grep -v "^npm notice $" | sed 's/npm notice /    /'
echo ""

node bin/fnx start --sku list >/dev/null 2>&1 && ok "fnx start --sku list works" || warn "fnx start --sku list failed (may need CDN)"

if [[ "$DRY_RUN" == true ]]; then
  ok "DRY RUN — skipping publish"
else
  npm publish --access public
  ok "Published $PKG_NAME@$PKG_VER"
fi

# ── Step 5: Publish @vrdmr/fnx-templates-mcp (opt-in) ──

if [[ "$INCLUDE_TEMPLATES_MCP" == false ]]; then
  banner "Step 5: @vrdmr/fnx-templates-mcp — SKIPPED"
  echo "  Use --include-templates-mcp to publish."
  echo "  (Already published by Manvir as azure-functions-templates-mcp-server)"
else
  banner "Step 5: Publish @vrdmr/fnx-templates-mcp"

  cd "$TEMPLATES_MCP_DIR"

  PKG_NAME2=$(node -e "console.log(require('./package.json').name)")
  PKG_VER2=$(node -e "console.log(require('./package.json').version)")
  echo "  Package: $PKG_NAME2@$PKG_VER2"

  echo "  Installing dependencies..."
  npm install --quiet 2>&1 | tail -1
  ok "Dependencies installed"

  echo "  Building TypeScript..."
  npm run build 2>&1 | tail -3
  [[ -f dist/src/server.js ]] && ok "Build succeeded" || fail "Build failed"

  echo ""
  echo "  Contents:"
  npm pack --dry-run 2>&1 | grep "npm notice" | grep -v "^npm notice $" | sed 's/npm notice /    /'
  echo ""

  if [[ "$DRY_RUN" == true ]]; then
    ok "DRY RUN — skipping publish"
  else
    npm publish --access public
    ok "Published $PKG_NAME2@$PKG_VER2"
  fi
fi

# ── Step 6: Push to origin ──

banner "Step 6: Push to origin"

cd "$REPO_ROOT"

if [[ "$DRY_RUN" == true ]]; then
  ok "DRY RUN — skipping push"
else
  git push origin main --tags --quiet
  ok "Pushed main + tag v$NEW_VER to origin"
fi

# ── Step 7: Verify ──

if [[ "$DRY_RUN" == false ]]; then
  banner "Step 7: Post-publish verification"

  echo "  Waiting 10s for npm registry propagation..."
  sleep 10

  npm info "$PKG_NAME" version 2>/dev/null && ok "$PKG_NAME@$(npm info "$PKG_NAME" version) is on npm" || warn "$PKG_NAME not found yet"
  if [[ "$INCLUDE_TEMPLATES_MCP" == true ]]; then
    npm info "$PKG_NAME2" version 2>/dev/null && ok "$PKG_NAME2 is on npm" || warn "$PKG_NAME2 not found yet"
  fi

  echo ""
  echo "  Test with:"
  echo "    npx $PKG_NAME start --sku list"
  echo "    npx $PKG_NAME templates-mcp"
fi

# ── Done ──

banner "Release complete 🎉"
echo "  $PKG_NAME@$NEW_VER"
if [[ "$INCLUDE_TEMPLATES_MCP" == true ]]; then
  echo "  ${PKG_NAME2}@$NEW_VER"
fi
echo "  Tag: v$NEW_VER"
echo "  GitHub: https://github.com/vrdmr/func-emulate/releases/tag/v$NEW_VER"
if [[ "$DRY_RUN" == true ]]; then
  echo ""
  echo "  This was a dry run. Run without --dry-run to release."
fi
echo ""
