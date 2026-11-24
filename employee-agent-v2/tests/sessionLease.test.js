/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Session Lease & Autonomous Expiry Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionLeaseManager } from '../src/managers/sessionLeaseManager.js';

test('SessionLeaseManager: starts lease and accurately reports remaining duration', () => {
  const manager = new SessionLeaseManager({ defaultLeaseDurationSeconds: 60 });
  manager.startLease('SESSION-TEST-001', 60);

  assert.equal(manager.isAuthorized, true);
  assert.equal(manager.currentSessionId, 'SESSION-TEST-001');

  const remaining = manager.getRemainingLeaseSeconds();
  assert.ok(remaining >= 58 && remaining <= 60, `Remaining seconds should be ~60, got ${remaining}`);

  manager.endLease();
  assert.equal(manager.isAuthorized, false);
  assert.equal(manager.getRemainingLeaseSeconds(), 0);
});

test('SessionLeaseManager: renews active lease and updates expiry', () => {
  const manager = new SessionLeaseManager({ defaultLeaseDurationSeconds: 30 });
  manager.startLease('SESSION-TEST-002', 30);
  const firstExpiry = manager.leaseExpiresAt;

  // Renew for 90 seconds
  manager.renewLease(90);
  assert.ok(manager.leaseExpiresAt > firstExpiry);
  assert.equal(manager.isAuthorized, true);

  manager.endLease();
});

test('SessionLeaseManager: autonomous expiry triggers shutdown event when unrenewed', (t, done) => {
  // Test with very short lease (10ms) and zero grace
  const manager = new SessionLeaseManager({
    defaultLeaseDurationSeconds: 0.05,
    maxAutonomousGraceSeconds: 0.05,
  });

  manager.on('lease_expired', (info) => {
    assert.equal(info.reason, 'AUTONOMOUS_LEASE_EXPIRED');
    assert.equal(info.sessionId, 'SESSION-AUTO-EXPIRE');
    assert.equal(manager.isAuthorized, false);
    done();
  });

  manager.startLease('SESSION-AUTO-EXPIRE', 0.05);
});

test('SessionLeaseManager: server rollback immediately halts authorization', () => {
  const manager = new SessionLeaseManager();
  manager.startLease('SESSION-REVOKE-001', 60);

  let revokedEventFired = false;
  manager.on('lease_revoked', (info) => {
    revokedEventFired = true;
    assert.equal(info.reason, 'SERVER_ROLLBACK_COMMAND');
  });

  manager.handleServerRollback('SERVER_ROLLBACK_COMMAND');

  assert.equal(revokedEventFired, true);
  assert.equal(manager.isAuthorized, false);
  assert.equal(manager.currentSessionId, null);
});
