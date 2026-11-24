/**
 * Employee Monitoring V2 - Analytics & Reporting Service
 * 
 * Aggregates live team presence, 1-minute daily timelines,
 * team category summaries, and audit trail logs.
 * Zero private keystroke text or window titles exposed.
 */

const MonitoringSessionV2 = require('../models/MonitoringSessionV2');
const AggregatedTelemetryV2 = require('../models/AggregatedTelemetryV2');
const DeviceAuditLog = require('../models/DeviceAuditLog');
const RegisteredDevice = require('../models/RegisteredDevice');
const { SESSION_STATES } = require('../config/constants');

/**
 * Retrieves real-time active team monitoring state for Admin / Manager consoles.
 */
async function getLiveTeam() {
  const activeSessions = await MonitoringSessionV2.find({
    state: { $in: [SESSION_STATES.ACTIVE, SESSION_STATES.PAUSED] }
  })
    .populate('employee', 'name email role department employeeId')
    .sort({ started_at: -1 })
    .lean();

  const results = [];

  for (const session of activeSessions) {
    // Fetch latest telemetry record for this session
    const latestTelemetry = await AggregatedTelemetryV2.findOne({ session_id: session.session_id })
      .sort({ minute_timestamp: -1 })
      .lean();

    const device = session.active_device
      ? await RegisteredDevice.findOne({ device_id: session.active_device }).lean()
      : null;

    const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000));
    const isConnected = session.state === SESSION_STATES.ACTIVE &&
      session.lease_expires_at &&
      (new Date(session.lease_expires_at).getTime() > Date.now() - 30000);
    const connectionStatus = isConnected ? 'Connected' : 'Disconnected / Not Monitored';
    const breakStatus = session.state === SESSION_STATES.PAUSED ? 'On Break' : 'Working';
    const currentApplication = latestTelemetry?.current_application || (session.state === SESSION_STATES.PAUSED ? '[On Break]' : 'System Idle');

    results.push({
      sessionId: session.session_id,
      employeeId: session.employee?._id || session.employee,
      employeeName: session.employee?.name || 'Unknown Employee',
      employeeEmail: session.employee?.email || '',
      department: session.employee?.department || 'Engineering',
      role: session.employee?.role || 'Software Engineer',
      mode: session.mode,
      deviceId: session.active_device,
      deviceName: device?.device_name || session.active_device || (session.mode === 'PHONE' ? 'Mobile Phone' : 'Workstation'),
      manufacturer: device?.manufacturer || 'Acer',
      model: device?.model || 'Nitro AN515-57',
      state: session.state,
      connectionStatus,
      breakStatus,
      currentApplication,
      startedAt: session.started_at,
      leaseExpiresAt: session.lease_expires_at,
      elapsedSeconds,
      accumulatedSeconds: session.accumulated_seconds || { active: 0, idle: 0, focused_work: 0, paused: 0 },
      primaryCategory: latestTelemetry ? latestTelemetry.primary_category : 'NEUTRAL',
      focusScore: latestTelemetry ? latestTelemetry.focus_score : 50,
      lastTelemetryAt: latestTelemetry ? latestTelemetry.minute_timestamp : session.started_at
    });
  }

  return results;
}

/**
 * Aggregates daily telemetry timeline into 1-minute slices for personal / managerial review.
 */
async function getEmployeeDailyTimeline(employeeId, dateStr) {
  const targetDate = dateStr || new Date().toISOString().split('T')[0];
  const startOfDay = new Date(`${targetDate}T00:00:00.000Z`);
  const endOfDay = new Date(`${targetDate}T23:59:59.999Z`);

  const records = await AggregatedTelemetryV2.find({
    employee: employeeId,
    minute_timestamp: { $gte: startOfDay, $lte: endOfDay }
  })
    .sort({ minute_timestamp: 1 })
    .lean();

  let totalActive = 0;
  let totalIdle = 0;
  let totalKeyPresses = 0;
  let totalMouseEvents = 0;

  const slices = records.map((rec) => {
    const idle = rec.activity_counts?.hardware_idle_seconds || 0;
    const duration = rec.duration_seconds || 60;
    const active = Math.max(0, duration - idle);

    totalActive += active;
    totalIdle += idle;
    totalKeyPresses += (rec.activity_counts?.key_presses || 0);
    totalMouseEvents += (rec.activity_counts?.mouse_events || 0);

    return {
      timestamp: rec.minute_timestamp,
      durationSeconds: duration,
      activeSeconds: active,
      idleSeconds: idle,
      category: rec.primary_category,
      keyPresses: rec.activity_counts?.key_presses || 0,
      mouseEvents: rec.activity_counts?.mouse_events || 0,
      focusScore: rec.focus_score
    };
  });

  return {
    date: targetDate,
    totalRecords: records.length,
    totals: {
      activeSeconds: totalActive,
      idleSeconds: totalIdle,
      activeHours: +(totalActive / 3600).toFixed(2),
      keyPresses: totalKeyPresses,
      mouseEvents: totalMouseEvents
    },
    slices
  };
}

/**
 * Returns organizational aggregate summaries across categories and active sessions.
 */
async function getTeamSummary({ startDate, endDate } = {}) {
  const query = {};
  if (startDate || endDate) {
    query.minute_timestamp = {};
    if (startDate) query.minute_timestamp.$gte = new Date(startDate);
    if (endDate) query.minute_timestamp.$lte = new Date(endDate);
  }

  const [categoryBreakdown, activeSessionCount, totalRegisteredDevices] = await Promise.all([
    AggregatedTelemetryV2.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$primary_category',
          totalMinutes: { $sum: 1 },
          avgFocusScore: { $avg: '$focus_score' }
        }
      }
    ]),
    MonitoringSessionV2.countDocuments({ state: SESSION_STATES.ACTIVE }),
    RegisteredDevice.countDocuments({ status: 'ACTIVE' })
  ]);

  const categories = {};
  for (const item of categoryBreakdown) {
    categories[item._id] = {
      minutes: item.totalMinutes,
      avgFocusScore: Math.round(item.avgFocusScore || 0)
    };
  }

  return {
    activeSessions: activeSessionCount,
    activeDevices: totalRegisteredDevices,
    categoryBreakdown: categories,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Retrieves paginated audit logs for compliance review.
 */
async function getAuditLogs({ employeeId = null, eventType = null, limit = 50, skip = 0 } = {}) {
  const query = {};
  if (employeeId) query.employee = employeeId;
  if (eventType) query.event_type = eventType;

  const [logs, total] = await Promise.all([
    DeviceAuditLog.find(query)
      .populate('employee', 'name email role employeeId')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(Math.min(limit, 100))
      .lean(),
    DeviceAuditLog.countDocuments(query)
  ]);

  return {
    total,
    count: logs.length,
    logs
  };
}

module.exports = {
  getLiveTeam,
  getEmployeeDailyTimeline,
  getTeamSummary,
  getAuditLogs
};
