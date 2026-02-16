#!/usr/bin/env bash
set -euo pipefail

# bump-version.sh — Bump version for both fnx packages
#
# Usage:
#   ./release/bump-version.sh           # Bump patch (0.1.0 → 0.1.1)
#   ./release/bump-version.sh minor     # Bump minor (0.1.0 → 0.2.0)
#   ./release/bump-version.sh major     # Bump major (0.1.0 → 1.0.0)
#   ./release/bump-version.sh 0.3.0     # Set explicit version

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

BUMP="${1:-patch}"

# Detect if arg is a semver or a bump keyword
if [[ "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
  # Explicit version
  NEW_VER="$BUMP"
elif [[ "$BUMP" =~ ^(patch|minor|major)$ ]]; then
  # Bump keyword — read current version, compute new one
  CURRENT=$(node -e "console.log(require('$REPO_ROOT/fnx/package.json').version)")
  IFS='.' read -r MAJ MIN PAT <<< "${CURRENT%%-*}"
  case "$BUMP" in
    patch) PAT=$((PAT + 1)) ;;
    minor) MIN=$((MIN + 1)); PAT=0 ;;
    major) MAJ=$((MAJ + 1)); MIN=0; PAT=0 ;;
  esac
  NEW_VER="$MAJ.$MIN.$PAT"
else
  echo "Usage: $0 [patch|minor|major|<version>]"
  echo "  Default: patch"
  exit 1
fi

CURRENT=$(node -e "console.log(require('$REPO_ROOT/fnx/package.json').version)")
echo "Bumping $CURRENT → $NEW_VER"

# fnx
cd "$REPO_ROOT/fnx"
npm version "$NEW_VER" --no-git-tag-version --quiet
echo "  ✓ fnx/package.json → $NEW_VER"

# templates-mcp
cd "$REPO_ROOT/fnx/templates-mcp"
npm version "$NEW_VER" --no-git-tag-version --quiet
echo "  ✓ fnx/templates-mcp/package.json → $NEW_VER"

echo ""
echo "Done. Commit and tag:"
echo "  git add fnx/package.json fnx/templates-mcp/package.json"
echo "  git commit -m 'chore: bump version to $NEW_VER'"
echo "  git tag v$NEW_VER"
echo "  git push origin main --tags"
