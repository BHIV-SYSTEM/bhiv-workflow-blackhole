/**
 * Employee Monitoring V2 - Session Lifecycle & Lease Service
 * 
 * Enforces the Single Active Lease Rule:
 * An employee can have at most one active monitoring lease at any time.
 * Governs 60-second authorization leases and autonomous 90-second expiry bounds.
 * Purely isolated from HR Attendance models.
 */

const crypto = require('crypto');
const MonitoringSessionV2 = require('../models/MonitoringSessionV2');
const DeviceAuditLog = require('../models/DeviceAuditLog');
const { getDeviceById } = require('./deviceService');
const { SESSION_STATES, DEVICE_MODES, SESSION_LEASE_SECONDS, AUDIT_EVENTS } = require('../config/constants');
const { validateSessionStart } = require('../contracts');

/**
 * Initiates a new monitoring session with a 60-second lease.
 * Concludes any existing active session for the employee to guarantee
 * single active ownership.
 */
async function startSession({ employeeId, mode = DEVICE_MODES.LAPTOP_PC, deviceId, taskId = null, ip = null, userAgent = null }) {
  const contractValidation = validateSessionStart({ mode });
  if (!contractValidation.valid) {
    const error = new Error(`Invalid session parameters: ${contractValidation.errors.join('; ')}`);
    error.statusCode = 400;
    error.code = 'INVALID_SESSION_PARAMS';
    throw error;
  }

  // Validate device if LAPTOP_PC mode
  if (mode === DEVICE_MODES.LAPTOP_PC) {
    if (!deviceId) {
      const error = new Error('deviceId is required for LAPTOP_PC session mode');
      error.statusCode = 400;
      error.code = 'DEVICE_ID_REQUIRED';
      throw error;
    }

    const device = await getDeviceById(deviceId);
    if (!device) {
      const error = new Error('Registered device not found');
      error.statusCode = 404;
      error.code = 'DEVICE_NOT_FOUND';
      throw error;
    }

    if (String(device.employee) !== String(employeeId)) {
      const error = new Error('Access denied: Device does not belong to this employee');
      error.statusCode = 403;
      error.code = 'DEVICE_UNAUTHORIZED';
      throw error;
    }

    if (device.status !== 'ACTIVE') {
      const error = new Error(`Device is not active (current status: ${device.status})`);
      error.statusCode = 403;
      error.code = 'DEVICE_INACTIVE';
      throw error;
    }
  }

  const now = new Date();
  const dateKey = now.toISOString().split('T')[0];

  // Single Active Lease Guarantee: Conclude any existing active/paused session
  const existingActiveSessions = await MonitoringSessionV2.find({
    employee: employeeId,
    state: { $in: [SESSION_STATES.ACTIVE, SESSION_STATES.PAUSED, SESSION_STATES.INITIALIZING] }
  });

  for (const prevSession of existingActiveSessions) {
    prevSession.state = SESSION_STATES.COMPLETED;
    prevSession.ended_at = now;
    if (deviceId && prevSession.active_device !== deviceId) {
      prevSession.handoff_history.push({
        from_device: prevSession.active_device || 'UNKNOWN',
        to_device: deviceId,
        transferred_at: now,
        transfer_reason: 'DEVICE_SWITCH'
      });
    }
    await prevSession.save();
  }

  // Create new session
  const sessionId = `v2_sess_${crypto.randomUUID().replace(/-/g, '')}_${now.getTime()}`;
  const leaseExpiresAt = new Date(now.getTime() + SESSION_LEASE_SECONDS * 1000);

  const newSession = new MonitoringSessionV2({
    session_id: sessionId,
    employee: employeeId,
    date: dateKey,
    mode,
    active_device: deviceId || null,
    state: SESSION_STATES.ACTIVE,
    lease_expires_at: leaseExpiresAt,
    active_task_id: taskId,
    accumulated_seconds: {
      active: 0,
      focused_work: 0,
      idle: 0,
      paused: 0
    },
    started_at: now
  });

  await newSession.save();

  // Audit log
  await DeviceAuditLog.create({
    employee: employeeId,
    device_id: deviceId || null,
    event_type: AUDIT_EVENTS.SESSION_STARTED,
    ip_address: ip,
    user_agent: userAgent,
    metadata: {
      sessionId,
      mode,
      taskId
    }
  });

  return {
    sessionId: newSession.session_id,
    mode: newSession.mode,
    deviceId: newSession.active_device,
    state: newSession.state,
    leaseExpiresAt: newSession.lease_expires_at.toISOString(),
    leaseSeconds: SESSION_LEASE_SECONDS,
    startedAt: newSession.started_at.toISOString()
  };
}

/**
 * Pauses an active monitoring session.
 */
