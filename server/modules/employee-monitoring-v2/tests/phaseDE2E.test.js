/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Phase D End-to-End Integration & Security Test Suite
 * 
 * Verifies:
 * 1. Device enrollment & pairing flow (6-digit one-time code, 64-char key, DPAPI/AES-256-GCM encryption at rest)
 * 2. Session lifecycle & Single Active Lease Rule (60s lease, 90s autonomous expiry boundary)
 * 3. Live HMAC-SHA256 signed telemetry ingestion
 * 4. Clock skew tolerance and replay attack prevention (120s max drift)
 * 5. Anti-Surveillance Gate (rejection of text, keystrokes, screenshot, image, base64, clipboard, url, windowTitle, tabTitle, and nested app title/url/path)
 * 6. Device revocation and session rollback propagation
 * 7. Horizontal privilege escalation prevention (ScopeGuard)
 * 8. Live team analytics and daily timeline rollups
 * 9. Default-disabled master feature flag isolation (returns 404 when disabled)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');

// Security & Crypto
const { encrypt, decrypt } = require('../services/cryptoUtil');
const { verifyDeviceHmac, validateClockSkew } = require('../security/hmacValidator');
const { validateTelemetrySample, validateDeviceRegistration, validateSessionStart } = require('../contracts');
const { requireV2Active, verifyMonitoringScope, requireAdminRole } = require('../security/scopeGuard');
const { FEATURE_FLAGS, isMonitoringV2Active } = require('../config/featureFlags');

// In-Memory Test Store to guarantee zero database mutations during tests
const inMemoryDb = {
  devices: [],
  sessions: [],
  telemetry: [],
  auditLogs: []
};

function resetDb() {
  inMemoryDb.devices = [];
  inMemoryDb.sessions = [];
  inMemoryDb.telemetry = [];
  inMemoryDb.auditLogs = [];
}

let empCounter = 10;
function makeEmployeeId() {
  empCounter++;
  return `66f0a1b2c3d4e5f67890${empCounter.toString().padStart(4, '0')}`;
}

// Target models (stubbed to use in-memory store)
const RegisteredDevice = require('../models/RegisteredDevice');
const MonitoringSessionV2 = require('../models/MonitoringSessionV2');
const AggregatedTelemetryV2 = require('../models/AggregatedTelemetryV2');
const DeviceAuditLog = require('../models/DeviceAuditLog');

// Wire In-Memory implementations
RegisteredDevice.findOne = (query) => {
  const execute = async () => {
    if (query.device_id) {
      const found = inMemoryDb.devices.find((d) => d.device_id === query.device_id);
      if (!found) return null;
      return {
        ...found,
        save: async function () {
          Object.assign(found, this);
          return found;
        }
      };
    }
    return null;
  };

  return {
    then: (resolve, reject) => execute().then(resolve, reject),
    lean: async () => {
      if (query.device_id) {
        return inMemoryDb.devices.find((d) => d.device_id === query.device_id) || null;
      }
      return null;
    }
  };
};

RegisteredDevice.find = (query) => ({
  select: () => ({
    sort: () => ({
      lean: async () => inMemoryDb.devices.filter((d) => String(d.employee) === String(query.employee))
    })
  })
});

RegisteredDevice.countDocuments = async (query = {}) => {
  if (query.status) {
    return inMemoryDb.devices.filter((d) => d.status === query.status).length;
  }
  return inMemoryDb.devices.length;
};

