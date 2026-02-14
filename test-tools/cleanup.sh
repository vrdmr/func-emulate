#!/usr/bin/env bash
# Usage: ./test-tools/cleanup.sh [PID1 PID2 ...]
# If PIDs given, kills those. Otherwise kills tracked PIDs from PIDS_FILE.
set -uo pipefail

PIDS_FILE="/tmp/func-emu-test-pids"

if [[ $# -gt 0 ]]; then
  for pid in "$@"; do
    kill "$pid" 2>/dev/null && echo "✓ Killed PID $pid" || echo "  PID $pid already gone"
    wait "$pid" 2>/dev/null
  done
else
  if [[ -f "$PIDS_FILE" ]]; then
    while read -r pid; do
      kill "$pid" 2>/dev/null && echo "✓ Killed PID $pid" || echo "  PID $pid already gone"
      wait "$pid" 2>/dev/null
    done < "$PIDS_FILE"
    rm -f "$PIDS_FILE"
  fi
fi

# Safety net: find any orphaned host processes
ORPHANS=$(pgrep -f "Microsoft.Azure.WebJobs.Script.WebHost" 2>/dev/null || true)
if [[ -n "$ORPHANS" ]]; then
  echo "Found orphaned host processes: $ORPHANS"
  echo "$ORPHANS" | while read -r pid; do
    kill "$pid" 2>/dev/null && echo "✓ Killed orphaned host PID $pid"
  done
fi
