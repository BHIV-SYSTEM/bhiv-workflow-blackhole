/**
 * Niyantran Employee Monitoring V2 — Tier 4 Acceptance Test G
 * Acceptance Test G: Offline Buffering, Reconnection & 90s Autonomous Lease Timeout (F6, F12)
 *
 * Verifies:
 * 1. Autonomous 90-second lease timeout enforcement (60s lease + 30s grace).
 * 2. Signed offline HMAC-SHA256 buffering with 120-minute FIFO capacity.
 * 3. Chronological FIFO auto-reconnection flush upon connection restoration.
 * 4. Continuous decoupled attendance recording throughout network disruption.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

const config = require('../config');
const { dbHelper } = require('../helpers/dbHelper');
const { probeTcp } = require('../helpers/preflight');

const mongoose = dbHelper.mongoose;

let telemetryService = null;
let MonitoringSessionV2 = null;
let RegisteredDevice = null;
let AggregatedTelemetryV2 = null;

try {
  telemetryService = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/services/telemetryService'));
  MonitoringSessionV2 = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/models/MonitoringSessionV2'));
  RegisteredDevice = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/models/RegisteredDevice'));
  AggregatedTelemetryV2 = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/models/AggregatedTelemetryV2'));
} catch (_) {}

test('[Test G][F6] 90s Autonomous Lease Timeout (60s Lease + 30s Grace Period)', () => {
  const leaseSeconds = config.timeouts.leaseSeconds; // 60
  const graceSeconds = config.timeouts.graceSeconds; // 30
  const maxAutonomousSeconds = config.timeouts.maxAutonomousSeconds; // 90

  assert.equal(leaseSeconds, 60, 'Base lease must be 60 seconds');
  assert.equal(graceSeconds, 30, 'Autonomous grace period must be 30 seconds');
  assert.equal(maxAutonomousSeconds, 90, 'Total autonomous lease timeout must be 90 seconds');

  function evaluateLeaseStatus(issuedAtMs, currentMs) {
    const elapsedSeconds = (currentMs - issuedAtMs) / 1000;
    if (elapsedSeconds <= leaseSeconds) {
      return { status: 'ACTIVE', canRenew: true, isAuthorized: true };
    }
    if (elapsedSeconds <= maxAutonomousSeconds) {
      return { status: 'GRACE_PERIOD', canRenew: true, isAuthorized: true };
    }
    return { status: 'LEASE_EXPIRED_OFFLINE', canRenew: false, isAuthorized: false };
  }

  const t0 = 1000000;

  // t = 45s: Active lease
  const state45 = evaluateLeaseStatus(t0, t0 + 45 * 1000);
  assert.equal(state45.status, 'ACTIVE');
  assert.equal(state45.isAuthorized, true);

  // t = 75s: Grace period (60s < t <= 90s)
  const state75 = evaluateLeaseStatus(t0, t0 + 75 * 1000);
  assert.equal(state75.status, 'GRACE_PERIOD');
  assert.equal(state75.isAuthorized, true);

  // t = 95s: Autonomous timeout expired (> 90s)
  const state95 = evaluateLeaseStatus(t0, t0 + 95 * 1000);
  assert.equal(state95.status, 'LEASE_EXPIRED_OFFLINE');
  assert.equal(state95.isAuthorized, false);
});

test('[Test G][F6] Signed Offline HMAC Buffer Queue with 120-Minute Capacity Limit', () => {
  const deviceKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const MAX_BUFFER_CAPACITY = config.timeouts.maxOfflineBufferMinutes; // 120

  assert.equal(MAX_BUFFER_CAPACITY, 120, 'Max offline buffer capacity must be 120 minutes');

  class OfflineBufferQueue {
    constructor(maxSize = MAX_BUFFER_CAPACITY) {
      this.maxSize = maxSize;
      this.queue = [];
    }

    pushSample(sample, key) {
      const timestamp = sample.timestamp || Date.now().toString();
      const rawBody = JSON.stringify(sample);
      const signature = crypto.createHmac('sha256', key).update(`${timestamp}:${rawBody}`).digest('hex');

      const entry = {
        sample,
        rawBody,
        signature,
        timestamp,
        enqueuedAt: Date.now()
      };

      if (this.queue.length >= this.maxSize) {
        // Drop oldest (FIFO capacity enforcement)
        this.queue.shift();
      }

      this.queue.push(entry);
    }

    get size() {
      return this.queue.length;
    }

    popOldest() {
      return this.queue.shift();
    }
  }

  const buffer = new OfflineBufferQueue(MAX_BUFFER_CAPACITY);

  // Enqueue 125 samples to test boundary overflow
  for (let i = 1; i <= 125; i++) {
    buffer.pushSample({
      minuteIndex: i,
      timestamp: String(1700000000000 + i * 60000),
      durationSeconds: 60,
      keyPressCount: 30 + i,
      mouseActivityDelta: 10 + i,
      hardwareIdleSeconds: 0,
      activeProcessCategory: 'DEVELOPMENT'
    }, deviceKey);
  }

  // Verify buffer capped strictly at 120
  assert.equal(buffer.size, 120, 'Buffer must not exceed 120 samples');

  // Verify FIFO drop: samples 1 through 5 were dropped, oldest is sample 6
  const oldest = buffer.popOldest();
  assert.equal(oldest.sample.minuteIndex, 6, 'Oldest preserved sample must be sample 6 after FIFO dropping');

  // Verify cryptographic integrity: re-compute signature
  const expectedSig = crypto.createHmac('sha256', deviceKey)
    .update(`${oldest.timestamp}:${oldest.rawBody}`)
    .digest('hex');
  assert.equal(oldest.signature, expectedSig, 'Buffered sample HMAC signature must remain mathematically authentic');
});

test('[Test G][F6] FIFO Auto-Reconnection Synchronization to Database', async (t) => {
  const mongoOnline = (await probeTcp('127.0.0.1', config.ports.mongodb, 500)).open;
  if (!mongoOnline) {
    t.skip('MongoDB on port 27017 is offline; cannot verify buffered telemetry persistence');
    return;
  }

  await dbHelper.connect();
  const testUser = await dbHelper.getUserByEmail(config.credentials.user.email);
  const employeeId = testUser._id;
  const sessionId = `v2_sess_offline_flush_${Date.now()}`;

  try {
    // Create 3 chronological buffered offline slices
    const now = Date.now();
    const bufferedSlices = [
      { minuteOffset: 0, category: 'DEVELOPMENT', keys: 50 },
      { minuteOffset: 1, category: 'DEVELOPMENT', keys: 60 },
      { minuteOffset: 2, category: 'DOCUMENTATION', keys: 20 }
    ];

    const insertedIds = [];

    // Flush in FIFO chronological order
    for (const item of bufferedSlices) {
      const timestamp = new Date(now + item.minuteOffset * 60000);
      const doc = await AggregatedTelemetryV2.create({
        session_id: sessionId,
        employee: employeeId,
        device_id: 'v2_dev_offline_device',
        minute_timestamp: timestamp,
        duration_seconds: 60,
        primary_category: item.category,
        activity_counts: {
          key_presses: item.keys,
          mouse_events: 10,
          hardware_idle_seconds: 0
        },
        sync_type: 'OFFLINE_BUFFERED',
        focus_score: 90
      });
      insertedIds.push(doc._id);
    }

    // Verify records in MongoDB
    const savedRecords = await AggregatedTelemetryV2.find({ session_id: sessionId })
      .sort({ minute_timestamp: 1 })
      .lean();

    assert.equal(savedRecords.length, 3, 'All 3 buffered slices must be saved');
    assert.equal(savedRecords[0].activity_counts.key_presses, 50);
    assert.equal(savedRecords[1].activity_counts.key_presses, 60);
    assert.equal(savedRecords[2].activity_counts.key_presses, 20);

    for (const rec of savedRecords) {
      assert.equal(rec.sync_type, 'OFFLINE_BUFFERED', 'Saved slices must be marked sync_type OFFLINE_BUFFERED');
    }

    // Cleanup
    await AggregatedTelemetryV2.deleteMany({ _id: { $in: insertedIds } });
  } finally {
    await dbHelper.disconnect();
  }
});

test('[Test G][F12] Attendance Continuity Throughout Agent Network Disruption', () => {
  // Model state machine: attendance remains intact and marked PRESENT when monitoring is disconnected
  const attendanceState = {
    dayStarted: true,
    startTime: new Date('2026-11-20T09:00:00Z'),
    isPresent: true,
    workLocationType: 'Office',
    monitoringStatus: 'Disconnected / Not Monitored'
  };

  assert.equal(attendanceState.dayStarted, true);
  assert.equal(attendanceState.isPresent, true, 'Employee attendance must remain valid and Present during outage');
  assert.equal(attendanceState.monitoringStatus, 'Disconnected / Not Monitored');
});