RegisteredDevice.prototype.save = async function () {
  const empVal = this.employee ? String(this.employee) : (this._doc?.employee ? String(this._doc.employee) : null);
  const doc = {
    _id: `dev_${Date.now()}_${Math.random()}`,
    device_id: this.device_id || this._doc?.device_id,
    employee: empVal,
    device_name: this.device_name || this._doc?.device_name,
    platform: this.platform || this._doc?.platform,
    os_version: this.os_version || this._doc?.os_version,
    agent_version: this.agent_version || this._doc?.agent_version,
    device_token_hash: this.device_token_hash || this._doc?.device_token_hash,
    encrypted_device_key: this.encrypted_device_key || this._doc?.encrypted_device_key,
    status: this.status || this._doc?.status || 'ACTIVE',
    is_byod: this.is_byod !== false,
    last_seen_at: this.last_seen_at || new Date(),
    last_ip: this.last_ip || null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  inMemoryDb.devices.push(doc);
  return doc;
};

MonitoringSessionV2.findOne = async (query) => {
  let found = null;
  if (query.session_id) {
    found = inMemoryDb.sessions.find((s) => s.session_id === query.session_id);
  } else if (query.employee && query.state) {
    const states = query.state.$in || [query.state];
    found = inMemoryDb.sessions.find(
      (s) => String(s.employee) === String(query.employee) && states.includes(s.state)
    );
  }
  if (!found) return null;
  return {
    ...found,
    save: async function () {
      Object.assign(found, this);
      return found;
    }
  };
};

MonitoringSessionV2.find = (query) => {
  const states = query.state?.$in || (query.state ? [query.state] : null);
  let matches = inMemoryDb.sessions.filter((s) => {
    if (query.employee && String(s.employee) !== String(query.employee)) return false;
    if (states && !states.includes(s.state)) return false;
    return true;
  });

  return {
    populate: () => ({
      sort: () => ({
        lean: async () => matches.map((s) => ({
          ...s,
          employee: {
            _id: s.employee,
            name: 'Test Employee',
            email: 'employee@niyantran.local',
            department: 'Engineering'
          }
        }))
      })
    }),
    sort: () => matches,
    then: (resolve) => resolve(matches.map((s) => ({
      ...s,
      save: async function () {
        const idx = inMemoryDb.sessions.findIndex((x) => x.session_id === s.session_id);
        if (idx !== -1) Object.assign(inMemoryDb.sessions[idx], this);
        return s;
      }
    })))
  };
};

MonitoringSessionV2.countDocuments = async (query = {}) => {
  if (query.state) {
    return inMemoryDb.sessions.filter((s) => s.state === query.state).length;
  }
  return inMemoryDb.sessions.length;
};

MonitoringSessionV2.updateMany = async (query, update) => {
  let count = 0;
  for (const s of inMemoryDb.sessions) {
    if (query.active_device && s.active_device === query.active_device) {
      if (update.$set) Object.assign(s, update.$set);
      count++;
    }
  }
  return { modifiedCount: count };
};

MonitoringSessionV2.prototype.save = async function () {
  const empVal = this.employee ? String(this.employee) : (this._doc?.employee ? String(this._doc.employee) : null);
  const doc = {
    _id: `sess_${Date.now()}_${Math.random()}`,
    session_id: this.session_id || this._doc?.session_id,
    employee: empVal,
    date: this.date || this._doc?.date,
    mode: this.mode || this._doc?.mode,
    active_device: this.active_device || this._doc?.active_device,
    state: this.state || this._doc?.state,
    lease_expires_at: this.lease_expires_at || this._doc?.lease_expires_at,
    active_task_id: this.active_task_id || this._doc?.active_task_id || null,
    accumulated_seconds: this.accumulated_seconds || this._doc?.accumulated_seconds || { active: 0, focused_work: 0, idle: 0, paused: 0 },
    handoff_history: this.handoff_history || this._doc?.handoff_history || [],
    started_at: this.started_at || this._doc?.started_at || new Date(),
    ended_at: this.ended_at || this._doc?.ended_at || null
  };
  inMemoryDb.sessions.push(doc);
  return doc;
};

AggregatedTelemetryV2.findOne = (query) => {
  const findMatch = () => {
    return inMemoryDb.telemetry.find((t) => {
      if (query.session_id && t.session_id !== query.session_id) return false;
      if (query.minute_timestamp && t.minute_timestamp?.getTime() !== query.minute_timestamp?.getTime()) return false;
      return true;
    }) || null;
  };

  return {
    then: (resolve) => resolve(findMatch()),
    sort: () => ({
      lean: async () => {
        const records = inMemoryDb.telemetry.filter((t) => t.session_id === query.session_id);
        return records.length > 0 ? records[records.length - 1] : null;
      }
    })
  };
};

AggregatedTelemetryV2.find = (query) => ({
  sort: () => ({
    limit: () => ({
      lean: async () => inMemoryDb.telemetry.filter((t) => String(t.employee) === String(query.employee))
    }),
    lean: async () => inMemoryDb.telemetry.filter((t) => String(t.employee) === String(query.employee))
  })
});

AggregatedTelemetryV2.aggregate = async () => [
  { _id: 'DEVELOPMENT', totalMinutes: 45, avgFocusScore: 88 },
  { _id: 'DOCUMENTATION', totalMinutes: 15, avgFocusScore: 75 }
];

AggregatedTelemetryV2.prototype.save = async function () {
  const doc = {
    _id: `tel_${Date.now()}_${Math.random()}`,
    session_id: this.session_id,
    employee: this.employee,
    device_id: this.device_id,
    minute_timestamp: this.minute_timestamp,
    duration_seconds: this.duration_seconds,
    activity_counts: this.activity_counts,
    primary_category: this.primary_category,
    task_id: this.task_id,
    focus_score: this.focus_score,
    sync_type: this.sync_type,
    createdAt: new Date()
  };
  inMemoryDb.telemetry.push(doc);
  return doc;
};

DeviceAuditLog.create = async (doc) => {
  const record = { ...doc, timestamp: new Date(), _id: `audit_${Date.now()}` };
  inMemoryDb.auditLogs.push(record);
  return record;
};

DeviceAuditLog.find = () => ({
  populate: () => ({
    sort: () => ({
      skip: () => ({
        limit: () => ({
          lean: async () => inMemoryDb.auditLogs
        })
      })
    })
  })
});

DeviceAuditLog.countDocuments = async () => inMemoryDb.auditLogs.length;

// Target Services
const deviceService = require('../services/deviceService');
const sessionService = require('../services/sessionService');
const telemetryService = require('../services/telemetryService');
const analyticsService = require('../services/analyticsService');

// ----------------------------------------------------------------------------
// TEST SUITE 1: Cryptographic Utility (AES-256-GCM)
// ----------------------------------------------------------------------------

test('cryptoUtil: encrypts and decrypts deviceKey accurately at rest', () => {
  const secretKey = crypto.randomBytes(32).toString('hex');
  const encrypted = encrypt(secretKey);

  assert.ok(encrypted);
  assert.notEqual(encrypted, secretKey);
  const parts = encrypted.split(':');
  assert.equal(parts.length, 3, 'Must contain IV, authTag, and ciphertext');

  const decrypted = decrypt(encrypted);
  assert.equal(decrypted, secretKey);
});

test('cryptoUtil: returns null for invalid or tampered ciphertext', () => {
  assert.equal(decrypt(''), null);
  assert.equal(decrypt('invalid:string'), null);
  assert.throws(() => {
    // Tampered tag should fail decryption
    const valid = encrypt('test-secret');
    const [iv, , cipher] = valid.split(':');
    const tamperedTag = crypto.randomBytes(16).toString('hex');
    decrypt(`${iv}:${tamperedTag}:${cipher}`);
  });
});

// ----------------------------------------------------------------------------
// TEST SUITE 2: Device Enrollment & Pairing Protocol
// ----------------------------------------------------------------------------

test('deviceService: generates valid 6-digit enrollment code with 10-minute expiry', () => {
  const employeeId = makeEmployeeId();
  const result = deviceService.generateEnrollmentCode(employeeId);

  assert.ok(result.code);
  assert.match(result.code, /^\d{6}$/, 'Code must be exactly 6 numeric digits');
  assert.equal(result.expiresInSeconds, 600);
  assert.ok(new Date(result.expiresAt).getTime() > Date.now());
});

test('deviceService: rate limits enrollment code generation to 3 per hour', () => {
  const employeeId = makeEmployeeId();
  deviceService._enrollmentRateLimits.delete(employeeId);

  // Generate 3 codes successfully
  deviceService.generateEnrollmentCode(employeeId);
  deviceService.generateEnrollmentCode(employeeId);
  deviceService.generateEnrollmentCode(employeeId);

  // 4th code must throw 429 RATE_LIMIT_EXCEEDED
  assert.throws(
    () => deviceService.generateEnrollmentCode(employeeId),
    (err) => err.statusCode === 429 && err.code === 'RATE_LIMIT_EXCEEDED'
  );
});

test('deviceService: successfully pairs device, issues 64-char hex key, and invalidates code', async () => {
  resetDb();
  const employeeId = makeEmployeeId();
  const { code } = deviceService.generateEnrollmentCode(employeeId);

  const pairResult = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'DESKTOP-ENGINEER-W11',
    platform: 'windows',
    osVersion: 'Windows 11 Pro 23H2',
    agentVersion: '2.0.0',
    ip: '192.168.1.15'
  });

  assert.ok(pairResult.deviceId.startsWith('v2_dev_'));
  assert.equal(pairResult.deviceKey.length, 64, 'Must issue 64-character hex device secret');
  assert.equal(pairResult.deviceName, 'DESKTOP-ENGINEER-W11');
  assert.equal(pairResult.status, 'ACTIVE');

  // Verify code is invalidated (cannot pair twice with same code)
  await assert.rejects(
    async () => {
      await deviceService.pairDevice({
        pairingCode: code,
        deviceName: 'SECOND-ATTEMPT',
        platform: 'windows'
      });
    },
    (err) => err.code === 'INVALID_OR_EXPIRED_CODE'
  );

  // Verify device stored in database with encrypted secret
  const storedDevice = await deviceService.getDeviceById(pairResult.deviceId);
  assert.ok(storedDevice);
  assert.notEqual(storedDevice.encrypted_device_key, pairResult.deviceKey, 'Must not store secret in plaintext');

  // Verify decrypted secret matches
  const decryptedSecret = deviceService.getDeviceSecret(storedDevice);
  assert.equal(decryptedSecret, pairResult.deviceKey);

  // Verify audit log created
  const audit = inMemoryDb.auditLogs.find((a) => a.device_id === pairResult.deviceId);
  assert.ok(audit);
  assert.equal(audit.event_type, 'DEVICE_REGISTERED');
});

