#!/usr/bin/env bash
set -euo pipefail

# setup-worktrees.sh — Create git worktrees for parallel FRD implementation
#
# Usage:
#   ./scripts/setup-worktrees.sh              # Wave 1 (default)
#   ./scripts/setup-worktrees.sh --wave 2     # Wave 2 (after Wave 1 merges)
#   ./scripts/setup-worktrees.sh --all        # Both waves

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKTREE_DIR="$REPO_ROOT/worktrees"

# Wave 1: No inter-dependencies among proposed FRDs
WAVE1_FRDS=(
  "f6-mcp-server"
  "f7-install-warmup"
  "f8-homepage-improvements"
  "f9-dotnet-isolated-only"
  "f11-debugging-logging-rigor"
  "f13-azurite-dependency"
)

# Wave 2: Depend on Wave 1 merges (F10→F6, F12→F6+F11)
WAVE2_FRDS=(
  "f10-template-mcp-standalone"
  "f12-comprehensive-testing"
)

print_banner() {
  echo ""
  echo "╔═══════════════════════════════════════════════════════╗"
  echo "║  fnx — Parallel FRD Worktree Setup                   ║"
  echo "╚═══════════════════════════════════════════════════════╝"
  echo ""
}

ensure_main_updated() {
  echo "── Ensuring main is up to date ──"
  local current_branch
  current_branch=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)

  git -C "$REPO_ROOT" fetch origin main --quiet
  local local_sha remote_sha
  local_sha=$(git -C "$REPO_ROOT" rev-parse main)
  remote_sha=$(git -C "$REPO_ROOT" rev-parse origin/main)

  if [ "$local_sha" != "$remote_sha" ]; then
    if [ "$current_branch" = "main" ]; then
      git -C "$REPO_ROOT" pull origin main --quiet
    else
      git -C "$REPO_ROOT" fetch origin main:main --quiet
    fi
    echo "  ✓ main updated to $(git -C "$REPO_ROOT" rev-parse --short main)"
  else
    echo "  ✓ main is current ($(git -C "$REPO_ROOT" rev-parse --short main))"
  fi
  echo ""
}

create_worktree() {
  local frd="$1"
  local branch="feature/$frd"
  local wt_path="$WORKTREE_DIR/$frd"

  if [ -d "$wt_path" ]; then
    echo "  ⏭ $frd — worktree already exists at $wt_path"
    return 0
  fi

  # Create branch from main if it doesn't exist
  if git -C "$REPO_ROOT" rev-parse --verify "$branch" >/dev/null 2>&1; then
    echo "  ↻ $frd — branch $branch exists, creating worktree"
  else
    git -C "$REPO_ROOT" branch "$branch" main --quiet
    echo "  ✓ $frd — created branch $branch from main"
  fi

  # Create worktree
  git -C "$REPO_ROOT" worktree add "$wt_path" "$branch" --quiet
  echo "  ✓ $frd — worktree at $wt_path"
}

verify_worktrees() {
  local frds=("$@")
  echo ""
  echo "── Verification ──"
  local ok=0 fail=0
  for frd in "${frds[@]}"; do
    local wt_path="$WORKTREE_DIR/$frd"
    local branch="feature/$frd"
    if [ -d "$wt_path/.git" ] || [ -f "$wt_path/.git" ]; then
      local wt_branch
      wt_branch=$(git -C "$wt_path" rev-parse --abbrev-ref HEAD)
      if [ "$wt_branch" = "$branch" ]; then
        echo "  ✓ $frd → $branch"
        ((ok++))
      else
        echo "  ✗ $frd → expected $branch, got $wt_branch"
        ((fail++))
      fi
    else
      echo "  ✗ $frd — worktree not found"
      ((fail++))
    fi
  done
  echo ""
  echo "  Result: $ok OK, $fail failed"
}

print_usage_instructions() {
  local frds=("$@")
  echo ""
  echo "── Next Steps ──"
  echo ""
  echo "Open a terminal per worktree and start a Copilot CLI session:"
  echo ""
  for frd in "${frds[@]}"; do
    echo "  cd $WORKTREE_DIR/$frd && copilot-cli"
  done
  echo ""
  echo "Each worktree has a matching FRD prompt in agents/frd/"
  echo "Use the merge-specialist agent when all features are complete."
  echo ""
}

setup_wave() {
  local wave="$1"
  shift
  local frds=("$@")

  echo "── Creating Wave $wave worktrees (${#frds[@]} FRDs) ──"
  mkdir -p "$WORKTREE_DIR"

  for frd in "${frds[@]}"; do
    create_worktree "$frd"
  done

  verify_worktrees "${frds[@]}"
  print_usage_instructions "${frds[@]}"
}

# --- Main ---

print_banner
ensure_main_updated

WAVE="${1:---wave}"
WAVE_NUM="${2:-1}"

if [ "$WAVE" = "--all" ]; then
  setup_wave 1 "${WAVE1_FRDS[@]}"
  setup_wave 2 "${WAVE2_FRDS[@]}"
elif [ "$WAVE" = "--wave" ]; then
  case "$WAVE_NUM" in
    1) setup_wave 1 "${WAVE1_FRDS[@]}" ;;
    2) setup_wave 2 "${WAVE2_FRDS[@]}" ;;
    *) echo "Unknown wave: $WAVE_NUM (use 1 or 2)"; exit 1 ;;
  esac
else
  # Default: Wave 1
  setup_wave 1 "${WAVE1_FRDS[@]}"
fi
