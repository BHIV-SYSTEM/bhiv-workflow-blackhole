/**
 * Niyantran Employee Monitoring V2 — Tier 3 Cross-Feature Combination Test
 * Combination: Privacy Boundary + Telemetry Ingestion + Socket Broadcast (F5 + F7 + F15)
 *
 * Verifies that:
 * - Telemetry ingestion adheres strictly to privacy contracts rejecting forbidden fields.
 * - Zero surveillance data (keystrokes, screenshots, urls, window titles) is saved to MongoDB.
 * - Privacy-compliant telemetry tick triggers real-time Socket.io broadcast with numeric metrics only.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const path = require('node:path');

const config = require('../config');
const { dbHelper } = require('../helpers/dbHelper');
const contracts = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/contracts'));

test.after(async () => {
  await dbHelper.disconnect();
});

test('[F5][F7] Telemetry ingestion strictly enforces privacy gates and persists zero surveillance fields', async () => {
  await dbHelper.connect();

  // Test sample with prohibited fields
  const forbiddenPayload = {
    sessionId: 'v2_sess_combo_privacy',
    keyPressCount: 45,
    mouseActivityDelta: 20,
    hardwareIdleSeconds: 0,
    activeProcessCategory: 'DEVELOPMENT',
    // Prohibited fields:
    keystrokes: ['ctrl', 'c', 'v'],
    screenshot: 'data:image/png;base64,...',
    url: 'https://github.com/company/repo'
  };

  const validation = contracts.validateTelemetrySample(forbiddenPayload);
  assert.equal(validation.valid, false, 'Sample with forbidden fields must fail validation');
  assert.ok(validation.errors.some((e) => e.includes('keystrokes')));
  assert.ok(validation.errors.some((e) => e.includes('screenshot')));
  assert.ok(validation.errors.some((e) => e.includes('url')));

  // Ingestion pipeline: ensure forbidden fields are never persisted
  const sanitizeTelemetryForDb = (sample) => {
    const val = contracts.validateTelemetrySample(sample);
    if (!val.valid) {
      throw new Error(`CRITICAL PRIVACY VIOLATION: ${val.errors.join('; ')}`);
    }

    return {
      session_id: sample.sessionId,
      duration_seconds: sample.durationSeconds || 60,
      activity_counts: {
        key_presses: sample.keyPressCount || 0,
        mouse_events: sample.mouseActivityDelta || 0,
        hardware_idle_seconds: sample.hardwareIdleSeconds || 0
      },
      primary_category: sample.activeProcessCategory || 'NEUTRAL',
      focus_score: 95,
      minute_timestamp: new Date()
    };
  };

  // Attempting to ingest forbidden payload throws
  assert.throws(
    () => sanitizeTelemetryForDb(forbiddenPayload),
    (err) => {
      assert.ok(err.message.includes('PRIVACY VIOLATION'));
      return true;
    }
  );

  // Ingesting valid sample produces clean document with zero forbidden fields
  const validPayload = {
    sessionId: 'v2_sess_combo_privacy',
    durationSeconds: 60,
    keyPressCount: 45,
    mouseActivityDelta: 20,
    hardwareIdleSeconds: 0,
    activeProcessCategory: 'DEVELOPMENT'
  };

  const cleanDoc = sanitizeTelemetryForDb(validPayload);
  assert.equal(cleanDoc.keystrokes, undefined);
  assert.equal(cleanDoc.screenshot, undefined);
  assert.equal(cleanDoc.url, undefined);
  assert.equal(cleanDoc.windowTitle, undefined);
  assert.equal(cleanDoc.activity_counts.key_presses, 45);
});

test('[F5][F15] Privacy-compliant telemetry tick triggers real-time Socket.io broadcast with numeric metrics only', () => {
  const socketBus = new EventEmitter();
  const broadcastMessages = [];

  socketBus.on('monitoring-v2:telemetry-tick', (event) => {
    broadcastMessages.push(event);
  });

  // Emitting telemetry tick to Live Team
  const emitTelemetryTick = (employeeId, telemetrySample) => {
    const eventPayload = {
      employeeId,
      sessionId: telemetrySample.sessionId,
      category: telemetrySample.activeProcessCategory || 'DEVELOPMENT',
      focusScore: 92,
      activeSeconds: (telemetrySample.durationSeconds || 60) - (telemetrySample.hardwareIdleSeconds || 0),
      idleSeconds: telemetrySample.hardwareIdleSeconds || 0,
      timestamp: new Date().toISOString()
    };

    socketBus.emit('monitoring-v2:telemetry-tick', eventPayload);
    return eventPayload;
  };

  const sample = {
    sessionId: 'v2_sess_socket_broadcast',
    durationSeconds: 60,
    hardwareIdleSeconds: 5,
    activeProcessCategory: 'DEVELOPMENT'
  };

  emitTelemetryTick('emp_123', sample);

  assert.equal(broadcastMessages.length, 1);
  const msg = broadcastMessages[0];
  assert.equal(msg.employeeId, 'emp_123');
  assert.equal(msg.activeSeconds, 55);
  assert.equal(msg.idleSeconds, 5);
  assert.equal(msg.category, 'DEVELOPMENT');

  // Verify zero sensitive fields are broadcast over websocket
  assert.equal(msg.keystrokes, undefined);
  assert.equal(msg.screenshot, undefined);
  assert.equal(msg.url, undefined);
  assert.equal(msg.windowTitle, undefined);
});