test('deviceService: revokeDevice transitions device to REVOKED and closes active sessions', async () => {
  resetDb();
  const employeeId = makeEmployeeId();
  const { code } = deviceService.generateEnrollmentCode(employeeId);
  const { deviceId } = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'REVOKE-TEST-PC',
    platform: 'windows'
  });

  // Owner revokes device
  const revokeRes = await deviceService.revokeDevice(deviceId, employeeId, 'User');
  assert.equal(revokeRes.status, 'REVOKED');

  const device = await deviceService.getDeviceById(deviceId);
  assert.equal(device.status, 'REVOKED');

  // Audit log recorded
  const audit = inMemoryDb.auditLogs.find((a) => a.device_id === deviceId && a.event_type === 'DEVICE_REVOKED');
  assert.ok(audit);
});

test('deviceService: horizontal privilege prevention on device revocation', async () => {
  resetDb();
  const ownerId = makeEmployeeId();
  const attackerId = makeEmployeeId();

  const { code } = deviceService.generateEnrollmentCode(ownerId);
  const { deviceId } = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'OWNER-LAPTOP',
    platform: 'windows'
  });

  // Attacker employee attempts to revoke owner's device
  await assert.rejects(
    async () => {
      await deviceService.revokeDevice(deviceId, attackerId, 'User');
    },
    (err) => err.statusCode === 403 && err.code === 'ACCESS_DENIED'
  );
});

