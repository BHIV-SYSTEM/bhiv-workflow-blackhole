/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * End-to-End Desktop Agent Orchestrator Tests
 *
 * Verifies full agent lifecycle: initialization, active monitoring,
 * native telemetry aggregation, lease management, and clean shutdown.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { NiyantranMonitoringAgentV2 } from '../src/agent.js';
import { AGENT_STATES } from '../src/config.js';
import { InMemorySecureStoreFallback, SecureStore } from '../src/storage/secureStore.js';

test('NiyantranMonitoringAgentV2: completes full lifecycle (Init -> Active -> Telemetry -> Stop)', async () => {
  let submittedPayloads = [];

  const mockSyncEngine = {
    setDeviceCredentials: () => {},
    submitSample: async (sample) => {
      submittedPayloads.push(sample);
      return { success: true, accepted: true };
    },
    purgeOfflineQueue: () => 0,
    on: () => {},
  };

  const mockTrayManager = {
    start: () => {},
    updateStatus: () => {},
    stop: () => {},
    on: () => {},
  };

  const agent = new NiyantranMonitoringAgentV2({
    secureStore: new SecureStore(new InMemorySecureStoreFallback()),
    syncEngine: mockSyncEngine,
    trayManager: mockTrayManager,
    telemetryIntervalMs: 50, // fast interval for testing
  });

  // 1. Initialize
  const initResult = await agent.initialize();
  assert.equal(initResult.success, true);
  assert.equal(agent.lifecycle.getState(), AGENT_STATES.IDLE_WAITING_AUTH);

  // 2. Start monitoring session
  agent.startMonitoring('SESSION-E2E-TEST', 'DEV-E2E-WIN32');
  assert.equal(agent.lifecycle.getState(), AGENT_STATES.ACTIVE_MONITORING);

  // 3. Record input events
  agent.inputCounter.recordKeyPress();
  agent.inputCounter.recordKeyPress();
  agent.inputCounter.recordMouseClick();

  // 4. Flush telemetry sample
  const sample = await agent.flushAndSyncTelemetry();

  assert.ok(sample, 'Must return generated sample');
  assert.equal(sample.sessionId, 'SESSION-E2E-TEST');
  assert.equal(sample.deviceId, 'DEV-E2E-WIN32');
  assert.equal(sample.keyPressCount, 2);
  assert.equal(sample.mouseActivityDelta, 1);
  assert.equal(submittedPayloads.length, 1);

  // Verify privacy invariants on the emitted sample
  assert.equal(sample.text, undefined);
  assert.equal(sample.keystrokes, undefined);
  assert.equal(sample.screenshot, undefined);
  assert.equal(sample.url, undefined);

  // 5. Pause and resume
  agent.pauseMonitoring('Break');
  assert.equal(agent.lifecycle.getState(), AGENT_STATES.PAUSED);

  agent.resumeMonitoring();
  assert.equal(agent.lifecycle.getState(), AGENT_STATES.ACTIVE_MONITORING);

  // 6. Stop monitoring
  agent.stopMonitoring('Workday ended');
  assert.equal(agent.lifecycle.getState(), AGENT_STATES.STOPPED);

  // 7. Shutdown
  agent.shutdown();
});
