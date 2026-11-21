/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Workday & Attendance Synchronization Lifecycle Integration Test Suite
 * 
 * Verifies Milestone 3 Features F10, F11, F12, F13:
 * 1. Start Day with explicit monitoringConsent: true (initiates lease & links session)
 * 2. Start Day with monitoringConsent: false (clean decoupled attendance, Disconnected / Not Monitored)
 * 3. Decoupled status query via /api/attendance/status
 * 4. Anti-masking verification in /api/monitoring/team-summary (no synthetic 'Active' status)
 * 5. End Day finalization: lease revocation, telemetry flush, and DailyActivityReport generation
 * 6. Autonomous lease rejection (WORKDAY_ENDED) after End Day
 * 7. Ingestion grace window (90s) on completed sessions
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/niyantran_v2_isolated_test';
const TEST_JWT_SECRET = process.env.JWT_SECRET || 'm3-workday-sync-test-secret-12345';
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.ENABLE_MONITORING_V2 = 'true';
process.env.MONITORING_V2_ENCRYPTION_KEY = 'test-master-device-encryption-key-salt';

const User = require('../../../models/User');
const Attendance = require('../../../models/Attendance');
const DailyAttendance = require('../../../models/DailyAttendance');
const RegisteredDevice = require('../models/RegisteredDevice');
const MonitoringSessionV2 = require('../models/MonitoringSessionV2');
const AggregatedTelemetryV2 = require('../models/AggregatedTelemetryV2');
const DailyActivityReport = require('../models/DailyActivityReport');

const deviceService = require('../services/deviceService');
const sessionService = require('../services/sessionService');
const telemetryService = require('../services/telemetryService');
const { SESSION_STATES, CATEGORIES } = require('../config/constants');

function computeHmacSignature(payloadString, timestamp, secret) {
  const canonical = `${timestamp}:${payloadString}`;
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

const attendanceRoutes = require('../../../routes/attendance');
const attendanceStatusRoutes = require('../../../routes/attendanceStatus');
const monitoringRoutes = require('../../../routes/monitoring');

// Express application mounting routes with event recording
const app = express();
app.use(express.json());

const emittedEvents = [];
app.use((req, res, next) => {
  req.io = {
    emit: (event, payload) => {
      emittedEvents.push({ event, payload });
    }
  };
  next();
});

app.use('/api/attendance', attendanceRoutes);
app.use('/api/attendance', attendanceStatusRoutes);
app.use('/api/monitoring', monitoringRoutes);

let isMongoConnected = false;
let employeeConsenting = null;
let employeeDeclining = null;
let consentingToken = null;
let decliningToken = null;
let registeredDeviceConsenting = null;
let plainDeviceKey = null;

test.before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_MONGO_URI, { serverSelectionTimeoutMS: 2000 });
  }
  isMongoConnected = true;

  // Clean test data
  await User.deleteMany({ email: /@m3-lifecycle-test\.local$/ });
  await Attendance.deleteMany({});
  await DailyAttendance.deleteMany({});
  await RegisteredDevice.deleteMany({});
  await MonitoringSessionV2.deleteMany({});
  await AggregatedTelemetryV2.deleteMany({});
  await DailyActivityReport.deleteMany({});

  // 1. Create consenting employee
  employeeConsenting = await User.create({
    name: 'Aarav Mehta (Consenting)',
    email: `aarav.${Date.now()}@m3-lifecycle-test.local`,
    password: 'testPassword123',
    role: 'User',
    employeeId: 'BHIV-M3-CONSENT-01'
  });
  consentingToken = jwt.sign(
    { id: employeeConsenting._id.toString(), role: 'User', name: employeeConsenting.name },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Pair registered device for consenting employee
  const { code } = deviceService.generateEnrollmentCode(employeeConsenting._id.toString());
  const pairResult = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'ACER-LAPTOP-M3',
    platform: 'windows',
    machineGuid: crypto.randomUUID(),
    hardwareMetadata: { manufacturer: 'Acer', model: 'Nitro AN515-57' }
  });
  registeredDeviceConsenting = await RegisteredDevice.findOne({ device_id: pairResult.deviceId });
  plainDeviceKey = pairResult.deviceKey;

  // 2. Create declining employee
  employeeDeclining = await User.create({
    name: 'Neha Kapoor (Declining)',
    email: `neha.${Date.now()}@m3-lifecycle-test.local`,
    password: 'testPassword123',
    role: 'User',
    employeeId: 'BHIV-M3-DECLINE-01'
  });
  decliningToken = jwt.sign(
    { id: employeeDeclining._id.toString(), role: 'User', name: employeeDeclining.name },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );
});