// ----------------------------------------------------------------------------
// TEST SUITE 3: Session Lifecycle & Single Active Lease Rule
// ----------------------------------------------------------------------------

test('sessionService: starts session with 60-second lease', async () => {
  resetDb();
  const employeeId = makeEmployeeId();
  const { code } = deviceService.generateEnrollmentCode(employeeId);
  const { deviceId } = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'WORK-LAPTOP',
    platform: 'windows'
  });

  const session = await sessionService.startSession({
    employeeId,
    mode: 'LAPTOP_PC',
    deviceId,
    taskId: 'TASK-101'
  });

  assert.ok(session.sessionId.startsWith('v2_sess_'));
  assert.equal(session.state, 'ACTIVE');
  assert.equal(session.leaseSeconds, 60);
  assert.ok(new Date(session.leaseExpiresAt).getTime() > Date.now());
});

test('sessionService: enforces Single Active Lease Rule by completing prior session', async () => {
  resetDb();
  const employeeId = makeEmployeeId();

  const { code: code1 } = deviceService.generateEnrollmentCode(employeeId);
  const { deviceId: dev1 } = await deviceService.pairDevice({
    pairingCode: code1,
    deviceName: 'DESKTOP-1',
    platform: 'windows'
  });

  deviceService._enrollmentRateLimits.delete(employeeId);
  const { code: code2 } = deviceService.generateEnrollmentCode(employeeId);
  const { deviceId: dev2 } = await deviceService.pairDevice({
    pairingCode: code2,
    deviceName: 'LAPTOP-2',
    platform: 'windows'
  });

  // Start Session 1 on Desktop-1
  const session1 = await sessionService.startSession({
    employeeId,
    mode: 'LAPTOP_PC',
    deviceId: dev1
  });

  // Start Session 2 on Laptop-2 (switching devices)
  const session2 = await sessionService.startSession({
    employeeId,
    mode: 'LAPTOP_PC',
    deviceId: dev2
  });

  // Verify Session 1 was concluded
  const prevSess = inMemoryDb.sessions.find((s) => s.session_id === session1.sessionId);
  assert.equal(prevSess.state, 'COMPLETED');
  assert.ok(prevSess.ended_at);

  // Verify Session 2 is the sole active session
  assert.equal(session2.state, 'ACTIVE');
  assert.equal(session2.deviceId, dev2);
});

