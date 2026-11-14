const express = require("express")
const router = express.Router()
const User = require("../models/User")
const Task = require("../models/Task")
const TaskSubmission = require("../models/TaskSubmission")
const auth = require("../middleware/auth")
const adminAuth = require("../middleware/adminAuth")
const auditLogService = require('../services/auditLogService');
const { computeUserTaskCounts } = require("../utils/taskStats");

// Helper to get branch filter from request
const getBranchQuery = (req) => {
  const selectedBranch = req.headers['x-branch'] || req.query.branch;
  if (selectedBranch && selectedBranch !== 'all') {
    return { branch: selectedBranch };
  }
  return {};
};

// Search users - SHOW ALL ACTIVE USERS (for selection in dropdowns)
router.get("/search", async (req, res) => {
  try {
    const { q } = req.query;
    const branchQuery = getBranchQuery(req);

    if (!q || q.trim().length === 0) {
      return res.json([]);
    }

    const searchQuery = {
      $and: [
        { stillExist: 1 }, // Only show active users
        branchQuery, // Filter by branch
        {
          $or: [
            { name: { $regex: q, $options: 'i' } },
            { email: { $regex: q, $options: 'i' } },
            { role: { $regex: q, $options: 'i' } }
          ]
        }
      ]
    };

    const users = await User.find(searchQuery)
      .select("-password")
      .populate("department", "name")
      .limit(10);

    // Calculate additional stats for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        try {
          const tasks = await Task.find({ assignee: user._id });
          const taskBuckets = computeUserTaskCounts(tasks);
          const completedTasks = taskBuckets.completed;
          const activeTasks = taskBuckets.inProgress + taskBuckets.pending;
          const completionRate = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

          return {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            avatar: user.avatar,
            joinDate: user.createdAt,
            completionRate,
            activeTasks,
            completedTasks,
            department: user.department,
            stillExist: user.stillExist,
            isActive: user.stillExist === 1
          };
        } catch (error) {
          console.error(`Error calculating stats for user ${user._id}:`, error);
          return {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            avatar: user.avatar,
            joinDate: user.createdAt,
            completionRate: 0,
            activeTasks: 0,
            completedTasks: 0,
            department: user.department,
            stillExist: user.stillExist,
            isActive: user.stillExist === 1
          };
        }
      })
    );

    res.json(usersWithStats);
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get all users - SHOW ALL ACTIVE USERS (for selection in dropdowns)
router.get("/", async (req, res) => {
  try {
    const { includeExited } = req.query;
    const branchQuery = getBranchQuery(req);

    // Build filter - show all active users filtered by branch
    const filter = { ...branchQuery };
    if (!includeExited || includeExited !== 'true') {
      filter.stillExist = 1;
    }

    const users = await User.find(filter).select("-password").populate("department", "name")

    // Add active indicator to each user
    const usersWithIndicators = users.map(user => ({
      ...user.toObject(),
      isActive: user.stillExist === 1
    }));

    res.json(usersWithIndicators)
  } catch (error) {
    console.error("Error fetching users:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get user by ID - SHOW ALL USERS
router.get("/:id", auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("department", "name");

    if (!user || user.stillExist === 0) {
      return res.status(404).json({ error: "User not found or no longer active" })
    }

    await auditLogService.log(req.user.id, 'VIEW_USER', 'USER', user._id);

    const userObj = user.toObject();
    userObj.isActive = user.stillExist === 1;

    res.json(userObj)
  } catch (error) {
    console.error("Error fetching user:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// @route   GET api/users/:id/daily-summary
// @desc    Get comprehensive daily work summary & performance telemetry for employee self-visibility
// @access  Private
router.get("/:id/daily-summary", auth, async (req, res) => {
  try {
    const userId = req.params.id;

    // Security: Only user or Admin/Manager can view
    if (req.user.id !== userId && !['Admin', 'Manager', 'Lead', 'Governor'].includes(req.user.role)) {
      return res.status(403).json({ error: "Not authorized to view another user's daily summary" });
    }

    const user = await User.findById(userId).populate("department", "name").lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const now = new Date();
    const localYear = now.getFullYear();
    const localMonth = String(now.getMonth() + 1).padStart(2, '0');
    const localDay = String(now.getDate()).padStart(2, '0');
    const localDateStr = `${localYear}-${localMonth}-${localDay}`;

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const Aim = require("../models/Aim");
    const Progress = require("../models/Progress");
    const Attendance = require("../models/Attendance");
    const DailyAttendance = require("../models/DailyAttendance");
    const EmployeeActivity = require("../models/EmployeeActivity");
    const WorkSession = require("../models/WorkSession");

    const [todayAim, todayProgresses, todayActivities, attendanceRecords, dailyAttendanceRecords, workSessionRecords, userTasks] = await Promise.all([
      Aim.findOne({
        user: userId,
        date: { $gte: today, $lt: tomorrow }
      }).lean(),

      Progress.find({
        user: userId,
        date: { $gte: today, $lt: tomorrow }
      }).populate('task', 'title status priority').sort({ date: -1 }).lean(),

      EmployeeActivity.find({
        employee: userId,
        timestamp: { $gte: today, $lt: tomorrow }
      }).select('timestamp keystroke_count mouse_activity_score mouse_event_count mouse_cadence keystroke_cadence idle_duration productivity_score active_application interval_seconds').lean(),

      Attendance.find({
        user: userId,
        $or: [
          { date: { $gte: today, $lt: tomorrow } },
          { startDayTime: { $gte: today, $lt: tomorrow } },
          { createdAt: { $gte: today, $lt: tomorrow } }
        ]
      }).sort({ createdAt: -1 }).lean(),

      DailyAttendance.find({
        user: userId,
        $or: [
          { date: { $gte: today, $lt: tomorrow } },
          { startDayTime: { $gte: today, $lt: tomorrow } }
        ]
      }).sort({ createdAt: -1 }).lean(),

      WorkSession.find({
        employee: userId,
        $or: [
          { date: { $gte: today, $lt: tomorrow } },
          { startTime: { $gte: today, $lt: tomorrow } }
        ]
      }).sort({ updatedAt: -1, startTime: -1 }).lean(),

      Task.find({ assignee: userId }).select('status priority dueDate title progress').lean()
    ]);

    // 1. Determine the authoritative latest WorkSession / Attendance window (matches WorkHoursManager exactly)
    let sessionSeconds = 0;
    let sessionStart = null;
    let sessionEnd = null;

    const latestWorkSession = (workSessionRecords || [])[0];
    const allAttendance = [...(attendanceRecords || []), ...(dailyAttendanceRecords || [])]
      .sort((a, b) => new Date(b.startDayTime || b.createdAt || 0) - new Date(a.startDayTime || a.createdAt || 0));
    const latestAttendance = allAttendance[0];

    if (latestWorkSession && latestWorkSession.startTime) {
      sessionStart = new Date(latestWorkSession.startTime);
      sessionEnd = (latestWorkSession.status === 'completed' && latestWorkSession.endTime)
        ? new Date(latestWorkSession.endTime)
        : new Date();
      const totalMinutes = Math.max(Math.floor((sessionEnd - sessionStart) / 60000), 0);
      let breakMinutes = latestWorkSession.totalBreakTime || 0;
      if (latestWorkSession.status === 'paused' && latestWorkSession.pausedAt) {
        breakMinutes += Math.max(Math.floor((Date.now() - new Date(latestWorkSession.pausedAt).getTime()) / 60000), 0);
      }
      const activeMinutes = Math.max(totalMinutes - breakMinutes, 0);
      sessionSeconds = activeMinutes * 60;
    } else if (latestAttendance && latestAttendance.startDayTime) {
      sessionStart = new Date(latestAttendance.startDayTime);
      sessionEnd = latestAttendance.endDayTime ? new Date(latestAttendance.endDayTime) : new Date();
      const totalMinutes = Math.max(Math.floor((sessionEnd - sessionStart) / 60000), 0);
      const breakMinutes = latestAttendance.breakTime || 0;
      const activeMinutes = Math.max(totalMinutes - breakMinutes, 0);
      sessionSeconds = activeMinutes * 60;
    } else if (latestAttendance && (latestAttendance.totalHoursWorked > 0 || latestAttendance.hoursWorked > 0)) {
      sessionSeconds = Math.round((latestAttendance.totalHoursWorked || latestAttendance.hoursWorked) * 3600);
    }

    // 2. Scope telemetry activities to the active/latest work session window if available
    //    (prevents earlier test pings / previous sessions today from inflating current session metrics)
    let scopedActivities = todayActivities;
    if (sessionStart && sessionEnd) {
      const startMs = sessionStart.getTime() - 60000;
      const endMs = sessionEnd.getTime() + 60000;
      scopedActivities = todayActivities.filter(act => {
        const ts = new Date(act.timestamp).getTime();
        return ts >= startMs && ts <= endMs;
      });
    }

    // Calculate telemetry metrics from scoped activities
    let totalKeystrokes = 0;
    let totalMouseScore = 0;
    let activeMouseCount = 0;
    let totalMouseEvents = 0;
    let totalIdleSeconds = 0;
    let productivitySum = 0;
    let productivityCount = 0;
    let telemetryActiveSeconds = 0;

    scopedActivities.forEach(act => {
      totalKeystrokes += (act.keystroke_count || 0);
      totalMouseScore += (act.mouse_activity_score || 0);
      if ((act.mouse_activity_score || 0) > 0) {
        activeMouseCount++;
      }
      totalMouseEvents += (act.mouse_event_count || 0);

      if (act.productivity_score > 0) {
        productivitySum += act.productivity_score;
        productivityCount++;
      }
      const isActive = (act.keystroke_count || 0) > 0 || (act.mouse_activity_score || 0) >= 15 || (act.mouse_event_count || 0) > 0;
      let idle = 0;
      if (!isActive) {
        let raw = act.idle_duration || 0;
        if (raw > 10000) raw = Math.round(raw / 1000);
        idle = Math.min(30, Math.max(0, raw));
      }
      totalIdleSeconds += idle;
      telemetryActiveSeconds += Math.max(0, 30 - idle);
    });

    // If mouse events weren't logged separately but mouse score was, estimate realistic count
    if (totalMouseEvents === 0 && (totalMouseScore > 0 || scopedActivities.length > 0)) {
      totalMouseEvents = Math.round(totalMouseScore * 2.5);
    }

    // Authoritative active working hours: strictly match WorkHoursManager session duration when a session exists;
    // fallback to telemetryActiveSeconds only if no work session/attendance was started.
    const effectiveActiveSeconds = (sessionStart || sessionSeconds > 0) ? sessionSeconds : telemetryActiveSeconds;
    const totalHours = Math.round((effectiveActiveSeconds / 3600) * 10) / 10;
    const h = Math.floor(effectiveActiveSeconds / 3600);
    const m = Math.floor((effectiveActiveSeconds % 3600) / 60);
    const activeHoursFormatted = `${h}h ${m}m`;

    const sessionH = Math.floor(sessionSeconds / 3600);
    const sessionM = Math.floor((sessionSeconds % 3600) / 60);
    const sessionHoursFormatted = `${sessionH}h ${sessionM}m`;

    const avgProductivity = productivityCount > 0 ? Math.round(productivitySum / productivityCount) : (scopedActivities.length > 0 || effectiveActiveSeconds > 0 ? 65 : 0);
    const avgMouse = activeMouseCount > 0 ? Math.round(totalMouseScore / activeMouseCount) : (totalMouseEvents > 0 ? 50 : 0);

    // Calculate Efficiency
    let efficiencyScore = 0;
    if (effectiveActiveSeconds > 0) {
      const activeRatio = Math.min(1.0, Math.max(0.1, (effectiveActiveSeconds - Math.min(effectiveActiveSeconds * 0.7, totalIdleSeconds)) / effectiveActiveSeconds));
      const prodFactor = (avgProductivity > 0 ? avgProductivity : 60) / 100;
      efficiencyScore = Math.min(100, Math.max(10, Math.round((activeRatio * 0.5 + prodFactor * 0.5) * 100)));
    } else {
      efficiencyScore = 0;
    }

    let efficiencyLabel = 'No Activity';
    if (efficiencyScore >= 75) {
      efficiencyLabel = 'High Efficiency';
    } else if (efficiencyScore >= 45) {
      efficiencyLabel = 'Moderate Efficiency';
    } else if (effectiveActiveSeconds > 0) {
      efficiencyLabel = 'Low Efficiency';
    }

    // Task counts
    const taskCounts = computeUserTaskCounts(userTasks);

    // Determine current Aim, Blocker, Achievement
    const latestProgress = todayProgresses[0] || {};
    let aimText = "No aim set for today";
    let blockerText = "No blockers reported";
    let achievementText = "In progress";
    let progressPct = 0;
    let completionStatus = "Not Set";

    if (todayAim?.aims && todayAim.aims.trim() !== '') {
      aimText = todayAim.aims;
      completionStatus = todayAim.completionStatus || 'Pending';
      progressPct = todayAim.progressPercentage || 0;
      if (todayAim.blockers) blockerText = todayAim.blockers;
      if (todayAim.achievements) achievementText = todayAim.achievements;
    }

    if (latestProgress?.blockers && latestProgress.blockers.trim() !== '') {
      blockerText = latestProgress.blockers;
    }
    if (latestProgress?.achievements && latestProgress.achievements.trim() !== '') {
      achievementText = latestProgress.achievements;
    }
    if (latestProgress?.progressPercentage !== undefined && latestProgress?.progressPercentage !== null) {
      progressPct = latestProgress.progressPercentage;
    }
    if ((!todayAim || !todayAim.aims) && latestProgress?.notes && latestProgress.notes.trim() !== '') {
      aimText = latestProgress.notes;
      completionStatus = 'Logged in Progress';
    }

    res.json({
      date: localDateStr,
      employee: {
        id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        department: user.department?.name || 'General'
      },
      workSummary: {
        aim: aimText,
        blockers: blockerText,
        achievements: achievementText,
        progressPercentage: progressPct,
        completionStatus,
        hasAimToday: !!todayAim,
        hasProgressToday: todayProgresses.length > 0 && !!(latestProgress?.notes || latestProgress?.achievements),
        updatesCount: todayProgresses.length
      },
      metrics: {
        activeSeconds: effectiveActiveSeconds,
        activeHours: totalHours,
        activeHoursFormatted,
        sessionHoursFormatted,
        productivityScore: avgProductivity,
        efficiencyScore,
        efficiencyLabel,
        keystrokes: totalKeystrokes,
        mouseScore: avgMouse,
        mouseEvents: totalMouseEvents,
        idleDurationMinutes: Math.round(totalIdleSeconds / 60),
        activitiesCount: scopedActivities.length
      },
      taskCounts,
      todayProgresses: todayProgresses.map(p => ({
        id: p._id,
        taskTitle: p.task?.title || 'Direct/WhatsApp Task',
        progressPercentage: p.progressPercentage,
        notes: p.notes,
        blockers: p.blockers,
        achievements: p.achievements,
        time: p.date
      }))
    });
  } catch (error) {
    console.error("Error in get daily summary:", error);
    res.status(500).json({ error: error.message || "Failed to fetch daily summary" });
  }
})

// Update user
router.put("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    // Remove password from updates (use separate endpoint for password changes)
    if (updates.password) {
      delete updates.password
    }

    const user = await User.findByIdAndUpdate(id, { $set: updates }, { new: true }).select("-password")

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    await auditLogService.log(req.user.id, 'UPDATE_USER', 'USER', user._id);

    res.json(user)
  } catch (error) {
    console.error("Error updating user:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Update user status (admin only) - for setting stillExist
router.put("/:id/status", auth, adminAuth, async (req, res) => {
  try {
    const { id } = req.params
    const { stillExist } = req.body

    if (stillExist !== 0 && stillExist !== 1) {
      return res.status(400).json({ error: "stillExist must be 0 or 1" })
    }

    const user = await User.findByIdAndUpdate(
      id,
      { $set: { stillExist } },
      { new: true }
    ).select("-password").populate("department", "name")

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    res.json({
      success: true,
      message: stillExist === 1 ? "User reactivated successfully" : "User marked as exited successfully",
      user
    })
  } catch (error) {
    console.error("Error updating user status:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Update user work mode (admin only) - WFH or WFO
// WFH employees have max 8 hours/day cap
// WFO employees have no hour cap (can work 12, 14, 16+ hours)
router.put("/:id/work-mode", auth, adminAuth, async (req, res) => {
  try {
    const { id } = req.params
    const { workMode } = req.body

    // Validate workMode
    if (!['WFH', 'WFO'].includes(workMode)) {
      return res.status(400).json({
        error: "workMode must be 'WFH' (Work From Home) or 'WFO' (Work From Office)"
      })
    }

    const user = await User.findByIdAndUpdate(
      id,
      { $set: { workMode } },
      { new: true }
    ).select("-password").populate("department", "name")

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    await auditLogService.log(req.user.id, 'UPDATE_USER_WORK_MODE', 'USER', user._id, {
      newWorkMode: workMode,
      note: workMode === 'WFH' ? 'Max 8 hours/day cap applied' : 'No hour cap (unlimited hours)'
    });

    res.json({
      success: true,
      message: workMode === 'WFH'
        ? "User set to Work From Home (8h/day max cap)"
        : "User set to Work From Office (no hour cap)",
      user,
      rules: {
        workMode,
        maxHoursPerDay: workMode === 'WFH' ? 8 : 'Unlimited',
        overtimeAllowed: workMode === 'WFO',
        description: workMode === 'WFH'
          ? 'WFH employees are capped at 8 hours per calendar day. Sessions spanning midnight are auto-ended.'
          : 'WFO employees can work unlimited hours (12, 14, 16+ hours). No automatic capping.'
      }
    })
  } catch (error) {
    console.error("Error updating user work mode:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Bulk update work mode for multiple users (admin only)
router.put("/bulk/work-mode", auth, adminAuth, async (req, res) => {
  try {
    const { userIds, workMode } = req.body

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: "userIds must be a non-empty array" })
    }

    if (!['WFH', 'WFO'].includes(workMode)) {
      return res.status(400).json({
        error: "workMode must be 'WFH' (Work From Home) or 'WFO' (Work From Office)"
      })
    }

    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { $set: { workMode } }
    )

    await auditLogService.log(req.user.id, 'BULK_UPDATE_WORK_MODE', 'USER', null, {
      userCount: userIds.length,
      newWorkMode: workMode
    });

    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} users to ${workMode}`,
      modifiedCount: result.modifiedCount,
      rules: {
        workMode,
        maxHoursPerDay: workMode === 'WFH' ? 8 : 'Unlimited',
        overtimeAllowed: workMode === 'WFO'
      }
    })
  } catch (error) {
    console.error("Error bulk updating work mode:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get all users including exited ones (admin only) - SHOW ALL USERS
router.get("/admin/all", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find({}).select("-password").populate("department", "name")

    // Add active indicator to each user
    const usersWithIndicators = users.map(user => ({
      ...user.toObject(),
      isActive: user.stillExist === 1
    }));

    res.json(usersWithIndicators)
  } catch (error) {
    console.error("Error fetching all users:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Delete user (admin only)
router.delete("/:id", auth, adminAuth, async (req, res) => {
  try {
    // Check if there are tasks assigned to this user
    const tasksCount = await Task.countDocuments({ assignee: req.params.id })

    if (tasksCount > 0) {
      return res.status(400).json({
        error: "Cannot delete user with assigned tasks. Consider marking as exited instead.",
      })
    }

    const user = await User.findByIdAndDelete(req.params.id)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    res.json({ message: "User deleted successfully" })
  } catch (error) {
    console.error("Error deleting user:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get tasks assigned to user - SHOW ALL USERS
router.get("/:id/tasks", async (req, res) => {
  try {
    const { status } = req.query

    // Verify user exists
    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Build filter object
    const filter = { assignee: req.params.id }
    if (status) filter.status = status

    // ✅ FIX: Add limit and lean for performance
    const tasks = await Task.find(filter)
      .populate("department", "name color")
      .populate("dependencies", "title status")
      .sort({ createdAt: -1 }) // Most recent first
      .limit(100) // Limit to 100 most recent tasks
      .lean() // Use lean for better performance

    res.json(tasks)
  } catch (error) {
    console.error("Error fetching user tasks:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Change password - SHOW ALL USERS
router.put("/:id/password", async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: "Current password and new password are required",
      })
    }

    const user = await User.findOne({ _id: req.params.id, stillExist: 1 })

    if (!user) {
      return res.status(404).json({ error: "User not found or no longer active" })
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword)

    if (!isMatch) {
      return res.status(400).json({ error: "Current password is incorrect" })
    }

    // Update password
    user.password = newPassword
    await user.save()

    res.json({ message: "Password updated successfully" })
  } catch (error) {
    console.error("Error changing password:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get submissions by a user - SHOW ALL USERS
router.get("/:id/submissions", auth, async (req, res) => {
  try {
    // Check if user exists (allow both active and inactive for submissions history)
    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Check if user is requesting their own submissions or if requester is admin
    if (req.user.id !== req.params.id && req.user.role !== "Admin") {
      return res.status(403).json({ error: "Not authorized to access these submissions" })
    }

    // Try to find submissions, but handle the case where TaskSubmission model might not exist
    let submissions = []
    try {
      // ✅ FIX: Add limit and lean for performance
      submissions = await TaskSubmission.find({ user: req.params.id })
        .populate("task", "title status")
        .sort({ createdAt: -1 })
        .limit(50) // Limit to 50 most recent submissions
        .lean() // Use lean for better performance

      // Filter out orphaned submissions whose task was deleted by admin
      submissions = submissions.filter(s => s.task !== null && s.task !== undefined);
    } catch (submissionError) {
      console.log("TaskSubmission model not found or error:", submissionError.message)
      // Return empty array if TaskSubmission model doesn't exist
      submissions = []
    }

    res.json(submissions)
  } catch (error) {
    console.error("Error fetching user submissions:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get user notifications - SHOW ALL USERS
router.get("/:id/notifications", auth, async (req, res) => {
  try {
    // Verify user exists
    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Check if user is requesting their own notifications or if requester is admin
    if (req.user.id !== req.params.id && req.user.role !== "Admin") {
      return res.status(403).json({ error: "Not authorized to access these notifications" })
    }

    // In a real app, you would fetch notifications from a database
    // For now, we'll return mock data
    const notifications = [
      {
        id: "1",
        type: "submission_approved",
        title: "Submission Approved",
        message: "Your task submission for 'Create Login Page' has been approved!",
        createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 minutes ago
        read: false,
        taskId: "task123",
      },
      {
        id: "2",
        type: "submission_rejected",
        title: "Submission Needs Revision",
        message: "Your task submission for 'API Integration' requires some changes.",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
        read: false,
        taskId: "task456",
      },
      {
        id: "3",
        type: "task_assigned",
        title: "New Task Assigned",
        message: "You have been assigned a new task: 'Database Schema Design'",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
        read: true,
        taskId: "task789",
      },
    ]

    res.json(notifications)
  } catch (error) {
    console.error("Error fetching notifications:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Mark all notifications as read - SHOW ALL USERS
router.put("/:id/notifications/read-all", auth, async (req, res) => {
  try {
    // Verify user exists
    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Check if user is requesting their own notifications or if requester is admin
    if (req.user.id !== req.params.id && req.user.role !== "Admin") {
      return res.status(403).json({ error: "Not authorized to access these notifications" })
    }

    // In a real app, you would update notifications in the database
    // For now, we'll just return a success message
    res.json({ message: "All notifications marked as read" })
  } catch (error) {
    console.error("Error marking notifications as read:", error)
    res.status(500).json({ error: "Server error" })
  }
})


module.exports = router
