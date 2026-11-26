const mongoose = require('mongoose');

/**
 * Tracks which device currently owns an employee's open workday.
 * The V1 desktop agent pauses its collectors when the workday is on Mobile
 * and resumes them when the workday is handed back to Laptop / PC.
 */
const deviceSessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  attendanceId: {
    type: String,
    default: null
  },
  startDayTime: {
    type: Date,
    default: null
  },
  activeDevice: {
    deviceType: {
      type: String,
      enum: ['Desktop', 'Mobile'],
      default: null
    },
    deviceId: { type: String, default: null },
    label: { type: String, default: null },
    agentVersion: { type: String, default: null },
    switchedAt: { type: Date, default: null }
  },
  history: [{
    from: { type: String, default: null },
    to: { type: String, default: null },
    deviceId: { type: String, default: null },
    label: { type: String, default: null },
    agentVersion: { type: String, default: null },
    switchedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    switchedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

deviceSessionSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DeviceSession', deviceSessionSchema);
