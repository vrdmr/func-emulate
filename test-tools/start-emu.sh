#!/usr/bin/env bash
# Usage: ./test-tools/start-emu.sh --sku flex --port 7071 --scriptroot ./test-node-app
# Output: EMU_PID=<pid> on stdout (for eval)
# Exit 1 if host doesn't respond within 60s
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Parse args (pass-through to func-emu)
SKU="" PORT="" SCRIPTROOT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sku) SKU="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --scriptroot) SCRIPTROOT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

PORT="${PORT:-7071}"
SCRIPTROOT="${SCRIPTROOT:-./test-node-app}"

echo "Starting func-emu --sku $SKU --port $PORT --scriptroot $SCRIPTROOT" >&2

node "$SCRIPT_DIR/func-emu/bin/func-emu" start \
  --sku "$SKU" --port "$PORT" --scriptroot "$SCRIPTROOT" &
EMU_PID=$!

# Poll for host readiness (check HTTP endpoint, not just process alive)
echo "Waiting for host on port $PORT..." >&2
for i in $(seq 1 120); do
  if curl -sf "http://localhost:${PORT}/admin/host/status" > /dev/null 2>&1; then
    echo "EMU_PID=$EMU_PID"
    echo "✓ Host ready on port $PORT (PID $EMU_PID, SKU=$SKU)" >&2
    exit 0
  fi
  # Also check if process is still alive
  if ! kill -0 $EMU_PID 2>/dev/null; then
    echo "✗ func-emu process died before host became ready" >&2
    exit 1
  fi
  sleep 0.5
done

echo "✗ Host not ready after 60s on port $PORT" >&2
kill $EMU_PID 2>/dev/null
exit 1
