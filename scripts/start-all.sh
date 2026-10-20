#!/usr/bin/env bash
set -euo pipefail

echo "=== Starting TEZMC Services ==="

# 1. Start Xvfb if in Linux headless environment and display not set
if [[ "$(uname)" == "Linux" ]] && [ -z "${DISPLAY:-}" ]; then
    echo "Starting Xvfb virtual framebuffer on :99..."
    Xvfb :99 -screen 0 1280x720x24 &
    export DISPLAY=:99
fi

# 2. Run API and Dashboard
echo "Starting Control API and Dashboard concurrently..."
pnpm run dev &
pnpm run dev:dashboard &

wait
