#!/usr/bin/env bash
set -euo pipefail

# bump-version.sh — Bump version in both fnx package.json files
#
# Called by release.sh. Can also be used standalone.
#
# Usage:
#   ./release/bump-version.sh           # Bump patch (0.1.0 → 0.1.1)
#   ./release/bump-version.sh minor     # Bump minor (0.1.0 → 0.2.0)
#   ./release/bump-version.sh major     # Bump major (0.1.0 → 1.0.0)
#   ./release/bump-version.sh 0.3.0     # Set explicit version
#
# Steps:
#   1. Read current version from fnx/package.json
#   2. Compute new version (patch/minor/major increment, or use explicit)
#   3. Write new version to fnx/package.json and fnx/templates-mcp/package.json
#   4. Output new version to stdout (last line) for callers to capture

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
  echo "Usage: $0 [patch|minor|major|<version>]" >&2
  echo "  Default: patch" >&2
  exit 1
fi

CURRENT=$(node -e "console.log(require('$REPO_ROOT/fnx/package.json').version)")
echo "Bumping $CURRENT → $NEW_VER" >&2

# fnx
cd "$REPO_ROOT/fnx"
npm version "$NEW_VER" --no-git-tag-version --quiet >/dev/null
echo "  ✓ fnx/package.json → $NEW_VER" >&2

# templates-mcp
cd "$REPO_ROOT/fnx/templates-mcp"
npm version "$NEW_VER" --no-git-tag-version --quiet >/dev/null
echo "  ✓ fnx/templates-mcp/package.json → $NEW_VER" >&2

# Output ONLY the version to stdout for callers
echo "$NEW_VER"
