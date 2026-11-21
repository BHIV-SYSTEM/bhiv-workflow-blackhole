/**
 * WebsiteWhitelist.js
 * DEPRECATED & EXCISED under Niyantran Employee Monitoring V2 Privacy Boundaries.
 * URL & browser history tracking have been permanently removed across agent, backend, and database.
 * Retained only as a deprecated read-safe schema for backward-compatibility migrations.
 */

const mongoose = require('mongoose');

const websiteWhitelistSchema = new mongoose.Schema({
  domain: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  category: {
    type: String,
    default: 'general'
  },
  description: {
    type: String,
    default: ''
  },
  approval_status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  }
}, {
  timestamps: true,
  collection: 'website_whitelists'
});

websiteWhitelistSchema.statics.isWhitelisted = async function() {
  // Under V2 privacy boundaries, browsing history and URLs are not monitored.
  return {
    allowed: true,
    reason: 'URL and browser history monitoring permanently eradicated under V2 privacy boundaries'
  };
};

module.exports = mongoose.model('WebsiteWhitelist', websiteWhitelistSchema);
