/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Cross-Device Handoff, Installer, & Notification Unit Tests
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Ensure feature flags & secrets
process.env.ENABLE_MONITORING_V2 = 'true';
process.env.ENABLE_MONITORING_V2_AGENT = 'true';
const TEST_JWT_SECRET = process.env.JWT_SECRET || 'handoff-installer-test-jwt-secret';
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.MONITORING_V2_ENCRYPTION_KEY = process.env.MONITORING_V2_ENCRYPTION_KEY || 'test-encryption-key-for-installer-test';

// Target modules
const { initiateHandoff } = require('../services/handoffService');
const { sendAlert, emitHandoffEvent, emitSessionStateChange } = require('../services/notificationService');
const { DEVICE_MODES, SESSION_STATES } = require('../config/constants');
const deviceService = require('../services/deviceService');
const RegisteredDevice = require('../models/RegisteredDevice');
const RootRegisteredDevice = require('../../../models/RegisteredDevice');

const v2Routes = require('../routes');

const app = express();
app.use(express.json());
app.use('/api/monitoring-v2', v2Routes);

const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/niyantran_v2_isolated_test';
let isMongoConnected = false;

test.before(async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    }
    isMongoConnected = true;
  } catch (_) {
    isMongoConnected = false;
  }
});

test.after(async () => {
  if (isMongoConnected) {
    await mongoose.disconnect();
  }
});

test('Installer Package: exists and is verified in dist', () => {
  const distDir = path.resolve(__dirname, '../../../../employee-agent-v2/dist');
  const zipPath = path.join(distDir, 'Niyantran-Agent-V2-Setup.zip');
  const exePath = path.join(distDir, 'NiyantranMonitoringAgentV2-Setup.exe');

  assert.ok(fs.existsSync(zipPath), 'Niyantran-Agent-V2-Setup.zip must exist');
  assert.ok(fs.existsSync(exePath), 'NiyantranMonitoringAgentV2-Setup.exe must exist');
  const zipStats = fs.statSync(zipPath);
  const exeStats = fs.statSync(exePath);
  assert.ok(zipStats.size > 1000, `ZIP Package must have non-trivial size (actual: ${zipStats.size} bytes)`);
  assert.ok(exeStats.size > 1000, `EXE Installer must have non-trivial size (actual: ${exeStats.size} bytes)`);
});

test('Installer Route: GET /api/monitoring-v2/installer/info returns uppercase SHA-256 and sizeBytes', async () => {
  const res = await request(app).get('/api/monitoring-v2/installer/info');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.available, true);
  assert.equal(res.body.fileName, 'NiyantranMonitoringAgentV2-Setup.exe');
  assert.equal(res.body.sha256, 'B104D7D88C13A29074D7A01368705B90F23CDB07A6F459FE98E67315E4916003');
  assert.equal(res.body.sizeBytes, 55808);
  assert.equal(res.body.version, '2.0.0');
});

test('Installer Route: GET /api/monitoring-v2/installer/download enforces authentication and query token fallback', async () => {
  // 1. Unauthenticated request must return 401
  const unauthRes = await request(app).get('/api/monitoring-v2/installer/download');
  assert.equal(unauthRes.status, 401);

  // 2. Authenticated request with Bearer header
  const validToken = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: 'User' }, TEST_JWT_SECRET);
  const authRes = await request(app)
    .get('/api/monitoring-v2/installer/download')
    .set('Authorization', `Bearer ${validToken}`);
  assert.equal(authRes.status, 200);
  assert.equal(authRes.headers['content-type'], 'application/vnd.microsoft.portable-executable');
  assert.ok(authRes.headers['content-disposition'].includes('NiyantranMonitoringAgentV2-Setup.exe'));

  // 3. Authenticated request with query token parameter
  const queryRes = await request(app)
    .get(`/api/monitoring-v2/installer/download?token=${validToken}`);
  assert.equal(queryRes.status, 200);
  assert.equal(queryRes.headers['content-type'], 'application/vnd.microsoft.portable-executable');
});

