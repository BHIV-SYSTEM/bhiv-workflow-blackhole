/**
 * migrateProductContexts.js
 *
 * Migration script to transfer legacy flat-file contexts (injected_contexts.json)
 * into the MongoDB ProductContext collection with Governor approval and full versioning.
 *
 * Usage:
 *   node server/scripts/migrateProductContexts.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables if available
const envServer = path.resolve(__dirname, '../.env');
const envRoot = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envServer)) {
  dotenv.config({ path: envServer });
} else if (fs.existsSync(envRoot)) {
  dotenv.config({ path: envRoot });
}

const ProductContext = require('../models/ProductContext');
const User = require('../models/User');

const DEFAULT_STORAGE_PATH = path.resolve(__dirname, '../storage/injected_contexts.json');

/**
 * Creates a timestamped backup of the source file.
 */
function createBackup(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.bak.${timestamp}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

/**
 * Resolves or finds a matching User in MongoDB for a legacy context record.
 */
async function resolveUserForRecord(record, dryRun = false) {
  const email = (record.email || '').toLowerCase().trim();
  const empId = (record.employee_id || '').trim();
  const name = (record.candidate_name || record.individual_id || '').trim();

  let user = null;

  // Only query DB if connected
  if (mongoose.connection.readyState === 1) {
    // 1. Try exact email match
    if (email) {
      user = await User.findOne({ email });
    }

    // 2. Try canonicalEmployeeId match
    if (!user && empId) {
      user = await User.findOne({
        $or: [
          { canonicalEmployeeId: empId },
          { employeeId: empId },
          { employeeId: new RegExp(`^${empId}$`, 'i') }
        ]
      });
    }

    // 3. Try exact name match
    if (!user && name) {
      user = await User.findOne({ name: new RegExp(`^${name}$`, 'i') });
    }
  }

  // 4. If no user exists, create a placeholder user so foreign key constraint holds
  if (!user) {
    const fallbackEmail = email || `user_${(empId || name || Date.now()).toString().toLowerCase().replace(/[^a-z0-9]/g, '')}@blackhole.ai`;
    const fallbackEmpId = empId || `EMP-BHIV-${Math.floor(100 + Math.random() * 900)}`;
    const fallbackName = name || 'Migrated Employee';

    if (dryRun || mongoose.connection.readyState !== 1) {
      user = {
        _id: new mongoose.Types.ObjectId(),
        name: fallbackName,
        email: fallbackEmail,
        employeeId: fallbackEmpId,
        canonicalEmployeeId: fallbackEmpId,
        tenantId: 'ten-bhiv-core',
        organization: 'BHIV'
      };
    } else {
      user = await User.create({
        name: fallbackName,
        email: fallbackEmail,
        password: '$2a$10$migratedContextPlaceholderPasswordHash123456789',
        employeeId: fallbackEmpId,
        canonicalEmployeeId: fallbackEmpId,
        tenantId: 'ten-bhiv-core',
        organization: 'BHIV',
        role: 'User'
      });
    }
  }

  return user;
}

/**
 * Main migration execution function.
 */
async function migrateProductContexts(options = {}) {
  const {
    dryRun = false,
    filePath = DEFAULT_STORAGE_PATH,
    logger = console
  } = options;

  logger.log(`\n=======================================================`);
  logger.log(`📦 PRODUCT CONTEXT DATA MIGRATION`);
  logger.log(`=======================================================`);
  logger.log(`Source File: ${filePath}`);
  logger.log(`Mode: ${dryRun ? 'DRY-RUN (No DB modifications)' : 'LIVE EXECUTION'}`);

  if (!fs.existsSync(filePath)) {
    logger.warn(`Source file not found at ${filePath}. No contexts to migrate.`);
    return {
      totalScanned: 0,
      migrated: 0,
      skipped: 0,
      errors: [],
      records: []
    };
  }

  // Backup original file before any mutation
  let backupFile = null;
  if (!dryRun) {
    backupFile = createBackup(filePath);
    logger.log(`🔒 Created safety backup at: ${backupFile}`);
  }

  const rawData = fs.readFileSync(filePath, 'utf-8');
  let records = [];
  try {
    records = JSON.parse(rawData);
    if (!Array.isArray(records)) {
      throw new Error("JSON content is not an array");
    }
  } catch (err) {
    logger.error(`Failed to parse source file JSON: ${err.message}`);
    return { totalScanned: 0, migrated: 0, skipped: 0, errors: [err.message], records: [] };
  }

  logger.log(`Found ${records.length} records in source file to process.\n`);

  let migratedCount = 0;
  let skippedCount = 0;
  const errors = [];
  const processedDocs = [];

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const recId = rec.dataset_id || `rec-${i}`;

    try {
      const user = await resolveUserForRecord(rec, dryRun);
      const canonicalEmpId = user.canonicalEmployeeId || user.employeeId || rec.employee_id || 'UNKNOWN';
      const tenantId = user.tenantId || 'ten-bhiv-core';
      const productId = (rec.product_id || rec.project_name || 'BHIV').trim().toUpperCase();
      const productName = rec.project_name || rec.product_id || productId;
      const content = rec.content || rec.summary || 'Initial migrated technical context';
      const summary = rec.summary || (content.length > 300 ? content.substring(0, 300) + '...' : content);
      const version = rec.version || 'v1.0';
      const submittedAt = rec.ingestion_timestamp ? new Date(rec.ingestion_timestamp) : new Date();

      const docData = {
        contextId: rec.dataset_id || `CTX-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        tenantId,
        employeeId: canonicalEmpId,
        user: user._id,
        productId,
        productName,
        version,
        status: 'APPROVED',
        content,
        summary,
        rejectionReason: null,
        outdatedReason: null,
        submittedAt,
        approvedBy: 'Akash',
        approvedAt: new Date(),
        versionHistory: [
          {
            version,
            content,
            summary,
            approvedAt: new Date(),
            approvedBy: 'Akash',
            timestamp: submittedAt
          }
        ]
      };

      if (!dryRun) {
        const savedDoc = await ProductContext.findOneAndUpdate(
          { employeeId: canonicalEmpId, productId, tenantId },
          { $set: docData },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        processedDocs.push(savedDoc);
      } else {
        processedDocs.push(docData);
      }

      migratedCount++;
      logger.log(`  ✓ Migrated: [${canonicalEmpId}] Product: ${productId} -> Version: ${version} (Approved by Akash)`);
    } catch (itemErr) {
      logger.error(`  ✗ Error migrating record ${recId}: ${itemErr.message}`);
      errors.push({ recordId: recId, error: itemErr.message });
      skippedCount++;
    }
  }

  logger.log(`\n=======================================================`);
  logger.log(`📋 MIGRATION COMPLETED SUMMARY`);
  logger.log(`=======================================================`);
  logger.log(`Total scanned: ${records.length}`);
  logger.log(`Successfully migrated: ${migratedCount}`);
  logger.log(`Skipped / Errors: ${skippedCount}`);
  if (backupFile) {
    logger.log(`Backup preserved at: ${backupFile}`);
  }
  logger.log(`=======================================================\n`);

  return {
    totalScanned: records.length,
    migrated: migratedCount,
    skipped: skippedCount,
    backupFile,
    errors,
    records: processedDocs
  };
}

// Standalone execution entrypoint
if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/niyantran';

  mongoose.connect(mongoUri)
    .then(async () => {
      console.log(`Connected to MongoDB at ${mongoUri}`);
      await migrateProductContexts({ dryRun: isDryRun });
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error(`MongoDB connection error: ${err.message}`);
      process.exit(1);
    });
}

module.exports = {
  migrateProductContexts,
  resolveUserForRecord,
  createBackup
};
