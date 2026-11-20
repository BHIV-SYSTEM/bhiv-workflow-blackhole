/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Test Account Seeder & Verification Script
 *
 * Ensures clean test accounts exist in local MongoDB:
 * - Employee: ishan@blackhole.ai / Password123!
 * - Admin:    rudra@blackhole.ai / Password123!
 */

const mongoose = require('../server/node_modules/mongoose');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/niyantran';

async function seed() {
  console.log('[Seed] Connecting to MongoDB:', MONGODB_URI);
  await mongoose.connect(MONGODB_URI);

  const User = require('../server/models/User');

  // 1. Employee Account
  let employee = await User.findOne({ email: 'ishan@blackhole.ai' });
  if (!employee) {
    employee = await User.create({
      name: 'Ishan (Team Member)',
      email: 'ishan@blackhole.ai',
      password: 'Password123!',
      role: 'User',
      employeeId: 'BHIV-EMP-001',
      branch: 'blackhole_mumbai',
      stillExist: 1
    });
    console.log('[Seed] Created Employee test account: ishan@blackhole.ai');
  } else {
    employee.password = 'Password123!';
    employee.stillExist = 1;
    await employee.save();
    console.log('[Seed] Verified Employee test account: ishan@blackhole.ai');
  }

  // 2. Admin Account
  let admin = await User.findOne({ email: 'rudra@blackhole.ai' });
  if (!admin) {
    admin = await User.create({
      name: 'Rudra (Project Lead)',
      email: 'rudra@blackhole.ai',
      password: 'Password123!',
      role: 'Admin',
      employeeId: 'BHIV-ADM-001',
      branch: 'blackhole_mumbai',
      stillExist: 1
    });
    console.log('[Seed] Created Admin test account: rudra@blackhole.ai');
  } else {
    admin.password = 'Password123!';
    admin.stillExist = 1;
    await admin.save();
    console.log('[Seed] Verified Admin test account: rudra@blackhole.ai');
  }

  await mongoose.disconnect();
  console.log('[Seed] Test accounts ready for demo execution.');
}

seed().catch(err => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
