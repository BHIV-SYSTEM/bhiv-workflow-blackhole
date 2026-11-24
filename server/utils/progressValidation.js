const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Compute UTC timestamps for the start and end of the business day in IST (UTC+05:30),
 * ensuring consistent day boundaries whether the server runs in UTC or local IST.
 */
function getIstDayBounds(now = new Date()) {
  const istShifted = new Date(now.getTime() + IST_OFFSET_MS);
  const istMidnightUtcMs =
    Date.UTC(istShifted.getUTCFullYear(), istShifted.getUTCMonth(), istShifted.getUTCDate()) -
    IST_OFFSET_MS;
  return {
    start: new Date(istMidnightUtcMs),
    end: new Date(istMidnightUtcMs + DAY_MS),
  };
}

/**
 * Build an inclusive query window covering both IST day bounds and any active session start date
 * (for overnight shifts that started before midnight).
 */
function getDailyProgressWindow(referenceDates = [], now = new Date()) {
  const ist = getIstDayBounds(now);
  const localStart = new Date(now);
  localStart.setHours(0, 0, 0, 0);

  let startMs = ist.start.getTime();
  let endMs = Math.max(ist.end.getTime(), now.getTime() + 60 * 1000);

  for (const ref of referenceDates) {
    if (!ref) continue;
    const parsed = ref instanceof Date ? ref : new Date(ref);
    if (Number.isNaN(parsed.getTime())) continue;
    // Clamp session references within the past 48h so corrupted historical dates cannot match weeks old logs
    if (now.getTime() - parsed.getTime() <= 2 * DAY_MS && parsed.getTime() < startMs) {
      startMs = parsed.getTime();
    }
  }

  return {
    start: new Date(startMs),
    end: new Date(endMs),
    todayStart: ist.start,
    tomorrowStart: ist.end,
  };
}

/**
 * Determine whether a single Progress document represents an actual user submission.
 */
function hasMeaningfulProgress(progressDoc) {
  if (!progressDoc) return false;

  const hasText =
    (typeof progressDoc.notes === "string" && progressDoc.notes.trim() !== "") ||
    (typeof progressDoc.achievements === "string" && progressDoc.achievements.trim() !== "") ||
    (typeof progressDoc.blockers === "string" && progressDoc.blockers.trim() !== "");

  const hasTasksOrImages =
    (Array.isArray(progressDoc.tasksCompleted) && progressDoc.tasksCompleted.length > 0) ||
    (Array.isArray(progressDoc.progressImages) && progressDoc.progressImages.length > 0);

  const hasPositivePercentage =
    (typeof progressDoc.progressPercentage === "number" &&
      !Number.isNaN(progressDoc.progressPercentage) &&
      progressDoc.progressPercentage > 0) ||
    (typeof progressDoc.percentageCompleted === "number" &&
      !Number.isNaN(progressDoc.percentageCompleted) &&
      progressDoc.percentageCompleted > 0);

  return hasText || hasTasksOrImages || hasPositivePercentage;
}

/**
 * Find today's progress submissions (newest first) and check if ANY entry contains meaningful progress.
 * Prevents stale/blank earlier entries from masking later progress submissions made on the same day.
 */
async function findDailyProgressStatus(ProgressModel, userId, referenceDates = [], now = new Date()) {
  const { start, end, todayStart, tomorrowStart } = getDailyProgressWindow(referenceDates, now);

  const entries = await ProgressModel.find({
    user: userId,
    $or: [
      { date: { $gte: start, $lt: end } },
      { createdAt: { $gte: start, $lt: end } },
    ],
  }).sort({ updatedAt: -1, createdAt: -1, date: -1 });

  const matchedProgress = entries.find(hasMeaningfulProgress) || null;

  return {
    hasProgressContent: Boolean(matchedProgress),
    todayProgress: matchedProgress || entries[0] || null,
    count: entries.length,
    windowStart: start,
    windowEnd: end,
    todayStart,
    tomorrowStart,
  };
}

const MIN_MISSED_PROGRESS_REASON_LENGTH = 10;

/**
 * Format a Date in IST as DD MMM YYYY for clear user-facing prompts.
 */
