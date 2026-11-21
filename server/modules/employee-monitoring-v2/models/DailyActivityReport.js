/**
 * Employee Monitoring V2 - DailyActivityReport Model
 * 
 * Persists compiled daily activity reports generated upon End Day.
 * STRICT PRIVACY & INTEGRITY:
 * Stores aggregated attendance hours, monitored hours, active input hours,
 * hardware idle hours, break hours, and application category breakdowns.
 * Zero keystroke text, zero URLs, zero private titles.
 */

const mongoose = require('mongoose');

const categoryBreakdownSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  durationSeconds: {
    type: Number,
    default: 0,
    min: 0
  },
  durationHours: {
    type: Number,
    default: 0,
    min: 0
  },
  percentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  sliceCount: {
    type: Number,
    default: 0,
    min: 0
  }
}, { _id: false });

const dailyActivityReportSchema = new mongoose.Schema({
  reportId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: String, // 'YYYY-MM-DD'
    required: true,
    index: true
  },
  totalAttendanceHours: {
    type: Number,
    default: 0,
    min: 0
  },
  monitoredHours: {
    type: Number,
    default: 0,
    min: 0
  },
  activeInputHours: {
    type: Number,
    default: 0,
    min: 0
  },
  hardwareIdleHours: {
    type: Number,
    default: 0,
    min: 0
  },
  breakHours: {
    type: Number,
    default: 0,
    min: 0
  },
  categories: [categoryBreakdownSchema],
  telemetrySliceCount: {
    type: Number,
    default: 0,
    min: 0
  },
  attendanceRecord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Attendance',
    default: null
  },
  generatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'monitoring_v2_daily_reports'
});

dailyActivityReportSchema.index({ employee: 1, date: 1 }, { unique: true });

module.exports = mongoose.models.DailyActivityReport || mongoose.model('DailyActivityReport', dailyActivityReportSchema);
