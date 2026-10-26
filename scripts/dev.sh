#!/usr/bin/env bash
set -euo pipefail

npm run dev:api &
API_PID=$!

npm run dev:web &
WEB_PID=$!

cleanup() {
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

wait
