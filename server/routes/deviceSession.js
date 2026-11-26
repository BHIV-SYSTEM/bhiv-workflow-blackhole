const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const DeviceSession = require('../models/DeviceSession');
const { getIstDayBounds } = require('../utils/progressValidation');

const VALID_TARGETS = ['Desktop', 'Mobile'];
const DEVICE_LABELS = { Desktop: 'Laptop / PC', Mobile: 'Mobile Phone' };

function isSelfOrPrivileged(req, userId) {
  return Boolean(
    req.user &&
    (String(req.user.id) === String(userId) ||
      ['Admin', 'Manager', 'Lead', 'Governor'].includes(req.user.role))
  );
}

/**
 * V1 agent presence. The V1 agent heartbeats POST /api/agent/heartbeat every
 * 30 seconds; it is online while that heartbeat is fresh. No V2 services,
 * installer metadata or device-enrollment lookups are involved.
 */
async function getV1AgentState(userId) {
  const user = await User.findById(userId)
    .select('agentInstalled agentLastSeen agentVersion')
    .lean();
  const installed = Boolean(user && user.agentInstalled);
  const lastSeen = user && user.agentLastSeen ? new Date(user.agentLastSeen) : null;
  const online = Boolean(
    installed &&
    lastSeen &&
    Number.isFinite(lastSeen.getTime()) &&
    Date.now() - lastSeen.getTime() < 2 * 60 * 1000
  );
  return {
    installed,
    online,
    lastSeen: lastSeen && Number.isFinite(lastSeen.getTime()) ? lastSeen.toISOString() : null,
    version: (user && user.agentVersion) || null
  };
}

/** Find the employee's open workday, including overnight sessions. */
async function findOpenDay(userId) {
  const { start: today, end: tomorrow } = getIstDayBounds(new Date());
  const overnightCutoff = new Date(today.getTime() - 18 * 60 * 60 * 1000);
  return Attendance.findOne({
    user: userId,
    startDayTime: { $ne: null },
    $and: [
      { $or: [{ endDayTime: null }, { endDayTime: { $exists: false } }] },
      { $or: [{ endTime: null }, { endTime: { $exists: false } }] },
      { $or: [{ date: { $gte: today, $lt: tomorrow } }, { startDayTime: { $gte: overnightCutoff } }] }
    ]
  }).sort({ startDayTime: -1, createdAt: -1 }).lean();
}

async function findSession(userId, attendance) {
  if (!attendance) return null;
  return DeviceSession.findOne({
    user: userId,
    $or: [
      { date: attendance.date },
      { attendanceId: String(attendance._id) }
    ]
  }).sort({ startDayTime: -1, updatedAt: -1 });
}

function serializeActiveDevice(session) {
  const device = session && session.activeDevice;
  if (!device || !device.deviceType) return null;
  return {
    deviceType: device.deviceType,
    deviceId: device.deviceId || null,
    label: device.label || DEVICE_LABELS[device.deviceType],
    agentVersion: device.agentVersion || null,
    switchedAt: device.switchedAt ? new Date(device.switchedAt).toISOString() : null
  };
}

function buildState(userId, attendance, session, agent) {
  return {
    success: true,
    userId: String(userId),
    dayActive: Boolean(attendance),
    attendanceId: attendance ? String(attendance._id) : null,
    activeDevice: serializeActiveDevice(session),
    agent,
    canSwitchToDesktop: Boolean(agent && agent.online),
    history: ((session && session.history) || []).map((entry) => ({
      from: entry.from || null,
      to: entry.to || null,
      label: entry.label || null,
      deviceId: entry.deviceId || null,
      agentVersion: entry.agentVersion || null,
      switchedAt: entry.switchedAt ? new Date(entry.switchedAt).toISOString() : null
    }))
  };
}

/**
 * GET /api/device-session/:userId
 * Which device owns the open workday, plus live V1 agent availability.
 */
