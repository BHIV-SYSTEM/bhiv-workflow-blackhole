/**
 * Tier 1 Feature Coverage: F2 — Open Agent & Mini-Window Launcher
 * Verifies loopback health/status, standalone mini-window HTML delivery,
 * foregrounding interface, URI scheme protocol registration, and session controls.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const { config, agentLoopbackClient, isPortOpen, WindowsHelper } = require('./tier1Common');

let agentServerInstance = null;
let activeLoopbackUrl = config.loopbackUrl;

test.before(async () => {
  const isDaemonRunning = await isPortOpen(config.ports.loopback);
  if (!isDaemonRunning) {
    const serverPath = path.resolve(config.paths.agent, 'src/server/localAgentServer.js');
    const { LocalAgentServer } = await import(pathToFileURL(serverPath).href);
    const testPort = 48192;
    activeLoopbackUrl = `http://127.0.0.1:${testPort}`;

    const mockAgent = {
      lifecycle: {
        currentState: 'IDLE_WAITING_AUTH',
        transition: function (to) { this.currentState = to; }
      },
      startMonitoring: async function (sessId) {
        this.lifecycle.currentState = 'ACTIVE_MONITORING';
        return { success: true };
      },
      pauseMonitoring: function (reason) {
        this.lifecycle.currentState = 'PAUSED';
      },
      resumeMonitoring: function () {
        this.lifecycle.currentState = 'ACTIVE_MONITORING';
      },
      stopMonitoring: function (reason) {
        this.lifecycle.currentState = 'STOPPED';
      },
      secureStore: {
        getSecret: async (key) => (key === 'deviceId' ? 'DEV-TEST-ACER' : null)
      },
      win32Monitor: {
        lastSample: {
          appName: 'Code.exe',
          category: 'ENGINEERING',
          activeSeconds: 45,
          idleSeconds: 15
        }
      },
      leaseManager: {
        leaseExpiresAt: Date.now() + 60000
      },
      hardwareInfo: {
        manufacturer: 'Acer',
        model: 'Nitro AN515-57',
        uuid: 'E77CA225-2515-EC11-80E1-088FC3199D36'
      }
    };

    agentServerInstance = new LocalAgentServer(mockAgent, { port: testPort });
    agentServerInstance.start();
    await new Promise((res) => setTimeout(res, 100));
  }
});

test.after(async () => {
  if (agentServerInstance) {
    agentServerInstance.stop();
  }
});

test('[F2] Desktop Agent Loopback Status & Health Contract', async () => {
  const res = await fetch(`${activeLoopbackUrl}/status`);
  assert.equal(res.status, 200, 'Loopback /status must return HTTP 200');

  const data = await res.json();
  assert.ok(data.status === 'ok' || data.status === 'HEALTHY', 'Status must be ok or HEALTHY');
  assert.equal(data.agentVersion, '2.0.0', 'Agent version must be 2.0.0');
  assert.equal(data.manufacturer, 'Acer', 'Manufacturer must be Acer');
  assert.equal(data.model, 'Nitro AN515-57', 'Model must be Nitro AN515-57');
  assert.ok(data.sessionState, 'Session state must be reported');
});

test('[F2] Standalone Employee Mini-Window HTML Delivery', async () => {
  const res = await fetch(`${activeLoopbackUrl}/mini`);
  assert.equal(res.status, 200, 'Loopback /mini must return HTTP 200');

  const contentType = res.headers.get('content-type') || '';
  assert.ok(contentType.includes('text/html'), `Content-Type must be text/html, got: ${contentType}`);

  const html = await res.text();
  assert.ok(html.includes('Niyantran'), 'Mini-window HTML must include Niyantran branding');
  assert.ok(
    html.includes('session-status') || html.includes('current-app') || html.includes('Status'),
    'Mini-window must render session status DOM elements'
  );
  assert.ok(
    html.includes('Privacy') || html.includes('Disclosures') || html.includes('Zero') || html.includes('keystroke'),
    'Mini-window must render privacy disclosures'
  );
});

test('[F2] Open Agent Foregrounding Interface', async () => {
  const res = await fetch(`${activeLoopbackUrl}/open`, { method: 'POST' });
  assert.equal(res.status, 200, 'POST /open must return HTTP 200');

  const data = await res.json();
  assert.equal(data.success, true, 'Foregrounding must indicate success: true');
  assert.ok(
    data.message?.toLowerCase().includes('opened') || data.message?.toLowerCase().includes('foreground'),
    'Response message must confirm opening/foregrounding'
  );
});

test('[F2] Windows Protocol URI Scheme Registration & Launch Contract', () => {
  // Check Windows Registry or installation script defining niyantran:// protocol
  const regValue = WindowsHelper.checkRegistry('HKCU:\\Software\\Classes\\niyantran');
  const installScriptPath = path.resolve(config.paths.agent, 'installer/install-agent.ps1');
  const installScript = fs.readFileSync(installScriptPath, 'utf8');

  // Assert either live registry entry exists or install script configures URL Protocol
  const hasRegEntry = regValue && JSON.stringify(regValue).includes('Niyantran');
  const hasScriptContract = installScript.includes('HKCU:\\Software\\Classes\\niyantran') &&
    installScript.includes('URL Protocol');

  assert.ok(
    hasRegEntry || hasScriptContract,
    'niyantran:// URI scheme protocol handler must be defined in registry or install-agent.ps1'
  );
});

test('[F2] Mini-Window Session Controls (Start, Pause, Resume, End)', async () => {
  // 1. POST /session/start
  const startRes = await fetch(`${activeLoopbackUrl}/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'TEST-SESS-T1-F2', employeeId: 'emp_ishan_001' })
  });
  assert.equal(startRes.status, 200);
  const startData = await startRes.json();
  assert.equal(startData.success, true);
  assert.equal(startData.state, 'ACTIVE_MONITORING');

  // 2. POST /session/pause
  const pauseRes = await fetch(`${activeLoopbackUrl}/session/pause`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Lunch Break' })
  });
  assert.equal(pauseRes.status, 200);
  const pauseData = await pauseRes.json();
  assert.equal(pauseData.success, true);
  assert.equal(pauseData.state, 'PAUSED');

  // 3. POST /session/resume
  const resumeRes = await fetch(`${activeLoopbackUrl}/session/resume`, { method: 'POST' });
  assert.equal(resumeRes.status, 200);
  const resumeData = await resumeRes.json();
  assert.equal(resumeData.success, true);
  assert.equal(resumeData.state, 'ACTIVE_MONITORING');

  // 4. POST /session/end
  const endRes = await fetch(`${activeLoopbackUrl}/session/end`, { method: 'POST' });
  assert.equal(endRes.status, 200);
  const endData = await endRes.json();
  assert.equal(endData.success, true);
  assert.equal(endData.state, 'STOPPED');
});
