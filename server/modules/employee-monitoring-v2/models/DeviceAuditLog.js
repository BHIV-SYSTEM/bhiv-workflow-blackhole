/**
 * Employee Monitoring V2 - DeviceAuditLog Model
 * 
 * Immutable security and compliance ledger recording device enrollment,
 * session lifecycle, handoff handshakes, and conflict events.
 */

const mongoose = require('mongoose');
const { AUDIT_EVENTS } = require('../config/constants');

const deviceAuditLogSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  device_id: {
    type: String,
    default: null
  },
  event_type: {
    type: String,
    enum: Object.values(AUDIT_EVENTS),
    required: true,
    index: true
  },
  ip_address: {
    type: String,
    default: null
  },
  user_agent: {
    type: String,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now // 365-day TTL indexed below
  }
}, {
  timestamps: false,
  collection: 'monitoring_v2_audit_logs'
});

deviceAuditLogSchema.index({ employee: 1, timestamp: -1 });
// 365-day statutory compliance retention
deviceAuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 });

module.exports = mongoose.models.MonitoringV2AuditLog || mongoose.model('MonitoringV2AuditLog', deviceAuditLogSchema);
