/**
 * Unified Employee Activity Telemetry & Work-Session Metrics Helper
 *
 * Ensures every Employee Monitoring endpoint (Live Team Overview, Daily View,
 * Monthly View, Employee Detail Modal, Reports, and Daily Summary) computes the
 * exact same Active Hours, Idle Time, Keystrokes, Mouse Activity, Productivity
 * Score, and Efficiency Tier from one shared source of truth.
 */

const WorkSession = require('../models/WorkSession');
const Attendance = require('../models/Attendance');
const DailyAttendance = require('../models/DailyAttendance');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Format any Date / ISO value as YYYY-MM-DD in IST (UTC+05:30),
 * so UTC containers and IST local machines always agree on day keys.
 */
function getLocalDateKey(dateVal) {
  if (!dateVal) return null;
  if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal.trim())) {
    return dateVal.trim();
  }
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (Number.isNaN(d.getTime())) return null;
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const day = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Return exact UTC [start, end] bounds covering an IST calendar day (00:00:00.000 - 23:59:59.999 IST).
 */
function getIstDayBounds(dateInput = new Date()) {
  let y, m, d;
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    [y, m, d] = dateInput.trim().split('-').map(Number);
  } else {
    const parsed = dateInput ? new Date(dateInput) : new Date();
    const valid = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const ist = new Date(valid.getTime() + IST_OFFSET_MS);
    y = ist.getUTCFullYear();
    m = ist.getUTCMonth() + 1;
    d = ist.getUTCDate();
  }
  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - IST_OFFSET_MS;
  return {
    start: new Date(startMs),
    end: new Date(startMs + DAY_MS - 1),
    dateKey: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  };
}

function getIstRangeBounds(startInput, endInput) {
  const { start } = getIstDayBounds(startInput || new Date());
  const { end } = getIstDayBounds(endInput || startInput || new Date());
  return { start, end };
}

function eachIstDateKey(startInput, endInput) {
  const { start, end } = getIstRangeBounds(startInput, endInput);
  const keys = [];
  for (let ms = start.getTime(); ms <= end.getTime(); ms += DAY_MS) {
    const key = getLocalDateKey(new Date(ms));
    if (key) keys.push(key);
  }
  return keys;
}

function parseLocalDateParam(dateStr) {
  return getIstDayBounds(dateStr || new Date()).start;
}