function formatIstDateLabel(date) {
  const istShifted = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(istShifted.getUTCDate()).padStart(2, "0");
  const month = months[istShifted.getUTCMonth()];
  const year = istShifted.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Check if the employee's most recent previous working day (strictly before today)
 * missed a meaningful daily progress update and has not yet recorded a reason.
 */
async function checkPreviousDayMissingProgress(userId, now = new Date()) {
  const Attendance = require("../models/Attendance");
  const DailyAttendance = require("../models/DailyAttendance");
  const Progress = require("../models/Progress");

  const ist = getIstDayBounds(now);
  const localMidnight = new Date(now);
  localMidnight.setHours(0, 0, 0, 0);
  const todayCutoff = new Date(Math.min(ist.start.getTime(), localMidnight.getTime()));

  const prevFilter = {
    user: userId,
    startDayTime: { $exists: true, $ne: null, $lt: todayCutoff },
    isLeave: { $ne: true },
  };

  const [prevAttendance, prevDaily] = await Promise.all([
    Attendance.findOne(prevFilter).sort({ startDayTime: -1, date: -1 }),
    DailyAttendance.findOne(prevFilter).sort({ startDayTime: -1, date: -1 }),
  ]);

  const latestRecord =
    prevAttendance && prevDaily
      ? new Date(prevAttendance.startDayTime) >= new Date(prevDaily.startDayTime)
        ? prevAttendance
        : prevDaily
      : prevAttendance || prevDaily;

  if (!latestRecord) {
    return { missing: false, reasonRequired: false };
  }

  // If a reason was already recorded on either previous record, do not block again
  const existingReason =
    (prevAttendance?.missedProgressReason && prevAttendance.missedProgressReason.trim()) ||
    (prevDaily?.missedProgressReason && prevDaily.missedProgressReason.trim()) ||
    "";
  if (existingReason) {
    return { missing: false, reasonRequired: false };
  }

  const refDate = latestRecord.startDayTime || latestRecord.date;
  const prevBounds = getIstDayBounds(refDate);
  const prevLocal = new Date(refDate);
  prevLocal.setHours(0, 0, 0, 0);

  const windowStart = new Date(Math.min(prevBounds.start.getTime(), prevLocal.getTime()));
  let windowEnd = Math.max(prevBounds.end.getTime(), prevLocal.getTime() + DAY_MS);
  if (latestRecord.endDayTime) {
    const endMs = new Date(latestRecord.endDayTime).getTime();
    if (!Number.isNaN(endMs) && endMs > windowEnd) {
      windowEnd = endMs + 60 * 60 * 1000;
    }
  }
  windowEnd = new Date(Math.min(windowEnd, ist.start.getTime()));

  const entries = await Progress.find({
    user: userId,
    $or: [
      { date: { $gte: windowStart, $lt: windowEnd } },
      { createdAt: { $gte: windowStart, $lt: windowEnd } },
    ],
  }).sort({ updatedAt: -1, createdAt: -1 });

  const hasProgress = entries.some(hasMeaningfulProgress);
  if (hasProgress) {
    return { missing: false, reasonRequired: false };
  }

  const previousDateLabel = formatIstDateLabel(refDate);

  return {
    missing: true,
    reasonRequired: true,
    previousWorkDate: prevBounds.start,
    previousDateLabel,
    attendanceId: prevAttendance?._id || null,
    dailyAttendanceId: prevDaily?._id || null,
    minLength: MIN_MISSED_PROGRESS_REASON_LENGTH,
  };
}

/**
 * Require and persist an explanation when starting a new day after a workday with missing progress.
 */
async function validateAndRecordMissedProgressReason({
  userId,
  reason,
  now = new Date(),
  minLength = MIN_MISSED_PROGRESS_REASON_LENGTH,
}) {
  const check = await checkPreviousDayMissingProgress(userId, now);
  if (!check.missing) {
    return { ok: true, missing: false };
  }

  const trimmed = typeof reason === "string" ? reason.trim() : "";
  if (trimmed.length < minLength) {
    return {
      ok: false,
      missing: true,
      code: "PREVIOUS_DAY_PROGRESS_REASON_REQUIRED",
      status: 400,
      error: `Why was the previous day's progress (${check.previousDateLabel}) not updated? Please enter a valid reason (at least ${minLength} characters) to start your day.`,
      previousWorkDate: check.previousWorkDate,
      previousDateLabel: check.previousDateLabel,
      minLength,
    };
  }

  const Attendance = require("../models/Attendance");
  const DailyAttendance = require("../models/DailyAttendance");
  const cleanReason = trimmed.slice(0, 500);
  const updates = [];

  if (check.attendanceId) {
    updates.push(
      Attendance.findByIdAndUpdate(check.attendanceId, {
        $set: {
          missedProgressReason: cleanReason,
          missedProgressReasonSubmittedAt: now,
          dailyProgressCompleted: false,
        },
      })
    );
  }
  if (check.dailyAttendanceId) {
    updates.push(
      DailyAttendance.findByIdAndUpdate(check.dailyAttendanceId, {
        $set: {
          missedProgressReason: cleanReason,
          missedProgressReasonSubmittedAt: now,
          dailyProgressCompleted: false,
        },
      })
    );
  }

  await Promise.all(updates);

  return {
    ok: true,
    missing: true,
    recordedReason: cleanReason,
    previousWorkDate: check.previousWorkDate,
    previousDateLabel: check.previousDateLabel,
  };
}

/**
 * Check whether the employee has already created today's Aim (for Start Day reminder).
 */
async function checkTodayAimStatus(userId, now = new Date()) {
  const Aim = require("../models/Aim");
  const ist = getIstDayBounds(now);
  const localStart = new Date(now);
  localStart.setHours(0, 0, 0, 0);
  const localEnd = new Date(localStart.getTime() + DAY_MS);

  const start = new Date(Math.min(ist.start.getTime(), localStart.getTime()));
  const end = new Date(Math.max(ist.end.getTime(), localEnd.getTime()));

  const todayAim = await Aim.findOne({
    user: userId,
    $or: [
      { date: { $gte: start, $lt: end } },
      { createdAt: { $gte: start, $lt: end } },
    ],
  }).sort({ createdAt: -1 });

  return {
    hasAimToday: Boolean(todayAim && todayAim.aims && todayAim.aims.trim() !== ""),
    aimReminder: !(todayAim && todayAim.aims && todayAim.aims.trim() !== ""),
    aimReminderMessage:
      "Day started! Please set your Aim for today in the Set Aims tab.",
    todayAim: todayAim || null,
  };
}

/**
 * Keep open Attendance & DailyAttendance records in sync when ending a monitoring WorkSession directly.
 */
async function syncAttendanceCloseFromWorkSession({
  employeeId,
  session,
  endTime = new Date(),
  io = null,
  progressCompleted = false,
}) {
  const Attendance = require("../models/Attendance");
  const DailyAttendance = require("../models/DailyAttendance");

  const attendanceRecord = await Attendance.findOne({
    user: employeeId,
    startDayTime: { $exists: true, $ne: null },
    $or: [{ endDayTime: { $exists: false } }, { endDayTime: null }],
  }).sort({ startDayTime: -1 });

  if (!attendanceRecord || !attendanceRecord.startDayTime) {
    return null;
  }

  const totalMilliseconds = Math.max(0, endTime.getTime() - new Date(attendanceRecord.startDayTime).getTime());
  const hoursWorked = Math.round((totalMilliseconds / (1000 * 60 * 60)) * 100) / 100;
  const breakTimeMinutes = session?.totalBreakTime || 0;
  const standardHours = 8;
  const overtimeHours =
    hoursWorked > standardHours ? Math.round((hoursWorked - standardHours) * 100) / 100 : 0;

  attendanceRecord.endDayTime = endTime;
  attendanceRecord.hoursWorked = hoursWorked;
  attendanceRecord.breakTime = breakTimeMinutes;
  attendanceRecord.isPresent = true;
  attendanceRecord.overtimeHours = overtimeHours;
  attendanceRecord.isVerified = true;
  attendanceRecord.approvalStatus = "Auto-Approved";
  attendanceRecord.spamStatus = "Valid";
  attendanceRecord.autoEnded = false;
  attendanceRecord.dailyProgressCompleted = Boolean(progressCompleted);
  attendanceRecord.progressReminderSent = !progressCompleted;
  await attendanceRecord.save();

  const dailyRecord = await DailyAttendance.findOne({
    user: employeeId,
    date: attendanceRecord.date,
  });

  if (dailyRecord) {
    dailyRecord.endDayTime = endTime;
    dailyRecord.totalHoursWorked = hoursWorked;
    dailyRecord.regularHours = Math.min(hoursWorked, standardHours);
    dailyRecord.overtimeHours = overtimeHours;
    dailyRecord.breakTime = breakTimeMinutes;
    dailyRecord.isPresent = true;
    dailyRecord.status = "Present";
    dailyRecord.dailyProgressCompleted = Boolean(progressCompleted);
    dailyRecord.progressReminderSent = !progressCompleted;
    dailyRecord.spamStatus = "Valid";
    dailyRecord.autoEnded = false;
    await dailyRecord.save();
  }

  if (io) {
    io.emit("attendance:day-ended", {
      userId: employeeId,
      endTime,
      hoursWorked,
      progressCompleted: Boolean(progressCompleted),
      progressReminder: !progressCompleted,
    });
  }

  return attendanceRecord;
}

module.exports = {
  MIN_MISSED_PROGRESS_REASON_LENGTH,
  getIstDayBounds,
  getDailyProgressWindow,
  hasMeaningfulProgress,
  findDailyProgressStatus,
  checkPreviousDayMissingProgress,
  validateAndRecordMissedProgressReason,
  checkTodayAimStatus,
  syncAttendanceCloseFromWorkSession,
};

