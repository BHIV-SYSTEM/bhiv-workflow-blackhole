const mongoose = require("mongoose")
const { formatEmployeeId } = require("../utils/employeeId")

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
  // Parikshak — tracks user's current position in the task graph
  currentParikshakTaskId: {
    type: String,
    default: null,
  },
})

// Compound indexes for high-frequency queries
UserSchema.index({ stillExist: 1, role: 1 })
UserSchema.index({ department: 1, stillExist: 1 })

// Virtual for formatted employee ID
UserSchema.virtual("formattedEmployeeId").get(function () {
  return formatEmployeeId(this.email, this.employeeId)
})

// Update the updatedAt field and ensure formatted employeeId before saving
UserSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  if (!this.employeeId || this.isModified("email")) {
    const formatted = formatEmployeeId(this.email, this.employeeId)
    if (formatted && formatted !== "N/A") {
      this.employeeId = formatted
    }
  }
  next()
})

module.exports = mongoose.model("User", UserSchema)