/**
 * Employee Monitoring V2 - Shared Request & Response Contracts
 * 
 * Provides runtime validation functions for V2 payloads.
 * Pure contract validators: no database dependencies or active hooks.
 */

const { DEVICE_MODES, SESSION_STATES, CATEGORIES } = require('../config/constants');

/**
 * Validates a device registration request payload.
 */
function validateDeviceRegistration(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be a non-null object'] };
  }
  if (!payload.deviceName || typeof payload.deviceName !== 'string' || payload.deviceName.trim().length === 0) {
    errors.push('deviceName is required and must be a non-empty string');
  }
  const validPlatforms = ['windows', 'macos', 'linux', 'ios_pwa', 'android_pwa'];
  if (!payload.platform || !validPlatforms.includes(payload.platform)) {
    errors.push(`platform must be one of: ${validPlatforms.join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validates a session start request payload.
 */
function validateSessionStart(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be a non-null object'] };
  }
  if (!payload.mode || !Object.values(DEVICE_MODES).includes(payload.mode)) {
    errors.push(`mode must be one of: ${Object.values(DEVICE_MODES).join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validates an aggregated telemetry batch sample.
 * Ensures strict BYOD privacy: rejects any sample containing raw text or image fields.
 */
function validateTelemetrySample(sample) {
  const errors = [];
  if (!sample || typeof sample !== 'object') {
    return { valid: false, errors: ['Sample must be an object'] };
  }

  // Anti-Surveillance Gate: Strictly reject forbidden fields
  const forbiddenFields = ['text', 'keystrokes', 'screenshot', 'image', 'base64', 'clipboard', 'url', 'windowTitle'];
  for (const field of forbiddenFields) {
    if (Object.prototype.hasOwnProperty.call(sample, field)) {
      errors.push(`CRITICAL PRIVACY VIOLATION: Forbidden field '${field}' detected in telemetry payload`);
    }
  }

  if (typeof sample.keyPressCount !== 'number' || sample.keyPressCount < 0) {
    errors.push('keyPressCount must be a non-negative integer');
  }
  if (typeof sample.mouseActivityDelta !== 'number' || sample.mouseActivityDelta < 0) {
    errors.push('mouseActivityDelta must be a non-negative number');
  }
  if (typeof sample.hardwareIdleSeconds !== 'number' || sample.hardwareIdleSeconds < 0) {
    errors.push('hardwareIdleSeconds must be a non-negative number');
  }
  if (sample.activeProcessCategory && !Object.values(CATEGORIES).includes(sample.activeProcessCategory)) {
    errors.push(`activeProcessCategory must be one of: ${Object.values(CATEGORIES).join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  validateDeviceRegistration,
  validateSessionStart,
  validateTelemetrySample
};