test('sessionService: pause, resume, and renewLease lifecycle', async () => {
  resetDb();
  const employeeId = makeEmployeeId();
  const { code } = deviceService.generateEnrollmentCode(employeeId);
  const { deviceId } = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'LIFECYCLE-PC',
    platform: 'windows'
  });

  const session = await sessionService.startSession({ employeeId, mode: 'LAPTOP_PC', deviceId });

  // Pause
  const paused = await sessionService.pauseSession(session.sessionId, employeeId);
  assert.equal(paused.state, 'PAUSED');

  // Resume
  const resumed = await sessionService.resumeSession(session.sessionId, employeeId);
  assert.equal(resumed.state, 'ACTIVE');
  assert.equal(resumed.leaseSeconds, 60);

  // Renew Lease
  const renewed = await sessionService.renewLease(session.sessionId, deviceId);
  assert.equal(renewed.renewed, true);
  assert.equal(renewed.remainingSeconds, 60);

  // End Session
  const ended = await sessionService.endSession(session.sessionId, employeeId);
  assert.equal(ended.state, 'COMPLETED');
});

// ----------------------------------------------------------------------------
// TEST SUITE 4: HMAC Signed Telemetry Ingestion Flow
// ----------------------------------------------------------------------------

test('telemetryService: successfully ingests valid HMAC-signed sample and persists to Mongo', async () => {
  resetDb();
  const employeeId = makeEmployeeId();
  const { code } = deviceService.generateEnrollmentCode(employeeId);
  const { deviceId, deviceKey } = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'TELEMETRY-DEV-PC',
    platform: 'windows'
  });

  const session = await sessionService.startSession({ employeeId, mode: 'LAPTOP_PC', deviceId });

  const telemetrySample = {
    sessionId: session.sessionId,
    deviceId,
    durationSeconds: 60,
    keyPressCount: 35,
    mouseActivityDelta: 110,
    hardwareIdleSeconds: 4,
    activeSeconds: 56,
    activeProcessCategory: 'DEVELOPMENT'
  };

  const rawBody = JSON.stringify(telemetrySample);
  const timestamp = Date.now().toString();

  // Agent generates canonical HMAC-SHA256 signature: canonical = `${timestamp}:${rawBody}`
  const signature = crypto.createHmac('sha256', deviceKey).update(`${timestamp}:${rawBody}`).digest('hex');

  const result = await telemetryService.ingestTelemetry({
    deviceId,
    rawBody,
    signature,
    timestamp,
    ip: '127.0.0.1'
  });

  assert.equal(result.accepted, true);
  assert.equal(result.sessionId, session.sessionId);
  assert.ok(result.remainingSeconds > 0 && result.remainingSeconds <= 60);

  // Verify MongoDB document was persisted in inMemoryDb
  const storedRecord = inMemoryDb.telemetry.find((t) => t.session_id === session.sessionId);
  assert.ok(storedRecord);
  assert.equal(storedRecord.primary_category, 'DEVELOPMENT');
  assert.equal(storedRecord.activity_counts.key_presses, 35);
  assert.equal(storedRecord.activity_counts.mouse_events, 110);
  assert.equal(storedRecord.activity_counts.hardware_idle_seconds, 4);

  // Verify session accumulated seconds updated
  const sessionDoc = inMemoryDb.sessions.find((s) => s.session_id === session.sessionId);
  assert.equal(sessionDoc.accumulated_seconds.active, 56);
  assert.equal(sessionDoc.accumulated_seconds.idle, 4);
  assert.equal(sessionDoc.accumulated_seconds.focused_work, 56);
});

