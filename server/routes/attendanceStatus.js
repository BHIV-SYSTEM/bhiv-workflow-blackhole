const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Attendance = require('../models/Attendance');
const WorkSession = require('../models/WorkSession');
const DeviceSession = require('../models/DeviceSession');
const {
  getIstDayBounds,
  checkPreviousDayMissingProgress,
  checkTodayAimStatus,
} = require('../utils/progressValidation');

/**
 * GET /api/attendance/status
 * Returns authoritative workday status for the authenticated employee, synced across Attendance and WorkSession.
 */
router.get('/status', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { start: today, end: tomorrow } = getIstDayBounds(new Date());
    const overnightCutoff = new Date(today.getTime() - 18 * 60 * 60 * 1000);

    const [todayAttendance, recentOpenAttendance, todayWorkSession] = await Promise.all([
      Attendance.findOne({
        user: userId,
        $or: [
          { date: { $gte: today, $lt: tomorrow } },
          { startDayTime: { $gte: today, $lt: tomorrow } }
        ]
      }).sort({ startDayTime: -1, createdAt: -1 }),
      Attendance.findOne({
        user: userId,
        startDayTime: { $gte: overnightCutoff, $ne: null },
        $or: [{ endDayTime: { $exists: false } }, { endDayTime: null }]
      }).sort({ startDayTime: -1 }),
      WorkSession.findOne({
        employee: userId,
        $or: [
          { date: { $gte: today, $lt: tomorrow } },
          { startTime: { $gte: today, $lt: tomorrow } }
        ]
      }).sort({ updatedAt: -1, startTime: -1 }).lean()
    ]);

    let attendance = recentOpenAttendance || todayAttendance;

    // If an open Attendance exists but today's WorkSession was already ended after its start,
    // keep Attendance closed in DB so web End Day always stops the desktop agent immediately.
    if (
      attendance &&
      !attendance.endDayTime &&
      todayWorkSession &&
      todayWorkSession.status === 'completed' &&
      todayWorkSession.endTime &&
      new Date(todayWorkSession.endTime).getTime() >= new Date(attendance.startDayTime).getTime() - 60000
    ) {
      attendance.endDayTime = todayWorkSession.endTime;
      await attendance.save().catch(() => {});
    }

    const User = require('../models/User');
    const userDoc = await User.findById(userId).select('name email agentInstalled agentLastSeen').lean();
    const realName = userDoc?.name || req.user.name || null;
    const realEmail = userDoc?.email || req.user.email || null;
    const agentLastSeenMs = userDoc?.agentLastSeen ? new Date(userDoc.agentLastSeen).getTime() : NaN;
    const v1AgentOnline = Boolean(
      userDoc?.agentInstalled && Number.isFinite(agentLastSeenMs) && Date.now() - agentLastSeenMs < 2 * 60 * 1000
    );
    // Must stay within the Attendance enum ['Active', 'Disconnected / Not
    // Monitored'] — the Start Day UI renders 'Active' as the green monitored
    // state and anything else as disconnected.
    const v1MonitoringStatus = v1AgentOnline ? 'Active' : 'Disconnected / Not Monitored';

    const attendanceOpen = Boolean(
      attendance && attendance.startDayTime && !attendance.endDayTime && !attendance.endTime
    );
    const workSessionOpen = Boolean(
      todayWorkSession &&
      todayWorkSession.startTime &&
      ['active', 'paused'].includes(todayWorkSession.status)
    );

    const monitoringConsent = Boolean(attendance?.monitoringConsent || todayAttendance?.monitoringConsent);

    // Which device currently owns the workday (set by Start Day and the switch card).
    let activeDevice = null;
    try {
      const deviceSession = await DeviceSession.findOne({
        user: userId,
        startDayTime: { $gte: overnightCutoff },
        'activeDevice.deviceType': { $in: ['Desktop', 'Mobile'] }
      }).sort({ startDayTime: -1, updatedAt: -1 }).lean();
      if (deviceSession && deviceSession.activeDevice) {
        activeDevice = {
          deviceType: deviceSession.activeDevice.deviceType,
          label: deviceSession.activeDevice.label || null,
          switchedAt: deviceSession.activeDevice.switchedAt
            ? new Date(deviceSession.activeDevice.switchedAt).toISOString()
            : null
        };
      }
    } catch (deviceSessionErr) {
      // Non-fatal: older workdays predate the device handover feature.
    }

    if (attendanceOpen) {
      return res.json({
        dayStarted: true,
        dayEndedToday: false,
        startTime: attendance.startDayTime || attendance.startTime,
        endTime: null,
        attendanceId: attendance._id,
        workLocation: attendance.workLocationType || 'Unknown',
        location: attendance.startDayLocation || attendance.location,
        userName: realName,
        userEmail: realEmail,
        monitoringConsent,
        monitoringStatus: v1MonitoringStatus,
        activeDevice
      });
    }

    if (workSessionOpen && !(todayAttendance && (todayAttendance.endDayTime || todayAttendance.endTime))) {
      return res.json({
        dayStarted: true,
        dayEndedToday: false,
        startTime: todayWorkSession.startTime,
        endTime: null,
        attendanceId: String(todayWorkSession._id),
        workLocation: todayWorkSession.workLocation || 'Office',
        userName: realName,
        userEmail: realEmail,
        monitoringConsent,
        monitoringStatus: v1MonitoringStatus,
        activeDevice
      });
    }

    const endedTime =
      (todayAttendance && (todayAttendance.endDayTime || todayAttendance.endTime)) ||
      (todayWorkSession && todayWorkSession.status === 'completed' ? todayWorkSession.endTime : null) ||
      null;

    const [prevMissing, aimStatus] = await Promise.all([
      checkPreviousDayMissingProgress(userId).catch(() => ({ missing: false })),
      checkTodayAimStatus(userId).catch(() => ({ hasAimToday: true, aimReminder: false }))
    ]);

    return res.json({
      dayStarted: false,
      dayEndedToday: Boolean(endedTime),
      startTime: (todayAttendance && todayAttendance.startDayTime) || (todayWorkSession && todayWorkSession.startTime) || null,
      endTime: endedTime,
      attendanceId: null,
      workLocation: null,
      userName: realName,
      userEmail: realEmail,
      monitoringConsent: false,
      monitoringStatus: 'Disconnected / Not Monitored',
      activeDevice: null,
      previousDayProgressMissing: Boolean(prevMissing.missing),
      previousWorkDate: prevMissing.previousWorkDate || null,
      previousDateLabel: prevMissing.previousDateLabel || null,
      hasAimToday: Boolean(aimStatus.hasAimToday),
      aimReminder: Boolean(aimStatus.aimReminder)
    });
  } catch (error) {
    console.error('❌ Attendance status check error:', error);
    res.status(500).json({
      error: 'Failed to check attendance status',
      dayStarted: false
    });
  }
});

module.exports = router;
