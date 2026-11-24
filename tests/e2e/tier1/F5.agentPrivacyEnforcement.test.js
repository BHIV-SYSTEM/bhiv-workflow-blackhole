/**
 * Tier 1 Feature Coverage: F5 — Agent Privacy Enforcement & Anti-Surveillance
 * Verifies process tracking without window titles, numeric input aggregation without raw keystrokes,
 * valid telemetry ingestion, database storage purity, and transparent privacy disclosures.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const { config, authHelper, apiRequest, ensureDbConnected, dbHelper, getOrCreateTestUser } = require('./tier1Common');
const { validateTelemetrySample } = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/contracts'));
const { encrypt } = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/services/cryptoUtil'));

test.after(async () => {
  await dbHelper.disconnect();
});

test('[F5] Agent Disclosed Process Tracking Without Window Title Surveillance', () => {
  const win32MonitorPath = path.resolve(config.paths.agent, 'src/native/win32Monitor.js');
  assert.ok(fs.existsSync(win32MonitorPath), 'win32Monitor.js must exist in desktop agent');

  const monitorCode = fs.readFileSync(win32MonitorPath, 'utf8');

  // Verify process image name tracking is supported
  assert.ok(
    monitorCode.includes('QueryFullProcessImageName') ||
    monitorCode.includes('processName') ||
    monitorCode.includes('appName') ||
    monitorCode.includes('GetActiveProcess'),
    'Agent must track active process executable'
  );

  // Anti-surveillance guarantee: window title tracking must be strictly forbidden
  assert.ok(
    !monitorCode.includes('GetWindowTextW') && !monitorCode.includes('GetWindowTextA'),
    'Agent must NEVER invoke Win32 GetWindowText API'
  );
  assert.ok(
    !monitorCode.includes('windowTitle'),
    'Agent source must not reference or extract window titles'
  );
});

test('[F5] Disclosed Numeric Input Aggregation Without Raw Keystrokes or Characters', () => {
  const inputCounterPath = path.resolve(config.paths.agent, 'src/native/inputCounter.js');
  assert.ok(fs.existsSync(inputCounterPath), 'inputCounter.js must exist in desktop agent');

  const counterCode = fs.readFileSync(inputCounterPath, 'utf8');

  // Must only maintain aggregate numeric counts
  assert.ok(
    counterCode.includes('keyPressCount') || counterCode.includes('keyPresses'),
    'Must aggregate numeric keypress count'
  );
  assert.ok(
    counterCode.includes('mouseClickCount') || counterCode.includes('mouseClicks') || counterCode.includes('mouseActivityDelta'),
    'Must aggregate numeric mouse activity'
  );

  // Must never store key codes, typed text, or character logs
  assert.ok(
    !counterCode.includes('typedText') &&
    !counterCode.includes('keystrokeLog') &&
    !counterCode.includes('keyCodes') &&
    !counterCode.includes('cursorCoordinates'),
    'Must NEVER log typed characters, scan-codes, or coordinates'
  );
});

test('[F5] Telemetry Ingestion Accepts Valid Disclosed Telemetry Payload', async () => {
  await ensureDbConnected();

  const employee = await getOrCreateTestUser('f5_privacy@blackhole.ai', 'F5 Privacy Employee');
  assert.ok(employee);

  // Ensure active session & device exist for telemetry ingestion
  const sessionId = `sess_f5_test_${Date.now()}`;
  const deviceId = `v2_dev_f5_${Date.now()}`;
  const deviceKey = crypto.randomBytes(32).toString('hex');
  const todayStr = new Date().toISOString().split('T')[0];

  // Seed test registered device
  await dbHelper.devices.insertOne({
    device_id: deviceId,
    employee: employee._id,
    device_name: 'Acer Nitro AN515-57 Test',
    platform: 'windows',
    manufacturer: 'Acer',
    model: 'Nitro AN515-57',
    device_token_hash: crypto.createHash('sha256').update(deviceKey).digest('hex'),
    encrypted_device_key: encrypt(deviceKey),
    status: 'ACTIVE',
    created_at: new Date(),
    createdAt: new Date(),
    last_seen_at: new Date()
  });

  // Seed active monitoring session with valid lease
  await dbHelper.sessions.insertOne({
    session_id: sessionId,
    employee: employee._id,
    date: todayStr,
    active_device: deviceId,
    state: 'ACTIVE',
    mode: 'LAPTOP_PC',
    started_at: new Date(),
    lease_expires_at: new Date(Date.now() + 120000),
    accumulated_seconds: { active: 60, idle: 0, paused: 0 },
    created_at: new Date(),
    createdAt: new Date()
  });

  const timestamp = new Date().toISOString();
  const telemetryBody = {
    sessionId,
    deviceId,
    durationSeconds: 60,
    keyPressCount: 45,
    mouseActivityDelta: 22,
    hardwareIdleSeconds: 0,
    activeProcessCategory: 'DEVELOPMENT',
    applicationExecutable: 'devenv.exe',
    timestamp
  };

  const bodyString = JSON.stringify(telemetryBody);
  const signature = crypto.createHmac('sha256', deviceKey)
    .update(`${timestamp}:${bodyString}`)
    .digest('hex');

  const res = await apiRequest({
    method: 'POST',
    path: '/api/monitoring-v2/telemetry',
    body: telemetryBody,
    headers: {
      'x-device-id': deviceId,
      'x-device-signature': signature,
      'x-timestamp': timestamp
    }
  });

  assert.equal(res.status, 200, `Telemetry submit must return HTTP 200, got ${res.status}: ${res.text}`);
  assert.equal(res.body.accepted, true, 'Telemetry response must indicate accepted: true');
  assert.equal(res.body.sessionId, sessionId, 'Response must confirm matching sessionId');
});

test('[F5] MongoDB Storage Contains Zero Invasive Fields in AggregatedTelemetryV2', async () => {
  await ensureDbConnected();

  // Find telemetry slice from previous test
  const telemetryDoc = await dbHelper.telemetry.findOne({}, { sort: { created_at: -1, createdAt: -1 } });
  assert.ok(telemetryDoc, 'AggregatedTelemetryV2 document must exist in MongoDB');

  // Verify presence of disclosed fields
  assert.equal(typeof telemetryDoc.duration_seconds, 'number');
  assert.equal(typeof telemetryDoc.focus_score, 'number');

  // Verify STRICT ABSENCE of invasive surveillance fields
  const forbiddenFields = ['text', 'keystrokes', 'screenshot', 'image', 'base64', 'clipboard', 'url', 'windowTitle'];
  for (const field of forbiddenFields) {
    assert.equal(
      telemetryDoc[field],
      undefined,
      `Forbidden surveillance field '${field}' must NOT exist in MongoDB record`
    );
  }
});

test('[F5] Transparent Privacy Disclosures Contract & Field Definitions', () => {
  // Test validateTelemetrySample rejects each forbidden field
  const forbiddenFields = ['text', 'keystrokes', 'screenshot', 'image', 'base64', 'clipboard', 'url', 'windowTitle'];

  for (const forbidden of forbiddenFields) {
    const badSample = {
      sessionId: 'sess_test',
      keyPressCount: 10,
      mouseActivityDelta: 5,
      hardwareIdleSeconds: 0,
      activeProcessCategory: 'DEVELOPMENT',
      [forbidden]: 'invasive_surveillance_data'
    };

    const validation = validateTelemetrySample(badSample);
    assert.equal(validation.valid, false, `Sample with '${forbidden}' must be rejected`);
    assert.ok(
      validation.errors.some((err) => err.includes(forbidden)),
      `Error message must cite forbidden field '${forbidden}'`
    );
  }

  // Test valid payload succeeds
  const cleanSample = {
    sessionId: 'sess_test',
    keyPressCount: 30,
    mouseActivityDelta: 15,
    hardwareIdleSeconds: 0,
    activeProcessCategory: 'DEVELOPMENT'
  };
  const cleanValidation = validateTelemetrySample(cleanSample);
  assert.equal(cleanValidation.valid, true, 'Clean disclosed sample must pass validation');
});
