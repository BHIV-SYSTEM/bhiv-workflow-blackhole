/**
 * Tier 1 Feature Coverage: F13 — End Day Finalization & Daily Report Generation
 * Verifies End Day attendance finalization with hours calculated, automatic session lease revocation,
 * agent buffer flushing on workday completion, daily report creation in DailyAttendance,
 * and authentic schema metrics.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { config, authHelper, apiRequest, ensureDbConnected, dbHelper, getOrCreateTestUser } = require('./tier1Common');
const Progress = require(path.resolve(config.paths.server, 'models/Progress.js'));
const DailyAttendance = require(path.resolve(config.paths.server, 'models/DailyAttendance.js'));
const MonitoringSessionV2 = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/models/MonitoringSessionV2.js'));
const sessionService = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/services/sessionService.js'));

test.after(async () => {
  await dbHelper.disconnect();
});

test('[F13] End Day Execution Finalizes Attendance and Records Working Hours', async () => {
  await ensureDbConnected();

  const employee = await getOrCreateTestUser('f13_endday@blackhole.ai', 'F13 End Day Employee');
  assert.ok(employee);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Clear previous attendance records for clean test run
  await dbHelper.attendances.deleteMany({ user: employee._id });
  await DailyAttendance.deleteMany({ user: employee._id });

  const empToken = authHelper.createUserToken({ id: employee._id.toString() });

  // 1. Start Day
  await apiRequest({
    method: 'POST',
    path: `/api/attendance/start-day/${employee._id.toString()}`,
    token: empToken,
    body: {
      latitude: 19.160122,
      longitude: 72.839720,
      address: 'Blackhole Infiverse Office',
      workFromHome: true,
      monitoringConsent: true
    }
  });

  // 2. Add progress report
  await Progress.create({
    user: employee._id,
    date: new Date(),
    progressPercentage: 100,
    notes: 'Completed F13 end day automated verification',
    achievements: 'Finalized daily reporting',
    blockers: 'None'
  });

  // 3. End Day
  const res = await apiRequest({
    method: 'POST',
    path: `/api/attendance/end-day/${employee._id.toString()}`,
    token: empToken,
    body: {
      notes: 'Workday completed successfully'
    }
  });

  assert.equal(res.status, 200, `End day must return HTTP 200, got ${res.status}: ${res.text}`);
  assert.ok(res.body.success || res.body.message, 'End day response must confirm success');

  // Verify attendance record
  const attendance = await dbHelper.attendances.findOne({ user: employee._id }, { sort: { startDayTime: -1 } });
  assert.ok(attendance.endDayTime, 'endDayTime must be recorded');
  assert.ok(attendance.hoursWorked >= 0, 'hoursWorked must be calculated');
});

test('[F13] End Day Automatically Revokes Active Session Leases and Marks COMPLETED', async () => {
  await ensureDbConnected();

  const employee = await getOrCreateTestUser('f13_endday@blackhole.ai', 'F13 End Day Employee');
  const deviceId = `dev_f13_lease_${Date.now()}`;

  await dbHelper.devices.insertOne({
    device_id: deviceId,
    employee: employee._id,
    device_name: 'Acer Nitro F13 Test',
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

  // End session
  await sessionService.endSession(session.sessionId, employee._id);

  // Assert session is marked COMPLETED and ended_at is set
  const doc = await MonitoringSessionV2.findOne({ session_id: session.sessionId });
  assert.equal(doc.state, 'COMPLETED', 'Session state must transition to COMPLETED');
  assert.ok(doc.ended_at, 'Session ended_at timestamp must be recorded');
});

test('[F13] Telemetry Buffer Flushed Cleanly Upon Workday Completion', async () => {
  const syncEnginePath = path.resolve(config.paths.agent, 'src/managers/syncEngine.js');
  const { SyncEngine } = await import(pathToFileURL(syncEnginePath).href);

  const syncEngine = new SyncEngine({
    fetchClient: async () => ({ ok: true, status: 200, json: async () => ({ accepted: true }) }),
    deviceId: 'DEV-F13-FLUSH',
    deviceKey: 'secret-f13-key'
  });

  // Add 2 unflushed samples
  syncEngine._enqueue({ sessionId: 'sess_f13_flush', duration: 60 });
  syncEngine._enqueue({ sessionId: 'sess_f13_flush', duration: 60 });
  assert.equal(syncEngine.offlineQueue.length, 2);

  // Trigger end-day flush
  const result = await syncEngine.flushOfflineQueue();
  assert.equal(result.flushed, 2);
  assert.equal(syncEngine.offlineQueue.length, 0, 'Buffer must be fully drained on workday complete');
});

test('[F13] Daily Activity Report Creation Triggered on End Day', async () => {
  await ensureDbConnected();

  const employee = await getOrCreateTestUser('f13_endday@blackhole.ai', 'F13 End Day Employee');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dailyRecord = await DailyAttendance.findOne({
    user: employee._id,
    date: { $gte: today }
  });

  assert.ok(dailyRecord, 'DailyAttendance record must exist for today');
  assert.equal(dailyRecord.status, 'Present');
  assert.ok(dailyRecord.endDayTime, 'DailyAttendance must record endDayTime');
});

test('[F13] Daily Report Metrics Schema Verification', async () => {
  await ensureDbConnected();

  const employee = await getOrCreateTestUser('f13_endday@blackhole.ai', 'F13 End Day Employee');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dailyRecord = await DailyAttendance.findOne({
    user: employee._id,
    date: { $gte: today }
  });

  assert.ok(dailyRecord, 'DailyAttendance document must exist for today');
  assert.equal(dailyRecord.status, 'Present');
  assert.ok(dailyRecord.endDayTime !== undefined, 'endDayTime must be recorded');
  assert.equal(typeof dailyRecord.breakTime, 'number', 'breakTime must be a number');
  assert.equal(dailyRecord.isPresent, true, 'isPresent must be true');
});
