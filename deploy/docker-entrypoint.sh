#!/usr/bin/env bash
set -e

echo "=== Starting TEZMC Autonomous Core ==="

# 1. Start Xvfb virtual framebuffer on :99
if [ -z "$(pgrep Xvfb 2>/dev/null || true)" ]; then
    echo "[Entrypoint] Starting Xvfb virtual display on :99..."
    Xvfb :99 -screen 0 1280x720x24 -ac +extension GLX +render -noreset &
    sleep 1
fi
export DISPLAY=:99

# 2. Launch TEZMC Core API in the background
echo "[Entrypoint] Launching TEZMC API Server..."
node apps/api/dist/index.js &
API_PID=$!

# 3. Wait for Subway Surfers visual streamer on port 3008
echo "[Entrypoint] Waiting for Subway Surfers canvas server on http://127.0.0.1:3008..."
MAX_WAIT=30
WAITED=0
until curl -s http://127.0.0.1:3008 > /dev/null 2>&1 || [ $WAITED -ge $MAX_WAIT ]; do
    sleep 0.5
    WAITED=$((WAITED + 1))
done

# 4. Launch Chromium in kiosk mode to display Subway Surfers 60FPS canvas on :99
echo "[Entrypoint] Launching Chromium in kiosk mode displaying Subway Surfers on :99..."
chromium --no-sandbox \
    --disable-dev-shm-usage \
    --disable-gpu \
    --kiosk \
    --window-size=1280,720 \
    --window-position=0,0 \
    --autoplay-policy=no-user-gesture-required \
    --app=http://127.0.0.1:3008 &
CHROME_PID=$!

echo "[Entrypoint] All visual and streaming subsystems operational."

# Wait for core API process
wait $API_PID
