/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Cross-Device Handoff, Installer, & Notification Unit Tests
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// Target modules
const { initiateHandoff } = require('../services/handoffService');
const { sendAlert, emitHandoffEvent, emitSessionStateChange } = require('../services/notificationService');
const { DEVICE_MODES, SESSION_STATES } = require('../config/constants');

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
