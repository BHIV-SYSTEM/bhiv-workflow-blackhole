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

/**
 * Keep open Attendance & DailyAttendance records in sync when ending a monitoring WorkSession directly.
 */
async function syncAttendanceCloseFromWorkSession({
  employeeId,
  session,
  endTime = new Date(),
  io = null,
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
    dailyRecord.dailyProgressCompleted = true;
    dailyRecord.spamStatus = "Valid";
    dailyRecord.autoEnded = false;
    await dailyRecord.save();
  }

  if (io) {
    io.emit("attendance:day-ended", {
      userId: employeeId,
      endTime,
      hoursWorked,
      progressCompleted: true,
    });
  }

  return attendanceRecord;
}

module.exports = {
  getIstDayBounds,
  getDailyProgressWindow,
  hasMeaningfulProgress,
  findDailyProgressStatus,
  syncAttendanceCloseFromWorkSession,
};

