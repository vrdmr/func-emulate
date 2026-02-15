#!/usr/bin/env bash
set -euo pipefail

# teardown-worktrees.sh — Remove git worktrees after merges are complete
#
# Usage:
#   ./scripts/teardown-worktrees.sh              # Remove all worktrees
#   ./scripts/teardown-worktrees.sh --wave 1     # Remove Wave 1 only
#   ./scripts/teardown-worktrees.sh --keep-branches  # Remove worktrees but keep branches

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKTREE_DIR="$REPO_ROOT/worktrees"

ALL_FRDS=(
  "f6-mcp-server"
  "f7-install-warmup"
  "f8-homepage-improvements"
  "f9-dotnet-isolated-only"
  "f11-debugging-logging-rigor"
  "f13-azurite-dependency"
  "f10-template-mcp-standalone"
  "f12-comprehensive-testing"
)

WAVE1_FRDS=(
  "f6-mcp-server"
  "f7-install-warmup"
  "f8-homepage-improvements"
  "f9-dotnet-isolated-only"
  "f11-debugging-logging-rigor"
  "f13-azurite-dependency"
)

WAVE2_FRDS=(
  "f10-template-mcp-standalone"
  "f12-comprehensive-testing"
)

KEEP_BRANCHES=false

remove_worktree() {
  local frd="$1"
  local wt_path="$WORKTREE_DIR/$frd"
  local branch="feature/$frd"

  if [ -d "$wt_path" ] || [ -f "$wt_path/.git" ]; then
    git -C "$REPO_ROOT" worktree remove "$wt_path" --force 2>/dev/null || rm -rf "$wt_path"
    echo "  ✓ Removed worktree: $frd"
  else
    echo "  ⏭ $frd — no worktree found"
  fi

  if [ "$KEEP_BRANCHES" = false ]; then
    if git -C "$REPO_ROOT" rev-parse --verify "$branch" >/dev/null 2>&1; then
      # Only delete if merged to main
      if git -C "$REPO_ROOT" branch --merged main | grep -q "$branch"; then
        git -C "$REPO_ROOT" branch -d "$branch" --quiet 2>/dev/null
        echo "  ✓ Deleted merged branch: $branch"
      else
        echo "  ⚠ Kept unmerged branch: $branch"
      fi
    fi
  fi
}

teardown() {
  local frds=("$@")
  echo "── Removing ${#frds[@]} worktrees ──"
  for frd in "${frds[@]}"; do
    remove_worktree "$frd"
  done

  # Prune stale worktree references
  git -C "$REPO_ROOT" worktree prune
  echo ""
  echo "  ✓ Worktree cleanup complete"

  # Remove worktrees dir if empty
  if [ -d "$WORKTREE_DIR" ] && [ -z "$(ls -A "$WORKTREE_DIR" 2>/dev/null)" ]; then
    rmdir "$WORKTREE_DIR"
    echo "  ✓ Removed empty worktrees/ directory"
  fi
}

# --- Parse args ---
FRDS=("${ALL_FRDS[@]}")
while [[ $# -gt 0 ]]; do
  case "$1" in
    --wave)
      case "$2" in
        1) FRDS=("${WAVE1_FRDS[@]}") ;;
        2) FRDS=("${WAVE2_FRDS[@]}") ;;
        *) echo "Unknown wave: $2"; exit 1 ;;
      esac
      shift 2 ;;
    --keep-branches) KEEP_BRANCHES=true; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

teardown "${FRDS[@]}"
