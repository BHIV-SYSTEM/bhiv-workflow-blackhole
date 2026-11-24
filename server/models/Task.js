
// const mongoose = require("mongoose")

// const TaskSchema = new mongoose.Schema({
//   title: {
//     type: String,
//     required: true,
//   },
//   description: {
//     type: String,
//   },
//   department: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Department",
//     required: true,
//   },
//   assignee: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "User",
//     required: true,
//   },
//   priority: {
//     type: String,
//     enum: ["High", "Medium", "Low"],
//     default: "Medium",
//   },
//   status: {
//     type: String,
//     enum: ["Pending", "In Progress", "Completed"],
//     default: "Pending",
//   },
//   dependencies: [{
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Task",
//   }],
//   dueDate: {
//     type: Date,
//   },
//   createdBy: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "User",
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now,
//   },
//   updatedAt: {
//     type: Date,
//     default: Date.now,
//   },
//   notes: {
//     type: String,
//     default: "",
//   },
//   fileType: { type: String }, // New field for MIME type
// })

// // Update the updatedAt field before saving
// TaskSchema.pre("save", function (next) {
//   this.updatedAt = Date.now()
//   next()
// })

// module.exports = mongoose.model("Task", TaskSchema)

const mongoose = require("mongoose")

const TaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: [
      "Submitted",
      "Pending Validation",
      "Approved",
      "Returned",
      "Pending",
      "Pending Admin Assignment",
      "In Progress",
      "Submitted for Review",
      "Completed",
      "Closed"
    ],
    default: "Pending Validation",
  },
  task_id: {
    type: String,
    trim: true,
    index: true,
  },
  sourceType: {
    type: String,
    enum: ["WHATSAPP", "LEAD_INSTRUCTION", "MEETING", "AUTONOMOUS", "OTHER"],
    default: "WHATSAPP",
  },
  originatingPerson: {
    type: String,
    trim: true,
  },
  sourceReference: {
    type: String,
    trim: true,
  },
  originalInstruction: {
    type: String,
  },
  intakeAttachments: [
    {
      filename: String,
      url: String,
      mimeType: String,
      uploadedAt: { type: Date, default: Date.now }
    }
  ],
  scope: {
    type: String,
  },
  expectedOutcome: {
    type: String,
  },
  acceptanceCriteria: [
    {
      type: String,
    }
  ],
  authorizedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  authorizedAt: {
    type: Date,
  },
  authorizationNotes: {
    type: String,
  },
  returnedFeedback: {
    type: String,
  },
  parikshakReviewId: {
    type: String,
  },
  executionStartedAt: {
    type: Date,
  },
  submittedForReviewAt: {
    type: Date,
  },
  closedAt: {
    type: Date,
  },
  priority: {
    type: String,
    enum: ["Low", "Medium", "High"],
    default: "Medium",
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Department",
    required: true,
  },
  assignee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: function () {
      return this.status !== "Pending Admin Assignment";
    },
  },
  dueDate: {
    type: Date,
    required: true,
  },
  dependencies: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
    },
  ],
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  notes: {
    type: String,
  },
  fileType: {
    type: String,
  },
  links: [
    {
      type: String,
    },
  ],
  // Branch - Office location for this task
  branch: {
    type: String,
    default: 'blackhole_mumbai',
    index: true,
  },
  // Product context grounding
  product: {
    type: String,
    trim: true,
    default: 'BHIV',
    index: true,
  },
  // Multi-tenant isolation identifier
  tenantId: {
    type: String,
    default: 'ten-bhiv-core',
    index: true,
  },
  // API Idempotency key to prevent duplicate intake/assignment on network retry
  idempotencyKey: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  // Audit and reconciliation metadata (e.g. SUPERSEDED_DUPLICATE, canonical linkage)
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
});

// Update the updatedAt field before saving
TaskSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Compound indexes for dashboard query performance and duplicate prevention
TaskSchema.index({ assignee: 1, status: 1 });
TaskSchema.index({ department: 1, status: 1, branch: 1 });
TaskSchema.index({ assignee: 1, dueDate: 1, status: 1 });
TaskSchema.index({ branch: 1, status: 1, updatedAt: -1 }); // covering index for paginated completed-tasks sort
TaskSchema.index({ assignee: 1, task_id: 1, tenantId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Task", TaskSchema);


