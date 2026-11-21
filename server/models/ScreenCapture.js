/**
 * ScreenCapture.js
 * DEPRECATED & EXCISED under Niyantran Employee Monitoring V2 Privacy Boundaries.
 * Desktop screenshot capture has been permanently removed across agent, backend, and database.
 * Retained only as a deprecated read-safe schema for backward-compatibility migrations.
 */

const mongoose = require('mongoose');

const screenCaptureSchema = new mongoose.Schema({
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
  file_path: {
    type: String,
    default: ''
  },
  file_size: {
    type: Number,
    default: 0
  },
  file_hash: {
    type: String,
    default: ''
  },
  is_flagged: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  collection: 'screen_captures'
});

screenCaptureSchema.index({ employee: 1, timestamp: -1 });

module.exports = mongoose.model('ScreenCapture', screenCaptureSchema);
