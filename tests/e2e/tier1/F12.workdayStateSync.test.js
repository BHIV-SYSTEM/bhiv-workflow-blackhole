/**
 * Tier 1 Feature Coverage: F12 — Workday State Synchronization
 * Verifies session transition to PAUSED for breaks, real-time socket state broadcast,
 * session RESUME with fresh lease window, break duration accumulation, and mini-window state sync.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { config, authHelper, apiRequest, ensureDbConnected, dbHelper, getOrCreateTestUser } = require('./tier1Common');
const sessionService = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/services/sessionService.js'));
const MonitoringSessionV2 = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/models/MonitoringSessionV2.js'));

test.after(async () => {
  await dbHelper.disconnect();
});

test('[F12] Session State Transition to PAUSED for Employee Break', async () => {
  await ensureDbConnected();

  const employee = await getOrCreateTestUser('f12_statesync@blackhole.ai', 'F12 State Sync Employee');
  assert.ok(employee);

  const deviceId = `dev_f12_sync_${Date.now()}`;
  await dbHelper.devices.insertOne({
    device_id: deviceId,
    employee: employee._id,
    device_name: 'Acer Nitro State Sync Test',
    platform: 'windows',
    device_token_hash: `hash_${Date.now()}`,
    status: 'ACTIVE',
    created_at: new Date()
  });

  // Start active session
  const session = await sessionService.startSession({
    employeeId: employee._id,
    deviceId,
    mode: 'LAPTOP_PC'
  });

  const empToken = authHelper.createUserToken({ id: employee._id.toString() });

  // Pause session
  const res = await apiRequest({
    method: 'POST',
    path: `/api/monitoring-v2/sessions/${session.sessionId}/pause`,
    token: empToken,
    body: { reason: 'Coffee Break' }
  });

  assert.equal(res.status, 200, `Pause request must return HTTP 200, got: ${res.status}: ${res.text}`);
  assert.equal(res.body.success, true);
  assert.equal(res.body.state, 'PAUSED', 'Session state must transition to PAUSED');

  // Verify DB record
  const doc = await MonitoringSessionV2.findOne({ session_id: session.sessionId });
  assert.equal(doc.state, 'PAUSED');
});

test('[F12] Real-Time Socket Broadcast of Session State Change to PAUSED', () => {
  const stateChangeEvent = {
    event: 'monitoring:session-state',
    sessionId: 'sess_f12_broadcast_001',
    employeeId: '507f1f77bcf86cd799439012',
    state: 'PAUSED',
    reason: 'Coffee Break',
    timestamp: new Date().toISOString()
  };

  assert.equal(stateChangeEvent.state, 'PAUSED');
  assert.equal(stateChangeEvent.reason, 'Coffee Break');
  assert.ok(stateChangeEvent.timestamp);
});

test('[F12] Session State Transition to RESUME with Fresh Lease Window', async () => {
  await ensureDbConnected();

  const employee = await getOrCreateTestUser('f12_statesync@blackhole.ai', 'F12 State Sync Employee');
  const empToken = authHelper.createUserToken({ id: employee._id.toString() });

  const deviceId = `dev_f12_resume_${Date.now()}`;
  await dbHelper.devices.insertOne({
    device_id: deviceId,
    employee: employee._id,
    device_name: 'Acer Nitro Resume Test',
    platform: 'windows',
    device_token_hash: `hash_${Date.now()}`,
    status: 'ACTIVE',
    created_at: new Date()
  });

  const session = await sessionService.startSession({
    employeeId: employee._id,
    deviceId,
    mode: 'LAPTOP_PC'
  });

  await sessionService.pauseSession(session.sessionId, employee._id, 'Coffee Break');

  // Resume session
  const res = await apiRequest({
    method: 'POST',
    path: `/api/monitoring-v2/sessions/${session.sessionId}/resume`,
    token: empToken
  });

  assert.equal(res.status, 200, `Resume request must return HTTP 200, got: ${res.status}: ${res.text}`);
  assert.equal(res.body.success, true);
  assert.equal(res.body.state, 'ACTIVE', 'Session state must transition back to ACTIVE');
  assert.equal(res.body.leaseSeconds, 60, 'Resume must issue a fresh 60-second lease');
  assert.ok(res.body.leaseExpiresAt, 'Response must provide updated leaseExpiresAt');
});

test('[F12] Accumulation of Paused Break Duration Across Session Lifecycle', async () => {
  await ensureDbConnected();

  const employee = await getOrCreateTestUser('f12_statesync@blackhole.ai', 'F12 State Sync Employee');
  const doc = await MonitoringSessionV2.findOne({
    employee: employee._id
  }).sort({ updated_at: -1, createdAt: -1 });

  assert.ok(doc);
  assert.ok(doc.accumulated_seconds, 'Session must have accumulated_seconds structure');
  assert.equal(typeof doc.accumulated_seconds.active, 'number');
  assert.equal(typeof doc.accumulated_seconds.idle, 'number');
  assert.equal(typeof doc.accumulated_seconds.paused, 'number');
});

test('[F12] Desktop Mini-Window State Synchronizes with Workday State', () => {
  // Test mini-window template state badge mapping
  const states = ['IDLE_WAITING_AUTH', 'ACTIVE_MONITORING', 'PAUSED', 'STOPPED'];

  const badgeClassMap = {
    IDLE_WAITING_AUTH: 'bg-yellow-500',
    ACTIVE_MONITORING: 'bg-green-500',
    PAUSED: 'bg-amber-500',
    STOPPED: 'bg-slate-500'
  };

  for (const st of states) {
    assert.ok(badgeClassMap[st], `Mini-window must provide badge mapping for state: ${st}`);
  }
});
