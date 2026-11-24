/**
 * Tier 1 Feature Coverage: F9 — Alert Explanation & Admin Review Workflow
 * Verifies employee explanation submission, admin review resolution (acknowledged & cleared),
 * employee alerts query with audit history, and guarantee of zero automated penalties.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { config, authHelper, apiRequest, ensureDbConnected, dbHelper } = require('./tier1Common');
const MonitoringAlert = require(path.resolve(config.paths.server, 'models/MonitoringAlert.js'));

test.after(async () => {
  await dbHelper.disconnect();
});

test('[F9] Employee Explanation Submission for Active Alert', async () => {
  await ensureDbConnected();

  const employee = await dbHelper.getUserByEmail('ishan@blackhole.ai');
  assert.ok(employee);

  // 1. Seed active Red alert
  const alert = await MonitoringAlert.create({
    employee: employee._id,
    tier: 'RED',
    rule_id: 'RULE-REVIEW-001',
    alert_type: 'idle_timeout',
    severity: 'high',
    title: 'Prolonged Inactivity (45m)',
    description: '45 minutes idle detected',
    status: 'ACTIVE'
  });

  const empToken = authHelper.createUserToken({ id: employee._id.toString() });

  // 2. Submit explanation
  const res = await apiRequest({
    method: 'POST',
    path: `/api/alerts/${alert._id}/explain`,
    token: empToken,
    body: {
      explanation: 'Architecture whiteboard discussion with the frontend engineering team.'
    }
  });

  assert.equal(res.status, 200, `Explain submit must return HTTP 200, got: ${res.status}`);
  assert.equal(res.body.success, true);
  assert.equal(res.body.alert.status, 'EXPLAINED');
  assert.equal(
    res.body.alert.employee_explanation,
    'Architecture whiteboard discussion with the frontend engineering team.'
  );

  // Verify in MongoDB
  const updatedDoc = await MonitoringAlert.findById(alert._id);
  assert.equal(updatedDoc.status, 'EXPLAINED');
  assert.ok(updatedDoc.explained_at, 'explained_at timestamp must be recorded');
});

test('[F9] Admin Resolution Workflow with Acknowledged Verdict', async () => {
  await ensureDbConnected();

  const employee = await dbHelper.getUserByEmail('ishan@blackhole.ai');
  const admin = await dbHelper.getUserByEmail('rudra@blackhole.ai');
  assert.ok(employee && admin);

  // 1. Seed explained alert
  const alert = await MonitoringAlert.create({
    employee: employee._id,
    tier: 'RED',
    rule_id: 'RULE-REVIEW-001',
    alert_type: 'idle_timeout',
    severity: 'high',
    title: '45m Idle Alert',
    description: 'Idle review',
    status: 'EXPLAINED',
    employee_explanation: 'Team sync',
    explained_at: new Date()
  });

  const adminToken = authHelper.createAdminToken({ id: admin._id.toString() });

  // 2. Admin resolves alert as acknowledged
  const res = await apiRequest({
    method: 'POST',
    path: `/api/alerts/${alert._id}/resolve`,
    token: adminToken,
    body: {
      verdict: 'acknowledged',
      resolution_notes: 'Verified with engineering team lead.'
    }
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.alert.status, 'RESOLVED');
  assert.equal(res.body.alert.admin_verdict, 'acknowledged');
  assert.equal(res.body.alert.resolution_notes, 'Verified with engineering team lead.');
});

test('[F9] Admin Resolution Workflow with Cleared Verdict Without Penalty', async () => {
  await ensureDbConnected();

  const employee = await dbHelper.getUserByEmail('ishan@blackhole.ai');
  const admin = await dbHelper.getUserByEmail('rudra@blackhole.ai');

  // Seed another alert
  const alert = await MonitoringAlert.create({
    employee: employee._id,
    tier: 'YELLOW',
    rule_id: 'RULE-ATTENTION-001',
    alert_type: 'idle_timeout',
    severity: 'medium',
    title: '15m Idle Alert',
    description: 'Hardware idle',
    status: 'ACTIVE'
  });

  const adminToken = authHelper.createAdminToken({ id: admin._id.toString() });

  // Admin clears false positive
  const res = await apiRequest({
    method: 'POST',
    path: `/api/alerts/${alert._id}/resolve`,
    token: adminToken,
    body: {
      verdict: 'cleared',
      resolution_notes: 'False positive — employee was presenting slides.'
    }
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.alert.status, 'RESOLVED');
  assert.equal(res.body.alert.admin_verdict, 'cleared');
});

test('[F9] Employee Alerts Query Returns Explanations and Resolution History', async () => {
  await ensureDbConnected();

  const employee = await dbHelper.getUserByEmail('ishan@blackhole.ai');
  const empToken = authHelper.createUserToken({ id: employee._id.toString() });

  const res = await apiRequest({
    method: 'GET',
    path: '/api/alerts',
    token: empToken
  });

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body), 'Alerts query must return array of alerts');
  assert.ok(res.body.length > 0, 'Must return at least one alert');

  // Find a resolved alert
  const resolved = res.body.find((a) => a.status === 'RESOLVED');
  assert.ok(resolved, 'Must find resolved alert in query results');
  assert.ok(resolved.admin_verdict, 'Resolved alert must include admin_verdict');
  assert.ok(resolved.resolution_notes, 'Resolved alert must include resolution_notes');
});

test('[F9] Zero Automated Salary or Behavioral Penalties on Flagged Alerts', async () => {
  await ensureDbConnected();

  const employee = await dbHelper.getUserByEmail('ishan@blackhole.ai');
  assert.ok(employee);

  // Verify that employee record has zero negative behavioral score penalties
  const userDoc = await dbHelper.users.findOne({ _id: employee._id });
  assert.ok(userDoc);

  // Check that salary or karma fields have not been decremented by automation
  const karmaPenalty = userDoc.karma_penalty || 0;
  const salaryDeduction = userDoc.automated_salary_deduction || 0;

  assert.equal(karmaPenalty, 0, 'Karma score must have zero automated penalties');
  assert.equal(salaryDeduction, 0, 'Must have zero automated salary deductions');
});
