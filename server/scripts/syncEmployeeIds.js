/**
 * Migration script to backfill and synchronize employeeId on all User documents
 * adhering to the BHIV<suffix> format derived from their email ID suffix.
 *
 * Usage:
 *   node scripts/syncEmployeeIds.js [--dry-run]
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const { formatEmployeeId } = require('../utils/employeeId');

async function syncEmployeeIds() {
  const isDryRun = process.argv.includes('--dry-run');
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/workflow-blackhole';

  try {
    console.log(`🔌 Connecting to MongoDB (${isDryRun ? 'DRY-RUN MODE' : 'LIVE UPDATE'})...`);
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const users = await User.find({}).select('_id name email employeeId role stillExist');
    console.log(`Found ${users.length} total users in database.`);

    let updatedCount = 0;
    let unchangedCount = 0;

    for (const user of users) {
      const currentId = user.employeeId;
      const derivedId = formatEmployeeId(user.email, currentId);

      if (currentId !== derivedId && derivedId !== 'N/A') {
        console.log(`[UPDATE] ${user.name} (${user.email}): "${currentId || '<blank>'}" -> "${derivedId}"`);
        if (!isDryRun) {
          await User.updateOne({ _id: user._id }, { $set: { employeeId: derivedId } });
        }
        updatedCount++;
      } else {
        unchangedCount++;
      }
    }

    console.log('\n--- Sync Summary ---');
    console.log(`Total checked: ${users.length}`);
    console.log(`Updated / To Update: ${updatedCount}`);
    console.log(`Already in sync: ${unchangedCount}`);
    if (isDryRun) {
      console.log('💡 Dry run completed. No actual changes were written.');
    } else {
      console.log('✅ Database sync complete.');
    }
  } catch (error) {
    console.error('❌ Error synchronizing employee IDs:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

if (require.main === module) {
  syncEmployeeIds();
}

module.exports = { syncEmployeeIds };

