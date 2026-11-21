/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Telemetry Aggregator & Privacy Gate Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { TelemetryAggregator, WORK_CATEGORIES } from '../src/managers/telemetryAggregator.js';

test('TelemetryAggregator: maps process names to work categories accurately', () => {
  const aggregator = new TelemetryAggregator();

  assert.equal(aggregator.categorizeApp('Visual Studio Code'), WORK_CATEGORIES.DEVELOPMENT);
  assert.equal(aggregator.categorizeApp('Windows Terminal'), WORK_CATEGORIES.DEVELOPMENT);
  assert.equal(aggregator.categorizeApp('Slack'), WORK_CATEGORIES.COMMUNICATION);
  assert.equal(aggregator.categorizeApp('Microsoft Teams'), WORK_CATEGORIES.COMMUNICATION);
  assert.equal(aggregator.categorizeApp('Microsoft Excel'), WORK_CATEGORIES.DOCUMENTATION);
  assert.equal(aggregator.categorizeApp('Notepad'), WORK_CATEGORIES.DOCUMENTATION);
  assert.equal(aggregator.categorizeApp('Google Chrome'), WORK_CATEGORIES.NEUTRAL);
});

test('TelemetryAggregator: aggregates window metrics into canonical schema without data loss', () => {
  const aggregator = new TelemetryAggregator();

  const appMetrics = {
    apps: [
      { name: 'Visual Studio Code', durationSeconds: 40 },
      { name: 'Slack', durationSeconds: 15 },
    ],
    idleSeconds: 5,
    lockSeconds: 0,
    totalActiveSeconds: 55,
    windowDurationSeconds: 60,
  };

  const inputMetrics = {
    keyPresses: 120,
    mouseClicks: 35,
    mouseScrollDelta: 10,
    mouseDistance: 450,
  };

  const sample = aggregator.aggregateWindow({
    sessionId: 'SESSION-ABC-123',
    deviceId: 'DEV-WIN32-001',
    appMetrics,
    inputMetrics,
  });

  assert.equal(sample.sessionId, 'SESSION-ABC-123');
  assert.equal(sample.deviceId, 'DEV-WIN32-001');
  assert.equal(sample.durationSeconds, 60);
  assert.equal(sample.keyPressCount, 120);
  assert.equal(sample.mouseActivityDelta, 45); // 35 clicks + 10 scroll
  assert.equal(sample.hardwareIdleSeconds, 5);
  assert.equal(sample.activeSeconds, 55);
  assert.equal(sample.activeProcessCategory, WORK_CATEGORIES.DEVELOPMENT);
  assert.equal(sample.apps.length, 2);
  assert.equal(sample.apps[0].category, WORK_CATEGORIES.DEVELOPMENT);
});

test('TelemetryAggregator: strictly rejects forbidden surveillance fields', () => {
  const aggregator = new TelemetryAggregator();

  const baseSample = {
    sessionId: 'SESS-1',
    deviceId: 'DEV-1',
    keyPressCount: 10,
    mouseActivityDelta: 5,
    hardwareIdleSeconds: 0,
    activeSeconds: 60,
    apps: [],
  };

  // 1. Text field violation
  assert.throws(() => {
    aggregator.assertPrivacyInvariants({ ...baseSample, text: 'typed password' });
  }, /CRITICAL PRIVACY VIOLATION: Sample contains forbidden field "text"/);

  // 2. Keystroke field violation
  assert.throws(() => {
    aggregator.assertPrivacyInvariants({ ...baseSample, keystrokes: ['a', 'b', 'c'] });
  }, /CRITICAL PRIVACY VIOLATION: Sample contains forbidden field "keystrokes"/);

  // 3. Screenshot field violation
  assert.throws(() => {
    aggregator.assertPrivacyInvariants({ ...baseSample, screenshot: 'base64_image_data' });
  }, /CRITICAL PRIVACY VIOLATION: Sample contains forbidden field "screenshot"/);

  // 4. URL field violation
  assert.throws(() => {
    aggregator.assertPrivacyInvariants({ ...baseSample, url: 'https://internal-bank.com' });
  }, /CRITICAL PRIVACY VIOLATION: Sample contains forbidden field "url"/);

  // 5. Window title violation in apps
  assert.throws(() => {
    aggregator.assertPrivacyInvariants({
      ...baseSample,
      apps: [{ name: 'Chrome', durationSeconds: 60, title: 'Sensitive Client Document' }],
    });
  }, /CRITICAL PRIVACY VIOLATION: App record contains title, url, or file path/);
});
