#!/usr/bin/env bash
set -e

echo "=== Starting TEZMC Autonomous Core ==="

# 1. Clean up stale Xvfb lock files and start Xvfb virtual framebuffer on :99
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99 2>/dev/null || true
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

# 3. Wait for visual streamer (defaults to 3008 or 3009 if ACTIVE_GAME=pokemon-red)
TARGET_PORT=${VIEWER_PORT:-3008}
if [ "$ACTIVE_GAME" = "pokemon-red" ]; then
    TARGET_PORT=3009
fi

echo "[Entrypoint] Waiting for visual streamer on http://127.0.0.1:$TARGET_PORT..."
MAX_WAIT=30
WAITED=0
until curl -s http://127.0.0.1:$TARGET_PORT > /dev/null 2>&1 || [ $WAITED -ge $MAX_WAIT ]; do
    sleep 0.5
    WAITED=$((WAITED + 1))
done

# 4. Launch Chromium in kiosk mode displaying active game on :99
echo "[Entrypoint] Launching Chromium in kiosk mode displaying http://127.0.0.1:$TARGET_PORT on :99..."
(
    while true; do
        chromium --no-sandbox \
            --disable-dev-shm-usage \
            --disable-gpu \
            --kiosk \
            --window-size=1280,720 \
            --window-position=0,0 \
            --autoplay-policy=no-user-gesture-required \
            --app=http://127.0.0.1:$TARGET_PORT || true
        sleep 2
    done
) &

echo "[Entrypoint] All visual and streaming subsystems operational."

# Wait for core API process
wait $API_PID
