const mongoose = require('mongoose');

const BROWSER_EXECUTABLES = new Set([
  'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe',
  'opera.exe', 'safari.exe', 'iexplore.exe', 'vivaldi.exe', 'arc.exe',
  'chrome', 'msedge', 'firefox', 'brave', 'opera', 'safari', 'vivaldi', 'arc'
]);

function isBrowserExecutable(appName) {
  if (!appName || typeof appName !== 'string') return false;
  const clean = appName.toLowerCase().trim();
  const base = clean.split(/[/\\]/).pop();
  return BROWSER_EXECUTABLES.has(base) || BROWSER_EXECUTABLES.has(clean);
}

const monitoringAlertSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Tri-state alert severity tier: White (normal), Yellow (attention), Red (human review required)
  tier: {
    type: String,
    enum: ['WHITE', 'YELLOW', 'RED'],
    default: 'YELLOW',
    index: true,
    set: (v) => (v ? String(v).toUpperCase() : 'YELLOW')
  },
  // Deterministic rule identifier (e.g. RULE-NORMAL-001, RULE-ATTENTION-002, RULE-REVIEW-003)
  rule_id: {
    type: String,
    required: true,
    default: function() {
      if (this.tier === 'RED') return 'RULE-REVIEW-001';
      if (this.tier === 'WHITE') return 'RULE-NORMAL-001';
      return 'RULE-ATTENTION-001';
    },
    index: true
  },
  threshold_value: {
    type: mongoose.Schema.Types.Mixed
  },
  observed_value: {
    type: mongoose.Schema.Types.Mixed
  },
  event_reference: {
    type: mongoose.Schema.Types.Mixed
  },
  alert_type: {
    type: String,
    enum: [
      'idle_timeout',
      'unauthorized_website',
      'suspicious_activity',
      'productivity_drop',
      'extended_break',
      'after_hours_activity',
      'application_misuse',
      'task_reminder',
      'aim_reminder',
      'location_discrepancy'
    ],
    required: true,
    index: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  // Status lifecycle: ACTIVE -> EXPLAINED -> RESOLVED (or DISMISSED)
  status: {
    type: String,
    enum: ['ACTIVE', 'EXPLAINED', 'RESOLVED', 'DISMISSED'],
    default: 'ACTIVE',
    index: true,
    set: (v) => {
      if (!v) return 'ACTIVE';
      const s = String(v).toUpperCase();
      if (s === 'ACKNOWLEDGED') return 'EXPLAINED';
      if (s === 'ACTIVE' || s === 'EXPLAINED' || s === 'RESOLVED' || s === 'DISMISSED') return s;
      return 'ACTIVE';
    }
  },
  // Employee explanation workflow
  employee_explanation: {
    type: String,
    default: ''
  },
  explained_at: {
    type: Date
  },
  explanation_status: {
    type: String,
    enum: ['not_submitted', 'pending_review', 'accepted', 'rejected'],
    default: 'not_submitted',
    index: true
  },
  // Admin review & resolution workflow (ZERO automated penalties)
  admin_verdict: {
    type: String,
    enum: ['cleared', 'acknowledged', 'escalated']
  },
  resolution_notes: {
    type: String,
    default: ''
  },
  resolved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolved_at: {
    type: Date
  },
  // Data payload (Strict Privacy Boundary: Zero invasive fields - no screenshot_id, no website_url, no keystroke_id)
  data: {
    idle_duration: Number,
    application_name: String,
    productivity_score: Number,
    activity_data: mongoose.Schema.Types.Mixed,
    trinetra_key: String,
    trinetra_rule: String,
    task_id: String,
    focus_ratio: Number,
    distraction_ratio: Number,
    active_minutes: Number,
    last_activity_at: Date,
    day_started_at: Date,
    stalled_hours: Number,
    overdue_hours: Number,
    due_date: Date
  },
  threshold_config: {
    idle_threshold: Number,
    productivity_threshold: Number,
    custom_rules: mongoose.Schema.Types.Mixed
  },
  acknowledged_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  acknowledged_at: Date,
  auto_generated: {
    type: Boolean,
    default: true
  },
  notification_sent: {
    type: Boolean,
    default: false
  },
  notification_channels: [{
    type: String,
    enum: ['email', 'webhook', 'dashboard', 'sms']
  }],
  session_id: {
    type: String,
    index: true
  },
  related_task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }
}, {
  timestamps: true,
  collection: 'monitoring_alerts'
});

// Guard: Browser executables alone must NEVER trigger misconduct alerts
monitoringAlertSchema.pre('validate', function(next) {
  const targetApp = (this.data && this.data.application_name) || (typeof this.observed_value === 'string' ? this.observed_value : null);
  if (isBrowserExecutable(targetApp)) {
    if (['application_misuse', 'unauthorized_website', 'suspicious_activity'].includes(this.alert_type)) {
      return next(new Error(`Strict Guard Violation: Browser executable "${targetApp}" alone cannot trigger misconduct alert.`));
    }
  }

  // Auto-align tier if severity was provided without tier
  if (!this.tier || this.tier === 'YELLOW') {
    if (this.severity === 'critical' || this.severity === 'high') {
      this.tier = 'RED';
    } else if (this.severity === 'low') {
      this.tier = 'WHITE';
    }
  }

  next();
});

