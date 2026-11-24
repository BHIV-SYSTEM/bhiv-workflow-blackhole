/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Windows Desktop Monitoring Agent — Main Orchestrator
 *
 * Coordinates:
 * - Lifecycle state machine & passive conflict prevention
 * - Native Windows foreground application duration tracking
 * - Native hardware idle & workstation lock detection
 * - Privacy-first numeric input frequency counting
 * - OS-backed Windows DPAPI credential protection
 * - Short-lived authorization leases with autonomous timeout
 * - Offline encrypted telemetry buffering & HMAC signing
 * - Visible Windows system tray UI
 */

import EventEmitter from 'node:events';
import { AGENT_CONFIG, AGENT_STATES } from './config.js';
import { AgentConflictDetector } from './conflictDetector.js';
import { AgentLifecycleManager } from './lifecycle.js';
import { Win32Monitor } from './native/win32Monitor.js';
import { NativeInputCounterContract } from './native/inputCounter.js';
import { SecureStore } from './storage/secureStore.js';
import { SessionLeaseManager } from './managers/sessionLeaseManager.js';
import { TelemetryAggregator } from './managers/telemetryAggregator.js';
import { SyncEngine } from './managers/syncEngine.js';
import { TrayManager } from './ui/trayManager.js';
import { LocalAgentServer } from './server/localAgentServer.js';

