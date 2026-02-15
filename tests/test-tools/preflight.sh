#!/usr/bin/env bash
# Usage: ./tests/test-tools/preflight.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"
PASS=0 FAIL=0

check() {
  local label="$1"; shift
  if "$@" > /dev/null 2>&1; then
    echo "  ✓ $label"
    ((PASS++))
  else
    echo "  ✗ $label"
    ((FAIL++))
  fi
}

echo "═══ Pre-flight Checks ═══"
check "Node.js ≥ 18"              node -e "process.exit(parseInt(process.version.slice(1)) >= 18 ? 0 : 1)"
check "func CLI available"        func --version
check "python3 available"         python3 --version
check "Host zips built (≥2)"      bash -c '[[ $(ls cdn-server/hosts/*/azure-functions-v*.zip 2>/dev/null | wc -l) -ge 2 ]]'
check "CDN server responding"     curl -sf http://localhost:4566/api/profiles
check "fnx CLI runnable"     node fnx/bin/fnx
check "test-node-app ready"       test -f tests/test-node-app/host.json
check "test-python-app ready"     test -f tests/test-python-app/function_app.py

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] && echo "✓ All pre-flight checks passed" || echo "✗ Fix failures before running tests"
exit $FAIL
