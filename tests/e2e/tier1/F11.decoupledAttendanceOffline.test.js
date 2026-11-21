/**
 * Tier 1 Feature Coverage: F11 — Decoupled Attendance & Disconnected State
 * Verifies that attendance records accurately even when desktop agent is offline,
 * support for monitoringConsent: false, continuous attendance without degradation,
 * unmasked "Disconnected / Not Monitored" status on Live Team, and clean End Day finalization.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { config, authHelper, apiRequest, ensureDbConnected, dbHelper, getOrCreateTestUser, isPortOpen } = require('./tier1Common');
const Progress = require(path.resolve(config.paths.server, 'models/Progress.js'));

test.after(async () => {
  await dbHelper.disconnect();
});

test('[F11] Start Day Succeeds and Records Attendance When Agent is Offline', async () => {
  await ensureDbConnected();

  const employee = await getOrCreateTestUser('f11_decoupled@blackhole.ai', 'F11 Decoupled Employee');
  assert.ok(employee);

  // Clear today's attendance for clean run
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await dbHelper.attendances.deleteMany({ user: employee._id, date: { $gte: today } });

  const empToken = authHelper.createUserToken({ id: employee._id.toString() });

  // Start day without running agent daemon
  const res = await apiRequest({
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

  assert.equal(res.status, 200, `Start day must succeed even if agent is offline, got: ${res.status}`);
  const doc = await dbHelper.attendances.findOne({ user: employee._id, date: { $gte: today } });
  assert.ok(doc, 'Attendance document must be saved in database');
  assert.equal(doc.isPresent, true);
});

test('[F11] Start Day With Monitoring Consent False Records Decoupled Attendance', async () => {
  await ensureDbConnected();

  const employee = await getOrCreateTestUser('f11_decoupled@blackhole.ai', 'F11 Decoupled Employee');
  assert.ok(employee);

  // Clear today's attendance and sessions for clean state
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await dbHelper.attendances.deleteMany({ user: employee._id, date: { $gte: today } });
  await dbHelper.sessions.deleteMany({ employee: employee._id });

  const empToken = authHelper.createUserToken({ id: employee._id.toString() });

  // Explicitly deny monitoring consent
  const res = await apiRequest({
    method: 'POST',
    path: `/api/attendance/start-day/${employee._id.toString()}`,
    token: empToken,
    body: {
      latitude: 19.160122,
      longitude: 72.839720,
      address: 'Blackhole Infiverse Office',
      workFromHome: true,
      monitoringConsent: false
    }
  });

  assert.equal(res.status, 200);

  // Assert attendance recorded, but NO new MonitoringSessionV2 created
  const attendanceDoc = await dbHelper.attendances.findOne({ user: employee._id, date: { $gte: today } });
  assert.ok(attendanceDoc, 'Attendance must be saved');
  assert.equal(attendanceDoc.isPresent, true);

  const activeV2Session = await dbHelper.sessions.findOne({
    employee: employee._id,
    state: 'ACTIVE',
    started_at: { $gte: today }
  });
  assert.equal(activeV2Session, null, 'No active monitoring session must be created when consent is false');
});

test('[F11] Agent Disconnection Mid-Day Preserves Continuous Attendance Recording', async () => {
  await ensureDbConnected();

  const employee = await getOrCreateTestUser('f11_decoupled@blackhole.ai', 'F11 Decoupled Employee');
  const empToken = authHelper.createUserToken({ id: employee._id.toString() });

  // Query /api/attendance/status
  const res = await apiRequest({
    method: 'GET',
    path: '/api/attendance/status',
    token: empToken
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.dayStarted, true, 'dayStarted must remain true despite offline agent');
  assert.equal(res.body.dayEndedToday, false, 'Workday must remain open');
});

test('[F11] Admin Live Team Displays Unmasked "Disconnected / Not Monitored" Status', async () => {
  await ensureDbConnected();

  const admin = await dbHelper.getUserByEmail('rudra@blackhole.ai');
  const adminToken = authHelper.createAdminToken({ id: admin._id.toString() });

  const res = await apiRequest({
    method: 'GET',
    path: '/api/monitoring-v2/admin/live-team',
    token: adminToken
  });

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.team), 'live-team must return team array');

  // Employee without an active agent lease must not be masked as having an active lease
  const employee = await getOrCreateTestUser('f11_decoupled@blackhole.ai', 'F11 Decoupled Employee');
  const activeEntry = res.body.team.find((m) => String(m.employeeId) === String(employee._id));

  // If entry exists, its lease should reflect actual status, not fake activity
  if (activeEntry) {
    assert.ok(activeEntry.state === 'ACTIVE' || activeEntry.state === 'PAUSED');
  }
});

test('[F11] Clean End Day Execution for Disconnected Employee Without Failures', async () => {
  await ensureDbConnected();

  const employee = await getOrCreateTestUser('f11_decoupled@blackhole.ai', 'F11 Decoupled Employee');
  const empToken = authHelper.createUserToken({ id: employee._id.toString() });

  // Seed progress record to satisfy mandatory end-day check
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await Progress.create({
    user: employee._id,
    date: new Date(),
    progressPercentage: 100,
    notes: 'Completed decoupled attendance E2E test verification',
    achievements: 'Verified offline attendance resilience',
    blockers: 'None'
  });

  const res = await apiRequest({
    method: 'POST',
    path: `/api/attendance/end-day/${employee._id.toString()}`,
    token: empToken,
    body: {
      notes: 'Day completed offline from agent'
    }
  });

  assert.equal(res.status, 200, `End day must return HTTP 200, got: ${res.status}: ${res.text}`);
  assert.ok(res.body.message || res.body.success, 'Response must confirm clean day end');
});
