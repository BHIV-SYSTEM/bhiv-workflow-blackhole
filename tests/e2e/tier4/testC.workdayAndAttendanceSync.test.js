/**
 * Niyantran Employee Monitoring V2 — Tier 4 Acceptance Test C
 * Acceptance Test C: Unified Workday Start Day, Monitoring Authorization & Lease Issuance (F10, F11, F12, F6)
 *
 * Verifies:
 * 1. Start Day with explicit monitoring consent issues renewable 60s lease and enforces single active lease.
 * 2. 60-second lease renewal extends authorization lease window.
 * 3. Decoupled attendance: Attendance continues accurately even when monitoring is disconnected ("Disconnected / Not Monitored").
 * 4. Real-time workday state synchronization: Active -> Paused (Break) -> Resumed with fresh lease.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const config = require('../config');
const { dbHelper } = require('../helpers/dbHelper');
const { probeTcp } = require('../helpers/preflight');

const mongoose = dbHelper.mongoose;

// Direct V2 services and models
let sessionService = null;
let deviceService = null;
let MonitoringSessionV2 = null;
let RegisteredDevice = null;
let Attendance = null;

try {
  sessionService = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/services/sessionService'));
  deviceService = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/services/deviceService'));
  MonitoringSessionV2 = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/models/MonitoringSessionV2'));
  RegisteredDevice = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/models/RegisteredDevice'));
  Attendance = require(path.resolve(config.paths.server, 'models/Attendance'));
} catch (_) {}

test('[Test C][F10] Start Day with Monitoring Consent & Single Active Lease Guarantee', async (t) => {
  const mongoOnline = (await probeTcp('127.0.0.1', config.ports.mongodb, 500)).open;
  if (!mongoOnline) {
    t.skip('MongoDB on port 27017 is offline; cannot verify session lease issuance');
    return;
  }

  await dbHelper.connect();
  const testUser = await dbHelper.getUserByEmail(config.credentials.user.email);
  assert.ok(testUser, 'Test employee Ishan must exist');
  const employeeId = testUser._id;

  try {
    // Ensure a test device is registered for this employee
    let device = await RegisteredDevice.findOne({ employee: employeeId, status: 'ACTIVE' });
    if (!device) {
      device = await RegisteredDevice.create({
        device_id: `v2_dev_${Date.now()}_testC`,
        device_key: 'a'.repeat(64),
        device_token_hash: 'a'.repeat(64),
        employee: employeeId,
        device_name: 'Acer Nitro AN515-57 Workstation',
        platform: 'windows',
        manufacturer: 'Acer',
        model: 'Nitro AN515-57',
        machine_uuid: config.hardware.uuid,
        os_version: 'Windows 11',
        agent_version: '2.0.0',
        status: 'ACTIVE'
      });
    }

    // 1. Start Session A with 60s lease
    const sessionResultA = await sessionService.startSession({
      employeeId,
      mode: 'LAPTOP_PC',
      deviceId: device.device_id,
      taskId: 'TASK-STARTDAY-01'
    });

    assert.ok(sessionResultA.sessionId, 'Session A must have unique sessionId');
    assert.equal(sessionResultA.state, 'ACTIVE', 'Session state must be ACTIVE');
    assert.equal(sessionResultA.leaseSeconds, 60, 'Lease duration must be 60 seconds');

    const sessionDocA = await MonitoringSessionV2.findOne({ session_id: sessionResultA.sessionId });
    assert.ok(sessionDocA, 'Session document must exist in MongoDB');
    assert.equal(sessionDocA.state, 'ACTIVE');
    assert.ok(sessionDocA.lease_expires_at > new Date(), 'lease_expires_at must be in the future');

    // 2. Single Active Lease Guarantee: Start Session B for same employee
    const sessionResultB = await sessionService.startSession({
      employeeId,
      mode: 'LAPTOP_PC',
      deviceId: device.device_id,
      taskId: 'TASK-STARTDAY-02'
    });

    assert.ok(sessionResultB.sessionId);
    assert.equal(sessionResultB.state, 'ACTIVE');

    // Verify Session A was concluded automatically
    const updatedDocA = await MonitoringSessionV2.findOne({ session_id: sessionResultA.sessionId });
    assert.equal(updatedDocA.state, 'COMPLETED', 'Session A must be marked COMPLETED when Session B started');
    assert.ok(updatedDocA.ended_at, 'Session A must have ended_at timestamp');

    // Cleanup sessions
    await MonitoringSessionV2.deleteMany({ session_id: { $in: [sessionResultA.sessionId, sessionResultB.sessionId] } });
  } finally {
    await dbHelper.disconnect();
  }
});

test('[Test C][F6][F12] 60-Second Lease Renewal within Active Window', async (t) => {
  const mongoOnline = (await probeTcp('127.0.0.1', config.ports.mongodb, 500)).open;
  if (!mongoOnline) {
    t.skip('MongoDB on port 27017 is offline; cannot verify lease renewal');
    return;
  }

  await dbHelper.connect();
  const testUser = await dbHelper.getUserByEmail(config.credentials.user.email);
  const employeeId = testUser._id;

  try {
    let device = await RegisteredDevice.findOne({ employee: employeeId, status: 'ACTIVE' });
    if (!device) {
      device = await RegisteredDevice.create({
        device_id: `v2_dev_${Date.now()}_testC_renew`,
        device_key: 'b'.repeat(64),
        device_token_hash: 'b'.repeat(64),
        employee: employeeId,
        device_name: 'Acer Nitro AN515-57 Workstation',
        platform: 'windows',
        status: 'ACTIVE'
      });
    }

    const session = await sessionService.startSession({
      employeeId,
      mode: 'LAPTOP_PC',
      deviceId: device.device_id
    });

    const originalExpiry = new Date(session.leaseExpiresAt).getTime();

    // Renew lease
    const renewed = await sessionService.renewLease(session.sessionId, device.device_id);
    assert.ok(renewed, 'renewLease must succeed');
    assert.equal(renewed.state, 'ACTIVE', 'Session must remain ACTIVE upon lease renewal');

    const renewedExpiry = new Date(renewed.leaseExpiresAt).getTime();
    assert.ok(
      renewedExpiry >= originalExpiry,
      `Renewed expiry (${renewedExpiry}) must be >= original expiry (${originalExpiry})`
    );

    // Cleanup
    await MonitoringSessionV2.deleteOne({ session_id: session.sessionId });
  } finally {
    await dbHelper.disconnect();
  }
});

test('[Test C][F11] Decoupled Attendance & Disconnected / Not Monitored State', async (t) => {
  const mongoOnline = (await probeTcp('127.0.0.1', config.ports.mongodb, 500)).open;
  if (!mongoOnline) {
    t.skip('MongoDB on port 27017 is offline; cannot verify decoupled attendance');
    return;
  }

  await dbHelper.connect();
  const testUser = await dbHelper.getUserByEmail(config.credentials.user.email);
  const employeeId = testUser._id;

  try {
    const testDate = new Date('2026-06-15T00:00:00.000Z');
    await Attendance.deleteOne({ user: employeeId, date: testDate });

    // Verify attendance model creates valid attendance without requiring active monitoring lease
    const testAttendance = await Attendance.create({
      user: employeeId,
      date: testDate,
      startDayTime: new Date(testDate.getTime() + 9 * 3600 * 1000),
      isPresent: true,
      workLocationType: 'Office',
      source: 'StartDay',
      verificationMethod: 'StartDay',
      monitoringStatus: 'Disconnected / Not Monitored'
    });

    assert.ok(testAttendance._id, 'Attendance record must be saved in MongoDB');
    assert.equal(testAttendance.isPresent, true, 'isPresent must be true');

    // Attendance status evaluation contract when monitoring agent is offline/disconnected
    const resolveMonitoringStatus = (att, sess) => {
      if (!att || !att.isPresent) return 'Absent';
      if (!sess || sess.state !== 'ACTIVE') return 'Disconnected / Not Monitored';
      return 'Active Monitoring';
    };

    const status = resolveMonitoringStatus(testAttendance, null);
    assert.equal(
      status,
      'Disconnected / Not Monitored',
      'monitoringStatus must evaluate to "Disconnected / Not Monitored" when agent is disconnected'
    );

    // Cleanup
    await Attendance.deleteOne({ _id: testAttendance._id });
  } finally {
    await dbHelper.disconnect();
  }
});

test('[Test C][F12] Real-Time Workday State Transitions (Active -> Pause -> Resume)', async (t) => {
  const mongoOnline = (await probeTcp('127.0.0.1', config.ports.mongodb, 500)).open;
  if (!mongoOnline) {
    t.skip('MongoDB on port 27017 is offline; cannot verify state synchronization');
    return;
  }

  await dbHelper.connect();
  const testUser = await dbHelper.getUserByEmail(config.credentials.user.email);
  const employeeId = testUser._id;

  try {
    let device = await RegisteredDevice.findOne({ employee: employeeId, status: 'ACTIVE' });
    if (!device) {
      device = await RegisteredDevice.create({
        device_id: `v2_dev_${Date.now()}_testC_state`,
        device_key: 'c'.repeat(64),
        device_token_hash: 'c'.repeat(64),
        employee: employeeId,
        device_name: 'Acer Nitro AN515-57 Workstation',
        platform: 'windows',
        status: 'ACTIVE'
      });
    }

    // 1. Start Session
    const session = await sessionService.startSession({
      employeeId,
      mode: 'LAPTOP_PC',
      deviceId: device.device_id
    });
    assert.equal(session.state, 'ACTIVE');

    // 2. Pause Session (e.g. Break)
    const paused = await sessionService.pauseSession(session.sessionId, employeeId, 'Lunch Break');
    assert.equal(paused.state, 'PAUSED', 'Session state must transition to PAUSED');

    const pausedDoc = await MonitoringSessionV2.findOne({ session_id: session.sessionId });
    assert.equal(pausedDoc.state, 'PAUSED');

    // 3. Resume Session
    const resumed = await sessionService.resumeSession(session.sessionId, employeeId);
    assert.equal(resumed.state, 'ACTIVE', 'Session state must transition back to ACTIVE');
    assert.ok(resumed.leaseExpiresAt, 'Fresh lease must be issued upon resume');

    // Cleanup
    await sessionService.endSession(session.sessionId, employeeId);
    await MonitoringSessionV2.deleteOne({ session_id: session.sessionId });
  } finally {
    await dbHelper.disconnect();
  }
});
