/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Desktop Agent Unit Tests (Phase A)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentConflictDetector } from '../src/conflictDetector.js';
import { AgentLifecycleManager } from '../src/lifecycle.js';
import { AGENT_STATES } from '../src/config.js';
import { NativeInputCounterContract } from '../src/native/inputCounter.js';
import { SecureStore } from '../src/storage/secureStore.js';

test('AgentConflictDetector: detects V1 executable in process output', () => {
  const sampleWindowsOutput = `"Image Name","PID","Session Name","Session#","Mem Usage"
"System Idle Process","0","Services","0","8 K"
"Niyantran Employee Agent.exe","14280","Console","1","85,420 K"
"chrome.exe","8920","Console","1","145,200 K"`;

  const result = AgentConflictDetector.parseProcessOutput(sampleWindowsOutput);
  assert.equal(result.hasConflict, true);
  assert.equal(result.detectedProcess, 'Niyantran Employee Agent (V1)');
});

test('AgentConflictDetector: detects Electron V1 agent folder in process output', () => {
  const sampleLinuxOutput = `user  1234  0.5  1.2  node /opt/Niyantran/employee-agent/src/main.js`;
  const result = AgentConflictDetector.parseProcessOutput(sampleLinuxOutput);
  assert.equal(result.hasConflict, true);
});

test('AgentConflictDetector: returns false when no V1 process is running', () => {
  const cleanOutput = `"System Idle Process","0","Services","0","8 K"
"explorer.exe","3120","Console","1","52,000 K"
"Code.exe","7740","Console","1","110,000 K"`;

  const result = AgentConflictDetector.parseProcessOutput(cleanOutput);
  assert.equal(result.hasConflict, false);
  assert.equal(result.detectedProcess, null);
});

test('AgentLifecycleManager: enters V1_AGENT_CONFLICT and blocks monitoring if conflict detected', async () => {
  const mockConflictDetector = {
    checkV1Running: async () => ({
      hasConflict: true,
      detectedProcess: 'Niyantran Employee Agent (V1)',
    }),
  };

  const manager = new AgentLifecycleManager({ conflictDetector: mockConflictDetector });
  const initResult = await manager.initialize();

  assert.equal(initResult.success, false);
  assert.equal(manager.getState(), AGENT_STATES.V1_AGENT_CONFLICT);

  // Attempting to start monitoring must throw
  assert.throws(() => {
    manager.startMonitoring('session-123', 'device-456');
  }, /Cannot start monitoring while V1 agent conflict is active/);
});

test('AgentLifecycleManager: enters IDLE_WAITING_AUTH if no conflict detected', async () => {
  const mockConflictDetector = {
    checkV1Running: async () => ({
      hasConflict: false,
      detectedProcess: null,
    }),
  };

  const manager = new AgentLifecycleManager({ conflictDetector: mockConflictDetector });
  const initResult = await manager.initialize();

  assert.equal(initResult.success, true);
  assert.equal(manager.getState(), AGENT_STATES.IDLE_WAITING_AUTH);

  // Normal transition to active monitoring
  manager.startMonitoring('session-123', 'device-456');
  assert.equal(manager.getState(), AGENT_STATES.ACTIVE_MONITORING);

  // Shutdown transitions cleanly
  manager.shutdown();
  assert.equal(manager.getState(), AGENT_STATES.STOPPED);
});

test('NativeInputCounterContract: accumulates numeric counts only without key data', () => {
  const counter = new NativeInputCounterContract();

  counter.recordKeyPress();
  counter.recordKeyPress();
  counter.recordMouseClick();

  const metrics = counter.flushWindowMetrics(60);

  assert.equal(metrics.keyPresses, 2);
  assert.equal(metrics.mouseClicks, 1);
  assert.equal(metrics.durationSeconds, 60);
  assert.equal(typeof metrics.timestamp, 'string');
  // Invariant verification: No raw key text, characters, or scan codes exist in payload
  assert.equal(metrics.text, undefined);
  assert.equal(metrics.keys, undefined);
  assert.equal(metrics.scancodes, undefined);

  // Counters must be reset after flush
  const nextMetrics = counter.flushWindowMetrics(60);
  assert.equal(nextMetrics.keyPresses, 0);
  assert.equal(nextMetrics.mouseClicks, 0);
});

test('SecureStore: stores and retrieves secret values safely', async () => {
  const store = new SecureStore();
  await store.setSecret('sessionToken', 'jwt_token_sample_123');

  const retrieved = await store.getSecret('sessionToken');
  assert.equal(retrieved, 'jwt_token_sample_123');

  await store.deleteSecret('sessionToken');
  const afterDelete = await store.getSecret('sessionToken');
  assert.equal(afterDelete, null);
});
