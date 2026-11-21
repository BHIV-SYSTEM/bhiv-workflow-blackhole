/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Explainable Activity Alerts & Privacy Boundaries Test Suite
 * 
 * Verifies Milestone 2 Features F7, F8, F9:
 * 1. Invasive surveillance eradication (OCR data, disallowed sites, stubs, penalty neutralization).
 * 2. Deterministic Tri-State Alert Engine schema (White/Yellow/Red, rule_id, thresholds, zero invasive fields).
 * 3. Strict Browser Executable Exemption Guard.
 * 4. Human-in-the-loop Explanation & Resolution API Workflow.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Ensure secrets
const TEST_JWT_SECRET = process.env.JWT_SECRET || 'v2-explainable-alerts-test-jwt-secret';
process.env.JWT_SECRET = TEST_JWT_SECRET;

const MonitoringAlert = require('../../../models/MonitoringAlert');
const { isBrowserExecutable, BROWSER_EXECUTABLES } = MonitoringAlert;
const alertsRouter = require('../../../routes/alerts');
const ocrAnalysisService = require('../../../services/ocrAnalysisService');
const safeScreenshot = require('../../../utils/safeScreenshot');
const karmaClient = require('../../../services/karmaClient');

// Test Express app mounting /api/alerts
const app = express();
app.use(express.json());
app.use('/api/alerts', alertsRouter);

// ─── Test Suite 1: Privacy Boundary & Surveillance Eradication ─────────────

test('Privacy Boundary: eng.traineddata OCR model file is deleted', () => {
  const ocrModelPath = path.resolve(__dirname, '../../../eng.traineddata');
  assert.equal(fs.existsSync(ocrModelPath), false, 'eng.traineddata must be completely excised');
});

test('Privacy Boundary: disallowed_sites.json is deleted', () => {
  const disallowedPath = path.resolve(__dirname, '../../../disallowed_sites.json');
  assert.equal(fs.existsSync(disallowedPath), false, 'disallowed_sites.json must be completely excised');
});

test('Privacy Boundary: ocrAnalysisService is an excised stub with zero dependencies', async () => {
  assert.equal(typeof ocrAnalysisService.extractTextFromScreenshot, 'function');
  const result = await ocrAnalysisService.extractTextFromScreenshot('test.png');
  assert.deepEqual(result, { text: '', confidence: 0 });
  assert.equal(ocrAnalysisService.getOCRStats().status, 'permanently_disabled');
});

test('Privacy Boundary: safeScreenshot is an excised stub returning null', async () => {
  const result = await safeScreenshot.captureSafeScreenshot();
  assert.equal(result, null);
  assert.equal(safeScreenshot.hasDesktopDisplay(), false);
});

test('Privacy Boundary: karmaClient automated behavioral penalties are neutralized', async () => {
  const idleRes = await karmaClient.signalExcessiveIdle('emp1', 30);
  assert.equal(idleRes.neutralized, true);
  assert.equal(idleRes.signal, 'allow');

  const siteRes = await karmaClient.signalDisallowedSite('emp1');
  assert.equal(siteRes.neutralized, true);
  assert.equal(siteRes.signal, 'allow');

  const keyRes = await karmaClient.signalKeystrokeAnomaly('emp1', {});
  assert.equal(keyRes.neutralized, true);
  assert.equal(keyRes.signal, 'allow');
});

// ─── Test Suite 2: Deterministic Tri-State Alert Engine Schema ─────────────

test('Alert Engine: MonitoringAlert schema contains zero invasive surveillance fields', () => {
  const paths = MonitoringAlert.schema.paths;
  assert.equal(paths.screenshot_id, undefined, 'screenshot_id must not exist on MonitoringAlert');
  assert.equal(paths.website_url, undefined, 'website_url must not exist on MonitoringAlert');
  assert.equal(paths.keystroke_id, undefined, 'keystroke_id must not exist on MonitoringAlert');
  assert.equal(paths['data.screenshot_id'], undefined, 'data.screenshot_id must not exist');
  assert.equal(paths['data.website_url'], undefined, 'data.website_url must not exist');
});

test('Alert Engine: schema defines deterministic explainable fields', () => {
  const paths = MonitoringAlert.schema.paths;
  assert.ok(paths.tier, 'tier field must exist');
  assert.ok(paths.rule_id, 'rule_id field must exist');
  assert.ok(paths.threshold_value, 'threshold_value field must exist');
  assert.ok(paths.observed_value, 'observed_value field must exist');
  assert.ok(paths.event_reference, 'event_reference field must exist');
  assert.ok(paths.employee_explanation, 'employee_explanation field must exist');
  assert.ok(paths.explained_at, 'explained_at field must exist');
  assert.ok(paths.explanation_status, 'explanation_status field must exist');
  assert.ok(paths.admin_verdict, 'admin_verdict field must exist');
  assert.ok(paths.resolution_notes, 'resolution_notes field must exist');
  assert.ok(paths.resolved_by, 'resolved_by field must exist');
  assert.ok(paths.resolved_at, 'resolved_at field must exist');
});

