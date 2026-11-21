const mongoose = require('mongoose');

const dailyAttendanceSchema = new mongoose.Schema({
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
  
  // Start Day Information
  startDayTime: { 
    type: Date,
    index: true
  },
  startDayLocation: {
    latitude: Number,
    longitude: Number,
    address: String,
    accuracy: Number
  },
  startDayDevice: {
    userAgent: String,
    ipAddress: String,
    deviceType: String
  },
  
  // End Day Information
  endDayTime: { 
    type: Date 
  },
  endDayLocation: {
    latitude: Number,
    longitude: Number,
    address: String,
    accuracy: Number
  },
  endDayDevice: {
    userAgent: String,
    ipAddress: String,
    deviceType: String
  },
  
  // Biometric Data (from Excel uploads)
  biometricTimeIn: { 
    type: Date,
    index: true
  },
  biometricTimeOut: { 
    type: Date 
  },
  biometricDeviceId: String,
  biometricLocation: String,
  
  // Calculated Working Hours
  totalHoursWorked: { 
    type: Number, 
    default: 0,
    min: 0,
    max: 24
  },
  regularHours: {
    type: Number,
    default: 0,
    min: 0,
    max: 8
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
  
  // Status and Verification
  status: {
    type: String,
    enum: ['Present', 'Absent', 'Half Day', 'Late', 'On Leave', 'Holiday'],
    default: 'Absent',
    index: true
  },
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
    enum: ['StartDay', 'Biometric', 'Both', 'Manual', 'Leave'],
    default: 'Manual'
  },
  
  // Discrepancies
  hasDiscrepancy: {
    type: Boolean,
    default: false,
    index: true
  },
  discrepancyType: {
    type: String,
    enum: ['Time Mismatch', 'Location Mismatch', 'Missing Data', 'Late Entry', 'Early Exit'],
    index: true
  },
  discrepancyDetails: {
    timeDifference: Number, // in minutes
    locationDistance: Number, // in meters
    description: String
  },
  
  // Leave Information
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
  
  // Productivity and Performance
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
  
  // Salary Calculation Data
  dailyWage: {
    type: Number,
    default: 0
  },
  earnedAmount: {
    type: Number,
    default: 0
  },
  bonusAmount: {
    type: Number,
    default: 0
  },
  deductionAmount: {
    type: Number,
    default: 0
  },
  
  // Auto-end day tracking
  autoEnded: {
    type: Boolean,
    default: false,
    index: true
  },
  maxWorkingHours: {
    type: Number,
    default: 8
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
  
  // Aim Completion Tracking
  dailyAimCompleted: {
    type: Boolean,
    default: false
  },
  aimCompletionStatus: {
    type: String,
    enum: ['Pending', 'Completed', 'MVP Achieved', 'Not Set'],
    default: 'Not Set'
  },
  aimCompletionComment: {
    type: String,
    maxlength: 500
  },
  
  // Work Location Type
  workLocationType: {
    type: String,
    enum: ['Office', 'Home', 'Remote', 'Hybrid'],
    default: 'Office',
    index: true
  },
  
  // Separate hours tracking for office and remote work
  officeHours: {
    type: Number,
    default: 0,
    min: 0,
    max: 24
  },
  remoteHours: {
    type: Number,
    default: 0,
    min: 0,
    max: 24
  },
  
  // Progress Completion Tracking
  dailyProgressCompleted: {
    type: Boolean,
    default: false
  },
  
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
  systemNotes: {
    type: String,
    maxlength: 300
  },
  
  // Metadata
  source: { 
    type: String, 
    enum: ['StartDay', 'Biometric', 'Both', 'Manual', 'Leave', 'Holiday'], 
    required: true,
    index: true
  },
  
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

// Pre-save middleware to calculate hours and detect discrepancies
dailyAttendanceSchema.pre('save', async function(next) {
  this.updatedAt = Date.now();
  
  // Calculate total hours worked
  let startTime = null;
  let endTime = null;
  
  // Prioritize biometric data if available
  if (this.biometricTimeIn && this.biometricTimeOut) {
    startTime = this.biometricTimeIn;
    endTime = this.biometricTimeOut;
    this.verificationMethod = this.startDayTime ? 'Both' : 'Biometric';
  } else if (this.startDayTime && this.endDayTime) {
    startTime = this.startDayTime;
    endTime = this.endDayTime;
    this.verificationMethod = this.biometricTimeIn ? 'Both' : 'StartDay';
  }
  
  if (startTime && endTime) {
    const timeDiff = endTime.getTime() - startTime.getTime();
    let totalHours = Math.max(0, (timeDiff / (1000 * 60 * 60)) - (this.breakTime / 60));
    
    // ============================================
    // WFH HOUR CAPPING LOGIC - ONLY FOR WFH EMPLOYEES
    // WFO employees can work unlimited hours (12, 14, 16+)
    // ============================================
    let isWFH = false;
    try {
      // Check if work location type indicates WFH
      if (this.workLocationType === 'Home' || this.workLocationType === 'Remote') {
        isWFH = true;
      }
      
      // Also check user's workMode setting
      if (!isWFH && this.user && !this.populated('user')) {
        const User = require('./User');
        const userDoc = await User.findById(this.user).select('workMode').lean();
        if (userDoc?.workMode === 'WFH') {
          isWFH = true;
        }
      } else if (this.populated('user') && this.user?.workMode === 'WFH') {
        isWFH = true;
      }
      
      // Apply WFH cap if applicable
      if (isWFH && totalHours > WFH_MAX_HOURS_PER_DAY) {
        // Store original hours for audit
        this.systemNotes = (this.systemNotes || '') + 
          ` [WFH Cap Applied: ${totalHours.toFixed(2)}h → ${WFH_MAX_HOURS_PER_DAY}h]`;
        totalHours = WFH_MAX_HOURS_PER_DAY;
      }
    } catch (err) {
      console.error('Error checking WFH status in DailyAttendance pre-save:', err.message);
      // Continue without capping if error occurs
    }
    
    this.totalHoursWorked = Math.round(totalHours * 100) / 100;
    this.regularHours = Math.min(totalHours, 8);
    // For WFH: overtimeHours will always be 0 due to cap
    // For WFO: overtimeHours can be positive (12h work = 4h overtime)
    this.overtimeHours = Math.max(0, totalHours - 8);
    
    // Allocate hours based on work location type
    if (this.workLocationType === 'Office') {
      this.officeHours = this.totalHoursWorked;
      this.remoteHours = 0;
    } else if (this.workLocationType === 'Home' || this.workLocationType === 'Remote') {
      this.remoteHours = this.totalHoursWorked;
      this.officeHours = 0;
    } else if (this.workLocationType === 'Hybrid') {
      // For hybrid, check if biometric data exists (indicates office presence)
      if (this.biometricTimeIn && this.biometricTimeOut) {
        const biometricDiff = this.biometricTimeOut.getTime() - this.biometricTimeIn.getTime();
        const biometricHours = Math.max(0, (biometricDiff / (1000 * 60 * 60)) - (this.breakTime / 60));
        this.officeHours = Math.round(biometricHours * 100) / 100;
        this.remoteHours = Math.round((this.totalHoursWorked - biometricHours) * 100) / 100;
      } else {
        // Default split for hybrid if no biometric data
        this.officeHours = 0;
        this.remoteHours = this.totalHoursWorked;
      }
    }
    
    // Set presence status
    this.isPresent = true;
    this.isVerified = true;
    
    // Determine status based on hours worked
    if (totalHours >= 8) {
      this.status = 'Present';
    } else if (totalHours >= 4) {
      this.status = 'Half Day';
    } else if (totalHours > 0) {
      this.status = 'Present'; // Short day but present
    }
  }
  
  // Detect discrepancies between biometric and start day data
  if (this.biometricTimeIn && this.startDayTime) {
    const timeDiff = Math.abs(this.biometricTimeIn.getTime() - this.startDayTime.getTime());
    const timeDiffMinutes = timeDiff / (1000 * 60);
    
    if (timeDiffMinutes > 15) { // 15 minutes threshold
      this.hasDiscrepancy = true;
      this.discrepancyType = 'Time Mismatch';
      this.discrepancyDetails.timeDifference = timeDiffMinutes;
      this.discrepancyDetails.description = `Time difference of ${Math.round(timeDiffMinutes)} minutes between biometric and start day data`;
    }
  }
  
  // Calculate daily wage if not set
  if (!this.dailyWage && this.totalHoursWorked > 0) {
    // This should be calculated based on user's salary information
    // For now, using a default calculation
    this.dailyWage = 258; // Default daily wage
    this.earnedAmount = (this.totalHoursWorked / 8) * this.dailyWage;
  }
  
  // Set leave status
  if (this.isLeave) {
    this.status = 'On Leave';
    this.isPresent = false;
    this.isVerified = true;
    this.verificationMethod = 'Leave';
  }
  
  next();
});

// Compound indexes for efficient queries
dailyAttendanceSchema.index({ user: 1, date: -1 });
dailyAttendanceSchema.index({ date: 1, isPresent: 1 });
dailyAttendanceSchema.index({ user: 1, isVerified: 1, date: -1 });
dailyAttendanceSchema.index({ hasDiscrepancy: 1, date: -1 });
dailyAttendanceSchema.index({ approvalStatus: 1, date: -1 });

// Virtual for status display
dailyAttendanceSchema.virtual('statusDisplay').get(function() {
  if (this.isLeave) return 'On Leave';
  if (this.isPresent && this.isVerified) return 'Present';
  if (this.isPresent && !this.isVerified) return 'Present (Unverified)';
  if (this.hasDiscrepancy) return 'Discrepancy';
  return 'Absent';
});

// Virtual for status color
dailyAttendanceSchema.virtual('statusColor').get(function() {
  if (this.isLeave) return '#8b5cf6';
  if (this.isPresent && this.isVerified) return '#10b981';
  if (this.isPresent && !this.isVerified) return '#f59e0b';
  if (this.hasDiscrepancy) return '#ef4444';
  return '#6b7280';
});

// Static method to get attendance statistics
dailyAttendanceSchema.statics.getAttendanceStats = async function(startDate, endDate, userId = null) {
  const matchCondition = {
    date: { $gte: startDate, $lte: endDate }
  };
  
  if (userId) {
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
        totalHours: { $sum: '$totalHoursWorked' },
        overtimeHours: { $sum: '$overtimeHours' },
        totalEarnings: { $sum: '$earnedAmount' }
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
        overtimeHours: 1,
        totalEarnings: 1
      }
    }
  ]);
  
  return stats[0] || {};
};

