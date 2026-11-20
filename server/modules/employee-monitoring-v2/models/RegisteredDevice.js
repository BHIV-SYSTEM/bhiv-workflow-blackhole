/**
 * Employee Monitoring V2 - RegisteredDevice Model
 * 
 * Master record of employee workstations and devices enrolled in V2 monitoring.
 * Stores hardware identity, deviceToken hash, and approval status.
 */

const mongoose = require('mongoose');

const registeredDeviceSchema = new mongoose.Schema({
  device_id: {
    type: String,
    required: true,
    unique: true,
    index: true // UUIDv4 generated during device pairing
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  device_name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  platform: {
    type: String,
    enum: ['windows', 'macos', 'linux', 'ios_pwa', 'android_pwa'],
    required: true
  },
  os_version: {
    type: String,
    default: 'Unknown'
  },
  agent_version: {
    type: String,
    default: '2.0.0'
  },
  device_token_hash: {
    type: String,
    required: true // Cryptographic hash of the issued device secret
  },
  encrypted_device_key: {
    type: String,
    default: null // AES-256-GCM encrypted secret for HMAC verification at rest
  },
  status: {
    type: String,
    enum: ['PENDING_APPROVAL', 'ACTIVE', 'REVOKED', 'BLOCKED'],
    default: 'ACTIVE',
    index: true
  },
  is_byod: {
    type: Boolean,
    default: true
  },
  last_seen_at: {
    type: Date,
    default: Date.now
  },
  last_ip: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  collection: 'monitoring_v2_devices'
});

registeredDeviceSchema.index({ employee: 1, status: 1 });
registeredDeviceSchema.index({ last_seen_at: 1 });

module.exports = mongoose.models.MonitoringV2Device || mongoose.model('MonitoringV2Device', registeredDeviceSchema);
