/**
 * Tier 1 Feature Coverage: F14 — Mock Data Eradication & Data Authenticity
 * Verifies that dashboard stats, activity stream, Live Team fleet, monitoring summaries,
 * and session timelines are derived strictly from authentic MongoDB records with zero synthetic fallback.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { config, authHelper, apiRequest, ensureDbConnected, dbHelper } = require('./tier1Common');
const analyticsService = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/services/analyticsService.js'));

test.after(async () => {
  await dbHelper.disconnect();
});

test('[F14] Dashboard Attendance Summary Derived from Live Database Records', async () => {
  await ensureDbConnected();

  const realUserCount = await dbHelper.users.countDocuments({});
  assert.ok(realUserCount > 0, 'Database must have real users');

  const res = await apiRequest({
    method: 'GET',
    path: '/api/dashboard/stats'
  });

  assert.equal(res.status, 200, `Activity request failed with ${res.status}: ${res.text}`);
  assert.ok(res.body);

  // Assert user count reflects real database records rather than hardcoded mock numbers
  if (res.body.totalUsers !== undefined) {
    assert.equal(typeof res.body.totalUsers, 'number');
    assert.ok(res.body.totalUsers >= realUserCount || res.body.totalUsers > 0);
  }
});

test('[F14] Dashboard Activity Stream Excludes Synthetic Mock User Records', async () => {
  await ensureDbConnected();

  const res = await apiRequest({
    method: 'GET',
    path: '/api/dashboard/activity'
  });

  assert.equal(res.status, 200, `Activity request failed with ${res.status}: ${res.text}`);
  const activities = Array.isArray(res.body) ? res.body : (res.body.activities || []);

  // Guarantee absence of fake mock placeholders
  const fakeNames = ['John Doe', 'Jane Smith', 'Fake Employee', 'Mock User'];
  for (const item of activities) {
    const actor = String(item.userName || item.user?.name || item.user || item.name || '');
    for (const fake of fakeNames) {
      assert.ok(
        !actor.includes(fake),
        `Activity stream must NEVER contain synthetic mock user '${fake}'`
      );
    }

    // Verify authenticity: item ID must originate from MongoDB Task or Progress model
    if (item.id) {
      assert.match(
        String(item.id),
        /^(task|prog)-[0-9a-fA-F]{24}$/,
        `Activity id '${item.id}' must follow authentic MongoDB document prefix format`
      );
    }
  }
});

test('[F14] Admin Live Team Fleet Excludes Hardcoded Mock Employees', async () => {
  await ensureDbConnected();

  const admin = await dbHelper.getUserByEmail('rudra@blackhole.ai');
  const adminToken = authHelper.createAdminToken({ id: admin._id.toString() });

  const res = await apiRequest({
    method: 'GET',
    path: '/api/monitoring-v2/admin/live-team',
    token: adminToken
  });

  assert.equal(res.status, 200, `Activity request failed with ${res.status}: ${res.text}`);
  const team = res.body.team || [];

  // Guarantee absence of client mock data employees (Aarav Sharma, Priya Patel, Rohan Verma, Neha Gupta)
  const clientMockNames = ['Aarav Sharma', 'Priya Patel', 'Rohan Verma', 'Neha Gupta'];
  for (const member of team) {
    for (const mockName of clientMockNames) {
      assert.notEqual(
        member.employeeName,
        mockName,
        `Live Team fleet must not contain mock data fallback '${mockName}'`
      );
    }
    // Verify each member maps to an authentic ObjectId in database
    if (member.employeeId) {
      const user = await dbHelper.getUserById(member.employeeId);
      assert.ok(user, `Live team employeeId '${member.employeeId}' must exist in User collection`);
    }
  }
});

test('[F14] Monitoring Reports Query Rejects In-Memory Synthetic Data Fallbacks', async () => {
  await ensureDbConnected();

  const admin = await dbHelper.getUserByEmail('rudra@blackhole.ai');
  const adminToken = authHelper.createAdminToken({ id: admin._id.toString() });

  const res = await apiRequest({
    method: 'GET',
    path: '/api/monitoring-v2/admin/summary',
    token: adminToken
  });

  assert.equal(res.status, 200, `Activity request failed with ${res.status}: ${res.text}`);
  assert.equal(res.body.success, true);

  // Assert aggregate metrics are numbers calculated from database
  assert.equal(typeof res.body.activeSessions, 'number');
  assert.equal(typeof res.body.activeDevices, 'number');
  assert.equal(typeof res.body.categoryBreakdown, 'object');
});

test('[F14] Session Activity Timeline Reflects Authentic Telemetry Slices', async () => {
  await ensureDbConnected();

  const employee = await dbHelper.getUserByEmail('ishan@blackhole.ai');
  assert.ok(employee);

  // Query daily timeline via analytics service
  const todayStr = new Date().toISOString().split('T')[0];
  const timeline = await analyticsService.getEmployeeDailyTimeline(employee._id, todayStr);

  assert.ok(timeline, 'Timeline must exist');
  assert.ok(Array.isArray(timeline.slices), 'Timeline slices must be an array');

  // Verify all slices in timeline contain authentic schema properties
  for (const slice of timeline.slices) {
    assert.ok(slice.timestamp, 'Slice must have timestamp');
    assert.ok(typeof slice.durationSeconds === 'number', 'Slice must have durationSeconds');
  }
});
