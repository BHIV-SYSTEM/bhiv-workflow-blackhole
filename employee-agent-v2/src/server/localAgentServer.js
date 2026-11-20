/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Local Loopback Agent Server & Mini Desktop Window Provider
 *
 * Runs exclusively on 127.0.0.1:48120 (loopback only) to provide:
 * 1. Instant Web UI Agent Detection (CORS enabled for localhost:5173 / web app).
 * 2. Real-time Agent Status & Health telemetry.
 * 3. Employee Mini Desktop Window served directly at http://127.0.0.1:48120/mini.
 * 4. Local session control triggers (Start, Pause, Resume, End).
 */

import http from 'node:http';
import os from 'node:os';

export const LOCAL_SERVER_PORT = 48120;

export class LocalAgentServer {
  constructor(agentInstance, options = {}) {
    this.agent = agentInstance;
    this.port = options.port || LOCAL_SERVER_PORT;
    this.enabled = options.enabled !== false;
    this.server = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning || !this.enabled) return;

    this.server = http.createServer((req, res) => this._handleRequest(req, res));
    this.server.listen(this.port, '127.0.0.1', () => {
      this.isRunning = true;
      console.log(`[LocalAgentServer] Listening on http://127.0.0.1:${this.port} (Loopback only)`);
    });

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[LocalAgentServer] Port ${this.port} already in use. Another agent instance may be running.`);
      } else {
        console.error('[LocalAgentServer] Server error:', err.message);
      }
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.isRunning = false;
      this.server = null;
    }
  }

  _setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-device-id');
  }

  async _handleRequest(req, res) {
    this._setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

    // GET /status or /health
    if ((req.method === 'GET' || req.method === 'HEAD') && (url.pathname === '/status' || url.pathname === '/health')) {
      return this._handleStatus(res);
    }

    // GET /mini (Employee Mini Desktop Window HTML)
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/mini') {
      return this._handleMiniWindow(res);
    }

    // POST /session/start
    if (req.method === 'POST' && url.pathname === '/session/start') {
      return this._handleSessionAction(req, res, 'START');
    }

    // POST /session/pause
    if (req.method === 'POST' && url.pathname === '/session/pause') {
      return this._handleSessionAction(req, res, 'PAUSE');
    }

    // POST /session/resume
    if (req.method === 'POST' && url.pathname === '/session/resume') {
      return this._handleSessionAction(req, res, 'RESUME');
    }

    // POST /session/end
    if (req.method === 'POST' && url.pathname === '/session/end') {
      return this._handleSessionAction(req, res, 'END');
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found', code: 'NOT_FOUND' }));
  }

  async _handleStatus(res) {
    let deviceId = 'UNPAIRED';
    try {
      deviceId = await this.agent?.secureStore?.getSecret('deviceId') || 'UNPAIRED';
    } catch (_) {}

    const state = this.agent?.lifecycle?.currentState || 'IDLE_WAITING_AUTH';
    const lastSample = this.agent?.win32Monitor?.lastSample || {};

    const statusPayload = {
      service: 'niyantran-employee-agent-v2',
      status: 'HEALTHY',
      installed: true,
      running: true,
      agentVersion: '2.0.0',
      platform: process.platform,
      hostname: os.hostname(),
      username: os.userInfo().username,
      deviceId,
      isEnrolled: deviceId !== 'UNPAIRED' && Boolean(deviceId),
      sessionState: state,
      currentMode: this.agent?.currentMode || 'LAPTOP_PC',
      currentApp: lastSample.appName || 'Idle / Background',
      currentCategory: lastSample.category || 'NEUTRAL',
      activeSeconds: lastSample.activeSeconds || 0,
      hardwareIdleSeconds: lastSample.idleSeconds || 0,
      lastSyncTimestamp: new Date().toISOString(),
      privacyGuarantees: {
        screenshots: 'STRICTLY_PROHIBITED',
        rawKeystrokes: 'STRICTLY_PROHIBITED',
        browserUrls: 'STRICTLY_PROHIBITED',
        windowTitles: 'STRICTLY_PROHIBITED',
        inputFrequencyOnly: true,
        dpapiVaultProtected: true,
      },
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(statusPayload, null, 2));
  }

  async _handleSessionAction(req, res, action) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let parsed = {};
      try { parsed = JSON.parse(body || '{}'); } catch (_) {}

      try {
        if (action === 'START') {
          const sessId = parsed.sessionId || `sess_local_${Date.now()}`;
          await this.agent.startMonitoring(sessId);
        } else if (action === 'PAUSE') {
          this.agent.pauseMonitoring(parsed.reason || 'Manual Pause');
        } else if (action === 'RESUME') {
          this.agent.resumeMonitoring();
        } else if (action === 'END') {
          this.agent.stopMonitoring(parsed.reason || 'User Ended');
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, action, state: this.agent?.lifecycle?.currentState }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message, code: 'ACTION_FAILED' }));
      }
    });
  }

  _handleMiniWindow(res) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Niyantran V2 — Employee Mini Monitor</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      padding: 16px;
      font-size: 13px;
      line-height: 1.4;
      user-select: none;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 12px;
      margin-bottom: 12px;
    }
    .logo-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 14px;
      color: #a855f7;
    }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-active { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid #22c55e; }
    .badge-paused { background: rgba(234, 179, 8, 0.2); color: #facc15; border: 1px solid #eab308; }
    .badge-idle { background: rgba(148, 163, 184, 0.2); color: #94a3b8; border: 1px solid #64748b; }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .row { display: flex; justify-content: space-between; margin-bottom: 6px; }
    .row:last-child { margin-bottom: 0; }
    .label { color: #94a3b8; }
    .val { font-weight: 600; color: #f1f5f9; }
    .timer { font-size: 24px; font-weight: 700; color: #a855f7; text-align: center; margin: 10px 0; font-family: monospace; }
    .controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
    button {
      padding: 8px 12px;
      border-radius: 6px;
      border: none;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-primary { background: #9333ea; color: #ffffff; }
    .btn-warn { background: #eab308; color: #000000; }
    .btn-danger { background: #ef4444; color: #ffffff; }
    .btn-outline { background: transparent; border: 1px solid #475569; color: #cbd5e1; grid-column: span 2; }
    .privacy-list { font-size: 11px; color: #94a3b8; }
    .privacy-list li { margin-bottom: 3px; list-style-type: none; }
    .check { color: #22c55e; margin-right: 4px; font-weight: bold; }
    .cross { color: #ef4444; margin-right: 4px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-badge">
      <span>🛡️ NIYANTRAN V2</span>
    </div>
    <span id="statusBadge" class="badge badge-idle">CONNECTING...</span>
  </div>

  <div class="card">
    <div class="row"><span class="label">Work Mode:</span><span id="workMode" class="val">💻 PC Workstation</span></div>
    <div class="row"><span class="label">Device ID:</span><span id="deviceId" class="val" style="font-family: monospace; font-size: 11px;">Loading...</span></div>
    <div class="row"><span class="label">Foreground App:</span><span id="activeApp" class="val">Monitoring...</span></div>
    <div class="row"><span class="label">Category:</span><span id="activeCategory" class="val">NEUTRAL</span></div>
    <div class="timer" id="sessionTimer">00:00:00</div>
  </div>

  <div class="controls">
    <button id="btnStart" class="btn-primary" onclick="action('start')">▶ Start Session</button>
    <button id="btnPause" class="btn-warn" onclick="action('pause')" disabled>⏸ Pause</button>
    <button id="btnResume" class="btn-primary" onclick="action('resume')" disabled style="display:none;">▶ Resume</button>
    <button id="btnEnd" class="btn-danger" onclick="action('end')" disabled>⏹ End Session</button>
    <button class="btn-outline" onclick="openFullApp()">🌐 Open Full Workspace</button>
  </div>

  <div class="card">
    <div style="font-weight: 700; margin-bottom: 6px; font-size: 12px; color: #c084fc;">Transparent Privacy Contract</div>
    <ul class="privacy-list">
      <li><span class="check">✓</span> Foreground application name & durations</li>
      <li><span class="check">✓</span> Hardware idle time & workstation locks</li>
      <li><span class="cross">✗</span> ZERO screenshots or desktop recording</li>
      <li><span class="cross">✗</span> ZERO keystroke characters or typed text</li>
      <li><span class="cross">✗</span> ZERO browser URLs, tabs, or web history</li>
    </ul>
  </div>

  <script>
    let elapsedSeconds = 0;
    let timerInterval = null;

    async function fetchStatus() {
      try {
        const res = await fetch('/status');
        const data = await res.json();
        updateUI(data);
      } catch (e) {
        document.getElementById('statusBadge').className = 'badge badge-idle';
        document.getElementById('statusBadge').innerText = 'OFFLINE';
      }
    }

    function formatTime(sec) {
      const h = String(Math.floor(sec / 3600)).padStart(2, '0');
      const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
      const s = String(sec % 60).padStart(2, '0');
      return h + ':' + m + ':' + s;
    }

    function updateUI(data) {
      document.getElementById('deviceId').innerText = data.deviceId || 'DEV-UNPAIRED';
      document.getElementById('activeApp').innerText = data.currentApp || 'None';
      document.getElementById('activeCategory').innerText = data.currentCategory || 'NEUTRAL';
      document.getElementById('workMode').innerText = data.currentMode === 'PHONE' ? '📱 Mobile Mode' : '💻 PC Workstation';

      const badge = document.getElementById('statusBadge');
      const btnStart = document.getElementById('btnStart');
      const btnPause = document.getElementById('btnPause');
      const btnResume = document.getElementById('btnResume');
      const btnEnd = document.getElementById('btnEnd');

      if (data.sessionState === 'ACTIVE_MONITORING' || data.sessionState === 'ACTIVE') {
        badge.className = 'badge badge-active';
        badge.innerText = '● ACTIVE';
        btnStart.style.display = 'none';
        btnPause.style.display = 'inline-block';
        btnPause.disabled = false;
        btnResume.style.display = 'none';
        btnEnd.disabled = false;
        elapsedSeconds = data.activeSeconds || elapsedSeconds;
      } else if (data.sessionState === 'PAUSED') {
        badge.className = 'badge badge-paused';
        badge.innerText = '❚❚ PAUSED';
        btnStart.style.display = 'none';
        btnPause.style.display = 'none';
        btnResume.style.display = 'inline-block';
        btnResume.disabled = false;
        btnEnd.disabled = false;
      } else {
        badge.className = 'badge badge-idle';
        badge.innerText = 'WAITING';
        btnStart.style.display = 'inline-block';
        btnStart.disabled = false;
        btnPause.style.display = 'inline-block';
        btnPause.disabled = true;
        btnResume.style.display = 'none';
        btnEnd.disabled = true;
      }
      document.getElementById('sessionTimer').innerText = formatTime(elapsedSeconds);
    }

    async function action(act) {
      try {
        await fetch('/session/' + act, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        fetchStatus();
      } catch (e) {
        alert('Action failed: ' + e.message);
      }
    }

    function openFullApp() {
      window.open('http://localhost:5173/monitoring-v2/employee', '_blank');
    }

    setInterval(fetchStatus, 2000);
    setInterval(() => {
      const badge = document.getElementById('statusBadge');
      if (badge && badge.innerText.includes('ACTIVE')) {
        elapsedSeconds++;
        document.getElementById('sessionTimer').innerText = formatTime(elapsedSeconds);
      }
    }, 1000);
    fetchStatus();
  </script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }
}
