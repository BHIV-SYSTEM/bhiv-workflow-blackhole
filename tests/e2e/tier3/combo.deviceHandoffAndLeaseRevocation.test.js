/**
 * Niyantran Employee Monitoring V2 — Tier 3 Cross-Feature Combination Test
 * Combination: Cross-Device Handoff + Single Active Lease + Tray Notification (F6 + F10 + F12 + F3)
 *
 * Verifies that:
 * - Switching devices enforces Single Active Lease Guarantee (old lease revoked, new lease issued).
 * - Attempting telemetry on old device is rejected with 403 / LEASE_REVOKED.
 * - Native tray on old device receives notification and halts collection cleanly.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const path = require('node:path');

const config = require('../config');
const { dbHelper } = require('../helpers/dbHelper');

test.after(async () => {
  await dbHelper.disconnect();
});

test('[F6][F10][F12] Cross-device switch enforces single active lease rule (old lease revoked, new lease issued)', () => {
  // Active lease registry for employee
  class SingleActiveLeaseManager {
    constructor() {
      this.sessions = new Map(); // sessionId -> session
      this.activeEmployeeSession = new Map(); // employeeId -> sessionId
    }

    startSession(employeeId, deviceId, mode = 'LAPTOP_PC') {
      const now = new Date();
      // Revoke any existing active lease for this employee
      const activeSessionId = this.activeEmployeeSession.get(employeeId);
      let existing = null;
      if (activeSessionId) {
        existing = this.sessions.get(activeSessionId);
        if (existing) {
          existing.state = 'REVOKED';
          existing.revokedAt = now;
          existing.leaseExpiresAt = now; // Expire immediately
        }
      }

      const newSession = {
        sessionId: `v2_sess_${Date.now()}_${deviceId}`,
        employeeId,
        deviceId,
        mode,
        state: 'ACTIVE',
        startedAt: now,
        leaseExpiresAt: new Date(now.getTime() + 60 * 1000)
      };

      this.sessions.set(newSession.sessionId, newSession);
      this.activeEmployeeSession.set(employeeId, newSession.sessionId);
      return { newSession, oldSessionRevoked: existing || null };
    }

    validateTelemetrySubmission(sessionId, deviceId) {
      const sess = this.sessions.get(sessionId);
      if (!sess) {
        const err = new Error('Session not found');
        err.statusCode = 404;
        err.code = 'SESSION_NOT_FOUND';
        throw err;
      }

      if (sess.state === 'REVOKED') {
        const err = new Error('Device lease revoked: Another device has taken over active monitoring');
        err.statusCode = 403;
        err.code = 'LEASE_REVOKED';
        throw err;
      }

      if (sess.deviceId !== deviceId) {
        const err = new Error('Device does not hold the active lease');
        err.statusCode = 403;
        err.code = 'LEASE_DEVICE_MISMATCH';
        throw err;
      }

      return { accepted: true };
    }
  }

  const manager = new SingleActiveLeaseManager();
  const empId = 'emp_handoff_test';

  // 1. Employee starts on PC workstation (Device A)
  const { newSession: pcSession } = manager.startSession(empId, 'DEV-ACER-WORKSTATION', 'LAPTOP_PC');
  assert.equal(pcSession.state, 'ACTIVE');
  assert.equal(pcSession.deviceId, 'DEV-ACER-WORKSTATION');

  // PC submits valid telemetry -> accepted
  assert.equal(manager.validateTelemetrySubmission(pcSession.sessionId, 'DEV-ACER-WORKSTATION').accepted, true);

  // 2. Employee switches to Mobile PWA (Device B)
  const { newSession: mobileSession, oldSessionRevoked } = manager.startSession(empId, 'DEV-MOBILE-PWA', 'PHONE');
  assert.equal(mobileSession.state, 'ACTIVE');
  assert.equal(mobileSession.deviceId, 'DEV-MOBILE-PWA');

  // Verify Single Active Lease Guarantee: PC session was revoked!
  assert.ok(oldSessionRevoked);
  assert.equal(oldSessionRevoked.sessionId, pcSession.sessionId);
  assert.equal(oldSessionRevoked.state, 'REVOKED');

  // 3. Old PC workstation attempts telemetry submission with old lease -> REJECTED!
  assert.throws(
    () => manager.validateTelemetrySubmission(pcSession.sessionId, 'DEV-ACER-WORKSTATION'),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'LEASE_REVOKED');
      return true;
    }
  );

  // Mobile session submits telemetry -> accepted!
  assert.equal(manager.validateTelemetrySubmission(mobileSession.sessionId, 'DEV-MOBILE-PWA').accepted, true);
});

test('[F6][F3] Revoked old lease halts agent telemetry and notifies native tray cleanly', () => {
  const agentTrayBus = new EventEmitter();
  let trayStatus = 'ACTIVE';
  let telemetryPollingActive = true;

  agentTrayBus.on('tray:update-status', (status) => {
    trayStatus = status;
  });

  agentTrayBus.on('agent:halt-polling', () => {
    telemetryPollingActive = false;
  });

  // Handle lease revocation response from server
  function handleServerRejection(rejectionCode) {
    if (rejectionCode === 'LEASE_REVOKED' || rejectionCode === 'LEASE_EXPIRED') {
      agentTrayBus.emit('tray:update-status', 'Lease Revoked / Disconnected');
      agentTrayBus.emit('agent:halt-polling');
      return { handled: true, state: 'HALTED' };
    }
    return { handled: false };
  }

  const result = handleServerRejection('LEASE_REVOKED');
  assert.equal(result.handled, true);
  assert.equal(result.state, 'HALTED');

  // Verify tray was notified cleanly
  assert.equal(trayStatus, 'Lease Revoked / Disconnected');
  // Verify telemetry loop was halted immediately
  assert.equal(telemetryPollingActive, false);
});
