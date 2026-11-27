const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const EmployeeActivity = require('../models/EmployeeActivity');
const {
  getIstDayBounds,
  IST_OFFSET_MS,
  summarizeActivitiesWithSession,
  resolveSessionsMap,
  evaluateSample,
  normalizeIntervalSeconds,
} = require('../utils/telemetryMetrics');
const {
  computeDayProductivity,
  efficiencyLabelForDay,
} = require('../utils/dayProductivity');

/**
 * Human-readable host for a URL (e.g. "github.com"). Falls back to the raw
 * string when the URL cannot be parsed, and never throws.
 */
function safeHost(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return (u.hostname || rawUrl).replace(/^www\./, '');
  } catch {
    return String(rawUrl).replace(/^https?:\/\//, '').split('/')[0] || String(rawUrl);
  }
}

/**
 * Strip the trailing " - Google Chrome" / " - Visual Studio Code" suffix from
 * a window title so the review shows the page/site name, not the app name
 * twice. Returns '' when nothing readable is left.
 */
function cleanPageTitle(title, appName) {
  let t = String(title || '').trim();
  if (!t) return '';
  const suffixes = [
    appName,
    'Google Chrome', 'Microsoft Edge', 'Chromium', 'Firefox', 'Opera',
    'Visual Studio Code', 'VS Code', 'Slack', 'Microsoft Teams', 'Notepad',
  ].filter(Boolean);
  for (const s of suffixes) {
    if (t.length > s.length && t.toLowerCase().endsWith(` - ${s.toLowerCase()}`)) {
      t = t.slice(0, -(s.length + 3)).trim();
      break;
    }
  }
  return t;
}

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

    // Calculate mouse activity score normalized by interval length (120 events/min = 2/sec sustained cursor activity).
    const validIntervalDuration = intervalDuration && intervalDuration > 0 ? intervalDuration : 30;
    const validMouseEvents = mouseEvents || 0;
    const mousePerMinute = (validMouseEvents / validIntervalDuration) * 60;
    const mouseActivityScore = (idleSeconds >= 30 || validMouseEvents === 0)
      ? 0
      : Math.min(100, Math.round((mousePerMinute / 120) * 100));
    
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

/**
 * POST /api/agent/keystroke/ingest
 * Ingest keystroke segments from desktop agent with server-side quality classification
 */
router.post('/keystroke/ingest', auth, async (req, res) => {
  try {
    const { attendanceId, segments, activeApp, activeAppTitle } = req.body;

    if (!attendanceId) {
      return res.status(400).json({
        success: false,
        error: 'Attendance ID is required',
      });
    }

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Segments array is required',
      });
    }

    const gateRejection = await monitoringGate(req);
    if (gateRejection) {
      return res.status(gateRejection.status).json(gateRejection.body);
    }

    const activeDay = await findActiveDay(req.user.id);
    if (!activeDay) {
      return res.status(403).json({
        success: false,
        error: 'Cannot accept activity data: workday not started',
        code: 'DAY_NOT_ACTIVE',
        hint: 'Employee must start their day first from the dashboard'
      });
    }

    const validSegments = segments.filter(seg => seg && ((typeof seg.text === 'string' && seg.text.length > 0) || (typeof seg.keyCount === 'number' && seg.keyCount > 0)));
    if (validSegments.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid segments to store',
      });
    }

    const { analyzeKeystrokeSegment } = require('../services/keystrokeQuality');
    const KeystrokeLog = require('../models/KeystrokeLog');

    const classifications = {};
    const docs = validSegments.map(seg => {
      const text = seg.text.slice(0, 4000);
      const keyCount = seg.keyCount !== undefined ? seg.keyCount : text.length;
      const durationMs = seg.durationMs || 0;
      const intervals = seg.intervals || [];

      const quality = analyzeKeystrokeSegment({
        text,
        keyCount,
        intervals,
        durationMs,
        backspaceCount: seg.backspaceCount || 0,
        pasteCount: seg.pasteCount || 0,
      });

      const cls = quality?.classification || 'neutral';
      classifications[cls] = (classifications[cls] || 0) + 1;

      const meanInterval = (quality && typeof quality.meanIntervalMs === 'number')
        ? quality.meanIntervalMs
        : (intervals.length > 0
            ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
            : (durationMs && keyCount ? Math.round(durationMs / keyCount) : 0));

      const minutes = (durationMs > 0 ? durationMs : (intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) : 0)) / 60000;
      const wpm = minutes > 0 ? Math.round((text.length / 5) / minutes) : 0;

      return {
        employee: req.user.id,
        session_id: attendanceId,
        application_name: activeApp || 'Unknown',
        window_title: activeAppTitle || '',
        text,
        timestamp: seg.start ? new Date(seg.start) : new Date(),
        quality,
        capture: {
          char_count: text.length || keyCount,
          key_count: keyCount,
          backspace_count: seg.backspaceCount || 0,
          paste_count: seg.pasteCount || 0,
          duration_ms: durationMs,
          mean_interval_ms: meanInterval,
        },
        wpm,
      };
    });

    await KeystrokeLog.insertMany(docs);

    return res.status(200).json({
      success: true,
      stored: docs.length,
      classifications,
    });
  } catch (error) {
    console.error('Keystroke ingestion error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to ingest keystroke data',
    });
  }
});

