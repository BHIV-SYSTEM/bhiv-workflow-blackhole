const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Progress = require("../models/Progress");
const Task = require("../models/Task");
const User = require("../models/User");
const { check, validationResult } = require("express-validator");
const multer = require("multer");
const { uploadProgressImage } = require("../utils/cloudinary");
const { signalTaskCompleted } = require("../services/karmaClient");

// Synchronize task progress and lifecycle status across progress create/update endpoints
async function syncTaskWithProgress(taskDoc, progressPercentage) {
  const numericProgress = Number(progressPercentage) || 0;
  const previousStatus = taskDoc.status;
  taskDoc.progress = numericProgress;

  if (numericProgress >= 100) {
    if (!["Closed", "Submitted for Review"].includes(taskDoc.status)) {
      taskDoc.status = "Completed";
      taskDoc.closedAt = taskDoc.closedAt || new Date();
      console.log(`✅ Auto-updated task ${taskDoc._id} status: ${previousStatus} → Completed (100% progress)`);
    }
  } else if (["Pending", "Pending Validation", "Approved"].includes(taskDoc.status)) {
    taskDoc.status = "In Progress";
    console.log(`✅ Auto-updated task ${taskDoc._id} status: ${previousStatus} → In Progress (${numericProgress}% progress)`);
  }

  await taskDoc.save();

  if (taskDoc.status === "Completed" && previousStatus !== "Completed" && taskDoc.assignee) {
    signalTaskCompleted(taskDoc.assignee, taskDoc._id, taskDoc.title).catch(() => {});
  }

  return previousStatus !== taskDoc.status;
}

