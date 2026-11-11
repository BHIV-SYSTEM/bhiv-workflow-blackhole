const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const EmployeeActivity = require('../models/EmployeeActivity');

/**
 * POST /api/agent/activity/ingest
 * Receive activity data from desktop agent
 * IMPORTANT: Only accepts data when employee has an active workday
 */
router.post('/activity/ingest', auth, async (req, res) => {
  try {
    const {
      attendanceId,
      timestamp,
      mouseEvents,
      keyboardEvents,
      idleSeconds,
      activeApp,
      activeAppTitle,
      activeTaskId,
      appCategory,
      intervalDuration
    } = req.body;

    console.log('📥 Incoming activity data:', { attendanceId, mouseEvents, keyboardEvents, idleSeconds, intervalDuration, activeApp });

    // Respect the employee's monitoring opt-out. `User.monitoringPaused` previously
    // existed but was never honoured on any ingest path, so a paused employee kept
    // streaming telemetry. A disabled/expired explicit consent record blocks too;
    // absence of a consent record keeps the platform's existing default.
    const User = require('../models/User');
    const Consent = require('../models/Consent');

    const employee = await User.findById(req.user.id).select('monitoringPaused').lean();
    if (employee && employee.monitoringPaused === true) {
      return res.status(403).json({
        success: false,
        error: 'Monitoring is paused for this employee',
        code: 'MONITORING_PAUSED'
      });
    }

    const consent = await Consent.findOne({ employeeId: String(req.user.id), isActive: true }).lean();
    if (consent) {
      const expired = consent.expirationDate ? new Date(consent.expirationDate) < new Date() : false;
      if (consent.monitoringEnabled !== true || expired) {
        return res.status(403).json({
          success: false,
          error: expired ? 'Monitoring consent has expired' : 'Monitoring consent is disabled',
          code: 'CONSENT_DENIED'
        });
      }
    }

    // Validate required fields
    if (!attendanceId) {
      return res.status(400).json({
        success: false,
        error: 'Attendance ID is required'
      });
    }

    // CRITICAL: Verify day is started before accepting activity data
    const Attendance = require('../models/Attendance');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const activeDay = await Attendance.findOne({
      user: req.user.id,
      date: { $gte: today, $lt: tomorrow },
      startDayTime: { $exists: true },
      endDayTime: { $exists: false }
    });

    console.log(`📊 Activity ingestion for user ${req.user.id}: activeDay=${!!activeDay}, attendanceId=${attendanceId}`);

    if (!activeDay) {
      console.warn(`⚠️ Activity rejected: No active day found for user ${req.user.id}`);
      return res.status(403).json({ 
        success: false,
        error: 'Cannot accept activity data: workday not started',
        code: 'DAY_NOT_ACTIVE',
        hint: 'Employee must start their day first from the dashboard'
      });
    }

    // Calculate mouse activity score normalized by interval length.
    // Previous formula (events/20*100) saturated to 100 after just 20 events,
    // so cursor movement was effectively binary. Scale events-per-minute
    // against the agent's move throttle ceiling (10/s = 600/min) instead.
    const validIntervalDuration = intervalDuration && intervalDuration > 0 ? intervalDuration : 30;
    const validMouseEvents = mouseEvents || 0;
    const mousePerMinute = (validMouseEvents / validIntervalDuration) * 60;
    const mouseActivityScore = (idleSeconds >= 30 || validMouseEvents === 0)
      ? 0
      : Math.min(100, Math.round((mousePerMinute / 600) * 100));
    
    // Create EmployeeActivity document
    const activityData = new EmployeeActivity({
      employee: req.user.id,
      timestamp: timestamp || new Date(),
      keystroke_count: keyboardEvents || 0,
      mouse_activity_score: isNaN(mouseActivityScore) ? 0 : mouseActivityScore,
      mouse_event_count: validMouseEvents,
      idle_duration: idleSeconds || 0,
      interval_seconds: validIntervalDuration,
      active_application: {
        name: activeApp || 'Unknown',
        // Window title powers website/app attribution on the TRINETRA layer.
        title: activeAppTitle || activeApp || 'Unknown'
      },
      session_id: attendanceId,
      work_hours: {
        start: activeDay.startDayTime,
        end: null
      }
    });

    // TRINETRA attribution is optional: legacy agents simply omit these fields.
    if (activeTaskId) {
      activityData.task_id = String(activeTaskId);
    }
    if (appCategory) {
      activityData.app_category = String(appCategory).toUpperCase();
    }
    if (validIntervalDuration > 0) {
      activityData.keystroke_cadence = Math.round(((keyboardEvents || 0) / validIntervalDuration) * 60);
      activityData.mouse_cadence = Math.round(mousePerMinute);
    }

    // Calculate productivity score
    activityData.calculateProductivityScore();

    // Save to MongoDB
    await activityData.save();

    console.log(`📊 Activity data saved to MongoDB for user ${req.user.email}:`, {
      mouseEvents,
      keyboardEvents,
      idleSeconds,
      activeApp
    });

    res.json({
      success: true,
      message: 'Activity data ingested successfully'
    });
  } catch (error) {
    console.error('Activity ingestion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to ingest activity data'
    });
  }
});

/**
 * GET /api/agent/activity/summary/:userId
 * Get activity summary for a user (fetches from MongoDB)
 */
router.get('/activity/summary/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify authorization
    if (req.user.id !== userId && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Fetch activity data from MongoDB
    const activities = await EmployeeActivity.find({
      employee: userId,
      timestamp: { $gte: today, $lt: tomorrow }
    }).sort({ timestamp: -1 });

    // Calculate summary
    const summary = {
      totalLogs: activities.length,
      totalKeystrokes: activities.reduce((sum, a) => sum + a.keystroke_count, 0),
      totalMouseActivity: activities.reduce((sum, a) => sum + a.mouse_activity_score, 0),
      totalIdleSeconds: activities.reduce((sum, a) => sum + a.idle_duration, 0),
      avgProductivityScore: activities.length > 0 
        ? Math.round(activities.reduce((sum, a) => sum + a.productivity_score, 0) / activities.length)
        : 0,
      recentLogs: activities.slice(0, 10) // Most recent 10 entries
    };

    res.json({ success: true, summary });

  } catch (error) {
    console.error('Activity summary error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/agent/verify
 * Desktop agent session check. Previously called by the agent but never implemented,
 * which made every verification attempt fail silently. Additive: read-only.
 */
router.get('/verify', auth, async (req, res) => {
  try {
    const User = require('../models/User');
    const Attendance = require('../models/Attendance');

    const user = await User.findById(req.user.id)
      .select('name email role monitoringPaused stillExist')
      .lean();

    if (!user) {
      return res.status(401).json({ valid: false, message: 'User no longer exists' });
    }

    if (user.stillExist === 0) {
      return res.status(403).json({
        valid: false,
        message: 'Account is no longer active',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const activeDay = await Attendance.findOne({
      user: req.user.id,
      date: { $gte: today, $lt: tomorrow },
      startDayTime: { $exists: true },
      endDayTime: { $exists: false }
    }).lean();

    res.json({
      valid: true,
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role
      },
      day_active: !!activeDay,
      attendanceId: activeDay ? String(activeDay._id) : null,
      startTime: activeDay ? activeDay.startDayTime : null,
      monitoring_paused: user.monitoringPaused === true
    });
  } catch (error) {
    console.error('Agent verify error:', error);
    res.status(500).json({ valid: false, message: 'Verification failed' });
  }
});

module.exports = router;
