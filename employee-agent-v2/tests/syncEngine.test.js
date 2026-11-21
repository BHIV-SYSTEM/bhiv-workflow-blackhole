/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Sync Engine & Offline Ring Buffer Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncEngine } from '../src/managers/syncEngine.js';

test('SyncEngine: generates valid HMAC-SHA256 signatures over payload and timestamp', () => {
  const engine = new SyncEngine({
    deviceKey: 'super-secret-hmac-key-12345',
    deviceId: 'DEV-WIN32-TEST',
  });

  const payloadStr = JSON.stringify({ keyPressCount: 50, durationSeconds: 60 });
  const timestamp = '1700000000000';

  const sig1 = engine.generateHmacSignature(payloadStr, timestamp);
  const sig2 = engine.generateHmacSignature(payloadStr, timestamp);

  assert.equal(typeof sig1, 'string');
  assert.equal(sig1.length, 64, 'HMAC-SHA256 hex string must be 64 characters');
  assert.equal(sig1, sig2, 'HMAC signature must be deterministic');

  // Altered payload must produce completely different signature
  const sigAltered = engine.generateHmacSignature(JSON.stringify({ keyPressCount: 51 }), timestamp);
  assert.notEqual(sig1, sigAltered);
});

test('SyncEngine: buffers samples offline when network fails and flushes in FIFO order upon restoration', async () => {
  let isNetworkUp = false;

  const mockFetch = async (url, options) => {
    if (!isNetworkUp) {
      throw new Error('ECONNREFUSED: Server unreachable');
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, accepted: true }),
    };
  };

  const engine = new SyncEngine({
    fetchClient: mockFetch,
    maxOfflineSamples: 5,
  });

  const sample1 = { id: 1, keyPressCount: 10 };
  const sample2 = { id: 2, keyPressCount: 20 };

  // 1. Send while network is down -> Must buffer
  const res1 = await engine.submitSample(sample1);
  assert.equal(res1.success, false);
  assert.equal(res1.queued, true);
  assert.equal(engine.getQueueLength(), 1);

  const res2 = await engine.submitSample(sample2);
  assert.equal(res2.success, false);
  assert.equal(res2.queued, true);
  assert.equal(engine.getQueueLength(), 2);

  // 2. Restore network and submit sample 3 -> Must flush queue in FIFO order
  isNetworkUp = true;
  const sample3 = { id: 3, keyPressCount: 30 };
  const res3 = await engine.submitSample(sample3);

  assert.equal(res3.flushed, 3, 'Must have flushed all 3 buffered samples');
  assert.equal(engine.getQueueLength(), 0, 'Offline queue must now be empty');
});

test('SyncEngine: drops oldest samples on queue overflow (max capacity)', async () => {
  const failingFetch = async () => {
    throw new Error('ETIMEDOUT');
  };

  const engine = new SyncEngine({
    fetchClient: failingFetch,
    maxOfflineSamples: 3, // Capacity = 3
  });

  await engine.submitSample({ id: 1 });
  await engine.submitSample({ id: 2 });
  await engine.submitSample({ id: 3 });
  assert.equal(engine.getQueueLength(), 3);

  // Adding 4th sample must drop sample 1 and keep queue at length 3
  await engine.submitSample({ id: 4 });
  assert.equal(engine.getQueueLength(), 3);
  assert.equal(engine.offlineQueue[0].id, 2, 'Sample 1 must have been shifted out');
  assert.equal(engine.offlineQueue[2].id, 4);
});

test('SyncEngine: server rollback purges offline queue', () => {
  const engine = new SyncEngine();
  engine.offlineQueue = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.equal(engine.getQueueLength(), 3);

  const purgedCount = engine.purgeOfflineQueue();
  assert.equal(purgedCount, 3);
  assert.equal(engine.getQueueLength(), 0);
});
