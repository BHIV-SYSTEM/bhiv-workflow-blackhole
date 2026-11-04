const express = require("express")
const router = express.Router()
const Task = require("../models/Task")
const User = require("../models/User")
const Department = require("../models/Department")
const auth = require("../middleware/auth")
const multer = require("multer")
const { uploadToCloudinary } = require("../utils/cloudinary")
const Notification = require("../models/Notification")
const { isValidOrgEmail, ORG_EMAIL_ERROR } = require("../utils/orgEmail")
const mongoose = require("mongoose")
const { signalTaskCreated, signalTaskCompleted } = require("../services/karmaClient")
const { executeConstitutionalPipeline } = require("../services/setuConvergenceService")


// Helper to get branch filter from request
const getBranchQuery = (req) => {
  const selectedBranch = req.headers['x-branch'] || req.query.branch;
  if (selectedBranch && selectedBranch !== 'all') {
    return { branch: selectedBranch };
  }
  return {};
};

// Stream Parikshak Task Specification PDF directly from BHIV Server (Zero Parikshak edits required)
router.get("/parikshak-pdf/:taskId", async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const path = require("path");
    const { exec } = require("child_process");

    const parikshakDir = path.resolve(__dirname, "../../../../bhiv-parikshak/Parikshak-system");
    const pythonCmd = `python -c "import sys; sys.path.insert(0, '.'); from db.bhiv_task_details import get_bhiv_task_details; from evaluation_engine.report_pdf_generator import generate_next_task_pdf; details=get_bhiv_task_details('${taskId}'); details['next_task_id']='${taskId}'; pdf=generate_next_task_pdf(details); sys.stdout.buffer.write(pdf)"`;

    const options = {
      cwd: parikshakDir,
      encoding: "buffer",
      maxBuffer: 10 * 1024 * 1024,
    };

    exec(pythonCmd, options, (err, stdout, stderr) => {
      if (err || !stdout || stdout.length === 0) {
        console.error("PDF generation subprocess error:", stderr ? stderr.toString() : err);
        return res.status(500).json({ error: "Failed to generate task PDF specification." });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="task_spec_${taskId}.pdf"`);
      return res.send(stdout);
    });
  } catch (error) {
    console.error("Error generating Parikshak task PDF:", error);
    res.status(500).json({ error: "Server error generating PDF" });
  }
});

// Direct HTTP PDF Streaming Endpoint for Task Brief (Works on Local, Render, Vercel & Production)
router.get("/:id/pdf", async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate('department', 'name');
    if (!task) {
      return res.status(404).send("Task not found");
    }

    // 1. If user uploaded an original PDF file (saved in Cloudinary links or notes), use original uploaded PDF!
    const notesCloudinaryMatch = task.notes?.match(/^Document:\s*(https?:\/\/[^\s\)]+)/i);
    const originalPdfUrl = notesCloudinaryMatch 
      ? notesCloudinaryMatch[1] 
      : (task.links && task.links.length > 0 && task.links[0]?.includes('cloudinary.com') ? task.links[0] : null);

    if (originalPdfUrl) {
      console.log(`[PDF ROUTE] Using original user-uploaded Cloudinary document for task ${task._id}: ${originalPdfUrl}`);
      return res.redirect(originalPdfUrl);
    }

    // 2. Otherwise generate structured PDF brief for system/Parikshak tasks without uploaded document
    let assigneeUser = null;
    if (task.assignee) {
      assigneeUser = await User.findById(task.assignee).select("name email");
    }

    const { generateTaskBriefPdfStream } = require('../services/pdfGenerator');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="task_brief_${task._id}.pdf"`);

    const pdfStream = generateTaskBriefPdfStream(task, assigneeUser);
    pdfStream.pipe(res);
  } catch (err) {
    console.error("Error streaming task PDF:", err);
    res.status(500).send("Error generating task PDF brief");
  }
});

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (!file) {
      console.error("No file provided in upload")
      return cb(new Error("No file provided"))
    }

    const validTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/html",
      "text/markdown",
      "",
    ]
    const validExtensions = /\.(pdf|doc|docx|txt|html|md)$/i
    const mimetypeValid = validTypes.includes(file.mimetype) || file.originalname.endsWith('.md')
    const extnameValid = validExtensions.test(file.originalname)

    if (!mimetypeValid || !extnameValid) {
      console.error(`Invalid file: mimetype=${file.mimetype}, originalname=${file.originalname}`)
      return cb(new Error("Only PDF, DOC, DOCX, MD, TXT, and HTML files are allowed"))
    }

    // Validate file content for HTML
    if (file.mimetype === "text/html") {
      if (!file.buffer) {
        console.error(`No buffer for file: originalname=${file.originalname}`)
        return cb(new Error("File buffer is missing"))
      }
      const content = file.buffer.toString("utf8", 0, 100)
      if (!content.startsWith("<!DOCTYPE html")) {
        console.error(`Invalid HTML content for file: originalname=${file.originalname}`)
        return cb(new Error("Invalid HTML file"))
      }
    }

    cb(null, true)
  },
})

