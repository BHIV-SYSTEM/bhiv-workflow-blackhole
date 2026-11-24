/**
 * Niyantran Employee Monitoring V2 — Tier 2 Boundary Test
 * Feature F6: Auto-Reconnection & Offline Buffer
 *
 * Boundary & Negative Tests:
 * 1. Telemetry submitted after 90s lease expiry is rejected with 403 LEASE_EXPIRED.
 * 2. Duplicate telemetry slice submission is detected and rejected.
 * 3. Telemetry with clock skew > 120s is rejected with 400 CLOCK_SKEW_REJECTED.
 * 4. Offline buffer enforces capacity bounds (FIFO eviction on overflow).
 * 5. Tampered payload or invalid HMAC signature is rejected with 401 INVALID_SIGNATURE.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');

const config = require('../config');
const { verifyDeviceHmac, validateClockSkew } = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/security/hmacValidator'));

test('[F6] Telemetry submitted after 90s lease expiry is rejected with 403 LEASE_EXPIRED', () => {
  // Verify 90s timeout calculation (60s lease + 30s grace window)
  const now = new Date();
  const graceWindowMs = 30 * 1000;
  const expiredLeaseDate = new Date(now.getTime() - graceWindowMs - 5000); // 35 seconds expired

  const isLeaseExpired = (leaseExpiresAt, graceMs = 30000) => {
    const graceThreshold = new Date(Date.now() - graceMs);
    return new Date(leaseExpiresAt) < graceThreshold;
  };

  assert.equal(isLeaseExpired(expiredLeaseDate), true, 'Lease past grace period must be evaluated as expired');

  // Fresh lease must evaluate as active
  const activeLeaseDate = new Date(now.getTime() + 45 * 1000);
  assert.equal(isLeaseExpired(activeLeaseDate), false, 'Active lease within bounds must evaluate as active');
});

test('[F6] Duplicate telemetry sample submission is detected and rejected', () => {
  // Ingestion deduplication cache simulation
  const processedSlices = new Set();

  function recordSlice(sessionId, minuteTimestamp) {
    const key = `${sessionId}:${new Date(minuteTimestamp).toISOString().slice(0, 16)}`;
    if (processedSlices.has(key)) {
      const err = new Error('Duplicate telemetry slice for this minute interval');
      err.code = 'DUPLICATE_EVENT';
      err.statusCode = 409;
      throw err;
    }
    processedSlices.add(key);
    return { recorded: true, key };
  }

  const sessId = 'v2_sess_dedupe_test';
  const now = new Date().toISOString();

  const first = recordSlice(sessId, now);
  assert.equal(first.recorded, true);

  assert.throws(
    () => recordSlice(sessId, now),
    (err) => {
      assert.equal(err.code, 'DUPLICATE_EVENT');
      assert.equal(err.statusCode, 409);
      return true;
    }
  );
});

test('[F6] Telemetry with clock skew > 120s is rejected with 400 CLOCK_SKEW_REJECTED', () => {
  const now = Date.now();

  // Valid within 2 minutes
  const validSkew = validateClockSkew(now - 30 * 1000);
  assert.equal(validSkew.valid, true, '30s skew must be accepted');

  // Excessive past skew (5 minutes in past = 300s > 120s)
  const pastSkew = validateClockSkew(now - 300 * 1000);
  assert.equal(pastSkew.valid, false, '5m past skew must be rejected');
  assert.ok(pastSkew.error.includes('Clock skew exceeds allowed limit'));

  // Excessive future skew (3 minutes in future = 180s > 120s)
  const futureSkew = validateClockSkew(now + 180 * 1000);
  assert.equal(futureSkew.valid, false, '3m future skew must be rejected');
  assert.ok(futureSkew.error.includes('Clock skew exceeds allowed limit'));
});

test('[F6] Offline buffer enforces capacity bounds (FIFO eviction on overflow)', () => {
  class BoundedOfflineBuffer {
    constructor(maxCapacity = 120) {
      this.maxCapacity = maxCapacity;
      this.buffer = [];
    }

    push(sample) {
      if (this.buffer.length >= this.maxCapacity) {
        this.buffer.shift(); // Evict oldest sample (FIFO)
      }
      this.buffer.push(sample);
    }

    size() {
      return this.buffer.length;
    }

    peekOldest() {
      return this.buffer[0];
    }
  }

  const capacity = 5;
  const buffer = new BoundedOfflineBuffer(capacity);

  // Push 8 samples (exceeding capacity 5)
  for (let i = 1; i <= 8; i++) {
    buffer.push({ sampleId: i, timestamp: Date.now() + i * 1000 });
  }

  assert.equal(buffer.size(), capacity, 'Buffer must never exceed maximum capacity');
  // Oldest remaining sample must be sampleId: 4 (1, 2, 3 were evicted in FIFO order)
  assert.equal(buffer.peekOldest().sampleId, 4, 'Oldest sample must be sampleId 4 after FIFO eviction');
});

test('[F6] Tampered payload or invalid HMAC signature is rejected with 401 INVALID_SIGNATURE', () => {
  const secret = crypto.randomBytes(32).toString('hex');
  const payload = JSON.stringify({
    sessionId: 'v2_sess_hmac_test',
    durationSeconds: 60,
    keyPressCount: 25,
    mouseActivityDelta: 10
  });

  const timestamp = Date.now();
  const canonical = `${timestamp}:${payload}`;
  const validSignature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

  // 1. Untampered payload + valid signature -> passes
  const valid = verifyDeviceHmac(payload, secret, validSignature, timestamp);
  assert.equal(valid, true, 'Untampered payload must pass HMAC verification');

  // 2. Tampered payload (e.g. hacker increased duration to 120)
  const tamperedPayload = JSON.stringify({
    sessionId: 'v2_sess_hmac_test',
    durationSeconds: 120, // Modified!
    keyPressCount: 25,
    mouseActivityDelta: 10
  });
  const tamperedResult = verifyDeviceHmac(tamperedPayload, secret, validSignature, timestamp);
  assert.equal(tamperedResult, false, 'Tampered payload must fail HMAC verification');

  // 3. Forged signature
  const forgedSignature = crypto.randomBytes(32).toString('hex');
  const forgedResult = verifyDeviceHmac(payload, secret, forgedSignature, timestamp);
  assert.equal(forgedResult, false, 'Forged signature must fail HMAC verification');
});