async function pauseSession(sessionId, employeeId, reason = 'Break') {
  const session = await MonitoringSessionV2.findOne({ session_id: sessionId });
  if (!session) {
    const error = new Error('Session not found');
    error.statusCode = 404;
    error.code = 'SESSION_NOT_FOUND';
    throw error;
  }

  if (String(session.employee) !== String(employeeId)) {
    const error = new Error('Access denied: You do not own this session');
    error.statusCode = 403;
    error.code = 'ACCESS_DENIED';
    throw error;
  }

  session.state = SESSION_STATES.PAUSED;
  await session.save();

  await DeviceAuditLog.create({
    employee: employeeId,
    device_id: session.active_device,
    event_type: AUDIT_EVENTS.SESSION_PAUSED,
    metadata: { sessionId, reason }
  });

  return {
    sessionId: session.session_id,
    state: session.state,
    pausedAt: new Date().toISOString()
  };
}

/**
 * Resumes a paused monitoring session with a fresh 60s lease.
 */
async function resumeSession(sessionId, employeeId) {
  const session = await MonitoringSessionV2.findOne({ session_id: sessionId });
  if (!session) {
    const error = new Error('Session not found');
    error.statusCode = 404;
    error.code = 'SESSION_NOT_FOUND';
    throw error;
  }

  if (String(session.employee) !== String(employeeId)) {
    const error = new Error('Access denied: You do not own this session');
    error.statusCode = 403;
    error.code = 'ACCESS_DENIED';
    throw error;
  }

  const now = new Date();
  session.state = SESSION_STATES.ACTIVE;
  session.lease_expires_at = new Date(now.getTime() + SESSION_LEASE_SECONDS * 1000);
  await session.save();

  await DeviceAuditLog.create({
    employee: employeeId,
    device_id: session.active_device,
    event_type: AUDIT_EVENTS.SESSION_RESUMED,
    metadata: { sessionId }
  });

  return {
    sessionId: session.session_id,
    state: session.state,
    leaseExpiresAt: session.lease_expires_at.toISOString(),
    leaseSeconds: SESSION_LEASE_SECONDS,
    resumedAt: now.toISOString()
  };
}

/**
 * Ends a monitoring session permanently.
 */
async function endSession(sessionId, employeeId, requestingUserRole = 'Employee') {
  const session = await MonitoringSessionV2.findOne({ session_id: sessionId });
  if (!session) {
    const error = new Error('Session not found');
    error.statusCode = 404;
    error.code = 'SESSION_NOT_FOUND';
    throw error;
  }

  const isOwner = String(session.employee) === String(employeeId);
  const isAdmin = requestingUserRole === 'Admin' || requestingUserRole === 'SuperAdmin';

  if (!isOwner && !isAdmin) {
    const error = new Error('Access denied: You do not have permission to end this session');
    error.statusCode = 403;
    error.code = 'ACCESS_DENIED';
    throw error;
  }

  const now = new Date();
  session.state = SESSION_STATES.COMPLETED;
  session.ended_at = now;
  await session.save();

  await DeviceAuditLog.create({
    employee: session.employee,
    device_id: session.active_device,
    event_type: AUDIT_EVENTS.SESSION_ENDED,
    metadata: { sessionId, endedBy: employeeId, role: requestingUserRole }
  });

  return {
    sessionId: session.session_id,
    state: session.state,
    endedAt: now.toISOString(),
    accumulatedSeconds: session.accumulated_seconds
  };
}

/**
 * Renews the active session lease for an active device.
 */
async function renewLease(sessionId, deviceId) {
  const session = await MonitoringSessionV2.findOne({ session_id: sessionId });
  if (!session) {
    const error = new Error('Session not found');
    error.statusCode = 404;
    error.code = 'SESSION_NOT_FOUND';
    throw error;
  }

  if (session.active_device !== deviceId) {
    const error = new Error('Device does not hold the active lease for this session');
    error.statusCode = 403;
    error.code = 'LEASE_DEVICE_MISMATCH';
    throw error;
  }

  if (session.state !== SESSION_STATES.ACTIVE) {
    const error = new Error(`Cannot renew lease for session in state: ${session.state}`);
    error.statusCode = 400;
    error.code = 'SESSION_NOT_ACTIVE';
    throw error;
  }

  const device = await getDeviceById(deviceId);
  if (!device || device.status !== 'ACTIVE') {
    const error = new Error(`Cannot renew lease: Device is not active (status: ${device ? device.status : 'NOT_FOUND'})`);
    error.statusCode = 403;
    error.code = 'DEVICE_INACTIVE';
    throw error;
  }

  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + SESSION_LEASE_SECONDS * 1000);
  session.lease_expires_at = leaseExpiresAt;
  await session.save();

  return {
    renewed: true,
    sessionId: session.session_id,
    leaseExpiresAt: leaseExpiresAt.toISOString(),
    remainingSeconds: SESSION_LEASE_SECONDS
  };
}

/**
 * Retrieves current active or paused session for an employee.
 */
async function getCurrentSession(employeeId) {
  return MonitoringSessionV2.findOne({
    employee: employeeId,
    state: { $in: [SESSION_STATES.ACTIVE, SESSION_STATES.PAUSED] }
  }).sort({ started_at: -1 });
}

module.exports = {
  startSession,
  pauseSession,
  resumeSession,
  endSession,
  renewLease,
  getCurrentSession
};
