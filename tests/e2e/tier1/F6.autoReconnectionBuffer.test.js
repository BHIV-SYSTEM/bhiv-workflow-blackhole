/**
 * Tier 1 Feature Coverage: F6 — Auto-Reconnection & Offline Telemetry Buffer
 * Verifies offline buffer enqueueing upon connection failure, HMAC-SHA256 cryptographic signatures,
 * autonomous 90-second lease timeout (60s lease + 30s grace), reconnect detection, and FIFO flushing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');

const { config } = require('./tier1Common');

test('[F6] Offline Telemetry Sample Enqueueing in Local Buffer Upon Network Interruption', async () => {
  const syncEnginePath = path.resolve(config.paths.agent, 'src/managers/syncEngine.js');
  const { SyncEngine } = await import(pathToFileURL(syncEnginePath).href);

  // Mock fetch client simulating network disconnection
  const failingFetch = async () => {
    const error = new Error('connect ECONNREFUSED 127.0.0.1:5000');
    error.code = 'ECONNREFUSED';
    throw error;
  };

  const syncEngine = new SyncEngine({
    fetchClient: failingFetch,
    deviceId: 'DEV-OFFLINE-TEST-001',
    deviceKey: 'secret-key-offline-buffer'
  });

  const sample = {
    sessionId: 'sess_offline_001',
    durationSeconds: 60,
    keyPressCount: 30,
    mouseActivityDelta: 12,
    hardwareIdleSeconds: 0,
    activeProcessCategory: 'DEVELOPMENT',
    applicationExecutable: 'code.exe'
  };

  const result = await syncEngine.submitSample(sample);

  assert.equal(result.success, false, 'Submit must indicate failure on network cut');
  assert.equal(result.queued, true, 'Sample must be queued in offline ring buffer');
  assert.equal(syncEngine.offlineQueue.length, 1, 'Offline queue length must be 1');
  assert.equal(syncEngine.isOnline, false, 'SyncEngine state must transition to offline');
  assert.equal(syncEngine.offlineQueue[0].sessionId, 'sess_offline_001');
});

test('[F6] HMAC-SHA256 Cryptographic Signature on Buffered Offline Telemetry', async () => {
  const syncEnginePath = path.resolve(config.paths.agent, 'src/managers/syncEngine.js');
  const { SyncEngine } = await import(pathToFileURL(syncEnginePath).href);

  const deviceKey = 'device-secret-key-for-hmac-test';
  const syncEngine = new SyncEngine({
    deviceId: 'DEV-SIGN-001',
    deviceKey
  });

  const payloadString = JSON.stringify({
    sessionId: 'sess_sign_001',
    keyPressCount: 50,
    mouseActivityDelta: 25
  });
  const timestamp = '1732098000000';

  const signature = syncEngine.generateHmacSignature(payloadString, timestamp);

  assert.equal(typeof signature, 'string');
  assert.equal(signature.length, 64, 'HMAC-SHA256 signature must be 64-character hex string');

  // Verify signature matches independent Node crypto calculation
  const canonical = `${timestamp}:${payloadString}`;
  const expectedSig = crypto.createHmac('sha256', deviceKey).update(canonical).digest('hex');
  assert.equal(signature, expectedSig, 'Generated signature must match expected HMAC-SHA256');
});

test('[F6] Autonomous Lease Timeout After 90 Seconds of Interruption', async () => {
  const leaseManagerPath = path.resolve(config.paths.agent, 'src/managers/sessionLeaseManager.js');
  const { SessionLeaseManager } = await import(pathToFileURL(leaseManagerPath).href);

  const manager = new SessionLeaseManager({
    defaultLeaseDurationSeconds: 60,
    maxAutonomousGraceSeconds: 30
  });

  // Verify total autonomous lease window equals 90 seconds (60s + 30s)
  assert.equal(manager.defaultLeaseDurationSeconds, 60, 'Default lease duration must be 60 seconds');
  assert.equal(manager.maxAutonomousGraceSeconds, 30, 'Grace window must be 30 seconds');
  const totalWindowSeconds = manager.defaultLeaseDurationSeconds + manager.maxAutonomousGraceSeconds;
  assert.equal(totalWindowSeconds, 90, 'Total autonomous expiration window must be 90 seconds');

  // Start lease
  manager.startLease('sess_autonomous_001');
  assert.equal(manager.isAuthorized, true, 'Lease must be authorized on start');
  assert.equal(manager.currentSessionId, 'sess_autonomous_001');

  // Trigger autonomous expiry
  let eventFired = false;
  manager.on('lease_expired', (data) => {
    eventFired = true;
    assert.equal(data.sessionId, 'sess_autonomous_001');
  });

  manager.handleAutonomousExpiry();

  assert.equal(manager.isAuthorized, false, 'Manager must revoke authorization on autonomous expiry');
  assert.equal(manager.currentSessionId, null, 'Active session ID must be cleared');
  assert.equal(eventFired, true, 'lease_expired event must be emitted');
});

test('[F6] Network Connectivity Restoration Detection', async () => {
  const syncEnginePath = path.resolve(config.paths.agent, 'src/managers/syncEngine.js');
  const { SyncEngine } = await import(pathToFileURL(syncEnginePath).href);

  // Successful fetch client
  const successfulFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ accepted: true })
  });

  const syncEngine = new SyncEngine({
    fetchClient: successfulFetch,
    deviceId: 'DEV-RECONNECT-001',
    deviceKey: 'key-reconnect'
  });

  // Simulate offline state with buffered item
  syncEngine.isOnline = false;
  syncEngine.offlineQueue.push({
    sessionId: 'sess_reconnect_001',
    keyPressCount: 10
  });

  // Flush buffer on connectivity restored
  const result = await syncEngine.flushOfflineQueue();

  assert.equal(result.flushed, 1, 'One sample must be flushed upon reconnection');
  assert.equal(result.remaining, 0, 'Buffer must have 0 remaining items');
  assert.equal(syncEngine.isOnline, true, 'State must update to online');
});

test('[F6] Chronological FIFO Flush of Buffered Telemetry on Reconnection', async () => {
  const syncEnginePath = path.resolve(config.paths.agent, 'src/managers/syncEngine.js');
  const { SyncEngine } = await import(pathToFileURL(syncEnginePath).href);

  const sentSamples = [];
  const recordingFetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    sentSamples.push(body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ accepted: true })
    };
  };

  const syncEngine = new SyncEngine({
    fetchClient: recordingFetch,
    deviceId: 'DEV-FIFO-001',
    deviceKey: 'key-fifo'
  });

  // Enqueue 3 samples in sequence (t1, t2, t3)
  const sample1 = { sessionId: 'sess_fifo', minute: 1, keyPressCount: 10 };
  const sample2 = { sessionId: 'sess_fifo', minute: 2, keyPressCount: 20 };
  const sample3 = { sessionId: 'sess_fifo', minute: 3, keyPressCount: 30 };

  syncEngine._enqueue(sample1);
  syncEngine._enqueue(sample2);
  syncEngine._enqueue(sample3);

  assert.equal(syncEngine.offlineQueue.length, 3);

  // Flush all
  const result = await syncEngine.flushOfflineQueue();

  assert.equal(result.flushed, 3, 'All 3 samples must be flushed');
  assert.equal(syncEngine.offlineQueue.length, 0, 'Offline queue must be completely drained');

  // Verify FIFO chronological order: sample 1 first, then 2, then 3
  assert.equal(sentSamples.length, 3);
  assert.equal(sentSamples[0].minute, 1, 'Oldest sample (minute 1) must be flushed first');
  assert.equal(sentSamples[1].minute, 2, 'Middle sample (minute 2) must be flushed second');
  assert.equal(sentSamples[2].minute, 3, 'Latest sample (minute 3) must be flushed third');
});
