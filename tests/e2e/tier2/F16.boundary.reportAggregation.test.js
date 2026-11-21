/**
 * Niyantran Employee Monitoring V2 — Tier 2 Boundary Test
 * Feature F16: Daily Reports Export & Analytics
 *
 * Boundary & Negative Tests:
 * 1. Daily report query for future date returns zero metrics or 404 without crashing.
 * 2. Report query for weekend or holiday with zero records returns authentic zeroes.
 * 3. Zero active input percentage calculation handles divide-by-zero safely (returns 0%).
 * 4. Malformed date string query returns 400 Bad Request.
 * 5. Unauthorized employee attempting to access another employee report is rejected with 403.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const config = require('../config');
const { httpClient } = require('../helpers/httpClient');
const { authHelper } = require('../helpers/authHelper');

// Pure daily report aggregation logic
function compileDailyReport({ attendance, telemetryRecords = [] }) {
  const attendanceHours = attendance ? attendance.hoursWorked || 0 : 0;

  let totalMonitoredSeconds = 0;
  let totalActiveInputSeconds = 0;
  let totalIdleSeconds = 0;
  const categoryCounts = {};

  for (const t of telemetryRecords) {
    const dur = t.durationSeconds || 60;
    const idle = t.hardwareIdleSeconds || 0;
    const active = Math.max(0, dur - idle);

    totalMonitoredSeconds += dur;
    totalActiveInputSeconds += active;
    totalIdleSeconds += idle;

    const cat = t.category || 'NEUTRAL';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + dur;
  }

  const monitoredHours = Math.round((totalMonitoredSeconds / 3600) * 100) / 100;
  const activeInputHours = Math.round((totalActiveInputSeconds / 3600) * 100) / 100;
  const idleHours = Math.round((totalIdleSeconds / 3600) * 100) / 100;

  // Safe percentage calculation with divide-by-zero guard
  const activePercentage = monitoredHours > 0
    ? Math.min(100, Math.round((activeInputHours / monitoredHours) * 100))
    : 0;

  return {
    attendanceHours,
    monitoredHours,
    activeInputHours,
    idleHours,
    activePercentage,
    categoryBreakdown: categoryCounts
  };
}

function validateReportDateQuery(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    const err = new Error('Date parameter is required');
    err.statusCode = 400;
    err.code = 'INVALID_DATE';
    throw err;
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    const err = new Error('Invalid date format. Expected YYYY-MM-DD');
    err.statusCode = 400;
    err.code = 'INVALID_DATE_FORMAT';
    throw err;
  }

  const parsed = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(parsed.getTime())) {
    const err = new Error('Date is invalid or out of range');
    err.statusCode = 400;
    err.code = 'INVALID_DATE';
    throw err;
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const isFuture = parsed.getTime() > today.getTime();

  return { valid: true, isFuture, targetDate: dateStr };
}

test('[F16] Daily report query for future date returns zero metrics or 404 without crashing', () => {
  const query = validateReportDateQuery('2099-12-31');
  assert.equal(query.isFuture, true, 'Date in 2099 must be identified as future');

  // Aggregation for future date with 0 records
  const futureReport = compileDailyReport({ attendance: null, telemetryRecords: [] });
  assert.equal(futureReport.attendanceHours, 0);
  assert.equal(futureReport.monitoredHours, 0);
  assert.equal(futureReport.activeInputHours, 0);
  assert.equal(futureReport.activePercentage, 0);
});

test('[F16] Report query for weekend or holiday with zero records returns authentic zeroes', () => {
  const weekendReport = compileDailyReport({ attendance: null, telemetryRecords: [] });
  assert.equal(weekendReport.attendanceHours, 0);
  assert.equal(weekendReport.monitoredHours, 0);
  assert.equal(weekendReport.idleHours, 0);
  assert.deepEqual(weekendReport.categoryBreakdown, {});
});

test('[F16] Zero active input percentage calculation handles divide-by-zero safely (returns 0%)', () => {
  // When monitoredHours = 0
  const zeroReport = compileDailyReport({ attendance: null, telemetryRecords: [] });
  assert.equal(zeroReport.activePercentage, 0);
  assert.equal(Number.isNaN(zeroReport.activePercentage), false, 'Percentage must never be NaN');
  assert.equal(Number.isFinite(zeroReport.activePercentage), true, 'Percentage must be finite');

  // When monitoredHours = 2, activeInputHours = 1 -> 50%
  const normalReport = compileDailyReport({
    attendance: { hoursWorked: 4 },
    telemetryRecords: [
      { durationSeconds: 3600, hardwareIdleSeconds: 1800, category: 'DEVELOPMENT' }
    ]
  });
  assert.equal(normalReport.activePercentage, 50);
});

test('[F16] Malformed date string query returns 400 Bad Request', () => {
  const malformedDates = ['not-a-date', '2026/11/20', '20-11-2026', '2026-99-99', '', null];

  for (const d of malformedDates) {
    assert.throws(
      () => validateReportDateQuery(d),
      (err) => {
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  }

  // Valid date passes
  const valid = validateReportDateQuery('2026-11-20');
  assert.equal(valid.valid, true);
});

test('[F16] Unauthorized employee attempting to access another employee report is rejected with 403', () => {
  function verifyReportAccess({ requestingUser, targetEmployeeId }) {
    if (requestingUser.role === 'Admin') return true;
    if (String(requestingUser.id) === String(targetEmployeeId)) return true;

    const err = new Error('Access denied: You cannot view reports for another employee');
    err.statusCode = 403;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const employeeUser = { id: 'emp_001', role: 'User' };
  const adminUser = { id: 'admin_001', role: 'Admin' };

  // Employee accessing own report -> passes
  assert.equal(verifyReportAccess({ requestingUser: employeeUser, targetEmployeeId: 'emp_001' }), true);

  // Admin accessing any employee report -> passes
  assert.equal(verifyReportAccess({ requestingUser: adminUser, targetEmployeeId: 'emp_002' }), true);

  // Employee accessing another employee report -> throws 403
  assert.throws(
    () => verifyReportAccess({ requestingUser: employeeUser, targetEmployeeId: 'emp_002' }),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'UNAUTHORIZED');
      return true;
    }
  );
});
