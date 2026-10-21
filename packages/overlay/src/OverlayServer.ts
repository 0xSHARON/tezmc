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

    /* Bottom Left YouTube Live Chat Overlay */
    .yt-chat-container {
      position: absolute;
      bottom: 24px;
      left: 24px;
      width: 400px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 10;
      pointer-events: none;
    }

    .yt-chat-header {
      background: rgba(10, 10, 15, 0.9);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 0, 0, 0.3);
      border-radius: 10px;
      padding: 7px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    }

    .yt-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .yt-logo {
      display: flex;
      align-items: center;
    }

    .yt-header-title {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .yt-live-beacon {
      background: #ef4444;
      color: #fff;
      font-size: 9px;
      font-weight: 900;
      padding: 1px 5px;
      border-radius: 3px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      animation: beaconPulse 1.8s infinite;
    }
    @keyframes beaconPulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.65; }
    }

    .yt-commands-hint {
      font-size: 10px;
      font-family: ui-monospace, monospace;
      color: #a78bfa;
      font-weight: 600;
    }

    .yt-chat-messages {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 380px;
      overflow: hidden;
    }

    .yt-chat-item {
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 8px 12px;
      font-size: 12px;
      display: flex;
      gap: 10px;
      align-items: flex-start;
      animation: ytSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
      transition: all 0.25s ease;
    }
    @keyframes ytSlideUp {
      from { opacity: 0; transform: translateY(16px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* Super Chat Special Card */
    .yt-chat-item.is-superchat {
      background: rgba(26, 15, 10, 0.92);
      border: 1.5px solid #f59e0b;
      box-shadow: 0 8px 24px rgba(245, 158, 11, 0.3);
      padding: 0;
      flex-direction: column;
      overflow: hidden;
    }

    .yt-sc-banner {
      background: linear-gradient(90deg, #ea580c, #f59e0b);
      color: #000;
      font-weight: 900;
      font-size: 11px;
      padding: 4px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
    }

    .yt-sc-content {
      padding: 8px 12px;
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }

    .yt-user-avatar {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      flex-shrink: 0;
      object-fit: cover;
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 800;
      color: #ffffff;
    }

    .yt-item-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }

    .yt-author-line {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .yt-author-name {
      font-weight: 700;
      font-size: 12px;
      color: #93c5fd;
    }

    .yt-badge {
      font-size: 9px;
      font-weight: 800;
      padding: 1px 5px;
      border-radius: 3px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .yt-badge-owner { background: #dc2626; color: #fff; }
    .yt-badge-mod { background: #2563eb; color: #fff; }
    .yt-badge-member { background: #059669; color: #fff; }
    .yt-badge-vip { background: #d97706; color: #fff; }
    .yt-badge-cmd { background: #7c3aed; color: #fff; }
    .yt-badge-viewer { background: rgba(255, 255, 255, 0.12); color: #cbd5e1; }

    .yt-message-text {
      color: #f8fafc;
      word-break: break-word;
      line-height: 1.35;
      font-size: 12px;
    }

    .yt-message-text.is-cmd {
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
      <span id="game-name" class="value-badge">Chrome Dinosaur</span>
      <span>State:</span>
      <span id="session-state" class="value-badge" style="color: #6ee7b7">RUNNING</span>
    </div>
    <div class="status-row">
      <span>Objective:</span>
      <span id="objective" style="font-weight: 600; color: #fde047">Obstacle Avoidance & Reflex AI</span>
    </div>
    <div class="status-row">
      <span>AI Score:</span>
      <span id="coords" class="value-badge">Score: 0</span>
      <span>Speed:</span>
      <span id="traveled" class="value-badge">8.0</span>
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
        "Autonomous AI broadcast live on YouTube. Type !jump, !coords, or !status in chat!"
      </div>
    </div>
  </div>

  <!-- Bottom Left YouTube Live Chat Overlay -->
  <div class="yt-chat-container">
    <div class="yt-chat-header">
      <div class="yt-header-left">
        <div class="yt-logo">
          <svg width="18" height="13" viewBox="0 0 24 17" fill="none">
            <path d="M23.498 2.617a3.016 3.016 0 0 0-2.122-2.136C19.505 0 12 0 12 0s-7.505 0-9.377.481A3.017 3.017 0 0 0 .502 2.617C0 4.51 0 8.444 0 8.444s0 3.935.502 5.827a3.016 3.016 0 0 0 2.122 2.136c1.871.481 9.376.481 9.376.481s7.505 0 9.377-.481a3.015 3.015 0 0 0 2.122-2.136c.502-1.892.502-5.827.502-5.827s0-3.934-.502-5.827z" fill="#ff0000"/>
            <polygon points="9.545,12.062 15.772,8.444 9.545,4.827" fill="#ffffff"/>
          </svg>
        </div>
        <span class="yt-header-title">YouTube Live Chat</span>
        <span class="yt-live-beacon">LIVE</span>
      </div>
      <span class="yt-commands-hint">!jump &bull; !status</span>
    </div>

    <div class="yt-chat-messages" id="chat-messages">
      <div class="yt-chat-item">
        <div class="yt-user-avatar" style="background: #ef4444;">YT</div>
        <div class="yt-item-body">
          <div class="yt-author-line">
            <span class="yt-badge yt-badge-cmd">CMD</span>
            <span class="yt-author-name">YouTube Chat Stream</span>
          </div>
          <div class="yt-message-text">Live chat connected! Type !jump or !coords in YouTube Live Chat to interact with the game.</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Bottom Right Watermark -->
  <div class="hud-bottom-right">
    Autonomous Stream Powered by TEZMC &bull; 24/7 Unattended
  </div>

  <script>
    const socket = io();

    function getAvatarColor(name) {
      const colors = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'];
      let hash = 0;
      for (let i = 0; i < (name || '').length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
      return colors[Math.abs(hash) % colors.length];
    }

    socket.on('session:state_changed', (state) => {
      const el = document.getElementById('session-state');
      if (el) el.innerText = state;
    });

    socket.on('game:progress', (progress) => {
      if (!progress) return;
      if (progress.currentObjective) {
        document.getElementById('objective').innerText = progress.currentObjective;
      }
      if (progress.score !== undefined) {
        document.getElementById('coords').innerText = 'Score: ' + progress.score;
      } else if (progress.details && progress.details.position) {
        const p = progress.details.position;
        document.getElementById('coords').innerText = 'X: ' + p.x + ' Y: ' + p.y + ' Z: ' + p.z;
      }
      if (progress.multiplier) {
        document.getElementById('traveled').innerText = 'x' + progress.multiplier;
      } else if (progress.explorationStats) {
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
      item.className = 'yt-chat-item' + (msg.superChatAmount ? ' is-superchat' : '');

      if (msg.superChatAmount) {
        const scBanner = document.createElement('div');
        scBanner.className = 'yt-sc-banner';
        scBanner.innerHTML = '<span>&#9733; SUPER CHAT ' + msg.superChatAmount + '</span><span>' + (msg.author || 'Supporter') + '</span>';
        item.appendChild(scBanner);
      }

      const contentWrapper = document.createElement('div');
      contentWrapper.className = msg.superChatAmount ? 'yt-sc-content' : 'yt-chat-item';
      if (!msg.superChatAmount) {
        contentWrapper.style.padding = '0';
        contentWrapper.style.background = 'transparent';
        contentWrapper.style.border = 'none';
        contentWrapper.style.boxShadow = 'none';
        contentWrapper.style.width = '100%';
      }

      // User avatar
      if (msg.authorPhotoUrl) {
        const img = document.createElement('img');
        img.className = 'yt-user-avatar';
        img.src = msg.authorPhotoUrl;
        img.alt = msg.author || 'User';
        img.onerror = () => { img.style.display = 'none'; };
        contentWrapper.appendChild(img);
      } else {
        const initial = document.createElement('div');
        initial.className = 'yt-user-avatar';
        initial.style.background = getAvatarColor(msg.author);
        initial.innerText = (msg.author || 'U').charAt(0).toUpperCase();
        contentWrapper.appendChild(initial);
      }

      // Item Body
      const body = document.createElement('div');
      body.className = 'yt-item-body';

      const authorLine = document.createElement('div');
      authorLine.className = 'yt-author-line';

      const badge = document.createElement('span');
      if (msg.badge === 'owner') {
        badge.className = 'yt-badge yt-badge-owner';
        badge.innerHTML = '&#128081; OWNER';
      } else if (msg.badge === 'moderator') {
        badge.className = 'yt-badge yt-badge-mod';
        badge.innerHTML = '&#128295; MOD';
      } else if (msg.badge === 'sponsor') {
        badge.className = 'yt-badge yt-badge-member';
        badge.innerHTML = '&#9733; MEMBER';
      } else if (msg.badge === 'vip') {
        badge.className = 'yt-badge yt-badge-vip';
        badge.innerText = 'VIP';
      } else if (msg.isCommand) {
        badge.className = 'yt-badge yt-badge-cmd';
        badge.innerText = 'CMD';
      } else {
        badge.className = 'yt-badge yt-badge-viewer';
        badge.innerText = 'CHAT';
      }

      const author = document.createElement('span');
      author.className = 'yt-author-name';
      author.innerText = msg.author;

      authorLine.appendChild(badge);
      authorLine.appendChild(author);

      const text = document.createElement('div');
      text.className = 'yt-message-text' + (msg.isCommand ? ' is-cmd' : '');
      text.innerText = msg.message;

      body.appendChild(authorLine);
      body.appendChild(text);

      contentWrapper.appendChild(body);

      if (msg.superChatAmount) {
        item.appendChild(contentWrapper);
      } else {
        item.innerHTML = '';
        item.appendChild(contentWrapper.children[0]);
        item.appendChild(contentWrapper.children[0]);
      }

      list.appendChild(item);

      // Keep maximum 5 messages visible in the overlay
      while (list.children.length > 5) {
        list.removeChild(list.firstChild);
      }
    });
  </script>
</body>
</html>`;
  }
}