test('Alert Engine: tier enum supports WHITE, YELLOW, and RED with uppercase normalization', () => {
  const alertWhite = new MonitoringAlert({
    employee: new mongoose.Types.ObjectId(),
    alert_type: 'idle_timeout',
    tier: 'white',
    rule_id: 'RULE-NORMAL-001',
    title: 'Normal baseline activity',
    description: 'Workday started on time'
  });
  assert.equal(alertWhite.tier, 'WHITE');

  const alertYellow = new MonitoringAlert({
    employee: new mongoose.Types.ObjectId(),
    alert_type: 'idle_timeout',
    tier: 'yellow',
    rule_id: 'RULE-ATTENTION-STILL-002',
    title: 'Input still for 5 minutes',
    description: 'Attention threshold reached'
  });
  assert.equal(alertYellow.tier, 'YELLOW');

  const alertRed = new MonitoringAlert({
    employee: new mongoose.Types.ObjectId(),
    alert_type: 'idle_timeout',
    tier: 'red',
    rule_id: 'RULE-REVIEW-INACTIVITY-001',
    title: 'Prolonged stillness',
    description: 'Human review required'
  });
  assert.equal(alertRed.tier, 'RED');
});

test('Alert Engine: status normalizes case and lifecycle states', () => {
  const alert = new MonitoringAlert({
    employee: new mongoose.Types.ObjectId(),
    alert_type: 'idle_timeout',
    rule_id: 'RULE-ATTENTION-001',
    title: 'Status test',
    description: 'Testing status transitions',
    status: 'active'
  });
  assert.equal(alert.status, 'ACTIVE');

  alert.status = 'explained';
  assert.equal(alert.status, 'EXPLAINED');

  alert.status = 'resolved';
  assert.equal(alert.status, 'RESOLVED');

  alert.status = 'dismissed';
  assert.equal(alert.status, 'DISMISSED');
});

// ─── Test Suite 3: Browser Executable Exemption Guard ──────────────────────

test('Browser Exemption Guard: correctly identifies standard web browser executables', () => {
  assert.equal(isBrowserExecutable('chrome.exe'), true);
  assert.equal(isBrowserExecutable('msedge.exe'), true);
  assert.equal(isBrowserExecutable('firefox.exe'), true);
  assert.equal(isBrowserExecutable('brave.exe'), true);
  assert.equal(isBrowserExecutable('opera.exe'), true);
  assert.equal(isBrowserExecutable('vivaldi.exe'), true);
  assert.equal(isBrowserExecutable('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'), true);
  assert.equal(isBrowserExecutable('/usr/bin/google-chrome'), false);
  assert.equal(isBrowserExecutable('chrome'), true);

  // Non-browsers must not match
  assert.equal(isBrowserExecutable('code.exe'), false);
  assert.equal(isBrowserExecutable('slack.exe'), false);
  assert.equal(isBrowserExecutable('cmd.exe'), false);
});

test('Browser Exemption Guard: pre-validate hook strictly rejects misconduct alerts on browser executables', async () => {
  const alert = new MonitoringAlert({
    employee: new mongoose.Types.ObjectId(),
    alert_type: 'application_misuse',
    rule_id: 'RULE-TEST-001',
    title: 'Browser misuse attempt',
    description: 'Employee opened chrome',
    data: {
      application_name: 'chrome.exe'
    }
  });

  await assert.rejects(
    async () => {
      await alert.validate();
    },
    (err) => {
      assert.ok(err.message.includes('Strict Guard Violation: Browser executable "chrome.exe" alone cannot trigger misconduct alert.'));
      return true;
    }
  );
});

test('Browser Exemption Guard: MonitoringAlert.createAlert drops browser misconduct candidates', async () => {
  const candidate = {
    employee: new mongoose.Types.ObjectId(),
    alert_type: 'application_misuse',
    rule_id: 'RULE-TEST-001',
    title: 'Disallowed application',
    description: 'Browser was active',
    data: {
      application_name: 'msedge.exe'
    }
  };

  const result = await MonitoringAlert.createAlert(candidate);
  assert.equal(result, null, 'createAlert must return null and drop browser misconduct alert');
});

// ─── Test Suite 4: Explanation & Resolution API Workflow ───────────────────

test('HTTP Workflow: POST /api/alerts/:alertId/explain requires authentication and valid ID', async () => {
  const unauthRes = await request(app)
    .post('/api/alerts/nonexistentid/explain')
    .send({ explanation: 'I was in a design sync.' });
  assert.equal(unauthRes.status, 401);

  const testUser = { id: new mongoose.Types.ObjectId().toString(), role: 'User' };
  const token = jwt.sign(testUser, TEST_JWT_SECRET);

  const invalidIdRes = await request(app)
    .post('/api/alerts/123invalid/explain')
    .set('Authorization', `Bearer ${token}`)
    .send({ explanation: 'I was in a design sync.' });
  assert.equal(invalidIdRes.status, 400);
});

test('HTTP Workflow: POST /api/alerts/:alertId/resolve requires admin/manager privileges', async () => {
  const regularUser = { id: new mongoose.Types.ObjectId().toString(), role: 'User' };
  const userToken = jwt.sign(regularUser, TEST_JWT_SECRET);
  const testAlertId = new mongoose.Types.ObjectId().toString();

  const userRes = await request(app)
    .post(`/api/alerts/${testAlertId}/resolve`)
    .set('Authorization', `Bearer ${userToken}`)
    .send({ verdict: 'cleared', resolution_notes: 'Valid explanation' });
  assert.equal(userRes.status, 403, 'Regular employee must not resolve alerts');

  const adminUser = { id: new mongoose.Types.ObjectId().toString(), role: 'Admin' };
  const adminToken = jwt.sign(adminUser, TEST_JWT_SECRET);

  const invalidVerdictRes = await request(app)
    .post(`/api/alerts/${testAlertId}/resolve`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ verdict: 'invalid_verdict_type' });
  assert.equal(invalidVerdictRes.status, 400);
});
