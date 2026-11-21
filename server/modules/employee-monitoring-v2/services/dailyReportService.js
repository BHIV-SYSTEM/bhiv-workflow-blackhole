/**
 * Employee Monitoring V2 - Daily Activity Report Service
 * 
 * Aggregates Attendance wall-clock hours, monitored hours, active input hours,
 * hardware idle hours, break hours, and application category breakdowns.
 * Persists reports to DailyActivityReport model.
 * 
 * STRICT PRIVACY & INTEGRITY:
 * Computes deterministic mathematical aggregations only.
 * Cleanly handles zero-telemetry days without throwing or NaN.
 */

const crypto = require('crypto');
const AggregatedTelemetryV2 = require('../models/AggregatedTelemetryV2');
const DailyActivityReport = require('../models/DailyActivityReport');
const { CATEGORIES } = require('../config/constants');

/**
 * Generates and persists a daily activity report for an employee on a given date.
 * 
 * @param {string|ObjectId} userId - Employee user ID
 * @param {Date|string} [date] - Target date (defaults to today)
 * @param {Object} [options] - Optional pre-computed attendance info
 * @param {number} [options.attendanceHours] - Total wall-clock attendance hours
 * @param {number} [options.breakTimeMinutes] - Break time in minutes
 * @param {string|ObjectId} [options.attendanceId] - Reference Attendance record ID
 * @returns {Promise<Object>} The generated and saved DailyActivityReport document/object
 */