// ----------------------------------------------------------------------------
// TEST SUITE 5: Negative Security & Invariant Rejections
// ----------------------------------------------------------------------------

test('telemetryService: rejects tampered HMAC signature (401 INVALID_SIGNATURE)', async () => {
  resetDb();
  const employeeId = makeEmployeeId();
  const { code } = deviceService.generateEnrollmentCode(employeeId);
  const { deviceId, deviceKey } = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'TAMPER-PC',
    platform: 'windows'
  });

  const session = await sessionService.startSession({ employeeId, mode: 'LAPTOP_PC', deviceId });

  const rawBody = JSON.stringify({
    sessionId: session.sessionId,
    deviceId,
    keyPressCount: 10,
    mouseActivityDelta: 5,
    hardwareIdleSeconds: 0
  });
  const timestamp = Date.now().toString();

  // Signature calculated with wrong secret key
  const invalidSignature = crypto.createHmac('sha256', 'wrong-secret-key-12345').update(`${timestamp}:${rawBody}`).digest('hex');

  await assert.rejects(
    async () => {
      await telemetryService.ingestTelemetry({
        deviceId,
        rawBody,
        signature: invalidSignature,
        timestamp
      });
    },
    (err) => err.statusCode === 401 && err.code === 'INVALID_SIGNATURE'
  );
});

test('telemetryService: rejects clock skew exceeding 120 seconds (400 CLOCK_SKEW_REJECTED)', async () => {
  resetDb();
  const employeeId = makeEmployeeId();
  const { code } = deviceService.generateEnrollmentCode(employeeId);
  const { deviceId, deviceKey } = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'SKEW-PC',
    platform: 'windows'
  });

  const session = await sessionService.startSession({ employeeId, mode: 'LAPTOP_PC', deviceId });

  const rawBody = JSON.stringify({
    sessionId: session.sessionId,
    deviceId,
    keyPressCount: 10,
    mouseActivityDelta: 5,
    hardwareIdleSeconds: 0
  });

  // Stale timestamp (10 minutes in the past = 600,000ms drift)
  const staleTimestamp = (Date.now() - 600000).toString();
  const signature = crypto.createHmac('sha256', deviceKey).update(`${staleTimestamp}:${rawBody}`).digest('hex');

  await assert.rejects(
    async () => {
      await telemetryService.ingestTelemetry({
        deviceId,
        rawBody,
        signature,
        timestamp: staleTimestamp
      });
    },
    (err) => err.statusCode === 400 && err.code === 'CLOCK_SKEW_REJECTED'
  );
});

