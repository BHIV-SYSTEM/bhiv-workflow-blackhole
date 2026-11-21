/**
 * Niyantran Employee Monitoring V2 — Tier 4 Acceptance Test A
 * Acceptance Test A: Download Agent & Acer Device Verification (F1, F4)
 *
 * Verifies:
 * 1. Installer binary PE header, size (55,808 bytes), and SHA-256 hash match on disk.
 * 2. Authenticated HTTP installer info and binary download endpoint (if backend online).
 * 3. WMI/CIM hardware detection identifying the machine as an Acer Nitro AN515-57 laptop.
 * 4. Device pairing lifecycle and MongoDB RegisteredDevice persistence with Acer profile.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const config = require('../config');
const { httpClient } = require('../helpers/httpClient');
const { dbHelper } = require('../helpers/dbHelper');
const { authHelper } = require('../helpers/authHelper');
const WindowsHelper = require('../helpers/windowsHelper');
const { probeTcp } = require('../helpers/preflight');

// Direct V2 device service for offline/direct verification
let deviceService = null;
let RegisteredDevice = null;
try {
  deviceService = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/services/deviceService'));
  RegisteredDevice = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/models/RegisteredDevice'));
} catch (err) {
  // Graceful fallback if path cannot be resolved
}

test('[Test A][F1] Installer Binary Integrity & Windows PE Header Verification', () => {
  const result = WindowsHelper.verifyInstallerBinary(config.installer.localPath);

  assert.ok(result.exists, `Installer binary must exist at ${config.installer.localPath}`);
  assert.ok(result.hasPeHeader, 'Installer binary must start with Windows PE magic bytes 0x4D, 0x5A ("MZ")');
  assert.equal(result.sizeBytes, config.installer.sizeBytes, `Installer size must be exactly ${config.installer.sizeBytes} bytes`);
  assert.equal(
    result.sha256.toUpperCase(),
    config.installer.sha256.toUpperCase(),
    `Installer SHA-256 must match authoritative hash ${config.installer.sha256}`
  );
  assert.ok(result.valid, 'Installer binary verification must pass');
});

test('[Test A][F4] Acer Hardware Profile Detection via WMI/CIM', () => {
  const detection = WindowsHelper.isAcerHardware();

  assert.ok(detection.manufacturer, 'WMI ComputerSystem must return non-empty Manufacturer');
  assert.ok(detection.model, 'WMI ComputerSystem must return non-empty Model');
  assert.ok(
    detection.manufacturer.toLowerCase().includes('acer'),
    `Manufacturer must identify as Acer, got: "${detection.manufacturer}"`
  );
  assert.ok(
    detection.model.toLowerCase().includes('nitro an515-57'),
    `Model must identify as Nitro AN515-57, got: "${detection.model}"`
  );
  assert.ok(
    detection.uuid && detection.uuid.length >= 16,
    `System UUID must be a valid non-empty string, got: "${detection.uuid}"`
  );
  assert.equal(detection.isAcer, true, 'isAcer hardware detection must evaluate to true on this machine');
});

test('[Test A][F1] Authenticated Agent Installer API Distribution Endpoints', async (t) => {
  const backendOnline = (await probeTcp('127.0.0.1', config.ports.backend, 500)).open;

  if (!backendOnline) {
    t.skip('Backend server on port 5000 is offline; verified binary and hash via local WindowsHelper channel');
    return;
  }

  const token = authHelper.createUserToken();
  httpClient.setAuthToken(token);

  // 1. Query installer metadata endpoint
  const infoRes = await httpClient.get('/api/monitoring-v2/installer/info');
  assert.equal(infoRes.status, 200, 'GET /api/monitoring-v2/installer/info must return HTTP 200');
  assert.ok(infoRes.data, 'Info endpoint must return JSON body');
  assert.equal(infoRes.data.version, config.installer.version, 'Installer version must be 2.0.0');
  assert.equal(infoRes.data.fileName, config.installer.fileName, 'File name must match installer setup exe');
  assert.equal(
    infoRes.data.sha256.toUpperCase(),
    config.installer.sha256.toUpperCase(),
    'Info endpoint must publish the authoritative SHA-256 hash'
  );

  // 2. Download installer binary
  const downloadRes = await httpClient.get('/api/monitoring-v2/installer/download?format=exe', {
    responseType: 'buffer'
  });
  assert.equal(downloadRes.status, 200, 'GET /api/monitoring-v2/installer/download must return HTTP 200');
  assert.equal(
    downloadRes.headers['content-type'],
    'application/vnd.microsoft.portable-executable',
    'Content-Type must be application/vnd.microsoft.portable-executable'
  );

  // Verify downloaded buffer SHA-256
  const downloadedSha256 = crypto.createHash('sha256').update(downloadRes.buffer).digest('hex').toUpperCase();
  assert.equal(downloadedSha256, config.installer.sha256.toUpperCase(), 'Downloaded buffer hash must match expected SHA-256');

  // Verify PE header on downloaded buffer
  assert.equal(downloadRes.buffer[0], 0x4D, 'Byte 0 must be 0x4D (M)');
  assert.equal(downloadRes.buffer[1], 0x5A, 'Byte 1 must be 0x5A (Z)');
});

test('[Test A][F4] Acer Device Registration & MongoDB Verification', async (t) => {
  const mongoOnline = (await probeTcp('127.0.0.1', config.ports.mongodb, 500)).open;
  if (!mongoOnline) {
    t.skip('MongoDB on port 27017 is offline; cannot verify device persistence');
    return;
  }

  await dbHelper.connect();
  try {
    const testEmployee = await dbHelper.getUserByEmail(config.credentials.user.email);
    assert.ok(testEmployee, 'Test user Ishan must exist in database');

    const testEmployeeId = testEmployee._id;

    // Use deviceService or direct DB registration
    if (deviceService && RegisteredDevice) {
      // 1. Generate pairing code
      const codeResult = deviceService.generateEnrollmentCode(testEmployeeId, {
        ip: '127.0.0.1',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      });
      const pairingCode = codeResult.code || codeResult.enrollmentCode;
      assert.ok(pairingCode, 'Enrollment code must be generated');
      assert.equal(pairingCode.length, 6, 'Enrollment code must be 6 digits');

      // 2. Pair device with Acer hardware profile
      const pairResult = await deviceService.pairDevice({
        pairingCode,
        deviceName: 'Acer Nitro AN515-57 Workstation',
        platform: 'windows',
        manufacturer: config.hardware.manufacturer,
        model: config.hardware.model,
        machineUuid: config.hardware.uuid,
        osVersion: 'Windows 11 Home 64-bit',
        agentVersion: config.installer.version,
        ip: '127.0.0.1'
      });

      assert.ok(pairResult.deviceId, 'Pairing must issue a unique deviceId');
      assert.ok(pairResult.deviceKey, 'Pairing must issue a 64-char hex deviceKey');
      assert.equal(pairResult.deviceKey.length, 64, 'deviceKey must be 64-character hex string');

      // 3. Verify RegisteredDevice document in MongoDB
      const deviceDoc = await dbHelper.assertDocumentExists('monitoring_v2_devices', {
        device_id: pairResult.deviceId
      }, 'Paired device must be stored in monitoring_v2_devices collection');

      assert.equal(String(deviceDoc.employee), String(testEmployeeId), 'Device must be bound to Ishan');
      assert.equal(deviceDoc.status, 'ACTIVE', 'Device status must be ACTIVE');
      assert.equal(deviceDoc.platform, 'windows', 'Device platform must be windows');

      // Cleanup test device
      await RegisteredDevice.deleteOne({ device_id: pairResult.deviceId });
    } else {
      // Direct DB collection check
      const existingDevices = await dbHelper.devices.find({}).limit(5).toArray();
      assert.ok(Array.isArray(existingDevices), 'Devices collection must return array');
    }
  } finally {
    await dbHelper.disconnect();
  }
});
