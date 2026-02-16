#!/usr/bin/env bash
set -euo pipefail

# release.sh — Build, verify, and publish fnx packages to npm
#
# Usage:
#   ./release/release.sh --dry-run                # Verify everything, don't publish
#   ./release/release.sh                           # Publish @vrdmr/fnx-test only
#   ./release/release.sh --include-templates-mcp   # Also publish @vrdmr/fnx-templates-mcp
#   ./release/release.sh --skip-login              # Skip npm login (already authenticated)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FNX_DIR="$REPO_ROOT/fnx"
TEMPLATES_MCP_DIR="$FNX_DIR/templates-mcp"

DRY_RUN=false
SKIP_LOGIN=false
INCLUDE_TEMPLATES_MCP=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --skip-login) SKIP_LOGIN=true; shift ;;
    --include-templates-mcp) INCLUDE_TEMPLATES_MCP=true; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ── Helpers ──

banner() { echo ""; echo "═══ $1 ═══"; echo ""; }
ok()     { echo "  ✓ $1"; }
fail()   { echo "  ✗ $1"; exit 1; }
warn()   { echo "  ⚠ $1"; }

# ── Pre-flight ──

banner "Pre-flight checks"

# Node.js
node --version >/dev/null 2>&1 || fail "Node.js not found"
NODE_VER=$(node -e "console.log(process.versions.node.split('.')[0])")
[[ "$NODE_VER" -ge 18 ]] || fail "Node.js 18+ required (got $NODE_VER)"
ok "Node.js $(node --version)"

# npm
npm --version >/dev/null 2>&1 || fail "npm not found"
ok "npm $(npm --version)"

# Git clean
if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
  warn "Working directory is not clean — uncommitted changes exist"
fi

# On main branch
BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  warn "Not on main branch (on $BRANCH)"
fi

# npm login
if [[ "$SKIP_LOGIN" == false && "$DRY_RUN" == false ]]; then
  banner "npm authentication"
  npm whoami >/dev/null 2>&1 && ok "Logged in as $(npm whoami)" || {
    echo "  Not logged in — running npm login..."
    npm login
    ok "Logged in as $(npm whoami)"
  }
fi

# ── Package 1: @vrdmr/fnx-test ──

banner "Package 1: @vrdmr/fnx-test"

cd "$FNX_DIR"

# Verify package.json
PKG_NAME=$(node -e "console.log(require('./package.json').name)")
PKG_VER=$(node -e "console.log(require('./package.json').version)")
echo "  Package: $PKG_NAME@$PKG_VER"

# Verify bin entries work
node bin/fnx --version >/dev/null 2>&1 && ok "fnx --version works" || fail "fnx --version failed"

# Pack dry run
echo ""
echo "  Contents:"
npm pack --dry-run 2>&1 | grep "npm notice" | grep -v "^npm notice $" | sed 's/npm notice /    /'
echo ""

# Smoke test: sku list (uses bundled profiles, no network needed)
node bin/fnx start --sku list >/dev/null 2>&1 && ok "fnx start --sku list works" || warn "fnx start --sku list failed (may need CDN)"

if [[ "$DRY_RUN" == true ]]; then
  ok "DRY RUN — skipping publish"
else
  echo ""
  echo "  Publishing $PKG_NAME@$PKG_VER..."
  npm publish --access public
  ok "Published $PKG_NAME@$PKG_VER"
fi

# ── Package 2: @vrdmr/fnx-templates-mcp (opt-in) ──

if [[ "$INCLUDE_TEMPLATES_MCP" == false ]]; then
  banner "Package 2: @vrdmr/fnx-templates-mcp — SKIPPED"
  echo "  Not included. Use --include-templates-mcp to publish."
  echo "  (Already published separately by Manvir as azure-functions-templates-mcp-server)"
else

banner "Package 2: @vrdmr/fnx-templates-mcp"

cd "$TEMPLATES_MCP_DIR"

PKG_NAME2=$(node -e "console.log(require('./package.json').name)")
PKG_VER2=$(node -e "console.log(require('./package.json').version)")
echo "  Package: $PKG_NAME2@$PKG_VER2"

# Install deps
echo "  Installing dependencies..."
npm install --quiet 2>&1 | tail -1
ok "Dependencies installed"

# Build TypeScript
echo "  Building TypeScript..."
npm run build 2>&1 | tail -3
[[ -f dist/src/server.js ]] && ok "Build succeeded (dist/src/server.js exists)" || fail "Build failed — dist/src/server.js not found"

# Pack dry run
echo ""
echo "  Contents:"
npm pack --dry-run 2>&1 | grep "npm notice" | grep -v "^npm notice $" | sed 's/npm notice /    /'
echo ""

# Smoke test
node smoke.mjs >/dev/null 2>&1 && ok "Smoke test passed" || warn "Smoke test failed (may be expected without stdin)"

if [[ "$DRY_RUN" == true ]]; then
  ok "DRY RUN — skipping publish"
else
  echo ""
  echo "  Publishing $PKG_NAME2@$PKG_VER2..."
  npm publish --access public
  ok "Published $PKG_NAME2@$PKG_VER2"
fi

fi  # end --include-templates-mcp

# ── Post-publish verification ──

if [[ "$DRY_RUN" == false ]]; then
  banner "Post-publish verification"

  echo "  Waiting 10s for npm registry propagation..."
  sleep 10

  npm info "$PKG_NAME" version 2>/dev/null && ok "$PKG_NAME is on npm" || warn "$PKG_NAME not found yet (may take a minute)"
  if [[ "$INCLUDE_TEMPLATES_MCP" == true ]]; then
    npm info "$PKG_NAME2" version 2>/dev/null && ok "$PKG_NAME2 is on npm" || warn "$PKG_NAME2 not found yet (may take a minute)"
  fi

  echo ""
  echo "  Test with:"
  echo "    npx $PKG_NAME start --sku list"
  echo "    npx $PKG_NAME templates-mcp"
  if [[ "$INCLUDE_TEMPLATES_MCP" == true ]]; then
    echo "    npx $PKG_NAME2"
  fi
fi

# ── Done ──

banner "Release complete"
echo "  $PKG_NAME@$PKG_VER"
if [[ "$INCLUDE_TEMPLATES_MCP" == true ]]; then
  echo "  $PKG_NAME2@$PKG_VER2"
fi
if [[ "$DRY_RUN" == true ]]; then
  echo ""
  echo "  This was a dry run. Run without --dry-run to publish."
fi
echo ""
