/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Daily Activity Report Service Unit Test Suite
 * 
 * Verifies Milestone 3 Feature F13:
 * 1. Mathematical aggregation of 1-minute telemetry slices into hours.
 * 2. Active input hours calculation (key/mouse activity vs hardware idle).
 * 3. Canonical category usage allocation and percentage breakdown.
 * 4. Zero-telemetry handling (decoupled unmonitored workday without NaN).
 * 5. Report persistence to DailyActivityReport model.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/niyantran_v2_isolated_test';

const User = require('../../../models/User');
const Attendance = require('../../../models/Attendance');
const DailyAttendance = require('../../../models/DailyAttendance');
const AggregatedTelemetryV2 = require('../models/AggregatedTelemetryV2');
const DailyActivityReport = require('../models/DailyActivityReport');
const { CATEGORIES } = require('../config/constants');
const dailyReportService = require('../services/dailyReportService');

let isMongoConnected = false;
let testUser = null;

test.before(async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    }
    isMongoConnected = true;

    // Clean test data
    await DailyActivityReport.deleteMany({});
    await AggregatedTelemetryV2.deleteMany({});

    testUser = await User.create({
      name: 'Priya Sharma (M3 Daily Report)',
      email: `priya.sharma.${Date.now()}@m3-test.local`,
      password: 'testPassword123',
      role: 'User',
      employeeId: 'BHIV-M3-REP-01'
    });
  } catch (err) {
    console.warn('MongoDB connection fallback:', err.message);
  }
});

test.after(async () => {
  if (isMongoConnected) {
    if (testUser) {
      await DailyActivityReport.deleteMany({ employee: testUser._id });
      await AggregatedTelemetryV2.deleteMany({ employee: testUser._id });
      await User.deleteOne({ _id: testUser._id });
    }
    await mongoose.disconnect();
  }
});

test('dailyReportService: handles zero-telemetry workday cleanly without NaN or errors', async () => {
  const userId = testUser ? testUser._id : new mongoose.Types.ObjectId();
  const testDate = new Date('2026-11-20T10:00:00.000Z');

  const report = await dailyReportService.generateDailyReport(userId, testDate, {
    attendanceHours: 8.5,
    breakTimeMinutes: 45
  });

  assert.ok(report, 'Report must be returned');
  assert.equal(report.totalAttendanceHours, 8.5);
  assert.equal(report.breakHours, 0.75); // 45 / 60
  assert.equal(report.monitoredHours, 0);
  assert.equal(report.activeInputHours, 0);
  assert.equal(report.hardwareIdleHours, 0);
  assert.equal(report.telemetrySliceCount, 0);
  assert.ok(Array.isArray(report.categories));
  assert.equal(report.categories.length, Object.keys(CATEGORIES).length);

  for (const cat of report.categories) {
    assert.equal(cat.durationSeconds, 0);
    assert.equal(cat.durationHours, 0);
    assert.equal(cat.percentage, 0);
    assert.equal(cat.sliceCount, 0);
    assert.ok(!Number.isNaN(cat.percentage), 'Category percentage must never be NaN');
  }
});