// Method to calculate monthly salary
dailyAttendanceSchema.statics.calculateMonthlySalary = async function(userId, year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  
  const attendanceRecords = await this.find({
    user: userId,
    date: { $gte: startDate, $lte: endDate }
  });
  
  const totalDays = attendanceRecords.length;
  const presentDays = attendanceRecords.filter(record => record.isPresent).length;
  const totalHours = attendanceRecords.reduce((sum, record) => sum + record.totalHoursWorked, 0);
  const totalEarnings = attendanceRecords.reduce((sum, record) => sum + record.earnedAmount, 0);
  const overtimeHours = attendanceRecords.reduce((sum, record) => sum + record.overtimeHours, 0);
  const officeHours = attendanceRecords.reduce((sum, record) => sum + (record.officeHours || 0), 0);
  const remoteHours = attendanceRecords.reduce((sum, record) => sum + (record.remoteHours || 0), 0);
  
  const user = await mongoose.model('User').findById(userId).select('hourlyRate').lean();
  const userHourlyRate = user?.hourlyRate || 25;
  const overtimePay = Math.round(overtimeHours * userHourlyRate * 1.5 * 100) / 100;
  const regularPay = Math.round((totalEarnings - overtimePay) * 100) / 100;

  return {
    period: { year, month, startDate, endDate },
    attendance: {
      totalDays,
      presentDays,
      absentDays: totalDays - presentDays,
      attendanceRate: totalDays > 0 ? (presentDays / totalDays) * 100 : 0
    },
    hours: {
      totalHours: Math.round(totalHours * 100) / 100,
      regularHours: Math.round((totalHours - overtimeHours) * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      officeHours: Math.round(officeHours * 100) / 100,
      remoteHours: Math.round(remoteHours * 100) / 100,
      avgHoursPerDay: presentDays > 0 ? Math.round((totalHours / presentDays) * 100) / 100 : 0
    },
    salary: {
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      regularPay,
      overtimePay
    }
  };
};

// Method to get work location breakdown
dailyAttendanceSchema.statics.getWorkLocationBreakdown = async function(userId, startDate, endDate) {
  const matchCondition = {
    user: userId,
    date: { $gte: startDate, $lte: endDate },
    isPresent: true
  };
  
  const breakdown = await this.aggregate([
    { $match: matchCondition },
    {
      $group: {
        _id: '$workLocationType',
        totalDays: { $sum: 1 },
        totalHours: { $sum: '$totalHoursWorked' },
        officeHours: { $sum: '$officeHours' },
        remoteHours: { $sum: '$remoteHours' },
        regularHours: { $sum: '$regularHours' },
        overtimeHours: { $sum: '$overtimeHours' }
      }
    }
  ]);
  
  return breakdown;
};

module.exports = mongoose.model('DailyAttendance', dailyAttendanceSchema);