async function generateDailyReport(userId, date = new Date(), options = {}) {
  if (!userId) {
    throw new Error('userId is required to generate daily activity report');
  }

  let dateStr;
  let startOfDay;
  let endOfDay;

  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    dateStr = date.trim();
    const [y, m, day] = dateStr.split('-').map(Number);
    startOfDay = new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0));
    endOfDay = new Date(Date.UTC(y, m - 1, day, 23, 59, 59, 999));
  } else {
    const d = date ? new Date(date) : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dateStr = `${y}-${m}-${day}`;

    const localStart = new Date(d);
    localStart.setHours(0, 0, 0, 0);
    const localEnd = new Date(d);
    localEnd.setHours(23, 59, 59, 999);

    const utcDateStr = d.toISOString().split('T')[0];
    const utcStart = new Date(`${utcDateStr}T00:00:00.000Z`);
    const utcEnd = new Date(`${utcDateStr}T23:59:59.999Z`);

    startOfDay = new Date(Math.min(localStart.getTime(), utcStart.getTime()));
    endOfDay = new Date(Math.max(localEnd.getTime(), utcEnd.getTime()));
  }

  // 1. Resolve Attendance wall-clock and break hours
  let totalAttendanceHours = 0;
  let breakHours = 0;
  let attendanceRecordId = options.attendanceId || null;

  if (options.attendanceHours !== undefined && options.attendanceHours !== null) {
    totalAttendanceHours = +(Number(options.attendanceHours) || 0).toFixed(2);
  }
  if (options.breakTimeMinutes !== undefined && options.breakTimeMinutes !== null) {
    breakHours = +(Number(options.breakTimeMinutes) / 60 || 0).toFixed(2);
  }

  // If attendance values not provided in options, attempt read-only lookup from Attendance / DailyAttendance
  if (options.attendanceHours === undefined) {
    try {
      const Attendance = require('../../../models/Attendance');
      const record = await Attendance.findOne({
        user: userId,
        $or: [
          { date: { $gte: startOfDay, $lte: endOfDay } },
          { startDayTime: { $gte: startOfDay, $lte: endOfDay } }
        ]
      }).sort({ startDayTime: -1 }).lean();

      if (record) {
        if (!attendanceRecordId) attendanceRecordId = record._id;
        if (record.hoursWorked !== undefined && record.hoursWorked !== null) {
          totalAttendanceHours = +(Number(record.hoursWorked) || 0).toFixed(2);
        } else if (record.startDayTime && (record.endDayTime || record.endTime)) {
          const diffMs = new Date(record.endDayTime || record.endTime) - new Date(record.startDayTime);
          totalAttendanceHours = +(Math.max(0, diffMs) / (1000 * 3600)).toFixed(2);
        }
        if (options.breakTimeMinutes === undefined && record.breakTime) {
          breakHours = +(Number(record.breakTime) / 60).toFixed(2);
        }
      } else {
        const DailyAttendance = require('../../../models/DailyAttendance');
        const dailyRec = await DailyAttendance.findOne({
          user: userId,
          date: { $gte: startOfDay, $lte: endOfDay }
        }).lean();
        if (dailyRec) {
          if (!attendanceRecordId) attendanceRecordId = dailyRec._id;
          totalAttendanceHours = +(Number(dailyRec.totalHoursWorked || dailyRec.regularHours) || 0).toFixed(2);
          if (options.breakTimeMinutes === undefined && dailyRec.breakTime) {
            breakHours = +(Number(dailyRec.breakTime) / 60).toFixed(2);
          }
        }
      }
    } catch (attErr) {
      console.warn('[dailyReportService] Warning: Failed to query attendance record:', attErr.message);
    }
  }

  // 2. Query AggregatedTelemetryV2 for the day
  let telemetry = [];
  try {
    telemetry = await AggregatedTelemetryV2.find({
      employee: userId,
      minute_timestamp: { $gte: startOfDay, $lte: endOfDay }
    }).lean();
  } catch (telErr) {
    console.warn('[dailyReportService] Warning: Failed to query telemetry slices:', telErr.message);
  }

  // 3. Aggregate 1-minute telemetry slices
  let totalMonitoredSeconds = 0;
  let totalHardwareIdleSeconds = 0;
  let totalActiveInputSeconds = 0;

  const categoryUsage = {};
  for (const cat of Object.values(CATEGORIES)) {
    categoryUsage[cat] = { seconds: 0, count: 0 };
  }

  for (const sample of telemetry) {
    const duration = sample.duration_seconds || 60;
    const idle = sample.activity_counts?.hardware_idle_seconds || 0;
    const hasInput = (sample.activity_counts?.key_presses || 0) > 0 || (sample.activity_counts?.mouse_events || 0) > 0;
    const cat = sample.primary_category || CATEGORIES.NEUTRAL;

    totalMonitoredSeconds += duration;
    totalHardwareIdleSeconds += idle;
    if (hasInput) {
      totalActiveInputSeconds += Math.max(0, duration - idle);
    }

    if (!categoryUsage[cat]) {
      categoryUsage[cat] = { seconds: 0, count: 0 };
    }
    categoryUsage[cat].seconds += duration;
    categoryUsage[cat].count += 1;
  }

  // 4. Calculate category breakdown and percentage
  const categories = Object.entries(categoryUsage).map(([name, stats]) => ({
    name,
    durationSeconds: stats.seconds,
    durationHours: +(stats.seconds / 3600).toFixed(2),
    percentage: totalMonitoredSeconds > 0 ? Math.round((stats.seconds / totalMonitoredSeconds) * 100) : 0,
    sliceCount: stats.count
  }));

  const reportId = `v2_rep_${crypto.randomUUID().replace(/-/g, '')}_${Date.now()}`;
  const reportData = {
    reportId,
    employee: userId,
    date: dateStr,
    totalAttendanceHours,
    monitoredHours: +(totalMonitoredSeconds / 3600).toFixed(2),
    activeInputHours: +(totalActiveInputSeconds / 3600).toFixed(2),
    hardwareIdleHours: +(totalHardwareIdleSeconds / 3600).toFixed(2),
    breakHours,
    categories,
    telemetrySliceCount: telemetry.length,
    attendanceRecord: attendanceRecordId,
    generatedAt: new Date()
  };

  // 5. Persist to DailyActivityReport model
  try {
    const saved = await DailyActivityReport.findOneAndUpdate(
      { employee: userId, date: dateStr },
      reportData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return saved.toObject ? saved.toObject() : saved;
  } catch (saveErr) {
    console.warn('[dailyReportService] Warning: Failed to persist DailyActivityReport:', saveErr.message);
    return reportData;
  }
}

/**
 * Alias for generateDailyReport to ensure full interoperability across callers.
 */
async function compileDailyReport(params) {
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    const { employeeId, userId, date, attendanceHours, breakTimeMinutes, attendanceId } = params;
    return generateDailyReport(employeeId || userId, date, {
      attendanceHours,
      breakTimeMinutes,
      attendanceId
    });
  }
  return generateDailyReport(...arguments);
}

module.exports = {
  generateDailyReport,
  compileDailyReport
};
