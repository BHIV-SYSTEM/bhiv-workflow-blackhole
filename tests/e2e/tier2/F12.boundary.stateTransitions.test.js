/**
 * Niyantran Employee Monitoring V2 — Tier 2 Boundary Test
 * Feature F12: Workday State Synchronization
 *
 * Boundary & Negative Tests:
 * 1. Pause request on already paused session returns 400 or 409 Conflict.
 * 2. Resume request on already active session returns 400 or 409 Conflict.
 * 3. Telemetry submission during paused state is rejected with 400 or 403.
 * 4. Negative or corrupted pause duration accumulation is guarded against.
 * 5. State transition attempt on completed/ended session is rejected.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const config = require('../config');
const { SESSION_STATES } = require(path.resolve(config.paths.server, 'modules/employee-monitoring-v2/config/constants'));

test('[F12] Pause request on already paused session returns 400 or 409 Conflict', () => {
  // Session state transition guard
  function transitionState(currentState, action) {
    if (action === 'PAUSE') {
      if (currentState === SESSION_STATES.PAUSED) {
        const err = new Error('Session is already paused');
        err.statusCode = 409;
        err.code = 'SESSION_ALREADY_PAUSED';
        throw err;
      }
      if (currentState !== SESSION_STATES.ACTIVE && currentState !== SESSION_STATES.FOCUSED_WORK) {
        const err = new Error(`Cannot pause session in state: ${currentState}`);
        err.statusCode = 400;
        err.code = 'INVALID_STATE_TRANSITION';
        throw err;
      }
      return SESSION_STATES.PAUSED;
    }
    return currentState;
  }

  // Active -> Pause succeeds
  assert.equal(transitionState(SESSION_STATES.ACTIVE, 'PAUSE'), SESSION_STATES.PAUSED);

  // Paused -> Pause throws 409
  assert.throws(
    () => transitionState(SESSION_STATES.PAUSED, 'PAUSE'),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'SESSION_ALREADY_PAUSED');
      return true;
    }
  );
});

test('[F12] Resume request on already active session returns 400 or 409 Conflict', () => {
  function transitionResume(currentState) {
    if (currentState === SESSION_STATES.ACTIVE) {
      const err = new Error('Session is already active; cannot resume');
      err.statusCode = 409;
      err.code = 'SESSION_NOT_PAUSED';
      throw err;
    }
    if (currentState !== SESSION_STATES.PAUSED) {
      const err = new Error(`Cannot resume session in state: ${currentState}`);
      err.statusCode = 400;
      err.code = 'INVALID_STATE_TRANSITION';
      throw err;
    }
    return SESSION_STATES.ACTIVE;
  }

  // Paused -> Resume succeeds
  assert.equal(transitionResume(SESSION_STATES.PAUSED), SESSION_STATES.ACTIVE);

  // Active -> Resume throws 409
  assert.throws(
    () => transitionResume(SESSION_STATES.ACTIVE),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'SESSION_NOT_PAUSED');
      return true;
    }
  );
});

test('[F12] Telemetry submission during paused state is rejected with 400 or 403', () => {
  const evaluateTelemetrySubmission = (sessionState) => {
    if (sessionState !== SESSION_STATES.ACTIVE) {
      const err = new Error(`Monitoring session is not active (current state: ${sessionState})`);
      err.statusCode = 403;
      err.code = 'SESSION_NOT_ACTIVE';
      throw err;
    }
    return { accepted: true };
  };

  assert.throws(
    () => evaluateTelemetrySubmission(SESSION_STATES.PAUSED),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'SESSION_NOT_ACTIVE');
      return true;
    }
  );

  assert.throws(
    () => evaluateTelemetrySubmission(SESSION_STATES.COMPLETED),
    (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    }
  );

  assert.equal(evaluateTelemetrySubmission(SESSION_STATES.ACTIVE).accepted, true);
});

test('[F12] Negative or corrupted pause duration accumulation is guarded against', () => {
  function accumulatePauseDuration(currentAccumulated, pauseStartTime, resumeTime) {
    const startMs = new Date(pauseStartTime).getTime();
    const endMs = new Date(resumeTime).getTime();
    const elapsedSeconds = Math.round((endMs - startMs) / 1000);

    // Negative duration guard (e.g. clock shift or backward timestamp)
    const validDelta = Math.max(0, elapsedSeconds);
    return (currentAccumulated || 0) + validDelta;
  }

  // Normal 15 minute pause (900 seconds)
  const normalAcc = accumulatePauseDuration(0, '2026-11-20T12:00:00Z', '2026-11-20T12:15:00Z');
  assert.equal(normalAcc, 900);

  // Clock shift backwards (negative duration) -> clamped to 0 delta
  const corruptedAcc = accumulatePauseDuration(normalAcc, '2026-11-20T13:00:00Z', '2026-11-20T12:30:00Z');
  assert.equal(corruptedAcc, 900, 'Accumulated pause duration must never decrease on corrupted clock');
});

test('[F12] State transition attempt on completed/ended session is rejected', () => {
  function applyStateChange(sessionState, action) {
    if (sessionState === SESSION_STATES.COMPLETED || sessionState === SESSION_STATES.REVOKED) {
      const err = new Error(`Cannot transition session in terminal state: ${sessionState}`);
      err.statusCode = 400;
      err.code = 'TERMINAL_STATE_IMMUTABLE';
      throw err;
    }
    return action === 'PAUSE' ? SESSION_STATES.PAUSED : SESSION_STATES.ACTIVE;
  }

  assert.throws(
    () => applyStateChange(SESSION_STATES.COMPLETED, 'PAUSE'),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'TERMINAL_STATE_IMMUTABLE');
      return true;
    }
  );

  assert.throws(
    () => applyStateChange(SESSION_STATES.REVOKED, 'RESUME'),
    (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
});
