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

function getLocalDateKey(dateVal) {
  if (!dateVal) return null;
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDateParam(dateStr) {
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    const [y, m, d] = dateStr.trim().split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  const d = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(d.getTime())) {
    return new Date();
  }
  return d;
}

function getEfficiencyLabel(score, hasActivity = true) {
  if (!hasActivity) return 'No Activity';
  if (score >= 60) return 'High Efficiency';
  if (score >= 40) return 'Moderate Efficiency';
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
 */
function evaluateSample(act) {
  const sampleSec = normalizeIntervalSeconds(act);
  const keys = Number(act?.keystroke_count || 0);
  const mouseScore = Number(act?.mouse_activity_score || 0);
  const mouseEvents = Number(act?.mouse_event_count || 0);
  const rawIdle = normalizeRawIdleSeconds(act);
  const hasInput = keys > 0 || mouseScore > 0 || mouseEvents > 0;

  // An interval is truly idle only when there was no input AND system idle >= 30s.
  // Short reading/thinking pauses (< 30s idle) count as active work, not idle penalties.
  const isIdleSample = !hasInput && rawIdle >= 30;
  const idleSec = isIdleSample ? sampleSec : 0;
  const activeSec = Math.max(0, sampleSec - idleSec);

  let qualityScore = 0;
  if (!isIdleSample) {
    const isDistraction = String(act?.app_category || '').toUpperCase() === 'DISTRACTION';
    const baseCredit = isDistraction ? 15 : 55;

    const keyCadencePerMin = (keys / sampleSec) * 60;
    const keyBonus = Math.min(1, keyCadencePerMin / 120) * 30;

    const effectiveMouseScore = mouseScore > 0
      ? Math.min(100, mouseScore)
      : (mouseEvents > 0 ? Math.min(100, Math.round((((mouseEvents / sampleSec) * 60) / 240) * 100)) : 0);
    const mouseBonus = (effectiveMouseScore / 100) * 15;

    qualityScore = Math.min(100, Math.round(baseCredit + keyBonus + mouseBonus));
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
    isIdleSample
  };
}

/**
 * Aggregate a list of EmployeeActivity docs alongside authoritative Attendance/WorkSession seconds.
 */
function summarizeActivitiesWithSession(activities = [], sessionInfo = null) {
  const logs = Array.isArray(activities) ? activities : [];
  let totalKeystrokes = 0;
  let totalMouseScore = 0;
  let activeMouseSamples = 0;
  let totalTelemetrySec = 0;
  let totalIdleSeconds = 0;
  let weightedScoreSum = 0;
  const appUsageMap = {};

  for (const act of logs) {
    const ev = evaluateSample(act);
    totalKeystrokes += ev.keys;
    totalMouseScore += ev.mouseScore;
    if (ev.mouseScore > 0) {
      activeMouseSamples++;
    }
    totalTelemetrySec += ev.sampleSec;
    totalIdleSeconds += ev.idleSec;
    weightedScoreSum += ev.qualityScore * ev.sampleSec;

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
    avgProductivityScore = Math.min(100, Math.round(weightedScoreSum / totalTelemetrySec));
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

  return {
    logCount: logs.length,
    totalKeystrokes,
    avgMouseActivity,
    totalIdleSeconds,
    activeSeconds,
    telemetryActiveSeconds,
    sessionSeconds: sessionSec,
    avgProductivityScore,
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
  getLocalDateKey,
  parseLocalDateParam,
  getEfficiencyLabel,
  normalizeIntervalSeconds,
  evaluateSample,
  summarizeActivitiesWithSession,
  resolveSessionsMap
};

