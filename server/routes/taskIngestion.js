/**
 * taskIngestion.js — Automated Engineering Task Ingestion API Routes
 */

const express = require("express");
const multer = require("multer");
const router = express.Router();
const { processTaskIngestion } = require("../services/taskIngestionService");
const Task = require("../models/Task");
const Notification = require("../models/Notification");

// Multer memory storage configuration for document upload processing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tasks/ingest/supported-formats
// Lists supported file upload formats and ingestion capabilities
// ─────────────────────────────────────────────────────────────────────────────
router.get("/supported-formats", (req, res) => {
  return res.json({
    ok: true,
    supportedFormats: [
      { format: "PDF", extension: ".pdf", mimeType: "application/pdf" },
      { format: "DOCX", extension: ".docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      { format: "Markdown", extension: ".md", mimeType: "text/markdown" },
      { format: "Plain Text", extension: ".txt", mimeType: "text/plain" },
    ],
    features: [
      "AI Cleaning & Noise Reduction",
      "Canonical Task Packet Generation",
      "Automatic Candidate Detection & Assignee Matching",
      "Dependency Validation",
      "Automated NIYANTRAN Task Creation",
      "Candidate Notification",
      "Provenance Preservation",
    ],
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/tasks/ingest
// File upload document ingestion endpoint (PDF, DOCX, MD, TXT)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", upload.any(), async (req, res) => {
  try {
    let fileBuffer;
    let filename = "task_packet.txt";
    let mimeType = "text/plain";

    const uploadedFile = (req.files && req.files.length > 0) 
      ? (req.files.find((f) => f.fieldname === "taskFile" || f.fieldname === "document" || f.fieldname === "file") || req.files[0])
      : req.file;

    if (uploadedFile) {
      fileBuffer = uploadedFile.buffer;
      filename = uploadedFile.originalname;
      mimeType = uploadedFile.mimetype;
    } else if (req.body.taskText || req.body.content) {
      fileBuffer = Buffer.from(req.body.taskText || req.body.content, "utf-8");
      filename = req.body.filename || "pasted_task_packet.md";
      mimeType = req.body.mimeType || "text/markdown";
    } else {
      return res.status(400).json({
        ok: false,
        error: "NO_DOCUMENT_PROVIDED",
        message: "Please attach a task document file (PDF/DOCX/MD/TXT) or provide taskText in body.",
      });
    }

    const metadata = {
      filename,
      mimeType,
      requireApproval: req.body.requireApproval === "true" || req.body.requireApproval === true,
      branch: req.headers["x-branch"] || req.body.branch || "blackhole_mumbai",
      tenantId: req.headers["x-tenant-id"] || req.body.tenantId || "ten-bhiv-core",
      creatorId: req.user ? req.user._id : null,
      assignee: req.body.assignee || null,
      department: req.body.department || null,
      product: (req.body.product || req.body.productId || req.body.product_id || "BHIV").toString().trim().toUpperCase() || "BHIV",
      task_id: (req.body.task_id || req.body.taskId || "").toString().trim() || null,
      content: req.body.content || req.body.taskText || req.body.description || null,
      taskText: req.body.taskText || req.body.content || req.body.description || null,
      description: req.body.description || req.body.content || req.body.taskText || null,
      title: req.body.title || req.body.taskTitle || null,
    };

    delete require.cache[require.resolve("../services/taskIngestionService")];
    const { processTaskIngestion } = require("../services/taskIngestionService");
    const result = await processTaskIngestion(fileBuffer, metadata);

    return res.json(result);
  } catch (error) {
    console.error("[TASK-INGESTION-ROUTE] Ingestion Failed:", error.message);
    
    // Return 400 for unreadable, empty, or malformed input documents
    const isMalformedInput = error.message.includes("DOCUMENT_INGESTION_FAILED") || 
                             error.message.includes("MALFORMED") ||
                             error.message.includes("NO_READABLE_TEXT");
                             
    return res.status(isMalformedInput ? 400 : 500).json({
      ok: false,
      error: isMalformedInput ? "MALFORMED_DOCUMENT_REJECTED" : "INGESTION_PROCESSING_FAILED",
      message: error.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/tasks/ingest/approve/:taskId
// Optional administrative approval route before task publishing
// ─────────────────────────────────────────────────────────────────────────────
router.post("/approve/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        ok: false,
        error: "TASK_NOT_FOUND",
        message: `Task ${taskId} not found.`,
      });
    }

    task.status = "Pending"; // Published to candidate
    task.notes = (task.notes || "") + `\nApproved by Administrator at ${new Date().toISOString()}`;
    await task.save();

    // Trigger candidate notification upon publish
    if (task.assignee) {
      await Notification.create({
        user: task.assignee,
        title: "Task Approved & Published",
        message: `Task '${task.title}' has been approved by admin and published for execution.`,
        type: "Task Assignment",
        relatedId: task._id,
      });
    }

    return res.json({
      ok: true,
      status: "TASK_APPROVED_AND_PUBLISHED",
      taskId: task._id,
      task,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "APPROVAL_FAILED",
      message: error.message,
    });
  }
});

module.exports = router;