export class NiyantranMonitoringAgentV2 extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;

    // Subsystems
    this.secureStore = options.secureStore || new SecureStore();
    this.conflictDetector = options.conflictDetector || AgentConflictDetector;
    this.lifecycle = new AgentLifecycleManager({
      conflictDetector: this.conflictDetector,
      onStateChange: (change) => this._handleStateChange(change),
    });

    this.win32Monitor = options.win32Monitor || new Win32Monitor();
    this.inputCounter = options.inputCounter || new NativeInputCounterContract();
    this.leaseManager = options.leaseManager || new SessionLeaseManager();
    this.aggregator = options.aggregator || new TelemetryAggregator();
    this.syncEngine = options.syncEngine || new SyncEngine({
      apiBaseUrl: options.apiBaseUrl || AGENT_CONFIG.API_BASE_URL,
    });
    this.trayManager = options.trayManager || new TrayManager({
      deviceId: options.deviceId || 'DEV-UNPAIRED',
    });
    this.localServer = options.localServer || new LocalAgentServer(this, {
      port: options.localServerPort,
      enabled: options.enableLocalServer !== false,
    });

    this.telemetryIntervalTimer = null;
    this.telemetryIntervalMs = options.telemetryIntervalMs || AGENT_CONFIG.TELEMETRY_INTERVAL_MS;

    this._bindEvents();
  }

  _bindEvents() {
    // Autonomous lease expiry triggers graceful stop
    this.leaseManager.on('lease_expired', (info) => {
      this.stopMonitoring('LEASE_EXPIRED');
      this.emit('lease_expired', info);
    });

    // Server rollback purges offline queue and halts
    this.leaseManager.on('lease_revoked', (info) => {
      this.syncEngine.purgeOfflineQueue();
      this.stopMonitoring('SERVER_ROLLBACK');
      this.emit('server_rollback', info);
    });

    this.syncEngine.on('server_rollback', (info) => {
      this.leaseManager.handleServerRollback();
    });

    // Tray action events
    this.trayManager.on('action', (action) => {
      if (action === 'START') this.startMonitoring('TRAY_MANUAL_SESSION');
      else if (action === 'PAUSE') this.pauseMonitoring('User paused from Tray');
      else if (action === 'RESUME') this.resumeMonitoring();
      else if (action === 'END') this.stopMonitoring('User ended from Tray');
      else if (action === 'EXIT') this.shutdown();
    });
  }

  _handleStateChange({ oldState, newState, details }) {
    this.trayManager.updateStatus(newState);
    this.emit('state_changed', { oldState, newState, details });
  }

  /**
   * Initializes the agent: Checks V1 conflict, loads DPAPI credentials, starts tray.
   */
  async initialize() {
    const initResult = await this.lifecycle.initialize();
    if (!initResult.success) {
      // V1 Conflict or Init Failure
      this.trayManager.start();
      return initResult;
    }

    // Load saved device credentials from Windows DPAPI
    const deviceId = await this.secureStore.getSecret('deviceId');
    const deviceKey = await this.secureStore.getSecret('deviceKey');
    if (deviceId && deviceKey) {
      this.syncEngine.setDeviceCredentials(deviceId, deviceKey);
      this.trayManager.deviceId = deviceId;
    }

    this.trayManager.start();
    this.localServer.start();
    return { success: true, state: this.lifecycle.getState() };
  }

  /**
   * Starts monitoring for an authorized session.
   *
   * @param {string} sessionId
   * @param {string} [deviceId]
   */
  startMonitoring(sessionId, deviceId = 'DEV-WIN32-ACTIVE') {
    this.lifecycle.startMonitoring(sessionId, deviceId);

    // Start Win32 monitor & lease manager
    this.win32Monitor.startMonitoring();
    this.leaseManager.startLease(sessionId);

    // Start periodic 60-second telemetry aggregation interval
    if (this.telemetryIntervalTimer) clearInterval(this.telemetryIntervalTimer);
    this.telemetryIntervalTimer = setInterval(() => {
      this.flushAndSyncTelemetry();
    }, this.telemetryIntervalMs);

    this.emit('monitoring_started', { sessionId, deviceId });
  }

  pauseMonitoring(reason = 'User Pause') {
    this.lifecycle.pauseMonitoring(reason);
    this.win32Monitor.pauseMonitoring();
    this.emit('monitoring_paused', { reason });
  }

  resumeMonitoring() {
    this.lifecycle.resumeMonitoring();
    this.win32Monitor.resumeMonitoring();
    this.emit('monitoring_resumed');
  }

  stopMonitoring(reason = 'Session End') {
    if (this.telemetryIntervalTimer) {
      clearInterval(this.telemetryIntervalTimer);
      this.telemetryIntervalTimer = null;
    }

    // Flush pending metrics and drain offline queue
    let flushPromise = Promise.resolve();
    if (this.lifecycle.getState() === AGENT_STATES.ACTIVE_MONITORING) {
      flushPromise = this.flushAndSyncTelemetry()
        .then(() => {
          if (this.syncEngine && typeof this.syncEngine.flushOfflineQueue === 'function') {
            return this.syncEngine.flushOfflineQueue();
          }
        })
        .catch((err) => {
          console.warn('[Agent] Final telemetry flush error:', err.message);
        });
    }

    this.win32Monitor.stopMonitoring();
    this.leaseManager.endLease(reason);
    this.lifecycle.shutdown();
    this.emit('monitoring_stopped', { reason });
    return flushPromise;
  }

  /**
   * Aggregates window metrics and transmits or buffers them.
   */
  async flushAndSyncTelemetry() {
    if (this.lifecycle.getState() !== AGENT_STATES.ACTIVE_MONITORING) return null;

    const appMetrics = this.win32Monitor.flushWindowMetrics(Math.round(this.telemetryIntervalMs / 1000));
    const inputMetrics = this.inputCounter.flushWindowMetrics(Math.round(this.telemetryIntervalMs / 1000));

    const sample = this.aggregator.aggregateWindow({
      sessionId: this.lifecycle.activeSessionId || 'SESSION-DEFAULT',
      deviceId: this.lifecycle.deviceId || 'DEV-WIN32',
      appMetrics,
      inputMetrics,
    });

    // Submit sample to server / offline buffer
    const result = await this.syncEngine.submitSample(sample);

    // CRITICAL: Only renew local authorization lease if submission was successful or server confirmed renewal
    if (result && result.success) {
      try {
        this.leaseManager.renewLease();
        if (this.lifecycle.activeSessionId) {
          this.syncEngine.renewServerLease(this.lifecycle.activeSessionId).catch(() => {});
        }
      } catch (_) {}
    }

    this.emit('telemetry_emitted', { sample, result });
    return sample;
  }

  shutdown() {
    this.stopMonitoring('AGENT_SHUTDOWN');
    this.trayManager.stop();
    this.localServer.stop();
    this.emit('shutdown_complete');
  }
}

export default NiyantranMonitoringAgentV2;
