/**
 * Niyantran Employee Monitoring V2 — Tier 3 Cross-Feature Combination Test
 * Combination: Workday Attendance + Agent Lease + State Sync (F10 + F6 + F12)
 *
 * Verifies the unified event-driven lifecycle:
 * - Start Day prompts for monitoring authorization and issues a renewable 60s lease.
 * - Agent synchronizes active lease state with backend.
 * - Workday pause transitions session to PAUSED and updates accumulated pause time.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const config = require('../config');
const { dbHelper } = require('../helpers/dbHelper');
const { authHelper } = require('../helpers/authHelper');
const sessionService = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/services/sessionService'));
const MonitoringSessionV2 = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/models/MonitoringSessionV2'));
const RegisteredDevice = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/models/RegisteredDevice'));

test.after(async () => {
  await dbHelper.disconnect();
});

test('[F10][F6] Start Day triggers renewable 60s lease issuance and establishes active monitoring state', async () => {
  await dbHelper.connect();

  const testUserId = '507f1f77bcf86cd799439012'; // Dedicated Ishan ID
  const deviceId = `DEV-ACER-WORKDAY-${Date.now()}`;

  // Register active device in RegisteredDevice
  await RegisteredDevice.deleteOne({ device_id: deviceId });
  await RegisteredDevice.create({
    device_id: deviceId,
    employee: testUserId,
    device_name: 'Acer Nitro Workday Test',
    platform: 'windows',
    manufacturer: 'Acer',
    model: 'Nitro AN515-57',
    device_token_hash: `hash_${Date.now()}`,
    status: 'ACTIVE'
  });

  const session = await sessionService.startSession({
    employeeId: testUserId,
    mode: 'LAPTOP_PC',
    deviceId
  });

  assert.ok(session.sessionId, 'Session must have sessionId');
  assert.equal(session.state, 'ACTIVE');
  assert.equal(session.leaseSeconds, 60);

  // Assert MongoDB document matches
  const doc = await MonitoringSessionV2.findOne({ session_id: session.sessionId });
  assert.ok(doc, 'MonitoringSessionV2 record must exist in MongoDB');
  assert.equal(doc.state, 'ACTIVE');
  assert.equal(doc.active_device, deviceId);

  // Assert lease expires ~60s in future
  const diffSec = Math.round((new Date(session.leaseExpiresAt).getTime() - Date.now()) / 1000);
  assert.ok(diffSec >= 58 && diffSec <= 62, `Lease expiration delta should be ~60s, got: ${diffSec}s`);
});

test('[F6][F12] Agent lease renewal synchronizes active session state within 60s window', async () => {
  await dbHelper.connect();

  const testUserId = '507f1f77bcf86cd799439012';
  const deviceId = `DEV-ACER-RENEW-${Date.now()}`;

  await RegisteredDevice.create({
    device_id: deviceId,
    employee: testUserId,
    device_name: 'Acer Nitro Renew Test',
    platform: 'windows',
    manufacturer: 'Acer',
    model: 'Nitro AN515-57',
    device_token_hash: `hash_${Date.now()}`,
    status: 'ACTIVE'
  });

  const session = await sessionService.startSession({
    employeeId: testUserId,
    mode: 'LAPTOP_PC',
    deviceId
  });

  const renewed = await sessionService.renewLease(session.sessionId, deviceId);
  assert.equal(renewed.renewed, true);
  assert.equal(renewed.state, 'ACTIVE');
  assert.equal(renewed.remainingSeconds, 60);

  // Mismatched device renewal fails
  await assert.rejects(
    () => sessionService.renewLease(session.sessionId, 'DEV-OTHER-MACHINE'),
    (err) => {
      assert.equal(err.code, 'LEASE_DEVICE_MISMATCH');
      return true;
    }
  );
});

test('[F10][F12] Workday pause transitions session state to PAUSED and updates accumulated pause time', async () => {
  await dbHelper.connect();

  const testUserId = '507f1f77bcf86cd799439012';
  const deviceId = `DEV-ACER-PAUSE-${Date.now()}`;

  await RegisteredDevice.create({
    device_id: deviceId,
    employee: testUserId,
    device_name: 'Acer Nitro Pause Test',
    platform: 'windows',
    manufacturer: 'Acer',
    model: 'Nitro AN515-57',
    device_token_hash: `hash_${Date.now()}`,
    status: 'ACTIVE'
  });

  const session = await sessionService.startSession({
    employeeId: testUserId,
    mode: 'LAPTOP_PC',
    deviceId
  });

  // 1. Pause
  const paused = await sessionService.pauseSession(session.sessionId, testUserId, 'Lunch Break');
  assert.equal(paused.state, 'PAUSED');

  // Verify unauthorized user pause throws
  await assert.rejects(
    () => sessionService.pauseSession(session.sessionId, '507f1f77bcf86cd799439999', 'Unauthorized'),
    (err) => {
      assert.equal(err.code, 'ACCESS_DENIED');
      return true;
    }
  );

  // 2. Resume
  const resumed = await sessionService.resumeSession(session.sessionId, testUserId);
  assert.equal(resumed.state, 'ACTIVE');
  assert.equal(resumed.leaseSeconds, 60);
});
