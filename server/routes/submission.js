const express = require("express")
const router = express.Router()
const mongoose = require("mongoose")
const TaskSubmission = require("../models/TaskSubmission")
const Task = require("../models/Task")
const multer = require("multer")
const { uploadToCloudinary } = require("../utils/cloudinary")
const Notification = require("../models/Notification")
const User = require("../models/User")
const auth = require("../middleware/auth")
const crypto = require("crypto")
const { emitTaskSubmittedEvent, emitTaskCompletedEvent, emitTaskFailedEvent } = require("../services/taskExecutionBridge")
const { invokeParikshak, evaluateParikshakSubmission } = require("../services/parikshakService")
const { validateContextInternal, handleValidateContext } = require("./knowledgeAdmin")

// Validate context endpoints (Feature 15: Cases A, B, C, D)
router.get("/validate-context", auth, handleValidateContext);
router.post("/validate-context", auth, async (req, res) => {
  try {
    const taskId = req.body?.taskId || req.body?.task;
    let productId = req.body?.productId || req.body?.product_id;
    if (taskId) {
      let taskDoc = null;
      if (mongoose.Types.ObjectId.isValid(taskId)) {
        taskDoc = await Task.findById(taskId);
      }
      if (!taskDoc) {
        taskDoc = await Task.findOne({ task_id: taskId });
      }
      if (taskDoc && taskDoc.product && taskDoc.product.toString().trim()) {
        const taskProductStr = taskDoc.product.toString().trim();
        const isNonProd = ['NONE', 'INTERNAL_ADMIN', 'ADMIN'].includes(taskProductStr.toUpperCase());
        const supplied = (productId || '').toString().trim();
        if (!isNonProd && supplied && supplied.toUpperCase() !== taskProductStr.toUpperCase()) {
          return res.status(400).json({
            error: `Product mismatch: Task belongs to '${taskDoc.product}', cannot validate under '${supplied}'`
          });
        }
        productId = taskDoc.product;
      }
    }
    if (productId && !req.body.productId) {
      req.body.productId = productId;
    }
    return handleValidateContext(req, res);
  } catch (err) {
    return handleValidateContext(req, res);
  }
});

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (!file) {
      return cb(null, true) // Allow empty file field
    }

    const validTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/png",
      "image/jpeg",
    ]
    const validExtensions = /\.(pdf|doc|docx|png|jpg|jpeg)$/i
    const mimetypeValid = validTypes.includes(file.mimetype)
    const extnameValid = validExtensions.test(file.originalname)

    if (!mimetypeValid || !extnameValid) {
      console.error(`Invalid file: mimetype=${file.mimetype}, originalname=${file.originalname}`)
      return cb(new Error("Only PDF, DOC, DOCX, PNG, and JPEG files are allowed"))
    }

    cb(null, true)
  },
})

const MAX_UNPAGINATED_LIMIT = 100

// Transition task to "Submitted for Review" when work is submitted or resubmitted (Feature 9)
async function markTaskSubmittedForReview(taskDoc, io) {
  if (!taskDoc) return
  taskDoc.status = "Submitted for Review"
  taskDoc.progress = Math.max(Number(taskDoc.progress) || 0, 90)
  taskDoc.submittedForReviewAt = new Date()
  await taskDoc.save()

  if (io) {
    io.emit("task:updated", taskDoc)
    io.emit("task-updated", taskDoc)
  }
}

// Mark a task as Completed once confirmed review approval is granted (Feature 9)
async function markTaskApprovedCompleted(taskDoc, io) {
  if (!taskDoc) return
  taskDoc.status = "Completed"
  taskDoc.progress = 100
  taskDoc.closedAt = taskDoc.closedAt || new Date()
  await taskDoc.save()

  if (io) {
    io.emit("task:updated", taskDoc)
    io.emit("task-updated", taskDoc)
  }
}

// Backwards-compatible alias
const markTaskSubmittedCompleted = markTaskApprovedCompleted;

