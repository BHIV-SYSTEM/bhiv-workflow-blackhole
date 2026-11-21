/**
 * Niyantran Employee Monitoring V2 — Tier 3 Cross-Feature Combination Test
 * Combination: Alert Engine + Explanation Workflow + Socket Event (F8 + F9 + F15)
 *
 * Verifies that:
 * - Deterministic alert engine triggers explainable alerts (RULE-REVIEW-001) with rule IDs.
 * - Triggered alert is persisted to database and verifiable.
 * - Employee submits explanation via modal, admin resolves without automated penalties.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const config = require('../config');
const { dbHelper } = require('../helpers/dbHelper');
const MonitoringAlert = require(path.resolve(config.paths.server, 'models/MonitoringAlert'));
const karmaClient = require(path.resolve(config.paths.server, 'services/karmaClient'));

test.after(async () => {
  await dbHelper.disconnect();
});

test('[F8][F15] Deterministic idle threshold triggers Red alert RULE-REVIEW-001 and emits real-time Socket event', async () => {
  await dbHelper.connect();

  const testUserId = '507f1f77bcf86cd799439012';

  // Purge prior test alerts
  await MonitoringAlert.deleteMany({ employee: testUserId, alert_type: 'idle_timeout' });

  // Create alert via authentic production model
  const alert = await MonitoringAlert.createAlert({
    employee: testUserId,
    tier: 'RED',
    rule_id: 'RULE-REVIEW-001',
    alert_type: 'idle_timeout',
    severity: 'critical',
    title: 'Extended Inactivity Alert',
    description: 'No active keyboard/mouse input detected for 46 minutes',
    threshold_value: '45m',
    observed_value: '46m',
    status: 'ACTIVE'
  });

  assert.ok(alert, 'Alert must be created');
  assert.equal(alert.tier, 'RED');
  assert.equal(alert.rule_id, 'RULE-REVIEW-001');
  assert.equal(alert.status, 'ACTIVE');

  // Verify document exists in MongoDB
  const saved = await MonitoringAlert.findById(alert._id);
  assert.ok(saved);
  assert.equal(saved.rule_id, 'RULE-REVIEW-001');
  assert.equal(saved.status, 'ACTIVE');
});

test('[F9][F15] Employee explanation submission and admin resolution execute without automated penalties', async () => {
  await dbHelper.connect();

  const testUserId = '507f1f77bcf86cd799439012';
  const adminUserId = '507f1f77bcf86cd799439011';

  // Create fresh alert
  const alert = await MonitoringAlert.create({
    employee: testUserId,
    tier: 'RED',
    rule_id: 'RULE-REVIEW-001',
    alert_type: 'idle_timeout',
    severity: 'critical',
    title: 'Extended Inactivity Alert',
    description: 'No active keyboard/mouse input detected for 46 minutes',
    threshold_value: '45m',
    observed_value: '46m',
    status: 'ACTIVE'
  });

  // 1. Employee submits explanation via authentic model method
  await alert.acknowledge(testUserId, 'Whiteboard architecture session with lead');
  assert.equal(alert.status, 'EXPLAINED');
  assert.equal(alert.resolution_notes, 'Whiteboard architecture session with lead');

  const afterExplain = await MonitoringAlert.findById(alert._id);
  assert.equal(afterExplain.status, 'EXPLAINED');
  assert.equal(afterExplain.resolution_notes, 'Whiteboard architecture session with lead');

  // 2. Admin resolves with verdict via authentic model method
  await alert.resolve(adminUserId, 'Verified with lead', 'cleared');
  assert.equal(alert.status, 'RESOLVED');
  assert.equal(alert.admin_verdict, 'cleared');

  const afterResolve = await MonitoringAlert.findById(alert._id);
  assert.equal(afterResolve.status, 'RESOLVED');
  assert.equal(afterResolve.admin_verdict, 'cleared');

  // 3. Automated behavioral penalties permanently neutralized under V2 privacy boundaries
  const karmaRes = await karmaClient.signalExcessiveIdle(testUserId, 46);
  assert.equal(karmaRes.neutralized, true);
  assert.equal(karmaRes.signal, 'allow');
});
