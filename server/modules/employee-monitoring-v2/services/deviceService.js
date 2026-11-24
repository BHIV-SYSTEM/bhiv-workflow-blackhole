/**
 * Employee Monitoring V2 - Device Management Service
 * 
 * Handles authenticated device enrollment, one-time pairing codes,
 * secure device credential issuance, and device revocation.
 */

const crypto = require('crypto');
const RegisteredDevice = require('../models/RegisteredDevice');
const DeviceAuditLog = require('../models/DeviceAuditLog');
const MonitoringSessionV2 = require('../models/MonitoringSessionV2');
const { AUDIT_EVENTS, SESSION_STATES } = require('../config/constants');
const { validateDeviceRegistration } = require('../contracts');
const { encrypt, decrypt } = require('./cryptoUtil');

// In-memory store for active pairing codes (TTL: 10 minutes)
// code -> { employeeId, expiresAt, attempts }
const activeEnrollmentCodes = new Map();

// Rate limiting store for code generation (1 hour window)
// employeeId -> [timestamp1, timestamp2, ...]
const enrollmentRateLimits = new Map();

const ENROLLMENT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ENROLLMENTS_PER_HOUR = 3;
const MAX_PAIR_ATTEMPTS = 5;

/**
 * Periodically purge expired enrollment codes
 */
function cleanupExpiredCodes() {
  const now = Date.now();
  for (const [code, entry] of activeEnrollmentCodes.entries()) {
    if (entry.expiresAt <= now) {
      activeEnrollmentCodes.delete(code);
    }
  }
}

/**
 * Generates a short-lived 6-digit one-time enrollment code for the employee.
 * Rate limited to 3 per hour.
 */
function generateEnrollmentCode(employeeId, meta = {}) {
  cleanupExpiredCodes();
  const empIdStr = String(employeeId);
  const now = Date.now();

  // Check rate limit
  const history = enrollmentRateLimits.get(empIdStr) || [];
  const oneHourAgo = now - 60 * 60 * 1000;
  const recentAttempts = history.filter((t) => t > oneHourAgo);

  if (recentAttempts.length >= MAX_ENROLLMENTS_PER_HOUR) {
    const error = new Error('Rate limit exceeded: You can only generate up to 3 pairing codes per hour.');
    error.statusCode = 429;
    error.code = 'RATE_LIMIT_EXCEEDED';
    throw error;
  }

  // Generate 6-digit numeric code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = now + ENROLLMENT_TTL_MS;

  activeEnrollmentCodes.set(code, {
    employeeId: empIdStr,
    expiresAt,
    attempts: 0
  });

  recentAttempts.push(now);
  enrollmentRateLimits.set(empIdStr, recentAttempts);

  // Return code and metadata (safe for UI)
  return {
    code,
    expiresAt: new Date(expiresAt).toISOString(),
    expiresInSeconds: Math.round(ENROLLMENT_TTL_MS / 1000)
  };
}

/**
 * Pairs a device using a valid one-time pairing code.
 * Issues deviceId and random 64-char hex deviceKey.
 */
