const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const EmployeeActivity = require('../models/EmployeeActivity');
const KeystrokeLog = require('../models/KeystrokeLog');
const { analyzeKeystrokeSegment } = require('../services/keystrokeQuality');

/**
 * Shared gate for every agent telemetry ingest: monitoring must not be
 * paused and explicit consent (when present) must be active. Returns null
 * when allowed, otherwise a {status, body} rejection to send back.
 */
async function monitoringGate(req) {
  // Respect the employee's monitoring opt-out. `User.monitoringPaused` previously
  // existed but was never honoured on any ingest path, so a paused employee kept
  // streaming telemetry. A disabled/expired explicit consent record blocks too;
  // absence of a consent record keeps the platform's existing default.
  const User = require('../models/User');
  const Consent = require('../models/Consent');

  const employee = await User.findById(req.user.id).select('monitoringPaused').lean();
  if (employee && employee.monitoringPaused === true) {
    return {
      status: 403,
      body: {
        success: false,
        error: 'Monitoring is paused for this employee',
        code: 'MONITORING_PAUSED'
      }
    };
  }

  const consent = await Consent.findOne({ employeeId: String(req.user.id), isActive: true }).lean();
  if (consent) {
    const expired = consent.expirationDate ? new Date(consent.expirationDate) < new Date() : false;
    if (consent.monitoringEnabled !== true || expired) {
      return {
        status: 403,
        body: {
          success: false,
          error: expired ? 'Monitoring consent has expired' : 'Monitoring consent is disabled',
          code: 'CONSENT_DENIED'
        }
      };
    }
  }

  return null;
}

/**
 * Resolve today's open workday (Attendance or DailyAttendance), including
 * overnight sessions. Returns null when the employee has not started a day.
 */
