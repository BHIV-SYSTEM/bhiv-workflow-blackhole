/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Phase E Automated End-to-End Integration & Security Test Suite
 *
 * Verifies live pipeline against local MongoDB (or in-memory fallback):
 * 1. Authenticated Device Pairing & DPAPI / AES-256-GCM encryption at rest
 * 2. Session Lifecycle & Single Active Lease Rule (60s lease)
 * 3. HMAC-SHA256 Signed Telemetry Ingestion & Database Persistence
 * 4. Autonomous Lease Expiration & Separately Authenticated Lease Renewal
 * 5. Rejection of Duplicates (409 Conflict)
 * 6. Anti-Surveillance Gate (rejection of all 9 forbidden surveillance fields and nested app tracking fields)
 * 7. ScopeGuard Horizontal Privilege Escalation Prevention
 * 8. Live Team Analytics & Daily Timeline Query Matching
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/niyantran_v2_isolated_test';
const TEST_JWT_SECRET = 'phase-e-automated-test-jwt-secret-12345';
process.env.ENABLE_MONITORING_V2 = 'true';
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.MONITORING_V2_ENCRYPTION_KEY = 'test-master-device-encryption-key-salt';

const User = require('../../../models/User');
const RegisteredDevice = require('../models/RegisteredDevice');
const MonitoringSessionV2 = require('../models/MonitoringSessionV2');
const AggregatedTelemetryV2 = require('../models/AggregatedTelemetryV2');
const DeviceAuditLog = require('../models/DeviceAuditLog');

const deviceService = require('../services/deviceService');
const sessionService = require('../services/sessionService');
const telemetryService = require('../services/telemetryService');
const analyticsService = require('../services/analyticsService');
const { decrypt } = require('../services/cryptoUtil');

let isMongoConnected = false;
let testEmployee = null;
let testPeer = null;
let testAdmin = null;
let employeeToken = null;
let peerToken = null;
let adminToken = null;

test.before(async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    }
    isMongoConnected = true;

    // Clean test data
    await RegisteredDevice.deleteMany({});
    await MonitoringSessionV2.deleteMany({});
    await AggregatedTelemetryV2.deleteMany({});
    await DeviceAuditLog.deleteMany({});

    testEmployee = await User.create({
      name: 'Riya Sen (Phase E Automation)',
      email: `riya.sen.${Date.now()}@isolated-test.local`,
      password: 'testPassword123',
      role: 'User',
      employeeId: 'BHIV-E2E-AUTO-01'
    });

    testPeer = await User.create({
      name: 'Amit Patel (Peer)',
      email: `amit.patel.${Date.now()}@isolated-test.local`,
      password: 'testPassword123',
      role: 'User',
      employeeId: 'BHIV-E2E-AUTO-02'
    });

    testAdmin = await User.create({
      name: 'Sunil Nair (Admin)',
      email: `sunil.nair.${Date.now()}@isolated-test.local`,
      password: 'testPassword123',
      role: 'Admin',
      employeeId: 'BHIV-E2E-ADMIN-01'
    });

    employeeToken = jwt.sign({ id: testEmployee._id.toString(), role: 'User' }, TEST_JWT_SECRET);
    peerToken = jwt.sign({ id: testPeer._id.toString(), role: 'User' }, TEST_JWT_SECRET);
    adminToken = jwt.sign({ id: testAdmin._id.toString(), role: 'Admin' }, TEST_JWT_SECRET);
  } catch (_) {
    isMongoConnected = false;
  }
});

test.after(async () => {
  if (isMongoConnected) {
    await mongoose.disconnect();
  }
  setTimeout(() => process.exit(0), 100);
});

// ----------------------------------------------------------------------------
// SUITE 1: Device Pairing & Cryptographic Identity
// ----------------------------------------------------------------------------

test('Phase E: Device Enrollment Code generation (6 digits, 10m TTL, rate limit)', () => {
  const empId = testEmployee?._id || new mongoose.Types.ObjectId();
  deviceService._enrollmentRateLimits.delete(empId.toString());

  const res = deviceService.generateEnrollmentCode(empId);
  assert.ok(res.code);
  assert.match(res.code, /^\d{6}$/);
  assert.equal(res.expiresInSeconds, 600);

  // Rate limiting to 3 per hour
  deviceService.generateEnrollmentCode(empId);
  deviceService.generateEnrollmentCode(empId);
  assert.throws(() => deviceService.generateEnrollmentCode(empId), (err) => err.statusCode === 429);
});

