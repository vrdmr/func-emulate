#!/usr/bin/env bash
# Usage: ./tests/test-tools/start-cdn.sh
# Output: CDN_PID=<pid> on stdout (for eval)
# Exit 1 if CDN doesn't become healthy within 10s
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${CDN_PORT:-4566}"

node "$SCRIPT_DIR/cdn-server/server.js" &
CDN_PID=$!

# Poll for health
for i in $(seq 1 20); do
  if curl -sf "http://localhost:${PORT}/" > /dev/null 2>&1; then
    echo "CDN_PID=$CDN_PID"
    echo "✓ CDN server ready on port $PORT (PID $CDN_PID)" >&2
    exit 0
  fi
  sleep 0.5
done

echo "✗ CDN server failed to start within 10s" >&2
kill $CDN_PID 2>/dev/null
exit 1