router.get('/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!isSelfOrPrivileged(req, userId)) {
      return res.status(403).json({ success: false, error: 'Not authorized to view this device session' });
    }

    const attendance = await findOpenDay(userId);
    const [session, agent] = await Promise.all([
      findSession(userId, attendance),
      getV1AgentState(userId)
    ]);

    res.set('Cache-Control', 'no-store');
    return res.json(buildState(userId, attendance, session, agent));
  } catch (error) {
    console.error('Device session state error:', error);
    return res.status(500).json({ success: false, error: 'Failed to load device session' });
  }
});

/**
 * POST /api/device-session/:userId/switch
 * Hand the open workday over to Laptop / PC (requires a live V1 agent) or
 * Mobile Phone (always allowed, pauses the desktop agent's collectors).
 */
router.post('/:userId/switch', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!isSelfOrPrivileged(req, userId)) {
      return res.status(403).json({ success: false, error: 'Not authorized to switch this device session' });
    }

    const rawTarget = String(req.body?.targetDeviceType || req.body?.target || '').trim();
    const targetDeviceType = VALID_TARGETS.find((t) => t.toLowerCase() === rawTarget.toLowerCase());
    if (!targetDeviceType) {
      return res.status(400).json({
        success: false,
        error: 'targetDeviceType must be either "Desktop" or "Mobile"',
        code: 'INVALID_TARGET_DEVICE'
      });
    }

    const attendance = await findOpenDay(userId);
    if (!attendance) {
      return res.status(409).json({
        success: false,
        error: 'Start your day before switching devices.',
        code: 'DAY_NOT_ACTIVE'
      });
    }

    const [session, agent] = await Promise.all([
      findSession(userId, attendance),
      getV1AgentState(userId)
    ]);

    if (targetDeviceType === 'Desktop' && !agent.online) {
      return res.status(403).json({
        success: false,
        code: 'AGENT_REQUIRED',
        error: !agent.installed
          ? 'Install the Niyantran Workflow Agent and sign in to move this workday to your laptop/PC.'
          : 'Open the Niyantran Workflow Agent and sign in to move this workday to your laptop/PC.',
        agent
      });
    }

    const currentDevice = serializeActiveDevice(session);
    if (currentDevice && currentDevice.deviceType === targetDeviceType) {
      res.set('Cache-Control', 'no-store');
      return res.json({
        ...buildState(userId, attendance, session, agent),
        alreadyOnDevice: true,
        message: `This workday is already running on ${DEVICE_LABELS[targetDeviceType]}.`
      });
    }

    const deviceInfo = req.body?.deviceInfo || {};
    const now = new Date();
    const snapshot = {
      deviceType: targetDeviceType,
      deviceId: deviceInfo.deviceId ? String(deviceInfo.deviceId) : null,
      label: DEVICE_LABELS[targetDeviceType],
      agentVersion: targetDeviceType === 'Desktop' ? (agent.version || null) : null,
      switchedAt: now
    };
    const historyEntry = {
      from: currentDevice ? currentDevice.deviceType : null,
      to: targetDeviceType,
      deviceId: snapshot.deviceId,
      label: snapshot.label,
      agentVersion: snapshot.agentVersion,
      switchedBy: req.user?.id || userId,
      switchedAt: now
    };

    const updated = await DeviceSession.findOneAndUpdate(
      {
        user: userId,
        $or: [{ attendanceId: String(attendance._id) }, { date: attendance.date }]
      },
      {
        $set: {
          user: userId,
          date: attendance.date,
          attendanceId: String(attendance._id),
          startDayTime: attendance.startDayTime,
          activeDevice: snapshot
        },
        $push: { history: historyEntry }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (req.io) {
      req.io.emit('attendance:device-switched', {
        userId: String(userId),
        from: historyEntry.from,
        to: targetDeviceType,
        switchedAt: now.toISOString()
      });
    }

    res.set('Cache-Control', 'no-store');
    return res.json({
      ...buildState(userId, attendance, updated, agent),
      switched: true,
      message: targetDeviceType === 'Desktop'
        ? 'Workday moved to Laptop / PC. The desktop agent is now monitoring this session.'
        : 'Workday moved to Mobile Phone. Desktop monitoring for this session has been paused.'
    });
  } catch (error) {
    console.error('Device session switch error:', error);
    return res.status(500).json({ success: false, error: 'Failed to switch device' });
  }
});

module.exports = router;