// Helper to get branch filter from request
const getBranchQuery = (req) => {
  const selectedBranch = req.headers['x-branch'] || req.query.branch;
  if (selectedBranch && selectedBranch !== 'all') {
    return { branch: selectedBranch };
  }
  return {};
};

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    files: 10 // Maximum 10 files
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// @route   GET api/progress/task/:taskId
// @desc    Get all progress updates for a task
// @access  Private
router.get("/task/:taskId", auth, async (req, res) => {
  try {
    const progress = await Progress.find({ task: req.params.taskId })
      .sort({ date: -1 })
      .populate({
        path: "user",
        select: "name email stillExist",
        match: { stillExist: 1 } // Only populate active users
      });

    // Filter out progress entries where user didn't populate (inactive users)
    const activeProgress = progress.filter(p => p.user);

    res.json(activeProgress);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   GET api/progress/user/:userId
// @desc    Get all progress updates by a user
// @access  Private
router.get("/user/:userId", auth, async (req, res) => {
  try {
    // Check if user is active
    const user = await User.findOne({ _id: req.params.userId, stillExist: 1 });
    if (!user) {
      return res.status(404).json({ error: "User not found or no longer active" });
    }

    const progress = await Progress.find({ user: req.params.userId })
      .sort({ date: -1 })
      .populate("task", "title description dueDate");

    res.json(progress);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   GET api/progress/all
// @desc    Get all progress updates for admin view - FILTERED BY BRANCH
// @access  Admin only
router.get("/all", auth, async (req, res) => {
  try {
    const { date, user } = req.query;
    const branchQuery = getBranchQuery(req);
    console.log('Progress all query params:', { date, user, branch: branchQuery.branch });
    
    // Build filter object
    const filter = {};
    
    // Get users filter for branch
    const userFilter = { stillExist: 1, ...branchQuery };
    
    if (user) {
      // Check if specific user is active and in branch
      const userDoc = await User.findOne({ _id: user, ...userFilter });
      if (!userDoc) {
        return res.json({
          success: true,
          count: 0,
          data: []
        });
      }
      filter.user = user;
    } else if (branchQuery.branch) {
      // Get users in the selected branch
      const usersInBranch = await User.find(userFilter).select('_id');
      if (usersInBranch.length > 0) {
        filter.user = { $in: usersInBranch.map(u => u._id) };
      } else {
        return res.json({
          success: true,
          count: 0,
          data: []
        });
      }
    }
    
    if (date) {
      const queryDate = new Date(date);
      const startOfDay = new Date(queryDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(queryDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      filter.date = {
        $gte: startOfDay,
        $lte: endOfDay
      };
    }
    
    console.log('Progress filter:', filter);
    
    const progress = await Progress.find(filter)
      .populate({
        path: "user",
        select: "name email department stillExist branch",
        match: branchQuery.branch ? { stillExist: 1, branch: branchQuery.branch } : { stillExist: 1 },
        populate: {
          path: "department",
          select: "name color"
        }
      })
      .populate("task", "title description")
      .sort({ date: -1 });

    // Filter out progress entries where user didn't populate (inactive users or not in branch)
    const activeProgress = progress.filter(p => p.user);
      
    console.log(`Found ${activeProgress.length} progress entries for active users`);
    
    res.json({
      success: true,
      count: activeProgress.length,
      data: activeProgress
    });
  } catch (error) {
    console.error("Error fetching progress entries:", error);
    res.status(500).json({ 
      success: false,
      error: "Server error",
      details: error.message 
    });
  }
});

// @route   POST api/progress
// @desc    Create a progress update with optional images
// @access  Private
router.post(
  "/",
  auth,
  upload.array('progressImages', 10), // Accept up to 10 images
  [
    check("task", "Task ID is required").not().isEmpty(),
    check("progressPercentage", "Progress percentage is required").isNumeric(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { user, task, progressPercentage, notes, blockers, achievements, date } = req.body;

      // Check if user is active
      const userDoc = await User.findById(user);
      if (!userDoc || userDoc.stillExist === 0) {
        return res.status(404).json({ error: "User not found or no longer active" });
      }

      // Check if task exists and belongs to user
      const taskDoc = await Task.findById(task);
      if (!taskDoc) {
        return res.status(404).json({ msg: "Task not found" });
      }

      // Upload images to Cloudinary if provided
      const uploadedImages = [];
      if (req.files && req.files.length > 0) {
        console.log(`📸 Uploading ${req.files.length} progress images for user ${user}`);
        
        for (const file of req.files) {
          try {
            const imageData = await uploadProgressImage(
              file.buffer, 
              user, 
              { taskId: task }
            );
            uploadedImages.push({
              url: imageData.url,
              publicId: imageData.publicId,
              uploadedAt: new Date()
            });
          } catch (uploadError) {
            console.error("Error uploading image:", uploadError);
            // Continue with other images even if one fails
          }
        }
        
        console.log(`✅ Successfully uploaded ${uploadedImages.length} images`);
      }

      // Create new progress
      const newProgress = new Progress({
        task,
        user,
        progressPercentage,
        notes,
        blockers,
        achievements,
        progressImages: uploadedImages,
        date: date || new Date(),
      });

      const progress = await newProgress.save();

      const taskStatusChanged = await syncTaskWithProgress(taskDoc, progressPercentage);

      // Update today's aim with progress information
      const Aim = require("../models/Aim");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      let todayAim = await Aim.findOne({
        user: user,
        date: {
          $gte: today,
          $lt: tomorrow
        }
      });

      if (todayAim) {
        // Update aim with progress information
        todayAim.progressPercentage = progressPercentage;
        todayAim.progressNotes = notes;
        todayAim.achievements = achievements;
        todayAim.blockers = blockers;
        if (progressPercentage >= 100) {
          todayAim.completionStatus = 'Completed';
          todayAim.completed = true;
        }
        await todayAim.save();

        console.log(`📊 Updated aim progress for user ${user}: ${progressPercentage}%`);
      } else {
        // Auto-create Today's Aim so Aim record is synchronized
        todayAim = new Aim({
          user: user,
          department: userDoc.department || taskDoc.department,
          aims: taskDoc.title || notes || "Daily Task Execution",
          completionStatus: progressPercentage >= 100 ? 'Completed' : 'Pending',
          completed: progressPercentage >= 100,
          progressPercentage: progressPercentage,
          progressNotes: notes || '',
          blockers: blockers || '',
          achievements: achievements || '',
          date: new Date()
        });
        await todayAim.save();
        console.log(`📊 Auto-created Today's Aim for user ${user} from progress update`);
      }

      // Notify via Socket.IO
      if (req.io) {
        req.io.to(`task-${task}`).emit("progress-update", {
          task,
          progress: progressPercentage,
          user
        });

        if (taskStatusChanged) {
          req.io.emit("task-updated", taskDoc);
          req.io.emit("task:updated", taskDoc);
        }

        // Emit aim update if aim was updated
        if (todayAim) {
          req.io.emit("aim-updated", {
            aim: todayAim,
            user: { id: user }
          });
        }
      }

      res.json(progress);
    } catch (err) {
      console.error(err.message);
      res.status(500).send("Server Error");
    }
  }
);

// @route   PUT api/progress/:id
// @desc    Update a progress entry
// @access  Private
router.put("/:id", auth, async (req, res) => {
  try {
    const { progressPercentage, notes, blockers, achievements } = req.body;

    // Find progress by ID
    let progress = await Progress.findById(req.params.id);
    if (!progress) {
      return res.status(404).json({ msg: "Progress entry not found" });
    }

    // Check if user owns the progress entry
    if (progress.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: "Not authorized" });
    }

    // Check if user is still active
    const user = await User.findOne({ _id: progress.user, stillExist: 1 });
    if (!user) {
      return res.status(404).json({ error: "User not found or no longer active" });
    }

    // Update fields
    if (progressPercentage) progress.progressPercentage = progressPercentage;
    if (notes) progress.notes = notes;
    if (blockers !== undefined) progress.blockers = blockers;
    if (achievements !== undefined) progress.achievements = achievements;
    progress.updatedAt = Date.now();

    await progress.save();

    // Update task progress and auto-change status if needed
    const task = await Task.findById(progress.task);
    if (task) {
      const taskStatusChanged = await syncTaskWithProgress(task, progressPercentage);

      // Notify via Socket.IO
      if (req.io) {
        req.io.to(`task-${task._id}`).emit("progress-update", {
          task: task._id,
          progress: progressPercentage,
          user: req.user.id,
        });
        
        // Emit task status update if changed
        if (taskStatusChanged || task.status === 'In Progress' || task.status === 'Completed') {
          req.io.emit("task-updated", task);
          req.io.emit("task:updated", task);
        }
      }
    }

    res.json(progress);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   DELETE api/progress/:id
// @desc    Delete a progress entry
// @access  Private
router.delete("/:id", auth, async (req, res) => {
  try {
    const progress = await Progress.findById(req.params.id);
    if (!progress) {
      return res.status(404).json({ msg: "Progress entry not found" });
    }

    // Check if user owns the progress entry or is admin
    if (progress.user.toString() !== req.user.id && req.user.role !== "Admin") {
      return res.status(401).json({ msg: "Not authorized" });
    }

    await progress.remove();
    res.json({ msg: "Progress entry removed" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

module.exports = router;