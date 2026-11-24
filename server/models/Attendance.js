const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  date: { 
    type: Date, 
    required: true,
    index: true
  },
  // Biometric data from Excel
  biometricTimeIn: { 
    type: Date,
    index: true
  },
  biometricTimeOut: { 
    type: Date 
  },
  biometricDeviceId: String,
  biometricLocation: String,
  
  // In-app "Start Day" data
  startDayTime: { 
    type: Date,
    index: true
  },
  endDayTime: { 
    type: Date 
  },
  startDayLocation: {
    latitude: Number,
    longitude: Number,
    address: String,
    accuracy: Number
  },
  endDayLocation: {
    latitude: Number,
    longitude: Number,
    address: String,
    accuracy: Number
  },
  
  // Attendance status
  isPresent: { 
    type: Boolean, 
    default: false,
    index: true
  },
  isVerified: {
    type: Boolean,
    default: false,
    index: true
  },
  verificationMethod: {
    type: String,
    enum: ['Biometric', 'StartDay', 'Both', 'Manual', 'Leave'],
    default: 'Manual'
  },
  
  // Time calculations
  hoursWorked: { 
    type: Number, 
    default: 0,
    min: 0,
    max: 24
  },
  overtimeHours: {
    type: Number,
    default: 0,
    min: 0
  },
  breakTime: {
    type: Number,
    default: 0, // in minutes
    min: 0
  },
  // Workday & Monitoring Lifecycle (Milestone 3 - F10, F11)
  monitoringConsent: {
    type: Boolean,
    default: false,
    index: true
  },
  monitoringStatus: {
    type: String,
    enum: ['Active', 'Disconnected / Not Monitored'],
    default: 'Disconnected / Not Monitored',
    index: true
  },
  activeSessionId: {
    type: String,
    default: null
  },
  // Branch - Office location for this attendance
  branch: {
    type: String,
    default: 'blackhole_mumbai',
    index: true,
  },
  
  // Work patterns
  workPattern: {
    type: String,
    enum: ['Regular', 'Flexible', 'Remote', 'Hybrid', 'Night Shift', 'Weekend'],
    default: 'Regular'
  },
  shiftType: {
    type: String,
    enum: ['Morning', 'Evening', 'Night', 'Rotating'],
    default: 'Morning'
  },
  
  // Data sources
  source: { 
    type: String, 
    enum: ['Biometric', 'StartDay', 'Both', 'Manual', 'Leave', 'Holiday'], 
    required: true,
    index: true
  },
  
  // Discrepancies and flags
  hasDiscrepancy: {
    type: Boolean,
    default: false,
    index: true
  },
  discrepancyReason: {
    type: String,
    enum: ['Time Mismatch', 'Location Mismatch', 'Missing Biometric', 'Missing StartDay', 'Late Entry', 'Early Exit'],
    index: true
  },
  discrepancyDetails: {
    timeDifference: Number, // in minutes
    locationDistance: Number, // in meters
    notes: String
  },
  
  // Leave and exceptions
  isLeave: {
    type: Boolean,
    default: false,
    index: true
  },
  leaveType: {
    type: String,
    enum: ['Sick', 'Vacation', 'Personal', 'Emergency', 'Maternity', 'Paternity', 'Holiday']
  },
  leaveReference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Leave'
  },
  
  // Productivity metrics
  productivityScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  tasksCompleted: {
    type: Number,
    default: 0
  },
  meetingsAttended: {
    type: Number,
    default: 0
  },
  
  // AI analysis
  aiAnalysis: {
    attendancePattern: String,
    riskScore: { type: Number, min: 0, max: 100 },
    recommendations: [String],
    anomalyDetected: { type: Boolean, default: false },
    confidenceLevel: { type: Number, min: 0, max: 1 }
  },
  
  // Weather and external factors
  weatherCondition: String,
  trafficCondition: String,
  publicHoliday: { type: Boolean, default: false },
  
  // Approval workflow
  approvalStatus: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Auto-Approved'],
    default: 'Pending',
    index: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  rejectionReason: String,
  
  // Notes and comments
  employeeNotes: {
    type: String,
    maxlength: 500
  },
  managerNotes: {
    type: String,
    maxlength: 500
  },

  // Auto-end day tracking
  autoEnded: {
    type: Boolean,
    default: false,
    index: true
  },
  
  // Midnight span tracking
  spanType: {
    type: String,
    enum: ['NORMAL', 'MIDNIGHT_SPAN'],
    default: 'NORMAL',
    index: true
  },
  spanDetails: {
    startDate: String,
    endDate: String,
    actualHours: Number,
    fixedHours: Number,
    splitRequired: Boolean
  },
  
  // Spam detection and validation
  spamStatus: {
    type: String,
    enum: ['Valid', 'Suspicious', 'Spam', 'Pending Review'],
    default: 'Pending Review',
    index: true
  },
  spamReason: {
    type: String,
    maxlength: 500
  },
  markedAsSpamBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  markedAsSpamAt: Date,
  validatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  validatedAt: Date,
  systemNotes: {
    type: String,
    maxlength: 300
  },

  // Daily progress tracking & missed-progress reason
  dailyProgressCompleted: {
    type: Boolean,
    default: false
  },
  missedProgressReason: {
    type: String,
    maxlength: 500
  },
  missedProgressReasonSubmittedAt: Date,
  progressReminderSent: {
    type: Boolean,
    default: false
  },
  
  // Metadata
  deviceInfo: {
    userAgent: String,
    ipAddress: String,
    deviceType: String
  },
  sessionId: String,
  
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: true
});

