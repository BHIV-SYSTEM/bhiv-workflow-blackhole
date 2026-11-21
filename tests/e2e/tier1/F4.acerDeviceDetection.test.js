/**
 * Tier 1 Feature Coverage: F4 — Acer Laptop Hardware Detection & Device Pairing
 * Verifies host WMI queries for Acer manufacturer and Nitro AN515-57 model,
 * SystemProduct UUID detection, agent hardware profiler, device pairing API,
 * and MongoDB RegisteredDevice document verification.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { config, authHelper, WindowsHelper, apiRequest, ensureDbConnected, dbHelper } = require('./tier1Common');

test.after(async () => {
  await dbHelper.disconnect();
});

test('[F4] Host Hardware Identification Queries Win32_ComputerSystem for Acer Laptop', () => {
  const cs = WindowsHelper.getComputerSystem();
  assert.ok(cs, 'Win32_ComputerSystem query must return valid object');
  assert.equal(typeof cs.Manufacturer, 'string', 'Manufacturer must be reported as string');
  assert.equal(typeof cs.Model, 'string', 'Model must be reported as string');

  // Verify Acer Nitro specifications on the development Acer laptop
  assert.ok(
    cs.Manufacturer.toLowerCase().includes('acer'),
    `Manufacturer must be Acer, actual: ${cs.Manufacturer}`
  );
  assert.ok(
    cs.Model.toLowerCase().includes('nitro an515-57') || cs.Model.toLowerCase().includes('nitro'),
    `Model must match Acer Nitro AN515-57, actual: ${cs.Model}`
  );
});

test('[F4] Host Hardware Identification Queries Win32_ComputerSystemProduct for Valid UUID', () => {
  const csp = WindowsHelper.getComputerSystemProduct();
  assert.ok(csp, 'Win32_ComputerSystemProduct query must return valid object');
  assert.ok(csp.UUID, 'UUID must be present in hardware query');

  // Validate GUID / UUID format (36 characters: 8-4-4-4-12 hex)
  const uuidRegex = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
  assert.ok(
    uuidRegex.test(csp.UUID),
    `UUID must match standard GUID format, actual: ${csp.UUID}`
  );
});

test('[F4] Desktop Agent Hardware Profiler Accurately Detects Acer Machine Specs', async () => {
  const detectorPath = path.resolve(config.paths.agent, 'src/native/hardwareDetector.js');
  const { detectHardwareInfo } = await import(pathToFileURL(detectorPath).href);

  const hw = await detectHardwareInfo();
  assert.ok(hw, 'Hardware info must be returned by agent detector');
  assert.equal(hw.manufacturer, 'Acer', 'Agent must detect manufacturer as Acer');
  assert.equal(hw.model, 'Nitro AN515-57', 'Agent must detect model as Nitro AN515-57');
  assert.ok(hw.uuid, 'Agent must detect hardware UUID');
  assert.ok(hw.os, 'Agent must detect host OS');
});

test('[F4] Device Pairing API Accepts Genuine Acer Hardware Profile', async () => {
  await ensureDbConnected();

  // 1. Get or create employee token
  const employee = await dbHelper.getUserByEmail('ishan@blackhole.ai');
  assert.ok(employee, 'Employee ishan@blackhole.ai must exist in database');
  const token = authHelper.createUserToken({ id: employee._id.toString() });

  // 2. Request one-time pairing code
  const codeRes = await apiRequest({
    method: 'POST',
    path: '/api/monitoring-v2/devices/enrollment-code',
    token
  });

  assert.equal(codeRes.status, 200, 'Enrollment code request must succeed');
  assert.ok(codeRes.body.code, 'Pairing code must be generated');
  const pairingCode = codeRes.body.code;

  // 3. Pair device with Acer hardware profile
  const pairRes = await apiRequest({
    method: 'POST',
    path: '/api/monitoring-v2/devices/pair',
    body: {
      pairingCode,
      deviceName: 'Acer Nitro AN515-57 Workstation',
      platform: 'windows',
      osVersion: '11.0.26320',
      agentVersion: '2.0.0',
      manufacturer: 'Acer',
      model: 'Nitro AN515-57',
      machineUuid: config.hardware.uuid
    }
  });

  assert.equal(pairRes.status, 201, 'Device pairing must return HTTP 201 Created');
  assert.equal(pairRes.body.success, true, 'Pairing response must indicate success');
  assert.ok(pairRes.body.deviceId, 'Response must return new deviceId');
  assert.ok(pairRes.body.deviceKey, 'Response must return HMAC deviceKey');
  assert.equal(pairRes.body.status, 'ACTIVE', 'Initial device status must be ACTIVE');
});

test('[F4] MongoDB RegisteredDevice Record Verification for Acer Laptop', async () => {
  await ensureDbConnected();

  const employee = await dbHelper.getUserByEmail('ishan@blackhole.ai');
  assert.ok(employee);

  // Query device collection for this employee
  const deviceDoc = await dbHelper.devices.findOne({
    $or: [
      { employee: employee._id },
      { employee_id: employee._id },
      { device_name: /Acer/i }
    ]
  }, { sort: { created_at: -1, createdAt: -1 } });

  assert.ok(deviceDoc, 'RegisteredDevice document must exist in MongoDB');
  assert.equal(deviceDoc.platform, 'windows', 'Device platform must be windows');
  assert.ok(
    deviceDoc.device_name?.includes('Acer') || deviceDoc.manufacturer === 'Acer',
    'Device record must reference Acer hardware'
  );
  assert.equal(deviceDoc.status, 'ACTIVE', 'Device status must be ACTIVE in database');
});