test('dailyReportService: accurately aggregates telemetry slices, active hours, and category breakdowns', async () => {
  const userId = testUser ? testUser._id : new mongoose.Types.ObjectId();
  const testDate = new Date('2026-11-20T12:00:00.000Z');
  const baseMinute = new Date('2026-11-20T09:00:00.000Z');

  // Insert 5 telemetry slices (each 60s):
  // 1: DEVELOPMENT, active input (50 keys), 10s idle -> 50s active
  // 2: DEVELOPMENT, active input (20 mouse), 0s idle -> 60s active
  // 3: DOCUMENTATION, active input (10 keys), 30s idle -> 30s active
  // 4: COMMUNICATION, zero input, 60s idle -> 0s active
  // 5: SUPPORT, active input (5 keys), 5s idle -> 55s active
  // Total monitored: 300s = 5m = 0.08h
  // Total idle: 10 + 0 + 30 + 60 + 5 = 105s = 0.03h
  // Total active input: 50 + 60 + 30 + 0 + 55 = 195s = 0.05h

  const slices = [
    {
      session_id: 'test_sess_01',
      employee: userId,
      device_id: 'DEV-TEST-01',
      minute_timestamp: new Date(baseMinute.getTime() + 0 * 60000),
      duration_seconds: 60,
      activity_counts: { key_presses: 50, mouse_events: 10, hardware_idle_seconds: 10 },
      primary_category: CATEGORIES.DEVELOPMENT
    },
    {
      session_id: 'test_sess_01',
      employee: userId,
      device_id: 'DEV-TEST-01',
      minute_timestamp: new Date(baseMinute.getTime() + 1 * 60000),
      duration_seconds: 60,
      activity_counts: { key_presses: 0, mouse_events: 20, hardware_idle_seconds: 0 },
      primary_category: CATEGORIES.DEVELOPMENT
    },
    {
      session_id: 'test_sess_01',
      employee: userId,
      device_id: 'DEV-TEST-01',
      minute_timestamp: new Date(baseMinute.getTime() + 2 * 60000),
      duration_seconds: 60,
      activity_counts: { key_presses: 10, mouse_events: 0, hardware_idle_seconds: 30 },
      primary_category: CATEGORIES.DOCUMENTATION
    },
    {
      session_id: 'test_sess_01',
      employee: userId,
      device_id: 'DEV-TEST-01',
      minute_timestamp: new Date(baseMinute.getTime() + 3 * 60000),
      duration_seconds: 60,
      activity_counts: { key_presses: 0, mouse_events: 0, hardware_idle_seconds: 60 },
      primary_category: CATEGORIES.COMMUNICATION
    },
    {
      session_id: 'test_sess_01',
      employee: userId,
      device_id: 'DEV-TEST-01',
      minute_timestamp: new Date(baseMinute.getTime() + 4 * 60000),
      duration_seconds: 60,
      activity_counts: { key_presses: 5, mouse_events: 5, hardware_idle_seconds: 5 },
      primary_category: CATEGORIES.SUPPORT
    }
  ];

  await AggregatedTelemetryV2.insertMany(slices);

  const report = await dailyReportService.generateDailyReport(userId, testDate, {
    attendanceHours: 7.5,
    breakTimeMinutes: 30
  });

  assert.equal(report.totalAttendanceHours, 7.5);
  assert.equal(report.breakHours, 0.5);
  assert.equal(report.monitoredHours, +(300 / 3600).toFixed(2));
  assert.equal(report.hardwareIdleHours, +(105 / 3600).toFixed(2));
  assert.equal(report.activeInputHours, +(195 / 3600).toFixed(2));
  assert.equal(report.telemetrySliceCount, 5);

  const devCat = report.categories.find(c => c.name === CATEGORIES.DEVELOPMENT);
  assert.ok(devCat);
  assert.equal(devCat.durationSeconds, 120);
  assert.equal(devCat.sliceCount, 2);
  assert.equal(devCat.percentage, 40); // 120 / 300 = 40%

  const docCat = report.categories.find(c => c.name === CATEGORIES.DOCUMENTATION);
  assert.ok(docCat);
  assert.equal(docCat.durationSeconds, 60);
  assert.equal(docCat.percentage, 20); // 60 / 300 = 20%
});

test('dailyReportService: persists report to DailyActivityReport model', async () => {
  const userId = testUser ? testUser._id : new mongoose.Types.ObjectId();
  const testDate = new Date('2026-11-20T14:00:00.000Z');

  const report = await dailyReportService.generateDailyReport(userId, testDate, {
    attendanceHours: 6.0,
    breakTimeMinutes: 0
  });

  const persisted = await DailyActivityReport.findOne({
    employee: userId,
    date: '2026-11-20'
  }).lean();

  assert.ok(persisted, 'Report must be persisted in database');
  assert.equal(persisted.totalAttendanceHours, 6.0);
  assert.equal(persisted.reportId, report.reportId);
});

test('dailyReportService: compileDailyReport alias works seamlessly with object parameters', async () => {
  const userId = testUser ? testUser._id : new mongoose.Types.ObjectId();
  const dateStr = '2026-11-20';

  const report = await dailyReportService.compileDailyReport({
    employeeId: userId,
    date: dateStr,
    attendanceHours: 8.0,
    breakTimeMinutes: 60
  });

  assert.ok(report);
  assert.equal(report.totalAttendanceHours, 8.0);
  assert.equal(report.breakHours, 1.0);
});