// Reopen a rejected task back into In Progress so it leaves Completed stats/tabs cleanly.
async function reopenRejectedTask(taskDoc, io) {
  if (!taskDoc) return
  taskDoc.status = "In Progress"
  if ((Number(taskDoc.progress) || 0) >= 100) {
    taskDoc.progress = 50
  }
  taskDoc.closedAt = null
  await taskDoc.save()

  if (io) {
    io.emit("task:updated", taskDoc)
    io.emit("task-updated", taskDoc)
  }
}

// Get all submissions - paginated, only active users
router.get("/", auth, async (req, res) => {
  try {
    const { page, limit } = req.query
    const limitNum = parseInt(limit) || 0

    if (limitNum === 0) {
      return res.status(400).json({
        error: "Pagination required. Provide ?limit=N&page=P",
        hint: "Use ?page=1&limit=20"
      })
    }
    if (limitNum > MAX_UNPAGINATED_LIMIT) {
      return res.status(400).json({
        error: `limit exceeds maximum allowed value of ${MAX_UNPAGINATED_LIMIT}`,
        hint: `Use limit <= ${MAX_UNPAGINATED_LIMIT}`
      })
    }

    const pageNum = parseInt(page) || 1
    const activeUserIds = await User.distinct("_id", { stillExist: 1 })
    const [submissions, total] = await Promise.all([
      TaskSubmission.find()
        .populate("task", "title status")
        .populate({ path: "user", select: "name email stillExist", match: { stillExist: 1 } })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      TaskSubmission.countDocuments({ user: { $in: activeUserIds } })
    ])
    res.json({ submissions: submissions.filter(s => s.user), total, page: pageNum, pages: Math.ceil(total / limitNum) })
  } catch (error) {
    console.error("Error fetching submissions:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get live Parikshak AI service status
router.get("/parikshak-status", async (req, res) => {
  try {
    const axios = require('axios');
    const parikshakUrl = process.env.PARIKSHAK_URL || 'http://localhost:8000/parikshak/review';
    const baseUrl = parikshakUrl.replace(/\/parikshak\/review\/?$/, '').replace(/\/$/, '') || 'http://localhost:8000';
    const healthUrl = `${baseUrl}/health`;

    let isOnline = false;
    try {
      const pingRes = await axios.get(healthUrl, { timeout: 4000, validateStatus: (status) => status < 500 });
      const contentType = String(pingRes.headers['content-type'] || '');
      isOnline = pingRes.status < 500 && (contentType.includes('application/json') || pingRes.data?.status === 'healthy');
    } catch (err) {
      try {
        const pingRes2 = await axios.get(baseUrl, { timeout: 3000, validateStatus: (status) => status < 500 });
        const contentType2 = String(pingRes2.headers['content-type'] || '');
        isOnline = pingRes2.status < 500 && (contentType2.includes('application/json') || pingRes2.data?.status === 'healthy');
      } catch (e2) {
        isOnline = false;
      }
    }

    res.json({
      service: "Parikshak AI Review Engine",
      status: isOnline ? "ONLINE" : "OFFLINE",
      url: healthUrl,
      checkedAt: new Date().toISOString()
    });
  } catch (err) {
    res.json({ service: "Parikshak AI Review Engine", status: "OFFLINE", error: err.message });
  }
});

// Get submission by ID
router.get("/:id", auth, async (req, res) => {
  try {
    const submission = await TaskSubmission.findById(req.params.id)
      .populate("task", "title status department assignee")
      .populate({
        path: "user",
        select: "name email stillExist",
        match: { stillExist: 1 } // Only populate active users
      })
      .populate("reviewHistory.reviewedBy", "name email")

    if (!submission || !submission.user) {
      return res.status(404).json({ error: "Submission not found or user no longer active" })
    }

    res.json(submission)
  } catch (error) {
    console.error("Error fetching submission:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get submission by task ID
router.get("/task/:taskId", auth, async (req, res) => {
  try {
    const submission = await TaskSubmission.findOne({ task: req.params.taskId })
      .populate("task", "title status")
      .populate({
        path: "user",
        select: "name email stillExist",
        match: { stillExist: 1 } // Only populate active users
      })
      .populate("reviewHistory.reviewedBy", "name email")

    if (!submission || !submission.user) {
      return res.status(404).json({ error: "Submission not found or user no longer active" })
    }

    res.json(submission)
  } catch (error) {
    console.error("Error fetching submission by task:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Create new submission - ONLY ALLOW ACTIVE USERS
router.post("/", auth, upload.single("document"), async (req, res) => {
  try {
    const resolvedTaskId = req.body.task || req.body.taskId;
    const { githubLink, notes, originalSubmission, userId: bodyUserId } = req.body;

    if (!resolvedTaskId) {
      return res.status(400).json({ error: "Task ID is required" });
    }

    // Enforce authenticated user identity (Feature 5 Security Hardening)
    const authUserId = req.user ? (req.user.id || req.user._id) : null;
    if (!authUserId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const isAdmin = Boolean(req.user && req.user.role === "Admin");

    // Do not blindly trust req.body.userId
    if (!isAdmin && bodyUserId && bodyUserId.toString() !== authUserId.toString()) {
      return res.status(403).json({ error: "Forbidden: Cannot submit work on behalf of another user" });
    }

    const effectiveUserId = isAdmin && bodyUserId ? bodyUserId : authUserId;

    // Resolve task by ObjectId or task_id string
    let task = null;
    if (mongoose.Types.ObjectId.isValid(resolvedTaskId)) {
      task = await Task.findById(resolvedTaskId);
    }
    if (!task) {
      task = await Task.findOne({ task_id: resolvedTaskId });
    }
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    const taskId = task._id;

    // Get or generate trace_id (make it optional for backward compatibility)
    let traceId = req.headers["x-trace-id"];
    if (!traceId) {
      traceId = `trace_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      console.log(`[TRACE_WARNING] Auto-generated trace_id for task submission ${taskId}: ${traceId}`);
    } else {
      console.log(`[TRACE_RECEIVED] Submission received - trace_id=${traceId}, task_id=${taskId}`);
    }

    // Check if user is active
    const user = await User.findOne({ _id: effectiveUserId, stillExist: 1 });
    if (!user) {
      return res.status(404).json({ error: "User not found or no longer active" });
    }

    // Verify that req.user matches task.assignee or user is Admin
    const isAssignee = task.assignee && task.assignee.toString() === authUserId.toString();
    if (!isAdmin && !isAssignee) {
      return res.status(403).json({ error: "Forbidden: You are not assigned to this task" });
    }

    // =========================================================================
    // FEATURE 15: PRE-SUBMISSION CONTEXT VALIDATION GUARD (Cases A, B, C, D)
    // =========================================================================
    const suppliedProductId = (req.body.productId || req.body.product_id || req.body.product || '').toString().trim();
    let rawProductId = '';

    if (task.product && task.product.toString().trim()) {
      const taskProductStr = task.product.toString().trim();
      const isNonProductTaskProduct = ['NONE', 'INTERNAL_ADMIN', 'ADMIN'].includes(taskProductStr.toUpperCase());

      if (!isNonProductTaskProduct) {
        if (suppliedProductId && suppliedProductId.toUpperCase() !== taskProductStr.toUpperCase()) {
          const clientProductDisplay = req.body.productId || req.body.product_id || req.body.product;
          return res.status(400).json({
            error: `Product mismatch: Task belongs to '${task.product}', cannot submit under '${clientProductDisplay}'`
          });
        }
        rawProductId = taskProductStr.toUpperCase();
      } else {
        rawProductId = taskProductStr.toUpperCase();
      }
    } else {
      rawProductId = suppliedProductId ? suppliedProductId.toUpperCase() : '';
    }

    const isNonProductTask = !rawProductId || ['NONE', 'INTERNAL_ADMIN', 'ADMIN'].includes(rawProductId.toUpperCase());

    if (!isNonProductTask) {
      const submitterEmpId = (
        req.user?.canonicalEmployeeId ||
        req.user?.employeeId ||
        user.canonicalEmployeeId ||
        user.employeeId ||
        ''
      ).toString().trim().toUpperCase();

      const submitterTenant = (
        req.user?.tenantId ||
        task.tenantId ||
        user.tenantId ||
        'ten-bhiv-core'
      ).toString().trim();

      const validationCheck = await validateContextInternal({
        productId: rawProductId,
        employeeId: submitterEmpId,
        tenantId: submitterTenant,
        user: req.user,
        userId: effectiveUserId
      });

      if (validationCheck.data && !validationCheck.data.canSubmit) {
        const vData = validationCheck.data;
        if (vData.status === 'MISSING') {
          return res.status(400).json({
            error: "Product context is missing. Please add and obtain approval before submitting.",
            code: "MISSING_CONTEXT",
            action: "ADD_CONTEXT",
            case: "CASE_A"
          });
        }
        if (vData.status === 'PENDING_APPROVAL' || vData.status === 'DRAFT') {
          return res.status(400).json({
            error: "Product context is pending approval",
            code: "PENDING_APPROVAL",
            action: "AWAIT_APPROVAL",
            case: "CASE_B"
          });
        }
        if (vData.status === 'OUTDATED' || vData.status === 'REJECTED') {
          const reason = vData.reason || (vData.status === 'OUTDATED' ? 'Context is outdated' : 'Context was rejected');
          return res.status(400).json({
            error: `Product context is outdated/rejected: ${reason}`,
            reason: reason,
            code: vData.status,
            action: "UPDATE_CONTEXT",
            case: "CASE_D"
          });
        }
        return res.status(400).json({
          error: vData.message || "Product context validation failed",
          case: vData.case || "CASE_UNKNOWN"
        });
      }
    }
    if (!isAdmin && !isAssignee) {
      return res.status(403).json({ error: "Forbidden: You are not assigned to this task" });
    }

    // Validate: Prevent duplicate original submission
    if (!originalSubmission) {
      const existingSubmission = await TaskSubmission.findOne({
        task: taskId,
        originalSubmission: { $exists: false },
      })

      if (existingSubmission) {
        console.error(`[TRACE_FAILURE] Duplicate submission attempt - trace_id=${traceId}, task_id=${taskId}`);
        
        // Emit failure event
        try {
          await emitTaskFailedEvent(
            { task: taskId, user: effectiveUserId, _id: "duplicate" },
            "duplicate_submission",
            traceId,
            task.branch
          );
        } catch (emitErr) {
          console.error("Failed to emit failure event:", emitErr);
        }

        return res.status(400).json({ 
          error: "A submission already exists for this task",
          reason: "duplicate_submission",
          trace_id: traceId
        })
      }
    }

    let documentLink = ""
    let fileType = ""
    if (req.file) {
      console.log("File uploaded:", {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      })

      const cloudinaryUrl = await uploadToCloudinary(req.file.buffer, req.file.originalname)
      documentLink = cloudinaryUrl
      fileType = req.file.mimetype
    }

    // Create new submission
    const newSubmission = new TaskSubmission({
      task: taskId,
      user: effectiveUserId,
      githubLink: githubLink || "",
      notes: notes || "",
      documentLink,
      fileType,
      originalSubmission: originalSubmission ? originalSubmission : undefined,
    })

    const submission = await newSubmission.save()

    // Populate user information
    await submission.populate("user", "name")

    // 🔄 AUTO STATUS UPDATE: Transition task to "Submitted for Review" until review approval (Feature 9)
    await markTaskSubmittedForReview(task, req.io)
    console.log(`✅ Task ${taskId} marked as Submitted for Review (${originalSubmission ? "Revision" : "Submission"} submitted)`);

    // Emit execution event with trace propagation
    let execContext;
    try {
      execContext = await emitTaskSubmittedEvent(submission, traceId, task.branch);
      console.log(`[TRACE_EMITTED] Submission event emitted - trace_id=${execContext.traceId}`);
    } catch (execErr) {
      console.error("[TRACE_FAILURE] Failed to emit submission event:", execErr);
    }

    // Emit socket event for real-time updates
    if (req.io) {
      req.io.emit("submission-created", {
        submission,
        taskId,
        trace_id: execContext?.traceId
      })
    }

    // Workflow: repo submissions go to Tester first; others continue to Admin
    const hasRepo = !!(githubLink && String(githubLink).trim())
    if (hasRepo) {
      const testers = await User.find({ role: "Tester", stillExist: 1 })
      for (const tester of testers) {
        await Notification.create({
          recipient: tester._id,
          type: "task_submitted",
          title: "Repo Submitted for Testing",
          message: `Submission by ${submission.user.name} for task: '${task.title}'. Please evaluate this repo.`,
          task: taskId,
        })
      }
    } else {
      const admins = await User.find({ role: "Admin", stillExist: 1 })
      for (const admin of admins) {
        await Notification.create({
          recipient: admin._id,
          type: "task_submitted",
          title: "Task Submitted",
          message: `Submission by ${submission.user.name} for task: '${task.title}'. Please review it.`,
          task: taskId,
        })
      }
    }

    // Phase 1: Trigger PARIKSHAK Review asynchronously
    // We don't await this so the client gets a fast response.
    invokeParikshak(submission._id, execContext?.traceId || traceId, req.io).catch(err => {
      console.error("[PARIKSHAK] Uncaught error triggering review:", err);
    });

    res.status(201).json({
      ...submission.toObject(),
      trace_id: execContext?.traceId,
      execution_id: execContext?.executionId
    })
  } catch (error) {
    console.error("Error creating submission:", error)
    res.status(500).json({ error: error.message || "Server error" })
  }
})

// Update submission - ONLY ALLOW ACTIVE USERS (also resubmits to admin)
router.put("/:id", auth, upload.single("document"), async (req, res) => {
  try {
    const { githubLink, notes } = req.body
    const submission = await TaskSubmission.findById(req.params.id)
      .populate("task", "title status product tenantId")

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" })
    }

    // Check if user is still active
    const user = await User.findOne({ _id: submission.user, stillExist: 1 });
    if (!user) {
      return res.status(404).json({ error: "User not found or no longer active" });
    }

    // Context validation guard on resubmission / update
    if (submission.task) {
      const taskProduct = submission.task.product;
      const suppliedProductId = (req.body.productId || req.body.product_id || req.body.product || '').toString().trim();
      let rawProductId = '';

      if (taskProduct && taskProduct.toString().trim()) {
        const taskProductStr = taskProduct.toString().trim();
        const isNonProductTaskProduct = ['NONE', 'INTERNAL_ADMIN', 'ADMIN'].includes(taskProductStr.toUpperCase());

        if (!isNonProductTaskProduct) {
          if (suppliedProductId && suppliedProductId.toUpperCase() !== taskProductStr.toUpperCase()) {
            const clientProductDisplay = req.body.productId || req.body.product_id || req.body.product;
            return res.status(400).json({
              error: `Product mismatch: Task belongs to '${taskProduct}', cannot submit under '${clientProductDisplay}'`
            });
          }
          rawProductId = taskProductStr.toUpperCase();
        } else {
          rawProductId = taskProductStr.toUpperCase();
        }
      } else {
        rawProductId = suppliedProductId ? suppliedProductId.toUpperCase() : '';
      }

      const isNonProductTask = !rawProductId || ['NONE', 'INTERNAL_ADMIN', 'ADMIN'].includes(rawProductId.toUpperCase());
      if (!isNonProductTask) {
        const submitterEmpId = (
          req.user?.canonicalEmployeeId ||
          req.user?.employeeId ||
          user.canonicalEmployeeId ||
          user.employeeId ||
          ''
        ).toString().trim().toUpperCase();

        const submitterTenant = (
          req.user?.tenantId ||
          submission.task.tenantId ||
          user.tenantId ||
          'ten-bhiv-core'
        ).toString().trim();

        const validationCheck = await validateContextInternal({
          productId: rawProductId,
          employeeId: submitterEmpId,
          tenantId: submitterTenant,
          user: req.user,
          userId: submission.user
        });

        if (validationCheck.data && !validationCheck.data.canSubmit) {
          const vData = validationCheck.data;
          if (vData.status === 'MISSING') {
            return res.status(400).json({
              error: "Product context is missing. Please add and obtain approval before submitting.",
              code: "MISSING_CONTEXT",
              action: "ADD_CONTEXT",
              case: "CASE_A"
            });
          }
          if (vData.status === 'PENDING_APPROVAL' || vData.status === 'DRAFT') {
            return res.status(400).json({
              error: "Product context is pending approval",
              code: "PENDING_APPROVAL",
              action: "AWAIT_APPROVAL",
              case: "CASE_B"
            });
          }
          if (vData.status === 'OUTDATED' || vData.status === 'REJECTED') {
            const reason = vData.reason || (vData.status === 'OUTDATED' ? 'Context is outdated' : 'Context was rejected');
            return res.status(400).json({
              error: `Product context is outdated/rejected: ${reason}`,
              reason: reason,
              code: vData.status,
              action: "UPDATE_CONTEXT",
              case: "CASE_D"
            });
          }
        }
      }
    }

    let documentLink = submission.documentLink
    let fileType = submission.fileType
    if (req.file) {
      console.log("File uploaded:", {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      })

      const cloudinaryUrl = await uploadToCloudinary(req.file.buffer, req.file.originalname)
      documentLink = cloudinaryUrl
      fileType = req.file.mimetype
    }

    // Store old status before update for tracking
    const previousStatus = submission.status

    // Update submission and reset status to Pending for admin review (resubmission)
    const updatedSubmission = await TaskSubmission.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          githubLink: githubLink || "",
          notes: notes || "",
          documentLink,
          fileType,
          status: "Pending", // Reset to Pending for admin to review again
          resubmittedAt: Date.now(), // Track when it was resubmitted
          updatedAt: Date.now(),
        },
      },
      { new: true }
    )
      .populate("task", "title status")
      .populate("user", "name email")
      .populate("reviewHistory.reviewedBy", "name email")

    // Sync parent task to "Submitted for Review" on resubmission (Feature 9)
    if (submission.task?._id) {
      const taskDoc = await Task.findById(submission.task._id)
      await markTaskSubmittedForReview(taskDoc, req.io)
      if (updatedSubmission.task && taskDoc) {
        updatedSubmission.task.status = taskDoc.status
      }
    }

    // Workflow: repo resubmissions go to Tester first; others continue to Admin
    const hasRepo = !!(updatedSubmission.githubLink && String(updatedSubmission.githubLink).trim())
    const recipients = hasRepo
      ? await User.find({ role: "Tester", stillExist: 1 })
      : await User.find({ role: "Admin", stillExist: 1 })
    const notificationTitle = hasRepo ? "Repo Resubmitted for Testing" : "Task Resubmitted"
    const taskTitle = submission.task?.title || "Unknown Task"
    
    for (const recipient of recipients) {
      await Notification.create({
        recipient: recipient._id,
        type: "task_resubmitted",
        title: notificationTitle,
        message: `${user.name} has resubmitted their work for task: '${taskTitle}'. Please review the updated submission.`,
        task: submission.task?._id,
      })
    }

    console.log(`✅ Submission ${req.params.id} updated and resubmitted by ${user.name}`)

    // Emit socket event for real-time updates
    if (req.io) {
      req.io.emit("submission-resubmitted", {
        submission: updatedSubmission,
        previousStatus,
        resubmittedBy: user.name,
      })
    }

    // Phase 1: Trigger PARIKSHAK Review asynchronously on resubmission
    let traceId = req.headers["x-trace-id"] || `trace_resub_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    invokeParikshak(updatedSubmission._id, traceId, req.io).catch(err => {
      console.error("[PARIKSHAK] Uncaught error triggering review on resubmission:", err);
    });

    res.json(updatedSubmission)
  } catch (error) {
    console.error("Error updating submission:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Review submission
router.put("/:id/review", auth, async (req, res) => {
  try {
    const { status, feedback, reviewedBy } = req.body

    if (!status || !["Approved", "Rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" })
    }

    // Get or generate trace_id (make it optional for backward compatibility)
    let traceId = req.headers["x-trace-id"];
    if (!traceId) {
      traceId = `trace_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      console.log(`[TRACE_WARNING] Auto-generated trace_id for submission review`);
    } else {
      console.log(`[TRACE_RECEIVED] Review received - trace_id=${traceId}, status=${status}`);
    }

    const submission = await TaskSubmission.findById(req.params.id)
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" })
    }

    // Check if user is still active
    const user = await User.findOne({ _id: submission.user, stillExist: 1 });
    if (!user) {
      return res.status(404).json({ error: "User not found or no longer active" });
    }

    // Use reviewedBy from request body, or fall back to user ID from token
    const reviewerId = reviewedBy || req.user.id
    if (!reviewerId) {
      return res.status(400).json({ error: "Reviewer ID is required" })
    }

    // Add current review to history
    if (submission.status !== "Pending") {
      submission.reviewHistory.push({
        status: submission.status,
        feedback: submission.feedback,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      })
    }

    // Update current status and feedback
    submission.status = status
    submission.feedback = feedback || ""
    await submission.save()

    const task = await Task.findById(submission.task);

    // Update parent task status deterministically based on review outcome
    if (status === "Approved") {
      await markTaskApprovedCompleted(task, req.io)
    } else if (status === "Rejected") {
      await reopenRejectedTask(task, req.io)
    }

    // Emit execution events based on review outcome
    let execContext;
    try {
      if (status === "Approved") {
        execContext = await emitTaskCompletedEvent(submission, traceId, task?.branch);
        console.log(`[TRACE_EMITTED] Task completed - trace_id=${execContext.traceId}`);
      } else if (status === "Rejected") {
        execContext = await emitTaskFailedEvent(
          submission, 
          feedback || "submission_rejected", 
          traceId, 
          task?.branch
        );
        console.log(`[TRACE_EMITTED] Task failed - trace_id=${execContext.traceId}`);
      }
    } catch (execErr) {
      console.error("[TRACE_FAILURE] Failed to emit review event:", execErr);
    }

    // Emit socket event for real-time updates
    if (req.io) {
      req.io.emit("submission-reviewed", {
        submission,
        taskStatus: task?.status,
        trace_id: execContext?.traceId
      })
    }

    // Notify the submitter
    await Notification.create({
      recipient: submission.user,
      type: "submission_reviewed",
      title: `Submission ${status}`,
      message: `Your submission for task '${task?.title || "Task"}' has been ${status.toLowerCase()}. Feedback: ${feedback || "None"}`,
      task: submission.task,
    })

    res.json({
      ...submission.toObject(),
      trace_id: execContext?.traceId,
      execution_id: execContext?.executionId
    });
  } catch (error) {
    console.error("Error reviewing submission:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Evaluate submission synchronously via Parikshak for interactive modal review
router.post("/:id/evaluate-parikshak", auth, async (req, res) => {
  try {
    const traceId = req.headers["x-trace-id"] || `trace_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const evaluationData = await evaluateParikshakSubmission(req.params.id, traceId);
    res.json(evaluationData);
  } catch (error) {
    console.error("Error evaluating submission via Parikshak:", error);
    res.status(500).json({ error: error.message || "Failed to run Parikshak evaluation" });
  }
});

// Human Reviewer Approval & Next Task Confirmation
router.post("/:id/approve-and-assign-next", auth, async (req, res) => {
  try {
    const { status = "Approved", feedback, aiReviewDetails, nextTask } = req.body;
    const traceId = req.headers["x-trace-id"] || `trace_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const submission = await TaskSubmission.findById(req.params.id).populate("task").populate("user");
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const currentTask = submission.task;
    const user = submission.user;

    // 1. Update Submission status & feedback
    submission.status = status;
    submission.feedback = feedback || aiReviewDetails?.doneWell || "Approved via Parikshak Human Confirmation.";
    if (aiReviewDetails) {
      submission.aiReviewDetails = aiReviewDetails;
    }
    submission.parikshakReview = {
      status: aiReviewDetails?.result || "PASS",
      score: aiReviewDetails?.score || 88,
      review: submission.feedback,
      nextTask: nextTask?.title || "",
      reviewedAt: new Date()
    };
    await submission.save();

    // 2. Update Current Task based on review status
    if (currentTask) {
      if (status === "Rejected") {
        await reopenRejectedTask(currentTask, req.io);
      } else if (currentTask.status !== "Completed") {
        currentTask.status = "Completed";
        currentTask.closedAt = currentTask.closedAt || new Date();
        currentTask.progress = 100;
        await currentTask.save();
        if (req.io) {
          req.io.emit("task:updated", currentTask);
          req.io.emit("task-updated", currentTask);
        }
      }
    }

    // 3. Emit Task Completed Event
    let execContext;
    try {
      execContext = await emitTaskCompletedEvent(submission, traceId, currentTask?.branch);
    } catch (e) {
      console.warn("[TRACE] Failed emitting completion event:", e.message);
    }

    // 4. Create and Assign Next Task if provided (Feature 6 & Feature 8: Single Authoritative Path & Deduplication)
    let createdNextTask = null;
    if (nextTask && nextTask.title) {
      const nextTaskId = nextTask.task_id || "";
      const existing = await Task.findOne({
        assignee: user._id,
        $or: [
          ...(nextTaskId ? [{ task_id: nextTaskId }] : []),
          {
            title: nextTask.title,
            status: { $in: ["Pending", "In Progress", "Submitted for Review", "Completed", "Closed"] }
          }
        ]
      });

      if (existing) {
        console.log(`[APPROVE-AND-ASSIGN] Task "${nextTask.title}" already exists for assignee with status "${existing.status}". Skipping duplicate creation.`);
        createdNextTask = existing;
      } else {
        createdNextTask = new Task({
          title: nextTask.title,
          description: nextTask.description || nextTask.title,
          notes: nextTask.notes || nextTask.masterPrompt || nextTask.description || "",
          status: "Pending",
          task_id: nextTaskId || undefined,
          product: nextTask.product || currentTask?.product || "BHIV",
          tenantId: nextTask.tenantId || currentTask?.tenantId || user.tenantId || "ten-bhiv-core",
          priority: nextTask.priority || currentTask?.priority || "Medium",
          department: nextTask.department || currentTask?.department,
          assignee: user._id,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          branch: currentTask?.branch || "blackhole_mumbai",
          progress: 0,
          links: Array.isArray(nextTask.links) ? nextTask.links : []
        });

        const { generateTaskBriefPdf } = require("../services/pdfGenerator");
        let pdfPath = nextTask.pdfUrl || nextTask.documentLink || "";
        if (!pdfPath) {
          try {
            pdfPath = await generateTaskBriefPdf(createdNextTask, user);
          } catch (pdfErr) {
            console.warn("[PDF GENERATION] Warning generating PDF task brief:", pdfErr.message);
          }
        }

        if (pdfPath) {
          if (!createdNextTask.links.includes(pdfPath)) {
            createdNextTask.links.push(pdfPath);
          }
          if (!createdNextTask.notes || createdNextTask.notes.startsWith("http") || createdNextTask.notes.startsWith("/uploads")) {
            createdNextTask.notes = pdfPath;
          }
          createdNextTask.fileType = "application/pdf";
        }
        await createdNextTask.save();

        const { emitTaskAssignedEvent } = require("../services/taskExecutionBridge");
        try {
          await emitTaskAssignedEvent(createdNextTask, traceId, createdNextTask.branch);
        } catch (e) {}

        await Notification.create({
          recipient: user._id,
          type: "task_assigned",
          title: "New Task Assigned",
          message: `Next task "${createdNextTask.title}" has been assigned to you.`,
          task: createdNextTask._id
        });
      }
    }

    await Notification.create({
      recipient: user._id,
      type: "submission_reviewed",
      title: "Submission Approved",
      message: `Your submission for '${currentTask.title}' has been approved.`,
      task: currentTask._id
    });

    if (req.io) {
      req.io.emit("submission-reviewed", {
        submission,
        trace_id: execContext?.traceId
      });
      if (createdNextTask) {
        req.io.emit("task-created", createdNextTask);
      }
    }

    res.json({
      message: "Submission approved and next task created successfully",
      submission,
      nextTask: createdNextTask
    });
  } catch (error) {
    console.error("Error approving submission & assigning next task:", error);
    res.status(500).json({ error: error.message || "Server error" });
  }
});

// Delete submission
router.delete("/:id", auth, async (req, res) => {
  try {
    const submission = await TaskSubmission.findById(req.params.id)

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" })
    }

    await TaskSubmission.findByIdAndDelete(req.params.id)

    // Emit socket event for real-time updates
    if (req.io) {
      req.io.emit("submission-deleted", req.params.id)
    }

    res.json({ message: "Submission deleted successfully" })
  } catch (error) {
    console.error("Error deleting submission:", error)
    res.status(500).json({ error: "Server error" })
  }
})

module.exports = router