async function findActiveDay(userId) {
  const Attendance = require('../models/Attendance');
  const DailyAttendance = require('../models/DailyAttendance');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Support sessions matching either Attendance or DailyAttendance, with null-safe endDayTime check
  const unendedQuery = {
    user: userId,
    startDayTime: { $ne: null },
    $or: [{ endDayTime: null }, { endDayTime: { $exists: false } }]
  };

  let activeDay = await Attendance.findOne({
    ...unendedQuery,
    date: { $gte: today, $lt: tomorrow }
  }).sort({ startDayTime: -1 });

  if (!activeDay) {
    activeDay = await DailyAttendance.findOne({
      ...unendedQuery,
      date: { $gte: today, $lt: tomorrow }
    }).sort({ startDayTime: -1 });
  }

  // Overnight session support (started yesterday evening, spans past midnight)
  if (!activeDay) {
    activeDay = (await Attendance.findOne(unendedQuery).sort({ startDayTime: -1 }))
      || (await DailyAttendance.findOne(unendedQuery).sort({ startDayTime: -1 }));
  }

  return activeDay;
}

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
      intervalDuration,
      source,
      trackingMode
    } = req.body;

    const resolvedSource = source || (trackingMode === 'UIOHOOK_NAPI' ? 'desktop_agent' : 'browser');

    console.log('📥 Incoming activity data:', { attendanceId, mouseEvents, keyboardEvents, idleSeconds, intervalDuration, activeApp });

    const gateRejection = await monitoringGate(req);
    if (gateRejection) {
      return res.status(gateRejection.status).json(gateRejection.body);
    }

    // Validate required fields
    if (!attendanceId) {
      return res.status(400).json({
        success: false,
        error: 'Attendance ID is required'
      });
    }

    const activeDay = await findActiveDay(req.user.id);

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

    // Avoid double-counting & idle-0 overwrites when both desktop agent and browser tab run concurrently
    if (resolvedSource === 'browser') {
      const recentDesktopCutoff = new Date(Date.now() - 15000);
      const desktopActive = await EmployeeActivity.exists({
        employee: req.user.id,
        'metadata.source': 'desktop_agent',
        timestamp: { $gte: recentDesktopCutoff }
      });
      if (desktopActive) {
        return res.json({
          success: true,
          deduplicated: true,
          message: 'Desktop agent active; skipped redundant browser sample'
        });
      }
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
      : Math.min(100, Math.round((mousePerMinute / 240) * 100));
    
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
      },
      metadata: {
        source: resolvedSource
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

const MAX_TEXT_LENGTH = 4000;
const MAX_SEGMENTS_PER_BATCH = 25;




router.post('/keystroke/ingest', auth, async (req, res) => {
  try {
    const { attendanceId, segments, activeApp, activeAppTitle, activeTaskId } = req.body;

    if (!attendanceId) {
      return res.status(400).json({ success: false, error: 'Attendance ID is required' });
    }

    const gateRejection = await monitoringGate(req);
    if (gateRejection) {
      return res.status(gateRejection.status).json(gateRejection.body);
    }

    const activeDay = await findActiveDay(req.user.id);
    if (!activeDay) {
      return res.status(403).json({
        success: false,
        error: 'Cannot accept keystroke data: workday not started',
        code: 'DAY_NOT_ACTIVE',
        hint: 'Employee must start their day first from the dashboard'
      });
    }

    if (!Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ success: false, error: 'segments array is required' });
    }

    const docs = [];
    for (const segment of segments.slice(0, MAX_SEGMENTS_PER_BATCH)) {
      if (!segment || typeof segment !== 'object') continue;

      const text = typeof segment.text === 'string'
        ? segment.text.slice(0, MAX_TEXT_LENGTH)
        : '';
      const keyCount = Math.max(0, Number(segment.keyCount) || 0);
      const backspaceCount = Math.max(0, Number(segment.backspaceCount) || 0);
      const pasteCount = Math.max(0, Number(segment.pasteCount) || 0);
      const charCount = text.replace(/\s+/g, '').length;

      // Skip empty noise segments with no keys at all.
      if (!text.trim() && keyCount === 0) continue;

      const quality = analyzeKeystrokeSegment({
        text,
        keyCount,
        backspaceCount,
        pasteCount,
        intervals: Array.isArray(segment.intervals) ? segment.intervals.slice(0, 500) : [],
        timing: segment.timing
      });

      const durationMs = Math.max(0, Number(segment.durationMs) || 0);
      const wordCount = (text.trim().match(/[\p{L}\p{N}_]+/gu) || []).length;
      const wpm = durationMs > 0 && wordCount > 0
        ? Math.round((wordCount / (durationMs / 60000)))
        : 0;

      docs.push({
        employee: req.user.id,
        session_id: String(attendanceId),
        timestamp: segment.start ? new Date(segment.start) : new Date(),
        text,
        application_name: segment.activeApp || activeApp || 'Unknown',
        window_title: segment.activeAppTitle || activeAppTitle || '',
        task_id: activeTaskId ? String(activeTaskId) : undefined,
        capture: {
          key_count: keyCount,
          backspace_count: backspaceCount,
          paste_count: pasteCount,
          char_count: charCount,
          duration_ms: durationMs,
          mean_interval_ms: quality.meanIntervalMs,
          std_interval_ms: quality.stdIntervalMs
        },
        quality: {
          classification: quality.classification,
          score: quality.score,
          word_score: quality.wordScore,
          repetition_score: quality.repetitionScore,
          correction_ratio: quality.correctionRatio,
          reasons: quality.reasons
        },
        wpm: Math.max(0, Math.min(400, wpm))
      });
    }

    if (docs.length > 0) {
      await KeystrokeLog.insertMany(docs, { ordered: false });
    }

    console.log(`Γî¿∩╕Å Keystroke segments saved for user ${req.user.id}: ${docs.length}/${segments.length}`);

    res.json({
      success: true,
      stored: docs.length,
      classifications: docs.reduce((acc, d) => {
        acc[d.quality.classification] = (acc[d.quality.classification] || 0) + 1;
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Keystroke ingestion error:', error);
    res.status(500).json({ success: false, error: 'Failed to ingest keystroke data' });
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
