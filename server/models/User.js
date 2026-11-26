const mongoose = require("mongoose")
const { formatEmployeeId, formatCanonicalEmployeeId } = require("../utils/employeeId")

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ["Admin", "Manager", "User", "Procurement Agent", "Tester"],
    default: "User",
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Department",
  },
  avatar: {
    type: String,
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true, // Allows null values while maintaining uniqueness
  },
  profilePicture: {
    type: String,
  },
  stillExist: {
    type: Number,
    default: 1,
    enum: [0, 1], // 0 = exited, 1 = active
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  monitoringPaused: {
    type: Boolean,
    default: false,
  },
  lastConsentDate: {
    type: Date,
  },
  dataRetentionPeriod: {
    type: Number, // in days
    default: 30,
  },
  // Salary management fields
  employeeId: {
    type: String,
    trim: true,
    index: true,
  },
  // Canonical Employee Identity & Multi-Tenancy
  canonicalEmployeeId: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    index: true,
  },
  tenantId: {
    type: String,
    default: 'ten-bhiv-core',
    index: true,
  },
  organization: {
    type: String,
    default: 'BHIV',
    index: true,
  },
  hourlyRate: {
    type: Number,
    default: 25, // Default hourly rate in USD
  },
  // Password reset fields
  resetPasswordToken: {
    type: String,
  },
  resetPasswordExpires: {
    type: Date,
  },
  // Work Mode - WFH (Work From Home) or WFO (Work From Office)
  // WFH employees have max 8 hours/day cap
  // WFO employees have no hour cap (can work 12, 14, 16+ hours)
  workMode: {
    type: String,
    enum: ['WFH', 'WFO'],
    default: 'WFO', // Default to Work From Office (no cap)
    index: true,
  },
  // Branch - Office location (Mumbai, Pune, etc.)
  branch: {
    type: String,
    default: 'blackhole_mumbai',
    index: true,
  },
  // Desktop Agent (V1) — installation + heartbeat tracking
  agentInstalled: {
    type: Boolean,
    default: false,
    index: true,
  },
  agentLastSeen: {
    type: Date,
    default: null,
  },
  agentVersion: {
    type: String,
    default: null,
  },
})

// Compound indexes for high-frequency queries
UserSchema.index({ stillExist: 1, role: 1 })
UserSchema.index({ department: 1, stillExist: 1 })

// Virtual for formatted employee ID
UserSchema.virtual("formattedEmployeeId").get(function () {
  return this.canonicalEmployeeId || formatEmployeeId(this.email, this.employeeId, this.organization || "BHIV")
})

// Update the updatedAt field and ensure formatted canonicalEmployeeId before saving
UserSchema.pre("save", function (next) {
  this.updatedAt = Date.now()

  // Resolve tenant code for ID formatting
  let tenantCode = "BHIV"
  if (this.organization) {
    tenantCode = this.organization.trim().toUpperCase()
  } else if (this.tenantId) {
    if (this.tenantId.toLowerCase().includes("sips")) {
      tenantCode = "SIPS"
    } else {
      tenantCode = this.tenantId.replace(/^ten-/, "").toUpperCase()
    }
  }

  // Format canonicalEmployeeId if not already set (DO NOT overwrite existing canonicalEmployeeId)
  if (!this.canonicalEmployeeId) {
    const formatted = formatCanonicalEmployeeId(this.email, this.employeeId, tenantCode)
    if (formatted && formatted !== "N/A") {
      this.canonicalEmployeeId = formatted
    }
  }

  // Synchronize legacy employeeId if missing
  if (!this.employeeId && this.canonicalEmployeeId) {
    this.employeeId = this.canonicalEmployeeId
  } else if (!this.employeeId || this.isModified("email")) {
    const formatted = formatEmployeeId(this.email, this.employeeId)
    if (formatted && formatted !== "N/A") {
      this.employeeId = formatted
    }
  }
  next()
})

module.exports = mongoose.model("User", UserSchema)