// WFH Maximum Hours Cap - ONLY applies to WFH employees
const WFH_MAX_HOURS_PER_DAY = 8;

// Pre-save middleware to calculate hours worked and detect discrepancies
attendanceSchema.pre('save', async function(next) {
  this.updatedAt = Date.now();
  
  // Calculate hours worked
  if (this.biometricTimeIn && this.biometricTimeOut) {
    const timeDiff = this.biometricTimeOut.getTime() - this.biometricTimeIn.getTime();
    this.hoursWorked = Math.max(0, (timeDiff / (1000 * 60 * 60)) - (this.breakTime / 60));
  } else if (this.startDayTime && this.endDayTime) {
    const timeDiff = this.endDayTime.getTime() - this.startDayTime.getTime();
    this.hoursWorked = Math.max(0, (timeDiff / (1000 * 60 * 60)) - (this.breakTime / 60));
  }
  
  // ============================================
  // WFH HOUR CAPPING LOGIC - ONLY FOR WFH EMPLOYEES
  // WFO employees can work unlimited hours (12, 14, 16+)
  // ============================================
  try {
    // Check if this record is for a WFH employee
    const isWFH = this.workPattern === 'Remote' || 
                  (this.populated('user') && this.user?.workMode === 'WFH');
    
    // If user not populated, try to fetch workMode
    if (!isWFH && this.user && !this.populated('user')) {
      const User = require('./User');
      const userDoc = await User.findById(this.user).select('workMode').lean();
      if (userDoc?.workMode === 'WFH') {
        // Apply WFH cap: max 8 hours per calendar day
        if (this.hoursWorked > WFH_MAX_HOURS_PER_DAY) {
          // Store original hours for audit
          this.systemNotes = (this.systemNotes || '') + 
            ` [WFH Cap Applied: ${this.hoursWorked.toFixed(2)}h → ${WFH_MAX_HOURS_PER_DAY}h]`;
          this.hoursWorked = WFH_MAX_HOURS_PER_DAY;
        }
      }
    } else if (isWFH && this.hoursWorked > WFH_MAX_HOURS_PER_DAY) {
      // Apply WFH cap: max 8 hours per calendar day
      this.systemNotes = (this.systemNotes || '') + 
        ` [WFH Cap Applied: ${this.hoursWorked.toFixed(2)}h → ${WFH_MAX_HOURS_PER_DAY}h]`;
      this.hoursWorked = WFH_MAX_HOURS_PER_DAY;
    }
  } catch (err) {
    console.error('Error checking WFH status in pre-save:', err.message);
    // Continue without capping if error occurs
  }
  
  // Calculate overtime (assuming 8 hours is standard)
  // For WFH: overtimeHours will always be 0 due to cap
  // For WFO: overtimeHours can be positive (12h work = 4h overtime)
  this.overtimeHours = Math.max(0, this.hoursWorked - 8);
  
  // Detect discrepancies
  if (this.biometricTimeIn && this.startDayTime) {
    const timeDiff = Math.abs(this.biometricTimeIn.getTime() - this.startDayTime.getTime());
    const timeDiffMinutes = timeDiff / (1000 * 60);
    
    if (timeDiffMinutes > 15) { // 15 minutes threshold
      this.hasDiscrepancy = true;
      this.discrepancyReason = 'Time Mismatch';
      this.discrepancyDetails.timeDifference = timeDiffMinutes;
    }
  }
  
  // Determine verification status
  if (this.biometricTimeIn && this.startDayTime && !this.hasDiscrepancy) {
    this.isVerified = true;
    this.verificationMethod = 'Both';
  } else if (this.biometricTimeIn || this.startDayTime) {
    this.isVerified = true;
    this.verificationMethod = this.biometricTimeIn ? 'Biometric' : 'StartDay';
  }
  
  // Set presence status
  this.isPresent = this.isVerified || this.isLeave;
  
  next();
});

