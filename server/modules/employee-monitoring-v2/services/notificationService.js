/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Notification & Alert Dispatcher Service
 * 
 * Manages:
 * - Real-time Socket.io dispatch for monitoring events, handoffs, and alerts.
 * - Persistence to Niyantran MonitoringAlert records for admin review.
 * - Clean event payloads for both Employee and Admin dashboards.
 */

let MonitoringAlert = null;
try {
  MonitoringAlert = require('../../../models/MonitoringAlert');
} catch (err) {
  console.warn('[NotificationService] MonitoringAlert model not available in current test context');
}

/**
 * Dispatches a monitoring alert to Socket.io and stores in MonitoringAlert collection.
 */
async function sendAlert({
  employeeId,
  alertType = 'suspicious_activity',
  severity = 'medium',
  title,
  description,
  metadata = {},
  io = null
}) {
  const now = new Date();
  let savedAlert = null;

  if (MonitoringAlert) {
    try {
      savedAlert = await MonitoringAlert.create({
        employee: employeeId,
        alert_type: alertType,
        severity,
        title,
        description,
        timestamp: now,
        status: 'active',
        auto_generated: true,
        data: {
          activity_data: metadata,
          v2_alert: true,
          created_at: now.toISOString()
        }
      });
    } catch (err) {
      console.warn('[NotificationService] Failed to persist MonitoringAlert:', err.message);
    }
  }

  // Socket.io Real-time dispatch
  if (io) {
    const payload = {
      id: savedAlert?._id || `alert_${now.getTime()}`,
      employeeId,
      alertType,
      severity,
      title,
      description,
      metadata,
      timestamp: now.toISOString()
    };

    try {
      // Broadcast to admin room / global monitoring channel
      io.emit('monitoring-alert', payload);
      io.emit('monitoring:v2:alert', payload);

      // Targeted notification to specific employee
      if (employeeId) {
        io.to(String(employeeId)).emit('employee-monitoring-alert', payload);
      }
    } catch (socketErr) {
      console.warn('[NotificationService] Socket emit error:', socketErr.message);
    }
  }

  return savedAlert;
}

/**
 * Emits a session handoff event across the system.
 */
function emitHandoffEvent({
  sessionId,
  employeeId,
  fromMode,
  toMode,
  fromDevice,
  toDevice,
  io = null
}) {
  if (!io) return;

  const eventPayload = {
    sessionId,
    employeeId,
    fromMode,
    toMode,
    fromDevice,
    toDevice,
    timestamp: new Date().toISOString()
  };

  try {
    io.emit('monitoring:handoff', eventPayload);
    io.emit('monitoring:v2:handoff', eventPayload);
    if (employeeId) {
      io.to(String(employeeId)).emit('monitoring:device-switch', eventPayload);
    }
  } catch (err) {
    console.warn('[NotificationService] Failed to emit handoff event:', err.message);
  }
}

/**
 * Emits a session status change (e.g. paused, resumed, disconnected, expired).
 */
function emitSessionStateChange({
  sessionId,
  employeeId,
  state,
  reason,
  io = null
}) {
  if (!io) return;

  const eventPayload = {
    sessionId,
    employeeId,
    state,
    reason,
    timestamp: new Date().toISOString()
  };

  try {
    io.emit('monitoring:session-state', eventPayload);
    if (employeeId) {
      io.to(String(employeeId)).emit('monitoring:session-state', eventPayload);
    }
  } catch (err) {
    console.warn('[NotificationService] Failed to emit session state change:', err.message);
  }
}

module.exports = {
  sendAlert,
  emitHandoffEvent,
  emitSessionStateChange
};
