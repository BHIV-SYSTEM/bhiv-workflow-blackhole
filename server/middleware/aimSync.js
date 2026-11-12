const Aim = require('../models/Aim');
const User = require('../models/User');

// Middleware to sync progress updates with aims
const syncProgressToAim = async (userId, progressData) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find today's aim
    let todayAim = await Aim.findOne({
      user: userId,
      date: {
        $gte: today,
        $lt: tomorrow
      }
    });

    // Only update if user has created an aim; do NOT auto-create dummy pending aims
    if (!todayAim) {
      return null;
    }

    if (todayAim) {
      // Update aim with progress information
      if (progressData.progressPercentage !== undefined) {
        todayAim.progressPercentage = progressData.progressPercentage;
      }
      if (progressData.notes) {
        todayAim.progressNotes = progressData.notes;
      }
      if (progressData.achievements) {
        todayAim.achievements = progressData.achievements;
      }
      if (progressData.blockers) {
        todayAim.blockers = progressData.blockers;
      }
      
      await todayAim.save();
      console.log(`📊 Synced progress to aim for user ${userId}: ${progressData.progressPercentage}%`);
      
      return todayAim;
    }
  } catch (error) {
    console.error('Error syncing progress to aim:', error);
  }
  return null;
};

// Middleware to sync attendance updates with aims
const syncAttendanceToAim = async (userId, attendanceData) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find today's aim
    let todayAim = await Aim.findOne({
      user: userId,
      date: {
        $gte: today,
        $lt: tomorrow
      }
    });

    // Only update if user has created an aim; do NOT auto-create dummy pending aims
    if (!todayAim) {
      return null;
    }

    if (todayAim) {
      // Update aim with work session information
      if (attendanceData.workLocation) {
        todayAim.workLocation = attendanceData.workLocation;
      }
      
      todayAim.workSessionInfo = {
        ...todayAim.workSessionInfo,
        startDayTime: attendanceData.startDayTime || todayAim.workSessionInfo?.startDayTime,
        endDayTime: attendanceData.endDayTime || todayAim.workSessionInfo?.endDayTime,
        totalHoursWorked: attendanceData.totalHoursWorked || todayAim.workSessionInfo?.totalHoursWorked,
        workLocationTag: attendanceData.workLocation === 'Home' ? 'WFH' : 'Office'
      };
      
      await todayAim.save();
      console.log(`🏢 Synced attendance to aim for user ${userId}: ${attendanceData.workLocation}`);
      
      return todayAim;
    }
  } catch (error) {
    console.error('Error syncing attendance to aim:', error);
  }
  return null;
};

module.exports = {
  syncProgressToAim,
  syncAttendanceToAim
};