function formatDurationHM(seconds) {
  if (!seconds || seconds <= 0) return '0h 0m';
  const totalMins = Math.round(seconds / 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}h ${m}m`;
}

function getEfficiencyLabel(score, hasActivity = true) {
  if (!hasActivity) return 'No Activity';
  if (score >= 50) return 'High Efficiency';
  if (score >= 30) return 'Moderate Efficiency';
  return 'Low Efficiency';
}

function normalizeIntervalSeconds(act) {
  const raw = Number(act?.interval_seconds);
  if (Number.isFinite(raw) && raw >= 1 && raw <= 120) {
    return raw;
  }
  return 30;
}

function normalizeRawIdleSeconds(act) {
  let raw = Number(act?.idle_duration || 0);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  if (raw > 10000) raw = Math.round(raw / 1000);
  return raw;
}

/**
 * Compute per-sample active/idle seconds and normalized productivity score (0-100)
 * scaled by the sample's actual interval_seconds (5s agent cadence vs 30s legacy).
 * Uses graded pause credit (<30s, <120s, <300s) instead of a 30s 0-score cliff.
 */
function evaluateSample(act) {
  const sampleSec = normalizeIntervalSeconds(act);
  const keys = Number(act?.keystroke_count || 0);
  const mouseScore = Number(act?.mouse_activity_score || 0);
  const mouseEvents = Number(act?.mouse_event_count || 0);
  const rawIdle = normalizeRawIdleSeconds(act);
  const hasInput = keys > 0 || mouseScore > 0 || mouseEvents > 0;
  const appName = act?.active_application?.name;
  const source = String(act?.metadata?.source || '').toLowerCase();
  const isBrowserSource = source === 'browser';
  const isBrowserPortalTitle = typeof appName === 'string' && /infiverse\s*-?\s*ai workflow/i.test(appName);
  const isBgBrowserPoll = !hasInput && (isBrowserSource || isBrowserPortalTitle || (sampleSec >= 25 && (!appName || appName === 'Unknown' || appName === 'null')));
  const isDesktopSample = !isBrowserSource && !isBrowserPortalTitle && (sampleSec <= 15 || (Boolean(appName) && appName !== 'Other' && appName !== 'Unknown' && appName !== 'null'));

  // An interval is truly idle only when there is no input AND system idle >= 300s (5 minutes).
  // Reading/thinking/call pauses under 5 minutes receive graded focus credit instead of 0.
  const isIdleSample = !hasInput && rawIdle >= 300;
  const idleSec = isIdleSample ? sampleSec : 0;
  const activeSec = Math.max(0, sampleSec - idleSec);

  let qualityScore = 0;
  if (!isIdleSample) {
    const isDistraction = String(act?.app_category || '').toUpperCase() === 'DISTRACTION';

    if (hasInput) {
      const baseCredit = isDistraction ? 20 : 75;
      const keyCadencePerMin = (keys / sampleSec) * 60;
      const keyBonus = Math.min(1, keyCadencePerMin / 30) * 15;

      const effectiveMouseScore = mouseScore > 0
        ? Math.min(100, mouseScore)
        : (mouseEvents > 0 ? Math.min(100, Math.round((((mouseEvents / sampleSec) * 60) / 120) * 100)) : 0);
      const mouseBonus = (effectiveMouseScore / 100) * 10;

      qualityScore = Math.min(100, Math.round(baseCredit + (isDistraction ? keyBonus * 0.3 : keyBonus + mouseBonus)));
    } else if (rawIdle < 30) {
      qualityScore = isDistraction ? 15 : 70;
    } else if (rawIdle < 120) {
      qualityScore = isDistraction ? 10 : 58;
    } else {
      qualityScore = isDistraction ? 5 : 40;
    }
  }

  return {
    sampleSec,
    idleSec,
    activeSec,
    keys,
    mouseScore,
    mouseEvents,
    qualityScore,
    hasInput,
    isIdleSample,
    isBgBrowserPoll,
    isDesktopSample
  };
}

/**
 * Aggregate a list of EmployeeActivity docs alongside authoritative Attendance/WorkSession seconds.
 */
function summarizeActivitiesWithSession(activities = [], sessionInfo = null, evalCache = null) {
  const logs = Array.isArray(activities) ? activities : [];
  // Shared with the day-score engine: one evaluateSample() per telemetry row.
  const evaluate = (act) => {
    if (!evalCache) return evaluateSample(act);
    let ev = evalCache.get(act);
    if (!ev) {
      ev = evaluateSample(act);
      evalCache.set(act, ev);
    }
    return ev;
  };
  let totalKeystrokes = 0;
  let totalMouseScore = 0;
  let activeMouseSamples = 0;
  let totalTelemetrySec = 0;
  let totalIdleSeconds = 0;
  let weightedScoreSum = 0;
  let nonBgTelemetrySec = 0;
  let nonBgWeightedSum = 0;
  let desktopSampleCount = 0;
  const appUsageMap = {};

  for (const act of logs) {
    const ev = evaluate(act);
    totalKeystrokes += ev.keys;
    totalMouseScore += ev.mouseScore;
    if (ev.mouseScore > 0) {
      activeMouseSamples++;
    }
    totalTelemetrySec += ev.sampleSec;
    totalIdleSeconds += ev.idleSec;
    weightedScoreSum += ev.qualityScore * ev.sampleSec;

    if (ev.isDesktopSample) {
      desktopSampleCount++;
    }
    if (!ev.isBgBrowserPoll) {
      nonBgTelemetrySec += ev.sampleSec;
      nonBgWeightedSum += ev.qualityScore * ev.sampleSec;
    }

    const appName = act?.active_application?.name || 'Other';
    appUsageMap[appName] = (appUsageMap[appName] || 0) + ev.sampleSec;
  }

  const telemetryActiveSeconds = Math.max(0, totalTelemetrySec - totalIdleSeconds);
  const sessionSec = Number(sessionInfo?.sessionSeconds || 0);
  const activeSeconds = sessionSec > 0 ? sessionSec : telemetryActiveSeconds;

  const hasTelemetry = logs.length > 0;
  const hasSession = sessionSec > 0 || Boolean(sessionInfo?.startTime);
  const hasActivity = hasTelemetry || hasSession;

  let avgProductivityScore = 0;
  if (hasTelemetry && totalTelemetrySec > 0) {
    // When Desktop Agent is active, exclude 0-input background browser polls so they don't 6x dilute coding work
    const useNonBg = desktopSampleCount > 0 && nonBgTelemetrySec > 0;
    const denom = useNonBg ? nonBgTelemetrySec : totalTelemetrySec;
    const numer = useNonBg ? nonBgWeightedSum : weightedScoreSum;
    avgProductivityScore = Math.min(100, Math.round(numer / denom));
  } else if (sessionSec > 0) {
    avgProductivityScore = 50;
  }

  const avgMouseActivity = activeMouseSamples > 0
    ? Math.round(totalMouseScore / activeMouseSamples)
    : 0;

  const productivityEfficiency = getEfficiencyLabel(avgProductivityScore, hasActivity);

  const appDetails = Object.entries(appUsageMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, seconds]) => ({ name, count: Math.max(1, Math.round(seconds / 60)) || 1 }));

  const activeHours = `${Math.floor(activeSeconds / 3600)}h ${Math.floor((activeSeconds % 3600) / 60)}m`;
  const idleTime = `${Math.floor(totalIdleSeconds / 60)}m`;
  const idleTimeFormatted = formatDurationHM(totalIdleSeconds);

  return {
    logCount: logs.length,
    totalKeystrokes,
    avgMouseActivity,
    mouseActivity: avgMouseActivity,
    totalIdleSeconds,
    idleTime,
    idleTimeFormatted,
    activeSeconds,
    activeHours,
    telemetryActiveSeconds,
    sessionSeconds: sessionSec,
    avgProductivityScore,
    productivityScore: avgProductivityScore,
    productivityEfficiency,
    hasActivity,
    hasStartedDay: Boolean(hasSession || hasTelemetry || activeSeconds > 0),
    startDayTime: sessionInfo?.startTime || null,
    appDetails
  };
}

/**
 * Compute authoritative working seconds for a WorkSession or Attendance/DailyAttendance record.
 */
function computeRecordSessionSeconds(rec, isWorkSession, now = new Date(), dayKey = null) {
  if (!rec) return { seconds: 0, startTime: null };
  const todayKey = getLocalDateKey(now);
  const isToday = !dayKey || dayKey === todayKey;

  if (isWorkSession) {
    if (!rec.startTime) return { seconds: 0, startTime: null };
    const startMs = new Date(rec.startTime).getTime();
    if (Number.isNaN(startMs)) return { seconds: 0, startTime: null };

    const endDate = (rec.status === 'completed' && rec.endTime)
      ? new Date(rec.endTime)
      : (isToday ? now : new Date(startMs + 8 * 3600 * 1000));
    const totalMinutes = Math.max(0, Math.floor((endDate.getTime() - startMs) / 60000));
    let breakMinutes = Number(rec.totalBreakTime || 0);
    if (rec.status === 'paused' && rec.pausedAt) {
      breakMinutes += Math.max(0, Math.floor((now.getTime() - new Date(rec.pausedAt).getTime()) / 60000));
    }
    const activeSec = Math.max(0, totalMinutes - breakMinutes) * 60;
    return { seconds: activeSec, startTime: rec.startTime };
  }

  // Attendance / DailyAttendance
  if (rec.startDayTime) {
    const startMs = new Date(rec.startDayTime).getTime();
    if (Number.isNaN(startMs)) return { seconds: 0, startTime: null };

    const endDate = rec.endDayTime
      ? new Date(rec.endDayTime)
      : (isToday ? now : new Date(startMs + 8 * 3600 * 1000));
    const maxSec = Math.max(0, Math.floor((endDate.getTime() - startMs) / 1000));

    let sec = maxSec;
    const loggedHours = Number(rec.totalHoursWorked || rec.hoursWorked || 0);
    if (rec.endDayTime && loggedHours > 0) {
      sec = Math.min(maxSec, Math.round(loggedHours * 3600));
    }
    const breakMinutes = Number(rec.breakTime || 0);
    sec = Math.max(0, sec - (rec.endDayTime ? 0 : breakMinutes * 60));
    return { seconds: sec, startTime: rec.startDayTime };
  }

  const fallbackHours = Number(rec.totalHoursWorked || rec.hoursWorked || 0);
  if (fallbackHours > 0) {
    return { seconds: Math.round(fallbackHours * 3600), startTime: null };
  }
  return { seconds: 0, startTime: null };
}

/**
 * Batch-resolve authoritative workday session seconds by `${empId}_${dateKey}`.
 * Matches WorkHoursManager precedence: active/latest WorkSession -> Attendance -> DailyAttendance.
 */
async function resolveSessionsMap(empIds, startDate, endDate, now = new Date()) {
  if (!Array.isArray(empIds) || empIds.length === 0) {
    return new Map();
  }

  const [workSessions, attendances, dailyAttendances] = await Promise.all([
    WorkSession.find({
      employee: { $in: empIds },
      $or: [
        { date: { $gte: startDate, $lte: endDate } },
        { startTime: { $gte: startDate, $lte: endDate } }
      ]
    }).sort({ updatedAt: -1, startTime: -1 }).lean(),

    Attendance.find({
      user: { $in: empIds },
      $or: [
        { date: { $gte: startDate, $lte: endDate } },
        { startDayTime: { $gte: startDate, $lte: endDate } }
      ]
    }).sort({ startDayTime: -1, createdAt: -1 }).lean(),

    DailyAttendance.find({
      user: { $in: empIds },
      $or: [
        { date: { $gte: startDate, $lte: endDate } },
        { startDayTime: { $gte: startDate, $lte: endDate } }
      ]
    }).sort({ startDayTime: -1, createdAt: -1 }).lean()
  ]);

  const sessionsMap = new Map();

  const applyRecord = (empId, rawDate, computed, priority) => {
    if (!empId || !rawDate) return;
    const dKey = getLocalDateKey(rawDate);
    if (!dKey) return;
    const mapKey = `${empId}_${dKey}`;
    const existing = sessionsMap.get(mapKey);
    // Keep highest-priority record (WorkSession=3, Attendance=2, DailyAttendance=1)
    // and only override same priority if it wasn't populated yet
    if (!existing || priority > existing.priority) {
      sessionsMap.set(mapKey, {
        sessionSeconds: computed.seconds,
        startTime: computed.startTime,
        dateKey: dKey,
        empId: String(empId),
        priority
      });
    }
  };

  // Process oldest-to-newest within same priority? Arrays are sorted newest-first,
  // so only write if not already set for that (emp, day, priority).
  for (const da of dailyAttendances) {
    const empId = da.user ? String(da.user) : null;
    const dKey = getLocalDateKey(da.date || da.startDayTime);
    const mapKey = `${empId}_${dKey}`;
    if (empId && dKey && !sessionsMap.has(mapKey)) {
      applyRecord(empId, da.date || da.startDayTime, computeRecordSessionSeconds(da, false, now, dKey), 1);
    }
  }

  for (const att of attendances) {
    const empId = att.user ? String(att.user) : null;
    const dKey = getLocalDateKey(att.date || att.startDayTime);
    const mapKey = `${empId}_${dKey}`;
    const existing = sessionsMap.get(mapKey);
    if (empId && dKey && (!existing || existing.priority < 2)) {
      applyRecord(empId, att.date || att.startDayTime, computeRecordSessionSeconds(att, false, now, dKey), 2);
    }
  }

  for (const ws of workSessions) {
    const empId = ws.employee ? String(ws.employee) : null;
    const dKey = getLocalDateKey(ws.date || ws.startTime);
    const mapKey = `${empId}_${dKey}`;
    const existing = sessionsMap.get(mapKey);
    if (empId && dKey && (!existing || existing.priority < 3)) {
      applyRecord(empId, ws.date || ws.startTime, computeRecordSessionSeconds(ws, true, now, dKey), 3);
    }
  }

  return sessionsMap;
}

module.exports = {
  IST_OFFSET_MS,
  getLocalDateKey,
  getIstDayBounds,
  getIstRangeBounds,
  eachIstDateKey,
  parseLocalDateParam,
  formatDurationHM,
  getEfficiencyLabel,
  normalizeIntervalSeconds,
  evaluateSample,
  summarizeActivitiesWithSession,
  resolveSessionsMap
};

