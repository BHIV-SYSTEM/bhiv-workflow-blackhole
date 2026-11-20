/**
 * Employee Monitoring V2 - PrivacyPreference Model
 * 
 * Stores employee self-service BYOD privacy configurations and
 * custom personal application exclusions.
 */

const mongoose = require('mongoose');

const privacyPreferenceSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  excluded_applications: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  transparency_consent_acknowledged_at: {
    type: Date,
    default: null
  },
  last_updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'monitoring_v2_privacy_preferences'
});

module.exports = mongoose.models.MonitoringV2PrivacyPreference || mongoose.model('MonitoringV2PrivacyPreference', privacyPreferenceSchema);
