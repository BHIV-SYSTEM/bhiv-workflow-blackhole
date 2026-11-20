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
   * Does NOT alter or create any attendance record.
   * 
   * @param {string} userId - User ObjectId string
   * @returns {Promise<{ hasActiveWorkday: boolean, startDayTime: Date|null }>}
   */
  static async checkActiveWorkday(userId) {
    if (!userId) return { hasActiveWorkday: false, startDayTime: null };

    try {
      // Lazy-load existing Attendance model to prevent circular dependency
      const Attendance = require('../../../models/Attendance');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const record = await Attendance.findOne({
        user: userId,
        date: { $gte: today },
        startDayTime: { $ne: null },
        $or: [{ endDayTime: null }, { endDayTime: { $exists: false } }]
      }).select('startDayTime').lean();

      if (record && record.startDayTime) {
        return { hasActiveWorkday: true, startDayTime: record.startDayTime };
      }
      return { hasActiveWorkday: false, startDayTime: null };
    } catch (error) {
      console.warn('[V2 AttendanceAdapter] Read-only workday check failed:', error.message);
      return { hasActiveWorkday: false, startDayTime: null };
    }
  }
}

module.exports = AttendanceAdapter;