// Get overdue tasks
router.get("/overdue", auth, async (req, res) => {
  try {
    const now = new Date()
    const branchQuery = getBranchQuery(req);
    
    // Find tasks that are overdue (dueDate < now) and not completed
    const tasks = await Task.find({
      ...branchQuery,
      dueDate: { $lt: now },
      status: { $ne: "Completed" }
    })
      .populate("department", "name color")
      .populate("dependencies", "title status")
      .sort({ dueDate: 1 }) // Sort by due date (oldest first)

    // Handle assignee population manually
    const tasksWithAssignees = await Promise.all(tasks.map(async (task) => {
      const taskObj = task.toObject()
      
      if (!task.assignee) {
        taskObj.assignee = null
        return taskObj
      }

      const actualUser = await User.findById(task.assignee).select("name avatar email stillExist")
      
      if (!actualUser) {
        taskObj.assignee = null
        return taskObj
      }

      const isActive = actualUser.stillExist === 1
      const isBlackhole = isValidOrgEmail(actualUser.email)

      taskObj.assignee = {
        _id: actualUser._id,
        name: actualUser.name,
        avatar: actualUser.avatar,
        email: actualUser.email,
        stillExist: actualUser.stillExist,
        isActive,
        isBlackhole,
        status: !isActive ? 'inactive' : !isBlackhole ? 'non-blackhole' : 'active'
      }

      // Calculate days overdue
      const dueDate = new Date(task.dueDate)
      const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24))
      taskObj.daysOverdue = daysOverdue

      return taskObj
    }))

    res.json(tasksWithAssignees)
  } catch (error) {
    console.error("Error fetching overdue tasks:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Maximum tasks returnable in a single unpaginated request
const MAX_UNPAGINATED_LIMIT = 100

// Get all tasks - optimized with aggregation (eliminates N+1 query)
router.get("/", auth, async (req, res) => {
  try {
    const { department, status, dueDate, priority, page, limit, search, submissionStatus } = req.query
    const branchQuery = getBranchQuery(req)

    const limitNum = parseInt(limit) || 0
    if (limitNum === 0) {
      return res.status(400).json({
        error: "Pagination required. Provide ?limit=N&page=P (max limit without page: use limit <= " + MAX_UNPAGINATED_LIMIT + ")",
        hint: "Use ?status=Completed&page=1&limit=20"
      })
    }
    if (limitNum > MAX_UNPAGINATED_LIMIT) {
      return res.status(400).json({
        error: `limit exceeds maximum allowed value of ${MAX_UNPAGINATED_LIMIT}`,
        hint: `Use limit <= ${MAX_UNPAGINATED_LIMIT} with page parameter`
      })
    }

    const filter = { ...branchQuery }
    if (department) filter.department = new mongoose.Types.ObjectId(department)
    if (status) filter.status = status
    if (priority) filter.priority = priority
    if (dueDate) {
      const date = new Date(dueDate)
      filter.dueDate = {
        $gte: new Date(date.setHours(0, 0, 0, 0)),
        $lt: new Date(date.setHours(23, 59, 59, 999)),
      }
    }
    if (search) {
      const re = { $regex: search, $options: "i" }
      filter.$or = [{ title: re }, { description: re }]
    }

    const pageNum = parseInt(page) || 1
    const skip = (pageNum - 1) * limitNum

    // Base pipeline stages shared by both data + count
    const basePipeline = [
      { $match: filter },
      // Join submissions only when submissionStatus filter is active
      ...( submissionStatus ? [
        {
          $lookup: {
            from: "tasksubmissions",
            localField: "_id",
            foreignField: "task",
            pipeline: [
              { $sort: { createdAt: -1 } },
              { $limit: 1 },
              { $project: { status: 1 } }
            ],
            as: "_sub"
          }
        },
        {
          $match: submissionStatus === "noSubmission"
            ? { "_sub": { $size: 0 } }
            : { "_sub.0.status": submissionStatus.charAt(0).toUpperCase() + submissionStatus.slice(1) }
        }
      ] : [] )
    ]

    const dataPipeline = [
      ...basePipeline,
      { $sort: { updatedAt: -1 } },
      { $skip: skip }, { $limit: limitNum },
      {
        $lookup: {
          from: "users",
          localField: "assignee",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1, avatar: 1, email: 1, stillExist: 1 } }],
          as: "assigneeData"
        }
      },
      {
        $lookup: {
          from: "departments",
          localField: "department",
          foreignField: "_id",
          pipeline: [{ $project: { name: 1, color: 1 } }],
          as: "departmentData"
        }
      },
      // Always embed latest submission for completed tasks
      ...( filter.status === "Completed" ? [
        {
          $lookup: {
            from: "tasksubmissions",
            localField: "_id",
            foreignField: "task",
            pipeline: [
              { $sort: { createdAt: -1 } },
              { $limit: 1 },
              {
                $lookup: {
                  from: "users",
                  localField: "user",
                  foreignField: "_id",
                  pipeline: [{ $project: { name: 1, avatar: 1 } }],
                  as: "userArr"
                }
              },
              { $addFields: { user: { $arrayElemAt: ["$userArr", 0] } } },
              { $project: { userArr: 0 } }
            ],
            as: "submissionArr"
          }
        },
        { $addFields: { submission: { $arrayElemAt: ["$submissionArr", 0] } } },
        { $project: { submissionArr: 0 } }
      ] : [] ),
      {
        $addFields: {
          department: { $arrayElemAt: ["$departmentData", 0] },
          assignee: {
            $let: {
              vars: { u: { $arrayElemAt: ["$assigneeData", 0] } },
              in: {
                $cond: {
                  if: { $not: ["$$u"] },
                  then: null,
                  else: {
                    _id: "$$u._id",
                    name: "$$u.name",
                    avatar: "$$u.avatar",
                    email: "$$u.email",
                    stillExist: "$$u.stillExist",
                    isActive: { $eq: ["$$u.stillExist", 1] },
                    isBlackhole: true
                  }
                }
              }
            }
          }
        }
      },
      { $project: { assigneeData: 0, departmentData: 0, _sub: 0 } }
    ]

    const countPipeline = [...basePipeline, { $count: "total" }]

    const [tasks, countResult] = await Promise.all([
      Task.aggregate(dataPipeline),
      Task.aggregate(countPipeline)
    ])
    const total = countResult[0]?.total ?? 0
    res.json({ tasks, total, page: pageNum, pages: Math.ceil(total / limitNum) })
  } catch (error) {
    console.error("Error fetching tasks:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get aggregate stats for all completed tasks (used by CompletedTasksStats)
router.get("/stats", auth, async (req, res) => {
  try {
    const branchQuery = getBranchQuery(req)
    const matchFilter = { ...branchQuery, status: "Completed" }

    // One aggregation: join submissions, group by status, group by department
    const [statusResult, deptResult] = await Promise.all([
      Task.aggregate([
        { $match: matchFilter },
        {
          $lookup: {
            from: "tasksubmissions",
            localField: "_id",
            foreignField: "task",
            pipeline: [{ $project: { status: 1 } }],
            as: "sub"
          }
        },
        {
          $group: {
            _id: {
              $cond: [
                { $eq: [{ $size: "$sub" }, 0] },
                "NoSubmission",
                { $arrayElemAt: ["$sub.status", 0] }
              ]
            },
            count: { $sum: 1 }
          }
        }
      ]),
      Task.aggregate([
        { $match: matchFilter },
        {
          $lookup: {
            from: "tasksubmissions",
            localField: "_id",
            foreignField: "task",
            pipeline: [{ $project: { status: 1 } }],
            as: "sub"
          }
        },
        {
          $group: {
            _id: "$department",
            total: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: [{ $arrayElemAt: ["$sub.status", 0] }, "Approved"] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: [{ $arrayElemAt: ["$sub.status", 0] }, "Pending"] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: [{ $arrayElemAt: ["$sub.status", 0] }, "Rejected"] }, 1, 0] } },
            noSubmission: { $sum: { $cond: [{ $eq: [{ $size: "$sub" }, 0] }, 1, 0] } }
          }
        }
      ])
    ])

    const counts = { Approved: 0, Pending: 0, Rejected: 0, NoSubmission: 0 }
    statusResult.forEach(r => { counts[r._id] = r.count })
    const total = counts.Approved + counts.Pending + counts.Rejected + counts.NoSubmission

    res.json({
      approved: counts.Approved,
      pending: counts.Pending,
      rejected: counts.Rejected,
      noSubmission: counts.NoSubmission,
      total,
      byDepartment: deptResult
    })
  } catch (error) {
    console.error("Error fetching task stats:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get task by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('department', 'name')
      .populate('dependencies', 'title status')

    if (!task) {
      return res.status(404).json({ msg: 'Task not found' });
    }

    // Handle assignee manually - SHOW EXISTING ASSIGNEE
    const taskObj = task.toObject()
    
    if (task.assignee) {
      const actualUser = await User.findById(task.assignee).select("name avatar email stillExist")
      
      if (actualUser) {
        const isActive = actualUser.stillExist === 1
        const isBlackhole = isValidOrgEmail(actualUser.email)

        taskObj.assignee = {
          _id: actualUser._id,
          name: actualUser.name,
          avatar: actualUser.avatar,
          email: actualUser.email,
          stillExist: actualUser.stillExist,
          isActive,
          isBlackhole,
          status: !isActive ? 'inactive' : !isBlackhole ? 'non-blackhole' : 'active'
        }

        // Only generate local PDF task brief if the task does NOT have an original uploaded Cloudinary document
        const hasOriginalCloudinaryDoc = (task.links && task.links.length > 0 && task.links[0]?.includes('cloudinary.com')) ||
                                         (task.notes && task.notes.includes('https://res.cloudinary.com'));

        if (!hasOriginalCloudinaryDoc) {
          const fs = require('fs');
          const path = require('path');
          const { generateTaskBriefPdf } = require('../services/pdfGenerator');

          const pdfFileName = (task.notes && task.notes.includes('task_brief_')) 
            ? task.notes.split('/').pop() 
            : `task_brief_${task._id}.pdf`;
          const fullPdfPath = path.join(__dirname, '../uploads', pdfFileName);

          if (!fs.existsSync(fullPdfPath)) {
            try {
              const generatedPath = await generateTaskBriefPdf(task, actualUser);
              if (generatedPath) {
                task.notes = generatedPath;
                task.fileType = 'application/pdf';
                await task.save();
                taskObj.notes = generatedPath;
                taskObj.fileType = 'application/pdf';
              }
            } catch (pdfErr) {
              console.warn("[PDF AUTO-GEN WARN]", pdfErr.message);
            }
          }
        }
      } else {
        taskObj.assignee = null
      }
    }

    res.json(taskObj);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Task not found' });
    }
    res.status(500).send('Server Error');
  }
});