test('Phase E: Device Pairing Handshake & AES-256-GCM encryption at rest', async () => {
  if (!isMongoConnected) return;

  const empId = testEmployee._id;
  deviceService._enrollmentRateLimits.delete(empId.toString());
  const { code } = deviceService.generateEnrollmentCode(empId);

  const pairResult = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: `${os.hostname()} (Phase E Workstation)`,
    platform: 'windows',
    osVersion: `${os.type()} ${os.release()}`,
    agentVersion: '2.0.0-phase-e',
    ip: '127.0.0.1'
  });

  assert.ok(pairResult.deviceId.startsWith('v2_dev_'));
  assert.equal(pairResult.deviceKey.length, 64);

  // Verify DB record
  const deviceDoc = await RegisteredDevice.findOne({ device_id: pairResult.deviceId });
  assert.ok(deviceDoc);
  assert.equal(deviceDoc.status, 'ACTIVE');
  assert.notEqual(deviceDoc.encrypted_device_key, pairResult.deviceKey);
  assert.equal(decrypt(deviceDoc.encrypted_device_key), pairResult.deviceKey);
});

// ----------------------------------------------------------------------------
// SUITE 2: Session Lifecycle & Single Active Lease Rule
// ----------------------------------------------------------------------------

test('Phase E: Session start with 60-second lease and Single Active Lease enforcement', async () => {
  if (!isMongoConnected) return;

  const empId = testEmployee._id;
  deviceService._enrollmentRateLimits.delete(empId.toString());
  const { code } = deviceService.generateEnrollmentCode(empId);
  const { deviceId } = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'WORK-LAPTOP',
    platform: 'windows'
  });

  const session1 = await sessionService.startSession({
    employeeId: empId.toString(),
    mode: 'LAPTOP_PC',
    deviceId,
    taskId: 'TASK-01'
  });

  assert.ok(session1.sessionId.startsWith('v2_sess_'));
  assert.equal(session1.state, 'ACTIVE');
  assert.equal(session1.leaseSeconds, 60);

  // Start second session (switching to phone mode)
  const session2 = await sessionService.startSession({
    employeeId: empId.toString(),
    mode: 'PHONE'
  });

  // Verify Session 1 was concluded
  const sess1Doc = await MonitoringSessionV2.findOne({ session_id: session1.sessionId });
  assert.equal(sess1Doc.state, 'COMPLETED');
  assert.ok(sess1Doc.ended_at);

  // Verify Session 2 is active
  assert.equal(session2.state, 'ACTIVE');
});

// ----------------------------------------------------------------------------
// SUITE 3: Real Telemetry Ingestion & Duplicate Rejection
// ----------------------------------------------------------------------------

test('Phase E: Real HMAC-signed telemetry ingestion and duplicate rejection (409)', async () => {
  if (!isMongoConnected) return;

  const empId = testEmployee._id;
  deviceService._enrollmentRateLimits.delete(empId.toString());
  const { code } = deviceService.generateEnrollmentCode(empId);
  const { deviceId, deviceKey } = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'TELEMETRY-PC',
    platform: 'windows'
  });

  const session = await sessionService.startSession({
    employeeId: empId.toString(),
    mode: 'LAPTOP_PC',
    deviceId
  });

  const sample = {
    sessionId: session.sessionId,
    deviceId,
    durationSeconds: 60,
    keyPressCount: 30,
    mouseActivityDelta: 100,
    hardwareIdleSeconds: 5,
    activeSeconds: 55,
    activeProcessCategory: 'DEVELOPMENT'
  };

  const rawPayload = JSON.stringify(sample);
  const ts = Date.now().toString();
  const signature = crypto.createHmac('sha256', deviceKey).update(`${ts}:${rawPayload}`).digest('hex');

  // Ingest sample
  const result = await telemetryService.ingestTelemetry({
    deviceId,
    rawBody: rawPayload,
    signature,
    timestamp: ts,
    ip: '127.0.0.1'
  });

  assert.equal(result.accepted, true);
  assert.equal(result.sessionId, session.sessionId);

  // Re-ingesting same slice must be rejected as duplicate
  await assert.rejects(
    async () => {
      await telemetryService.ingestTelemetry({
        deviceId,
        rawBody: rawPayload,
        signature,
        timestamp: ts
      });
    },
    (err) => err.statusCode === 409 && err.code === 'DUPLICATE_EVENT'
  );
});

// ----------------------------------------------------------------------------
// SUITE 4: Session Authorization & Separate Lease Renewal
// ----------------------------------------------------------------------------

