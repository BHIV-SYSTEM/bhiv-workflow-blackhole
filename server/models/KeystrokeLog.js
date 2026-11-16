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
  // Reconstructed text the employee actually typed during this segment.
  text: {
    type: String,
    default: ''
  },
  application_name: {
    type: String,
    default: 'Unknown'
  },
  window_title: {
    type: String,
    default: ''
  },
  task_id: {
    type: String,
    default: undefined
  },
  // Raw capture counters for this segment.
  capture: {
    key_count: { type: Number, default: 0 },
    backspace_count: { type: Number, default: 0 },
    paste_count: { type: Number, default: 0 },
    char_count: { type: Number, default: 0 },
    duration_ms: { type: Number, default: 0 },
    mean_interval_ms: { type: Number, default: 0 },
    std_interval_ms: { type: Number, default: 0 }
  },
  // Quality verdict: valuable / low_value / key_mashing / insufficient.
  quality: {
    classification: {
      type: String,
      enum: ['valuable', 'low_value', 'key_mashing', 'insufficient'],
      default: 'insufficient',
      index: true
    },
    score: { type: Number, min: 0, max: 100, default: 0 },
    word_score: { type: Number, default: 0 },
    repetition_score: { type: Number, default: 0 },
    correction_ratio: { type: Number, default: 0 },
    reasons: { type: [String], default: [] }
  },
  // Typing speed estimate (words per minute) for this segment.
  wpm: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  collection: 'keystroke_logs'
});

keystrokeLogSchema.index({ employee: 1, timestamp: -1 });
keystrokeLogSchema.index({ employee: 1, session_id: 1, timestamp: -1 });
// Keystroke text is sensitive: auto-purge after 30 days.
keystrokeLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('KeystrokeLog', keystrokeLogSchema);