// Compound indexes for efficient queries
attendanceSchema.index({ user: 1, date: -1 });
attendanceSchema.index({ date: 1, isPresent: 1 });
attendanceSchema.index({ user: 1, isVerified: 1, date: -1 });
attendanceSchema.index({ hasDiscrepancy: 1, date: -1 });
attendanceSchema.index({ approvalStatus: 1, date: -1 });

// Virtual for attendance status display
attendanceSchema.virtual('statusDisplay').get(function() {
  if (this.isLeave) return 'On Leave';
  if (this.isPresent && this.isVerified) return 'Present';
  if (this.isPresent && !this.isVerified) return 'Present (Unverified)';
  if (this.hasDiscrepancy) return 'Discrepancy';
  return 'Absent';
});

// Virtual for status color
attendanceSchema.virtual('statusColor').get(function() {
  if (this.isLeave) return '#8b5cf6';
  if (this.isPresent && this.isVerified) return '#10b981';
  if (this.isPresent && !this.isVerified) return '#f59e0b';
  if (this.hasDiscrepancy) return '#ef4444';
  return '#6b7280';
});

// Static method to get attendance statistics
attendanceSchema.statics.getAttendanceStats = async function(startDate, endDate, userId = null) {
  const matchCondition = {
    date: { $gte: startDate, $lte: endDate }
  };
  
  if (userId) {
    // Validate userId format first
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user ID format');
    }
    matchCondition.user = new mongoose.Types.ObjectId(userId);
  }
  
  const stats = await this.aggregate([
    { $match: matchCondition },
    {
      $group: {
        _id: null,
        totalDays: { $sum: 1 },
        presentDays: { $sum: { $cond: ['$isPresent', 1, 0] } },
        verifiedDays: { $sum: { $cond: ['$isVerified', 1, 0] } },
        leaveDays: { $sum: { $cond: ['$isLeave', 1, 0] } },
        discrepancies: { $sum: { $cond: ['$hasDiscrepancy', 1, 0] } },
        totalHours: { $sum: '$hoursWorked' },
        overtimeHours: { $sum: '$overtimeHours' }
      }
    },
    {
      $project: {
        totalDays: 1,
        presentDays: 1,
        verifiedDays: 1,
        leaveDays: 1,
        discrepancies: 1,
        absentDays: { $subtract: ['$totalDays', '$presentDays'] },
        attendanceRate: { 
          $multiply: [
            { $divide: ['$presentDays', '$totalDays'] }, 
            100
          ] 
        },
        verificationRate: {
          $multiply: [
            { $divide: ['$verifiedDays', '$presentDays'] },
            100
          ]
        },
        avgHoursPerDay: { $divide: ['$totalHours', '$presentDays'] },
        totalHours: 1,
        overtimeHours: 1
      }
    }
  ]);
  
  return stats[0] || {};
};

module.exports = mongoose.model('Attendance', attendanceSchema);
