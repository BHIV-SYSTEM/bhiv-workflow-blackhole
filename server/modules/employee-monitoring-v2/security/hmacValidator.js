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
 * Supports both canonical `${timestamp}:${payloadString}` and direct payload strings.
 * @param {string} payloadString - Stringified JSON request body
 * @param {string} secret - Shared secret issued during device enrollment
 * @param {string} expectedSignature - Hex signature from X-Device-Signature header
 * @param {number|string} [timestamp] - Optional client timestamp from X-Timestamp header
 */
function verifyDeviceHmac(payloadString, secret, expectedSignature, timestamp = null) {
  if (!payloadString || !secret || !expectedSignature) return false;

  try {
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');

    // 1. If timestamp provided, test canonical "${timestamp}:${payloadString}"
    if (timestamp) {
      const canonical = `${timestamp}:${payloadString}`;
      const computedCanonical = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
      const canonicalBuf = Buffer.from(computedCanonical, 'utf8');
      if (canonicalBuf.length === expectedBuf.length && crypto.timingSafeEqual(canonicalBuf, expectedBuf)) {
        return true;
      }
    }

    // 2. Fallback: check direct payload string
    const computed = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
    const computedBuf = Buffer.from(computed, 'utf8');

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
  let ts = Number(clientTimestamp);
  if (!Number.isFinite(ts) || ts <= 0) {
    ts = Date.parse(clientTimestamp);
  }
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