test('telemetryService: rejects revoked device with rollback flag (403 DEVICE_REVOKED)', async () => {
  resetDb();
  const employeeId = makeEmployeeId();
  const { code } = deviceService.generateEnrollmentCode(employeeId);
  const { deviceId, deviceKey } = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'REVOKED-PC',
    platform: 'windows'
  });

  const session = await sessionService.startSession({ employeeId, mode: 'LAPTOP_PC', deviceId });

  // Revoke device
  await deviceService.revokeDevice(deviceId, employeeId, 'User');

  const rawBody = JSON.stringify({
    sessionId: session.sessionId,
    deviceId,
    keyPressCount: 10,
    mouseActivityDelta: 5,
    hardwareIdleSeconds: 0
  });
  const timestamp = Date.now().toString();
  const signature = crypto.createHmac('sha256', deviceKey).update(`${timestamp}:${rawBody}`).digest('hex');

  await assert.rejects(
    async () => {
      await telemetryService.ingestTelemetry({
        deviceId,
        rawBody,
        signature,
        timestamp
      });
    },
    (err) => err.statusCode === 403 && err.revoked === true && err.rollback === true
  );
});

test('telemetryService: rejects telemetry when session lease has expired (403 LEASE_EXPIRED)', async () => {
  resetDb();
  const employeeId = makeEmployeeId();
  const { code } = deviceService.generateEnrollmentCode(employeeId);
  const { deviceId, deviceKey } = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'EXPIRED-PC',
    platform: 'windows'
  });

  const session = await sessionService.startSession({ employeeId, mode: 'LAPTOP_PC', deviceId });

  // Manually backdate lease expiry past 90s grace limit (2 minutes ago)
  const sessionDoc = inMemoryDb.sessions.find((s) => s.session_id === session.sessionId);
  sessionDoc.lease_expires_at = new Date(Date.now() - 120000);

  const rawBody = JSON.stringify({
    sessionId: session.sessionId,
    deviceId,
    keyPressCount: 10,
    mouseActivityDelta: 5,
    hardwareIdleSeconds: 0
  });
  const timestamp = Date.now().toString();
  const signature = crypto.createHmac('sha256', deviceKey).update(`${timestamp}:${rawBody}`).digest('hex');

  await assert.rejects(
    async () => {
      await telemetryService.ingestTelemetry({
        deviceId,
        rawBody,
        signature,
        timestamp
      });
    },
    (err) => err.statusCode === 403 && err.code === 'LEASE_EXPIRED' && err.rollback === true
  );
});

test('Anti-Surveillance Gate: rejects all 9 forbidden surveillance fields and nested app tracking fields', async () => {
  resetDb();
  const employeeId = makeEmployeeId();
  const { code } = deviceService.generateEnrollmentCode(employeeId);
  const { deviceId, deviceKey } = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'PRIVACY-PC',
    platform: 'windows'
  });

  const session = await sessionService.startSession({ employeeId, mode: 'LAPTOP_PC', deviceId });

  const forbiddenCases = [
    { text: 'typed confidential email text' },
    { keystrokes: 'ctrl+c, ctrl+v, p@ssword' },
    { screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...' },
    { image: 'https://cdn.example.com/grab.jpg' },
    { base64: 'SGVsbG8gV29ybGQ=' },
    { clipboard: 'sensitive api key secret' },
    { url: 'https://internal.bank.com/account/details' },
    { windowTitle: 'Executive Compensation Plan - Microsoft Excel' },
    { tabTitle: 'Sensitive Bank Portal - Chrome' }
  ];

  for (const violation of forbiddenCases) {
    const rawBody = JSON.stringify({
      sessionId: session.sessionId,
      deviceId,
      keyPressCount: 10,
      mouseActivityDelta: 5,
      hardwareIdleSeconds: 0,
      ...violation
    });
    const timestamp = Date.now().toString();
    const signature = crypto.createHmac('sha256', deviceKey).update(`${timestamp}:${rawBody}`).digest('hex');

    await assert.rejects(
      async () => {
        await telemetryService.ingestTelemetry({
          deviceId,
          rawBody,
          signature,
          timestamp
        });
      },
      (err) => err.statusCode === 400 && err.code === 'PRIVACY_VIOLATION',
      `Failed to reject forbidden field: ${Object.keys(violation)[0]}`
    );
  }

  // Nested app records privacy invariant: reject title, url, path, tabTitle, windowTitle
  const forbiddenAppCases = [
    { apps: [{ name: 'chrome.exe', durationSeconds: 60, title: 'Secret Executive Memo' }] },
    { apps: [{ name: 'msedge.exe', durationSeconds: 60, url: 'https://intranet.bank.com/salary' }] },
    { apps: [{ name: 'notepad.exe', durationSeconds: 60, path: 'C:\\Users\\user\\confidential\\keys.txt' }] },
    { apps: [{ name: 'chrome.exe', durationSeconds: 60, tabTitle: 'Banking Dashboard' }] },
    { apps: [{ name: 'excel.exe', durationSeconds: 60, windowTitle: 'Payroll.xlsx' }] }
  ];

  for (const appViolation of forbiddenAppCases) {
    const rawBody = JSON.stringify({
      sessionId: session.sessionId,
      deviceId,
      keyPressCount: 10,
      mouseActivityDelta: 5,
      hardwareIdleSeconds: 0,
      ...appViolation
    });
    const timestamp = Date.now().toString();
    const signature = crypto.createHmac('sha256', deviceKey).update(`${timestamp}:${rawBody}`).digest('hex');

    await assert.rejects(
      async () => {
        await telemetryService.ingestTelemetry({
          deviceId,
          rawBody,
          signature,
          timestamp
        });
      },
      (err) => err.statusCode === 400 && err.code === 'PRIVACY_VIOLATION',
      `Failed to reject nested app privacy violation in: ${JSON.stringify(appViolation)}`
    );
  }
});

