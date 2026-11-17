/**
 * Employee Monitoring V2 - MonitoringSessionV2 Model
 * 
 * Master record of a monitoring work session, lease state, active device ownership,
 * and handoff history.
 * 
 * STRICT ATTENDANCE ISOLATION:
 * This model governs telemetry leases and monitoring presence ONLY.
 * It does NOT clock employees in/out, modify HR Attendance, or calculate salary deductions.
 */

const mongoose = require('mongoose');
const { SESSION_STATES, DEVICE_MODES } = require('../config/constants');

const monitoringSessionV2Schema = new mongoose.Schema({
  session_id: {
    type: String,
    required: true,
    unique: true,
    index: true // e.g., "v2_sess_<uuid>_<timestamp>"
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: String,
    required: true, // "YYYY-MM-DD" local timezone key
    index: true
  },
  mode: {
    type: String,
    enum: Object.values(DEVICE_MODES),
    required: true,
    default: DEVICE_MODES.LAPTOP_PC
  },
  active_device: {
    type: String,
    ref: 'MonitoringV2Device',
    required: function() { return this.mode === DEVICE_MODES.LAPTOP_PC; }
  },
  state: {
    type: String,
    enum: Object.values(SESSION_STATES),
    default: SESSION_STATES.ACTIVE,
    index: true
  },
  lease_expires_at: {
    type: Date,
    required: true
  },
  active_task_id: {
    type: String,
    default: null,
    index: true
  },
  accumulated_seconds: {
    active: { type: Number, default: 0 },
    focused_work: { type: Number, default: 0 },
    idle: { type: Number, default: 0 },
    paused: { type: Number, default: 0 }
  },
  handoff_history: [{
    from_device: String,
    to_device: String,
    transferred_at: { type: Date, default: Date.now },
    transfer_reason: String
  }],
  started_at: {
    type: Date,
    default: Date.now
  },
  ended_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  collection: 'monitoring_v2_sessions'
});

monitoringSessionV2Schema.index({ employee: 1, date: 1 });
monitoringSessionV2Schema.index({ state: 1, lease_expires_at: 1 });
// Auto-expire session documents after 180 days
monitoringSessionV2Schema.index({ started_at: 1 }, { expireAfterSeconds: 15552000 });

module.exports = mongoose.models.MonitoringV2Session || mongoose.model('MonitoringV2Session', monitoringSessionV2Schema);
