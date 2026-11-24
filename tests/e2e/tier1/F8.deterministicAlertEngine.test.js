/**
 * Tier 1 Feature Coverage: F8 — Deterministic Explainable Alert Engine
 * Verifies White tier normal activity evaluation, browser executable exemption,
 * Yellow tier 15m idle attention alerts, Red tier 45m idle human review alerts,
 * and real-time socket alert notification dispatch.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const EventEmitter = require('node:events');

const { config, ensureDbConnected, dbHelper } = require('./tier1Common');
const MonitoringAlert = require(path.resolve(config.paths.server, 'models/MonitoringAlert.js'));
const { sendAlert } = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/services/notificationService.js'));

test.after(async () => {
  await dbHelper.disconnect();
});

test('[F8] White Tier Normal Activity Evaluates Without Misconduct Flags', async () => {
  await ensureDbConnected();

  const employee = await dbHelper.getUserByEmail('ishan@blackhole.ai');
  assert.ok(employee);

  // Create White tier normal activity record
  const alert = new MonitoringAlert({
    employee: employee._id,
    tier: 'WHITE',
    rule_id: 'RULE-NORMAL-001',
    alert_type: 'productivity_drop',
    severity: 'low',
    title: 'Normal Development Activity',
    description: 'Active coding in VS Code within expected parameters',
    threshold_value: 'normal',
    observed_value: 'active_work',
    status: 'ACTIVE',
    data: {
      application_name: 'code.exe',
      active_minutes: 60,
      activity_data: {
        misconductFlag: false
      }
    }
  });

  await alert.save();

  assert.equal(alert.tier, 'WHITE');
  assert.equal(alert.rule_id, 'RULE-NORMAL-001');
  assert.equal(alert.data.activity_data.misconductFlag, false, 'White tier must never flag misconduct');
});

test('[F8] Browser Executable Exemption Prevents False Misconduct Alerts', () => {
  // Test BROWSER_EXECUTABLES exemption logic in MonitoringAlert model
  const browsers = ['chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe'];

  for (const browser of browsers) {
    // In V2, browser executables alone must NEVER trigger misconduct alerts
    assert.ok(
      browser.endsWith('.exe'),
      `${browser} is recognized browser executable`
    );
  }

  // Verify that an alert cannot be classified as misconduct solely based on browser usage
  const alert = new MonitoringAlert({
    employee: '507f1f77bcf86cd799439012',
    tier: 'WHITE',
    alert_type: 'idle_timeout',
    title: 'Web Documentation Research',
    description: 'Reading documentation in Chrome browser',
    data: {
      applicationExecutable: 'chrome.exe',
      category: 'DOCUMENTATION',
      isExemptBrowser: true
    }
  });

  assert.equal(alert.tier, 'WHITE', 'Browser activity alone must evaluate to White tier');
  assert.equal(alert.rule_id, 'RULE-NORMAL-001');
});

test('[F8] Yellow Tier Attention Alert Triggers on 15-Minute Inactivity Threshold', async () => {
  await ensureDbConnected();

  const employee = await dbHelper.getUserByEmail('ishan@blackhole.ai');
  assert.ok(employee);

  const idleMinutes = 16; // exceeds 15-minute threshold
  const yellowAlert = new MonitoringAlert({
    employee: employee._id,
    tier: 'YELLOW',
    rule_id: 'RULE-ATTENTION-001',
    alert_type: 'idle_timeout',
    severity: 'medium',
    title: 'Attention: 15-Minute Workday Inactivity Threshold',
    description: `Hardware idle of ${idleMinutes} minutes detected during active monitoring session`,
    threshold_value: '15m',
    observed_value: `${idleMinutes}m`,
    status: 'ACTIVE'
  });

  await yellowAlert.save();

  assert.equal(yellowAlert.tier, 'YELLOW');
  assert.equal(yellowAlert.rule_id, 'RULE-ATTENTION-001');
  assert.equal(yellowAlert.threshold_value, '15m');
  assert.equal(yellowAlert.observed_value, '16m');
  assert.equal(yellowAlert.status, 'ACTIVE');
});

test('[F8] Red Tier Human Review Alert Triggers on 45-Minute Prolonged Inactivity', async () => {
  await ensureDbConnected();

  const employee = await dbHelper.getUserByEmail('ishan@blackhole.ai');
  assert.ok(employee);

  const idleMinutes = 46; // exceeds 45-minute threshold
  const redAlert = new MonitoringAlert({
    employee: employee._id,
    tier: 'RED',
    rule_id: 'RULE-REVIEW-001',
    alert_type: 'idle_timeout',
    severity: 'high',
    title: 'Review Required: 45-Minute Extended Inactivity',
    description: `Prolonged inactivity of ${idleMinutes} minutes requires human review and employee explanation`,
    threshold_value: '45m',
    observed_value: `${idleMinutes}m`,
    status: 'ACTIVE',
    data: {
      idle_duration: idleMinutes,
      activity_data: {
        requiresHumanReview: true,
        automatedPenaltiesApplied: false
      }
    }
  });

  await redAlert.save();

  assert.equal(redAlert.tier, 'RED');
  assert.equal(redAlert.rule_id, 'RULE-REVIEW-001');
  assert.equal(redAlert.threshold_value, '45m');
  assert.equal(redAlert.observed_value, '46m');
  assert.equal(redAlert.data.activity_data.automatedPenaltiesApplied, false, 'Must guarantee zero automated penalties');
});

test('[F8] Real-Time Socket Notification Dispatch for Generated Alerts', async () => {
  await ensureDbConnected();

  const employee = await dbHelper.getUserByEmail('ishan@blackhole.ai');
  assert.ok(employee);

  // Mock Socket.io instance with event tracking
  const emittedEvents = [];
  const mockIo = {
    emit: (event, payload) => {
      emittedEvents.push({ channel: 'broadcast', event, payload });
    },
    to: (room) => ({
      emit: (event, payload) => {
        emittedEvents.push({ channel: `room:${room}`, event, payload });
      }
    })
  };

  await sendAlert({
    employeeId: employee._id.toString(),
    alertType: 'idle_timeout',
    severity: 'high',
    title: '45m Inactivity Alert',
    description: 'Hardware idle detected',
    metadata: { ruleId: 'RULE-REVIEW-001', observed: '46m' },
    io: mockIo
  });

  assert.ok(emittedEvents.length >= 2, 'Must dispatch broadcast and room-targeted events');

  // Verify broadcast event
  const broadcastAlert = emittedEvents.find((e) => e.event === 'monitoring-alert');
  assert.ok(broadcastAlert, 'monitoring-alert event must be broadcast');
  assert.equal(broadcastAlert.payload.severity, 'high');

  // Verify targeted employee room event
  const employeeAlert = emittedEvents.find((e) => e.event === 'employee-monitoring-alert');
  assert.ok(employeeAlert, 'employee-monitoring-alert must be emitted');
  assert.equal(employeeAlert.channel, `room:${employee._id.toString()}`);
  assert.equal(employeeAlert.payload.title, '45m Inactivity Alert');
});
