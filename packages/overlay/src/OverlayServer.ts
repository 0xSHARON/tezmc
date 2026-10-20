export class OverlayServer {
  public static getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AutoPlay AI Live Stream Overlay</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: transparent;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      color: #fff;
    }
    .hud-top-left {
      position: absolute;
      top: 24px;
      left: 24px;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      padding: 12px 18px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .brand-title {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ef4444;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.3); }
      100% { opacity: 1; transform: scale(1); }
    }
    .status-row {
      font-size: 13px;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .value-badge {
      font-family: monospace;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.1);
      padding: 2px 6px;
      border-radius: 4px;
      color: #a7f3d0;
    }
    .hud-bottom-right {
      position: absolute;
      bottom: 24px;
      right: 24px;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      padding: 10px 16px;
      font-size: 12px;
      color: #94a3b8;
    }
  </style>
  <script src="/socket.io/socket.io.js"></script>
</head>
<body>
  <div class="hud-top-left">
    <div class="brand-title">
      <div class="pulse-dot"></div>
      AutoPlay AI &bull; Live Broadcast
    </div>
    <div class="status-row">
      <span>Game:</span>
      <span id="game-name" class="value-badge">Minecraft Java</span>
      <span>State:</span>
      <span id="session-state" class="value-badge" style="color: #6ee7b7">RUNNING</span>
    </div>
    <div class="status-row">
      <span>Objective:</span>
      <span id="objective" style="font-weight: 600; color: #fde047">Bounded Exploration</span>
    </div>
    <div class="status-row">
      <span>Coordinates:</span>
      <span id="coords" class="value-badge">X: 0 Y: 64 Z: 0</span>
      <span>Traveled:</span>
      <span id="traveled" class="value-badge">0m</span>
    </div>
  </div>

  <div class="hud-bottom-right">
    Autonomous Stream Powered by AutoPlay AI &bull; 24/7 Unattended
  </div>

  <script>
    const socket = io();
    socket.on('session:state_changed', (state) => {
      const el = document.getElementById('session-state');
      if (el) el.innerText = state;
    });

    socket.on('game:progress', (progress) => {
      if (progress.currentObjective) {
        document.getElementById('objective').innerText = progress.currentObjective;
      }
      if (progress.details && progress.details.position) {
        const p = progress.details.position;
        document.getElementById('coords').innerText = 'X: ' + p.x + ' Y: ' + p.y + ' Z: ' + p.z;
      }
      if (progress.explorationStats) {
        document.getElementById('traveled').innerText = progress.explorationStats.blocksTraveled + 'm';
      }
    });
  </script>
</body>
</html>`;
  }
}
