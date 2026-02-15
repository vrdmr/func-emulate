#!/usr/bin/env bash
# Usage: ./tests/test-tools/check-endpoint.sh <url> [expected_status] [max_retries]
# Example: ./tests/test-tools/check-endpoint.sh http://localhost:7071/api/hello 200
# Exit 0 on match, exit 1 on mismatch/timeout
set -euo pipefail

URL="$1"
EXPECTED="${2:-200}"
MAX_RETRIES="${3:-5}"

for i in $(seq 1 "$MAX_RETRIES"); do
  STATUS=$(curl -s -o /tmp/check-endpoint-body -w "%{http_code}" "$URL" 2>/dev/null) || STATUS="000"
  BODY=$(cat /tmp/check-endpoint-body 2>/dev/null || echo "")

  if [[ "$STATUS" == "$EXPECTED" ]]; then
    echo "✓ $URL → HTTP $STATUS"
    [[ -n "$BODY" ]] && echo "  Body: $(echo "$BODY" | head -c 200)"
    rm -f /tmp/check-endpoint-body
    exit 0
  fi

  if [[ "$STATUS" != "000" ]]; then
    # Got a real HTTP status, just not what we expected
    echo "✗ $URL → HTTP $STATUS (expected $EXPECTED)"
    [[ -n "$BODY" ]] && echo "  Body: $(echo "$BODY" | head -c 200)"
    rm -f /tmp/check-endpoint-body
    exit 1
  fi

  # Connection refused — retry
  sleep 1
done

echo "✗ $URL → connection refused after $MAX_RETRIES retries"
rm -f /tmp/check-endpoint-body
exit 1
