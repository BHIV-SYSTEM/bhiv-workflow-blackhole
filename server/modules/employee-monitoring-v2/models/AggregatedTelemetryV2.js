/**
 * Employee Monitoring V2 - AggregatedTelemetryV2 Model
 * 
 * 1-minute rolled-up telemetry slices.
 * STRICT PRIVACY-BY-DESIGN:
 * Stores ONLY aggregate counters and work application categories.
 * Zero raw keystrokes, zero screenshots, zero private window titles.
 */

const mongoose = require('mongoose');
const { CATEGORIES } = require('../config/constants');

const aggregatedTelemetryV2Schema = new mongoose.Schema({
  session_id: {
    type: String,
    required: true,
    index: true
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  device_id: {
    type: String,
    required: true,
    index: true
  },
  minute_timestamp: {
    type: Date,
    required: true,
    index: true // Rounded to the nearest minute start (00 seconds)
  },
  duration_seconds: {
    type: Number,
    default: 60,
    min: 1,
    max: 60
  },
  activity_counts: {
    key_presses: { type: Number, default: 0, min: 0 },
    mouse_events: { type: Number, default: 0, min: 0 },
    scroll_events: { type: Number, default: 0, min: 0 },
    hardware_idle_seconds: { type: Number, default: 0, min: 0, max: 60 }
  },
  primary_category: {
    type: String,
    enum: Object.values(CATEGORIES),
    default: CATEGORIES.NEUTRAL,
    index: true
  },
  task_id: {
    type: String,
    default: null
  },
  focus_score: {
    type: Number,
    min: 0,
    max: 100,
    default: 50
  },
  sync_type: {
    type: String,
    enum: ['REALTIME', 'OFFLINE_BUFFERED'],
    default: 'REALTIME'
  }
}, {
  timestamps: true,
  collection: 'monitoring_v2_telemetry'
});

aggregatedTelemetryV2Schema.index({ employee: 1, minute_timestamp: -1 });
aggregatedTelemetryV2Schema.index({ session_id: 1, minute_timestamp: 1 });
// Strict 90-day retention index
aggregatedTelemetryV2Schema.index({ minute_timestamp: 1 }, { expireAfterSeconds: 7776000 });

module.exports = mongoose.models.MonitoringV2Telemetry || mongoose.model('MonitoringV2Telemetry', aggregatedTelemetryV2Schema);
