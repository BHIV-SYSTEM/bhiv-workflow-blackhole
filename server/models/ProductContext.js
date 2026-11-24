const mongoose = require('mongoose');
const crypto = require('crypto');

const VersionHistorySchema = new mongoose.Schema({
  version: {
    type: String,
    required: true,
    default: 'v1.0'
  },
  content: {
    type: String,
    required: true
  },
  summary: {
    type: String,
    default: ''
  },
  approvedAt: {
    type: Date,
    default: null
  },
  approvedBy: {
    type: String,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const ProductContextSchema = new mongoose.Schema({
  contextId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true,
    default: 'ten-bhiv-core',
    trim: true
  },
  employeeId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  productId: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true
  },
  productName: {
    type: String,
    required: true,
    trim: true
  },
  version: {
    type: String,
    default: 'v1.0',
    trim: true
  },
  status: {
    type: String,
    enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'OUTDATED', 'DELETED'],
    default: 'PENDING_APPROVAL',
    index: true
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: String,
    default: null
  },
  deletionReason: {
    type: String,
    default: null
  },
  previousStatus: {
    type: String,
    default: null
  },
  content: {
    type: String,
    required: true
  },
  summary: {
    type: String,
    default: ''
  },
  rejectionReason: {
    type: String,
    default: null
  },
  outdatedReason: {
    type: String,
    default: null
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  approvedBy: {
    type: String,
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  versionHistory: {
    type: [VersionHistorySchema],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound unique index ensuring an employee can have at most one context per product within a tenant
ProductContextSchema.index(
  { employeeId: 1, productId: 1, tenantId: 1 },
  { unique: true }
);

// High-frequency query indexes
ProductContextSchema.index({ tenantId: 1, status: 1 });
ProductContextSchema.index({ user: 1, productId: 1 });

ProductContextSchema.pre('validate', function(next) {
  if (!this.contextId) {
    this.contextId = `CTX-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }
  if (this.productId) {
    this.productId = this.productId.trim().toUpperCase();
  }
  if (!this.productName && this.productId) {
    this.productName = this.productId;
  }
  next();
});

ProductContextSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('ProductContext', ProductContextSchema);
