#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

HTML_FILE="moiré/moiré.html"
RUNTIME_FILE="pretext-runtime.js"
EXPECTED_BUSTER="v=20260413-1"

echo "[1/3] Checking cache-buster in ${HTML_FILE}"
grep -q "pretext-runtime.js?${EXPECTED_BUSTER}" "$HTML_FILE"

echo "[2/3] Checking diagnostics initialization in ${RUNTIME_FILE}"
grep -q "const diagnostics = global.pretextRuntimeDiagnostics || {};" "$RUNTIME_FILE"
grep -q "global.pretextRuntimeDiagnostics = diagnostics;" "$RUNTIME_FILE"

echo "[3/3] JavaScript syntax check (${RUNTIME_FILE})"
node -e "const fs=require('fs'); new Function(fs.readFileSync('${RUNTIME_FILE}','utf8'));"

echo "verify-moire-pretext: PASS"