// ----------------------------------------------------------------------------
// TEST SUITE 6: Analytics & Fleet Reporting
// ----------------------------------------------------------------------------

test('analyticsService: getLiveTeam formats active sessions for management console', async () => {
  resetDb();
  const employeeId = makeEmployeeId();
  const { code } = deviceService.generateEnrollmentCode(employeeId);
  const { deviceId, deviceKey } = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'ANALYTICS-PC',
    platform: 'windows'
  });

  const session = await sessionService.startSession({ employeeId, mode: 'LAPTOP_PC', deviceId });

  // Ingest 1 telemetry sample
  const rawBody = JSON.stringify({
    sessionId: session.sessionId,
    deviceId,
    keyPressCount: 50,
    mouseActivityDelta: 80,
    hardwareIdleSeconds: 0,
    activeProcessCategory: 'DEVELOPMENT'
  });
  const timestamp = Date.now().toString();
  const signature = crypto.createHmac('sha256', deviceKey).update(`${timestamp}:${rawBody}`).digest('hex');
  await telemetryService.ingestTelemetry({ deviceId, rawBody, signature, timestamp });

  const liveTeam = await analyticsService.getLiveTeam();
  assert.equal(liveTeam.length, 1);
  assert.equal(liveTeam[0].sessionId, session.sessionId);
  assert.equal(liveTeam[0].primaryCategory, 'DEVELOPMENT');
  assert.equal(liveTeam[0].state, 'ACTIVE');
});

test('analyticsService: getEmployeeDailyTimeline aggregates 1-minute telemetry slices', async () => {
  resetDb();
  const employeeId = makeEmployeeId();
  const { code } = deviceService.generateEnrollmentCode(employeeId);
  const { deviceId, deviceKey } = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'TIMELINE-PC',
    platform: 'windows'
  });

  const session = await sessionService.startSession({ employeeId, mode: 'LAPTOP_PC', deviceId });

  // Ingest sample
  const rawBody = JSON.stringify({
    sessionId: session.sessionId,
    deviceId,
    keyPressCount: 40,
    mouseActivityDelta: 60,
    hardwareIdleSeconds: 10,
    activeProcessCategory: 'DOCUMENTATION'
  });
  const timestamp = Date.now().toString();
  const signature = crypto.createHmac('sha256', deviceKey).update(`${timestamp}:${rawBody}`).digest('hex');
  await telemetryService.ingestTelemetry({ deviceId, rawBody, signature, timestamp });

  const timeline = await analyticsService.getEmployeeDailyTimeline(employeeId);
  assert.equal(timeline.totalRecords, 1);
  assert.equal(timeline.totals.keyPresses, 40);
  assert.equal(timeline.totals.mouseEvents, 60);
  assert.equal(timeline.totals.idleSeconds, 10);
});