async function pairDevice({ pairingCode, deviceName, platform, osVersion, agentVersion, manufacturer, model, machineUuid, ip, userAgent }) {
  cleanupExpiredCodes();
  if (!pairingCode || typeof pairingCode !== 'string') {
    const error = new Error('Pairing code is required');
    error.statusCode = 400;
    error.code = 'INVALID_CODE';
    throw error;
  }

  const cleanCode = pairingCode.trim();
  const enrollment = activeEnrollmentCodes.get(cleanCode);

  if (!enrollment) {
    const error = new Error('Invalid or expired enrollment code');
    error.statusCode = 400;
    error.code = 'INVALID_OR_EXPIRED_CODE';
    throw error;
  }

  if (enrollment.expiresAt < Date.now()) {
    activeEnrollmentCodes.delete(cleanCode);
    const error = new Error('Enrollment code has expired');
    error.statusCode = 400;
    error.code = 'ENROLLMENT_CODE_EXPIRED';
    throw error;
  }

  enrollment.attempts += 1;
  if (enrollment.attempts > MAX_PAIR_ATTEMPTS) {
    activeEnrollmentCodes.delete(cleanCode);
    const error = new Error('Maximum pairing attempts exceeded for this code');
    error.statusCode = 429;
    error.code = 'MAX_ATTEMPTS_EXCEEDED';
    throw error;
  }

  // Validate device payload
  const contractValidation = validateDeviceRegistration({ deviceName, platform });
  if (!contractValidation.valid) {
    const error = new Error(`Device validation failed: ${contractValidation.errors.join('; ')}`);
    error.statusCode = 400;
    error.code = 'CONTRACT_VALIDATION_ERROR';
    error.details = contractValidation.errors;
    throw error;
  }

  const employeeId = enrollment.employeeId;

  // Generate device credentials
  const deviceId = `v2_dev_${crypto.randomUUID().replace(/-/g, '')}`;
  const deviceKey = crypto.randomBytes(32).toString('hex'); // 64-char hex
  const deviceTokenHash = crypto.createHash('sha256').update(deviceKey).digest('hex');
  const encryptedDeviceKey = encrypt(deviceKey);

  // Create device record
  const newDevice = new RegisteredDevice({
    device_id: deviceId,
    employee: employeeId,
    device_name: deviceName.trim(),
    platform: platform ? platform.toLowerCase() : 'windows',
    manufacturer: manufacturer ? manufacturer.trim() : 'Acer',
    model: model ? model.trim() : 'Nitro AN515-57',
    machine_uuid: machineUuid ? String(machineUuid).trim() : null,
    os_version: osVersion || 'Unknown OS',
    agent_version: agentVersion || '2.0.0',
    device_token_hash: deviceTokenHash,
    encrypted_device_key: encryptedDeviceKey,
    status: 'ACTIVE',
    is_byod: true,
    last_seen_at: new Date(),
    last_ip: ip || null
  });

  await newDevice.save();

  // Invalidate pairing code immediately (one-time use)
  activeEnrollmentCodes.delete(cleanCode);

  // Write audit log
  await DeviceAuditLog.create({
    employee: employeeId,
    device_id: deviceId,
    event_type: AUDIT_EVENTS.DEVICE_REGISTERED,
    ip_address: ip || null,
    user_agent: userAgent || null,
    metadata: {
      deviceName,
      platform,
      osVersion,
      agentVersion,
      manufacturer: newDevice.manufacturer,
      model: newDevice.model,
      machineUuid: newDevice.machine_uuid
    }
  });

  return {
    deviceId,
    deviceKey,
    deviceName: newDevice.device_name,
    platform: newDevice.platform,
    manufacturer: newDevice.manufacturer,
    model: newDevice.model,
    machineUuid: newDevice.machine_uuid,
    status: newDevice.status,
    registeredAt: newDevice.createdAt
  };
}

/**
 * Returns devices enrolled by employeeId.
 * Strips out sensitive hash and encrypted key.
 */
async function getEmployeeDevices(employeeId) {
  const devices = await RegisteredDevice.find({ employee: employeeId })
    .select('-device_token_hash -encrypted_device_key')
    .sort({ createdAt: -1 })
    .lean();

  return devices;
}

/**
 * Retrieves device document by deviceId.
 */
async function getDeviceById(deviceId) {
  return RegisteredDevice.findOne({ device_id: deviceId });
}

/**
 * Decrypts and retrieves the device secret key for HMAC validation.
 */
function getDeviceSecret(device) {
  if (!device) return null;
  if (device.encrypted_device_key) {
    return decrypt(device.encrypted_device_key);
  }
  return null;
}

/**
 * Revokes a device. Terminating active sessions and preventing further telemetry.
 */
async function revokeDevice(deviceId, requestingUserId, requestingUserRole, reason = 'Device revoked') {
  const device = await RegisteredDevice.findOne({ device_id: deviceId });
  if (!device) {
    const error = new Error('Device not found');
    error.statusCode = 404;
    error.code = 'DEVICE_NOT_FOUND';
    throw error;
  }

  // Privilege check: employee owns device OR requesting user is Admin/SuperAdmin
  const isOwner = String(device.employee) === String(requestingUserId);
  const isAdmin = requestingUserRole === 'Admin' || requestingUserRole === 'SuperAdmin';

  if (!isOwner && !isAdmin) {
    const error = new Error('Access denied: You do not have permission to revoke this device');
    error.statusCode = 403;
    error.code = 'ACCESS_DENIED';
    throw error;
  }

  device.status = 'REVOKED';
  await device.save();

  // End any active sessions running on this device
  await MonitoringSessionV2.updateMany(
    {
      active_device: deviceId,
      state: { $in: [SESSION_STATES.ACTIVE, SESSION_STATES.PAUSED, SESSION_STATES.INITIALIZING] }
    },
    {
      $set: {
        state: SESSION_STATES.REVOKED,
        ended_at: new Date()
      }
    }
  );

  // Write audit log
  await DeviceAuditLog.create({
    employee: device.employee,
    device_id: deviceId,
    event_type: AUDIT_EVENTS.DEVICE_REVOKED,
    metadata: {
      revokedBy: requestingUserId,
      revokedByRole: requestingUserRole,
      reason
    }
  });

  return {
    success: true,
    deviceId,
    status: 'REVOKED',
    message: 'Device successfully revoked'
  };
}

module.exports = {
  generateEnrollmentCode,
  pairDevice,
  getEmployeeDevices,
  getDeviceById,
  getDeviceSecret,
  revokeDevice,
  _activeEnrollmentCodes: activeEnrollmentCodes, // Exported for unit testing
  _enrollmentRateLimits: enrollmentRateLimits
};
