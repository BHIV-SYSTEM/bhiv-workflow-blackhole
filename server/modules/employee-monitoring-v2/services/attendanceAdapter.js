/**
 * Employee Monitoring V2 - Read-Only Attendance Adapter
 * 
 * STRICT ATTENDANCE ISOLATION (Correction 5):
 * Monitoring V2 must have ZERO side effects on attendance records.
 * 
 * This adapter is strictly READ-ONLY. It checks whether an employee currently
 * has an active workday in Niyantran before allowing a monitoring work session to start.
 * 
 * PROHIBITED ACTIONS:
 * - NO automatic clock-in or clock-out
 * - NO modifications to Attendance or DailyAttendance collections
 * - NO modification of hoursWorked, breakTime, overtimeHours
 * - NO salary or stipend calculations or productivity-based penalties
 */

class AttendanceAdapter {
  /**
   * Read-only query checking if an employee currently has an active workday started.
   * Supports an 18-hour overnight cutoff window and falls back to DailyAttendance.
   * Does NOT alter or create any attendance record.
   * 
   * @param {string} userId - User ObjectId string
   * @returns {Promise<{ hasActiveWorkday: boolean, startDayTime: Date|null, attendanceId?: any, workLocation?: string, breakTimeMinutes?: number }>}
   */
  static async checkActiveWorkday(userId) {
    if (!userId) return { hasActiveWorkday: false, startDayTime: null };

    try {
      // Lazy-load existing Attendance model to prevent circular dependency
      const Attendance = require('../../../models/Attendance');
      const now = new Date();
      const overnightCutoff = new Date(now.getTime() - 18 * 60 * 60 * 1000);

      const record = await Attendance.findOne({
        user: userId,
        $or: [
          { date: { $gte: overnightCutoff } },
          { startDayTime: { $gte: overnightCutoff } }
        ],
        startDayTime: { $ne: null },
        $and: [
          { $or: [{ endDayTime: null }, { endDayTime: { $exists: false } }] },
          { $or: [{ endTime: null }, { endTime: { $exists: false } }] }
        ]
      }).select('startDayTime workLocationType breakTime').lean();

      if (record && record.startDayTime) {
        return {
          hasActiveWorkday: true,
          startDayTime: record.startDayTime,
          attendanceId: record._id,
          workLocation: record.workLocationType || 'Office',
          breakTimeMinutes: record.breakTime || 0
        };
      }

      // Fallback check against DailyAttendance
      const DailyAttendance = require('../../../models/DailyAttendance');
      const dailyRecord = await DailyAttendance.findOne({
        user: userId,
        $or: [
          { date: { $gte: overnightCutoff } },
          { startDayTime: { $gte: overnightCutoff } }
        ],
        startDayTime: { $ne: null },
        $and: [
          { $or: [{ endDayTime: null }, { endDayTime: { $exists: false } }] },
          { $or: [{ endTime: null }, { endTime: { $exists: false } }] }
        ]
      }).select('startDayTime workLocationType breakTime').lean();

      if (dailyRecord && dailyRecord.startDayTime) {
        return {
          hasActiveWorkday: true,
          startDayTime: dailyRecord.startDayTime,
          attendanceId: dailyRecord._id,
          workLocation: dailyRecord.workLocationType || 'Office',
          breakTimeMinutes: dailyRecord.breakTime || 0
        };
      }

      return { hasActiveWorkday: false, startDayTime: null };
    } catch (error) {
      console.warn('[V2 AttendanceAdapter] Read-only workday check failed:', error.message);
      return { hasActiveWorkday: false, startDayTime: null };
    }
  }
}

module.exports = AttendanceAdapter;
