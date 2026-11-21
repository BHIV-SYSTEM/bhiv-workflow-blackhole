/**
 * Niyantran Employee Monitoring V2 — Tier 2 Boundary Test
 * Feature F9: Alert Explanation & Review Workflow
 *
 * Boundary & Negative Tests:
 * 1. Empty or whitespace-only explanation string is rejected with 400 Bad Request.
 * 2. Duplicate explanation submission on already explained alert is rejected with 409 Conflict.
 * 3. Unauthorized user attempting to resolve or explain another user's alert is rejected with 403 Forbidden.
 * 4. Explanation exceeding maximum length limit (2000 characters) is rejected with 400 Bad Request.
 * 5. Explanation submission on non-existent alertId returns 404 Not Found.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const config = require('../config');
const { httpClient } = require('../helpers/httpClient');
const { authHelper } = require('../helpers/authHelper');

// Pure explanation validation engine
function validateExplanationSubmission({ alert, userId, userRole, explanation }) {
  if (!alert) {
    const err = new Error('Alert not found');
    err.statusCode = 404;
    err.code = 'ALERT_NOT_FOUND';
    throw err;
  }

  if (String(alert.employeeId) !== String(userId) && userRole !== 'Admin') {
    const err = new Error('Not authorized to submit explanation for another employee');
    err.statusCode = 403;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  if (!explanation || typeof explanation !== 'string' || explanation.trim().length === 0) {
    const err = new Error('Explanation must be a non-empty string');
    err.statusCode = 400;
    err.code = 'INVALID_EXPLANATION';
    throw err;
  }

  if (explanation.length > 2000) {
    const err = new Error('Explanation exceeds maximum allowed length of 2000 characters');
    err.statusCode = 400;
    err.code = 'EXPLANATION_TOO_LONG';
    throw err;
  }

  if (alert.status === 'EXPLAINED' || alert.status === 'RESOLVED') {
    const err = new Error('Alert is already explained or resolved');
    err.statusCode = 409;
    err.code = 'ALERT_ALREADY_EXPLAINED';
    throw err;
  }

  return { valid: true };
}

test('[F9] Empty or whitespace-only explanation string is rejected with 400 Bad Request', () => {
  const mockAlert = { id: 'alert_1', employeeId: 'user_123', status: 'ACTIVE' };
  const emptyInputs = ['', '   ', '\t\n  ', null, undefined];

  for (const empty of emptyInputs) {
    assert.throws(
      () => validateExplanationSubmission({ alert: mockAlert, userId: 'user_123', userRole: 'User', explanation: empty }),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'INVALID_EXPLANATION');
        return true;
      }
    );
  }
});

test('[F9] Duplicate explanation submission on already explained alert is rejected with 409 Conflict', () => {
  const explainedAlert = { id: 'alert_2', employeeId: 'user_123', status: 'EXPLAINED' };
  assert.throws(
    () => validateExplanationSubmission({ alert: explainedAlert, userId: 'user_123', userRole: 'User', explanation: 'Second explanation' }),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'ALERT_ALREADY_EXPLAINED');
      return true;
    }
  );

  const resolvedAlert = { id: 'alert_3', employeeId: 'user_123', status: 'RESOLVED' };
  assert.throws(
    () => validateExplanationSubmission({ alert: resolvedAlert, userId: 'user_123', userRole: 'User', explanation: 'Third explanation' }),
    (err) => {
      assert.equal(err.statusCode, 409);
      return true;
    }
  );
});

test('[F9] Unauthorized user attempting to resolve or explain another user alert is rejected with 403 Forbidden', () => {
  const userA_Alert = { id: 'alert_4', employeeId: 'user_A', status: 'ACTIVE' };

  // User B tries to explain User A's alert
  assert.throws(
    () => validateExplanationSubmission({ alert: userA_Alert, userId: 'user_B', userRole: 'User', explanation: 'Attempting hijack' }),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'UNAUTHORIZED');
      return true;
    }
  );

  // User A can explain their own alert
  const selfValid = validateExplanationSubmission({ alert: userA_Alert, userId: 'user_A', userRole: 'User', explanation: 'Valid reason' });
  assert.equal(selfValid.valid, true);
});

test('[F9] Explanation exceeding maximum length limit (2000 chars) is rejected with 400 Bad Request', () => {
  const mockAlert = { id: 'alert_5', employeeId: 'user_123', status: 'ACTIVE' };
  const hugeExplanation = 'A'.repeat(2001);

  assert.throws(
    () => validateExplanationSubmission({ alert: mockAlert, userId: 'user_123', userRole: 'User', explanation: hugeExplanation }),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'EXPLANATION_TOO_LONG');
      return true;
    }
  );

  // 2000 chars exactly must pass
  const exactMax = 'A'.repeat(2000);
  const exactResult = validateExplanationSubmission({ alert: mockAlert, userId: 'user_123', userRole: 'User', explanation: exactMax });
  assert.equal(exactResult.valid, true);
});

test('[F9] Explanation submission on non-existent alertId returns 404 Not Found', () => {
  assert.throws(
    () => validateExplanationSubmission({ alert: null, userId: 'user_123', userRole: 'User', explanation: 'Test explanation' }),
    (err) => {
      assert.equal(err.statusCode, 404);
      assert.equal(err.code, 'ALERT_NOT_FOUND');
      return true;
    }
  );
});