// Create new task — assignee must be active and belong to the same branch as the task
router.post("/", auth, upload.single("document"), async (req, res) => {
  try {
    const { title, description, department, assignee, priority, status, dependencies, dueDate, user, links } = req.body;
    console.log("Received links", links);

    // Validate required fields
    if (!title || !department || !assignee) {
      return res.status(400).json({ error: "Title, department, and assignee are required" });
    }

    const selectedBranch = req.headers['x-branch'] || req.query.branch || 'blackhole_mumbai';

    const assigneeFilter = { _id: assignee, stillExist: 1 };
    if (selectedBranch && selectedBranch !== 'all') {
      assigneeFilter.branch = selectedBranch;
    }

    const assigneeUser = await User.findOne(assigneeFilter);
    if (!assigneeUser) {
      return res.status(400).json({ error: "Assignee not found, not active, or not a member of this branch" });
    }
    if (!isValidOrgEmail(assigneeUser.email)) {
      return res.status(400).json({ error: ORG_EMAIL_ERROR });
    }

    let notes = "";
    let fileType = "";
    if (req.file) {
      console.log("File uploaded:", {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      });

      const cloudinaryUrl = await uploadToCloudinary(req.file.buffer, req.file.originalname);
      notes = `Document: ${cloudinaryUrl} (${req.file.originalname})`;
      fileType = req.file.mimetype;
    }

    let savedTask = null;

    console.log(`[SETU-CONVERGENCE] Routing Standard Task Creation through 11-Stage SETU EOS Pipeline...`);

    await executeConstitutionalPipeline(
      {
        intent: "CREATE_ENGINEERING_TASK",
        domain: "workflow",
        targetCapability: "NIYANTRAN",
        action: "create_standard_task",
        priority: priority || "Medium",
        tenantId: selectedBranch,
        actor: { userId: req.user ? req.user.id : user || "system", role: "employee" },
        payload: { title, description, department, assignee, priority, status, branch: selectedBranch },
      },
      {
        tenantId: selectedBranch,
        capabilityHandler: async () => {
          const task = new Task({
            title,
            description,
            department: new mongoose.Types.ObjectId(department),
            assignee: new mongoose.Types.ObjectId(assignee),
            priority: priority || "Medium",
            status: status || "Pending",
            dependencies: dependencies ? JSON.parse(dependencies) : [],
            links: links ? links.split(',').map(link => link.trim()) : [],
            dueDate: dueDate || null,
            createdBy: user || req.user.id,
            notes,
            fileType,
            branch: selectedBranch,
          });
          savedTask = await task.save();
          return { status: "EXECUTED", capability: "NIYANTRAN_TASK_CREATE", taskId: savedTask._id };
        },
      }
    );

    // Create notification for the assignee
    if (assigneeUser) {
      await Notification.create({
        recipient: assignee,
        type: "task_assigned",
        title: "New Task Assigned",
        message: `You have been assigned a new task: '${title}'.`,
        task: savedTask._id,
      });
    }

    // Notify all testers about new task
    try {
      const dept = await Department.findById(department).select("name");
      const testers = await User.find({ role: "Tester", stillExist: 1 });
      for (const tester of testers) {
        await Notification.create({
          recipient: tester._id,
          type: "task_created_for_tester",
          title: "New Task Created",
          message: `New task "${title}" created in ${dept?.name || "Unknown"} department`,
          task: savedTask._id,
        });
      }
    } catch (notifErr) {
      console.error("Error notifying testers:", notifErr);
    }

    // Populate fields for response
    const populatedTask = await Task.findById(savedTask._id)
      .populate("department", "name color")
      .populate("dependencies", "title status");

    // Handle assignee manually
    const taskObj = populatedTask.toObject()
    const isBh = isValidOrgEmail(assigneeUser.email)
    taskObj.assignee = {
      _id: assigneeUser._id,
      name: assigneeUser.name,
      avatar: assigneeUser.avatar,
      email: assigneeUser.email,
      stillExist: assigneeUser.stillExist,
      isActive: true,
      isBlackhole: isBh,
      status: isBh ? 'active' : 'non-blackhole'
    }

    // Emit socket event for real-time updates
    if (req.io) {
      req.io.emit("task:created", taskObj);
    }

    // Fire-and-forget KARMA signal
    signalTaskCreated(String(assignee)).catch(() => {});

    res.status(201).json(taskObj);
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({ error: error.message || "Server error" });
  }
});