test('RegisteredDevice Model Proxy: server/models/RegisteredDevice re-exports Monitoring V2 model', () => {
  assert.equal(RootRegisteredDevice, RegisteredDevice);
  assert.ok(RegisteredDevice.schema.path('manufacturer'), 'Schema must define manufacturer');
  assert.ok(RegisteredDevice.schema.path('model'), 'Schema must define model');
  assert.ok(RegisteredDevice.schema.path('machine_uuid'), 'Schema must define machine_uuid');
});

test('Device Pairing: persists Acer hardware metadata (Manufacturer, Model, Machine UUID)', async () => {
  if (!isMongoConnected) return;

  const employeeId = new mongoose.Types.ObjectId();
  deviceService._enrollmentRateLimits.delete(employeeId.toString());
  const { code } = deviceService.generateEnrollmentCode(employeeId);

  const pairingResult = await deviceService.pairDevice({
    pairingCode: code,
    deviceName: 'Acer Nitro AN515-57 Workstation',
    platform: 'windows',
    osVersion: 'Microsoft Windows 11 Home',
    agentVersion: '2.0.0',
    manufacturer: 'Acer',
    model: 'Nitro AN515-57',
    machineUuid: 'E77CA225-2515-EC11-80E1-088FC3199D36',
    ip: '127.0.0.1',
    userAgent: 'Niyantran-Agent/2.0.0'
  });

  assert.ok(pairingResult.deviceId);
  assert.equal(pairingResult.manufacturer, 'Acer');
  assert.equal(pairingResult.model, 'Nitro AN515-57');
  assert.equal(pairingResult.machineUuid, 'E77CA225-2515-EC11-80E1-088FC3199D36');

  // Verify database record
  const savedDoc = await RegisteredDevice.findOne({ device_id: pairingResult.deviceId });
  assert.ok(savedDoc);
  assert.equal(savedDoc.manufacturer, 'Acer');
  assert.equal(savedDoc.model, 'Nitro AN515-57');
  assert.equal(savedDoc.machine_uuid, 'E77CA225-2515-EC11-80E1-088FC3199D36');
});

test('NotificationService: emits events safely when io is provided', async () => {
  let emittedEvents = [];
  const mockIo = {
    emit: (event, data) => emittedEvents.push({ target: 'broadcast', event, data }),
    to: (room) => ({
      emit: (event, data) => emittedEvents.push({ target: `room:${room}`, event, data })
    })
  };

  emitHandoffEvent({
    sessionId: 'sess-123',
    employeeId: 'emp-456',
    fromMode: DEVICE_MODES.LAPTOP_PC,
    toMode: DEVICE_MODES.PHONE,
    fromDevice: 'DEV-WIN-01',
    toDevice: 'MOBILE_PHONE',
    io: mockIo
  });

  assert.equal(emittedEvents.length, 3);
  assert.equal(emittedEvents[0].event, 'monitoring:handoff');
  assert.equal(emittedEvents[0].data.sessionId, 'sess-123');
  assert.equal(emittedEvents[0].data.toMode, DEVICE_MODES.PHONE);

  emitSessionStateChange({
    sessionId: 'sess-123',
    employeeId: 'emp-456',
    state: SESSION_STATES.PAUSED,
    reason: 'Break',
    io: mockIo
  });

  const stateEvents = emittedEvents.filter(e => e.event === 'monitoring:session-state');
  assert.equal(stateEvents.length, 2);
  assert.equal(stateEvents[0].data.state, SESSION_STATES.PAUSED);
});

test('HandoffService: rejects handoff when invalid targetMode is specified', async () => {
  await assert.rejects(
    async () => {
      await initiateHandoff({
        sessionId: 'sess-test',
        employeeId: 'emp-test',
        targetMode: 'TABLET_UNKNOWN'
      });
    },
    { code: 'INVALID_TARGET_MODE' }
  );
});

test('HandoffService: rejects handoff when sessionId is missing', async () => {
  await assert.rejects(
    async () => {
      await initiateHandoff({
        sessionId: null,
        employeeId: 'emp-test',
        targetMode: DEVICE_MODES.PHONE
      });
    },
    { code: 'SESSION_ID_REQUIRED' }
  );
});
