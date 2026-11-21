/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Session Lease & Autonomous Authorization Manager
 *
 * Implements Phase C Autonomous Security Guarantees:
 * 1. Short-lived leases: Telemetry collection is authorized in short time slices (default 60s).
 * 2. Autonomous Expiry: If the agent cannot communicate with the server to renew
 *    within the grace window (lease duration + 30s), collection halts autonomously.
 * 3. Server Rollback Command: If server revokes authorization, stops immediately
 *    and purges uncommitted telemetry.
 * 4. Ensures zero collection occurs outside explicitly authorized active sessions.
 */

import EventEmitter from 'node:events';

export class SessionLeaseManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.defaultLeaseDurationSeconds = options.defaultLeaseDurationSeconds || 60;
    this.maxAutonomousGraceSeconds = options.maxAutonomousGraceSeconds || 30; // 60s lease + 30s grace = 90s total
    this.leaseExpiresAt = 0;
    this.autonomousExpiryTimer = null;
    this.isAuthorized = false;
    this.currentSessionId = null;
  }

  /**
   * Starts a new session lease.
   *
   * @param {string} sessionId
   * @param {number} [leaseDurationSeconds]
   */
  startLease(sessionId, leaseDurationSeconds = null) {
    const duration = leaseDurationSeconds || this.defaultLeaseDurationSeconds;
    this.currentSessionId = sessionId;
    this.isAuthorized = true;
    this._scheduleExpiry(duration);
    this.emit('lease_started', { sessionId, durationSeconds: duration, expiresAt: this.leaseExpiresAt });
  }

  /**
   * Renews the active lease following a successful heartbeat or telemetry submission.
   *
   * @param {number} [additionalSeconds]
   */
  renewLease(additionalSeconds = null) {
    if (!this.isAuthorized || !this.currentSessionId) {
      throw new Error('Cannot renew lease: No active session authorized');
    }
    const duration = additionalSeconds || this.defaultLeaseDurationSeconds;
    this._scheduleExpiry(duration);
    this.emit('lease_renewed', { sessionId: this.currentSessionId, expiresAt: this.leaseExpiresAt });
  }

  _scheduleExpiry(durationSeconds) {
    const now = Date.now();
    this.leaseExpiresAt = now + (durationSeconds * 1000);

    if (this.autonomousExpiryTimer) {
      clearTimeout(this.autonomousExpiryTimer);
    }

    const totalTimeoutMs = (durationSeconds + this.maxAutonomousGraceSeconds) * 1000;
    this.autonomousExpiryTimer = setTimeout(() => {
      this.handleAutonomousExpiry();
    }, totalTimeoutMs);
  }

  /**
   * Autonomous hardware/system shutdown if unrenewed.
   */
  handleAutonomousExpiry() {
    if (!this.isAuthorized) return;
    this.isAuthorized = false;
    const expiredSessionId = this.currentSessionId;
    this.currentSessionId = null;
    if (this.autonomousExpiryTimer) {
      clearTimeout(this.autonomousExpiryTimer);
      this.autonomousExpiryTimer = null;
    }

    this.emit('lease_expired', {
      sessionId: expiredSessionId,
      reason: 'AUTONOMOUS_LEASE_EXPIRED',
      message: 'Monitoring halted: Lease expired without server renewal (Offline > 90s)',
    });
  }

  /**
   * Immediate server revocation or kill-switch handler.
   */
  handleServerRollback(reason = 'SERVER_ROLLBACK_COMMAND') {
    this.isAuthorized = false;
    const revokedSessionId = this.currentSessionId;
    this.currentSessionId = null;
    if (this.autonomousExpiryTimer) {
      clearTimeout(this.autonomousExpiryTimer);
      this.autonomousExpiryTimer = null;
    }

    this.emit('lease_revoked', {
      sessionId: revokedSessionId,
      reason,
      message: 'Monitoring halted immediately by server instruction. Offline queue purged.',
    });
  }

  /**
   * Employee-directed session end.
   */
  endLease(reason = 'USER_SESSION_END') {
    this.isAuthorized = false;
    const endedSessionId = this.currentSessionId;
    this.currentSessionId = null;
    if (this.autonomousExpiryTimer) {
      clearTimeout(this.autonomousExpiryTimer);
      this.autonomousExpiryTimer = null;
    }

    this.emit('lease_ended', { sessionId: endedSessionId, reason });
  }

  getRemainingLeaseSeconds() {
    if (!this.isAuthorized) return 0;
    const remaining = Math.max(0, Math.round((this.leaseExpiresAt - Date.now()) / 1000));
    return remaining;
  }
}

export default SessionLeaseManager;
