/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Telemetry Sync Engine & Offline Ring Buffer
 *
 * Implements:
 * 1. Cryptographic HMAC-SHA256 signing of telemetry batches.
 * 2. Clock skew timestamping.
 * 3. Offline resilience: Buffers telemetry locally up to max buffer limit (120 min).
 * 4. Automatic drain upon network restoration.
 * 5. Server rollback response handling (purges offline queue on revocation).
 */

import crypto from 'node:crypto';
import EventEmitter from 'node:events';

export class SyncEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.apiBaseUrl = options.apiBaseUrl || 'http://localhost:5000/api/monitoring-v2';
    this.deviceKey = options.deviceKey || 'local-test-secret-key';
    this.deviceId = options.deviceId || 'DEV-LOCAL-001';
    this.maxOfflineSamples = options.maxOfflineSamples || 120; // 120 samples = 2 hours at 60s windows
    this.offlineQueue = [];
    this.isOnline = true;
    this.fetchClient = options.fetchClient || globalThis.fetch;
  }

  setDeviceCredentials(deviceId, deviceKey) {
    this.deviceId = deviceId;
    this.deviceKey = deviceKey;
  }

  generateHmacSignature(payloadString, timestamp) {
    const canonical = `${timestamp}:${payloadString}`;
    return crypto.createHmac('sha256', this.deviceKey).update(canonical).digest('hex');
  }

  /**
   * Enqueues or immediately submits a telemetry sample.
   *
   * @param {Object} sample
   */
  async submitSample(sample) {
    // If we have an offline queue backlog, enqueue and attempt flush
    if (this.offlineQueue.length > 0) {
      this._enqueue(sample);
      const flushResult = await this.flushOfflineQueue();
      const allFlushed = this.offlineQueue.length === 0;
      return {
        success: allFlushed,
        queued: !allFlushed,
        flushed: flushResult.flushed,
        remaining: flushResult.remaining,
      };
    }

    try {
      const result = await this._sendSample(sample);
      this.isOnline = true;
      this.emit('sample_synced', { sample, result });
      return { success: true, queued: false, result };
    } catch (err) {
      this.isOnline = false;
      this._enqueue(sample);
      this.emit('offline_buffered', { sample, queueLength: this.offlineQueue.length, error: err.message });
      return { success: false, queued: true, error: err.message };
    }
  }

  _enqueue(sample) {
    if (this.offlineQueue.length >= this.maxOfflineSamples) {
      // Drop oldest sample if buffer exceeds 120 minutes
      this.offlineQueue.shift();
      this.emit('queue_overflow_drop');
    }
    this.offlineQueue.push(sample);
  }

  async flushOfflineQueue() {
    if (this.offlineQueue.length === 0) return { flushed: 0 };

    let flushed = 0;
    while (this.offlineQueue.length > 0) {
      const sample = this.offlineQueue[0];
      try {
        await this._sendSample(sample);
        this.offlineQueue.shift();
        flushed += 1;
        this.isOnline = true;
      } catch (err) {
        this.isOnline = false;
        this.emit('flush_interrupted', { remaining: this.offlineQueue.length, error: err.message });
        break;
      }
    }

    if (flushed > 0) {
      this.emit('queue_flushed', { flushed, remaining: this.offlineQueue.length });
    }
    return { flushed, remaining: this.offlineQueue.length };
  }

  async _sendSample(sample) {
    const payloadStr = JSON.stringify(sample);
    const timestamp = Date.now().toString();
    const signature = this.generateHmacSignature(payloadStr, timestamp);

    if (!this.fetchClient) {
      // Mock/test environment without fetch
      return { status: 200, accepted: true };
    }

    const response = await this.fetchClient(`${this.apiBaseUrl}/telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': this.deviceId,
        'x-device-signature': signature,
        'x-timestamp': timestamp,
      },
      body: payloadStr,
    });

    if (response.status === 403) {
      const body = await response.json().catch(() => ({}));
      if (body.rollback || body.revoked || body.error === 'MONITORING_DISABLED') {
        this.purgeOfflineQueue();
        this.emit('server_rollback', { status: 403, detail: body });
        throw new Error('Server revoked monitoring authorization');
      }
    }

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    return response.json().catch(() => ({ accepted: true }));
  }

  async renewServerLease(sessionId) {
    if (!this.fetchClient || !this.deviceId) return false;
    try {
      const response = await this.fetchClient(`${this.apiBaseUrl}/sessions/${sessionId}/renew-lease`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': this.deviceId,
        },
      });
      return response.ok;
    } catch (_) {
      return false;
    }
  }

  purgeOfflineQueue() {
    const count = this.offlineQueue.length;
    this.offlineQueue = [];
    this.emit('queue_purged', { purgedCount: count });
    return count;
  }

  getQueueLength() {
    return this.offlineQueue.length;
  }
}

export default SyncEngine;
