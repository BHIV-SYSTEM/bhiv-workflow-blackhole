/**
 * Employee Monitoring V2 - HMAC Signature & Replay Nonce Validator
 * 
 * Verifies that telemetry samples are cryptographically signed by the registered device
 * and rejects replayed or stale payloads.
 */

const crypto = require('crypto');
const { MAX_CLOCK_SKEW_MS } = require('../config/constants');

/**
 * Validates HMAC-SHA256 signature against the device secret.
 * @param {string} payloadString - Stringified JSON request body
 * @param {string} secret - Shared secret issued during device enrollment
 * @param {string} expectedSignature - Hex signature from X-Device-Signature header
 */
function verifyDeviceHmac(payloadString, secret, expectedSignature) {
  if (!payloadString || !secret || !expectedSignature) return false;
  
  try {
    const computed = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
    const computedBuf = Buffer.from(computed, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');

    if (computedBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(computedBuf, expectedBuf);
  } catch (_) {
    return false;
  }
}

/**
 * Validates client timestamp to prevent replay attacks and detect clock drift.
 * @param {number|string} clientTimestamp - Milliseconds epoch from X-Client-Timestamp header
 */
function validateClockSkew(clientTimestamp) {
  const ts = Number(clientTimestamp);
  if (!Number.isFinite(ts) || ts <= 0) {
    return { valid: false, error: 'Invalid or missing client timestamp' };
  }

  const now = Date.now();
  const skew = Math.abs(now - ts);

  if (skew > MAX_CLOCK_SKEW_MS) {
    return {
      valid: false,
      error: `Clock skew exceeds allowed limit (${Math.round(skew / 1000)}s drift vs max ${MAX_CLOCK_SKEW_MS / 1000}s)`
    };
  }

  return { valid: true, skewMs: skew };
}

module.exports = {
  verifyDeviceHmac,
  validateClockSkew
};