/**
 * GET /api/agent/activity/summary/:userId
 *
 * Day-in-review for one employee. The caller may only read their own summary
 * (admins may read any) — this is what powers the employee's Work Session
 * self-review: keystrokes, mouse movement, productivity, and a timeline of
 * the websites/applications they moved through, with times.
 */
router.get('/activity/summary/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify authorization — employees see ONLY their own data.
    if (req.user.id !== userId && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Get today's IST date range (00:00:00 IST to 23:59:59.999 IST)
    const now = new Date();
    const { start: today, end: endOfToday, dateKey } = getIstDayBounds(now);
    const tomorrow = new Date(endOfToday.getTime() + 1);

    // Oldest-first: the review is a timeline of the day.
    const [activities, sessionsMap] = await Promise.all([
      EmployeeActivity.find({
        employee: userId,
        timestamp: { $gte: today, $lt: tomorrow }
      }).sort({ timestamp: 1 }).lean(),
      resolveSessionsMap([userId], today, endOfToday, now)
    ]);

    const sessionInfo = sessionsMap.get(`${userId}_${dateKey}`) || null;
    const unified = summarizeActivitiesWithSession(activities, sessionInfo);

    // Red/yellow/green day score: starts at 0, rises with continuous work,
    // decays gently on idle, and credits voice-command users via platform +
    // engagement instead of keystrokes they never produce.
    const dayProd = computeDayProductivity(activities);
    const dayScoreByHour = new Map(dayProd.hourly.map((h) => [h.hour, h.score]));

    // Raw mouse movement volume (the 0-100 score saturates; the event count
    // shows how much the employee actually moved/clicked).
    let totalMouseEvents = 0;
    for (const act of activities) {
      totalMouseEvents += Number(act.mouse_event_count) || 0;
    }

    // Website/application timeline: merge consecutive samples on the same
    // target into one visit {label, url, startedAt, endedAt, seconds}.
    // Raw URLs are prohibited by the platform privacy boundary, so the
    // page/site name is derived from the browser window title (e.g.
    // "Infiverse - AI Workflow Management - Google Chrome" → the page name).
    const VISIT_GAP_MS = 5 * 60 * 1000; // a 5+ min gap ends the current visit
    const visits = [];
    let current = null;
    for (const act of activities) {
      const app = act.active_application || {};
      const url = typeof app.url === 'string' ? app.url.trim() : '';
      const name = typeof app.name === 'string' && app.name.trim() ? app.name.trim() : null;
      const title = typeof app.title === 'string' ? app.title.trim() : '';
      const page = cleanPageTitle(title, name);
      const label = url ? safeHost(url) : (page || name);
      if (!label || label === 'Unknown' || label === 'null') continue;

      const ts = new Date(act.timestamp).getTime();
      if (!Number.isFinite(ts)) continue;
      const sampleSec = normalizeIntervalSeconds(act);
      const key = url || page || name;

      if (current && current.key === key && ts - current.lastMs <= VISIT_GAP_MS) {
        current.lastMs = ts;
        current.seconds += sampleSec;
        current.samples += 1;
      } else {
        current = { key, label, url: url || null, app: name, startedMs: ts, lastMs: ts, seconds: sampleSec, samples: 1 };
        visits.push(current);
      }
    }

    const websiteVisits = visits
      .slice(-60) // payload cap: the last 60 visits cover a full workday
      .reverse()  // most recent first
      .map((v) => ({
        label: v.label,
        url: v.url,
        application: v.app,
        startedAt: new Date(v.startedMs).toISOString(),
        endedAt: new Date(v.lastMs + v.seconds * 1000).toISOString(),
        seconds: Math.max(v.seconds, Math.round((v.lastMs - v.startedMs) / 1000) + v.seconds),
        samples: v.samples,
      }));

    // Hour-by-hour rollup so the employee can see when they were productive.
    const hourly = [];
    const hourBuckets = new Map();
    for (const act of activities) {
      const d = new Date(new Date(act.timestamp).getTime() + IST_OFFSET_MS);
      const hourKey = d.getUTCHours();
      let bucket = hourBuckets.get(hourKey);
      if (!bucket) {
        bucket = {
          hour: hourKey,
          label: `${String(hourKey).padStart(2, '0')}:00`,
          keystrokes: 0,
          mouseEvents: 0,
          activeSeconds: 0,
          idleSeconds: 0,
          scoreSum: 0,
          scoreSamples: 0,
          samples: 0,
        };
        hourBuckets.set(hourKey, bucket);
      }
      const ev = evaluateSample(act);
      bucket.keystrokes += ev.keys;
      bucket.mouseEvents += ev.mouseEvents;
      bucket.activeSeconds += ev.activeSec;
      bucket.idleSeconds += ev.idleSec;
      bucket.scoreSum += ev.qualityScore;
      bucket.scoreSamples += 1;
      bucket.samples += 1;
    }
    for (const bucket of [...hourBuckets.values()].sort((a, b) => a.hour - b.hour)) {
      hourly.push({
        hour: bucket.hour,
        label: bucket.label,
        keystrokes: bucket.keystrokes,
        mouseEvents: bucket.mouseEvents,
        activeSeconds: bucket.activeSeconds,
        idleSeconds: bucket.idleSeconds,
        avgProductivity: dayScoreByHour.get(bucket.hour) ?? 0,
        legacyAvgProductivity: bucket.scoreSamples > 0
          ? Math.min(100, Math.round(bucket.scoreSum / bucket.scoreSamples))
          : 0,
        // End-of-hour value of the red/yellow/green day score (0 at day start).
        dayScore: dayScoreByHour.get(bucket.hour) ?? 0,
      });
    }

    // Day-in-review summary (legacy fields kept for existing consumers).
    const summary = {
      totalLogs: unified.logCount,
      totalKeystrokes: unified.totalKeystrokes,
      totalMouseActivity: unified.avgMouseActivity,
      totalMouseEvents,
      totalIdleSeconds: unified.totalIdleSeconds,
      activeSeconds: unified.activeSeconds,
      activeHours: unified.activeHours,
      idleTime: unified.idleTime,
      avgProductivityScore: dayProd.score,
      legacyAvgProductivityScore: unified.avgProductivityScore,
      productivityEfficiency: efficiencyLabelForDay(dayProd.score, unified.hasActivity),
      efficiencyLabel: efficiencyLabelForDay(dayProd.score, unified.hasActivity),
      // New day-productivity engine. Legacy values stay additive under explicit
      // `legacy*` keys so no consumer can mistake them for the day score.
      dayProductivity: {
        score: dayProd.score,
        zone: dayProd.zone,
        mode: dayProd.mode,
        criteria: dayProd.criteria,
        trend: dayProd.trend,
        engagedSeconds: dayProd.engagedSeconds,
        voiceShare: dayProd.voiceShare,
      },
      hasActivity: unified.hasActivity,
      appDetails: unified.appDetails,
      websiteVisits,
      hourly,
      recentLogs: activities.slice(-15).reverse() // Most recent 15 entries
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

// Heartbeat from the V1 desktop agent — marks the agent as installed/online for this user.
router.post('/heartbeat', auth, async (req, res) => {
  try {
    const User = require('../models/User');
    const version = (req.body && req.body.version) ? String(req.body.version) : null;
    const update = { agentInstalled: true, agentLastSeen: new Date() };
    if (version) update.agentVersion = version;
    await User.findByIdAndUpdate(req.user.id, { $set: update });
    return res.json({ success: true, online: true, installed: true });
  } catch (error) {
    console.error('Agent heartbeat error:', error);
    return res.status(500).json({ success: false, error: 'Heartbeat failed' });
  }
});

// Status of the V1 desktop agent for the authenticated user (used by the web app
// to gate Start Day on desktop and to show/hide the Download Agent button).
router.get('/status', auth, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user.id).select('agentInstalled agentLastSeen agentVersion').lean();
    const installed = !!(user && user.agentInstalled);
    const lastSeen = user && user.agentLastSeen ? new Date(user.agentLastSeen) : null;
    const online = installed && lastSeen && (Date.now() - lastSeen.getTime() < 2 * 60 * 1000);
    return res.json({
      success: true,
      installed,
      online: !!online,
      lastSeen: lastSeen ? lastSeen.toISOString() : null,
      version: user ? user.agentVersion : null
    });
  } catch (error) {
    console.error('Agent status error:', error);
    return res.status(500).json({ success: false, error: 'Status check failed' });
  }
});

module.exports = router;