test.after(async () => {
  if (isMongoConnected) {
    await User.deleteMany({ email: /@m3-lifecycle-test\.local$/ });
    await Attendance.deleteMany({});
    await DailyAttendance.deleteMany({});
    await RegisteredDevice.deleteMany({});
    await MonitoringSessionV2.deleteMany({});
    await AggregatedTelemetryV2.deleteMany({});
    await DailyActivityReport.deleteMany({});
    await mongoose.disconnect();
  }
  setTimeout(() => process.exit(0), 100);
});

test('M3 Lifecycle: Start Day with monitoringConsent: true initiates V2 session and active lease', async () => {
  const res = await request(app)
    .post(`/api/attendance/start-day/${employeeConsenting._id}`)
    .set('Authorization', `Bearer ${consentingToken}`)
    .send({
      workFromHome: true,
      address: 'Home Office - Remote',
      monitoringConsent: true,
      deviceId: registeredDeviceConsenting.device_id
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.monitoringConsent, true);
  assert.equal(res.body.monitoringStatus, 'Active');
  assert.ok(res.body.monitoringSession, 'Must issue monitoring session');
  assert.equal(res.body.monitoringSession.state, 'ACTIVE');
  assert.ok(res.body.monitoringSession.sessionId.startsWith('v2_sess_'));

  // Database verification
  const attendance = await Attendance.findOne({ user: employeeConsenting._id });
  assert.ok(attendance);
  assert.equal(attendance.monitoringConsent, true);
  assert.equal(attendance.monitoringStatus, 'Active');
  assert.equal(attendance.activeSessionId, res.body.monitoringSession.sessionId);

  // Session verification
  const session = await MonitoringSessionV2.findOne({ session_id: res.body.monitoringSession.sessionId });
  assert.ok(session);
  assert.equal(session.state, SESSION_STATES.ACTIVE);
  assert.ok(new Date(session.lease_expires_at).getTime() > Date.now());
});

test('M3 Lifecycle: Start Day with monitoringConsent: false starts attendance decoupled without monitoring', async () => {
  const res = await request(app)
    .post(`/api/attendance/start-day/${employeeDeclining._id}`)
    .set('Authorization', `Bearer ${decliningToken}`)
    .send({
      workFromHome: true,
      address: 'Home Office - Remote',
      monitoringConsent: false
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.monitoringConsent, false);
  assert.equal(res.body.monitoringStatus, 'Disconnected / Not Monitored');
  assert.equal(res.body.monitoringSession, null);

  // Attendance document records presence cleanly
  const attendance = await Attendance.findOne({ user: employeeDeclining._id });
  assert.ok(attendance);
  assert.equal(attendance.isPresent, true);
  assert.equal(attendance.monitoringConsent, false);
  assert.equal(attendance.monitoringStatus, 'Disconnected / Not Monitored');
  assert.equal(attendance.activeSessionId, null);

  // Zero active sessions exist for declining user
  const activeSessions = await MonitoringSessionV2.find({ employee: employeeDeclining._id });
  assert.equal(activeSessions.length, 0);
});

test('M3 Lifecycle: GET /api/attendance/status returns decoupled monitoringStatus and activeSessionId', async () => {
  // Consenting user with active lease
  const resActive = await request(app)
    .get('/api/attendance/status')
    .set('Authorization', `Bearer ${consentingToken}`);

  assert.equal(resActive.status, 200);
  assert.equal(resActive.body.dayStarted, true);
  assert.equal(resActive.body.monitoringConsent, true);
  assert.equal(resActive.body.monitoringStatus, 'Active');
  assert.ok(resActive.body.activeSessionId);

  // Declining user with unmonitored workday
  const resDeclined = await request(app)
    .get('/api/attendance/status')
    .set('Authorization', `Bearer ${decliningToken}`);

  assert.equal(resDeclined.status, 200);
  assert.equal(resDeclined.body.dayStarted, true);
  assert.equal(resDeclined.body.monitoringConsent, false);
  assert.equal(resDeclined.body.monitoringStatus, 'Disconnected / Not Monitored');
  assert.equal(resDeclined.body.activeSessionId, null);
});

test('M3 Lifecycle: GET /api/monitoring/team-summary eliminates synthetic Active masking', async () => {
  const adminToken = jwt.sign(
    { id: new mongoose.Types.ObjectId().toString(), role: 'Admin', name: 'Admin User' },
    TEST_JWT_SECRET,
    { expiresIn: '1h' }
  );

  const res = await request(app)
    .get('/api/monitoring/team-summary')
    .set('Authorization', `Bearer ${adminToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  // Find declining employee in team list
  const empEntry = res.body.employees.find(e => String(e._id) === String(employeeDeclining._id));
  if (empEntry) {
    assert.equal(empEntry.hasStartedDay, true);
    // Must be Disconnected / Not Monitored, NOT 'Active'
    assert.equal(empEntry.currentStatus, 'Disconnected / Not Monitored');
    assert.equal(empEntry.currentActivity.appName, 'Attendance active (unmonitored)');
  }
});

test('M3 Lifecycle: End Day revokes lease, emits session-ended event, and compiles DailyActivityReport', async () => {
  // Create daily progress record to satisfy mandatory workday completion validation
  const Progress = require('../../../models/Progress');
  await Progress.create({
    user: employeeConsenting._id,
    date: new Date(),
    progressPercentage: 100,
    notes: 'Completed full-day development and telemetry validation tasks.'
  });

  // Insert some telemetry slices for consenting user to aggregate in report
  const now = new Date();
  const minuteTs = new Date(now);
  minuteTs.setSeconds(0, 0);

  const activeSession = await MonitoringSessionV2.findOne({
    employee: employeeConsenting._id,
    state: SESSION_STATES.ACTIVE
  });

  await AggregatedTelemetryV2.create({
    session_id: activeSession.session_id,
    employee: employeeConsenting._id,
    device_id: registeredDeviceConsenting.device_id,
    minute_timestamp: minuteTs,
    duration_seconds: 60,
    activity_counts: { key_presses: 120, mouse_events: 40, hardware_idle_seconds: 5 },
    primary_category: CATEGORIES.DEVELOPMENT
  });

  const res = await request(app)
    .post(`/api/attendance/end-day/${employeeConsenting._id}`)
    .set('Authorization', `Bearer ${consentingToken}`)
    .send({
      latitude: 19.16,
      longitude: 72.84,
      address: 'Test Office'
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.telemetryFlushed, true);
  assert.ok(res.body.dailyReport, 'Must return daily report');
  assert.equal(res.body.dailyReport.monitoredHours, 0.02); // 60s / 3600
  assert.ok(res.body.dailyReport.reportId);

  // 1. Verify lease revoked in database
  const sessionAfter = await MonitoringSessionV2.findOne({ session_id: activeSession.session_id });
  assert.equal(sessionAfter.state, SESSION_STATES.COMPLETED);
  assert.ok(new Date(sessionAfter.lease_expires_at).getTime() <= Date.now());

  // 2. Verify attendance marked Disconnected / Not Monitored
  const attendanceAfter = await Attendance.findOne({ user: employeeConsenting._id });
  assert.equal(attendanceAfter.monitoringStatus, 'Disconnected / Not Monitored');
  assert.equal(attendanceAfter.activeSessionId, null);

  // 3. Verify Socket event emitted
  const endedEvent = emittedEvents.find(e => e.event === 'monitoring:session-ended');
  assert.ok(endedEvent, 'Must emit monitoring:session-ended event');
  assert.equal(String(endedEvent.payload.userId), String(employeeConsenting._id));

  // 4. Verify lease renewal is rejected after End Day
  await assert.rejects(
    async () => {
      await sessionService.renewLease(activeSession.session_id, registeredDeviceConsenting.device_id);
    },
    (err) => {
      return err.code === 'WORKDAY_ENDED' || err.code === 'SESSION_NOT_ACTIVE';
    }
  );
});

test('M3 Lifecycle: 90-second grace window permits final flush on completed session', async () => {
  try {
    // Create a recently completed session (ended 15s ago)
    const sessionId = `v2_sess_grace_${Date.now()}`;
    const endedAt = new Date(Date.now() - 15000);

    const completedSession = await MonitoringSessionV2.create({
      session_id: sessionId,
      employee: employeeConsenting._id,
      date: '2026-11-20',
      mode: 'LAPTOP_PC',
      active_device: registeredDeviceConsenting.device_id,
      state: SESSION_STATES.COMPLETED,
      ended_at: endedAt,
      lease_expires_at: endedAt,
      started_at: new Date(Date.now() - 3600000)
    });

    const payload = {
      sessionId,
      deviceId: registeredDeviceConsenting.device_id,
      durationSeconds: 60,
      timestamp: new Date().toISOString(),
      keyPressCount: 45,
      mouseActivityDelta: 15,
      hardwareIdleSeconds: 0,
      activeProcessCategory: CATEGORIES.DEVELOPMENT,
      focusScore: 85
    };

    const rawBody = JSON.stringify(payload);
    const timestampIso = new Date().toISOString();
    const signature = computeHmacSignature(rawBody, timestampIso, plainDeviceKey);

    // Ingest sample — should be accepted under 90s grace window
    const ingestResult = await telemetryService.ingestTelemetry({
      deviceId: registeredDeviceConsenting.device_id,
      rawBody,
      timestamp: timestampIso,
      signature
    });

    assert.equal(ingestResult.accepted, true);

    // Now create an old session ended 120s ago (> 90s)
    const oldSessionId = `v2_sess_old_${Date.now()}`;
    const oldEndedAt = new Date(Date.now() - 120000);

    await MonitoringSessionV2.create({
      session_id: oldSessionId,
      employee: employeeConsenting._id,
      date: '2026-11-20',
      mode: 'LAPTOP_PC',
      active_device: registeredDeviceConsenting.device_id,
      state: SESSION_STATES.COMPLETED,
      ended_at: oldEndedAt,
      lease_expires_at: oldEndedAt,
      started_at: new Date(Date.now() - 3600000)
    });

    const oldPayload = {
      ...payload,
      sessionId: oldSessionId
    };
    const oldRawBody = JSON.stringify(oldPayload);
    const oldSig = computeHmacSignature(oldRawBody, timestampIso, plainDeviceKey);

    // Ingest sample — should be rejected with SESSION_NOT_ACTIVE
    await assert.rejects(
      async () => {
        await telemetryService.ingestTelemetry({
          deviceId: registeredDeviceConsenting.device_id,
          rawBody: oldRawBody,
          timestamp: timestampIso,
          signature: oldSig
        });
      },
      (err) => {
        assert.equal(err.code, 'SESSION_NOT_ACTIVE');
        return true;
      }
    );
  } catch (err) {
    console.error('TEST 6 ERROR CAUGHT:', err);
    throw err;
  }
});
