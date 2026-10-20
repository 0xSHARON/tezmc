export class OverlayServer {
  public static getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TEZMC Live Stream Overlay</title>
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

    /* Top Left Telemetry HUD */
    .hud-top-left {
      position: absolute;
      top: 24px;
      left: 24px;
      background: rgba(9, 10, 15, 0.88);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 14px;
      padding: 14px 20px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 10;
    }
    .brand-title {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #10b981;
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
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.1);
      padding: 2px 7px;
      border-radius: 4px;
      color: #a7f3d0;
    }

    /* Top Right AI Streamer Commentary Bubble */
    .commentary-box {
      position: absolute;
      top: 24px;
      right: 24px;
      max-width: 420px;
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 14px;
      padding: 14px 18px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
      display: flex;
      gap: 12px;
      align-items: flex-start;
      transition: all 0.3s ease;
      z-index: 10;
    }
    .avatar-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: linear-gradient(135deg, #0284c7, #6366f1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
      box-shadow: 0 0 12px rgba(99, 102, 241, 0.5);
    }
    .commentary-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .commentary-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .speaker-name {
      font-size: 12px;
      font-weight: 700;
      color: #38bdf8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .equalizer {
      display: flex;
      gap: 2px;
      align-items: flex-end;
      height: 12px;
    }
    .eq-bar {
      width: 2px;
      background: #38bdf8;
      border-radius: 1px;
      animation: eq 0.8s infinite ease-in-out alternate;
    }
    .eq-bar:nth-child(1) { height: 4px; animation-delay: 0.1s; }
    .eq-bar:nth-child(2) { height: 10px; animation-delay: 0.3s; }
    .eq-bar:nth-child(3) { height: 7px; animation-delay: 0.2s; }
    @keyframes eq {
      0% { height: 3px; }
      100% { height: 12px; }
    }
    .commentary-text {
      font-size: 13px;
      line-height: 1.4;
      color: #f1f5f9;
      font-style: italic;
    }

    /* Bottom Left Live Viewer Chat Overlay */
    .chat-box {
      position: absolute;
      bottom: 24px;
      left: 24px;
      width: 360px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 10;
    }
    .chat-header {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #94a3b8;
      margin-bottom: 2px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .chat-messages {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .chat-item {
      background: rgba(15, 23, 42, 0.82);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 8px 12px;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      animation: slideInUp 0.3s ease-out;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    }
    @keyframes slideInUp {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .chat-author-line {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .badge {
      font-size: 9px;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .badge-cmd { background: #8b5cf6; color: #fff; }
    .badge-sponsor { background: #10b981; color: #fff; }
    .badge-vip { background: #f59e0b; color: #fff; }
    .badge-viewer { background: rgba(255, 255, 255, 0.15); color: #cbd5e1; }
    .chat-author {
      font-weight: 700;
      color: #93c5fd;
    }
    .chat-text {
      color: #f8fafc;
      word-break: break-word;
    }
    .chat-text.is-cmd {
      color: #c4b5fd;
      font-family: ui-monospace, monospace;
      font-weight: 600;
    }

    /* Bottom Right Watermark */
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
      z-index: 10;
    }
  </style>
  <script src="/socket.io/socket.io.js"></script>
</head>
<body>
  <!-- Top Left Telemetry HUD -->
  <div class="hud-top-left">
    <div class="brand-title">
      <div class="pulse-dot"></div>
      TEZMC &bull; Live Broadcast
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

  <!-- Top Right AI Streamer Commentary Bubble -->
  <div id="commentary-box" class="commentary-box">
    <div class="avatar-icon">&#129302;</div>
    <div class="commentary-content">
      <div class="commentary-header">
        <span class="speaker-name" id="speaker-name">TEZMC AI Narrator</span>
        <div class="equalizer">
          <div class="eq-bar"></div>
          <div class="eq-bar"></div>
          <div class="eq-bar"></div>
        </div>
      </div>
      <div class="commentary-text" id="commentary-text">
        "Starting autonomous exploration sweep across the terrain. Chat with !jump or !coords anytime!"
      </div>
    </div>
  </div>

  <!-- Bottom Left Live Viewer Chat Overlay -->
  <div class="chat-box">
    <div class="chat-header">
      <span>&#128172; Live Stream Chat &bull; Commands Active</span>
    </div>
    <div class="chat-messages" id="chat-messages">
      <div class="chat-item">
        <div class="chat-author-line">
          <span class="badge badge-cmd">CMD</span>
          <span class="chat-author">System</span>
        </div>
        <div class="chat-text">Chat commands enabled! Use !jump, !coords, !status</div>
      </div>
    </div>
  </div>

  <!-- Bottom Right Watermark -->
  <div class="hud-bottom-right">
    Autonomous Stream Powered by TEZMC &bull; 24/7 Unattended
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

    socket.on('commentary:speech', (item) => {
      if (!item || !item.text) return;
      const textEl = document.getElementById('commentary-text');
      const speakerEl = document.getElementById('speaker-name');
      if (textEl) textEl.innerText = '"' + item.text + '"';
      if (speakerEl && item.speaker) speakerEl.innerText = item.speaker;
    });

    socket.on('chat:message', (msg) => {
      if (!msg) return;
      const list = document.getElementById('chat-messages');
      if (!list) return;

      const item = document.createElement('div');
      item.className = 'chat-item';

      const authorLine = document.createElement('div');
      authorLine.className = 'chat-author-line';

      const badge = document.createElement('span');
      if (msg.isCommand) {
        badge.className = 'badge badge-cmd';
        badge.innerText = 'CMD';
      } else if (msg.badge === 'sponsor') {
        badge.className = 'badge badge-sponsor';
        badge.innerText = 'SPONSOR';
      } else if (msg.badge === 'vip') {
        badge.className = 'badge badge-vip';
        badge.innerText = 'VIP';
      } else {
        badge.className = 'badge badge-viewer';
        badge.innerText = 'CHAT';
      }

      const author = document.createElement('span');
      author.className = 'chat-author';
      author.innerText = msg.author;

      authorLine.appendChild(badge);
      authorLine.appendChild(author);

      const text = document.createElement('div');
      text.className = 'chat-text' + (msg.isCommand ? ' is-cmd' : '');
      text.innerText = msg.message;

      item.appendChild(authorLine);
      item.appendChild(text);

      list.appendChild(item);

      // Keep maximum 4 messages visible in the HUD
      while (list.children.length > 4) {
        list.removeChild(list.firstChild);
      }
    });
  </script>
</body>
</html>`;
  }
}
