const mongoose = require('mongoose');

const employeeActivitySchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  keystroke_count: {
    type: Number,
    default: 0
  },
  mouse_activity_score: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  // Raw cursor/click/wheel events in this interval. The score alone saturates
  // and cannot show actual movement, so TRINETRA keeps the count too.
  mouse_event_count: {
    type: Number,
    default: 0,
    min: 0
  },
  // Mouse events per minute for this interval (companion to keystroke_cadence).
  mouse_cadence: {
    type: Number,
    default: undefined
  },
  idle_duration: {
    type: Number, // in seconds
    default: 0
  },
  // Duration this sample represents. Without it, "time per app" cannot be derived
  // from 30s telemetry, so TRINETRA reads it (falls back to 30 when absent).
  interval_seconds: {
    type: Number,
    default: 30,
    min: 1
  },
  active_application: {
    name: String,
    title: String,
    url: String
  },
  // TRINETRA attribution (optional on legacy rows).
  task_id: {
    type: String,
    index: true
  },
  app_category: {
    type: String,
    enum: ['FOCUS', 'DOCUMENTATION', 'COMMUNICATION', 'SUPPORT', 'DISTRACTION', 'NEUTRAL', 'SYSTEM'],
    default: undefined
  },
  keystroke_cadence: {
    type: Number, // keystrokes per minute for this interval
    default: undefined
  },
  productivity_score: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  session_id: {
    type: String,
    required: true,
    index: true
  },
  work_hours: {
    start: Date,
    end: Date
  },
  metadata: {
    screen_resolution: String,
    os_info: String,
    browser_info: String
  }
}, {
  timestamps: true,
  collection: 'employee_activities'
});

// Compound indexes for efficient queries
employeeActivitySchema.index({ employee: 1, timestamp: -1 });
employeeActivitySchema.index({ employee: 1, session_id: 1 });
employeeActivitySchema.index({ employee: 1, task_id: 1, timestamp: -1 });
employeeActivitySchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 }); // 90 days retention

// Virtual for date grouping
employeeActivitySchema.virtual('date').get(function() {
  return this.timestamp.toISOString().split('T')[0];
});

// Static method to get activity summary
employeeActivitySchema.statics.getActivitySummary = async function(employeeId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        employee: new mongoose.Types.ObjectId(employeeId),
        timestamp: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      }
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }
        },
        totalKeystroke: { $sum: "$keystroke_count" },
        avgMouseActivity: { $avg: "$mouse_activity_score" },
        totalIdleTime: { $sum: "$idle_duration" },
        avgProductivityScore: { $avg: "$productivity_score" },
        activityCount: { $sum: 1 }
      }
    },
    {
      $sort: { "_id.date": 1 }
    }
  ]);
};

// Instance method to calculate productivity score (scaled to sample interval_seconds)
employeeActivitySchema.methods.calculateProductivityScore = function() {
  let idleSec = this.idle_duration || 0;
  if (idleSec > 10000) idleSec = Math.round(idleSec / 1000);
  const keys = this.keystroke_count || 0;
  const mouse = this.mouse_activity_score || 0;
  const mouseEvents = this.mouse_event_count || 0;
  const sampleSec = (this.interval_seconds && this.interval_seconds >= 1 && this.interval_seconds <= 120)
    ? this.interval_seconds
    : 30;
  const hasInput = keys > 0 || mouse > 0 || mouseEvents > 0;

  // Truly idle only when no input AND system idle >= 30s
  if (!hasInput && idleSec >= 30) {
    this.productivity_score = 0;
    return 0;
  }

  const isDistraction = String(this.app_category || '').toUpperCase() === 'DISTRACTION';
  const baseCredit = isDistraction ? 15 : 55;
  const keyCadencePerMin = (keys / sampleSec) * 60;
  const keyBonus = Math.min(1, keyCadencePerMin / 120) * 30;
  const effectiveMouseScore = mouse > 0
    ? Math.min(100, mouse)
    : (mouseEvents > 0 ? Math.min(100, Math.round((((mouseEvents / sampleSec) * 60) / 240) * 100)) : 0);
  const mouseBonus = (effectiveMouseScore / 100) * 15;

  this.productivity_score = Math.min(100, Math.round(baseCredit + keyBonus + mouseBonus));
  return this.productivity_score;
};

module.exports = mongoose.model('EmployeeActivity', employeeActivitySchema);