// Register a self-assigned task intake (e.g. from WhatsApp, meeting, direct lead instruction)
router.post("/register-intake", auth, async (req, res) => {
  try {
    const {
      sourceType = "WHATSAPP",
      originatingPerson,
      sourceReference,
      originalInstruction,
      title,
      description,
      department,
      branch,
      priority = "Medium",
      dueDate,
      scope,
      expectedOutcome,
      acceptanceCriteria,
      attachments = []
    } = req.body;

    if (!originalInstruction || !originalInstruction.trim()) {
      return res.status(400).json({ error: "Original task instruction (e.g. pasted WhatsApp message) is required." });
    }

    const userId = req.user.id || req.user._id;
    const candidateUser = await User.findById(userId);
    if (!candidateUser) {
      return res.status(401).json({ error: "Authenticated user not found." });
    }

    // Determine department
    let targetDept = department || candidateUser.department;
    if (!targetDept) {
      const defaultDept = await Department.findOne();
      targetDept = defaultDept ? defaultDept._id : null;
    }

    if (!targetDept) {
      return res.status(400).json({ error: "Department is required." });
    }

    // Determine Title
    let taskTitle = title;
    if (!taskTitle || !taskTitle.trim()) {
      const firstLine = originalInstruction.trim().split("\n")[0].replace(/^[\*\-\#\s]+/, "").trim();
      taskTitle = firstLine.length > 80 ? firstLine.substring(0, 77) + "..." : (firstLine || "WhatsApp Registered Task");
    }

    // Generate unique task_id: e.g. T-WHT-<TIMESTAMP_HEX>
    const randSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const prefix = sourceType === "WHATSAPP" ? "T-WHT" : (sourceType === "LEAD_INSTRUCTION" ? "T-DIR" : "T-INT");
    const generatedTaskId = `${prefix}-${Date.now().toString(36).toUpperCase()}-${randSuffix}`;

    const taskDescription = description || originalInstruction;

    const newTask = new Task({
      title: taskTitle,
      description: taskDescription,
      task_id: generatedTaskId,
      sourceType: sourceType.toUpperCase(),
      originatingPerson: originatingPerson || "Project Lead",
      sourceReference: sourceReference || "WhatsApp / External Communication",
      originalInstruction: originalInstruction,
      scope: scope || "Execution as instructed in task provenance.",
      expectedOutcome: expectedOutcome || "Satisfy deliverables and submit REVIEW_PACKET to Parikshak.",
      acceptanceCriteria: Array.isArray(acceptanceCriteria) ? acceptanceCriteria : [
        "Complete source code implementation matching specification",
        "Comprehensive automated test suite passing (100%)",
        "Deliver verified REVIEW_PACKET.md and CODE_PACKET.md"
      ],
      intakeAttachments: Array.isArray(attachments) ? attachments : [],
      status: "Pending Validation",
      priority: priority || "Medium",
      department: targetDept,
      assignee: candidateUser._id,
      dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      branch: branch || req.headers["x-branch"] || candidateUser.branch || "blackhole_mumbai",
      progress: 0,
      notes: `[TASK INTAKE REGISTERED]\nSource: ${sourceType}\nOriginator: ${originatingPerson || 'Lead'}\nReference: ${sourceReference || 'N/A'}\nUnique ID: ${generatedTaskId}\nRegistered At: ${new Date().toISOString()}`
    });

    await newTask.save();

    // Notify project leads and managers about new pending task
    try {
      const leads = await User.find({
        role: { $in: ["Admin", "Manager", "Lead", "Governor"] },
        stillExist: 1
      }).select("_id");

      for (const lead of leads) {
        await Notification.create({
          recipient: lead._id,
          type: "task_assigned",
          title: "New Task Registration Pending Validation",
          message: `${candidateUser.name} registered a new task from ${sourceType}: '${newTask.title}'. Approval required before execution begins.`,
          task: newTask._id
        });
      }
    } catch (notifErr) {
      console.warn("Non-fatal notification warning on task intake:", notifErr.message);
    }

    if (req.io) {
      req.io.emit("task:created", newTask);
    }

    res.status(201).json({
      ok: true,
      message: "Task successfully registered and queued for lead validation. Execution locked until approved.",
      task: newTask
    });
  } catch (error) {
    console.error("Error registering task intake:", error);
    res.status(500).json({ error: error.message || "Server error registering task intake" });
  }
});

// Authorize or Return a self-registered task (Lead / Manager / Admin)
router.post("/:id/authorize", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes, priority, scope, expectedOutcome } = req.body;

    const isLeadOrAdmin = req.user && (
      req.user.role === "Admin" ||
      req.user.role === "Manager" ||
      req.user.role === "Lead" ||
      req.user.role === "Governor" ||
      req.user.isAdmin
    );

    if (!isLeadOrAdmin) {
      return res.status(403).json({ error: "Access denied. Only Project Leads, Managers, or Admins can authorize tasks." });
    }

    const task = await Task.findById(id).populate("assignee", "name email");
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    if (action === "APPROVE") {
      task.status = "Approved";
      task.authorizedBy = req.user.id || req.user._id;
      task.authorizedAt = new Date();
      if (notes) task.authorizationNotes = notes;
      if (priority) task.priority = priority;
      if (scope) task.scope = scope;
      if (expectedOutcome) task.expectedOutcome = expectedOutcome;

      await task.save();

      if (task.assignee) {
        await Notification.create({
          recipient: task.assignee._id || task.assignee,
          type: "task_assigned",
          title: "Task Authorized to Begin Execution",
          message: `Your task '${task.title}' has been authorized by ${req.user.name || 'Lead'}. You may now start execution.`,
          task: task._id
        });
      }

      if (req.io) {
        req.io.emit("task:updated", task);
      }

      return res.json({
        ok: true,
        message: "Task successfully authorized. Status updated to 'Approved'. Execution unlocked.",
        task
      });
    } else if (action === "RETURN") {
      task.status = "Returned";
      task.returnedFeedback = notes || "Clarification required from lead before task can be authorized.";
      await task.save();

      if (task.assignee) {
        await Notification.create({
          recipient: task.assignee._id || task.assignee,
          type: "task_assigned",
          title: "Task Returned for Clarification",
          message: `Your submitted task '${task.title}' was returned: ${task.returnedFeedback}`,
          task: task._id
        });
      }

      if (req.io) {
        req.io.emit("task:updated", task);
      }

      return res.json({
        ok: true,
        message: "Task returned for clarification.",
        task
      });
    } else {
      return res.status(400).json({ error: "Invalid action. Must be 'APPROVE' or 'RETURN'." });
    }
  } catch (error) {
    console.error("Error authorizing task:", error);
    res.status(500).json({ error: error.message || "Server error" });
  }
});

