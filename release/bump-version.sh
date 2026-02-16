#!/usr/bin/env bash
set -euo pipefail

# bump-version.sh — Bump version for both fnx packages
#
# Usage:
#   ./release/bump-version.sh 0.2.0

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.2.0"
  exit 1
fi

NEW_VER="$1"

# Validate semver (basic check)
if [[ ! "$NEW_VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
  echo "Error: '$NEW_VER' is not a valid semver"
  exit 1
fi

echo "Bumping to $NEW_VER"

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