// Compound indexes for efficient queries
monitoringAlertSchema.index({ employee: 1, timestamp: -1 });
monitoringAlertSchema.index({ employee: 1, status: 1 });
monitoringAlertSchema.index({ tier: 1, status: 1 });
monitoringAlertSchema.index({ alert_type: 1, severity: 1 });
monitoringAlertSchema.index({ status: 1, timestamp: -1 });
monitoringAlertSchema.index({ timestamp: 1 }, { expireAfterSeconds: 15552000 }); // 180 days retention

// Virtual for alert age
monitoringAlertSchema.virtual('age_minutes').get(function() {
  return Math.floor((Date.now() - this.timestamp.getTime()) / (1000 * 60));
});

// Static method to get active alerts
monitoringAlertSchema.statics.getActiveAlerts = async function(employeeId = null, severity = null) {
  const query = { status: { $in: ['ACTIVE', 'EXPLAINED'] } };
  
  if (employeeId) {
    query.employee = new mongoose.Types.ObjectId(employeeId);
  }
  
  if (severity) {
    query.severity = severity;
  }
  
  return this.find(query)
    .populate('employee', 'name email department')
    .populate('acknowledged_by', 'name email')
    .sort({ timestamp: -1 });
};

// Static method to get alert statistics
monitoringAlertSchema.statics.getAlertStats = async function(employeeId, startDate, endDate) {
  const matchQuery = {
    timestamp: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  };
  
  if (employeeId) {
    matchQuery.employee = new mongoose.Types.ObjectId(employeeId);
  }
  
  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: {
          tier: "$tier",
          type: "$alert_type",
          severity: "$severity"
        },
        count: { $sum: 1 },
        avgResolutionTime: {
          $avg: {
            $cond: [
              { $ne: ["$resolved_at", null] },
              { $subtract: ["$resolved_at", "$timestamp"] },
              null
            ]
          }
        }
      }
    },
    {
      $group: {
        _id: "$_id.tier",
        typeBreakdown: {
          $push: {
            type: "$_id.type",
            severity: "$_id.severity",
            count: "$count",
            avgResolutionTime: "$avgResolutionTime"
          }
        },
        totalCount: { $sum: "$count" }
      }
    }
  ]);
};

// Instance method to acknowledge alert
monitoringAlertSchema.methods.acknowledge = function(userId, notes = '') {
  this.status = 'EXPLAINED';
  this.acknowledged_by = userId;
  this.acknowledged_at = new Date();
  if (notes) {
    this.resolution_notes = notes;
  }
  return this.save();
};

// Instance method to resolve alert
monitoringAlertSchema.methods.resolve = function(userId, notes = '', verdict = 'acknowledged') {
  this.status = 'RESOLVED';
  this.resolved_by = userId;
  this.resolved_at = new Date();
  this.admin_verdict = verdict;
  if (notes) {
    this.resolution_notes = notes;
  }
  return this.save();
};

// Static method to create alert with duplicate check and strict browser executable guard
monitoringAlertSchema.statics.createAlert = async function(alertData) {
  const targetApp = (alertData.data && alertData.data.application_name) ||
    (typeof alertData.observed_value === 'string' ? alertData.observed_value : null);

  // Strict guard: Browser executables alone must NEVER trigger misconduct alerts
  if (isBrowserExecutable(targetApp) && ['application_misuse', 'unauthorized_website', 'suspicious_activity'].includes(alertData.alert_type)) {
    console.warn(`[MonitoringAlert] Exemption guard: Browser executable "${targetApp}" alone cannot trigger misconduct alerts.`);
    return null;
  }

  // Check for duplicate alerts in the last 5 minutes
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  
  const existingAlert = await this.findOne({
    employee: alertData.employee,
    alert_type: alertData.alert_type,
    status: { $in: ['ACTIVE', 'EXPLAINED'] },
    timestamp: { $gte: fiveMinutesAgo }
  });
  
  if (existingAlert) {
    // Update existing alert instead of creating duplicate
    existingAlert.timestamp = new Date();
    existingAlert.data = { ...existingAlert.data, ...alertData.data };
    if (alertData.observed_value !== undefined) {
      existingAlert.observed_value = alertData.observed_value;
    }
    return existingAlert.save();
  }
  
  return this.create(alertData);
};

module.exports = mongoose.model('MonitoringAlert', monitoringAlertSchema);
module.exports.isBrowserExecutable = isBrowserExecutable;
module.exports.BROWSER_EXECUTABLES = BROWSER_EXECUTABLES;
