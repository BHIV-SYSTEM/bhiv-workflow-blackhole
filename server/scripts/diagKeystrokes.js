require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
    const db = mongoose.connection.db;

    const cols = await db.listCollections().toArray();
    console.log('Relevant collections:', cols.map(c => c.name).filter(n => /keystroke|activit|user/i.test(n)).join(', '));

    const ksCount = await db.collection('keystroke_logs').countDocuments();
    console.log('keystroke_logs total:', ksCount);
    if (ksCount > 0) {
      const recent = await db.collection('keystroke_logs').find().sort({ timestamp: -1 }).limit(3).toArray();
      recent.forEach(d => console.log('  KS:', d.employee, '|', d.quality && d.quality.classification, '|', JSON.stringify((d.text || '').slice(0, 60))));
    }

    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const actCount = await db.collection('employee_activities').countDocuments({ timestamp: { $gte: thirtyMinAgo } });
    console.log('employee_activities last 30min:', actCount);

    const recentAct = await db.collection('employee_activities').find().sort({ timestamp: -1 }).limit(3).toArray();
    recentAct.forEach(d => console.log('  ACT:', d.employee, '| keys:', d.keystroke_count, '|', d.active_application && d.active_application.name, '|', d.timestamp));

    const admin = await db.collection('users').findOne({ email: 'admin@niyantran.test' });
    console.log('admin exists:', !!admin, admin && admin._id.toString());

    // Find employees with activity today
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const activeEmps = await db.collection('employee_activities').distinct('employee', { timestamp: { $gte: todayStart } });
    console.log('employees with activity today:', JSON.stringify(activeEmps));

    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error('ERR:', e.message);
    process.exit(1);
  }
})();
