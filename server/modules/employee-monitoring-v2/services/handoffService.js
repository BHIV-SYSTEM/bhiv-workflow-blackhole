/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Cross-Device Session Orchestrator & Handoff Service
 * 
 * Governs seamless handoff between PC Desktop Agent and Mobile Phone modes.
 * - Single Active Lease Guarantee: Only one device holds the lease at any moment.
 * - Previous device lease revoked immediately upon handoff.
 * - Records immutable handoff history in session and audit logs.
 * - Emits real-time alerts & Socket.io updates for Employee and Admin views.
 */

const MonitoringSessionV2 = require('../models/MonitoringSessionV2');
const DeviceAuditLog = require('../models/DeviceAuditLog');
const { getDeviceById } = require('./deviceService');
const { SESSION_STATES, DEVICE_MODES, SESSION_LEASE_SECONDS, AUDIT_EVENTS } = require('../config/constants');
const { emitHandoffEvent, sendAlert } = require('./notificationService');

/**
 * Executes a device handoff for an active or paused session.
 *
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {string} params.employeeId
 * @param {string} params.targetMode ('PHONE' or 'LAPTOP_PC')
 * @param {string} [params.targetDeviceId] (required if targetMode is 'LAPTOP_PC')
 * @param {string} [params.reason]
 * @param {Object} [params.io] Socket.IO instance
 * @returns {Promise<Object>}
 */
async function initiateHandoff({
  sessionId,
  employeeId,
  targetMode,
  targetDeviceId = null,
  reason = 'User initiated device handoff',
  io = null
}) {
  if (!sessionId) {
    const error = new Error('sessionId is required for handoff');
    error.statusCode = 400;
    error.code = 'SESSION_ID_REQUIRED';
    throw error;
  }

  if (!targetMode || !Object.values(DEVICE_MODES).includes(targetMode)) {
    const error = new Error(`Invalid targetMode: ${targetMode}. Must be PHONE or LAPTOP_PC.`);
    error.statusCode = 400;
    error.code = 'INVALID_TARGET_MODE';
    throw error;
  }

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

  if (session.state === SESSION_STATES.COMPLETED || session.state === SESSION_STATES.REVOKED) {
    const error = new Error(`Cannot handoff session in state: ${session.state}`);
    error.statusCode = 400;
    error.code = 'SESSION_INACTIVE';
    throw error;
  }

  // Validate PC device if transitioning to LAPTOP_PC
  if (targetMode === DEVICE_MODES.LAPTOP_PC) {
    if (!targetDeviceId) {
      const error = new Error('targetDeviceId is required when switching to LAPTOP_PC');
      error.statusCode = 400;
      error.code = 'DEVICE_ID_REQUIRED';
      throw error;
    }

    const device = await getDeviceById(targetDeviceId);
    if (!device) {
      const error = new Error('Target device not found');
      error.statusCode = 404;
      error.code = 'DEVICE_NOT_FOUND';
      throw error;
    }

    if (String(device.employee) !== String(employeeId)) {
      const error = new Error('Target device does not belong to this employee');
      error.statusCode = 403;
      error.code = 'DEVICE_UNAUTHORIZED';
      throw error;
    }

    if (device.status !== 'ACTIVE') {
      const error = new Error(`Target device is not active (status: ${device.status})`);
      error.statusCode = 403;
      error.code = 'DEVICE_INACTIVE';
      throw error;
    }
  }

  const now = new Date();
  const fromMode = session.mode;
  const fromDevice = session.active_device || fromMode;
  const toDevice = targetMode === DEVICE_MODES.LAPTOP_PC ? targetDeviceId : 'MOBILE_PHONE';

  // Record handoff in session history
  session.handoff_history.push({
    from_device: fromDevice,
    to_device: toDevice,
    transferred_at: now,
    transfer_reason: reason
  });

  // Switch mode and active lease target
  session.mode = targetMode;
  session.active_device = targetMode === DEVICE_MODES.LAPTOP_PC ? targetDeviceId : null;

  // Refresh authorization lease for the new device
  session.lease_expires_at = new Date(now.getTime() + SESSION_LEASE_SECONDS * 1000);
  await session.save();

  // Audit trail
  await DeviceAuditLog.create({
    employee: employeeId,
    device_id: session.active_device,
    event_type: AUDIT_EVENTS.SESSION_HANDOFF,
    metadata: {
      sessionId,
      fromMode,
      toMode: targetMode,
      fromDevice,
      toDevice,
      reason
    }
  });

  // Emit real-time handoff event & alerts
  emitHandoffEvent({
    sessionId,
    employeeId,
    fromMode,
    toMode: targetMode,
    fromDevice,
    toDevice,
    io
  });

  // Log informational alert for admin visibility
  sendAlert({
    employeeId,
    alertType: 'suspicious_activity', // legacy bucket for monitoring notifications
    severity: 'low',
    title: `Device Handoff: ${fromMode} → ${targetMode}`,
    description: `Session ${sessionId} was handed off from ${fromDevice} to ${toDevice}. Reason: ${reason}`,
    metadata: { sessionId, fromMode, toMode: targetMode, fromDevice, toDevice, reason },
    io
  }).catch(() => {});

  return {
    success: true,
    sessionId: session.session_id,
    mode: session.mode,
    activeDevice: session.active_device,
    state: session.state,
    leaseExpiresAt: session.lease_expires_at.toISOString(),
    leaseSeconds: SESSION_LEASE_SECONDS,
    handoffHistory: session.handoff_history
  };
}

module.exports = {
  initiateHandoff
};
