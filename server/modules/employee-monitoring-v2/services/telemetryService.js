/**
 * Employee Monitoring V2 - Telemetry Ingestion Service
 * 
 * Ingests cryptographically signed 1-minute telemetry slices from desktop agents.
 * Enforces:
 * 1. HMAC-SHA256 signature verification.
 * 2. Clock skew tolerance check (<= 120s drift).
 * 3. Anti-surveillance privacy gate (strictly rejects forbidden text, screenshot, URL, windowTitle).
 * 4. 60-second lease verification with 30-second autonomous grace limit.
 * 5. Isolated persistence to monitoring_v2_telemetry collection.
 */

const AggregatedTelemetryV2 = require('../models/AggregatedTelemetryV2');
const MonitoringSessionV2 = require('../models/MonitoringSessionV2');
const RegisteredDevice = require('../models/RegisteredDevice');
const { getDeviceSecret } = require('./deviceService');
const { verifyDeviceHmac, validateClockSkew } = require('../security/hmacValidator');
const { validateTelemetrySample } = require('../contracts');
const { SESSION_STATES, SESSION_LEASE_SECONDS, CATEGORIES } = require('../config/constants');

function calculateFocusScore(payload) {
  const duration = payload.durationSeconds || 60;
  const idle = payload.hardwareIdleSeconds || 0;
  const active = Math.max(0, duration - idle);

  if (duration === 0) return 50;
  const activeRatio = active / duration;

  // Bonus if primary category is DEVELOPMENT or DOCUMENTATION
  const isFocusCategory = payload.activeProcessCategory === CATEGORIES.DEVELOPMENT ||
    payload.activeProcessCategory === CATEGORIES.DOCUMENTATION;

  let score = Math.round(activeRatio * 100);
  if (!isFocusCategory && payload.activeProcessCategory === CATEGORIES.SUPPORT) {
    score = Math.round(score * 0.9);
  } else if (!isFocusCategory) {
    score = Math.round(score * 0.8);
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Validates, authenticates, and ingests a single telemetry sample batch.
 */
async function ingestTelemetry({ deviceId, rawBody, signature, timestamp, ip = null }) {
  if (!deviceId) {
    const error = new Error('Missing x-device-id header');
    error.statusCode = 400;
    error.code = 'MISSING_DEVICE_ID';
    throw error;
  }

  // 1. Clock skew validation
  const skewCheck = validateClockSkew(timestamp);
  if (!skewCheck.valid) {
    const error = new Error(skewCheck.error);
    error.statusCode = 400;
    error.code = 'CLOCK_SKEW_REJECTED';
    throw error;
  }

  // 2. Device lookup & status check
  const device = await RegisteredDevice.findOne({ device_id: deviceId });
  if (!device) {
    const error = new Error('Device not found or not enrolled');
    error.statusCode = 403;
    error.code = 'DEVICE_NOT_FOUND';
    error.revoked = true;
    throw error;
  }

  if (device.status !== 'ACTIVE') {
    const error = new Error(`Device monitoring is not active (status: ${device.status})`);
    error.statusCode = 403;
    error.code = 'DEVICE_REVOKED';
    error.revoked = true;
    error.rollback = true;
    throw error;
  }

  // 3. Cryptographic HMAC signature check
  const secret = getDeviceSecret(device);
  if (!secret) {
    const error = new Error('Device cryptographic credentials unavailable');
    error.statusCode = 401;
    error.code = 'CREDENTIALS_UNAVAILABLE';
    throw error;
  }

  const bodyString = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
  const isSignatureValid = verifyDeviceHmac(bodyString, secret, signature, timestamp);
  if (!isSignatureValid) {
    const error = new Error('Invalid HMAC signature: payload has been tampered with or secret is invalid');
    error.statusCode = 401;
    error.code = 'INVALID_SIGNATURE';
    throw error;
  }

  // 4. Parse request body
  let payload;
  try {
    payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  } catch (err) {
    const error = new Error('Malformed JSON payload');
    error.statusCode = 400;
    error.code = 'INVALID_JSON';
    throw error;
  }

  // 5. Anti-Surveillance Gate Contract Validation
  const sampleValidation = validateTelemetrySample(payload);
  if (!sampleValidation.valid) {
    const error = new Error(`Telemetry rejected by Anti-Surveillance Gate: ${sampleValidation.errors.join('; ')}`);
    error.statusCode = 400;
    error.code = 'PRIVACY_VIOLATION';
    error.details = sampleValidation.errors;
    throw error;
  }

  // 6. Active Session & Lease Verification
  const sessionId = payload.sessionId;
  if (!sessionId) {
    const error = new Error('sessionId is required in telemetry sample');
    error.statusCode = 400;
    error.code = 'SESSION_ID_REQUIRED';
    throw error;
  }

  const session = await MonitoringSessionV2.findOne({
    session_id: sessionId,
    active_device: deviceId
  });

  if (!session) {
    const error = new Error('No active monitoring session found for this device');
    error.statusCode = 403;
    error.code = 'SESSION_NOT_FOUND';
    error.rollback = true;
    throw error;
  }

  if (session.state !== SESSION_STATES.ACTIVE) {
    const error = new Error(`Monitoring session is not active (current state: ${session.state})`);
    error.statusCode = 403;
    error.code = 'SESSION_NOT_ACTIVE';
    error.rollback = true;
    throw error;
  }

  // Check 60s lease with 30s grace window (total 90s offline collection)
  const now = new Date();
  const graceThreshold = new Date(now.getTime() - 30 * 1000);
  if (session.lease_expires_at < graceThreshold) {
    const error = new Error('Monitoring lease has expired. Device must re-authorize session before submitting telemetry.');
    error.statusCode = 403;
    error.code = 'LEASE_EXPIRED';
    error.rollback = true;
    throw error;
  }

  // 7. Duplicate Event Rejection: Check if minute slice already exists
  const minuteTimestamp = new Date(now);
  minuteTimestamp.setSeconds(0, 0);

  const existingSlice = await AggregatedTelemetryV2.findOne({
    session_id: session.session_id,
    minute_timestamp: minuteTimestamp
  });

  if (existingSlice) {
    const error = new Error('Duplicate telemetry event: A telemetry slice for this minute has already been recorded');
    error.statusCode = 409;
    error.code = 'DUPLICATE_EVENT';
    throw error;
  }

  // 8. Store Telemetry in isolated collection
  const duration = payload.durationSeconds || 60;
  const idleSeconds = payload.hardwareIdleSeconds || 0;
  const activeSeconds = payload.activeSeconds || Math.max(0, duration - idleSeconds);

  const telemetryRecord = new AggregatedTelemetryV2({
    session_id: session.session_id,
    employee: session.employee,
    device_id: deviceId,
    minute_timestamp: minuteTimestamp,
    duration_seconds: duration,
    activity_counts: {
      key_presses: payload.keyPressCount || 0,
      mouse_events: payload.mouseActivityDelta || 0,
      scroll_events: 0,
      hardware_idle_seconds: idleSeconds
    },
    primary_category: payload.activeProcessCategory || CATEGORIES.NEUTRAL,
    task_id: session.active_task_id || null,
    focus_score: calculateFocusScore(payload),
    sync_type: payload.syncType || 'REALTIME'
  });

  await telemetryRecord.save();

  // 9. Update Session accumulated metrics (without extending authorization lease)
  session.accumulated_seconds.active += activeSeconds;
  session.accumulated_seconds.idle += idleSeconds;
  if (payload.activeProcessCategory === CATEGORIES.DEVELOPMENT || payload.activeProcessCategory === CATEGORIES.DOCUMENTATION) {
    session.accumulated_seconds.focused_work += activeSeconds;
  }
  await session.save();

  // 10. Touch device last seen
  device.last_seen_at = now;
  if (ip) device.last_ip = ip;
  await device.save();

  const remainingSeconds = Math.max(0, Math.round((new Date(session.lease_expires_at).getTime() - now.getTime()) / 1000));

  return {
    accepted: true,
    sessionId: session.session_id,
    leaseExpiresAt: session.lease_expires_at.toISOString(),
    remainingSeconds,
    persistedAt: now.toISOString()
  };
}

/**
 * Queries aggregated telemetry history for an employee within a date range.
 */
async function getAggregatedTelemetry(employeeId, { startDate, endDate, sessionId = null, limit = 100 } = {}) {
  const query = { employee: employeeId };

  if (sessionId) {
    query.session_id = sessionId;
  }

  if (startDate || endDate) {
    query.minute_timestamp = {};
    if (startDate) query.minute_timestamp.$gte = new Date(startDate);
    if (endDate) query.minute_timestamp.$lte = new Date(endDate);
  }

  const records = await AggregatedTelemetryV2.find(query)
    .sort({ minute_timestamp: -1 })
    .limit(Math.min(limit, 500))
    .lean();

  return records;
}

module.exports = {
  ingestTelemetry,
  getAggregatedTelemetry
};