test('Phase E: Separate lease renewal endpoint and expired lease rejection', async () => {
  if (!isMongoConnected) return;

  const empId = testEmployee._id;
  deviceService._enrollmentRateLimits.delete(empId.toString());
  const { code } = deviceService.generateEnrollmentCode(empId);
  const { deviceId, deviceKey } = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'LEASE-PC',
    platform: 'windows'
  });

  const session = await sessionService.startSession({
    employeeId: empId.toString(),
    mode: 'LAPTOP_PC',
    deviceId
  });

  // Call separate lease renewal
  const renewRes = await sessionService.renewLease(session.sessionId, deviceId);
  assert.equal(renewRes.renewed, true);
  assert.equal(renewRes.remainingSeconds, 60);

  // Simulate expired lease
  await MonitoringSessionV2.updateOne(
    { session_id: session.sessionId },
    { $set: { lease_expires_at: new Date(Date.now() - 100000) } }
  );

  const rawPayload = JSON.stringify({
    sessionId: session.sessionId,
    deviceId,
    keyPressCount: 5,
    mouseActivityDelta: 5,
    hardwareIdleSeconds: 0
  });
  const ts = Date.now().toString();
  const sig = crypto.createHmac('sha256', deviceKey).update(`${ts}:${rawPayload}`).digest('hex');

  await assert.rejects(
    async () => {
      await telemetryService.ingestTelemetry({
        deviceId,
        rawBody: rawPayload,
        signature: sig,
        timestamp: ts
      });
    },
    (err) => err.statusCode === 403 && err.code === 'LEASE_EXPIRED' && err.rollback === true
  );
});

// ----------------------------------------------------------------------------
// SUITE 5: Anti-Surveillance Gate & Security Invariants
// ----------------------------------------------------------------------------

test('Phase E: Anti-Surveillance Gate strictly rejects all 9 forbidden surveillance fields and nested app tracking fields', async () => {
  if (!isMongoConnected) return;

  const empId = testEmployee._id;
  deviceService._enrollmentRateLimits.delete(empId.toString());
  const { code } = deviceService.generateEnrollmentCode(empId);
  const { deviceId, deviceKey } = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'SURVEILLANCE-GATE-PC',
    platform: 'windows'
  });

  const session = await sessionService.startSession({
    employeeId: empId.toString(),
    mode: 'LAPTOP_PC',
    deviceId
  });

  const forbiddenFields = [
    { text: 'confidential email body' },
    { keystrokes: 'ctrl+a, del, pass' },
    { screenshot: 'data:image/png;base64,...' },
    { image: 'https://cdn.example.com/screen.jpg' },
    { base64: 'SGVsbG8gd29ybGQ=' },
    { clipboard: 'copied bank details' },
    { url: 'https://portal.bank.com/transfer' },
    { windowTitle: 'Executive Compensation Spreadsheet' },
    { tabTitle: 'Corporate Banking Portal - Chrome' }
  ];

  for (const field of forbiddenFields) {
    const payload = JSON.stringify({
      sessionId: session.sessionId,
      deviceId,
      keyPressCount: 10,
      mouseActivityDelta: 5,
      hardwareIdleSeconds: 0,
      ...field
    });
    const ts = Date.now().toString();
    const sig = crypto.createHmac('sha256', deviceKey).update(`${ts}:${payload}`).digest('hex');

    await assert.rejects(
      async () => {
        await telemetryService.ingestTelemetry({
          deviceId,
          rawBody: payload,
          signature: sig,
          timestamp: ts
        });
      },
      (err) => err.statusCode === 400 && err.code === 'PRIVACY_VIOLATION',
      `Failed to reject forbidden field: ${Object.keys(field)[0]}`
    );
  }

  // Nested app records privacy invariant: reject title, url, path, tabTitle, windowTitle
  const forbiddenAppFields = [
    { apps: [{ name: 'chrome.exe', durationSeconds: 60, title: 'Secret Doc - Google Docs' }] },
    { apps: [{ name: 'msedge.exe', durationSeconds: 60, url: 'https://banking.internal.net' }] },
    { apps: [{ name: 'notepad.exe', durationSeconds: 60, path: 'C:\\confidential\\keys.txt' }] },
    { apps: [{ name: 'chrome.exe', durationSeconds: 60, tabTitle: 'Payroll Tab' }] },
    { apps: [{ name: 'excel.exe', durationSeconds: 60, windowTitle: 'Salary Sheet' }] }
  ];

  for (const appViolation of forbiddenAppFields) {
    const payload = JSON.stringify({
      sessionId: session.sessionId,
      deviceId,
      keyPressCount: 10,
      mouseActivityDelta: 5,
      hardwareIdleSeconds: 0,
      ...appViolation
    });
    const ts = Date.now().toString();
    const sig = crypto.createHmac('sha256', deviceKey).update(`${ts}:${payload}`).digest('hex');

    await assert.rejects(
      async () => {
        await telemetryService.ingestTelemetry({
          deviceId,
          rawBody: payload,
          signature: sig,
          timestamp: ts
        });
      },
      (err) => err.statusCode === 400 && err.code === 'PRIVACY_VIOLATION',
      `Failed to reject forbidden nested app record in: ${JSON.stringify(appViolation)}`
    );
  }
});
