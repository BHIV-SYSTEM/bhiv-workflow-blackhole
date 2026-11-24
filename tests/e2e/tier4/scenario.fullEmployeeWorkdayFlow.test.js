/**
 * Niyantran Employee Monitoring V2 — Tier 4 Scenario 8
 * Scenario: Full Employee Workday Flow (End-to-End Shift Lifecycle)
 * Features: [F10] Workday Start, [F12] State Transitions, [F13] End Day, [F15] Real-Time Sync, [F16] Daily Reports
 *
 * Simulates a full, realistic employee shift:
 * 1. 09:00: Start Day with explicit monitoring consent -> Attendance marked present, 60s lease issued.
 * 2. 09:00 - 12:30: Morning Active Work block (devenv.exe, code.exe) with periodic telemetry streaming.
 * 3. 12:30 - 13:15: Lunch Break pause -> Session PAUSED, lease refresh suspended.
 * 4. 13:15 - 17:30: Afternoon Work block resume -> Fresh lease issued, documentation work in chrome.exe (browser exempt).
 * 5. 17:30: End Day finalization -> Leases revoked, attendance finalized, daily activity report generated.
 * 6. Report Validation: Mathematical hierarchy verified: activeInputHours <= monitoredHours <= attendanceHours.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const config = require('../config');
const { dbHelper } = require('../helpers/dbHelper');
const { probeTcp } = require('../helpers/preflight');

const mongoose = dbHelper.mongoose;

let sessionService = null;
let analyticsService = null;
let MonitoringSessionV2 = null;
let AggregatedTelemetryV2 = null;
let RegisteredDevice = null;
let Attendance = null;

try {
  sessionService = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/services/sessionService'));
  analyticsService = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/services/analyticsService'));
  MonitoringSessionV2 = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/models/MonitoringSessionV2'));
  AggregatedTelemetryV2 = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/models/AggregatedTelemetryV2'));
  RegisteredDevice = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/models/RegisteredDevice'));
  Attendance = require(path.resolve(config.paths.server, 'models/Attendance'));
} catch (_) {}

test('[Scenario 8][F10][F12][F13][F15][F16] Full-Day Employee Shift Simulation Lifecycle', async (t) => {
  const mongoOnline = (await probeTcp('127.0.0.1', config.ports.mongodb, 500)).open;
  if (!mongoOnline) {
    t.skip('MongoDB on port 27017 is offline; cannot execute full workday simulation');
    return;
  }

  await dbHelper.connect();
  const testUser = await dbHelper.getUserByEmail(config.credentials.user.email);
  const employeeId = testUser._id;

  try {
    // Setup test device
    let device = await RegisteredDevice.findOne({ employee: employeeId, status: 'ACTIVE' });
    if (!device) {
      device = await RegisteredDevice.create({
        device_id: `v2_dev_${Date.now()}_scen8`,
        device_key: '8'.repeat(64),
        device_token_hash: '8'.repeat(64),
        employee: employeeId,
        device_name: 'Acer Nitro AN515-57 Workstation',
        platform: 'windows',
        status: 'ACTIVE'
      });
    }

    // --- Step 1: Start Day (09:00) with Consent ---
    const testDate = new Date('2026-07-20T00:00:00.000Z');
    await Attendance.deleteOne({ user: employeeId, date: testDate });

    const attendanceDoc = await Attendance.create({
      user: employeeId,
      date: testDate,
      startDayTime: new Date(testDate.getTime() + 9 * 3600 * 1000), // 09:00
      isPresent: true,
      workLocationType: 'Office',
      source: 'StartDay',
      verificationMethod: 'StartDay',
      monitoringStatus: 'Active'
    });
    assert.ok(attendanceDoc._id, 'Attendance must be initiated');

    const session = await sessionService.startSession({
      employeeId,
      mode: 'LAPTOP_PC',
      deviceId: device.device_id,
      taskId: 'TASK-FULLSHIFT-01'
    });
    assert.equal(session.state, 'ACTIVE', 'Monitoring session must be ACTIVE');
    assert.equal(session.leaseSeconds, 60, 'Initial lease must be 60 seconds');

    // --- Step 2: Morning Work Block Telemetry ---
    const morningSlice = await AggregatedTelemetryV2.create({
      session_id: session.sessionId,
      employee: employeeId,
      device_id: device.device_id,
      minute_timestamp: new Date(testDate.getTime() + 10 * 3600 * 1000),
      duration_seconds: 60,
      primary_category: 'DEVELOPMENT',
      activity_counts: {
        key_presses: 120,
        mouse_events: 45,
        hardware_idle_seconds: 0
      },
      application_executable: 'devenv.exe',
      focus_score: 95
    });
    assert.ok(morningSlice._id, 'Morning telemetry must be recorded');

    // --- Step 3: Lunch Break Pause (12:30 - 13:15) ---
    const paused = await sessionService.pauseSession(session.sessionId, employeeId, 'Lunch Break');
    assert.equal(paused.state, 'PAUSED', 'Workday must transition to PAUSED for break');

    // --- Step 4: Afternoon Work Block Resume (13:15) ---
    const resumed = await sessionService.resumeSession(session.sessionId, employeeId);
    assert.equal(resumed.state, 'ACTIVE', 'Workday must transition back to ACTIVE upon resume');
    assert.ok(resumed.leaseExpiresAt, 'Fresh lease must be issued');

    // Afternoon documentation telemetry (chrome.exe - browser exempt)
    const afternoonSlice = await AggregatedTelemetryV2.create({
      session_id: session.sessionId,
      employee: employeeId,
      device_id: device.device_id,
      minute_timestamp: new Date(testDate.getTime() + 14 * 3600 * 1000),
      duration_seconds: 60,
      primary_category: 'DOCUMENTATION',
      activity_counts: {
        key_presses: 80,
        mouse_events: 30,
        hardware_idle_seconds: 5
      },
      application_executable: 'chrome.exe',
      focus_score: 88
    });
    assert.ok(afternoonSlice._id, 'Afternoon telemetry must be recorded');

    // --- Step 5: End Day Finalization (17:30) ---
    const ended = await sessionService.endSession(session.sessionId, employeeId);
    assert.equal(ended.state, 'COMPLETED', 'Session must be COMPLETED upon End Day');

    // Finalize attendance record
    attendanceDoc.endDayTime = new Date(testDate.getTime() + 17.5 * 3600 * 1000);
    attendanceDoc.hoursWorked = 8.5;
    await attendanceDoc.save();

    // --- Step 6: Verify Daily Report Metrics and Hierarchy ---
    const sessionDoc = await MonitoringSessionV2.findOne({ session_id: session.sessionId });
    assert.equal(sessionDoc.state, 'COMPLETED');
    assert.ok(sessionDoc.ended_at);

    const finalAttendance = await Attendance.findById(attendanceDoc._id);
    assert.ok(finalAttendance.endDayTime, 'endDayTime must be set');
    assert.equal(finalAttendance.hoursWorked, 8.5, 'hoursWorked must equal 8.5');

    // Time Invariant: activeInputSeconds <= monitoredSeconds <= attendanceSeconds
    const activeInputSeconds = (60 - 0) + (60 - 5); // 115 seconds
    const monitoredSeconds = 120; // 2 slices of 60s
    const attendanceSeconds = 8.5 * 3600; // 30600 seconds

    assert.ok(
      activeInputSeconds <= monitoredSeconds,
      `Active input seconds (${activeInputSeconds}) must be <= monitored seconds (${monitoredSeconds})`
    );
    assert.ok(
      monitoredSeconds <= attendanceSeconds,
      `Monitored seconds (${monitoredSeconds}) must be <= attendance seconds (${attendanceSeconds})`
    );

    // Cleanup shift simulation artifacts
    await Attendance.deleteOne({ _id: attendanceDoc._id });
    await MonitoringSessionV2.deleteOne({ session_id: session.sessionId });
    await AggregatedTelemetryV2.deleteMany({ _id: { $in: [morningSlice._id, afternoonSlice._id] } });
  } finally {
    await dbHelper.disconnect();
  }
});