// Update task — reassign only to active users in the task’s branch
router.put("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    const existing = await Task.findById(id)
    if (!existing) {
      return res.status(404).json({ error: "Task not found" })
    }

    // Authorisation Gate: Only authorised tasks can enter In Progress
    if (updates.status === "In Progress" && existing.status !== "In Progress") {
      const allowedPriorStates = ["Approved", "Pending"]
      if (!allowedPriorStates.includes(existing.status)) {
        return res.status(403).json({
          error: "AUTHORIZATION_GATE_LOCKED",
          message: `Execution blocked: Task '${existing.title}' cannot enter 'In Progress' until authorized by a project lead. Current status is '${existing.status}'.`
        })
      }
      updates.executionStartedAt = new Date()
    }

    if (updates.status === "Submitted for Review") {
      updates.submittedForReviewAt = new Date()
    }

    if (updates.status === "Closed" || updates.status === "Completed") {
      updates.closedAt = new Date()
    }

    if (updates.assignee) {
      const branchForAssignee = req.headers['x-branch'] || req.query.branch || existing.branch || 'blackhole_mumbai'
      const assigneeFilter = { _id: updates.assignee, stillExist: 1 }
      if (branchForAssignee && branchForAssignee !== 'all') {
        assigneeFilter.branch = branchForAssignee
      }
      const assigneeUser = await User.findOne(assigneeFilter)
      if (!assigneeUser) {
        return res.status(400).json({ error: "Assignee not found, not active, or not a member of this branch" })
      }
      if (!isValidOrgEmail(assigneeUser.email)) {
        return res.status(400).json({ error: ORG_EMAIL_ERROR })
      }
    }

    // Find and update the task
    const task = await Task.findByIdAndUpdate(id, { $set: updates }, { new: true })
      .populate("department", "name color")
      .populate("dependencies", "title status")

    if (!task) {
      return res.status(404).json({ error: "Task not found" })
    }

    // Handle assignee manually - SHOW EXISTING ASSIGNEE
    const taskObj = task.toObject()
    
    if (task.assignee) {
      const actualUser = await User.findById(task.assignee).select("name avatar email stillExist")
      
      if (actualUser) {
        const isActive = actualUser.stillExist === 1
        const isBlackhole = isValidOrgEmail(actualUser.email)

        taskObj.assignee = {
          _id: actualUser._id,
          name: actualUser.name,
          avatar: actualUser.avatar,
          email: actualUser.email,
          stillExist: actualUser.stillExist,
          isActive,
          isBlackhole,
          status: !isActive ? 'inactive' : !isBlackhole ? 'non-blackhole' : 'active'
        }
      } else {
        taskObj.assignee = null
      }
    }

    // Emit socket event for real-time updates
    if (req.io) {
      req.io.emit("task:updated", taskObj)
    }

    // Fire-and-forget KARMA signal when task is completed
    if (updates.status === "Completed" && task.assignee) {
      signalTaskCompleted(String(task.assignee)).catch(() => {});
    }

    res.json(taskObj)
  } catch (error) {
    console.error("Error updating task:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Delete task
router.delete("/:id", auth, async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id)

    if (!task) {
      return res.status(404).json({ error: "Task not found" })
    }

    // Clean up associated submissions for deleted task
    const TaskSubmission = require("../models/TaskSubmission")
    await TaskSubmission.deleteMany({ task: req.params.id })

    // Emit socket event for real-time updates
    if (req.io) {
      req.io.emit("task:deleted", req.params.id)
    }

    res.json({ message: "Task deleted successfully" })
  } catch (error) {
    console.error("Error deleting task:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Get task dependencies
router.get("/:id/dependencies", auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate({
      path: "dependencies",
      populate: [
        { path: "department", select: "name color" }
      ],
    })

    if (!task) {
      return res.status(404).json({ error: "Task not found" })
    }

    // Handle assignees in dependencies manually - SHOW EXISTING ASSIGNEES
    const dependenciesWithAssignees = await Promise.all(task.dependencies.map(async (dep) => {
      const depObj = dep.toObject()
      
      if (dep.assignee) {
        const actualUser = await User.findById(dep.assignee).select("name avatar email stillExist")
        
        if (actualUser) {
          const isActive = actualUser.stillExist === 1
          const isBlackhole = isValidOrgEmail(actualUser.email)

          depObj.assignee = {
            _id: actualUser._id,
            name: actualUser.name,
            avatar: actualUser.avatar,
            email: actualUser.email,
            stillExist: actualUser.stillExist,
            isActive,
            isBlackhole,
            status: !isActive ? 'inactive' : !isBlackhole ? 'non-blackhole' : 'active'
          }
        } else {
          depObj.assignee = null
        }
      }
      
      return depObj
    }))

    res.json(dependenciesWithAssignees)
  } catch (error) {
    console.error("Error fetching task dependencies:", error)
    res.status(500).json({ error: "Server error" })
  }
})

module.exports = router