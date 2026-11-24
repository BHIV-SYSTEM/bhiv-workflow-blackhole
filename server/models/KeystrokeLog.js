/**
 * KeystrokeLog.js
 * DEPRECATED & EXCISED under Niyantran Employee Monitoring V2 Privacy Boundaries.
 * Raw keystroke logging and reconstructed typed text have been permanently removed.
 * Retained only as a deprecated read-safe schema for backward-compatibility migrations.
 */

const mongoose = require('mongoose');

const keystrokeLogSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  session_id: {
    type: String,
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  // Note: All raw text and window titles are eradicated under V2.
  application_name: {
    type: String,
    default: 'Unknown'
  },
  capture: {
    key_count: { type: Number, default: 0 },
    backspace_count: { type: Number, default: 0 },
    paste_count: { type: Number, default: 0 },
    char_count: { type: Number, default: 0 },
    duration_ms: { type: Number, default: 0 }
  }
}, {
  timestamps: true,
  collection: 'keystroke_logs'
});

keystrokeLogSchema.index({ employee: 1, timestamp: -1 });
keystrokeLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('KeystrokeLog', keystrokeLogSchema);
