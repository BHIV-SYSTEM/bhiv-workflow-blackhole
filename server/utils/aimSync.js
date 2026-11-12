const Aim = require('../models/Aim');
const User = require('../models/User');

// Function to sync progress updates with aims
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

// Function to sync attendance updates with aims
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
      
      // Initialize workSessionInfo if it doesn't exist
      if (!todayAim.workSessionInfo) {
        todayAim.workSessionInfo = {};
      }
      
      // Update work session info
      if (attendanceData.startDayTime) {
        todayAim.workSessionInfo.startDayTime = attendanceData.startDayTime;
      }
      if (attendanceData.endDayTime) {
        todayAim.workSessionInfo.endDayTime = attendanceData.endDayTime;
      }
      if (attendanceData.totalHoursWorked) {
        todayAim.workSessionInfo.totalHoursWorked = attendanceData.totalHoursWorked;
      }
      if (attendanceData.workLocation) {
        todayAim.workSessionInfo.workLocationTag = attendanceData.workLocation === 'Home' ? 'WFH' : 'Office';
      }
      
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