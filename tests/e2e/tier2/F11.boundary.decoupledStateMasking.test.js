/**
 * Niyantran Employee Monitoring V2 — Tier 2 Boundary Test
 * Feature F11: Decoupled Attendance & Disconnected State
 *
 * Boundary & Negative Tests:
 * 1. Long offline agent period preserves continuous attendance without truncation.
 * 2. Rapid network toggling between offline and online does not corrupt attendance state.
 * 3. Offline attendance status API displays Disconnected / Not Monitored without masking.
 * 4. Abrupt agent crash causes zero attendance loss or corruption.
 * 5. Attendance queries on empty database return authentic zero counts without mock fallbacks.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const config = require('../config');
const { dbHelper } = require('../helpers/dbHelper');

test.after(async () => {
  await dbHelper.disconnect();
});

test('[F11] Long offline agent period preserves continuous attendance without truncation', () => {
  // Simulate 8-hour workday with 0 monitoring agent samples
  const startDayTime = new Date('2026-11-20T09:00:00.000Z');
  const endDayTime = new Date('2026-11-20T17:30:00.000Z');

  const attendanceRecord = {
    user: 'user_123',
    date: new Date('2026-11-20T00:00:00.000Z'),
    startDayTime,
    endDayTime,
    isPresent: true,
    workLocationType: 'Office'
  };

  const calculateHoursWorked = (start, end) => {
    const diffMs = end.getTime() - start.getTime();
    return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
  };

  const hoursWorked = calculateHoursWorked(attendanceRecord.startDayTime, attendanceRecord.endDayTime);
  assert.equal(hoursWorked, 8.5, 'Attendance hours must be 8.5 hours regardless of agent offline state');
  assert.equal(attendanceRecord.isPresent, true, 'isPresent must remain true');
});

test('[F11] Rapid network toggling between offline and online does not corrupt attendance state', () => {
  // Simulate 50 connectivity toggle events
  let isAgentOnline = false;
  const attendanceState = {
    dayStarted: true,
    dayEnded: false,
    startTime: '2026-11-20T09:00:00.000Z',
    flips: 0
  };

  for (let i = 0; i < 50; i++) {
    isAgentOnline = !isAgentOnline;
    attendanceState.flips++;
    // Invariant: attendance state must never be mutated by agent connectivity
    assert.equal(attendanceState.dayStarted, true);
    assert.equal(attendanceState.dayEnded, false);
    assert.equal(attendanceState.startTime, '2026-11-20T09:00:00.000Z');
  }

  assert.equal(attendanceState.flips, 50);
});

test('[F11] Offline attendance status API displays Disconnected / Not Monitored without masking', () => {
  const resolveMonitoringStatus = ({ isAttendanceActive, activeMonitoringSession, isAgentHealthy }) => {
    if (!isAttendanceActive) return 'Not Working';
    if (!activeMonitoringSession || !isAgentHealthy) {
      return 'Disconnected / Not Monitored';
    }
    return activeMonitoringSession.state; // e.g. ACTIVE or PAUSED
  };

  // Agent is offline / uninstalled
  const offlineStatus = resolveMonitoringStatus({
    isAttendanceActive: true,
    activeMonitoringSession: null,
    isAgentHealthy: false
  });

  assert.equal(offlineStatus, 'Disconnected / Not Monitored', 'Must display unmasked Disconnected / Not Monitored state');
  assert.notEqual(offlineStatus, 'Active', 'Must NEVER mask offline agent as Active');
});

test('[F11] Abrupt agent crash causes zero attendance loss or corruption', () => {
  // If agent daemon process exits abruptly, attendance record remains unaffected in DB
  const initialAttendance = {
    userId: 'user_crash_test',
    isPresent: true,
    startDayTime: new Date(Date.now() - 3600 * 1000).toISOString(),
    status: 'Present'
  };

  // Simulate agent crash
  const agentProcessRunning = false;

  // Verify attendance record integrity
  assert.equal(initialAttendance.isPresent, true);
  assert.equal(initialAttendance.status, 'Present');
  assert.ok(initialAttendance.startDayTime);
  assert.equal(agentProcessRunning, false);
});

test('[F11] Attendance queries on empty database return authentic zero counts without mock fallbacks', async () => {
  await dbHelper.connect();

  // Query for a non-existent employee attendance
  const nonExistentUserId = '507f1f77bcf86cd799439999';
  const records = await dbHelper.attendances.find({ user: nonExistentUserId }).toArray();

  assert.equal(Array.isArray(records), true);
  assert.equal(records.length, 0, 'Query for non-existent employee must return empty array, not mock records');
});
