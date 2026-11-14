const express = require("express")
const router = express.Router()
const mongoose = require("mongoose")
const Task = require("../models/Task")
const User = require("../models/User")
const Department = require("../models/Department")
const Aim = require("../models/Aim")
const Progress = require("../models/Progress")
const DailyAttendance = require("../models/DailyAttendance")
const TaskEvaluation = require("../models/TaskEvaluation")
const auth = require("../middleware/auth")
const { branchFilter } = require("../middleware/branchMiddleware")
const { formatEmployeeId } = require("../utils/employeeId")
const {
  COMPLETED_STATUSES,
  isTaskCompleted,
  aggregateTaskBuckets,
} = require("../utils/taskStats")

// Helper to get branch filter from request
const getBranchQuery = (req) => {
  const selectedBranch = req.headers['x-branch'] || req.query.branch;
  if (selectedBranch && selectedBranch !== 'all') {
    return { branch: selectedBranch };
  }
  return {};
};

// Get leaderboard stats (all users with task counts in one aggregation)
router.get("/leaderboard", async (req, res) => {
  try {
    const branchQuery = getBranchQuery(req);

    const [users, taskAgg] = await Promise.all([
      User.find(branchQuery)
        .select("name email role department avatar stillExist")
        .populate("department", "name")
        .lean(),
      Task.aggregate([
        { $match: branchQuery },
        { $group: {
          _id: {
            assignee: "$assignee",
            status: "$status",
            isFullProgress: { $gte: [{ $ifNull: ["$progress", 0] }, 100] },
          },
          count: { $sum: 1 },
          deps: { $sum: { $size: { $ifNull: ["$dependencies", []] } } },
        }},
      ]),
    ]);

    // Build map: userId -> { completed, total, deps }
    const statsMap = {};
    taskAgg.forEach(({ _id, count, deps }) => {
      const uid = _id.assignee?.toString();
      if (!uid) return;
      if (!statsMap[uid]) statsMap[uid] = { completedTasks: 0, totalTasks: 0, totalDependencies: 0 };
      statsMap[uid].totalTasks += count;
      if (isTaskCompleted({ status: _id.status, progress: _id.isFullProgress ? 100 : 0 })) {
        statsMap[uid].completedTasks += count;
        statsMap[uid].totalDependencies += deps;
      }
    });

    const leaderboard = users.map((u) => {
      const s = statsMap[u._id.toString()] || { completedTasks: 0, totalTasks: 0, totalDependencies: 0 };
      return {
        ...u,
        completedTasks: s.completedTasks,
        totalTasks: s.totalTasks,
        totalDependencies: s.totalDependencies,
        workload: s.totalTasks - s.completedTasks,
        completionRate: s.totalTasks > 0 ? (s.completedTasks / s.totalTasks) * 100 : 0,
      };
    });

    leaderboard.sort((a, b) => b.completedTasks - a.completedTasks);
    res.json(leaderboard);
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get dashboard stats
router.get("/stats", async (req, res) => {
  try {
    const branchQuery = getBranchQuery(req);
    
    // Optimized: single aggregation instead of 4 separate countDocuments
    const {
      total: totalTasks,
      completed: completedTasks,
      inProgress: inProgressTasks,
      pending: pendingTasks,
    } = await aggregateTaskBuckets(branchQuery, Task)
    const testerApprovalCount = await TaskEvaluation.countDocuments({
      ...branchQuery,
      finalVerdict: { $in: ["APPROVED", "APPROVED WITH MINOR FIXES"] },
    })

    // Get change percentages (mock data - in a real app, you'd compare with historical data)
    const totalTasksChange = 12 // +12% from last month
    const completedTasksChange = 8 // +8% from last month
    const inProgressTasksChange = 2 // +2 tasks since yesterday
    const pendingTasksChange = -2 // -2 tasks since yesterday

    res.json({
      totalTasks,
      completedTasks,
      inProgressTasks,
      pendingTasks,
      testerApprovalCount,
      totalTasksChange,
      completedTasksChange,
      inProgressTasksChange,
      pendingTasksChange,
    })
  } catch (error) {
    console.error("Error fetching dashboard stats:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get department stats
router.get("/departments", async (req, res) => {
  try {
    const branchQuery = getBranchQuery(req);
    const departments = await Department.find().sort({ name: 1 }).lean(); // Added .lean()
    const departmentIds = departments.map(d => d._id)

    // Optimized: single aggregation instead of N×2 countDocuments
    const deptAgg = await Task.aggregate([
      { $match: { department: { $in: departmentIds }, ...branchQuery } },
      { $group: { _id: { department: "$department", status: "$status" }, count: { $sum: 1 } } },
    ])
    const deptMap = {}
    departmentIds.forEach(id => { deptMap[id.toString()] = { total: 0, completed: 0 } })
    deptAgg.forEach(({ _id, count }) => {
      const key = _id.department.toString()
      if (deptMap[key]) {
        deptMap[key].total += count
        if (["Completed", "Closed", "Submitted for Review"].includes(_id.status)) deptMap[key].completed += count
      }
    })
    const departmentStats = departments.map(dept => ({
      id: dept._id,
      name: dept.name,
      color: dept.color || "bg-blue-500",
      total: deptMap[dept._id.toString()]?.total || 0,
      completed: deptMap[dept._id.toString()]?.completed || 0,
    }))

    res.json(departmentStats)
  } catch (error) {
    console.error("Error fetching department stats:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get tasks overview
router.get("/tasks-overview", async (req, res) => {
  try {
    const branchQuery = getBranchQuery(req);
    
    // Optimized: single aggregation instead of 6 separate countDocuments
    const [overviewAgg] = await Task.aggregate([
      { $match: branchQuery },
      { $facet: {
        byStatus:   [{ $group: { _id: "$status",   count: { $sum: 1 } } }],
        byPriority: [{ $group: { _id: "$priority", count: { $sum: 1 } } }],
      }},
    ])
    const statusMap   = Object.fromEntries((overviewAgg.byStatus   || []).map(s => [s._id, s.count]))
    const priorityMap = Object.fromEntries((overviewAgg.byPriority || []).map(p => [p._id, p.count]))

    const completedOverviewCount =
      (statusMap["Completed"] || 0) +
      (statusMap["Closed"] || 0) +
      (statusMap["Submitted for Review"] || 0)

    const statusData = [
      { name: "Completed",  value: completedOverviewCount, color: "#22c55e" },
      { name: "In Progress",value: statusMap["In Progress"]|| 0, color: "#3b82f6" },
      { name: "Pending",    value: statusMap["Pending"]    || 0, color: "#f59e0b" },
    ]

    const priorityData = [
      { name: "High",   value: priorityMap["High"]   || 0, color: "#ef4444" },
      { name: "Medium", value: priorityMap["Medium"] || 0, color: "#f59e0b" },
      { name: "Low",    value: priorityMap["Low"]    || 0, color: "#22c55e" },
    ]

    res.json({
      statusData,
      priorityData,
    })
  } catch (error) {
    console.error("Error fetching tasks overview:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get recent activity
router.get("/activity", async (req, res) => {
  try {
    // In a real app, you'd have an Activity model to track user actions
    // For this example, we'll return mock data
    const activities = [
      {
        id: 1,
        user: {
          name: "John Doe",
          avatar: "/placeholder.svg?height=40&width=40",
          initials: "JD",
        },
        action: "completed",
        task: "Q1 Marketing Campaign Planning",
        department: "Marketing",
        time: "2 hours ago",
      },
      {
        id: 2,
        user: {
          name: "Jane Smith",
          avatar: "/placeholder.svg?height=40&width=40",
          initials: "JS",
        },
        action: "updated",
        task: "Sales Presentation for Client XYZ",
        department: "Sales",
        time: "3 hours ago",
      },
      {
        id: 3,
        user: {
          name: "Mike Johnson",
          avatar: "/placeholder.svg?height=40&width=40",
          initials: "MJ",
        },
        action: "created",
        task: "Inventory Management System Update",
        department: "Operations",
        time: "5 hours ago",
      },
      {
        id: 4,
        user: {
          name: "Sarah Williams",
          avatar: "/placeholder.svg?height=40&width=40",
          initials: "SW",
        },
        action: "assigned",
        task: "Customer Feedback Analysis",
        department: "Marketing",
        time: "6 hours ago",
      },
      {
        id: 5,
        user: {
          name: "Alex Brown",
          avatar: "/placeholder.svg?height=40&width=40",
          initials: "AB",
        },
        action: "commented on",
        task: "Supply Chain Optimization",
        department: "Operations",
        time: "8 hours ago",
      },
    ]

    res.json(activities)
  } catch (error) {
    console.error("Error fetching recent activity:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get user stats
router.get("/user-stats/:userId", async (req, res) => {
    try {
      let userId = req.params.userId.trim(); // 👉 remove spaces/newlines
      console.log('user id in backend for userstats', userId);

      const today = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(today.getDate() + 7);
      const userObjId = new mongoose.Types.ObjectId(userId);

      // Optimized: aggregate + upcoming deadlines in parallel (4 queries → 2 parallel)
      const [taskBuckets, rawUpcomingDeadlines] = await Promise.all([
        aggregateTaskBuckets({ assignee: userObjId }, Task),
        Task.find({
          assignee: userId,
          dueDate: { $gte: today, $lte: nextWeek },
          status: { $nin: COMPLETED_STATUSES },
        }).sort({ dueDate: 1 }).limit(20).populate("department", "name color").lean(),
      ]);

      const {
        total: totalTasks,
        completed: completedTasks,
        inProgress: inProgressTasks,
        pending: pendingTasks,
      } = taskBuckets;
      const upcomingDeadlines = rawUpcomingDeadlines.filter((t) => !isTaskCompleted(t)).slice(0, 5);
      const completionRate  = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  
      res.json({
        totalTasks,
        completedTasks,
        inProgressTasks,
        pendingTasks,
        completionRate,
        upcomingDeadlines,
      });
    } catch (error) {
      console.error("Error fetching user stats:", error);
      res.status(500).json({ error: "Server error" });
    }
  });
  
// @route   GET api/dashboard/progress-stats
// @desc    Get progress statistics
// @access  Private
router.get("/progress-stats", auth, async (req, res) => {
  try {
    // Get tasks with due dates in the future (LIMIT to 100 for performance)
    const now = new Date();
    const upcomingTasks = await Task.find({
      dueDate: { $gt: now },
      status: { $nin: COMPLETED_STATUSES },
    })
    .populate("assignee", "name")
    .limit(100) // ✅ Added limit
    .lean(); // ✅ Added lean for performance
    
    // Calculate progress statistics
    const progressStats = upcomingTasks.map(task => {
      const totalDays = Math.ceil((new Date(task.dueDate) - new Date(task.createdAt)) / (1000 * 60 * 60 * 24));
      const daysElapsed = Math.ceil((now - new Date(task.createdAt)) / (1000 * 60 * 60 * 24));
      const daysRemaining = Math.ceil((new Date(task.dueDate) - now) / (1000 * 60 * 60 * 24));
      
      // Calculate expected progress based on time elapsed
      const expectedProgress = Math.min(100, Math.round((daysElapsed / totalDays) * 100));
      
      // Calculate progress difference (actual vs expected)
      const progressDifference = task.progress - expectedProgress;
      
      return {
        id: task._id,
        title: task.title,
        assignee: task.assignee?.name || "Unassigned",
        dueDate: task.dueDate,
        actualProgress: task.progress,
        expectedProgress,
        progressDifference,
        daysRemaining,
        totalDays,
        status: progressDifference >= 0 ? "On Track" : "Behind Schedule",
      };
    });
    
    res.json(progressStats);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   GET api/dashboard/admin-report
// @desc    Get comprehensive admin report with date filtering - FILTERED BY BRANCH
// @access  Admin or Manager
router.get("/admin-report", auth, async (req, res) => {
  try {
    // Check if user is Admin or Manager
    if (req.user.role !== "Admin" && req.user.role !== "Manager") {
      return res.status(403).json({ error: "Access denied. Admin or Manager only." });
    }

    const { date, filter } = req.query;
    const branchQuery = getBranchQuery(req);
    
    // Determine filter type (today, yesterday, weekly, lifetime)
    const filterType = filter || (date ? 'today' : 'lifetime');
    
    // Parse date or use today
    let targetDate = new Date();
    let dateRangeStart = null;
    let dateRangeEnd = null;
    
    if (filterType === 'today') {
      targetDate = new Date();
      targetDate.setHours(0, 0, 0, 0);
      dateRangeStart = targetDate;
      dateRangeEnd = new Date(targetDate);
      dateRangeEnd.setDate(dateRangeEnd.getDate() + 1);
    } else if (filterType === 'yesterday') {
      targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - 1);
      targetDate.setHours(0, 0, 0, 0);
      dateRangeStart = targetDate;
      dateRangeEnd = new Date(targetDate);
      dateRangeEnd.setDate(dateRangeEnd.getDate() + 1);
    } else if (filterType === 'weekly') {
      targetDate = new Date();
      targetDate.setHours(0, 0, 0, 0);
      dateRangeStart = new Date(targetDate);
      dateRangeStart.setDate(targetDate.getDate() - targetDate.getDay());
      dateRangeEnd = new Date(dateRangeStart);
      dateRangeEnd.setDate(dateRangeEnd.getDate() + 7);
    } else if (filterType === 'monthly') {
      targetDate = new Date();
      targetDate.setHours(0, 0, 0, 0);
      dateRangeStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      dateRangeStart.setHours(0, 0, 0, 0);
      dateRangeEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1);
      dateRangeEnd.setHours(0, 0, 0, 0);
      // Set targetDate to start of month for consistency with other queries
      targetDate = dateRangeStart;
    } else if (filterType === 'lifetime') {
      // No date filter for lifetime
      dateRangeStart = null;
      dateRangeEnd = null;
    } else if (date) {
      targetDate = new Date(date);
      targetDate.setHours(0, 0, 0, 0);
      dateRangeStart = targetDate;
      dateRangeEnd = new Date(targetDate);
      dateRangeEnd.setDate(dateRangeEnd.getDate() + 1);
    }
    
    const nextDay = dateRangeEnd || new Date();

    // 1. Main Admin Dashboard Stats - FILTERED BY BRANCH
    // Optimized: parallel aggregate + counts (6 queries → 3 parallel)
    const [adminTaskStatsAgg, totalUsers, totalDepartments] = await Promise.all([
      Task.aggregate([
        { $match: branchQuery },
        { $facet: {
          total:      [{ $count: "count" }],
          completed:  [{ $match: { status: { $in: ["Completed", "Closed", "Submitted for Review"] } } }, { $count: "count" }],
          inProgress: [{ $match: { status: "In Progress" } }, { $count: "count" }],
          pending:    [{ $match: { status: "Pending" } }, { $count: "count" }],
        }},
      ]),
      User.countDocuments({ stillExist: 1, ...branchQuery }),
      Department.countDocuments(),
    ]);
    const totalTasks      = adminTaskStatsAgg[0]?.total[0]?.count      || 0;
    const completedTasks  = adminTaskStatsAgg[0]?.completed[0]?.count  || 0;
    const inProgressTasks = adminTaskStatsAgg[0]?.inProgress[0]?.count || 0;
    const pendingTasks    = adminTaskStatsAgg[0]?.pending[0]?.count    || 0;

    // 2. Department-wise Task Count - FILTERED BY BRANCH
    // Optimized: single aggregation instead of N×4 countDocuments
    const departments = await Department.find().sort({ name: 1 }).lean();
    const adminDeptIds = departments.map(d => d._id);
    const adminDeptTaskAgg = await Task.aggregate([
      { $match: { department: { $in: adminDeptIds }, ...branchQuery } },
      { $group: { _id: { department: "$department", status: "$status" }, count: { $sum: 1 } } },
    ]);
    const adminDeptMap = {};
    adminDeptIds.forEach(id => {
      adminDeptMap[id.toString()] = { totalTasks: 0, completedTasks: 0, inProgressTasks: 0, pendingTasks: 0 };
    });
    adminDeptTaskAgg.forEach(({ _id, count }) => {
      const key = _id.department.toString();
      if (adminDeptMap[key]) {
        adminDeptMap[key].totalTasks += count;
        if (["Completed", "Closed", "Submitted for Review"].includes(_id.status))  adminDeptMap[key].completedTasks  += count;
        else if (_id.status === "In Progress") adminDeptMap[key].inProgressTasks += count;
        else if (_id.status === "Pending")     adminDeptMap[key].pendingTasks     += count;
      }
    });
    const departmentTaskCounts = departments.map(dept => ({
      id: dept._id,
      name: dept.name,
      color: dept.color || "bg-blue-500",
      ...adminDeptMap[dept._id.toString()],
    }));

    // 3. All Users with Aims and Time - FILTERED BY BRANCH
    // Optimized: bulk aim query instead of N×findOne calls
    const users = await User.find({ stillExist: 1, ...branchQuery })
      .populate("department", "name")
      .select("name email role department branch employeeId")
      .lean(); // ✅ Added lean

    const userIdsList = users.map(u => u._id);
    const allAims = await Aim.find({
      user: { $in: userIdsList },
      date: { $gte: targetDate, $lt: nextDay },
    }).lean();
    const aimsMap = new Map(allAims.map(aim => [aim.user.toString(), aim]));

    const usersWithAims = users.map(user => {
      const aim = aimsMap.get(user._id.toString()) || null;
      return {
        userId: user._id,
        employeeId: user.employeeId || formatEmployeeId(user.email),
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department?.name || "No Department",
        aim: aim ? {
          aims: aim.aims,
          completionStatus: aim.completionStatus,
          progressPercentage: aim.progressPercentage || 0,
          workSessionInfo: aim.workSessionInfo || null,
          createdAt: aim.createdAt,
        } : null,
      };
    });

    // 4. User Count
    const userCount = users.length;

    // 5. Zero Task Employees (with ability to assign tasks) - FILTERED BY BRANCH
    // Optimized: single aggregation instead of N×countDocuments
    const activeTaskByUserAgg = await Task.aggregate([
      { $match: { assignee: { $in: userIdsList }, status: { $ne: "Completed" }, ...branchQuery } },
      { $group: { _id: "$assignee", count: { $sum: 1 } } },
    ]);
    const userTaskCountMap = new Map(activeTaskByUserAgg.map(t => [t._id.toString(), t.count]));
    const usersWithTaskCounts = users.map(user => ({
      userId: user._id,
      employeeId: user.employeeId || formatEmployeeId(user.email),
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department?.name || "No Department",
      taskCount: userTaskCountMap.get(user._id.toString()) || 0,
    }));

    const zeroTaskEmployees = usersWithTaskCounts
      .filter((u) => u.taskCount === 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    // 6. Each User Progress Update (for the selected date) - FILTERED BY BRANCH
    const progressUpdates = await Progress.find({
      date: {
        $gte: targetDate,
        $lt: nextDay,
      },
      user: { $in: userIdsList }
    })
      .populate("user", "name email role branch employeeId")
      .populate("task", "title status")
      .sort({ createdAt: -1 })
      .lean(); // ✅ Added lean

    // Some progress records might have missing or deleted users/tasks.
    // Guard against null references so the report doesn't crash.
    const userProgressUpdates = progressUpdates
      .filter((progress) => progress.user) // keep only records with a valid user
      .map((progress) => ({
        id: progress._id,
        userId: progress.user?._id,
        employeeId: progress.user?.employeeId || formatEmployeeId(progress.user?.email),
        userName: progress.user?.name || "Unknown User",
        userEmail: progress.user?.email || "",
        taskId: progress.task?._id || null,
        taskTitle: progress.task?.title || "General Progress",
        progressPercentage: progress.progressPercentage,
        notes: progress.notes,
        blockers: progress.blockers,
        achievements: progress.achievements,
        date: progress.date,
        createdAt: progress.createdAt,
      }));

    // 7. Users who Started Day with Work Hours - FILTERED BY BRANCH
    const branchUserIds = userIdsList;
    
    let dailyAttendances;
    if (dateRangeStart && dateRangeEnd) {
      dailyAttendances = await DailyAttendance.find({
      date: {
          $gte: dateRangeStart,
          $lt: dateRangeEnd,
      },
      startDayTime: { $exists: true },
      user: { $in: branchUserIds }
    })
      .populate("user", "name email role department branch employeeId")
      .sort({ startDayTime: 1 })
      .lean(); // ✅ Added lean
    } else {
      // Lifetime: get all attendances - FILTERED BY BRANCH
      // ✅ CRITICAL FIX: Add limit to prevent loading thousands of records
      dailyAttendances = await DailyAttendance.find({
        startDayTime: { $exists: true },
        user: { $in: branchUserIds }
      })
        .populate("user", "name email role department branch employeeId")
        .sort({ startDayTime: -1 }) // Sort descending to get most recent first
        .limit(1000) // ✅ Limit to 1000 most recent records for lifetime view
        .lean(); // ✅ Added lean
    }

    let usersWithStartDay;
    
    // For weekly, monthly, and lifetime, aggregate hours by user and include all users
    if (filterType === 'weekly' || filterType === 'monthly' || filterType === 'lifetime') {
      // Get all active users first - FILTERED BY BRANCH (already filtered in users variable)
      const allUsers = users;
      
      const userHoursMap = new Map();
      
      // Initialize all users with 0 hours
      allUsers.forEach((user) => {
        const userId = user._id.toString();
        userHoursMap.set(userId, {
          userId: user._id,
          employeeId: user.employeeId || formatEmployeeId(user.email),
          userName: user.name,
          userEmail: user.email,
          userRole: user.role,
          department: user.department?.name || "No Department",
          totalHoursWorked: 0,
        });
      });
      
      // Add hours from attendances
      dailyAttendances.forEach((attendance) => {
        if (!attendance.user) return;

        const userId = attendance.user._id.toString();
        
        if (userHoursMap.has(userId)) {
          const userData = userHoursMap.get(userId);
          userData.totalHoursWorked += attendance.totalHoursWorked || 0;
        }
      });

      usersWithStartDay = Array.from(userHoursMap.values());
    } else {
      // Today or Yesterday: individual records
      usersWithStartDay = dailyAttendances
        .filter((attendance) => attendance.user) // skip records with missing user
        .map((attendance) => ({
          userId: attendance.user._id,
          employeeId: attendance.user.employeeId || formatEmployeeId(attendance.user.email),
          userName: attendance.user.name,
          userEmail: attendance.user.email,
          userRole: attendance.user.role,
          department: attendance.user.department?.name || "No Department",
          startDayTime: attendance.startDayTime,
          endDayTime: attendance.endDayTime || null,
          totalHoursWorked: attendance.totalHoursWorked || 0,
          regularHours: attendance.regularHours || 0,
          overtimeHours: attendance.overtimeHours || 0,
          status: attendance.status,
          workLocationType: attendance.workLocationType || "Office",
        }));
    }

    const usersWithStartDayCount = usersWithStartDay.length;

    res.json({
      date: targetDate.toISOString().split("T")[0],
      dashboardStats: {
        totalTasks,
        completedTasks,
        inProgressTasks,
        pendingTasks,
        totalUsers,
        totalDepartments,
      },
      departmentTaskCounts,
      usersWithAims,
      userCount,
      zeroTaskEmployees,
      userProgressUpdates,
      usersWithStartDay,
      usersWithStartDayCount,
    });
  } catch (error) {
    console.error("Error generating admin report:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router
